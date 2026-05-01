import {
	collection,
	doc,
	getDoc,
	getDocs,
	runTransaction,
	setDoc,
	where,
	query,
} from "firebase/firestore";
import QRCode from "qrcode";
import { ensureFirebaseReady } from "./firebase";

const QR_TOKENS = "client_portal_qr_tokens";
const CLIENT_ACCESS = "client_project_access";

function safeText(value, fallback = "") {
	const text = String(value || "").trim();
	return text || fallback;
}

function safeTextLower(value, fallback = "") {
	return safeText(value, fallback).toLowerCase();
}

function createSecureToken(length = 40) {
	const size = Math.max(Number(length) || 0, 12);
	if (
		typeof globalThis === "undefined" ||
		!globalThis.crypto ||
		typeof globalThis.crypto.getRandomValues !== "function"
	) {
		let fallback = "";
		for (let index = 0; index < size * 2; index += 1) {
			fallback += Math.floor(Math.random() * 16).toString(16);
		}
		return fallback;
	}
	const bytes = new Uint8Array(size);
	globalThis.crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

function projectAccessDocId(clientId, projectId) {
	return `${safeText(clientId)}_${safeText(projectId)}`;
}

function getAppOrigin() {
	if (typeof window !== "undefined" && window.location?.origin) {
		return window.location.origin;
	}
	return "";
}

function getBasePath() {
	const rawBase =
		typeof import.meta !== "undefined" ? import.meta?.env?.BASE_URL : "/";
	const safeBase = safeText(rawBase, "/");
	if (safeBase === "/") return "";
	return safeBase.endsWith("/") ? safeBase.slice(0, -1) : safeBase;
}

function withBasePath(path) {
	const safePath = safeText(path);
	if (!safePath.startsWith("/")) return safePath;
	const basePath = getBasePath();
	return `${basePath}${safePath}`;
}

export async function createClientPortalQrInvite({
	projectId,
	projectName,
	clientEmail,
	createdByUserId,
	createdByName,
	expiresInDays = 14,
	maxScans = 1,
}) {
	const firestore = ensureFirebaseReady();
	const safeProjectId = safeText(projectId);
	if (!safeProjectId) throw new Error("Project id is required.");

	const token = createSecureToken(24);
	const now = new Date();
	const expiration = new Date(now.getTime());
	expiration.setDate(
		expiration.getDate() + Math.max(Number(expiresInDays) || 14, 1),
	);
	const nowIso = now.toISOString();
	const expiresAt = expiration.toISOString();
	const safeClientEmail = safeTextLower(clientEmail);
	const scans = Math.max(Number(maxScans) || 1, 1);

	await setDoc(doc(collection(firestore, QR_TOKENS), token), {
		projectId: safeProjectId,
		projectName: safeText(projectName, "Project"),
		clientEmail: safeClientEmail,
		maxScans: scans,
		consumedCount: 0,
		active: true,
		expiresAt,
		createdAt: nowIso,
		updatedAt: nowIso,
		createdByUserId: safeText(createdByUserId),
		createdByName: safeText(createdByName, "Admin"),
	});

	const path = withBasePath(
		`/client-access?token=${encodeURIComponent(token)}`,
	);
	const origin = getAppOrigin();
	const accessUrl = origin ? `${origin}${path}` : path;
	const qrDataUrl = await QRCode.toDataURL(accessUrl, {
		width: 360,
		margin: 1,
		errorCorrectionLevel: "M",
	});

	return {
		token,
		projectId: safeProjectId,
		projectName: safeText(projectName, "Project"),
		clientEmail: safeClientEmail,
		expiresAt,
		maxScans: scans,
		accessUrl,
		qrDataUrl,
	};
}

export async function consumeClientPortalQrInvite({ token, user, profile }) {
	const firestore = ensureFirebaseReady();
	const safeToken = safeText(token);
	const userId = safeText(user?.uid);
	const userEmail = safeTextLower(user?.email);
	const userName = safeText(
		profile?.name || user?.displayName || user?.email,
		"Client",
	);

	if (!safeToken) throw new Error("Access token is missing.");
	if (!userId) throw new Error("You must be logged in.");

	const tokenRef = doc(firestore, QR_TOKENS, safeToken);

	return runTransaction(firestore, async (transaction) => {
		const tokenSnap = await transaction.get(tokenRef);
		if (!tokenSnap.exists()) {
			throw new Error("This QR access link is invalid.");
		}

		const tokenData = tokenSnap.data() || {};
		const projectId = safeText(tokenData?.projectId);
		if (!projectId) {
			throw new Error("This QR token is corrupted (missing project id).");
		}
		if (!tokenData?.active) {
			throw new Error("This QR token is no longer active.");
		}

		const maxScans = Math.max(Number(tokenData?.maxScans) || 1, 1);
		const consumedCount = Math.max(Number(tokenData?.consumedCount) || 0, 0);
		if (consumedCount >= maxScans) {
			if (safeText(tokenData?.lastConsumedByUserId) === userId) {
				return {
					projectId,
					projectName: safeText(tokenData?.projectName, "Project"),
					alreadyLinked: true,
				};
			}
			throw new Error("This QR token has already been used.");
		}

		const expiresAt = safeText(tokenData?.expiresAt);
		if (expiresAt) {
			const expiresAtMs = Date.parse(expiresAt);
			if (!Number.isNaN(expiresAtMs) && Date.now() > expiresAtMs) {
				throw new Error("This QR access link has expired.");
			}
		}

		const restrictedEmail = safeTextLower(tokenData?.clientEmail);
		if (restrictedEmail && restrictedEmail !== userEmail) {
			throw new Error(
				"This QR access link is assigned to another client email.",
			);
		}

		const grantRef = doc(
			firestore,
			CLIENT_ACCESS,
			projectAccessDocId(userId, projectId),
		);
		const nowIso = new Date().toISOString();
		transaction.set(
			grantRef,
			{
				clientId: userId,
				clientEmail: userEmail,
				clientName: userName,
				projectId,
				projectName: safeText(tokenData?.projectName, "Project"),
				accessSource: "qr",
				linkedAt: nowIso,
				updatedAt: nowIso,
				tokenId: safeToken,
			},
			{ merge: true },
		);

		const nextConsumedCount = consumedCount + 1;
		transaction.update(tokenRef, {
			consumedCount: nextConsumedCount,
			active: nextConsumedCount < maxScans,
			lastConsumedAt: nowIso,
			lastConsumedByUserId: userId,
			lastConsumedByEmail: userEmail,
			updatedAt: nowIso,
		});

		return {
			projectId,
			projectName: safeText(tokenData?.projectName, "Project"),
			alreadyLinked: false,
		};
	});
}

export function buildClientPortalLoginRedirect(token) {
	const safeToken = safeText(token);
	const next = withBasePath(`/client-access?token=${encodeURIComponent(safeToken)}`);
	return withBasePath(`/login?next=${encodeURIComponent(next)}`);
}

export async function getClientAccessGrantsByUserId(clientId) {
	const firestore = ensureFirebaseReady();
	const safeClientId = safeText(clientId);
	if (!safeClientId) return [];

	const snapshot = await getDocs(
		query(
			collection(firestore, CLIENT_ACCESS),
			where("clientId", "==", safeClientId),
		),
	);
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

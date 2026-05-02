import {
	collection,
	doc,
	getDocs,
	runTransaction,
	setDoc,
	updateDoc,
	where,
	query,
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import QRCode from "qrcode";
import {
	auth,
	ensureFirebaseReady,
	firebaseError,
	firebaseReady,
} from "./firebase";

const QR_TOKENS = "client_portal_qr_tokens";
const CLIENT_ACCESS = "client_project_access";
const USERS = "users";
const CLIENT_LINK_NAME_STORAGE_KEY = "ipms_client_link_name";

function safeText(value, fallback = "") {
	const text = String(value || "").trim();
	return text || fallback;
}

function safeTextLower(value, fallback = "") {
	return safeText(value, fallback).toLowerCase();
}

export function setClientLinkDisplayName(name) {
	if (typeof window === "undefined") return;
	const safeName = safeText(name);
	try {
		if (safeName) {
			window.localStorage.setItem(CLIENT_LINK_NAME_STORAGE_KEY, safeName);
			return;
		}
		window.localStorage.removeItem(CLIENT_LINK_NAME_STORAGE_KEY);
	} catch {
		// Ignore storage failures.
	}
}

export function getClientLinkDisplayName() {
	if (typeof window === "undefined") return "";
	try {
		return safeText(window.localStorage.getItem(CLIENT_LINK_NAME_STORAGE_KEY));
	} catch {
		return "";
	}
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

function buildTokenAccessPayload({
	token,
	projectId,
	projectName,
	clientName,
	clientEmail,
	maxScans,
	expiresAt,
}) {
	const path = withBasePath(
		`/client-access?token=${encodeURIComponent(token)}`,
	);
	const origin = getAppOrigin();
	const accessUrl = origin ? `${origin}${path}` : path;

	return {
		token,
		projectId,
		projectName,
		clientName,
		clientEmail,
		expiresAt,
		maxScans,
		accessUrl,
	};
}

async function findReusableProjectToken(firestore, projectId) {
	const snapshot = await getDocs(
		query(
			collection(firestore, QR_TOKENS),
			where("projectId", "==", projectId),
		),
	);

	const activeTokens = snapshot.docs
		.map((item) => ({ id: item.id, ...item.data() }))
		.filter((item) => item?.active === true);

	if (!activeTokens.length) return null;

	activeTokens.sort((left, right) => {
		const leftTime = Date.parse(safeText(left?.updatedAt || left?.createdAt));
		const rightTime = Date.parse(
			safeText(right?.updatedAt || right?.createdAt),
		);
		return (
			(Number.isNaN(rightTime) ? 0 : rightTime) -
			(Number.isNaN(leftTime) ? 0 : leftTime)
		);
	});

	return activeTokens[0];
}

async function resolveLinkedClientAccount(firestore, clientEmail, clientName) {
	const safeEmail = safeTextLower(clientEmail);
	const safeName = safeText(clientName, "Client");
	if (!safeEmail) {
		return {
			linkedClientUserId: "",
			linkedClientEmail: "",
			linkedClientName: safeName,
		};
	}

	const snapshot = await getDocs(
		query(collection(firestore, USERS), where("email", "==", safeEmail)),
	);
	const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
	const clientUser = rows.find(
		(item) => safeTextLower(item?.role) === "client",
	);

	return {
		linkedClientUserId: safeText(clientUser?.id),
		linkedClientEmail: safeEmail,
		linkedClientName: safeText(clientUser?.name, safeName),
	};
}

export async function getActiveClientPortalQrInvite(projectId) {
	const firestore = ensureFirebaseReady();
	const safeProjectId = safeText(projectId);
	if (!safeProjectId) throw new Error("Project id is required.");

	const activeToken = await findReusableProjectToken(firestore, safeProjectId);
	if (!activeToken?.id) return null;

	const invite = buildTokenAccessPayload({
		token: activeToken.id,
		projectId: safeProjectId,
		projectName: safeText(activeToken?.projectName, "Project"),
		clientName: safeText(activeToken?.clientName, "Client"),
		clientEmail: safeTextLower(activeToken?.clientEmail),
		maxScans: Math.max(Number(activeToken?.maxScans) || 0, 0),
		expiresAt: safeText(activeToken?.expiresAt),
	});
	const qrDataUrl = await QRCode.toDataURL(invite.accessUrl, {
		width: 360,
		margin: 1,
		errorCorrectionLevel: "M",
	});

	return {
		...invite,
		qrDataUrl,
		reused: true,
	};
}

export async function createClientPortalQrInvite({
	projectId,
	projectName,
	clientName,
	clientEmail,
	createdByUserId,
	createdByName,
	expiresInDays = 0,
	maxScans = 0,
}) {
	const firestore = ensureFirebaseReady();
	const safeProjectId = safeText(projectId);
	if (!safeProjectId) throw new Error("Project id is required.");

	const now = new Date();
	const nowIso = now.toISOString();
	const expiresAt = "";
	void expiresInDays;
	const safeClientEmail = safeTextLower(clientEmail);
	const scans = Math.max(Number(maxScans) || 0, 0);
	const safeProjectName = safeText(projectName, "Project");
	const safeClientName = safeText(clientName, "Client");
	const linkedAccount = await resolveLinkedClientAccount(
		firestore,
		safeClientEmail,
		safeClientName,
	);

	const reusableToken = await findReusableProjectToken(
		firestore,
		safeProjectId,
	);
	if (reusableToken?.id) {
		await updateDoc(doc(firestore, QR_TOKENS, reusableToken.id), {
			projectName: safeProjectName,
			clientName: safeClientName,
			clientEmail: safeClientEmail,
			linkedClientUserId: linkedAccount.linkedClientUserId,
			linkedClientEmail: linkedAccount.linkedClientEmail,
			linkedClientName: linkedAccount.linkedClientName,
			maxScans: scans,
			expiresAt,
			updatedAt: nowIso,
		});

		const invite = buildTokenAccessPayload({
			token: reusableToken.id,
			projectId: safeProjectId,
			projectName: safeProjectName,
			clientName: safeClientName,
			clientEmail: safeClientEmail,
			maxScans: scans,
			expiresAt,
		});
		const qrDataUrl = await QRCode.toDataURL(invite.accessUrl, {
			width: 360,
			margin: 1,
			errorCorrectionLevel: "M",
		});

		return {
			...invite,
			qrDataUrl,
			reused: true,
		};
	}

	const token = createSecureToken(24);

	await setDoc(doc(collection(firestore, QR_TOKENS), token), {
		projectId: safeProjectId,
		projectName: safeProjectName,
		clientName: safeClientName,
		clientEmail: safeClientEmail,
		linkedClientUserId: linkedAccount.linkedClientUserId,
		linkedClientEmail: linkedAccount.linkedClientEmail,
		linkedClientName: linkedAccount.linkedClientName,
		maxScans: scans,
		consumedCount: 0,
		active: true,
		expiresAt,
		createdAt: nowIso,
		updatedAt: nowIso,
		createdByUserId: safeText(createdByUserId),
		createdByName: safeText(createdByName, "Admin"),
	});

	const invite = buildTokenAccessPayload({
		token,
		projectId: safeProjectId,
		projectName: safeProjectName,
		clientName: safeClientName,
		clientEmail: safeClientEmail,
		maxScans: scans,
		expiresAt,
	});
	const qrDataUrl = await QRCode.toDataURL(invite.accessUrl, {
		width: 360,
		margin: 1,
		errorCorrectionLevel: "M",
	});

	return {
		...invite,
		qrDataUrl,
		reused: false,
	};
}

export async function deactivateClientPortalQrInvite(token) {
	const firestore = ensureFirebaseReady();
	const safeToken = safeText(token);
	if (!safeToken) throw new Error("Token is required.");

	await updateDoc(doc(firestore, QR_TOKENS, safeToken), {
		active: false,
		updatedAt: new Date().toISOString(),
	});
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

	try {
		return await runTransaction(firestore, async (transaction) => {
			const tokenSnap = await transaction.get(tokenRef);
			if (!tokenSnap.exists()) {
				throw new Error("This QR access link is invalid.");
			}

			const tokenData = tokenSnap.data() || {};
			const projectId = safeText(tokenData?.projectId);
			const linkClientName = safeText(
				tokenData?.linkedClientName || tokenData?.clientName,
				userName,
			);
			const linkedClientEmail = safeTextLower(
				tokenData?.linkedClientEmail || tokenData?.clientEmail,
			);
			const linkedClientUserId = safeText(tokenData?.linkedClientUserId);
			if (!projectId) {
				throw new Error("This QR token is corrupted (missing project id).");
			}
			if (!tokenData?.active) {
				throw new Error("This QR token is no longer active.");
			}

			const maxScans = Math.max(Number(tokenData?.maxScans) || 0, 0);
			const consumedCount = Math.max(Number(tokenData?.consumedCount) || 0, 0);
			if (maxScans > 0 && consumedCount >= maxScans) {
				if (safeText(tokenData?.lastConsumedByUserId) === userId) {
					return {
						projectId,
						projectName: safeText(tokenData?.projectName, "Project"),
						clientName: linkClientName,
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

			const grantRef = doc(
				firestore,
				CLIENT_ACCESS,
				projectAccessDocId(userId, projectId),
			);
			const nowIso = new Date().toISOString();
			const grantPayload = {
				clientId: userId,
				clientEmail: userEmail,
				clientName: linkClientName,
				linkedClientUserId,
				linkedClientEmail,
				linkedClientName: linkClientName,
				projectId,
				projectName: safeText(tokenData?.projectName, "Project"),
				accessSource: "qr",
				linkedAt: nowIso,
				updatedAt: nowIso,
				tokenId: safeToken,
			};
			transaction.set(grantRef, grantPayload, { merge: true });

			// If this session is anonymous and the token has a real linked client user,
			// also write a direct grant under the real client's uid so that when they
			// log in with credentials, hasClientProjectGrant resolves correctly.
			if (linkedClientUserId && linkedClientUserId !== userId) {
				const linkedGrantRef = doc(
					firestore,
					CLIENT_ACCESS,
					projectAccessDocId(linkedClientUserId, projectId),
				);
				transaction.set(
					linkedGrantRef,
					{
						...grantPayload,
						clientId: linkedClientUserId,
						clientEmail: linkedClientEmail,
						clientName: linkClientName,
						linkedClientUserId: "",
						accessSource: "qr_linked",
					},
					{ merge: true },
				);
			}

			const nextConsumedCount = consumedCount + 1;
			transaction.update(tokenRef, {
				consumedCount: nextConsumedCount,
				active: maxScans > 0 ? nextConsumedCount < maxScans : true,
				lastConsumedAt: nowIso,
				lastConsumedByUserId: userId,
				lastConsumedByEmail: userEmail,
				updatedAt: nowIso,
			});

			return {
				projectId,
				projectName: safeText(tokenData?.projectName, "Project"),
				clientName: linkClientName,
				alreadyLinked: false,
			};
		});
	} catch (error) {
		const code = safeTextLower(error?.code || "");
		const message = safeTextLower(error?.message || "");
		if (
			code.includes("permission-denied") ||
			message.includes("missing or insufficient permissions")
		) {
			throw new Error(
				"Access link validation was blocked by Firestore rules. Deploy the latest rules and try again.",
			);
		}
		throw error;
	}
}

export async function ensureClientLinkSession() {
	if (!firebaseReady || !auth) {
		throw new Error(
			firebaseError ||
				"Firebase is not initialized. Client link access is unavailable.",
		);
	}

	if (auth.currentUser) return auth.currentUser;
	try {
		const credential = await signInAnonymously(auth);
		return credential.user;
	} catch (error) {
		const code = safeTextLower(error?.code || "");
		if (code === "auth/admin-restricted-operation") {
			throw new Error(
				"Client link access is disabled in Firebase. Enable Authentication > Sign-in method > Anonymous.",
			);
		}
		throw new Error(
			error?.message || "Unable to start secure client link session.",
		);
	}
}

export function buildClientPortalLoginRedirect(token) {
	const safeToken = safeText(token);
	const next = withBasePath(
		`/client-access?token=${encodeURIComponent(safeToken)}`,
	);
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

// Returns grants created by an anonymous session that are linked to this real user uid.
export async function getClientAccessGrantsByLinkedUserId(linkedClientUserId) {
	const firestore = ensureFirebaseReady();
	const safeId = safeText(linkedClientUserId);
	if (!safeId) return [];

	const snapshot = await getDocs(
		query(
			collection(firestore, CLIENT_ACCESS),
			where("linkedClientUserId", "==", safeId),
		),
	);
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

/**
 * Write (or merge-update) a direct client_project_access grant for a real client account.
 * Called by admins when creating or editing a project that has a linked client user,
 * so the client can load their portal data via the grant path (same as QR) without
 * relying on collection queries that hit Firestore rules budget limits.
 */
export async function provisionClientProjectGrant({
	clientId,
	clientEmail,
	clientName,
	projectId,
	projectName,
}) {
	const firestore = ensureFirebaseReady();
	const safeClientId = safeText(clientId);
	const safeProjectId = safeText(projectId);

	if (!safeClientId)
		throw new Error("clientId is required to provision grant.");
	if (!safeProjectId)
		throw new Error("projectId is required to provision grant.");

	const docId = `${safeClientId}_${safeProjectId}`;
	const nowIso = new Date().toISOString();

	await setDoc(
		doc(firestore, CLIENT_ACCESS, docId),
		{
			clientId: safeClientId,
			clientEmail: safeTextLower(clientEmail),
			clientName: safeText(clientName, "Client"),
			linkedClientUserId: "",
			linkedClientEmail: "",
			linkedClientName: safeText(clientName, "Client"),
			projectId: safeProjectId,
			projectName: safeText(projectName, "Project"),
			accessSource: "provisioned",
			linkedAt: nowIso,
			updatedAt: nowIso,
		},
		{ merge: true },
	);
}

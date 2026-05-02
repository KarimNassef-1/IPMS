/**
 * Audits likely orphan users/data in Firebase Auth + Firestore.
 *
 * Usage:
 *   node scripts/audit-orphan-users-data.mjs
 *
 * Auth setup:
 *   set GOOGLE_APPLICATION_CREDENTIALS=path\\to\\service-account.json
 */

import {
	initializeApp,
	cert,
	getApps,
	applicationDefault,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const USERS = "users";
const CLIENT_ACCESS = "client_project_access";
const QR_TOKENS = "client_portal_qr_tokens";
const NOTIFICATIONS = "notifications";

function safeText(value, fallback = "") {
	const text = String(value || "").trim();
	return text || fallback;
}

function initAdmin() {
	if (getApps().length) return;

	const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
		? resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
		: null;

	if (keyPath) {
		const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
		initializeApp({
			credential: cert(serviceAccount),
			projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
		});
		return;
	}

	const projectId = String(process.env.FIREBASE_PROJECT_ID || "").trim();
	if (!projectId) {
		throw new Error(
			"When GOOGLE_APPLICATION_CREDENTIALS is not set, provide FIREBASE_PROJECT_ID for ADC runs.",
		);
	}

	initializeApp({
		credential: applicationDefault(),
		projectId,
	});
}

async function listAllAuthUsers(auth) {
	const users = [];
	let pageToken;

	do {
		const page = await auth.listUsers(1000, pageToken);
		users.push(...page.users);
		pageToken = page.pageToken;
	} while (pageToken);

	return users;
}

async function main() {
	initAdmin();

	const db = getFirestore();
	const auth = getAuth();

	const [authUsers, usersSnap] = await Promise.all([
		listAllAuthUsers(auth),
		db.collection(USERS).get(),
	]);

	const authUidSet = new Set(authUsers.map((u) => u.uid));
	const firestoreUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
	const firestoreUidSet = new Set(firestoreUsers.map((u) => u.id));

	const firestoreWithoutAuth = firestoreUsers
		.filter((u) => !authUidSet.has(u.id))
		.map((u) => ({
			id: u.id,
			email: safeText(u.email),
			role: safeText(u.role),
			accountStatus: safeText(u.accountStatus, "active"),
		}));

	const authWithoutFirestore = authUsers
		.filter((u) => !firestoreUidSet.has(u.uid))
		.map((u) => ({ uid: u.uid, email: safeText(u.email) }));

	const removedUsersStillPresent = firestoreUsers
		.filter(
			(u) => safeText(u.accountStatus, "active").toLowerCase() === "removed",
		)
		.map((u) => ({
			id: u.id,
			email: safeText(u.email),
			role: safeText(u.role),
		}));

	const [clientAccessCount, qrTokensCount, notificationsCount] =
		await Promise.all([
			db.collection(CLIENT_ACCESS).count().get(),
			db.collection(QR_TOKENS).count().get(),
			db.collection(NOTIFICATIONS).count().get(),
		]);

	console.log("\n=== User Audit ===");
	console.log(`Auth users: ${authUsers.length}`);
	console.log(`Firestore users: ${firestoreUsers.length}`);
	console.log(`Firestore users without Auth: ${firestoreWithoutAuth.length}`);
	console.log(
		`Auth users without Firestore users doc: ${authWithoutFirestore.length}`,
	);
	console.log(
		`Removed users still in Firestore: ${removedUsersStillPresent.length}`,
	);

	if (firestoreWithoutAuth.length) {
		console.log("\nFirestore users without Auth (first 25):");
		console.table(firestoreWithoutAuth.slice(0, 25));
	}

	if (authWithoutFirestore.length) {
		console.log("\nAuth users without Firestore users doc (first 25):");
		console.table(authWithoutFirestore.slice(0, 25));
	}

	if (removedUsersStillPresent.length) {
		console.log("\nRemoved users still in Firestore (first 25):");
		console.table(removedUsersStillPresent.slice(0, 25));
	}

	console.log("\n=== Collection Volume ===");
	console.log(`client_project_access docs: ${clientAccessCount.data().count}`);
	console.log(`client_portal_qr_tokens docs: ${qrTokensCount.data().count}`);
	console.log(`notifications docs: ${notificationsCount.data().count}`);
	console.log("\nUse this report before deleting anything.");
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

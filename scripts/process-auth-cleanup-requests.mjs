/**
 * Processes pending Firebase Auth cleanup requests created by TeamUsersPage.
 *
 * Usage:
 *   node scripts/process-auth-cleanup-requests.mjs --dry-run
 *   node scripts/process-auth-cleanup-requests.mjs
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

const AUTH_CLEANUP_REQUESTS = "auth_cleanup_requests";
const USERS = "users";

function hasArg(flag) {
	return process.argv.includes(flag);
}

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

async function main() {
	const dryRun = hasArg("--dry-run");
	initAdmin();

	const db = getFirestore();
	const auth = getAuth();

	const snapshot = await db
		.collection(AUTH_CLEANUP_REQUESTS)
		.where("status", "==", "pending")
		.get();

	if (snapshot.empty) {
		console.log("No pending auth cleanup requests.");
		return;
	}

	console.log(`Found ${snapshot.size} pending auth cleanup request(s).`);

	for (const docSnap of snapshot.docs) {
		const request = docSnap.data() || {};
		const userId = safeText(request.userId);
		const requestId = docSnap.id;

		if (!userId) {
			console.log(`Skipping ${requestId}: missing userId.`);
			if (!dryRun) {
				await docSnap.ref.set(
					{
						status: "error",
						errorMessage: "Missing userId",
						updatedAt: new Date().toISOString(),
					},
					{ merge: true },
				);
			}
			continue;
		}

		if (dryRun) {
			console.log(
				`[DRY RUN] Would delete Auth user ${userId} for request ${requestId}.`,
			);
			continue;
		}

		try {
			await auth.deleteUser(userId);

			// Keep users doc as audit trail if it still exists.
			await db.collection(USERS).doc(userId).set(
				{
					authDeletedAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
				{ merge: true },
			);

			await docSnap.ref.set(
				{
					status: "completed",
					completedAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
				{ merge: true },
			);

			console.log(`Deleted Auth user ${userId} for request ${requestId}.`);
		} catch (error) {
			const code = safeText(error?.code).toLowerCase();
			const message = safeText(error?.message, "Unknown error");

			if (code === "auth/user-not-found") {
				await docSnap.ref.set(
					{
						status: "completed",
						completedAt: new Date().toISOString(),
						note: "Auth user already deleted before processing.",
						updatedAt: new Date().toISOString(),
					},
					{ merge: true },
				);
				console.log(
					`Auth user already missing for ${requestId} (${userId}); marked completed.`,
				);
				continue;
			}

			await docSnap.ref.set(
				{
					status: "error",
					errorMessage: message,
					updatedAt: new Date().toISOString(),
				},
				{ merge: true },
			);
			console.log(`Failed ${requestId} (${userId}): ${message}`);
		}
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

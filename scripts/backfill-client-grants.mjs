/**
 * One-time backfill script: provisions client_project_access grant docs
 * for all existing projects that have a clientUserId but no grant yet.
 *
 * Run from the IPMS folder:
 *   node scripts/backfill-client-grants.mjs
 *
 * Requires: firebase-admin (installed as dev dependency)
 * Auth:     Firebase Application Default Credentials — make sure you have
 *           run `firebase login` and then:
 *             set GOOGLE_APPLICATION_CREDENTIALS=path\to\service-account.json
 *           OR generate one via:
 *             Firebase Console > Project Settings > Service Accounts > Generate new private key
 *           then set the env var before running this script.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve } from "path";

const PROJECT_ID = "infinite-pixels-os";
const PROJECTS = "projects";
const CLIENT_ACCESS = "client_project_access";

function safeText(value, fallback = "") {
	const text = String(value || "").trim();
	return text || fallback;
}

function safeTextLower(value, fallback = "") {
	return safeText(value, fallback).toLowerCase();
}

function grantDocId(clientId, projectId) {
	return `${clientId}_${projectId}`;
}

async function initAdmin() {
	if (getApps().length) return;

	const saKeyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
		? resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
		: null;

	if (saKeyPath) {
		const serviceAccount = JSON.parse(readFileSync(saKeyPath, "utf8"));
		initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID });
		console.log("Initialized with service account:", saKeyPath);
	} else {
		// Fall back to Application Default Credentials (firebase login sets these up).
		const { applicationDefault } = await import("firebase-admin/app");
		initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
		console.log("Initialized with Application Default Credentials.");
	}
}

async function run() {
	await initAdmin();
	const db = getFirestore();

	// 1. Load all projects.
	console.log("\nFetching projects...");
	const projectsSnap = await db.collection(PROJECTS).get();
	const projects = projectsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
	console.log(`  Found ${projects.length} project(s).`);

	// 2. Filter to those with at least one clientUserId.
	const linked = projects.filter((p) => {
		const ids = Array.from(
			new Set(
				[
					...(Array.isArray(p.clientUserIds) ? p.clientUserIds : []),
					...(safeText(p.clientUserId) ? [safeText(p.clientUserId)] : []),
				]
					.map((id) => safeText(id))
					.filter(Boolean),
			),
		);
		return ids.length > 0;
	});
	console.log(`  ${linked.length} project(s) have a linked clientUserId.`);

	if (!linked.length) {
		console.log("\nNothing to backfill. Done.");
		return;
	}

	// 3. Load all existing grants once so we can skip already-provisioned ones.
	console.log("\nFetching existing grants...");
	const grantsSnap = await db.collection(CLIENT_ACCESS).get();
	const existingGrantIds = new Set(grantsSnap.docs.map((d) => d.id));
	console.log(`  Found ${existingGrantIds.size} existing grant(s).`);

	// 4. Backfill missing grants in batches of 500 (Firestore batch limit).
	const nowIso = new Date().toISOString();
	let created = 0;
	let skipped = 0;

	const BATCH_SIZE = 400;
	let batch = db.batch();
	let batchCount = 0;

	for (const project of linked) {
		const projectId = safeText(project.id);
		const projectName = safeText(project.projectName, "Project");
		const clientEmail = safeTextLower(project.clientEmail);
		const clientName = safeText(project.clientName, "Client");

		const clientIds = Array.from(
			new Set(
				[
					...(Array.isArray(project.clientUserIds)
						? project.clientUserIds
						: []),
					...(safeText(project.clientUserId)
						? [safeText(project.clientUserId)]
						: []),
				]
					.map((id) => safeText(id))
					.filter(Boolean),
			),
		);

		for (const clientId of clientIds) {
			const docId = grantDocId(clientId, projectId);

			if (existingGrantIds.has(docId)) {
				skipped++;
				continue;
			}

			const ref = db.collection(CLIENT_ACCESS).doc(docId);
			batch.set(
				ref,
				{
					clientId,
					clientEmail,
					clientName,
					linkedClientUserId: "",
					linkedClientEmail: "",
					linkedClientName: clientName,
					projectId,
					projectName,
					accessSource: "provisioned",
					linkedAt: nowIso,
					updatedAt: nowIso,
				},
				{ merge: true },
			);

			created++;
			batchCount++;

			if (batchCount >= BATCH_SIZE) {
				await batch.commit();
				console.log(`  Committed batch of ${batchCount} grant(s)...`);
				batch = db.batch();
				batchCount = 0;
			}
		}
	}

	if (batchCount > 0) {
		await batch.commit();
		console.log(`  Committed final batch of ${batchCount} grant(s).`);
	}

	console.log(`\nBackfill complete.`);
	console.log(`  Created : ${created}`);
	console.log(`  Skipped (already existed): ${skipped}`);
}

run().catch((err) => {
	console.error("\nBackfill failed:", err.message || err);
	process.exit(1);
});

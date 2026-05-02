/**
 * Polling worker for pending Firebase Auth cleanup requests.
 *
 * Usage:
 *   node scripts/run-auth-cleanup-worker.mjs
 *   node scripts/run-auth-cleanup-worker.mjs --interval-minutes 10
 *   node scripts/run-auth-cleanup-worker.mjs --dry-run
 *   node scripts/run-auth-cleanup-worker.mjs --max-runs 12
 */

import { spawn } from "node:child_process";

function argValue(flag, fallback) {
	const index = process.argv.indexOf(flag);
	if (index < 0 || index + 1 >= process.argv.length) return fallback;
	return process.argv[index + 1];
}

function hasArg(flag) {
	return process.argv.includes(flag);
}

const intervalMinutes = Math.max(
	Number(argValue("--interval-minutes", "15")) || 15,
	1,
);
const intervalMs = intervalMinutes * 60 * 1000;
const maxRuns = Math.max(Number(argValue("--max-runs", "0")) || 0, 0);
const dryRun = hasArg("--dry-run");

let runCount = 0;
let stopped = false;

function runCleanupOnce() {
	return new Promise((resolve, reject) => {
		const args = ["scripts/process-auth-cleanup-requests.mjs"];
		if (dryRun) args.push("--dry-run");

		const child = spawn(process.execPath, args, {
			stdio: "inherit",
			env: process.env,
		});

		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`Cleanup run failed with exit code ${code}`));
		});
	});
}

async function loop() {
	while (!stopped) {
		runCount += 1;
		const startedAt = new Date().toISOString();
		console.log(
			`\n[auth-cleanup-worker] Run ${runCount} started at ${startedAt}`,
		);

		try {
			await runCleanupOnce();
			console.log(`[auth-cleanup-worker] Run ${runCount} completed.`);
		} catch (error) {
			console.error(
				`[auth-cleanup-worker] Run ${runCount} failed: ${error.message}`,
			);
		}

		if (maxRuns > 0 && runCount >= maxRuns) {
			console.log(
				`[auth-cleanup-worker] Reached max runs (${maxRuns}). Exiting.`,
			);
			break;
		}

		console.log(
			`[auth-cleanup-worker] Sleeping for ${intervalMinutes} minute(s)...`,
		);
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
}

process.on("SIGINT", () => {
	stopped = true;
	console.log(
		"\n[auth-cleanup-worker] Received SIGINT. Exiting after current run.",
	);
});

process.on("SIGTERM", () => {
	stopped = true;
	console.log(
		"\n[auth-cleanup-worker] Received SIGTERM. Exiting after current run.",
	);
});

loop().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

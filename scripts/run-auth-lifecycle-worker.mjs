/**
 * Unified auth lifecycle worker.
 * Runs both auth cleanup request processing and orphan-data auditing on an interval.
 *
 * Usage:
 *   node scripts/run-auth-lifecycle-worker.mjs
 *   node scripts/run-auth-lifecycle-worker.mjs --interval-minutes 15
 *   node scripts/run-auth-lifecycle-worker.mjs --max-runs 10
 *   node scripts/run-auth-lifecycle-worker.mjs --dry-run
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

function runNodeScript(scriptPath, args = []) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [scriptPath, ...args], {
			stdio: "inherit",
			env: process.env,
		});

		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`${scriptPath} failed with exit code ${code}`));
		});
	});
}

async function runLifecycleSweep() {
	const cleanupArgs = dryRun ? ["--dry-run"] : [];
	await runNodeScript("scripts/process-auth-cleanup-requests.mjs", cleanupArgs);

	const orphanArgs = dryRun ? ["--dry-run"] : [];
	await runNodeScript("scripts/audit-orphan-users-data.mjs", orphanArgs);
}

async function loop() {
	while (!stopped) {
		runCount += 1;
		console.log(
			`\n[auth-lifecycle-worker] Run ${runCount} started at ${new Date().toISOString()}`,
		);

		try {
			await runLifecycleSweep();
			console.log(`[auth-lifecycle-worker] Run ${runCount} completed.`);
		} catch (error) {
			console.error(
				`[auth-lifecycle-worker] Run ${runCount} failed: ${error.message}`,
			);
		}

		if (maxRuns > 0 && runCount >= maxRuns) {
			console.log(
				`[auth-lifecycle-worker] Reached max runs (${maxRuns}). Exiting.`,
			);
			break;
		}

		console.log(
			`[auth-lifecycle-worker] Sleeping for ${intervalMinutes} minute(s)...`,
		);
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
}

process.on("SIGINT", () => {
	stopped = true;
	console.log(
		"\n[auth-lifecycle-worker] Received SIGINT. Exiting after current run.",
	);
});

process.on("SIGTERM", () => {
	stopped = true;
	console.log(
		"\n[auth-lifecycle-worker] Received SIGTERM. Exiting after current run.",
	);
});

loop().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

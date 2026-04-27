import { doc, getDoc, setDoc } from "firebase/firestore";
import { ensureFirebaseReady } from "./firebase";

const SAFE_CODES = "safe_codes";
const ACTIVE_SAFE_CODE_DOC = "active";
const SAFE_CODE_VALIDITY_MS = 10 * 60 * 1000;

function randomChar(charset) {
	const index = Math.floor(Math.random() * charset.length);
	return charset[index];
}

function generateRandomSafeCode(length = 10) {
	const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
	const numbers = "23456789";
	const symbols = "@#%";

	let code = "";
	for (let index = 0; index < length; index += 1) {
		if (index % 4 === 3) {
			code += randomChar(symbols);
		} else if (index % 2 === 0) {
			code += randomChar(letters);
		} else {
			code += randomChar(numbers);
		}
	}
	return code;
}

async function sha256Hex(value) {
	const message = String(value || "");
	const encoder = new TextEncoder();
	const data = encoder.encode(message);
	const digest = await crypto.subtle.digest("SHA-256", data);
	const bytes = Array.from(new Uint8Array(digest));
	return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function generateAndStoreSafeCode({
	generatedBy,
	generatedByName,
}) {
	const firestore = ensureFirebaseReady();
	const code = generateRandomSafeCode();
	const now = Date.now();
	const expiresAt = new Date(now + SAFE_CODE_VALIDITY_MS).toISOString();
	const codeHash = await sha256Hex(code);

	await setDoc(
		doc(firestore, SAFE_CODES, ACTIVE_SAFE_CODE_DOC),
		{
			codeHash,
			generatedBy: String(generatedBy || "").trim(),
			generatedByName: String(generatedByName || "").trim(),
			generatedAt: new Date(now).toISOString(),
			expiresAt,
			updatedAt: new Date(now).toISOString(),
		},
		{ merge: true },
	);

	return { code, expiresAt };
}

export async function validateSafeCode(code) {
	const firestore = ensureFirebaseReady();
	const snapshot = await getDoc(
		doc(firestore, SAFE_CODES, ACTIVE_SAFE_CODE_DOC),
	);
	if (!snapshot.exists()) {
		return { valid: false, reason: "no-safe-code" };
	}

	const payload = snapshot.data() || {};
	const expiresAt = String(payload.expiresAt || "").trim();
	const expiresAtTime = Date.parse(expiresAt);
	if (!expiresAt || Number.isNaN(expiresAtTime) || expiresAtTime < Date.now()) {
		return { valid: false, reason: "expired" };
	}

	const incomingHash = await sha256Hex(code);
	const storedHash = String(payload.codeHash || "").trim();
	if (!storedHash || incomingHash !== storedHash) {
		return { valid: false, reason: "invalid" };
	}

	return { valid: true, expiresAt };
}

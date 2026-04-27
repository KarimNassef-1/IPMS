export const ROLES = {
	ADMIN: "admin",
	PARTNER: "partner",
};

export function parseMoney(value) {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : 0;
	}

	if (typeof value === "string") {
		const cleaned = value
			.trim()
			.replace(/\s+/g, "")
			.replace(/,/g, "")
			.replace(/[^0-9.-]/g, "");

		if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.")
			return 0;

		const parsed = Number(cleaned);
		return Number.isFinite(parsed) ? parsed : 0;
	}

	return 0;
}

export function formatCurrency(amount, currency = "EGP") {
	return new Intl.NumberFormat("en-EG", {
		style: "currency",
		currency,
		minimumFractionDigits: 0,
		maximumFractionDigits: 20,
	}).format(Number(amount) || 0);
}

export function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleDateString("en-GB");
}

export function isToday(value) {
	const date = new Date(value);
	const now = new Date();

	return (
		date.getDate() === now.getDate() &&
		date.getMonth() === now.getMonth() &&
		date.getFullYear() === now.getFullYear()
	);
}

export function assertRequiredFields(payload, fields) {
	for (const field of fields) {
		if (!payload?.[field]) {
			throw new Error(`${field} is required`);
		}
	}
}

export function normalizePhoneNumber(value) {
	return String(value || "").replace(/\D+/g, "");
}

export function buildManagedLoginEmailFromPhone(phoneNumber) {
	const digits = normalizePhoneNumber(phoneNumber);
	if (!digits) return "";
	return `u${digits}@ipms.local`;
}

function createSecureRandomString(length, alphabet) {
	const normalizedLength = Math.max(Number(length) || 0, 0);
	if (!normalizedLength) return "";

	const chars = String(alphabet || "");
	if (!chars.length) {
		throw new Error("Alphabet is required to generate random values.");
	}

	if (
		typeof globalThis !== "undefined" &&
		globalThis.crypto &&
		typeof globalThis.crypto.getRandomValues === "function"
	) {
		const bytes = new Uint32Array(normalizedLength);
		globalThis.crypto.getRandomValues(bytes);
		return Array.from(bytes)
			.map((value) => chars[value % chars.length])
			.join("");
	}

	let result = "";
	for (let index = 0; index < normalizedLength; index += 1) {
		const randomIndex = Math.floor(Math.random() * chars.length);
		result += chars[randomIndex];
	}
	return result;
}

export function generateManagedTemporaryPassword({
	fullName,
	phoneNumber,
	services,
}) {
	// Keep API signature stable for existing call sites, but generate a non-deterministic password.
	void fullName;
	void phoneNumber;
	void services;

	const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
	const lowercase = "abcdefghijkmnopqrstuvwxyz";
	const digits = "23456789";
	const symbols = "!@#$%^&*";
	const combined = `${uppercase}${lowercase}${digits}${symbols}`;

	const required = [
		createSecureRandomString(1, uppercase),
		createSecureRandomString(1, lowercase),
		createSecureRandomString(1, digits),
		createSecureRandomString(1, symbols),
	].join("");

	const filler = createSecureRandomString(12, combined);
	const shuffled = `${required}${filler}`
		.split("")
		.sort(() => (Math.random() < 0.5 ? -1 : 1))
		.join("");

	return shuffled;
}

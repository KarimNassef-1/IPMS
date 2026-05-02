import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	getDocs,
	onSnapshot,
	query,
	setDoc,
	updateDoc,
	where,
} from "firebase/firestore";
import { ensureFirebaseReady } from "./firebase";
import { calculateDistribution } from "../utils/calculations";
import { parseMoney } from "../utils/helpers";
import { refreshAgencyOverviewSummary } from "./summaryService";

const TRANSACTIONS = "transactions";
const EXPENSES = "expenses";

export async function recordIncome(payload) {
	const firestore = ensureFirebaseReady();
	const totalAmount = parseMoney(payload.totalAmount);
	const distribution = calculateDistribution(totalAmount);
	const data = {
		...payload,
		totalAmount,
		distribution,
		createdAt: new Date().toISOString(),
	};

	await addDoc(collection(firestore, TRANSACTIONS), data);
	refreshAgencyOverviewSummary().catch(() => {});

	return distribution;
}

export async function getTransactions(filters = {}) {
	const firestore = ensureFirebaseReady();
	const constraints = [];
	if (filters?.sinceDate) {
		constraints.push(where("createdAt", ">=", String(filters.sinceDate)));
	}
	const targetQuery = constraints.length
		? query(collection(firestore, TRANSACTIONS), ...constraints)
		: collection(firestore, TRANSACTIONS);

	const snapshot = await getDocs(targetQuery);
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export function subscribeTransactions(onData, onError) {
	const firestore = ensureFirebaseReady();

	return onSnapshot(
		collection(firestore, TRANSACTIONS),
		(snapshot) => {
			onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
		},
		onError,
	);
}

export async function updateTransaction(id, payload) {
	const firestore = ensureFirebaseReady();
	const nextPayload = { ...payload };

	if (Object.prototype.hasOwnProperty.call(nextPayload, "totalAmount")) {
		nextPayload.totalAmount = parseMoney(nextPayload.totalAmount);
	}

	await updateDoc(doc(firestore, TRANSACTIONS, id), nextPayload);
	refreshAgencyOverviewSummary().catch(() => {});
}

export async function deleteTransaction(id) {
	const firestore = ensureFirebaseReady();

	await deleteDoc(doc(firestore, TRANSACTIONS, id));
	refreshAgencyOverviewSummary().catch(() => {});
}

export async function addExpense(payload) {
	const firestore = ensureFirebaseReady();
	const data = {
		...payload,
		amount: parseMoney(payload.amount),
		createdAt: new Date().toISOString(),
	};

	await addDoc(collection(firestore, EXPENSES), data);
	refreshAgencyOverviewSummary().catch(() => {});
}

export async function getExpenses(filters = {}) {
	const firestore = ensureFirebaseReady();
	const constraints = [];
	if (filters.category) {
		constraints.push(where("category", "==", filters.category));
	}
	if (filters.sinceDate) {
		constraints.push(where("createdAt", ">=", String(filters.sinceDate)));
	}

	const targetQuery = constraints.length
		? query(collection(firestore, EXPENSES), ...constraints)
		: collection(firestore, EXPENSES);

	const snapshot = await getDocs(targetQuery);
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export function subscribeExpenses(onData, onError) {
	const firestore = ensureFirebaseReady();

	return onSnapshot(
		collection(firestore, EXPENSES),
		(snapshot) => {
			onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
		},
		onError,
	);
}

export async function updateExpense(id, payload) {
	const firestore = ensureFirebaseReady();
	const nextPayload = { ...payload };

	if (Object.prototype.hasOwnProperty.call(nextPayload, "amount")) {
		nextPayload.amount = parseMoney(nextPayload.amount);
	}

	await updateDoc(doc(firestore, EXPENSES, id), nextPayload);
	refreshAgencyOverviewSummary().catch(() => {});
}

export async function deleteExpense(id) {
	const firestore = ensureFirebaseReady();

	await deleteDoc(doc(firestore, EXPENSES, id));
	refreshAgencyOverviewSummary().catch(() => {});
}

export async function restoreExpense(payload) {
	const firestore = ensureFirebaseReady();
	const id = String(payload?.id || "").trim();
	if (!id) throw new Error("Expense id is required to restore expense.");
	const { id: _id, ...data } = payload;
	await setDoc(doc(firestore, EXPENSES, id), data, { merge: false });
	refreshAgencyOverviewSummary().catch(() => {});
}

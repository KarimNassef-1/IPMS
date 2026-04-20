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

	return distribution;
}

export async function getTransactions() {
	const firestore = ensureFirebaseReady();

	const snapshot = await getDocs(collection(firestore, TRANSACTIONS));
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
}

export async function deleteTransaction(id) {
	const firestore = ensureFirebaseReady();

	await deleteDoc(doc(firestore, TRANSACTIONS, id));
}

export async function addExpense(payload) {
	const firestore = ensureFirebaseReady();
	const data = {
		...payload,
		amount: parseMoney(payload.amount),
		createdAt: new Date().toISOString(),
	};

	await addDoc(collection(firestore, EXPENSES), data);
}

export async function getExpenses(filters = {}) {
	const firestore = ensureFirebaseReady();

	if (filters.category) {
		const expensesQuery = query(
			collection(firestore, EXPENSES),
			where("category", "==", filters.category),
		);
		const snapshot = await getDocs(expensesQuery);
		return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
	}

	const snapshot = await getDocs(collection(firestore, EXPENSES));
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
}

export async function deleteExpense(id) {
	const firestore = ensureFirebaseReady();

	await deleteDoc(doc(firestore, EXPENSES, id));
}

export async function restoreExpense(payload) {
	const firestore = ensureFirebaseReady();
	const id = String(payload?.id || "").trim();
	if (!id) throw new Error("Expense id is required to restore expense.");
	const { id: _id, ...data } = payload;
	await setDoc(doc(firestore, EXPENSES, id), data, { merge: false });
}

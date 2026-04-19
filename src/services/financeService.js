import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	getDocs,
	onSnapshot,
	query,
	updateDoc,
	where,
} from "firebase/firestore";
import { ensureFirebaseReady } from "./firebase";
import { calculateDistribution } from "../utils/calculations";

const TRANSACTIONS = "transactions";
const EXPENSES = "expenses";

export async function recordIncome(payload) {
	const firestore = ensureFirebaseReady();
	const totalAmount = Number(payload.totalAmount) || 0;
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

	await updateDoc(doc(firestore, TRANSACTIONS, id), payload);
}

export async function deleteTransaction(id) {
	const firestore = ensureFirebaseReady();

	await deleteDoc(doc(firestore, TRANSACTIONS, id));
}

export async function addExpense(payload) {
	const firestore = ensureFirebaseReady();
	const data = {
		...payload,
		amount: Number(payload.amount) || 0,
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

	await updateDoc(doc(firestore, EXPENSES, id), payload);
}

export async function deleteExpense(id) {
	const firestore = ensureFirebaseReady();

	await deleteDoc(doc(firestore, EXPENSES, id));
}

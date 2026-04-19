import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	getDocs,
	updateDoc,
} from "firebase/firestore";
import { ensureFirebaseReady } from "./firebase";

const BUDGETS = "budgets";

export async function createBudget(payload) {
	const firestore = ensureFirebaseReady();
	const data = {
		...payload,
		balance: Number(payload.balance) || 0,
		spent: Number(payload.spent) || 0,
		createdAt: new Date().toISOString(),
	};

	const ref = await addDoc(collection(firestore, BUDGETS), data);
	return { id: ref.id, ...data };
}

export async function getBudgets() {
	const firestore = ensureFirebaseReady();

	const snapshot = await getDocs(collection(firestore, BUDGETS));
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function updateBudget(id, payload) {
	const firestore = ensureFirebaseReady();

	await updateDoc(doc(firestore, BUDGETS, id), payload);
}

export async function deleteBudget(id) {
	const firestore = ensureFirebaseReady();

	await deleteDoc(doc(firestore, BUDGETS, id));
}

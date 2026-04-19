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
import { assertRequiredFields } from "../utils/helpers";

const TASKS = "tasks";
const DAILY_TASKS = "daily_tasks";

export async function createTask(payload) {
	assertRequiredFields(payload, ["name", "assignedTo", "priority", "status"]);
	const firestore = ensureFirebaseReady();

	const data = {
		...payload,
		locked: Boolean(payload?.locked),
		createdAt: new Date().toISOString(),
	};

	const ref = await addDoc(collection(firestore, TASKS), data);
	return { id: ref.id, ...data };
}

export async function getTasks() {
	const firestore = ensureFirebaseReady();

	const snapshot = await getDocs(collection(firestore, TASKS));
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export function subscribeTasks(onData, onError) {
	const firestore = ensureFirebaseReady();

	return onSnapshot(
		collection(firestore, TASKS),
		(snapshot) => {
			onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
		},
		onError,
	);
}

export async function updateTask(id, payload) {
	const firestore = ensureFirebaseReady();

	await updateDoc(doc(firestore, TASKS, id), payload);
}

export async function deleteTask(id) {
	const firestore = ensureFirebaseReady();

	await deleteDoc(doc(firestore, TASKS, id));
}

export async function createDailyTask(payload) {
	assertRequiredFields(payload, ["name", "assignedTo", "date"]);
	const firestore = ensureFirebaseReady();

	const data = {
		...payload,
		isCompleted: Boolean(payload.isCompleted),
		locked: Boolean(payload?.locked),
		createdAt: new Date().toISOString(),
	};

	const ref = await addDoc(collection(firestore, DAILY_TASKS), data);
	return { id: ref.id, ...data };
}

export async function getDailyTasksByDate(date) {
	const firestore = ensureFirebaseReady();

	const dailyQuery = query(
		collection(firestore, DAILY_TASKS),
		where("date", "==", date),
	);
	const snapshot = await getDocs(dailyQuery);
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getDailyTasks() {
	const firestore = ensureFirebaseReady();

	const snapshot = await getDocs(collection(firestore, DAILY_TASKS));
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function toggleDailyTask(id, isCompleted) {
	const firestore = ensureFirebaseReady();
	const payload = {
		isCompleted,
		updatedAt: new Date().toISOString(),
	};

	await updateDoc(doc(firestore, DAILY_TASKS, id), payload);
}

export async function updateDailyTask(id, payload) {
	const firestore = ensureFirebaseReady();

	await updateDoc(doc(firestore, DAILY_TASKS, id), payload);
}

export async function deleteDailyTask(id) {
	const firestore = ensureFirebaseReady();

	await deleteDoc(doc(firestore, DAILY_TASKS, id));
}

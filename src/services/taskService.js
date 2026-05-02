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
import { assertRequiredFields } from "../utils/helpers";

const TASKS = "tasks";
const DAILY_TASKS = "daily_tasks";

function normalizeAssignees(payload) {
	const rawIds = Array.isArray(payload?.assignedUserIds)
		? payload.assignedUserIds
		: payload?.assignedToUserId
			? [payload.assignedToUserId]
			: [];
	const assignedUserIds = Array.from(
		new Set(rawIds.map((id) => String(id || "").trim()).filter(Boolean)),
	);
	const fallbackName = String(payload?.assignedTo || "").trim();
	const rawNames = Array.isArray(payload?.assignedUserNames)
		? payload.assignedUserNames
		: fallbackName
			? [fallbackName]
			: [];
	const assignedUserNames = assignedUserIds.map((_, index) =>
		String(rawNames[index] || fallbackName || "Unassigned").trim(),
	);

	return {
		assignedUserIds,
		assignedUserNames,
		assignedToUserId: assignedUserIds[0] || "",
		assignedTo: assignedUserNames[0] || fallbackName || "Unassigned",
	};
}

export async function createTask(payload) {
	assertRequiredFields(payload, ["name", "priority", "status"]);
	const assignees = normalizeAssignees(payload);
	if (!assignees.assignedUserIds.length) {
		throw new Error("At least one task assignee is required.");
	}
	const firestore = ensureFirebaseReady();

	const data = {
		...payload,
		...assignees,
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

export function subscribeDailyTasks(onData, onError) {
	const firestore = ensureFirebaseReady();

	return onSnapshot(
		collection(firestore, DAILY_TASKS),
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

export async function restoreTask(payload) {
	const firestore = ensureFirebaseReady();
	const id = String(payload?.id || "").trim();
	if (!id) throw new Error("Task id is required to restore task.");
	const { id: _id, ...data } = payload;
	await setDoc(doc(firestore, TASKS, id), data, { merge: false });
}

export async function createDailyTask(payload) {
	assertRequiredFields(payload, ["name", "date"]);
	const assignees = normalizeAssignees(payload);
	if (!assignees.assignedUserIds.length) {
		throw new Error("At least one daily task assignee is required.");
	}
	const firestore = ensureFirebaseReady();

	const data = {
		...payload,
		...assignees,
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

export async function restoreDailyTask(payload) {
	const firestore = ensureFirebaseReady();
	const id = String(payload?.id || "").trim();
	if (!id) throw new Error("Daily task id is required to restore daily task.");
	const { id: _id, ...data } = payload;
	await setDoc(doc(firestore, DAILY_TASKS, id), data, { merge: false });
}

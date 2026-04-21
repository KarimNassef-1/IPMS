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

const NOTIFICATIONS = "notifications";

export async function createNotification(payload) {
	const firestore = ensureFirebaseReady();
	const data = {
		...payload,
		adminFeed: payload?.adminFeed !== false,
		status: payload.status || "unread",
		date: payload.date || new Date().toISOString(),
	};

	const ref = await addDoc(collection(firestore, NOTIFICATIONS), data);
	return { id: ref.id, ...data };
}

export async function getNotificationsByUser(userId) {
	const firestore = ensureFirebaseReady();

	const notificationsQuery = query(
		collection(firestore, NOTIFICATIONS),
		where("userId", "==", userId),
	);
	const snapshot = await getDocs(notificationsQuery);
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getAllNotifications() {
	const firestore = ensureFirebaseReady();

	const snapshot = await getDocs(collection(firestore, NOTIFICATIONS));
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export function subscribeNotifications(onData, onError) {
	const firestore = ensureFirebaseReady();

	return onSnapshot(
		collection(firestore, NOTIFICATIONS),
		(snapshot) => {
			onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
		},
		onError,
	);
}

export async function markNotificationAsRead(id) {
	const firestore = ensureFirebaseReady();

	await updateDoc(doc(firestore, NOTIFICATIONS, id), { status: "read" });
}

export async function deleteNotification(id) {
	const firestore = ensureFirebaseReady();

	await deleteDoc(doc(firestore, NOTIFICATIONS, id));
}

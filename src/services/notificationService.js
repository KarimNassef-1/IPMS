import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	getDocs,
	onSnapshot,
	limit,
	orderBy,
	query,
	updateDoc,
	where,
} from "firebase/firestore";
import { ensureFirebaseReady } from "./firebase";

const NOTIFICATIONS = "notifications";
const ADMIN_FEED_HISTORY_LIMIT = 200;
const PRUNE_FETCH_LIMIT = 1000;

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

export async function getAdminFeedNotifications() {
	const firestore = ensureFirebaseReady();
	const adminFeedQuery = query(
		collection(firestore, NOTIFICATIONS),
		where("adminFeed", "==", true),
		orderBy("date", "desc"),
		limit(ADMIN_FEED_HISTORY_LIMIT),
	);
	const snapshot = await getDocs(adminFeedQuery);
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

export function subscribeAdminFeedNotifications(onData, onError) {
	const firestore = ensureFirebaseReady();
	const adminFeedQuery = query(
		collection(firestore, NOTIFICATIONS),
		where("adminFeed", "==", true),
		orderBy("date", "desc"),
		limit(ADMIN_FEED_HISTORY_LIMIT),
	);

	return onSnapshot(
		adminFeedQuery,
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

export async function pruneAdminFeedNotifications(options = {}) {
	const firestore = ensureFirebaseReady();
	const keepLatest = Math.max(
		Number(options?.keepLatest) || ADMIN_FEED_HISTORY_LIMIT,
		1,
	);
	const keepDays = Math.max(Number(options?.keepDays) || 180, 1);
	const keepAfterMs = Date.now() - keepDays * 24 * 60 * 60 * 1000;

	const adminFeedQuery = query(
		collection(firestore, NOTIFICATIONS),
		where("adminFeed", "==", true),
		orderBy("date", "desc"),
		limit(PRUNE_FETCH_LIMIT),
	);

	const snapshot = await getDocs(adminFeedQuery);
	const docs = snapshot.docs;
	if (!docs.length) return { deleted: 0, scanned: 0 };

	const candidates = docs.slice(keepLatest).filter((item) => {
		const rawDate = String(item.data()?.date || "").trim();
		const timestamp = Date.parse(rawDate);
		if (Number.isNaN(timestamp)) return true;
		return timestamp < keepAfterMs;
	});

	if (!candidates.length) return { deleted: 0, scanned: docs.length };

	await Promise.all(
		candidates.map((item) => deleteDoc(doc(firestore, NOTIFICATIONS, item.id))),
	);
	return { deleted: candidates.length, scanned: docs.length };
}

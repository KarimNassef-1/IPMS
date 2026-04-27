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

const OUTSOURCE_PORTALS = "outsource_portals";

function safeText(value, fallback = "") {
	const text = String(value || "").trim();
	return text || fallback;
}

function safeTextList(values) {
	if (!Array.isArray(values)) return [];
	return values.map((value) => safeText(value)).filter(Boolean);
}

function normalizeAssignedUsers(payload) {
	const legacyId = safeText(payload?.assignedUserId);
	const legacyName = safeText(payload?.assignedUserName);
	const providedIds = safeTextList(payload?.assignedUserIds);
	const providedNames = safeTextList(payload?.assignedUserNames);

	const assignedUserIds = [
		...new Set(providedIds.length ? providedIds : legacyId ? [legacyId] : []),
	];
	const assignedUserNames = assignedUserIds.map((_, index) =>
		safeText(
			providedNames[index],
			index === 0 ? legacyName || "Outsource User" : "Outsource User",
		),
	);

	return {
		assignedUserIds,
		assignedUserNames,
		assignedUserId: assignedUserIds[0] || "",
		assignedUserName: assignedUserNames[0] || "",
	};
}

function ensureAssignedUsers(payload) {
	const assignedUserIds = safeTextList(payload?.assignedUserIds);
	const legacyId = safeText(payload?.assignedUserId);
	if (!assignedUserIds.length && !legacyId) {
		throw new Error("At least one assignee is required.");
	}
}

function normalizeTask(payload, index) {
	return {
		id: safeText(payload?.id, `task_${index + 1}`),
		name: safeText(payload?.name),
		deadline: safeText(payload?.deadline),
		priority: safeText(payload?.priority),
		status: safeText(payload?.status, "not_started"),
		completed: Boolean(payload?.completed),
		createdAt: safeText(payload?.createdAt, new Date().toISOString()),
		comments: Array.isArray(payload?.comments) ? payload.comments : [],
		order: payload?.order !== undefined ? payload.order : index,
	};
}

function normalizePhase(payload, index) {
	const tasks = Array.isArray(payload?.tasks)
		? payload.tasks
				.map((task, taskIndex) => normalizeTask(task, taskIndex))
				.filter((task) => task.name)
		: [];

	return {
		id: safeText(payload?.id, `phase_${index + 1}`),
		name: safeText(payload?.name),
		deadline: safeText(payload?.deadline),
		startDate: safeText(payload?.startDate),
		endDate: safeText(payload?.endDate),
		order: payload?.order !== undefined ? payload.order : index,
		completed: Boolean(payload?.completed),
		createdAt: safeText(payload?.createdAt, new Date().toISOString()),
		tasks,
	};
}

function normalizePhases(phases) {
	if (!Array.isArray(phases)) return [];
	return phases
		.map((phase, index) => normalizePhase(phase, index))
		.filter((phase) => phase.name);
}

function normalizePortalPayload(payload) {
	const assignees = normalizeAssignedUsers(payload);
	return {
		...assignees,
		projectId: safeText(payload?.projectId),
		projectName: safeText(payload?.projectName, "Project"),
		serviceId: safeText(payload?.serviceId),
		serviceName: safeText(payload?.serviceName, "Service"),
		serviceCategory: safeText(payload?.serviceCategory),
		timelineStart: safeText(payload?.timelineStart),
		timelineEnd: safeText(payload?.timelineEnd),
		phases: normalizePhases(payload?.phases),
		notes: safeText(payload?.notes),
	};
}

export async function createOutsourcePortal(payload) {
	assertRequiredFields(payload, ["projectId", "serviceId"]);
	ensureAssignedUsers(payload);
	const firestore = ensureFirebaseReady();
	const normalized = normalizePortalPayload(payload);

	const data = {
		...normalized,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};

	const ref = await addDoc(collection(firestore, OUTSOURCE_PORTALS), data);
	return { id: ref.id, ...data };
}

export async function updateOutsourcePortal(portalId, payload) {
	const firestore = ensureFirebaseReady();
	const normalized = normalizePortalPayload(payload);

	await updateDoc(doc(firestore, OUTSOURCE_PORTALS, portalId), {
		...normalized,
		updatedAt: new Date().toISOString(),
	});
}

export async function deleteOutsourcePortal(portalId) {
	const firestore = ensureFirebaseReady();
	await deleteDoc(doc(firestore, OUTSOURCE_PORTALS, portalId));
}

export function subscribeOutsourcePortalsForUser(userId, onData, onError) {
	const firestore = ensureFirebaseReady();
	const normalizedUserId = String(userId || "").trim();
	const scopedQuery = query(
		collection(firestore, OUTSOURCE_PORTALS),
		where("assignedUserIds", "array-contains", normalizedUserId),
	);

	return onSnapshot(
		scopedQuery,
		(snapshot) => {
			onData(
				snapshot.docs.map((item) => ({
					id: item.id,
					...item.data(),
				})),
			);
		},
		onError,
	);
}

export function subscribeAllOutsourcePortals(onData, onError) {
	const firestore = ensureFirebaseReady();
	return onSnapshot(
		collection(firestore, OUTSOURCE_PORTALS),
		(snapshot) => {
			onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
		},
		onError,
	);
}

export async function getOutsourcePortalsByUser(userId) {
	const firestore = ensureFirebaseReady();
	const normalizedUserId = String(userId || "").trim();
	const scopedQuery = query(
		collection(firestore, OUTSOURCE_PORTALS),
		where("assignedUserIds", "array-contains", normalizedUserId),
	);
	const snapshot = await getDocs(scopedQuery);
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function migrateOutsourcePortalsToAssignedUserIds() {
	const firestore = ensureFirebaseReady();
	const snapshot = await getDocs(collection(firestore, OUTSOURCE_PORTALS));

	const updates = snapshot.docs.map(async (item) => {
		const current = item.data() || {};
		const normalized = normalizePortalPayload(current);
		const hasArray =
			Array.isArray(current.assignedUserIds) &&
			current.assignedUserIds.length > 0;
		const needsUpdate =
			!hasArray || current.assignedUserId !== normalized.assignedUserId;

		if (!needsUpdate) return;

		await updateDoc(doc(firestore, OUTSOURCE_PORTALS, item.id), {
			assignedUserIds: normalized.assignedUserIds,
			assignedUserNames: normalized.assignedUserNames,
			assignedUserId: normalized.assignedUserId,
			assignedUserName: normalized.assignedUserName,
			updatedAt: new Date().toISOString(),
		});
	});

	await Promise.all(updates);
}

export async function getAllOutsourcePortals() {
	const firestore = ensureFirebaseReady();
	const snapshot = await getDocs(collection(firestore, OUTSOURCE_PORTALS));
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getOutsourcePortalsByService(serviceId) {
	const firestore = ensureFirebaseReady();
	const scopedQuery = query(
		collection(firestore, OUTSOURCE_PORTALS),
		where("serviceId", "==", String(serviceId || "").trim()),
	);
	const snapshot = await getDocs(scopedQuery);
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function upsertOutsourcePortalByService(payload) {
	const serviceId = String(payload?.serviceId || "").trim();
	assertRequiredFields(payload, ["projectId", "serviceId"]);
	ensureAssignedUsers(payload);

	const existing = await getOutsourcePortalsByService(serviceId);
	if (existing.length) {
		const target = existing[0];
		const nextPayload = {
			...target,
			...payload,
			phases: Array.isArray(target.phases) ? target.phases : [],
			timelineStart: payload?.timelineStart || target.timelineStart || "",
			timelineEnd: payload?.timelineEnd || target.timelineEnd || "",
			notes: payload?.notes || target.notes || "",
		};
		await updateOutsourcePortal(target.id, nextPayload);
		return { id: target.id, ...nextPayload };
	}

	return createOutsourcePortal(payload);
}

export async function deleteOutsourcePortalsByService(serviceId) {
	const existing = await getOutsourcePortalsByService(serviceId);
	await Promise.all(existing.map((item) => deleteOutsourcePortal(item.id)));
}

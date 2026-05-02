import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	onSnapshot,
	query,
	updateDoc,
	where,
} from "firebase/firestore";
import { ensureFirebaseReady } from "./firebase";
import { assertRequiredFields } from "../utils/helpers";
import { normalizeTicketOwner } from "../domain/workflow/canonicalWorkflow";
import { createWorkflowAuditEntry } from "../utils/workflowLifecycle";
import { refreshAgencyOverviewSummary } from "./summaryService";

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
	const legacyEmail = safeText(payload?.assignedUserEmail).toLowerCase();
	const providedIds = safeTextList(payload?.assignedUserIds);
	const providedNames = safeTextList(payload?.assignedUserNames);
	const providedEmails = safeTextList(payload?.assignedUserEmails).map(
		(email) => email.toLowerCase(),
	);

	const assignedUserIds = [
		...new Set(providedIds.length ? providedIds : legacyId ? [legacyId] : []),
	];
	const assignedUserNames = assignedUserIds.map((_, index) =>
		safeText(
			providedNames[index],
			index === 0 ? legacyName || "Outsource User" : "Outsource User",
		),
	);
	const assignedUserEmails = assignedUserIds.map((_, index) =>
		safeText(
			providedEmails[index],
			index === 0 ? legacyEmail || "" : "",
		).toLowerCase(),
	);

	return {
		assignedUserIds,
		assignedUserNames,
		assignedUserEmails,
		assignedUserId: assignedUserIds[0] || "",
		assignedUserName: assignedUserNames[0] || "",
		assignedUserEmail: assignedUserEmails[0] || "",
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
	const review =
		payload?.review && typeof payload.review === "object" ? payload.review : {};
	const owner = normalizeTicketOwner(payload?.owner || payload);
	return {
		id: safeText(payload?.id, `task_${index + 1}`),
		name: safeText(payload?.name),
		deadline: safeText(payload?.deadline),
		priority: safeText(payload?.priority),
		status: safeText(payload?.status, "not_started"),
		blockedReason: safeText(payload?.blockedReason),
		completed: Boolean(payload?.completed),
		createdAt: safeText(payload?.createdAt, new Date().toISOString()),
		comments: Array.isArray(payload?.comments) ? payload.comments : [],
		review: {
			status: safeText(review?.status),
			submittedAt: safeText(review?.submittedAt),
			submittedById: safeText(review?.submittedById),
			submittedByName: safeText(review?.submittedByName),
			reviewedAt: safeText(review?.reviewedAt),
			reviewerId: safeText(review?.reviewerId),
			reviewerName: safeText(review?.reviewerName),
			rejectionReason: safeText(review?.rejectionReason),
			slaDueAt: safeText(review?.slaDueAt),
			escalationLevel: Math.max(Number(review?.escalationLevel) || 0, 0),
			escalationReason: safeText(review?.escalationReason),
		},
		owner: {
			ownerUserId: owner.ownerUserId,
			ownerName: owner.ownerName,
			ownerEmail: owner.ownerEmail,
			ownerAssignedAt: owner.ownerAssignedAt,
		},
		ownerUserId: owner.ownerUserId,
		ownerName: owner.ownerName,
		ownerEmail: owner.ownerEmail,
		ownerAssignedAt: owner.ownerAssignedAt,
		auditTrail: Array.isArray(payload?.auditTrail) ? payload.auditTrail : [],
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
	const defaultOwner = normalizeTicketOwner({
		id: assignees.assignedUserIds[0],
		name: assignees.assignedUserNames[0],
		email: assignees.assignedUserEmails[0],
	});
	const normalizedPhases = normalizePhases(payload?.phases).map((phase) => ({
		...phase,
		tasks: (Array.isArray(phase.tasks) ? phase.tasks : []).map((task) => {
			if (safeText(task?.ownerUserId)) return task;
			return {
				...task,
				owner: {
					ownerUserId: defaultOwner.ownerUserId,
					ownerName: defaultOwner.ownerName,
					ownerEmail: defaultOwner.ownerEmail,
					ownerAssignedAt: defaultOwner.ownerAssignedAt,
				},
				ownerUserId: defaultOwner.ownerUserId,
				ownerName: defaultOwner.ownerName,
				ownerEmail: defaultOwner.ownerEmail,
				ownerAssignedAt: defaultOwner.ownerAssignedAt,
			};
		}),
	}));

	return {
		...assignees,
		projectId: safeText(payload?.projectId),
		projectName: safeText(payload?.projectName, "Project"),
		serviceId: safeText(payload?.serviceId),
		serviceName: safeText(payload?.serviceName, "Service"),
		serviceCategory: safeText(payload?.serviceCategory),
		timelineStart: safeText(payload?.timelineStart),
		timelineEnd: safeText(payload?.timelineEnd),
		phases: normalizedPhases,
		notes: safeText(payload?.notes),
	};
}

function mapSnapshotDocs(snapshot) {
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

function mergePortalsById(...portalLists) {
	const merged = new Map();
	portalLists.forEach((list) => {
		(list || []).forEach((portal) => {
			if (portal?.id) merged.set(portal.id, portal);
		});
	});
	return Array.from(merged.values());
}

function isPermissionDenied(error) {
	return String(error?.code || "").toLowerCase() === "permission-denied";
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
	refreshAgencyOverviewSummary().catch(() => {});
	return { id: ref.id, ...data };
}

export async function updateOutsourcePortal(portalId, payload) {
	const firestore = ensureFirebaseReady();
	const normalized = normalizePortalPayload(payload);

	await updateDoc(doc(firestore, OUTSOURCE_PORTALS, portalId), {
		...normalized,
		updatedAt: new Date().toISOString(),
	});
	refreshAgencyOverviewSummary().catch(() => {});
}

export async function deleteOutsourcePortal(portalId) {
	const firestore = ensureFirebaseReady();
	await deleteDoc(doc(firestore, OUTSOURCE_PORTALS, portalId));
	refreshAgencyOverviewSummary().catch(() => {});
}

export async function updateOutsourceTaskOwnership(
	portalId,
	phaseId,
	taskId,
	owner,
	actor = {},
) {
	const firestore = ensureFirebaseReady();
	const safePortalId = safeText(portalId);
	if (!safePortalId) throw new Error("Portal id is required.");

	const ref = doc(firestore, OUTSOURCE_PORTALS, safePortalId);
	const snapshot = await getDoc(ref);
	if (!snapshot.exists()) throw new Error("Portal not found.");
	const portal = snapshot.data() || {};

	const normalizedOwner = normalizeTicketOwner(owner);
	const actorId = safeText(actor?.id || actor?.uid);
	const actorName = safeText(actor?.name || actor?.displayName, "System");
	const sourcePortal = safeText(actor?.sourcePortal, "outsource");

	const phases = (Array.isArray(portal?.phases) ? portal.phases : []).map(
		(phase) => {
			if (safeText(phase?.id) !== safeText(phaseId)) return phase;
			return {
				...phase,
				tasks: (Array.isArray(phase?.tasks) ? phase.tasks : []).map((task) => {
					if (safeText(task?.id) !== safeText(taskId)) return task;
					const auditTrail = Array.isArray(task?.auditTrail)
						? task.auditTrail
						: [];
					return {
						...task,
						owner: normalizedOwner,
						ownerUserId: normalizedOwner.ownerUserId,
						ownerName: normalizedOwner.ownerName,
						ownerEmail: normalizedOwner.ownerEmail,
						ownerAssignedAt: normalizedOwner.ownerAssignedAt,
						auditTrail: [
							...auditTrail,
							createWorkflowAuditEntry({
								action: "task_owner_changed",
								note: `Task owner set to ${normalizedOwner.ownerName}.`,
								actorId,
								actorName,
								metadata: {
									sourcePortal,
									changedFields: ["ownerUserId", "ownerName", "ownerEmail"],
								},
							}),
						],
					};
				}),
			};
		},
	);

	await updateDoc(ref, {
		phases,
		updatedAt: new Date().toISOString(),
	});
	refreshAgencyOverviewSummary().catch(() => {});
}

export function subscribeOutsourcePortalsForUser(
	userId,
	onData,
	onError,
	options = {},
) {
	const firestore = ensureFirebaseReady();
	const normalizedUserId = String(userId || "").trim();
	const normalizedEmail = String(options?.email || "")
		.trim()
		.toLowerCase();
	if (!normalizedUserId) {
		onData([]);
		return () => {};
	}

	const arrayScopedQuery = query(
		collection(firestore, OUTSOURCE_PORTALS),
		where("assignedUserIds", "array-contains", normalizedUserId),
	);
	const legacyScopedQuery = query(
		collection(firestore, OUTSOURCE_PORTALS),
		where("assignedUserId", "==", normalizedUserId),
	);
	const emailScopedQuery = normalizedEmail
		? query(
				collection(firestore, OUTSOURCE_PORTALS),
				where("assignedUserEmails", "array-contains", normalizedEmail),
			)
		: null;

	let arrayItems = [];
	let legacyItems = [];
	let emailItems = [];
	let arrayFailed = false;
	let legacyFailed = false;
	let emailFailed = !emailScopedQuery;
	let hasEmittedData = false;

	const emit = () => {
		hasEmittedData = true;
		onData(mergePortalsById(arrayItems, legacyItems, emailItems));
	};

	const maybeReportError = (error) => {
		if (arrayFailed && legacyFailed && emailFailed) {
			onError(error);
		}
	};

	const unsubscribeArray = onSnapshot(
		arrayScopedQuery,
		(snapshot) => {
			arrayFailed = false;
			arrayItems = mapSnapshotDocs(snapshot);
			emit();
		},
		(error) => {
			arrayFailed = true;
			arrayItems = [];
			if (!isPermissionDenied(error) || (!hasEmittedData && legacyFailed)) {
				maybeReportError(error);
			}
		},
	);

	const unsubscribeLegacy = onSnapshot(
		legacyScopedQuery,
		(snapshot) => {
			legacyFailed = false;
			legacyItems = mapSnapshotDocs(snapshot);
			emit();
		},
		(error) => {
			legacyFailed = true;
			legacyItems = [];
			if (!isPermissionDenied(error) || (!hasEmittedData && arrayFailed)) {
				maybeReportError(error);
			}
		},
	);

	const unsubscribeEmail = emailScopedQuery
		? onSnapshot(
				emailScopedQuery,
				(snapshot) => {
					emailFailed = false;
					emailItems = mapSnapshotDocs(snapshot);
					emit();
				},
				(error) => {
					emailFailed = true;
					emailItems = [];
					if (
						!isPermissionDenied(error) ||
						(!hasEmittedData && arrayFailed && legacyFailed)
					) {
						maybeReportError(error);
					}
				},
			)
		: () => {};

	return () => {
		unsubscribeArray();
		unsubscribeLegacy();
		unsubscribeEmail();
	};
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
	if (!normalizedUserId) return [];
	const arrayScopedQuery = query(
		collection(firestore, OUTSOURCE_PORTALS),
		where("assignedUserIds", "array-contains", normalizedUserId),
	);
	const legacyScopedQuery = query(
		collection(firestore, OUTSOURCE_PORTALS),
		where("assignedUserId", "==", normalizedUserId),
	);

	const [arrayResult, legacyResult] = await Promise.all([
		getDocs(arrayScopedQuery)
			.then((snapshot) => ({ items: mapSnapshotDocs(snapshot), error: null }))
			.catch((error) => ({ items: [], error })),
		getDocs(legacyScopedQuery)
			.then((snapshot) => ({ items: mapSnapshotDocs(snapshot), error: null }))
			.catch((error) => ({ items: [], error })),
	]);

	if (arrayResult.error && legacyResult.error) {
		throw arrayResult.error;
	}

	return mergePortalsById(arrayResult.items, legacyResult.items);
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

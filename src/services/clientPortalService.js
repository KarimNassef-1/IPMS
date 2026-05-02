import {
	addDoc,
	arrayUnion,
	collection,
	documentId,
	doc,
	getDoc,
	getDocs,
	onSnapshot,
	query,
	updateDoc,
	where,
} from "firebase/firestore";
import { ensureFirebaseReady } from "./firebase";
import {
	getClientAccessGrantsByLinkedUserId,
	getClientAccessGrantsByUserId,
} from "./clientQrAccessService";
import { normalizeServicePaymentStatus } from "../utils/serviceFinance";
import {
	canTransitionTicketWorkflow,
	createWorkflowAuditEntry,
	mapTicketStatusToWorkflowStatus,
	normalizeTicketWorkflowPayload,
} from "../utils/workflowLifecycle";
import { normalizeTicketOwner } from "../domain/workflow/canonicalWorkflow";
import { emitWorkflowEvent } from "./workflowEvents";
import { refreshAgencyOverviewSummary } from "./summaryService";

const PROJECTS = "projects";
const SERVICES = "services";
const CLIENT_TICKETS = "client_tickets";

function safeText(value, fallback = "") {
	const text = String(value || "").trim();
	return text || fallback;
}

function safeTextLower(value, fallback = "") {
	return safeText(value, fallback).toLowerCase();
}

function isPermissionDeniedError(error) {
	const message = safeTextLower(error?.message || "");
	const code = safeTextLower(error?.code || "");
	return (
		message.includes("missing or insufficient permissions") ||
		code.includes("permission-denied")
	);
}

function chunkArray(values, chunkSize = 10) {
	const source = Array.isArray(values) ? values : [];
	const chunks = [];
	for (let index = 0; index < source.length; index += chunkSize) {
		chunks.push(source.slice(index, index + chunkSize));
	}
	return chunks;
}

function uniqueById(items) {
	const map = new Map();
	for (const item of Array.isArray(items) ? items : []) {
		const id = safeText(item?.id);
		if (!id) continue;
		map.set(id, item);
	}
	return Array.from(map.values());
}

function normalizeProjectStatusProgress(status) {
	const normalized = safeTextLower(status);
	const matrix = {
		lead: 10,
		negotiation: 20,
		"in progress": 60,
		"waiting for client": 75,
		delivered: 90,
		completed: 100,
		paid: 100,
		cancelled: 0,
	};
	if (Object.prototype.hasOwnProperty.call(matrix, normalized)) {
		return matrix[normalized];
	}
	return 0;
}

function serviceProgress(services) {
	if (!Array.isArray(services) || !services.length) return 0;
	const doneCount = services.filter((service) => {
		const status = normalizeServicePaymentStatus(service?.paymentStatus);
		return status === "paid" || status === "completed" || status === "free";
	}).length;
	return Math.round((doneCount / services.length) * 100);
}

function computeProjectProgress(project, services) {
	const statusProgress = normalizeProjectStatusProgress(project?.status);
	const byServices = serviceProgress(services);
	if (!Array.isArray(services) || !services.length) return statusProgress;
	return Math.round(statusProgress * 0.6 + byServices * 0.4);
}

function toClientMatchProfiles(user, profile) {
	const uid = safeText(user?.uid);
	const email = safeTextLower(user?.email);
	const profileName = safeText(profile?.name);
	const displayName = safeText(user?.displayName);

	const names = Array.from(new Set([profileName, displayName].filter(Boolean)));
	return {
		uid,
		email,
		names,
	};
}

function isGrantMatchIdentity(grant, identity) {
	const grantClientId = safeText(grant?.clientId);
	const grantLinkedUserId = safeText(grant?.linkedClientUserId);
	const grantEmail = safeTextLower(grant?.clientEmail);
	const grantLinkedEmail = safeTextLower(grant?.linkedClientEmail);

	if (
		identity?.uid &&
		(grantClientId === identity.uid || grantLinkedUserId === identity.uid)
	) {
		return true;
	}

	if (
		identity?.email &&
		(grantEmail === identity.email || grantLinkedEmail === identity.email)
	) {
		return true;
	}

	if (
		!identity?.uid &&
		!identity?.email &&
		Array.isArray(identity?.names) &&
		identity.names.length
	) {
		const grantName = safeText(grant?.clientName);
		const linkedGrantName = safeText(grant?.linkedClientName);
		return (
			identity.names.includes(grantName) ||
			identity.names.includes(linkedGrantName)
		);
	}

	return false;
}

async function queryProjectsByClientIdentity({ uid, email, names }) {
	const firestore = ensureFirebaseReady();
	const projectCollection = collection(firestore, PROJECTS);
	const lookups = [];

	if (uid) {
		lookups.push(
			getDocs(query(projectCollection, where("clientUserId", "==", uid))),
		);
		lookups.push(
			getDocs(
				query(projectCollection, where("clientUserIds", "array-contains", uid)),
			),
		);
	}

	if (email) {
		lookups.push(
			getDocs(query(projectCollection, where("clientEmail", "==", email))),
		);
		lookups.push(
			getDocs(
				query(
					projectCollection,
					where("clientEmails", "array-contains", email),
				),
			),
		);
	}

	if (!uid && !email) {
		for (const name of names) {
			lookups.push(
				getDocs(query(projectCollection, where("clientName", "==", name))),
			);
		}
	}

	if (!lookups.length) return [];

	const snapshots = await Promise.all(lookups);
	return uniqueById(
		snapshots
			.flatMap((snapshot) => snapshot.docs)
			.map((docItem) => ({ id: docItem.id, ...docItem.data() })),
	);
}

async function getServicesByProjectIds(projectIds) {
	const firestore = ensureFirebaseReady();
	const ids = Array.from(
		new Set(
			(Array.isArray(projectIds) ? projectIds : [])
				.map((id) => safeText(id))
				.filter(Boolean),
		),
	);

	if (!ids.length) return [];

	const snapshots = await Promise.all(
		chunkArray(ids, 10).map((chunk) =>
			getDocs(
				query(collection(firestore, SERVICES), where("projectId", "in", chunk)),
			),
		),
	);

	return uniqueById(
		snapshots
			.flatMap((snapshot) => snapshot.docs)
			.map((docItem) => ({ id: docItem.id, ...docItem.data() })),
	);
}

async function getProjectsByIds(projectIds) {
	const firestore = ensureFirebaseReady();
	const ids = Array.from(
		new Set(
			(Array.isArray(projectIds) ? projectIds : [])
				.map((id) => safeText(id))
				.filter(Boolean),
		),
	);

	if (!ids.length) return [];

	const snapshots = await Promise.all(
		chunkArray(ids, 10).map((chunk) =>
			getDocs(
				query(
					collection(firestore, PROJECTS),
					where(documentId(), "in", chunk),
				),
			),
		),
	);

	return uniqueById(
		snapshots
			.flatMap((snapshot) => snapshot.docs)
			.map((docItem) => ({ id: docItem.id, ...docItem.data() })),
	);
}

function buildInvoices(services, projectsById) {
	const invoices = [];

	for (const service of Array.isArray(services) ? services : []) {
		const serviceName = safeText(service?.serviceName, "Service");
		const projectName = safeText(
			projectsById?.[service?.projectId]?.projectName,
			"Project",
		);
		const paymentStatus = normalizeServicePaymentStatus(service?.paymentStatus);
		const currency = safeText(service?.currency, "EGP");
		const milestones = Array.isArray(service?.milestones)
			? service.milestones
			: [];

		if (milestones.length) {
			for (const milestone of milestones) {
				const normalizedMilestoneStatus = safeTextLower(
					milestone?.status,
					"pending",
				);
				if (!["approved", "billed"].includes(normalizedMilestoneStatus))
					continue;

				invoices.push({
					id: `${service.id}_m_${safeText(milestone?.id, milestone?.name || "milestone")}`,
					projectId: service.projectId,
					projectName,
					serviceName,
					amount: Number(milestone?.amount) || 0,
					dueDate: safeText(milestone?.dueDate || milestone?.reviewedAt),
					status: normalizedMilestoneStatus,
					currency,
					invoiceTrigger: "milestone_approved",
					milestoneName: safeText(milestone?.name, "Milestone"),
				});
			}
			continue;
		}

		if (Array.isArray(service?.installments) && service.installments.length) {
			for (const installment of service.installments) {
				invoices.push({
					id: `${service.id}_${installment?.id || Math.random()}`,
					projectId: service.projectId,
					projectName,
					serviceName,
					amount: Number(installment?.amount) || 0,
					dueDate: safeText(installment?.dueDate),
					status: safeTextLower(installment?.status, paymentStatus),
					currency,
				});
			}
			continue;
		}

		const oneTimeAmount = Number(service?.oneTimeAmount) || 0;
		const monthlyAmount = Number(service?.monthlyAmount) || 0;
		const monthsCount = Math.max(Number(service?.monthsCount) || 0, 0);
		const fallbackAmount =
			Number(service?.valueAmount) || Number(service?.revenue) || 0;
		const billedAmount =
			oneTimeAmount + monthlyAmount * monthsCount || fallbackAmount;

		if (!billedAmount) continue;

		invoices.push({
			id: `${service.id}_base`,
			projectId: service.projectId,
			projectName,
			serviceName,
			amount: billedAmount,
			dueDate: safeText(service?.paymentDate || service?.recurringEnd),
			status: paymentStatus,
			currency,
		});
	}

	return invoices.sort((left, right) =>
		safeText(right?.dueDate).localeCompare(safeText(left?.dueDate)),
	);
}

export async function getClientWorkspace(user, profile) {
	const identity = toClientMatchProfiles(user, profile);
	if (!identity.uid && !identity.email && !identity.names.length) {
		return {
			projects: [],
			servicesByProjectId: {},
			invoices: [],
			stats: {
				totalProjects: 0,
				activeProjects: 0,
				completedProjects: 0,
				averageProgress: 0,
			},
		};
	}

	let grants = [];
	if (identity.uid) {
		try {
			// Query by direct clientId (logged-in or anonymous session that scanned QR).
			// Also query by linkedClientUserId to catch grants created during an anonymous
			// session that are linked back to this real user account.
			const [directGrants, linkedGrants] = await Promise.all([
				getClientAccessGrantsByUserId(identity.uid),
				getClientAccessGrantsByLinkedUserId(identity.uid),
			]);
			const grantsById = new Map();
			for (const grant of [...directGrants, ...linkedGrants]) {
				const key = safeText(grant?.id);
				if (key) grantsById.set(key, grant);
			}
			grants = Array.from(grantsById.values());
		} catch (error) {
			if (isPermissionDeniedError(error)) {
				throw new Error(
					"Access denied while reading client access grants. Deploy latest Firestore rules for client_project_access.",
				);
			}
			throw error;
		}
	}
	grants = grants.filter((grant) => isGrantMatchIdentity(grant, identity));

	const grantedProjectIds = grants
		.map((grant) => safeText(grant?.projectId))
		.filter(Boolean);

	const isAnonymousSession = Boolean(user?.isAnonymous);
	let mappedProjects = [];
	if (!isAnonymousSession) {
		try {
			mappedProjects = await queryProjectsByClientIdentity(identity);
		} catch (error) {
			// If Firestore rules deny the identity query, fall through to the
			// grant-based path below which uses direct document reads and is
			// not affected by collection-query rule evaluation limits.
			if (!isPermissionDeniedError(error)) {
				throw error;
			}
		}
	}
	if (
		!mappedProjects.length &&
		!identity.uid &&
		!identity.email &&
		identity.names.length
	) {
		mappedProjects = await queryProjectsByClientIdentity({
			uid: "",
			email: "",
			names: identity.names,
		});
	}

	let grantedProjects = [];
	try {
		grantedProjects = await getProjectsByIds(grantedProjectIds);
	} catch (error) {
		if (isPermissionDeniedError(error)) {
			throw new Error(
				"Access denied while loading project documents. Verify Firestore projects read rules for grant-based access.",
			);
		}
		throw error;
	}

	const projects = uniqueById([...mappedProjects, ...grantedProjects]);
	const projectIds = projects.map((project) => project.id);
	let services = [];
	try {
		services = await getServicesByProjectIds(projectIds);
	} catch (error) {
		if (isPermissionDeniedError(error)) {
			throw new Error(
				"Access denied while loading project services. Verify Firestore services read rules for grant-based access.",
			);
		}
		throw error;
	}
	const servicesByProjectId = services.reduce((acc, service) => {
		const key = safeText(service?.projectId);
		if (!key) return acc;
		if (!acc[key]) acc[key] = [];
		acc[key].push(service);
		return acc;
	}, {});

	const enrichedProjects = projects
		.map((project) => {
			const projectServices = servicesByProjectId[project.id] || [];
			return {
				...project,
				progress: computeProjectProgress(project, projectServices),
				servicesCount: projectServices.length,
				openServicesCount: projectServices.filter((service) => {
					const status = normalizeServicePaymentStatus(service?.paymentStatus);
					return (
						status !== "completed" && status !== "paid" && status !== "free"
					);
				}).length,
			};
		})
		.sort((left, right) =>
			safeText(right?.updatedAt || right?.createdAt).localeCompare(
				safeText(left?.updatedAt || left?.createdAt),
			),
		);

	const projectsById = enrichedProjects.reduce((acc, project) => {
		acc[project.id] = project;
		return acc;
	}, {});
	const invoices = buildInvoices(services, projectsById);
	const completedProjects = enrichedProjects.filter(
		(project) => normalizeProjectStatusProgress(project?.status) >= 100,
	).length;
	const activeProjects = enrichedProjects.filter(
		(project) => normalizeProjectStatusProgress(project?.status) > 0,
	).length;
	const totalProgress = enrichedProjects.reduce(
		(acc, project) => acc + (Number(project?.progress) || 0),
		0,
	);
	const averageProgress = enrichedProjects.length
		? Math.round(totalProgress / enrichedProjects.length)
		: 0;

	return {
		projects: enrichedProjects,
		servicesByProjectId,
		invoices,
		stats: {
			totalProjects: enrichedProjects.length,
			activeProjects,
			completedProjects,
			averageProgress,
		},
	};
}

export async function createClientTicket(payload) {
	const firestore = ensureFirebaseReady();
	const clientId = safeText(payload?.clientId);
	const subject = safeText(payload?.subject);
	const details = safeText(payload?.details);

	if (!clientId) throw new Error("Client id is required.");
	if (!subject) throw new Error("Subject is required.");
	if (!details) throw new Error("Details are required.");

	const now = new Date().toISOString();
	const workflow = normalizeTicketWorkflowPayload({
		...payload,
		createdAt: now,
	});
	const data = {
		clientId,
		clientEmail: safeTextLower(payload?.clientEmail),
		clientName: safeText(payload?.clientName, "Client"),
		subject,
		details,
		priority: safeTextLower(payload?.priority, "normal"),
		status: "open",
		requestType: workflow.requestType,
		workflowStatus: workflow.workflowStatus,
		projectId: workflow.projectId,
		serviceId: workflow.serviceId,
		milestoneId: workflow.milestoneId,
		deliverableId: workflow.deliverableId,
		scopeChangeId: workflow.scopeChangeId,
		ownerUserId: workflow.ownerUserId,
		ownerName: workflow.ownerName,
		ownerEmail: workflow.ownerEmail,
		slaTargetHours: workflow.slaTargetHours,
		slaDueAt: workflow.slaDueAt,
		stateHistory: [
			createWorkflowAuditEntry({
				action: "ticket_created",
				note: `Client request created (${workflow.requestType}).`,
				actorId: clientId,
				actorName: safeText(payload?.clientName, "Client"),
				metadata: {
					workflowStatus: workflow.workflowStatus,
					priority: safeTextLower(payload?.priority, "normal"),
					sourcePortal: safeText(payload?.sourcePortal, "client"),
					reason: safeText(payload?.reason, "ticket_created"),
					changedFields: ["status", "workflowStatus"],
				},
			}),
		],
		createdAt: now,
		updatedAt: now,
	};

	const ref = await addDoc(collection(firestore, CLIENT_TICKETS), data);
	refreshAgencyOverviewSummary().catch(() => {});
	return { id: ref.id, ...data };
}

export function subscribeClientTickets(clientId, onData, onError) {
	const firestore = ensureFirebaseReady();
	const safeClientId = safeText(clientId);
	if (!safeClientId) {
		onData([]);
		return () => {};
	}

	return onSnapshot(
		query(
			collection(firestore, CLIENT_TICKETS),
			where("clientId", "==", safeClientId),
		),
		(snapshot) => {
			const rows = snapshot.docs
				.map((item) => ({ id: item.id, ...item.data() }))
				.sort((left, right) =>
					safeText(right?.createdAt).localeCompare(safeText(left?.createdAt)),
				);
			onData(rows);
		},
		onError,
	);
}

export function subscribeAllClientTickets(onData, onError) {
	const firestore = ensureFirebaseReady();

	return onSnapshot(
		collection(firestore, CLIENT_TICKETS),
		(snapshot) => {
			const rows = snapshot.docs
				.map((item) => ({ id: item.id, ...item.data() }))
				.sort((left, right) =>
					safeText(right?.createdAt).localeCompare(safeText(left?.createdAt)),
				);
			onData(rows);
		},
		onError,
	);
}

export async function updateClientTicketStatus(ticketId, status, options = {}) {
	const firestore = ensureFirebaseReady();
	const safeId = safeText(ticketId);
	if (!safeId) throw new Error("Ticket id is required.");
	const validStatuses = ["open", "resolved", "closed"];
	const safeStatus = validStatuses.includes(status) ? status : "open";
	const actorId = safeText(options?.actorId);
	const actorName = safeText(options?.actorName, "System");
	const reason = safeText(options?.reason);
	const sourcePortal = safeText(options?.sourcePortal, "admin");

	const ref = doc(firestore, CLIENT_TICKETS, safeId);
	const snapshot = await getDoc(ref);
	if (!snapshot.exists()) throw new Error("Ticket not found.");
	const current = snapshot.data() || {};
	const fromWorkflowStatus = safeTextLower(current?.workflowStatus, "intake");
	const nextWorkflowStatus = mapTicketStatusToWorkflowStatus(safeStatus);

	if (!canTransitionTicketWorkflow(fromWorkflowStatus, nextWorkflowStatus)) {
		throw new Error(
			`Invalid ticket workflow transition: ${fromWorkflowStatus} -> ${nextWorkflowStatus}`,
		);
	}

	const updatePayload = {
		status: safeStatus,
		workflowStatus: nextWorkflowStatus,
		updatedAt: new Date().toISOString(),
	};

	if (actorId) {
		updatePayload.stateHistory = arrayUnion(
			createWorkflowAuditEntry({
				action: "status_updated",
				note: reason || `Ticket marked ${safeStatus}.`,
				actorId,
				actorName,
				metadata: {
					fromStatus: safeTextLower(current?.status, "open"),
					status: safeStatus,
					fromWorkflowStatus,
					workflowStatus: nextWorkflowStatus,
					reason,
					sourcePortal,
					changedFields: ["status", "workflowStatus"],
				},
			}),
		);
	}

	await updateDoc(ref, updatePayload);
	refreshAgencyOverviewSummary().catch(() => {});
	emitWorkflowEvent({
		eventType: "ticket_status_changed",
		portal: sourcePortal,
		message: `Ticket status changed to ${safeStatus}`,
		description: safeText(current?.subject, "Client ticket"),
		metadata: {
			ticketId: safeId,
			fromStatus: safeTextLower(current?.status, "open"),
			toStatus: safeStatus,
			fromWorkflowStatus,
			toWorkflowStatus: nextWorkflowStatus,
			reason,
		},
	}).catch(() => {});
}

export async function updateClientTicketOwnership(ticketId, owner, actor = {}) {
	const firestore = ensureFirebaseReady();
	const safeId = safeText(ticketId);
	if (!safeId) throw new Error("Ticket id is required.");

	const normalizedOwner = normalizeTicketOwner(owner);

	const ref = doc(firestore, CLIENT_TICKETS, safeId);
	const snapshot = await getDoc(ref);
	if (!snapshot.exists()) throw new Error("Ticket not found.");
	const current = snapshot.data() || {};
	const sourcePortal = safeText(actor?.sourcePortal, "admin");

	await updateDoc(ref, {
		ownerUserId: normalizedOwner.ownerUserId,
		ownerName: normalizedOwner.ownerName,
		ownerEmail: normalizedOwner.ownerEmail,
		ownerAssignedAt: normalizedOwner.ownerAssignedAt,
		updatedAt: new Date().toISOString(),
		stateHistory: arrayUnion(
			createWorkflowAuditEntry({
				action: "owner_assigned",
				note: normalizedOwner.ownerUserId
					? `Owner assigned to ${normalizedOwner.ownerName}.`
					: "Owner cleared.",
				actorId: safeText(actor?.id || actor?.uid),
				actorName: safeText(actor?.name || actor?.displayName, "System"),
				metadata: {
					previousOwnerUserId: safeText(current?.ownerUserId),
					previousOwnerName: safeText(current?.ownerName),
					ownerUserId: normalizedOwner.ownerUserId,
					ownerEmail: normalizedOwner.ownerEmail,
					sourcePortal,
					changedFields: [
						"ownerUserId",
						"ownerName",
						"ownerEmail",
						"ownerAssignedAt",
					],
				},
			}),
		),
	});
	refreshAgencyOverviewSummary().catch(() => {});
	emitWorkflowEvent({
		eventType: "ticket_owner_changed",
		portal: sourcePortal,
		message: `Ticket owner updated to ${normalizedOwner.ownerName}`,
		description: safeText(current?.subject, "Client ticket"),
		metadata: {
			ticketId: safeId,
			previousOwnerUserId: safeText(current?.ownerUserId),
			nextOwnerUserId: normalizedOwner.ownerUserId,
		},
	}).catch(() => {});
}

export function getClientHealthLabel(progress) {
	const value = Number(progress) || 0;
	if (value >= 90) return "Delivered";
	if (value >= 70) return "On Track";
	if (value >= 40) return "In Progress";
	return "Starting";
}

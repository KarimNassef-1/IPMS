import {
	canTransitionProjectLifecycle,
	createApprovalObject,
	createEscalationObject,
	createHandoffObject,
	createMilestoneObject,
	normalizeProjectLifecycleStage,
	normalizeTicketOwner,
	resolveProjectLifecycleStage,
} from "../domain/workflow/canonicalWorkflow";

function safeText(value, fallback = "") {
	const text = String(value || "").trim();
	return text || fallback;
}

function safeTextLower(value, fallback = "") {
	return safeText(value, fallback).toLowerCase();
}

function toIsoDate(value) {
	const date = value ? new Date(value) : new Date();
	if (Number.isNaN(date.getTime())) return new Date().toISOString();
	return date.toISOString();
}

const TICKET_WORKFLOW_TRANSITIONS = {
	intake: ["setup", "active_execution", "closure"],
	setup: ["active_execution", "closure"],
	active_execution: ["review", "closure"],
	review: ["active_execution", "client_approval", "closure"],
	client_approval: ["billing", "closure", "review"],
	billing: ["closure"],
	closure: ["archive"],
	archive: [],
};

const PROJECT_STAGE_BY_STATUS = {
	lead: "intake",
	negotiation: "setup",
	"in progress": "active_execution",
	"waiting for client": "review",
	delivered: "client_approval",
	paid: "billing",
	completed: "closure",
	archived: "archive",
	cancelled: "closure",
};

export function resolveLegacyProjectLifecycleStage(status) {
	const normalized = safeTextLower(status);
	return PROJECT_STAGE_BY_STATUS[normalized] || "active_execution";
}

export function deriveProjectLifecycleFromPayload(payload = {}) {
	const previousLifecycle =
		payload?.lifecycle && typeof payload.lifecycle === "object"
			? payload.lifecycle
			: {};
	const stage = normalizeProjectLifecycleStage(
		safeTextLower(previousLifecycle?.stage) ||
			resolveProjectLifecycleStage(payload?.status),
		payload?.status,
	);
	const now = new Date().toISOString();
	const history = Array.isArray(previousLifecycle?.history)
		? previousLifecycle.history
		: [];

	return {
		stage,
		ownerUserId: safeText(
			previousLifecycle?.ownerUserId,
			safeText(payload?.assignedUserIds?.[0]),
		),
		ownerName: safeText(
			previousLifecycle?.ownerName,
			safeText(payload?.assignedUserNames?.[0], "Unassigned"),
		),
		ownerEmail: safeTextLower(previousLifecycle?.ownerEmail),
		approval: createApprovalObject(previousLifecycle?.approval),
		handoff: {
			...createHandoffObject(previousLifecycle?.handoff),
			archived: Boolean(previousLifecycle?.handoff?.archived),
			archivedAt: safeText(previousLifecycle?.handoff?.archivedAt),
			archiveRef: safeText(previousLifecycle?.handoff?.archiveRef),
		},
		escalation: createEscalationObject(previousLifecycle?.escalation),
		milestones: Array.isArray(previousLifecycle?.milestones)
			? previousLifecycle.milestones.map((item, index) =>
					createMilestoneObject(item, index),
				)
			: [],
		closeout: {
			checklistCompleted: Boolean(
				previousLifecycle?.closeout?.checklistCompleted,
			),
			acceptanceConfirmed: Boolean(
				previousLifecycle?.closeout?.acceptanceConfirmed,
			),
			handoffPackAttached: Boolean(
				previousLifecycle?.closeout?.handoffPackAttached,
			),
			successReviewLogged: Boolean(
				previousLifecycle?.closeout?.successReviewLogged,
			),
			closedAt: safeText(previousLifecycle?.closeout?.closedAt),
		},
		postDelivery: {
			state: safeTextLower(
				previousLifecycle?.postDelivery?.state,
				stage === "closed" ? "success" : "monitoring",
			),
			reviewedAt: safeText(previousLifecycle?.postDelivery?.reviewedAt),
			notes: safeText(previousLifecycle?.postDelivery?.notes),
		},
		history,
		strictLifecycleEnabled: true,
		updatedAt: now,
		createdAt: safeText(previousLifecycle?.createdAt, now),
	};
}

export function applyProjectLifecycleTransition(payload = {}, options = {}) {
	const actorId = safeText(options?.actorId);
	const actorName = safeText(options?.actorName, "System");
	const reason = safeText(options?.reason);
	const sourcePortal = safeText(options?.sourcePortal, "admin");
	const currentLifecycle = deriveProjectLifecycleFromPayload(payload);
	const nextStage = normalizeProjectLifecycleStage(
		options?.nextStage,
		payload?.status,
	);

	if (!canTransitionProjectLifecycle(currentLifecycle.stage, nextStage)) {
		throw new Error(
			`Invalid lifecycle transition: ${currentLifecycle.stage} -> ${nextStage}`,
		);
	}

	const auditEntry = createWorkflowAuditEntry({
		actorId,
		actorName,
		action: "project_lifecycle_transition",
		note:
			reason ||
			`Lifecycle moved from ${currentLifecycle.stage} to ${nextStage}.`,
		metadata: {
			fromStage: currentLifecycle.stage,
			toStage: nextStage,
			sourcePortal,
			reason,
			changedFields: ["lifecycle.stage"],
		},
	});

	return {
		...currentLifecycle,
		stage: nextStage,
		updatedAt: new Date().toISOString(),
		history: [
			...(Array.isArray(currentLifecycle.history)
				? currentLifecycle.history
				: []),
			auditEntry,
		],
	};
}

export function deriveSlaHours(priority) {
	const normalized = safeTextLower(priority, "normal");
	if (normalized === "urgent") return 4;
	if (normalized === "high") return 12;
	if (normalized === "low") return 48;
	return 24;
}

export function buildSlaDueAt(priority, createdAt) {
	const baseDate = new Date(createdAt || Date.now());
	const safeBase = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;
	safeBase.setHours(safeBase.getHours() + deriveSlaHours(priority));
	return safeBase.toISOString();
}

export function normalizeTicketWorkflowPayload(payload = {}) {
	const now = new Date().toISOString();
	const createdAt = toIsoDate(payload?.createdAt || now);
	const priority = safeTextLower(payload?.priority, "normal");
	const workflowStatus = safeTextLower(payload?.workflowStatus, "intake");
	const owner = normalizeTicketOwner(payload);

	return {
		requestType: safeTextLower(payload?.requestType, "support"),
		workflowStatus,
		projectId: safeText(payload?.projectId),
		serviceId: safeText(payload?.serviceId),
		milestoneId: safeText(payload?.milestoneId),
		deliverableId: safeText(payload?.deliverableId),
		scopeChangeId: safeText(payload?.scopeChangeId),
		ownerUserId: owner.ownerUserId,
		ownerName: owner.ownerName,
		ownerEmail: owner.ownerEmail,
		ownerAssignedAt: owner.ownerAssignedAt,
		slaTargetHours: Math.max(
			Number(payload?.slaTargetHours) || deriveSlaHours(priority),
			1,
		),
		slaDueAt: safeText(payload?.slaDueAt, buildSlaDueAt(priority, createdAt)),
		stateHistory: Array.isArray(payload?.stateHistory)
			? payload.stateHistory
			: [],
	};
}

export function mapTicketStatusToWorkflowStatus(status) {
	const normalized = safeTextLower(status, "open");
	if (normalized === "resolved") return "review";
	if (normalized === "closed") return "closure";
	return "intake";
}

export function canTransitionTicketWorkflow(fromStatus, toStatus) {
	const from = safeTextLower(fromStatus, "intake");
	const to = safeTextLower(toStatus, "intake");
	if (from === to) return true;
	const allowed = TICKET_WORKFLOW_TRANSITIONS[from] || [];
	return allowed.includes(to);
}

export function createWorkflowAuditEntry({
	actorId,
	actorName,
	action,
	note,
	metadata = {},
}) {
	return {
		id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
		actorId: safeText(actorId),
		actorName: safeText(actorName, "System"),
		action: safeText(action, "updated"),
		note: safeText(note),
		metadata: {
			sourcePortal: safeText(metadata?.sourcePortal, "system"),
			reason: safeText(metadata?.reason),
			changedFields: Array.isArray(metadata?.changedFields)
				? metadata.changedFields
				: [],
			...metadata,
		},
		createdAt: new Date().toISOString(),
	};
}

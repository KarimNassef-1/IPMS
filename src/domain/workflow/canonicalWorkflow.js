function safeText(value, fallback = "") {
	const text = String(value || "").trim();
	return text || fallback;
}

function safeTextLower(value, fallback = "") {
	return safeText(value, fallback).toLowerCase();
}

export const PROJECT_LIFECYCLE_STAGES = [
	"intake",
	"setup",
	"active_execution",
	"review",
	"client_approval",
	"billing",
	"closure",
	"archive",
];

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

const PROJECT_LIFECYCLE_TRANSITIONS = {
	intake: ["setup", "closure"],
	setup: ["active_execution", "closure"],
	active_execution: ["review", "closure"],
	review: ["active_execution", "client_approval", "closure"],
	client_approval: ["review", "billing", "closure"],
	billing: ["closure"],
	closure: ["archive"],
	archive: [],
};

export const WORKFLOW_NOTIFICATION_TRIGGERS = {
	project_lifecycle_transition: "admin_feed",
	milestone_approved: "admin_feed",
	ticket_status_changed: "admin_feed",
	ticket_owner_changed: "admin_feed",
	outsource_task_status_changed: "admin_feed",
	outsource_task_escalated: "admin_feed",
};

export function resolveProjectLifecycleStage(status) {
	const normalized = safeTextLower(status);
	return PROJECT_STAGE_BY_STATUS[normalized] || "active_execution";
}

export function normalizeProjectLifecycleStage(stage, fallbackStatus = "") {
	const normalized = safeTextLower(stage);
	if (PROJECT_LIFECYCLE_STAGES.includes(normalized)) return normalized;
	return resolveProjectLifecycleStage(fallbackStatus);
}

export function canTransitionProjectLifecycle(fromStage, toStage) {
	const from = normalizeProjectLifecycleStage(fromStage);
	const to = normalizeProjectLifecycleStage(toStage);
	if (from === to) return true;
	const allowed = PROJECT_LIFECYCLE_TRANSITIONS[from] || [];
	return allowed.includes(to);
}

export function normalizeTicketOwner(owner = {}) {
	return {
		ownerUserId: safeText(owner?.ownerUserId || owner?.id || owner?.userId),
		ownerName: safeText(
			owner?.ownerName || owner?.name || owner?.displayName,
			"Unassigned",
		),
		ownerEmail: safeTextLower(owner?.ownerEmail || owner?.email),
		ownerAssignedAt: safeText(owner?.ownerAssignedAt, new Date().toISOString()),
	};
}

export function createApprovalObject(payload = {}) {
	return {
		state: ["pending", "approved", "rejected"].includes(
			safeTextLower(payload?.state),
		)
			? safeTextLower(payload?.state)
			: "pending",
		reviewerId: safeText(payload?.reviewerId),
		reviewerName: safeText(payload?.reviewerName),
		reviewedAt: safeText(payload?.reviewedAt),
		rejectionReason: safeText(payload?.rejectionReason),
		sourcePortal: safeText(payload?.sourcePortal, "system"),
	};
}

export function createHandoffObject(payload = {}) {
	return {
		state: safeTextLower(payload?.state, "pending"),
		handoffById: safeText(payload?.handoffById),
		handoffByName: safeText(payload?.handoffByName),
		handoffAt: safeText(payload?.handoffAt),
		notes: safeText(payload?.notes),
		portal: safeText(payload?.portal, "system"),
	};
}

export function createEscalationObject(payload = {}) {
	return {
		level: Math.max(Number(payload?.level) || 0, 0),
		reason: safeText(payload?.reason),
		escalatedById: safeText(payload?.escalatedById),
		escalatedByName: safeText(payload?.escalatedByName),
		escalatedAt: safeText(payload?.escalatedAt),
		portal: safeText(payload?.portal, "system"),
	};
}

export function createMilestoneObject(payload = {}, index = 0) {
	return {
		id: safeText(payload?.id, `m${index + 1}`),
		name: safeText(payload?.name, `Milestone ${index + 1}`),
		dueDate: safeText(payload?.dueDate),
		amount: Math.max(Number(payload?.amount) || 0, 0),
		status: ["pending", "submitted", "approved", "billed", "rejected"].includes(
			safeTextLower(payload?.status),
		)
			? safeTextLower(payload?.status)
			: "pending",
		approval: createApprovalObject(payload?.approval || payload),
		handoff: createHandoffObject(payload?.handoff),
		escalation: createEscalationObject(payload?.escalation),
		invoiceTriggeredAt: safeText(payload?.invoiceTriggeredAt),
		invoiceState: safeTextLower(
			payload?.invoiceState,
			safeTextLower(payload?.status) === "billed" ? "ready" : "pending",
		),
	};
}

export function resolveWorkflowNotificationTrigger(eventType) {
	const normalized = safeTextLower(eventType);
	return WORKFLOW_NOTIFICATION_TRIGGERS[normalized] || "admin_feed";
}

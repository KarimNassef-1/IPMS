import { createNotification } from "./notificationService";
import { resolveWorkflowNotificationTrigger } from "../domain/workflow/canonicalWorkflow";

function safeText(value, fallback = "") {
	const text = String(value || "").trim();
	return text || fallback;
}

function buildActorPayload(user, profile, fallbackName = "User") {
	return {
		actorId: safeText(user?.uid),
		actorName:
			safeText(profile?.name) ||
			safeText(user?.displayName) ||
			safeText(user?.email) ||
			fallbackName,
		actorEmail: safeText(user?.email).toLowerCase(),
		actorPhotoURL: safeText(profile?.photoURL) || safeText(user?.photoURL),
	};
}

export async function publishAdminFeedEvent({
	user,
	profile,
	userId,
	type,
	action,
	message,
	description,
	extra = {},
}) {
	const actor = buildActorPayload(user, profile);
	return createNotification({
		userId: safeText(userId) || actor.actorId,
		type,
		action,
		message,
		description: safeText(description),
		...actor,
		date: new Date().toISOString(),
		status: "unread",
		adminFeed: true,
		...extra,
	});
}

export async function publishUserNotification({
	userId,
	type = "system",
	action = "notify",
	message,
	description,
	adminFeed = false,
	extra = {},
}) {
	return createNotification({
		userId: safeText(userId),
		type,
		action,
		message,
		description: safeText(description),
		date: new Date().toISOString(),
		status: "unread",
		adminFeed,
		...extra,
	});
}

export async function publishLoginEvent({
	user,
	profile,
	loggedInAt = new Date().toISOString(),
}) {
	const actor = buildActorPayload(user, profile);
	return createNotification({
		userId: actor.actorId,
		type: "login",
		action: "login",
		message: `${actor.actorName} logged in`,
		...actor,
		loggedInAt,
		date: loggedInAt,
		status: "unread",
		adminFeed: true,
	});
}

export async function publishSecurityEvent({
	user,
	profile,
	action,
	message,
	description,
	extra = {},
}) {
	return publishAdminFeedEvent({
		user,
		profile,
		type: "security",
		action,
		message,
		description,
		extra,
	});
}

export async function emitWorkflowEvent({
	eventType,
	user,
	profile,
	targetUserId,
	message,
	description,
	portal = "system",
	metadata = {},
}) {
	const trigger = resolveWorkflowNotificationTrigger(eventType);
	const payload = {
		workflowEventType: String(eventType || "").trim(),
		sourcePortal: String(portal || "system").trim(),
		...metadata,
	};

	if (trigger === "admin_feed") {
		return publishAdminFeedEvent({
			user,
			profile,
			userId: targetUserId,
			type: "workflow",
			action: String(eventType || "workflow_event").trim(),
			message,
			description,
			extra: payload,
		});
	}

	return publishUserNotification({
		userId: targetUserId,
		type: "workflow",
		action: String(eventType || "workflow_event").trim(),
		message,
		description,
		adminFeed: false,
		extra: payload,
	});
}

export async function emitProjectLifecycleTransitionEvent({
	user,
	profile,
	projectName,
	fromStage,
	toStage,
	portal = "admin",
	metadata = {},
}) {
	return emitWorkflowEvent({
		eventType: "project_lifecycle_transition",
		user,
		profile,
		portal,
		message: `Project lifecycle moved to ${toStage}`,
		description: `${projectName || "Project"} transitioned ${fromStage} -> ${toStage}`,
		metadata,
	});
}

export async function emitTicketOwnerChangedEvent({
	user,
	profile,
	ownerName,
	ticketSubject,
	portal = "client",
	metadata = {},
}) {
	return emitWorkflowEvent({
		eventType: "ticket_owner_changed",
		user,
		profile,
		portal,
		message: `Ticket owner updated to ${ownerName || "Unassigned"}`,
		description: ticketSubject || "Client ticket ownership updated",
		metadata,
	});
}

export async function emitTicketStatusChangedEvent({
	user,
	profile,
	status,
	ticketSubject,
	portal = "client",
	metadata = {},
}) {
	return emitWorkflowEvent({
		eventType: "ticket_status_changed",
		user,
		profile,
		portal,
		message: `Ticket status changed to ${status}`,
		description: ticketSubject || "Client ticket updated",
		metadata,
	});
}

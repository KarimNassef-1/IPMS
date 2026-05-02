export function makeId(prefix) {
	return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getAllTasks(phases) {
	return (Array.isArray(phases) ? phases : []).flatMap((phase) =>
		Array.isArray(phase?.tasks) ? phase.tasks : [],
	);
}

export function getTaskStatus(task) {
	// backward compat: old data uses completed boolean
	if (task?.status) return task.status;
	if (task?.completed === true) return "completed";
	return "not_started";
}

export function isTaskBlocked(task) {
	return getTaskStatus(task) === "blocked";
}

export function isTaskInReview(task) {
	return getTaskStatus(task) === "needs_review";
}

export function isTaskDone(task) {
	return getTaskStatus(task) === "completed";
}

export function getCompletion(phases) {
	const tasks = getAllTasks(phases);
	if (!tasks.length) return 0;
	const completed = tasks.filter((task) => isTaskDone(task)).length;
	return Math.round((completed / tasks.length) * 100);
}

export function getPhaseCompletion(phase) {
	const tasks = Array.isArray(phase?.tasks) ? phase.tasks : [];
	if (!tasks.length) return 0;
	const completed = tasks.filter((task) => isTaskDone(task)).length;
	return Math.round((completed / tasks.length) * 100);
}

export function normalizePhaseOrder(phases) {
	return (Array.isArray(phases) ? phases : []).map((phase, index) => ({
		...phase,
		order: index + 1,
	}));
}

export function getPhaseStartDate(phase) {
	return String(phase?.startDate || "").trim();
}

export function getPhaseEndDate(phase) {
	return String(phase?.endDate || phase?.deadline || "").trim();
}

export function parseDate(value) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(dateValue) {
	const value = String(dateValue || "").trim();
	if (!value) return "Not set";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Not set";
	return date.toLocaleDateString();
}

export function timelineStatus(startDate, endDate) {
	const start = parseDate(startDate);
	const end = parseDate(endDate);
	const now = new Date();

	if (!start || !end) {
		return { label: "Timeline not set", tone: "text-slate-500" };
	}

	const daysLeft = Math.ceil(
		(end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
	);

	if (daysLeft < 0) {
		return {
			label: `Overdue by ${Math.abs(daysLeft)} day(s)`,
			tone: "text-rose-600",
		};
	}

	if (now < start) {
		return { label: "Not started yet", tone: "text-amber-600" };
	}

	if (daysLeft <= 7) {
		return { label: `${daysLeft} day(s) left`, tone: "text-amber-600" };
	}

	return { label: `${daysLeft} day(s) left`, tone: "text-emerald-600" };
}

export function getStatusConfig(status) {
	switch (status) {
		case "blocked":
			return {
				label: "Blocked",
				badge: "bg-rose-100 text-rose-700",
				ring: "border-rose-300",
			};
		case "in_progress":
			return {
				label: "In Progress",
				badge: "bg-sky-100 text-sky-700",
				ring: "border-sky-300",
			};
		case "needs_review":
			return {
				label: "Needs Review",
				badge: "bg-amber-100 text-amber-800",
				ring: "border-amber-300",
			};
		case "completed":
			return {
				label: "Completed",
				badge: "bg-emerald-100 text-emerald-700",
				ring: "border-emerald-300",
			};
		default:
			return {
				label: "Not Started",
				badge: "bg-slate-100 text-slate-600",
				ring: "border-slate-300",
			};
	}
}

export function nextTaskStatus(current) {
	if (current === "not_started") return "in_progress";
	if (current === "in_progress") return "needs_review";
	if (current === "needs_review") return "completed";
	if (current === "blocked") return "in_progress";
	return "not_started";
}

export function getTaskDeadlineStatus(deadline, task) {
	if (isTaskDone(task)) return { badge: null, tone: null };
	const date = parseDate(deadline);
	if (!date) return { badge: null, tone: null };

	const now = new Date();
	const daysLeft = Math.ceil(
		(date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
	);

	if (daysLeft < 0) {
		return {
			badge: `${Math.abs(daysLeft)}d overdue`,
			tone: "text-rose-600 bg-rose-50",
		};
	}
	if (daysLeft === 0) {
		return { badge: "Due today", tone: "text-amber-700 bg-amber-50" };
	}
	if (daysLeft <= 3) {
		return { badge: `${daysLeft}d left`, tone: "text-amber-600 bg-amber-50" };
	}
	return { badge: null, tone: null };
}

export function getPriorityBadgeClass(priority) {
	switch (String(priority || "").toLowerCase()) {
		case "high":
			return "bg-rose-100 text-rose-700";
		case "medium":
			return "bg-amber-100 text-amber-700";
		case "low":
			return "bg-emerald-100 text-emerald-700";
		default:
			return "bg-slate-100 text-slate-600";
	}
}

export function getPriorityLabel(priority) {
	const p = String(priority || "").toLowerCase();
	return p === "high" || p === "medium" || p === "low"
		? p.charAt(0).toUpperCase() + p.slice(1)
		: "None";
}

export function getAssignedUserIds(portal) {
	const fromArray = Array.isArray(portal?.assignedUserIds)
		? portal.assignedUserIds
				.map((item) => String(item || "").trim())
				.filter(Boolean)
		: [];
	const fromLegacy = String(portal?.assignedUserId || "").trim();
	if (fromArray.length) return [...new Set(fromArray)];
	return fromLegacy ? [fromLegacy] : [];
}

export function getAssignedUserNames(portal) {
	const fromArray = Array.isArray(portal?.assignedUserNames)
		? portal.assignedUserNames
				.map((item) => String(item || "").trim())
				.filter(Boolean)
		: [];
	const fromLegacy = String(portal?.assignedUserName || "").trim();
	if (fromArray.length) return fromArray;
	return fromLegacy ? [fromLegacy] : [];
}

export function getAssignedUserEmails(portal) {
	const fromArray = Array.isArray(portal?.assignedUserEmails)
		? portal.assignedUserEmails
				.map((item) =>
					String(item || "")
						.trim()
						.toLowerCase(),
				)
				.filter(Boolean)
		: [];
	if (fromArray.length) return [...new Set(fromArray)];

	const fromLegacy = String(portal?.assignedUserEmail || "")
		.trim()
		.toLowerCase();
	return fromLegacy ? [fromLegacy] : [];
}

export function buildPortalPayload(portal, overrides = {}) {
	const nextPortal = {
		...portal,
		...overrides,
	};
	const assignedUserIds = getAssignedUserIds(nextPortal);
	const assignedUserNamesRaw = getAssignedUserNames(nextPortal);
	const assignedUserEmailsRaw = getAssignedUserEmails(nextPortal);
	const assignedUserNames = assignedUserIds.map(
		(_, index) => assignedUserNamesRaw[index] || "Outsource User",
	);
	const assignedUserEmails = assignedUserIds.map(
		(_, index) => assignedUserEmailsRaw[index] || "",
	);

	return {
		assignedUserId: assignedUserIds[0] || "",
		assignedUserName: assignedUserNames[0] || "",
		assignedUserEmail: assignedUserEmails[0] || "",
		assignedUserIds,
		assignedUserNames,
		assignedUserEmails,
		projectId: String(overrides.projectId ?? portal.projectId ?? "").trim(),
		projectName: String(
			overrides.projectName ?? portal.projectName ?? "",
		).trim(),
		serviceId: String(overrides.serviceId ?? portal.serviceId ?? "").trim(),
		serviceName: String(
			overrides.serviceName ?? portal.serviceName ?? "",
		).trim(),
		serviceCategory: String(
			overrides.serviceCategory ?? portal.serviceCategory ?? "",
		).trim(),
		timelineStart: String(
			overrides.timelineStart ?? portal.timelineStart ?? "",
		).trim(),
		timelineEnd: String(
			overrides.timelineEnd ?? portal.timelineEnd ?? "",
		).trim(),
		notes: String(overrides.notes ?? portal.notes ?? "").trim(),
		phases: Array.isArray(overrides.phases)
			? overrides.phases
			: Array.isArray(portal.phases)
				? portal.phases
				: [],
	};
}

export function getPortalViews(isSupervisor) {
	return isSupervisor
		? [
				{ id: "assignments", label: "Ops Queue" },
				{ id: "timelines", label: "Timeline" },
				{ id: "delivery", label: "Execution" },
				{ id: "gantt", label: "Gantt View" },
			]
		: [
				{ id: "summary", label: "My Queue" },
				{ id: "milestones", label: "Milestones" },
				{ id: "tasks", label: "Task Board" },
				{ id: "gantt", label: "Timeline" },
				{ id: "updates", label: "Handoffs" },
			];
}

export function buildWorkspaceSummary(sortedPortals) {
	const totalTasks = sortedPortals.reduce(
		(sum, portal) => sum + getAllTasks(portal.phases).length,
		0,
	);
	const completedTasks = sortedPortals.reduce(
		(sum, portal) =>
			sum +
			getAllTasks(portal.phases).filter((task) => isTaskDone(task)).length,
		0,
	);
	const blockedTasks = sortedPortals.reduce(
		(sum, portal) =>
			sum +
			getAllTasks(portal.phases).filter((task) => isTaskBlocked(task)).length,
		0,
	);
	const inReviewTasks = sortedPortals.reduce(
		(sum, portal) =>
			sum +
			getAllTasks(portal.phases).filter((task) => isTaskInReview(task)).length,
		0,
	);
	const openTasks = totalTasks - completedTasks;
	const dueSoonAssignments = sortedPortals.filter((portal) => {
		const end = parseDate(portal.timelineEnd);
		if (!end) return false;
		const daysLeft = Math.ceil((end.getTime() - Date.now()) / 86400000);
		return daysLeft >= 0 && daysLeft <= 7;
	}).length;
	const averageCompletion = sortedPortals.length
		? Math.round(
				sortedPortals.reduce(
					(sum, portal) => sum + getCompletion(portal.phases),
					0,
				) / sortedPortals.length,
			)
		: 0;

	return {
		assignments: sortedPortals.length,
		totalTasks,
		openTasks,
		blockedTasks,
		inReviewTasks,
		dueSoonAssignments,
		averageCompletion,
	};
}

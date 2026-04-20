export const PROJECT_STATUSES = [
	"Lead",
	"Negotiation",
	"In Progress",
	"Waiting for Client",
	"Delivered",
	"Completed",
	"Paid",
	"Cancelled",
];

export const PROJECT_TYPES = ["One-time", "Monthly"];

export const SERVICE_CATEGORIES = [
	"Website Development",
	"System Development",
	"System& Backend Integration",
	"Graphic Design",
	"AI Automation",
	"App Development",
	"AI Photoshoot",
];

export const WEBSITE_DEVELOPMENT_TRACKS = [
	"Custom Development",
	"WordPress",
	"Shopify",
	"Webflow",
];

export const TASK_PRIORITIES = ["Low", "Medium", "High", "Urgent"];

export const TASK_STATUSES = [
	"Pending",
	"In Progress",
	"Completed",
	"Cancelled",
];

export const EXPENSE_CATEGORIES = [
	"Marketing",
	"Equipment",
	"Software",
	"Operations",
	"Investment",
	"Other",
];

export const ASSIGNEES = ["Karim", "Youssef"];

export const APP_ROLES = [
	"admin",
	"partner",
	"manager",
	"finance",
	"delivery",
	"viewer",
];

export const APP_PERMISSION_KEYS = [
	"dashboard",
	"projects",
	"tasks",
	"dailyTasks",
	"financials",
	"expenses",
	"budgets",
	"analytics",
	"profile",
	"teamUsers",
];

export const DEFAULT_ROLE_PERMISSIONS = {
	admin: APP_PERMISSION_KEYS,
	partner: [
		"dashboard",
		"projects",
		"tasks",
		"dailyTasks",
		"financials",
		"expenses",
		"budgets",
		"analytics",
		"profile",
	],
	manager: [
		"dashboard",
		"projects",
		"tasks",
		"dailyTasks",
		"financials",
		"analytics",
		"profile",
	],
	finance: [
		"dashboard",
		"financials",
		"expenses",
		"budgets",
		"analytics",
		"profile",
	],
	delivery: ["dashboard", "projects", "tasks", "dailyTasks", "profile"],
	viewer: ["dashboard", "analytics", "profile"],
};

export const PERMISSION_LABELS = {
	dashboard: "Dashboard",
	projects: "Projects",
	tasks: "Tasks",
	dailyTasks: "Daily Tasks",
	financials: "Financials",
	expenses: "Expenses",
	budgets: "Budgets",
	analytics: "Analytics",
	profile: "Profile",
	teamUsers: "Team & Users",
};

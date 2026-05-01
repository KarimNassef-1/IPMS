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

export const PROJECT_TYPES = ["One-time", "Monthly", "One-time + Monthly"];

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

export const APP_ROLES = ["admin", "partner", "outsource", "client"];

export const APP_PERMISSION_KEYS = [
	"dashboard",
	"clientPortal",
	"projects",
	"outsourcePortal",
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
		"outsourcePortal",
		"tasks",
		"dailyTasks",
		"financials",
		"expenses",
		"budgets",
		"analytics",
		"profile",
	],
	client: ["dashboard", "clientPortal", "profile"],
	outsource: ["dashboard", "outsourcePortal", "profile"],
};

export const PERMISSION_LABELS = {
	dashboard: "Dashboard",
	clientPortal: "Client Portal",
	projects: "Projects",
	outsourcePortal: "Work Hub",
	tasks: "Tasks",
	dailyTasks: "Daily Tasks",
	financials: "Financials",
	expenses: "Expenses",
	budgets: "Budgets",
	analytics: "Analytics",
	profile: "Profile",
	teamUsers: "Team & Users",
};

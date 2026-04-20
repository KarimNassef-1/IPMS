import { SERVICE_CATEGORIES } from "./constants";

function normalizeCategoryToken(value) {
	return String(value || "")
		.trim()
		.toLowerCase()
		.replace(/\s*&\s*/g, "&")
		.replace(/\s+/g, " ");
}

export function normalizeServiceCategory(value) {
	const normalized = normalizeCategoryToken(value);
	if (!normalized) return "";

	const match = SERVICE_CATEGORIES.find(
		(category) => normalizeCategoryToken(category) === normalized,
	);
	return match || "";
}

export function getEntityServiceCategory(entity) {
	return normalizeServiceCategory(
		entity?.serviceCategory || entity?.serviceType,
	);
}

export function getEntityServiceCategories(entity) {
	const multi = (
		Array.isArray(entity?.serviceCategories) ? entity.serviceCategories : []
	)
		.map((value) => normalizeServiceCategory(value))
		.filter(Boolean);

	if (multi.length) return Array.from(new Set(multi));

	const single = getEntityServiceCategory(entity);
	return single ? [single] : [];
}

export function createAllowedServiceCategorySet(values) {
	return new Set(
		(Array.isArray(values) ? values : [])
			.map((value) => normalizeServiceCategory(value))
			.filter(Boolean),
	);
}

export function canAccessServiceCategory(
	category,
	allowedCategorySet,
	isAdmin,
) {
	if (isAdmin) return true;
	const normalized = normalizeServiceCategory(category);
	if (!normalized) return false;
	return allowedCategorySet.has(normalized);
}

export function filterServicesByAccess(
	services,
	{ isAdmin, allowedCategorySet },
) {
	if (isAdmin) return Array.isArray(services) ? services : [];

	return (Array.isArray(services) ? services : []).filter((service) =>
		canAccessServiceCategory(
			getEntityServiceCategory(service),
			allowedCategorySet,
			false,
		),
	);
}

export function filterProjectsByVisibleServices(projects, services) {
	const visibleProjectIds = new Set(
		(Array.isArray(services) ? services : [])
			.map((service) => service.projectId)
			.filter(Boolean),
	);

	return (Array.isArray(projects) ? projects : []).filter((project) =>
		visibleProjectIds.has(project.id),
	);
}

export function resolveTeamServiceCategories(teams, teamIds) {
	const teamMap = new Map(
		(Array.isArray(teams) ? teams : []).map((team) => [team.id, team]),
	);

	return Array.from(
		new Set(
			(Array.isArray(teamIds) ? teamIds : [])
				.flatMap((teamId) => getEntityServiceCategories(teamMap.get(teamId)))
				.filter(Boolean),
		),
	);
}

import { SERVICE_CATEGORIES } from "../../utils/constants";

export const EMPTY_USER_FORM = {
	name: "",
	phoneNumber: "",
	role: "outsource",
	photoURL: "",
	title: "",
	teamIds: [],
	websiteTracks: [],
	outsourceServices: [],
};

export const EMPTY_TEAM_FORM = {
	name: "",
	serviceCategories: [SERVICE_CATEGORIES[0]],
	description: "",
	memberIds: [],
	memberProfiles: [],
};

export const EMPTY_TEAM_MEMBER_DRAFT = {
	name: "",
	technicalRole: "",
	websiteTracks: [],
	pictureUrl: "",
	linkedUserId: "",
};

export function createTeamMemberId() {
	return `member_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function fileToDataUrl(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ""));
		reader.onerror = () =>
			reject(new Error("Failed to read selected image file."));
		reader.readAsDataURL(file);
	});
}

export function buildUserNameById(users) {
	return (Array.isArray(users) ? users : []).reduce((acc, item) => {
		acc[item.id] = item.name || "Unknown user";
		return acc;
	}, {});
}

export function buildUserById(users) {
	return (Array.isArray(users) ? users : []).reduce((acc, item) => {
		acc[item.id] = item;
		return acc;
	}, {});
}

export function buildTeamNameById(teams) {
	return (Array.isArray(teams) ? teams : []).reduce((acc, item) => {
		acc[item.id] = item.name || "Team";
		return acc;
	}, {});
}

export function filterUsers(users, query, teamNameById) {
	const normalizedQuery = String(query || "")
		.trim()
		.toLowerCase();
	const source = Array.isArray(users) ? users : [];

	return source
		.filter((item) => {
			if (!normalizedQuery) return true;
			const haystack = [
				item.name,
				item.phoneNumber,
				item.role,
				item.title,
				...(Array.isArray(item.websiteTracks) ? item.websiteTracks : []),
				...(Array.isArray(item.teamIds)
					? item.teamIds.map((teamId) => teamNameById[teamId] || teamId)
					: []),
			]
				.map((value) => String(value || "").toLowerCase())
				.join(" ");
			return haystack.includes(normalizedQuery);
		})
		.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

export function filterTeams(teams, query, serviceFilter, userNameById) {
	const normalizedQuery = String(query || "")
		.trim()
		.toLowerCase();
	const source = Array.isArray(teams) ? teams : [];

	return source
		.filter((team) => {
			const categories = Array.isArray(team.serviceCategories)
				? team.serviceCategories
				: [team.serviceCategory || team.serviceType].filter(Boolean);

			if (serviceFilter !== "all" && !categories.includes(serviceFilter))
				return false;

			if (!normalizedQuery) return true;
			const memberNames = Array.isArray(team.memberProfiles)
				? team.memberProfiles.map((member) => member?.name || "")
				: (team.memberIds || []).map((id) => userNameById[id] || id);

			const haystack = [
				team.name,
				team.description,
				...categories,
				...memberNames,
			]
				.map((value) => String(value || "").toLowerCase())
				.join(" ");

			return haystack.includes(normalizedQuery);
		})
		.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

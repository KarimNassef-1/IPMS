import { PROJECT_TYPES } from "../../utils/constants";

export function createInstallment() {
	return {
		amount: "",
		dueDate: "",
		status: "pending",
	};
}

export function normalizeProjectType(value) {
	return value === "Mix" ? "One-time + Monthly" : value;
}

export function getOutsourceUserLabel(user) {
	return user?.displayName || user?.email || "Outsource user";
}

export function normalizeAccountRole(value) {
	return String(value || "")
		.trim()
		.toLowerCase();
}

export function normalizeAccountStatus(value) {
	const normalized = String(value || "active")
		.trim()
		.toLowerCase();
	if (normalized === "locked" || normalized === "removed") return normalized;
	return "active";
}

export function createInitialServiceForm() {
	return {
		projectId: "",
		serviceName: "",
		serviceCategory: "",
		chargeType: "paid",
		includeInFinancialPlanner: true,
		allocationMode: "auto",
		manualAllocation: {
			karimSalary: "",
			youssefSalary: "",
			agencyOperations: "",
			marketingSales: "",
		},
		deliveryType: "inhouse",
		assignedUserId: "",
		assignedUserName: "",
		assignedUserIds: [],
		assignedUserNames: [],
		outsourcePercentage: "",
		recurringOutsourcePercentage: "",
		outsourceServiceFee: "",
		billingType: "one-time",
		paymentMode: "installments",
		revenue: "",
		oneTimeAmount: "",
		monthlyAmount: "",
		monthsCount: "1",
		recurringOngoing: false,
		recurringStart: "",
		recurringEnd: "",
		valueAmount: "",
		paymentStatus: "pending",
		websiteLinkName: "",
		websiteLinkUrl: "",
		paymentDate: "",
		installments: [createInstallment(), createInstallment()],
	};
}

export function serviceToForm(service) {
	const billingType = service.billingType || "one-time";
	const paymentMode =
		billingType === "monthly"
			? "monthly"
			: service.paymentMode || "installments";
	const installments =
		Array.isArray(service.installments) && service.installments.length
			? service.installments.map((item) => ({
					amount: String(Number(item.amount) || ""),
					dueDate: item.dueDate || "",
					status: item.status || "pending",
				}))
			: [createInstallment(), createInstallment()];

	const chargedRevenue = Number(service.revenue) || 0;
	const fallbackValue =
		Number(service.valueAmount) ||
		Number(service.totalContractValue) ||
		chargedRevenue;
	const assignedUserIds = Array.isArray(service.assignedUserIds)
		? service.assignedUserIds.filter(Boolean)
		: service.assignedUserId
			? [service.assignedUserId]
			: [];
	const assignedUserNames = Array.isArray(service.assignedUserNames)
		? service.assignedUserNames.filter(Boolean)
		: service.assignedUserName
			? [service.assignedUserName]
			: [];

	return {
		projectId: service.projectId || "",
		serviceName: service.serviceName || "",
		serviceCategory: service.serviceCategory || "",
		chargeType: service.chargeType === "free" ? "free" : "paid",
		includeInFinancialPlanner: service.includeInFinancialPlanner !== false,
		allocationMode: service.allocationMode === "manual" ? "manual" : "auto",
		manualAllocation: {
			karimSalary: Number(service?.manualAllocation?.karimSalary)
				? String(Number(service.manualAllocation.karimSalary))
				: "",
			youssefSalary: Number(service?.manualAllocation?.youssefSalary)
				? String(Number(service.manualAllocation.youssefSalary))
				: "",
			agencyOperations: Number(service?.manualAllocation?.agencyOperations)
				? String(Number(service.manualAllocation.agencyOperations))
				: "",
			marketingSales: Number(service?.manualAllocation?.marketingSales)
				? String(Number(service.manualAllocation.marketingSales))
				: "",
		},
		deliveryType:
			service.deliveryType === "outsource" ? "outsource" : "inhouse",
		assignedUserId: assignedUserIds[0] || service.assignedUserId || "",
		assignedUserName: assignedUserNames[0] || service.assignedUserName || "",
		assignedUserIds,
		assignedUserNames,
		outsourcePercentage: Number(service.outsourcePercentage)
			? String(Number(service.outsourcePercentage))
			: "",
		recurringOutsourcePercentage: Number(service.recurringOutsourcePercentage)
			? String(Number(service.recurringOutsourcePercentage))
			: Number(service.outsourcePercentage)
				? String(Number(service.outsourcePercentage))
				: "",
		outsourceServiceFee: Number(service.outsourceServiceFee)
			? String(Number(service.outsourceServiceFee))
			: "",
		billingType,
		paymentMode,
		revenue: chargedRevenue ? String(chargedRevenue) : "",
		oneTimeAmount: Number(service.oneTimeAmount)
			? String(Number(service.oneTimeAmount))
			: "",
		monthlyAmount: Number(service.monthlyAmount)
			? String(Number(service.monthlyAmount))
			: "",
		monthsCount: Number(service.monthsCount)
			? String(Number(service.monthsCount))
			: "1",
		recurringOngoing: Boolean(service.recurringOngoing),
		recurringStart: service.recurringStart || "",
		recurringEnd: service.recurringEnd || "",
		valueAmount: fallbackValue ? String(fallbackValue) : "",
		paymentStatus: service.paymentStatus || "pending",
		websiteLinkName: service.websiteLinkName || "",
		websiteLinkUrl: service.websiteLinkUrl || "",
		paymentDate: service.paymentDate || "",
		installments:
			paymentMode === "installments" ? installments : [createInstallment()],
	};
}

export const PROJECT_TYPE_OPTIONS = PROJECT_TYPES;

export function buildRevenueBreakdownByProjectId(
	services,
	serviceAgencyShareValue,
	serviceContractValue,
) {
	return (Array.isArray(services) ? services : []).reduce((acc, service) => {
		if (!acc[service.projectId]) {
			acc[service.projectId] = {
				totalContractValue: 0,
				agencyShareTotal: 0,
				inhouseRevenue: 0,
				outsourceShare: 0,
				outsourcePayout: 0,
				freeValue: 0,
			};
		}

		const bucket = acc[service.projectId];
		const agencyRevenue = serviceAgencyShareValue(service);
		const contractValue = serviceContractValue(service);
		const trackedValue =
			Number(service.valueAmount) ||
			Number(service.totalContractValue) ||
			contractValue;

		if (service.chargeType === "free") {
			bucket.freeValue += trackedValue;
		} else {
			bucket.totalContractValue += contractValue;
			bucket.agencyShareTotal += agencyRevenue;

			if (service.deliveryType === "outsource") {
				bucket.outsourceShare += agencyRevenue;
				bucket.outsourcePayout += Math.max(contractValue - agencyRevenue, 0);
			} else {
				bucket.inhouseRevenue += agencyRevenue;
			}
		}

		return acc;
	}, {});
}

export function buildServicesByProjectId(services) {
	return (Array.isArray(services) ? services : []).reduce((acc, service) => {
		if (!acc[service.projectId]) acc[service.projectId] = [];
		acc[service.projectId].push(service);
		return acc;
	}, {});
}

export function buildVisibleProjects({
	projects,
	servicesByProjectId,
	projectSearch,
	projectStatusFilter,
	projectTypeFilter,
	projectServiceCategoryFilter,
	projectDeliveryFilter,
	projectSort,
	revenueBreakdownByProjectId,
}) {
	const query = String(projectSearch || "")
		.trim()
		.toLowerCase();
	const filtered = (Array.isArray(projects) ? projects : []).filter(
		(project) => {
			const projectServices = servicesByProjectId[project.id] || [];
			const normalizedProjectType = normalizeProjectType(project.type || "");

			if (
				projectStatusFilter !== "all" &&
				(project.status || "") !== projectStatusFilter
			) {
				return false;
			}

			if (
				projectTypeFilter !== "all" &&
				normalizedProjectType !== projectTypeFilter
			) {
				return false;
			}

			if (projectServiceCategoryFilter !== "all") {
				const hasCategory = projectServices.some(
					(service) =>
						String(service.serviceCategory || "").trim() ===
						projectServiceCategoryFilter,
				);
				if (!hasCategory) return false;
			}

			if (projectDeliveryFilter !== "all") {
				const hasInhouse = projectServices.some(
					(service) => service.deliveryType !== "outsource",
				);
				const hasOutsource = projectServices.some(
					(service) => service.deliveryType === "outsource",
				);

				const deliveryProfile =
					hasInhouse && hasOutsource
						? "mix"
						: hasOutsource
							? "outsource"
							: hasInhouse
								? "inhouse"
								: "none";

				if (deliveryProfile !== projectDeliveryFilter) return false;
			}

			if (!query) return true;

			const haystack = [
				project.projectName,
				project.clientName,
				project.projectType,
				project.status,
				normalizedProjectType,
			]
				.map((value) => String(value || "").toLowerCase())
				.join(" ");

			return haystack.includes(query);
		},
	);

	const timeValue = (value) => {
		if (!value) return Number.NaN;
		const parsed = Date.parse(value);
		return Number.isNaN(parsed) ? Number.NaN : parsed;
	};

	const alpha = (value) =>
		String(value || "")
			.trim()
			.toLowerCase();

	return [...filtered].sort((left, right) => {
		if (projectSort === "name_asc") {
			return alpha(left.projectName).localeCompare(alpha(right.projectName));
		}

		if (projectSort === "name_desc") {
			return alpha(right.projectName).localeCompare(alpha(left.projectName));
		}

		if (projectSort === "deadline_asc") {
			const leftTime = timeValue(left.deadline);
			const rightTime = timeValue(right.deadline);
			if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0;
			if (Number.isNaN(leftTime)) return 1;
			if (Number.isNaN(rightTime)) return -1;
			return leftTime - rightTime;
		}

		if (projectSort === "deadline_desc") {
			const leftTime = timeValue(left.deadline);
			const rightTime = timeValue(right.deadline);
			if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0;
			if (Number.isNaN(leftTime)) return 1;
			if (Number.isNaN(rightTime)) return -1;
			return rightTime - leftTime;
		}

		if (
			projectSort === "agency_share_desc" ||
			projectSort === "agency_share_asc"
		) {
			const leftValue =
				Number(revenueBreakdownByProjectId[left.id]?.agencyShareTotal) || 0;
			const rightValue =
				Number(revenueBreakdownByProjectId[right.id]?.agencyShareTotal) || 0;
			return projectSort === "agency_share_desc"
				? rightValue - leftValue
				: leftValue - rightValue;
		}

		if (
			projectSort === "contract_value_desc" ||
			projectSort === "contract_value_asc"
		) {
			const leftValue =
				Number(revenueBreakdownByProjectId[left.id]?.totalContractValue) || 0;
			const rightValue =
				Number(revenueBreakdownByProjectId[right.id]?.totalContractValue) || 0;
			return projectSort === "contract_value_desc"
				? rightValue - leftValue
				: leftValue - rightValue;
		}

		if (
			projectSort === "outsource_share_desc" ||
			projectSort === "outsource_share_asc"
		) {
			const leftValue =
				Number(revenueBreakdownByProjectId[left.id]?.outsourcePayout) || 0;
			const rightValue =
				Number(revenueBreakdownByProjectId[right.id]?.outsourcePayout) || 0;
			return projectSort === "outsource_share_desc"
				? rightValue - leftValue
				: leftValue - rightValue;
		}

		const leftTime = timeValue(
			left.updatedAt || left.createdAt || left.startDate,
		);
		const rightTime = timeValue(
			right.updatedAt || right.createdAt || right.startDate,
		);
		if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0;
		if (Number.isNaN(leftTime)) return 1;
		if (Number.isNaN(rightTime)) return -1;
		if (projectSort === "updated_asc") return leftTime - rightTime;
		return rightTime - leftTime;
	});
}

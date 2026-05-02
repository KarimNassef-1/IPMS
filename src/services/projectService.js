import {
	addDoc,
	collection,
	deleteDoc,
	documentId,
	doc,
	getDocs,
	onSnapshot,
	query,
	setDoc,
	updateDoc,
	where,
} from "firebase/firestore";
import { ensureFirebaseReady } from "./firebase";
import { assertRequiredFields } from "../utils/helpers";
import { normalizeServiceCategory } from "../utils/serviceAccess";
import { estimateRecurringMonths } from "../utils/serviceFinance";
import {
	applyProjectLifecycleTransition,
	deriveProjectLifecycleFromPayload,
} from "../utils/workflowLifecycle";
import { createMilestoneObject } from "../domain/workflow/canonicalWorkflow";
import { refreshAgencyOverviewSummary } from "./summaryService";

const PROJECTS = "projects";
const SERVICES = "services";

function chunkArray(values, chunkSize = 10) {
	const source = Array.isArray(values) ? values : [];
	const chunks = [];
	for (let index = 0; index < source.length; index += chunkSize) {
		chunks.push(source.slice(index, index + chunkSize));
	}
	return chunks;
}

function normalizeCategoryList(values) {
	return Array.from(
		new Set(
			(Array.isArray(values) ? values : [])
				.map((value) => normalizeServiceCategory(value))
				.filter(Boolean),
		),
	);
}

function safeText(value, fallback = "") {
	const text = String(value || "").trim();
	return text || fallback;
}

function safeTextLower(value, fallback = "") {
	return safeText(value, fallback).toLowerCase();
}

function safeTextList(values) {
	if (!Array.isArray(values)) return [];
	return values.map((item) => safeText(item)).filter(Boolean);
}

function normalizeProjectPayload(payload) {
	const clientName = safeText(payload?.clientName);
	const clientEmail = safeTextLower(payload?.clientEmail);
	const clientEmails = Array.from(
		new Set(
			safeTextList(payload?.clientEmails)
				.map((email) => email.toLowerCase())
				.concat(clientEmail ? [clientEmail] : []),
		),
	);
	const clientUserId = safeText(payload?.clientUserId);
	const clientUserIds = Array.from(
		new Set(
			safeTextList(payload?.clientUserIds).concat(
				clientUserId ? [clientUserId] : [],
			),
		),
	);

	const lifecycleBase = deriveProjectLifecycleFromPayload(payload);
	const lifecycle = payload?.lifecycleTransition
		? applyProjectLifecycleTransition(payload, payload.lifecycleTransition)
		: lifecycleBase;

	return {
		...payload,
		clientName,
		clientEmail,
		clientEmails,
		clientUserId: clientUserIds[0] || "",
		clientUserIds,
		lifecycle,
	};
}

function money(value) {
	return Math.max(Number(value) || 0, 0);
}

function normalizeInstallments(installments) {
	if (!Array.isArray(installments)) return [];

	return installments
		.map((item, index) => ({
			index,
			amount: Number(item?.amount) || 0,
			dueDate: item?.dueDate || "",
			status: item?.status || "pending",
		}))
		.filter((item) => item.amount > 0 || item.dueDate)
		.map(({ index, ...item }) => ({ id: String(index + 1), ...item }));
}

function normalizeMilestones(payload, context) {
	if (Array.isArray(payload?.milestones) && payload.milestones.length) {
		return payload.milestones
			.map((milestone, index) => ({
				...createMilestoneObject(milestone, index),
				slaTargetHours: Math.max(Number(milestone?.slaTargetHours) || 24, 1),
				slaDueAt: safeText(milestone?.slaDueAt),
			}))
			.filter((milestone) => milestone.name);
	}

	const generated = [];
	if (Array.isArray(context?.installments) && context.installments.length) {
		for (const installment of context.installments) {
			generated.push(
				createMilestoneObject(
					{
						id: safeText(installment.id, `inst_${generated.length + 1}`),
						name: `Installment ${generated.length + 1}`,
						dueDate: safeText(installment.dueDate),
						amount: money(installment.amount),
						status:
							safeTextLower(installment.status) === "paid"
								? "approved"
								: "pending",
						slaTargetHours: 24,
						slaDueAt: "",
					},
					generated.length,
				),
			);
		}
	}

	if (!generated.length && Number(context?.oneTimeTotal) > 0) {
		generated.push(
			createMilestoneObject(
				{
					id: "one_time_delivery",
					name: "One-time delivery",
					dueDate: safeText(payload?.paymentDate),
					amount: money(context.oneTimeTotal),
					status:
						safeTextLower(payload?.paymentStatus) === "paid"
							? "approved"
							: "pending",
					slaTargetHours: 24,
					slaDueAt: "",
				},
				0,
			),
		);
	}

	if (Number(context?.monthlyTotal) > 0) {
		generated.push(
			createMilestoneObject(
				{
					id: "monthly_delivery",
					name: "Recurring delivery",
					dueDate: safeText(payload?.recurringEnd || payload?.paymentDate),
					amount: money(context.monthlyTotal),
					status: "pending",
					slaTargetHours: 24,
					slaDueAt: "",
				},
				generated.length,
			),
		);
	}

	return generated;
}

function normalizeWebsiteUrl(value) {
	const raw = String(value || "").trim();
	if (!raw) return "";
	if (/^https?:\/\//i.test(raw)) return raw;
	return `https://${raw}`;
}

function normalizeServicePayload(payload) {
	const serviceCategory = normalizeServiceCategory(payload.serviceCategory);
	const incomingPaymentStatus = String(payload.paymentStatus || "")
		.trim()
		.toLowerCase();
	const paymentStatus = ["pending", "paid", "completed", "free"].includes(
		incomingPaymentStatus,
	)
		? incomingPaymentStatus
		: "pending";
	const shouldKeepWebsiteLink =
		serviceCategory === "Website Development" && paymentStatus === "completed";
	const websiteLinkName = shouldKeepWebsiteLink
		? String(payload.websiteLinkName || "").trim()
		: "";
	const websiteLinkUrl = shouldKeepWebsiteLink
		? normalizeWebsiteUrl(payload.websiteLinkUrl)
		: "";
	const chargeType = payload.chargeType === "free" ? "free" : "paid";
	const billingType =
		payload.billingType === "monthly"
			? "monthly"
			: payload.billingType === "hybrid"
				? "hybrid"
				: "one-time";
	const deliveryType =
		payload.deliveryType === "outsource" ? "outsource" : "inhouse";
	const outsourcePercentage = Math.min(
		Math.max(Number(payload.outsourcePercentage) || 0, 0),
		100,
	);
	const outsourceServiceFee = money(payload.outsourceServiceFee);
	const recurringOngoing = Boolean(payload.recurringOngoing);
	const includeInFinancialPlanner = payload.includeInFinancialPlanner !== false;
	const allocationMode =
		includeInFinancialPlanner && payload.allocationMode === "manual"
			? "manual"
			: "auto";

	const manualAllocation = {
		karimSalary: money(payload?.manualAllocation?.karimSalary),
		youssefSalary: money(payload?.manualAllocation?.youssefSalary),
		agencyOperations: money(payload?.manualAllocation?.agencyOperations),
		marketingSales: money(payload?.manualAllocation?.marketingSales),
	};

	if (chargeType === "free") {
		const baseValue =
			money(payload.valueAmount) ||
			money(payload.totalContractValue) ||
			outsourceServiceFee ||
			money(payload.oneTimeAmount) ||
			money(payload.monthlyAmount) * (money(payload.monthsCount) || 1) ||
			money(payload.revenue) ||
			0;

		return {
			...payload,
			serviceCategory,
			chargeType,
			deliveryType,
			outsourcePercentage,
			recurringOutsourcePercentage: 0,
			outsourceServiceFee,
			outsourceShareBase: 0,
			oneTimeShareBase: 0,
			recurringShareBase: 0,
			includeInFinancialPlanner,
			allocationMode: includeInFinancialPlanner ? allocationMode : "auto",
			manualAllocation,
			agencyShare: 0,
			billingType: "one-time",
			paymentMode: "once",
			oneTimeAmount: 0,
			monthlyAmount: 0,
			monthsCount: 0,
			recurringOngoing: false,
			recurringStart: "",
			recurringEnd: "",
			installments: [],
			valueAmount: baseValue,
			totalContractValue: baseValue,
			revenue: 0,
			paymentStatus: "free",
			websiteLinkName: "",
			websiteLinkUrl: "",
			paymentDate: "",
		};
	}

	const hasOneTimePart = billingType === "one-time" || billingType === "hybrid";
	const hasMonthlyPart = billingType === "monthly" || billingType === "hybrid";
	const paymentMode = hasOneTimePart
		? payload.paymentMode === "once"
			? "once"
			: "installments"
		: "monthly";
	const installments = normalizeInstallments(payload.installments);
	const oneTimeAmountBase =
		money(payload.oneTimeAmount) || money(payload.revenue) || 0;
	const oneTimeTotal = hasOneTimePart
		? paymentMode === "once"
			? oneTimeAmountBase
			: installments.reduce((sum, item) => sum + item.amount, 0)
		: 0;
	const monthlyAmount = hasMonthlyPart ? money(payload.monthlyAmount) : 0;
	const recurringStart = hasMonthlyPart ? payload.recurringStart || "" : "";
	const recurringEnd =
		hasMonthlyPart && !recurringOngoing ? payload.recurringEnd || "" : "";
	const monthsCount = hasMonthlyPart
		? recurringOngoing
			? estimateRecurringMonths(
					recurringStart,
					new Date().toISOString().slice(0, 10),
					false,
				)
			: estimateRecurringMonths(recurringStart, recurringEnd, false)
		: 0;
	const recurringOutsourcePercentage = hasMonthlyPart
		? Math.min(
				Math.max(
					Number(
						payload.recurringOutsourcePercentage == null
							? outsourcePercentage
							: payload.recurringOutsourcePercentage,
					) || 0,
					0,
				),
				100,
			)
		: 0;
	const monthlyTotal = hasMonthlyPart ? monthlyAmount * monthsCount : 0;
	const planTotal = oneTimeTotal + monthlyTotal;
	const oneTimeContractBase =
		deliveryType === "outsource" && hasOneTimePart
			? outsourceServiceFee
			: oneTimeTotal;
	const oneTimeShareBase =
		deliveryType === "outsource" && hasOneTimePart ? oneTimeContractBase : 0;
	const recurringShareBase =
		deliveryType === "outsource" && hasMonthlyPart
			? Math.max(monthlyTotal, 0)
			: 0;
	const outsourceShareBase = oneTimeShareBase + recurringShareBase;
	const normalizedOutsourceServiceFee =
		deliveryType === "outsource" && hasOneTimePart ? oneTimeContractBase : 0;
	const grossAmount = oneTimeContractBase + monthlyTotal;
	const oneTimeAgencyShare = (oneTimeShareBase * outsourcePercentage) / 100;
	const recurringAgencyShare =
		(recurringShareBase * recurringOutsourcePercentage) / 100;
	const agencyShare =
		deliveryType === "outsource"
			? oneTimeAgencyShare + recurringAgencyShare
			: 0;
	const valueAmount = grossAmount;
	const chargedRevenue = deliveryType === "outsource" ? agencyShare : planTotal;
	const milestones = normalizeMilestones(payload, {
		installments,
		oneTimeTotal,
		monthlyTotal,
	});

	return {
		...payload,
		serviceCategory,
		chargeType,
		deliveryType,
		outsourcePercentage,
		recurringOutsourcePercentage,
		outsourceServiceFee: normalizedOutsourceServiceFee,
		outsourceShareBase,
		oneTimeShareBase,
		recurringShareBase,
		includeInFinancialPlanner,
		allocationMode: includeInFinancialPlanner ? allocationMode : "auto",
		manualAllocation,
		agencyShare,
		billingType,
		paymentMode,
		oneTimeAmount:
			hasOneTimePart && paymentMode === "once" ? oneTimeAmountBase : 0,
		monthlyAmount,
		monthsCount,
		recurringOngoing: hasMonthlyPart ? recurringOngoing : false,
		recurringStart,
		recurringEnd,
		installments:
			hasOneTimePart && paymentMode === "installments" ? installments : [],
		valueAmount,
		totalContractValue: valueAmount,
		revenue: chargedRevenue,
		milestones,
		billingWorkflow: {
			strictMilestoneBilling: true,
			invoiceTrigger: "milestone_approved",
		},
		paymentStatus,
		websiteLinkName,
		websiteLinkUrl,
		paymentDate: payload.paymentDate || "",
	};
}

export async function createProject(payload) {
	assertRequiredFields(payload, [
		"clientName",
		"projectName",
		"type",
		"status",
	]);
	const firestore = ensureFirebaseReady();
	const normalizedPayload = normalizeProjectPayload(payload);

	const data = {
		...normalizedPayload,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};

	const ref = await addDoc(collection(firestore, PROJECTS), data);
	refreshAgencyOverviewSummary().catch(() => {});
	return { id: ref.id, ...data };
}

export async function getProjects() {
	const firestore = ensureFirebaseReady();

	const snapshot = await getDocs(collection(firestore, PROJECTS));
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getProjectsByIds(projectIds) {
	const firestore = ensureFirebaseReady();
	const ids = Array.from(
		new Set(
			(Array.isArray(projectIds) ? projectIds : [])
				.map((id) => String(id || "").trim())
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

	return snapshots
		.flatMap((snapshot) => snapshot.docs)
		.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getProjectsByServiceCategories(serviceCategories) {
	const services = await getServicesByCategories(serviceCategories);
	const projectIds = services
		.map((service) => service.projectId)
		.filter(Boolean);
	return getProjectsByIds(projectIds);
}

export function subscribeProjects(onData, onError) {
	const firestore = ensureFirebaseReady();

	return onSnapshot(
		collection(firestore, PROJECTS),
		(snapshot) => {
			onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
		},
		onError,
	);
}

export async function updateProject(id, payload) {
	const firestore = ensureFirebaseReady();
	const normalizedPayload = normalizeProjectPayload(payload);

	const ref = doc(firestore, PROJECTS, id);
	await updateDoc(ref, {
		...normalizedPayload,
		updatedAt: new Date().toISOString(),
	});
	refreshAgencyOverviewSummary().catch(() => {});
}

export async function deleteProject(id) {
	const firestore = ensureFirebaseReady();

	await deleteDoc(doc(firestore, PROJECTS, id));
	refreshAgencyOverviewSummary().catch(() => {});
}

export async function restoreProject(payload) {
	const firestore = ensureFirebaseReady();
	const id = String(payload?.id || "").trim();
	if (!id) throw new Error("Project id is required to restore project.");
	const { id: _id, ...data } = payload;
	await setDoc(doc(firestore, PROJECTS, id), data, { merge: false });
	refreshAgencyOverviewSummary().catch(() => {});
}

export async function addServiceToProject(payload) {
	assertRequiredFields(payload, [
		"projectId",
		"serviceName",
		"serviceCategory",
	]);
	const firestore = ensureFirebaseReady();

	const normalizedPayload = normalizeServicePayload(payload);

	const data = {
		...normalizedPayload,
		createdAt: new Date().toISOString(),
	};

	const ref = await addDoc(collection(firestore, SERVICES), data);
	refreshAgencyOverviewSummary().catch(() => {});
	return { id: ref.id, ...data };
}

export async function getProjectServices(projectId) {
	const firestore = ensureFirebaseReady();

	const servicesQuery = query(
		collection(firestore, SERVICES),
		where("projectId", "==", projectId),
	);
	const snapshot = await getDocs(servicesQuery);
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getAllServices() {
	const firestore = ensureFirebaseReady();

	const snapshot = await getDocs(collection(firestore, SERVICES));
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getServicesByCategories(serviceCategories) {
	const firestore = ensureFirebaseReady();
	const categories = normalizeCategoryList(serviceCategories);
	if (!categories.length) return [];

	const servicesQuery = query(
		collection(firestore, SERVICES),
		where("serviceCategory", "in", categories),
	);
	const snapshot = await getDocs(servicesQuery);
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export function subscribeAllServices(onData, onError) {
	const firestore = ensureFirebaseReady();

	return onSnapshot(
		collection(firestore, SERVICES),
		(snapshot) => {
			onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
		},
		onError,
	);
}

export function subscribeServicesByCategories(
	serviceCategories,
	onData,
	onError,
) {
	const firestore = ensureFirebaseReady();
	const categories = normalizeCategoryList(serviceCategories);
	if (!categories.length) {
		onData([]);
		return () => {};
	}

	const servicesQuery = query(
		collection(firestore, SERVICES),
		where("serviceCategory", "in", categories),
	);

	return onSnapshot(
		servicesQuery,
		(snapshot) => {
			onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
		},
		onError,
	);
}

export async function updateService(id, payload) {
	const firestore = ensureFirebaseReady();
	const normalizedPayload = normalizeServicePayload(payload);

	await updateDoc(doc(firestore, SERVICES, id), {
		...normalizedPayload,
		updatedAt: new Date().toISOString(),
	});
	refreshAgencyOverviewSummary().catch(() => {});
}

export async function deleteService(id) {
	const firestore = ensureFirebaseReady();

	await deleteDoc(doc(firestore, SERVICES, id));
	refreshAgencyOverviewSummary().catch(() => {});
}

export async function restoreService(payload) {
	const firestore = ensureFirebaseReady();
	const id = String(payload?.id || "").trim();
	if (!id) throw new Error("Service id is required to restore service.");
	const { id: _id, ...data } = payload;
	await setDoc(doc(firestore, SERVICES, id), data, { merge: false });
	refreshAgencyOverviewSummary().catch(() => {});
}

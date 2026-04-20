import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	getDocs,
	onSnapshot,
	query,
	updateDoc,
	where,
} from "firebase/firestore";
import { ensureFirebaseReady } from "./firebase";
import { assertRequiredFields } from "../utils/helpers";
import { normalizeServiceCategory } from "../utils/serviceAccess";

const PROJECTS = "projects";
const SERVICES = "services";

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

function calculateMonthsBetween(startDate, endDate) {
	if (!startDate || !endDate) return 0;

	const start = new Date(startDate);
	const end = new Date(endDate);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
	if (end < start) return 0;

	const yearDiff = end.getFullYear() - start.getFullYear();
	const monthDiff = end.getMonth() - start.getMonth();
	let totalMonths = yearDiff * 12 + monthDiff + 1;

	// If ending day is before starting day, do not count the current month as complete.
	if (end.getDate() < start.getDate()) {
		totalMonths -= 1;
	}

	return Math.max(totalMonths, 0);
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
			? calculateMonthsBetween(
					recurringStart,
					new Date().toISOString().slice(0, 10),
				)
			: calculateMonthsBetween(recurringStart, recurringEnd)
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

	const data = {
		...payload,
		createdAt: new Date().toISOString(),
	};

	const ref = await addDoc(collection(firestore, PROJECTS), data);
	return { id: ref.id, ...data };
}

export async function getProjects() {
	const firestore = ensureFirebaseReady();

	const snapshot = await getDocs(collection(firestore, PROJECTS));
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
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

	const ref = doc(firestore, PROJECTS, id);
	await updateDoc(ref, payload);
}

export async function deleteProject(id) {
	const firestore = ensureFirebaseReady();

	await deleteDoc(doc(firestore, PROJECTS, id));
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

export async function updateService(id, payload) {
	const firestore = ensureFirebaseReady();
	const normalizedPayload = normalizeServicePayload(payload);

	await updateDoc(doc(firestore, SERVICES, id), {
		...normalizedPayload,
		updatedAt: new Date().toISOString(),
	});
}

export async function deleteService(id) {
	const firestore = ensureFirebaseReady();

	await deleteDoc(doc(firestore, SERVICES, id));
}

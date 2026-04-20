export function estimateRecurringMonths(startDate, endDate, recurringOngoing) {
	if (!startDate) return 0;

	const start = new Date(startDate);
	const end = recurringOngoing ? new Date() : new Date(endDate);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
	if (end < start) return 0;

	const yearDiff = end.getFullYear() - start.getFullYear();
	const monthDiff = end.getMonth() - start.getMonth();
	let totalMonths = yearDiff * 12 + monthDiff + 1;

	if (end.getDate() < start.getDate()) {
		totalMonths -= 1;
	}

	return Math.max(totalMonths, 0);
}

export function serviceContractValue(service) {
	if (!service || service.chargeType === "free") return 0;

	const directValue = Math.max(
		Number(service.valueAmount) || Number(service.totalContractValue) || 0,
		0,
	);
	if (directValue > 0) return directValue;

	const hasOneTimePart =
		service.billingType === "one-time" || service.billingType === "hybrid";
	const hasMonthlyPart =
		service.billingType === "monthly" || service.billingType === "hybrid";

	const oneTimeFromPlan = hasOneTimePart
		? service.paymentMode === "once"
			? Math.max(Number(service.oneTimeAmount) || 0, 0)
			: (Array.isArray(service.installments)
					? service.installments
					: []
				).reduce((sum, item) => sum + Math.max(Number(item.amount) || 0, 0), 0)
		: 0;
	const oneTimeValue =
		service.deliveryType === "outsource"
			? Math.max(Number(service.outsourceServiceFee) || 0, oneTimeFromPlan)
			: oneTimeFromPlan;

	const monthlyValue = hasMonthlyPart
		? Math.max(Number(service.monthlyAmount) || 0, 0) *
			Math.max(Number(service.monthsCount) || 0, 0)
		: 0;

	return oneTimeValue + monthlyValue;
}

export function serviceAgencyShareValue(service) {
	if (!service || service.chargeType === "free") return 0;
	if (service.deliveryType !== "outsource")
		return serviceContractValue(service);

	const hasOneTimePart =
		service.billingType === "one-time" || service.billingType === "hybrid";
	const hasMonthlyPart =
		service.billingType === "monthly" || service.billingType === "hybrid";

	const oneTimeBase = hasOneTimePart
		? Math.max(Number(service.outsourceServiceFee) || 0, 0)
		: 0;
	const oneTimePercentage = Math.min(
		Math.max(Number(service.outsourcePercentage) || 0, 0),
		100,
	);
	const oneTimeShare = (oneTimeBase * oneTimePercentage) / 100;

	const recurringPercentage = Math.min(
		Math.max(
			Number(
				service.recurringOutsourcePercentage == null
					? service.outsourcePercentage
					: service.recurringOutsourcePercentage,
			) || 0,
			0,
		),
		100,
	);

	const recurringMonths = hasMonthlyPart
		? estimateRecurringMonths(
				service.recurringStart,
				service.recurringEnd,
				Boolean(service.recurringOngoing),
			)
		: 0;
	const monthlyAmount = Math.max(Number(service.monthlyAmount) || 0, 0);
	const recurringBase = hasMonthlyPart ? monthlyAmount * recurringMonths : 0;
	const recurringShare = (recurringBase * recurringPercentage) / 100;

	return oneTimeShare + recurringShare;
}

export function getServiceFinancialBreakdown(service) {
	const contractValue = serviceContractValue(service);
	const agencyShare = serviceAgencyShareValue(service);

	const hasOneTimePart =
		service.billingType === "one-time" || service.billingType === "hybrid";
	const hasMonthlyPart =
		service.billingType === "monthly" || service.billingType === "hybrid";

	const oneTimeContract = hasOneTimePart
		? service.deliveryType === "outsource"
			? Math.max(Number(service.outsourceServiceFee) || 0, 0)
			: service.paymentMode === "once"
				? Math.max(Number(service.oneTimeAmount) || 0, 0)
				: (Array.isArray(service.installments)
						? service.installments
						: []
					).reduce(
						(sum, item) => sum + Math.max(Number(item.amount) || 0, 0),
						0,
					)
		: 0;

	const recurringMonths = hasMonthlyPart
		? estimateRecurringMonths(
				service.recurringStart,
				service.recurringEnd,
				Boolean(service.recurringOngoing),
			)
		: 0;
	const monthlyAmount = Math.max(Number(service.monthlyAmount) || 0, 0);
	const recurringContract = hasMonthlyPart
		? monthlyAmount * recurringMonths
		: 0;

	const oneTimePercentage = Math.min(
		Math.max(Number(service.outsourcePercentage) || 0, 0),
		100,
	);
	const recurringPercentage = Math.min(
		Math.max(
			Number(
				service.recurringOutsourcePercentage == null
					? service.outsourcePercentage
					: service.recurringOutsourcePercentage,
			) || 0,
			0,
		),
		100,
	);

	const oneTimeAgency =
		service.deliveryType === "outsource"
			? (oneTimeContract * oneTimePercentage) / 100
			: oneTimeContract;
	const recurringAgency =
		service.deliveryType === "outsource"
			? (recurringContract * recurringPercentage) / 100
			: recurringContract;

	return {
		contractValue,
		agencyShare,
		oneTimeContract,
		recurringContract,
		oneTimeAgency,
		recurringAgency,
		recurringMonths,
	};
}

export function calculateServiceRecognizedPaidRevenue(service) {
	if (!service || service.chargeType === "free") return 0;

	const totalAgencyShare = Math.max(serviceAgencyShareValue(service), 0);
	if (totalAgencyShare === 0) return 0;

	const isInstallmentMode = service.paymentMode === "installments";
	const hasInstallmentPlan =
		Array.isArray(service.installments) && service.installments.length > 0;
	const useInstallmentRecognition =
		hasInstallmentPlan &&
		(isInstallmentMode || service.billingType !== "monthly");

	let recognizedGross = 0;
	const hasOneTimePart =
		service.billingType === "one-time" || service.billingType === "hybrid";
	const hasMonthlyPart =
		service.billingType === "monthly" || service.billingType === "hybrid";

	let recognizedOneTimeGross = 0;
	let recognizedRecurringGross = 0;

	if (useInstallmentRecognition) {
		recognizedOneTimeGross += service.installments.reduce(
			(sum, installment) => {
				if (installment?.status !== "paid") return sum;
				return sum + Math.max(Number(installment?.amount) || 0, 0);
			},
			0,
		);
	}

	// In installment mode, only paid installments are allowed to drive recognition.
	// Ignore legacy paid fields for this mode to avoid over-counting.
	if (!useInstallmentRecognition) {
		const legacyPaidGross =
			Math.max(Number(service.depositPaidAmount) || 0, 0) +
			Math.max(Number(service.partialPaidAmount) || 0, 0) +
			Math.max(Number(service.paidAmount) || 0, 0);

		if (hasOneTimePart && !hasMonthlyPart) {
			recognizedOneTimeGross += legacyPaidGross;
		} else if (!hasOneTimePart && hasMonthlyPart) {
			recognizedRecurringGross += legacyPaidGross;
		} else if (hasOneTimePart && hasMonthlyPart) {
			// If mixed and no dedicated monthly-paid fields exist, treat legacy paid as one-time by default.
			recognizedOneTimeGross += legacyPaidGross;
		}
	}

	recognizedGross = recognizedOneTimeGross + recognizedRecurringGross;

	// If we don't have detailed paid fields but the service is flagged paid,
	// fallback to full recognition.
	if (recognizedGross <= 0) {
		if (useInstallmentRecognition) return 0;
		const normalizedPaymentStatus = String(service.paymentStatus || "")
			.trim()
			.toLowerCase();
		return normalizedPaymentStatus === "paid" ||
			normalizedPaymentStatus === "completed"
			? totalAgencyShare
			: 0;
	}

	if (service.deliveryType === "outsource") {
		const oneTimePercentage = Math.min(
			Math.max(Number(service.outsourcePercentage) || 0, 0),
			100,
		);
		const recurringPercentage = Math.min(
			Math.max(
				Number(
					service.recurringOutsourcePercentage == null
						? service.outsourcePercentage
						: service.recurringOutsourcePercentage,
				) || 0,
				0,
			),
			100,
		);

		const oneTimeContractBase = hasOneTimePart
			? Math.max(Number(service.outsourceServiceFee) || 0, 0)
			: 0;
		const recurringMonths = hasMonthlyPart
			? estimateRecurringMonths(
					service.recurringStart,
					service.recurringEnd,
					Boolean(service.recurringOngoing),
				)
			: 0;
		const recurringContractBase = hasMonthlyPart
			? Math.max(Number(service.monthlyAmount) || 0, 0) * recurringMonths
			: 0;

		const recognizedOneTimeBase = Math.min(
			recognizedOneTimeGross,
			oneTimeContractBase,
		);
		const recognizedRecurringBase = Math.min(
			recognizedRecurringGross,
			recurringContractBase,
		);

		const recognizedOneTimeShare =
			(recognizedOneTimeBase * oneTimePercentage) / 100;
		const recognizedRecurringShare =
			(recognizedRecurringBase * recurringPercentage) / 100;

		return Math.min(
			recognizedOneTimeShare + recognizedRecurringShare,
			totalAgencyShare,
		);
	}

	return Math.min(recognizedGross, totalAgencyShare);
}

import { calculateServiceRecognizedPaidRevenue } from "./serviceFinance";
import { parseMoney } from "./helpers";

export const DISTRIBUTION_PERCENTAGES = {
	karimSalary: 0.35,
	youssefSalary: 0.35,
	agencyOperations: 0.2,
	marketingSales: 0.1,
};

export function calculateDistribution(totalAmount) {
	const safeAmount = Math.max(Number(totalAmount) || 0, 0);

	return Object.entries(DISTRIBUTION_PERCENTAGES).reduce(
		(acc, [key, percentage]) => {
			acc[key] = safeAmount * percentage;
			return acc;
		},
		{},
	);
}

export function calculateNetProfit(totalIncome, totalExpenses) {
	return (Number(totalIncome) || 0) - (Number(totalExpenses) || 0);
}

export function calculateCompletionRate(completed, total) {
	if (!total) return 0;
	return (completed / total) * 100;
}

export function groupByMonth(items, dateKey = "date", amountKey = "amount") {
	return items.reduce((acc, item) => {
		const rawDate = item?.[dateKey];
		if (!rawDate) return acc;

		const date = new Date(rawDate);
		if (Number.isNaN(date.getTime())) return acc;

		const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
		acc[key] = (acc[key] || 0) + parseMoney(item?.[amountKey]);
		return acc;
	}, {});
}

export function calculateRecognizedPaidRevenue(service) {
	return calculateServiceRecognizedPaidRevenue(service);
}

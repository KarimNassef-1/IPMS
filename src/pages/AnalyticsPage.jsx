import ModuleShell from "../components/layout/ModuleShell";
import { useEffect, useMemo, useState } from "react";
import {
	Area,
	Bar,
	CartesianGrid,
	Cell,
	ComposedChart,
	Legend,
	Line,
	Pie,
	PieChart,
	RadialBar,
	RadialBarChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
	BarChart,
} from "recharts";
import {
	getExpenses,
	getTransactions,
	subscribeExpenses,
	subscribeTransactions,
} from "../services/financeService";
import {
	getAllServices,
	getProjects,
	subscribeAllServices,
	subscribeProjects,
} from "../services/projectService";
import { getTasks, subscribeTasks } from "../services/taskService";
import { calculateRecognizedPaidRevenue, groupByMonth } from "../utils/calculations";
import { formatCurrency, parseMoney } from "../utils/helpers";
import { serviceAgencyShareValue } from "../utils/serviceFinance";
import { useAuth } from "../hooks/useAuth";
import {
	createAllowedServiceCategorySet,
	filterProjectsByVisibleServices,
	filterServicesByAccess,
} from "../utils/serviceAccess";

const PIE_COLORS = ["#8246f6", "#a989f8", "#d2c2ff", "#5f2fe2", "#7b5eea", "#b7a2fa"];
const TYPE_COLORS = ["#8246f6", "#22c55e"];

function monthLabel(monthKey) {
	const [year, month] = monthKey.split("-");
	const date = new Date(Number(year), Number(month) - 1, 1);
	return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function toMonthKey(rawDate) {
	if (!rawDate) return null;
	const date = new Date(rawDate);
	if (Number.isNaN(date.getTime())) return null;
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function toTrendDelta(current, previous) {
	const safeCurrent = Number(current) || 0;
	const safePrevious = Number(previous) || 0;
	const delta = safeCurrent - safePrevious;

	if (safePrevious === 0) {
		return {
			delta,
			percent: safeCurrent > 0 ? 100 : 0,
			up: delta >= 0,
		};
	}

	return {
		delta,
		percent: Math.abs((delta / safePrevious) * 100),
		up: delta >= 0,
	};
}

function TrendChip({ trend }) {
	if (!trend) {
		return <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">No trend</span>;
	}

	return (
		<span
			className={`rounded-full px-2 py-1 text-[11px] font-semibold ${trend.up ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
		>
			{trend.up ? "▲" : "▼"} {trend.percent.toFixed(1)}%
		</span>
	);
}

function ChartTooltip({ active, payload, label }) {
	if (!active || !payload || !payload.length) return null;

	return (
		<div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
			<p className="mb-1 text-xs font-semibold text-slate-500">{label}</p>
			<div className="space-y-1 text-xs">
				{payload.map((entry) => (
					<p key={entry.dataKey} className="flex items-center gap-2 text-slate-700">
						<span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
						<span className="font-medium">{entry.name}:</span>
						<span>{formatCurrency(entry.value)}</span>
					</p>
				))}
			</div>
		</div>
	);
}

export default function AnalyticsPage() {
	const { isAdmin, serviceCategories } = useAuth();
	const allowedCategorySet = useMemo(
		() => createAllowedServiceCategorySet(serviceCategories),
		[serviceCategories],
	);
	const [transactions, setTransactions] = useState([]);
	const [expenses, setExpenses] = useState([]);
	const [projects, setProjects] = useState([]);
	const [services, setServices] = useState([]);
	const [tasks, setTasks] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		let unsubscribers = [];
		let latestServices = [];
		let latestProjects = [];

		const applyProjectScope = (projectItems, scopedServiceItems) => {
			if (isAdmin) return projectItems;
			return filterProjectsByVisibleServices(projectItems, scopedServiceItems);
		};

		async function initialize() {
			setLoading(true);
			setError("");

			try {
				const [tx, ex, pr, se, ta] = await Promise.all([
					getTransactions(),
					getExpenses(),
					getProjects(),
					getAllServices(),
					getTasks(),
				]);

				const scopedServices = filterServicesByAccess(se, {
					isAdmin,
					allowedCategorySet,
				});
				const scopedProjects = applyProjectScope(pr, scopedServices);
				latestServices = scopedServices;
				latestProjects = pr;

				setTransactions(tx);
				setExpenses(ex);
				setProjects(scopedProjects);
				setServices(scopedServices);
				setTasks(ta);

				const onStreamError = (streamError) => {
					setError(streamError?.message || "Analytics live stream disconnected.");
				};

				unsubscribers = [
					subscribeTransactions(setTransactions, onStreamError),
					subscribeExpenses(setExpenses, onStreamError),
					subscribeProjects((items) => {
						latestProjects = items;
						setProjects(applyProjectScope(items, latestServices));
					}, onStreamError),
					subscribeAllServices((items) => {
						const scopedServices = filterServicesByAccess(items, {
							isAdmin,
							allowedCategorySet,
						});
						latestServices = scopedServices;
						setServices(scopedServices);
						setProjects((currentProjects) => applyProjectScope(latestProjects.length ? latestProjects : currentProjects, scopedServices));
					}, onStreamError),
					subscribeTasks(setTasks, onStreamError),
				];
			} catch (loadError) {
				setError(loadError?.message || "Failed to load analytics data.");
			} finally {
				setLoading(false);
			}
		}

		initialize();

		return () => {
			unsubscribers.forEach((unsubscribe) => {
				if (typeof unsubscribe === "function") unsubscribe();
			});
		};
	}, [allowedCategorySet, isAdmin]);

	const analytics = useMemo(() => {
		const paidServices = services.filter((service) => service.chargeType !== "free");
		const paidServicesCount = paidServices.length;
		const totalRecognized = paidServices.reduce(
			(sum, service) => sum + Math.max(calculateRecognizedPaidRevenue(service), 0),
			0,
		);
		const totalAgencyShare = paidServices.reduce(
			(sum, service) => sum + Math.max(serviceAgencyShareValue(service), 0),
			0,
		);
		const totalPending = Math.max(totalAgencyShare - totalRecognized, 0);

		const totalExpenses = expenses.reduce((sum, item) => sum + parseMoney(item.amount), 0);
		const recognizedNet = totalRecognized - totalExpenses;

		const cashIn = transactions.reduce((sum, item) => sum + parseMoney(item.totalAmount), 0);
		const cashOut = totalExpenses;
		const cashPosition = cashIn - cashOut;
		const avgRecognizedPerService = paidServicesCount
			? totalRecognized / paidServicesCount
			: 0;
		const pendingShareRatio = totalAgencyShare
			? (totalPending / totalAgencyShare) * 100
			: 0;
		const expenseToRecognizedRatio = totalRecognized
			? (totalExpenses / totalRecognized) * 100
			: 0;

		const completedTasks = tasks.filter(
			(item) => String(item.status || "").toLowerCase() === "completed",
		).length;
		const completedProjects = projects.filter(
			(item) => String(item.status || "").toLowerCase() === "completed",
		).length;

		const taskCompletionRate = tasks.length ? (completedTasks / tasks.length) * 100 : 0;
		const projectCompletionRate = projects.length ? (completedProjects / projects.length) * 100 : 0;
		const plannerIncludedCount = paidServices.filter(
			(service) => service.includeInFinancialPlanner !== false,
		).length;
		const plannerCoverageRate = paidServices.length
			? (plannerIncludedCount / paidServices.length) * 100
			: 0;

		const incomeByMonth = paidServices.reduce((acc, service) => {
			const recognized = Math.max(calculateRecognizedPaidRevenue(service), 0);
			if (recognized <= 0) return acc;

			const monthKey = toMonthKey(service.paymentDate || service.updatedAt || service.createdAt);
			if (!monthKey) return acc;

			acc[monthKey] = (acc[monthKey] || 0) + recognized;
			return acc;
		}, {});

		const expenseByDateMonth = groupByMonth(expenses, "date", "amount");
		const expenseByCreatedMonth = groupByMonth(expenses, "createdAt", "amount");
		const expenseByMonth = { ...expenseByCreatedMonth };
		Object.entries(expenseByDateMonth).forEach(([month, value]) => {
			expenseByMonth[month] = Number(value) || 0;
		});
		const monthKeys = Array.from(
			new Set([...Object.keys(incomeByMonth), ...Object.keys(expenseByMonth)]),
		).sort();

		const trendData = monthKeys.map((key) => {
			const income = Number(incomeByMonth[key] || 0);
			const expense = Number(expenseByMonth[key] || 0);
			const net = income - expense;
			const margin = income ? (net / income) * 100 : 0;

			return {
				month: key,
				label: monthLabel(key),
				income,
				expenses: expense,
				net,
				margin,
			};
		});

		const latest = trendData[trendData.length - 1];
		const previous = trendData[trendData.length - 2];

		const recognizedTrend = toTrendDelta(
			totalRecognized,
			Math.max(totalRecognized - (latest?.income || 0), 0),
		);
		const expenseTrend = previous
			? toTrendDelta(latest?.expenses || 0, previous?.expenses || 0)
			: null;
		const netTrend = previous ? toTrendDelta(latest?.net || 0, previous?.net || 0) : null;

		const projectById = projects.reduce((acc, project) => {
			acc[project.id] = project;
			return acc;
		}, {});

		const clientTotals = paidServices.reduce((acc, service) => {
			const client = projectById[service.projectId]?.clientName || "Unknown";
			acc[client] = (acc[client] || 0) + Math.max(calculateRecognizedPaidRevenue(service), 0);
			return acc;
		}, {});

		const clientDataRaw = Object.entries(clientTotals)
			.map(([name, value]) => ({
				name,
				value: Number(value) || 0,
			}))
			.sort((a, b) => b.value - a.value)
			.slice(0, 7);

		const clientTotal = clientDataRaw.reduce((sum, item) => sum + item.value, 0);
		const clientData = clientDataRaw.map((item) => ({
			...item,
			share: clientTotal ? (item.value / clientTotal) * 100 : 0,
		}));
		const topClientShare = clientData[0]?.share || 0;

		const expenseByCategory = expenses.reduce((acc, item) => {
			const category = item.category || "Uncategorized";
			acc[category] = (acc[category] || 0) + parseMoney(item.amount);
			return acc;
		}, {});

		const expenseMix = Object.entries(expenseByCategory)
			.map(([name, value]) => ({ name, value: Number(value) || 0 }))
			.sort((a, b) => b.value - a.value)
			.slice(0, 6);

		const deliveryTotals = paidServices.reduce(
			(acc, service) => {
				const key = service.deliveryType === "outsource" ? "Outsource" : "Inhouse";
				acc[key] += Math.max(calculateRecognizedPaidRevenue(service), 0);
				return acc;
			},
			{ Inhouse: 0, Outsource: 0 },
		);

		const deliveryData = Object.entries(deliveryTotals).map(([name, value]) => ({
			name,
			value,
		}));

		const projectRows = projects
			.map((project) => {
				const projectServices = paidServices.filter((service) => service.projectId === project.id);
				const recognized = projectServices.reduce(
					(sum, service) => sum + Math.max(calculateRecognizedPaidRevenue(service), 0),
					0,
				);
				const share = projectServices.reduce(
					(sum, service) => sum + Math.max(serviceAgencyShareValue(service), 0),
					0,
				);

				return {
					id: project.id,
					projectName: project.projectName || "Untitled project",
					status: project.status || "Unknown",
					recognized,
					pending: Math.max(share - recognized, 0),
					services: projectServices.length,
				};
			})
			.filter((item) => item.recognized > 0 || item.pending > 0)
			.sort((a, b) => b.recognized - a.recognized)
			.slice(0, 8);

		const projectStatusMix = Object.entries(
			projects.reduce((acc, project) => {
				const status = project.status || "Unknown";
				acc[status] = (acc[status] || 0) + 1;
				return acc;
			}, {}),
		)
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 6);

		const latest3Months = trendData.slice(-3);
		const runRate = latest3Months.length
			? latest3Months.reduce(
					(acc, item) => {
						acc.income += item.income;
						acc.expenses += item.expenses;
						acc.net += item.net;
						return acc;
					},
					{ income: 0, expenses: 0, net: 0 },
				)
			: { income: 0, expenses: 0, net: 0 };

		const runRateMonthly = latest3Months.length
			? {
					income: runRate.income / latest3Months.length,
					expenses: runRate.expenses / latest3Months.length,
					net: runRate.net / latest3Months.length,
				}
			: { income: 0, expenses: 0, net: 0 };

		return {
			totalRecognized,
			totalAgencyShare,
			totalPending,
			totalExpenses,
			recognizedNet,
			cashPosition,
			taskCompletionRate,
			projectCompletionRate,
			plannerCoverageRate,
			paidServicesCount,
			avgRecognizedPerService,
			pendingShareRatio,
			expenseToRecognizedRatio,
			topClientShare,
			trendData,
			recognizedTrend,
			expenseTrend,
			netTrend,
			clientData,
			expenseMix,
			deliveryData,
			projectRows,
			projectStatusMix,
			runRateMonthly,
		};
	}, [expenses, projects, services, tasks, transactions]);

	const performanceRings = [
		{
			name: "Task Completion",
			value: Number(analytics.taskCompletionRate.toFixed(1)),
			fill: "#22c55e",
		},
		{
			name: "Project Completion",
			value: Number(analytics.projectCompletionRate.toFixed(1)),
			fill: "#8246f6",
		},
		{
			name: "Planner Coverage",
			value: Number(analytics.plannerCoverageRate.toFixed(1)),
			fill: "#06b6d4",
		},
	];

	return (
		<ModuleShell
			title="Analytics"
			description="High-signal analytics across recognition quality, cash dynamics, concentration, and operational execution."
		>
			<section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
				<div className="ip-stat-card">
					<p className="text-xs uppercase tracking-wider text-slate-500">Paid Services</p>
					<p className="mt-2 text-2xl font-black text-slate-900">{analytics.paidServicesCount}</p>
				</div>
				<div className="ip-stat-card">
					<p className="text-xs uppercase tracking-wider text-slate-500">Avg Recognized / Service</p>
					<p className="mt-2 text-2xl font-black text-sky-700">{formatCurrency(analytics.avgRecognizedPerService)}</p>
				</div>
				<div className="ip-stat-card">
					<p className="text-xs uppercase tracking-wider text-slate-500">Pending Share Ratio</p>
					<p className="mt-2 text-2xl font-black text-amber-700">{analytics.pendingShareRatio.toFixed(1)}%</p>
				</div>
				<div className="ip-stat-card">
					<p className="text-xs uppercase tracking-wider text-slate-500">Expense / Recognized</p>
					<p className={`mt-2 text-2xl font-black ${analytics.expenseToRecognizedRatio > 100 ? 'text-rose-700' : 'text-emerald-700'}`}>
						{analytics.expenseToRecognizedRatio.toFixed(1)}%
					</p>
				</div>
				<div className="ip-stat-card">
					<p className="text-xs uppercase tracking-wider text-slate-500">Top Client Share</p>
					<p className="mt-2 text-2xl font-black text-violet-700">{analytics.topClientShare.toFixed(1)}%</p>
				</div>
			</section>

			<section className="ip-surface-section bg-gradient-to-br from-white via-slate-50 to-indigo-50">
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
					<div className="ip-stat-card">
						<div className="flex items-center justify-between">
							<p className="text-xs uppercase tracking-wider text-slate-500">Recognized Paid</p>
							<TrendChip trend={analytics.recognizedTrend} />
						</div>
						<p className="mt-2 text-2xl font-black text-slate-900">{formatCurrency(analytics.totalRecognized)}</p>
					</div>
					<div className="ip-stat-card">
						<div className="flex items-center justify-between">
							<p className="text-xs uppercase tracking-wider text-slate-500">Expenses</p>
							<TrendChip trend={analytics.expenseTrend} />
						</div>
						<p className="mt-2 text-2xl font-black text-rose-700">{formatCurrency(analytics.totalExpenses)}</p>
					</div>
					<div className="ip-stat-card">
						<div className="flex items-center justify-between">
							<p className="text-xs uppercase tracking-wider text-slate-500">Recognized Net</p>
							<TrendChip trend={analytics.netTrend} />
						</div>
						<p className={`mt-2 text-2xl font-black ${analytics.recognizedNet >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
							{formatCurrency(analytics.recognizedNet)}
						</p>
					</div>
					<div className="ip-stat-card">
						<p className="text-xs uppercase tracking-wider text-slate-500">Pending Share</p>
						<p className="mt-2 text-2xl font-black text-amber-700">{formatCurrency(analytics.totalPending)}</p>
					</div>
					<div className="ip-stat-card">
						<p className="text-xs uppercase tracking-wider text-slate-500">Cash Position</p>
						<p className={`mt-2 text-2xl font-black ${analytics.cashPosition >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
							{formatCurrency(analytics.cashPosition)}
						</p>
					</div>
				</div>

				{loading ? <p className="mt-3 text-sm text-slate-600">Loading live analytics...</p> : null}
				{error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
			</section>

			<section className="mt-6 grid gap-4 xl:grid-cols-3">
				<div className="ip-surface-section xl:col-span-2">
					<div className="mb-3 flex items-end justify-between gap-2">
						<div>
							<h4 className="font-bold text-slate-900">Financial Momentum</h4>
							<p className="text-xs text-slate-500">Income area, expense bars, and net line by month.</p>
						</div>
					</div>
					<div className="h-80">
						{analytics.trendData.length ? (
							<ResponsiveContainer width="100%" height="100%">
								<ComposedChart data={analytics.trendData}>
									<CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" />
									<XAxis dataKey="label" tick={{ fontSize: 12 }} />
									<YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} width={48} />
									<Tooltip content={<ChartTooltip />} />
									<Legend />
									<Area type="monotone" dataKey="income" name="Income" fill="#c7b4ff" stroke="#8246f6" strokeWidth={2.2} />
									<Bar dataKey="expenses" name="Expenses" fill="#fca5a5" radius={[6, 6, 0, 0]} />
									<Line type="monotone" dataKey="net" name="Net" stroke="#16a34a" strokeWidth={2.6} dot={{ r: 2 }} />
								</ComposedChart>
							</ResponsiveContainer>
						) : (
							<p className="text-sm text-slate-600">No monthly trend data yet.</p>
						)}
					</div>
				</div>

				<div className="ip-surface-section">
					<h4 className="font-bold text-slate-900">Execution Quality</h4>
					<p className="text-xs text-slate-500">Operational rates calibrated to 100% target.</p>
					<div className="mt-3 h-80">
						<ResponsiveContainer width="100%" height="100%">
							<RadialBarChart innerRadius="18%" outerRadius="95%" data={performanceRings} startAngle={180} endAngle={0}>
								<RadialBar minAngle={12} background clockWise dataKey="value" />
								<Legend iconSize={10} layout="horizontal" verticalAlign="bottom" align="center" />
								<Tooltip formatter={(value) => `${value}%`} />
							</RadialBarChart>
						</ResponsiveContainer>
					</div>
				</div>
			</section>

			<section className="mt-6 grid gap-4 xl:grid-cols-2">
				<div className="ip-surface-section">
					<h4 className="font-bold text-slate-900">Client Revenue Concentration</h4>
					<p className="text-xs text-slate-500">Top clients by recognized paid and concentration share.</p>
					<div className="mt-3 h-80">
						{analytics.clientData.length ? (
							<ResponsiveContainer width="100%" height="100%">
								<BarChart data={analytics.clientData} layout="vertical" margin={{ left: 8, right: 10, top: 8, bottom: 8 }}>
									<CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" />
									<XAxis type="number" tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
									<YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
									<Tooltip formatter={(value) => formatCurrency(value)} />
									<Bar dataKey="value" name="Recognized" radius={[0, 8, 8, 0]} fill="#8246f6" />
								</BarChart>
							</ResponsiveContainer>
						) : (
							<p className="text-sm text-slate-600">No client concentration data yet.</p>
						)}
					</div>
				</div>

				<div className="ip-surface-section">
					<h4 className="font-bold text-slate-900">Expense Mix & Delivery Split</h4>
					<p className="text-xs text-slate-500">Category burn profile and recognized delivery composition.</p>
					<div className="mt-3 grid gap-3 md:grid-cols-2">
						<div className="h-72 rounded-2xl bg-slate-50 p-2">
							{analytics.expenseMix.length ? (
								<ResponsiveContainer width="100%" height="100%">
									<PieChart>
										<Pie data={analytics.expenseMix} dataKey="value" nameKey="name" innerRadius={48} outerRadius={82} paddingAngle={2}>
											{analytics.expenseMix.map((entry, index) => (
												<Cell key={`${entry.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
											))}
										</Pie>
										<Tooltip formatter={(value) => formatCurrency(value)} />
										<Legend iconSize={9} />
									</PieChart>
								</ResponsiveContainer>
							) : (
								<p className="p-2 text-sm text-slate-600">No expense categories yet.</p>
							)}
						</div>

						<div className="h-72 rounded-2xl bg-slate-50 p-2">
							<ResponsiveContainer width="100%" height="100%">
								<PieChart>
									<Pie data={analytics.deliveryData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={82}>
										{analytics.deliveryData.map((entry, index) => (
											<Cell key={`${entry.name}-${index}`} fill={TYPE_COLORS[index % TYPE_COLORS.length]} />
										))}
									</Pie>
									<Tooltip formatter={(value) => formatCurrency(value)} />
									<Legend iconSize={9} />
								</PieChart>
							</ResponsiveContainer>
						</div>
					</div>
				</div>
			</section>

			<section className="mt-6 grid gap-4 xl:grid-cols-2">
				<div className="ip-surface-section">
					<h4 className="font-bold text-slate-900">Project Status Mix</h4>
					<p className="text-xs text-slate-500">Distribution of projects by current lifecycle status.</p>
					<div className="mt-3 h-72">
						{analytics.projectStatusMix.length ? (
							<ResponsiveContainer width="100%" height="100%">
								<BarChart data={analytics.projectStatusMix}>
									<CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" />
									<XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
									<YAxis allowDecimals={false} />
									<Tooltip />
									<Bar dataKey="count" fill="#8246f6" radius={[8, 8, 0, 0]} />
								</BarChart>
							</ResponsiveContainer>
						) : (
							<p className="text-sm text-slate-600">No project status data yet.</p>
						)}
					</div>
				</div>

				<div className="ip-surface-section">
					<h4 className="font-bold text-slate-900">3-Month Run Rate</h4>
					<p className="text-xs text-slate-500">Average monthly pace based on the latest 3 months of activity.</p>
					<div className="mt-4 grid gap-3 sm:grid-cols-3">
						<div className="rounded-2xl bg-slate-50 p-3">
							<p className="text-xs text-slate-500">Income</p>
							<p className="mt-1 text-xl font-black text-slate-900">{formatCurrency(analytics.runRateMonthly.income)}</p>
						</div>
						<div className="rounded-2xl bg-rose-50 p-3">
							<p className="text-xs text-rose-700">Expenses</p>
							<p className="mt-1 text-xl font-black text-rose-700">{formatCurrency(analytics.runRateMonthly.expenses)}</p>
						</div>
						<div className="rounded-2xl bg-emerald-50 p-3">
							<p className="text-xs text-emerald-700">Net</p>
							<p className="mt-1 text-xl font-black text-emerald-700">{formatCurrency(analytics.runRateMonthly.net)}</p>
						</div>
					</div>
				</div>
			</section>

			<section className="ip-surface-section mt-6">
				<div className="mb-3 flex items-end justify-between gap-2">
					<div>
						<h4 className="font-bold text-slate-900">Top Project Intelligence</h4>
						<p className="text-xs text-slate-500">Recognized vs pending by project for prioritization.</p>
					</div>
				</div>

				<div className="ip-table-wrap">
					<table className="ip-table">
						<thead>
							<tr>
								<th>Project</th>
								<th>Status</th>
								<th>Services</th>
								<th>Recognized</th>
								<th>Pending</th>
							</tr>
						</thead>
						<tbody>
							{analytics.projectRows.length ? (
								analytics.projectRows.map((row) => (
									<tr key={row.id}>
										<td className="font-semibold text-slate-900">{row.projectName}</td>
										<td>{row.status}</td>
										<td>{row.services}</td>
										<td className="text-sky-700">{formatCurrency(row.recognized)}</td>
										<td className="text-amber-700">{formatCurrency(row.pending)}</td>
									</tr>
								))
							) : (
								<tr>
									<td className="text-slate-500" colSpan={5}>
										No project analytics rows yet.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</section>
		</ModuleShell>
	);
}

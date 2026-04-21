import ModuleShell from '../components/layout/ModuleShell'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getExpenses,
  getTransactions,
  subscribeExpenses,
  subscribeTransactions,
} from '../services/financeService'
import {
  getAllServices,
  getProjects,
  subscribeAllServices,
  subscribeProjects,
} from '../services/projectService'
import { getTasks, subscribeTasks } from '../services/taskService'
import { calculateRecognizedPaidRevenue } from '../utils/calculations'
import { formatCurrency, formatDate, parseMoney } from '../utils/helpers'
import { serviceAgencyShareValue, serviceContractValue } from '../utils/serviceFinance'
import { useAuth } from '../hooks/useAuth'
import {
  createAllowedServiceCategorySet,
  filterProjectsByVisibleServices,
  filterServicesByAccess,
} from '../utils/serviceAccess'

function isPendingInstallment(installment) {
  return String(installment?.status || '').toLowerCase() !== 'paid'
}

function toDateOrNull(rawValue) {
  if (!rawValue) return null
  const date = new Date(rawValue)
  if (Number.isNaN(date.getTime())) return null
  return date
}

export default function DashboardPage() {
  const { isAdmin, isPartner, serviceCategories } = useAuth()
  const hasFullFinancialAccess = isAdmin || isPartner
  const allowedCategorySet = useMemo(
    () => createAllowedServiceCategorySet(serviceCategories),
    [serviceCategories],
  )
  const [transactions, setTransactions] = useState([])
  const [expenses, setExpenses] = useState([])
  const [projects, setProjects] = useState([])
  const [services, setServices] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')

  useEffect(() => {
    let unsubscribers = []
    let latestServices = []
    let latestProjects = []

    const applyProjectScope = (projectItems, scopedServiceItems) => {
      if (hasFullFinancialAccess) return projectItems
      return filterProjectsByVisibleServices(projectItems, scopedServiceItems)
    }

    async function initialize() {
      setLoading(true)
      setError('')

      try {
        const [tx, ex, pr, sv, ta] = await Promise.all([
          getTransactions(),
          getExpenses(),
          getProjects(),
          getAllServices(),
          getTasks(),
        ])

        const scopedServices = filterServicesByAccess(sv, {
          isAdmin: hasFullFinancialAccess,
          allowedCategorySet,
        })
        const scopedProjects = hasFullFinancialAccess
          ? pr
          : filterProjectsByVisibleServices(pr, scopedServices)
        latestServices = scopedServices
        latestProjects = pr

        setTransactions(tx)
        setExpenses(ex)
        setProjects(scopedProjects)
        setServices(scopedServices)
        setTasks(ta)
        setLastUpdated(new Date().toISOString())

        const handleStreamError = (streamError) => {
          setError(streamError?.message || 'Unable to keep dashboard streams connected.')
        }

        unsubscribers = [
          subscribeTransactions((items) => {
            setTransactions(items)
            setLastUpdated(new Date().toISOString())
          }, handleStreamError),
          subscribeExpenses((items) => {
            setExpenses(items)
            setLastUpdated(new Date().toISOString())
          }, handleStreamError),
          subscribeProjects((items) => {
            latestProjects = items
            const scopedProjects = applyProjectScope(items, latestServices)
            setProjects(scopedProjects)
            setLastUpdated(new Date().toISOString())
          }, handleStreamError),
          subscribeAllServices((items) => {
            const scopedServices = filterServicesByAccess(items, {
              isAdmin: hasFullFinancialAccess,
              allowedCategorySet,
            })
            latestServices = scopedServices

            setServices(scopedServices)
            setProjects((currentProjects) => applyProjectScope(latestProjects.length ? latestProjects : currentProjects, scopedServices))
            setLastUpdated(new Date().toISOString())
          }, handleStreamError),
          subscribeTasks((items) => {
            setTasks(items)
            setLastUpdated(new Date().toISOString())
          }, handleStreamError),
        ]
      } catch (loadError) {
        setError(loadError?.message || 'Failed to load dashboard data.')
      } finally {
        setLoading(false)
      }
    }

    initialize()

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') unsubscribe()
      })
    }
  }, [allowedCategorySet, hasFullFinancialAccess])

  const dashboardData = useMemo(() => {
    const projectNameById = projects.reduce((acc, project) => {
      acc[project.id] = project.projectName || 'Untitled project'
      return acc
    }, {})

    const financialServices = services
      .filter((service) => service.chargeType !== 'free')
      .map((service) => {
        const contractValue = Math.max(serviceContractValue(service), 0)
        const agencyShare = Math.max(serviceAgencyShareValue(service), 0)
        const recognizedPaid = Math.max(calculateRecognizedPaidRevenue(service), 0)
        const pendingShare = Math.max(agencyShare - recognizedPaid, 0)

        return {
          ...service,
          projectName: projectNameById[service.projectId] || 'Unknown project',
          contractValue,
          agencyShare,
          recognizedPaid,
          pendingShare,
        }
      })

    const totalContractValue = financialServices.reduce((sum, item) => sum + item.contractValue, 0)
    const totalAgencyShare = financialServices.reduce((sum, item) => sum + item.agencyShare, 0)
    const totalRecognizedPaid = financialServices.reduce((sum, item) => sum + item.recognizedPaid, 0)
    const totalPendingShare = financialServices.reduce((sum, item) => sum + item.pendingShare, 0)

    const totalIncome = transactions.reduce((sum, item) => sum + parseMoney(item.totalAmount), 0)
    const totalExpenses = expenses.reduce((sum, item) => sum + parseMoney(item.amount), 0)
    const cashPosition = totalIncome - totalExpenses

    const completedTasks = tasks.filter(
      (item) => String(item.status || '').toLowerCase() === 'completed',
    ).length
    const openTasks = tasks.length - completedTasks
    const taskCompletionRate = tasks.length ? (completedTasks / tasks.length) * 100 : 0

    const activeProjects = projects.filter(
      (item) => String(item.status || '').toLowerCase() !== 'completed',
    ).length
    const completedProjects = projects.length - activeProjects

    const recognizedServices = financialServices
      .filter((item) => item.recognizedPaid > 0)
      .sort((a, b) => b.recognizedPaid - a.recognizedPaid)

    const projectFinancialRows = projects
      .map((project) => {
        const projectServices = financialServices.filter((service) => service.projectId === project.id)
        const contractValue = projectServices.reduce((sum, item) => sum + item.contractValue, 0)
        const agencyShare = projectServices.reduce((sum, item) => sum + item.agencyShare, 0)
        const recognizedPaid = projectServices.reduce((sum, item) => sum + item.recognizedPaid, 0)
        const pendingShare = projectServices.reduce((sum, item) => sum + item.pendingShare, 0)

        return {
          id: project.id,
          projectName: project.projectName || 'Untitled project',
          status: project.status || 'Unknown',
          serviceCount: projectServices.length,
          contractValue,
          agencyShare,
          recognizedPaid,
          pendingShare,
        }
      })
      .sort((a, b) => b.recognizedPaid - a.recognizedPaid)

    return {
      totalContractValue,
      totalAgencyShare,
      totalRecognizedPaid,
      totalPendingShare,
      totalIncome,
      totalExpenses,
      cashPosition,
      taskCompletionRate,
      completedTasks,
      openTasks,
      activeProjects,
      completedProjects,
      recognizedServices,
      projectFinancialRows,
      serviceCount: financialServices.length,
    }
  }, [expenses, projects, services, tasks, transactions])

  const missionData = useMemo(() => {
    const projectNameById = projects.reduce((acc, project) => {
      acc[project.id] = project.projectName || 'Untitled project'
      return acc
    }, {})

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endWindow = new Date(startOfToday)
    endWindow.setDate(endWindow.getDate() + 30)

    const highPendingServices = services
      .filter((service) => service.chargeType !== 'free')
      .map((service) => {
        const agencyShare = Math.max(serviceAgencyShareValue(service), 0)
        const recognized = Math.max(calculateRecognizedPaidRevenue(service), 0)
        const pending = Math.max(agencyShare - recognized, 0)

        return {
          id: service.id,
          projectName: projectNameById[service.projectId] || 'Unknown project',
          serviceName: service.serviceName || 'Service',
          pending,
        }
      })
      .filter((item) => item.pending > 0)
      .sort((a, b) => b.pending - a.pending)
      .slice(0, 3)

    const pendingInstallments = services
      .flatMap((service) => {
        const projectName = projectNameById[service.projectId] || 'Unknown project'
        return (Array.isArray(service.installments) ? service.installments : [])
          .filter((installment) => isPendingInstallment(installment))
          .map((installment) => {
            const dueDate = toDateOrNull(installment?.dueDate)
            return {
              type: 'incoming',
              source: 'installment',
              projectName,
              serviceName: service.serviceName || 'Service',
              amount: Math.max(Number(installment?.amount) || 0, 0),
              dueDate,
            }
          })
      })
      .filter((item) => item.amount > 0)

    const overdueInstallments = pendingInstallments.filter(
      (item) => item.dueDate && item.dueDate < startOfToday,
    )

    const overdueInstallmentsTotal = overdueInstallments.reduce(
      (sum, item) => sum + item.amount,
      0,
    )

    const highPriorityOpenTasks = tasks.filter((task) => {
      const status = String(task?.status || '').toLowerCase()
      const priority = String(task?.priority || '').toLowerCase()
      return status !== 'completed' && (priority === 'high' || priority === 'urgent')
    }).length

    const thisMonthExpenses = expenses
      .filter((expense) => {
        const date = toDateOrNull(expense.date || expense.createdAt)
        if (!date) return false
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
      })
      .reduce((sum, expense) => sum + parseMoney(expense.amount), 0)

    const alerts = []

    if (overdueInstallments.length > 0) {
      alerts.push({
        id: 'overdue-installments',
        level: 'critical',
        title: `Overdue installments (${overdueInstallments.length})`,
        detail: `${formatCurrency(overdueInstallmentsTotal)} needs immediate collection follow-up.`,
        actionLabel: 'Open Financials',
        to: '/financials',
      })
    }

    if (highPendingServices.length > 0) {
      alerts.push({
        id: 'high-pending-services',
        level: 'warning',
        title: 'Services with highest pending share',
        detail: highPendingServices
          .map((item) => `${item.projectName}: ${formatCurrency(item.pending)}`)
          .join(' • '),
        actionLabel: 'Review Projects',
        to: '/projects',
      })
    }

    if (highPriorityOpenTasks > 0) {
      alerts.push({
        id: 'urgent-tasks',
        level: 'warning',
        title: `High-priority open tasks (${highPriorityOpenTasks})`,
        detail: 'Execution risk is rising. Close urgent tasks to protect delivery timelines.',
        actionLabel: 'Open Tasks',
        to: '/tasks',
      })
    }

    if (dashboardData.cashPosition < 0) {
      alerts.push({
        id: 'negative-cash',
        level: 'critical',
        title: 'Cash position is negative',
        detail: `Current cash position is ${formatCurrency(dashboardData.cashPosition)}.`,
        actionLabel: 'Open Expenses',
        to: '/expenses',
      })
    }

    if (thisMonthExpenses > dashboardData.totalRecognizedPaid) {
      alerts.push({
        id: 'burn-rate',
        level: 'warning',
        title: 'Monthly burn exceeds recognized paid',
        detail: `This month expenses ${formatCurrency(thisMonthExpenses)} are above recognized ${formatCurrency(dashboardData.totalRecognizedPaid)}.`,
        actionLabel: 'Open Analytics',
        to: '/analytics',
      })
    }

    const outgoingExpenses = expenses
      .map((expense) => {
        const date = toDateOrNull(expense.date || expense.createdAt)
        return {
          type: 'outgoing',
          source: 'expense',
          projectName: expense.category || 'Expense',
          serviceName: expense.name || 'Expense item',
          amount: Math.max(parseMoney(expense.amount), 0),
          dueDate: date,
        }
      })
      .filter((item) => item.amount > 0 && item.dueDate)

    const next30Calendar = [...pendingInstallments, ...outgoingExpenses]
      .filter((item) => item.dueDate && item.dueDate >= startOfToday && item.dueDate <= endWindow)
      .sort((a, b) => a.dueDate - b.dueDate)
      .slice(0, 10)

    const next30Incoming = next30Calendar
      .filter((item) => item.type === 'incoming')
      .reduce((sum, item) => sum + item.amount, 0)

    const next30Outgoing = next30Calendar
      .filter((item) => item.type === 'outgoing')
      .reduce((sum, item) => sum + item.amount, 0)

    return {
      alerts: alerts.slice(0, 5),
      next30Calendar,
      next30Incoming,
      next30Outgoing,
      highPriorityOpenTasks,
      overdueInstallmentsCount: overdueInstallments.length,
      overdueInstallmentsTotal,
      thisMonthExpenses,
    }
  }, [dashboardData.cashPosition, dashboardData.totalRecognizedPaid, expenses, projects, services, tasks])

  const liveCards = [
    {
      title: 'Recognized Paid (Agency)',
      value: formatCurrency(dashboardData.totalRecognizedPaid),
      accent: 'text-sky-700',
    },
    {
      title: 'Pending Share',
      value: formatCurrency(dashboardData.totalPendingShare),
      accent: 'text-amber-700',
    },
    {
      title: 'Agency Share Pipeline',
      value: formatCurrency(dashboardData.totalAgencyShare),
      accent: 'text-emerald-700',
    },
    {
      title: 'Total Contract Value',
      value: formatCurrency(dashboardData.totalContractValue),
      accent: 'text-slate-900',
    },
    {
      title: 'Cash Position',
      value: formatCurrency(dashboardData.cashPosition),
      accent: dashboardData.cashPosition >= 0 ? 'text-emerald-700' : 'text-rose-700',
    },
    {
      title: 'Task Completion',
      value: `${dashboardData.taskCompletionRate.toFixed(1)}%`,
      accent: 'text-violet-700',
    },
  ]

  const todayFocusItems = [
    {
      title: 'Overdue Installments',
      value: String(missionData.overdueInstallmentsCount || 0),
      caption: formatCurrency(missionData.overdueInstallmentsTotal || 0),
      tone:
        (missionData.overdueInstallmentsCount || 0) > 0
          ? 'text-rose-700 bg-rose-50 border-rose-100'
          : 'text-emerald-700 bg-emerald-50 border-emerald-100',
    },
    {
      title: 'High Priority Open Tasks',
      value: String(missionData.highPriorityOpenTasks || 0),
      caption: 'Need active follow-up',
      tone:
        (missionData.highPriorityOpenTasks || 0) > 0
          ? 'text-amber-700 bg-amber-50 border-amber-100'
          : 'text-emerald-700 bg-emerald-50 border-emerald-100',
    },
    {
      title: 'This Month Burn',
      value: formatCurrency(missionData.thisMonthExpenses || 0),
      caption: `vs recognized ${formatCurrency(dashboardData.totalRecognizedPaid)}`,
      tone:
        (missionData.thisMonthExpenses || 0) > dashboardData.totalRecognizedPaid
          ? 'text-rose-700 bg-rose-50 border-rose-100'
          : 'text-sky-700 bg-sky-50 border-sky-100',
    },
  ]

  return (
    <ModuleShell
      title="Dashboard"
      description="Live agency control center powered by real project, service, finance, and task data."
    >
      <section className="ip-surface-section bg-gradient-to-br from-white via-slate-50 to-sky-50">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-black text-slate-900 sm:text-lg">Executive Snapshot</h3>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] sm:gap-2 sm:text-xs">
            <span className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-700">
              Active Projects: {dashboardData.activeProjects}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
              Completed Projects: {dashboardData.completedProjects}
            </span>
            <span className="rounded-full bg-violet-100 px-3 py-1 font-semibold text-violet-700">
              Open Tasks: {dashboardData.openTasks}
            </span>
            <span className="rounded-full bg-sky-100 px-3 py-1 font-semibold text-sky-700">
              Services: {dashboardData.serviceCount}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {liveCards.map((card) => (
              <article key={card.title} className="ip-stat-card">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{card.title}</p>
                <p className={`mt-2 break-words text-xl font-black sm:text-2xl ${card.accent}`}>{card.value}</p>
              </article>
            ))}
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-white/90 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Today Focus</p>
            <div className="mt-2 space-y-2">
              {todayFocusItems.map((item) => (
                <div key={item.title} className={`rounded-xl border px-3 py-2 ${item.tone}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider">{item.title}</p>
                  <p className="mt-1 text-lg font-black">{item.value}</p>
                  <p className="text-[11px]">{item.caption}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <p className="text-slate-500">
            Financial cash flow: Income {formatCurrency(dashboardData.totalIncome)} / Expenses{' '}
            {formatCurrency(dashboardData.totalExpenses)}
          </p>
          <p className="text-slate-500">Last sync: {lastUpdated ? formatDate(lastUpdated) : '-'}</p>
        </div>

        {loading ? <p className="mt-2 text-sm text-slate-600">Loading live streams...</p> : null}
        {error ? <p className="mt-2 text-sm font-semibold text-rose-700">{error}</p> : null}
      </section>

      <section className="ip-surface-section mt-6">
        <div className="flex items-end justify-between gap-2">
          <div>
            <h4 className="font-bold text-slate-900">Top Recognized Services</h4>
            <p className="text-xs text-slate-500">Only real paid recognition from the services pipeline.</p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {!loading && dashboardData.recognizedServices.length === 0 ? (
            <p className="text-sm text-slate-600">No recognized paid services yet.</p>
          ) : null}

          {dashboardData.recognizedServices.slice(0, 6).map((service) => (
            <article key={service.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-slate-900 break-words">
                  {service.projectName} - {service.serviceName}
                </p>
                <span className="inline-flex w-fit rounded-full bg-sky-100 px-2 py-1 text-[11px] font-semibold text-sky-700">
                  Recognized {formatCurrency(service.recognizedPaid)}
                </span>
              </div>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                <p className="rounded-lg bg-white px-2 py-1 text-slate-700">
                  Contract: <span className="font-semibold">{formatCurrency(service.contractValue)}</span>
                </p>
                <p className="rounded-lg bg-white px-2 py-1 text-emerald-700">
                  Share: <span className="font-semibold">{formatCurrency(service.agencyShare)}</span>
                </p>
                <p className="rounded-lg bg-white px-2 py-1 text-amber-700">
                  Pending: <span className="font-semibold">{formatCurrency(service.pendingShare)}</span>
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="ip-surface-section mt-6">
        <div className="flex items-end justify-between gap-2">
          <div>
            <h4 className="font-bold text-slate-900">Project Financial Pulse</h4>
            <p className="text-xs text-slate-500">Live rollup per project from services and paid recognition.</p>
          </div>
        </div>

        <div className="mt-4 space-y-2 md:hidden">
          {dashboardData.projectFinancialRows.length === 0 ? (
            <p className="text-sm text-slate-600">No project financial data yet.</p>
          ) : (
            dashboardData.projectFinancialRows.map((row) => (
              <article key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900 break-words">{row.projectName}</p>
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">
                    {row.status}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <p className="rounded-lg bg-white px-2 py-1 text-slate-700">Services: <span className="font-semibold">{row.serviceCount}</span></p>
                  <p className="rounded-lg bg-white px-2 py-1 text-slate-700">Contract: <span className="font-semibold">{formatCurrency(row.contractValue)}</span></p>
                  <p className="rounded-lg bg-white px-2 py-1 text-emerald-700">Share: <span className="font-semibold">{formatCurrency(row.agencyShare)}</span></p>
                  <p className="rounded-lg bg-white px-2 py-1 text-sky-700">Recognized: <span className="font-semibold">{formatCurrency(row.recognizedPaid)}</span></p>
                  <p className="col-span-2 rounded-lg bg-white px-2 py-1 text-amber-700">Pending: <span className="font-semibold">{formatCurrency(row.pendingShare)}</span></p>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="ip-table-wrap mt-4 hidden md:block">
          <table className="ip-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Status</th>
                <th>Services</th>
                <th>Contract</th>
                <th>Agency Share</th>
                <th>Recognized</th>
                <th>Pending</th>
              </tr>
            </thead>
            <tbody>
              {dashboardData.projectFinancialRows.map((row) => (
                <tr key={row.id}>
                  <td className="font-semibold text-slate-900">{row.projectName}</td>
                  <td>{row.status}</td>
                  <td>{row.serviceCount}</td>
                  <td>{formatCurrency(row.contractValue)}</td>
                  <td>{formatCurrency(row.agencyShare)}</td>
                  <td className="text-sky-700">{formatCurrency(row.recognizedPaid)}</td>
                  <td className="text-amber-700">{formatCurrency(row.pendingShare)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ip-surface-section mt-6">
        <h4 className="font-bold text-slate-900">Execution Snapshot</h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Total Tasks</p>
            <p className="text-2xl font-black text-slate-900">{tasks.length}</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-3">
            <p className="text-xs text-emerald-700">Completed</p>
            <p className="text-2xl font-black text-emerald-800">{dashboardData.completedTasks}</p>
          </div>
          <div className="rounded-2xl bg-violet-50 p-3">
            <p className="text-xs text-violet-700">Open</p>
            <p className="text-2xl font-black text-violet-800">{dashboardData.openTasks}</p>
          </div>
          <div className="rounded-2xl bg-sky-50 p-3">
            <p className="text-xs text-sky-700">Completion Rate</p>
            <p className="text-2xl font-black text-sky-800">
              {dashboardData.taskCompletionRate.toFixed(1)}%
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-2">
        <article className="ip-surface-section">
          <div className="flex items-end justify-between gap-2">
            <div>
              <h4 className="font-bold text-slate-900">Smart Alerts</h4>
              <p className="text-xs text-slate-500">Immediate priorities based on live financial and execution signals.</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {missionData.alerts.length === 0 ? (
              <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                No critical alerts right now. Operations look stable.
              </p>
            ) : (
              missionData.alerts.map((alert) => (
                <div key={alert.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{alert.title}</p>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                        alert.level === 'critical'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {alert.level}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{alert.detail}</p>
                  <Link
                    to={alert.to}
                    className="mt-2 inline-flex min-h-9 items-center rounded-lg bg-[#f0e9ff] px-3 py-1.5 text-xs font-semibold text-[#6f39e7] transition hover:bg-[#e7dcff]"
                  >
                    {alert.actionLabel}
                  </Link>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="ip-surface-section">
          <div className="flex items-end justify-between gap-2">
            <div>
              <h4 className="font-bold text-slate-900">30-Day Cash Calendar</h4>
              <p className="text-xs text-slate-500">Upcoming incoming installments vs planned outgoing expenses.</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-xl bg-emerald-50 p-2">
              <p className="text-emerald-700">Incoming</p>
              <p className="mt-1 font-black text-emerald-800">{formatCurrency(missionData.next30Incoming)}</p>
            </div>
            <div className="rounded-xl bg-rose-50 p-2">
              <p className="text-rose-700">Outgoing</p>
              <p className="mt-1 font-black text-rose-800">{formatCurrency(missionData.next30Outgoing)}</p>
            </div>
            <div className="rounded-xl bg-sky-50 p-2">
              <p className="text-sky-700">Net</p>
              <p className="mt-1 font-black text-sky-800">
                {formatCurrency(missionData.next30Incoming - missionData.next30Outgoing)}
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {missionData.next30Calendar.length === 0 ? (
              <p className="text-sm text-slate-600">No calendar events in the next 30 days.</p>
            ) : (
              missionData.next30Calendar.map((event, index) => (
                <div key={`${event.source}-${event.projectName}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-semibold text-slate-900 break-words">
                      {event.projectName} - {event.serviceName}
                    </p>
                    <span
                      className={`inline-flex w-fit rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                        event.type === 'incoming'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {event.type}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {formatDate(event.dueDate)} - <span className="font-semibold">{formatCurrency(event.amount)}</span>
                  </p>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="ip-surface-section mt-6">
        <h4 className="font-bold text-slate-900">Quick Actions</h4>
        <p className="mt-1 text-xs text-slate-500">Jump into high-impact workflows in one click.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <Link to="/projects" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#f0e9ff] px-3 py-2 text-center text-sm font-semibold text-[#6f39e7] transition hover:bg-[#e7dcff]">
            Add / Update Service
          </Link>
          <Link to="/financials" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-sky-100 px-3 py-2 text-center text-sm font-semibold text-sky-700 transition hover:bg-sky-200">
            Review Recognition
          </Link>
          <Link to="/expenses" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-rose-100 px-3 py-2 text-center text-sm font-semibold text-rose-700 transition hover:bg-rose-200">
            Record Expense
          </Link>
          <Link to="/tasks" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-100 px-3 py-2 text-center text-sm font-semibold text-amber-700 transition hover:bg-amber-200">
            Create Follow-up Task
          </Link>
          <Link to="/team-users" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-100 px-3 py-2 text-center text-sm font-semibold text-emerald-700 transition hover:bg-emerald-200">
            Team Access Setup
          </Link>
        </div>
      </section>
    </ModuleShell>
  )
}

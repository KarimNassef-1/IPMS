import ModuleShell from '../components/layout/ModuleShell'
import { useEffect, useMemo, useState } from 'react'
import { getAllServices } from '../services/projectService'
import { getExpenses } from '../services/financeService'
import {
  DISTRIBUTION_PERCENTAGES,
  calculateDistribution,
  calculateRecognizedPaidRevenue,
} from '../utils/calculations'
import { formatCurrency, parseMoney } from '../utils/helpers'
import { useAuth } from '../hooks/useAuth'
import { createAllowedServiceCategorySet, filterServicesByAccess } from '../utils/serviceAccess'

const BUDGET_LABELS = {
  karimSalary: 'Karim Salary',
  youssefSalary: 'Youssef Salary',
  agencyOperations: 'Agency Tools / Operations',
  marketingSales: 'Marketing / Sales',
}

function resolveBudgetKeyForExpense(expense) {
  const category = String(expense.category || '').toLowerCase()
  const note = String(expense.note || expense.description || '').toLowerCase()

  if (category === 'marketing' || note.includes('marketing') || note.includes('sales')) {
    return 'marketingSales'
  }

  if (category === 'operations' || category === 'software' || category === 'equipment') {
    return 'agencyOperations'
  }

  if (note.includes('karim')) {
    return 'karimSalary'
  }

  if (note.includes('youssef')) {
    return 'youssefSalary'
  }

  return null
}

export default function BudgetsPage() {
  const { isAdmin, serviceCategories } = useAuth()
  const allowedCategorySet = useMemo(
    () => createAllowedServiceCategorySet(serviceCategories),
    [serviceCategories],
  )
  const [services, setServices] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)

  async function loadData() {
    setLoading(true)
    try {
      const [serviceData, expenseData] = await Promise.all([getAllServices(), getExpenses()])
      const scopedServices = filterServicesByAccess(serviceData, {
        isAdmin,
        allowedCategorySet,
      })

      setServices(scopedServices)
      setExpenses(expenseData)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [isAdmin, allowedCategorySet])

  const paidRevenueTotal = useMemo(() => {
    return services
      .filter((service) => service.chargeType !== 'free' && (Number(service.revenue) || 0) > 0)
      .reduce((sum, service) => sum + calculateRecognizedPaidRevenue(service), 0)
  }, [services])

  const plannerPaidServices = useMemo(
    () =>
      services.filter(
        (service) =>
          service.chargeType !== 'free' &&
          (Number(service.revenue) || 0) > 0 &&
          service.includeInFinancialPlanner !== false &&
          calculateRecognizedPaidRevenue(service) > 0,
      ),
    [services],
  )

  const excludedPaidRevenue = useMemo(
    () =>
      services
        .filter(
          (service) =>
            service.chargeType !== 'free' &&
            (Number(service.revenue) || 0) > 0 &&
            service.includeInFinancialPlanner === false,
        )
        .reduce((sum, service) => sum + calculateRecognizedPaidRevenue(service), 0),
    [services],
  )

  const allocation = useMemo(() => {
    const base = {
      karimSalary: 0,
      youssefSalary: 0,
      agencyOperations: 0,
      marketingSales: 0,
    }

    return plannerPaidServices.reduce((acc, service) => {
      const recognized = calculateRecognizedPaidRevenue(service)

      if (service.allocationMode === 'manual') {
        acc.karimSalary += Number(service?.manualAllocation?.karimSalary) || 0
        acc.youssefSalary += Number(service?.manualAllocation?.youssefSalary) || 0
        acc.agencyOperations += Number(service?.manualAllocation?.agencyOperations) || 0
        acc.marketingSales += Number(service?.manualAllocation?.marketingSales) || 0
        return acc
      }

      const autoDist = calculateDistribution(recognized)
      acc.karimSalary += Number(autoDist.karimSalary) || 0
      acc.youssefSalary += Number(autoDist.youssefSalary) || 0
      acc.agencyOperations += Number(autoDist.agencyOperations) || 0
      acc.marketingSales += Number(autoDist.marketingSales) || 0
      return acc
    }, base)
  }, [plannerPaidServices])

  const spentByBudget = useMemo(() => {
    return expenses.reduce((acc, expense) => {
      const key = resolveBudgetKeyForExpense(expense)
      if (!key) return acc
      acc[key] = (acc[key] || 0) + parseMoney(expense.amount)
      return acc
    }, {})
  }, [expenses])

  return (
    <ModuleShell
      title="Budgets"
      description="Auto budgets are fed from paid project revenue; manual allocations stay exactly as entered."
    >
      <div className="rounded-2xl border border-white/30 bg-white/80 p-4">
        <p className="text-xs text-slate-500">Source revenue (paid services only)</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[11px] text-slate-500">Total Paid Revenue</p>
            <p className="text-lg font-black text-slate-900">{formatCurrency(paidRevenueTotal)}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 px-3 py-2">
            <p className="text-[11px] text-emerald-700">Included in Planner</p>
            <p className="text-lg font-black text-emerald-700">{formatCurrency(plannerPaidServices.reduce((sum, item) => sum + calculateRecognizedPaidRevenue(item), 0))}</p>
          </div>
          <div className="rounded-xl bg-rose-50 px-3 py-2">
            <p className="text-[11px] text-rose-700">Excluded</p>
            <p className="text-lg font-black text-rose-700">{formatCurrency(excludedPaidRevenue)}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(DISTRIBUTION_PERCENTAGES).map(([key, percentage]) => {
          const allocated = Number(allocation[key]) || 0
          const spent = Number(spentByBudget[key]) || 0
          const remaining = allocated - spent
          const utilization = allocated > 0 ? Math.min((spent / allocated) * 100, 100) : 0

          return (
            <div key={key} className="rounded-2xl border border-white/30 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">{BUDGET_LABELS[key] || key}</p>
              <p className="text-sm text-slate-500">{percentage * 100}% allocation</p>
              <p className="mt-2 text-lg font-black text-slate-900">{formatCurrency(allocated)}</p>
              <p className="mt-1 text-xs text-slate-600">Spent: {formatCurrency(spent)}</p>
              <p className={remaining < 0 ? 'text-xs font-semibold text-rose-600' : 'text-xs font-semibold text-emerald-700'}>
                Remaining: {formatCurrency(remaining)}
              </p>
              <div className="mt-2 h-1.5 rounded-full bg-slate-200">
                <div
                  className={remaining < 0 ? 'h-1.5 rounded-full bg-rose-500' : 'h-1.5 rounded-full bg-[#8246f6]'}
                  style={{ width: `${utilization}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Utilization: {utilization.toFixed(1)}%</p>
            </div>
          )
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-white/30 bg-white/80 p-4">
        <h4 className="font-bold text-slate-900">Budget Mapping Notes</h4>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Marketing category expenses are counted under Marketing / Sales.</li>
          <li>Operations, Software, and Equipment expenses are counted under Agency Tools / Operations.</li>
          <li>Expenses with note containing Karim are counted under Karim Salary.</li>
          <li>Expenses with note containing Youssef are counted under Youssef Salary.</li>
        </ul>
        {loading ? <p className="mt-2 text-sm text-slate-500">Refreshing budget data...</p> : null}
      </div>
    </ModuleShell>
  )
}

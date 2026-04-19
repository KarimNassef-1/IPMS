import ModuleShell from '../components/layout/ModuleShell'
import { useEffect, useMemo, useState } from 'react'
import { getAllServices, getProjects } from '../services/projectService'
import {
  DISTRIBUTION_PERCENTAGES,
  calculateDistribution,
  calculateRecognizedPaidRevenue,
} from '../utils/calculations'
import { formatCurrency } from '../utils/helpers'
import {
  getServiceFinancialBreakdown,
  serviceAgencyShareValue,
  serviceContractValue,
} from '../utils/serviceFinance'

const DISTRIBUTION_LABELS = {
  karimSalary: 'Karim Salary',
  youssefSalary: 'Youssef Salary',
  agencyOperations: 'Agency Tools / Operations',
  marketingSales: 'Marketing / Sales',
}

export default function FinancialsPage() {
  const [services, setServices] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  async function loadData() {
    setLoading(true)
    try {
      const [serviceData, projectData] = await Promise.all([getAllServices(), getProjects()])
      setServices(serviceData)
      setProjects(projectData)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const projectNameById = useMemo(() => {
    return projects.reduce((acc, project) => {
      acc[project.id] = project.projectName || 'Untitled project'
      return acc
    }, {})
  }, [projects])

  const financialServices = useMemo(
    () =>
      services
        .filter((service) => service.chargeType !== 'free')
        .map((service) => {
          const breakdown = getServiceFinancialBreakdown(service)
          const agencyShareTotal = Math.max(serviceAgencyShareValue(service), 0)
          const contractValue = Math.max(serviceContractValue(service), 0)
          const recognizedPaidRevenue = Math.max(calculateRecognizedPaidRevenue(service), 0)
          const pendingRevenue = Math.max(agencyShareTotal - recognizedPaidRevenue, 0)

          return {
            ...service,
            contractValue,
            agencyShareTotal,
            recognizedPaidRevenue,
            pendingRevenue,
            breakdown,
          }
        }),
    [services],
  )

  const paidServices = useMemo(
    () => financialServices.filter((service) => service.recognizedPaidRevenue > 0),
    [financialServices],
  )

  const plannerServices = useMemo(
    () => paidServices.filter((service) => service.includeInFinancialPlanner !== false),
    [paidServices],
  )

  const excludedPlannerServices = useMemo(
    () => paidServices.filter((service) => service.includeInFinancialPlanner === false),
    [paidServices],
  )

  const summary = useMemo(() => {
    return financialServices.reduce(
      (acc, service) => {
        acc.contractTotal += service.contractValue
        acc.agencyShareTotal += service.agencyShareTotal
        acc.recognizedPaidTotal += service.recognizedPaidRevenue
        acc.pendingTotal += service.pendingRevenue
        return acc
      },
      {
        contractTotal: 0,
        agencyShareTotal: 0,
        recognizedPaidTotal: 0,
        pendingTotal: 0,
      },
    )
  }, [financialServices])

  const plannerRecognizedTotal = useMemo(
    () => plannerServices.reduce((sum, service) => sum + service.recognizedPaidRevenue, 0),
    [plannerServices],
  )

  const excludedRecognizedTotal = useMemo(
    () => excludedPlannerServices.reduce((sum, service) => sum + service.recognizedPaidRevenue, 0),
    [excludedPlannerServices],
  )

  const manualDistribution = useMemo(() => {
    const base = {
      karimSalary: 0,
      youssefSalary: 0,
      agencyOperations: 0,
      marketingSales: 0,
    }

    return plannerServices.reduce((acc, service) => {
      if (service.allocationMode === 'manual') {
        acc.karimSalary += Number(service?.manualAllocation?.karimSalary) || 0
        acc.youssefSalary += Number(service?.manualAllocation?.youssefSalary) || 0
        acc.agencyOperations += Number(service?.manualAllocation?.agencyOperations) || 0
        acc.marketingSales += Number(service?.manualAllocation?.marketingSales) || 0
      }

      return acc
    }, base)
  }, [plannerServices])

  const autoPlannerRecognizedTotal = useMemo(
    () =>
      plannerServices
        .filter((service) => service.allocationMode !== 'manual')
        .reduce((sum, service) => sum + (Number(service.recognizedPaidRevenue) || 0), 0),
    [plannerServices],
  )

  const autoDistribution = useMemo(
    () => calculateDistribution(autoPlannerRecognizedTotal),
    [autoPlannerRecognizedTotal],
  )

  const finalDistribution = useMemo(
    () => ({
      karimSalary: (Number(autoDistribution.karimSalary) || 0) + (Number(manualDistribution.karimSalary) || 0),
      youssefSalary:
        (Number(autoDistribution.youssefSalary) || 0) + (Number(manualDistribution.youssefSalary) || 0),
      agencyOperations:
        (Number(autoDistribution.agencyOperations) || 0) +
        (Number(manualDistribution.agencyOperations) || 0),
      marketingSales:
        (Number(autoDistribution.marketingSales) || 0) + (Number(manualDistribution.marketingSales) || 0),
    }),
    [autoDistribution, manualDistribution],
  )

  const serviceAllocationRows = useMemo(() => {
    return plannerServices.map((service) => {
      const recognized = Number(service.recognizedPaidRevenue) || 0
      const contract = Number(service.contractValue) || 0
      const agencyShare = Number(service.agencyShareTotal) || 0
      const pending = Number(service.pendingRevenue) || 0

      const manualTotal =
        (Number(service?.manualAllocation?.karimSalary) || 0) +
        (Number(service?.manualAllocation?.youssefSalary) || 0) +
        (Number(service?.manualAllocation?.agencyOperations) || 0) +
        (Number(service?.manualAllocation?.marketingSales) || 0)

      if (service.allocationMode === 'manual') {
        return {
          id: service.id,
          projectName: projectNameById[service.projectId] || 'Unknown project',
          serviceName: service.serviceName,
          mode: 'manual',
          contract,
          agencyShare,
          recognized,
          pending,
          karimSalary: Number(service?.manualAllocation?.karimSalary) || 0,
          youssefSalary: Number(service?.manualAllocation?.youssefSalary) || 0,
          agencyOperations: Number(service?.manualAllocation?.agencyOperations) || 0,
          marketingSales: Number(service?.manualAllocation?.marketingSales) || 0,
          manualDifference: recognized - manualTotal,
        }
      }

      const autoDist = calculateDistribution(recognized)
      return {
        id: service.id,
        projectName: projectNameById[service.projectId] || 'Unknown project',
        serviceName: service.serviceName,
        mode: 'auto',
        contract,
        agencyShare,
        recognized,
        pending,
        karimSalary: Number(autoDist.karimSalary) || 0,
        youssefSalary: Number(autoDist.youssefSalary) || 0,
        agencyOperations: Number(autoDist.agencyOperations) || 0,
        marketingSales: Number(autoDist.marketingSales) || 0,
        manualDifference: 0,
      }
    })
  }, [plannerServices, projectNameById])

  const manualMismatchCount = serviceAllocationRows.filter(
    (item) => item.mode === 'manual' && Math.abs(item.manualDifference) > 0.0001,
  ).length

  return (
    <ModuleShell
      title="Financial System"
      description="Clean financial dashboard sourced directly from Projects calculations."
    >
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-emerald-50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Financial Overview</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <p className="text-xs text-slate-500">Contract Value</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{formatCurrency(summary.contractTotal)}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-emerald-100">
            <p className="text-xs text-slate-500">Agency Share</p>
            <p className="mt-1 text-2xl font-black text-emerald-700">{formatCurrency(summary.agencyShareTotal)}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-sky-100">
            <p className="text-xs text-slate-500">Recognized Paid</p>
            <p className="mt-1 text-2xl font-black text-sky-700">{formatCurrency(summary.recognizedPaidTotal)}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-amber-100">
            <p className="text-xs text-slate-500">Pending Share</p>
            <p className="mt-1 text-2xl font-black text-amber-700">{formatCurrency(summary.pendingTotal)}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-700">
            Planner Included: {formatCurrency(plannerRecognizedTotal)}
          </span>
          <span className="rounded-full bg-rose-100 px-3 py-1 font-semibold text-rose-700">
            Excluded: {formatCurrency(excludedRecognizedTotal)}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
            Paid Services: {paidServices.length}
          </span>
          <span className={manualMismatchCount > 0 ? 'rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700' : 'rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-700'}>
            Manual Mismatches: {manualMismatchCount}
          </span>
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h4 className="font-bold text-slate-900">Distribution Snapshot</h4>
            <p className="text-xs text-slate-500">Auto uses recognized paid. Manual uses exact values from Projects.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(DISTRIBUTION_PERCENTAGES).map(([key, value]) => (
            <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wider text-slate-500">{DISTRIBUTION_LABELS[key] || key}</p>
              <p className="text-[11px] text-slate-500">Auto default: {value * 100}%</p>
              <p className="mt-1 text-xl font-black text-slate-900">{formatCurrency(finalDistribution[key] || 0)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h4 className="font-bold text-slate-900">Recognized Services</h4>
            <p className="text-xs text-slate-500">Per-service contract, share, recognized, and pending values.</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {loading ? <p className="text-sm text-slate-600">Loading services...</p> : null}
          {!loading && paidServices.length === 0 ? <p className="text-sm text-slate-600">No paid services yet.</p> : null}
          {paidServices.map((service) => (
            <div key={service.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  {projectNameById[service.projectId] || 'Unknown project'} - {service.serviceName}
                </p>
                <div className="flex items-center gap-2 text-[11px]">
                  {service.includeInFinancialPlanner === false ? (
                    <span className="rounded-full bg-rose-100 px-2 py-1 font-semibold text-rose-700">Excluded</span>
                  ) : service.allocationMode === 'manual' ? (
                    <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-700">Manual</span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-700">Auto</span>
                  )}
                </div>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4 text-xs">
                <p className="rounded-lg bg-white px-2 py-1 text-slate-700">Contract: <span className="font-semibold">{formatCurrency(service.contractValue)}</span></p>
                <p className="rounded-lg bg-white px-2 py-1 text-slate-700">Agency Share: <span className="font-semibold">{formatCurrency(service.agencyShareTotal)}</span></p>
                <p className="rounded-lg bg-white px-2 py-1 text-sky-700">Recognized: <span className="font-semibold">{formatCurrency(service.recognizedPaidRevenue)}</span></p>
                <p className="rounded-lg bg-white px-2 py-1 text-amber-700">Pending: <span className="font-semibold">{formatCurrency(service.pendingRevenue)}</span></p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5">
        <h4 className="font-bold text-slate-900">Calculation Audit</h4>
        <p className="mt-1 text-xs text-slate-500">Service-by-service budget contribution breakdown.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                <th className="px-2 py-2">Service</th>
                <th className="px-2 py-2">Mode</th>
                <th className="px-2 py-2">Recognized</th>
                <th className="px-2 py-2">Karim</th>
                <th className="px-2 py-2">Youssef</th>
                <th className="px-2 py-2">Ops</th>
                <th className="px-2 py-2">Marketing</th>
                <th className="px-2 py-2">Manual Diff</th>
              </tr>
            </thead>
            <tbody>
              {serviceAllocationRows.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="px-2 py-2 text-slate-800">{item.projectName} - {item.serviceName}</td>
                  <td className="px-2 py-2">
                    <span className={item.mode === 'manual' ? 'font-semibold text-amber-700' : 'font-semibold text-emerald-700'}>
                      {item.mode}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-semibold text-slate-800">{formatCurrency(item.recognized)}</td>
                  <td className="px-2 py-2 text-slate-800">{formatCurrency(item.karimSalary)}</td>
                  <td className="px-2 py-2 text-slate-800">{formatCurrency(item.youssefSalary)}</td>
                  <td className="px-2 py-2 text-slate-800">{formatCurrency(item.agencyOperations)}</td>
                  <td className="px-2 py-2 text-slate-800">{formatCurrency(item.marketingSales)}</td>
                  <td className={item.mode === 'manual' && item.manualDifference !== 0 ? 'px-2 py-2 font-semibold text-amber-700' : 'px-2 py-2 text-slate-400'}>
                    {item.mode === 'manual' ? formatCurrency(item.manualDifference) : '-'}
                  </td>
                </tr>
              ))}
              {serviceAllocationRows.length === 0 ? (
                <tr>
                  <td className="px-2 py-3 text-slate-500" colSpan={8}>No planner-included paid services yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </ModuleShell>
  )
}

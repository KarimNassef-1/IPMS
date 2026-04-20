import ModuleShell from '../components/layout/ModuleShell'
import { useEffect, useMemo, useState } from 'react'
import {
  addServiceToProject,
  createProject,
  deleteProject,
  deleteService,
  getAllServices,
  getProjects,
  updateService,
  updateProject,
} from '../services/projectService'
import { PROJECT_STATUSES, PROJECT_TYPES } from '../utils/constants'
import { formatCurrency } from '../utils/helpers'
import { createNotification } from '../services/notificationService'
import { useAuth } from '../hooks/useAuth'
import {
  estimateRecurringMonths,
  getServiceFinancialBreakdown,
  serviceAgencyShareValue,
  serviceContractValue,
} from '../utils/serviceFinance'

function createInstallment() {
  return {
    amount: '',
    dueDate: '',
    status: 'pending',
  }
}

function createInitialServiceForm() {
  return {
    projectId: '',
    serviceName: '',
    chargeType: 'paid',
    includeInFinancialPlanner: true,
    allocationMode: 'auto',
    manualAllocation: {
      karimSalary: '',
      youssefSalary: '',
      agencyOperations: '',
      marketingSales: '',
    },
    deliveryType: 'inhouse',
    outsourcePercentage: '',
    recurringOutsourcePercentage: '',
    outsourceServiceFee: '',
    billingType: 'one-time',
    paymentMode: 'installments',
    revenue: '',
    oneTimeAmount: '',
    monthlyAmount: '',
    monthsCount: '1',
    recurringOngoing: false,
    recurringStart: '',
    recurringEnd: '',
    valueAmount: '',
    paymentStatus: 'pending',
    paymentDate: '',
    installments: [createInstallment(), createInstallment()],
  }
}

function serviceToForm(service) {
  const billingType = service.billingType || 'one-time'
  const paymentMode = billingType === 'monthly' ? 'monthly' : service.paymentMode || 'installments'
  const installments =
    Array.isArray(service.installments) && service.installments.length
      ? service.installments.map((item) => ({
          amount: String(Number(item.amount) || ''),
          dueDate: item.dueDate || '',
          status: item.status || 'pending',
        }))
      : [createInstallment(), createInstallment()]

  const chargedRevenue = Number(service.revenue) || 0
  const fallbackValue = Number(service.valueAmount) || Number(service.totalContractValue) || chargedRevenue

  return {
    projectId: service.projectId || '',
    serviceName: service.serviceName || '',
    chargeType: service.chargeType === 'free' ? 'free' : 'paid',
    includeInFinancialPlanner: service.includeInFinancialPlanner !== false,
    allocationMode: service.allocationMode === 'manual' ? 'manual' : 'auto',
    manualAllocation: {
      karimSalary: Number(service?.manualAllocation?.karimSalary)
        ? String(Number(service.manualAllocation.karimSalary))
        : '',
      youssefSalary: Number(service?.manualAllocation?.youssefSalary)
        ? String(Number(service.manualAllocation.youssefSalary))
        : '',
      agencyOperations: Number(service?.manualAllocation?.agencyOperations)
        ? String(Number(service.manualAllocation.agencyOperations))
        : '',
      marketingSales: Number(service?.manualAllocation?.marketingSales)
        ? String(Number(service.manualAllocation.marketingSales))
        : '',
    },
    deliveryType: service.deliveryType === 'outsource' ? 'outsource' : 'inhouse',
    outsourcePercentage: Number(service.outsourcePercentage)
      ? String(Number(service.outsourcePercentage))
      : '',
    recurringOutsourcePercentage: Number(service.recurringOutsourcePercentage)
      ? String(Number(service.recurringOutsourcePercentage))
      : Number(service.outsourcePercentage)
        ? String(Number(service.outsourcePercentage))
        : '',
    outsourceServiceFee: Number(service.outsourceServiceFee)
      ? String(Number(service.outsourceServiceFee))
      : '',
    billingType,
    paymentMode,
    revenue: chargedRevenue ? String(chargedRevenue) : '',
    oneTimeAmount: Number(service.oneTimeAmount) ? String(Number(service.oneTimeAmount)) : '',
    monthlyAmount: Number(service.monthlyAmount) ? String(Number(service.monthlyAmount)) : '',
    monthsCount: Number(service.monthsCount) ? String(Number(service.monthsCount)) : '1',
    recurringOngoing: Boolean(service.recurringOngoing),
    recurringStart: service.recurringStart || '',
    recurringEnd: service.recurringEnd || '',
    valueAmount: fallbackValue ? String(fallbackValue) : '',
    paymentStatus: service.paymentStatus || 'pending',
    paymentDate: service.paymentDate || '',
    installments:
      paymentMode === 'installments'
        ? installments
        : [createInstallment()],
  }
}

export default function ProjectsPage() {
  const { user, isAdmin } = useAuth()
  const [projects, setProjects] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [submittingProject, setSubmittingProject] = useState(false)
  const [submittingService, setSubmittingService] = useState(false)
  const [projectError, setProjectError] = useState('')
  const [serviceError, setServiceError] = useState('')
  const [projectSuccess, setProjectSuccess] = useState('')
  const [serviceSuccess, setServiceSuccess] = useState('')
  const [editingProjectId, setEditingProjectId] = useState(null)
  const [editingServiceId, setEditingServiceId] = useState(null)
  const [projectForm, setProjectForm] = useState({
    clientName: '',
    projectName: '',
    projectType: '',
    type: PROJECT_TYPES[0],
    startDate: '',
    deadline: '',
    status: PROJECT_STATUSES[0],
    notes: '',
    recurringPaused: false,
    recurringCancelled: false,
  })

  const [serviceForm, setServiceForm] = useState(createInitialServiceForm())

  async function loadData() {
    setLoading(true)
    try {
      const [projectData, serviceData] = await Promise.all([getProjects(), getAllServices()])
      setProjects(projectData)
      setServices(serviceData)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const revenueBreakdownByProjectId = useMemo(() => {
    return services.reduce((acc, service) => {
      if (!acc[service.projectId]) {
        acc[service.projectId] = {
          totalContractValue: 0,
          agencyShareTotal: 0,
          inhouseRevenue: 0,
          outsourceShare: 0,
          freeValue: 0,
        }
      }

      const bucket = acc[service.projectId]
      const agencyRevenue = serviceAgencyShareValue(service)
      const contractValue = serviceContractValue(service)
      const trackedValue =
        Number(service.valueAmount) || Number(service.totalContractValue) || contractValue

      if (service.chargeType === 'free') {
        bucket.freeValue += trackedValue
      } else {
        bucket.totalContractValue += contractValue
        bucket.agencyShareTotal += agencyRevenue

        if (service.deliveryType === 'outsource') {
          bucket.outsourceShare += agencyRevenue
        } else {
          bucket.inhouseRevenue += agencyRevenue
        }
      }

      return acc
    }, {})
  }, [services])

  function handleProjectInput(event) {
    const { name, value, type, checked } = event.target
    setProjectForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
  }

  function handleServiceInput(event) {
    const { name, value } = event.target
    setServiceForm((current) => {
      if (name === 'billingType') {
        const next = { ...current, billingType: value }

        if (value === 'monthly') {
          next.paymentMode = 'monthly'
          next.oneTimeAmount = ''
          next.revenue = ''
          next.installments = [createInstallment(), createInstallment()]
          next.recurringOngoing = false
        } else if (value === 'hybrid') {
          next.paymentMode = current.paymentMode === 'once' ? 'once' : 'installments'
          if (!Array.isArray(next.installments) || next.installments.length === 0) {
            next.installments = [createInstallment(), createInstallment()]
          }
          next.recurringOngoing = false
        } else {
          next.paymentMode = 'installments'
          next.monthlyAmount = ''
          next.monthsCount = '1'
          next.recurringOngoing = false
          next.recurringStart = ''
          next.recurringEnd = ''
        }

        return next
      }

      if (name === 'includeInFinancialPlanner') {
        const checked = event.target.checked
        return {
          ...current,
          includeInFinancialPlanner: checked,
          allocationMode: checked ? current.allocationMode : 'auto',
        }
      }

      if (name === 'allocationMode') {
        return {
          ...current,
          allocationMode: value === 'manual' ? 'manual' : 'auto',
        }
      }

      if (name === 'paymentMode') {
        const next = { ...current, paymentMode: value }
        if (value === 'once') {
          next.installments = [createInstallment()]
        } else {
          next.oneTimeAmount = ''
          next.installments = [createInstallment(), createInstallment()]
        }
        return next
      }

      if (name === 'chargeType') {
        const next = { ...current, chargeType: value }
        if (value === 'free') {
          next.billingType = 'one-time'
          next.paymentMode = 'once'
          next.oneTimeAmount = ''
          next.monthlyAmount = ''
          next.monthsCount = '1'
          next.recurringOngoing = false
          next.recurringStart = ''
          next.recurringEnd = ''
          next.installments = [createInstallment()]
          next.revenue = ''
          next.paymentStatus = 'free'
          next.paymentDate = ''
        } else if (next.paymentStatus === 'free') {
          next.paymentStatus = 'pending'
        }
        return next
      }

      if (name === 'deliveryType') {
        const next = { ...current, deliveryType: value }
        if (value !== 'outsource') {
          next.outsourcePercentage = ''
          next.recurringOutsourcePercentage = ''
          next.outsourceServiceFee = ''
        }
        return next
      }

      if (name === 'recurringOngoing') {
        const checked = event.target.checked
        return {
          ...current,
          recurringOngoing: checked,
          recurringEnd: checked ? '' : current.recurringEnd,
        }
      }

      return { ...current, [name]: value }
    })
  }

  function handleManualAllocationInput(key, value) {
    setServiceForm((current) => ({
      ...current,
      manualAllocation: {
        ...current.manualAllocation,
        [key]: value,
      },
    }))
  }

  function updateInstallment(index, field, value) {
    setServiceForm((current) => ({
      ...current,
      installments: current.installments.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }))
  }

  function setInstallmentsCount(value) {
    const parsed = Math.min(Math.max(Number(value) || 1, 1), 6)
    setServiceForm((current) => {
      const currentInstallments = [...current.installments]
      if (currentInstallments.length < parsed) {
        while (currentInstallments.length < parsed) {
          currentInstallments.push(createInstallment())
        }
      }

      return {
        ...current,
        installments: currentInstallments.slice(0, parsed),
      }
    })
  }

  function validateServiceForm() {
    if (!serviceForm.projectId) return 'Please select a project.'
    if (!serviceForm.serviceName.trim()) return 'Please enter a service name.'

    const hasOneTimePart =
      serviceForm.chargeType !== 'free' &&
      (serviceForm.billingType === 'one-time' || serviceForm.billingType === 'hybrid')

    if (serviceForm.deliveryType === 'outsource') {
      const percentage = Number(serviceForm.outsourcePercentage) || 0
      if (percentage < 0 || percentage > 100) {
        return 'Outsource percentage must be between 0 and 100.'
      }

      if (hasOneTimePart && (Number(serviceForm.outsourceServiceFee) || 0) <= 0) {
        return 'Outsource service fee must be greater than 0.'
      }

      if (
        serviceForm.chargeType !== 'free' &&
        (serviceForm.billingType === 'monthly' || serviceForm.billingType === 'hybrid')
      ) {
        const recurringPercentage = Number(serviceForm.recurringOutsourcePercentage) || 0
        if (recurringPercentage < 0 || recurringPercentage > 100) {
          return 'Recurring outsource percentage must be between 0 and 100.'
        }
      }
    }

    if (serviceForm.chargeType !== 'free' && serviceForm.billingType === 'monthly') {
      if ((Number(serviceForm.monthlyAmount) || 0) <= 0) {
        return 'Monthly amount must be greater than 0.'
      }
      if (!serviceForm.recurringStart) {
        return 'Please set a recurring start date.'
      }
      if (!serviceForm.recurringOngoing && !serviceForm.recurringEnd) {
        return 'Please set an end date or mark this service as ongoing.'
      }
    }

    if (serviceForm.chargeType !== 'free' && serviceForm.billingType === 'hybrid') {
      if ((Number(serviceForm.monthlyAmount) || 0) <= 0) {
        return 'Hybrid service needs a monthly amount greater than 0.'
      }
      if (!serviceForm.recurringStart) {
        return 'Hybrid recurring part needs a start date.'
      }
      if (!serviceForm.recurringOngoing && !serviceForm.recurringEnd) {
        return 'For hybrid recurring part, set end date or mark it ongoing.'
      }
    }

    if (hasOneTimePart && serviceForm.paymentMode === 'once') {
      if ((Number(serviceForm.oneTimeAmount) || 0) <= 0) {
        return 'One-time amount must be greater than 0.'
      }
    }

    const invalidInstallment = serviceForm.installments.find(
      (item) => (Number(item.amount) || 0) <= 0 || !item.dueDate,
    )
    if (hasOneTimePart && serviceForm.paymentMode === 'installments' && invalidInstallment) {
      return 'Each installment needs an amount and due date.'
    }

    if (serviceForm.chargeType === 'free' && (Number(serviceForm.valueAmount) || 0) <= 0) {
      return 'For free services, please set an estimated value.'
    }

    if (
      serviceForm.includeInFinancialPlanner &&
      serviceForm.chargeType !== 'free' &&
      serviceForm.allocationMode === 'manual'
    ) {
      const manualTotal =
        (Number(serviceForm.manualAllocation.karimSalary) || 0) +
        (Number(serviceForm.manualAllocation.youssefSalary) || 0) +
        (Number(serviceForm.manualAllocation.agencyOperations) || 0) +
        (Number(serviceForm.manualAllocation.marketingSales) || 0)

      if (manualTotal <= 0) {
        return 'Manual budget allocation requires at least one positive amount.'
      }
    }

    return ''
  }

  async function submitProject(event) {
    event.preventDefault()
    setProjectError('')
    setProjectSuccess('')

    if (!isAdmin) {
      setProjectError('Only admin can create or update projects.')
      return
    }

    setSubmittingProject(true)

    try {
      if (editingProjectId) {
        await updateProject(editingProjectId, projectForm)
      } else {
        await createProject(projectForm)
      }

      // Notification failure should not cancel successful project save.
      try {
        await createNotification({
          userId: user?.uid,
          message: `Project saved: ${projectForm.projectName}`,
          status: 'unread',
          date: new Date().toISOString(),
        })
      } catch (notificationError) {
        console.warn('Project saved but notification failed:', notificationError)
      }

      setProjectForm({
        clientName: '',
        projectName: '',
        projectType: '',
        type: PROJECT_TYPES[0],
        startDate: '',
        deadline: '',
        status: PROJECT_STATUSES[0],
        notes: '',
        recurringPaused: false,
        recurringCancelled: false,
      })
      setEditingProjectId(null)
      setProjectSuccess('Project saved successfully.')
      await loadData()
    } catch (error) {
      console.error('Project save failed:', error)
      setProjectError(error?.message || 'Failed to save project. Check Firebase permissions and try again.')
    } finally {
      setSubmittingProject(false)
    }
  }

  async function submitService(event) {
    event.preventDefault()
    setServiceError('')
    setServiceSuccess('')

    if (!isAdmin) {
      setServiceError('Only admin can add or update services.')
      return
    }

    const validationError = validateServiceForm()
    if (validationError) {
      setServiceError(validationError)
      return
    }

    setSubmittingService(true)

    try {
      if (editingServiceId) {
        await updateService(editingServiceId, serviceForm)
      } else {
        await addServiceToProject(serviceForm)
      }

      try {
        await createNotification({
          userId: user?.uid,
          message: editingServiceId
            ? `Service updated: ${serviceForm.serviceName}`
            : `Service added: ${serviceForm.serviceName}`,
          status: 'unread',
          date: new Date().toISOString(),
        })
      } catch (notificationError) {
        console.warn('Service saved but notification failed:', notificationError)
      }

      setServiceForm((current) => ({
        ...createInitialServiceForm(),
        projectId: current.projectId,
      }))
      setEditingServiceId(null)
      setServiceSuccess(editingServiceId ? 'Service updated successfully.' : 'Service added successfully.')
      await loadData()
    } catch (error) {
      console.error('Service save failed:', error)
      setServiceError(error?.message || 'Failed to save service. Check Firebase permissions and try again.')
    } finally {
      setSubmittingService(false)
    }
  }

  async function removeProject(projectId) {
    if (!isAdmin) {
      setProjectError('Only admin can delete projects.')
      return
    }

    await deleteProject(projectId)
    await loadData()
  }

  async function removeService(serviceId) {
    if (!isAdmin) {
      setServiceError('Only admin can delete services.')
      return
    }

    await deleteService(serviceId)
    if (editingServiceId === serviceId) {
      setEditingServiceId(null)
      setServiceForm(createInitialServiceForm())
    }
    await loadData()
  }

  function startEditService(service) {
    if (!isAdmin) {
      setServiceError('Only admin can edit services.')
      return
    }

    setEditingServiceId(service.id)
    setServiceError('')
    setServiceSuccess('')
    setServiceForm(serviceToForm(service))
  }

  function cancelEditService() {
    setEditingServiceId(null)
    setServiceError('')
    setServiceSuccess('')
    setServiceForm(createInitialServiceForm())
  }

  const outsourceSharePreviewBreakdown = useMemo(() => {
    if (serviceForm.deliveryType !== 'outsource') {
      return {
        oneTimeBase: 0,
        recurringBase: 0,
        oneTimeShare: 0,
        recurringShare: 0,
        totalBase: 0,
        totalShare: 0,
      }
    }

    const hasOneTimePart =
      serviceForm.chargeType === 'paid' &&
      (serviceForm.billingType === 'one-time' || serviceForm.billingType === 'hybrid')
    const oneTimeBase = hasOneTimePart
      ? serviceForm.deliveryType === 'outsource'
        ? Number(serviceForm.outsourceServiceFee) || 0
        : serviceForm.paymentMode === 'once'
          ? Number(serviceForm.oneTimeAmount) || 0
          : (Array.isArray(serviceForm.installments) ? serviceForm.installments : []).reduce(
              (sum, item) => sum + (Number(item.amount) || 0),
              0,
            )
      : 0

    const monthlyAmount = Number(serviceForm.monthlyAmount) || 0
    const hasMonthlyPart =
      serviceForm.chargeType === 'paid' &&
      (serviceForm.billingType === 'monthly' || serviceForm.billingType === 'hybrid')
    const monthsCount = hasMonthlyPart
      ? estimateRecurringMonths(
          serviceForm.recurringStart,
          serviceForm.recurringEnd,
          Boolean(serviceForm.recurringOngoing),
        )
      : 0
    const recurringTotal = hasMonthlyPart ? monthlyAmount * monthsCount : 0
    const recurringBase = recurringTotal

    const oneTimePercentage = Number(serviceForm.outsourcePercentage) || 0
    const recurringPercentage = Number(serviceForm.recurringOutsourcePercentage) || 0

    const oneTimeShare = (Math.max(oneTimeBase, 0) * oneTimePercentage) / 100
    const recurringShare = (Math.max(recurringBase, 0) * recurringPercentage) / 100

    return {
      oneTimeBase: Math.max(oneTimeBase, 0),
      recurringBase: Math.max(recurringBase, 0),
      oneTimeShare,
      recurringShare,
      totalBase: Math.max(oneTimeBase + recurringBase, 0),
      totalShare: oneTimeShare + recurringShare,
    }
  }, [
    serviceForm.billingType,
    serviceForm.chargeType,
    serviceForm.deliveryType,
    serviceForm.installments,
    serviceForm.monthlyAmount,
    serviceForm.oneTimeAmount,
    serviceForm.outsourcePercentage,
    serviceForm.outsourceServiceFee,
    serviceForm.paymentMode,
    serviceForm.recurringEnd,
    serviceForm.recurringOngoing,
    serviceForm.recurringOutsourcePercentage,
    serviceForm.recurringStart,
  ])

  const outsourceSharePreview = outsourceSharePreviewBreakdown.totalShare

  const manualAllocationTotalPreview = useMemo(() => {
    return (
      (Number(serviceForm.manualAllocation.karimSalary) || 0) +
      (Number(serviceForm.manualAllocation.youssefSalary) || 0) +
      (Number(serviceForm.manualAllocation.agencyOperations) || 0) +
      (Number(serviceForm.manualAllocation.marketingSales) || 0)
    )
  }, [serviceForm.manualAllocation])

  function startEditProject(project) {
    if (!isAdmin) {
      setProjectError('Only admin can edit projects.')
      return
    }

    setEditingProjectId(project.id)
    setProjectForm({
      clientName: project.clientName || '',
      projectName: project.projectName || '',
      projectType: project.projectType || '',
      type: project.type || PROJECT_TYPES[0],
      startDate: project.startDate || '',
      deadline: project.deadline || '',
      status: project.status || PROJECT_STATUSES[0],
      notes: project.notes || '',
      recurringPaused: Boolean(project.recurringPaused),
      recurringCancelled: Boolean(project.recurringCancelled),
    })
  }

  return (
    <ModuleShell
      title="Projects"
      description="Manage client projects and services with one-time payments and monthly recurring plans (ongoing or until a specific date)."
    >
      {!isAdmin ? (
        <p className="mb-4 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
          View-only mode: only admin Karim can create, edit, or delete projects and services.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <form onSubmit={submitProject} className="space-y-3 rounded-2xl border border-white/35 bg-white/86 p-4 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur sm:p-5">
          <h4 className="font-bold text-slate-900">{editingProjectId ? 'Edit Project' : 'Create Project'}</h4>
          <input name="clientName" value={projectForm.clientName} onChange={handleProjectInput} placeholder="Client name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
          <input name="projectName" value={projectForm.projectName} onChange={handleProjectInput} placeholder="Project name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
          <input name="projectType" value={projectForm.projectType} onChange={handleProjectInput} placeholder="Project type" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <div className="grid gap-3 sm:grid-cols-2">
            <select name="type" value={projectForm.type} onChange={handleProjectInput} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {PROJECT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <select name="status" value={projectForm.status} onChange={handleProjectInput} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {PROJECT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="startDate" type="date" value={projectForm.startDate} onChange={handleProjectInput} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <input name="deadline" type="date" value={projectForm.deadline} onChange={handleProjectInput} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <textarea name="notes" value={projectForm.notes} onChange={handleProjectInput} placeholder="Notes" className="h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          {projectForm.type === 'Monthly' ? (
            <div className="grid gap-2 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="recurringPaused" checked={projectForm.recurringPaused} onChange={handleProjectInput} />
                Pause recurring
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="recurringCancelled" checked={projectForm.recurringCancelled} onChange={handleProjectInput} />
                Cancel recurring
              </label>
            </div>
          ) : null}
          {projectError ? <p className="text-xs text-rose-600">{projectError}</p> : null}
          {projectSuccess ? <p className="text-xs text-emerald-700">{projectSuccess}</p> : null}
          <button
            type="submit"
            disabled={submittingProject || !isAdmin}
            className="rounded-lg bg-[#8246f6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6f39e7] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submittingProject
              ? editingProjectId
                ? 'Updating...'
                : 'Creating...'
              : editingProjectId
                ? 'Update Project'
                : 'Create Project'}
          </button>
        </form>

        <form onSubmit={submitService} className="space-y-3 rounded-2xl border border-white/35 bg-white/86 p-4 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-bold text-slate-900">{editingServiceId ? 'Edit Service' : 'Add Service'}</h4>
            {editingServiceId ? (
              <button
                type="button"
                onClick={cancelEditService}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
              >
                Cancel Edit
              </button>
            ) : null}
          </div>
          <select name="projectId" value={serviceForm.projectId} onChange={handleServiceInput} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required>
            <option value="">Select project</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.projectName}</option>)}
          </select>
          <input name="serviceName" value={serviceForm.serviceName} onChange={handleServiceInput} placeholder="Service name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                name="includeInFinancialPlanner"
                checked={Boolean(serviceForm.includeInFinancialPlanner)}
                onChange={handleServiceInput}
              />
              Include this service in financial planner and budgets
            </label>

            {serviceForm.includeInFinancialPlanner ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  name="allocationMode"
                  value={serviceForm.allocationMode}
                  onChange={handleServiceInput}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="auto">Auto percentages (35/35/20/10)</option>
                  <option value="manual">Manual budget allocation</option>
                </select>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                  {serviceForm.allocationMode === 'manual'
                    ? `Manual total: ${formatCurrency(manualAllocationTotalPreview)}`
                    : 'Uses default percentage distribution'}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                Excluded: this income will not be added to budgets/financial planner.
              </div>
            )}

            {serviceForm.includeInFinancialPlanner && serviceForm.allocationMode === 'manual' ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={serviceForm.manualAllocation.karimSalary}
                  onChange={(event) => handleManualAllocationInput('karimSalary', event.target.value)}
                  placeholder="Karim Salary amount"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={serviceForm.manualAllocation.youssefSalary}
                  onChange={(event) => handleManualAllocationInput('youssefSalary', event.target.value)}
                  placeholder="Youssef Salary amount"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={serviceForm.manualAllocation.agencyOperations}
                  onChange={(event) => handleManualAllocationInput('agencyOperations', event.target.value)}
                  placeholder="Agency Ops amount"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={serviceForm.manualAllocation.marketingSales}
                  onChange={(event) => handleManualAllocationInput('marketingSales', event.target.value)}
                  placeholder="Marketing/Sales amount"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              name="chargeType"
              value={serviceForm.chargeType}
              onChange={handleServiceInput}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="paid">Paid service</option>
              <option value="free">Free service (valued)</option>
            </select>
            {serviceForm.chargeType === 'free' ? (
              <input
                name="valueAmount"
                type="number"
                min="0"
                step="0.01"
                value={serviceForm.valueAmount}
                onChange={handleServiceInput}
                placeholder="Estimated value"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            ) : (
              <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500">
                Paid service value is calculated automatically from price fields.
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <select
              name="deliveryType"
              value={serviceForm.deliveryType}
              onChange={handleServiceInput}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="inhouse">Inhouse</option>
              <option value="outsource">Outsource</option>
            </select>
            {serviceForm.deliveryType === 'outsource' &&
            serviceForm.chargeType === 'paid' &&
            (serviceForm.billingType === 'one-time' || serviceForm.billingType === 'hybrid') ? (
              <input
                name="outsourceServiceFee"
                type="number"
                min="0"
                step="0.01"
                value={serviceForm.outsourceServiceFee}
                onChange={handleServiceInput}
                placeholder="One-time outsource fee (OTP)"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            ) : (
              <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500">
                {serviceForm.deliveryType === 'outsource'
                  ? 'Monthly recurring amount is configured separately in the monthly section.'
                  : 'Inhouse: full charged amount goes to agency.'}
              </div>
            )}
          </div>

          {serviceForm.deliveryType === 'outsource' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                name="outsourcePercentage"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={serviceForm.outsourcePercentage}
                onChange={handleServiceInput}
                placeholder="Our percentage %"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                OTP share: {formatCurrency(outsourceSharePreviewBreakdown.oneTimeShare)}
                <br />
                Recurring share: {formatCurrency(outsourceSharePreviewBreakdown.recurringShare)}
                <br />
                Total agency share: {formatCurrency(outsourceSharePreview)}
              </div>
            </div>
          ) : null}
          {serviceForm.chargeType === 'paid' ? (
            <select
              name="billingType"
              value={serviceForm.billingType}
              onChange={handleServiceInput}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="one-time">One-time</option>
              <option value="monthly">Monthly recurring</option>
              <option value="hybrid">One-time + Monthly recurring</option>
            </select>
          ) : null}

          {serviceForm.chargeType === 'paid' && (serviceForm.billingType === 'monthly' || serviceForm.billingType === 'hybrid') ? (
            <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
              <p className="text-xs font-semibold text-indigo-700">Monthly recurring part</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  name="deliveryType"
                  value={serviceForm.deliveryType}
                  onChange={handleServiceInput}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="inhouse">Inhouse</option>
                  <option value="outsource">Outsource</option>
                </select>
                {serviceForm.deliveryType === 'outsource' ? (
                  <input
                    name="recurringOutsourcePercentage"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={serviceForm.recurringOutsourcePercentage}
                    onChange={handleServiceInput}
                    placeholder="Recurring outsource share %"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                    Inhouse recurring is fully counted as agency income.
                  </div>
                )}
              </div>
              {serviceForm.deliveryType === 'outsource' ? (
                <p className="text-xs text-indigo-700">
                  This percentage applies to recurring monthly cash only. Set it to 0 to exclude recurring from agency income.
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-1">
                <input
                  name="monthlyAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={serviceForm.monthlyAmount}
                  onChange={handleServiceInput}
                  placeholder="Monthly amount"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  required
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-indigo-700">
                <input
                  type="checkbox"
                  name="recurringOngoing"
                  checked={Boolean(serviceForm.recurringOngoing)}
                  onChange={handleServiceInput}
                />
                Ongoing subscription (no end date)
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  name="recurringStart"
                  type="date"
                  value={serviceForm.recurringStart}
                  onChange={handleServiceInput}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                {serviceForm.recurringOngoing ? (
                  <div className="rounded-lg border border-indigo-100 bg-indigo-100/60 px-3 py-2 text-xs text-indigo-700">
                    End date not required for ongoing services.
                  </div>
                ) : (
                  <input
                    name="recurringEnd"
                    type="date"
                    value={serviceForm.recurringEnd}
                    onChange={handleServiceInput}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                )}
              </div>
              {serviceForm.deliveryType === 'outsource' ? (
                <div className="rounded-lg border border-indigo-100 bg-indigo-100/60 px-3 py-2 text-xs text-indigo-700">
                  Recurring monthly share is calculated directly from monthly amount and recurring percentage.
                </div>
              ) : null}
            </div>
          ) : null}

          {serviceForm.chargeType === 'paid' && (serviceForm.billingType === 'one-time' || serviceForm.billingType === 'hybrid') ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-700">One-time payment part</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700">Payment setup</p>
                <div className="flex items-center gap-2">
                  <select
                    name="paymentMode"
                    value={serviceForm.paymentMode}
                    onChange={handleServiceInput}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  >
                    <option value="once">Paid at once</option>
                    <option value="installments">Installments</option>
                  </select>
                  {serviceForm.paymentMode === 'installments' ? (
                    <select
                      value={serviceForm.installments.length}
                      onChange={(event) => setInstallmentsCount(event.target.value)}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    >
                      <option value="1">1 payment</option>
                      <option value="2">2 payments</option>
                      <option value="3">3 payments</option>
                      <option value="4">4 payments</option>
                      <option value="5">5 payments</option>
                      <option value="6">6 payments</option>
                    </select>
                  ) : null}
                </div>
              </div>
              {serviceForm.paymentMode === 'once' ? (
                <input
                  name="oneTimeAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={serviceForm.oneTimeAmount}
                  onChange={handleServiceInput}
                  placeholder="One-time amount"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              ) : (
                <div className="space-y-2">
                  {serviceForm.installments.map((installment, index) => (
                    <div key={`installment-${index}`} className="grid gap-2 sm:grid-cols-3">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={installment.amount}
                        onChange={(event) => updateInstallment(index, 'amount', event.target.value)}
                        placeholder={`Installment ${index + 1} amount`}
                        className="rounded-lg border border-slate-200 px-2 py-2 text-xs"
                      />
                      <input
                        type="date"
                        value={installment.dueDate}
                        onChange={(event) => updateInstallment(index, 'dueDate', event.target.value)}
                        className="rounded-lg border border-slate-200 px-2 py-2 text-xs"
                      />
                      <select
                        value={installment.status}
                        onChange={(event) => updateInstallment(index, 'status', event.target.value)}
                        className="rounded-lg border border-slate-200 px-2 py-2 text-xs"
                      >
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {serviceForm.chargeType === 'free' ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-xs text-emerald-800">
              Free service uses only Estimated value and will not add revenue to financial totals.
            </div>
          ) : null}

          {serviceForm.chargeType === 'paid' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <select name="paymentStatus" value={serviceForm.paymentStatus} onChange={handleServiceInput} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
              </select>
              <input name="paymentDate" type="date" value={serviceForm.paymentDate} onChange={handleServiceInput} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
          ) : (
            <p className="text-xs text-slate-600">Free service: no client payment required. Estimated value is tracked for reporting.</p>
          )}
          {serviceError ? <p className="text-xs text-rose-600">{serviceError}</p> : null}
          {serviceSuccess ? <p className="text-xs text-emerald-700">{serviceSuccess}</p> : null}
          <button
            type="submit"
            disabled={submittingService || !isAdmin}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submittingService
              ? editingServiceId
                ? 'Updating...'
                : 'Adding...'
              : editingServiceId
                ? 'Update Service'
                : 'Add Service'}
          </button>
        </form>
      </div>

      <div className="mt-6 space-y-4">
        {loading ? <p className="text-sm text-slate-600">Loading projects...</p> : null}
        {projects.map((project) => (
          <article key={project.id} className="rounded-2xl border border-white/35 bg-white/82 p-4 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-bold text-slate-900 sm:text-lg">{project.projectName}</h4>
                <p className="text-xs text-slate-600 sm:text-sm">{project.clientName} • {project.status} • {project.type}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                    Contract: {formatCurrency(revenueBreakdownByProjectId[project.id]?.totalContractValue || 0)}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-700">
                    Agency Share: {formatCurrency(revenueBreakdownByProjectId[project.id]?.agencyShareTotal || 0)}
                  </span>
                  <span className="rounded-full bg-sky-100 px-2 py-1 font-semibold text-sky-700">
                    Inhouse: {formatCurrency(revenueBreakdownByProjectId[project.id]?.inhouseRevenue || 0)}
                  </span>
                  <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-700">
                    Outsource: {formatCurrency(revenueBreakdownByProjectId[project.id]?.outsourceShare || 0)}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                    Free Value: {formatCurrency(revenueBreakdownByProjectId[project.id]?.freeValue || 0)}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                {isAdmin ? <button type="button" onClick={() => startEditProject(project)} className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-white">Edit</button> : null}
                {isAdmin ? <button type="button" onClick={() => removeProject(project.id)} className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white">Delete</button> : null}
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {services.filter((service) => service.projectId === project.id).map((service) => {
                const serviceBreakdown = getServiceFinancialBreakdown(service)

                return (
                <div key={service.id} className="rounded-xl border border-slate-200 bg-white/90 p-2.5 text-sm shadow-[0_8px_20px_-18px_rgba(15,23,42,0.55)]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">{service.serviceName}</p>
                    <div className="flex gap-2">
                      {isAdmin ? <button type="button" onClick={() => startEditService(service)} className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">Edit</button> : null}
                      {isAdmin ? <button type="button" onClick={() => removeService(service.id)} className="rounded bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">Remove</button> : null}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                      {service.chargeType === 'free' ? 'Free' : 'Paid'}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                      {service.deliveryType === 'outsource' ? 'Outsource' : 'Inhouse'}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                      {service.billingType === 'hybrid'
                        ? 'Hybrid'
                        : service.billingType === 'monthly'
                          ? 'Monthly'
                          : 'One-time'}
                    </span>
                    <span className="rounded-full bg-sky-100 px-2 py-1 font-semibold text-sky-700">
                      Contract: {formatCurrency(serviceBreakdown.contractValue)}
                    </span>
                    <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-700">
                      Agency Share: {formatCurrency(serviceBreakdown.agencyShare)}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                      Status: {service.paymentStatus || 'pending'}
                    </span>
                  </div>

                  {service.chargeType !== 'free' ? (
                    <p className="mt-1 text-xs text-slate-600">
                      One-time contract: {formatCurrency(serviceBreakdown.oneTimeContract)}
                      {' • '}Recurring contract: {formatCurrency(serviceBreakdown.recurringContract)}
                      {service.billingType === 'monthly' || service.billingType === 'hybrid'
                        ? ` • Recurring months active: ${serviceBreakdown.recurringMonths}`
                        : ''}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-600">
                      Value: {formatCurrency(Number(service.valueAmount) || Number(service.totalContractValue) || 0)}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap gap-2">
                    {service.includeInFinancialPlanner === false ? (
                      <span className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-700">
                        Excluded from planner
                      </span>
                    ) : service.allocationMode === 'manual' ? (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">
                        Manual budget allocation
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                        Auto 35/35/20/10 allocation
                      </span>
                    )}
                  </div>

                  {service.includeInFinancialPlanner !== false && service.allocationMode === 'manual' ? (
                    <p className="mt-1 text-xs text-amber-700">
                      Manual split • Karim: {formatCurrency(service?.manualAllocation?.karimSalary || 0)}
                      {' • '}Youssef: {formatCurrency(service?.manualAllocation?.youssefSalary || 0)}
                      {' • '}Ops: {formatCurrency(service?.manualAllocation?.agencyOperations || 0)}
                      {' • '}Marketing: {formatCurrency(service?.manualAllocation?.marketingSales || 0)}
                    </p>
                  ) : null}

                  {service.deliveryType === 'outsource' ? (
                    <p className="mt-1 text-xs text-amber-700">
                      Outsource fee: {formatCurrency(Number(service.outsourceServiceFee) || 0)}
                      {' • '}One-time %: {Number(service.outsourcePercentage) || 0}%
                      {' • '}Recurring %:{' '}
                      {service.recurringOutsourcePercentage == null
                        ? Number(service.outsourcePercentage) || 0
                        : Number(service.recurringOutsourcePercentage) || 0}
                      %
                      {' • '}One-time share: {formatCurrency(serviceBreakdown.oneTimeAgency)}
                      {' • '}Recurring share: {formatCurrency(serviceBreakdown.recurringAgency)}
                    </p>
                  ) : null}

                  {Array.isArray(service.installments) && service.installments.length ? (
                    <div className="mt-2 rounded border border-slate-100 bg-slate-50 p-2 text-xs text-slate-700">
                      {service.installments.map((installment, index) => (
                        <p key={installment.id || `${service.id}-${index}`}>
                          Payment {index + 1}: {formatCurrency(Number(installment.amount) || 0)} • Due {installment.dueDate || 'N/A'} • {installment.status || 'pending'}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
                )})}
            </div>
          </article>
        ))}
        {!loading && projects.length === 0 ? <p className="text-sm text-slate-600">No projects yet.</p> : null}
      </div>
      <div className="mt-4 text-xs text-slate-500">
        Monthly recurring projects are tracked with pause/cancel flags and ready for Cloud Function automation.
      </div>
    </ModuleShell>
  )
}

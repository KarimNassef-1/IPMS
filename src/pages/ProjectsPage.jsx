import ModuleShell from '../components/layout/ModuleShell'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addServiceToProject,
  createProject,
  deleteProject,
  deleteService,
  getProjectsByServiceCategories,
  getServicesByCategories,
  restoreProject,
  restoreService,
  getAllServices,
  getProjects,
  updateService,
  updateProject,
} from '../services/projectService'
import { getAllUsers } from '../services/teamUsersService'
import {
  deleteOutsourcePortalsByService,
  upsertOutsourcePortalByService,
} from '../services/outsourcePortalService'
import { PROJECT_STATUSES, PROJECT_TYPES, SERVICE_CATEGORIES } from '../utils/constants'
import { formatCurrency } from '../utils/helpers'
import { createNotification } from '../services/notificationService'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import {
  createAllowedServiceCategorySet,
  filterProjectsByVisibleServices,
  filterServicesByAccess,
} from '../utils/serviceAccess'
import {
  estimateRecurringMonths,
  getServiceFinancialBreakdown,
  serviceAgencyShareValue,
  serviceContractValue,
} from '../utils/serviceFinance'
import { createClientPortalQrInvite } from '../services/clientQrAccessService'

function createInstallment() {
  return {
    amount: '',
    dueDate: '',
    status: 'pending',
  }
}

function normalizeProjectType(value) {
  return value === 'Mix' ? 'One-time + Monthly' : value
}

function getOutsourceUserLabel(user) {
  return user?.displayName || user?.email || 'Outsource user'
}

function createInitialServiceForm() {
  return {
    projectId: '',
    serviceName: '',
    serviceCategory: '',
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
    assignedUserId: '',
    assignedUserName: '',
    assignedUserIds: [],
    assignedUserNames: [],
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
    websiteLinkName: '',
    websiteLinkUrl: '',
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
  const assignedUserIds = Array.isArray(service.assignedUserIds)
    ? service.assignedUserIds.filter(Boolean)
    : service.assignedUserId
      ? [service.assignedUserId]
      : []
  const assignedUserNames = Array.isArray(service.assignedUserNames)
    ? service.assignedUserNames.filter(Boolean)
    : service.assignedUserName
      ? [service.assignedUserName]
      : []

  return {
    projectId: service.projectId || '',
    serviceName: service.serviceName || '',
    serviceCategory: service.serviceCategory || '',
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
    assignedUserId: assignedUserIds[0] || service.assignedUserId || '',
    assignedUserName: assignedUserNames[0] || service.assignedUserName || '',
    assignedUserIds,
    assignedUserNames,
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
    websiteLinkName: service.websiteLinkName || '',
    websiteLinkUrl: service.websiteLinkUrl || '',
    paymentDate: service.paymentDate || '',
    installments:
      paymentMode === 'installments'
        ? installments
        : [createInstallment()],
  }
}

export default function ProjectsPage() {
  const { user, isAdmin, isPartner, serviceCategories, loading: authLoading } = useAuth()
  const hasFullFinancialAccess = isAdmin || isPartner
  const toast = useToast()
  const allowedCategorySet = useMemo(
    () => createAllowedServiceCategorySet(serviceCategories),
    [serviceCategories],
  )
  const [projects, setProjects] = useState([])
  const [services, setServices] = useState([])
  const [outsourceUsers, setOutsourceUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [submittingProject, setSubmittingProject] = useState(false)
  const [submittingService, setSubmittingService] = useState(false)
  const [projectError, setProjectError] = useState('')
  const [serviceError, setServiceError] = useState('')
  const [projectSuccess, setProjectSuccess] = useState('')
  const [serviceSuccess, setServiceSuccess] = useState('')
  const [projectSearch, setProjectSearch] = useState('')
  const [projectStatusFilter, setProjectStatusFilter] = useState('all')
  const [projectTypeFilter, setProjectTypeFilter] = useState('all')
  const [projectServiceCategoryFilter, setProjectServiceCategoryFilter] = useState('all')
  const [projectDeliveryFilter, setProjectDeliveryFilter] = useState('all')
  const [projectSort, setProjectSort] = useState('updated_desc')
  const [editingProjectId, setEditingProjectId] = useState(null)
  const [editingServiceId, setEditingServiceId] = useState(null)
  const [showComposer, setShowComposer] = useState(false)
  const [projectAssigneeSearch, setProjectAssigneeSearch] = useState('')
  const [serviceAssigneeSearch, setServiceAssigneeSearch] = useState('')
  const [generatingQrProjectId, setGeneratingQrProjectId] = useState('')
  const [projectQrInvite, setProjectQrInvite] = useState(null)
  const [projectForm, setProjectForm] = useState({
    clientName: '',
    clientEmail: '',
    projectName: '',
    projectType: '',
    type: PROJECT_TYPES[0],
    startDate: '',
    deadline: '',
    status: PROJECT_STATUSES[0],
    notes: '',
    assignedUserIds: [],
    assignedUserNames: [],
    recurringPaused: false,
    recurringCancelled: false,
  })

  const [serviceForm, setServiceForm] = useState(createInitialServiceForm())
  const composerSectionRef = useRef(null)
  const showCompletedWebsiteLinkFields =
    serviceForm.serviceCategory === 'Website Development' && serviceForm.paymentStatus === 'completed'
  const isEditingMode = Boolean(editingProjectId || editingServiceId)
  const isComposerVisible = isAdmin && (showComposer || isEditingMode)
  const composerToggleButton = isAdmin ? (
    <button
      type="button"
      onClick={() => setShowComposer((current) => !current)}
      className="group relative inline-flex h-9 w-9 shrink-0 self-center items-center justify-center rounded-full border border-slate-300/90 bg-gradient-to-b from-white via-slate-50 to-slate-100 text-slate-700 shadow-[0_8px_16px_-14px_rgba(15,23,42,0.8)] transition duration-200 hover:-translate-y-[1px] hover:border-slate-400 hover:shadow-[0_10px_18px_-14px_rgba(15,23,42,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 sm:h-7 sm:w-7"
      title={isComposerVisible ? 'Hide project and service forms' : 'Show project and service forms'}
      aria-label={isComposerVisible ? 'Hide project and service forms' : 'Show project and service forms'}
      aria-pressed={isComposerVisible}
    >
      <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.96),rgba(255,255,255,0)_58%)]" />
      <span className="relative block h-3 w-3">
        <span className="absolute left-0 top-1/2 h-[2px] w-3 -translate-y-1/2 rounded-full bg-slate-700 transition-colors duration-200 group-hover:bg-slate-900" />
        <span
          className={`absolute left-1/2 top-0 h-3 w-[2px] -translate-x-1/2 rounded-full bg-slate-700 transition-all duration-200 group-hover:bg-slate-900 ${
            isComposerVisible ? 'scale-y-0 opacity-0' : 'scale-y-100 opacity-100'
          }`}
        />
      </span>
    </button>
  ) : null

  async function loadData() {
    setLoading(true)
    try {
      const categories = Array.from(allowedCategorySet)
      const [projectData, serviceData] = hasFullFinancialAccess
        ? await Promise.all([getProjects(), getAllServices()])
        : await Promise.all([
            getProjectsByServiceCategories(categories),
            getServicesByCategories(categories),
          ])

      const scopedServices = hasFullFinancialAccess
        ? filterServicesByAccess(serviceData, {
            isAdmin: hasFullFinancialAccess,
            allowedCategorySet,
          })
        : serviceData
      const scopedProjects = hasFullFinancialAccess
        ? projectData
        : filterProjectsByVisibleServices(projectData, scopedServices)

      setProjects(scopedProjects)
      setServices(scopedServices)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading || !user?.uid) return
    loadData()
  }, [hasFullFinancialAccess, allowedCategorySet, authLoading, user?.uid])

  useEffect(() => {
    if (!isAdmin) return

    let active = true
    async function loadOutsourceUsers() {
      try {
        const users = await getAllUsers()
        if (!active) return
        const eligible = (Array.isArray(users) ? users : []).filter((item) => {
          const role = String(item?.role || '').toLowerCase()
          const status = String(item?.accountStatus || 'active').toLowerCase()
          return role === 'outsource' && status === 'active'
        })
        setOutsourceUsers(eligible)
      } catch {
        if (!active) return
        setOutsourceUsers([])
      }
    }

    loadOutsourceUsers()
    return () => {
      active = false
    }
  }, [isAdmin])

  useEffect(() => {
    if (projectError) toast.error(projectError)
  }, [projectError, toast])

  useEffect(() => {
    if (serviceError) toast.error(serviceError)
  }, [serviceError, toast])

  useEffect(() => {
    if (!projectSuccess) return
    const handledByUndoToast =
      projectSuccess.startsWith('Deleted project:') ||
      projectSuccess.startsWith('Restored project:')
    if (handledByUndoToast) return
    toast.success(projectSuccess)
  }, [projectSuccess, toast])

  useEffect(() => {
    if (!serviceSuccess) return
    const handledByUndoToast =
      serviceSuccess.startsWith('Deleted service:') ||
      serviceSuccess.startsWith('Restored service:')
    if (handledByUndoToast) return
    toast.success(serviceSuccess)
  }, [serviceSuccess, toast])

  const revenueBreakdownByProjectId = useMemo(() => {
    return services.reduce((acc, service) => {
      if (!acc[service.projectId]) {
        acc[service.projectId] = {
          totalContractValue: 0,
          agencyShareTotal: 0,
          inhouseRevenue: 0,
          outsourceShare: 0,
          outsourcePayout: 0,
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
          bucket.outsourcePayout += Math.max(contractValue - agencyRevenue, 0)
        } else {
          bucket.inhouseRevenue += agencyRevenue
        }
      }

      return acc
    }, {})
  }, [services])

  const servicesByProjectId = useMemo(() => {
    return services.reduce((acc, service) => {
      if (!acc[service.projectId]) acc[service.projectId] = []
      acc[service.projectId].push(service)
      return acc
    }, {})
  }, [services])

  const availableServiceCategories = useMemo(() => {
    return Array.from(
      new Set(
        services
          .map((service) => String(service.serviceCategory || '').trim())
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right))
  }, [services])

  const filteredProjectAssignees = useMemo(() => {
    const query = projectAssigneeSearch.trim().toLowerCase()
    if (!query) return outsourceUsers
    return outsourceUsers.filter((item) =>
      getOutsourceUserLabel(item).toLowerCase().includes(query),
    )
  }, [outsourceUsers, projectAssigneeSearch])

  const filteredServiceAssignees = useMemo(() => {
    const query = serviceAssigneeSearch.trim().toLowerCase()
    if (!query) return outsourceUsers
    return outsourceUsers.filter((item) =>
      getOutsourceUserLabel(item).toLowerCase().includes(query),
    )
  }, [outsourceUsers, serviceAssigneeSearch])

  const visibleProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase()
    const filtered = projects.filter((project) => {
      const projectServices = servicesByProjectId[project.id] || []
      const normalizedProjectType = normalizeProjectType(project.type || '')

      if (projectStatusFilter !== 'all' && (project.status || '') !== projectStatusFilter) {
        return false
      }

      if (projectTypeFilter !== 'all' && normalizedProjectType !== projectTypeFilter) {
        return false
      }

      if (projectServiceCategoryFilter !== 'all') {
        const hasCategory = projectServices.some(
          (service) => String(service.serviceCategory || '').trim() === projectServiceCategoryFilter,
        )
        if (!hasCategory) return false
      }

      if (projectDeliveryFilter !== 'all') {
        const hasInhouse = projectServices.some((service) => service.deliveryType !== 'outsource')
        const hasOutsource = projectServices.some((service) => service.deliveryType === 'outsource')

        const deliveryProfile = hasInhouse && hasOutsource
          ? 'mix'
          : hasOutsource
            ? 'outsource'
            : hasInhouse
              ? 'inhouse'
              : 'none'

        if (deliveryProfile !== projectDeliveryFilter) return false
      }

      if (!query) return true

      const haystack = [
        project.projectName,
        project.clientName,
        project.projectType,
        project.status,
        normalizedProjectType,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')

      return haystack.includes(query)
    })

    const timeValue = (value) => {
      if (!value) return Number.NaN
      const parsed = Date.parse(value)
      return Number.isNaN(parsed) ? Number.NaN : parsed
    }

    const alpha = (value) => String(value || '').trim().toLowerCase()

    return [...filtered].sort((left, right) => {
      if (projectSort === 'name_asc') {
        return alpha(left.projectName).localeCompare(alpha(right.projectName))
      }

      if (projectSort === 'name_desc') {
        return alpha(right.projectName).localeCompare(alpha(left.projectName))
      }

      if (projectSort === 'deadline_asc') {
        const leftTime = timeValue(left.deadline)
        const rightTime = timeValue(right.deadline)
        if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0
        if (Number.isNaN(leftTime)) return 1
        if (Number.isNaN(rightTime)) return -1
        return leftTime - rightTime
      }

      if (projectSort === 'deadline_desc') {
        const leftTime = timeValue(left.deadline)
        const rightTime = timeValue(right.deadline)
        if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0
        if (Number.isNaN(leftTime)) return 1
        if (Number.isNaN(rightTime)) return -1
        return rightTime - leftTime
      }

      if (projectSort === 'agency_share_desc' || projectSort === 'agency_share_asc') {
        const leftValue = Number(revenueBreakdownByProjectId[left.id]?.agencyShareTotal) || 0
        const rightValue = Number(revenueBreakdownByProjectId[right.id]?.agencyShareTotal) || 0
        return projectSort === 'agency_share_desc' ? rightValue - leftValue : leftValue - rightValue
      }

      if (projectSort === 'contract_value_desc' || projectSort === 'contract_value_asc') {
        const leftValue = Number(revenueBreakdownByProjectId[left.id]?.totalContractValue) || 0
        const rightValue = Number(revenueBreakdownByProjectId[right.id]?.totalContractValue) || 0
        return projectSort === 'contract_value_desc' ? rightValue - leftValue : leftValue - rightValue
      }

      if (projectSort === 'outsource_share_desc' || projectSort === 'outsource_share_asc') {
        const leftValue = Number(revenueBreakdownByProjectId[left.id]?.outsourcePayout) || 0
        const rightValue = Number(revenueBreakdownByProjectId[right.id]?.outsourcePayout) || 0
        return projectSort === 'outsource_share_desc' ? rightValue - leftValue : leftValue - rightValue
      }

      const leftTime = timeValue(left.updatedAt || left.createdAt || left.startDate)
      const rightTime = timeValue(right.updatedAt || right.createdAt || right.startDate)
      if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0
      if (Number.isNaN(leftTime)) return 1
      if (Number.isNaN(rightTime)) return -1
      if (projectSort === 'updated_asc') return leftTime - rightTime
      return rightTime - leftTime
    })
  }, [
    projectDeliveryFilter,
    projectSearch,
    projectServiceCategoryFilter,
    projectSort,
    projectStatusFilter,
    projectTypeFilter,
    projects,
    revenueBreakdownByProjectId,
    servicesByProjectId,
  ])

  function handleProjectInput(event) {
    const { name, value, type, checked } = event.target
    setProjectForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
  }

  function applyProjectAssignees(ids) {
    const selectedIds = Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)))
    const selectedNames = selectedIds.map((id) => {
      const selectedUser = outsourceUsers.find((item) => item.id === id)
      return getOutsourceUserLabel(selectedUser)
    })

    setProjectForm((current) => ({
      ...current,
      assignedUserIds: selectedIds,
      assignedUserNames: selectedNames,
    }))
  }

  function toggleProjectAssignee(userId) {
    const normalizedUserId = String(userId || '').trim()
    if (!normalizedUserId) return
    setProjectForm((current) => {
      const hasUser = current.assignedUserIds.includes(normalizedUserId)
      const nextIds = hasUser
        ? current.assignedUserIds.filter((id) => id !== normalizedUserId)
        : [...current.assignedUserIds, normalizedUserId]
      const nextNames = nextIds.map((id) => {
        const selectedUser = outsourceUsers.find((item) => item.id === id)
        return getOutsourceUserLabel(selectedUser)
      })

      return {
        ...current,
        assignedUserIds: nextIds,
        assignedUserNames: nextNames,
      }
    })
  }

  function applyServiceAssignees(ids) {
    const selectedIds = Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)))
    const selectedNames = selectedIds.map((id) => {
      const selectedUser = outsourceUsers.find((item) => item.id === id)
      return getOutsourceUserLabel(selectedUser)
    })

    setServiceForm((current) => ({
      ...current,
      assignedUserIds: selectedIds,
      assignedUserNames: selectedNames,
      assignedUserId: selectedIds[0] || '',
      assignedUserName: selectedNames[0] || '',
    }))
  }

  function toggleServiceAssignee(userId) {
    const normalizedUserId = String(userId || '').trim()
    if (!normalizedUserId) return
    setServiceForm((current) => {
      const hasUser = current.assignedUserIds.includes(normalizedUserId)
      const nextIds = hasUser
        ? current.assignedUserIds.filter((id) => id !== normalizedUserId)
        : [...current.assignedUserIds, normalizedUserId]
      const nextNames = nextIds.map((id) => {
        const selectedUser = outsourceUsers.find((item) => item.id === id)
        return getOutsourceUserLabel(selectedUser)
      })

      return {
        ...current,
        assignedUserIds: nextIds,
        assignedUserNames: nextNames,
        assignedUserId: nextIds[0] || '',
        assignedUserName: nextNames[0] || '',
      }
    })
  }

  function handleServiceInput(event) {
    const { name, value } = event.target
    setServiceForm((current) => {
      if (name === 'assignedUserIds') {
        const selectedIds = Array.from(event.target.selectedOptions || []).map((option) => option.value)
        const selectedUsers = selectedIds
          .map((id) => outsourceUsers.find((item) => item.id === id))
          .filter(Boolean)
        const selectedNames = selectedUsers.map(
          (item) => item.displayName || item.email || 'Outsource user',
        )

        return {
          ...current,
          assignedUserIds: selectedIds,
          assignedUserNames: selectedNames,
          assignedUserId: selectedIds[0] || '',
          assignedUserName: selectedNames[0] || '',
        }
      }

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
          next.websiteLinkName = ''
          next.websiteLinkUrl = ''
          next.paymentDate = ''
        } else if (next.paymentStatus === 'free') {
          next.paymentStatus = 'pending'
        }
        return next
      }

      if (name === 'serviceCategory') {
        const next = { ...current, serviceCategory: value }
        if (value !== 'Website Development') {
          next.websiteLinkName = ''
          next.websiteLinkUrl = ''
        }
        return next
      }

      if (name === 'paymentStatus') {
        const next = { ...current, paymentStatus: value }
        if (!(next.serviceCategory === 'Website Development' && value === 'completed')) {
          next.websiteLinkName = ''
          next.websiteLinkUrl = ''
        }
        return next
      }

      if (name === 'deliveryType') {
        const next = { ...current, deliveryType: value }
        if (value !== 'outsource') {
          next.assignedUserId = ''
          next.assignedUserName = ''
          next.assignedUserIds = []
          next.assignedUserNames = []
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
    if (!serviceForm.serviceCategory) return 'Please select a service category.'

    const hasOneTimePart =
      serviceForm.chargeType !== 'free' &&
      (serviceForm.billingType === 'one-time' || serviceForm.billingType === 'hybrid')

    if (serviceForm.deliveryType === 'outsource') {
      if (!Array.isArray(serviceForm.assignedUserIds) || serviceForm.assignedUserIds.length === 0) {
        return 'Please assign this outsource service to at least one outsource user.'
      }

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

    if (showCompletedWebsiteLinkFields) {
      if (!String(serviceForm.websiteLinkName || '').trim()) {
        return 'Please enter a website name for this completed service.'
      }

      const rawWebsiteLink = String(serviceForm.websiteLinkUrl || '').trim()
      if (!rawWebsiteLink) {
        return 'Please add the website link URL for this completed service.'
      }

      if (!/^https?:\/\//i.test(rawWebsiteLink) && !/^[\w.-]+\.[a-z]{2,}/i.test(rawWebsiteLink)) {
        return 'Please enter a valid website URL.'
      }
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

  async function syncOutsourcePortalForService(serviceId, payload) {
    const selectedProject = projects.find((item) => item.id === payload.projectId)
    const projectName = selectedProject?.projectName || ''
    const assignedUserIds = Array.isArray(payload.assignedUserIds)
      ? payload.assignedUserIds.filter(Boolean)
      : payload.assignedUserId
        ? [payload.assignedUserId]
        : []
    const assignedUserNames = Array.isArray(payload.assignedUserNames)
      ? payload.assignedUserNames.filter(Boolean)
      : payload.assignedUserName
        ? [payload.assignedUserName]
        : []
    const assignedUserEmails = assignedUserIds.map((id) => {
      const matchedUser = outsourceUsers.find((item) => item.id === id)
      return String(matchedUser?.email || '').trim().toLowerCase()
    })

    if (payload.deliveryType !== 'outsource' || assignedUserIds.length === 0) {
      await deleteOutsourcePortalsByService(serviceId)
      return
    }

    await upsertOutsourcePortalByService({
      assignedUserId: assignedUserIds[0] || '',
      assignedUserName: assignedUserNames[0] || '',
      assignedUserEmail: assignedUserEmails[0] || '',
      assignedUserIds,
      assignedUserNames,
      assignedUserEmails,
      projectId: payload.projectId,
      projectName,
      serviceId,
      serviceName: payload.serviceName,
      timelineStart: payload.recurringStart || '',
      timelineEnd: payload.recurringOngoing ? '' : payload.recurringEnd || '',
      notes: payload.notes || '',
    })
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
        clientEmail: '',
        projectName: '',
        projectType: '',
        type: PROJECT_TYPES[0],
        startDate: '',
        deadline: '',
        status: PROJECT_STATUSES[0],
        notes: '',
        assignedUserIds: [],
        assignedUserNames: [],
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
      let savedServiceId = editingServiceId
      if (editingServiceId) {
        await updateService(editingServiceId, serviceForm)
      } else {
        const createdService = await addServiceToProject(serviceForm)
        savedServiceId = createdService?.id || ''
      }

      if (savedServiceId) {
        await syncOutsourcePortalForService(savedServiceId, serviceForm)
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

    const project = projects.find((item) => item.id === projectId)
    if (!project) return

    try {
      setProjectError('')
      await deleteProject(projectId)
      setProjectSuccess(`Deleted project: ${project.projectName || 'Project'}`)

      toast.notify(`Deleted project: ${project.projectName || 'Project'}`, {
        duration: 10000,
        actionLabel: 'Undo',
        onAction: async () => {
          await restoreProject(project)
          await loadData()
          setProjectSuccess(`Restored project: ${project.projectName || 'Project'}`)
          toast.success(`Restored project: ${project.projectName || 'Project'}`)
        },
      })

      await loadData()
    } catch (error) {
      setProjectError(error?.message || 'Failed to delete project.')
    }
  }

  async function removeService(serviceId) {
    if (!isAdmin) {
      setServiceError('Only admin can delete services.')
      return
    }

    const service = services.find((item) => item.id === serviceId)
    if (!service) return

    try {
      setServiceError('')
      await deleteService(serviceId)
      await deleteOutsourcePortalsByService(serviceId)
      if (editingServiceId === serviceId) {
        setEditingServiceId(null)
        setServiceForm(createInitialServiceForm())
      }
      setServiceSuccess(`Deleted service: ${service.serviceName || 'Service'}`)

      toast.notify(`Deleted service: ${service.serviceName || 'Service'}`, {
        duration: 10000,
        actionLabel: 'Undo',
        onAction: async () => {
          await restoreService(service)
          await loadData()
          setServiceSuccess(`Restored service: ${service.serviceName || 'Service'}`)
          toast.success(`Restored service: ${service.serviceName || 'Service'}`)
        },
      })

      await loadData()
    } catch (error) {
      setServiceError(error?.message || 'Failed to delete service.')
    }
  }

  async function generateProjectClientQrInvite(project) {
    if (!isAdmin) {
      setProjectError('Only admin can generate client portal QR access.')
      return
    }

    const safeProjectId = String(project?.id || '').trim()
    if (!safeProjectId) return

    setGeneratingQrProjectId(safeProjectId)
    setProjectError('')

    try {
      const invite = await createClientPortalQrInvite({
        projectId: safeProjectId,
        projectName: project?.projectName,
        clientEmail: project?.clientEmail,
        createdByUserId: user?.uid,
        createdByName: user?.displayName || user?.email || 'Admin',
      })

      setProjectQrInvite(invite)
      toast.success(`Client QR access generated for ${project?.projectName || 'project'}.`)
    } catch (error) {
      setProjectError(error?.message || 'Failed to generate client QR access link.')
    } finally {
      setGeneratingQrProjectId('')
    }
  }

  async function copyQrInviteValue(value, label) {
    const text = String(value || '').trim()
    if (!text) return

    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied.`)
    } catch {
      toast.error(`Unable to copy ${label.toLowerCase()}.`)
    }
  }

  function startEditService(service) {
    if (!isAdmin) {
      setServiceError('Only admin can edit services.')
      return
    }

    setShowComposer(true)
    setEditingServiceId(service.id)
    setServiceError('')
    setServiceSuccess('')
    setServiceForm(serviceToForm(service))
    requestAnimationFrame(() => {
      composerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function cancelEditProject() {
    setEditingProjectId(null)
    setProjectError('')
    setProjectSuccess('')
    setProjectForm({
      clientName: '',
      clientEmail: '',
      projectName: '',
      projectType: '',
      type: PROJECT_TYPES[0],
      startDate: '',
      deadline: '',
      status: PROJECT_STATUSES[0],
      notes: '',
      assignedUserIds: [],
      assignedUserNames: [],
      recurringPaused: false,
      recurringCancelled: false,
    })
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

    setShowComposer(true)
    setEditingProjectId(project.id)
    setProjectForm({
      clientName: project.clientName || '',
      clientEmail: project.clientEmail || '',
      projectName: project.projectName || '',
      projectType: project.projectType || '',
      type: normalizeProjectType(project.type || PROJECT_TYPES[0]),
      startDate: project.startDate || '',
      deadline: project.deadline || '',
      status: project.status || PROJECT_STATUSES[0],
      notes: project.notes || '',
      assignedUserIds: Array.isArray(project.assignedUserIds)
        ? project.assignedUserIds.filter(Boolean)
        : [],
      assignedUserNames: Array.isArray(project.assignedUserNames)
        ? project.assignedUserNames.filter(Boolean)
        : [],
      recurringPaused: Boolean(project.recurringPaused),
      recurringCancelled: Boolean(project.recurringCancelled),
    })
    requestAnimationFrame(() => {
      composerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <ModuleShell
      title={
        <span className="inline-flex items-center gap-2 align-middle leading-none">
          <span className="leading-none">Projects</span>
          {composerToggleButton}
        </span>
      }
      description="Manage client projects and services with one-time payments and monthly recurring plans (ongoing or until a specific date)."
    >
      {!isAdmin ? (
        <p className="mb-4 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
          View-only mode: only admin Karim can create, edit, or delete projects and services.
        </p>
      ) : null}

      <div
        ref={composerSectionRef}
        className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-500 ease-in-out ${
          isComposerVisible ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0'
        }`}
      >
      <div className="min-h-0 overflow-hidden">
      <div className="grid gap-4 pt-1 lg:grid-cols-2 lg:gap-6">
        <form onSubmit={submitProject} className="space-y-3 rounded-2xl border border-white/35 bg-white/86 p-4 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-bold text-slate-900">{editingProjectId ? 'Edit Project' : 'Create Project'}</h4>
            {editingProjectId ? (
              <button
                type="button"
                onClick={cancelEditProject}
                className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
              >
                Cancel Edit
              </button>
            ) : null}
          </div>
          <input name="clientName" value={projectForm.clientName} onChange={handleProjectInput} placeholder="Client name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
          <input name="clientEmail" type="email" value={projectForm.clientEmail} onChange={handleProjectInput} placeholder="Client login email (optional)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
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
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-700">Project assignees (optional)</label>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => applyProjectAssignees(outsourceUsers.map((item) => item.id))}
                  className="rounded-md px-2 py-1 font-medium text-slate-500 hover:bg-slate-200"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => applyProjectAssignees([])}
                  className="rounded-md px-2 py-1 font-medium text-slate-500 hover:bg-slate-200"
                >
                  Clear
                </button>
              </div>
            </div>
            <input
              value={projectAssigneeSearch}
              onChange={(event) => setProjectAssigneeSearch(event.target.value)}
              placeholder="Search outsource users..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
              {filteredProjectAssignees.length ? (
                filteredProjectAssignees.map((outsourceUser) => {
                  const isSelected = projectForm.assignedUserIds.includes(outsourceUser.id)
                  return (
                    <button
                      key={outsourceUser.id}
                      type="button"
                      onClick={() => toggleProjectAssignee(outsourceUser.id)}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition ${
                        isSelected
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="truncate">{getOutsourceUserLabel(outsourceUser)}</span>
                      <span>{isSelected ? 'Selected' : 'Select'}</span>
                    </button>
                  )
                })
              ) : (
                <p className="px-2 py-1 text-xs text-slate-400">No matching users.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {projectForm.assignedUserNames.length ? (
                projectForm.assignedUserNames.map((name, index) => {
                  const id = projectForm.assignedUserIds[index]
                  return (
                    <button
                      key={`${id || 'project-user'}_${index}`}
                      type="button"
                      onClick={() => toggleProjectAssignee(id)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100"
                    >
                      {name} ×
                    </button>
                  )
                })
              ) : (
                <p className="text-[11px] text-slate-400">No assignees selected.</p>
              )}
            </div>
          </div>
          {projectForm.type === 'Monthly' || projectForm.type === 'One-time + Monthly' ? (
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
          <button
            type="submit"
            disabled={submittingProject || !isAdmin}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#8246f6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6f39e7] disabled:cursor-not-allowed disabled:opacity-60"
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
                className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
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
          <select
            name="serviceCategory"
            value={serviceForm.serviceCategory}
            onChange={handleServiceInput}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            required
          >
            <option value="">Select service category</option>
            {SERVICE_CATEGORIES.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
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
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-700">Assigned outsource users</label>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => applyServiceAssignees(outsourceUsers.map((item) => item.id))}
                    className="rounded-md px-2 py-1 font-medium text-slate-500 hover:bg-slate-200"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => applyServiceAssignees([])}
                    className="rounded-md px-2 py-1 font-medium text-slate-500 hover:bg-slate-200"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <input
                value={serviceAssigneeSearch}
                onChange={(event) => setServiceAssigneeSearch(event.target.value)}
                placeholder="Search outsource users..."
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                {filteredServiceAssignees.length ? (
                  filteredServiceAssignees.map((outsourceUser) => {
                    const isSelected = serviceForm.assignedUserIds.includes(outsourceUser.id)
                    return (
                      <button
                        key={outsourceUser.id}
                        type="button"
                        onClick={() => toggleServiceAssignee(outsourceUser.id)}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition ${
                          isSelected
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <span className="truncate">{getOutsourceUserLabel(outsourceUser)}</span>
                        <span>{isSelected ? 'Selected' : 'Select'}</span>
                      </button>
                    )
                  })
                ) : (
                  <p className="px-2 py-1 text-xs text-slate-400">No matching users.</p>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {serviceForm.assignedUserNames.length ? (
                  serviceForm.assignedUserNames.map((name, index) => {
                    const id = serviceForm.assignedUserIds[index]
                    return (
                      <button
                        key={`${id || 'service-user'}_${index}`}
                        type="button"
                        onClick={() => toggleServiceAssignee(id)}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100"
                      >
                        {name} ×
                      </button>
                    )
                  })
                ) : (
                  <p className="text-[11px] text-slate-400">No assignees selected.</p>
                )}
              </div>
              <p className="text-xs text-slate-500">
                One click per user. No Ctrl/Cmd multi-select required.
              </p>
            </div>
          ) : null}

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
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-semibold text-slate-700">Payment setup</p>
                <div className="flex flex-wrap items-center gap-2">
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
                <option value="completed">Completed</option>
              </select>
              <input name="paymentDate" type="date" value={serviceForm.paymentDate} onChange={handleServiceInput} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
          ) : (
            <p className="text-xs text-slate-600">Free service: no client payment required. Estimated value is tracked for reporting.</p>
          )}

          {showCompletedWebsiteLinkFields ? (
            <div className="grid gap-3 rounded-xl border border-sky-100 bg-sky-50/60 p-3 sm:grid-cols-2">
              <input
                name="websiteLinkName"
                value={serviceForm.websiteLinkName}
                onChange={handleServiceInput}
                placeholder="Website name (e.g. Client Main Site)"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                name="websiteLinkUrl"
                value={serviceForm.websiteLinkUrl}
                onChange={handleServiceInput}
                placeholder="Website link (e.g. https://example.com)"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submittingService || !isAdmin}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
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
      </div>
      </div>

      <div className="mt-6 space-y-4">
        <div className="rounded-2xl border border-white/35 bg-white/80 p-3 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur sm:p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            <input
              value={projectSearch}
              onChange={(event) => setProjectSearch(event.target.value)}
              placeholder="Search by project, client, type..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm xl:col-span-2"
            />
            <select
              value={projectStatusFilter}
              onChange={(event) => setProjectStatusFilter(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <select
              value={projectTypeFilter}
              onChange={(event) => setProjectTypeFilter(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">All billing types</option>
              {PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <select
              value={projectServiceCategoryFilter}
              onChange={(event) => setProjectServiceCategoryFilter(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">All service categories</option>
              {availableServiceCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <select
              value={projectDeliveryFilter}
              onChange={(event) => setProjectDeliveryFilter(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">All delivery modes</option>
              <option value="inhouse">Inhouse only</option>
              <option value="outsource">Outsource only</option>
              <option value="mix">Mix (Inhouse + Outsource)</option>
            </select>
            <select
              value={projectSort}
              onChange={(event) => setProjectSort(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="agency_share_desc">Highest agency share</option>
              <option value="agency_share_asc">Lowest agency share</option>
              <option value="contract_value_desc">Highest contract value</option>
              <option value="contract_value_asc">Lowest contract value</option>
              <option value="outsource_share_desc">Highest outsource payout</option>
              <option value="outsource_share_asc">Lowest outsource payout</option>
              <option value="updated_desc">Latest updated</option>
              <option value="updated_asc">Oldest updated</option>
              <option value="deadline_asc">Nearest deadline</option>
              <option value="deadline_desc">Farthest deadline</option>
              <option value="name_asc">Project name A-Z</option>
              <option value="name_desc">Project name Z-A</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setProjectSearch('')
                setProjectStatusFilter('all')
                setProjectTypeFilter('all')
                setProjectServiceCategoryFilter('all')
                setProjectDeliveryFilter('all')
                setProjectSort('updated_desc')
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Reset
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Showing {visibleProjects.length} of {projects.length} projects.
          </p>
        </div>

        {loading ? <p className="text-sm text-slate-600">Loading projects...</p> : null}
        {visibleProjects.map((project) => (
          <article key={project.id} className="rounded-2xl border border-white/35 bg-white/82 p-4 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-base font-bold text-slate-900 break-words sm:text-lg">{project.projectName}</h4>
                <p className="text-xs text-slate-600 sm:text-sm">{project.clientName} • {project.status} • {normalizeProjectType(project.type || '')}</p>
                <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-lg bg-slate-100 px-2 py-1.5 font-semibold text-slate-700">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Contract</p>
                    <p>{formatCurrency(revenueBreakdownByProjectId[project.id]?.totalContractValue || 0)}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-100 px-2 py-1.5 font-semibold text-emerald-700">
                    <p className="text-[10px] uppercase tracking-wider text-emerald-700/80">Agency Share</p>
                    <p>{formatCurrency(revenueBreakdownByProjectId[project.id]?.agencyShareTotal || 0)}</p>
                  </div>
                  <div className="rounded-lg bg-sky-100 px-2 py-1.5 font-semibold text-sky-700">
                    <p className="text-[10px] uppercase tracking-wider text-sky-700/80">Inhouse</p>
                    <p>{formatCurrency(revenueBreakdownByProjectId[project.id]?.inhouseRevenue || 0)}</p>
                  </div>
                  <div className="rounded-lg bg-amber-100 px-2 py-1.5 font-semibold text-amber-700">
                    <p className="text-[10px] uppercase tracking-wider text-amber-700/80">Outsource</p>
                    <p>{formatCurrency(revenueBreakdownByProjectId[project.id]?.outsourcePayout || 0)}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 px-2 py-1.5 font-semibold text-emerald-700">
                    <p className="text-[10px] uppercase tracking-wider text-emerald-700/80">Free Value</p>
                    <p>{formatCurrency(revenueBreakdownByProjectId[project.id]?.freeValue || 0)}</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => generateProjectClientQrInvite(project)}
                    disabled={generatingQrProjectId === project.id}
                    className="inline-flex min-h-9 items-center rounded-lg bg-violet-600 px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {generatingQrProjectId === project.id ? 'Generating...' : 'Client QR'}
                  </button>
                ) : null}
                {isAdmin ? <button type="button" onClick={() => startEditProject(project)} className="inline-flex min-h-9 items-center rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-white">Edit</button> : null}
                {isAdmin ? <button type="button" onClick={() => removeProject(project.id)} className="inline-flex min-h-9 items-center rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white">Delete</button> : null}
              </div>
            </div>

            {projectQrInvite?.projectId === project.id ? (
              <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-violet-700">Exclusive Client QR Access</p>
                    <p className="mt-1 text-xs text-violet-800/85 break-all">{projectQrInvite.accessUrl}</p>
                    <p className="mt-1 text-[11px] text-violet-700/80">
                      Expires: {new Date(projectQrInvite.expiresAt).toLocaleString('en-GB')}
                    </p>
                  </div>
                  <img
                    src={projectQrInvite.qrDataUrl}
                    alt={`Client access QR for ${project.projectName}`}
                    className="h-28 w-28 rounded-xl border border-violet-200 bg-white p-1"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copyQrInviteValue(projectQrInvite.accessUrl, 'Access link')}
                    className="inline-flex min-h-9 items-center rounded-lg border border-violet-200 bg-white px-3 py-1 text-xs font-semibold text-violet-700"
                  >
                    Copy Link
                  </button>
                  <button
                    type="button"
                    onClick={() => copyQrInviteValue(projectQrInvite.token, 'Token')}
                    className="inline-flex min-h-9 items-center rounded-lg border border-violet-200 bg-white px-3 py-1 text-xs font-semibold text-violet-700"
                  >
                    Copy Token
                  </button>
                  <button
                    type="button"
                    onClick={() => setProjectQrInvite(null)}
                    className="inline-flex min-h-9 items-center rounded-lg border border-violet-200 bg-white px-3 py-1 text-xs font-semibold text-violet-700"
                  >
                    Hide
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-3 space-y-2">
              {services.filter((service) => service.projectId === project.id).map((service) => {
                const serviceBreakdown = getServiceFinancialBreakdown(service)

                return (
                <div key={service.id} className="rounded-xl border border-slate-200 bg-white/90 p-2.5 text-sm shadow-[0_8px_20px_-18px_rgba(15,23,42,0.55)]">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-semibold text-slate-900 break-words">{service.serviceName}</p>
                    <div className="flex gap-2">
                      {isAdmin ? <button type="button" onClick={() => startEditService(service)} className="inline-flex min-h-9 items-center rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">Edit</button> : null}
                      {isAdmin ? <button type="button" onClick={() => removeService(service.id)} className="inline-flex min-h-9 items-center rounded bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">Remove</button> : null}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">{service.chargeType === 'free' ? 'Free' : 'Paid'}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">{service.deliveryType === 'outsource' ? 'Outsource' : 'Inhouse'}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">{service.billingType === 'hybrid' ? 'Hybrid' : service.billingType === 'monthly' ? 'Monthly' : 'One-time'}</span>
                    <span className="rounded-full bg-violet-100 px-2 py-1 font-semibold text-violet-700">{service.serviceCategory || 'Uncategorized'}</span>
                  </div>

                  <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-700">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">Contract</p>
                      <p className="font-semibold">{formatCurrency(serviceBreakdown.contractValue)}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-emerald-700">
                      <p className="text-[10px] uppercase tracking-wider text-emerald-700/80">Agency Share</p>
                      <p className="font-semibold">{formatCurrency(serviceBreakdown.agencyShare)}</p>
                    </div>
                    <div className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-sky-700">
                      <p className="text-[10px] uppercase tracking-wider text-sky-700/80">One-time</p>
                      <p className="font-semibold">{formatCurrency(serviceBreakdown.oneTimeContract)}</p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-700">
                      <p className="text-[10px] uppercase tracking-wider text-amber-700/80">Recurring</p>
                      <p className="font-semibold">{formatCurrency(serviceBreakdown.recurringContract)}</p>
                    </div>
                  </div>

                  {service.chargeType !== 'free' ? (
                    <p className="mt-1 text-xs text-slate-600">
                      Payment status: <span className="font-semibold">{service.paymentStatus || 'pending'}</span>
                      {service.billingType === 'monthly' || service.billingType === 'hybrid'
                        ? ` • Recurring months active: ${serviceBreakdown.recurringMonths}`
                        : ''}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-600">
                      Value: {formatCurrency(Number(service.valueAmount) || Number(service.totalContractValue) || 0)}
                    </p>
                  )}

                  {service.serviceCategory === 'Website Development' &&
                  service.paymentStatus === 'completed' &&
                  service.websiteLinkUrl ? (
                    <a
                      href={service.websiteLinkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                    >
                      <span>{service.websiteLinkName || 'Website Link'}</span>
                      <span aria-hidden="true">↗</span>
                    </a>
                  ) : null}

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
                    <details className="mt-2 rounded-lg border border-amber-100 bg-amber-50/60 px-2 py-1.5 text-xs text-amber-800">
                      <summary className="cursor-pointer font-semibold">Outsource Breakdown</summary>
                      <p className="mt-1">
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
                    </details>
                  ) : null}

                  {Array.isArray(service.installments) && service.installments.length ? (
                    <details className="mt-2 rounded border border-slate-100 bg-slate-50 p-2 text-xs text-slate-700">
                      <summary className="cursor-pointer font-semibold">Installment Schedule ({service.installments.length})</summary>
                      <div className="mt-1 space-y-1">
                        {service.installments.map((installment, index) => (
                          <p key={installment.id || `${service.id}-${index}`}>
                            Payment {index + 1}: {formatCurrency(Number(installment.amount) || 0)} • Due {installment.dueDate || 'N/A'} • {installment.status || 'pending'}
                          </p>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
                )})}
            </div>
          </article>
        ))}
        {!loading && projects.length === 0 ? <p className="text-sm text-slate-600">No projects yet.</p> : null}
        {!loading && projects.length > 0 && visibleProjects.length === 0 ? (
          <p className="text-sm text-slate-600">No projects match the selected filters.</p>
        ) : null}
      </div>
      <div className="mt-4 text-xs text-slate-500">
        Monthly recurring projects are tracked with pause/cancel flags and ready for Cloud Function automation.
      </div>
    </ModuleShell>
  )
}

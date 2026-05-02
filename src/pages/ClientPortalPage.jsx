import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ModuleShell from '../components/layout/ModuleShell'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { formatCurrency, formatDate } from '../utils/helpers'
import {
  createClientTicket,
  getClientHealthLabel,
  getClientWorkspace,
  subscribeClientTickets,
  subscribeAllClientTickets,
  updateClientTicketOwnership,
  updateClientTicketStatus,
} from '../services/clientPortalService'
import { emitWorkflowEvent } from '../services/workflowEvents'
import { getAllUsers } from '../services/teamUsersService'

function StatusBadge({ value }) {
  const normalized = String(value || '').trim().toLowerCase()
  const classes =
    normalized === 'blocked'
      ? 'ip-sem-badge-blocked'
      : normalized === 'needs_review' || normalized === 'in_review'
        ? 'ip-sem-badge-review'
        : normalized === 'approved'
          ? 'ip-sem-badge-approved'
          : normalized === 'overdue'
            ? 'ip-sem-badge-overdue'
            : normalized === 'paid' || normalized === 'billed'
              ? 'ip-sem-badge-paid'
              : normalized === 'delivered' || normalized === 'resolved' || normalized === 'closed'
                ? 'ip-sem-badge-delivered'
                : normalized === 'open'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-200 text-slate-700'

  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${classes}`}>{value || 'Pending'}</span>
}

export default function ClientPortalPage() {
  const { role } = useAuth()
  const isAgency = role === 'admin' || role === 'partner' || role === 'outsource'

  return isAgency ? <AgencyClientHub /> : <ClientSpaceView />
}

// ─── Agency View (admin / partner / outsource) ──────────────────────────────

function priorityOrder(priority) {
  const map = { urgent: 0, high: 1, normal: 2, low: 3 }
  return map[String(priority || '').toLowerCase()] ?? 2
}

function AgencyClientHub() {
  const { role, user, profile } = useAuth()
  const canAssignOwner = role === 'admin' || role === 'partner'
  const toast = useToast()
  const [tickets, setTickets] = useState([])
  const [owners, setOwners] = useState([])
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [filterStatus, setFilterStatus] = useState('open')
  const [updatingTicketId, setUpdatingTicketId] = useState(null)

  useEffect(() => {
    let active = true
    getAllUsers()
      .then((rows) => {
        if (!active) return
        setOwners(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!active) return
        setOwners([])
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setLoadingTickets(true)
    const unsubscribe = subscribeAllClientTickets(
      (items) => {
        setTickets(items)
        setLoadingTickets(false)
      },
      (error) => {
        toast.error(error?.message || 'Failed to load client requests.')
        setLoadingTickets(false)
      },
    )
    return () => unsubscribe()
  }, [toast])

  async function onChangeStatus(ticketId, newStatus) {
    setUpdatingTicketId(ticketId)
    try {
      const ticket = tickets.find((item) => item.id === ticketId)
      await updateClientTicketStatus(ticketId, newStatus, {
        actorId: user?.uid,
        actorName: profile?.name || user?.displayName || user?.email || 'Team member',
      })

      emitWorkflowEvent({
        eventType: 'ticket_status_changed',
        targetUserId: ticket?.clientId || '',
        portal: 'admin',
        message: `Your support request was marked ${newStatus}`,
        description: ticket?.subject || 'Support request',
        metadata: {
          actorId: 'system',
          actorName: 'IPMS Support',
          actorRole: 'admin',
        },
      }).catch(() => {})

      toast.success('Request status updated.')
    } catch (error) {
      toast.error(error?.message || 'Failed to update status.')
    } finally {
      setUpdatingTicketId(null)
    }
  }

  async function onAssignOwner(ticket, ownerId) {
    if (!canAssignOwner) return
    const owner = owners.find((item) => item.id === ownerId)

    try {
      if (!ownerId || !owner) {
        await updateClientTicketOwnership(ticket.id, { id: '', name: '', email: '' }, {
          id: user?.uid,
          name: profile?.name || user?.displayName || user?.email || 'Team member',
        })
        toast.success('Request owner cleared.')
        return
      }

      await updateClientTicketOwnership(ticket.id, owner, {
        id: user?.uid,
        name: profile?.name || user?.displayName || user?.email || 'Team member',
      })
      toast.success(`Owner assigned to ${owner.name || owner.email || 'team member'}.`)
    } catch (error) {
      toast.error(error?.message || 'Failed to assign request owner.')
    }
  }

  const filtered = useMemo(() => {
    const base = filterStatus === 'all' ? tickets : tickets.filter((t) => t.status === filterStatus)
    return [...base].sort((a, b) => {
      if (a.status !== b.status) {
        const open = (x) => (x.status === 'open' ? 0 : 1)
        if (open(a) !== open(b)) return open(a) - open(b)
      }
      return priorityOrder(a.priority) - priorityOrder(b.priority)
    })
  }, [tickets, filterStatus])

  const counts = useMemo(() => ({
    all: tickets.length,
    open: tickets.filter((t) => t.status === 'open').length,
    resolved: tickets.filter((t) => t.status === 'resolved').length,
    closed: tickets.filter((t) => t.status === 'closed').length,
  }), [tickets])

  const workflowPulse = useMemo(() => {
    const urgent = tickets.filter((ticket) => String(ticket?.priority || '').toLowerCase() === 'urgent').length
    const high = tickets.filter((ticket) => String(ticket?.priority || '').toLowerCase() === 'high').length
    return {
      urgent,
      high,
      intake: counts.open,
      inProgress: counts.open,
      resolved: counts.resolved,
    }
  }, [counts.open, counts.resolved, tickets])

  return (
    <ModuleShell
      title="Client Hub"
      description="Monitor and respond to all client support requests across every project."
      variant="admin"
    >
      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: 'open', label: 'Open' },
          { key: 'resolved', label: 'Resolved' },
          { key: 'closed', label: 'Closed' },
          { key: 'all', label: 'All' },
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilterStatus(key)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              filterStatus === key
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${filterStatus === key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white/80 p-4">
        <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-600">Workflow Pulse</h4>
        <p className="mt-1 text-xs text-slate-500">Shared flow: client request intake to outsource execution to admin/client closure.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl bg-rose-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.08em] text-rose-500">Urgent</p>
            <p className="mt-1 text-lg font-bold text-rose-700">{workflowPulse.urgent}</p>
          </div>
          <div className="rounded-xl bg-orange-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.08em] text-orange-500">High</p>
            <p className="mt-1 text-lg font-bold text-orange-700">{workflowPulse.high}</p>
          </div>
          <div className="rounded-xl bg-violet-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Intake</p>
            <p className="mt-1 text-lg font-bold text-slate-700">{workflowPulse.intake}</p>
          </div>
          <div className="rounded-xl bg-sky-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.08em] text-sky-500">Execution</p>
            <p className="mt-1 text-lg font-bold text-sky-700">{workflowPulse.inProgress}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.08em] text-emerald-500">Closed</p>
            <p className="mt-1 text-lg font-bold text-emerald-700">{workflowPulse.resolved}</p>
          </div>
        </div>
      </section>

      {loadingTickets ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">Loading client requests...</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          {filterStatus === 'all' ? 'No client requests yet.' : `No ${filterStatus} requests.`}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((ticket) => (
            <article key={ticket.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{ticket.subject}</p>
                    <PriorityBadge value={ticket.priority} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {ticket.clientName || 'Client'}{ticket.clientEmail ? ` · ${ticket.clientEmail}` : ''}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 uppercase tracking-[0.08em]">{ticket.requestType || 'support'}</span>
                    {ticket.projectId ? <span>Project: {ticket.projectId}</span> : null}
                    {ticket.serviceId ? <span>Service: {ticket.serviceId}</span> : null}
                    {ticket.ownerName ? <span>Owner: {ticket.ownerName}</span> : <span>Owner: Unassigned</span>}
                  </div>
                  <p className="mt-2 text-sm text-slate-700 whitespace-pre-line">{ticket.details}</p>
                  <p className="mt-2 text-[11px] text-slate-400">{formatDate(ticket.createdAt)}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge value={ticket.status} />
                  {canAssignOwner ? (
                    <select
                      value={ticket.ownerUserId || ''}
                      onChange={(event) => onAssignOwner(ticket, event.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600"
                    >
                      <option value="">Unassigned</option>
                      {owners.map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {owner.name || owner.email || owner.id}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {ticket.status === 'open' && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={updatingTicketId === ticket.id}
                        onClick={() => onChangeStatus(ticket.id, 'resolved')}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                      >
                        Resolve
                      </button>
                      <button
                        type="button"
                        disabled={updatingTicketId === ticket.id}
                        onClick={() => onChangeStatus(ticket.id, 'closed')}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
                      >
                        Close
                      </button>
                    </div>
                  )}
                  {ticket.status === 'resolved' && (
                    <button
                      type="button"
                      disabled={updatingTicketId === ticket.id}
                      onClick={() => onChangeStatus(ticket.id, 'closed')}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
                    >
                      Close
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </ModuleShell>
  )
}

function PriorityBadge({ value }) {
  const normalized = String(value || 'normal').toLowerCase()
  const classes =
    normalized === 'urgent'
      ? 'bg-red-100 text-red-700'
      : normalized === 'high'
        ? 'bg-orange-100 text-orange-700'
        : normalized === 'normal'
          ? 'bg-blue-100 text-blue-700'
          : 'bg-slate-100 text-slate-500'
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${classes}`}>
      {value || 'normal'}
    </span>
  )
}

// ─── Client View ─────────────────────────────────────────────────────────────

function ClientSpaceView() {
  const { user, profile } = useAuth()
  const toast = useToast()
  const lastErrorToastRef = useRef({ message: '', at: 0 })
  const isGuestSession = Boolean(user?.isAnonymous)

  const [loading, setLoading] = useState(true)
  const [workspace, setWorkspace] = useState({
    projects: [],
    servicesByProjectId: {},
    invoices: [],
    stats: {
      totalProjects: 0,
      activeProjects: 0,
      completedProjects: 0,
      averageProgress: 0,
    },
  })
  const [tickets, setTickets] = useState([])
  const [savingTicket, setSavingTicket] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [ticketForm, setTicketForm] = useState({
    subject: '',
    details: '',
    priority: 'normal',
    requestType: 'support',
    projectId: '',
    serviceId: '',
    milestoneId: '',
    deliverableId: '',
    scopeChangeId: '',
  })

  const projectCountLabel = useMemo(() => {
    const count = Number(workspace?.stats?.totalProjects) || 0
    return `${count} ${count === 1 ? 'project' : 'projects'}`
  }, [workspace?.stats?.totalProjects])

  const showErrorOnce = useCallback((message) => {
    const text = String(message || '').trim() || 'Something went wrong.'
    const now = Date.now()
    const sameMessage = lastErrorToastRef.current.message === text
    const withinWindow = now - lastErrorToastRef.current.at < 4000
    if (sameMessage && withinWindow) return
    lastErrorToastRef.current = { message: text, at: now }
    toast.error(text)
  }, [toast])

  const loadWorkspace = useCallback(async () => {
    if (!user?.uid) return
    setLoading(true)
    try {
      const data = await getClientWorkspace(user, profile)
      setWorkspace(data)
    } catch (error) {
      showErrorOnce(error?.message || 'Failed to load your client portal data.')
    } finally {
      setLoading(false)
    }
  }, [profile, showErrorOnce, user])

  useEffect(() => {
    if (!user?.uid) return
    loadWorkspace()
  }, [loadWorkspace, user?.uid])

  useEffect(() => {
    if (!user?.uid) return undefined
    if (isGuestSession) {
      setTickets([])
      return undefined
    }
    const unsubscribe = subscribeClientTickets(
      user.uid,
      (items) => setTickets(items),
      (error) => showErrorOnce(error?.message || 'Failed to load support requests.'),
    )
    return () => unsubscribe()
  }, [isGuestSession, showErrorOnce, user?.uid])

  async function onSubmitTicket(event) {
    event.preventDefault()
    if (isGuestSession) {
      showErrorOnce('Support requests are disabled for guest link sessions.')
      return
    }
    setSavingTicket(true)
    try {
      await createClientTicket({
        clientId: user?.uid,
        clientEmail: user?.email,
        clientName: profile?.name || user?.displayName || user?.email || 'Client',
        subject: ticketForm.subject,
        details: ticketForm.details,
        priority: ticketForm.priority,
        requestType: ticketForm.requestType,
        projectId: ticketForm.projectId,
        serviceId: ticketForm.serviceId,
        milestoneId: ticketForm.milestoneId,
        deliverableId: ticketForm.deliverableId,
        scopeChangeId: ticketForm.scopeChangeId,
      })

      emitWorkflowEvent({
        eventType: 'ticket_status_changed',
        user,
        profile,
        portal: 'client',
        message: `New client request: ${ticketForm.subject}`,
        description: ticketForm.details,
        metadata: {
          requestType: ticketForm.requestType,
          priority: ticketForm.priority,
        },
      }).catch(() => {})

      setTicketForm({
        subject: '',
        details: '',
        priority: 'normal',
        requestType: 'support',
        projectId: '',
        serviceId: '',
        milestoneId: '',
        deliverableId: '',
        scopeChangeId: '',
      })
      toast.success('Support request submitted successfully.')
    } catch (error) {
      toast.error(error?.message || 'Unable to submit support request.')
    } finally {
      setSavingTicket(false)
    }
  }

  const statsCards = [
    { label: 'Total Projects', value: workspace?.stats?.totalProjects || 0, tone: 'from-slate-500/10 to-slate-300/10' },
    { label: 'Active Projects', value: workspace?.stats?.activeProjects || 0, tone: 'from-sky-500/15 to-sky-400/5' },
    { label: 'Completed Projects', value: workspace?.stats?.completedProjects || 0, tone: 'from-emerald-500/15 to-emerald-400/5' },
    { label: 'Average Progress', value: `${workspace?.stats?.averageProgress || 0}%`, tone: 'from-sky-500/15 to-emerald-400/5' },
  ]

  const timelineProjects = useMemo(
    () =>
      [...workspace.projects]
        .filter((project) => project?.deadline)
        .sort((a, b) => String(a.deadline || '').localeCompare(String(b.deadline || ''))),
    [workspace.projects],
  )

  const serviceOptions = useMemo(() => {
    if (!ticketForm.projectId) return []
    return Array.isArray(workspace.servicesByProjectId?.[ticketForm.projectId])
      ? workspace.servicesByProjectId[ticketForm.projectId]
      : []
  }, [ticketForm.projectId, workspace.servicesByProjectId])

  const accountOwnerName = useMemo(() => {
    for (const project of workspace.projects) {
      const ownerName = String(project?.lifecycle?.ownerName || '').trim()
      if (ownerName) return ownerName
    }
    const ownedTicket = tickets.find((ticket) => String(ticket?.ownerName || '').trim())
    return String(ownedTicket?.ownerName || '').trim() || 'Assigned by your account team'
  }, [tickets, workspace.projects])

  const latestUpdateLabel = useMemo(() => {
    const projectDates = workspace.projects
      .map((project) => new Date(project?.updatedAt || project?.createdAt || 0))
      .filter((date) => !Number.isNaN(date.getTime()))
    const ticketDates = tickets
      .map((ticket) => new Date(ticket?.updatedAt || ticket?.createdAt || 0))
      .filter((date) => !Number.isNaN(date.getTime()))
    const allDates = [...projectDates, ...ticketDates]
    if (!allDates.length) return 'No updates yet'
    const latest = allDates.sort((a, b) => b.getTime() - a.getTime())[0]
    return formatDate(latest.toISOString())
  }, [tickets, workspace.projects])

  const nextMilestoneLabel = useMemo(() => {
    const milestones = workspace.projects
      .map((project) => ({
        name: project?.projectName || 'Project',
        deadline: project?.deadline,
      }))
      .filter((item) => item.deadline)
      .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))
    if (!milestones.length) return 'No milestone dates scheduled yet'
    return `${milestones[0].name}: ${formatDate(milestones[0].deadline)}`
  }, [workspace.projects])

  const tabItems = [
    { id: 'overview', label: 'Overview' },
    { id: 'timeline', label: 'Timeline & Deliverables' },
    { id: 'requests', label: 'Requests & Messages' },
    { id: 'billing', label: 'Billing' },
  ]

  const showOverviewBlocks = activeTab === 'overview'
  const showTimelineBlocks = activeTab === 'timeline'
  const showRequestBlocks = activeTab === 'requests'
  const showBillingBlocks = activeTab === 'billing'

  return (
    <ModuleShell
      title="Client Space"
      description="Track your projects in real time, monitor billing snapshots, and reach the team directly."
      variant="client"
      actions={(
        <button
          type="button"
          onClick={loadWorkspace}
          className="inline-flex items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
        >
          Refresh Data
        </button>
      )}
    >
      <section className="ip-section-band grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-700">What Is Happening</p>
          <p className="mt-1 text-2xl font-black text-sky-800">{workspace.stats?.averageProgress || 0}%</p>
          <p className="text-xs text-sky-700">overall delivery progress across your projects</p>
        </article>
        <article className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700">Account Owner</p>
          <p className="mt-1 text-base font-bold text-emerald-800">{accountOwnerName}</p>
          <p className="text-xs text-emerald-700">primary contact for approvals and delivery</p>
        </article>
        <article className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-700">Next Milestone</p>
          <p className="mt-1 text-sm font-bold text-amber-800">{nextMilestoneLabel}</p>
          <p className="text-xs text-amber-700">upcoming target date in your plan</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Latest Update</p>
          <p className="mt-1 text-base font-bold text-slate-800">{latestUpdateLabel}</p>
          <p className="text-xs text-slate-500">last activity from delivery or support workflow</p>
        </article>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statsCards.map((card) => (
          <article key={card.label} className={`rounded-2xl border border-slate-200 bg-gradient-to-br ${card.tone} p-4`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{card.value}</p>
          </article>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/80 p-2">
        {tabItems.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-xl px-3 py-2 text-xs font-semibold tracking-[0.06em] transition ${
              activeTab === tab.id
                ? 'bg-sky-700 text-white'
                : 'text-slate-600 hover:bg-sky-50 hover:text-sky-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {showOverviewBlocks || showTimelineBlocks || showBillingBlocks ? (
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        {(showOverviewBlocks || showTimelineBlocks) ? (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white/85 p-6">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-lg font-bold tracking-tight text-slate-800">
              {showTimelineBlocks ? 'Timeline & Deliverables' : 'Project Progress'}
            </h4>
            <span className="text-xs text-slate-500">{projectCountLabel}</span>
          </div>
          {loading ? (
            <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">Loading your projects...</p>
          ) : workspace.projects.length ? (
            <div className="space-y-3">
              {(showTimelineBlocks ? timelineProjects : workspace.projects).map((project) => (
                <article key={project.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="text-base font-semibold text-slate-900">{project?.projectName || 'Project'}</h4>
                      <p className="mt-1 text-xs text-slate-500">{project?.status || 'In progress'}</p>
                    </div>
                    <span className="rounded-full ip-sem-badge-delivered px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]">
                      {getClientHealthLabel(project?.progress)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Start Date</p>
                      <p className="mt-1 font-medium text-slate-800">{formatDate(project?.startDate)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Deadline</p>
                      <p className="mt-1 font-medium text-slate-800">{formatDate(project?.deadline)}</p>
                    </div>
                  </div>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500" style={{ width: `${Math.max(Math.min(Number(project?.progress) || 0, 100), 0)}%` }} />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">
              No projects are linked to your account yet. Ask your account manager to assign your user to each project.
            </p>
          )}
        </section>
        ) : null}

        {(showOverviewBlocks || showBillingBlocks) ? (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white/85 p-6">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-lg font-bold tracking-tight text-slate-800">Billing Snapshot</h4>
            <span className="text-xs text-slate-500">{workspace.invoices.length} items</span>
          </div>
          <div className="space-y-2">
            {workspace.invoices.length ? (
              workspace.invoices.slice(0, 8).map((invoice) => (
                <article key={invoice.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{invoice.projectName}</p>
                      <p className="text-xs text-slate-500">{invoice.serviceName}</p>
                    </div>
                    <StatusBadge value={invoice.status} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                    <span>{formatDate(invoice.dueDate)}</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(invoice.amount, invoice.currency || 'EGP')}</span>
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">No billing records available yet.</p>
            )}
          </div>
        </section>
        ) : null}
      </div>
      ) : null}

      {showRequestBlocks ? (
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl border border-slate-200 bg-white/80 p-4">
          <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-600">Request Support</h4>
          {isGuestSession ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
              Support requests are hidden in guest link sessions.
            </div>
          ) : null}
          <form onSubmit={onSubmitTicket} className="mt-3 space-y-3">
            <input
              type="text"
              value={ticketForm.subject}
              onChange={(event) => setTicketForm((current) => ({ ...current, subject: event.target.value }))}
              placeholder="Subject"
              maxLength={120}
              required
              disabled={isGuestSession}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            />
            <textarea
              value={ticketForm.details}
              onChange={(event) => setTicketForm((current) => ({ ...current, details: event.target.value }))}
              placeholder="Tell us what you need..."
              rows={4}
              maxLength={1200}
              required
              disabled={isGuestSession}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={ticketForm.requestType}
                onChange={(event) => setTicketForm((current) => ({ ...current, requestType: event.target.value }))}
                disabled={isGuestSession}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              >
                <option value="support">Support</option>
                <option value="deliverable">Deliverable Issue</option>
                <option value="milestone_approval">Milestone Approval</option>
                <option value="scope_change">Scope Change</option>
              </select>
              <select
                value={ticketForm.projectId}
                onChange={(event) => setTicketForm((current) => ({ ...current, projectId: event.target.value, serviceId: '' }))}
                disabled={isGuestSession}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              >
                <option value="">Link Project (optional)</option>
                {workspace.projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.projectName || project.id}</option>
                ))}
              </select>
              <select
                value={ticketForm.serviceId}
                onChange={(event) => setTicketForm((current) => ({ ...current, serviceId: event.target.value }))}
                disabled={isGuestSession || !ticketForm.projectId}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              >
                <option value="">Link Service (optional)</option>
                {serviceOptions.map((service) => (
                  <option key={service.id} value={service.id}>{service.serviceName || service.id}</option>
                ))}
              </select>
              <input
                type="text"
                value={ticketForm.milestoneId}
                onChange={(event) => setTicketForm((current) => ({ ...current, milestoneId: event.target.value }))}
                placeholder="Milestone / deliverable ref"
                disabled={isGuestSession}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <select
                value={ticketForm.priority}
                onChange={(event) => setTicketForm((current) => ({ ...current, priority: event.target.value }))}
                disabled={isGuestSession}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <button
                type="submit"
                disabled={savingTicket || isGuestSession}
                className="inline-flex items-center justify-center rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {savingTicket ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white/80 p-4">
          <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-600">Recent Support Requests</h4>
          <div className="mt-3 space-y-2">
            {tickets.length ? (
              tickets.slice(0, 10).map((ticket) => (
                <article key={ticket.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{ticket.subject}</p>
                    <StatusBadge value={ticket.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">{ticket.details}</p>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{formatDate(ticket.createdAt)}</span>
                    <span className="uppercase tracking-[0.08em]">{ticket.requestType || 'support'} · {ticket.priority || 'normal'}</span>
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">No support requests submitted yet.</p>
            )}
          </div>
        </section>
      </div>
      ) : null}
    </ModuleShell>
  )
}


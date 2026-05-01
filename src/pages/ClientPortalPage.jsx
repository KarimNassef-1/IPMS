import { useEffect, useMemo, useState } from 'react'
import ModuleShell from '../components/layout/ModuleShell'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { formatCurrency, formatDate } from '../utils/helpers'
import {
  createClientTicket,
  getClientHealthLabel,
  getClientWorkspace,
  subscribeClientTickets,
} from '../services/clientPortalService'

function StatusBadge({ value }) {
  const normalized = String(value || '').trim().toLowerCase()
  const classes =
    normalized === 'open'
      ? 'bg-amber-100 text-amber-800'
      : normalized === 'resolved' || normalized === 'closed'
        ? 'bg-emerald-100 text-emerald-800'
        : 'bg-slate-200 text-slate-700'

  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${classes}`}>{value || 'Pending'}</span>
}

function ProjectProgressCard({ project }) {
  const progress = Math.max(Math.min(Number(project?.progress) || 0, 100), 0)
  const health = getClientHealthLabel(progress)

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-base font-semibold text-slate-900">{project?.projectName || 'Project'}</h4>
          <p className="mt-1 text-xs text-slate-500">{project?.status || 'In progress'}</p>
        </div>
        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-violet-700">{health}</span>
      </div>

      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
        <span>{progress}% done</span>
        <span>{Number(project?.openServicesCount) || 0} open services</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600">
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Start Date</p>
          <p className="mt-1 font-medium text-slate-800">{formatDate(project?.startDate)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Deadline</p>
          <p className="mt-1 font-medium text-slate-800">{formatDate(project?.deadline)}</p>
        </div>
      </div>
    </article>
  )
}

export default function ClientPortalPage() {
  const { user, profile } = useAuth()
  const toast = useToast()

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
  const [ticketForm, setTicketForm] = useState({
    subject: '',
    details: '',
    priority: 'normal',
  })

  const projectCountLabel = useMemo(() => {
    const count = Number(workspace?.stats?.totalProjects) || 0
    return `${count} ${count === 1 ? 'project' : 'projects'}`
  }, [workspace?.stats?.totalProjects])

  async function loadWorkspace() {
    if (!user?.uid) return

    setLoading(true)
    try {
      const data = await getClientWorkspace(user, profile)
      setWorkspace(data)
    } catch (error) {
      toast.error(error?.message || 'Failed to load your client portal data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user?.uid) return
    loadWorkspace()
  }, [user?.uid, user?.email, profile?.name])

  useEffect(() => {
    if (!user?.uid) return undefined

    const unsubscribe = subscribeClientTickets(
      user.uid,
      (items) => {
        setTickets(items)
      },
      (error) => {
        toast.error(error?.message || 'Failed to load support requests.')
      },
    )

    return () => unsubscribe()
  }, [user?.uid, toast])

  async function onSubmitTicket(event) {
    event.preventDefault()
    setSavingTicket(true)

    try {
      await createClientTicket({
        clientId: user?.uid,
        clientEmail: user?.email,
        clientName: profile?.name || user?.displayName || user?.email || 'Client',
        subject: ticketForm.subject,
        details: ticketForm.details,
        priority: ticketForm.priority,
      })

      setTicketForm({
        subject: '',
        details: '',
        priority: 'normal',
      })
      toast.success('Support request submitted successfully.')
    } catch (error) {
      toast.error(error?.message || 'Unable to submit support request.')
    } finally {
      setSavingTicket(false)
    }
  }

  const statsCards = [
    {
      label: 'Total Projects',
      value: workspace?.stats?.totalProjects || 0,
      tone: 'from-violet-500/15 to-violet-400/5',
    },
    {
      label: 'Active Projects',
      value: workspace?.stats?.activeProjects || 0,
      tone: 'from-sky-500/15 to-sky-400/5',
    },
    {
      label: 'Completed Projects',
      value: workspace?.stats?.completedProjects || 0,
      tone: 'from-emerald-500/15 to-emerald-400/5',
    },
    {
      label: 'Average Progress',
      value: `${workspace?.stats?.averageProgress || 0}%`,
      tone: 'from-fuchsia-500/15 to-fuchsia-400/5',
    },
  ]

  return (
    <ModuleShell
      title="Client Portal"
      description="Track your projects in real time, monitor billing snapshots, and reach the team directly."
      actions={(
        <button
          type="button"
          onClick={loadWorkspace}
          className="inline-flex items-center justify-center rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
        >
          Refresh Data
        </button>
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statsCards.map((card) => (
          <article key={card.label} className={`rounded-2xl border border-slate-200 bg-gradient-to-br ${card.tone} p-4`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{card.value}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white/80 p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-600">Project Progress</h4>
            <span className="text-xs text-slate-500">{projectCountLabel}</span>
          </div>

          {loading ? (
            <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">Loading your projects...</p>
          ) : workspace.projects.length ? (
            <div className="space-y-3">
              {workspace.projects.map((project) => (
                <ProjectProgressCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">
              No projects are linked to your account yet. Ask your account manager to assign your user to each project (by client name, email, or client user id).
            </p>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white/80 p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-600">Billing Snapshot</h4>
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
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl border border-slate-200 bg-white/80 p-4">
          <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-600">Request Support</h4>
          <form onSubmit={onSubmitTicket} className="mt-3 space-y-3">
            <input
              type="text"
              value={ticketForm.subject}
              onChange={(event) => setTicketForm((current) => ({ ...current, subject: event.target.value }))}
              placeholder="Subject"
              maxLength={120}
              required
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
            />
            <textarea
              value={ticketForm.details}
              onChange={(event) => setTicketForm((current) => ({ ...current, details: event.target.value }))}
              placeholder="Tell us what you need..."
              rows={4}
              maxLength={1200}
              required
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <select
                value={ticketForm.priority}
                onChange={(event) => setTicketForm((current) => ({ ...current, priority: event.target.value }))}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <button
                type="submit"
                disabled={savingTicket}
                className="inline-flex items-center justify-center rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-70"
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
                    <span className="uppercase tracking-[0.08em]">{ticket.priority || 'normal'}</span>
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">No support requests submitted yet.</p>
            )}
          </div>
        </section>
      </div>
    </ModuleShell>
  )
}

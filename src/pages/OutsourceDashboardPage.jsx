import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ModuleShell from '../components/layout/ModuleShell'
import { useAuth } from '../hooks/useAuth'
import { subscribeOutsourcePortalsForUser } from '../services/outsourcePortalService'
import { formatDate } from '../utils/helpers'

function getAllTasks(phases) {
  return (Array.isArray(phases) ? phases : []).flatMap((phase) =>
    Array.isArray(phase?.tasks) ? phase.tasks.map((task) => ({ ...task, phaseName: phase.name || 'Phase' })) : [],
  )
}

function getCompletion(phases) {
  const tasks = getAllTasks(phases)
  if (!tasks.length) return 0
  const completed = tasks.filter((task) => Boolean(task.completed)).length
  return Math.round((completed / tasks.length) * 100)
}

function parseDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function timelineStatus(startDate, endDate) {
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  const now = new Date()

  if (!start || !end) {
    return { label: 'Timeline not set', tone: 'text-slate-500', chip: 'bg-slate-100 text-slate-700' }
  }

  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86400000)
  if (daysLeft < 0) {
    return {
      label: `Overdue by ${Math.abs(daysLeft)} day(s)`,
      tone: 'text-rose-700',
      chip: 'bg-rose-100 text-rose-700',
    }
  }

  if (now < start) {
    return {
      label: 'Upcoming',
      tone: 'text-amber-700',
      chip: 'bg-amber-100 text-amber-700',
    }
  }

  if (daysLeft <= 7) {
    return {
      label: `${daysLeft} day(s) left`,
      tone: 'text-amber-700',
      chip: 'bg-amber-100 text-amber-700',
    }
  }

  return {
    label: `${daysLeft} day(s) left`,
    tone: 'text-emerald-700',
    chip: 'bg-emerald-100 text-emerald-700',
  }
}

function StatCard({ title, value, note, accent }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <p className={`mt-3 text-3xl font-black ${accent}`}>{value}</p>
      <p className="mt-2 text-sm text-slate-500">{note}</p>
    </div>
  )
}

export default function OutsourceDashboardPage() {
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [portals, setPortals] = useState([])

  useEffect(() => {
    if (!user?.uid) return undefined

    setLoading(true)
    setError('')

    const unsubscribe = subscribeOutsourcePortalsForUser(
      user.uid,
      (items) => {
        setError('')
        setPortals(Array.isArray(items) ? items : [])
        setLoading(false)
      },
      (streamError) => {
        setError(streamError?.message || 'Unable to load your outsource dashboard.')
        setLoading(false)
      },
      { email: user?.email },
    )

    return () => unsubscribe()
  }, [user?.email, user?.uid])

  const dashboard = useMemo(() => {
    const nowMs = new Date().getTime()
    const taskRows = portals.flatMap((portal) => {
      const tasks = getAllTasks(portal.phases)
      return tasks.map((task) => ({
        ...task,
        portalId: portal.id,
        projectName: portal.projectName || 'Project',
        serviceName: portal.serviceName || 'Service',
        deadlineValue: task.deadline || portal.timelineEnd || '',
      }))
    })

    const openTasks = taskRows.filter((task) => !task.completed)
    const completedTasks = taskRows.length - openTasks.length
    const overdueTasks = openTasks.filter((task) => {
      const dueDate = parseDate(task.deadlineValue)
      if (!dueDate) return false
      return dueDate < new Date()
    })

    const upcomingTasks = [...openTasks]
      .sort((left, right) => {
        const leftDate = parseDate(left.deadlineValue)?.getTime() || Number.MAX_SAFE_INTEGER
        const rightDate = parseDate(right.deadlineValue)?.getTime() || Number.MAX_SAFE_INTEGER
        return leftDate - rightDate
      })
      .slice(0, 6)

    const timelineCards = portals.map((portal) => {
      const portalTasks = getAllTasks(portal.phases)
      const openPortalTasks = portalTasks.filter((task) => !task.completed).length
      return {
        ...portal,
        completion: getCompletion(portal.phases),
        openTasks: openPortalTasks,
        timeline: timelineStatus(portal.timelineStart, portal.timelineEnd),
      }
    })

    const dueSoonProjects = timelineCards.filter((portal) => {
      const end = parseDate(portal.timelineEnd)
      if (!end) return false
      const diffDays = Math.ceil((end.getTime() - nowMs) / 86400000)
      return diffDays >= 0 && diffDays <= 7
    }).length

    const averageCompletion = timelineCards.length
      ? Math.round(timelineCards.reduce((sum, portal) => sum + portal.completion, 0) / timelineCards.length)
      : 0

    return {
      assignedProjects: portals.length,
      totalTasks: taskRows.length,
      openTasks: openTasks.length,
      completedTasks,
      overdueTasks: overdueTasks.length,
      dueSoonProjects,
      averageCompletion,
      upcomingTasks,
      timelineCards,
    }
  }, [portals])

  return (
    <ModuleShell
      title="My Dashboard"
      description="Your personal workspace for assigned projects, upcoming deadlines, and phase task progress."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Assigned Projects"
          value={dashboard.assignedProjects}
          note="Active outsource assignments in your queue."
          accent="text-violet-700"
        />
        <StatCard
          title="Open Tasks"
          value={dashboard.openTasks}
          note={`${dashboard.completedTasks} completed so far across all phases.`}
          accent="text-sky-700"
        />
        <StatCard
          title="Avg. Progress"
          value={`${dashboard.averageCompletion}%`}
          note="Average completion across your assigned services."
          accent="text-emerald-700"
        />
        <StatCard
          title="Urgent Items"
          value={dashboard.overdueTasks + dashboard.dueSoonProjects}
          note={`${dashboard.overdueTasks} overdue tasks and ${dashboard.dueSoonProjects} timelines due soon.`}
          accent="text-amber-700"
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="space-y-6">
          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Overview</p>
                <h3 className="mt-1 text-xl font-black text-slate-900">
                  {profile?.name || user?.displayName || 'Outsource partner'}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Track timelines, finish tasks early, and keep every assigned service moving.
                </p>
              </div>
              <Link
                to="/outsource"
                className="inline-flex min-h-11 items-center rounded-xl bg-[#8246f6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6f39e7]"
              >
                Open Work Hub
              </Link>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-600">
                Loading your outsource dashboard...
              </div>
            ) : null}

            {!loading && !portals.length ? (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                No assignments are connected to your account yet.
              </div>
            ) : null}
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Project Timeline</p>
                <h3 className="mt-1 text-lg font-black text-slate-900">Assigned Services</h3>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {dashboard.timelineCards.length} active
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {dashboard.timelineCards.map((portal) => (
                <div key={portal.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{portal.projectName || 'Project'}</h4>
                      <p className="mt-1 text-sm text-slate-600">{portal.serviceName || 'Service'}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${portal.timeline.chip}`}>
                      {portal.timeline.label}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-slate-500">Start</p>
                      <p className="text-sm font-semibold text-slate-800">{formatDate(portal.timelineStart)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-slate-500">End</p>
                      <p className="text-sm font-semibold text-slate-800">{formatDate(portal.timelineEnd)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-slate-500">Open Tasks</p>
                      <p className="text-sm font-semibold text-slate-800">{portal.openTasks}</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
                      <span>Progress</span>
                      <span>{portal.completion}%</span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 transition-all"
                        style={{ width: `${portal.completion}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>

        <div className="space-y-6">
          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Focus Queue</p>
            <h3 className="mt-1 text-lg font-black text-slate-900">Upcoming Tasks</h3>
            <div className="mt-4 space-y-3">
              {dashboard.upcomingTasks.length ? (
                dashboard.upcomingTasks.map((task) => (
                  <div key={`${task.portalId}-${task.id}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{task.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{task.projectName} • {task.serviceName}</p>
                        <p className="mt-1 text-xs text-slate-500">Phase: {task.phaseName || 'Phase'}</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                        {formatDate(task.deadlineValue)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                  No open tasks right now.
                </div>
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Execution Notes</p>
            <h3 className="mt-1 text-lg font-black text-slate-900">What matters now</h3>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                Finish overdue tasks first to protect delivery dates.
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                Use the portal to update phase progress so admin can track your work live.
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                Review every timeline card above before the next weekly deadline window.
              </div>
            </div>
          </article>
        </div>
      </section>
    </ModuleShell>
  )
}

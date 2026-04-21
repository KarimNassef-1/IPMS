import ModuleShell from '../components/layout/ModuleShell'
import { useEffect, useMemo, useState } from 'react'
import {
  createDailyTask,
  createTask,
  deleteDailyTask,
  deleteTask,
  getDailyTasks,
  getTasks,
  restoreDailyTask,
  restoreTask,
  toggleDailyTask,
  updateDailyTask,
  updateTask,
} from '../services/taskService'
import { ASSIGNEES, TASK_PRIORITIES, TASK_STATUSES } from '../utils/constants'
import { createNotification } from '../services/notificationService'
import { useAuth } from '../hooks/useAuth'
import { getAllUsers } from '../services/teamUsersService'
import { useToast } from '../hooks/useToast'

const YOUSSEF_NAME = 'youssef'

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

export default function TasksPage() {
  const { user, role, isAdmin, hasAccess, profile } = useAuth()
  const toast = useToast()
  const [tasks, setTasks] = useState([])
  const [allDailyTasks, setAllDailyTasks] = useState([])
  const [users, setUsers] = useState([])
  const [statusMessage, setStatusMessage] = useState('')
  const [form, setForm] = useState({
    name: '',
    assignedTo: ASSIGNEES[0],
    deadline: '',
    priority: TASK_PRIORITIES[1],
    status: TASK_STATUSES[0],
  })
  const [dailyForm, setDailyForm] = useState({ name: '', assignedTo: ASSIGNEES[0] })

  async function loadTasks() {
    const data = await getTasks()
    setTasks(data)
  }

  async function loadDailyTasks() {
    const data = await getDailyTasks()
    setAllDailyTasks(data)
  }

  async function loadUsers() {
    const data = await getAllUsers()
    setUsers(data)
  }

  useEffect(() => {
    loadTasks()
    loadDailyTasks()
    loadUsers()
  }, [])

  useEffect(() => {
    if (!statusMessage) return
    const normalized = statusMessage.toLowerCase()
    if (
      normalized.includes('only') ||
      normalized.includes('could not') ||
      normalized.includes('failed')
    ) {
      toast.error(statusMessage)
      return
    }
    toast.info(statusMessage)
  }, [statusMessage, toast])

  const youssefUser = useMemo(() => {
    return users.find((item) => {
      const name = String(item?.name || '').trim().toLowerCase()
      const email = String(item?.email || '').trim().toLowerCase()
      return name.includes(YOUSSEF_NAME) || email.includes(YOUSSEF_NAME)
    }) || null
  }, [users])

  const completionRate = useMemo(() => {
    if (!tasks.length) return 0
    const done = tasks.filter((item) => item.status === 'Completed').length
    return Number(((done / tasks.length) * 100).toFixed(2))
  }, [tasks])

  const canViewDailyTasks = isAdmin || hasAccess('dailyTasks')

  const today = todayKey()

  const todaysDailyTasks = useMemo(
    () => allDailyTasks.filter((item) => item.date === today),
    [allDailyTasks, today],
  )

  const dailyHistoryCount = useMemo(
    () => allDailyTasks.filter((item) => item.date !== today && item.isCompleted).length,
    [allDailyTasks, today],
  )

  const dailyCompletionRate = useMemo(() => {
    if (!todaysDailyTasks.length) return 0
    const completed = todaysDailyTasks.filter((item) => item.isCompleted).length
    return Number(((completed / todaysDailyTasks.length) * 100).toFixed(2))
  }, [todaysDailyTasks])

  const openCount = tasks.length - tasks.filter((item) => item.status === 'Completed').length
  const highPriorityOpenCount = useMemo(
    () =>
      tasks.filter((task) => {
        const status = String(task?.status || '').toLowerCase()
        const priority = String(task?.priority || '').toLowerCase()
        return status !== 'completed' && (priority === 'high' || priority === 'urgent')
      }).length,
    [tasks],
  )

  function isAssignedToYoussef(taskLike) {
    return String(taskLike?.assignedTo || '').trim().toLowerCase() === YOUSSEF_NAME
  }

  function canManageTask(task) {
    if (isAdmin) return true
    if (role !== 'partner') return false
    return isAssignedToYoussef(task)
  }

  function canManageDailyTask(task) {
    if (isAdmin) return true
    if (role !== 'partner') return false
    return isAssignedToYoussef(task)
  }

  function handleChange(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setStatusMessage('')

    if (role === 'partner' && String(form.assignedTo || '').trim().toLowerCase() !== YOUSSEF_NAME) {
      setStatusMessage('Partner can create tasks assigned to Youssef only.')
      return
    }

    await createTask(form)
    await createNotification({
      userId: user?.uid,
      type: 'task',
      action: 'task_created',
      message: `Task created: ${form.name}`,
      actorId: user?.uid || '',
      actorName: profile?.name || 'User',
      actorEmail: user?.email || '',
      actorPhotoURL: profile?.photoURL || '',
      date: new Date().toISOString(),
      status: 'unread',
      adminFeed: true,
    })
    setForm({
      name: '',
      assignedTo: ASSIGNEES[0],
      deadline: '',
      priority: TASK_PRIORITIES[1],
      status: TASK_STATUSES[0],
    })
    await loadTasks()
  }

  async function handleStatusChange(task, status) {
    if (!canManageTask(task)) {
      setStatusMessage('You can only update your own tasks.')
      return
    }

    setStatusMessage('')
    await updateTask(task.id, { status })
    await createNotification({
      userId: user?.uid,
      type: 'task',
      action: 'task_status_changed',
      message: `Task status updated: ${task.name} -> ${status}`,
      actorId: user?.uid || '',
      actorName: profile?.name || 'User',
      actorEmail: user?.email || '',
      actorPhotoURL: profile?.photoURL || '',
      date: new Date().toISOString(),
      status: 'unread',
      adminFeed: true,
    })
    await loadTasks()
  }

  function canDeleteTask(task) {
    return canManageTask(task) && task?.locked !== true
  }

  async function removeTask(taskId) {
    const task = tasks.find((item) => item.id === taskId)
    if (!task) return

    if (!canDeleteTask(task)) {
      setStatusMessage('You can only delete your own unlocked tasks.')
      return
    }

    setStatusMessage('')
    await deleteTask(taskId)
    await createNotification({
      userId: user?.uid,
      type: 'task',
      action: 'task_deleted',
      message: `Task deleted: ${task.name}`,
      actorId: user?.uid || '',
      actorName: profile?.name || 'User',
      actorEmail: user?.email || '',
      actorPhotoURL: profile?.photoURL || '',
      date: new Date().toISOString(),
      status: 'unread',
      adminFeed: true,
    })
    await loadTasks()
    toast.notify(`Deleted task: ${task.name || 'Task'}`, {
      duration: 10000,
      actionLabel: 'Undo',
      onAction: async () => {
        await restoreTask(task)
        await loadTasks()
        toast.success(`Restored task: ${task.name || 'Task'}`)
      },
    })
  }

  async function toggleTaskLock(task) {
    if (!isAdmin) return
    setStatusMessage('')
    await updateTask(task.id, {
      locked: task?.locked !== true,
      lockUpdatedAt: new Date().toISOString(),
      lockUpdatedBy: user?.uid || '',
    })
    await loadTasks()
  }

  async function notifyYoussef(task) {
    if (!isAdmin) return
    if (!youssefUser?.id) {
      setStatusMessage('Could not find Youssef user profile to notify.')
      return
    }

    setStatusMessage('')
    await createNotification({
      userId: youssefUser.id,
      message: `Task update from system: ${task.name} (${task.status || 'Pending'})`,
      date: new Date().toISOString(),
      status: 'unread',
      source: 'system',
    })
    setStatusMessage('Notification sent to Youssef.')
  }

  async function submitDailyTask(event) {
    event.preventDefault()
    if (!canViewDailyTasks) return

    if (role === 'partner' && !isAssignedToYoussef(dailyForm)) {
      setStatusMessage('Partner can create daily tasks assigned to Youssef only.')
      return
    }

    await createDailyTask({
      ...dailyForm,
      date: today,
      isCompleted: false,
      locked: false,
    })
    await createNotification({
      userId: user?.uid,
      message: `Daily task created: ${dailyForm.name}`,
      date: new Date().toISOString(),
      status: 'unread',
    })
    setDailyForm({ name: '', assignedTo: ASSIGNEES[0] })
    await loadDailyTasks()
  }

  async function toggleDailyTaskStatus(task) {
    if (!canViewDailyTasks) return

    if (!canManageDailyTask(task)) {
      setStatusMessage('You can only update your own daily tasks.')
      return
    }

    setStatusMessage('')
    await toggleDailyTask(task.id, !task.isCompleted)
    await loadDailyTasks()
  }

  async function removeDailyTask(taskId) {
    if (!canViewDailyTasks) return
    const task = todaysDailyTasks.find((item) => item.id === taskId) || allDailyTasks.find((item) => item.id === taskId)
    if (!task) return

    if (!canDeleteDailyTask(task)) {
      setStatusMessage('You can only delete your own unlocked daily tasks.')
      return
    }

    setStatusMessage('')
    await deleteDailyTask(taskId)
    await createNotification({
      userId: user?.uid,
      type: 'daily_task',
      action: 'daily_task_deleted',
      message: `Daily task deleted: ${task.name}`,
      actorId: user?.uid || '',
      actorName: profile?.name || 'User',
      actorEmail: user?.email || '',
      actorPhotoURL: profile?.photoURL || '',
      date: new Date().toISOString(),
      status: 'unread',
      adminFeed: true,
    })
    await loadDailyTasks()
    toast.notify(`Deleted daily task: ${task.name || 'Task'}`, {
      duration: 10000,
      actionLabel: 'Undo',
      onAction: async () => {
        await restoreDailyTask(task)
        await loadDailyTasks()
        toast.success(`Restored daily task: ${task.name || 'Task'}`)
      },
    })
  }

  function canDeleteDailyTask(task) {
    return canManageDailyTask(task) && task?.locked !== true
  }

  async function toggleDailyTaskLock(task) {
    if (!isAdmin) return
    setStatusMessage('')
    await updateDailyTask(task.id, {
      locked: task?.locked !== true,
      lockUpdatedAt: new Date().toISOString(),
      lockUpdatedBy: user?.uid || '',
    })
    await loadDailyTasks()
  }

  async function notifyYoussefDailyTask(task) {
    if (!isAdmin) return
    if (!youssefUser?.id) {
      setStatusMessage('Could not find Youssef user profile to notify.')
      return
    }

    const stateLabel = task?.isCompleted ? 'Completed' : 'Pending'
    setStatusMessage('')
    await createNotification({
      userId: youssefUser.id,
      message: `Daily task update from system: ${task.name} (${stateLabel})`,
      date: new Date().toISOString(),
      status: 'unread',
      source: 'system',
    })
    setStatusMessage('Notification sent to Youssef.')
  }

  function dailyTasksFor(assignee) {
    return todaysDailyTasks.filter((item) => item.assignedTo === assignee)
  }

  return (
    <ModuleShell
      title="Tasks"
      description="Track regular tasks with assignment, priority, deadline, and progress status."
    >
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="ip-stat-card">
          <p className="text-xs uppercase tracking-wider text-slate-500">Total Tasks</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{tasks.length}</p>
        </div>
        <div className="ip-stat-card">
          <p className="text-xs uppercase tracking-wider text-slate-500">Open Tasks</p>
          <p className="mt-1 text-2xl font-black text-violet-700">{openCount}</p>
        </div>
        <div className="ip-stat-card">
          <p className="text-xs uppercase tracking-wider text-slate-500">High Priority Open</p>
          <p className="mt-1 text-2xl font-black text-amber-700">{highPriorityOpenCount}</p>
        </div>
        <div className="ip-stat-card">
          <p className="text-xs uppercase tracking-wider text-slate-500">Completion Rate</p>
          <p className="mt-1 text-2xl font-black text-emerald-700">{completionRate}%</p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-white/30 bg-white/80 p-4">
          <h4 className="font-bold text-slate-900">Create Task</h4>
          <input name="name" value={form.name} onChange={handleChange} placeholder="Task name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
          <div className="grid gap-3 sm:grid-cols-2">
            <select name="assignedTo" value={form.assignedTo} onChange={handleChange} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {(role === 'partner'
                ? ASSIGNEES.filter((assignee) => String(assignee).trim().toLowerCase() === YOUSSEF_NAME)
                : ASSIGNEES
              ).map((assignee) => <option key={assignee} value={assignee}>{assignee}</option>)}
            </select>
            <input name="deadline" type="date" value={form.deadline} onChange={handleChange} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <select name="priority" value={form.priority} onChange={handleChange} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
            <select name="status" value={form.status} onChange={handleChange} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {TASK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          <button className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#8246f6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6f39e7]">Add Task</button>
        </form>

        <section className="rounded-2xl border border-white/30 bg-white/80 p-4">
          <h4 className="font-bold text-slate-900">Execution Quality</h4>
          <p className="mt-1 text-xs text-slate-500">Current progress across all regular tasks.</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{completionRate}%</p>
          <div className="mt-3 h-2 rounded-full bg-slate-200">
            <div className="h-2 rounded-full bg-[#8246f6]" style={{ width: `${completionRate}%` }} />
          </div>
          <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
            <p className="rounded-lg bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
              Completed: {tasks.length - openCount}
            </p>
            <p className="rounded-lg bg-violet-50 px-2 py-1 font-semibold text-violet-700">
              Open: {openCount}
            </p>
          </div>
        </section>
      </div>

      <div className="mt-6 space-y-3">
        {tasks.map((task) => (
          <article key={task.id} className="rounded-xl border border-white/30 bg-white/75 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h5 className="font-semibold text-slate-900 break-words">{task.name}</h5>
                <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{task.assignedTo}</span>
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 font-semibold text-violet-700">{task.priority}</span>
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-700">Due {task.deadline}</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">{task.locked ? 'Locked' : 'Unlocked'}</span>
                </div>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                <select
                  value={task.status}
                  onChange={(event) => handleStatusChange(task, event.target.value)}
                  disabled={!canManageTask(task)}
                  className="min-h-9 rounded border border-slate-200 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {TASK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => toggleTaskLock(task)}
                    className="inline-flex min-h-9 min-w-9 items-center justify-center rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700"
                    title={task.locked ? 'Unlock task for deletion' : 'Lock task from deletion'}
                  >
                    {task.locked ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                        <rect x="5" y="11" width="14" height="10" rx="2" />
                        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                        <rect x="5" y="11" width="14" height="10" rx="2" />
                        <path d="M16 11V8a4 4 0 0 0-7.5-2" />
                      </svg>
                    )}
                  </button>
                ) : null}
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => notifyYoussef(task)}
                    className="inline-flex min-h-9 min-w-9 items-center justify-center rounded bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700"
                    title="Send system notification to Youssef"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
                      <path d="M10 17a2 2 0 0 0 4 0" />
                    </svg>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeTask(task.id)}
                  disabled={!canDeleteTask(task)}
                  className="inline-flex min-h-9 items-center rounded bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </article>
        ))}
        {tasks.length === 0 ? <p className="text-sm text-slate-600">No tasks yet.</p> : null}
      </div>

      {canViewDailyTasks ? (
        <>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            <form onSubmit={submitDailyTask} className="space-y-3 rounded-2xl border border-white/30 bg-white/80 p-4">
              <h4 className="font-bold text-slate-900">Add Daily Task</h4>
              <input
                value={dailyForm.name}
                onChange={(event) => setDailyForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Task name"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              />
              <select
                value={dailyForm.assignedTo}
                onChange={(event) => setDailyForm((current) => ({ ...current, assignedTo: event.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {(role === 'partner'
                  ? ASSIGNEES.filter((assignee) => String(assignee).trim().toLowerCase() === YOUSSEF_NAME)
                  : ASSIGNEES
                ).map((assignee) => <option key={assignee} value={assignee}>{assignee}</option>)}
              </select>
              <button className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#8246f6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6f39e7]">Create Daily Task</button>
              <p className="text-xs text-slate-500">Tasks are reset by using a new date key each day. Historical completion remains stored.</p>
            </form>

            <section className="rounded-2xl border border-white/30 bg-white/80 p-4">
              <h4 className="font-bold text-slate-900">Daily Completion</h4>
              <p className="mt-2 text-3xl font-black text-slate-900">{dailyCompletionRate}%</p>
              <div className="mt-3 h-2 rounded-full bg-slate-200">
                <div className="h-2 rounded-full bg-[#8246f6]" style={{ width: `${dailyCompletionRate}%` }} />
              </div>
              <p className="mt-3 text-xs text-slate-600">Historical completed tasks: {dailyHistoryCount}</p>
            </section>

            <section className="rounded-2xl border border-white/30 bg-white/80 p-4 text-xs text-slate-600">
              <h4 className="font-bold text-slate-900">Today: {today}</h4>
              <p className="mt-2">Cloud Functions can automate daily reminders and incomplete-task notifications using this date-based structure.</p>
            </section>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {ASSIGNEES.map((assignee) => (
              <section key={assignee} className="rounded-2xl border border-white/30 bg-white/80 p-4">
                <h4 className="font-bold text-slate-900">{assignee} Daily Tasks</h4>
                <div className="mt-3 space-y-2">
                  {dailyTasksFor(assignee).map((task) => (
                    <div key={task.id} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(task.isCompleted)}
                            onChange={() => toggleDailyTaskStatus(task)}
                            disabled={!canManageDailyTask(task)}
                          />
                          <span className={task.isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}>{task.name}</span>
                        </label>
                        {String(task?.assignedTo || '').trim().toLowerCase() === YOUSSEF_NAME ? (
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">{task.locked ? 'Locked' : 'Unlocked'}</p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {isAdmin && String(task?.assignedTo || '').trim().toLowerCase() === YOUSSEF_NAME ? (
                          <button
                            type="button"
                            onClick={() => toggleDailyTaskLock(task)}
                            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700"
                            title={task.locked ? 'Unlock daily task for deletion' : 'Lock daily task from deletion'}
                          >
                            {task.locked ? (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                                <rect x="5" y="11" width="14" height="10" rx="2" />
                                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                                <rect x="5" y="11" width="14" height="10" rx="2" />
                                <path d="M16 11V8a4 4 0 0 0-7.5-2" />
                              </svg>
                            )}
                          </button>
                        ) : null}

                        {isAdmin && String(task?.assignedTo || '').trim().toLowerCase() === YOUSSEF_NAME ? (
                          <button
                            type="button"
                            onClick={() => notifyYoussefDailyTask(task)}
                            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700"
                            title="Send system notification to Youssef"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                              <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
                              <path d="M10 17a2 2 0 0 0 4 0" />
                            </svg>
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => removeDailyTask(task.id)}
                          disabled={!canDeleteDailyTask(task)}
                          className="inline-flex min-h-9 items-center rounded bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                      </div>
                    </div>
                  ))}
                  {dailyTasksFor(assignee).length === 0 ? <p className="text-sm text-slate-600">No tasks for today.</p> : null}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : null}
    </ModuleShell>
  )
}

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
  subscribeDailyTasks,
  subscribeTasks,
  restoreTask,
  toggleDailyTask,
  updateDailyTask,
  updateTask,
} from '../services/taskService'
import { TASK_PRIORITIES, TASK_STATUSES } from '../utils/constants'
import { emitWorkflowEvent } from '../services/workflowEvents'
import { useAuth } from '../hooks/useAuth'
import { getAllUsers } from '../services/teamUsersService'
import { useToast } from '../hooks/useToast'

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

export default function TasksPage({ focusMode = 'all' }) {
  const { user, role, isAdmin, hasAccess, profile, loading: authLoading } = useAuth()
  const toast = useToast()
  const [tasks, setTasks] = useState([])
  const [allDailyTasks, setAllDailyTasks] = useState([])
  const [users, setUsers] = useState([])
  const [statusMessage, setStatusMessage] = useState('')
  const [form, setForm] = useState({
    name: '',
    assignedToUserId: '',
    assignedTo: '',
    deadline: '',
    priority: TASK_PRIORITIES[1],
    status: TASK_STATUSES[0],
  })
  const [dailyForm, setDailyForm] = useState({ name: '', assignedToUserId: '', assignedTo: '' })

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
    if (authLoading || !user?.uid) return
    const unsubscribeTasks = showRegularTasks
      ? subscribeTasks(setTasks, () => {
          setStatusMessage('Failed to keep tasks in sync in real time.')
        })
      : () => {}
    const unsubscribeDailyTasks = showDailyTasks
      ? subscribeDailyTasks(setAllDailyTasks, () => {
          setStatusMessage('Failed to keep daily tasks in sync in real time.')
        })
      : () => {}
    loadUsers()

    return () => {
      unsubscribeTasks()
      unsubscribeDailyTasks()
    }
  }, [authLoading, showDailyTasks, showRegularTasks, user?.uid])

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

  const assignableUsers = useMemo(() => {
    const activeUsers = (Array.isArray(users) ? users : []).filter((item) => {
      const status = String(item?.accountStatus || 'active').toLowerCase()
      return status === 'active'
    })

    if (isAdmin) return activeUsers
    return activeUsers.filter((item) => item.id === user?.uid)
  }, [isAdmin, user?.uid, users])

  const assigneeNameById = useMemo(() => {
    return assignableUsers.reduce((acc, item) => {
      acc[item.id] = item.name || item.displayName || item.email || 'User'
      return acc
    }, {})
  }, [assignableUsers])

  function getTaskAssigneeIds(task) {
    if (Array.isArray(task?.assignedUserIds) && task.assignedUserIds.length) {
      return task.assignedUserIds.map((id) => String(id || '').trim()).filter(Boolean)
    }
    const single = String(task?.assignedToUserId || '').trim()
    return single ? [single] : []
  }

  function getPrimaryAssigneeId(task) {
    return getTaskAssigneeIds(task)[0] || ''
  }

  function getPrimaryAssigneeLabel(task) {
    const assigneeId = getPrimaryAssigneeId(task)
    if (assigneeId && assigneeNameById[assigneeId]) return assigneeNameById[assigneeId]
    if (Array.isArray(task?.assignedUserNames) && task.assignedUserNames.length) {
      return task.assignedUserNames[0]
    }
    return task?.assignedTo || 'Unassigned'
  }

  const completionRate = useMemo(() => {
    if (!tasks.length) return 0
    const done = tasks.filter((item) => item.status === 'Completed').length
    return Number(((done / tasks.length) * 100).toFixed(2))
  }, [tasks])

  const canViewDailyTasks = isAdmin || hasAccess('dailyTasks')
  const showRegularTasks = focusMode !== 'daily'
  const showDailyTasks = canViewDailyTasks && focusMode !== 'regular'

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

  function canManageTask(task) {
    if (isAdmin) return true
    if (role !== 'partner') return false
    return getTaskAssigneeIds(task).includes(String(user?.uid || '').trim())
  }

  function canManageDailyTask(task) {
    if (isAdmin) return true
    if (role !== 'partner') return false
    return getTaskAssigneeIds(task).includes(String(user?.uid || '').trim())
  }

  function handleChange(event) {
    const { name, value } = event.target
    if (name === 'assignedToUserId') {
      const selectedName = assigneeNameById[value] || ''
      setForm((current) => ({ ...current, assignedToUserId: value, assignedTo: selectedName }))
      return
    }
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setStatusMessage('')

    const assigneeId = String(form.assignedToUserId || '').trim()
    if (!assigneeId) {
      setStatusMessage('Please choose a task assignee.')
      return
    }

    if (role === 'partner' && assigneeId !== String(user?.uid || '').trim()) {
      setStatusMessage('Partner can create tasks assigned to self only.')
      return
    }

    await createTask({
      ...form,
      assignedToUserId: assigneeId,
      assignedTo: assigneeNameById[assigneeId] || form.assignedTo || 'User',
      assignedUserIds: [assigneeId],
      assignedUserNames: [assigneeNameById[assigneeId] || form.assignedTo || 'User'],
    })
    await emitWorkflowEvent({
      eventType: 'outsource_task_status_changed',
      user,
      profile,
      portal: 'admin',
      message: `Task created: ${form.name}`,
      metadata: { taskAction: 'created' },
    })
    setForm({
      name: '',
      assignedToUserId: assigneeId,
      assignedTo: assigneeNameById[assigneeId] || '',
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
    await emitWorkflowEvent({
      eventType: 'outsource_task_status_changed',
      user,
      profile,
      portal: 'admin',
      message: `Task status updated: ${task.name} -> ${status}`,
      metadata: { taskAction: 'status_changed' },
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
    await emitWorkflowEvent({
      eventType: 'outsource_task_status_changed',
      user,
      profile,
      portal: 'admin',
      message: `Task deleted: ${task.name}`,
      metadata: { taskAction: 'deleted' },
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

  async function notifyTaskAssignee(task) {
    if (!isAdmin) return
    const assigneeId = getPrimaryAssigneeId(task)
    if (!assigneeId) {
      setStatusMessage('Could not find task assignee profile to notify.')
      return
    }

    setStatusMessage('')
    await emitWorkflowEvent({
      eventType: 'outsource_task_status_changed',
      targetUserId: assigneeId,
      portal: 'admin',
      message: `Task update from system: ${task.name} (${task.status || 'Pending'})`,
      metadata: { taskAction: 'assignee_notify', source: 'system' },
    })
    setStatusMessage('Notification sent to assignee.')
  }

  async function submitDailyTask(event) {
    event.preventDefault()
    if (!canViewDailyTasks) return

    const assigneeId = String(dailyForm.assignedToUserId || '').trim()
    if (!assigneeId) {
      setStatusMessage('Please choose a daily task assignee.')
      return
    }

    if (role === 'partner' && assigneeId !== String(user?.uid || '').trim()) {
      setStatusMessage('Partner can create daily tasks assigned to self only.')
      return
    }

    await createDailyTask({
      ...dailyForm,
      assignedToUserId: assigneeId,
      assignedTo: assigneeNameById[assigneeId] || dailyForm.assignedTo || 'User',
      assignedUserIds: [assigneeId],
      assignedUserNames: [assigneeNameById[assigneeId] || dailyForm.assignedTo || 'User'],
      date: today,
      isCompleted: false,
      locked: false,
    })
    await emitWorkflowEvent({
      eventType: 'outsource_task_status_changed',
      user,
      profile,
      portal: 'admin',
      message: `Daily task created: ${dailyForm.name}`,
      metadata: { taskAction: 'daily_created' },
    })
    setDailyForm({
      name: '',
      assignedToUserId: assigneeId,
      assignedTo: assigneeNameById[assigneeId] || '',
    })
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
    await emitWorkflowEvent({
      eventType: 'outsource_task_status_changed',
      user,
      profile,
      portal: 'admin',
      message: `Daily task deleted: ${task.name}`,
      metadata: { taskAction: 'daily_deleted' },
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

  async function notifyDailyTaskAssignee(task) {
    if (!isAdmin) return
    const assigneeId = getPrimaryAssigneeId(task)
    if (!assigneeId) {
      setStatusMessage('Could not find daily task assignee profile to notify.')
      return
    }

    const stateLabel = task?.isCompleted ? 'Completed' : 'Pending'
    setStatusMessage('')
    await emitWorkflowEvent({
      eventType: 'outsource_task_status_changed',
      targetUserId: assigneeId,
      portal: 'admin',
      message: `Daily task update from system: ${task.name} (${stateLabel})`,
      metadata: { taskAction: 'daily_assignee_notify', source: 'system' },
    })
    setStatusMessage('Notification sent to assignee.')
  }

  function dailyTasksFor(assigneeId) {
    return todaysDailyTasks.filter((item) => getPrimaryAssigneeId(item) === assigneeId)
  }

  const dailyTaskSections = useMemo(() => {
    return assignableUsers.map((item) => ({
      id: item.id,
      label: item.name || item.displayName || item.email || 'User',
    }))
  }, [assignableUsers])

  useEffect(() => {
    if (!assignableUsers.length) return
    const fallbackId = assignableUsers[0].id
    const fallbackName = assigneeNameById[fallbackId] || 'User'

    setForm((current) => {
      if (current.assignedToUserId) return current
      return { ...current, assignedToUserId: fallbackId, assignedTo: fallbackName }
    })
    setDailyForm((current) => {
      if (current.assignedToUserId) return current
      return { ...current, assignedToUserId: fallbackId, assignedTo: fallbackName }
    })
  }, [assignableUsers, assigneeNameById])

  return (
    <ModuleShell
      title={focusMode === 'daily' ? 'Daily Tasks' : 'Tasks'}
      description={
        focusMode === 'daily'
          ? 'Track daily execution checklists by assignee with history and completion status.'
          : 'Track regular tasks with assignment, priority, deadline, and progress status.'
      }
    >
      {showRegularTasks ? (
        <>
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
            <select name="assignedToUserId" value={form.assignedToUserId} onChange={handleChange} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {assignableUsers.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>{assigneeNameById[assignee.id] || 'User'}</option>
              ))}
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
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{getPrimaryAssigneeLabel(task)}</span>
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
                    onClick={() => notifyTaskAssignee(task)}
                    className="inline-flex min-h-9 min-w-9 items-center justify-center rounded bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700"
                    title="Send system notification to assignee"
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
        </>
      ) : null}

      {showDailyTasks ? (
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
                value={dailyForm.assignedToUserId}
                onChange={(event) => {
                  const id = event.target.value
                  setDailyForm((current) => ({
                    ...current,
                    assignedToUserId: id,
                    assignedTo: assigneeNameById[id] || '',
                  }))
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {assignableUsers.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>{assigneeNameById[assignee.id] || 'User'}</option>
                ))}
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
            {dailyTaskSections.map((assignee) => (
              <section key={assignee.id} className="rounded-2xl border border-white/30 bg-white/80 p-4">
                <h4 className="font-bold text-slate-900">{assignee.label} Daily Tasks</h4>
                <div className="mt-3 space-y-2">
                  {dailyTasksFor(assignee.id).map((task) => (
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
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">{task.locked ? 'Locked' : 'Unlocked'}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {isAdmin ? (
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

                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => notifyDailyTaskAssignee(task)}
                            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700"
                            title="Send system notification to assignee"
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
                  {dailyTasksFor(assignee.id).length === 0 ? <p className="text-sm text-slate-600">No tasks for today.</p> : null}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : null}
    </ModuleShell>
  )
}

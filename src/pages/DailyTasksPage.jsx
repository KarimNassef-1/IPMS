import ModuleShell from '../components/layout/ModuleShell'
import { useEffect, useMemo, useState } from 'react'
import {
  createDailyTask,
  deleteDailyTask,
  getDailyTasks,
  restoreDailyTask,
  toggleDailyTask,
} from '../services/taskService'
import { ASSIGNEES } from '../utils/constants'
import { createNotification } from '../services/notificationService'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

export default function DailyTasksPage() {
  const { user, profile } = useAuth()
  const toast = useToast()
  const [allDailyTasks, setAllDailyTasks] = useState([])
  const [form, setForm] = useState({ name: '', assignedTo: ASSIGNEES[0] })

  async function loadDailyTasks() {
    const data = await getDailyTasks()
    setAllDailyTasks(data)
  }

  useEffect(() => {
    loadDailyTasks()
  }, [])

  const today = todayKey()

  const todaysTasks = useMemo(
    () => allDailyTasks.filter((item) => item.date === today),
    [allDailyTasks, today],
  )

  const historyCount = useMemo(
    () => allDailyTasks.filter((item) => item.date !== today && item.isCompleted).length,
    [allDailyTasks, today],
  )

  const completionRate = useMemo(() => {
    if (!todaysTasks.length) return 0
    const completed = todaysTasks.filter((item) => item.isCompleted).length
    return Number(((completed / todaysTasks.length) * 100).toFixed(2))
  }, [todaysTasks])

  async function submitTask(event) {
    event.preventDefault()
    await createDailyTask({
      ...form,
      date: today,
      isCompleted: false,
    })
    await createNotification({
      userId: user?.uid,
      type: 'daily_task',
      action: 'daily_task_created',
      message: `Daily task created: ${form.name}`,
      actorId: user?.uid || '',
      actorName: profile?.name || 'User',
      actorEmail: user?.email || '',
      actorPhotoURL: profile?.photoURL || '',
      date: new Date().toISOString(),
      status: 'unread',
      adminFeed: true,
    })
    setForm({ name: '', assignedTo: ASSIGNEES[0] })
    await loadDailyTasks()
  }

  async function toggleTask(task) {
    await toggleDailyTask(task.id, !task.isCompleted)
    await createNotification({
      userId: user?.uid,
      type: 'daily_task',
      action: 'daily_task_status_changed',
      message: `Daily task ${!task.isCompleted ? 'completed' : 'reopened'}: ${task.name}`,
      actorId: user?.uid || '',
      actorName: profile?.name || 'User',
      actorEmail: user?.email || '',
      actorPhotoURL: profile?.photoURL || '',
      date: new Date().toISOString(),
      status: 'unread',
      adminFeed: true,
    })
    await loadDailyTasks()
  }

  async function removeTask(taskId) {
    const task = allDailyTasks.find((item) => item.id === taskId)
    if (!task) return

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

  function tasksFor(assignee) {
    return todaysTasks.filter((item) => item.assignedTo === assignee)
  }

  return (
    <ModuleShell
      title="Daily Tasks"
      description="Daily checklist tracking for Karim and Youssef with automated reset-ready structure."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={submitTask} className="space-y-3 rounded-2xl border border-white/30 bg-white/80 p-4">
          <h4 className="font-bold text-slate-900">Add Daily Task</h4>
          <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Task name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
          <select value={form.assignedTo} onChange={(event) => setForm((current) => ({ ...current, assignedTo: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            {ASSIGNEES.map((assignee) => <option key={assignee} value={assignee}>{assignee}</option>)}
          </select>
          <button className="rounded-lg bg-[#8246f6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6f39e7]">Create Daily Task</button>
          <p className="text-xs text-slate-500">Tasks are reset by using a new date key each day. Historical completion remains stored.</p>
        </form>

        <section className="rounded-2xl border border-white/30 bg-white/80 p-4">
          <h4 className="font-bold text-slate-900">Daily Completion</h4>
          <p className="mt-2 text-3xl font-black text-slate-900">{completionRate}%</p>
          <div className="mt-3 h-2 rounded-full bg-slate-200">
            <div className="h-2 rounded-full bg-[#8246f6]" style={{ width: `${completionRate}%` }} />
          </div>
          <p className="mt-3 text-xs text-slate-600">Historical completed tasks: {historyCount}</p>
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
              {tasksFor(assignee).map((task) => (
                <div key={task.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={Boolean(task.isCompleted)} onChange={() => toggleTask(task)} />
                    <span className={task.isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}>{task.name}</span>
                  </label>
                  <button type="button" onClick={() => removeTask(task.id)} className="rounded bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">Delete</button>
                </div>
              ))}
              {tasksFor(assignee).length === 0 ? <p className="text-sm text-slate-600">No tasks for today.</p> : null}
            </div>
          </section>
        ))}
      </div>
    </ModuleShell>
  )
}

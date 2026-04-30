import { useEffect, useMemo, useState } from 'react'
import ModuleShell from '../components/layout/ModuleShell'
import WorkHubStatsStrip from '../components/outsourcePortal/WorkHubStatsStrip'
import WorkHubViewSidebar from '../components/outsourcePortal/WorkHubViewSidebar'
import WorkHubPortalCard from '../components/outsourcePortal/WorkHubPortalCard'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import {
  deleteOutsourcePortal,
  migrateOutsourcePortalsToAssignedUserIds,
  subscribeAllOutsourcePortals,
  subscribeOutsourcePortalsForUser,
  updateOutsourcePortal,
} from '../services/outsourcePortalService'
import {
  buildPortalPayload,
  buildWorkspaceSummary,
  getPhaseEndDate,
  getPhaseStartDate,
  getPortalViews,
  getTaskStatus,
  isTaskDone,
  makeId,
  nextTaskStatus,
  normalizePhaseOrder,
  parseDate,
} from '../utils/outsourcePortalUtils'

export default function OutsourcePortalPage() {
  const { user, isAdmin, isPartner, profile } = useAuth()
  const isSupervisor = isAdmin || isPartner
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [portals, setPortals] = useState([])

  const [phaseDrafts, setPhaseDrafts] = useState({})
  const [taskDrafts, setTaskDrafts] = useState({})
  const [phaseEditDrafts, setPhaseEditDrafts] = useState({})
  const [taskEditDrafts, setTaskEditDrafts] = useState({})
  const [commentDrafts, setCommentDrafts] = useState({})
  const [expandedComments, setExpandedComments] = useState(new Set())
  const [draggedPhaseKey, setDraggedPhaseKey] = useState('')
  const [draggedTaskKey, setDraggedTaskKey] = useState('')
  const [bulkSelectedTasks, setBulkSelectedTasks] = useState(new Set())
  const [activeView, setActiveView] = useState(isSupervisor ? 'assignments' : 'summary')

  useEffect(() => {
    setActiveView(isSupervisor ? 'assignments' : 'summary')
  }, [isAdmin, isPartner])

  useEffect(() => {
    if (!user?.uid) return undefined

    setLoading(true)

    const unsubscribe = isSupervisor
      ? subscribeAllOutsourcePortals(
          (items) => {
            setPortals(items)
            setLoading(false)
          },
          (error) => {
            toast.error(error?.message || 'Failed to load outsource portal entries.')
            setLoading(false)
          },
        )
      : subscribeOutsourcePortalsForUser(
          user.uid,
          (items) => {
            setPortals(items)
            setLoading(false)
          },
          (error) => {
            toast.error(error?.message || 'Failed to load your assigned outsource work.')
            setLoading(false)
          },
          { email: user?.email },
        )

    return () => unsubscribe()
  }, [isSupervisor, user?.uid, toast])

  useEffect(() => {
    if (!isAdmin) return

    let active = true
    migrateOutsourcePortalsToAssignedUserIds().catch((error) => {
      if (!active) return
      toast.error(error?.message || 'Failed to migrate outsource assignments to multi-assignee format.')
    })

    return () => {
      active = false
    }
  }, [isAdmin, toast])

  const sortedPortals = useMemo(() => {
    return [...portals].sort(
      (left, right) =>
        new Date(right.updatedAt || right.createdAt || 0).getTime() -
        new Date(left.updatedAt || left.createdAt || 0).getTime(),
    )
  }, [portals])

  const portalViews = useMemo(() => getPortalViews(isSupervisor), [isSupervisor])

  const workspaceSummary = useMemo(() => buildWorkspaceSummary(sortedPortals), [sortedPortals])

  async function savePortalPhases(portal, nextPhases) {
    try {
      await updateOutsourcePortal(
        portal.id,
        buildPortalPayload(portal, {
          phases: normalizePhaseOrder(nextPhases),
        }),
      )
    } catch (error) {
      toast.error(error?.message || 'Failed to update portal progress.')
    }
  }

  async function onAddPhase(portal) {
    const draft = phaseDrafts[portal.id] || {}
    const name = String(draft.name || '').trim()
    const startDate = String(draft.startDate || '').trim()
    const endDate = String(draft.endDate || '').trim()

    if (!name) {
      toast.error('Phase name is required.')
      return
    }

    if (!startDate || !endDate) {
      toast.error('Phase start and end dates are required.')
      return
    }

    if (parseDate(startDate) && parseDate(endDate) && parseDate(endDate) < parseDate(startDate)) {
      toast.error('Phase end date must be on or after the start date.')
      return
    }

    const nextPhases = [
      ...(Array.isArray(portal.phases) ? portal.phases : []),
      {
        id: makeId('phase'),
        name,
        startDate,
        endDate,
        deadline: endDate,
        createdAt: new Date().toISOString(),
        tasks: [],
      },
    ]

    await savePortalPhases(portal, nextPhases)
    setPhaseDrafts((current) => ({ ...current, [portal.id]: { name: '', startDate: '', endDate: '' } }))
    toast.success('Phase added.')
  }

  async function onAddTask(portal, phaseId) {
    const key = `${portal.id}:${phaseId}`
    const draft = taskDrafts[key] || {}
    const name = String(draft.name || '').trim()
    const deadline = String(draft.deadline || '').trim()
    const priority = String(draft.priority || 'medium').toLowerCase()

    if (!name) {
      toast.error('Task name is required.')
      return
    }

    const nextPhases = (Array.isArray(portal.phases) ? portal.phases : []).map((phase) => {
      if (phase.id !== phaseId) return phase

      return {
        ...phase,
        tasks: [
          ...(Array.isArray(phase.tasks) ? phase.tasks : []),
          {
            id: makeId('task'),
            name,
            deadline,
            priority,
            status: 'not_started',
            completed: false,
            createdAt: new Date().toISOString(),
          },
        ],
      }
    })

    await savePortalPhases(portal, nextPhases)
    setTaskDrafts((current) => ({ ...current, [key]: { name: '', deadline: '', priority: 'medium' } }))
    toast.success('Task added.')
  }

  function startEditPhase(portalId, phase) {
    setPhaseEditDrafts((current) => ({
      ...current,
      [`${portalId}:${phase.id}`]: {
        name: String(phase?.name || ''),
        startDate: getPhaseStartDate(phase),
        endDate: getPhaseEndDate(phase),
      },
    }))
  }

  function cancelEditPhase(portalId, phaseId) {
    const key = `${portalId}:${phaseId}`
    setPhaseEditDrafts((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  async function onSavePhaseEdit(portal, phaseId) {
    const key = `${portal.id}:${phaseId}`
    const draft = phaseEditDrafts[key] || {}
    const name = String(draft.name || '').trim()
    const startDate = String(draft.startDate || '').trim()
    const endDate = String(draft.endDate || '').trim()

    if (!name) {
      toast.error('Phase name is required.')
      return
    }

    if (!startDate || !endDate) {
      toast.error('Phase start and end dates are required.')
      return
    }

    if (parseDate(startDate) && parseDate(endDate) && parseDate(endDate) < parseDate(startDate)) {
      toast.error('Phase end date must be on or after the start date.')
      return
    }

    const nextPhases = (Array.isArray(portal.phases) ? portal.phases : []).map((phase) => {
      if (phase.id !== phaseId) return phase
      return {
        ...phase,
        name,
        startDate,
        endDate,
        deadline: endDate,
      }
    })

    await savePortalPhases(portal, nextPhases)
    cancelEditPhase(portal.id, phaseId)
    toast.success('Phase updated.')
  }

  async function onDeletePhase(portal, phaseId) {
    const phase = (Array.isArray(portal.phases) ? portal.phases : []).find((item) => item.id === phaseId)
    if (!phase) return
    if (!window.confirm(`Delete phase "${phase.name || 'Phase'}" and all its tasks?`)) return

    const nextPhases = (Array.isArray(portal.phases) ? portal.phases : []).filter((phaseItem) => phaseItem.id !== phaseId)
    await savePortalPhases(portal, nextPhases)
    cancelEditPhase(portal.id, phaseId)
    toast.success('Phase deleted.')
  }

  async function onReorderPhases(portal, sourcePhaseId, targetPhaseId) {
    if (!sourcePhaseId || !targetPhaseId || sourcePhaseId === targetPhaseId) return

    const currentPhases = [...(Array.isArray(portal.phases) ? portal.phases : [])]
    const sourceIndex = currentPhases.findIndex((phase) => phase.id === sourcePhaseId)
    const targetIndex = currentPhases.findIndex((phase) => phase.id === targetPhaseId)

    if (sourceIndex < 0 || targetIndex < 0) return

    const nextPhases = [...currentPhases]
    const [movedPhase] = nextPhases.splice(sourceIndex, 1)
    nextPhases.splice(targetIndex, 0, movedPhase)

    await savePortalPhases(portal, nextPhases)
    toast.success('Phase order updated.')
  }

  async function onReorderTasks(portal, phaseId, sourceTaskId, targetTaskId) {
    if (!sourceTaskId || !targetTaskId || sourceTaskId === targetTaskId) return

    const nextPhases = (Array.isArray(portal.phases) ? portal.phases : []).map((phase) => {
      if (phase.id !== phaseId) return phase
      const tasks = [...(Array.isArray(phase.tasks) ? phase.tasks : [])]
      const sourceIndex = tasks.findIndex((t) => t.id === sourceTaskId)
      const targetIndex = tasks.findIndex((t) => t.id === targetTaskId)
      if (sourceIndex < 0 || targetIndex < 0) return phase
      const reordered = [...tasks]
      const [moved] = reordered.splice(sourceIndex, 1)
      reordered.splice(targetIndex, 0, moved)
      return { ...phase, tasks: reordered }
    })

    await savePortalPhases(portal, nextPhases)
    toast.success('Task order updated.')
  }

  function startEditTask(portalId, phaseId, task) {
    setTaskEditDrafts((current) => ({
      ...current,
      [`${portalId}:${phaseId}:${task.id}`]: {
        name: String(task?.name || ''),
        deadline: String(task?.deadline || ''),
        priority: String(task?.priority || 'medium'),
      },
    }))
  }

  function cancelEditTask(portalId, phaseId, taskId) {
    const key = `${portalId}:${phaseId}:${taskId}`
    setTaskEditDrafts((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  async function onSaveTaskEdit(portal, phaseId, taskId) {
    const key = `${portal.id}:${phaseId}:${taskId}`
    const draft = taskEditDrafts[key] || {}
    const name = String(draft.name || '').trim()
    const deadline = String(draft.deadline || '').trim()
    const priority = String(draft.priority || 'medium').toLowerCase()

    if (!name) {
      toast.error('Task name is required.')
      return
    }

    const nextPhases = (Array.isArray(portal.phases) ? portal.phases : []).map((phase) => {
      if (phase.id !== phaseId) return phase

      return {
        ...phase,
        tasks: (Array.isArray(phase.tasks) ? phase.tasks : []).map((task) => {
          if (task.id !== taskId) return task
          return {
            ...task,
            name,
            deadline,
            priority,
          }
        }),
      }
    })

    await savePortalPhases(portal, nextPhases)
    cancelEditTask(portal.id, phaseId, taskId)
    toast.success('Task updated.')
  }

  async function onDeleteTask(portal, phaseId, taskId) {
    const targetPhase = (Array.isArray(portal.phases) ? portal.phases : []).find((phase) => phase.id === phaseId)
    const task = (Array.isArray(targetPhase?.tasks) ? targetPhase.tasks : []).find((item) => item.id === taskId)
    if (!task) return
    if (!window.confirm(`Delete task "${task.name || 'Task'}"?`)) return

    const nextPhases = (Array.isArray(portal.phases) ? portal.phases : []).map((phase) => {
      if (phase.id !== phaseId) return phase
      return {
        ...phase,
        tasks: (Array.isArray(phase.tasks) ? phase.tasks : []).filter((taskItem) => taskItem.id !== taskId),
      }
    })

    await savePortalPhases(portal, nextPhases)
    cancelEditTask(portal.id, phaseId, taskId)
    toast.success('Task deleted.')
  }

  async function onSetTaskStatus(portal, phaseId, taskId) {
    const nextPhases = (Array.isArray(portal.phases) ? portal.phases : []).map((phase) => {
      if (phase.id !== phaseId) return phase

      const nextTasks = (Array.isArray(phase.tasks) ? phase.tasks : []).map((task) => {
        if (task.id !== taskId) return task
        const current = getTaskStatus(task)
        const next = nextTaskStatus(current)
        return { ...task, status: next, completed: next === 'completed' }
      })

      // Auto-complete phase if all tasks are done
      const allComplete = nextTasks.every((t) => isTaskDone(t))
      return {
        ...phase,
        tasks: nextTasks,
        completed: allComplete ? true : phase.completed === true ? false : phase.completed,
      }
    })

    await savePortalPhases(portal, nextPhases)
  }

  async function onTogglePhaseCompletion(portal, phaseId) {
    const nextPhases = (Array.isArray(portal.phases) ? portal.phases : []).map((phase) => {
      if (phase.id !== phaseId) return phase
      return {
        ...phase,
        completed: !Boolean(phase.completed),
      }
    })
    await savePortalPhases(portal, nextPhases)
  }

  function toggleBulkTaskSelection(portalId, phaseId, taskId) {
    const key = `${portalId}:${phaseId}:${taskId}`
    setBulkSelectedTasks((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  async function onBulkCompleteSelected(portal, phaseId) {
    const nextPhases = (Array.isArray(portal.phases) ? portal.phases : []).map((phase) => {
      if (phase.id !== phaseId) return phase
      return {
        ...phase,
        tasks: (Array.isArray(phase.tasks) ? phase.tasks : []).map((task) => {
          const key = `${portal.id}:${phase.id}:${task.id}`
          return bulkSelectedTasks.has(key) ? { ...task, status: 'completed', completed: true } : task
        }),
      }
    })
    await savePortalPhases(portal, nextPhases)
    setBulkSelectedTasks(new Set())
    toast.success('Tasks marked complete.')
  }

  async function onBulkIncompleteSelected(portal, phaseId) {
    const nextPhases = (Array.isArray(portal.phases) ? portal.phases : []).map((phase) => {
      if (phase.id !== phaseId) return phase
      return {
        ...phase,
        tasks: (Array.isArray(phase.tasks) ? phase.tasks : []).map((task) => {
          const key = `${portal.id}:${phase.id}:${task.id}`
          return bulkSelectedTasks.has(key) ? { ...task, status: 'not_started', completed: false } : task
        }),
      }
    })
    await savePortalPhases(portal, nextPhases)
    setBulkSelectedTasks(new Set())
    toast.success('Tasks marked incomplete.')
  }

  async function onBulkDeleteSelected(portal, phaseId) {
    if (!window.confirm(`Delete ${bulkSelectedTasks.size} task(s)?`)) return
    const nextPhases = (Array.isArray(portal.phases) ? portal.phases : []).map((phase) => {
      if (phase.id !== phaseId) return phase
      return {
        ...phase,
        tasks: (Array.isArray(phase.tasks) ? phase.tasks : []).filter((task) => {
          const key = `${portal.id}:${phase.id}:${task.id}`
          return !bulkSelectedTasks.has(key)
        }),
      }
    })
    await savePortalPhases(portal, nextPhases)
    setBulkSelectedTasks(new Set())
    toast.success('Tasks deleted.')
  }

  async function onBulkChangePhaseIdForSelected(portal, phaseId) {
    if (!window.confirm(`Move ${bulkSelectedTasks.size} task(s) to a different phase?`)) return
    // This will be enhanced with a phase selector modal in the UI
    // For now, we'll just remove from current phase
    const nextPhases = (Array.isArray(portal.phases) ? portal.phases : []).map((phase) => {
      if (phase.id !== phaseId) return phase
      return {
        ...phase,
        tasks: (Array.isArray(phase.tasks) ? phase.tasks : []).filter((task) => {
          const key = `${portal.id}:${phase.id}:${task.id}`
          return !bulkSelectedTasks.has(key)
        }),
      }
    })
    await savePortalPhases(portal, nextPhases)
    setBulkSelectedTasks(new Set())
    toast.success('Tasks moved.')
  }

  async function onAddTaskComment(portal, phaseId, taskId) {
    const draftKey = `${portal.id}:${phaseId}:${taskId}`
    const commentText = String(commentDrafts[draftKey] || '').trim()
    if (!commentText) {
      toast.error('Comment cannot be empty.')
      return
    }

    const nextPhases = (Array.isArray(portal.phases) ? portal.phases : []).map((phase) => {
      if (phase.id !== phaseId) return phase
      return {
        ...phase,
        tasks: (Array.isArray(phase.tasks) ? phase.tasks : []).map((task) => {
          if (task.id !== taskId) return task
          const comment = {
            id: makeId('comment'),
            text: commentText,
            author: profile?.name || user?.displayName || user?.email || 'Anonymous',
            authorId: user?.uid || '',
            createdAt: new Date().toISOString(),
          }
          return {
            ...task,
            comments: [...(Array.isArray(task.comments) ? task.comments : []), comment],
          }
        }),
      }
    })

    await savePortalPhases(portal, nextPhases)
    setCommentDrafts((current) => {
      const next = { ...current }
      delete next[draftKey]
      return next
    })
    toast.success('Comment added.')
  }

  async function onDeleteTaskComment(portal, phaseId, taskId, commentId) {
    if (!window.confirm('Delete this comment?')) return

    const nextPhases = (Array.isArray(portal.phases) ? portal.phases : []).map((phase) => {
      if (phase.id !== phaseId) return phase
      return {
        ...phase,
        tasks: (Array.isArray(phase.tasks) ? phase.tasks : []).map((task) => {
          if (task.id !== taskId) return task
          return {
            ...task,
            comments: (Array.isArray(task.comments) ? task.comments : []).filter(
              (c) => c.id !== commentId
            ),
          }
        }),
      }
    })

    await savePortalPhases(portal, nextPhases)
    toast.success('Comment deleted.')
  }

  async function onDeleteAssignment(portal) {
    if (!isAdmin) return
    if (!window.confirm('Delete this outsource assignment?')) return

    try {
      await deleteOutsourcePortal(portal.id)
      toast.success('Assignment deleted.')
    } catch (error) {
      toast.error(error?.message || 'Could not delete assignment.')
    }
  }

  return (
    <ModuleShell
      title="Work Hub"
      description="Monitor timelines, follow delivery progress, and manage assigned work across all active services."
    >
      <WorkHubStatsStrip isSupervisor={isSupervisor} workspaceSummary={workspaceSummary} />

      <div className="mt-6 flex gap-7">
        <WorkHubViewSidebar
          isSupervisor={isSupervisor}
          portalViews={portalViews}
          activeView={activeView}
          onChangeView={setActiveView}
        />

        {/* Portal list */}
        <section className="min-w-0 flex-1 space-y-4">
          {loading ? (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" />
              <p className="text-sm text-slate-500">
                {isSupervisor ? 'Loading assignments…' : 'Loading your work…'}
              </p>
            </div>
          ) : null}

          {!loading && !sortedPortals.length ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-500">No assignments yet</p>
              <p className="mt-1 text-xs text-slate-400">
                {isSupervisor
                  ? 'Create assignments from the Projects page to see them here.'
                  : 'No active assignments are connected to your workspace yet.'}
              </p>
            </div>
          ) : null}

        {sortedPortals.map((portal) => (
          <WorkHubPortalCard
            key={portal.id}
            portal={portal}
            activeView={activeView}
            isSupervisor={isSupervisor}
            isAdmin={isAdmin}
            user={user}
            profile={profile}
            phaseDrafts={phaseDrafts}
            setPhaseDrafts={setPhaseDrafts}
            taskDrafts={taskDrafts}
            setTaskDrafts={setTaskDrafts}
            phaseEditDrafts={phaseEditDrafts}
            setPhaseEditDrafts={setPhaseEditDrafts}
            taskEditDrafts={taskEditDrafts}
            setTaskEditDrafts={setTaskEditDrafts}
            commentDrafts={commentDrafts}
            setCommentDrafts={setCommentDrafts}
            expandedComments={expandedComments}
            setExpandedComments={setExpandedComments}
            draggedPhaseKey={draggedPhaseKey}
            setDraggedPhaseKey={setDraggedPhaseKey}
            draggedTaskKey={draggedTaskKey}
            setDraggedTaskKey={setDraggedTaskKey}
            bulkSelectedTasks={bulkSelectedTasks}
            setBulkSelectedTasks={setBulkSelectedTasks}
            onReorderPhases={onReorderPhases}
            onSavePhaseEdit={onSavePhaseEdit}
            onDeletePhase={onDeletePhase}
            startEditPhase={startEditPhase}
            cancelEditPhase={cancelEditPhase}
            onBulkCompleteSelected={onBulkCompleteSelected}
            onBulkIncompleteSelected={onBulkIncompleteSelected}
            onBulkDeleteSelected={onBulkDeleteSelected}
            toggleBulkTaskSelection={toggleBulkTaskSelection}
            onSetTaskStatus={onSetTaskStatus}
            startEditTask={startEditTask}
            onDeleteTask={onDeleteTask}
            onSaveTaskEdit={onSaveTaskEdit}
            cancelEditTask={cancelEditTask}
            onDeleteTaskComment={onDeleteTaskComment}
            onAddTaskComment={onAddTaskComment}
            onAddTask={onAddTask}
            onAddPhase={onAddPhase}
            onTogglePhaseCompletion={onTogglePhaseCompletion}
            onDeleteAssignment={onDeleteAssignment}
          />
        ))}
        </section>
      </div>
    </ModuleShell>
  )
}

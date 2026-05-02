import {
  formatDate,
  getAllTasks,
  getAssignedUserIds,
  getAssignedUserNames,
  getCompletion,
  getPhaseCompletion,
  getPhaseEndDate,
  getPhaseStartDate,
  getPriorityBadgeClass,
  getPriorityLabel,
  getStatusConfig,
  getTaskDeadlineStatus,
  getTaskStatus,
  isTaskDone,
  parseDate,
  timelineStatus,
} from '../../utils/outsourcePortalUtils'

export default function WorkHubPortalCard({
  portal,
  activeView,
  isSupervisor,
  isAdmin,
  user,
  profile,
  phaseDrafts,
  setPhaseDrafts,
  taskDrafts,
  setTaskDrafts,
  phaseEditDrafts,
  setPhaseEditDrafts,
  taskEditDrafts,
  setTaskEditDrafts,
  commentDrafts,
  setCommentDrafts,
  expandedComments,
  setExpandedComments,
  draggedPhaseKey,
  setDraggedPhaseKey,
  draggedTaskKey,
  setDraggedTaskKey,
  bulkSelectedTasks,
  setBulkSelectedTasks,
  onReorderPhases,
  onReorderTasks,
  onSavePhaseEdit,
  onDeletePhase,
  startEditPhase,
  cancelEditPhase,
  onBulkCompleteSelected,
  onBulkIncompleteSelected,
  onBulkDeleteSelected,
  toggleBulkTaskSelection,
  onSetTaskStatus,
  onToggleTaskBlocked,
  startEditTask,
  onDeleteTask,
  onSaveTaskEdit,
  cancelEditTask,
  onDeleteTaskComment,
  onAddTaskComment,
  onAddTask,
  onAddPhase,
  onTogglePhaseCompletion,
  onDeleteAssignment,
}) {
  const completion = getCompletion(portal.phases)
  const timeline = timelineStatus(portal.timelineStart, portal.timelineEnd)
  const assignedUserIds = getAssignedUserIds(portal)
  const assignedUserNames = getAssignedUserNames(portal)
  const canEdit = isAdmin || assignedUserIds.includes(String(user?.uid || '').trim())
  const assigneeLabel = assignedUserNames.length
    ? assignedUserNames.join(', ')
    : 'Unassigned'
  const phases = Array.isArray(portal.phases) ? portal.phases : []
  const totalTasks = getAllTasks(phases).length
  const doneTasks = getAllTasks(phases).filter((t) => isTaskDone(t)).length

  return (
    <article
      key={portal.id}
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <header className="border-b border-slate-100 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
              {(portal.projectName || 'P').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{portal.projectName || 'Unnamed Project'}</h3>
                <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-600">
                  {portal.serviceName || 'Service'}
                </span>
                {portal.serviceCategory ? (
                  <span className="rounded-md bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">
                    {portal.serviceCategory}
                  </span>
                ) : null}
                {completion === 100 ? (
                  <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                    Completed
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                {isSupervisor ? (
                  <span className="font-medium text-slate-600">{assigneeLabel}</span>
                ) : null}
                <span>{phases.length} phase{phases.length !== 1 ? 's' : ''}</span>
                <span>{totalTasks} task{totalTasks !== 1 ? 's' : ''}</span>
                <span className="font-medium text-slate-600">{doneTasks}/{totalTasks} done</span>
                {portal.timelineEnd ? (
                  <span className={timeline.tone}>{timeline.label}</span>
                ) : null}
              </div>
            </div>
          </div>

          {(isSupervisor && (activeView === 'assignments' || activeView === 'delivery')) ||
          (!isSupervisor && (activeView === 'summary' || activeView === 'tasks')) ? (
            <div className="flex flex-shrink-0 items-center gap-3">
              <div className="w-28">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      completion === 100 ? 'bg-emerald-500' : 'bg-violet-500'
                    }`}
                    style={{ width: `${completion}%` }}
                  />
                </div>
              </div>
              <span className="w-9 text-right text-xs font-semibold tabular-nums text-slate-600">{completion}%</span>
            </div>
          ) : null}
        </div>
      </header>

      <div className="space-y-4 px-5 py-4">
        {(isSupervisor && (activeView === 'assignments' || activeView === 'timelines')) ||
        (!isSupervisor && (activeView === 'summary' || activeView === 'milestones')) ? (
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400">Start</p>
              <p className="mt-0.5 font-medium text-slate-800">{formatDate(portal.timelineStart)}</p>
            </div>
            <div className="w-px self-stretch bg-slate-100" />
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400">End</p>
              <p className="mt-0.5 font-medium text-slate-800">{formatDate(portal.timelineEnd)}</p>
            </div>
            <div className="w-px self-stretch bg-slate-100" />
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400">Status</p>
              <p className={`mt-0.5 font-semibold ${timeline.tone}`}>{timeline.label}</p>
            </div>
          </div>
        ) : null}

        {(((isSupervisor && (activeView === 'assignments' || activeView === 'timelines')) ||
          (!isSupervisor && (activeView === 'summary' || activeView === 'updates')))) && portal.notes ? (
          <p className="rounded-lg border-l-2 border-violet-300 bg-violet-50/50 px-4 py-2.5 text-sm text-slate-700">
            {portal.notes}
          </p>
        ) : null}

        {(isSupervisor && activeView === 'delivery') ||
        (!isSupervisor && (activeView === 'summary' || activeView === 'tasks')) ? (
          <div className="space-y-2">
            {phases.map((phase, phaseIndex) => {
              const phaseCompletion = getPhaseCompletion(phase)
              const draftKey = `${portal.id}:${phase.id}`
              const draft = taskDrafts[draftKey] || { name: '', deadline: '', priority: 'medium' }
              const phaseEditKey = `${portal.id}:${phase.id}`
              const phaseEditDraft = phaseEditDrafts[phaseEditKey]
              const isEditingPhase = Boolean(phaseEditDraft)
              const phaseNumber = Number(phase?.order) || phaseIndex + 1
              const phaseTasks = Array.isArray(phase.tasks) ? phase.tasks : []
              const selectedInPhase = phaseTasks.filter((t) =>
                bulkSelectedTasks.has(`${portal.id}:${phase.id}:${t.id}`),
              )

              return (
                <div
                  key={phase.id}
                  draggable
                  onDragStart={() => setDraggedPhaseKey(`${portal.id}:${phase.id}`)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={async () => {
                    const draggedPhaseId = draggedPhaseKey.startsWith(`${portal.id}:`)
                      ? draggedPhaseKey.split(':')[1]
                      : ''
                    setDraggedPhaseKey('')
                    await onReorderPhases(portal, draggedPhaseId, phase.id)
                  }}
                  onDragEnd={() => setDraggedPhaseKey('')}
                  className={`rounded-lg border transition-colors ${
                    draggedPhaseKey === `${portal.id}:${phase.id}`
                      ? 'border-violet-200 bg-violet-50/30'
                      : 'border-slate-100'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                    {isEditingPhase ? (
                      <div className="flex flex-1 flex-wrap gap-2">
                        <input
                          value={phaseEditDraft.name || ''}
                          onChange={(event) =>
                            setPhaseEditDrafts((current) => ({
                              ...current,
                              [phaseEditKey]: { ...phaseEditDraft, name: event.target.value },
                            }))
                          }
                          placeholder="Phase name"
                          className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400"
                        />
                        <input
                          type="date"
                          value={phaseEditDraft.startDate || ''}
                          onChange={(event) =>
                            setPhaseEditDrafts((current) => ({
                              ...current,
                              [phaseEditKey]: { ...phaseEditDraft, startDate: event.target.value },
                            }))
                          }
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400"
                        />
                        <input
                          type="date"
                          value={phaseEditDraft.endDate || ''}
                          onChange={(event) =>
                            setPhaseEditDrafts((current) => ({
                              ...current,
                              [phaseEditKey]: { ...phaseEditDraft, endDate: event.target.value },
                            }))
                          }
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400"
                        />
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSavePhaseEdit(portal, phase.id)}
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelEditPhase(portal.id, phase.id)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">
                            {phaseNumber}
                          </span>
                          <span className="text-sm font-medium text-slate-800">{phase.name}</span>
                          {phase.completed ? (
                            <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">Done</span>
                          ) : null}
                          <span className="text-[11px] text-slate-400">
                            {formatDate(getPhaseStartDate(phase))} – {formatDate(getPhaseEndDate(phase))}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1 w-20 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  phaseCompletion === 100 ? 'bg-emerald-500' : 'bg-violet-500'
                                }`}
                                style={{ width: `${phaseCompletion}%` }}
                              />
                            </div>
                            <span className="w-7 text-right text-[11px] tabular-nums text-slate-500">{phaseCompletion}%</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={Boolean(phase.completed)}
                            onChange={() => onTogglePhaseCompletion(portal, phase.id)}
                            title="Mark phase complete"
                            className="h-3.5 w-3.5 accent-slate-800"
                          />
                          {canEdit ? (
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => startEditPhase(portal.id, phase)}
                                className="rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeletePhase(portal, phase.id)}
                                className="rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                              >
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="border-t border-slate-100">
                    {selectedInPhase.length > 0 ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-2">
                        <span className="text-xs text-slate-500">{selectedInPhase.length} selected</span>
                        <div className="flex flex-wrap gap-1.5">
                          {canEdit ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onBulkCompleteSelected(portal, phase.id)}
                                className="rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
                              >
                                Mark done
                              </button>
                              <button
                                type="button"
                                onClick={() => onBulkIncompleteSelected(portal, phase.id)}
                                className="rounded-lg bg-slate-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-slate-700"
                              >
                                Reopen
                              </button>
                              <button
                                type="button"
                                onClick={() => onBulkDeleteSelected(portal, phase.id)}
                                className="rounded-lg bg-rose-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-rose-700"
                              >
                                Delete
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setBulkSelectedTasks(new Set())}
                            className="rounded-lg border border-slate-200 px-3 py-1 text-[11px] text-slate-500 hover:bg-slate-50"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {phaseTasks.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-slate-400">No tasks yet.</p>
                    ) : null}

                    {phaseTasks.map((task, taskIndex) => {
                      const taskEditKey = `${portal.id}:${phase.id}:${task.id}`
                      const taskEditDraft = taskEditDrafts[taskEditKey]
                      const isEditingTask = Boolean(taskEditDraft)
                      const taskDragKey = `${portal.id}:${phase.id}:${task.id}`
                      const taskStatus = getTaskStatus(task)
                      const statusCfg = getStatusConfig(taskStatus)
                      const deadlineInfo = getTaskDeadlineStatus(task.deadline, task)
                      const commentsKey = `${portal.id}:${phase.id}:${task.id}`
                      const isExpanded = expandedComments.has(commentsKey)
                      const comments = Array.isArray(task.comments) ? task.comments : []

                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={() => setDraggedTaskKey(taskDragKey)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={async () => {
                            const prefix = `${portal.id}:${phase.id}:`
                            const sourceTaskId = draggedTaskKey.startsWith(prefix)
                              ? draggedTaskKey.slice(prefix.length)
                              : ''
                            setDraggedTaskKey('')
                            await onReorderTasks(portal, phase.id, sourceTaskId, task.id)
                          }}
                          onDragEnd={() => setDraggedTaskKey('')}
                          className={`transition-colors ${
                            taskIndex > 0 ? 'border-t border-slate-100' : ''
                          } ${
                            draggedTaskKey === taskDragKey ? 'opacity-40' : ''
                          } ${
                            bulkSelectedTasks.has(taskDragKey) ? 'bg-violet-50/50' : 'hover:bg-slate-50/60'
                          }`}
                        >
                          <div className="flex items-center gap-3 px-4 py-2.5">
                            <span
                              className="flex-shrink-0 cursor-grab select-none text-slate-200 hover:text-slate-400 active:cursor-grabbing"
                              title="Drag to reorder"
                            >
                              ⠿
                            </span>
                            {canEdit ? (
                              <input
                                type="checkbox"
                                checked={bulkSelectedTasks.has(taskDragKey)}
                                onChange={() => toggleBulkTaskSelection(portal.id, phase.id, task.id)}
                                className="h-3.5 w-3.5 flex-shrink-0 accent-violet-600"
                              />
                            ) : null}

                            <div className="min-w-0 flex-1">
                              {isEditingTask ? (
                                <div className="flex flex-wrap gap-2">
                                  <input
                                    value={taskEditDraft.name || ''}
                                    onChange={(event) =>
                                      setTaskEditDrafts((current) => ({
                                        ...current,
                                        [taskEditKey]: { ...taskEditDraft, name: event.target.value },
                                      }))
                                    }
                                    placeholder="Task name"
                                    className="flex-1 rounded-lg border border-slate-200 px-3 py-1 text-sm outline-none focus:border-slate-400"
                                  />
                                  <input
                                    type="date"
                                    value={taskEditDraft.deadline || ''}
                                    onChange={(event) =>
                                      setTaskEditDrafts((current) => ({
                                        ...current,
                                        [taskEditKey]: { ...taskEditDraft, deadline: event.target.value },
                                      }))
                                    }
                                    className="rounded-lg border border-slate-200 px-3 py-1 text-sm outline-none focus:border-slate-400"
                                  />
                                  <select
                                    value={taskEditDraft.priority || 'medium'}
                                    onChange={(event) =>
                                      setTaskEditDrafts((current) => ({
                                        ...current,
                                        [taskEditKey]: { ...taskEditDraft, priority: event.target.value },
                                      }))
                                    }
                                    className="rounded-lg border border-slate-200 px-3 py-1 text-sm outline-none focus:border-slate-400"
                                  >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                  </select>
                                </div>
                              ) : (
                                <span className={`text-sm ${isTaskDone(task) ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                  {task.name}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                              {!isEditingTask ? (
                                <>
                                  {(() => {
                                    const priority = String(task?.priority || '').toLowerCase()
                                    if (priority === 'high' || priority === 'medium' || priority === 'low') {
                                      return (
                                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${getPriorityBadgeClass(priority)}`}>
                                          {getPriorityLabel(priority)}
                                        </span>
                                      )
                                    }
                                    return null
                                  })()}
                                  {deadlineInfo.badge ? (
                                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${deadlineInfo.tone}`}>
                                      {deadlineInfo.badge}
                                    </span>
                                  ) : task.deadline && !isTaskDone(task) ? (
                                    <span className="text-[11px] text-slate-400">{formatDate(task.deadline)}</span>
                                  ) : null}
                                    {taskStatus === 'blocked' && task?.blockedReason ? (
                                      <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                                        {task.blockedReason}
                                      </span>
                                    ) : null}
                                </>
                              ) : null}

                              {canEdit ? (
                                <button
                                  type="button"
                                  onClick={() => onSetTaskStatus(portal, phase.id, task.id)}
                                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-75 ${statusCfg.badge} ${statusCfg.ring}`}
                                  title="Click to advance status"
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${
                                    taskStatus === 'completed' ? 'bg-emerald-500' :
                                    taskStatus === 'needs_review' ? 'bg-amber-500' :
                                    taskStatus === 'blocked' ? 'bg-rose-500' :
                                    taskStatus === 'in_progress' ? 'bg-sky-500' : 'bg-slate-400'
                                  }`} />
                                  {statusCfg.label}
                                </button>
                              ) : (
                                <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusCfg.badge} ${statusCfg.ring}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${
                                    taskStatus === 'completed' ? 'bg-emerald-500' :
                                    taskStatus === 'needs_review' ? 'bg-amber-500' :
                                    taskStatus === 'blocked' ? 'bg-rose-500' :
                                    taskStatus === 'in_progress' ? 'bg-sky-500' : 'bg-slate-400'
                                  }`} />
                                  {statusCfg.label}
                                </span>
                              )}

                              {canEdit ? (
                                <button
                                  type="button"
                                  onClick={() => onToggleTaskBlocked(portal, phase.id, task.id)}
                                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                    taskStatus === 'blocked'
                                      ? 'bg-rose-600 text-white hover:bg-rose-700'
                                      : 'border border-rose-200 text-rose-600 hover:bg-rose-50'
                                  }`}
                                >
                                  {taskStatus === 'blocked' ? 'Unblock' : 'Block'}
                                </button>
                              ) : null}

                              {isEditingTask ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => onSaveTaskEdit(portal, phase.id, task.id)}
                                    className="rounded-lg bg-slate-900 px-3 py-1 text-[11px] font-medium text-white hover:bg-slate-700"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => cancelEditTask(portal.id, phase.id, task.id)}
                                    className="rounded-lg border border-slate-200 px-3 py-1 text-[11px] text-slate-500 hover:bg-slate-50"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : canEdit ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => startEditTask(portal.id, phase.id, task)}
                                    className="rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onDeleteTask(portal, phase.id, task.id)}
                                    className="rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                                  >
                                    ✕
                                  </button>
                                </>
                              ) : null}

                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedComments((current) => {
                                    const next = new Set(current)
                                    if (next.has(commentsKey)) next.delete(commentsKey)
                                    else next.add(commentsKey)
                                    return next
                                  })
                                }}
                                className={`rounded px-2 py-1 text-[11px] transition-colors ${
                                  isExpanded ? 'text-violet-600' : 'text-slate-400 hover:text-slate-600'
                                }`}
                              >
                                {comments.length > 0 ? `${comments.length} comment${comments.length !== 1 ? 's' : ''}` : 'Comment'}
                              </button>
                            </div>
                          </div>

                          {isExpanded ? (
                            <div className="space-y-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                              {comments.length > 0 ? (
                                <div className="space-y-2">
                                  {comments.map((comment) => (
                                    <div key={comment.id} className="flex gap-2.5">
                                      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
                                        {(comment.author || 'A').charAt(0).toUpperCase()}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-[11px] font-semibold text-slate-700">{comment.author}</span>
                                          <span className="text-[10px] text-slate-400">{formatDate(comment.createdAt)}</span>
                                          {(isSupervisor ||
                                            comment.authorId === user?.uid ||
                                            comment.author === (profile?.name || user?.displayName || user?.email)) ? (
                                            <button
                                              type="button"
                                              onClick={() => onDeleteTaskComment(portal, phase.id, task.id, comment.id)}
                                              className="ml-auto text-[10px] text-slate-300 hover:text-rose-500"
                                            >
                                              ✕
                                            </button>
                                          ) : null}
                                        </div>
                                        <p className="mt-0.5 text-xs text-slate-600">{comment.text}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              <div className="flex gap-2">
                                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-semibold text-violet-600">
                                  {(profile?.name || user?.displayName || user?.email || 'Y').charAt(0).toUpperCase()}
                                </div>
                                <textarea
                                  value={commentDrafts[commentsKey] || ''}
                                  onChange={(event) =>
                                    setCommentDrafts((current) => ({
                                      ...current,
                                      [commentsKey]: event.target.value,
                                    }))
                                  }
                                  placeholder="Add a comment…"
                                  rows="1"
                                  className="flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-slate-400"
                                />
                                <button
                                  type="button"
                                  onClick={() => onAddTaskComment(portal, phase.id, task.id)}
                                  className="self-end rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-slate-700"
                                >
                                  Post
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}

                    {canEdit ? (
                      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2.5">
                        <input
                          value={draft.name || ''}
                          onChange={(event) =>
                            setTaskDrafts((current) => ({
                              ...current,
                              [draftKey]: { ...draft, name: event.target.value },
                            }))
                          }
                          placeholder="Add a task…"
                          className="min-w-[140px] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400 placeholder:text-slate-400"
                        />
                        <input
                          type="date"
                          value={draft.deadline || ''}
                          onChange={(event) =>
                            setTaskDrafts((current) => ({
                              ...current,
                              [draftKey]: { ...draft, deadline: event.target.value },
                            }))
                          }
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400"
                        />
                        <select
                          value={draft.priority || 'medium'}
                          onChange={(event) =>
                            setTaskDrafts((current) => ({
                              ...current,
                              [draftKey]: { ...draft, priority: event.target.value },
                            }))
                          }
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => onAddTask(portal, phase.id)}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                        >
                          Add
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}

            {canEdit ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-4 py-3">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-slate-400">New phase</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={phaseDrafts[portal.id]?.name || ''}
                    onChange={(event) =>
                      setPhaseDrafts((current) => ({
                        ...current,
                        [portal.id]: { ...(current[portal.id] || {}), name: event.target.value },
                      }))
                    }
                    placeholder="Phase name"
                    className="min-w-[140px] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400 placeholder:text-slate-400"
                  />
                  <input
                    type="date"
                    value={phaseDrafts[portal.id]?.startDate || ''}
                    onChange={(event) =>
                      setPhaseDrafts((current) => ({
                        ...current,
                        [portal.id]: { ...(current[portal.id] || {}), startDate: event.target.value },
                      }))
                    }
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400"
                  />
                  <input
                    type="date"
                    value={phaseDrafts[portal.id]?.endDate || ''}
                    onChange={(event) =>
                      setPhaseDrafts((current) => ({
                        ...current,
                        [portal.id]: { ...(current[portal.id] || {}), endDate: event.target.value },
                      }))
                    }
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => onAddPhase(portal)}
                    className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                  >
                    Add Phase
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeView === 'gantt' ? (
          <div>
            <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-slate-400">Phase timeline</p>
            <div className="overflow-x-auto">
              <div className="min-w-[480px] space-y-2">
                {phases.map((phase, idx) => {
                  const gEnd = parseDate(getPhaseEndDate(phase))
                  const gDaysLeft = gEnd ? Math.ceil((gEnd.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null
                  const gComp = getPhaseCompletion(phase)
                  const gOverdue = gDaysLeft !== null && gDaysLeft < 0
                  const gNum = Number(phase?.order) || idx + 1

                  return (
                    <div key={phase.id} className="flex items-center gap-4">
                      <div className="w-40 flex-shrink-0">
                        <div className="flex items-center gap-1.5">
                          <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-slate-800 text-[9px] font-semibold text-white">
                            {gNum}
                          </span>
                          <span className="truncate text-xs font-medium text-slate-700">{phase.name}</span>
                        </div>
                        <p className="mt-0.5 pl-5.5 text-[10px] text-slate-400">
                          {formatDate(parseDate(getPhaseStartDate(phase)))} – {formatDate(gEnd)}
                        </p>
                      </div>
                      <div className="relative h-5 min-w-[160px] flex-1 overflow-hidden rounded-md bg-slate-100">
                        <div
                          className={`h-full flex items-center pl-2 text-[9px] font-semibold text-white transition-all ${
                            gOverdue ? 'bg-rose-400' : phase.completed ? 'bg-emerald-500' : gComp >= 60 ? 'bg-violet-500' : 'bg-slate-400'
                          }`}
                          style={{ width: `${Math.max(gComp, 4)}%` }}
                        >
                          {gComp > 12 ? `${gComp}%` : ''}
                        </div>
                        {gComp <= 12 ? (
                          <div className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-slate-500">
                            {gComp}%
                          </div>
                        ) : null}
                      </div>
                      <div className="w-20 flex-shrink-0 text-right">
                        <span className={`text-[11px] font-medium ${
                          gOverdue ? 'text-rose-500' : gDaysLeft !== null && gDaysLeft <= 7 ? 'text-amber-500' : 'text-emerald-600'
                        }`}>
                          {gOverdue ? `${Math.abs(gDaysLeft)}d over` : gDaysLeft !== null ? `${gDaysLeft}d left` : '—'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {isAdmin ? (
        <div className="flex justify-end border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={() => onDeleteAssignment(portal)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50"
          >
            Delete assignment
          </button>
        </div>
      ) : null}
    </article>
  )
}

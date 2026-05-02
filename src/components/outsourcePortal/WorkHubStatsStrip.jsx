export default function WorkHubStatsStrip({ isSupervisor, workspaceSummary }) {
  const stats = [
    {
      label: isSupervisor ? 'Assignments' : 'My Assignments',
      value: workspaceSummary.assignments,
      sub: isSupervisor ? 'Active portals' : 'On your board',
      color: 'text-slate-900',
    },
    {
      label: 'Needs Review',
      value: workspaceSummary.inReviewTasks,
      sub: 'Waiting for supervisor',
      color: workspaceSummary.inReviewTasks > 0 ? 'text-amber-700' : 'text-slate-900',
    },
    {
      label: 'Blocked',
      value: workspaceSummary.blockedTasks,
      sub: 'Need unblock action',
      color: workspaceSummary.blockedTasks > 0 ? 'text-rose-700' : 'text-slate-900',
    },
    {
      label: 'Open Tasks',
      value: workspaceSummary.openTasks,
      sub: 'Active execution load',
      color: 'text-slate-900',
    },
  ]

  return (
    <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 xl:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-white px-6 py-5">
          <p className="text-[11px] font-medium uppercase tracking-widest text-slate-400">{stat.label}</p>
          <p className={`mt-2 text-3xl font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
          <p className="mt-1 text-xs text-slate-400">{stat.sub}</p>
        </div>
      ))}
    </div>
  )
}

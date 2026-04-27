export default function WorkHubStatsStrip({ isSupervisor, workspaceSummary }) {
  const stats = [
    {
      label: isSupervisor ? 'Assignments' : 'My Assignments',
      value: workspaceSummary.assignments,
      sub: isSupervisor ? 'Active portals' : 'On your board',
      color: 'text-slate-900',
    },
    {
      label: 'Open Tasks',
      value: workspaceSummary.openTasks,
      sub: 'Pending across phases',
      color: 'text-slate-900',
    },
    {
      label: 'Due Soon',
      value: workspaceSummary.dueSoonAssignments,
      sub: 'Ending within 7 days',
      color: workspaceSummary.dueSoonAssignments > 0 ? 'text-amber-600' : 'text-slate-900',
    },
    {
      label: 'Avg. Progress',
      value: `${workspaceSummary.averageCompletion}%`,
      sub: 'Overall completion',
      color: workspaceSummary.averageCompletion === 100 ? 'text-emerald-600' : 'text-slate-900',
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

export default function WorkHubViewSidebar({ isSupervisor, portalViews, activeView, onChangeView }) {
  return (
    <aside className="w-44 flex-shrink-0 rounded-2xl border border-slate-200 bg-white/80 p-3">
      <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        {isSupervisor ? 'Supervisor Workspace' : 'Execution Workspace'}
      </p>
      <nav className="space-y-0.5">
        {portalViews.map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => onChangeView(view.id)}
            className={`w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors ${
              activeView === view.id
                ? 'bg-sky-700 text-white'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            {view.label}
          </button>
        ))}
      </nav>
    </aside>
  )
}

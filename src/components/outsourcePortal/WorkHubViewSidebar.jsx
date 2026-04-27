export default function WorkHubViewSidebar({ isSupervisor, portalViews, activeView, onChangeView }) {
  return (
    <aside className="w-40 flex-shrink-0">
      <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        {isSupervisor ? 'Views' : 'Workspace'}
      </p>
      <nav className="space-y-0.5">
        {portalViews.map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => onChangeView(view.id)}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
              activeView === view.id
                ? 'bg-slate-900 text-white'
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

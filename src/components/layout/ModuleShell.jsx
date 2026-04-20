export default function ModuleShell({
  title,
  description,
  actions,
  children,
}) {
  return (
    <section className="rounded-2xl border border-white/30 bg-white/65 p-4 shadow-[0_18px_46px_-24px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:rounded-3xl sm:p-5 lg:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/70 pb-4 sm:mb-6 sm:pb-5">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Infinite Pixels OS</p>
          <h3 className="mt-1 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{title}</h3>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm">{description}</p>
        </div>

        {actions ? <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">{actions}</div> : null}
      </div>

      <div className="space-y-6">{children}</div>
    </section>
  )
}

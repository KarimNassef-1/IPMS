export default function ModuleShell({
  title,
  description,
  actions,
  children,
}) {
  return (
    <section className="rounded-3xl border border-white/20 bg-white/50 p-6 shadow-xl shadow-slate-300/25 backdrop-blur-xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl font-black tracking-tight text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>

        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </div>

      <div>{children}</div>
    </section>
  )
}

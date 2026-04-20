export default function ModuleShell({
  title,
  description,
  actions,
  children,
}) {
  return (
    <section className="rounded-2xl border border-white/30 bg-white/65 p-4 shadow-[0_18px_46px_-24px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:rounded-3xl sm:p-5 lg:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-5">
        <div>
          <h3 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{title}</h3>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm">{description}</p>
        </div>

        {actions ? <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">{actions}</div> : null}
      </div>

      <div>{children}</div>
    </section>
  )
}

import { useCallback, useMemo, useRef, useState } from 'react'
import { ToastContext } from './toast-context'

function typeStyles(type) {
  if (type === 'error') {
    return {
      border: 'border-rose-200',
      bg: 'bg-rose-50',
      text: 'text-rose-800',
      bar: 'bg-rose-500',
      icon: '!',
      iconBg: 'bg-rose-100 text-rose-700',
    }
  }

  if (type === 'success') {
    return {
      border: 'border-emerald-200',
      bg: 'bg-emerald-50',
      text: 'text-emerald-800',
      bar: 'bg-emerald-500',
      icon: '✓',
      iconBg: 'bg-emerald-100 text-emerald-700',
    }
  }

  return {
    border: 'border-slate-200',
    bg: 'bg-white',
    text: 'text-slate-800',
    bar: 'bg-[#8246f6]',
    icon: 'i',
    iconBg: 'bg-[#f0e9ff] text-[#6f39e7]',
  }
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timerByIdRef = useRef(new Map())

  const dismissToast = useCallback((id) => {
    const timer = timerByIdRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timerByIdRef.current.delete(id)
    }

    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback((message, options = {}) => {
    const safeMessage = String(message || '').trim()
    if (!safeMessage) return ''

    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const type = options.type || 'info'
    const duration = Math.max(Number(options.duration) || 5000, 1500)

    setToasts((current) => [
      ...current,
      {
        id,
        message: safeMessage,
        type,
        duration,
        actionLabel: String(options.actionLabel || '').trim(),
        onAction: typeof options.onAction === 'function' ? options.onAction : null,
      },
    ])

    const timer = setTimeout(() => {
      dismissToast(id)
    }, duration)

    timerByIdRef.current.set(id, timer)
    return id
  }, [dismissToast])

  const value = useMemo(() => ({
    notify,
    success: (message, options = {}) => notify(message, { ...options, type: 'success' }),
    error: (message, options = {}) => notify(message, { ...options, type: 'error' }),
    info: (message, options = {}) => notify(message, { ...options, type: 'info' }),
    dismiss: dismissToast,
  }), [dismissToast, notify])

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex w-[min(92vw,24rem)] flex-col gap-2 sm:bottom-5 sm:right-5">
        {toasts.map((toast) => {
          const style = typeStyles(toast.type)

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto overflow-hidden rounded-xl border shadow-lg backdrop-blur ${style.border} ${style.bg}`}
            >
              <div className="flex items-start gap-2 px-3 py-2.5">
                <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${style.iconBg}`}>
                  {style.icon}
                </div>
                <p className={`min-w-0 flex-1 text-xs font-medium ${style.text}`}>{toast.message}</p>
                {toast.actionLabel && toast.onAction ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await toast.onAction()
                      } finally {
                        dismissToast(toast.id)
                      }
                    }}
                    className="shrink-0 rounded-full border border-[#d8c8ff] bg-gradient-to-r from-[#f7f1ff] to-white px-3 py-1 text-[11px] font-semibold text-[#5a2fd6] shadow-sm transition hover:-translate-y-0.5 hover:border-[#b79bff] hover:from-[#ede2ff] hover:to-[#f9f6ff] hover:shadow"
                  >
                    {toast.actionLabel}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="rounded px-1 text-sm leading-none text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-700"
                  aria-label="Close notification"
                >
                  ×
                </button>
              </div>
              <div className="h-1 w-full bg-slate-200/70">
                <div
                  className={`h-full origin-left ${style.bar} ip-toast-timer`}
                  style={{ animationDuration: `${toast.duration}ms` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

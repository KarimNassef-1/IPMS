import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import {
  consumeClientPortalQrInvite,
  ensureClientLinkSession,
  setClientLinkDisplayName,
} from '../../services/clientQrAccessService'

export default function ClientPortalAccessPage() {
  const { user, profile, loading } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState(false)
  const consumeStartedRef = useRef(false)

  const token = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return String(params.get('token') || '').trim()
  }, [location.search])

  useEffect(() => {
    consumeStartedRef.current = false
    setCompleted(false)
    setProcessing(false)
    setError('')
  }, [token])

  useEffect(() => {
    if (!token) {
      setError('Invalid QR link. Missing access token.')
      return
    }

    if (loading || user?.uid) return

    let cancelled = false

    async function prepareSession() {
      try {
        await ensureClientLinkSession()
      } catch (sessionError) {
        if (cancelled) return
        setError(sessionError?.message || 'Unable to prepare secure access session.')
      }
    }

    prepareSession()

    return () => {
      cancelled = true
    }
  }, [loading, token, user?.uid])

  useEffect(() => {
    if (!token) {
      setError('Invalid QR link. Missing access token.')
      return
    }

    if (loading || !user?.uid || completed || consumeStartedRef.current) return
    consumeStartedRef.current = true

    async function consumeAccess() {
      setProcessing(true)
      setError('')

      try {
        const result = await consumeClientPortalQrInvite({ token, user, profile })
        setClientLinkDisplayName(result?.clientName)

        setCompleted(true)
        toast.success(
          result?.alreadyLinked
            ? 'This project is already linked to your account.'
            : 'Project access unlocked successfully.',
        )
        navigate('/client-portal', { replace: true })
      } catch (consumeError) {
        consumeStartedRef.current = false
        setError(consumeError?.message || 'Unable to process this QR access link.')
      } finally {
        setProcessing(false)
      }
    }

    consumeAccess()
  }, [completed, loading, navigate, profile, toast, token, user])

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_4%_4%,_#f4ecff_0%,_#edf4ff_50%,_#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl rounded-3xl border border-white/45 bg-white/85 p-6 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.42)] backdrop-blur-xl sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">Exclusive Access</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Client Portal QR Entry</h1>
        <p className="mt-2 text-sm text-slate-600">
          This secure QR link links your account to your specific project portal access.
        </p>

        {!token ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error || 'The QR token is missing.'}
          </div>
        ) : null}

        {token && loading ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Preparing secure access session...
          </div>
        ) : null}

        {token && processing ? (
          <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-700">
            Verifying and linking your project access...
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {user ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs text-slate-600">
            Session ready for this access link.
          </div>
        ) : null}
      </div>
    </div>
  )
}

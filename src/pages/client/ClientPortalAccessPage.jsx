import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import {
  buildClientPortalLoginRedirect,
  consumeClientPortalQrInvite,
} from '../../services/clientQrAccessService'

export default function ClientPortalAccessPage() {
  const { user, role, profile, loading } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState(false)

  const token = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return String(params.get('token') || '').trim()
  }, [location.search])

  const loginRedirect = useMemo(
    () => buildClientPortalLoginRedirect(token),
    [token],
  )

  useEffect(() => {
    if (!token) {
      setError('Invalid QR link. Missing access token.')
      return
    }

    if (loading || !user?.uid || processing || completed) return

    if (role !== 'client') {
      setError('This QR link can only be used by a client account.')
      return
    }

    let cancelled = false

    async function consumeAccess() {
      setProcessing(true)
      setError('')

      try {
        const result = await consumeClientPortalQrInvite({ token, user, profile })
        if (cancelled) return

        setCompleted(true)
        toast.success(
          result?.alreadyLinked
            ? 'This project is already linked to your account.'
            : 'Project access unlocked successfully.',
        )
        navigate('/client-portal', { replace: true })
      } catch (consumeError) {
        if (cancelled) return
        setError(consumeError?.message || 'Unable to process this QR access link.')
      } finally {
        if (!cancelled) setProcessing(false)
      }
    }

    consumeAccess()

    return () => {
      cancelled = true
    }
  }, [completed, loading, navigate, processing, profile, role, toast, token, user])

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

        {token && !user ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-sm text-slate-700">Please sign in with your client account to continue.</p>
            <Link
              to={loginRedirect}
              className="mt-3 inline-flex items-center rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
            >
              Sign In To Continue
            </Link>
          </div>
        ) : null}

        {token && loading ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Checking your session...
          </div>
        ) : null}

        {token && user && processing ? (
          <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-700">
            Verifying and linking your project access...
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {user && role === 'client' ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs text-slate-600">
            Signed in as <span className="font-semibold text-slate-800">{profile?.name || user?.email}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

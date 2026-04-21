import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { createNotification } from '../../services/notificationService'

const unauthorizedReportCooldownMs = 8000
const unauthorizedReportCache = new Map()

function reportUnauthorizedAttemptOnce({ user, role, attemptedPath, reason }) {
  const uid = String(user?.uid || '').trim()
  const path = String(attemptedPath || '').trim() || 'unknown-path'
  if (!uid) return

  const cacheKey = `${uid}:${path}:${reason}`
  const now = Date.now()
  const lastReportedAt = unauthorizedReportCache.get(cacheKey) || 0
  if (now - lastReportedAt < unauthorizedReportCooldownMs) return
  unauthorizedReportCache.set(cacheKey, now)

  const actorName =
    String(user?.displayName || '').trim() || String(user?.email || '').trim() || 'A team member'
  const actorPhotoURL = String(user?.photoURL || '').trim() || ''

  createNotification({
    type: 'security',
    action: 'unauthorized-access-attempt',
    message: `${actorName} tried to access a restricted page`,
    description: reason,
    attemptedPath: path,
    actorId: uid,
    actorName,
    actorRole: String(role || '').trim() || 'member',
    actorPhotoURL,
    attemptedAt: new Date().toISOString(),
    adminFeed: true,
  }).catch(() => {})
}

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="rounded-2xl bg-white/80 px-8 py-4 text-sm text-slate-600 shadow-lg backdrop-blur">
        Loading session...
      </div>
    </div>
  )
}

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />

  return <Outlet />
}

export function RoleRoute({ allowedRoles }) {
  const { user, role, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader />
  if (!allowedRoles.includes(role)) {
    if (user && role !== 'admin') {
      reportUnauthorizedAttemptOnce({
        user,
        role,
        attemptedPath: location.pathname,
        reason: `Role route blocked. Required roles: ${allowedRoles.join(', ')}`,
      })
    }

    return (
      <Navigate
        to="/unauthorized"
        replace
        state={{ from: location.pathname, reason: 'role', requiredRoles: allowedRoles }}
      />
    )
  }

  return <Outlet />
}

export function PermissionRoute({ permission }) {
  const { user, role, loading, hasAccess } = useAuth()
  const location = useLocation()

  if (loading || (user && !role)) return <FullPageLoader />
  if (!hasAccess(permission)) {
    if (user && role !== 'admin') {
      reportUnauthorizedAttemptOnce({
        user,
        role,
        attemptedPath: location.pathname,
        reason: `Permission blocked: ${permission}`,
      })
    }

    return (
      <Navigate
        to="/unauthorized"
        replace
        state={{ from: location.pathname, reason: 'permission', permission }}
      />
    )
  }

  return <Outlet />
}

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

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
  const { role, loading } = useAuth()

  if (loading) return <FullPageLoader />
  if (!allowedRoles.includes(role)) return <Navigate to="/unauthorized" replace />

  return <Outlet />
}

export function PermissionRoute({ permission }) {
  const { user, role, loading, hasAccess } = useAuth()

  if (loading || (user && !role)) return <FullPageLoader />
  if (!hasAccess(permission)) return <Navigate to="/unauthorized" replace />

  return <Outlet />
}

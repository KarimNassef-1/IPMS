import { useAuth } from '../../hooks/useAuth'
import { Link } from 'react-router-dom'

export default function Topbar({ onOpenMenu }) {
  const { profile, logout } = useAuth()

  async function onLogout() {
    try {
      await logout()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  return (
    <header className="mb-4 rounded-3xl border border-white/20 bg-white/80 px-4 py-4 backdrop-blur-xl sm:mb-6 sm:px-5 lg:sticky lg:top-0 lg:z-20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenMenu}
            className="mb-3 inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-[#8246f6] hover:text-[#8246f6] lg:hidden"
          >
            Menu
          </button>
        </div>

        <div className="ml-auto flex items-center gap-3 rounded-2xl bg-white/90 px-4 py-3">
          <Link to="/profile" className="flex items-center gap-3">
            <p className="max-w-[220px] truncate text-base font-bold text-slate-900">{profile?.name || 'User'}</p>
            {profile?.photoURL ? (
              <img src={profile.photoURL} alt="Profile" className="h-12 w-12 rounded-full object-cover ring-2 ring-slate-200" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f0e9ff] text-base font-bold text-[#6f39e7]">
                {String(profile?.name || 'U').slice(0, 1).toUpperCase()}
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  )
}

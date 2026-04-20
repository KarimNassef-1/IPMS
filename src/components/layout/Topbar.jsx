import { useAuth } from '../../hooks/useAuth'
import { Link } from 'react-router-dom'

export default function Topbar() {
  const { profile, logout } = useAuth()

  async function onLogout() {
    try {
      await logout()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  return (
    <header className="pointer-events-none sticky top-2 z-20 mb-3 sm:mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1" />

        <div className="pointer-events-auto ml-auto flex items-center gap-2 rounded-2xl border border-white/60 bg-white/80 px-2.5 py-2 shadow-sm sm:gap-3 sm:px-3 sm:py-2.5">
          <Link to="/profile" className="flex items-center gap-2 sm:gap-3">
            <p className="hidden max-w-[220px] truncate text-sm font-bold text-slate-900 sm:block sm:text-base">{profile?.name || 'User'}</p>
            {profile?.photoURL ? (
              <img src={profile.photoURL} alt="Profile" className="h-10 w-10 rounded-full object-cover ring-2 ring-slate-200 sm:h-11 sm:w-11" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f0e9ff] text-sm font-bold text-[#6f39e7] sm:h-11 sm:w-11 sm:text-base">
                {String(profile?.name || 'U').slice(0, 1).toUpperCase()}
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-semibold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 sm:px-3 sm:text-xs"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  )
}

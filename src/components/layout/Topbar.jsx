import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { Link } from 'react-router-dom'
import {
  markNotificationAsRead,
  pruneAdminFeedNotifications,
  subscribeAdminFeedNotifications,
} from '../../services/notificationService'

function formatTimeAgo(rawDate) {
  if (!rawDate) return 'just now'
  const date = new Date(rawDate)
  if (Number.isNaN(date.getTime())) return 'just now'

  const seconds = Math.max(Math.floor((Date.now() - date.getTime()) / 1000), 0)
  if (seconds < 60) return 'just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatClock(rawDate) {
  if (!rawDate) return '-'
  const date = new Date(rawDate)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const NOTIFICATION_HISTORY_CACHE_KEY = 'ipms-admin-notification-history'
const NOTIFICATION_HISTORY_LIMIT = 200
const NOTIFICATION_PRUNE_STAMP_KEY = 'ipms-admin-notification-prune-last-run'
const NOTIFICATION_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000

function clampNotificationHistory(items) {
  if (!Array.isArray(items)) return []
  return items.slice(0, NOTIFICATION_HISTORY_LIMIT)
}

function readNotificationHistoryCache() {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(NOTIFICATION_HISTORY_CACHE_KEY)
    const parsed = JSON.parse(raw || '[]')
    return clampNotificationHistory(Array.isArray(parsed) ? parsed : [])
  } catch {
    return []
  }
}

function writeNotificationHistoryCache(items) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      NOTIFICATION_HISTORY_CACHE_KEY,
      JSON.stringify(clampNotificationHistory(items)),
    )
  } catch {
    // Ignore storage write failures.
  }
}

export default function Topbar() {
  const { profile, logout, isAdmin } = useAuth()
  const [adminNotifications, setAdminNotifications] = useState([])
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const notificationPanelRef = useRef(null)
  const profileMenuRef = useRef(null)

  useEffect(() => {
    if (!isAdmin) return
    const cached = readNotificationHistoryCache()
    if (cached.length) setAdminNotifications(cached)
  }, [isAdmin])

  async function onLogout() {
    try {
      await logout()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  useEffect(() => {
    if (!isAdmin) return undefined

    const lastRun = Number(window.localStorage.getItem(NOTIFICATION_PRUNE_STAMP_KEY) || 0)
    if (!Number.isFinite(lastRun) || Date.now() - lastRun > NOTIFICATION_PRUNE_INTERVAL_MS) {
      pruneAdminFeedNotifications({ keepLatest: NOTIFICATION_HISTORY_LIMIT, keepDays: 180 })
        .catch(() => {
          // Keep this silent for users; retention runs as best effort.
        })
        .finally(() => {
          try {
            window.localStorage.setItem(NOTIFICATION_PRUNE_STAMP_KEY, String(Date.now()))
          } catch {
            // Ignore storage write failures.
          }
        })
    }

    const unsubscribe = subscribeAdminFeedNotifications(
      (items) => {
        const nextItems = items
          .sort((left, right) => {
            const leftTime = new Date(left?.date || 0).getTime() || 0
            const rightTime = new Date(right?.date || 0).getTime() || 0
            return rightTime - leftTime
          })
          .slice(0, NOTIFICATION_HISTORY_LIMIT)

        if (nextItems.length > 0) {
          setAdminNotifications(nextItems)
          writeNotificationHistoryCache(nextItems)
          return
        }

        const cached = readNotificationHistoryCache()
        setAdminNotifications(cached)
      },
      (error) => {
        console.error('Notification stream failed:', error)
        const cached = readNotificationHistoryCache()
        setAdminNotifications(cached)
      },
    )

    return () => unsubscribe()
  }, [isAdmin])

  useEffect(() => {
    if (!isNotificationOpen && !isProfileMenuOpen) return undefined

    function handleOutsideClick(event) {
      if (!notificationPanelRef.current?.contains(event.target)) {
        setIsNotificationOpen(false)
      }

      if (!profileMenuRef.current?.contains(event.target)) {
        setIsProfileMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isNotificationOpen, isProfileMenuOpen])

  const unreadCount = useMemo(
    () => adminNotifications.filter((item) => item?.status !== 'read').length,
    [adminNotifications],
  )

  async function markAllAsRead() {
    const unread = adminNotifications.filter((item) => item?.status !== 'read')
    if (!unread.length) return

    const unreadIds = new Set(unread.map((item) => item.id))
    const optimistic = adminNotifications.map((item) =>
      unreadIds.has(item.id) ? { ...item, status: 'read' } : item,
    )
    setAdminNotifications(optimistic)
    writeNotificationHistoryCache(optimistic)

    await Promise.all(unread.map((item) => markNotificationAsRead(item.id)))
  }

  return (
    <header className="pointer-events-none sticky top-2 z-20 mb-3 sm:mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1" />

        <div className="pointer-events-auto ml-auto flex items-center gap-2 sm:gap-3">
          {isAdmin ? (
            <div className="relative" ref={notificationPanelRef}>
              <button
                type="button"
                onClick={() => {
                  setIsNotificationOpen((current) => !current)
                  setIsProfileMenuOpen(false)
                }}
                className="relative inline-flex h-9 w-9 items-center justify-center text-slate-700 transition hover:text-violet-700 sm:h-10 sm:w-10"
                aria-label="Admin notifications"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                  <path d="M12 2a7 7 0 0 0-7 7v3.8c0 .53-.21 1.04-.59 1.41L3 15.61A1 1 0 0 0 3.71 17h16.58a1 1 0 0 0 .71-1.71l-1.41-1.4a2 2 0 0 1-.59-1.42V9a7 7 0 0 0-7-7Z" />
                  <path d="M9.75 18a2.25 2.25 0 0 0 4.5 0h-4.5Z" />
                </svg>
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </button>

              {isNotificationOpen ? (
                <div className="absolute right-0 mt-2 w-[min(92vw,24rem)] overflow-visible rounded-2xl border border-slate-200 bg-white shadow-[0_26px_50px_-30px_rgba(15,23,42,0.7)]">
                  <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Admin Notifications</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={markAllAsRead}
                        className="text-[11px] font-semibold text-violet-700 transition hover:text-violet-800"
                      >
                        Mark all read
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[65vh] overflow-y-auto p-2">
                    {adminNotifications.length === 0 ? (
                      <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">No notifications yet.</p>
                    ) : (
                      adminNotifications.map((item) => {
                        const actorName = item?.actorName || 'User'
                        const actorPhoto = item?.actorPhotoURL
                        const loggedInAt = item?.loggedInAt || item?.date

                        return (
                          <div
                            key={item.id}
                            className={`mb-2 rounded-xl border px-2.5 py-2 ${item?.status === 'read' ? 'border-slate-100 bg-slate-50/60' : 'border-violet-100 bg-violet-50/70'}`}
                          >
                            <div className="flex items-start gap-2">
                              {actorPhoto ? (
                                <img src={actorPhoto} alt={actorName} className="h-8 w-8 rounded-full object-cover ring-1 ring-slate-200" />
                              ) : (
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                                    <circle cx="12" cy="8" r="3.2" />
                                    <path d="M5.5 19.2a6.5 6.5 0 0 1 13 0" />
                                  </svg>
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-slate-900">{actorName}</p>
                                <p className="mt-0.5 text-xs text-slate-700">{item?.message || 'New activity'}</p>
                                <p className="mt-1 text-[11px] text-slate-500">
                                  {item?.type === 'login' ? `Logged in at ${formatClock(loggedInAt)} • ` : ''}
                                  {formatTimeAgo(item?.date)}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center rounded-2xl border border-white/60 bg-white/80 px-2.5 py-2 shadow-sm sm:px-3 sm:py-2.5">
            <Link to="/profile" className="sm:hidden">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt="Profile" className="h-10 w-10 rounded-full object-cover ring-2 ring-slate-200 sm:h-11 sm:w-11" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-2 ring-slate-200 sm:h-11 sm:w-11">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
                    <circle cx="12" cy="8" r="3.2" />
                    <path d="M5.5 19.2a6.5 6.5 0 0 1 13 0" />
                  </svg>
                </div>
              )}
            </Link>

            <div className="relative hidden sm:block" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setIsProfileMenuOpen((current) => !current)
                  setIsNotificationOpen(false)
                }}
                className="inline-flex items-center gap-2 px-1 py-1 text-left transition hover:opacity-90"
                aria-label="Open profile menu"
              >
                <p className="max-w-[180px] truncate text-sm font-bold text-slate-900">{profile?.name || 'User'}</p>
                {profile?.photoURL ? (
                  <img src={profile.photoURL} alt="Profile" className="h-9 w-9 rounded-full object-cover ring-2 ring-slate-200" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-2 ring-slate-200">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                      <circle cx="12" cy="8" r="3.2" />
                      <path d="M5.5 19.2a6.5 6.5 0 0 1 13 0" />
                    </svg>
                  </div>
                )}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${isProfileMenuOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              <div
                className={`absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg transition-all duration-200 ease-out ${isProfileMenuOpen ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none -translate-y-1 scale-95 opacity-0'}`}
              >
                <Link
                  to="/profile"
                  onClick={() => setIsProfileMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                    <circle cx="12" cy="8" r="3.2" />
                    <path d="M5.5 19.2a6.5 6.5 0 0 1 13 0" />
                  </svg>
                  Profile
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false)
                    onLogout()
                  }}
                  className="block w-full px-3 py-2 text-left text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                >
                  Log out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

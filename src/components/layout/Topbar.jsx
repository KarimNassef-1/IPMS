import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { Link } from 'react-router-dom'
import {
  deleteNotification,
  markNotificationAsRead,
  subscribeNotifications,
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

export default function Topbar() {
  const { user, profile, logout, isAdmin } = useAuth()
  const [adminNotifications, setAdminNotifications] = useState([])
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const [isNotificationMenuOpen, setIsNotificationMenuOpen] = useState(false)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedNotificationIds, setSelectedNotificationIds] = useState([])
  const notificationPanelRef = useRef(null)
  const profileMenuRef = useRef(null)

  async function onLogout() {
    try {
      await logout()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  useEffect(() => {
    if (!isAdmin) return undefined

    const unsubscribe = subscribeNotifications(
      (items) => {
        const currentAdminId = String(user?.uid || '').trim()
        const currentAdminEmail = String(user?.email || '').trim().toLowerCase()
        const currentAdminName = String(profile?.name || '').trim().toLowerCase()

        const nextItems = items
          .filter((item) => item?.adminFeed !== false)
          .filter((item) => {
            const actorId = String(item?.actorId || item?.userId || '').trim()
            const actorEmail = String(item?.actorEmail || '').trim().toLowerCase()
            const actorName = String(item?.actorName || '').trim().toLowerCase()

            if (actorId && currentAdminId && actorId === currentAdminId) return false
            if (actorEmail && currentAdminEmail && actorEmail === currentAdminEmail) return false
            if (actorName && currentAdminName && actorName === currentAdminName) return false
            return true
          })
          .sort((left, right) => {
            const leftTime = new Date(left?.date || 0).getTime() || 0
            const rightTime = new Date(right?.date || 0).getTime() || 0
            return rightTime - leftTime
          })

        setAdminNotifications(nextItems)
      },
      (error) => {
        console.error('Notification stream failed:', error)
      },
    )

    return () => unsubscribe()
  }, [isAdmin, user?.uid, user?.email, profile?.name])

  useEffect(() => {
    if (!isNotificationOpen && !isProfileMenuOpen) return undefined

    function handleOutsideClick(event) {
      if (!notificationPanelRef.current?.contains(event.target)) {
        setIsNotificationOpen(false)
        setIsNotificationMenuOpen(false)
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
    await Promise.all(unread.map((item) => markNotificationAsRead(item.id)))
  }

  function toggleSelectNotification(id) {
    setSelectedNotificationIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  function startSelectionMode() {
    if (!adminNotifications.length) return
    setIsSelectMode(true)
    setSelectedNotificationIds([])
    setIsNotificationMenuOpen(false)
  }

  function selectAllNotifications() {
    if (!adminNotifications.length) return
    setIsSelectMode(true)
    setSelectedNotificationIds(adminNotifications.map((item) => item.id))
    setIsNotificationMenuOpen(false)
  }

  async function deleteSelectedNotifications() {
    if (!selectedNotificationIds.length) return
    await Promise.all(selectedNotificationIds.map((id) => deleteNotification(id)))
    setSelectedNotificationIds([])
    setIsSelectMode(false)
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
                  setIsNotificationMenuOpen(false)
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
                      {isSelectMode ? (
                        <button
                          type="button"
                          onClick={() => {
                            setIsSelectMode(false)
                            setSelectedNotificationIds([])
                          }}
                          className="text-[11px] font-semibold text-slate-600 transition hover:text-slate-800"
                        >
                          Cancel select
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={markAllAsRead}
                        className="text-[11px] font-semibold text-violet-700 transition hover:text-violet-800"
                      >
                        Mark all read
                      </button>

                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setIsNotificationMenuOpen((current) => !current)}
                          disabled={adminNotifications.length === 0}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                          aria-label="Notification options"
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                            <circle cx="12" cy="5.5" r="1.8" />
                            <circle cx="12" cy="12" r="1.8" />
                            <circle cx="12" cy="18.5" r="1.8" />
                          </svg>
                        </button>

                        <div
                          className={`absolute right-0 top-full z-30 mt-2 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg transition-all duration-200 ease-out ${isNotificationMenuOpen ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none -translate-y-1 scale-95 opacity-0'}`}
                        >
                          <button
                            type="button"
                            onClick={startSelectionMode}
                            disabled={adminNotifications.length === 0}
                            className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
                          >
                            Select
                          </button>
                          <button
                            type="button"
                            onClick={selectAllNotifications}
                            disabled={adminNotifications.length === 0}
                            className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
                          >
                            Select all
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {isSelectMode || selectedNotificationIds.length > 0 ? (
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                      <p className="text-[11px] font-semibold text-slate-600">
                        {selectedNotificationIds.length > 0
                          ? `${selectedNotificationIds.length} selected`
                          : 'Selection mode'}
                      </p>
                      {selectedNotificationIds.length > 0 ? (
                        <button
                          type="button"
                          onClick={deleteSelectedNotifications}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100 hover:text-rose-700"
                          aria-label="Delete selected notifications"
                          title="Delete selected"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                            <path d="M4 7h16" />
                            <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
                            <path d="M7.5 7.5l.7 10a2 2 0 0 0 2 1.8h3.6a2 2 0 0 0 2-1.8l.7-10" />
                            <path d="M10 11v5" />
                            <path d="M14 11v5" />
                          </svg>
                        </button>
                      ) : (
                        <div className="h-8 w-8" aria-hidden="true" />
                      )}
                    </div>
                  ) : null}

                  <div className="max-h-[65vh] overflow-y-auto p-2">
                    {adminNotifications.length === 0 ? (
                      <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">No notifications yet.</p>
                    ) : (
                      adminNotifications.map((item) => {
                        const actorName = item?.actorName || 'User'
                        const actorPhoto = item?.actorPhotoURL
                        const loggedInAt = item?.loggedInAt || item?.date
                        const isSelected = selectedNotificationIds.includes(item.id)

                        return (
                          <div
                            key={item.id}
                            className={`mb-2 rounded-xl border px-2.5 py-2 ${isSelected ? 'border-violet-300 bg-violet-100/60' : item?.status === 'read' ? 'border-slate-100 bg-slate-50/60' : 'border-violet-100 bg-violet-50/70'}`}
                          >
                            <div className="flex items-start gap-2">
                              {isSelectMode ? (
                                <label className="mt-1 inline-flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelectNotification(item.id)}
                                    className="h-4 w-4 rounded border-slate-300 text-violet-600"
                                  />
                                </label>
                              ) : null}
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
                  setIsNotificationMenuOpen(false)
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

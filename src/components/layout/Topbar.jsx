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
  const { profile, logout, isAdmin } = useAuth()
  const [adminNotifications, setAdminNotifications] = useState([])
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const [isNotificationMenuOpen, setIsNotificationMenuOpen] = useState(false)
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedNotificationIds, setSelectedNotificationIds] = useState([])
  const notificationPanelRef = useRef(null)

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
        const nextItems = items
          .filter((item) => item?.adminFeed === true)
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
  }, [isAdmin])

  useEffect(() => {
    if (!isNotificationOpen) return undefined

    function handleOutsideClick(event) {
      if (!notificationPanelRef.current?.contains(event.target)) {
        setIsNotificationOpen(false)
        setIsNotificationMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isNotificationOpen])

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
    setIsSelectMode(true)
    setIsNotificationMenuOpen(false)
    setSelectedNotificationIds([])
  }

  function selectAllNotifications() {
    setIsSelectMode(true)
    setIsNotificationMenuOpen(false)
    setSelectedNotificationIds(adminNotifications.map((item) => item.id))
  }

  async function deleteSelectedNotifications() {
    if (!selectedNotificationIds.length) return
    await Promise.all(selectedNotificationIds.map((id) => deleteNotification(id)))
    setSelectedNotificationIds([])
    setIsSelectMode(false)
    setIsNotificationMenuOpen(false)
  }

  return (
    <header className="pointer-events-none sticky top-2 z-20 mb-3 sm:mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1" />

        <div className="pointer-events-auto ml-auto flex items-center gap-2 rounded-2xl border border-white/60 bg-white/80 px-2.5 py-2 shadow-sm sm:gap-3 sm:px-3 sm:py-2.5">
          {isAdmin ? (
            <div className="relative" ref={notificationPanelRef}>
              <button
                type="button"
                onClick={() => setIsNotificationOpen((current) => !current)}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 sm:h-11 sm:w-11"
                aria-label="Admin notifications"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5" aria-hidden="true">
                  <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
                  <path d="M10 17a2 2 0 0 0 4 0" />
                </svg>
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </button>

              {isNotificationOpen ? (
                <div className="absolute right-0 mt-2 w-[min(92vw,24rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_26px_50px_-30px_rgba(15,23,42,0.7)]">
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
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                          aria-label="Notification options"
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                            <circle cx="12" cy="5.5" r="1.8" />
                            <circle cx="12" cy="12" r="1.8" />
                            <circle cx="12" cy="18.5" r="1.8" />
                          </svg>
                        </button>

                        {isNotificationMenuOpen ? (
                          <div className="absolute right-0 z-10 mt-1 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                            <button
                              type="button"
                              onClick={startSelectionMode}
                              className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                              Select
                            </button>
                            <button
                              type="button"
                              onClick={selectAllNotifications}
                              className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                              Select all
                            </button>
                            <button
                              type="button"
                              onClick={deleteSelectedNotifications}
                              className="block w-full px-3 py-2 text-left text-xs font-medium text-rose-700 transition hover:bg-rose-50"
                            >
                              Delete selected
                            </button>
                          </div>
                        ) : null}
                      </div>
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

          <Link to="/profile" className="flex items-center gap-2 sm:gap-3">
            <p className="hidden max-w-[220px] truncate text-sm font-bold text-slate-900 sm:block sm:text-base">{profile?.name || 'User'}</p>
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
          <button
            type="button"
            onClick={onLogout}
            className="hidden rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-semibold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 sm:inline-flex sm:px-3 sm:text-xs"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  )
}

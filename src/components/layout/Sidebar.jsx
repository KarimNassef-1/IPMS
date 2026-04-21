import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import logomarkNoBg from '../../../img/no bg logos/logomarknobg.webp'

const navigationItems = [
  { label: 'Dashboard', to: '/', icon: 'dashboard' },
  { label: 'Projects', to: '/projects', icon: 'projects' },
  { label: 'Tasks', to: '/tasks', icon: 'tasks' },
  {
    label: 'Financials',
    to: '/financials',
    icon: 'financials',
    children: [
      { label: 'Expenses', to: '/expenses', icon: 'expenses' },
      { label: 'Budgets', to: '/budgets', icon: 'budgets' },
    ],
  },
  { label: 'Analytics', to: '/analytics', icon: 'analytics' },
  { label: 'Profile', to: '/profile', icon: 'profile' },
  { label: 'Team & Users', to: '/team-users', icon: 'teamUsers' },
]

function itemClassName(isActive, isSubmenu = false, isSidebarCollapsed = false) {
  const base = isSidebarCollapsed
    ? 'group flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors'
    : isSubmenu
      ? 'group flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors'
      : 'group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors'

  if (isSidebarCollapsed) {
    return isActive
      ? `${base} text-white`
      : `${base} text-[#8246f6] hover:bg-[#f0e9ff]`
  }

  return isActive
    ? `${base} bg-[#8246f6] text-white`
    : `${base} text-[#8246f6] hover:bg-[#f0e9ff]`
}

function labelClassName(isSidebarCollapsed, isActive) {
  return `overflow-hidden whitespace-nowrap transition-all duration-300 ${isActive ? 'text-white' : 'text-[#8246f6]'} ${isSidebarCollapsed ? 'max-w-0 opacity-0' : 'max-w-[11rem] opacity-100'}`
}

function isItemActive(item, pathname) {
  if (pathname === item.to) return true
  if (!item.children?.length) return false
  return item.children.some((child) => pathname === child.to)
}

function filterNavigationByRole(items, isAdmin) {
  return items
    .filter((item) => !item.adminOnly || isAdmin)
    .map((item) => ({
      ...item,
      children: item.children
        ? item.children.filter((child) => !child.adminOnly || isAdmin)
        : undefined,
    }))
}

function NavIcon({ name, isActive }) {
  const iconClass = `h-5 w-5 shrink-0 transition-colors duration-200 ${isActive ? 'text-white' : 'text-[#8246f6]'}`

  switch (name) {
    case 'dashboard':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
          <path d="M3 13.5L12 4l9 9.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6.5 11.5V20h11v-8.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'projects':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
          <rect x="3" y="6" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.9" />
          <path d="M3 10h18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M8 4.5h8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      )
    case 'tasks':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.9" />
          <path d="M8 12l2.4 2.4L16 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'daily':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
          <rect x="4" y="5" width="16" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.9" />
          <path d="M8 3.5v3M16 3.5v3M4 9h16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <circle cx="12" cy="14" r="2" stroke="currentColor" strokeWidth="1.9" />
        </svg>
      )
    case 'financials':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
          <path d="M4 18h16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M7 18v-6M12 18V8M17 18v-9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M7 10l5-3 5 2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'expenses':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
          <rect x="3" y="6" width="18" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.9" />
          <path d="M3 10h18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M8 14h4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      )
    case 'budgets':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.9" />
          <path d="M12 7v10M9 10.2c0-1.3 1.2-2.2 3-2.2s3 .9 3 2.2-1.2 2.2-3 2.2-3 .9-3 2.2S10.2 17 12 17s3-.9 3-2.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'analytics':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
          <path d="M4 18h16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M6 16l4-4 3 2 5-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="6" cy="16" r="1" fill="currentColor" />
          <circle cx="10" cy="12" r="1" fill="currentColor" />
          <circle cx="13" cy="14" r="1" fill="currentColor" />
          <circle cx="18" cy="8" r="1" fill="currentColor" />
        </svg>
      )
    case 'profile':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
          <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.9" />
          <path d="M5 19c0-3.2 3.1-5.5 7-5.5s7 2.3 7 5.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      )
    case 'teamUsers':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
          <circle cx="9" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.9" />
          <circle cx="16" cy="9" r="2" stroke="currentColor" strokeWidth="1.9" />
          <path d="M4.5 18c0-2.7 2.2-4.6 4.9-4.6s4.9 1.9 4.9 4.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M14.5 18c.2-1.7 1.5-3 3.1-3 1.9 0 2.9 1.4 2.9 3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
          <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.9" />
        </svg>
      )
  }
}

export default function Sidebar({ mobileMenuOpen, setMobileMenuOpen }) {
  const { isAdmin, hasAccess, logout } = useAuth()
  const { pathname } = useLocation()
  const [openMenus, setOpenMenus] = useState({ financials: true })
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [tooltip, setTooltip] = useState(null)

  async function handleMobileLogout() {
    try {
      await logout()
      setMobileMenuOpen(false)
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  const filteredItems = filterNavigationByRole(navigationItems, isAdmin).filter((item) => {
    const permissionByRoute = {
      '/': 'dashboard',
      '/projects': 'projects',
      '/tasks': 'tasks',
      '/financials': 'financials',
      '/expenses': 'expenses',
      '/budgets': 'budgets',
      '/analytics': 'analytics',
      '/profile': 'profile',
      '/team-users': 'teamUsers',
    }

    const topLevelPermission = permissionByRoute[item.to]
    const canSeeTopLevel = topLevelPermission ? hasAccess(topLevelPermission) : true

    if (!item.children?.length) return canSeeTopLevel

    const children = item.children.filter((child) => {
      const childPermission = permissionByRoute[child.to]
      return childPermission ? hasAccess(childPermission) : true
    })

    item.children = children
    return canSeeTopLevel || children.length > 0
  })

  useEffect(() => {
    if (pathname === '/financials' || pathname === '/expenses' || pathname === '/budgets') {
      setOpenMenus((current) => ({ ...current, financials: true }))
    }
  }, [pathname])

  function toggleMenu(key) {
    setOpenMenus((current) => ({ ...current, [key]: !current[key] }))
  }

  function showTooltip(event, label) {
    if (!isSidebarCollapsed) return

    const rect = event.currentTarget.getBoundingClientRect()
    setTooltip({
      label,
      left: rect.right + 12,
      top: rect.top + rect.height / 2,
    })
  }

  function hideTooltip() {
    setTooltip(null)
  }

  return (
    <>
      <aside
        className={`relative hidden shrink-0 rounded-3xl bg-transparent p-4 transition-all duration-300 lg:sticky lg:top-2 lg:block lg:h-[calc(100vh-1rem)] ${isSidebarCollapsed ? 'w-24' : 'w-64'}`}
      >
        <button
          type="button"
          onClick={() => setIsSidebarCollapsed((current) => !current)}
          aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute -right-3 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl bg-transparent text-[#6f39e7] transition hover:bg-[#f0e9ff]"
        >
          <svg
            viewBox="0 0 20 20"
            className={`h-4 w-4 transition-transform ${isSidebarCollapsed ? 'rotate-180' : ''}`}
            fill="none"
            aria-hidden="true"
          >
            <path d="M12.5 4.5L7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="mb-4 flex h-28 shrink-0 flex-col border-b border-slate-200/70 pb-4">
          {isSidebarCollapsed ? (
            <img src={logomarkNoBg} alt="Infinite Pixels logomark" className="mx-auto h-16 w-auto max-w-full" />
          ) : (
            <img src="/ip-badge.png" alt="Infinite Pixels badge" className="w-52 h-auto max-w-full object-contain" />
          )}
          <p className={`mt-3 text-xs font-medium uppercase tracking-[0.2em] text-slate-500 ${isSidebarCollapsed ? 'invisible' : ''}`}>
            Agency OS
          </p>
        </div>

        <nav className={`ip-sidebar-scroll h-[calc(100%-6.75rem)] space-y-2 overflow-y-auto ${isSidebarCollapsed ? 'pr-0' : 'pr-1'}`}>
          {filteredItems.map((item) => (
            <div key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => itemClassName(isActive || isItemActive(item, pathname), false, isSidebarCollapsed)}
              >
                {({ isActive }) => {
                  const active = isActive || isItemActive(item, pathname)
                  return (
                    <>
                      <span
                        className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${isSidebarCollapsed && active ? 'bg-[#8246f6]' : ''}`}
                        onMouseEnter={(event) => showTooltip(event, item.label)}
                        onMouseLeave={hideTooltip}
                      >
                        <NavIcon name={item.icon} isActive={active} />
                      </span>
                      <span className={labelClassName(isSidebarCollapsed, active)}>{item.label}</span>
                      {item.children?.length && !isSidebarCollapsed ? (
                        <button
                          type="button"
                          aria-label={openMenus[item.icon] ? `Collapse ${item.label}` : `Expand ${item.label}`}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            toggleMenu(item.icon)
                          }}
                          className={`ml-auto flex h-6 w-6 items-center justify-center ${active ? 'text-white' : 'text-[#8246f6] hover:text-[#6f39e7]'}`}
                        >
                          <svg
                            viewBox="0 0 20 20"
                            className={`h-3.5 w-3.5 transition-transform ${openMenus[item.icon] ? 'rotate-180' : ''}`}
                            fill="none"
                            aria-hidden="true"
                          >
                            <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      ) : null}
                    </>
                  )
                }}
              </NavLink>

              {item.children?.length && !isSidebarCollapsed ? (
                <div
                  className={`ml-4 overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-out ${
                    openMenus[item.icon] ? 'mt-1 max-h-40 opacity-100' : 'mt-0 max-h-0 opacity-0'
                  }`}
                >
                  <div className="space-y-1 border-l border-[#8246f6]/20 pl-2 pb-0.5">
                    {item.children.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        end
                        className={({ isActive }) => itemClassName(isActive, true)}
                      >
                        {({ isActive }) => (
                          <>
                            <span className="flex h-7 w-7 items-center justify-center">
                              <NavIcon name={child.icon} isActive={isActive} />
                            </span>
                            <span className={isActive ? 'text-white' : 'text-[#8246f6]'}>{child.label}</span>
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </nav>
      </aside>

      {mobileMenuOpen ? (
        <div
          className="fixed inset-0 z-40 bg-slate-900/52 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <button
        type="button"
        onClick={() => setMobileMenuOpen(true)}
        aria-label="Open menu"
        className={`fixed left-0 top-1/2 z-40 -translate-y-1/2 rounded-r-xl border border-l-0 border-white/60 bg-white/78 p-2.5 text-[#6f39e7] shadow-lg shadow-[#6f39e7]/15 backdrop-blur-xl transition duration-200 hover:bg-white lg:hidden ${mobileMenuOpen ? 'pointer-events-none -translate-x-full opacity-0' : 'translate-x-0 opacity-100'}`}
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
          <path d="M7 4.5L12.5 10L7 15.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <aside
        className={`fixed left-0 top-0 z-50 flex h-full w-[min(88vw,20rem)] flex-col border-r border-white/45 bg-white/68 p-4 shadow-2xl shadow-[#6f39e7]/20 backdrop-blur-2xl transition-transform duration-300 lg:hidden ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="mb-3 flex shrink-0 items-center justify-between border-b border-white/65 pb-3">
          <img src="/ip-badge.png" alt="Infinite Pixels badge" className="w-44 h-auto max-w-[220px] object-contain" />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-white/60"
          >
            Close
          </button>
        </div>

        <nav className="ip-sidebar-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {filteredItems.map((item) => (
            <div key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => itemClassName(isActive || isItemActive(item, pathname))}
                onClick={() => setMobileMenuOpen(false)}
              >
                {({ isActive }) => {
                  const active = isActive || isItemActive(item, pathname)
                  return (
                    <>
                      <span className="flex h-8 w-8 items-center justify-center">
                        <NavIcon name={item.icon} isActive={active} />
                      </span>
                      <span>{item.label}</span>
                      {item.children?.length ? (
                        <button
                          type="button"
                          aria-label={openMenus[item.icon] ? `Collapse ${item.label}` : `Expand ${item.label}`}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            toggleMenu(item.icon)
                          }}
                          className="ml-auto flex h-6 w-6 items-center justify-center text-[#8246f6] hover:text-[#6f39e7]"
                        >
                          <svg
                            viewBox="0 0 20 20"
                            className={`h-3.5 w-3.5 transition-transform ${openMenus[item.icon] ? 'rotate-180' : ''}`}
                            fill="none"
                            aria-hidden="true"
                          >
                            <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      ) : null}
                    </>
                  )
                }}
              </NavLink>

              {item.children?.length ? (
                <div
                  className={`ml-4 overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-out ${
                    openMenus[item.icon] ? 'mt-1 max-h-40 opacity-100' : 'mt-0 max-h-0 opacity-0'
                  }`}
                >
                  <div className="space-y-1 border-l border-[#8246f6]/20 pl-2 pb-0.5">
                    {item.children.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        end
                        className={({ isActive }) => itemClassName(isActive, true)}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {({ isActive }) => (
                          <>
                            <span className="flex h-7 w-7 items-center justify-center">
                              <NavIcon name={child.icon} isActive={isActive} />
                            </span>
                            <span>{child.label}</span>
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </nav>

        <div className="mt-3 shrink-0 border-t border-white/65 pt-3">
          <button
            type="button"
            onClick={handleMobileLogout}
            className="w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
          >
            Log out
          </button>
        </div>
      </aside>

      {tooltip ? (
        <div
          className="pointer-events-none fixed z-[120] -translate-y-1/2 whitespace-nowrap rounded-lg border border-[#8246f6]/20 bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-[#6f39e7] shadow-lg shadow-[#8246f6]/10"
          style={{ left: `${tooltip.left}px`, top: `${tooltip.top}px` }}
        >
          {tooltip.label}
        </div>
      ) : null}
    </>
  )
}

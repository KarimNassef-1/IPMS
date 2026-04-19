import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_20%,_#efe4ff_0%,_#f2ebff_33%,_#ecf4ff_66%,_#f8fafc_100%)] pb-3 pr-3 pt-3 sm:pb-5 sm:pr-5 sm:pt-5">
      <div className="flex w-full gap-4 lg:h-[calc(100vh-2.5rem)] lg:gap-6">
        <Sidebar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />

        <main className="min-w-0 flex-1 lg:h-full lg:overflow-y-auto lg:pr-1">
          <Topbar onOpenMenu={() => setMobileMenuOpen(true)} />
          <Outlet />
        </main>
      </div>
    </div>
  )
}

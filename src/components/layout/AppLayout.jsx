import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_8%_8%,_#f1e8ff_0%,_#eef5ff_40%,_#f8fafc_100%)] px-2 pb-4 pt-3 sm:px-4 sm:pb-6 sm:pt-5 lg:px-5 lg:pb-5 lg:pt-5">
      <div className="mx-auto flex w-full max-w-[1700px] gap-3 sm:gap-4 lg:h-[calc(100vh-2.5rem)] lg:gap-6">
        <Sidebar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />

        <main className="min-w-0 flex-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:h-full lg:overflow-y-auto lg:pr-1">
          <Topbar />
          <Outlet />
        </main>
      </div>
    </div>
  )
}

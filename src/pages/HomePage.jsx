import DashboardPage from './DashboardPage'
import ClientPortalPage from './ClientPortalPage'
import OutsourceDashboardPage from './OutsourceDashboardPage'
import { useAuth } from '../hooks/useAuth'

export default function HomePage() {
  const { role } = useAuth()

  if (role === 'outsource') {
    return <OutsourceDashboardPage />
  }

  if (role === 'client') {
    return <ClientPortalPage />
  }

  return <DashboardPage />
}

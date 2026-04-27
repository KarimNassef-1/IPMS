import DashboardPage from './DashboardPage'
import OutsourceDashboardPage from './OutsourceDashboardPage'
import { useAuth } from '../hooks/useAuth'

export default function HomePage() {
  const { role } = useAuth()

  if (role === 'outsource') {
    return <OutsourceDashboardPage />
  }

  return <DashboardPage />
}

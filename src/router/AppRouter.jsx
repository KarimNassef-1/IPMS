import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import { PermissionRoute, ProtectedRoute } from '../components/guards/ProtectedRoute'
import LoginPage from '../pages/LoginPage'
import HomePage from '../pages/HomePage'
import ClientPortalPage from '../pages/ClientPortalPage'
import ProjectsPage from '../pages/ProjectsPage'
import OutsourcePortalPage from '../pages/OutsourcePortalPage'
import TasksPage from '../pages/TasksPage'
import FinancialsPage from '../pages/FinancialsPage'
import ExpensesPage from '../pages/ExpensesPage'
import BudgetsPage from '../pages/BudgetsPage'
import AnalyticsPage from '../pages/AnalyticsPage'
import ProfilePage from '../pages/ProfilePage'
import TeamUsersPage from '../pages/TeamUsersPage'
import ClientPortalAccessPage from '../pages/client/ClientPortalAccessPage'
import UnauthorizedPage from '../pages/UnauthorizedPage'
import NotFoundPage from '../pages/NotFoundPage'

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route path="/client-access" element={<ClientPortalAccessPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route element={<PermissionRoute permission="dashboard" />}>
            <Route index element={<HomePage />} />
          </Route>
          <Route element={<PermissionRoute permission="projects" />}>
            <Route path="projects" element={<ProjectsPage />} />
          </Route>
          <Route element={<PermissionRoute permission="clientPortal" />}>
            <Route path="client-portal" element={<ClientPortalPage />} />
          </Route>
          <Route element={<PermissionRoute permission="outsourcePortal" />}>
            <Route path="outsource" element={<OutsourcePortalPage />} />
          </Route>
          <Route element={<PermissionRoute permission="tasks" />}>
            <Route path="tasks" element={<TasksPage />} />
          </Route>
          <Route path="daily-tasks" element={<Navigate to="/tasks" replace />} />
          <Route element={<PermissionRoute permission="financials" />}>
            <Route path="financials" element={<FinancialsPage />} />
          </Route>
          <Route element={<PermissionRoute permission="expenses" />}>
            <Route path="expenses" element={<ExpensesPage />} />
          </Route>
          <Route element={<PermissionRoute permission="budgets" />}>
            <Route path="budgets" element={<BudgetsPage />} />
          </Route>
          <Route element={<PermissionRoute permission="analytics" />}>
            <Route path="analytics" element={<AnalyticsPage />} />
          </Route>
          <Route element={<PermissionRoute permission="profile" />}>
            <Route path="profile" element={<ProfilePage />} />
          </Route>
          <Route element={<PermissionRoute permission="teamUsers" />}>
            <Route path="team-users" element={<TeamUsersPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

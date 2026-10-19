import { lazy } from 'react'
import { permissions } from './permissions'
import {
  HashRouter,
  Route,
  Routes,
  Navigate,
  useLocation,
  Outlet,
} from 'react-router-dom'
import { useSession } from './session-context'
import { AppShell } from '../components/app-shell'
import { LoginPage } from '../pages/login-page'

const TemplatesPage = lazy(() =>
  import('../pages/templates-page').then((m) => ({ default: m.TemplatesPage })),
)
const EntityDetailPage = lazy(() =>
  import('../pages/entity-detail-page').then((m) => ({ default: m.EntityDetailPage })),
)
const OverviewPage = lazy(() =>
  import('../pages/overview-page').then((m) => ({ default: m.OverviewPage })),
)
const TenantsPage = lazy(() =>
  import('../pages/tenants-page').then((m) => ({ default: m.TenantsPage })),
)
const CustomersPage = lazy(() =>
  import('../pages/customers-page').then((m) => ({ default: m.CustomersPage })),
)
const ConnectionsPage = lazy(() =>
  import('../pages/connections-page').then((m) => ({ default: m.ConnectionsPage })),
)
const ApiKeysPage = lazy(() =>
  import('../pages/api-keys-page').then((m) => ({ default: m.ApiKeysPage })),
)
const InboxPage = lazy(() =>
  import('../pages/inbox-page').then((m) => ({ default: m.InboxPage })),
)
const WebhooksPage = lazy(() =>
  import('../pages/webhooks-page').then((m) => ({ default: m.WebhooksPage })),
)
const EventsPage = lazy(() =>
  import('../pages/events-page').then((m) => ({ default: m.EventsPage })),
)
const UsersPage = lazy(() =>
  import('../pages/users-page').then((m) => ({ default: m.UsersPage })),
)
const SettingsPage = lazy(() =>
  import('../pages/settings-page').then((m) => ({ default: m.SettingsPage })),
)
export function App() {
  const { session } = useSession()
  if (!session) return <LoginPage />
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route element={<PermissionGuard />}>
            <Route index element={<OverviewPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="tenants" element={<TenantsPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="customers/:id" element={<EntityDetailPage kind="customers" />} />
            <Route
              path="connections/:id"
              element={<EntityDetailPage kind="connections" />}
            />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="connections" element={<ConnectionsPage />} />
            <Route path="api-keys" element={<ApiKeysPage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="webhooks" element={<WebhooksPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </HashRouter>
  )
}

function PermissionGuard() {
  const { session } = useSession()
  const location = useLocation()
  return permissions(session).canVisit(location.pathname) ? (
    <Outlet />
  ) : (
    <Navigate to="/" replace />
  )
}

import { useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../app/session-context'
import { ProfileDialog } from './profile-dialog'

export function ProfileRouteDialog() {
  const { session } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const query = new URLSearchParams(location.search)
  const tab = query.get('profile')

  if (!session?.user || (tab !== 'security' && tab !== 'profile')) return null

  return (
    <ProfileDialog
      key={tab}
      initialTab={tab}
      onClose={() => {
        query.delete('profile')
        navigate(
          { pathname: location.pathname, search: query.toString() },
          { replace: true },
        )
      }}
    />
  )
}

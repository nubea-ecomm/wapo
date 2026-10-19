import { UserAvatar } from './user-avatar'
import { ThemeToggle } from './theme-toggle'
import { ChevronDown, LogOut, Shuffle, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useSession } from '../app/session-context'
import { useI18n } from '../app/i18n'
import { ProfileDialog } from './profile-dialog'
import { nextAvatarVariant } from '../lib/avatar'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

export function AccountMenu() {
  const { session, disconnect, updateProfile } = useSession()
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState(false)

  async function regenerateAvatar() {
    const user = session?.user
    if (!user || avatarBusy) return
    setAvatarBusy(true)
    setAvatarError(false)
    try {
      await updateProfile({
        avatar_variant: nextAvatarVariant(user.id, user.avatar_variant),
      })
    } catch {
      setAvatarError(true)
    } finally {
      setAvatarBusy(false)
    }
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="account-trigger"
            aria-label={t('userMenu')}
          >
            <UserAvatar
              id={session?.user?.id || 'operator'}
              name={session?.user?.name || t('administrator')}
              variant={session?.user?.avatar_variant}
              className="size-7"
            />
            <span className="account-name min-w-0 flex-1 truncate text-left">
              {session?.user?.name || t('administrator')}
            </span>
            <ChevronDown className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56"
        >
          <DropdownMenuLabel className="truncate">
            {session?.user?.email || t('apiAccess')}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {session?.user && (
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <UserRound />
              {t('editProfile')}
            </DropdownMenuItem>
          )}
          {session?.user && (
            <DropdownMenuItem
              disabled={avatarBusy}
              onSelect={(event) => {
                event.preventDefault()
                void regenerateAvatar()
              }}
            >
              <Shuffle />
              {t('anotherAvatar')}
            </DropdownMenuItem>
          )}
          {avatarError && (
            <DropdownMenuLabel
              role="alert"
              className="text-destructive"
            >
              {t('profileError')}
            </DropdownMenuLabel>
          )}
          <ThemeToggle />
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={disconnect}>
            <LogOut />
            {t('signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editing && <ProfileDialog onClose={() => setEditing(false)} />}
    </>
  )
}

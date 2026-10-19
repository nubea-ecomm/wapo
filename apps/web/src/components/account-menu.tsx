import { UserAvatar } from './user-avatar'
import { regenerateAvatar } from '../lib/avatar'
import { ThemeToggle } from './theme-toggle'
import { ChevronDown, LogOut, Shuffle } from 'lucide-react'
import { useSession } from '../app/session-context'
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
  const { session, disconnect } = useSession()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="account-trigger" aria-label="Menú de usuario">
          <UserAvatar
            id={session?.user?.id || 'operator'}
            name={session?.user?.name || 'Administrador'}
            className="size-7"
          />
          <span className="account-name min-w-0 flex-1 truncate text-left">
            {session?.user?.name || 'Administrador'}
          </span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">
          {session?.user?.email || 'Acceso con API key'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            regenerateAvatar(session?.user?.id || 'operator')
          }}
        >
          <Shuffle />
          Generar otro avatar
        </DropdownMenuItem>
        <ThemeToggle />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={disconnect}>
          <LogOut />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

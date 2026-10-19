import { TenantPicker } from './tenant-picker'
import { BookOpen, Search } from 'lucide-react'
import { useSession } from '../app/session-context'
import { WorkspaceNavigation } from './workspace-navigation'
import { Button } from './ui/button'
export function WorkspaceSidebar({
  onSearch,
  onNavigate,
}: {
  onSearch: () => void
  onNavigate: () => void
}) {
  const { session } = useSession()
  return (
    <>
      <a className="brand" href="#/">
        wapo<span className="brand-tag">console</span>
      </a>
      <TenantPicker />
      <Button variant="outline" className="navigation-search-trigger" onClick={onSearch}>
        <Search />
        <span>Buscar…</span>
        <kbd>⌘K</kbd>
      </Button>
      <WorkspaceNavigation onNavigate={onNavigate} />
      <div className="sidebar-bottom">
        <Button variant="ghost" asChild className="justify-start text-muted-foreground">
          <a href={`${session?.url}/docs`} target="_blank" rel="noreferrer">
            <BookOpen /> Documentación
          </a>
        </Button>
      </div>
    </>
  )
}

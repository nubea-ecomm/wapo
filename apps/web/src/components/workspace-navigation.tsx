import { m } from 'motion/react'
import { useId } from 'react'
import { permissions } from '../app/permissions'
import { NavLink } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { navigation, navigationGroups } from '../app/navigation'
import { useSession } from '../app/session-context'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
export function WorkspaceNavigation({ onNavigate }: { onNavigate: () => void }) {
  const layoutId = useId()
  const { session } = useSession()
  const visible = navigation.filter((item) => permissions(session).canVisit(item.to))
  function links(group: string) {
    return visible
      .filter((item) => item.group === group)
      .map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={onNavigate}>
          {({ isActive }) => (
            <>
              {isActive && (
                <m.span
                  className="nav-active-surface"
                  aria-hidden="true"
                  layoutId={layoutId}
                  transition={{ type: 'spring', stiffness: 460, damping: 40 }}
                />
              )}
              <item.icon size={16} strokeWidth={1.7} />
              <span className="nav-item-label">{item.label}</span>
            </>
          )}
        </NavLink>
      ))
  }
  return (
    <nav className="workspace-nav" aria-label="Navegación principal">
      <div className="nav-group">{links('Principal')}</div>
      <Separator />
      {navigationGroups.map((group) => (
        <Collapsible key={group.label} defaultOpen className="nav-section">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="nav-section-trigger group">
              <group.icon />
              <span>{group.label}</span>
              <ChevronRight className="ml-auto transition-transform group-data-[state=open]:rotate-90" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="nav-group nav-children">{links(group.label)}</div>
          </CollapsibleContent>
        </Collapsible>
      ))}
    </nav>
  )
}

import { m } from 'motion/react'
import { useId } from 'react'
import { permissions } from '../app/permissions'
import { NavLink } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { navigation, navigationGroups, navigationLabel } from '../app/navigation'
import { useSession } from '../app/session-context'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible'
import { Button } from './ui/button'
import { useI18n } from '../app/i18n'
import { Separator } from './ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
export function WorkspaceNavigation({
  onNavigate,
  collapsed = false,
}: {
  onNavigate: () => void
  collapsed?: boolean
}) {
  const layoutId = useId()
  const { session } = useSession()
  const { t } = useI18n()
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
              <span className="nav-item-label">{navigationLabel(item, t)}</span>
            </>
          )}
        </NavLink>
      ))
  }
  if (collapsed)
    return (
      <nav className="workspace-nav collapsed-nav" aria-label="Navegación principal">
        <div className="nav-group">
          {visible.map((item) => (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>
                <NavLink to={item.to} end={item.to === '/'} onClick={onNavigate}>
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="nav-active-surface" aria-hidden="true" />
                      )}
                      <item.icon size={17} strokeWidth={1.7} />
                      <span className="sr-only">{navigationLabel(item, t)}</span>
                    </>
                  )}
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right">{navigationLabel(item, t)}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </nav>
    )
  return (
    <nav className="workspace-nav" aria-label={t('primaryNavigation')}>
      <div className="nav-group">{links('main')}</div>
      <Separator />
      {navigationGroups.map((group) => (
        <Collapsible key={group.key} defaultOpen className="nav-section">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="nav-section-trigger group">
              <group.icon />
              <span>{t(group.key)}</span>
              <ChevronRight className="ml-auto transition-transform group-data-[state=open]:rotate-90" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="nav-group nav-children">{links(group.key)}</div>
          </CollapsibleContent>
        </Collapsible>
      ))}
    </nav>
  )
}

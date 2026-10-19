import { TenantPicker } from './tenant-picker'
import { BookOpen, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import { useSession } from '../app/session-context'
import { useI18n } from '../app/i18n'
import { WorkspaceNavigation } from './workspace-navigation'
import { Button } from './ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip'
import { WapoLogo } from './wapo-logo'
export function WorkspaceSidebar({
  onSearch,
  onNavigate,
  collapsed = false,
  onCollapsedChange,
}: {
  onSearch: () => void
  onNavigate: () => void
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}) {
  const { session } = useSession()
  const { t } = useI18n()
  const collapseLabel = collapsed
    ? t('expandNavigation')
    : t('collapseNavigation')
  return (
    <TooltipProvider delayDuration={250}>
      <div className="sidebar-brand-row">
        <a
          className="brand"
          href="#/"
          aria-label="Wapo console"
        >
          <WapoLogo className="brand-full" />
          <WapoLogo
            compact
            className="brand-compact"
          />
        </a>
        {onCollapsedChange && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="sidebar-collapse-trigger"
                onClick={() => onCollapsedChange(!collapsed)}
                aria-label={collapseLabel}
              >
                {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapseLabel}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <TenantPicker />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            className="navigation-search-trigger"
            onClick={onSearch}
          >
            <Search />
            <span>{t('search')}</span>
            <kbd>⌘K</kbd>
          </Button>
        </TooltipTrigger>
        {collapsed && (
          <TooltipContent side="right">{t('search')}</TooltipContent>
        )}
      </Tooltip>
      <WorkspaceNavigation
        onNavigate={onNavigate}
        collapsed={collapsed}
      />
      <div className="sidebar-bottom">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              asChild
              className="sidebar-docs text-muted-foreground"
            >
              <a
                href={`${session?.url}/docs`}
                target="_blank"
                rel="noreferrer"
              >
                <BookOpen /> <span>{t('documentation')}</span>
              </a>
            </Button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right">{t('documentation')}</TooltipContent>
          )}
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}

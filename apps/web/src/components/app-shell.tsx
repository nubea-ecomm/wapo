import { PageTransition } from './motion/page-transition'
import { Suspense, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { useSession } from '../app/session-context'
import { navigation } from '../app/navigation'
import { Button } from './ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from './ui/sheet'
import { WorkspaceSidebar } from './workspace-sidebar'
import { AccountMenu } from './account-menu'
import { NavigationSearch } from './navigation-search'
import { RouteSkeleton } from './content-skeleton'
export function AppShell() {
  const { session } = useSession()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const location = useLocation()
  const current = navigation.find(
    (item) =>
      item.to === location.pathname ||
      (item.to !== '/' && location.pathname.startsWith(item.to + '/')),
  )

  return (
    <div className="app-shell">
      <NavigationSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onNavigate={() => setMobileOpen(false)}
      />
      <aside className="sidebar hidden md:flex">
        <WorkspaceSidebar
          onSearch={() => setSearchOpen(true)}
          onNavigate={() => setMobileOpen(false)}
        />
      </aside>
      <main className="main">
        <header className="workspace-header">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="md:hidden"
                aria-label="Abrir navegación"
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 gap-0 bg-background p-3">
              <SheetTitle className="sr-only">Navegación</SheetTitle>
              <WorkspaceSidebar
                onSearch={() => setSearchOpen(true)}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>
          <span className="text-muted-foreground">{session?.tenantName || 'Wapo'}</span>
          <span className="text-border">/</span>
          <span>{current?.label || 'Workspace'}</span>
          <AccountMenu />
        </header>
        <div className="page-content" key={session?.id}>
          <PageTransition key={location.pathname}>
            <Suspense fallback={<RouteSkeleton path={location.pathname} />}>
              <Outlet />
            </Suspense>
          </PageTransition>
        </div>
      </main>
    </div>
  )
}

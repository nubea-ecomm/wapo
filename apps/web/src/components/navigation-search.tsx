import { permissions } from '../app/permissions'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { navigation } from '../app/navigation'
import { useSession } from '../app/session-context'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Button } from './ui/button'
export function NavigationSearch({
  open,
  onOpenChange,
  onNavigate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: () => void
}) {
  const { session } = useSession()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [open, onOpenChange])
  const results = navigation.filter(
    (item) =>
      permissions(session).canVisit(item.to) &&
      `${item.label} ${item.group}`.toLowerCase().includes(query.toLowerCase()),
  )
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value)
        if (!value) setQuery('')
      }}
    >
      <DialogContent aria-describedby={undefined} className="gap-3 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buscar en Wapo</DialogTitle>
        </DialogHeader>
        <Input
          aria-label="Buscar pantalla"
          placeholder="Chats, customers, API keys…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="grid max-h-80 gap-1 overflow-y-auto">
          {results.map((item) => (
            <Button
              key={item.to}
              variant="ghost"
              className="justify-start"
              onClick={() => {
                navigate(item.to)
                onOpenChange(false)
                setQuery('')
                onNavigate()
              }}
            >
              <item.icon />
              <span>{item.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">{item.group}</span>
            </Button>
          ))}
          {!results.length && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin resultados.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

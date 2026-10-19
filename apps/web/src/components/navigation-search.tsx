import { permissions } from '../app/permissions'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { navigation, navigationLabel } from '../app/navigation'
import { useSession } from '../app/session-context'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { useI18n } from '../app/i18n'

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
  const { t } = useI18n()
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
      `${navigationLabel(item, t)} ${t(item.group)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value)

        if (!value) setQuery('')
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="gap-3 sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>{t('searchWapo')}</DialogTitle>
        </DialogHeader>
        <Input
          aria-label={t('searchScreen')}
          placeholder={t('searchPlaceholder')}
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
              <span>{navigationLabel(item, t)}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {t(item.group)}
              </span>
            </Button>
          ))}
          {!results.length && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('noResults')}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

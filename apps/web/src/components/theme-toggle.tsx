import { Moon } from 'lucide-react'
import { Switch } from 'radix-ui'
import { useI18n } from '../app/i18n'
import { useTheme } from '../app/theme-context'

export function ThemeToggle() {
  const { t } = useI18n()
  const { dark, setTheme } = useTheme()

  return (
    <div className="flex items-center gap-2 px-2 py-2 text-sm">
      <Moon className="size-4 text-muted-foreground" />
      <label
        htmlFor="theme-toggle"
        className="flex-1 cursor-pointer"
      >
        {t('darkTheme')}
      </label>
      <Switch.Root
        id="theme-toggle"
        checked={dark}
        onCheckedChange={(checked) => {
          setTheme(checked ? 'dark' : 'light')
        }}
        className="inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-input p-0.5 transition-colors data-[state=checked]:bg-primary focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Switch.Thumb className="block size-4 rounded-full bg-background shadow-sm transition-transform data-[state=checked]:translate-x-4" />
      </Switch.Root>
    </div>
  )
}

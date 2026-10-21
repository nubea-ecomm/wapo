import { useState } from 'react'
import { Globe, Monitor, Moon, Sun } from 'lucide-react'
import { useI18n, type Language } from '../app/i18n'
import { useTheme } from '../app/theme-context'
import type { ThemePreference } from '../app/browser-preferences'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { ErrorNotice } from './ui'

export function AuthPreferences() {
  const { t, language, setLanguage } = useI18n()
  const { theme, setTheme } = useTheme()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const ThemeIcon = theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun

  return (
    <div
      className="auth-preferences"
      role="group"
      aria-label={t('preferences.title')}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="auth-preference-trigger"
            aria-label={t('preferences.theme')}
            title={t('preferences.theme')}
          >
            <ThemeIcon aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-40"
        >
          <DropdownMenuLabel>{t('preferences.theme')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(value) => setTheme(value as ThemePreference)}
          >
            <DropdownMenuRadioItem value="system">
              <Monitor />
              {t('preferences.system')}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light">
              <Sun />
              {t('preferences.light')}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon />
              {t('preferences.dark')}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="auth-preference-trigger"
            aria-label={t('language')}
            title={t('language')}
            disabled={busy}
          >
            <Globe aria-hidden="true" />
            <span>{language.toUpperCase()}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-40"
        >
          <DropdownMenuLabel>{t('language')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={language}
            onValueChange={(value) => {
              setBusy(true)
              setError(null)
              void setLanguage(value as Language)
                .catch(setError)
                .finally(() => setBusy(false))
            }}
          >
            <DropdownMenuRadioItem value="es">Español</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="pt">Português</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {error != null && (
        <div className="auth-preference-error">
          <ErrorNotice error={error} />
        </div>
      )}
    </div>
  )
}

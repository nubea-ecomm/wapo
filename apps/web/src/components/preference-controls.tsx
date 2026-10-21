import { useState } from 'react'
import { useI18n, type Language } from '../app/i18n'
import { useTheme } from '../app/theme-context'
import type { ThemePreference } from '../app/browser-preferences'
import { ErrorNotice, Field } from './ui'
import { NativeSelect } from './ui/native-select'

export function PreferenceControls() {
  const { language, setLanguage, t } = useI18n()
  const { theme, setTheme } = useTheme()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  return (
    <div className="preference-controls">
      <Field label={t('preferences.theme')}>
        <NativeSelect
          value={theme}
          onChange={(event) => setTheme(event.target.value as ThemePreference)}
        >
          <option value="system">{t('preferences.system')}</option>
          <option value="light">{t('preferences.light')}</option>
          <option value="dark">{t('preferences.dark')}</option>
        </NativeSelect>
      </Field>
      <Field label={t('language')}>
        <NativeSelect
          value={language}
          disabled={busy}
          onChange={(event) => {
            setBusy(true)
            setError(null)
            void setLanguage(event.target.value as Language)
              .catch(setError)
              .finally(() => setBusy(false))
          }}
        >
          <option value="es">Español</option>
          <option value="en">English</option>
          <option value="pt">Português</option>
        </NativeSelect>
      </Field>
      {error != null && (
        <div className="col-span-full">
          <ErrorNotice error={error} />
        </div>
      )}
    </div>
  )
}

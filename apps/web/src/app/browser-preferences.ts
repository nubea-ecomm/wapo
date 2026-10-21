import type { Language } from './i18n'

export type ThemePreference = 'system' | 'light' | 'dark'

export function storedPreference(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* Preferences still work for this page. */
  }
}

export function supportedLanguage(
  value: string | null | undefined,
): Language | null {
  const base = value?.toLowerCase().split(/[-_]/)[0]

  return base === 'es' || base === 'en' || base === 'pt' ? base : null
}

export function browserLanguage(): Language {
  for (const value of navigator.languages?.length
    ? navigator.languages
    : [navigator.language]) {
    const language = supportedLanguage(value)

    if (language) return language
  }

  return 'en'
}

export function themePreference(): ThemePreference {
  const value = storedPreference('wapo-theme')

  return value === 'light' || value === 'dark' ? value : 'system'
}

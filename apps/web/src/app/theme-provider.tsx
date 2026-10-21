import { useEffect, useState, type ReactNode } from 'react'
import { ThemeContext } from './theme-context'
import {
  savePreference,
  themePreference,
  type ThemePreference,
} from './browser-preferences'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setPreference] = useState(themePreference)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )
  const dark = theme === 'system' ? systemDark : theme === 'dark'

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const changed = () => setSystemDark(media?.matches ?? false)

    media?.addEventListener('change', changed)
    const storage = () => setPreference(themePreference())

    window.addEventListener('storage', storage)

    return () => {
      media?.removeEventListener('change', changed)
      window.removeEventListener('storage', storage)
    }
  }, [])
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  function setTheme(value: ThemePreference) {
    savePreference('wapo-theme', value)
    setPreference(value)
  }

  return (
    <ThemeContext.Provider value={{ theme, dark, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

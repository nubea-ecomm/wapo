import { createContext, useContext } from 'react'
import type { ThemePreference } from './browser-preferences'

export const ThemeContext = createContext<{
  theme: ThemePreference
  dark: boolean
  setTheme: (theme: ThemePreference) => void
}>({ theme: 'system', dark: false, setTheme: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}

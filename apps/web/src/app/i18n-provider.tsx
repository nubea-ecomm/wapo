import { useEffect, useState, type ReactNode } from 'react'
import { useSession } from './session-context'
import { I18nContext, messages, type Language } from './i18n'
import {
  browserLanguage,
  savePreference,
  storedPreference,
  supportedLanguage,
} from './browser-preferences'

export function I18nProvider({ children }: { children: ReactNode }) {
  const { session, updateProfile } = useSession()
  const [preference, setPreference] = useState(() =>
    supportedLanguage(storedPreference('wapo-language')),
  )
  const [systemLanguage, setSystemLanguage] = useState(browserLanguage)
  const profileLanguage = supportedLanguage(session?.user?.language)
  const language = profileLanguage || preference || systemLanguage

  useEffect(() => {
    const changed = () => setSystemLanguage(browserLanguage())
    const storage = () =>
      setPreference(supportedLanguage(storedPreference('wapo-language')))

    window.addEventListener('languagechange', changed)
    window.addEventListener('storage', storage)

    return () => {
      window.removeEventListener('languagechange', changed)
      window.removeEventListener('storage', storage)
    }
  }, [])
  useEffect(() => {
    if (profileLanguage) {
      savePreference('wapo-language', profileLanguage)
      setPreference(profileLanguage)
    }
  }, [profileLanguage])

  async function setLanguage(value: Language) {
    if (session?.user) await updateProfile({ language: value })

    savePreference('wapo-language', value)
    setPreference(value)
  }

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  return (
    <I18nContext.Provider
      value={{ language, setLanguage, t: (key) => messages[language][key] }}
    >
      {children}
    </I18nContext.Provider>
  )
}

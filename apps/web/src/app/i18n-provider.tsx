import { useEffect, type ReactNode } from 'react'
import { useSession } from './session-context'
import { I18nContext, messages } from './i18n'

export function I18nProvider({ children }: { children: ReactNode }) {
  const { session } = useSession()
  const language = session?.user?.language || 'es'
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])
  return (
    <I18nContext.Provider value={{ language, t: (key) => messages[language][key] }}>
      {children}
    </I18nContext.Provider>
  )
}

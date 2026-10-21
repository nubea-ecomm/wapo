import { MotionProvider } from './components/motion/motion-provider'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/app'
import { SessionProvider } from './app/session-provider'
import { I18nProvider } from './app/i18n-provider'
import { ThemeProvider } from './app/theme-provider'
import '@fontsource/geist/latin-400.css'
import '@fontsource/geist/latin-500.css'
import '@fontsource/geist/latin-600.css'
import './styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionProvider>
      <ThemeProvider>
        <SessionProvider>
          <I18nProvider>
            <App />
          </I18nProvider>
        </SessionProvider>
      </ThemeProvider>
    </MotionProvider>
  </StrictMode>,
)

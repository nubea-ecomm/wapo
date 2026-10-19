const themePreference = (() => {
  try {
    return localStorage.getItem('wapo-docs-theme')
  } catch {
    return null
  }
})()
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
document.documentElement.dataset.theme =
  themePreference === 'light' || themePreference === 'dark'
    ? themePreference
    : systemTheme.matches
      ? 'dark'
      : 'light'

function setDocsTheme(theme, persist = true) {
  document.documentElement.dataset.theme = theme
  if (persist) {
    try {
      localStorage.setItem('wapo-docs-theme', theme)
    } catch {
      /* Storage can be disabled. */
    }
  }
  const button = document.querySelector('[data-theme-toggle]')
  if (button) {
    button.setAttribute('aria-pressed', String(theme === 'dark'))
    button.setAttribute(
      'aria-label',
      theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
    )
    button.setAttribute('title', theme === 'dark' ? 'Light mode' : 'Dark mode')
  }
  window.dispatchEvent(new CustomEvent('docs-theme-change', { detail: theme }))
}
document.addEventListener('DOMContentLoaded', () => {
  setDocsTheme(document.documentElement.dataset.theme, false)
  document
    .querySelector('[data-theme-toggle]')
    ?.addEventListener('click', () => {
      setDocsTheme(
        document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark',
      )
    })
})
systemTheme.addEventListener('change', () => {
  let saved = null
  try {
    saved = localStorage.getItem('wapo-docs-theme')
  } catch {
    /* Use system preference. */
  }
  if (!saved) setDocsTheme(systemTheme.matches ? 'dark' : 'light', false)
})
window.addEventListener('storage', (event) => {
  if (event.key === 'wapo-docs-theme')
    setDocsTheme(
      event.newValue === 'dark'
        ? 'dark'
        : event.newValue === 'light'
          ? 'light'
          : systemTheme.matches
            ? 'dark'
            : 'light',
      false,
    )
})

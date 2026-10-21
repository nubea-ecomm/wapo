import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ThemeProvider } from './theme-provider'
import { useTheme } from './theme-context'

function Probe() {
  const { setTheme } = useTheme()

  return (
    <>
      <button onClick={() => setTheme('light')}>Light</button>
      <button onClick={() => setTheme('system')}>System</button>
    </>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})
it('follows system changes until explicitly overridden and can return to system', async () => {
  localStorage.clear()
  const media = Object.assign(new EventTarget(), { matches: true })

  vi.stubGlobal('matchMedia', () => media)
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )
  expect(document.documentElement).toHaveClass('dark')
  const user = userEvent.setup()

  await user.click(screen.getByText('Light'))
  expect(localStorage.getItem('wapo-theme')).toBe('light')
  expect(document.documentElement).not.toHaveClass('dark')
  act(() => {
    media.dispatchEvent(new Event('change'))
  })
  expect(document.documentElement).not.toHaveClass('dark')
  await user.click(screen.getByText('System'))
  expect(document.documentElement).toHaveClass('dark')
  act(() => {
    media.matches = false
    media.dispatchEvent(new Event('change'))
  })
  expect(document.documentElement).not.toHaveClass('dark')
})

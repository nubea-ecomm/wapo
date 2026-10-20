import { expect, test } from '@playwright/test'

test('English is default and the language selector preserves legal pages', async ({
  page,
}) => {
  const errors: string[] = []

  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'WhatsApp for your product.',
  )
  await page.locator('.language-menu summary').click()
  await page
    .locator('.language-options')
    .getByRole('link', { name: 'Español' })
    .click()
  await expect(page).toHaveURL('/es')
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  await page
    .locator('.header-links')
    .getByRole('link', { name: 'Privacidad' })
    .click()
  await expect(page).toHaveURL('/privacidad')
  await page.locator('.language-menu summary').click()
  await page
    .locator('.language-options')
    .getByRole('link', { name: 'Português' })
    .click()
  await expect(page).toHaveURL('/pt/privacidade')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Política de privacidade',
  )
  await page
    .locator('.site-footer')
    .getByRole('link', { name: 'Excluir meus dados' })
    .click()
  await expect(page).toHaveURL('/pt/exclusao-de-dados')
  await page.locator('.language-menu summary').click()
  await page
    .locator('.language-options')
    .getByRole('link', { name: 'English' })
    .click()
  await expect(page).toHaveURL('/data-deletion')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Delete my data',
  )
  await page.locator('.language-menu summary').click()
  await page
    .locator('.language-options')
    .getByRole('link', { name: 'Español' })
    .click()
  await expect(page).toHaveURL('/eliminacion-de-datos')
  expect(errors).toEqual([])
})

test('copy returns only the source code, confirms success and replays the local demo', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  const button = page
    .getByRole('button', { name: 'Copy', exact: true })
    .filter({ has: page.locator('[data-copy-text]') })
  const expected = await page.locator('.line-code').allTextContents()

  await button.click()
  const copied = page.locator('[data-copy-code]')

  await expect(copied).toHaveAccessibleName('Copied')
  await expect(copied.locator('.copy-check')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    expected.join('\n'),
  )
  await expect(copied).toHaveAccessibleName('Copy', { timeout: 5000 })
  const replay = page.getByRole('button', { name: 'Replay demo' })

  await replay.click()
  await expect(replay).toBeDisabled()
  await expect(page.locator('.request-step.done')).toHaveCount(3)
  await expect(replay).toBeEnabled()
  await expect(page.locator('[data-demo-status]')).toHaveText('Delivered')
})

test('mobile menu and language menu work without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const menu = page.getByRole('button', { name: 'Open menu' })

  await menu.click()
  await page.locator('.language-menu summary').click()
  await page
    .locator('.language-options')
    .getByRole('link', { name: 'Português' })
    .click()
  await expect(page).toHaveURL('/pt')
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt')
  await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('button', { name: 'Abrir menu' }),
  ).toHaveAttribute('aria-expanded', 'false')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: 'artifacts/landing-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
})

test('legacy English URL redirects and reduced motion disables decorative animation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/en')
  await expect(page).toHaveURL('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  const names = await page
    .locator('.rain-bubble, .diagram-signal')
    .evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).animationName),
    )

  expect(names.every((name) => name === 'none')).toBe(true)
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Privacy policy',
  )
  await expect(page.locator('link[hreflang="x-default"]')).toHaveAttribute(
    'href',
    '/privacy',
  )
})

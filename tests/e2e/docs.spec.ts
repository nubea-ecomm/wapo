import { test, expect } from '@playwright/test'

test('documentation guides are readable and the reference loads entirely from this instance', async ({
  page,
}) => {
  const errors: string[] = []
  const external: string[] = []

  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (
      /^https?:/.test(request.url()) &&
      !request.url().startsWith('http://localhost:8080/')
    )
      external.push(request.url())
  })
  await page.goto('http://localhost:8080/docs')
  await expect(
    page.getByRole('heading', { name: 'Wapo API', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Your first request', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Guide sections' }),
  ).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  const search = page.getByRole('dialog', { name: 'Search documentation' })

  await search.getByLabel('Search guides', { exact: true }).fill('idempotency')
  await search
    .getByRole('link', { name: 'Idempotency and retries', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Idempotency and retries', exact: true }),
  ).toBeInViewport()
  await page.goto('http://localhost:8080/docs')
  await page.screenshot({
    animations: 'disabled',
    path: 'artifacts/docs-guides-desktop.png',
    fullPage: false,
  })
  await page
    .getByRole('navigation', { name: 'Documentation', exact: true })
    .getByRole('link', { name: 'API reference', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Messaging API', exact: true }),
  ).toBeVisible({ timeout: 20000 })
  await expect(
    page.getByText('Customers', { exact: true }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Ask AI', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByText('Compatibility', { exact: true })).toHaveCount(0)
  await page.screenshot({
    animations: 'disabled',
    path: 'artifacts/docs-reference-desktop.png',
    fullPage: false,
  })
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

test('documentation guides work on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://localhost:8080/docs')
  await page.getByRole('button', { name: 'On this page' }).click()
  await page
    .getByRole('navigation', { name: 'Guide sections' })
    .getByRole('link', { name: 'Receive webhooks' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Receive signed webhooks', exact: true }),
  ).toBeInViewport()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    animations: 'disabled',
    path: 'artifacts/docs-guides-mobile.png',
    fullPage: false,
  })
})

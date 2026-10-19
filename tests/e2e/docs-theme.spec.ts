import { test, expect } from './fixtures'

test('documentation theme persists across guides and the interactive reference', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('http://localhost:8080/docs')
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(
    await page
      .locator('body')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(16, 16, 16)')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Search guides' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto('http://localhost:8080/docs?view=reference&api=compatibility')
  await expect(page.locator('#reference .scalar-api-reference')).toBeVisible()
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('#reference .scalar-api-reference')).toBeVisible()
  await expect(page.locator('#reference')).toContainText('Meta compatibility')
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(page.locator('#reference')).toContainText('Meta compatibility')
  await page.screenshot({
    path: 'artifacts/docs-reference-dark.png',
    animations: 'disabled',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://localhost:8080/docs')
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true)
  await page.screenshot({
    path: 'artifacts/docs-guides-dark-mobile.png',
    animations: 'disabled',
  })
  expect(errors).toEqual([])
})

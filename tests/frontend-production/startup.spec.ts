import { test, expect } from '@playwright/test'

test('production HTML and missing assets are not cacheable, successful assets have correct MIME types', async ({
  request,
  page,
}) => {
  const html = await request.get('/')

  expect(html.status()).toBe(200)
  expect(html.headers()['cache-control']).toBe('no-store')
  const source = await html.text()
  const assets = [...source.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(
    (match) => match[1],
  )

  expect(assets.length).toBeGreaterThan(2)

  for (const path of assets) {
    const response = await request.get(path)

    expect(response.status(), path).toBe(200)
    expect(response.headers()['cache-control']).toContain('immutable')
    expect(response.headers()['content-type']).toContain(
      path.endsWith('.css') ? 'text/css' : 'javascript',
    )
  }

  for (const path of [
    '/assets/missing-release.js',
    '/assets/missing-release.css',
  ]) {
    const response = await request.get(path)

    expect(response.status()).toBe(404)
    expect(response.headers()['cache-control']).toBe('no-store')
    expect(response.headers()['cdn-cache-control']).toBe('no-store')
    expect(await response.text()).not.toContain('id="root"')
  }

  const errors: string[] = []

  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('a missing startup chunk shows a recovery screen and reload recovers', async ({
  page,
}) => {
  await page.route('**/assets/vendor-icons-*.js', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'text/html',
      body: '<h1>Not Found</h1>',
    }),
  )
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('No se pudo cargar Wapo')
  await page.unroute('**/assets/vendor-icons-*.js')
  await page.getByRole('button', { name: 'Volver a cargar' }).click()
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
  await expect(page.locator('#wapo-asset-recovery')).toHaveCount(0)
})

test('HTML returned as CSS and a lazy chunk failure have visible recovery', async ({
  page,
}) => {
  await page.route('**/assets/*.css', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      headers: { 'X-Content-Type-Options': 'nosniff' },
      body: '<h1>Not Found</h1>',
    }),
  )
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('No se pudo cargar Wapo')
  await page.unroute('**/assets/*.css')
  await page.reload()
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
  await page.evaluate(() =>
    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true })),
  )
  await expect(
    page.getByRole('button', { name: 'Volver a cargar' }),
  ).toBeVisible()
})

test('blocked third-party analytics do not block the console', async ({
  page,
}) => {
  await page.route('https://beacon.invalid/**', (route) =>
    route.abort('blockedbyclient'),
  )
  await page.goto('/')
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
  const failed = page.waitForEvent('requestfailed', (request) =>
    request.url().includes('beacon.invalid'),
  )

  await page.evaluate(() => {
    const script = document.createElement('script')

    script.src = 'https://beacon.invalid/beacon.js'
    document.head.append(script)
  })
  await failed
  await expect(page.locator('#wapo-asset-recovery')).toHaveCount(0)
})

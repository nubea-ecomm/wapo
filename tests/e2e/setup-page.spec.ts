import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

for (const allowed of [['coexistence', 'dedicated'], ['coexistence']]) {
  test(`hosted setup respects allowed modes and completes authorization: ${allowed.join(',')}`, async ({
    page,
  }) => {
    const root = 'apps/server/internal/api/setup/'
    const html = (await readFile(root + 'page.html', 'utf8'))
      .replace(/{{if .Logo}}[\s\S]*?{{end}}/, '')
      .replaceAll('{{.Name}}', 'Proyecto de prueba')
      .replaceAll('{{.Theme}}', 'light')
      .replaceAll('{{.Accent}}', '#171717')
      .replaceAll('{{.Foreground}}', '#ffffff')
      .replaceAll('{{.Overrides}}', '')
    await page.route('http://localhost:8080/setup/test/preview', (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    )
    for (const asset of ['setup.js', 'setup.css']) {
      await page.route(`**/setup/assets/${asset}`, async (route) =>
        route.fulfill({
          contentType: asset.endsWith('js') ? 'text/javascript' : 'text/css',
          body: await readFile(root + asset, 'utf8'),
        }),
      )
    }
    await page.route('**/public/setup/test/preview', (route) =>
      route.fulfill({
        json: {
          data: {
            allowed_connection_types: allowed,
            app_id: 'test',
            config_id: 'test',
            graph_version: 'v24.0',
          },
        },
      }),
    )
    await page.route('https://connect.facebook.net/**', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `window.FB={init(){},login(callback,options){window.signupOptions=options;callback({authResponse:{code:'fake-code'}});window.dispatchEvent(new MessageEvent('message',{origin:'https://www.facebook.com',data:{type:'WA_EMBEDDED_SIGNUP',event:'FINISH',data:{waba_id:'waba',phone_number_id:'phone'}}}));}};window.fbAsyncInit();`,
      }),
    )
    let submitted: Record<string, string> = {}
    await page.route('**/public/setup/test/preview/complete', async (route) => {
      submitted = route.request().postDataJSON()
      await route.fulfill({ json: { data: {} } })
    })
    await page.goto('http://localhost:8080/setup/test/preview')
    await expect(page.getByRole('button', { name: 'Usar mi app' })).toBeVisible()
    if (allowed.length === 1)
      await expect(page.getByRole('button', { name: 'Usar un número' })).toBeHidden()
    else {
      await page.getByRole('button', { name: 'Usar un número' }).click()
      await expect(
        page.getByRole('heading', { name: 'Conectá un número dedicado' }),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Cambiar tipo' }).click()
    }
    await page.screenshot({
      path: 'artifacts/setup-choice-desktop.png',
      fullPage: true,
      animations: 'disabled',
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({
      path: 'artifacts/setup-choice-mobile.png',
      fullPage: true,
      animations: 'disabled',
    })
    await page.getByRole('button', { name: 'Usar mi app' }).click()
    await expect(page.locator('#step-two')).toHaveAttribute('aria-current', 'step')
    await expect(page.locator('#instructions li')).toHaveCount(3)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true)
    await page.screenshot({
      path: 'artifacts/setup-authorize-mobile.png',
      fullPage: true,
      animations: 'disabled',
    })
    await page.getByRole('button', { name: 'Continuar con Meta' }).click()
    await expect(page.getByRole('status')).toHaveText('WhatsApp conectado.')
    expect(submitted.connection_type).toBe('coexistence')
    expect(submitted.code).toBe('fake-code')
    // A login code without the Embedded Signup event must not leave the UI locked.
    await page.route('https://connect.facebook.net/**', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: "window.FB={init(){},login(callback){callback({authResponse:{code:'login-only'}})}};window.fbAsyncInit();",
      }),
    )
    await page.clock.install()
    await page.reload()
    await page.getByRole('button', { name: 'Usar mi app' }).click()
    await page.getByRole('button', { name: 'Continuar con Meta' }).click()
    await expect(page.getByRole('status')).toContainText('Acceso autorizado')
    await page.clock.runFor(16000)
    await expect(page.getByRole('status')).toContainText('no confirmó una cuenta')
    await expect(page.getByRole('button', { name: 'Continuar con Meta' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Cambiar tipo' })).toBeEnabled()
  })
}

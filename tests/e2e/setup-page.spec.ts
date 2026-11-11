import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

for (const { language, allowed } of ['es', 'en'].flatMap((language) =>
  [['coexistence', 'dedicated'], ['coexistence']].map((allowed) => ({
    language,
    allowed,
  })),
)) {
  test(`hosted setup respects allowed modes and completes authorization: ${language} ${allowed.join(',')}`, async ({
    page,
  }) => {
    const root = 'apps/server/internal/api/setup/'
    const copy: Record<string, string> = JSON.parse(
      (await readFile(root + language + '.json', 'utf8')).replaceAll(
        '{project}',
        'Proyecto de prueba',
      ),
    )
    const html = (await readFile(root + 'page.html', 'utf8'))
      .replaceAll('{{.Copy}}', JSON.stringify(copy))
      .replace(/{{\.Copy\.(\w+)}}/g, (_, key: string) => copy[key])
      .replaceAll('{{.Language}}', language)
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

    let releaseConfig!: () => void
    const configReady = new Promise<void>((resolve) => {
      releaseConfig = resolve
    })

    await page.route('**/public/setup/test/preview', async (route) => {
      await configReady
      await route.fulfill({
        json: {
          data: {
            allowed_connection_types: allowed,
            app_id: 'test',
            config_id: 'test',
            graph_version: 'v24.0',
            business: { name: 'Merchant', email: 'merchant@example.com' },
          },
        },
      })
    })
    await page.route('https://connect.facebook.net/**', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `window.FB={init(){},login(callback,options){window.signupOptions=options;callback({authResponse:{code:'fake-code'}});window.dispatchEvent(new MessageEvent('message',{origin:'https://www.facebook.com',data:{type:'WA_EMBEDDED_SIGNUP',event:'FINISH',data:{waba_ids:['654321'],phone_number_id:'111111'}}}));}};window.fbAsyncInit();`,
      }),
    )
    let submitted: Record<string, string> = {}

    await page.route('**/public/setup/test/preview/complete', async (route) => {
      submitted = route.request().postDataJSON()
      await route.fulfill({ json: { data: {} } })
    })
    await page.goto('http://localhost:8080/setup/test/preview')
    await expect(page.locator('html')).toHaveAttribute('lang', language)
    await expect(page.locator('#choose h1')).toHaveText(copy.title)
    await expect(page.locator('.choices-loading')).toBeVisible()
    await expect(page.locator('.skeleton-choice')).toHaveCount(2)
    await expect(page.locator('#status')).toBeEmpty()
    releaseConfig()
    await expect(page.locator('.choices-loading')).toBeHidden()
    await expect(
      page.locator(`script[src*="connect.facebook.net"]`),
    ).toHaveAttribute(
      'src',
      `https://connect.facebook.net/${copy.sdkLocale}/sdk.js`,
    )
    await expect(
      page.getByRole('button', {
        name: new RegExp(copy.appTitle),
      }),
    ).toBeVisible()

    if (allowed.length === 1)
      await expect(
        page.getByRole('button', { name: new RegExp(copy.dedicatedTitle) }),
      ).toBeHidden()
    else {
      await page
        .getByRole('button', { name: new RegExp(copy.dedicatedTitle) })
        .click()
      await expect(
        page.getByRole('heading', { name: copy.dedicatedAuthorizationTitle }),
      ).toBeVisible()
      await page.getByRole('button', { name: copy.back }).click()
    }

    const appChoice = page.getByRole('button', {
      name: new RegExp(copy.appTitle),
    })

    await expect(appChoice).toContainText(copy.appTitle)
    await expect(appChoice).toContainText(copy.appDescription)
    const appDetails = page.locator('[data-mode="coexistence"] details')

    await expect(appDetails).not.toHaveAttribute('open', '')
    await appDetails.getByText(copy.learnMore).click()
    await expect(appDetails.getByRole('list')).toBeVisible()
    await appChoice.hover()
    expect(
      await appChoice.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    ).toBe('rgba(0, 0, 0, 0)')
    expect(
      await appDetails.evaluate((element) => {
        const button = element.parentElement!.querySelector('button')!

        return (
          element.getBoundingClientRect().top >=
          button.getBoundingClientRect().bottom
        )
      }),
    ).toBe(true)
    await expect(page.locator('#choose')).toBeVisible()
    await appDetails.getByText(copy.learnMore).click()
    await expect(appDetails.getByRole('list')).toBeHidden()
    const choiceBounds = await appChoice.boundingBox()

    expect(choiceBounds!.height).toBeLessThan(120)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(
      await page
        .locator('[data-mode="coexistence"]')
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toBe('none')
    await page.emulateMedia({ reducedMotion: 'no-preference' })

    await page.screenshot({
      path: `artifacts/setup-choice-desktop-${language}-${allowed.length}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({
      path: `artifacts/setup-choice-mobile-${language}-${allowed.length}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    await page.setViewportSize({ width: 320, height: 740 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark'
    })
    await appDetails.getByText(copy.learnMore).click()
    await appChoice.hover()
    await page.screenshot({
      path: `artifacts/setup-choice-dark-${language}-${allowed.length}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    await appDetails.getByText(copy.learnMore).click()
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light'
    })
    await appChoice.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#authorization-title')).toBeFocused()
    await expect(
      page.getByRole('navigation', { name: 'Progreso' }),
    ).toHaveCount(0)
    await expect(page.locator('#authorize')).toBeVisible()
    await expect(page.locator('#instructions li')).toHaveCount(3)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: 'artifacts/setup-authorize-mobile.png',
      fullPage: true,
      animations: 'disabled',
    })
    await page.getByRole('button', { name: copy.continue }).click()
    await expect(page.getByRole('status')).toHaveText(copy.connected)
    expect(submitted.connection_type).toBe('coexistence')
    expect(submitted.code).toBe('fake-code')
    expect(submitted.waba_id).toBe('654321')
    expect(submitted.phone_number_id).toBe('111111')
    const signupExtras = () =>
      page.evaluate(
        () =>
          (window as unknown as { signupOptions: { extras: unknown } })
            .signupOptions.extras,
      )

    expect(await signupExtras()).toEqual({
      setup: { business: { name: 'Merchant', email: 'merchant@example.com' } },
      version: 'v5',
      featureType: 'whatsapp_business_app_onboarding',
      sessionInfoVersion: '3',
    })

    if (allowed.includes('dedicated')) {
      await page.reload()
      await page
        .getByRole('button', { name: new RegExp(copy.dedicatedTitle) })
        .click()
      await page.getByRole('button', { name: copy.continue }).click()
      await expect(page.getByRole('status')).toHaveText(copy.connected)
      expect(submitted.connection_type).toBe('dedicated')
      expect(await signupExtras()).toEqual({
        setup: {
          business: { name: 'Merchant', email: 'merchant@example.com' },
        },
        version: 'v5',
      })
    }

    // A login code without the Embedded Signup event must not leave the UI locked.
    await page.route('https://connect.facebook.net/**', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: "window.FB={init(){},login(callback){callback({authResponse:{code:'login-only'}})}};window.fbAsyncInit();",
      }),
    )
    await page.clock.install()
    await page.reload()
    await page.getByRole('button', { name: new RegExp(copy.appTitle) }).click()
    await page.getByRole('button', { name: copy.continue }).click()
    await expect(page.getByRole('status')).toHaveText(copy.authorized)
    await page.clock.runFor(16000)
    await expect(page.getByRole('status')).toHaveText(copy.accountTimeout)
    await expect(
      page.getByRole('button', { name: copy.continue }),
    ).toBeEnabled()
    await expect(page.getByRole('button', { name: copy.back })).toBeEnabled()

    await page.route('**/public/setup/test/preview/complete', (route) =>
      route.fulfill({
        status: 422,
        json: {
          error: {
            code: 'ambiguous_phone_number',
            message: 'Provider diagnostic',
          },
        },
      }),
    )
    await page.getByRole('button', { name: copy.continue }).click()
    await page.evaluate(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://www.facebook.com',
          data: {
            type: 'WA_EMBEDDED_SIGNUP',
            event: 'FINISH',
            data: { waba_id: '654321', phone_number_id: '111111' },
          },
        }),
      ),
    )
    // The error code is shown for support; the provider message is not.
    await expect(page.getByRole('status')).toHaveText(
      `${copy.completeError} (ambiguous_phone_number)`,
    )

    await page.route('**/public/setup/test/preview', (route) =>
      route.fulfill({
        status: 410,
        json: { error: { message: 'Link unavailable' } },
      }),
    )
    await page.reload()
    await expect(page.locator('.choices-loading')).toBeHidden()
    await expect(page.getByRole('status')).toHaveText(copy.unavailable)
  })
}

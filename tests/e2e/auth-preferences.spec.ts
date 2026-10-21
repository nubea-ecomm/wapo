import { test, expect } from '@playwright/test'

test.use({ locale: 'en-US', colorScheme: 'dark' })
test('system defaults, explicit preferences and password feedback work before signup', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.getByRole('button', { name: 'Language', exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'Español' }).click()
  await expect(
    page.getByRole('heading', { name: 'Iniciar sesión' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Tema', exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'Claro', exact: true }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Tema', exact: true }).click()
  await page
    .getByRole('menuitemradio', { name: 'Sistema', exact: true })
    .click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.getByRole('link', { name: 'Crear cuenta', exact: true }).click()
  const password = page.getByLabel('Contraseña', { exact: true })

  await password.fill('short')
  await expect(page.getByText('Demasiado corta: mínimo 12 bytes')).toBeVisible()
  expect(
    await password.evaluate((input: HTMLInputElement) => input.checkValidity()),
  ).toBe(false)
  await page.getByRole('button', { name: 'Mostrar contraseña' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await expect(password).toHaveValue('short')
  await page.getByRole('button', { name: 'Ocultar contraseña' }).click()
  await expect(password).toHaveAttribute('type', 'password')
  await password.fill('Password123!')
  await expect(page.getByText('Débil: fácil de adivinar')).toBeVisible()
  await password.fill('glacier canoe velvet orbital 748!')
  await expect(page.getByRole('meter')).toHaveAttribute('aria-valuenow', /[34]/)
  await password.fill('🔐'.repeat(19))
  await expect(page.getByText('Demasiado larga: máximo 72 bytes')).toBeVisible()
  expect(
    await password.evaluate((input: HTMLInputElement) => input.checkValidity()),
  ).toBe(false)
})

test('account language changes keep the Preferences tab open', async ({
  page,
}) => {
  let user = {
    id: 'preferences-user',
    name: 'Owner',
    email: 'owner@example.invalid',
    role: 'admin',
    all_projects: true,
    active: true,
    language: 'es',
    project_ids: [],
    created_at: new Date().toISOString(),
  }

  await page.addInitScript(
    (user) =>
      sessionStorage.setItem(
        'wapo.console-session',
        JSON.stringify({
          id: 'preferences-session',
          key: 'fake-session',
          url: 'http://localhost:8080',
          role: 'operator',
          tenantId: 'preferences-project',
          tenantName: 'Project',
          user,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        }),
      ),
    user,
  )
  await page.route('http://localhost:8080/**', (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname

    if (path === '/auth/v1/me') {
      if (request.method() === 'PATCH')
        user = { ...user, ...request.postDataJSON() }

      return route.fulfill({ json: { data: { user } } })
    }

    if (path === '/admin/v1/tenants')
      return route.fulfill({
        json: {
          data: [
            { id: 'preferences-project', name: 'Project', status: 'active' },
          ],
        },
      })

    if (path === '/v1/project')
      return route.fulfill({
        json: {
          data: {
            id: 'preferences-project',
            name: 'Project',
            branding: { theme: 'light', accent_color: '#171717' },
          },
        },
      })

    return route.fulfill({ json: { data: [] } })
  })
  await page.goto('/#/settings')
  await page.getByRole('tab', { name: 'Preferencias', exact: true }).click()
  await page.getByLabel('Idioma', { exact: true }).click()
  await page.getByRole('option', { name: 'English', exact: true }).click()
  await expect(
    page.getByRole('tab', { name: 'Preferences', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel')).toHaveAttribute(
    'id',
    'panel-preferences',
  )
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

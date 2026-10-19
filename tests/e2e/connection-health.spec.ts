import { test, expect, env } from './fixtures'
test('connection diagnostics show billing errors and allow a fresh check', async ({
  page,
}) => {
  const connection = {
    id: 'health-ui',
    customer_id: 'customer-ui',
    name: 'Soporte',
    external_id: '123456',
    business_account_id: '654321',
    channel: 'whatsapp',
    status: 'connected',
    connection_type: 'coexistence',
  }
  let refreshed = false
  await page.route('**/v1/customers/customer-ui/setup_links', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      reconnect_phone_number: '123456',
    })
    await route.fulfill({
      status: 201,
      json: { data: { id: 'setup-ui', url: 'https://connect.example/renew' } },
    })
  })
  await page.route('**/v1/connections**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/health')) {
      if (route.request().method() === 'POST') refreshed = true
      return route.fulfill({
        json: {
          data: {
            status: refreshed ? 'unknown' : 'error',
            checked_at: new Date().toISOString(),
            issues: refreshed ? 0 : 1,
            billing: {
              status: refreshed ? 'unknown' : 'attention_required',
              manage_url: 'https://business.facebook.com/wa/manage/accounts/',
            },
            checks: [
              {
                id: 'phone_access',
                label: 'Acceso al número',
                status: refreshed ? 'pass' : 'fail',
                message: refreshed
                  ? 'El token permite consultar este número.'
                  : 'Revisá los permisos del token.',
              },
              {
                id: 'payment',
                label: 'Pagos en Meta',
                status: refreshed ? 'unknown' : 'fail',
                message: refreshed
                  ? 'Meta no informó pagos.'
                  : 'Revisá el método de pago en Meta.',
                manage_url: 'https://business.facebook.com/wa/manage/accounts/',
              },
            ],
          },
        },
      })
    }
    if (url.pathname.endsWith('/health-ui'))
      return route.fulfill({ json: { data: connection } })
    return route.fulfill({ json: { data: [connection] } })
  })
  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill(env.ADMIN_EMAIL)
  await page.getByLabel('Contraseña', { exact: true }).fill(env.ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(
    page.getByRole('heading', { name: 'Vista general', exact: true }),
  ).toBeVisible()
  await page.goto('/#/connections/health-ui?tab=health')
  await expect(
    page.getByRole('heading', { name: 'Diagnóstico', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Meta reportó un problema de pagos.', { exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: 'artifacts/connection-health-desktop.png',
    animations: 'disabled',
  })
  await page
    .getByRole('button', { name: 'Generar enlace de reconexión' })
    .click()
  await expect(
    page.getByRole('link', { name: 'Abrir enlace' }),
  ).toHaveAttribute('href', 'https://connect.example/renew')
  await page.getByRole('button', { name: 'Comprobar ahora' }).click()
  await expect(
    page.getByText('Hay datos sin confirmar', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Estado de pagos sin confirmar. Revisá la cuenta en Meta.', {
      exact: true,
    }),
  ).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

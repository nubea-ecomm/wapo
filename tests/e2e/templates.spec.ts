import { test, expect, env } from './fixtures'

test('customer and connection details list and create templates using a fake provider boundary', async ({
  page,
}) => {
  const name = `Templates ${Date.now()}`
  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill(env.ADMIN_EMAIL)
  await page.getByLabel('Contraseña', { exact: true }).fill(env.ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.getByRole('link', { name: 'Proyectos', exact: true }).click()
  await page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click()
  await page.getByLabel('Nombre del proyecto', { exact: true }).fill(name)
  await page.getByRole('button', { name: 'Crear proyecto', exact: true }).click()
  await page.getByRole('button', { name, exact: true }).click()
  await page.getByRole('link', { name: 'Customers', exact: true }).click()
  await page.getByRole('button', { name: 'Nuevo customer' }).click()
  await page.getByLabel('Nombre', { exact: true }).fill(name)
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/customers') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Guardar customer' }).click()
  const customerId = (await (await created).json()).data.id
  const connection = {
    id: 'con_template_ui',
    name: 'WhatsApp de prueba',
    customer_id: customerId,
    channel: 'whatsapp',
    status: 'connected',
    business_account_id: '123456',
    external_id: '123456789',
    display_phone_number: '+123456789',
  }
  const templates: Record<string, unknown>[] = []
  let submitted: Record<string, unknown> | null = null
  let credentialExpired = false
  await page.route('**/v1/connections**', async (route) => {
    const request = route.request(),
      url = new URL(request.url())
    if (url.pathname.endsWith('/history')) {
      await route.fulfill({ json: { data: [] } })
    } else if (url.pathname.endsWith('/templates')) {
      if (request.method() === 'POST') {
        submitted = request.postDataJSON()
        templates.push({ ...submitted, id: 'tpl_ui', status: 'PENDING' })
        await route.fulfill({
          status: 201,
          json: { data: { id: 'tpl_ui', status: 'PENDING', category: 'UTILITY' } },
        })
      } else if (credentialExpired)
        await route.fulfill({
          status: 409,
          json: {
            error: {
              code: 'credential_expired',
              message: 'WhatsApp credentials expired. Reconnect the number to continue.',
            },
          },
        })
      else await route.fulfill({ json: { data: templates } })
    } else if (url.pathname.endsWith('/con_template_ui'))
      await route.fulfill({ json: { data: connection } })
    else if (url.pathname === '/v1/connections')
      await route.fulfill({ json: { data: [connection] } })
    else await route.continue()
  })
  await page.route('**/v1/customers/*/templates*', (route) =>
    route.fulfill({ json: { data: templates } }),
  )
  await page.getByRole('button', { name, exact: true }).click()
  const metrics = page.getByRole('region', { name: 'Métricas del customer' })
  await expect(metrics.getByText('Sin fallas de entrega', { exact: true })).toBeVisible()
  await expect(metrics.getByText('Sin conexiones', { exact: true })).toBeVisible()
  const metricResponse = page.waitForResponse((response) =>
    response.url().includes(`/customers/${customerId}/metrics?days=7`),
  )
  await page.getByLabel('Período de métricas').selectOption('7')
  expect((await (await metricResponse).json()).data.series).toHaveLength(7)
  await page.screenshot({
    path: 'artifacts/customer-metrics-desktop.png',
    animations: 'disabled',
    fullPage: true,
  })
  await page.getByRole('tab', { name: 'Templates', exact: true }).click()
  await expect(page.getByText('Sin templates', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Crear template', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nombre', { exact: true }).fill('order_update')
  await dialog
    .getByLabel('Mensaje', { exact: true })
    .fill('Hola {{1}}, recibimos tu pedido.')
  await dialog.getByLabel('Ejemplo {{1}}', { exact: true }).fill('Ana')
  await dialog.getByRole('button', { name: 'Enviar a revisión', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'order_update', exact: true }),
  ).toBeVisible()
  expect(submitted).toMatchObject({
    name: 'order_update',
    language: 'es',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: 'Hola {{1}}, recibimos tu pedido.',
        example: { body_text: [['Ana']] },
      },
    ],
  })
  await page.getByRole('tab', { name: 'Conexiones', exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'WhatsApp de prueba', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Templates', exact: true }).last().click()
  await expect(
    page.getByRole('heading', { name: 'WhatsApp de prueba', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'order_update', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'order_update', exact: true }).click()
  await expect(
    page
      .getByRole('dialog')
      .getByText('Hola {{1}}, recibimos tu pedido.', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cerrar diálogo', exact: true })
    .click()
  await page.screenshot({
    path: 'artifacts/connection-templates.png',
    animations: 'disabled',
  })
  await page.route('**/v1/customers/*/setup_links', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({
      status: 201,
      json: { data: { url: 'http://localhost:8080/setup/reconnect/token' } },
    })
  })
  credentialExpired = true
  await page.getByRole('link', { name: 'Templates', exact: true }).first().click()
  await expect(
    page.getByRole('heading', { name: 'La autorización de Meta venció' }),
  ).toBeVisible()
  await expect(
    page.getByText('Error validating access token', { exact: false }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Reconectar WhatsApp', exact: true }).click()
  await expect(page.getByLabel('Enlace de onboarding')).toHaveValue(
    'http://localhost:8080/setup/reconnect/token',
  )
})

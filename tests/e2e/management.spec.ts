import { test, expect, env } from './fixtures'
test('operator manages tenants, keys, customers and WhatsApp setup against the real API', async ({
  page,
}) => {
  test.setTimeout(60_000)
  const suffix = Date.now().toString()
  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill(env.ADMIN_EMAIL)
  await page.getByLabel('Contraseña', { exact: true }).fill(env.ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(
    page.getByRole('heading', { name: 'Vista general', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Integraciones', exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'API keys', exact: true }),
  ).not.toBeVisible()
  await page.getByRole('button', { name: 'Integraciones', exact: true }).click()
  await page.keyboard.press('ControlOrMeta+k')
  const navigationSearch = page.getByRole('dialog', { name: 'Buscar en Wapo' })
  await navigationSearch.getByLabel('Buscar pantalla').fill('Customers')
  await navigationSearch.getByRole('button', { name: /Customers/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Customers', exact: true, level: 1 }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Proyectos', exact: true }).click()
  await page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click()
  await page.getByLabel('Nombre del proyecto').fill(`Demo ${suffix}`)
  await page.getByRole('button', { name: 'Crear proyecto', exact: true }).click()
  const tenant = page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: `Demo ${suffix}`, exact: true }) })
  await expect(tenant).toBeVisible()
  await page.getByLabel('Buscar proyectos', { exact: true }).fill(`Demo ${suffix}`)
  await page.screenshot({
    animations: 'disabled',
    path: 'artifacts/tenants-desktop.png',
    fullPage: true,
  })
  await tenant.getByRole('button', { name: `Demo ${suffix}`, exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Proyecto activo' })).toContainText(
    `Demo ${suffix}`,
  )
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Proyecto activo' })).toContainText(
    `Demo ${suffix}`,
  )
  await page.getByRole('combobox', { name: 'Proyecto activo' }).click()
  await page
    .getByRole('combobox', { name: 'Buscar proyecto', exact: true })
    .fill(`Demo ${suffix}`)
  await expect(page.getByRole('option')).toHaveCount(1)
  await page.getByRole('option').click()
  await page.getByRole('link', { name: 'API keys', exact: true }).click()
  await page.getByLabel('Nombre de la integración').fill('Contract integration')
  await page.getByRole('button', { name: 'Crear clave' }).click()
  await expect(
    page.getByText('Guardá esta clave. Solo se muestra una vez.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Ocultar clave' }).click()
  await expect(
    page.getByText('Guardá esta clave. Solo se muestra una vez.'),
  ).not.toBeVisible()
  await page
    .getByRole('button', { name: 'Acciones de Contract integration', exact: true })
    .click()
  await page.getByRole('menuitem', { name: 'Revocar clave', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Confirmar', exact: true })
    .click()
  await expect(page.getByText('Revocada', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Customers', exact: true }).click()
  await page.getByRole('button', { name: 'Nuevo customer' }).click()
  await page.getByLabel('Nombre', { exact: true }).fill('Demo Merchant')
  await page.getByLabel('ID externo', { exact: true }).fill(`shop-${suffix}`)
  await page.getByRole('button', { name: 'Guardar customer' }).click()
  await expect(page.getByText('Demo Merchant', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Acciones de Demo Merchant' }).click()
  await page.getByRole('menuitem', { name: 'Editar customer' }).click()
  await page.getByLabel('Email', { exact: true }).fill('merchant@example.com')
  await page.getByRole('button', { name: 'Guardar customer' }).click()
  await expect(page.getByText('merchant@example.com', { exact: true })).toBeVisible()
  await page.screenshot({
    path: 'artifacts/customers-desktop.png',
    animations: 'disabled',
  })
  let onboardingReady = false
  await page.route('**/v1/me', async (route) => {
    const response = await route.fetch()
    const data = await response.json()
    data.data.onboarding_ready = onboardingReady
    await route.fulfill({ json: data })
  })
  await page.reload()
  await page.getByRole('button', { name: 'Conectar WhatsApp', exact: true }).click()
  let onboarding = page.getByRole('dialog', { name: 'Conectar WhatsApp', exact: true })
  await expect(
    onboarding.getByRole('radio', { name: /Que el cliente elija/ }),
  ).toBeChecked()
  await expect(onboarding.getByText('WhatsApp aún no está habilitado')).toBeVisible()
  await expect(
    onboarding.getByRole('button', { name: 'Generar enlace', exact: true }),
  ).toBeDisabled()
  await page.screenshot({
    animations: 'disabled',
    path: 'artifacts/onboarding-unconfigured.png',
    fullPage: true,
  })
  await onboarding.getByRole('button', { name: 'Cerrar', exact: true }).click()
  onboardingReady = true
  const selections: string[][] = []
  await page.route('**/v1/customers/*/setup_links', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    selections.push(route.request().postDataJSON().allowed_connection_types)
    await route.fulfill({
      status: 201,
      json: { data: { url: 'http://localhost:8080/setup/test/link' } },
    })
  })
  await page.reload()
  await page.getByRole('button', { name: 'Conectar WhatsApp', exact: true }).click()
  onboarding = page.getByRole('dialog', { name: 'Conectar WhatsApp', exact: true })
  await onboarding.getByRole('button', { name: 'Generar enlace', exact: true }).click()
  await expect(onboarding.getByLabel('Enlace de onboarding')).toBeVisible()
  expect(selections[0]).toEqual(['coexistence', 'dedicated'])
  await onboarding.getByRole('radio', { name: /Solo API/ }).check()
  await onboarding.getByRole('button', { name: 'Generar enlace', exact: true }).click()
  await expect.poll(() => selections.length).toBe(2)
  expect(selections[1]).toEqual(['dedicated'])
  await page.screenshot({
    animations: 'disabled',
    path: 'artifacts/onboarding-ready.png',
    fullPage: true,
  })
  await onboarding.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.unroute('**/v1/me')
  await page.unroute('**/v1/customers/*/setup_links')

  await page.getByRole('link', { name: 'Conexiones', exact: true }).click()
  await page.getByRole('button', { name: 'Conectar WhatsApp', exact: true }).click()
  await expect(
    page.getByRole('dialog').getByLabel('Phone Number ID de Meta'),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Conexión manual', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Phone Number ID de Meta')).toBeVisible()
  await expect(dialog.getByLabel('WhatsApp Business Account ID')).toBeVisible()
  await expect(dialog.getByLabel('Access token de Meta')).toBeVisible()
  await expect(dialog.getByRole('option', { name: 'Chat web', exact: true })).toHaveCount(
    0,
  )
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.getByRole('link', { name: 'Configuración', exact: true }).click()
  await page.getByRole('tab', { name: 'WhatsApp', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Configurar WhatsApp', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('META_APP_ID', { exact: true })).toBeVisible()
  await expect(page.getByText('META_APP_SECRET', { exact: true })).toBeVisible()
  await expect(
    page.getByText('META_EMBEDDED_SIGNUP_CONFIG_ID', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('docker compose up -d --build migrate api worker', { exact: true }),
  ).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: 'artifacts/whatsapp-settings-desktop.png',
    fullPage: true,
  })
  await page.getByRole('link', { name: 'Vista general', exact: true }).click()
  await expect(page.getByRole('img', { name: /Mensajes enviados/ })).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: 'artifacts/overview-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    animations: 'disabled',
    path: 'artifacts/overview-mobile.png',
    fullPage: true,
  })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true)
  await page.getByRole('button', { name: 'Abrir navegación' }).click()
  await expect(
    page.getByRole('dialog').getByRole('link', { name: 'Chats', exact: true }),
  ).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: 'artifacts/sidebar-mobile.png',
    fullPage: true,
  })
  await page.getByRole('dialog').getByRole('link', { name: 'Chats', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Chats', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Abrir navegación' }).click()
  await page
    .getByRole('dialog')
    .getByRole('link', { name: 'Proyectos', exact: true })
    .click()
  const deleteCard = page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: `Demo ${suffix}`, exact: true }) })
  await deleteCard
    .getByRole('button', { name: `Acciones de Demo ${suffix}`, exact: true })
    .click()
  await page.getByRole('menuitem', { name: 'Eliminar proyecto', exact: true }).click()
  const deletion = page.getByRole('alertdialog')
  await expect(
    deletion.getByRole('button', { name: 'Eliminar proyecto', exact: true }),
  ).toBeDisabled()
  await deletion
    .getByLabel(`Escribí Demo ${suffix} para confirmar`)
    .fill(`Demo ${suffix}`)
  await deletion.getByRole('button', { name: 'Eliminar proyecto', exact: true }).click()
  await expect(deleteCard).not.toBeVisible()
})

test('127.0.0.1 console can authenticate against the localhost API without CORS failures', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:5173')
  await page.getByLabel('Email', { exact: true }).fill(env.ADMIN_EMAIL)
  await page.getByLabel('Contraseña', { exact: true }).fill(env.ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(
    page.getByRole('heading', { name: 'Vista general', exact: true }),
  ).toBeVisible()
})

test('administrator signs in with email and password and manages users inside the console', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill(env.ADMIN_EMAIL)
  await page.getByLabel('Contraseña', { exact: true }).fill(env.ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(
    page.getByRole('heading', { name: 'Vista general', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Usuarios', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Usuarios', exact: true })).toBeVisible()
  await expect(page.getByText(env.ADMIN_EMAIL, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Crear usuario', exact: true }).click()
  const userName = `Test administrator ${Date.now()}`
  await page.getByLabel('Nombre del usuario').fill(userName)
  await page.getByLabel('Email del usuario').fill(`user-${Date.now()}@example.com`)
  await page.getByLabel('Contraseña nueva').fill('browser-test-password-123')
  await page.getByRole('button', { name: 'Guardar usuario' }).click()
  const row = page.getByRole('row').filter({ hasText: userName })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: `Acciones de ${userName}` }).click()
  await page.getByRole('menuitem', { name: 'Desactivar', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Confirmar', exact: true })
    .click()
  await expect(row.getByText('Inactivo', { exact: true })).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: 'artifacts/users-desktop.png',
    fullPage: true,
  })
  await row.getByRole('button', { name: `Acciones de ${userName}` }).click()
  await page.getByRole('menuitem', { name: 'Eliminar usuario', exact: true }).click()
  const deleteButton = page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Eliminar usuario', exact: true })
  await expect(deleteButton).toHaveAttribute('data-variant', 'destructive')
  for (const dark of [false, true]) {
    await page
      .locator('html')
      .evaluate((element, dark) => element.classList.toggle('dark', dark), dark)
    const contrast = await deleteButton.evaluate((element) => {
      const style = getComputedStyle(element)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const context = canvas.getContext('2d')!
      const luminance = (color: string) => {
        context.fillStyle = color
        context.fillRect(0, 0, 1, 1)
        const rgb = Array.from(context.getImageData(0, 0, 1, 1).data)
          .slice(0, 3)
          .map((value) => {
            const channel = value / 255
            return channel <= 0.04045
              ? channel / 12.92
              : ((channel + 0.055) / 1.055) ** 2.4
          })
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
      }
      const a = luminance(style.color),
        b = luminance(style.backgroundColor)
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    })
    expect(contrast).toBeGreaterThanOrEqual(4.5)
  }
  await page.screenshot({
    path: 'artifacts/delete-user-dark.png',
    animations: 'disabled',
  })
  await page.locator('html').evaluate((element) => element.classList.remove('dark'))
  await deleteButton.click()
  await expect(row).not.toBeVisible()
  const favicon = await page.locator('link[rel="icon"]').getAttribute('href')
  expect(favicon).toBe('/favicon.svg')
  const icon = await page.request.get(favicon!)
  expect(icon.ok()).toBe(true)
  expect(await icon.text()).toContain('<svg')
  await page.getByRole('button', { name: 'Menú de usuario' }).click()
  const theme = page.getByRole('switch', { name: 'Tema oscuro' })
  await theme.click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Menú de usuario' }).click()
  await page.screenshot({ path: 'artifacts/account-dark.png', animations: 'disabled' })
  await page.getByRole('switch', { name: 'Tema oscuro' }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.getByRole('menuitem', { name: 'Cerrar sesión', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible()
  await expect(page.locator('input[type=email], input[type=password]')).toHaveCount(2)
  await expect(page.getByText('URL de la instancia')).not.toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: 'artifacts/login-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    animations: 'disabled',
    path: 'artifacts/login-mobile.png',
    fullPage: true,
  })
})

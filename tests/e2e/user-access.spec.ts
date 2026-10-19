import { test, expect, env } from './fixtures'

test('admin assigns a viewer to one project and the viewer cannot write or access other projects', async ({
  page,
  browser,
}) => {
  const suffix = Date.now()
  const name = `Scoped ${suffix}`
  const email = `viewer-${suffix}@example.com`
  const password = `Viewer-password-${suffix}`
  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill(env.ADMIN_EMAIL)
  await page.getByLabel('Contraseña', { exact: true }).fill(env.ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.getByRole('link', { name: 'Proyectos', exact: true }).click()
  await page
    .getByRole('button', { name: 'Nuevo proyecto', exact: true })
    .click()
  await page.getByLabel('Nombre del proyecto', { exact: true }).fill(name)
  await page
    .getByRole('button', { name: 'Crear proyecto', exact: true })
    .click()
  await page.getByRole('button', { name, exact: true }).click()
  await page.getByRole('link', { name: 'Usuarios', exact: true }).click()
  await page.getByRole('button', { name: 'Crear usuario', exact: true }).click()
  await page.getByLabel('Nombre del usuario', { exact: true }).fill(name)
  await page.getByLabel('Email del usuario', { exact: true }).fill(email)
  await page.getByLabel('Contraseña nueva', { exact: true }).fill(password)
  await page.getByLabel('Rol', { exact: true }).selectOption('viewer')
  await page
    .getByLabel('Acceso a proyectos', { exact: true })
    .selectOption('selected')
  await page.getByLabel('Buscar proyectos para el usuario').fill(name)
  await expect(page.getByRole('checkbox', { name, exact: true })).toBeChecked()
  await page.screenshot({
    path: 'artifacts/user-role-editor.png',
    animations: 'disabled',
  })
  await page
    .getByRole('button', { name: 'Guardar usuario', exact: true })
    .click()
  const row = page.getByRole('row').filter({ hasText: email })
  await expect(row.getByText('viewer', { exact: true })).toBeVisible()
  const context = await browser.newContext()
  const viewer = await context.newPage()
  try {
    await viewer.goto('http://127.0.0.1:5173')
    await viewer.getByLabel('Email', { exact: true }).fill(email)
    await viewer.getByLabel('Contraseña', { exact: true }).fill(password)
    await viewer.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(
      viewer.getByRole('combobox', { name: 'Proyecto activo' }),
    ).toContainText(name)
    await expect(
      viewer.getByRole('link', { name: 'Usuarios', exact: true }),
    ).toHaveCount(0)
    await expect(
      viewer.getByRole('link', { name: 'Proyectos', exact: true }),
    ).toHaveCount(0)
    await viewer.getByRole('combobox', { name: 'Proyecto activo' }).click()
    await expect(viewer.getByRole('option')).toHaveCount(1)
    await viewer.keyboard.press('Escape')
    await viewer.getByRole('link', { name: 'Customers', exact: true }).click()
    await expect(
      viewer.getByRole('button', { name: 'Nuevo customer' }),
    ).toHaveCount(0)
    await viewer.reload()
    await expect(
      viewer.getByRole('button', { name: 'Nuevo customer' }),
    ).toHaveCount(0)
  } finally {
    await context.close()
  }
  await row.getByRole('button', { name: `Acciones de ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Editar acceso' }).click()
  await page.getByLabel('Rol', { exact: true }).selectOption('member')
  await page
    .getByLabel('Acceso a proyectos', { exact: true })
    .selectOption('all')
  await page.getByRole('button', { name: 'Guardar acceso' }).click()
  await expect(row.getByText('member', { exact: true })).toBeVisible()
  await expect(row.getByText('Todos', { exact: true })).toBeVisible()
})

import { test, expect, env } from './fixtures'

test('observability filters real API logs, opens details and pauses updates', async ({
  page,
}) => {
  const name = `Logs ${Date.now()}`
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
  await page.getByRole('link', { name: 'Observabilidad', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Observabilidad', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('group', { name: 'Origen de registros' })
    .getByRole('button', { name: 'API', exact: true })
    .click()
  const entry = page
    .getByRole('button', { name: 'GET /v1/overview', exact: true })
    .first()
  await expect(entry).toBeVisible()
  await entry.click()
  const detail = page.getByRole('dialog')
  await expect(
    detail.getByRole('heading', { name: 'Detalle del registro' }),
  ).toBeVisible()
  await expect(detail.getByText('Request ID', { exact: true })).toBeVisible()
  await expect(detail.getByText('Duración', { exact: true })).toBeVisible()
  await detail.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.getByRole('button', { name: 'Solo errores' }).click()
  await expect(page.getByText('Sin registros', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Solo errores' }).click()
  await page.getByLabel('Buscar registros').fill('/v1/overview')
  await expect(entry).toBeVisible()
  await page.getByRole('button', { name: 'Pausar', exact: true }).click()
  await expect(page.getByText('En pausa', { exact: true })).toBeVisible()
  await page.screenshot({
    path: 'artifacts/observability.png',
    animations: 'disabled',
  })
  const avatar = page
    .getByRole('button', { name: 'Menú de usuario' })
    .getByRole('img')
  const before = await avatar.innerHTML()
  await page.getByRole('button', { name: 'Menú de usuario' }).click()
  await page.getByRole('menuitem', { name: 'Generar otro avatar' }).click()
  await page.keyboard.press('Escape')
  await expect.poll(() => avatar.innerHTML()).not.toBe(before)
  await page.reload()
  await expect(avatar).toBeVisible()
  await expect(avatar).not.toHaveJSProperty('innerHTML', before)
})

import { test, expect, env } from './fixtures'

test('project identity saves the name, logo and hosted-link appearance', async ({
  page,
}) => {
  const name = `Brand ${Date.now()}`
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
  await page.getByRole('link', { name: 'Configuración', exact: true }).click()
  await page
    .getByLabel('Nombre del proyecto', { exact: true })
    .fill(`${name} renamed`)
  await page.getByLabel('Subir logo', { exact: true }).setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await page.getByLabel('Color de acento', { exact: true }).fill('#2563eb')
  await page.getByLabel('Tema del enlace', { exact: true }).selectOption('dark')
  await expect(page.getByAltText('Logo del proyecto')).toBeVisible()
  const updated = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/project') &&
      response.request().method() === 'PATCH',
  )
  await page
    .getByRole('button', { name: 'Guardar cambios', exact: true })
    .click()
  expect((await updated).status()).toBe(200)
  await page.reload()
  await expect(
    page.getByLabel('Nombre del proyecto', { exact: true }),
  ).toHaveValue(`${name} renamed`)
  await expect(page.getByLabel('Tema del enlace', { exact: true })).toHaveValue(
    'dark',
  )
  await expect(page.getByLabel('Color de acento', { exact: true })).toHaveValue(
    '#2563eb',
  )
  await expect(page.getByAltText('Logo del proyecto')).toBeVisible()
  const active = page.getByRole('combobox', { name: 'Proyecto activo' })
  await expect(
    active.getByRole('img', { name: `Logo de ${name} renamed` }),
  ).toBeVisible()
  await expect
    .poll(() =>
      active
        .getByRole('img')
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0)
  await active.click()
  const option = page.getByRole('option').filter({ hasText: `${name} renamed` })
  await expect(option.getByRole('img')).toBeVisible()
  await expect(option).not.toContainText('tenant_')
  await page.keyboard.press('Escape')
  await page.screenshot({
    path: 'artifacts/project-branding.png',
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Quitar logo' }).click()
  const removed = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/project') &&
      response.request().method() === 'PATCH',
  )
  await page
    .getByRole('button', { name: 'Guardar cambios', exact: true })
    .click()
  expect((await removed).status()).toBe(200)
  await page.reload()
  await expect(page.getByAltText('Logo del proyecto')).toHaveCount(0)
})

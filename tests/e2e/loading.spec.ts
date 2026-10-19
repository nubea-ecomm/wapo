import { test, expect, env } from './fixtures'

test('customers distinguish initial loading, pending deletion and an empty list', async ({
  page,
}) => {
  let releaseList!: () => void
  const listReady = new Promise<void>((resolve) => {
    releaseList = resolve
  })
  let releaseDelete!: () => void
  const deleteReady = new Promise<void>((resolve) => {
    releaseDelete = resolve
  })
  let deleted = false

  await page.route('**/v1/customers', async (route) => {
    await listReady
    await route.fulfill({
      json: {
        data: deleted
          ? []
          : [
              {
                id: 'cus_loading_test',
                name: 'Loading example',
                email: 'example@example.com',
              },
            ],
      },
    })
  })
  await page.route('**/v1/customers/cus_loading_test', async (route) => {
    await deleteReady
    deleted = true
    await route.fulfill({ status: 204 })
  })
  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill(env.ADMIN_EMAIL)
  await page.getByLabel('Contraseña', { exact: true }).fill(env.ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.getByRole('link', { name: 'Customers', exact: true }).click()
  await expect(
    page.getByRole('status', { name: 'Cargando contenido' }),
  ).toBeVisible()
  await expect(
    page.getByText('Sin customers', { exact: true }),
  ).not.toBeVisible()
  await page.screenshot({
    path: 'artifacts/customers-loading.png',
    animations: 'disabled',
  })
  releaseList()
  await expect(
    page.getByRole('status', { name: 'Cargando contenido' }),
  ).not.toBeVisible()
  await page
    .getByRole('button', { name: 'Acciones de Loading example' })
    .click()
  await page.getByRole('menuitem', { name: 'Eliminar customer' }).click()
  const dialog = page.getByRole('alertdialog')

  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: 'Procesando…' }),
  ).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  releaseDelete()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByText('Sin customers', { exact: true })).toBeVisible()
})

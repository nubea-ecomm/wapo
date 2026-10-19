import { test, expect, env } from './fixtures'

test('language preference updates translated product copy across the console', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill(env.ADMIN_EMAIL)
  await page.getByLabel('Contraseña', { exact: true }).fill(env.ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page
    .getByRole('button', { name: /Menú de usuario|User menu|Menu do usuário/ })
    .click()
  await page
    .getByRole('menuitem', { name: /Editar perfil|Edit profile/ })
    .click()
  const profile = page.getByRole('dialog', {
    name: /Tu perfil|Your profile|Seu perfil/,
  })

  await profile.getByLabel(/Idioma|Language/).selectOption('en')
  await profile
    .getByRole('button', {
      name: /Guardar cambios|Save changes|Salvar alterações/,
    })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Overview', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Messaging summary.', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Sent', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Messages by day' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'User menu' }).click()
  await page.getByRole('menuitem', { name: 'Edit profile' }).click()
  const englishProfile = page.getByRole('dialog', { name: 'Your profile' })

  await englishProfile.getByLabel('Language').selectOption('es')
  await englishProfile.getByRole('button', { name: 'Save changes' }).click()
  await expect(
    page.getByRole('heading', { name: 'Vista general', exact: true }),
  ).toBeVisible()
})

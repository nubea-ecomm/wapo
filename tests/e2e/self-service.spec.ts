import { test, expect, env } from './fixtures'

test('public registration, verification and recovery forms use the authentication API', async ({
  page,
}) => {
  const calls: { path: string; body: unknown }[] = []

  await page.route('**/auth/v1/**', async (route) => {
    const request = route.request()

    calls.push({
      path: new URL(request.url()).pathname,
      body: request.postDataJSON(),
    })
    await route.fulfill({ json: { data: { accepted: true } } })
  })
  await page.goto('/')
  await page.getByRole('link', { name: 'Crear cuenta', exact: true }).click()
  await page.getByLabel('Nombre', { exact: true }).fill('New owner')
  await page.getByLabel('Email', { exact: true }).fill('owner@example.com')
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('new-account-password-123')
  await page.getByRole('button', { name: 'Crear tu cuenta' }).click()
  await expect(page.getByText(/Revisa tu correo/)).toBeVisible()
  expect(calls.at(-1)).toEqual({
    path: '/auth/v1/register',
    body: {
      name: 'New owner',
      email: 'owner@example.com',
      password: 'new-account-password-123',
    },
  })
  await page.goto('/#/confirm?cnf=fake-confirm-token')
  await page.getByRole('button', { name: 'Verificar correo' }).click()
  await expect(page.getByText(/Correo verificado/)).toBeVisible()
  expect(calls.at(-1)).toEqual({
    path: '/auth/v1/confirm',
    body: { token: 'fake-confirm-token' },
  })
  await page.goto('/#/recover')
  await page.getByLabel('Email', { exact: true }).fill('owner@example.com')
  await page.getByRole('button', { name: 'Recuperar contraseña' }).click()
  await expect(page.getByText(/Revisa tu correo/)).toBeVisible()
  await page.goto('/#/recover/end?token=fake-reset-token')
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('replacement-password-123')
  await page.getByRole('button', { name: 'Nueva contraseña' }).click()
  await expect(page.getByText(/Contraseña actualizada/)).toBeVisible()
  expect(calls.at(-1)).toEqual({
    path: '/auth/v1/recover/end',
    body: { token: 'fake-reset-token', password: 'replacement-password-123' },
  })
})

test('verified scoped account creates its first project and manages its own team', async ({
  page,
  request,
}) => {
  const email = `self-service-${Date.now()}@example.com`
  const headers = { 'X-API-Key': env.ADMIN_API_KEY }
  const created = await request.post('http://localhost:8080/admin/v1/users', {
    headers,
    data: {
      name: 'Workspace owner',
      email,
      password: 'self-service-password-123',
      role: 'member',
      all_projects: false,
      project_ids: [],
    },
  })

  expect(created.status()).toBe(201)
  const user = await created.json()
  let project = ''

  try {
    await page.goto('/')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page
      .getByLabel('Contraseña', { exact: true })
      .fill('self-service-password-123')
    await page
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Crea tu primer proyecto' }),
    ).toBeVisible()
    await page.getByLabel('Nombre del proyecto').fill('My new workspace')
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith('/auth/v1/projects') &&
        response.request().method() === 'POST',
    )

    await page
      .getByRole('button', { name: 'Crear proyecto', exact: true })
      .click()
    const result = await response

    expect(result.status()).toBe(201)
    project = (await result.json()).data.id
    await expect(
      page.getByRole('heading', { name: 'Vista general', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Usuarios', exact: true }),
    ).toHaveCount(0)
    await page.getByRole('link', { name: 'Equipo', exact: true }).click()
    await expect(page.getByRole('row').filter({ hasText: email })).toBeVisible()
    await page.route('**/v1/members', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()

      expect(route.request().headers()['x-tenant-id']).toBe(project)
      expect(route.request().postDataJSON()).toEqual({
        email: 'teammate@example.com',
        role: 'viewer',
      })
      await route.fulfill({
        status: 201,
        json: { data: { id: 'fake-invitation' } },
      })
    })
    await page.getByLabel('Email del invitado').fill('teammate@example.com')
    await page.getByLabel('Rol del invitado').selectOption('viewer')
    await page.getByRole('button', { name: 'Enviar invitación' }).click()
    await expect(page.getByText(/Invitación enviada/)).toBeVisible()
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Equipo', exact: true }),
    ).toBeVisible()
    await page
      .getByRole('link', { name: 'Seguridad de la cuenta', exact: true })
      .click()
    await expect(page.getByText(/Esta sesión/)).toBeVisible()
  } finally {
    if (project)
      await request.delete(
        `http://localhost:8080/admin/v1/tenants/${project}`,
        { headers },
      )

    await request.delete(
      `http://localhost:8080/admin/v1/users/${user.data.id}`,
      { headers },
    )
  }
})

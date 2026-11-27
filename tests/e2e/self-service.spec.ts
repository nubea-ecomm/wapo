import { test, expect, env } from './fixtures'

const signedIn = {
  token: 'wapo_session_fake',
  expires_at: '2099-01-01T00:00:00Z',
  user: {
    id: 'user_fake',
    email: 'owner@example.com',
    name: 'New owner',
    language: 'es',
    avatar_variant: 0,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    role: 'member',
    all_projects: false,
    project_ids: [],
  },
}

test('registration signs in at once and recovery forms use the authentication API', async ({
  page,
}) => {
  const calls: { path: string; body: unknown }[] = []

  await page.route('**/admin/v1/tenants', (route) =>
    route.fulfill({ json: { data: [] } }),
  )
  await page.route('**/auth/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname

    calls.push({ path, body: request.postDataJSON() })
    await route.fulfill({
      json: {
        data: path === '/auth/v1/register' ? signedIn : { accepted: true },
      },
    })
  })
  await page.goto('/')
  await expect(page.getByText('Reenviar verificación')).toHaveCount(0)
  await page.getByRole('link', { name: 'Crear cuenta', exact: true }).click()
  await page.getByLabel('Nombre', { exact: true }).fill('New owner')
  await page.getByLabel('Email', { exact: true }).fill('owner@example.com')
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('new-account-password-123')
  await page.getByRole('button', { name: 'Crear tu cuenta' }).click()
  // No verification email: the new account goes straight to its first project.
  await expect(
    page.getByRole('heading', { name: 'Crea tu primer proyecto' }),
  ).toBeVisible()
  expect(calls.find((call) => call.path === '/auth/v1/register')).toEqual({
    path: '/auth/v1/register',
    body: {
      name: 'New owner',
      email: 'owner@example.com',
      password: 'new-account-password-123',
      language: 'es',
    },
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

test('an invitation link creates the account and joins the project in one step', async ({
  page,
}) => {
  let registration: unknown

  await page.route('**/auth/v1/project-invitations/invite_fake', (route) =>
    route.fulfill({
      json: {
        data: {
          email: 'owner@example.com',
          project_name: 'Acme',
          role: 'member',
          expires_at: '2099-01-01T00:00:00Z',
          account_exists: false,
        },
      },
    }),
  )
  await page.route('**/auth/v1/register', async (route) => {
    registration = route.request().postDataJSON()
    await route.fulfill({
      json: {
        data: {
          ...signedIn,
          invitation: { project_id: 'tenant_acme', accepted: true },
        },
      },
    })
  })
  await page.route('**/admin/v1/tenants', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 'tenant_acme',
            name: 'Acme',
            status: 'active',
            created_at: '2026-01-01T00:00:00Z',
            active_keys: 0,
          },
        ],
      },
    }),
  )
  await page.goto('/#/join-project?token=invite_fake')
  await expect(page.getByText('Únete a Acme')).toBeVisible()
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(
    'owner@example.com',
  )
  await page.getByLabel('Nombre', { exact: true }).fill('New owner')
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('new-account-password-123')
  await page.getByRole('button', { name: 'Crear cuenta y unirme' }).click()
  await expect(page).toHaveURL(/#\/$/)
  expect(registration).toEqual({
    name: 'New owner',
    email: 'owner@example.com',
    password: 'new-account-password-123',
    language: 'es',
    invitation_token: 'invite_fake',
  })
})

test('scoped account creates its first project and manages its own team', async ({
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
    await page
      .getByRole('link', { name: 'Seguridad de la cuenta', exact: true })
      .click()
    await expect(page.getByRole('dialog', { name: 'Tu perfil' })).toBeVisible()
    await expect(
      page.getByRole('tab', { name: 'Seguridad', exact: true }),
    ).toHaveAttribute('data-state', 'active')
    await page.goto('/#/')
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
    await page
      .getByRole('button', { name: 'Invitar miembro', exact: true })
      .click()
    await page.getByLabel('Email del invitado').fill('teammate@example.com')
    await page.getByLabel('Rol del invitado').click()
    await page
      .getByRole('option', { name: 'Solo lectura', exact: true })
      .click()
    await page.getByRole('button', { name: 'Enviar invitación' }).click()
    await expect(page.getByText(/Invitación enviada/)).toBeVisible()
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Equipo', exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Menú de usuario' }).click()
    await page.getByRole('menuitem', { name: 'Editar perfil' }).click()
    await page.getByRole('tab', { name: 'Seguridad', exact: true }).click()
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

import { test, expect } from '@playwright/test'

test('team uses empty/table states and invitation/role dialogs without resizing selects', async ({
  page,
}) => {
  const user = {
    id: 'owner',
    name: 'Owner',
    email: 'owner@example.invalid',
    role: 'admin',
    all_projects: true,
    active: true,
    language: 'es',
    project_ids: [],
    created_at: new Date().toISOString(),
  }

  type Member = {
    id: string
    name: string
    email: string
    role: string
    active: boolean
    created_at: string
  }
  let members: Member[] = []

  await page.addInitScript(
    (user) =>
      sessionStorage.setItem(
        'wapo.console-session',
        JSON.stringify({
          id: 'test',
          key: 'fake-session',
          url: 'http://localhost:8080',
          role: 'operator',
          tenantId: 'team-project',
          tenantName: 'Team project',
          user,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        }),
      ),
    user,
  )
  await page.route('http://localhost:8080/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname

    if (path === '/auth/v1/me')
      return route.fulfill({ json: { data: { user } } })

    if (path === '/admin/v1/tenants')
      return route.fulfill({
        json: {
          data: [
            { id: 'team-project', name: 'Team project', status: 'active' },
          ],
        },
      })

    if (path === '/v1/members' && request.method() === 'GET')
      return route.fulfill({ json: { data: members } })

    if (path === '/v1/members' && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual({
        email: 'invitee@example.invalid',
        role: 'viewer',
      })

      return route.fulfill({
        status: 201,
        json: { data: { id: 'fake-invitation' } },
      })
    }

    if (path.startsWith('/v1/members/') && request.method() === 'PATCH') {
      members = members.map((member) =>
        member.id === path.split('/').at(-1)
          ? { ...member, role: request.postDataJSON().role }
          : member,
      )

      return route.fulfill({ json: { data: { updated: true } } })
    }

    return route.fulfill({ json: { data: [] } })
  })
  await page.goto('/#/members')
  await expect(
    page.getByText('Todavía no hay miembros', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Invitar miembro', exact: true }),
  ).toHaveCount(2)
  await page
    .getByRole('button', { name: 'Invitar miembro', exact: true })
    .last()
    .click()
  const dialog = page.getByRole('dialog', { name: 'Invitar miembro' })

  await dialog.getByLabel('Email del invitado').fill('invitee@example.invalid')
  const before = await dialog.evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
  }))

  await dialog.getByLabel('Rol del invitado').click()
  await expect(
    page.getByRole('option', { name: 'Solo lectura', exact: true }),
  ).toBeVisible()
  expect(
    await dialog.evaluate((element) => ({
      width: element.clientWidth,
      height: element.clientHeight,
    })),
  ).toEqual(before)
  await page.getByRole('option', { name: 'Solo lectura', exact: true }).click()
  await dialog.getByRole('button', { name: 'Enviar invitación' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText(/Invitación enviada/)).toBeVisible()
  members = [
    { ...user, role: 'admin' },
    {
      id: 'viewer',
      name: 'Viewer',
      email: 'viewer@example.invalid',
      role: 'viewer',
      active: false,
      created_at: new Date().toISOString(),
    },
  ]
  await page.reload()
  await expect(
    page.getByRole('row').filter({ hasText: 'viewer@example.invalid' }),
  ).toBeVisible()
  await page.getByLabel('Filtrar por estado').click()
  await page.getByRole('option', { name: 'Inactivo', exact: true }).click()
  await expect(
    page.getByRole('row').filter({ hasText: 'owner@example.invalid' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Acciones: Viewer' }).click()
  await page.getByRole('menuitem', { name: 'Editar acceso' }).click()
  await page
    .getByRole('dialog', { name: 'Editar acceso' })
    .getByLabel('Rol', { exact: true })
    .click()
  await page.getByRole('option', { name: 'Miembro', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Editar acceso' })
    .getByRole('button', { name: 'Guardar cambios' })
    .click()
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: 'viewer@example.invalid' })
      .getByText('Miembro', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('select')).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: 'Seguridad de la cuenta', exact: true }),
  ).toHaveCount(0)
})

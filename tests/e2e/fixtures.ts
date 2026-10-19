import { test as base, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
export const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const at = line.indexOf('=')
      return [line.slice(0, at), line.slice(at + 1)]
    }),
)
// Only remove records created by this test, even when a browser assertion fails.
export const test = base.extend<{ cleanupRecords: void }>({
  cleanupRecords: [
    async ({ page, request }, use) => {
      const records: { path: string; id: string }[] = []
      const pending: Promise<void>[] = []
      page.on('response', (response) => {
        const path = new URL(response.url()).pathname
        if (
          response.status() !== 201 ||
          response.request().method() !== 'POST' ||
          !['/admin/v1/tenants', '/admin/v1/users'].includes(path)
        )
          return
        pending.push(
          response.json().then((body) => {
            records.push({ path, id: body.data.id })
          }),
        )
      })
      await use()
      await Promise.all(pending)
      for (const record of records.reverse()) {
        const response = await request.delete(
          `http://localhost:8080${record.path}/${encodeURIComponent(record.id)}`,
          { headers: { 'X-API-Key': env.ADMIN_API_KEY } },
        )
        expect([204, 404]).toContain(response.status())
      }
    },
    { auto: true },
  ],
})
export { expect }

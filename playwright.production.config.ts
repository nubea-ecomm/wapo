import { defineConfig } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
  ...base,
  testDir: './tests/frontend-production',
  webServer: undefined,
  use: {
    ...base.use,
    baseURL: process.env.WAPO_FRONTEND_TEST_URL || 'http://127.0.0.1:4173',
  },
})

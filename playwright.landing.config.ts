import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

export default defineConfig({
  testDir: './tests/landing',
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:4322',
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath:
        process.env.CHROME_PATH ||
        (existsSync(
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        )
          ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
          : undefined),
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'pnpm --filter @wapo/landing exec astro preview --ignore-lock --host 127.0.0.1 --port 4322',
    url: 'http://127.0.0.1:4322',
    reuseExistingServer: false,
  },
  reporter: 'list',
})

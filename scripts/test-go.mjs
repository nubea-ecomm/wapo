import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const local = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const at = line.indexOf('=')

      return [line.slice(0, at), line.slice(at + 1)]
    }),
)
const database =
  process.env.WAPO_TEST_DATABASE_URL ||
  `postgres://wapo:${encodeURIComponent(local.POSTGRES_PASSWORD || 'wapo-local-only')}@postgres:5432/wapo?sslmode=disable`
const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--network',
    'wapo_default',
    '-e',
    `TEST_DATABASE_URL=${database}`,
    '-v',
    `${process.cwd()}/apps/server:/src`,
    '-v',
    'wapo-go-cache:/go/pkg',
    '-v',
    'wapo-go-build:/root/.cache/go-build',
    '-w',
    '/src',
    'golang:1.26-alpine',
    'sh',
    '-c',
    'go test -count=1 ./... && go vet ./...',
  ],
  { stdio: 'inherit' },
)

if (result.error) throw result.error

process.exitCode = result.status ?? 1

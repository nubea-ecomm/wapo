import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const { version } = JSON.parse(
  readFileSync('packages/sdk/package.json', 'utf8'),
)

test('accepts the tag matching the SDK package version', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/check-sdk-release.mjs', `sdk-v${version}`],
    { encoding: 'utf8' },
  )

  assert.equal(result.status, 0, result.stderr)
})

test('rejects a release tag with another SDK version', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/check-sdk-release.mjs', 'sdk-v9.9.9'],
    {
      encoding: 'utf8',
    },
  )

  assert.notEqual(result.status, 0)
  assert.match(
    result.stderr,
    new RegExp(`does not match sdk-v${version.replaceAll('.', '\\.')}`),
  )
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { validateMigrations } from './check-migrations.mjs'

test('accepts the immutable historical version 012 pair', () => {
  assert.deepEqual(
    validateMigrations([
      '011_operations.sql',
      '012_conversation_customers.sql',
      '012_user_profile.sql',
      '013_public_api_hot_paths.sql',
    ]),
    [],
  )
})

test('rejects new duplicate versions', () => {
  assert.match(
    validateMigrations(['013_first.sql', '013_second.sql']).join('\n'),
    /version 013 is duplicated/,
  )
})

test('rejects malformed names and sequence gaps', () => {
  const errors = validateMigrations([
    '1_bad.sql',
    '013_valid.sql',
    '015_next.sql',
  ])

  assert.match(errors.join('\n'), /expected NNN_snake_case\.sql/)
  assert.match(errors.join('\n'), /sequence jumps from 013 to 015/)
})

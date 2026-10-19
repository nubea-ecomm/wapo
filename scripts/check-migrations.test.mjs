import assert from 'node:assert/strict'
import test from 'node:test'
import { validateMigrations } from './check-migrations.mjs'

test('accepts the immutable historical version 012 pair', () => {
  assert.deepEqual(
    validateMigrations([
      '001_initial.sql',
      '002_management.sql',
      '003_whatsapp.sql',
      '004_users.sql',
      '005_deleted.sql',
      '006_branding.sql',
      '007_logos.sql',
      '008_logs.sql',
      '009_permissions.sql',
      '010_templates.sql',
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
    validateMigrations(['001_first.sql', '001_second.sql']).join('\n'),
    /version 001 is duplicated/,
  )
})

test('rejects malformed names and sequence gaps', () => {
  const errors = validateMigrations([
    '1_bad.sql',
    '001_valid.sql',
    '003_next.sql',
  ])

  assert.match(errors.join('\n'), /expected NNN_snake_case\.sql/)
  assert.match(errors.join('\n'), /sequence jumps from 001 to 003/)
})

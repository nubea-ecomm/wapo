import { readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const legacyDuplicateVersions = new Map([
  [12, new Set(['012_conversation_customers.sql', '012_user_profile.sql'])],
])

export function validateMigrations(names) {
  const errors = []
  const versions = new Map()

  for (const name of [...names].sort()) {
    const match = /^(\d{3})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/.exec(name)

    if (!match) {
      errors.push(`${name}: expected NNN_snake_case.sql`)
      continue
    }

    const version = Number(match[1])
    const entries = versions.get(version) || []

    entries.push(name)
    versions.set(version, entries)
  }

  for (const [version, entries] of versions) {
    if (entries.length < 2) continue

    const allowed = legacyDuplicateVersions.get(version)

    if (
      !allowed ||
      entries.length !== allowed.size ||
      entries.some((entry) => !allowed.has(entry))
    ) {
      errors.push(
        `migration version ${String(version).padStart(3, '0')} is duplicated: ${entries.join(', ')}`,
      )
    }
  }

  const ordered = [...versions.keys()].sort((a, b) => a - b)

  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index] !== ordered[index - 1] + 1) {
      errors.push(
        `migration sequence jumps from ${String(ordered[index - 1]).padStart(3, '0')} to ${String(ordered[index]).padStart(3, '0')}`,
      )
    }
  }

  return errors
}

const currentFile = fileURLToPath(import.meta.url)

if (process.argv[1] && currentFile === process.argv[1]) {
  const directory = join(process.cwd(), 'apps/server/migrations')
  const names = readdirSync(directory).filter((name) => name.endsWith('.sql'))
  const errors = validateMigrations(names)

  if (errors.length) {
    console.error(errors.join('\n'))
    process.exitCode = 1
  } else {
    console.log(
      `Validated ${names.length} migrations in ${basename(directory)}/`,
    )
  }
}

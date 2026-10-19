import { readFileSync } from 'node:fs'

const expectedName = '@nubea-ecomm/wapo-sdk'
// The release workflow passes the tag explicitly. Do not infer GITHUB_REF_NAME:
// pull-request refs such as "11/merge" are not SDK release tags.
const tag = process.argv[2] || ''
const manifest = JSON.parse(
  readFileSync(
    new URL('../packages/sdk/package.json', import.meta.url),
    'utf8',
  ),
)

if (manifest.name !== expectedName) {
  throw new Error(
    `expected SDK package name ${expectedName}, got ${manifest.name}`,
  )
}

if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
  throw new Error(`SDK version must be stable semver, got ${manifest.version}`)
}

const expectedTag = `sdk-v${manifest.version}`

if (tag && tag !== expectedTag) {
  throw new Error(`release tag ${tag} does not match ${expectedTag}`)
}

console.log(
  `${manifest.name}@${manifest.version}${tag ? ` matches ${tag}` : ''}`,
)

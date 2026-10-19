import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve('packages/docs/vendor')

await mkdir(output, { recursive: true })
await copyFile(
  resolve('node_modules/@scalar/api-reference/dist/browser/standalone.js'),
  resolve(output, 'scalar.js'),
)

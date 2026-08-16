/** Cross-platform removal of generated build products. */

import { readdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const buildInfo = (await readdir(root))
  .filter((name) => name.endsWith('.tsbuildinfo'))
  .map((name) => rm(resolve(root, name), { force: true }))
await Promise.all([
  rm(resolve(root, 'dist-macos'), { recursive: true, force: true }),
  rm(resolve(root, 'dist-windows'), { recursive: true, force: true }),
  ...buildInfo,
])

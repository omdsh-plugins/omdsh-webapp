import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { SYSTEM_PATH_DIRS, launchPath, resolveOnPath, stableNodePath, stableSearchPath } from '../src/paths.ts'

const staging = await mkdtemp(join(tmpdir(), 'omdsh-webapp-paths-'))
afterAll(async () => { await rm(staging, { recursive: true, force: true }) })

describe('resolveOnPath', () => {
  it('answers the first entry holding an executable of that name', async () => {
    const first = join(staging, 'first')
    const second = join(staging, 'second')
    await mkdir(first, { recursive: true })
    await mkdir(second, { recursive: true })
    // A file of the right name that cannot be run is not the answer.
    await writeFile(join(first, 'dsh'), '')
    await chmod(join(first, 'dsh'), 0o644)
    await writeFile(join(second, 'dsh'), '')
    await chmod(join(second, 'dsh'), 0o755)

    expect(resolveOnPath('dsh', [first, second].join(':'))).toBe(join(second, 'dsh'))
    expect(resolveOnPath('dsh', ['', join(staging, 'absent')].join(':'))).toBeUndefined()
  })
})

describe('stableNodePath', () => {
  it('prefers a PATH entry that resolves to the running binary over the binary itself', async () => {
    const real = join(staging, 'versioned')
    const alias = join(staging, 'alias')
    await mkdir(real, { recursive: true })
    await mkdir(alias, { recursive: true })
    await writeFile(join(real, 'node'), '')
    await chmod(join(real, 'node'), 0o755)
    await symlink(join(real, 'node'), join(alias, 'node'))

    expect(stableNodePath(join(real, 'node'), alias)).toBe(join(alias, 'node'))
  })

  it('falls back to the binary when no entry resolves to it', async () => {
    const only = join(staging, 'only')
    await mkdir(only, { recursive: true })
    await writeFile(join(only, 'node'), '')

    expect(stableNodePath(join(only, 'node'), join(staging, 'absent'))).toBe(join(only, 'node'))
  })
})

describe('stableSearchPath', () => {
  it('drops what the build was handed but the bundle would outlive', () => {
    const inherited = [
      '/Users/me/project/node_modules/.bin',
      '/Users/me/Library/pnpm/store/v11/links/@/pnpm/11.7.0/583f18d/bin',
      '/opt/homebrew/bin',
      '',
      '/usr/bin',
    ].join(':')

    expect(stableSearchPath(inherited)).toBe('/opt/homebrew/bin:/usr/bin')
  })

  it('keeps an ordinary directory that merely mentions a store', () => {
    expect(stableSearchPath('/opt/store/bin:/usr/bin')).toBe('/opt/store/bin:/usr/bin')
  })
})

describe('launchPath', () => {
  it('leads with the tools\' directories, deduplicated, then the system ones', () => {
    expect(launchPath(['/opt/homebrew/bin/node', '/opt/homebrew/bin/dsh', '/usr/bin/pnpm'])).toEqual([
      '/opt/homebrew/bin',
      '/usr/bin',
      '/usr/local/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
    ])
  })

  it('holds every system directory even when no tool was resolved', () => {
    expect(launchPath([])).toEqual([...SYSTEM_PATH_DIRS])
  })
})

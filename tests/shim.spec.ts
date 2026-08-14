import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { SCRIPT_NAME } from '../src/bundle.ts'
import { compileShim, shimSource } from '../src/shim.ts'

const staging = await mkdtemp(join(tmpdir(), 'omdsh-webapp-shim-'))
afterAll(async () => { await rm(staging, { recursive: true, force: true }) })

/** Whether this machine can build the executable at all. */
const swift = spawnSync('swiftc', ['--version'], { encoding: 'utf8' }).status === 0

describe('shimSource', () => {
  it('runs the launch script the bundle ships', () => {
    expect(shimSource()).toContain(`appendingPathComponent("${SCRIPT_NAME}")`)
  })

  it('ends every activation in the same tab-raising run', () => {
    const source = shimSource()
    expect(source).toContain('func applicationShouldHandleReopen')
    expect(source).toContain('func applicationDidBecomeActive')
    expect(source).toContain('spawn(["focus"])')
  })

  it('routes a signal through the orderly quit, which is what stops the server', () => {
    const source = shimSource()
    expect(source).toContain('[SIGTERM, SIGINT].map(quitOn)')
    expect(source).toContain('NSApp.terminate(nil)')
    expect(source).toContain('func applicationWillTerminate')
  })
})

describe.skipIf(!swift)('compileShim', () => {
  it('builds an executable macOS binary', async () => {
    const destination = join(staging, 'dsh-web')
    await expect(compileShim(destination)).resolves.toBe(true)
    const described = spawnSync('file', [destination], { encoding: 'utf8' })
    expect(described.stdout).toContain('Mach-O')
    expect(described.stdout).toContain('executable')
  }, 120_000)
})

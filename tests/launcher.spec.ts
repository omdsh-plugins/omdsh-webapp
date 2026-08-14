import { spawnSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { URL_LINE_PREFIX, launcherScript, shellQuote } from '../src/launcher.ts'

const staging = await mkdtemp(join(tmpdir(), 'omdsh-webapp-launcher-'))
afterAll(async () => { await rm(staging, { recursive: true, force: true }) })

/** A launcher with the defaults a plain `pnpm run package:mac` produces. */
function script(overrides: Partial<Parameters<typeof launcherScript>[0]> = {}): string {
  return launcherScript({
    dsh: '/opt/homebrew/bin/dsh',
    profile: 'web',
    webArgs: [],
    path: ['/opt/homebrew/bin', '/usr/bin', '/bin'],
    appName: 'DSH Web',
    ...overrides,
  })
}

/**
 * Write a launcher into a bundle-shaped directory and run it, with `HOME` and
 * the bundle both under the staging directory so nothing touches the real app.
 * @param source - the launcher script.
 * @param args - arguments to run it with.
 * @param home - the `HOME` the run sees.
 * @returns the finished process.
 */
async function runLauncher(source: string, args: readonly string[], home: string) {
  const bundle = await mkdtemp(join(staging, 'bundle-'))
  const resources = join(bundle, 'Contents', 'Resources')
  await mkdir(resources, { recursive: true })
  const path = join(resources, 'start-web')
  await writeFile(path, source)
  await chmod(path, 0o755)
  return spawnSync('/bin/bash', [path, ...args], { encoding: 'utf8', env: { HOME: home }, timeout: 20_000 })
}

describe('shellQuote', () => {
  it('closes, escapes, and reopens around a single quote', () => {
    expect(shellQuote("Hao's DSH")).toBe(String.raw`'Hao'\''s DSH'`)
  })
})

describe('launcherScript', () => {
  it('parses as the system shell, which is bash 3.2', async () => {
    const path = join(staging, 'syntax-check')
    await writeFile(path, script({ webArgs: ['--port', '8080'], dshHome: '/tmp/scratch home' }))
    const result = spawnSync('/bin/bash', ['-n', path], { encoding: 'utf8' })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })

  it('bakes the launcher, the profile, and the PATH a Finder launch inherits none of', () => {
    const source = script()
    expect(source.startsWith('#!/bin/bash\n')).toBe(true)
    expect(source).toContain("DSH='/opt/homebrew/bin/dsh'")
    expect(source).toContain("PROFILE='web'")
    expect(source).toContain("PATH='/opt/homebrew/bin:/usr/bin:/bin'")
    expect(source).toContain('"$DSH" --profile "$PROFILE"')
  })

  it('quotes a name and an argument that would otherwise split', () => {
    const source = script({ appName: "Hao's Web", webArgs: ['--trusted-host', 'my host:3080'] })
    expect(source).toContain(String.raw`APP='Hao'\''s Web'`)
    expect(source).toContain("WEB_ARGS=('--trusted-host' 'my host:3080')")
  })

  it('expands an empty argument array the way bash 3.2 needs under set -u', () => {
    expect(script()).toContain('WEB_ARGS=()')
    expect(script()).toContain('${WEB_ARGS[@]+"${WEB_ARGS[@]}"}')
  })

  it('exports DSH_HOME only when the build pinned one', () => {
    expect(script()).not.toContain('DSH_HOME')
    expect(script({ dshHome: '/opt/dsh-home' })).toContain("DSH_HOME='/opt/dsh-home'\nexport DSH_HOME")
  })

  it('reads the URL out of the line dsh prints when it is serving', () => {
    expect(script()).toContain(shellQuote(`${URL_LINE_PREFIX}[^ ]*`))
    expect(script()).toContain('url="${line#dsh web: }"')
  })
})

describe('the focus mode the executable runs on every activation', () => {
  it('starts nothing when no run has recorded a URL', async () => {
    const home = await mkdtemp(join(staging, 'home-'))
    const result = await runLauncher(script(), ['focus'], home)
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
  })

  it('starts nothing when the recorded URL answers nothing, as a killed run leaves it', async () => {
    const home = await mkdtemp(join(staging, 'home-'))
    await mkdir(join(home, 'Library', 'Logs', 'DSH Web'), { recursive: true })
    await writeFile(join(home, 'Library', 'Logs', 'DSH Web', 'serving-url'), 'http://127.0.0.1:1\n')
    const result = await runLauncher(script(), ['focus'], home)
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
  })
})

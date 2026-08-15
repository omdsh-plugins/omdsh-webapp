import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
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
 * Replace the launcher's alert with a line on stderr. `display alert` blocks on
 * a dialog nobody is there to click, so no spec may run a launcher that can
 * reach it.
 * @param source - the generated launcher.
 * @returns the launcher with its alert silenced.
 */
function withoutDialogs(source: string): string {
  const silenced = source.replace(/^ *\/usr\/bin\/osascript -e "display alert.*$/m, String.raw`  printf 'alert: %s\n' "$1" >&2`)
  if (silenced === source) throw new Error('the launcher no longer alerts the way this helper silences')
  return silenced
}

/**
 * Write a launcher into a bundle-shaped directory and run it, with `HOME` and
 * the bundle both under the staging directory so nothing touches the real app.
 *
 * The two focus scripts are replaced by stubs that record the URL they were
 * asked to raise and answer `focused`, which keeps every browser out of it.
 * @param source - the launcher script.
 * @param args - arguments to run it with.
 * @param home - the `HOME` the run sees.
 * @returns the finished process, and the URLs the stubs were handed.
 */
async function runLauncher(source: string, args: readonly string[], home: string) {
  const bundle = await mkdtemp(join(staging, 'bundle-'))
  const resources = join(bundle, 'Contents', 'Resources')
  await mkdir(resources, { recursive: true })
  const focusLog = join(bundle, 'focused')
  for (const stub of ['focus-chromium', 'focus-safari']) {
    await writeFile(join(resources, `${stub}.applescript`), [
      'on run argv',
      `\tdo shell script "echo " & quoted form of (item (count of argv) of argv) & " >> " & quoted form of "${focusLog}"`,
      '\treturn "focused"',
      'end run',
      '',
    ].join('\n'))
  }
  const path = join(resources, 'start-web')
  await writeFile(path, withoutDialogs(source))
  await chmod(path, 0o755)
  // Spawned rather than run synchronously: a spec that serves the port this
  // launcher probes cannot answer it while the event loop is blocked.
  const result = await new Promise<{ status: number | null, stdout: string, stderr: string }>((resolve, reject) => {
    const child = spawn('/bin/bash', [path, ...args], { env: { HOME: home }, timeout: 30_000 })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (status) => { resolve({ status, stdout, stderr }) })
  })
  const focused = existsSync(focusLog) ? (await readFile(focusLog, 'utf8')).trim().split('\n') : []
  return { ...result, focused }
}

/**
 * A stand-in `dsh` that fails the way a taken port does.
 * @param address - the address the harness would report as in use.
 * @returns the path of the executable written.
 */
async function refusingDsh(address: string): Promise<string> {
  const path = join(await mkdtemp(join(staging, 'dsh-')), 'dsh')
  await writeFile(path, [
    '#!/bin/bash',
    `echo "Error: listen EADDRINUSE: address already in use ${address}" >&2`,
    'exit 1',
    '',
  ].join('\n'))
  await chmod(path, 0o755)
  return path
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

describe('a launch that cannot take its port', () => {
  it('raises the session already holding it, which is what the launch asked for', async () => {
    const server = createServer((_request, response) => { response.writeHead(200); response.end('served') })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    const { port } = server.address() as AddressInfo
    try {
      const home = await mkdtemp(join(staging, 'home-'))
      const result = await runLauncher(script({ dsh: await refusingDsh(`127.0.0.1:${String(port)}`) }), [], home)
      expect(result.status).toBe(0)
      expect(result.focused).toEqual([`http://127.0.0.1:${String(port)}`])
      // Someone else's session is not this run's to record as its own.
      expect(existsSync(join(home, 'Library', 'Logs', 'DSH Web', 'serving-url'))).toBe(false)
    } finally {
      await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
    }
  }, 60_000)

  it('reports a port held by something that answers nothing', async () => {
    const home = await mkdtemp(join(staging, 'home-'))
    // Port 1 is a port nothing on this machine serves.
    const result = await runLauncher(script({ dsh: await refusingDsh('127.0.0.1:1') }), [], home)
    expect(result.status).toBe(1)
    expect(result.focused).toEqual([])
    expect(result.stderr).toContain('alert: Port 1 is held by something that is not serving')
  }, 60_000)
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

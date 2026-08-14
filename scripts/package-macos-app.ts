/**
 * Build a double-clickable macOS `.app` (and a `.dmg` holding it) that boots a
 * harness profile and opens the browser at the URL it prints.
 *
 * The bundle is unsigned and NOT self-contained: its launcher runs the `dsh`
 * installation resolved at build time, under a `PATH` baked in beside it. Moving
 * or removing that installation breaks an already-built bundle — rebuild it.
 * Gatekeeper does not intercept a locally built bundle; a copy carried to
 * another machine through the disk image arrives quarantined, cleared with
 * `xattr -dr com.apple.quarantine <app>`.
 *
 * Usage: `pnpm run package:mac [-- --name <AppName>] [--profile <name>]
 * [--web-arg <arg>]... [--out <dir>] [--bundle-id <id>] [--dsh <path>]
 * [--node <path>] [--dsh-home <path>] [--icon <path.icns|path.png>] [--no-dmg]`
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { buildMacApp } from '../src/build.ts'
import { DEFAULT_APP_NAME, DEFAULT_BUNDLE_ID } from '../src/bundle.ts'
import { launchPath, resolveOnPath, stableNodePath, stableSearchPath } from '../src/paths.ts'

const root = resolve(import.meta.dirname, '..')

/** Where the bundle and disk image land when `--out` is omitted. */
const DEFAULT_OUTPUT = 'dist-macos'
/** Profile the bundle boots when `--profile` is omitted. */
const DEFAULT_PROFILE = 'web'
/** Icon artwork used when `--icon` is omitted. */
const DEFAULT_ICON = 'assets/macos-app-icon.png'
/** Harness home the profile is looked for under, when none is pinned. */
const DEFAULT_DSH_HOME = join(homedir(), '.dsh')

/**
 * The harness release the resolved launcher reports, for the build summary
 * alone — the bundle follows whatever is installed, so this is not baked in.
 * @param dsh - the resolved `dsh` path.
 * @param path - the `PATH` the bundle will run it under.
 * @returns the version, or `undefined` when it could not be asked.
 */
function harnessVersion(dsh: string, path: readonly string[]): string | undefined {
  const result = spawnSync(dsh, ['--version'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: path.join(':') },
  })
  if (result.error !== undefined || result.status !== 0) return undefined
  const version = result.stdout.trim()
  return version === '' ? undefined : version
}

/** Build the bundle named by the flags, and the disk image unless `--no-dmg`. */
async function main(): Promise<void> {
  // pnpm forwards the `--` separator verbatim, and `parseArgs` would read
  // everything after it as a positional.
  const argv = process.argv.slice(2)
  const { values } = parseArgs({
    args: argv[0] === '--' ? argv.slice(1) : argv,
    options: {
      out: { type: 'string' },
      name: { type: 'string' },
      'bundle-id': { type: 'string' },
      profile: { type: 'string' },
      'web-arg': { type: 'string', multiple: true },
      dsh: { type: 'string' },
      node: { type: 'string' },
      'dsh-home': { type: 'string' },
      icon: { type: 'string' },
      // Node's parseArgs has no `--no-` negation of its own, so the flag is
      // declared the way it is spelled.
      'no-dmg': { type: 'boolean', default: false },
    },
    allowPositionals: false,
  })

  if (process.platform !== 'darwin') {
    throw new Error(`package:mac builds on macOS only, ran on ${process.platform}`)
  }

  const searchPath = stableSearchPath(process.env.PATH ?? '')
  const dsh = values.dsh === undefined ? resolveOnPath('dsh', searchPath) : resolve(values.dsh)
  if (dsh === undefined) {
    throw new Error('no `dsh` on PATH — install the harness CLI, or name it with --dsh <path>')
  }
  if (!existsSync(dsh)) throw new Error(`--dsh ${dsh} does not exist`)

  const nodePath = values.node === undefined ? stableNodePath(process.execPath, searchPath) : resolve(values.node)
  if (!existsSync(nodePath)) throw new Error(`--node ${nodePath} does not exist`)

  // `dsh` is an `#!/usr/bin/env node` script, so Node's directory belongs on the
  // path it runs under as much as its own does. Nothing else is baked: booting a
  // profile runs no package manager, and installing plugins into one stays a
  // terminal task.
  const path = launchPath([nodePath, dsh])

  // A launch inherits no environment, so a `DSH_HOME` the build was run under is
  // one the application would otherwise lose.
  const home = values['dsh-home'] ?? process.env.DSH_HOME
  const dshHome = home === undefined ? undefined : resolve(home)
  const profile = values.profile ?? DEFAULT_PROFILE
  const profileDir = join(dshHome ?? DEFAULT_DSH_HOME, 'profiles', profile)
  if (!existsSync(profileDir)) {
    console.warn(`warning: no profile at ${profileDir} — the app will fail to boot until one is there`)
  }

  const appName = values.name ?? DEFAULT_APP_NAME
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: unknown }
  const version = typeof manifest.version === 'string' ? manifest.version : '0.0.0'

  const result = await buildMacApp({
    appName,
    bundleId: values['bundle-id'] ?? DEFAULT_BUNDLE_ID,
    version,
    profile,
    webArgs: values['web-arg'] ?? [],
    dsh,
    path,
    dshHome,
    iconPath: values.icon === undefined ? join(root, DEFAULT_ICON) : resolve(values.icon),
    outputDir: resolve(root, values.out ?? DEFAULT_OUTPUT),
    dmg: !values['no-dmg'],
  })

  if (!result.shimmed) {
    console.warn('warning: no swiftc found — building an agent bundle with no Dock icon')
  }
  const release = harnessVersion(dsh, path)
  console.log(`app:     ${result.appPath}`)
  console.log(`dsh:     ${dsh}${release === undefined ? '' : ` (${release})`}`)
  console.log(`profile: ${profile}${values['web-arg'] === undefined ? '' : ` ${values['web-arg'].join(' ')}`}`)
  console.log(`path:    ${path.join(':')}`)
  if (dshHome !== undefined) console.log(`home:    ${dshHome}`)
  console.log(`log:     ${join(homedir(), 'Library/Logs', appName, 'web.log')}`)
  if (result.dmgPath !== undefined) console.log(`dmg:     ${result.dmgPath}`)
}

await main()

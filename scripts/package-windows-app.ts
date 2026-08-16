/** Build a double-clickable native Windows app around one harness profile. */

import { spawnSync } from 'node:child_process'
import { delimiter, join, resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { parseArgs } from 'node:util'
import { DEFAULT_APP_NAME } from '../src/bundle.ts'
import { launchPath, resolveOnPath, stableNodePath, stableSearchPath, windowsSystemPathDirs } from '../src/paths.ts'
import { buildWindowsApp, DEFAULT_WINDOWS_APP_ID, findWindowsCompiler } from '../src/windows-build.ts'

const root = resolve(import.meta.dirname, '..')
const DEFAULT_OUTPUT = 'dist-windows'
const DEFAULT_PROFILE = 'web'
const DEFAULT_ICON = 'assets/windows-app-icon.png'
const DEFAULT_DSH_HOME = join(homedir(), '.dsh')

function harnessVersion(dsh: string, path: readonly string[]): string | undefined {
  const command = /\.(?:cmd|bat)$/i.test(dsh) ? (process.env.ComSpec ?? 'cmd.exe') : dsh
  const args = command === dsh ? ['--version'] : ['/d', '/s', '/c', `"${dsh}" --version`]
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: { ...process.env, PATH: path.join(delimiter) },
  })
  if (result.error !== undefined || result.status !== 0) return undefined
  const version = result.stdout.trim()
  return version === '' ? undefined : version
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const { values } = parseArgs({
    args: argv[0] === '--' ? argv.slice(1) : argv,
    options: {
      out: { type: 'string' },
      name: { type: 'string' },
      'app-id': { type: 'string' },
      profile: { type: 'string' },
      'web-arg': { type: 'string', multiple: true },
      dsh: { type: 'string' },
      node: { type: 'string' },
      'dsh-home': { type: 'string' },
      browser: { type: 'string' },
      icon: { type: 'string' },
      csc: { type: 'string' },
    },
    allowPositionals: false,
  })

  if (process.platform !== 'win32') {
    throw new Error(`package:win builds on Windows only, ran on ${process.platform}`)
  }

  const searchPath = stableSearchPath(process.env.PATH ?? '')
  const dsh = values.dsh === undefined ? resolveOnPath('dsh', searchPath) : resolve(values.dsh)
  if (dsh === undefined) throw new Error('no `dsh` on PATH — install the harness CLI, or name it with --dsh <path>')
  if (!existsSync(dsh)) throw new Error(`--dsh ${dsh} does not exist`)
  const nodePath = values.node === undefined ? stableNodePath(process.execPath, searchPath) : resolve(values.node)
  if (!existsSync(nodePath)) throw new Error(`--node ${nodePath} does not exist`)
  const path = launchPath([nodePath, dsh], windowsSystemPathDirs())

  const home = values['dsh-home'] ?? process.env.DSH_HOME
  const dshHome = home === undefined ? undefined : resolve(home)
  const profile = values.profile ?? DEFAULT_PROFILE
  const profileDir = join(dshHome ?? DEFAULT_DSH_HOME, 'profiles', profile)
  if (!existsSync(profileDir)) {
    console.warn(`warning: no profile at ${profileDir} — the app will fail to boot until one is there`)
  }

  const compiler = values.csc === undefined ? findWindowsCompiler() : resolve(values.csc)
  if (compiler === undefined) {
    throw new Error('no .NET Framework C# compiler found — install/enable .NET Framework 4, or name csc.exe with --csc <path>')
  }
  const browser = values.browser === undefined ? undefined : resolve(values.browser)
  if (browser !== undefined && !existsSync(browser)) throw new Error(`--browser ${browser} does not exist`)

  const appName = values.name ?? DEFAULT_APP_NAME
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: unknown }
  const version = typeof manifest.version === 'string' ? manifest.version : '0.0.0'
  const result = await buildWindowsApp({
    appName,
    appId: values['app-id'] ?? DEFAULT_WINDOWS_APP_ID,
    version,
    profile,
    webArgs: values['web-arg'] ?? [],
    dsh,
    path,
    dshHome,
    browser,
    iconPath: values.icon === undefined ? join(root, DEFAULT_ICON) : resolve(values.icon),
    outputDir: resolve(root, values.out ?? DEFAULT_OUTPUT),
    compiler,
  })

  const release = harnessVersion(dsh, path)
  console.log(`app:     ${result.executablePath}`)
  console.log(`dsh:     ${dsh}${release === undefined ? '' : ` (${release})`}`)
  console.log(`profile: ${profile}${values['web-arg'] === undefined ? '' : ` ${values['web-arg'].join(' ')}`}`)
  console.log(`path:    ${path.join(delimiter)}`)
  if (dshHome !== undefined) console.log(`home:    ${dshHome}`)
  console.log(`log:     ${join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), appName, 'Logs', 'web.log')}`)
}

await main()

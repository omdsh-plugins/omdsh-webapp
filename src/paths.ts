/**
 * Resolving the two paths the bundle points out of itself with, and the `PATH`
 * it runs under. A Finder launch inherits neither the login shell's `PATH` nor
 * its working directory, so everything the launcher reaches for is baked in at
 * build time.
 */

import { accessSync, constants, realpathSync } from 'node:fs'
import { delimiter, dirname, extname, join } from 'node:path'

/** Directories the launcher's `PATH` always ends with, after the resolved tools. */
export const SYSTEM_PATH_DIRS = ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'] as const

/**
 * Search-path entries a package-manager run injects ahead of everything else:
 * this checkout's `node_modules/.bin`, and the version-stamped directory pnpm
 * runs its own binary from. Both are gone the moment the build is, so a bundle
 * that baked one would launch into a path that no longer exists.
 */
const EPHEMERAL_PATH_ENTRIES = [
  /[\\/]node_modules[\\/]\.bin[\\/]?$/,
  /[\\/]store[\\/]v\d+[\\/]links[\\/]/,
]

/**
 * Drop the entries this build was handed but the built bundle cannot rely on.
 * @param searchPath - a `PATH`-shaped string, normally `process.env.PATH`.
 * @returns the same string without its ephemeral entries.
 */
export function stableSearchPath(searchPath: string): string {
  return searchPath
    .split(delimiter)
    .filter((directory) => directory !== '' && !EPHEMERAL_PATH_ENTRIES.some((pattern) => pattern.test(directory)))
    .join(delimiter)
}

/**
 * The first entry of a search path holding an executable of this name — what
 * `which` answers.
 * @param command - executable name to look for.
 * @param searchPath - a `PATH`-shaped string.
 * @returns the absolute path, or `undefined` when no entry holds it.
 */
export function resolveOnPath(
  command: string,
  searchPath: string,
  platform = process.platform,
  pathExt = process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD',
): string | undefined {
  const names = platform === 'win32' && extname(command) === ''
    ? pathExt.split(';').filter((extension) => extension !== '').map((extension) => `${command}${extension.toLowerCase()}`)
    : [command]
  for (const directory of searchPath.split(delimiter)) {
    if (directory === '') continue
    for (const name of names) {
      const candidate = join(directory, name)
      try {
        accessSync(candidate, platform === 'win32' ? constants.F_OK : constants.X_OK)
        return candidate
      } catch {
        // A PATH entry need not exist or hold this command; the next one decides.
      }
    }
  }
  return undefined
}

/**
 * The Node path to bake into the launcher's `PATH`: an entry that resolves to
 * the running binary, falling back to that binary's own location.
 *
 * `process.execPath` is already resolved through its symlinks, so under
 * Homebrew or a version manager it names a version-stamped directory that the
 * next upgrade deletes — leaving a bundle that dies before it can report why.
 * The `PATH` alias survives that upgrade. It can then point at a different Node
 * major, whose ABI a previously installed `node-pty` will not match, but that
 * failure is loud and reinstalling fixes it, while the deleted path is silent.
 * @param execPath - the running Node binary, normally `process.execPath`.
 * @param searchPath - a `PATH`-shaped string to look for an alias in.
 * @returns the absolute Node path.
 */
export function stableNodePath(execPath: string, searchPath: string, platform = process.platform): string {
  const real = realpathSync(execPath)
  const executable = platform === 'win32' ? 'node.exe' : 'node'
  for (const directory of searchPath.split(delimiter)) {
    if (directory === '') continue
    const candidate = join(directory, executable)
    try {
      if (realpathSync(candidate) === real) return candidate
    } catch {
      // A PATH entry need not exist or hold a `node`; the next candidate decides.
    }
  }
  return execPath
}

/**
 * The `PATH` the launcher exports: the directories holding the resolved tools,
 * in the order given, then the system directories.
 *
 * The tools are named by their launcher path rather than their real one for the
 * same reason `stableNodePath` is: `dsh` is an `#!/usr/bin/env node` script, so
 * it needs its own directory *and* Node's on the path it runs under.
 * @param tools - absolute paths of the executables the bundle runs.
 * @returns the deduplicated directory list.
 */
export function launchPath(tools: readonly string[], systemDirectories: readonly string[] = SYSTEM_PATH_DIRS): string[] {
  const directories: string[] = []
  for (const tool of tools) {
    const directory = dirname(tool)
    if (!directories.includes(directory)) directories.push(directory)
  }
  for (const directory of systemDirectories) {
    if (!directories.includes(directory)) directories.push(directory)
  }
  return directories
}

/** System search-path entries needed by a GUI launch on Windows. */
export function windowsSystemPathDirs(windowsDirectory = process.env.WINDIR): string[] {
  if (windowsDirectory === undefined || windowsDirectory === '') return []
  return [
    join(windowsDirectory, 'System32'),
    windowsDirectory,
    join(windowsDirectory, 'System32', 'Wbem'),
    join(windowsDirectory, 'System32', 'WindowsPowerShell', 'v1.0'),
  ]
}

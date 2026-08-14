/**
 * Resolving the two paths the bundle points out of itself with, and the `PATH`
 * it runs under. A Finder launch inherits neither the login shell's `PATH` nor
 * its working directory, so everything the launcher reaches for is baked in at
 * build time.
 */

import { accessSync, constants, realpathSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'

/** Directories the launcher's `PATH` always ends with, after the resolved tools. */
export const SYSTEM_PATH_DIRS = ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'] as const

/**
 * Search-path entries a package-manager run injects ahead of everything else:
 * this checkout's `node_modules/.bin`, and the version-stamped directory pnpm
 * runs its own binary from. Both are gone the moment the build is, so a bundle
 * that baked one would launch into a path that no longer exists.
 */
const EPHEMERAL_PATH_ENTRIES = [/\/node_modules\/\.bin\/?$/, /\/store\/v\d+\/links\//]

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
export function resolveOnPath(command: string, searchPath: string): string | undefined {
  for (const directory of searchPath.split(delimiter)) {
    if (directory === '') continue
    const candidate = join(directory, command)
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // A PATH entry need not exist or hold this command; the next one decides.
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
export function stableNodePath(execPath: string, searchPath: string): string {
  const real = realpathSync(execPath)
  for (const directory of searchPath.split(delimiter)) {
    if (directory === '') continue
    const candidate = join(directory, 'node')
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
export function launchPath(tools: readonly string[]): string[] {
  const directories: string[] = []
  for (const tool of tools) {
    const directory = dirname(tool)
    if (!directories.includes(directory)) directories.push(directory)
  }
  for (const directory of SYSTEM_PATH_DIRS) {
    if (!directories.includes(directory)) directories.push(directory)
  }
  return directories
}

/** Running the platform build tools the packagers lean on. */

import { spawnSync } from 'node:child_process'

/**
 * Run a build tool, failing loud with its captured output.
 * @param command - executable name.
 * @param args - arguments, verbatim.
 */
export function run(command: string, args: readonly string[]): void {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} exited ${String(result.status)}\n${result.stdout}${result.stderr}`)
  }
}

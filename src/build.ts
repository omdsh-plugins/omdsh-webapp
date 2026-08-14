/** Assembling the `.app`, and the disk image that carries it. */

import { spawnSync } from 'node:child_process'
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromiumFocusScript, safariFocusScript } from './applescript.ts'
import { EXECUTABLE_NAME, SCRIPT_NAME, infoPlist } from './bundle.ts'
import { createDiskImage } from './disk-image.ts'
import { writeIcon } from './icon.ts'
import { launcherScript } from './launcher.ts'
import { compileShim } from './shim.ts'

/** What one bundle needs. */
export interface BuildOptions {
  /** Bundle name without the `.app` suffix; also the log directory's name. */
  appName: string
  /** Reverse-DNS bundle id LaunchServices resolves the application by. */
  bundleId: string
  /** Version for both `Info.plist` version fields. */
  version: string
  /** Profile the launcher boots. */
  profile: string
  /** The web app's own flags, appended after the profile. */
  webArgs: readonly string[]
  /** Absolute path of the `dsh` launcher. */
  dsh: string
  /** Directories of the `PATH` the app runs under. */
  path: readonly string[]
  /** `DSH_HOME` to pin, when the build was told to. */
  dshHome?: string | undefined
  /** `.icns` or square `.png` artwork. */
  iconPath: string
  /** Directory receiving the bundle and the image. */
  outputDir: string
  /** Whether to write the disk image beside the bundle. */
  dmg: boolean
}

/** What one build produced. */
export interface BuildResult {
  /** The built `.app`. */
  appPath: string
  /** The disk image, when one was asked for. */
  dmgPath?: string
  /**
   * Whether the executable is the compiled Cocoa shim. A build without one is
   * an agent bundle: no Dock tile to bounce, and no Dock icon either.
   */
  shimmed: boolean
}

/**
 * Refresh the LaunchServices record for a rebuilt bundle, which is otherwise
 * served from its cached `Info.plist` at the same path. Best effort: a stale
 * Finder name or icon does not make the bundle less runnable, and the support
 * tool's location is not a documented interface.
 * @param appPath - the built `.app`.
 */
function registerBundle(appPath: string): void {
  const lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
  const result = spawnSync(lsregister, ['-f', appPath], { encoding: 'utf8' })
  if (result.error !== undefined || result.status !== 0) {
    console.warn(`warning: could not refresh the LaunchServices record for ${appPath}`)
  }
}

/**
 * Build the application bundle, replacing any bundle already at that path.
 * @param options - everything the bundle is built from.
 * @returns the paths written, and whether the shim was compiled.
 */
export async function buildMacApp(options: BuildOptions): Promise<BuildResult> {
  const appPath = join(options.outputDir, `${options.appName}.app`)
  const contents = join(appPath, 'Contents')
  const resources = join(contents, 'Resources')

  await rm(appPath, { recursive: true, force: true })
  await mkdir(join(contents, 'MacOS'), { recursive: true })
  await mkdir(resources, { recursive: true })

  await writeIcon(options.iconPath, resources)

  const executable = join(contents, 'MacOS', EXECUTABLE_NAME)
  const shimmed = await compileShim(executable)
  // Without the shim the script is the executable, and only an agent bundle
  // spares it the Dock tile LaunchServices would bounce waiting for a check-in
  // it cannot perform. That costs the Dock icon and its Quit item, so the app
  // is then stopped from Activity Monitor.
  const script = shimmed ? join(resources, SCRIPT_NAME) : executable
  await writeFile(script, launcherScript({
    dsh: options.dsh,
    profile: options.profile,
    webArgs: options.webArgs,
    path: options.path,
    dshHome: options.dshHome,
    appName: options.appName,
  }))
  await chmod(script, 0o755)
  await writeFile(join(resources, 'focus-chromium.applescript'), chromiumFocusScript())
  await writeFile(join(resources, 'focus-safari.applescript'), safariFocusScript())

  await writeFile(join(contents, 'Info.plist'), infoPlist({
    appName: options.appName,
    bundleId: options.bundleId,
    version: options.version,
    agent: !shimmed,
  }))
  await writeFile(join(contents, 'PkgInfo'), 'APPL????')

  registerBundle(appPath)

  const result: BuildResult = { appPath, shimmed }
  if (options.dmg) {
    result.dmgPath = await createDiskImage({
      appPath,
      volumeName: options.appName,
      dmgPath: join(options.outputDir, `${options.appName}.dmg`),
    })
  }
  return result
}

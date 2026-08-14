/**
 * `dsh web` as a double-clickable macOS application.
 *
 * The bundle is a launcher, not a copy of the harness: it runs the `dsh`
 * launcher resolved at build time, under a `PATH` baked in beside it. Moving or
 * removing that installation breaks an already-built bundle — rebuild it.
 */

export { CHROMIUM_BROWSER_IDS, chromiumFocusScript, safariFocusScript } from './applescript.ts'
export { buildMacApp, type BuildOptions, type BuildResult } from './build.ts'
export {
  DEFAULT_APP_NAME,
  DEFAULT_BUNDLE_ID,
  EXECUTABLE_NAME,
  MINIMUM_SYSTEM_VERSION,
  SCRIPT_NAME,
  infoPlist,
  plistEscape,
  type InfoPlistOptions,
} from './bundle.ts'
export { createDiskImage, type DiskImageOptions } from './disk-image.ts'
export { ICON_SIZES, writeIcon } from './icon.ts'
export {
  URL_LINE_PREFIX,
  URL_WAIT_ATTEMPTS,
  launcherScript,
  shellQuote,
  type LauncherOptions,
} from './launcher.ts'
export { SYSTEM_PATH_DIRS, launchPath, resolveOnPath, stableNodePath, stableSearchPath } from './paths.ts'
export { compileShim, shimSource } from './shim.ts'

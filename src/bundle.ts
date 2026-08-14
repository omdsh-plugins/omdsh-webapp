/**
 * The bundle's own paperwork: the names macOS addresses it by, and the
 * `Info.plist` that carries them.
 */

/** Bundle name (without `.app`) when `--name` is omitted. */
export const DEFAULT_APP_NAME = 'DSH Web'
/**
 * Reverse-DNS bundle id when `--bundle-id` is omitted; unsigned, so it only has
 * to be stable and unique. LaunchServices resolves an application by this, so
 * two bundles wrapping two profiles need two ids or they answer for each other.
 */
export const DEFAULT_BUNDLE_ID = 'com.wanghao9610.omdsh.webapp'
/** The bundle executable's filename, which is also the app's process name. */
export const EXECUTABLE_NAME = 'dsh-web'
/** The launch script, run by the executable from `Contents/Resources`. */
export const SCRIPT_NAME = 'start-web'
/** Oldest macOS the bundle claims; the shim is plain AppKit and asks for little. */
export const MINIMUM_SYSTEM_VERSION = '13.0'

/**
 * Escape a value for a plist `<string>` body.
 * @param value - the raw string.
 * @returns the escaped form.
 */
export function plistEscape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** What one `Info.plist` needs. */
export interface InfoPlistOptions {
  /** Bundle name without the `.app` suffix. */
  appName: string
  /** Reverse-DNS bundle id. */
  bundleId: string
  /** Version string for both version fields. */
  version: string
  /**
   * Mark the bundle as an agent, which has no Dock tile. Only the fallback
   * build, where no Swift compiler was there to produce a shim that can check
   * in with the window server.
   */
  agent: boolean
}

/**
 * The bundle's `Info.plist`.
 * @param options - the names and the agent flag.
 * @returns the plist document.
 */
export function infoPlist(options: InfoPlistOptions): string {
  const entries: [string, string][] = [
    ['CFBundleName', options.appName],
    ['CFBundleDisplayName', options.appName],
    ['CFBundleIdentifier', options.bundleId],
    ['CFBundleExecutable', EXECUTABLE_NAME],
    ['CFBundlePackageType', 'APPL'],
    ['CFBundleInfoDictionaryVersion', '6.0'],
    ['CFBundleVersion', options.version],
    ['CFBundleShortVersionString', options.version],
    ['LSMinimumSystemVersion', MINIMUM_SYSTEM_VERSION],
    ['CFBundleIconFile', 'icon'],
  ]
  const body = entries
    .map(([key, value]) => `  <key>${key}</key>\n  <string>${plistEscape(value)}</string>`)
    .join('\n')
  const agentEntry = options.agent ? '  <key>LSUIElement</key>\n  <true/>\n' : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${body}
${agentEntry}  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`
}

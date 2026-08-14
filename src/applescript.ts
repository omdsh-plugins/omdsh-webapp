/**
 * The two scripts that raise a tab already showing the harness instead of
 * stacking up new ones. Both answer `focused` or `none` on stdout, which is the
 * whole of their interface with the launcher.
 */

/**
 * Browsers sharing Chrome's scripting dictionary, asked in this order for a tab
 * already showing the app. Safari has its own dictionary and its own script;
 * Firefox exposes no tab API at all and only ever gets a fresh tab.
 *
 * Bundle ids, never display names: naming an application that is not installed
 * sends AppleScript looking for it and blocks on a chooser dialog, while an
 * absent bundle id fails immediately.
 */
export const CHROMIUM_BROWSER_IDS = [
  'com.google.Chrome',
  'com.microsoft.edgemac',
  'com.brave.Browser',
  'com.vivaldi.Vivaldi',
  'org.chromium.Chromium',
] as const

/**
 * AppleScript that focuses an existing tab in a Chromium-family browser.
 *
 * Only a browser that is already running is asked: a `tell` block otherwise
 * launches it, and a Dock click must not start a browser the user had closed.
 * The `using terms from` block compiles against Chrome's dictionary but runs
 * against whichever browser was addressed, so a machine without Chrome fails to
 * compile this script — the caller treats that like any other miss.
 * @returns the AppleScript source, taking the browser bundle id and URL prefix.
 */
export function chromiumFocusScript(): string {
  return `on run argv
\tset browserId to item 1 of argv
\tset prefix to item 2 of argv
\ttry
\t\tif not (application id browserId is running) then return "none"
\ton error
\t\treturn "none"
\tend try
\ttell application id browserId
\t\tusing terms from application "Google Chrome"
\t\t\trepeat with theWindow in windows
\t\t\t\tset tabIndex to 0
\t\t\t\trepeat with theTab in tabs of theWindow
\t\t\t\t\tset tabIndex to tabIndex + 1
\t\t\t\t\ttry
\t\t\t\t\t\tif (URL of theTab as text) starts with prefix then
\t\t\t\t\t\t\tset active tab index of theWindow to tabIndex
\t\t\t\t\t\t\tset index of theWindow to 1
\t\t\t\t\t\t\tactivate
\t\t\t\t\t\t\treturn "focused"
\t\t\t\t\t\tend if
\t\t\t\t\tend try
\t\t\t\tend repeat
\t\t\tend repeat
\t\tend using terms from
\tend tell
\treturn "none"
end run
`
}

/**
 * AppleScript that focuses an existing Safari tab.
 *
 * A blank tab carries no URL, so each comparison is guarded rather than the
 * loop: one unreadable tab must not end the search.
 * @returns the AppleScript source, taking the URL prefix.
 */
export function safariFocusScript(): string {
  return `on run argv
\tset prefix to item 1 of argv
\tif not (application id "com.apple.Safari" is running) then return "none"
\ttell application id "com.apple.Safari"
\t\trepeat with theWindow in windows
\t\t\trepeat with theTab in tabs of theWindow
\t\t\t\ttry
\t\t\t\t\tif (URL of theTab as text) starts with prefix then
\t\t\t\t\t\tset current tab of theWindow to theTab
\t\t\t\t\t\tset index of theWindow to 1
\t\t\t\t\t\tactivate
\t\t\t\t\t\treturn "focused"
\t\t\t\t\tend if
\t\t\t\tend try
\t\t\tend repeat
\t\tend repeat
\tend tell
\treturn "none"
end run
`
}

import { describe, expect, it } from 'vitest'
import { DEFAULT_APP_NAME, DEFAULT_BUNDLE_ID, EXECUTABLE_NAME, infoPlist, plistEscape } from '../src/bundle.ts'

/** The plist a normal build writes. */
function plist(agent: boolean): string {
  return infoPlist({ appName: DEFAULT_APP_NAME, bundleId: DEFAULT_BUNDLE_ID, version: '0.1.0', agent })
}

describe('plistEscape', () => {
  it('escapes what a plist string body cannot carry', () => {
    expect(plistEscape('Tom & <Jerry>')).toBe('Tom &amp; &lt;Jerry&gt;')
  })
})

describe('infoPlist', () => {
  it('names the bundle, its executable, and its icon', () => {
    const document = plist(false)
    expect(document).toContain(`<key>CFBundleName</key>\n  <string>${DEFAULT_APP_NAME}</string>`)
    expect(document).toContain(`<key>CFBundleIdentifier</key>\n  <string>${DEFAULT_BUNDLE_ID}</string>`)
    expect(document).toContain(`<key>CFBundleExecutable</key>\n  <string>${EXECUTABLE_NAME}</string>`)
    expect(document).toContain('<key>CFBundleIconFile</key>\n  <string>icon</string>')
  })

  it('carries both version fields', () => {
    const document = plist(false)
    expect(document).toContain('<key>CFBundleVersion</key>\n  <string>0.1.0</string>')
    expect(document).toContain('<key>CFBundleShortVersionString</key>\n  <string>0.1.0</string>')
  })

  it('marks the bundle an agent only when there is no shim to bounce a tile for', () => {
    expect(plist(false)).not.toContain('LSUIElement')
    expect(plist(true)).toContain('<key>LSUIElement</key>\n  <true/>')
  })

  it('escapes a name a plist would otherwise read as markup', () => {
    expect(infoPlist({ appName: 'DSH <Web>', bundleId: 'a.b.c', version: '1', agent: false }))
      .toContain('<string>DSH &lt;Web&gt;</string>')
  })
})

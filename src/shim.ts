/**
 * The bundle executable: a Cocoa shim that runs the launch script.
 *
 * LaunchServices bounces the Dock tile until the bundle executable checks in
 * with the window server, and reports a launch timeout when it never does. A
 * shell script cannot check in — only a process that starts an `NSApplication`
 * can — so the script runs as this shim's child instead of as the executable
 * itself. The shim also gives the app the lifetime a Dock tile implies: Quit
 * reaches the script, and the app exits on its own when the script does. A
 * signal that would otherwise kill it outright is routed through that same quit,
 * so no way of ending the app leaves its server behind.
 */

import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SCRIPT_NAME } from './bundle.ts'
import { run } from './run.ts'

/**
 * The shim's Swift source.
 * @returns the source, which must be compiled from a file named `main.swift`.
 */
export function shimSource(): string {
  return `import AppKit

/// Runs the bundle's launch script and ties the app's lifetime to it.
final class LauncherDelegate: NSObject, NSApplicationDelegate {
  private let script: String
  private var child: Process?
  private var focusing: Process?

  init(script: String) {
    self.script = script
  }

  private func spawn(_ arguments: [String]) throws -> Process {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/bin/bash")
    process.arguments = [script] + arguments
    try process.run()
    return process
  }

  /// Show the running session by raising its browser tab. An app with no
  /// window of its own has nothing else to present when the user reaches it,
  /// and every route to it lands here: a Dock click, Command-Tab, and any
  /// other activation. One click raises both the reopen and the activation
  /// callback, so an in-flight run suppresses the second — two concurrent
  /// runs finding no tab would each open one.
  private func raiseSession() {
    if let running = focusing, running.isRunning { return }
    focusing = try? spawn(["focus"])
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    guard let process = try? spawn([]) else {
      NSApp.terminate(nil)
      return
    }
    // The script serves until it is stopped, so its exit — clean or not — is
    // the end of the app, not the start of an idle Dock tile.
    process.terminationHandler = { _ in
      DispatchQueue.main.async { NSApp.terminate(nil) }
    }
    child = process
  }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
    raiseSession()
    return true
  }

  func applicationDidBecomeActive(_ notification: Notification) {
    raiseSession()
  }

  func applicationWillTerminate(_ notification: Notification) {
    guard let process = child, process.isRunning else { return }
    process.terminate()
    // The script traps SIGTERM to stop the server it started; leaving before
    // that handler finishes would orphan the server holding the port.
    let deadline = Date().addingTimeInterval(5)
    while process.isRunning && Date() < deadline {
      usleep(50_000)
    }
  }
}

/// Route a signal through the orderly quit the Dock's own item takes.
///
/// The default disposition kills this process where it stands, which leaves the
/// script — and the server under it — running with nothing left to stop them.
/// Logging out and killall both arrive this way.
/// - Parameter signalNumber: the signal to take over.
/// - Returns: the source, which stops delivering once it is released.
func quitOn(_ signalNumber: Int32) -> DispatchSourceSignal {
  signal(signalNumber, SIG_IGN)
  let source = DispatchSource.makeSignalSource(signal: signalNumber, queue: .main)
  source.setEventHandler { NSApp.terminate(nil) }
  source.resume()
  return source
}

guard let resources = Bundle.main.resourceURL else { exit(1) }
let application = NSApplication.shared
application.setActivationPolicy(.regular)
let signalSources = [SIGTERM, SIGINT].map(quitOn)
// NSApplication holds its delegate weakly; this binding is the strong reference.
let delegate = LauncherDelegate(script: resources.appendingPathComponent(${JSON.stringify(SCRIPT_NAME)}).path)
application.delegate = delegate
application.run()
`
}

/**
 * Compile the shim into the bundle.
 * @param destination - the executable path to write.
 * @returns whether a Swift compiler was available to build it.
 */
export async function compileShim(destination: string): Promise<boolean> {
  if (spawnSync('swiftc', ['--version'], { encoding: 'utf8' }).status !== 0) return false
  const staging = await mkdtemp(join(tmpdir(), 'omdsh-webapp-shim-'))
  try {
    // Top-level statements are only legal in a file with this name.
    const source = join(staging, 'main.swift')
    await writeFile(source, shimSource())
    run('swiftc', ['-O', '-o', destination, source])
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
  return true
}

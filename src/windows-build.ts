/** Building the native Windows launcher. */

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { run } from './run.ts'
import { writeWindowsIcon } from './windows-icon.ts'
import { windowsLauncherSource, type WindowsLauncherOptions } from './windows-launcher.ts'

/** Named-kernel-object identity used when `--app-id` is omitted. */
export const DEFAULT_WINDOWS_APP_ID = 'ai.deepseek.dsh.web'

/** Values needed to compile one Windows application. */
export interface WindowsBuildOptions extends Omit<WindowsLauncherOptions, 'instanceKey'> {
  /** Stable application identity; two profiles need two identities. */
  appId: string
  /** `.ico` or square `.png` artwork. */
  iconPath: string
  /** Directory receiving the executable. */
  outputDir: string
  /** Path to the .NET Framework C# compiler. */
  compiler: string
}

/** What one Windows build produced. */
export interface WindowsBuildResult {
  /** The native, GUI-subsystem executable. */
  executablePath: string
}

/**
 * Stable, named-kernel-object-safe identity derived from the application id.
 * @param appId - application identity from the command line.
 */
export function windowsInstanceKey(appId: string): string {
  return createHash('sha256').update(appId).digest('hex').slice(0, 24)
}

/**
 * Locate the C# compiler Windows ships with .NET Framework.
 * @param windowsDirectory - normally `WINDIR`.
 */
export function findWindowsCompiler(windowsDirectory = process.env.WINDIR): string | undefined {
  if (windowsDirectory === undefined) return undefined
  const candidates = [
    join(windowsDirectory, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    join(windowsDirectory, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ]
  return candidates.find(existsSync)
}

/** Build the single-file native Windows launcher. */
export async function buildWindowsApp(options: WindowsBuildOptions): Promise<WindowsBuildResult> {
  if (!existsSync(options.compiler)) throw new Error(`C# compiler ${options.compiler} does not exist`)
  await mkdir(options.outputDir, { recursive: true })
  const executablePath = join(options.outputDir, `${options.appName}.exe`)
  const staging = await mkdtemp(join(tmpdir(), 'omdsh-webapp-windows-'))
  try {
    const sourcePath = join(staging, 'Program.cs')
    const iconPath = join(staging, 'app.ico')
    await writeFile(sourcePath, windowsLauncherSource({
      appName: options.appName,
      version: options.version,
      instanceKey: windowsInstanceKey(options.appId),
      dsh: options.dsh,
      profile: options.profile,
      webArgs: options.webArgs,
      path: options.path,
      dshHome: options.dshHome,
      browser: options.browser,
    }))
    await writeWindowsIcon(options.iconPath, iconPath)
    await rm(executablePath, { force: true })
    run(options.compiler, [
      '/nologo',
      '/target:winexe',
      '/optimize+',
      '/warnaserror+',
      '/platform:anycpu',
      `/out:${executablePath}`,
      `/win32icon:${iconPath}`,
      '/reference:System.dll',
      '/reference:System.Core.dll',
      '/reference:System.Drawing.dll',
      '/reference:System.Windows.Forms.dll',
      sourcePath,
    ])
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
  if (!existsSync(executablePath)) {
    throw new Error(`C# compiler did not write ${basename(executablePath)}`)
  }
  return { executablePath }
}

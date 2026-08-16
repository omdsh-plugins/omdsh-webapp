import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildWindowsApp, findWindowsCompiler, windowsInstanceKey } from '../src/windows-build.ts'
import {
  csharpString,
  powershellQuote,
  windowsAssemblyVersion,
  windowsLauncherSource,
  windowsPowerShellCommand,
} from '../src/windows-launcher.ts'
import { writeWindowsIcon } from '../src/windows-icon.ts'

const staging = await mkdtemp(join(tmpdir(), 'omdsh-webapp-windows-spec-'))
afterAll(async () => { await rm(staging, { recursive: true, force: true }) })

function source(): string {
  return windowsLauncherSource({
    appName: 'DSH Web',
    version: '1.2.3',
    instanceKey: '0123456789abcdef',
    dsh: String.raw`C:\Program Files\dsh.cmd`,
    profile: 'web',
    webArgs: ['--port', '0'],
    path: [String.raw`C:\Program Files\nodejs`, String.raw`C:\Windows\System32`],
  })
}

describe('Windows launcher source', () => {
  it('quotes C# strings and normalizes assembly versions', () => {
    expect(csharpString('a"b\nc')).toBe('"a\\"b\\nc"')
    expect(windowsAssemblyVersion('1.2.3-beta.4')).toBe('1.2.3.4')
    expect(powershellQuote("Hao's profile")).toBe("'Hao''s profile'")
    const decoded = Buffer.from(windowsPowerShellCommand({
      dsh: String.raw`C:\Program Files\dsh.cmd`,
      profile: "Hao's web",
      webArgs: ['--trusted-host', 'my host:3080 & safe'],
    }), 'base64').toString('utf16le')
    expect(decoded).toContain("& 'C:\\Program Files\\dsh.cmd' '--profile' 'Hao''s web'")
    expect(decoded).toContain("'my host:3080 & safe'")
  })

  it('contains single-instance activation, browser reuse, and process-tree shutdown', () => {
    const generated = source()
    expect(generated).toContain('NamedPipeServerStream')
    expect(generated).toContain('SetForegroundWindow(browserWindow)')
    expect(generated).toContain('taskkill.exe')
    expect(generated).toContain('args[0] == "--quit"')
    expect(generated).toContain('Settings.DshHome != null')
  })

  it('derives a stable kernel-object key from the application identity', () => {
    expect(windowsInstanceKey('ai.deepseek.dsh.web')).toMatch(/^[a-f0-9]{24}$/)
    expect(windowsInstanceKey('ai.deepseek.dsh.web')).toBe(windowsInstanceKey('ai.deepseek.dsh.web'))
    expect(windowsInstanceKey('ai.deepseek.dsh.other')).not.toBe(windowsInstanceKey('ai.deepseek.dsh.web'))
  })
})

describe('Windows icon', () => {
  it('wraps the committed PNG as an ICO frame', async () => {
    const destination = join(staging, 'test.ico')
    await writeWindowsIcon(resolve('assets/windows-app-icon.png'), destination)
    const icon = readFileSync(destination)
    expect(icon.readUInt16LE(2)).toBe(1)
    expect(icon.readUInt16LE(4)).toBe(1)
    expect(icon.readUInt32LE(18)).toBe(22)
    expect(icon.subarray(22, 30)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  })
})

describe.skipIf(process.platform !== 'win32')('native Windows build', () => {
  it('compiles a GUI executable with the system C# compiler', async () => {
    const compiler = findWindowsCompiler()
    expect(compiler).toBeDefined()
    const result = await buildWindowsApp({
      appName: 'DSH Web Compile Spec',
      appId: 'ai.deepseek.dsh.web.compile-spec',
      version: '1.2.3',
      dsh: resolve('tests/fixtures/fake-dsh.cmd'),
      profile: 'web',
      webArgs: [],
      path: [dirname(process.execPath), join(process.env.WINDIR ?? String.raw`C:\Windows`, 'System32')],
      iconPath: resolve('assets/windows-app-icon.png'),
      outputDir: join(staging, 'compiled'),
      compiler: compiler!,
    })
    const executable = await readFile(result.executablePath)
    expect(executable.subarray(0, 2).toString('ascii')).toBe('MZ')
    const peOffset = executable.readUInt32LE(0x3c)
    const optionalHeader = peOffset + 24
    // PE32 and PE32+ place Subsystem at the same offset within the optional header.
    expect(executable.readUInt16LE(optionalHeader + 68)).toBe(2)
  }, 30_000)

  it('starts one server, lets a second launch activate it, and stops its process tree', async () => {
    const compiler = findWindowsCompiler()!
    const appName = `DSH Web Runtime Spec ${process.pid}`
    const output = join(staging, 'runtime')
    const result = await buildWindowsApp({
      appName,
      appId: `ai.deepseek.dsh.web.runtime-spec.${process.pid}`,
      version: '1.2.3',
      dsh: resolve('tests/fixtures/fake-dsh.cmd'),
      profile: 'web',
      webArgs: [],
      path: [dirname(process.execPath), join(process.env.WINDIR ?? String.raw`C:\Windows`, 'System32')],
      browser: join(process.env.WINDIR ?? String.raw`C:\Windows`, 'System32', 'where.exe'),
      iconPath: resolve('assets/windows-app-icon.png'),
      outputDir: output,
      compiler,
    })
    const first = spawn(result.executablePath, [], { stdio: 'ignore' })
    const log = join(process.env.LOCALAPPDATA!, appName, 'Logs', 'web.log')
    let url: string | undefined
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          const match = (await readFile(log, 'utf8')).match(/dsh web: (http:\/\/[^\s]+)/)
          if (match?.[1] !== undefined) { url = match[1]; break }
        } catch { /* the first write has not happened yet */ }
        await new Promise((resolveWait) => { setTimeout(resolveWait, 100) })
      }
      expect(url).toBeDefined()
      expect(await (await fetch(url!)).text()).toBe('served')

      const second = spawnSync(result.executablePath, [], { timeout: 5_000 })
      expect(second.status).toBe(0)
      expect(await (await fetch(url!)).text()).toBe('served')

      const quit = spawnSync(result.executablePath, ['--quit'], { timeout: 5_000 })
      expect(quit.status).toBe(0)
      await new Promise<void>((resolveClose) => { first.once('close', () => { resolveClose() }) })
      await expect(fetch(url!)).rejects.toThrow()
    } finally {
      if (first.exitCode === null) spawnSync(result.executablePath, ['--quit'], { timeout: 5_000 })
      await rm(join(process.env.LOCALAPPDATA!, appName), { recursive: true, force: true })
    }
  }, 30_000)
})

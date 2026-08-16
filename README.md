# omdsh-webapp

English | [中文](README.zh.md)

Run the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web UI as a native desktop application on **macOS or Windows**. Instead of keeping a terminal open around `dsh web`, the generated application starts a profile, waits for its URL, presents it in a browser, reuses the running session when reached again, and stops the server when the application quits.

This repository is an application packager, not a harness plugin. It installs no profile and carries no harness release. Each build points at the `dsh`, Node, profile, plugins, and harness home already present on the machine that built it.

## What a launch does

| When you | macOS | Windows |
|---|---|---|
| Launch the app | Starts `dsh --profile web`, then opens its URL | Starts `dsh --profile web`, then opens an Edge or Chrome app window |
| Reach it again | Raises the existing browser tab | Raises the existing app window; launching the `.exe` again activates the first instance |
| Launch while its session is serving | Surfaces that session instead of starting another | Signals the single running instance instead of starting another |
| Launch when another `dsh` owns the port | Probes and opens that session, then steps aside | Probes and opens that session in the default browser, then steps aside |
| Quit the app | Stops only the server it started | **Exit** from the tray, or run `DSH Web.exe --quit`; its process tree is stopped |

If Edge and Chrome are unavailable on Windows, the launcher falls back to the default browser. The page still opens, but Windows cannot reliably identify and raise an arbitrary existing tab in every browser; launching the app again may therefore open that URL again. Edge and Chrome use a dedicated app-style window whose handle the launcher can raise without browser automation permissions.

Logs are written to `~/Library/Logs/DSH Web/web.log` on macOS and `%LOCALAPPDATA%\DSH Web\Logs\web.log` on Windows. A launch that only surfaced somebody else's session owns nothing and exits immediately. A port held by something that does not answer HTTP is reported in an error dialog with the log path.

## Layout

| Path | Purpose |
|---|---|
| `src/launcher.ts`, `src/shim.ts`, `src/applescript.ts` | macOS bash launcher, Cocoa lifetime shim, and tab focus scripts |
| `src/bundle.ts`, `src/icon.ts`, `src/disk-image.ts`, `src/build.ts` | macOS `.app`, icon, and `.dmg` assembly |
| `src/windows-launcher.ts` | C# source for the Windows single-instance launcher, tray UI, browser window, logging, and shutdown |
| `src/windows-build.ts`, `src/windows-icon.ts` | Windows native compilation and `.ico` creation |
| `src/paths.ts` | Stable `dsh`, Node, and launch `PATH` resolution on both systems |
| `scripts/package-macos-app.ts` | `package:mac` command |
| `scripts/package-windows-app.ts` | `package:win` command |
| `assets/` | Source art and committed platform-sized PNGs |

The Windows output is a GUI-subsystem, single-file `.exe` compiled with the .NET Framework C# compiler included in Windows. It does not require Electron, a .NET SDK, or a package restore. The executable owns a tray icon and a named-pipe single-instance channel; on exit it terminates the full `dsh` process tree so the port is not left occupied.

The macOS executable is a compiled Cocoa shim. It checks in with the window server, owns the Dock lifetime, routes Quit and signals to the generated bash launcher, and uses AppleScript to raise an existing browser tab.

## Prerequisites

- Node `^22.19.0 || >=24.0.0`
- pnpm 11.7.0
- `dsh` on `PATH`, or an explicit `--dsh` path
- The profile to launch (created by starting it or adding a plugin)
- macOS 13+ for `package:mac`, or Windows with .NET Framework 4 enabled for `package:win`

For example:

```sh
dsh --profile web
dsh plugin --profile web add @omdsh-plugins/omdsh-plughub
```

## Build and install on macOS

```sh
pnpm install
pnpm run package:mac
```

This writes `dist-macos/DSH Web.app` and `dist-macos/DSH Web.dmg`. Drag the application to `/Applications`. The build is unsigned; a copy moved from another machine may need its quarantine attribute cleared:

```sh
xattr -dr com.apple.quarantine '/Applications/DSH Web.app'
```

Finder launches inherit no shell `PATH`, so the resolved `dsh` and Node directories are baked into the application. If either installation is moved or removed, rebuild the app.

## Build and install on Windows

Run from PowerShell or Command Prompt:

```powershell
pnpm install
pnpm run package:win
```

This writes `dist-windows\DSH Web.exe`. Move that executable wherever you want it and optionally create a Start menu, taskbar, or desktop shortcut. Its icon and configuration are embedded; it does not need adjacent files.

The launcher displays a tray icon while it owns the server:

- Double-click the tray icon, choose **Open**, or launch the `.exe` again to surface the page.
- Choose **View log** to open the current log.
- Choose **Exit** to close the browser app window and stop the harness process tree.
- `& '.\DSH Web.exe' --quit` provides the same orderly exit for scripts.

The build automatically finds `%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe` (or the 32-bit equivalent). Use `--csc` only when Windows has it elsewhere. A transferred, unsigned executable can trigger Microsoft Defender SmartScreen; this project does not currently sign either platform's output.

## Commands

```sh
pnpm install
pnpm run package:mac   # macOS .app and .dmg
pnpm run package:win   # Windows native .exe
pnpm run icon:render   # regenerate both platform PNGs from the SVG
pnpm run typecheck
pnpm run test
pnpm run clean         # remove dist-macos, dist-windows, and TypeScript build info
```

### Shared build flags

Flags go after pnpm's `--` separator:

| Flag | Default | Meaning |
|---|---|---|
| `--name <AppName>` | `DSH Web` | Application, tray/Dock, and log-directory name |
| `--profile <name>` | `web` | Profile to boot |
| `--web-arg=<arg>` | — | One profile-app argument; repeatable |
| `--out <dir>` | `dist-macos` or `dist-windows` | Output directory |
| `--dsh <path>` | first `dsh` on `PATH` | Harness launcher to run |
| `--node <path>` | Node running the build | Node placed on the launch path |
| `--dsh-home <path>` | `DSH_HOME`, when set | Harness home to pin |
| `--icon <path>` | platform PNG in `assets/` | `.png`/`.icns` on macOS; `.png`/`.ico` on Windows |

Arguments starting with a dash use the `=` spelling:

```sh
pnpm run package:win -- --web-arg=--port --web-arg=8080
pnpm run package:mac -- --name 'DSH TUI Web' --profile my-profile
```

### Platform-only flags

| Platform | Flag | Default | Meaning |
|---|---|---|---|
| macOS | `--bundle-id <id>` | `ai.deepseek.dsh.web` | LaunchServices identity |
| macOS | `--no-dmg` | off | Skip the disk image |
| Windows | `--app-id <id>` | `ai.deepseek.dsh.web` | Mutex and activation-channel identity |
| Windows | `--browser <path>` | auto-detected Edge, then Chrome | Browser executable for the app window |
| Windows | `--csc <path>` | system .NET Framework compiler | C# compiler used for the native executable |

Two applications wrapping different profiles need different names and identities (`--bundle-id` on macOS or `--app-id` on Windows). Reusing the identity intentionally makes the second launch activate the first application.

## Validation

`pnpm test` keeps platform-dependent execution on its host. macOS tests parse and run the generated bash launcher and compile the Swift shim. Windows tests compile a real PE GUI executable, start a temporary HTTP stand-in for `dsh`, verify that the second launch reuses the first instance, and verify that `--quit` stops the server process tree. Pure source, path, metadata, and icon tests run on either platform.

## Known limitations

- Builds are host-native: create the `.app`/`.dmg` on macOS and the `.exe` on Windows.
- Outputs are launchers, not self-contained harness distributions. Moving or deleting the baked `dsh` or Node installation requires a rebuild; an in-place harness upgrade does not.
- Outputs are unsigned.
- macOS requires per-browser Automation approval to raise existing tabs. Firefox always receives a new tab because it exposes no AppleScript tab API.
- Windows reliably raises the Edge/Chrome app window it created. Falling back to another default browser can open the URL again because Windows exposes no universal tab-selection API.
- The application starts a profile; it does not install or modify one.
- Dock/tray and real-browser behavior still receive a final manual check on a graphical desktop; the underlying launch, reuse, and shutdown paths are automated.

## Origin

The harness fork's `legacy/all-in-one` branch contained a macOS wrapper tied to one monorepo checkout. This packager retained its application-lifetime and browser-focus ideas while targeting an installed `dsh`, adding profiles and arbitrary web arguments, recording the URL actually served, handling occupied ports, and now implementing the same lifecycle on Windows with a native single-instance launcher.

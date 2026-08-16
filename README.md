# omdsh-webapp

English | [中文](README.zh.md)

The [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web UI as a macOS application. `dsh web` starts from a terminal and prints a URL, so using the browser UI means keeping a terminal open for the server's lifetime and clicking a printed line. This packager writes a double-clickable **DSH Web.app** instead: the Dock icon starts the server, opens the page, and — every time you reach the app afterwards — raises the tab already showing it rather than opening another.

It is an application rather than a plugin. It declares no `dsh.bundle.patch`, composes nothing into a profile, and appears in no catalog: what it wraps is the profile you already assembled, with whatever plugins you already installed into it.

## Layout

| Path | What it is |
|---|---|
| `src/launcher.ts` | The bash script the bundle runs: start, reuse, focus, stop |
| `src/shim.ts` | The Cocoa executable that owns the app's lifetime, in Swift |
| `src/applescript.ts` | The two scripts that raise an existing tab |
| `src/bundle.ts`, `src/icon.ts`, `src/disk-image.ts` | `Info.plist`, `icon.icns`, and the `.dmg` |
| `src/paths.ts` | Which `dsh`, which Node, and the `PATH` they run under |
| `scripts/package-macos-app.ts` | The command, and the flags under `## Commands` |
| `assets/` | The icon, as the `.svg` it is drawn in and the `.png` the packager reads |

The executable is a compiled Cocoa shim rather than the script itself: LaunchServices bounces the Dock tile until the bundle executable checks in with the window server, which only a process running an `NSApplication` can do. The script runs as that shim's child, which is what makes Quit — and a signal — reach the server and stop it. Where no Swift compiler is installed the script becomes the executable and the bundle is marked `LSUIElement`: no tile to bounce, and no Dock icon either, so the server is then stopped from Activity Monitor.

`assets/macos-app-icon.png` is committed because `sips` and `iconutil` read PNG and no macOS system tool rasterizes SVG. After editing the `.svg`, re-render it with `pnpm run icon:render` (librsvg's `rsvg-convert`), which is the only step here that wants a tool macOS does not ship.

## What a launch does

| When you | It |
|---|---|
| Launch it | boots `dsh --profile web`, waits for the URL it prints, and opens that URL |
| Reach it again (Dock click, Command-Tab, any activation) | raises the tab already showing that URL, in a browser that is already running |
| Launch it while its own session is serving | surfaces that session instead of starting a second one |
| Launch it while something else holds the port — a `dsh web` left running in a terminal, or a copy of this app under another home | surfaces the session on that port and steps aside, because reaching it is what the click asked for |
| Quit it | stops the server it started, so no port is left held |

A launch that only surfaced someone else's session owns nothing, so it exits right away: the Dock tile appears and goes. Quitting stops a server only when this application is the one that started it. A port held by something that is not serving at all is the one case that reports a failure, with the log to read.

Each run writes `~/Library/Logs/DSH Web/web.log`, and records the URL it is serving beside it. Only a browser that is already running is ever asked for its tabs, so a Dock click never starts a browser you had closed; an unmatched URL falls through to a fresh tab in the default browser.

## What the bundle is, and is not

It is a launcher, not a copy of the harness. Baked into it are the `dsh` path resolved at build time and a `PATH` holding that launcher's directory and Node's — a Finder launch inherits no environment at all, not even the login shell's `PATH`. Everything else it needs, it reads at launch: the profile, its plugins, and the harness release itself all follow whatever is installed. Upgrading the harness does not mean rebuilding the application; moving or removing that installation does.

Nothing inside the bundle is addressed by an absolute path, so it still works after being dragged to `/Applications`.

The bundle is unsigned. Because it is, its identity changes with every rebuild, and macOS asks again for the per-browser **Automation** approval that raising a tab needs (System Settings → Privacy & Security → Automation). Until it is granted, each launch opens a new tab instead of raising the old one — nothing else breaks.

A rebuild also has to be reinstalled: LaunchServices resolves the id to the copy under `/Applications`, so that copy is what a Dock click runs, however recently `dist-macos` was rewritten.

## Install

macOS, Node `^22.19.0 || >=24.0.0`, and pnpm 11.7.0, as `engines` and `packageManager` state. The machine also needs a `dsh` on its `PATH` and the profile the bundle is built for, because the bundle points at both rather than carrying either. A profile exists once it has been started or had a plugin added to it, and the build says so when it is not there yet:

```sh
dsh --profile web                                          # writes the profile, if it is new
dsh plugin --profile web add @omdsh-plugins/omdsh-plughub  # and whatever it should carry
```

The application is built on the machine that runs it, against the `dsh` already installed there:

```sh
pnpm install
pnpm run package:mac
```

That writes `dist-macos/DSH Web.app` and `dist-macos/DSH Web.dmg`. Drag the application to `/Applications` — or open the disk image and drag it from there — and it is a normal Dock, Launchpad, and Spotlight citizen.

Gatekeeper does not intercept a locally built bundle, but a copy carried to another machine through the disk image arrives quarantined:

```sh
xattr -dr com.apple.quarantine '/Applications/DSH Web.app'
```

The application boots a profile; it does not install one. Adding plugins stays a terminal task, and a bundle whose profile is missing says so in an alert and in its log rather than failing silently. Removing the application is dragging it to the Trash: the harness installation, the profile, and the plugins in it are untouched, and `~/Library/Logs/DSH Web/` stays until it is deleted too.

## Commands

```sh
pnpm install
pnpm run package:mac   # the application and its disk image
pnpm run icon:render   # re-render assets/macos-app-icon.png from the .svg
pnpm run typecheck     # sources, script, and specs
pnpm run test          # vitest: the generated script, the plist, the paths, the shim
pnpm run clean         # remove dist-macos
```

`package:mac` takes the flags below. Its own flags go after a `--`, which is what stops pnpm from reading them as its own:

| Flag | Default | What it selects |
|---|---|---|
| `--name <AppName>` | `DSH Web` | the bundle's name, which also names its log directory |
| `--profile <name>` | `web` | the profile it boots |
| `--web-arg=<arg>` | — | one argument for the profile's app, repeatable |
| `--bundle-id <id>` | `ai.deepseek.dsh.web` | the identity LaunchServices resolves it by |
| `--out <dir>` | `dist-macos` | where the bundle and image land |
| `--dsh <path>` | the first on `PATH` | the launcher the application runs |
| `--node <path>` | the Node running the build | the Node that launcher runs under |
| `--dsh-home <path>` | `$DSH_HOME`, when set | the harness home to pin |
| `--icon <path>` | `assets/macos-app-icon.png` | `.icns` or square `.png` artwork |
| `--no-dmg` | off | skip the disk image |

An argument that starts with a dash needs the `=` form, because Node's argument parser cannot tell it from a flag of this script's own:

```sh
pnpm run package:mac -- --web-arg=--port --web-arg=8080
pnpm run package:mac -- --name 'DSH TUI Web' --profile my-profile --bundle-id ai.deepseek.dsh.tuiweb
```

Two applications wrapping two profiles need two bundle ids, and two names. LaunchServices resolves an application by its id alone, so a second bundle carrying the first's id answers for it; and the log directory and the serving marker are named after `--name`, so a second bundle sharing a name finds the first's session and surfaces that instead of starting its own.

The specs cover what can be checked without a windowing session: the launcher is parsed by the system shell it targets, its focus mode is run against a temporary `HOME`, and the Swift shim is compiled. What remains — the Dock tile, the Automation prompt, the tab that gets raised — is established by hand on a machine with a browser.

## Where this came from

The harness fork's `legacy/all-in-one` branch carries a `package:mac` script that wrapped a monorepo checkout: it baked that checkout's `apps/cli/lib/bin.js` and ran `dsh web` on the default port, so the application broke when the checkout moved and could not be pointed at anything else. This packager keeps that design's hard-won parts — the Cocoa shim, the tab-raising scripts addressed by bundle id, the readiness marker an activation waits for — and replaces the checkout with the installed `dsh`, adds the profile and argument flags, records the URL actually served (so `--web-arg=--port --web-arg=0` works), and routes signals through the same quit the Dock item takes.

## Known limitations

- **macOS only.** `package:mac` refuses any other host outright, and there is nothing to ask for on one: the product is a `.app`, and raising a tab is AppleScript.
- **The bundle is not self-contained.** It runs the `dsh` resolved at build time, so moving or removing that installation breaks a bundle already built — visibly, in an alert, but only at the next launch. Upgrading the harness in place needs no rebuild.
- **Nothing is signed.** The bundle's identity therefore changes with every rebuild, and each rebuild asks again for per-browser Automation approval; a copy carried to another machine needs the `xattr` step under `## Install`.
- **Firefox only ever gets a fresh tab.** It exposes no tab API to AppleScript. So does any browser that is not already running, because only running ones are asked — which is deliberate: a Dock click must not start a browser you had closed.
- **Without a Swift compiler there is no Dock icon.** The fallback build makes the script the executable and marks the bundle `LSUIElement`, so there is no tile and no Quit item, and the server is stopped from Activity Monitor.
- **It boots a profile; it does not install one.** Which plugins a profile carries stays a `dsh plugin` task in a terminal.
- **Nothing past the window server is tested.** The specs establish the generated script, the plist, the path resolution, and that the shim compiles; the Dock tile, the Automation prompt, and the raised tab are established by hand.

# `@wanghao9610/omdsh-webapp`

[中文](README.zh.md)

The harness web UI as a macOS application. `dsh web` starts from a terminal and
prints a URL, so using the browser UI means keeping a terminal open for the
server's lifetime and clicking a printed line. This packager writes a
double-clickable **DSH Web.app** instead: the Dock icon starts the server, opens
the page, and — every time you reach the app afterwards — raises the tab already
showing it rather than opening another.

## What the application does

| When you | It |
|---|---|
| Launch it | boots `dsh --profile web`, waits for the URL it prints, and opens that URL |
| Reach it again (Dock click, Command-Tab, any activation) | raises the tab already showing that URL, in a browser that is already running |
| Launch it while it is already serving | surfaces the running session instead of starting a second one |
| Quit it | stops the server, so no port is left held |

Each run writes `~/Library/Logs/DSH Web/web.log`, and records the URL it is
serving beside it. Only a browser that is already running is ever asked for its
tabs, so a Dock click never starts a browser you had closed; an unmatched URL
falls through to a fresh tab in the default browser.

## Building it

The application is built on the machine that runs it, against the `dsh` already
installed there:

```sh
pnpm install
pnpm run package:mac
```

That writes `dist-macos/DSH Web.app` and `dist-macos/DSH Web.dmg`. Drag the
application to `/Applications` — or open the disk image and drag it from there —
and it is a normal Dock, Launchpad, and Spotlight citizen.

| Flag | Default | What it selects |
|---|---|---|
| `--name <AppName>` | `DSH Web` | the bundle's name, which also names its log directory |
| `--profile <name>` | `web` | the profile it boots |
| `--web-arg=<arg>` | — | one argument for the profile's app, repeatable |
| `--bundle-id <id>` | `com.wanghao9610.omdsh.webapp` | the identity LaunchServices resolves it by |
| `--out <dir>` | `dist-macos` | where the bundle and image land |
| `--dsh <path>` | the first on `PATH` | the launcher the application runs |
| `--node <path>` | the Node running the build | the Node that launcher runs under |
| `--dsh-home <path>` | `$DSH_HOME`, when set | the harness home to pin |
| `--icon <path>` | `assets/macos-app-icon.png` | `.icns` or square `.png` artwork |
| `--no-dmg` | off | skip the disk image |

An argument that starts with a dash needs the `=` form, because Node's argument
parser cannot tell it from a flag of this script's own:

```sh
pnpm run package:mac -- --web-arg=--port --web-arg=8080
pnpm run package:mac -- --name 'DSH TUI Web' --profile my-profile --bundle-id com.example.dsh.myprofile
```

Two applications wrapping two profiles need two bundle ids. LaunchServices
resolves an application by its id alone, so a second bundle carrying the first's
id answers for it.

## What the bundle is, and is not

It is a launcher, not a copy of the harness. Baked into it are the `dsh` path
resolved at build time and a `PATH` holding that launcher's directory and Node's
— a Finder launch inherits no environment at all, not even the login shell's
`PATH`. Everything else it needs, it reads at launch: the profile, its plugins,
and the harness release itself all follow whatever is installed. Upgrading the
harness does not mean rebuilding the application; moving or removing that
installation does.

Nothing inside the bundle is addressed by an absolute path, so it still works
after being dragged to `/Applications`.

The bundle is unsigned. Gatekeeper does not intercept a locally built one, but a
copy carried to another machine through the disk image arrives quarantined:

```sh
xattr -dr com.apple.quarantine '/Applications/DSH Web.app'
```

Because it is unsigned, its identity changes with every rebuild, and macOS asks
again for the per-browser **Automation** approval that raising a tab needs
(System Settings → Privacy & Security → Automation). Until it is granted, each
launch opens a new tab instead of raising the old one — nothing else breaks.

A rebuild also has to be reinstalled: LaunchServices resolves the id to the copy
under `/Applications`, so that copy is what a Dock click runs, however recently
`dist-macos` was rewritten.

The application boots a profile; it does not install one. Adding plugins stays a
terminal task, and a bundle whose profile is missing says so in an alert and in
its log:

```sh
dsh plugin --profile web add <package>
```

## The pieces

| Path | What it is |
|---|---|
| `src/launcher.ts` | The bash script the bundle runs: start, reuse, focus, stop |
| `src/shim.ts` | The Cocoa executable that owns the app's lifetime, in Swift |
| `src/applescript.ts` | The two scripts that raise an existing tab |
| `src/bundle.ts`, `src/icon.ts`, `src/disk-image.ts` | `Info.plist`, `icon.icns`, and the `.dmg` |
| `src/paths.ts` | Which `dsh`, which Node, and the `PATH` they run under |
| `scripts/package-macos-app.ts` | The command, and the flags above |
| `assets/` | The icon, as the `.svg` it is drawn in and the `.png` the packager reads |

The executable is a compiled Cocoa shim rather than the script itself:
LaunchServices bounces the Dock tile until the bundle executable checks in with
the window server, which only a process running an `NSApplication` can do. The
script runs as that shim's child, which is what makes Quit — and a signal —
reach the server and stop it. Where no Swift compiler is installed the script
becomes the executable and the bundle is marked `LSUIElement`: no tile to bounce,
and no Dock icon either, so the server is then stopped from Activity Monitor.

`assets/macos-app-icon.png` is committed because `sips` and `iconutil` read PNG
and no macOS system tool rasterizes SVG. After editing the `.svg`, re-render it
with `pnpm run icon:render` (librsvg's `rsvg-convert`), which is the only step
here that wants a tool macOS does not ship.

## Commands

```sh
pnpm run package:mac   # the application and its disk image
pnpm run typecheck     # sources, script, and specs
pnpm run test          # vitest: the generated script, the plist, the paths, the shim
pnpm run clean         # remove dist-macos
```

The specs cover what can be checked without a windowing session: the launcher is
parsed by the system shell it targets, its focus mode is run against a temporary
`HOME`, and the Swift shim is compiled. What remains — the Dock tile, the
Automation prompt, the tab that gets raised — is established by hand on a
machine with a browser.

## Where this came from

The harness fork's `legacy/all-in-one` branch carries a `package:mac` script that
wrapped a monorepo checkout: it baked that checkout's `apps/cli/lib/bin.js` and
ran `dsh web` on the default port, so the application broke when the checkout
moved and could not be pointed at anything else. This packager keeps that
design's hard-won parts — the Cocoa shim, the tab-raising scripts addressed by
bundle id, the readiness marker an activation waits for — and replaces the
checkout with the installed `dsh`, adds the profile and argument flags, records
the URL actually served (so `--web-arg=--port --web-arg=0` works), and routes
signals through the same quit the Dock item takes.

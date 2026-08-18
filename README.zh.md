# omdsh-webapp

[English](README.md) | 中文

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的网页界面包装为 **macOS 或 Windows 原生桌面应用**。生成的应用取代一直开着的 `dsh web` 终端：它启动 profile、等待服务 URL、呈现浏览器页面，再次触及应用时复用正在运行的会话，并在应用退出时停止服务。

本仓库是应用打包器，不是 harness 插件。它不安装 profile，也不携带 harness 发行版；每个构建产物都指向构建机器上已有的 `dsh`、Node、profile、插件与 harness home。

## 一次启动做了什么

| 当你 | macOS | Windows |
|---|---|---|
| 启动应用 | 启动 `dsh --profile web`，然后打开 URL | 启动 `dsh --profile web`，然后打开 Edge 或 Chrome 应用窗口 |
| 再次触及应用 | 调起已有浏览器标签页 | 调起已有应用窗口；再次运行 `.exe` 会激活第一个实例 |
| 自己的会话已经在服务时启动 | 呈现该会话，不重复启动 | 向唯一运行实例发出激活信号，不重复启动 |
| 端口已被另一个 `dsh` 占用时启动 | 探测并打开那个会话，随后让位 | 探测后在默认浏览器打开那个会话，随后让位 |
| 退出应用 | 只停止自己启动的服务 | 从托盘选择 **Exit**，或运行 `DSH Web.exe --quit`；整棵进程树都会停止 |

Windows 找不到 Edge 或 Chrome 时会退回默认浏览器。页面仍会打开，但 Windows 没有一套适用于所有浏览器的可靠接口来识别并调起任意既有标签页，所以再次启动应用可能重新打开该 URL。Edge 与 Chrome 使用独立的应用式窗口，启动器可以保存并调起它的窗口句柄，无需浏览器自动化权限。

日志在 macOS 上写入 `~/Library/Logs/DSH Web/web.log`，在 Windows 上写入 `%LOCALAPPDATA%\DSH Web\Logs\web.log`。如果一次启动只是呈现了别人的会话，它不拥有任何服务，因此会立即退出。端口若被一个不响应 HTTP 的东西占着，应用会弹出错误框并给出日志路径。

## 目录结构

| 路径 | 用途 |
|---|---|
| `src/launcher.ts`、`src/shim.ts`、`src/applescript.ts` | macOS bash 启动器、Cocoa 生命周期 shim 与标签页聚焦脚本 |
| `src/bundle.ts`、`src/icon.ts`、`src/disk-image.ts`、`src/build.ts` | macOS `.app`、图标与 `.dmg` 组装 |
| `src/windows-launcher.ts` | Windows 单实例启动器、托盘、浏览器窗口、日志与退出逻辑的 C# 源码 |
| `src/windows-build.ts`、`src/windows-icon.ts` | Windows 原生编译与 `.ico` 生成 |
| `src/paths.ts` | 两个平台稳定解析 `dsh`、Node 与启动 `PATH` |
| `scripts/package-macos-app.ts` | `package:mac` 命令 |
| `scripts/package-windows-app.ts` | `package:win` 命令 |
| `assets/` | 原始图案与已提交的平台尺寸 PNG |

Windows 产物是 GUI 子系统的单文件 `.exe`，由 Windows 自带的 .NET Framework C# 编译器生成，不需要 Electron、.NET SDK 或包还原。可执行文件持有托盘图标和命名管道单实例通道；退出时会终止 `dsh` 的整棵进程树，确保不遗留被占用的端口。

macOS 可执行文件是编译后的 Cocoa shim。它向窗口服务器报到、维持 Dock 生命周期，把退出与信号传给生成的 bash 启动器，并用 AppleScript 调起已有浏览器标签页。

## 前置条件

- Node `^22.19.0 || >=24.0.0`
- pnpm 11.7.0
- `PATH` 上存在 `dsh`，或显式传入 `--dsh`
- 已创建要启动的 profile（启动一次或添加插件即可创建）
- `package:mac` 需要 macOS 13+；`package:win` 需要启用了 .NET Framework 4 的 Windows

例如：

```sh
dsh --profile web
dsh plugin --profile web add @omdsh-plugins/omdsh-plughub
```

## 在 macOS 上构建与安装

```sh
pnpm install
pnpm run package:mac
```

产物是 `dist-macos/DSH Web.app` 与 `dist-macos/DSH Web.dmg`。把应用拖入 `/Applications`。构建未签名；从别的机器带来的副本可能需要清除隔离属性：

```sh
xattr -dr com.apple.quarantine '/Applications/DSH Web.app'
```

Finder 启动不继承 shell 的 `PATH`，所以解析到的 `dsh` 与 Node 目录会被写进应用。移动或删除其中任一安装后，需要重新构建。

## 在 Windows 上构建与安装

在 PowerShell 或命令提示符中运行：

```powershell
pnpm install
pnpm run package:win
```

产物是 `dist-windows\DSH Web.exe`。可以把这个可执行文件移动到任意位置，并按需创建开始菜单、任务栏或桌面快捷方式。图标与配置都已嵌入，不需要旁边放任何文件。

应用拥有服务期间会显示托盘图标：

- 双击托盘图标、选择 **Open**，或再次启动 `.exe`，都会呈现页面。
- 选择 **View log** 打开当前日志。
- 选择 **Exit** 会关闭浏览器应用窗口，并停止 harness 进程树。
- 脚本可用 `& '.\DSH Web.exe' --quit` 完成同样的有序退出。

构建会自动寻找 `%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`（找不到则尝试 32 位版本）。只有编译器位于别处时才需要 `--csc`。传输来的未签名可执行文件可能触发 Microsoft Defender SmartScreen；本项目目前不签名任一平台的产物。

## 命令

```sh
pnpm install
pnpm run package:mac   # macOS .app 与 .dmg
pnpm run package:win   # Windows 原生 .exe
pnpm run icon:render   # 从 SVG 重新生成两个平台的 PNG
pnpm run typecheck
pnpm run test
pnpm run clean         # 删除 dist-macos、dist-windows 与 TypeScript 构建信息
```

### 通用构建参数

参数写在 pnpm 的 `--` 分隔符之后：

| 参数 | 默认值 | 含义 |
|---|---|---|
| `--name <AppName>` | `DSH Web` | 应用、托盘/Dock 与日志目录名称 |
| `--profile <name>` | `web` | 要启动的 profile |
| `--web-arg=<arg>` | — | 一个 profile 应用参数；可重复 |
| `--out <dir>` | `dist-macos` 或 `dist-windows` | 输出目录 |
| `--dsh <path>` | `PATH` 上第一个 `dsh` | 要运行的 harness 启动器 |
| `--node <path>` | 执行构建的 Node | 放入启动 `PATH` 的 Node |
| `--dsh-home <path>` | 已设置时取 `DSH_HOME` | 要固定的 harness home |
| `--icon <path>` | `assets/` 中的平台 PNG | macOS 接受 `.png`/`.icns`，Windows 接受 `.png`/`.ico` |

以短横线开头的参数要用 `=` 形式：

```sh
pnpm run package:win -- --web-arg=--port --web-arg=8080
pnpm run package:mac -- --name 'DSH TUI Web' --profile my-profile
```

### 平台专用参数

| 平台 | 参数 | 默认值 | 含义 |
|---|---|---|---|
| macOS | `--bundle-id <id>` | `ai.deepseek.dsh.web` | LaunchServices 身份 |
| macOS | `--no-dmg` | 关 | 跳过磁盘镜像 |
| Windows | `--app-id <id>` | `ai.deepseek.dsh.web` | Mutex 与激活通道身份 |
| Windows | `--browser <path>` | 自动探测 Edge，再探测 Chrome | 用于应用窗口的浏览器可执行文件 |
| Windows | `--csc <path>` | 系统 .NET Framework 编译器 | 生成原生可执行文件的 C# 编译器 |

包装不同 profile 的两个应用需要不同名称和身份（macOS 用 `--bundle-id`，Windows 用 `--app-id`）。重复使用身份会有意让第二次启动激活第一个应用。

## 验证

`pnpm test` 会在各自主机上执行平台相关路径。macOS 测试会解析并运行生成的 bash 启动器、编译 Swift shim。Windows 测试会编译真实的 PE GUI 可执行文件，启动临时 HTTP 服务来代替 `dsh`，验证第二次启动复用第一个实例，并验证 `--quit` 停止服务进程树。纯源码、路径、元数据与图标测试在两个平台都运行。

## 已知限制

- 构建是主机原生的：`.app`/`.dmg` 要在 macOS 上生成，`.exe` 要在 Windows 上生成。
- 产物是启动器，不是自包含的 harness 发行版。移动或删除写入其中的 `dsh` 或 Node 安装后需要重建；原地升级 harness 不需要。
- 产物未签名。
- macOS 调起已有标签页需要按浏览器授予「自动化」权限。Firefox 没有 AppleScript 标签页 API，因此始终新开标签页。
- Windows 能可靠调起自己创建的 Edge/Chrome 应用窗口；退回其他默认浏览器时可能再次打开 URL，因为 Windows 没有通用标签页选择 API。
- 应用只启动 profile，不安装也不修改 profile。
- Dock/托盘与真实浏览器行为仍需在图形桌面上做最终人工检查；底层启动、复用与退出路径已有自动化测试。

## 来源

harness fork 的 `legacy/all-in-one` 分支曾包含一个绑定到某份 monorepo checkout 的 macOS 包装器。本项目保留了它的应用生命周期与浏览器聚焦思路，改为面向已安装的 `dsh`，加入 profile 与任意网页参数、实际服务 URL 记录、端口占用处理，并用原生单实例启动器在 Windows 上实现了同样的生命周期。

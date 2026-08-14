# `@wanghao9610/omdsh-webapp`

[English](README.md)

把 harness 的网页界面装进一个 macOS 应用。`dsh web` 从终端启动并打印一个 URL，
于是使用网页界面就意味着：服务活多久，终端窗口就得开多久，还要去点那行打印出来
的地址。这个打包器改为写出一个可双击的 **DSH Web.app**：点 Dock 图标即启动服务
并打开页面，此后每次再次触及该应用，都会把已经显示着它的那个标签页调至前台，而
不是再开一个。

## 这个应用做什么

| 当你 | 它 |
|---|---|
| 启动它 | 启动 `dsh --profile web`，等它打印出 URL，然后打开该 URL |
| 再次触及它（点 Dock 图标、Command-Tab、任何激活方式） | 在**已经运行**的浏览器里，把显示该 URL 的标签页调至前台 |
| 在它已经在服务时再次启动 | 呈现正在运行的会话，而不是再起一个 |
| 退出它 | 停止服务，不留下被占用的端口 |

每次运行都写入 `~/Library/Logs/DSH Web/web.log`，并在它旁边记录当前服务的 URL。
只有已经在运行的浏览器才会被询问标签页，所以点击 Dock 图标绝不会拉起一个你已经
关掉的浏览器；没有匹配到标签页时，则退回到默认浏览器的新标签页。

## 构建

应用在哪台机器上运行，就在哪台机器上构建，并对接那台机器上已安装的 `dsh`：

```sh
pnpm install
pnpm run package:mac
```

它写出 `dist-macos/DSH Web.app` 和 `dist-macos/DSH Web.dmg`。把应用拖进
`/Applications`（或打开磁盘镜像从里面拖出来），它就是 Dock、启动台与聚焦搜索里
的正常一员。

| 标志 | 默认值 | 选择什么 |
|---|---|---|
| `--name <AppName>` | `DSH Web` | 应用包名称，同时也是日志目录名 |
| `--profile <name>` | `web` | 它启动的 profile |
| `--web-arg=<arg>` | — | 传给该 profile 应用的一个参数，可重复 |
| `--bundle-id <id>` | `com.wanghao9610.omdsh.webapp` | LaunchServices 解析它所用的身份 |
| `--out <dir>` | `dist-macos` | 应用包与磁盘镜像的输出目录 |
| `--dsh <path>` | `PATH` 上的第一个 | 应用运行的那个启动器 |
| `--node <path>` | 执行构建的那个 Node | 该启动器所依赖的 Node |
| `--dsh-home <path>` | 已设置时取 `$DSH_HOME` | 要固定下来的 harness home |
| `--icon <path>` | `assets/macos-app-icon.png` | `.icns` 或方形 `.png` 图案 |
| `--no-dmg` | 关 | 跳过磁盘镜像 |

以短横线开头的参数必须使用 `=` 形式，因为 Node 的参数解析器无法把它与本脚本自己
的标志区分开：

```sh
pnpm run package:mac -- --web-arg=--port --web-arg=8080
pnpm run package:mac -- --name 'DSH TUI Web' --profile my-profile --bundle-id com.example.dsh.myprofile
```

包装两个 profile 的两个应用需要两个 bundle id。LaunchServices 只按 id 解析应用，
所以第二个应用若沿用第一个的 id，就会替它作答。

## 这个应用包是什么，不是什么

它是一个启动器，而不是 harness 的副本。烘焙进去的只有构建时解析到的 `dsh` 路径，
以及一条包含该启动器目录与 Node 目录的 `PATH`——Finder 启动不继承任何环境，连登录
shell 的 `PATH` 都不继承。其余的一切都在启动时读取：profile、它的插件、以及
harness 发行版本身，都跟随当时安装的那一份。升级 harness 不需要重新构建这个应用；
移动或删除那份安装则需要。

应用包内部没有任何一处用绝对路径寻址，因此把它拖进 `/Applications` 之后依然可用。

该应用包未签名。Gatekeeper 不拦截本机构建的副本，但经磁盘镜像带到另一台机器的副本
会带上隔离标记：

```sh
xattr -dr com.apple.quarantine '/Applications/DSH Web.app'
```

也正因为未签名，它的身份随每次重新构建而变化，于是 macOS 会再次询问调起标签页所
需的、按浏览器逐个授予的**「自动化」**权限（系统设置 → 隐私与安全性 → 自动化）。
在授予之前，每次启动都会新开一个标签页而不是调起旧的——除此之外没有别的影响。

重新构建之后还必须重新安装：LaunchServices 把 id 解析到 `/Applications` 下的那个
副本，所以无论 `dist-macos` 刚刚被重写过多久，点击 Dock 图标运行的都是它。

这个应用启动 profile，但不安装 profile。添加插件仍然是终端里的事；profile 缺失时，
应用会用一个警告框和它的日志说明这一点：

```sh
dsh plugin --profile web add <package>
```

## 各个部件

| 路径 | 是什么 |
|---|---|
| `src/launcher.ts` | 应用包运行的那段 bash：启动、复用、聚焦、停止 |
| `src/shim.ts` | 掌管应用生命周期的 Cocoa 可执行文件，用 Swift 写成 |
| `src/applescript.ts` | 调起既有标签页的两个脚本 |
| `src/bundle.ts`、`src/icon.ts`、`src/disk-image.ts` | `Info.plist`、`icon.icns` 与 `.dmg` |
| `src/paths.ts` | 用哪个 `dsh`、哪个 Node，以及它们运行时的 `PATH` |
| `scripts/package-macos-app.ts` | 命令本身，以及上面那些标志 |
| `assets/` | 图案：绘制它所用的 `.svg`，与打包器读取的 `.png` |

应用包的可执行文件是一个编译出来的 Cocoa shim，而不是那段脚本本身：在应用包的可
执行文件向窗口服务器报到之前，LaunchServices 会一直让 Dock 图标弹跳，而只有运行
`NSApplication` 的进程才能报到。脚本作为该 shim 的子进程运行，这也正是「退出」
——以及一个信号——能够抵达服务并将其停止的原因。在没有 Swift 编译器的机器上，脚本
本身成为可执行文件，应用包被标记为 `LSUIElement`：没有要弹跳的图标，也就没有 Dock
图标，此时只能从活动监视器停止服务。

`assets/macos-app-icon.png` 之所以被提交进仓库，是因为 `sips` 与 `iconutil` 读
PNG，而 macOS 没有任何系统工具能栅格化 SVG。改动 `.svg` 之后用
`pnpm run icon:render`（librsvg 的 `rsvg-convert`）重新渲染——这是这里唯一需要
macOS 自身不附带的工具的一步。

## 命令

```sh
pnpm run package:mac   # 应用与它的磁盘镜像
pnpm run typecheck     # 源码、打包脚本与测试
pnpm run test          # vitest：生成的脚本、plist、路径解析与 shim
pnpm run clean         # 删除 dist-macos
```

测试覆盖的是无需窗口会话即可检查的部分：生成的启动脚本由它所面向的系统 shell 解析，
它的聚焦模式对着一个临时 `HOME` 真实跑一遍，Swift shim 会被真正编译。剩下的部分
——Dock 图标、自动化授权弹窗、被调起的那个标签页——由人在带浏览器的机器上确认。

## 它从哪里来

harness fork 的 `legacy/all-in-one` 分支上有一个 `package:mac` 脚本，它包装的是
一份 monorepo checkout：把那份 checkout 的 `apps/cli/lib/bin.js` 烘焙进去，并在
默认端口上运行 `dsh web`，因此 checkout 一移动应用就坏掉，而且无法指向别的东西。
这个打包器保留了那个设计中来之不易的部分——Cocoa shim、按 bundle id 寻址的调起标
签页脚本、以及激活时所等待的就绪标记——并把 checkout 换成了已安装的 `dsh`，加上了
profile 与参数标志，改为记录实际服务的 URL（于是
`--web-arg=--port --web-arg=0` 也能工作），并把信号引向了 Dock 退出项所走的同一
条路径。

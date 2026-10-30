# Council 跨平台开发（DEMO MVP）

源码共用；每个操作系统分别安装依赖，不能复制 node_modules、out 或 release 中的原生二进制到另一平台。默认 DEMO；DeepSeek、豆包、Kimi 支持基于原网页的文字收发，通义和 Gemini 仅提供原网页入口。

## 环境

- Node.js 22.12+（建议 22 系列）和 npm 10+。`.nvmrc` 提供可选版本提示，不要求全局安装版本管理器。
- macOS：已有 Xcode Command Line Tools / Xcode、Python 3；支持 Intel 与 Apple Silicon 按本机架构安装。本次只验证 Intel x64。
- Windows：PowerShell 或 cmd，Node.js、Python 3；如果原生模块需要源码编译，准备 Visual Studio Build Tools 的 C++ 桌面开发工具链。工具缺失时由用户自行安装，不要禁用系统安全策略。
- 安装/首次 Electron 启动/打包需访问官方 npm、Electron 与 electron-builder 公开下载源。

## 首次启动

在本项目目录运行（两平台相同）：

```sh
npm ci
npm run verify
npm run dev
```

依赖安装完成后，macOS 可双击 `start-mac.command`，Windows 可双击 `start-windows.cmd`。若 Finder 启动时找不到 Node，请在已配置 Node 的终端运行 `npm run dev`。

`npm ci` 的 postinstall 会通过 electron-builder 重建 better-sqlite3，目标是 Electron ABI，而不是宿主 Node ABI。更换 Node、Electron 或机器架构后，重新 `npm ci`；只需重建原生模块时运行 `npm run rebuild:native`。不要用宿主 Node 直接执行原生数据库 smoke。

## 检查与打包

```sh
npm run typecheck
npm test
npm run build
npm run test:native
```

`verify` 顺序执行以上四项。原生 smoke 使用 Electron 的 Node 模式、临时数据库和 60 秒超时，检查 worker 写入、关闭及重开读取；不登录任何 AI。

macOS 本机：`npm run pack:mac` 生成 release 下的 `.app`；`npm run dist:mac` 生成 DMG。
Windows 本机：`npm run pack:win` 生成解包目录；`npm run dist:win` 生成 NSIS 安装包。
脚本阻止跨宿主打包，避免误把本机 SQLite 二进制用于其他平台。默认本机架构；切换架构须重新安装和验证依赖。

打包均为本地无签名、不发布。macOS identity=null、关闭证书自动发现；Windows 不签名/修改可执行资源。未公证产物可能触发系统安全提示，不要关闭 Gatekeeper、sandbox 或 webSecurity 来绕过。正式分发签名/公证不在本任务范围。

可选浏览器视觉检查：先准备 Playwright Chromium，再 `node scripts/visual-smoke.mjs`。默认使用 Playwright 自带浏览器；可用 CHROMIUM_PATH 指定本机可执行文件，保留 chromiumSandbox。截图输出 evidence/。此检查仅演示模式，不验证真实 AI。

## 数据与安全

数据位于 Electron userData 下的 council.sqlite 和 Partitions：macOS 通常为 ~/Library/Application Support/council-desktop，Windows 通常为 %APPDATA%/council-desktop，具体取决于打包应用名。不把这些数据作为源码复制。关闭主窗口会完整退出并关闭数据库，两平台保持一致。

不提取 Cookie/Token；不自动登录、重发真实问题；远程视图保留 sandbox、contextIsolation、webSecurity。已有 QA_REPORT.md 是原 Linux 环境记录，本次 Mac 验证单独记录在 LOCAL_VALIDATION.md。


## DEMO 回归验收

`npm run test:demo` 在真实 Electron 中验证空群、流式回复、三成员、@Kimi、取消、切群和持久化。先运行 `npm run build`。它在 evidence/ 下创建独立测试数据，不使用正常账号目录，也不会登录/发送真实 AI 请求。
macOS 打包后可运行 `node scripts/demo-smoke.cjs --packaged`，通过 harness 执行 release/mac/Council.app/Contents/Resources/app.asar 内的实际代码。测试保持 Chromium sandbox 和 webSecurity，记录页面及 CSP 错误；结果写入 evidence/demo-smoke-result.json。

## 网页适配回归

`npm run test:provider-dom` 使用独立临时数据和离线 DOM 页面，在启用 sandbox/webSecurity 的真实 Electron 中检查三平台输入框、豆包段落换行、助手回复过滤、思考内容排除、完成/停止及限流提示。它不会登录或请求真实 AI。`npm test` 另行验证发送一次、草稿保护、取消、超时、会话切换和临时会话地址。

真实账号测试须明确授权；不要读取 Cookie/Token，也不要调用网站私有接口。通过主窗口的窄 bridge 在独立测试群发无敏感内容，记录每个平台的结果。临时 `--remoteDebuggingPort` 和 `--inspect` 仅用于本机开发，验收后重启普通 `npm run dev`。

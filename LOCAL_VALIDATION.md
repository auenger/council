# 本机验证记录 — 2026-10-26

更新：初次 GUI 加载圈缺陷已修复，最终验收见下方追加记录。

工程：/Users/ryan/mycode/council-desktop
环境：macOS Darwin 25.5.0，Intel x64；Node 22.13.0，npm 10.9.2，Python 3.11；已有 Xcode。

## 已执行

- 输入 ZIP：426932 bytes，SHA256 与 SOURCE_PROVENANCE.md 一致。
- 解压安全：所有条目位于 council-mvp 下，无路径穿越或符号链接。
- 锁文件：全部 resolved URL 来自 registry.npmjs.org。
- npm ci --registry=https://registry.npmjs.org --cache .cache/npm --no-audit --no-fund：成功，466 packages；postinstall 成功处理 better-sqlite3。存在依赖弃用警告，未执行安全审计或无关升级。
- npm run verify：成功，包含 vue-tsc --noEmit、vitest run（4 文件，19/19）、electron-vite build、SQLite native smoke。
- SQLite：Electron ABI 150，worker 写入、关闭、重开读取 roundtrip PASS。
- node scripts/package.cjs mac --dir：退出 0，输出 release/mac/Council.app；日志明确 identity=null 跳过签名。使用默认 Electron 图标。
- scripts/package.cjs、run-native.cjs、visual-smoke.mjs：Node 语法检查通过。
- 本地 GUI：open release/mac/Council.app 成功；Computer Use 观察到 Council 窗口和 DEMO 标识、成员、输入框。聊天区持续加载圈，未通过完整 GUI 验收；未发送消息。此异常保留为后续 UI 排查事项，没有以测试通过替代视觉结果。

## 修改

原生 smoke 改用 Node spawn 传递环境变量，兼容 Windows；增加 60 秒超时。
mac/win 打包改用平台校验脚本，本机无签名、不发布，排除继承的签名凭证变量。
Playwright 视觉脚本移除 /usr/bin/chromium 假设并自动创建 evidence 目录。
测试 mock 移除 /tmp 硬编码。增加 engines、.nvmrc、重建/verify/pack 命令、两平台便捷启动脚本及开发说明。
业务代码与 sandbox/webSecurity 未改动。

## 产物和限制

生产文件：out/；Mac x64 应用：release/mac/Council.app。
保留原 ZIP：source-archive/Council-0.1.0-source.zip。
未生成 DMG/Windows 安装包；未验证 Windows、Apple Silicon、签名/公证或真实 AI 收发。
初次 GUI 聊天区加载异常已在后续修复；以下追加记录取代初次 GUI 限制。
没有登录 AI、提取认证信息、关闭安全设置、安装全局工具或 Git push。


## 加载圈根因与最终修复

实际安装的 vue-advanced-chat 2.1.2 在房间变更时调用 onRoomChanged，将内部 loadingMessages 置 true；messagesLoaded watcher 仅在后续 true 变化时结束加载。原 App.vue 恒定传 true，没有处理 fetch-messages，所以空房间不会解除内部加载。不是 bridge、组件注册或 SQLite 初始化失败。

App.vue 改为响应式 messagesLoaded；fetch-messages 后先 false，再 await nextTick 后 true。记录房间 ID 和递增代次，切群时同步失效旧代次，拒绝旧房间事件和过时回调；不清空实际消息，不替换组件。

调试同时发现依赖在隐藏 footer/emoji 功能时仍创建 emoji 数据库，默认 CDN 请求被 CSP 拦截。显式关闭未使用的表情 UI，并将 emoji-data-source 指向随包发布的本地最小 JSON；CSP 没有放宽。

### 最终实际验证

- npm run verify：typecheck、19/19 测试、production build、Electron ABI 150 SQLite durable roundtrip 全部通过。
- node scripts/demo-smoke.cjs：真实 Electron 渲染界面、独立测试 userData，初始空状态、三成员本地回复、@Kimi 单家、取消、空群/历史群切换、关闭重开持久化通过。
- node scripts/package.cjs mac --dir：最终 Mac x64 无签名包重建成功。
- node scripts/demo-smoke.cjs --packaged：从最终 app.asar 加载 main/preload/renderer/SQLite worker 运行同一验收，全部通过。此方式使用测试 harness 设置独立 userData，再运行包内代码；没有修改正常应用数据。
- 运行时断言 sandbox=true、webSecurity=true；捕获的 renderer pageerror / console error（含 CSP）为空。
- evidence/demo-smoke-result.json 保留最后一次机器可读验收结果和独立测试数据目录。
- 最终 app.asar SHA256：c664a275925c8e342e6de950406d3d168a39fa0fe0306a9cefd0138969ea61b4。

未使用真实 AI、登录账号、签名证书或放宽沙箱。Windows/Apple Silicon/DMG/真实 AI 仍未验证。19 项单元测试与 Electron 集成验收分开计数，不宣称新增单元测试数量。

## 2026-10-26 三平台真实网页兼容性修复

使用用户已登录的本机 Electron 会话，通过网页可见 DOM 和原生输入完成验证；没有读取凭据、私有接口或更改安全选项。所有新消息均为独立测试群中的无敏感测试内容。

实现变更：
- DeepSeek、豆包、Kimi 的文字提交、助手回复提取、页面生成结束检测和停止操作。
- 发送时恢复当前群聊的原网页会话；定时检查输入框状态，区分网页就绪、加载、未识别输入框和原站限流提示。
- 豆包 ProseMirror 段落换行、发送按钮延迟就绪、`local_` 临时会话地址转正式地址；Kimi 临时 `p<UUID>` 地址转正式地址。
- DeepSeek 用消息序号处理虚拟列表；豆包按回复 ID 与对应本轮提问匹配，避免旧消息节点回收后丢失新回复。
- 保护原网页草稿；提交后中断、导航或超时保留不确定状态，不自动重发。跨群上下文排除失败回复。
- 通义/Gemini 继续明确为仅原网页模式。

实际结果：
- 三平台首次群聊、并发回复、重启后自动打开原网页并续聊成功。
- 最终长历史续聊三平台均返回“兼容修复成功。”且状态为 done：`evidence/live-compat/compat-release-check.json`。
- DeepSeek 长回复在虚拟列表节点回收后仍可捕获；豆包长上下文等待发送按钮就绪后成功提交并回传。
- 停止测试中，豆包和 Kimi 的原网页生成已停止；DeepSeek 在本轮取消前已正常完成。三平台页面停止后的 busy 均为 false；核对后确认测试会话再续聊成功。停止仍不构成服务端中止保证。
- Kimi 现有草稿保护实测通过；没有提交测试问题，随后仅清除了测试草稿。
- Kimi 的 K3.1 Pro 原站曾提示“和 Kimi 聊天的人太多了，订阅会员可进入优先队列”；在测试窗口手动切换“快速”后通过。程序不会自动改变用户模型或绕过额度。

检查通过：`npm run typecheck`、`npm test`（31 项）、`npm run build`、`npm run test:provider-dom`、`npm run test:native`、`npm run test:demo`。DOM 回归覆盖富文本段落、仅助手正文、思考排除、虚拟列表序号、停止按钮、限流提示及按钮就绪/草稿匹配后仅点击一次。

限制：这是本机当前网页版本的文字验证；未验证文件上传、多模态、所有模型/账号组合或 Windows。网页更改和账号限流仍可能影响适配。完成判断依据网页 DOM，不是供应商协议完成通知。

## 2026-10-26 新建群聊克隆异常

修复渲染进程向 bridge 传递 Vue Proxy 的问题：浅拷贝群聊后，members 仍然是响应式数组；手动选择收件人时 targets 也可能是 Proxy。现在在渲染进程通信边界，将 JSON schema 数据完整转为普通对象，桌面 IPC 和浏览器演示共用这层转换。

回归结果：类型检查、33 项单元测试和构建通过；真实 Electron 的隔离 DEMO 测试通过界面按钮新建群聊、修改角色、保存、重启检查持久化，以及点击 @Kimi 按钮选择成员并发送。此前测试用 page.evaluate 直接传入普通对象创建第二个群，未覆盖响应式表单；已替换为实际表单操作。用户正在运行的开发界面已通过 Vite 热更新加载修复。

## 2026-10-26 Cindy 样式与可收起布局

参考 Cindy 的现有设计规范，统一灰阶背景、胶囊操作按钮、输入框、8px 多行输入与12px弹窗。主窗口改为集成标题栏，macOS 保留原生窗口按钮；左栏收起为快捷入口，右栏可完全隐藏，顶部提供独立开关和专注模式，状态持久化到本机。

验证：`npm run typecheck`、33 项单元测试、生产构建和 `npm run test:demo` 通过。新增 `node scripts/layout-smoke.cjs` 使用独立测试数据，验证左右收起后的实际宽度、草稿保留、重启恢复、专注模式还原、深色弹窗和800px窗口无横向溢出。截图见 `evidence/layout/`。Windows/Linux 窗口控件已实现，本次仅在 macOS 实机验证。

## 2026-10-26 Logo、图标工具栏与消息渲染

保留紫色四瓣聚合 Logo，以 SVG 组件用于标题栏和空状态。公共 IconButton 使用 500ms Tooltip、圆形按钮与无障碍名称；消息操作栏采用24px按钮、14px图标。消息流改为原生 Vue 组件，用户消息靠右、AI 正文靠左，统一段落、标题、引用、嵌套列表、表格和可复制代码块，支持深浅主题与保留历史阅读位置。

`npm run typecheck`、33 项单元测试、构建、`npm run test:demo`、`node scripts/layout-smoke.cjs` 均通过。新增 `node scripts/message-render-smoke.cjs` 验证 Markdown 结构、HTML/图片惰性显示、实际剪贴板复制、Tooltip、深浅主题与流式阅读位置；截图位于 `evidence/messages/`。此轮消息测试使用隔离数据与模拟内容，没有向真实平台发送测试消息。

## 2026-10-26 群聊管理

群聊支持8种内置图标，标题和侧栏同步展示并持久化。标题工具栏和编辑弹窗提供删除入口，二次确认后移除本地群聊、消息和运行记录，关闭对应原网页窗口但保留账号分区和官网记录。正在回复时拒绝删除，延迟回调不会重建已删除群的运行记录。

类型检查、33项单元测试、构建通过。`node scripts/group-management-smoke.cjs` 使用隔离测试群验证图标保存与重启恢复、回复中拒绝删除、取消确认、删除记录、自动切群、删除最后一个群及重新创建。

## 2026-10-26 原站 Markdown 复制与后台窗口

DeepSeek、豆包、Kimi 完成回复后优先调用该条回复的官网复制按钮，局部接收官网写入 clipboard API / copy 事件的文本，不读取或覆盖系统剪贴板。已用三个现有原会话验证：均能得到 Markdown，豆包保留 copy 事件中的原始换行。流式预览与复制失败时采用正文 DOM 转 Markdown 兜底（标题、列表、表格、引用、代码），历史 DeepSeek 引用碎片修正并禁用易误判的 Setext 标题。

自动发送创建隐藏原站窗口，关闭后台节流，不抢窗口焦点。App 显示连接、等待和回复状态；手动打开官网仍显示窗口；输入框不可用且等待超时会显示原窗口供登录/验证。不会自动重试提交。

验证：35项单元测试、typecheck、构建、三站 DOM fixtures、消息渲染测试通过。`node scripts/background-provider-smoke.cjs` 在无网络的 Electron 协议 fixtures 中验证三家隐藏窗口原生输入/提交、恰好一次提交、官网复制、系统剪贴板保持和主动显示。真实官网验收仅复制现有回复，没有发送新的问题。当前三个最新回复与官网正文精确匹配后恢复官网 Markdown；恢复前数据库备份 `evidence/markdown/before-recovery.sqlite`。

## 2026-10-26 群聊与原站 session 绑定

首次调用某群的 AI：后台打开官网、点击已识别的新建入口、等待空白输入框与空消息区稳定，随后发送并保存该群×服务的独立会话 URL；既有群只恢复已绑定 URL，角色说明仅首次发送。手动导航到其他会话不会覆盖绑定，会进入待核对状态；主动打开原网页恢复原 URL；只有显式重置才重新分配 session。新建入口无法确认、恢复失败或跨群 URL 冲突时拒绝发送。

真实网站只读核对入口，并在独立账号窗口点击新建验证三站均回到无消息的首页，没有发送问题，也没有改动用户群的绑定。`scripts/session-binding-smoke.cjs` 在隔离 Electron + 本地协议 fixtures 中验证三家×两群、首页恢复旧聊天时强制新建、同群连续多轮复用、角色仅一次、重启恢复、手动切错会话阻止发送且保留绑定、显式重置获得新 session。`scripts/background-provider-smoke.cjs` 回归隐藏发送与复制。35项单元测试、类型检查、构建通过。

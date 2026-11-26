# Auralis 移动端 Tauri 2 迁移方案

更新时间：2026-11-26

文档状态：现行迁移方案（计划中，阶段 0 PoC 尚未开始）

权威范围：移动端从 Uni-app 迁移到 Vue 3 + Vite + Tauri 2 的范围决策、目标架构、实施阶段、PoC 检查项、风险与文档回写清单

事实来源：`main` `c5b0678` 的 `Auralis-Mobile` 源码统计、`Auralis-PC` 现行 Tauri 配置，以及 2026-11-26 用户确认的范围决策

实施分支为 `feat/mobile-tauri-migration`（工作树 `D:/CodeBase/Active/Auralis-mobile-tauri`），统计口径为 `main` 上的 `Auralis-Mobile/src`（133 个文件、56,570 行）。本文是迁移期间的执行依据；迁移完成后，实现细节并入 [Mobile / Tablet 模块](../modules/FrontendMobileTablet.md)，本文移入 `archive/design-and-plans/`。在迁移完成并回写前，[Mobile / Tablet 模块](../modules/FrontendMobileTablet.md)仍描述现行 Uni-app 实现。

## 1. 决策与范围

| 类别 | 内容 |
| --- | --- |
| **已定** | 手机和平板做成两个独立 App：**Auralis**（`com.auralis.mobile`，竖屏，只含手机页面）和 **Auralis HD**（`com.auralis.hd`，横屏，只含平板页面，带阅读器）；只做 Android；直接在原 `Auralis-Mobile` 目录重构 |
| **不做** | Rust 共享层：移动端 `src-tauri` 只注册官方插件，不抽取也不复制 PC 的 Rust 代码。iOS / iPadOS |
| **退出发布范围** | 微信小程序；Mobile H5 网页版（新技术栈依赖 Tauri SQLite，不再提供浏览器版本）；平板 OCR / 本地解析 |
| **保持不动** | 后端、OpenAPI 契约、数据库、PC 客户端；平板手写代码保留，开关继续关闭 |
| **旧数据** | 不迁移。Uni-app 原生版从未发布；新 App 首次登录后通过快照同步恢复数据 |

## 2. 现状规模（`main` 基线）

| 项目 | 数量 |
| --- | --- |
| `uni.*` 调用 | `showToast` 152；存储类 42；路由类 28（`reLaunch` 13、`redirectTo` 7、`navigateTo` 4、`navigateBack` 4）；`showModal` 12；`createSelectorQuery` 10；`getSystemInfoSync` 4；网络状态 5；`request` 3；加载提示 3；`connectSocket`、`openDocument`、`downloadFile`、`previewImage`、剪贴板、震动各 1 |
| `plus.*` 调用 | 13 处，全在 `localDb.ts` 的原生 SQLite |
| 条件编译 | `#ifdef H5` 约 70 处；`MP-WEIXIN` 9 处 |
| 模板标签 | `<view>` 1448、`<text>` 773、`<scroll-view>` 33、`<picker>` 3、`<rich-text>` 2、`<canvas>` 1 |
| 测试 | 16 个测试文件，其中 5 个依赖 `uni` 模拟或 `localDb` |
| 本地事务 | `localDb` 没有跨调用的显式事务，用默认连接池即可，无需自定义 Rust |

**关键判断**：H5 分支代码就是迁移后要用的代码（AI 流式、阅读器、IndexedDB 文档缓存、文件直传都已在 H5 联调过）。唯一必须重写的核心是 `localDb`：H5 版是用 localStorage 模拟的 SQL，要换成 `tauri-plugin-sql` 真 SQLite。

## 3. 目标架构

```text
Auralis-Mobile/
├── index.html / vite.config.ts / tsconfig.json / package.json
├── src/
│   ├── main.ts / App.vue
│   ├── router/          # phone.ts、tablet.ts：按 VITE_APP_TARGET 只打包本端路由
│   ├── platform/        # toast、dialog、storage、network、clipboard、haptics、opener、lifecycle 适配
│   ├── api/ store/ services/ utils/ composables/   # 现有业务层，删除 APP-PLUS / MP-WEIXIN 分支
│   ├── components/ pages/mobile/ pages/tablet/ styles/
├── src-tauri/
│   ├── Cargo.toml / src/lib.rs / src/main.rs       # 只注册插件：sql、opener、clipboard-manager、haptics
│   ├── tauri.conf.json + tauri.phone.conf.json + tauri.tablet.conf.json
│   ├── capabilities/
│   └── gen/android/     # 屏幕方向按变体写入 AndroidManifest
└── scripts/             # 测试与静态检查
```

**技术栈版本与 PC 对齐**：Vue 3.5、Vite 8、TypeScript 6、vue-tsc 3、Pinia 3、vue-router 4、`@tauri-apps/cli` / `api` 2.11.1、`@tauri-apps/plugin-sql` 2.x、KaTeX、DOMPurify、`@file-viewer/*`。删除全部 `@dcloudio/*` 和 `vue-i18n`（当前未使用）。

**两个 App 的拆分方式**
- 前端在构建时用 `VITE_APP_TARGET=phone|tablet` 选路由表，另一端的页面被摇树去掉；`@file-viewer` 资源只打进平板包。
- Tauri 用配置覆盖文件区分 `identifier`、`productName` 和前端构建命令。
- 屏幕方向写在 AndroidManifest：手机 `portrait`，平板 `sensorLandscape`。
- 原来的启动选择页 `pages/launch` 删除，每个 App 直接进入本端首页或登录页。

**存储**
- 业务数据：`tauri-plugin-sql`，库名 `sqlite:auralis_<scope>.db`，保留"按账号/设备/重置次数分库"。建表与迁移 SQL 沿用现有原生分支；切换账号或重置时调用 `close()` 关闭旧库，并继续校验登录世代。
- 键值数据（会话、设备标识、偏好）：通过 `platform/storage` 写 localStorage。
- 平板原文缓存：沿用 IndexedDB `localDocumentCache`。
- 测试：用 Node 24 自带的 `node:sqlite` 驱动真实 SQL。

**网络**：REST 和 AI 流式沿用 H5 的 `fetch` / `ReadableStream`；实时连接用原生 `WebSocket`；上传沿用 H5 的 XHR 直传 MinIO（带进度）；下载用 `fetch`。

### `uni` API 替换映射

| 原调用 | 替换为 |
| --- | --- |
| `showToast` / `showModal` / `showLoading` | 自绘禅意 Toast / Confirm / Loading 组件（`platform/`） |
| `get/set/removeStorageSync` | `platform/storage`（localStorage） |
| `navigateTo` / `redirectTo` / `reLaunch` / `navigateBack` | `router.push` / `replace` / 重置历史后 `replace` / `back` |
| `onLoad(query)` | `route.query` |
| `onShow` / `onHide`（App 与 8 个页面） | `visibilitychange` + Tauri 恢复事件；页面重进用路由监听 |
| `connectSocket` | 原生 `WebSocket` |
| `request` / `downloadFile` | `fetch` |
| `createSelectorQuery` | 元素引用 + `getBoundingClientRect` |
| `getSystemInfoSync` | 视口尺寸 + CSS `env(safe-area-inset-*)`；端类型由构建决定 |
| `getNetworkType` / `onNetworkStatusChange` | `navigator.onLine` + `online` / `offline` 事件 |
| `setClipboardData` | `@tauri-apps/plugin-clipboard-manager` |
| `vibrateLong` | `@tauri-apps/plugin-haptics` |
| `openDocument` / `previewImage` | `@tauri-apps/plugin-opener` 的 `openUrl` / 应用内图片浮层 |
| `<view>` / `<text>` / `<scroll-view>` | `<div>` / `<span>` / 可滚动 `<div>` |
| `<picker mode="date">` | 自绘日期选择面板 |
| `<rich-text>` | DOMPurify 过滤后的 `v-html` + KaTeX（与 PC 一致） |
| `rpx`（仅手写页 34 处） | `px` |

## 4. 实施阶段

在原目录直接重构。为满足 AGENTS"每次提交都能验证、能回退"的要求，按下面顺序提交：前两阶段仍在 Uni-app 的 H5 构建下验证，第三阶段才换掉构建系统。

| 阶段 | 内容 | 验证 | 估时 |
| --- | --- | --- | --- |
| **0. PoC** | 在仓库外 `D:/Temp/auralis-tauri-mobile-poc/` 搭最小工程，跑完第 5 节的 9 条检查，不提交 | 第 1～8 条全部通过才继续 | 2～3 天 |
| **1. 平台层 + 去小程序** | 新增 `src/platform/`，页面改为调用适配层；删除 `MP-WEIXIN` 分支、小程序构建脚本、`project.config.json`、`project.private.config.json` | `type-check`、`check:r4-mobile`、`test:r4-mobile`、`test:tablet`、`build:h5` | 2～3 天 |
| **2. 模板替换** | 标签换成原生 HTML；`<picker>` / `<rich-text>` / `createSelectorQuery` 替换；手写页 `rpx` 改 `px` | 同上 + `check-tablet-sidebar-transition` | 3～5 天 |
| **3. 换构建与存储** | 删除 `pages.json`、`manifest.json`、`shims-uni.d.ts`、`@dcloudio/*`、`pages/launch` 与全部条件编译注释；接入 Vite + vue-router + Pinia 3 + `src-tauri`；`localDb` 换成 `tauri-plugin-sql`，删除假 SQL 引擎；测试改为 `node:sqlite` 和平台适配层驱动 | `type-check`、全部测试、两端 Vite 构建、`tauri android build`（两个变体） | 4～6 天 |
| **4. Android 原生收尾** | 软键盘与全面屏适配、返回键接 vue-router、前后台同步与重连、两个 App 的发布脚本（重写 `scripts/build-mobile-release.ps1`）、签名流程（密钥不入库） | 模拟器 + 手机 / 平板真机走查 | 3～5 天 |
| **5. 收口** | 文档回写（第 7 节）、一次只读审查、真机验收记录 | 按 AGENTS 交接模板 | 2～3 天 |

合计约 3～4 周。每个阶段内部继续拆成原子提交，只在本地提交，不 push。

## 5. PoC 检查清单（阶段 0）

1. **Android 构建链**：设置 `NDK_HOME=D:\CodeBase\Android\Sdk\ndk\28.2.13676358` 和 `JAVA_HOME`；`rustup target add aarch64-linux-android x86_64-linux-android`；`tauri android init` / `dev` 能在模拟器和真机上运行。
2. **SQLite**：`tauri-plugin-sql` 能按账号分库打开和关闭；并发写入不报 `SQLITE_BUSY`；重启后数据还在。
3. **网络**：明文 HTTP 能连到 `8.163.98.111:8080` / `:9000`；跨域请求通过；AI 流式确实逐段到达（不被攒包）；`/ws/events` 能连上和重连。
4. **安全上下文**：在 `http://tauri.localhost` 下检查 `isSecureContext`、`crypto.subtle`、剪贴板是否可用。
5. **文件**：Android 上 `<input type=file>` 能拿到 `File`；50MB 文件 XHR 直传 MinIO，进度正常，内存可接受。
6. **阅读器**：`@file-viewer` 渲染 PDF / DOCX / PPTX，工作线程和 WASM 正常加载；IndexedDB 缓存重启后保留。
7. **系统交互**：软键盘顶起底部输入框、返回键、方向锁定、前后台事件。
8. **两个 App**：同一个 `src-tauri` 能否用配置覆盖（或 Gradle 参数）打出 `com.auralis.mobile` 和 `com.auralis.hd` 两个可同时安装的 APK；记录两个包的体积。
9. **结论**：写入 `D:/Temp/auralis-tauri-mobile-poc/report.md`，后续回写到 `current/` 文档。

## 6. 需关注的问题

### 技术风险
| 风险 | 应对 | 验证点 |
| --- | --- | --- |
| `http://tauri.localhost` 可能不算安全上下文 | 剪贴板用插件；SHA-256 继续用自带实现；如需 https 来源，要等后端 HTTPS | PoC 4 |
| Android 默认禁止明文 HTTP | 用网络安全配置只放行测试主机；正式发布切 HTTPS / WSS（已有 Caddy 模板）后收回 | PoC 3 |
| 服务器 `.env` 和 MinIO 的跨域配置 | 确认 `/opt/auralis/.env` 的 `AURALIS_CORS_ALLOWED_ORIGINS` 含 `http://tauri.localhost`；MinIO 允许该来源 | PoC 3 / 5 |
| 切换账号或重置时旧库连接泄漏、旧数据串号 | 切换作用域时 `close()` 旧库，继续校验登录世代和 `userId` / `serverDeviceId` | PoC 2 + 阶段 3 测试 |
| 阅读器资源加载和 APK 体积 | 资源只进平板包；记录体积 | PoC 6 / 8 |
| Android 15/16 强制全面屏、软键盘遮挡 | `viewport-fit=cover`、`interactive-widget=resizes-content`，`MainActivity` 处理 WindowInsets | PoC 7 |
| 返回键 | 优先用 Tauri 的返回键事件；不支持就在 `MainActivity` 写少量 Kotlin | PoC 7 |
| `onShow` 语义变化（页面重进、前后台） | 统一放进 `platform/lifecycle`，保留同步、重连、专注恢复行为 | 阶段 1 / 4 |
| 两个 identifier 的打包方式 | PoC 选定方案；都不可行就停下重新决策，不擅自改成单 App | PoC 8 |
| 中低端 WebView 性能（毛玻璃、阴影） | 真机走查，必要时在 Android 上降低 `backdrop-filter` | 阶段 4 |
| 旧机型 WebView 版本 | 最低 Android 7（minSdk 24），依赖系统 WebView 更新 | 阶段 4 |
| 签名密钥 | keystore 和密码只放本机或环境变量，不入库 | 阶段 4 |

### 工程纪律（AGENTS）
- **不留旧代码**：Uni-app 构建配置、条件编译、小程序 / APP-PLUS 代码、localStorage 假 SQL 引擎全部在本分支删除，不留兼容层；旧实现只保留在 git 历史和 `feat/mobile-app-plus-split` 分支。
- **测试测真实实现**：去掉 `uni` 模拟，改为驱动平台适配层和 `node:sqlite`；同步更新静态检查脚本 `check-r4-mobile.mjs` 的规则；不为测试往生产代码里加参数或导出。
- **不动 PC 和后端**：只读参考 PC 代码。
- **目录名不变**：OpenAPI 生成和检查脚本的路径保持有效。
- **原子提交**：每次提交前通过对应检查；`git add -- <paths>`；只在本地提交，不 push。
- **开发方式**：日常可用 Windows 上的 `tauri dev` 桌面窗口快速调试移动端界面，真机用 `chrome://inspect`；不再保留浏览器运行模式。

## 7. 文档回写清单（阶段 5）

- [modules/FrontendMobileTablet.md](../modules/FrontendMobileTablet.md)：全文重写（技术栈、目录、路由、平台层、存储、构建命令、限制、"不迁移旧数据"的说明）。
- [project/ProductRequirements.md](../project/ProductRequirements.md)：约第 288 / 302 / 321 行的目标端（去掉微信小程序和 Mobile H5，改为 Android 手机 / 平板 App）。
- [project/Architecture.md](../project/Architecture.md)：约第 29 行及结构图。
- [current/RoadmapAndGates.md](RoadmapAndGates.md)：约第 27、96～106 行，R4-04 / R4-05 / R4-06 / R5-06。
- [Status.md](Status.md)、[IssuesAndReview.md](IssuesAndReview.md)、[operations/Deployment.md](../operations/Deployment.md)（移动端打包与签名）、[operations/Changelog.md](../operations/Changelog.md)。
- [project/FrontendDesign.md](../project/FrontendDesign.md)：如交互有变化再更新。
- 本文：迁移完成后移入 `archive/design-and-plans/`，并从 [文档中心](../README.md) 与 [编码前协议](../agent/BeforeCoding.md) 移除登记。

## 8. 需要停下重新决策的情况

- PoC 第 1～7 条任一条无法通过。
- PoC 第 8 条：两个 identifier 的 APK 无法干净打出。
- 实施中发现某项功能只能靠修改后端或 PC 才能实现。
- 估时明显超出（任一阶段超过上限 50%）。

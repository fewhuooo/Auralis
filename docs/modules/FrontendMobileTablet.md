# Mobile / Tablet 前端模块

更新时间：2026-07-10

文档状态：现行

权威范围：`Auralis-Mobile` 的当前依赖、页面、条件编译、Store、API、端侧服务、手写开关、构建方式与限制

事实来源：`Auralis-Mobile/package.json`、`src/pages.json`、`src/` 和 `scripts/`

## 模块定位

`Auralis-Mobile` 是 Uni-app 工程，同时承载手机与平板体验。两端共享基础状态、API 和服务，但页面路径、导航布局和交互密度独立。微信小程序只发布手机体验。

## 当前技术栈

- Uni-app `3.0.0-4080420251103001`
- Vue `^3.4.21`
- Pinia `^2.3.1`
- Vite `5.2.8`
- TypeScript `^5.3.3`
- `perfect-freehand`、`jspdf`、`marked`

## 目录边界

```text
Auralis-Mobile/src/
├── api/          # 请求、AI、同步、设备、E2EE
├── components/   # 手机和平板共享/专用组件
├── config/       # feature flags
├── pages/        # launch、mobile、tablet
├── services/     # 本地数据库、笔记、手写引擎
├── store/        # Pinia
├── styles/       # 设计令牌和全局样式
└── utils/        # 通用工具
```

## 页面注册与平台边界

### 启动与手机页面

| 页面 | 路径 |
| --- | --- |
| 启动分流 | `pages/launch/index` |
| 首页 | `pages/mobile/home/index` |
| 专注 | `pages/mobile/pomodoro/index` |
| AI | `pages/mobile/ai-search/index` |
| 统计 | `pages/mobile/stats/index` |
| 设置 | `pages/mobile/settings/index` |
| 登录 | `pages/mobile/login/index` |
| 时间线 | `pages/mobile/timeline/index` |
| 复习 | `pages/mobile/review/index` |
| 资产 | `pages/mobile/asset/index` |
| 个人资料 | `pages/mobile/profile/index` |
| 手写 | `pages/mobile/handwriting/index` |

### 平板页面

| 页面 | 路径 |
| --- | --- |
| 仪表盘 | `pages/tablet/dashboard/index` |
| 学科大厅 | `pages/tablet/subject-hall/index` |
| 工作区 | `pages/tablet/workspace/index` |
| 手写 | `pages/tablet/handwriting/index` |
| 专注 | `pages/tablet/pomodoro/index` |
| 复习 | `pages/tablet/review/index` |
| 个人资料 | `pages/tablet/profile/index` |
| AI | `pages/tablet/ai-search/index` |
| 登录 | `pages/tablet/login/index` |

`pages.json` 使用 `#ifndef MP-WEIXIN` 包裹 Tablet 页面，因此微信产物只包含 launch 与 mobile 页面。微信下 launch 固定进入手机首页。

## 设备分流

- `pages/launch/index` 负责首次选择手机或平板入口。
- 进入某一端后，应用不根据窗口变化自动在两套路由间 reLaunch。
- 401 刷新失败返回当前端登录页。
- 物理分包当前未作为完成条件，微信依赖条件编译控制页面集合。

## Store 清单

| Store | 职责 |
| --- | --- |
| `useAuthStore.ts` | 用户、token 与会话 |
| `useBlockStore.ts` | 知识块与本地数据 |
| `useTaskStore.ts` | 任务、排期、状态 |
| `useSubjectStore.ts` | 学科与当前上下文 |
| `useSyncStore.ts` | mutation、cursor 与同步 |
| `useDeviceStore.ts` | 设备与端类型 |
| `useLayoutStore.ts` | 当前端导航和布局状态 |
| `useSettingsStore.ts` | 偏好和主题 |
| `persist.ts` | Store 持久化辅助 |

## API 与服务

### API

- `api/request.ts`：base URL、Authorization、refresh 和错误处理。
- `api/aiClient.ts`：AI 调用。
- `api/sync.ts`、`api/useSyncApi.ts`：同步。
- `api/device.ts`：设备相关能力。
- `api/e2ee.ts`：加密辅助。

### 端侧服务

| 服务 | 职责 |
| --- | --- |
| `localDb.ts` | 端侧 SQLite 表与访问入口 |
| `notebookStorage.ts` | 笔记存储兼容层 |
| `tabletNoteModel.ts` | `NoteDocument` 模型与序列化 |
| `tabletNoteRepository.ts` | 平台仓库入口 |
| `tabletNoteRepositoryCore.ts` | 可测试的核心仓库逻辑 |
| `handwritingEngine.ts` | 笔迹、工具与画布交互 |

## Tablet 手写 feature flag

`src/config/features.ts` 读取 `VITE_TABLET_HANDWRITING_NOTES_ENABLED`。当前发布策略是保留实现但默认关闭入口：

- workspace 不显示“+ 笔记”和批注工具条。
- 侧栏不显示随手记入口。
- 数据表、模型、仓库和页面代码继续保留。

禁止依据历史文档直接恢复入口。重新启用必须先完成数据备份策略、真机触控和长时间书写验收。

## Tablet 布局实现要点

- `TabletLayout.vue` 提供左侧导航、AI 入口和 modal 插槽。
- 侧栏指示器动画当前目标为 `120ms`，路由切换延迟为 `160ms`，脚本检查至少两帧余量。
- workspace 默认文件面板，总结栏通过 CSS 折叠联动。
- AI 浮窗通过 modal 插槽脱离 transform 堆叠上下文。

设计目标和页面布局见 [前端设计](../design/Frontend.md)。

## 构建与检查命令

```powershell
cd Auralis-Mobile
npm install
npm.cmd run build:h5
npm.cmd run build:mp-weixin
npm run type-check
node scripts\check-tablet-sidebar-transition.mjs
```

仓库还包含：

- `scripts/tablet-feature-flags.test.ts`
- `scripts/tablet-note-model.test.ts`
- `scripts/tablet-note-repository-core.test.ts`

这些 TypeScript 文件存在不等于已接入统一 `npm test`；执行方式必须以实际脚本和环境为准。

## 当前限制

- H5/微信命令行构建不能替代微信开发者工具和真机。
- App、Harmony 和其他小程序平台虽然有脚本，不表示已验收。
- `type-check` 可能受当前 `vue-tsc`、Node 和 TypeScript 组合影响，需独立记录结果。
- Tablet 复杂交互需要真实触控屏。
- 手写、图片上传、AI 转换和同步恢复需要 Server/外部服务联调。

## 修改后的强制回写

- 页面、Store、服务、条件编译或 feature flag：更新本文件。
- 交互与视觉：更新 `docs/design/Frontend.md`。
- 页面调用：更新 `docs/contracts/MobilePagesAPIMap.md`。
- API/数据变化：更新对应契约。
- 状态、风险和发布：更新 `current/` 与 Changelog。

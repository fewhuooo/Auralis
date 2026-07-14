# PC 前端模块

更新时间：2026-07-14

文档状态：现行

权威范围：`Auralis-PC` 的当前依赖、路由、页面、Store、API 边界、Tauri 集成、构建方式与限制

事实来源：`Auralis-PC/package.json`、`src/`、`src-tauri/` 当前代码

## 模块定位

`Auralis-PC` 是桌面与 Web 共用的 Vue 客户端，负责高信息密度的学科工作区、资产、任务时间线、知识关系和设置。浏览器开发与构建由 Vite 提供；桌面能力由 Tauri 2 提供。

## 当前技术栈

| 依赖 | 当前声明 |
| --- | --- |
| Vue | `^3.5.32` |
| Vite | `^8.0.10` |
| TypeScript | `~6.0.2` |
| Pinia | `^3.0.4` |
| Vue Router | `^4.6.4` |
| Element Plus | `^2.13.7` |
| Tauri API / CLI | `2.11.1` |
| Rust `tauri` | `2.11.1`，见 `src-tauri/Cargo.toml` |

这是依赖清单事实，不表示所有依赖组合已完成桌面打包验收。

## 目录边界

```text
Auralis-PC/
├── src/
│   ├── api/          # HTTP、AI、同步、资产、鉴权、统计、Tauri 封装
│   ├── components/   # 共享组件和学科组件
│   ├── router/       # 正式路由与守卫
│   ├── store/        # Pinia 状态
│   ├── styles/       # 全局设计令牌和样式
│   └── views/        # 页面
├── src-tauri/        # Rust、权限和桌面配置
├── package.json
└── vite.config.*
```

## 正式路由

| 路由 | 名称 | 页面 | 鉴权意图 |
| --- | --- | --- | --- |
| `/login` | Login | `src/views/Login/index.vue` | 公开 |
| `/` | Dashboard | `src/views/Dashboard/index.vue` | `requiresAuth` |
| `/subjects` | SubjectHall | `src/views/SubjectHall/index.vue` | `requiresAuth` |
| `/subject/:id` | SubjectWorkspace | `src/views/SubjectWorkspace/index.vue` | `requiresAuth` |
| `/asset` | Asset | `src/views/Asset/index.vue` | `requiresAuth` |
| `/timeline` | Timeline | `src/views/Timeline/index.vue` | `requiresAuth` |
| `/profile` | Profile | `src/views/Profile/index.vue` | `requiresAuth` |

`src/views/Home` 和 `src/views/Settings` 等目录不等于正式页面；未注册路由不得作为用户入口。

## 登录守卫现状

`src/router/index.ts` 的 `beforeEach` 当前直接调用 `next()`，原登录判断被注释并标记为临时关闭。结论：

- 页面路由当前不会阻止未登录访问。
- Server 受保护 API 仍必须验证 access token。
- 恢复守卫前需验证登录后跳转、刷新持久化、未登录访问、已登录访问 `/login` 和退出。

该问题属于 P1，不能因页面能够打开而写成鉴权已验收。

## Store 清单

| Store | 主要职责 |
| --- | --- |
| `useAuthStore.ts` | token、用户与会话 |
| `useBlockStore.ts` | 知识块、本地持久化与块操作 |
| `useTaskStore.ts` | 任务、排期与状态 |
| `useSubjectStore.ts` | 学科列表和当前学科 |
| `useSyncStore.ts` | mutation、cursor、同步状态 |
| `useChatStore.ts` | AI 会话与消息 |
| `useSettingsStore.ts` | 主题和偏好 |

修改 Store 字段前必须搜索页面、组件、持久化、同步和 API 使用方，禁止新增同职责 Store。

## API 边界

| 文件 | 职责 |
| --- | --- |
| `api/request.ts` | base URL、Authorization、401/刷新等请求基础能力 |
| `api/aiClient.ts` | AI 聊天与摄入调用 |
| `api/useAuthApi.ts` | 登录、注册、刷新 |
| `api/useAssetApi.ts` | 预签名上传与资产绑定/查询 |
| `api/useStatsApi.ts` | 概览与周统计 |
| `api/useSyncApi.ts` | push/pull 同步 |
| `api/e2ee.ts` | 端到端加密辅助 |
| `api/tauri.ts` | Tauri 环境和本地能力封装 |

所有端点契约以 [API 文档](../contracts/API.md) 为准；页面不得自行硬编码新的 Server 地址或 token 逻辑。

## 页面职责

- Dashboard：时间线、待办和快速创建；当前用户改动已移除首页知识流上方统计与热力图卡片。
- SubjectHall：学科卡片、搜索、创建和进入工作区。
- SubjectWorkspace：文件、知识、任务、总结、图谱与 AI 上下文；学科图标经 `src/utils/subjectIcon.ts` 统一解析，新建学科保存语义键并渲染 Element Plus 线条图标，创建弹层不提供主题色选择，默认、左下角和全局功能侧栏图标底色统一为 `#7D9372`，已有 Emoji 值原样显示，空值或未知语义键回退书本线条图标。右侧 AI 伴读以页面内 SVG/CSS 复刻手机端四芒星、星环、消息气泡、输入中状态和纯文本胶囊输入；保留当前 `streamFetch`、模型菜单及学科/文件上下文，不提供附件或麦克风入口。
- SubjectWorkspace：文件点击后在中栏展示关联知识块汇总的 Markdown 总结；左侧学科大纲为当前静态交互原型，支持内联新增和限定范围拖拽，尚未接入持久化或接口。
- Asset：上传、处理状态和资料组织。
- Timeline：排期和任务时间管理。
- Profile：账号、外观和设置。

详细交互与视觉只在 [前端设计](../design/Frontend.md) 维护。

## Tauri 边界

- JavaScript API、CLI 和 Rust crate 当前统一为 `2.11.1`。
- 使用 `@tauri-apps/plugin-sql` 提供 SQL 插件能力。
- 目录从 StudyCore 重命名后，旧绝对路径可能残留在 Rust 构建缓存；仅在确认属于缓存时执行 `cargo clean`。
- Web 构建通过不能证明桌面权限、窗口、插件、安装包和系统集成可用。

## 开发与验证命令

```powershell
cd Auralis-PC
npm install
npm run dev
npm.cmd run build
npm.cmd run check:subject-icons
npm.cmd run check:subject-workspace
npm run tauri dev
```

| 命令 | 证明范围 | 不证明 |
| --- | --- | --- |
| `npm run dev` | Vite 开发服务可启动 | 生产构建、桌面能力 |
| `npm.cmd run build` | 类型构建与 Web bundle | Tauri GUI、业务流程 |
| `npm.cmd run check:subject-icons` | 学科语义图标、旧 Emoji 分支与页面接入静态契约 | 浏览器/Tauri 的实际图标显示、键盘和视觉效果 |
| `npm.cmd run check:subject-workspace` | 学科工作区关键 UI 结构契约 | 浏览器拖拽、AI 流式请求与视觉效果 |
| `npm run tauri dev` | 当前机器桌面开发启动 | 安装包和其他系统 |

## 当前限制

- 登录守卫临时关闭。
- 当前没有 PC 自动化测试脚本。
- Tauri GUI 和打包需本地人工验收。
- API、同步、资产和 AI 需要真实 Server/基础设施联调。
- 用户当前工作树包含页面、Store、样式和 Tauri 依赖改动；在提交前必须按范围复核。

## 修改后的强制回写

- 路由、页面、Store、API 或 Tauri 变化：更新本文件。
- 视觉或交互变化：更新 `docs/design/Frontend.md`。
- 接口变化：更新 `docs/contracts/API.md`。
- 状态或风险变化：更新 `docs/current/`。
- 可确认变化：更新 `docs/release/Changelog.md`。

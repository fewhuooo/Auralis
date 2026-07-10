> [!WARNING]
> 本文档为历史归档，仅用于追溯需求、设计与项目演进。它不是 Auralis 当前实现、状态、接口或任务的依据。开发者与 AI Agent 禁止依据本文恢复旧实现、判断当前完成度或创建当前任务；请从 `docs/README.md` 进入现行文档体系。

# PC 前端模块说明

更新时间：2026-07-10

## 模块定位

`Auralis-PC` 是系统的 PC 端学习工作台，承担重型资产编排、学科管理、Timeline 排期、知识图谱、PDF 预览和个人设置等能力。

页面级功能设计详见 `docs/frontend/design.md`。

## 技术栈

- Vue 3
- Vite
- TypeScript
- Tauri 2
- Pinia
- Element Plus
- Axios
- Three.js
- pdfjs-dist
- marked + DOMPurify

## 目录结构

```text
Auralis-PC/
├── src/api/          # HTTP、AI、资产、同步等 API 封装
├── src/components/   # 通用组件
├── src/router/       # 路由配置
├── src/services/     # 本地数据库服务
├── src/store/        # Pinia Store
├── src/views/        # 页面视图
├── src-tauri/        # Tauri 配置与 Rust 壳
├── Dockerfile
├── nginx.conf
└── package.json
```

## 页面模块

当前路由事实来自 `Auralis-PC/src/router/index.ts`：

| 页面 | 路由 | 路径 | 职责 | 状态 |
| --- | --- | --- | --- |
| Login | `/login` | `src/views/Login` | 登录注册 | 已构建待验收 |
| Dashboard | `/` | `src/views/Dashboard` | 仪表盘、近日知识、任务排期概览 | 已构建待验收 |
| SubjectHall | `/subjects` | `src/views/SubjectHall` | 学科空间入口 | 已构建待验收 |
| SubjectWorkspace | `/subject/:id` | `src/views/SubjectWorkspace` | 学科资料、PDF、AI 伴读 | 已构建待验收 |
| Timeline | `/timeline` | `src/views/Timeline` | 任务时间线和排期 | 已构建待验收 |
| Asset | `/asset` | `src/views/Asset` | 文件资产、知识块、图谱 | 已构建待验收 |
| Profile | `/profile` | `src/views/Profile` | 统计、设置、同步入口 | 已构建待验收 |

## 重构状态

PC 页面已按“学科大厅 + 学科工作区”方向深度优化，并于 2026-07-10 完成了**极简禅意（Zen Minimalist）体系全量深度对齐**：
- 全域统一 `accent-gradient` / `--accent-start` 映射到鼠尾草绿 `#7D9372`，并新增 `--color-sage-bg` 等实用令牌，彻底统一发丝边框 (`#E6E6E4`) 与全局 Form 控制项（checkbox accent-color / select focus 样式）。
- Profile 页面图表与数据透视模块全面移除旧紫色系，换为鼠尾草绿渐变色系与发光阴影。
- SubjectHall 增加毛玻璃全域实时搜索框（名称与描述过滤）与各学科渐变掌握度进度条。
- SubjectWorkspace 抽屉面板移除 `v-show` DOM 销毁并优化为纯 CSS `width` + `opacity` 顺滑动画。

需按真实用户流程验收：
- Dashboard、Asset、Timeline 等页面已完全切换至禅意配色和轻阴影设计。
- `/subjects` 和 `/subject/:id` 是当前学科体系核心入口。
- 登录守卫目前在路由层临时放开，安全验收前必须恢复。
- 页面若新增接口调用，需要同步 `APIManifest.md`。

## Store 模块

- `useAuthStore`：登录状态、用户信息、token。
- `useBlockStore`：知识块状态和本地缓存。
- `useTaskStore`：任务块、排期和统计。
- `useSubjectStore`：学科、资料文件。
- `useSyncStore`：同步推送、拉取、WebSocket 状态。
- `useSettingsStore`：前端设置。

## API 边界

- 登录注册走 Auth API。
- 资产上传走 FileStorage + Asset API。
- AI 能力统一调用 `/api/ai/*`。
- 常规本地优先数据变更应优先走 Sync API。
- 直接 CRUD API 可作为调试、管理或兼容入口。

## 构建与验收

安装依赖：

```powershell
cd Auralis-PC
npm install
```

开发启动：

```powershell
npm run dev
```

生产构建：

```powershell
npm.cmd run build
```

当前状态：PC 构建已通过。页面级功能、联调和交互仍需人工验收。

Tauri 开发环境要求 `@tauri-apps/api`、`@tauri-apps/cli` 与 Rust `tauri` 保持同一 major/minor；当前统一固定为 `2.11.1`。目录重命名后如出现旧 `StudyCore-PC` 的插件权限路径错误，可在 `src-tauri/` 执行 `cargo clean` 后重新运行 `npm run tauri dev`。

## 待处理事项

- 路由守卫当前存在临时关闭登录校验的风险，需要恢复并验证：`router.beforeEach` 目前直接 `next()`。
- Asset 上传成功后的状态刷新和解析结果需要联调。
- Timeline 排期拖拽、同步和冲突处理需要验收。
- Three.js 知识图谱需要视觉和性能验收。
- 前端重构完成后，需要做一次路由、侧边栏、页面入口、Store 字段、API 调用全链路核对。

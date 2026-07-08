# PC 前端模块说明

更新时间：2026-07-03

## 模块定位

`StudyCore-PC` 是系统的 PC 端学习工作台，承担重型资产编排、学科管理、Timeline 排期、知识图谱、PDF 预览和个人设置等能力。

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
StudyCore-PC/
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

当前路由事实来自 `StudyCore-PC/src/router/index.ts`：

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

PC 页面已经进入“学科大厅 + 学科工作区”方向，但仍需按真实用户流程验收：

- Dashboard、Asset、Timeline 等页面已有重构痕迹，不能只用构建通过判断完成。
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
cd StudyCore-PC
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

## 待处理事项

- 路由守卫当前存在临时关闭登录校验的风险，需要恢复并验证：`router.beforeEach` 目前直接 `next()`。
- Asset 上传成功后的状态刷新和解析结果需要联调。
- Timeline 排期拖拽、同步和冲突处理需要验收。
- Three.js 知识图谱需要视觉和性能验收。
- 前端重构完成后，需要做一次路由、侧边栏、页面入口、Store 字段、API 调用全链路核对。

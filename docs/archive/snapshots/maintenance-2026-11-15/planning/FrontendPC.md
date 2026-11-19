> [!WARNING]
> 本文保存 2026-11-15 整理前的工作树原文，仅供历史追溯，不作为当前实现、状态、接口或任务的依据。现行文档从 docs/README.md 进入。

<!-- ORIGINAL WORKTREE CONTENT -->
# PC 前端计划

更新时间：2026-08-12

文档状态：现行计划

权威范围：PC 登录边界、主流程、Tauri 与桌面体验验收

事实来源：`modules/FrontendPC.md`、`design/Frontend.md`、当前风险登记

## 目标

让 PC Web 与 Tauri 在真实登录、数据、文件、时间线和学科工作区流程中可验收。

## 当前事实

- 8 条正式路由、页面、Store 和 API 封装存在；近期已完成学科工作区、语义线条图标、统一弹窗、全局导航、Timeline 与 Pomodoro 的基础整理。
- `beforeEach` 当前直接 `next()`，未登录页面保护关闭。
- `check:subject-icons`、`check:subject-workspace` 与 `npm.cmd run build` 已通过；构建仍有 Vite 大 chunk 警告，GUI 尚待验收。
- Tauri 版本统一为 2.11.1，但桌面 GUI 未验收。

## 有序任务

1. 恢复基于 `useAuthStore` 的守卫，定义 `/login`、requiresAuth、刷新和退出行为。
2. 为路由守卫、401 刷新失败和退出后回退建立前端测试或人工验收脚本。
3. 核对 Dashboard、SubjectHall、Workspace、Asset、Timeline、Pomodoro、Profile 的 Store 字段与 API 调用。
4. 验收上传、解析、错误、重试和用户提示。
5. 验收时间线拖拽、保存、冲突和任务排序。
6. 验收工作区文件预览、AI 上下文、关系图和辅助栏折叠。
7. 验收深色模式、键盘焦点、窄宽度和加载/空/错状态。
8. 在 Windows 运行 Tauri，验证权限、SQL 插件、文件、窗口和打包流程。

## 验证

```powershell
cd Auralis-PC
npm.cmd run check:subject-icons
npm.cmd run check:subject-workspace
npm.cmd run build
npm run tauri dev
```

2026-08-12 的两个静态检查和 Web build 已通过；Vite 输出部分 chunk 超过 500 kB 的警告。Web build 与 Tauri GUI 结果必须分开记录。

## 阻塞

- 后端 Auth、Asset、Sync 自动测试与真实环境未收口。
- Tauri 需要指定 Windows 环境和人工操作。

## 完成定义

- 未登录不可访问受保护 PC 路由。
- 关键页面无过期 Store/API 引用。
- PC Web build、主流程人工验收、Tauri 指定设备验收均有证据。

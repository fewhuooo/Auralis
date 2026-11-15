# PC 前端计划

更新时间：2026-11-15

文档状态：现行计划

权威范围：PC 登录边界、主流程、Tauri 与桌面体验验收

事实来源：`modules/FrontendPC.md`、`design/Frontend.md`、当前风险登记

## 目标

让 PC Web 与 Tauri 在真实登录、数据、文件、时间线和学科工作区流程中可验收。

## 当前事实

- 正式路由、Store、API、本地仓储和 Tauri 边界见[PC 模块](../modules/FrontendPC.md)。
- `beforeEach` 已调用 `resolveAuthRedirect`，已有登录守卫与会话保护。
- 近期构建、定向/全量结果及部分 Tauri 试测见[当前状态](../current/Status.md)，剩余 GUI、外部服务和多设备场景见[问题登记](../current/IssuesAndReview.md)。

## 有序任务

1. 验收现有 `useAuthStore` 与登录守卫在 `/login`、受保护路由、刷新和退出时的行为。
2. 核对已有路由/401/会话测试，针对明确缺口验证刷新失败、退出回退与跨账号迟到结果。
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

按任务范围选择检查，构建体积以本次产物测量为准。Web build 与 Tauri GUI 结果分别记录，不沿用旧 chunk 大小作为当前优化依据。

## 阻塞

- 后端 Auth、Asset、Sync 自动测试与真实环境未收口。
- Tauri 需要指定 Windows 环境和人工操作。

## 完成定义

- 未登录不可访问受保护 PC 路由。
- 关键页面无过期 Store/API 引用。
- PC Web build、主流程人工验收、Tauri 指定设备验收均有证据。

整理前记录见[历史快照](../archive/maintenance-2026-11-15/planning/FrontendPC.md)，仅供追溯。

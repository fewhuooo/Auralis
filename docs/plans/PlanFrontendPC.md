# PC 前端计划

更新时间：2026-07-02

## 目标

把 PC 端从“页面已搭好、仍在重构”推进到“主流程可验收”。本计划只关注 `StudyCore-PC`。

## 当前事实

当前路由：

- `/login`
- `/`
- `/subjects`
- `/subject/:id`
- `/asset`
- `/timeline`
- `/profile`

当前风险：

- `router.beforeEach` 临时直接 `next()`，登录守卫未恢复。
- Dashboard、SubjectHall、SubjectWorkspace、Asset、Timeline 已存在，但仍需确认入口和数据流。
- PC 构建通过不能等同于页面验收通过。

## 任务清单

| ID | 优先级 | 任务 | 状态 | 输入 | 产出 | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| PC-01 | P1 | 恢复登录守卫 | 进行中 | `useAuthStore`、`src/router/index.ts` | 受保护路由鉴权恢复 | 未登录访问 `/`、`/asset`、`/timeline` 跳转 `/login` |
| PC-02 | P1 | 登录后跳转体验 | 计划中 | 登录页、路由 query | 登录后回到原目标页 | 从受保护页被拦截后登录，能回到目标页 |
| PC-03 | P1 | 侧边栏导航收口 | 进行中 | `AppSidebar.vue`、路由表 | 导航项与路由一一对应 | 无死链，无指向已删除页面 |
| PC-04 | P1 | 学科大厅入口验收 | 进行中 | `/subjects`、Subject Store | 学科列表、创建、进入工作区闭环 | 创建学科后可进入 `/subject/:id` |
| PC-05 | P1 | 学科工作区主流程 | 进行中 | SubjectWorkspace、Asset、AI API | 学科资料、知识块、AI 对话入口一致 | 学科上下文不会丢失 |
| PC-06 | P1 | Asset 上传联调 | 已构建待验收 | FileStorage API、Asset API、MinIO | 上传、绑定、解析状态刷新 | 成功上传后页面能看到资产状态 |
| PC-07 | P1 | Timeline 排期联调 | 已构建待验收 | Task Store、Sync API | 任务创建、排期、状态更新闭环 | 刷新后任务状态不丢失 |
| PC-08 | P2 | 页面异常态补齐 | 计划中 | 所有 PC 页面 | loading、empty、error、unauthorized 状态 | 断网、401、空数据时页面可理解 |
| PC-09 | P2 | 桌面端 Tauri 验收 | 计划中 | Tauri 配置、Web 构建 | 桌面壳启动和窗口行为记录 | `npm run tauri dev` 或等价流程可运行 |
| PC-10 | P2 | PC 人工验收记录 | 计划中 | 本计划验收项 | 一份验收结果记录 | 更新 `PlanDocsAcceptance.md` 或验收记录 |

## 建议执行顺序

1. `PC-01` 和 `PC-02`：先恢复权限边界。
2. `PC-03` 到 `PC-05`：收口学科体系主入口。
3. `PC-06` 和 `PC-07`：跑通资产与排期两条核心业务线。
4. `PC-08` 到 `PC-10`：补体验、桌面壳和人工验收记录。

## 完成定义

- PC Web 构建通过。
- 登录守卫恢复并人工验证。
- 学科、资产、Timeline 三条主流程至少各走通一次。
- 所有 PC 页面没有明显死链。
- `StatusIndex.md`、`CurrentIssuesAndReview.md`、`Changelog.md` 已同步。

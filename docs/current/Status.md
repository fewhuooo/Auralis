# Auralis 当前状态

更新时间：2026-08-12

文档状态：现行状态快照

权威范围：当前代码存在情况、本轮命令证据、人工验收边界与下一步

事实来源：模块/契约文档、当前代码盘点与 2026-08-12 前端验证命令

## 证据规则

- **代码确认**仅说明实现存在。
- **本轮命令**只记录本任务实际执行结果。
- **历史命令**可在 Changelog 追溯，不能当作本轮结果。
- **人工验收**必须单列设备、GUI 或外部服务边界。

## 状态总览

截至 2026-08-12，PC、Mobile、Tablet 的基础页面与主要视觉/布局重构已基本收敛到当前代码。这里的“基本收敛”只表示代码整理和可执行检查达到当前阶段，不等同于生产构建、GUI、真机、后端联调或业务验收全部完成。

后端方向已确定为在 `Auralis-Server` 原路径进行绿地重写，完整方案见[后端绿地重写计划](../plans/backend-greenfield-rewrite-plan.md)。当前仅完成计划落盘，旧后端代码、配置、数据库和容器尚未替换；因此后端新架构状态是“计划中”，不能描述为已经开始实现。

| 模块 | 当前状态 | 代码证据 | 命令证据 | 人工验收 | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 文档体系 | 已构建待验收 | 新分类体系、Agent 规则、归档快照、旧路径切换已完成 | 2026-08-12：`docs/README.md` 相对链接检查 33 项通过；2026-07-10 的元数据、根目录、旧路径扫描仍保留为历史证据 | 无 | 随后续代码变化持续回写 |
| PC Web | 已构建待验收 | 8 条正式路由、页面、Store、API 客户端存在；近期完成学科工作区、线条图标、统一弹窗、全局导航、Timeline 与 Pomodoro 基础整理，保留手机同源 AI 伴读视觉 | 2026-08-12：`npm.cmd run check:subject-icons`、`npm.cmd run check:subject-workspace` 与 `npm.cmd run build` 通过（`vue-tsc -b && vite build`，3477 modules）；Vite 提示部分 chunk 超过 500 kB | 工作区文件总结/大纲编排、AI 动效、Pomodoro、窄栏/深色主题与新旧学科图标显示 | 恢复守卫并验收主流程，评估 bundle 拆分 |
| PC Tauri | 已构建待验收 | Tauri 2.11.1、SQL 插件配置存在 | 本轮未执行 GUI | Windows GUI、权限、安装包 | 手工桌面验收 |
| Mobile H5 | 已构建待验收 | 手机页面、Store、本地服务与构建脚本存在 | 2026-08-12：`npm.cmd run build:h5` 通过；保留动态/静态 import 与 Sass legacy API 警告 | 手机浏览器、弱网、输入法 | H5 真机走查与警告治理 |
| 微信小程序 | 已构建待验收 | `MP-WEIXIN` 条件编译排除 Tablet 页面 | 2026-08-12：`npm.cmd run build:mp-weixin` 通过；保留 Sass legacy API 警告 | 开发者工具、真机、合法域名 | 微信走查 |
| Tablet | 已构建待验收 | 9 个注册页、TabletLayout、多栏 workspace、可配置热力图存在；首页当前以 `weeks=5` 使用自适应日历布局 | 2026-08-12：`node scripts\check-tablet-sidebar-transition.mjs` 通过（120ms 早于 160ms） | 横屏触控、布局、手写 | 平板真机走查 |
| Tablet 手写笔记 | 已隐藏保留 | `tablet_notes`、NoteDocument、仓库与 feature flag 存在 | 本轮未执行专项脚本 | 笔迹、导入导出、长时间书写 | 核心链路后再开启 |
| 后端绿地重写 | 计划中 | 已批准模块化单体、统一对象、`/api`、离线同步、JPA/Flyway、pgvector、MinIO、AI/RAG 等方案；旧 Server 仍在原位 | 本轮仅做文档静态检查，未运行或修改 Server | 备份范围、Docker、真实数据库/MinIO/AI、前端契约迁移 | 从安全备份和阶段 0 骨架开始，逐阶段构建和验收 |
| Auth | 已构建待验收 | BCrypt、access/refresh 类型校验、Interceptor 存在 | 2026-07-10：`mvn test` 通过，但 `src/test` 无源码 | 登录/刷新/退出全流程 | 添加自动测试 |
| 块与任务 | 已构建待验收 | CRUD、实体、端侧副本与同步路径存在 | 2026-07-10：`mvn test` 生命周期通过，无业务断言 | 跨用户、删除、多端一致性 | 统一删除并测试 |
| Asset | 已构建待验收 | 预签名、用户前缀、bind/query 归属校验存在 | 2026-07-10：`mvn test` 生命周期通过，无业务断言 | MinIO 实体对象验证 | 校验对象/大小/MIME |
| Sync / WebSocket | 已构建待验收 | pull/push、握手、PING/PONG、60 秒审计存在 | 2026-07-10：`mvn test` 生命周期通过，无业务断言 | 多端、断网、过期 token | 增加回归与联调 |
| AI / RAG | 已构建待验收 | chat、SSE、ingest、Milvus/MinIO 配置存在 | 2026-07-10：`mvn test` 生命周期通过，无业务断言 | 模型、超时、文件解析 | AI 质量与错误验收 |
| 基础设施 | 已构建待验收 | Compose 服务与本地端口存在 | 本轮未启动/检查容器 | 备份、恢复、监控、生产 secret | 生产加固 |

Auth、块与任务、Asset、Sync/WebSocket、AI/RAG 和基础设施行描述的是当前仍在仓库中的旧 Server 事实，仅供替换前能力盘点；它们不会通过继续增量修补旧实现来关闭。新后端必须按绿地计划重新实现并产生新的测试和验收证据。

## 当前里程碑判断

当前优先级不是继续扩展页面数量或修补旧 Server，而是按已批准计划闭环以下主线：

```text
保护工作树并备份旧 Server
→ 新工程骨架与 Identity
→ Subject / Source / Knowledge / Task / Relation
→ 离线同步、墓碑与冲突
→ Review / Stats / Realtime
→ AI / RAG
→ 综合测试与 OpenAPI 交付
→ 三端另行迁移新契约
```

Tablet 手写、更多 AI 体验和更多平台构建在主线稳定后推进。

## 既有验证证据

2026-07-10 已实际完成：

- `Auralis-PC`: `npm.cmd run build` 通过。
- `Auralis-Mobile`: `npm.cmd run build:h5` 通过，保留非阻断动态/静态 import 与 Sass legacy API 警告。
- `Auralis-Mobile`: `npm.cmd run build:mp-weixin` 通过，产物可由微信开发者工具导入。
- `Auralis-Mobile`: `node scripts\check-tablet-sidebar-transition.mjs` 通过。
- `Auralis-Server`: `mvn test` 通过；日志明确为 `No sources to compile`，没有业务测试覆盖。
- 文档相对链接、元数据、根目录和旧路径扫描通过。

这些结果不替代 GUI、真机、真实基础设施或外部 AI 服务验收。

## 本轮验证结论（2026-08-12）

- PC：`npm.cmd run check:subject-icons` 与 `npm.cmd run check:subject-workspace` 通过。
- PC：移除弃用 `baseUrl` 并删除 `AppHeader.vue` 未使用的 `ElMessage` 导入后，`npm.cmd run build` 通过；Vite 提示部分 chunk 超过 500 kB。
- Mobile：`npm.cmd run build:h5` 通过，仍有动态/静态 import 与 Sass legacy API 非阻断警告。
- 微信小程序：`npm.cmd run build:mp-weixin` 通过，仍有 Sass legacy API 非阻断警告。
- Tablet：`node scripts\check-tablet-sidebar-transition.mjs` 通过，120ms 指示器在 160ms 路由重载前落位。
- 本轮未运行 Server、Tauri GUI、微信开发者工具、真机或真实基础设施联调。
- 后端绿地重写计划已落盘；本轮未修改 `Auralis-Server`、数据库、Compose 或前端接口。

以上结果只证明对应命令的执行范围，不替代 GUI、真机、真实基础设施或外部 AI 服务验收。

## 人工验收边界

- Tauri 权限、GUI、插件与安装包。
- 微信开发者工具、真机、域名和平台限制。
- H5/原生 App/Harmony 等目标设备。
- Tablet 触控、手写、双指缩放、文件批注和长时间书写。
- 真实 PostgreSQL、Redis、MinIO、Milvus 和外部 AI 提供商全链路。

## 阅读与回写

- 风险、优先级、关闭条件：[问题和审查](IssuesAndReview.md)
- 未来任务：[计划入口](../planning/README.md)
- 构建/部署：[部署指南](../operations/Deployment.md)
- 已发生变化：[Changelog](../release/Changelog.md)

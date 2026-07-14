# Auralis 当前状态

更新时间：2026-07-14

文档状态：现行状态快照

权威范围：当前代码存在情况、本轮命令证据、人工验收边界与下一步

事实来源：模块/契约文档、当前代码盘点；本轮构建与测试结果将在任务 9 回写

## 证据规则

- **代码确认**仅说明实现存在。
- **本轮命令**只记录本任务实际执行结果。
- **历史命令**可在 Changelog 追溯，不能当作本轮结果。
- **人工验收**必须单列设备、GUI 或外部服务边界。

## 状态总览

| 模块 | 当前状态 | 代码证据 | 本轮命令证据 | 人工验收 | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 文档体系 | 已构建待验收 | 新分类体系、Agent 规则、归档快照、旧路径切换已完成 | 2026-07-10：链接、元数据、根目录、旧路径扫描通过 | 无 | 随后续代码变化持续回写 |
| PC Web | 已构建待验收 | 7 条路由、页面、Store、API 客户端存在；学科工作区已改为文件总结、大纲内联编排和移动同源 AI 伴读视觉；新建学科图标使用线条图标、主题色选择已移除、工作区左下角统一 Sage Green 底色，已有 Emoji 保持原样 | 2026-07-14：`npm.cmd run check:subject-icons` 与 `npm.cmd run build` 通过（`vue-tsc -b && vite build`，1750 modules） | 文件总结、拖拽边界、AI 视觉与新旧学科图标显示 | 恢复守卫并验收主流程 |
| PC Tauri | 已构建待验收 | Tauri 2.11.1、SQL 插件配置存在 | 本轮未执行 GUI | Windows GUI、权限、安装包 | 手工桌面验收 |
| Mobile H5 | 已构建待验收 | 手机页面、Store、本地服务与构建脚本存在 | 2026-07-10：`npm.cmd run build:h5` 通过；有动态/静态 import 与 Sass legacy API 警告 | 手机浏览器、弱网、输入法 | H5 真机走查与警告治理 |
| 微信小程序 | 已构建待验收 | `MP-WEIXIN` 条件编译排除 Tablet 页面 | 2026-07-10：`npm.cmd run build:mp-weixin` 通过 | 开发者工具、真机、合法域名 | 微信走查 |
| Tablet | 已构建待验收 | 9 个注册页、TabletLayout、多栏 workspace 存在 | 2026-07-10：`node scripts\check-tablet-sidebar-transition.mjs` 通过（120ms 早于 160ms） | 横屏触控、布局、手写 | 平板真机走查 |
| Tablet 手写笔记 | 已隐藏保留 | `tablet_notes`、NoteDocument、仓库与 feature flag 存在 | 本轮未执行专项脚本 | 笔迹、导入导出、长时间书写 | 核心链路后再开启 |
| Auth | 已构建待验收 | BCrypt、access/refresh 类型校验、Interceptor 存在 | 2026-07-10：`mvn test` 通过，但 `src/test` 无源码 | 登录/刷新/退出全流程 | 添加自动测试 |
| 块与任务 | 已构建待验收 | CRUD、实体、端侧副本与同步路径存在 | 2026-07-10：`mvn test` 生命周期通过，无业务断言 | 跨用户、删除、多端一致性 | 统一删除并测试 |
| Asset | 已构建待验收 | 预签名、用户前缀、bind/query 归属校验存在 | 2026-07-10：`mvn test` 生命周期通过，无业务断言 | MinIO 实体对象验证 | 校验对象/大小/MIME |
| Sync / WebSocket | 已构建待验收 | pull/push、握手、PING/PONG、60 秒审计存在 | 2026-07-10：`mvn test` 生命周期通过，无业务断言 | 多端、断网、过期 token | 增加回归与联调 |
| AI / RAG | 已构建待验收 | chat、SSE、ingest、Milvus/MinIO 配置存在 | 2026-07-10：`mvn test` 生命周期通过，无业务断言 | 模型、超时、文件解析 | AI 质量与错误验收 |
| 基础设施 | 已构建待验收 | Compose 服务与本地端口存在 | 本轮未启动/检查容器 | 备份、恢复、监控、生产 secret | 生产加固 |

## 当前里程碑判断

当前优先级不是扩展页面数量，而是闭环以下主线：

```text
登录与用户隔离
→ 资产上传与绑定
→ 知识块/任务块 CRUD
→ 本地 mutation 与 Server pull/push
→ 删除与冷启动一致性
→ WebSocket 生命周期
→ 三端主流程人工验收
```

Tablet 手写、更多 AI 体验和更多平台构建在主线稳定后推进。

## 本轮验证结论

2026-07-10 已实际完成：

- `Auralis-PC`: `npm.cmd run build` 通过。
- `Auralis-Mobile`: `npm.cmd run build:h5` 通过，保留非阻断动态/静态 import 与 Sass legacy API 警告。
- `Auralis-Mobile`: `npm.cmd run build:mp-weixin` 通过，产物可由微信开发者工具导入。
- `Auralis-Mobile`: `node scripts\check-tablet-sidebar-transition.mjs` 通过。
- `Auralis-Server`: `mvn test` 通过；日志明确为 `No sources to compile`，没有业务测试覆盖。
- 文档相对链接、元数据、根目录和旧路径扫描通过。

这些结果不替代 GUI、真机、真实基础设施或外部 AI 服务验收。

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

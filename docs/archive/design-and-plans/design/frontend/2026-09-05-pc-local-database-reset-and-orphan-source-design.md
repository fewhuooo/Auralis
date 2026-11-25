# PC 本地数据库重置与孤儿 Source 终止设计

更新时间：2026-09-05

文档状态：已批准设计，待实施

权威范围：开发环境 Tauri SQLite 重置，以及文档调度器处理服务端不存在 Source 的终止语义

## 背景

开发环境重建 PostgreSQL 与对象存储后，PC 端 `auralis.db` 可能仍保存旧 Source 投影、同步游标、outbox mutation 和 `document_processing_jobs`。调度器恢复这些任务时会请求已经不存在的服务端 Source，形成重复 `GET /api/sources/{id}` 404 与调度失败日志。

当前状态机的同阶段 checkpoint 更新问题另有代码修复；本设计只处理本地数据代际重置和服务端 404 的永久终止行为。

## 目标

- 精确定位当前 Tauri 实例实际使用的 `auralis.db`。
- 在确认 Auralis/Tauri 进程停止后，删除该数据库及同目录 WAL/SHM sidecar，让现有 schema 初始化逻辑建立空库。
- 当 Source API 明确返回 404 或稳定错误码 `SOURCE_NOT_FOUND` 时，永久终止对应本地文档任务，不再自动重试。
- 保留网络错误、超时和服务端 5xx 的现有重试/失败语义。

## 非目标

- 不提供生产环境数据库重置入口。
- 不修改服务端 Source API、同步协议或数据库 schema。
- 不将任意 4xx、解析错误或未知异常误判为 Source 已删除。
- 不删除 Auralis 配置目录中的其他文件。

## 本地数据库重置

定位以运行时代码和文件系统证据为准：前端 SQL 插件加载 `sqlite:auralis.db`，Rust snapshot 命令使用 `app.path().app_config_dir()/auralis.db`。执行时先检查进程与候选绝对路径，确认目标文件名严格为 `auralis.db`，且父目录属于当前 Auralis 应用配置目录。

只有在 Auralis/Tauri 进程停止后才删除：

- `auralis.db`
- `auralis.db-wal`（存在时）
- `auralis.db-shm`（存在时）

删除后重新启动应用，以 `[SQLite PC] Database initialized and tables verified.` 作为 schema 初始化代码已执行的证据；该日志不替代业务数据或 GUI 验收。

## 孤儿 Source 终止流程

`SourceJobScheduler.process(sourceId)` 在读取 Source 的边界识别明确的“资源不存在”错误。识别条件必须基于结构化 HTTP 状态或稳定 problem code，不依赖仅供显示的英文 message。

命中后调用 scheduler 自身的 owner-scoped 清理流程：

1. 把 `sourceId` 加入当前 runtime 的 `discardedSources`，阻止后续重复 schedule。
2. 取消对应 runner，并释放 runtime-only parser input。
3. 通过 `removeBySource(sourceId)` 删除当前用户与 `serverDeviceId` 范围内的 document job。
4. 删除返回 job 引用的加密 payload cache；单个 cache 清理失败只记录警告，不恢复调度。
5. 返回 `{ status: 'SKIPPED', reason: 'SOURCE_NOT_FOUND' }`，不向 Store 抛出可重试异常。

没有本地 job 时仍应把 Source 标记为 discarded 并返回稳定结果。网络异常、401/403、409、429、5xx 和未知错误继续走现有异常路径。

## 并发与幂等

`schedule()` 现有 `active` map 继续合并同一 Source 的并发调用。孤儿清理复用 `discard()` 的幂等行为；重复调用不得访问已删除 job/cache，也不得重新请求服务端。清理必须保持 user/device scope，不能影响其他账号或设备的任务。

## 测试与验收

自动测试至少覆盖：

- Source API 返回结构化 404 且存在本地 job：删除 job/cache并返回 `SKIPPED`。
- 404 且无 job：稳定返回且后续 schedule 不再请求 API。
- 同一 Source 并发 schedule：只进行一次服务端读取和清理。
- 网络失败与 5xx 不进入 orphan cleanup。
- 既有正常解析、暂停恢复、上传和 Source 删除回归保持通过。

本机重置验收记录精确删除路径、删除前进程状态、删除结果和重启初始化日志。真实重新登录、重新上传 Source、无旧 404 循环属于 Tauri GUI/Server 联调验收。

## 文档回写

实现后同步 `docs/modules/FrontendPC.md`、`docs/current/Status.md`、`docs/current/IssuesAndReview.md` 和 `docs/release/Changelog.md`。本设计不改变 API 或数据结构契约，因此无需修改 API/Database 契约。

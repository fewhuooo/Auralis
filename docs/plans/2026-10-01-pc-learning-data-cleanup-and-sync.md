# PC 学习数据清理、专注统计与 Overview 同步实施计划

日期：2026-10-01

状态：实现、相关自动验证与单个只读审查已完成；本任务 BLOCKER=0、IMPORTANT=0。真实 GUI/设备/外部服务验收另列；实际时间统计方案由用户确认。

## 目标与边界

- 保留现有知识块搜索跳转，删除搜索 AI 快捷项；确认无运行入口后删除 Home 与 Settings 页面，迁移必要测试引用。
- 专注暂停、休息不计时；中途结束保存已专注秒数，自然完成才增加轮次。活动状态和最终事件按用户/设备持久化，稳定 session ID 保证重试不重复累计。
- 个人学习统计由服务端聚合专注事件和原有复习事件，并分别暴露专注秒数与完成轮次；不得将专注伪装为复习。
- 仅移除 KnowledgeBlock 摘要/标签及相关读写字段，显示短文本从 content 临时截取；保留 Overview 的 AI 总结和大纲。
- 只同步完整成功 Overview。文件按 Source ingestionRevision 隔离，学科按来源修订和文件结果 manifest 隔离；失败和生成过程仅留本机。
- 没有效果的偏好仅汇总；不改资产页文件状态，不改登录注册。
- 保护开始时 28 个修改文件；Home/Settings 删除已授权，其他现有视觉与业务改动保留。禁止重置、恢复、清理工作树。

## 方案

前端实现优先由 Antigravity Gemini 3.1 Pro (High) 在包含当前脏工作树内容的隔离快照中执行，返回相对快照的 diff；主 Agent 检查目录边界、依赖、生成文件、删除，再应用补丁。Server 由执行子代理实施，允许修改仅 Auralis-Server。文档与 OpenAPI/SDK 由主 Agent 统一安排，避免并行覆盖。

专注新增独立的幂等最终事件接口。Overview 新增独立 GET/PUT 持久化接口，不扩展现有五类核心 Sync inbound mutation；PC 在启动、联网恢复与核心同步后对账并重试本地 durable outbox。写入使用 baseVersion 和持久 clientWriteId 回执，不能仅记录最后一个请求 ID。

### 已确定的接口与统计口径

- `POST /api/focus-sessions` 请求为 `{clientSessionId,taskId?,startedAt,endedAt,durationSeconds,completed}`，时间采用 RFC3339。自然结束标记 `completed=true`，提前结束为 false；时长为实际累计专注秒数。同用户与 session ID 的同载荷重试回放，异载荷拒绝。
- Stats overview 与 weekly 的日项新增 `focusSeconds`、`focusCompletedCount`；原 `studySeconds` 保持复习事件耗时语义。Profile 学习时长与专注次数使用专注字段，不与复习时长重复相加。
- Overview 独立路由为 `GET/PUT /api/overview-results/sources/{sourceId}` 与 `GET/PUT /api/overview-results/subjects/{subjectId}`。PUT 为 `{baseVersion,clientWriteId,mode,ingestionRevision?,sourceManifest?,inputFingerprint?,result}`；result 保留现有 `OverviewResponse` 的 `schemaVersion/title/outline/summary`，首个写入必须完整 ALL。
- 返回记录包含 `id/scopeType/sourceId/subjectId/ingestionRevision/version/outlineVersion/summaryVersion/schemaVersion/title/outline/summary/outlineSourceManifest/summarySourceManifest/outlineInputFingerprint/summaryInputFingerprint/outlineGeneratedAt/summaryGeneratedAt/updatedAt`；客户端由 scopeType 与对应 ID 得到 scopeId。分项更新只增加相应 part version，不覆盖另一项。Source GET 可按 ingestionRevision 查询当前匹配结果，FILE inputFingerprint 不要求客户端填写。
- Subject manifest 按小写 Source UUID 排序，entry 为 `{sourceId,ingestionRevision,outlineVersion,summaryVersion}`。不依赖的 part version 为 null。fingerprint 是以下 UTF-8 文本的 SHA-256：首行为 `AURALIS-SUBJECT-OVERVIEW-MANIFEST-V1\n`，随后每项一行 `sourceId\tingestionRevision\toutlineVersion-or--\tsummaryVersion-or--\n`，只用 LF 和十进制版本。服务端重算并核对当前资料与文件 Overview。
- 服务端不自动保存生成中间产物；PC 完整成功结果通过 PUT 写入。幂等回执独立持久化至账户删除；Source/Subject 删除、修订变更后的旧请求不能重新激活结果。
- 当前代码的 PC localSchema 已为 v9，文档中的 v8 不能作为迁移起点；Focus 专表追加 v10，Overview 同步元数据/outbox 在其后追加 v11。保留原缓存和备份数据。

## 实施任务

- [x] PC 清理：SearchPalette 移除 AI 快捷项，保留结果行为；删除未使用 Home/Settings；迁移 check-subject-icons、file-preview、store-mapping 的旧页面检查。（PC 最终门禁及 reviewer 通过）
- [x] KnowledgeBlock 全链路移除 summary/tags：Server DTO/Entity/Service/Sync 与追加 Flyway 迁移；PC mapper/API/Store/编辑器/工作区/资产/搜索/卡片/图谱类型与必要测试。旧备份数据不删除，不添加旧字段兼容双写。（Server fresh 与 PC 最终门禁通过）
- [x] Server 专注记录与统计：幂等、用户隔离、历史任务归属、时间范围验证，overview/weekly 聚合，账户清理覆盖新表。（fresh 自动验证及 reviewer 通过）
- [x] PC 专注运行时：时间戳计时、持久恢复、真实耗时、自然完成唯一计数、离线 outbox、关联所选任务、Profile 统一统计。（focused 7/7，启动集成及 PC 最终门禁通过）
- [x] Server Overview 结果：完整 seed、分项原子合并、版本冲突、写入重放、当前修订与 manifest 验证、删除与账户清理。（fresh 自动验证及 reviewer 通过）
- [x] PC Overview 同步：本地缓存版本与 durable outbox 原子保存，完整成功记录 seed，当前修订 GET 对账，冲突不静默覆盖，FILE 在 SUBJECT 上传前收敛。（主 focused 104/104；失败恢复 67/67；PC 最终门禁及 reviewer 通过）
- [x] 更新 OpenAPI 与必要生成 SDK；只适配受契约影响的调用方，不扩展 Mobile 产品范围。（artifact 8/8、check-openapi 退出 0；Mobile 类型与协议检查通过）
- [x] 回写 API、Database、FrontendPC、Backend、Frontend、Status、IssuesAndReview、Changelog；列出无效果偏好和真实环境验收边界。
- [x] 执行相关类型检查、静态检查、构建、行为测试与 Server 聚焦测试；一个 reviewer 只读检查 correctness/requirement/race/data integrity/security。（本任务 BLOCKER=0、IMPORTANT=0）

## 验证重点

### 用户要求对应实现

| 要求 | 当前实现位置或处理 |
| --- | --- |
| 1. 保留搜索跳转，去掉快捷入口及冗余 Home | SearchPalette 删除 AI 项；Dashboard 使用一次性 openBlock query 打开详情；Home 无运行入口，删除 |
| 2. 专注次数和时间对应个人学习数据 | usePomodoroStore、pomodoroSessionRuntime、focusSessionRepository；独立 Focus API、Stats focus 聚合；Profile 使用服务器累计 |
| 3. 汇总没有效果的设置 | FrontendPC 的 12 项偏好表，设置值保留 |
| 4. 文件状态留在学科页 | 保留既有 SubjectWorkspace/处理中心能力，本轮不新增资产状态入口 |
| 5. 删除知识块摘要和标签 | Server KnowledgeBlock DTO/Entity、V28、PC API/mapper/Store/编辑与查看；Task 备注和 Overview 总结保留 |
| 6. 最终 Overview 可上传多端同步 | Server 独立 Overview results/receipts；PC overviewRepository、overviewResultsSyncService、useSyncStore 及现有展示入口 |
| 7. 登录注册最后再做 | 原登录注册逻辑保留 |
| 8. 删除无使用的两个页面 | Home/Settings 无正式路由，删除；正式设置仍在 Profile |

### 行为覆盖

专注：暂停/恢复不计暂停时间，休息不计学习时间，中断保存但不计完成，跨页/重载恢复，同一事件重复上传只累计一次，跨账号隔离。

Overview：不上传失败/半成品，完整 seed 后另一设备可读取，分项更新保留另一项，超时重放幂等，冲突返回 canonical 结果而非 LWW，删除/换修订后的迟到上传拒绝，学科输入变化不能显示旧 fingerprint。

清理：正式路由和搜索结果保留，AI 快捷事件不存在，知识块读写不再依赖 summary/tags，Overview.summary 仍存在且测试通过。业务 GUI、真实 Provider、Tauri 重启、双设备现场验收与自动验证分开记录。

## 进度与证据

- 已完成当前工作树与调用点调查；起始 tracked diff SHA256 为 `5892870D8CEB03ED7F191DB890D8301DA7236B25F87756EF2A3D7F22F8F3671C`。
- Server 执行子代理已经开始对应测试与实现；前端清理已委派 Antigravity，task `a0a8e5f7bd77`，基于包含既有工作树修改的 snapshot `48d5f5c7388a03c8b1c82d963ac6526f1dff15d7`。
- Antigravity task 因 `RESOURCE_EXHAUSTED (429)` 配额失败且没有改动，已改由 Codex 执行子代理实施 PC 清理；另一执行子代理并行实施 Focus。没有将 Antigravity 启动记为实现完成。
- PC 清理聚焦验证：`node --experimental-strip-types --test scripts/r4-store-mapping.test.mjs scripts/r4-file-preview.test.mjs` 退出 0，47/47；`npm.cmd run check:subject-icons` 与 `npm.cmd run check:subject-workspace` 均退出 0。Overview 与 Focus 实施尚未完成，未执行整合后的 type/build/full suite。
- PC Focus：`node --experimental-strip-types --test scripts/r4-pomodoro-focus.test.mjs` 退出 0，7/7；验证暂停/恢复、自然完成唯一计数、中断实际耗时、休息、browser scope 编码隔离、SQLite 升级保留旧 Overview cache 与 outbox ACK。
- Server 初轮跨业务 focused clean suite：`mvnw.cmd -B -ntp clean "-Dtest=StatsServiceTests,StatsQueryRepositoryTests,AiSuggestionTests,CoreDomainRepositoryTests,CoreDomainServiceTests,ReviewServiceTests,OverviewResultControllerTests,FocusSessionControllerTests,KnowledgeBlockFieldsMigrationTests,CoreDomainControllerTests#knowledgeBlocksAndTasksUseSubjectReferencesAndListEnvelopes" test` 退出 0，35/35；之后边缘修正以下轮 fresh suite 为准。
- Server 最终边缘 fresh suite：`mvnw.cmd -B -ntp clean "-Dtest=FocusSessionControllerTests,OverviewResultControllerTests,KnowledgeBlockFieldsMigrationTests,AuthControllerTests#deletesAssetlessAccountAndRevokesItsSessions,CoreDomainControllerTests#knowledgeBlocksAndTasksUseSubjectReferencesAndListEnvelopes" test` 退出 0，7/7；包含跨账户 task 404、完成/软删除任务的专注补传、Source 移动恢复 READY 后的当前学科投影、三个新表账户清理及 V28。
- `mvnw.cmd -B -ntp "-Dtest=ArchitectureTests" test` 退出 0，1/1；`clean test-compile -DskipTests` 退出 0。报告在 `Auralis-Server/target/surefire-reports/`，后续 clean 可能替换先前报告。IDE builder 曾覆盖 target 造成非 clean 未解析字节码错误，单命令 fresh clean 复跑通过；本轮没有重跑 PostgreSQL Testcontainers，不能将 H2 验证写成生产迁移完成。
- OpenAPI：根目录 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/export-openapi.ps1` 退出 0，OpenApiArtifactTests 8/8；`scripts/generate-openapi-sdk.ps1 -SkipExport` 与 `scripts/check-openapi.ps1` 均退出 0，两端 schema 一致。
- Mobile 必要适配：只改知识块 content 映射及现行必填 clientImportId 上传调用。首次 type-check 报缺 clientImportId（退出 1）；补齐后 `npm run type-check` 退出 0，`node --experimental-strip-types --test scripts/r4-mobile-protocol.test.mjs` 23/23、退出 0。页面、本地标签/内容备份、专注/Overview UI 不扩大。
- 剩余 Overview PC、整合门禁与单个 reviewer 继续执行；真实 GUI/设备/外部服务验收尚未完成。
- reviewer 确认 Source 移学科后删原学科会因历史 result.subject_id 误删文件成果；清理改为 SUBJECT scope 精确删除、Source DELETE 事件清理当前子资料。`mvnw.cmd -B -ntp clean "-Dtest=OverviewResultControllerTests,ArchitectureTests" test` 退出 0，3/3；移动后 B 成果保留、删除 Source 后失效。
- 旧 KnowledgeBlock 含 summary/tags 的 immutable Sync 请求通过真实 push/replay（APPLIED、同 cursor、正文保留），未复现 mapper 严格解析疑点，未增加注解或改写请求/receipt。Subject 当前 manifest 限 READY FILE，与 PC 范围一致；混有 READY TEXT/URL 测试通过。
- Server 最终跨业务 fresh suite：`mvnw.cmd -B -ntp clean "-Dtest=SyncControllerJsonCompatibilityTests,CoreDomainControllerTests#knowledgeBlocksAndTasksUseSubjectReferencesAndListEnvelopes,KnowledgeBlockFieldsMigrationTests,AiSuggestionTests,CoreDomainRepositoryTests,CoreDomainServiceTests,R1PaginationTests,ReviewServiceTests,SourceAssetRelationServiceTests,SubjectDeletionCascadeTests,OverviewResultControllerTests,ArchitectureTests" test` 退出 0，57/57。Server 冻结；单个 reviewer 已只读确认该范围，无确定新增阻断。
- PC Overview 定向验证：`node --experimental-strip-types --test scripts/r4-overview-sync.test.mjs scripts/r4-overview-cache.test.mjs scripts/r4-dashboard-search-navigation.test.mjs scripts/r4-document-job-schema.test.mjs` 最终退出 0，45/45；覆盖缓存/intent 原子保存、ACK 版本 manifest、固化请求重放、未知基线冲突、动态 revision/删除/成员围栏，以及 commit 成功后唤醒当前 scope 的后台同步、不因失败或远端 ACK/install 回环。
- 首轮 PC `npm.cmd run type-check` 退出 2，日志 `C:\Users\Gnasche\AppData\Local\Temp\auralis-pc-type-check-37364.log`；真实错误为 legacy localDb preview/tags、Asset Task preview 属性及未用 import。按最小类型适配修正，保留旧备份与 Task 备注。
- reviewer 确认 Tauri plugin SQL 默认多连接池无法保证多次调用的 BEGIN/COMMIT 处于同一连接。任务内最小修复为首次 Database.load 后、任何 SQL 前固定 max/min 1 并关闭正常 idle/lifetime 回收，原 JS 队列与 native snapshot 保留；追加 Rust 实际池事务验证。没有因偏好重构公共事务架构。
- Native 验证：`cargo test --manifest-path Auralis-PC/src-tauri/Cargo.toml --lib rebuilt_plugin_pool_uses_one_stable_connection_for_raw_transactions` 退出 0，1/1，实际 SQLite 池覆盖多次调用 rollback/commit，日志 `C:\Users\Gnasche\AppData\Local\Temp\auralis-native-pool-test-12796.log`；`cargo fmt --manifest-path Auralis-PC/src-tauri/Cargo.toml --check` 与 `cargo check --manifest-path Auralis-PC/src-tauri/Cargo.toml` 均退出 0，日志分别为 `auralis-native-pool-fmt-final-11996.log`、`auralis-native-pool-check-32012.log`。沿用既有 sqlx/tauri-plugin-sql，不新增依赖。
- 主 Agent 以起始 snapshot 检查边界：依赖清单与 lockfile 没有依赖变更，仅 PC package 的测试入口新增相关脚本；删除文件仅授权的 Home/Settings。ModalShell、modal.css、ConfirmDialog、TaskCreateDialog、ChangePasswordDialog、SubjectCreateModal 及 Login 相对 snapshot 没有本轮改动，既有用户视觉和登录工作保持。
- PC Overview 最终冻结 focused（cwd `Auralis-PC`）：`node --experimental-strip-types --test scripts/r4-overview-sync.test.mjs scripts/r4-overview-cache.test.mjs scripts/r4-overview-generation.test.mjs scripts/r4-dashboard-search-navigation.test.mjs scripts/r4-document-job-schema.test.mjs` 退出 0，104/104，fail/cancelled/skipped/todo 均 0。覆盖 ACK 事务失败后同 ID/body 重放、FILE/SUBJECT 普通新候选保留 CONFLICT、写队列内 generation token 复核、删除失败 ticket 释放及显式恢复后新代生成/旧 abort 拒绝；相关 service/store/tests 的 diff-check 退出 0。单个 reviewer 继续最终只读复核，PC 五门禁由原执行代理统一运行。
- PC 首轮全量 `npm.cmd run test:r4-pc` 465/468，3 项失败已定位为旧测试契约：schema_version 写死 9（当前 11）、搜索写死 `router.push('/')`（现行为 `/` 加一次性 openBlock query）、生成 retry 按钮计数包含新增冲突动作。由同一执行代理最小更新现行断言，保留路径、详情意图与显式冲突处理验证，不修改冻结的业务行为；重跑结果以下方最终门禁为准。
- PC 修正上述断言后全量 468/468、退出 0，两项静态检查与 build 退出 0。最终 reviewer 另确认 Subject 已持久墓碑后的清理失败取消围栏，以及 Source 提交前隐藏投影/删除未同步候选两处 IMPORTANT；由原执行代理补最小失败恢复回归与修复，最终受影响门禁继续重跑。468 计数仅证明该中间版本，最终结果以最后记录为准。
- 最后失败恢复修复：Subject durable tombstone 后 cascade/Overview cleanup 失败保持围栏；Source DELETE 成功后才移除投影和 discard，本地 commit 失败保留 cache/outbox 固化载荷。扩展恢复验证发现 SourceStore cleanup 在 rejected Subject DELETE 的 resetRequired/snapshot 窗口消耗旧子墓碑、将本地 DRAFT 标 DELETED；在既有 owner/device 生命周期锁中复核当前 resetRequired/Source/Subject/未决 DELETE，并在破坏性边界复查，物理资产删除在释放锁后沿用服务自身引用检查。保留原 local-only 空服务器 sources fixture；诊断证明 hydration 已实际 await 新 reconcile，未修改该机制或伪造远端资料。
- 失败恢复最终 focused（cwd `Auralis-PC`）：`node --experimental-strip-types --test scripts/r4-file-preview.test.mjs` 33/33；同命令运行 `scripts/r4-store-local-asset-flow.test.mjs` 24/24、`scripts/r4-subject-deletion-cascade.test.mjs` 10/10；全部退出 0，合计 67/67。相关 5 文件 diff-check 退出 0，无诊断残留。最终 type-check/full suite/build 由原整合代理继续执行。

## 最终命令验证（冻结实现，2026-10-01）

命令结果由原执行代理返回；主 Agent 核对最终 PC/native 日志及 Server surefire 报告，没有重复执行已通过的普通检查。

| 工作目录 | 命令 | 退出码 / 结果 | 证据 |
| --- | --- | --- | --- |
| Auralis-PC | `npm.cmd run type-check` | 0 | 临时目录 `auralis-pc-final-type-check-6d8afe8e7a3f45fe95908cd3b3e675f6.log` |
| Auralis-PC | `npm.cmd run test:r4-pc` | 0，470/470；fail/cancelled/skipped/todo 均 0 | 临时目录 `auralis-pc-final-test-r4-pc-c6801d6d3b844ce1a65a9cf044b5609e.log` |
| Auralis-PC | `npm.cmd run check:subject-icons` | 0 | 临时目录 `auralis-pc-gate-subject-icons-943224f207284cdf8718c0fd2877fd01.log` |
| Auralis-PC | `npm.cmd run check:subject-workspace` | 0 | 临时目录 `auralis-pc-gate-subject-workspace-922f88cbb6b540929f9308b1ba92cc29.log` |
| Auralis-PC | `npm.cmd run build` | 0，Vite 6.41s；renderer assets 47/47 | 临时目录 `auralis-pc-final-build-a01159bd7b704635a252765d7c4f33ce.log` |

上表临时目录为 `C:\Users\Gnasche\AppData\Local\Temp`。最终三项门禁在删除失败/恢复竞态修复冻结后重跑；两项静态检查不受最后改动影响，保留上一轮退出 0 的结果。构建仍有 Node 模块外部化、超过 500KB chunk、动态导入未拆分和插件耗时提示，当前任务没有修改这些既有构建边界。

其他相关自动验证：Overview 最终主 focused 104/104，删除/恢复 focused 67/67；Server 最终跨业务 fresh 57/57 与专注边缘 fresh 7/7；native 实际池事务 1/1、fmt/check 退出 0；OpenAPI artifact 8/8、check-openapi 退出 0；Mobile 必要适配 type-check 退出 0、协议 23/23。不同轮次包含重叠用例，不合计为一套全工程测试。

最终只读 reviewer：本任务 BLOCKER=0、IMPORTANT=0。此前确认的 ACK、冲突候选、删除/恢复围栏、未提交删除数据保留、snapshot 恢复窗口草稿保护及单连接事务问题均由必要最小补丁关闭；reviewer 没有修改代码或重复普通测试。真实 Tauri/跨版本重启、双 PC、Provider、PostgreSQL/MinIO 与 Mobile 设备业务验收未执行；本轮没有生产部署、生产迁移或提交。Antigravity 尝试因配额失败没有实现产物；实际代码由 Codex 执行子代理实施、一个 reviewer 只读审查，主 Agent 裁决必要失败恢复修改并回写文档。

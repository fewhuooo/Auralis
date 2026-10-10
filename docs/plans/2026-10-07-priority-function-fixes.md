# PC / Service 三项优先问题修复实施计划

> 执行方式：按 subagent-driven-development 拆分 PC 与 Service 的独立工作，由主 Agent统一范围、文档及最终验收；执行完成后仅派一个只读 reviewer。

**Goal:** 修复功能审计中的 F1 账号切换隔离、F2 文件恢复/保留清理并发、F4 个人空间专注天数口径。

**Architecture:** PC 将每次同步和导入绑定到发起时的 owner/device/session，保护网络派发、401刷新、响应写回和共享状态；Service 以 owner-scoped Asset 行锁串行 READY 引用与清理，将 ORPHANED 持久化后再删除对象；Profile 用准确的周统计标签。沿用现有模块、数据和公开接口。

**Tech Stack:** Vue / Pinia / Axios / Node tests；Spring Boot / JPA / TransactionTemplate / PostgreSQL Testcontainers。

## 授权与全局约束

- 用户已明确授权先处理这三项；其余功能缺口完成后逐个询问处理方式。不得在本轮修改 Review、Search、错误反馈、UTC今日标记、时间轴两项 OPTIONAL、同名学科并发或 12 项偏好。
- F4 采用最小纠正：文案改为“本周专注天数”，保留现有按 weekly 中 focusSeconds>0 计数的逻辑、变量和布局，不新增 streak 功能。
- 保留所有用户未提交修改、既有删除及冻结实现；不提交、暂存、重置、部署、修改生产数据或依赖/生成文件。
- 工作树基线：`C:/Users/Gnasche/AppData/Local/Temp/auralis-priority-fixes-baseline-20261007/manifest.json` 与 `files/`。HEAD 为 `ed08697c195aefe593e456c5f58802f8f5b39a85`。只有相对本轮完整快照的新增量可应用，不能应用 HEAD 宽差分。
- 账号/鉴权隔离边界按仓库规则由 Luna 直接实现；Antigravity 仅负责 Profile 文案。后端不使用 Antigravity。根 AGENTS 的单 reviewer 规则优先于技能默认多层审查。
- 本轮不变公开 API、数据库字段/迁移；内部锁与客户端作用域约束需要回写模块/数据库规则事实。若发现必须扩展接口或额外源文件，先以 correctness 证据报主 Agent裁决。
- 既有 Service 两项失败：最新迁移测试仍期待 V21，PostgreSQL 时间戳截断预期与舍入差 1µs。它们不在本轮修复授权内，不删除、跳过或顺手改测试；最终全量结果如实登记。
- GUI、真实 Tauri SQLite/Keyring、HTTP/Provider/MinIO生产实例和双设备与自动测试分开，不把委派结束写成业务验收。

## Task 1：PC 同步与导入账号边界

**执行 Agent：** `priority_pc_execution`，Luna 极高思考。

**允许源码：**

- `Auralis-PC/src/store/useSyncStore.ts`
- `Auralis-PC/src/store/useAssetStore.ts`
- `Auralis-PC/src/services/syncCycle.ts`
- `Auralis-PC/src/api/request.ts`
- `Auralis-PC/src/api/useSyncApi.ts`
- `Auralis-PC/src/api/useAssetApi.ts`（只读审查取得真实上传凭证派发泄漏证据后，主 Agent追加批准并保存原文件快照）

**测试：** 优先在现有 `scripts/r4-sync.test.mjs`、`scripts/r4-store-local-asset-flow.test.mjs` 追加真实 Store / Repository / Axios adapter 的可控 barrier；必要的专用请求测试文件须登记。

**必要行为：**

1. 单次 cycle 固定 `{userId,serverDeviceId,sessionId}` 和生命周期 ticket；同步 watcher 在身份变化时失效旧 ticket，旧 cycle 不能阻塞 B 的正常 flush，旧 finally 不能清理 B 的周期和状态。
2. 每个网络/持久化边界检查 ticket，旧请求不得借 B token/device 派发，旧 push/pull/snapshot 不得更改新账号 Repository、cursor、共享状态或 projection 事件。仅释放 A 未结算 inflight 供幂等恢复，不删除 A outbox。
3. 内部 Axios scope metadata 在真正附 Authorization 前检查；401恢复在刷新前、提交刷新结果前、处理失败前和重放前核验发起会话。正常同会话 token rotation 仍可用；B 刷新不加入旧 A 的单飞周期。
4. 导入固定 A 的 AssetRepository / LocalRepository；跨 await 后仍保留 A 文件与 PENDING job，可重试。身份已变化时不写 B repo，也不更新 B 的 assets/pendingUploads/error/进度。B 正常导入继续可用。
5. 不扩展到未证明的 Chat/Overview/Task 架构重写；额外 AuthStore source 修改需要证明无法在当前允许边界正确解决。
6. 真实上传队列的 createUploadIntent/completeUpload 同样带发起会话票据。优先在既有 getAssetQueue 的 options.api 注入 scoped wrapper，包含后台先行创建队列的路径；不改变队列状态机或上传 DTO。正常当前会话刷新失败须进入登录页，导航也要防止“先清 A、错误 catch 返回前 B 已登录”的迟到污染。

**可执行步骤与验收：**

- [x] 当前 targeted baseline，并登记命令/cwd/退出/日志。
- [x] 测试先行 RED：真实 A Subject CREATE；wakeUp 等待中切换 B；同用户/设备 logout 后新 session；A→B→A；401/刷新等待与切换；pull/snapshot 晚返回；导入等待切换。新回归的登录使用真实 AuthStore.setSession；真实 login/logout 的旧缺陷复现见原审计，不写成真实 HTTP 验收。
- [x] 逐边界最小实现；GREEN 断言请求身份、A/B各自资源/outbox/cursor、共享状态及正常对照。
- [x] `node --experimental-strip-types --test` 相关 sync/asset/auth/overview/focus 脚本，完整选择器见下方记录。
- [x] `npm.cmd run type-check`、`check:subject-icons`、`check:subject-workspace`、`test:r4-pc`、`build`，执行目录 `D:/CodeBase/Active/Auralis/Auralis-PC`。
- [x] 完整相对 baseline diff、全部新增删除/依赖/生成/跨模块核对及最终 hash 清单。

## Task 2：Service Asset 引用与保留清理串行

**执行 Agent：** `priority_service_execution`，Luna 极高思考。

**允许源码：**

- `Auralis-Server/src/main/java/com/auralis/app/source/internal/persistence/AssetRepository.java`
- `Auralis-Server/src/main/java/com/auralis/app/source/SourceService.java`
- `Auralis-Server/src/main/java/com/auralis/app/source/AssetRetentionCleanupService.java`

**新增测试：** `Auralis-Server/src/test/java/com/auralis/app/AssetRetentionConcurrencyIntegrationTests.java`。

**协议与锁顺序：**

1. 新增 owner-scoped `findForUpdateByIdAndUserId`，使用 Asset 悲观写锁。
2. Source `requireReadyAsset` 统一用该锁，覆盖 create、update换 Asset、restore。顺序为 Subject→Source（存在时）→Asset；create 为 Subject→Asset。
3. 每个清理候选 Asset 用 `TransactionTemplate` 的独立 `REQUIRES_NEW` 事务：拿 Asset 锁，重新查询 active/recent 引用，再持久化 ORPHANED；事务成功提交后才删除对象。清理不反向锁 Subject/Source。
4. ORPHANED commit 是清理与引用的线性化点；对象删除不可随 DB rollback 恢复。删除失败保持已持久化状态，下一轮可幂等重试删除。批次内按 Asset 去重，计数与错误记录保留。
5. scheduled 入口不依赖同 Bean 自调用的 `@Transactional` 代理，以模板保证真实事务。无需新字段、迁移或服务端 owner/API变化。

**可执行步骤与验收：**

- [x] 新增真实 PostgreSQL/Testcontainers + 可控 AssetStoragePort 的确定性 RED；等待锁阻塞用数据库证据，不用任意长 sleep 冒充交错。
- [x] writer 胜出：restore 已持锁未提交，确认 cleanup 等锁；writer commit 后 cleanup 重查并保留对象。create/update 共用 requireReadyAsset，cleanup 胜出时三条路径实际拒绝；未另做 create/update writer 胜出的独立交错。
- [x] cleanup 胜出：ORPHANED 已 durable、对象删除暂挂；restore/新 FILE 引用稳定拒绝，删除后不存在活动 Source 关联缺失对象。
- [x] active/recent 共用 Asset、owner隔离、非FILE、scheduled durable顺序、删除失败后下一轮成功的对照。
- [x] 最小源码修改后 GREEN；既有 source/asset/Controller/retention 相关回归及 fresh compile。
- [x] 全量 `./mvnw.cmd -B -ntp clean test` 仅由本 Agent执行，cwd Server；实际 392 项、1 failure，未修改或跳过旧失败测试。
- [x] 完整相对 baseline diff/hash/实际命令日志/剩余门槛与生产外部验收边界。

## Task 3：Profile 统计文案

- [x] PC执行 Agent用 `delegate-antigravity`，Gemini 3.1 Pro High，先计划再实施，只允许 `Auralis-PC/src/views/Profile/index.vue` 的“本周专注天数”文案。
- [x] 隔离树先物化当前脏文件 overlay 并核对 hash；授权增量不含旧用户修改，不删测试、不改布局/统计逻辑/依赖。
- [x] 核对完整差分和所生成文件，记录 taskId/status/collect；工具没有 tail action，如实登记。复用 focus相关验证和最终PC门槛，不为可逆文案写镜像实现测试。
- [x] 归档候选、收据并安全清理该 AGY工作树/自有分支；主树依赖与用户更改必须保留。

## Task 4：统一审查、回写及逐项询问

- [x] 主 Agent只裁决高风险边界并核对所有实际日志及完整差分，不重复执行子 Agent已充分证明的普通门槛。
- [x] 执行完成后仅派一个只读 reviewer：correctness、requirement、race/deadlock、transaction、data integrity/security、必要覆盖；不修改代码、不再派reviewer。
- [x] reviewer 的 BLOCKER/IMPORTANT 交同一执行 Agent必要补修，原 reviewer 收尾；OPTIONAL 按用户要求暂不修改。
- [x] 回写 FrontendPC、Backend、Frontend、Database规则事实、Status、IssuesAndReview、Changelog、本计划与 README；原审计保留历史证据并链接当前关闭状态。
- [x] 核对范围外文件hash、用户原删除、HEAD/index，明确代码/自动验证/只读review与真实业务验收。
- [x] 本次交接先单独询问复习查看与管理如何处理；后续依次询问统计反馈、搜索反馈、搜索竞态、写操作反馈、UTC今日、时间轴标记、跨周守卫、同名学科、偏好。未经回答不实施下一项。

## 执行记录

- 2026-10-07：用户通过响应批注授权上述三项；其余清单要求完成后逐个询问。主 Agent完成快照保护并收取 PC / Service 只读方案；本计划据当前代码与证据确定最小边界，实施与验证结果待各步骤实际记录。

### 实现、复现与命令证据

- PC 新回归使用真实 Pinia/AuthStore、SubjectStore、browser Repository 和实际 Axios adapter 的可控等待；初版的 request/syncCycle/Asset 隔离断言在旧实现上失败，最终专项通过。A→B 使用 AuthStore.setSession，同账号重登执行 AuthStore.logout 后 setSession；没有真实登录 HTTP 或 Tauri 文件落盘证据。
- 主 Agent在鉴权复核中发现候选实现把普通 Axios/SSE 和 core-sync 分成两个刷新通道。实际新增 RED 在同一会话观察 2 次刷新（应为 1）；服务端 refresh replay 会撤销 rotation family，属于必须关闭的新增回归。原执行 Agent仅在 request 与既有 sync 测试内统一会话单飞，补普通 A 刷新与 core-sync B 刷新的迟到对照，再执行最终门槛。
- Service 最初增量编译失败不能作为 business RED；确认 ignored target 位于 workspace 后干净编译成功。收紧 PostgreSQL 等待检测到 Asset 锁查询，独立 restore 方法在旧实现上稳定失败于“活动恢复 Source 必须保留对象”。GREEN 捕获 `FROM assets ... FOR NO KEY UPDATE` 被恢复事务 PID 阻塞，随后恢复提交且对象保留。对象存储使用可控测试适配器，不代表生产 MinIO 并发验收。
- 公开 API、数据库列/迁移、生成 SDK、依赖及 Mobile 实现未变。Service 原 SourceAssetRelationServiceTests 未改，15/15 通过。Profile 相对当前脏文件仅改一行标签和值排列。

以下命令实际执行于 **2026-10-07，Asia/Hong_Kong**。PC 执行目录为 `D:/CodeBase/Active/Auralis/Auralis-PC`，Server 为 `D:/CodeBase/Active/Auralis/Auralis-Server`；专项与全量计数重叠，不相加。

| 范围 | 实际命令 | 退出码 / 关键结果 | 日志与 metadata |
| --- | --- | --- | --- |
| PC 基线 | `node --experimental-strip-types --test scripts/r4-store-local-asset-flow.test.mjs scripts/r4-sync.test.mjs scripts/r4-profile-logout.test.mjs scripts/r4-pomodoro-focus.test.mjs scripts/r4-overview-sync.test.mjs` | 0，69/69 | PC TEMP：`focused-baseline.*.log` |
| 混合刷新 RED | `node --experimental-strip-types --test --test-name-pattern='ordinary and core sync 401s' scripts/r4-sync.test.mjs` | 1，期望 1 次、实际 2 次 refresh | PC TEMP：`red-shared-refresh.*.log` |
| PC 最终专项 | `node --experimental-strip-types --test scripts/r4-store-local-asset-flow.test.mjs scripts/r4-sync.test.mjs scripts/r4-profile-logout.test.mjs scripts/r4-asset-tasks.test.mjs scripts/r4-local-asset-sync-queue.test.mjs scripts/r4-overview-sync.test.mjs scripts/r4-pomodoro-focus.test.mjs` | 0，107/107，0 skip | PC TEMP：`final-related-regressions.*.log`，19:42 |
| PC 类型 | `npm.cmd run type-check` | 0 | PC TEMP：`final-type-check.*.log`，19:42 |
| PC 静态 | `npm.cmd run check:subject-icons`、`npm.cmd run check:subject-workspace` | 两项均 0 | PC TEMP：`final-check-subject-icons.*.log`、`final-check-subject-workspace.*.log`，19:42 |
| PC R4 | `npm.cmd run test:r4-pc` | 0，554/554，0 skip | PC TEMP：`final-test-r4-pc.*.log`，19:42 |
| PC 构建 | `npm.cmd run build` | 0，47/47 renderer assets；Vite externalization、chunk-size、dynamic-import 和 plugin timing 警告保留 | PC TEMP：`final-build.*.log`，19:42–19:43 |
| Service RED | `./mvnw.cmd -B -ntp -Dtest=AssetRetentionConcurrencyIntegrationTests#restoreThatHoldsAssetRowLockCommitsBeforeCleanupCanDeleteItsObject clean test` | 1，恢复后活动 FILE Source 对象丢失的业务断言失败 | Service TEMP：`diagnostic-clean-restore-lock-wait.log/.json` |
| Service 并发 GREEN | `./mvnw.cmd -B -ntp -Dtest=AssetRetentionConcurrencyIntegrationTests clean test` | 0，5/5，0 error/skip；PG 17.11/Flyway V28 | Service TEMP：`green2-AssetRetentionConcurrencyIntegrationTests.log/.json` |
| Service 相关回归 | `./mvnw.cmd -B -ntp -Dtest=AssetRetentionConcurrencyIntegrationTests,SourceAssetRelationServiceTests,SourceServiceReadBatchTests,CoreDomainControllerTests,CoreDomainServiceTests test` | 0，56/56，0 error/skip | Service TEMP：`focused-source-asset-controller-retention-tests.log/.json` |
| Service 全量 | `./mvnw.cmd -B -ntp clean test` | 1，392 项、391 通过、1 failure、0 error/skip | Service TEMP：`full-clean-maven-test.log/.json`，19:15–19:16 |

Service 全量唯一失败为 `TaskColorRemovalMigrationTests.cleanSchemaValidationRunsFreshDatabaseThroughLatest:62` 的 V21/V28 预期不符。原审计 AccountDeletion 时间精度差 1µs 在此次 4/4 中未复现；没有修改其源码或测试，不把一次未复现写成已修复。

证据目录与完整差分：

- PC TEMP：`C:/Users/Gnasche/AppData/Local/Temp/auralis-priority-pc-execution-20261007`。最新 `final-diff-vs-baseline.patch`、`final-target-hashes.txt`、`i2-asset-queue-evidence.md`、`refresh-rotation-followup-evidence.md`；最终 patch SHA-256 为 `6D1E46F3DA01FCB83A525752791D11A517C82AE80A8641CD1107287329E6C2EB`。69 项基线、80/549 项初版候选、82/551 项混合刷新补修为过程结果；19:42–19:43 的最终 `final-*` 日志证明上传队列及失败导航补修后的 107/554 项结果，覆盖范围重叠不相加。
- Service TEMP：`C:/Users/Gnasche/AppData/Local/Temp/auralis-priority-service-execution-20261007`。`final-handoff.md`、`scope-baseline-to-current.patch`、`scope-baseline-current-hashes.json`；差分 SHA-256 `1118DA9939D2141A3FCED70DB51A130092E8E4F6882325DCD99A151B1279970D`。
- AGY：实际 taskId `8e24f6682e3f`，Gemini 3.1 Pro High，status completed/exit 0；dirty overlay SHA-256 `45DCBD36847DFD9DFAC921904E848B0CDCB893844B6B916CFA4B4BC00B169297` 匹配当前 Profile。collect 差分仅 1 insertion/1 deletion，无额外文件；第二次 collect cleanup=true 已删除自有 worktree 和分支，收据在 PC TEMP 的 `agy-profile-delegation-evidence.md`。工具没有 tail action，status/collect 原结果保留在执行 transcript。
- 主 Agent首次工作树核对：172 个基线文件中，152 个范围外文件 hash 未变；原 Home/Settings 删除、HEAD 与空 index 保留，主树 node_modules 存在。只读审查后追加的 clean useAssetApi.ts 已在任何修改前单独快照，manifest 当前 173 条。只有本计划和 Service 并发测试为本轮新增文件；实际 `--untracked-files=all` 比较通过，证据为 baseline 目录 `workspace-protection.json`。最终文档收尾后再次核对。
- 主 Agent最终核对：173 条基线中 152 个范围外文件 hash 未变，未发现额外修改/新增；13 个已审查源码/测试 hash 与冻结清单逐个一致。原 Home/Settings 删除、HEAD、空 index 和主树 node_modules 保留。实际执行 `& C:/Users/Gnasche/AppData/Local/Temp/auralis-priority-fixes-baseline-20261007/verify-workspace.ps1`，cwd 仓库根，退出 0；完整清单为同目录 `workspace-protection-final.json`。批准的 tracked 文件 `git diff --check -- <本计划目标文件>` 退出 0；文档 baseline 差分仅追加本轮事实和校正原审计历史状态。

### 统一只读审查

- `priority_function_reviewer` 按仓库规则作为唯一只读修复 reviewer，最终 BLOCKER=0、IMPORTANT=0，无未决问题。实际核对完整 baseline 差分、13 个最终源码/测试文件 hash 与日志，无仓库写入、无重复全量门槛；报告为 `C:/Users/Gnasche/AppData/Local/Temp/auralis-priority-function-reviewer-20261007.md`，并非原审计 reviewer 结论。
- 首轮实际复现刷新正常失败后 scope 随 requireReauthentication 失效，导致错误路径跳过登录导航，列 IMPORTANT；真实上传 API 在 Axios 派发前切换账号，将 A 文件名搭配 B bearer，列 F1 必需覆盖。原 PC 执行 Agent最小补修后，原 reviewer 确认两条均关闭：失败会话资格在清理前捕获、导航前核验且只执行一次；队列 intent/complete 固定捕获 scope。正常刷新失败/缺失 refresh token、清 A 后 catch 前登录 B、旧队列派发前切换、迟到 A 401、正常 A rotation/complete 和 B 导入对照均纳入最终 107/554 回归。
- `red-i2-sync.*.log` 与 `red-asset-queue.*.log` 为实际执行失败断言的工具输出摘录；命令、cwd、日期、退出码已登记，未捕获精确起止时间，未将摘录冒充完整 stdout。最终 GREEN 的 `final-*` 保存完整 stdout 和精确命令 metadata。
- reviewer 曾把 PROCESSING mutation 在 same-scope pull 暂态失败后留在 inflight 归为新增回归；主 Agent核对完整 baseline，原 pull 同样在 push catch 之外，reviewer 已纠正归因。此为既有范围外行为，依用户要求留待后续讨论，本轮不修改 syncCycle 的该语义。

## 完成定义

本轮 F1/F2/F4 在代码与相关自动验证层关闭，唯一 reviewer BLOCKER=0、IMPORTANT=0；没有范围外功能修改。Service 全量若保留原工程失败，必须报告具体失败与未关闭门槛，不写成全项目测试通过。GUI/Tauri/真实HTTP/生产MinIO/双设备验收单独保留。

## 最终交接

- 完成内容：F1 同步、导入、上传队列及刷新会话边界；F2 恢复/清理串行与删除重试；F4 本周专注日数标签。代码和相关自动验证通过，唯一只读修复 review 无 BLOCKER/IMPORTANT。
- 修改文件：PC 9 个目标（6 个源码、Profile 单行、2 个现有测试），Service 3 个源码及 1 个新集成测试；均按本计划 allowlist 实施并核对完整相对用户快照差分。
- 验证：上述 19:42–19:43 PC 最终日志与 Service clean 日志为准，完整命令、cwd、退出码和范围已登记；Service 全量迁移版本断言 1 failure 仍开放，旧 AccountDeletion 失败本次未复现。
- 文档：README 已登记本计划，FrontendPC、Backend、Frontend、Database、Status、IssuesAndReview、Changelog 和原功能审计报告已回写；公开 HTTP DTO / 数据字段及迁移沿用现行契约。
- 人工与外部验收：GUI、真实 Tauri SQLite/Keyring、HTTP、生产 MinIO 和双设备另行验证；自动结果不替代这些业务验收。
- 工作树：152 个范围外文件与原删除、HEAD/index 保留，依赖/生成文件未由本轮修改，AGY 自有隔离树已清理；未提交或部署。
- 后续：先询问复习查看与管理的处理范围，其余功能清单等待逐项确认。

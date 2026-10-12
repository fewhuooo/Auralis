# Embedding 额度排除与单人测试额度实施计划

日期：2026-10-12（Asia/Hong_Kong）

状态：最小代码与配置修改、定向自动验证、唯一只读审查和本机 backend 更新完成；实际 Provider / GUI 测试由真实操作验收。

> 执行 Agent 沿用本仓库子代理编排与测试先行流程；最终仅一个只读 reviewer，保护既有工作树。

目标：embedding 不计入用户小时/每日和系统每日 token 额度，单人测试额度提高至 1000000 / 小时、2000000 / 日。

架构：沿用 Usage Guard B、现有 reservation 和 Provider gateway。只在额度窗口及本人显示的聚合中排除 `INGESTION_EMBEDDING` / `RETRIEVAL_EMBEDDING`；保留调用审计与任务资源预算，不增加表、迁移或 API 字段。额度由现行配置变量覆盖。

技术栈：Java 21、Spring Boot、JdbcTemplate、PostgreSQL / H2、Maven、Docker Compose。

## 用户范围与策略

- 最新用户指令覆盖前一轮“embedding 仍计个人配额”的决策：所有 ingestion 和检索 embedding 不参与用户小时/日及系统日额度，也不进入个人中心的 charged / reserved / remaining。
- 按实际业务 stage 判定，不按 Provider 或模型名称判定；同 Provider 的聊天、Overview、连接生成测试继续计量。
- 历史 embedding 的 COMPLETED / FAILED / EXPIRED / RESERVED 行随新聚合口径排除，不重写或删除账本。原估算、actual、charged 保留为调用审计，NULL 仍为未知。
- 仍保留账户校验、GLOBAL→USER→TASK 锁序、全局/用户并发、租约与续租、取消/超时释放、单次输入和分批字节上限、任务调用次数及任务累计资源预算。
- 单人小时从 100000 到 1000000、每日从 200000 到 2000000，均提高 10 倍。系统日总量 2000000、并发 4 / 2 不变；多人生成共享系统日总量，个人日上限不代表预留的系统容量。
- 本机 `.env` 四个相关 allowlist 键均未设置；Compose 显式 fallback 需要与 `application.yml`、`.env.example` 一起更新。真实 `.env` 不修改或复制，不输出其他键。
- 本轮没有前端代码变化。个人中心沿现有 API 自动使用新的统计口径和 limit；保留两端已有账号隔离与错误展示。

## 修改前证据

- 当前主树 HEAD `7beb3e66669b6e9f86a87ca74689930ed02d6897`，220 个 dirty / untracked 路径，逐项 hash 基线见 `D:/Temp/auralis-embedding-quota-policy-20261012/initial-worktree-hashes.json`。
- 前一轮 PDF / PC 修复已定向验证与审查，保留该冻结实现。只因本次明确策略要求修改额度聚合及默认值，不重构 Provider / PC / ingestion 检查点。
- 当前运行 backend healthy，UTC 04:33:05 启动，镜像 `sha256:f6775b101a2247840df5ba27b884d6dd579f317c578b2c635dd181111ca9844e`；仍为旧个人额度 100000 / 200000。Flyway 最新成功为 V31，V30 / V31 均已应用。此只读观察不代表新策略已部署。

## 任务 1：额度统计排除

允许修改：`Auralis-Server/src/main/java/com/auralis/app/ai/usage/AiUsageGuard.java` 和最小相关 Guard / Gateway 测试。Provider completion 字段解析保持。

- [x] 定位 ingestion / retrieval 两个生产入口、reserve→dispatch→settle、四条窗口聚合与并发 / 任务预算的不同职责。
- [x] 隔离 RED：历史 settled / reserved embedding 不应占窗口、额度已满 embedding 仍准入、普通生成仍拒绝；embedding 并发 / cancel / expiry 行为保留。
- [x] 在 `sumUserWindow`、`sumGlobalWindow`、`sumUserCharged`、`sumUserReserved` 仅排除两个 embedding stage，当前 embedding 跳过三种窗口准入校验，其他统计保持。
- [x] GREEN 及 Guard / Gateway / Worker / Job 相关回归，保存真实命令、退出码、日志、源码对应关系、测试 hash 和 task-before→当前 delta。

实际限定回归：在 `D:/Temp/auralis-embedding-quota-policy-20261012/backend/validation-scratch` 工作目录调用 `D:/CodeBase/Active/Auralis/Auralis-Server/mvnw.cmd -B -ntp -f ./pom.xml '-Dtest=AiUsageLedgerBehaviorTests,AiUsageGuardTests,AiInvocationGatewayTests,AiIngestionWorkerTests,AiIngestionJobTests' test`，退出码 0，53/53（Ledger 16、Guard 2、Gateway 10、Worker 13、Job 12）。隔离 LF 源码与主树 CRLF 归一化对应；复制最终主树两文件回副本后，新增两项按精确源码 hash 再跑 2/2，与 53 重叠，不相加。最终精确 hash 和实际命令记录见 `backend/quota-exemption-backend-validation.md` 与 `backend/quota-exemption-final-hashes.json`，不声称主树 target 或全量工程实跑。

有效 RED 用 pre-change Guard 与最终 ledger 两项测试，Maven 退出码 1（2 tests，1 failure / 1 error）：过期派发 embedding 被快照计入 70、用户额度已超额时新 embedding 被小时额度拒绝。此前 scratch import 编译失败不当作业务 RED。失败原始输出及 Surefire 索引见 `backend/quota-exemption-surefire-index.md`。旧 scratch 中有历史 Provider RED 辅助类，本次未选执行；一次早期 Maven processor 生成主树 ignored `build/generated-spring-modulith/javadoc.json`（401B），随后工作目录隔离，没有删除或清理该产物。本轮业务源码增量恰为 Guard / LedgerBehaviorTests，两份原始记录未重写。

## 任务 2：单人额度配置

允许修改：`Auralis-Server/src/main/resources/application.yml`、`docker-compose.yml`、`.env.example`、`Auralis-Server/src/test/java/com/auralis/app/AiConfigurationTests.java`。

- [x] 核对默认值 / env / Compose precedence 与运行态，真实 `.env` 只有相关键是否设置的 allowlist 检查。
- [x] 更新配置测试期待后 RED，再同步三份配置的 hourly / daily 值并 GREEN，保留 global / concurrent 数值。
- [x] `docker compose --env-file .env.example config --quiet` 与有效 allowlist 配额解析；不输出完整含密钥的 Compose 或容器环境。
- [x] 保存四文件 delta / hash，与任务 1 隔离构建输出，避免 target 污染。

配置 RED / GREEN 在 `D:/Temp/auralis-embedding-quota-policy-20261012/config/isolated/Auralis-Server` 调用 `./mvnw.cmd -B -ntp -Dtest=AiConfigurationTests test`：RED 退出码 1（6 tests，1 failure，期待 1000000 / 实际 100000）；GREEN 退出码 0，6/6。Compose quiet 退出码 0，effective allowlist 为 hourly 1000000 / daily 2000000 / global daily 2000000 / user concurrent 2。真实 `.env` 前后 hash 一致、无配置变化。证据 `config/validation-record.md`、`config/authorized-config-delta.txt`、`config/current-config-hashes.txt`。

## 收尾与真实测试

- [x] 一个只读 reviewer 审查历史统计、并发/锁序、未知用量和配置约束；BLOCKER=0、IMPORTANT=0、OPTIONAL=0，报告 `final-review.md`。未重跑已充分覆盖的测试或修改文件。
- [x] 回写 API 统计语义、Database 账本与聚合含义、Backend、Infrastructure、现行 B 设计、Status / Issues、Runbook / Deployment、Changelog。旧 PDF 计划加后续策略入口，本计划登记 README。
- [x] 核对最终 task delta、已测源码 hash、文档本地链接与继承的格式问题，保留用户已有及并行变化。6 个目标 hash 与已测文件一致、HEAD 未变，本地链接无缺失；精确 task delta 无新增格式错误。整个涉事 dirty-path `git diff --check` 退出 2 仅为既有 EOF 空行，保留 before 证明及原输出，详见 `root-final-audit.json`。
- [x] 代码与配置验证通过后更新本机 backend 的新策略；部署前检查运行态、迁移与活动任务，无数据库 / 对象存储重建、卷 / 账本删除或真实 Provider 测试触发。
- [x] 运行态核对有效小时 / 日额度及已部署类中的窗口排除、健康状态与数据库 / MinIO 身份保持。
- [ ] 实际 GUI / Provider 上传、Overview / 聊天测试由用户真实操作验收，命令测试和服务健康不等同于业务通过。

## 本机部署与可测试状态

部署前旧 backend 的有效 TASK lease、RESERVED 和 PARSING / INDEXING 数量于 UTC 04:56:56 均自然变为 0；主树最高 migration 与业务库最新成功均为 V31，没有新 migration。保留旧镜像 `auralis-backend:rollback-embedding-quota-20261012-precandidate`，只执行 `docker compose --env-file .env build backend` 和 `docker compose --env-file .env up -d --no-deps --force-recreate backend`，均退出码 0。

新 backend 香港 12:57:12（UTC 04:57:12）启动，镜像 `sha256:31f7dec47c568c5c3de3c7dfe1727228c245c90c6b81d6fb0931843b5227a11c`，容器 `2699ce5a…` healthy，readiness HTTP 200 / UP。db / MinIO 的原容器、镜像和卷挂载保持，Flyway 仍 V31 / 失败 0；真实 `.env` 保持，运行白名单为个人小时 1000000 / 日 2000000 / 系统日 2000000 / 并发个人 2 / 系统 4。

已复制运行 JAR 到 TEMP，仅提取 `AiUsageGuard.class` 做 `javap -p -c -constants`，退出码 0，确认两个 embedding stage 跳过窗口校验、四个窗口 / 本人聚合排除 embedding。JAR SHA-256 `F9745EC2C30A0A452EB8B99E1606A7C607D640FB931A2C9BDFC6323753A24EE8`，class SHA-256 `70FE84563ACA60E0BB6B135B828266DC29D54CA164F0822201652B7E947A9B30`。

香港 12:59:36 的短只读 UTC 日聚合显示，非 embedding 系统额度消耗 53567、有效在途预留 0，系统日余量 1946433；这是当时快照，不是持续不变的额度承诺。未调用 usage 惰性回收接口或真实 Provider / 重试 / 摄入 API 作为验收。完整部署、470 个 Server src / 366 个 Docker 输入前后 hash 对应、SQL / 输出见 `config/candidate-backend-build-report.md`；后续可在个人中心刷新额度，再实测 PDF 摄入、Overview / 聊天及其他实体同步。

证据目录：`D:/Temp/auralis-embedding-quota-policy-20261012/`，前一轮历史诊断仍见 [PDF 摄入诊断](2026-10-12-pdf-ingestion-quota-and-sync.md)。

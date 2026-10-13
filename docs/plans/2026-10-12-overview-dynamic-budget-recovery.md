# Overview 动态预算与超限恢复实施计划

### 2026-10-13 recovery checkpoint 无进展修正（本地代码与定向门禁通过，未部署）

- 同 generation `18226745-50bc-4ce9-be30-97cf8c61f57c` 的后续恢复在没有 Provider 出站时，以 `OVERVIEW_REDUCE_NO_PROGRESS` 失败。只读证据显示6个 checkpoint、8笔已结算调用、累计 input/output/charged 30,137/19,913/50,050，usage 完整，unknown/active reservation为0，无结果。此前一次 5,789-char REDUCE 响应在 JSON 相关校验阶段被拒绝，具体原因未定位；紧接的 recovery 输出 5,787 chars 被存作第6个 CP，后续 recovery 在 no-progress 检查前命中它。该版本只读运行态为镜像 `sha256:489106fe07a0c26f8da32884bc0e1aed858f680a9ecbd40bb638374f27369ebf`、StartedAt `2026-10-13T04:34:01.775901382Z`、healthy、Flyway V32 成功；未验证其 source/class provenance 或是否含当前工作树诊断代码。
- Service 仅为 recovery compaction 增加 full/partial 两种独立 purpose；partial recovery 继续使用允许缺失 mode 字段的既有规则和 REDUCE recovery 指令。`fits` 与真实 invoke 使用相同 purpose/prompt；fresh 结果在存 checkpoint 前须严格缩短，缓存恢复也做相同长度检查。no-progress 保持 `OVERVIEW_REDUCE_NO_PROGRESS`。普通 MAP/REDUCE purpose、Coordinator/V32及其他 reducer 策略未改。
- Testcontainers PostgreSQL 回归先在旧 Service 复现：同generation旧 `REDUCE` purpose 的 singleton checkpoint 使 retry 再次 NO_PROGRESS。修复后，测试向相同 generation 插入该 legacy poison CP，确认旧行保留但不被新 compaction 命中；4个 MAP 和普通 REDUCE checkpoint复用，Gateway只新增压缩及最终合并调用，较短合法输出成功，stable budgetTaskId/单一 usage task保持。另有 fresh no-progress 不保存 checkpoint 的计数断言。此夹具不是现场6CP形状的逐字节复现。
- 相关隔离门禁 7 suites / 141 tests，0 failure/error/skip，exit 0；覆盖 Service Recovery、Coordinator unit/PG、DynamicBudget、AiOverview、Gateway、Cancellation。此前210项全门禁早于本修复，不相加。本地修复尚未部署；真实用户 Subject 生成未成功验收，JSON validator 拒绝原因仍未知，P1 风险保持开放。完整命令、RED/GREEN 日志和源哈希见 [本轮证据](D:/Temp/auralis-overview-dynamic-budget-20261012/validation/diagnostics/recovery-no-progress-20261013/recovery-no-progress-report.md)。

### 2026-10-13 JSON 验证失败安全诊断增量

- 为真实 Provider 响应 validation 增加可选安全 sink；固定拒绝类别，限于异常简单类型及 Jackson 行/列/字符偏移，坐标相对于 trim/fence 剥离后的 JSON。2参数 validator 入口与公开错误语义保持，sink 异常不改变验证结果；不解析/记录响应正文或异常消息，不改变接收规则、预算、重试和 checkpoint。
- 隔离 `AiOverviewServiceTests` 与 `OverviewDynamicBudgetComponentTests` 定向门禁 83/83、Maven exit 0；含 Service 中间 MAP JSON/DTO/fence-shape 和 secret marker 检查。此前 210 项全门禁早于此增量。该日志实现当时未由 Codex 部署；之后用户更新镜像并 retry，但该请求在 Provider 响应校验前以 no-progress 结束，未验证诊断输出或运行镜像 source/class provenance；P1 风险保持开放。报告、命令和 before hash 位于 `D:/Temp/auralis-overview-dynamic-budget-20261012/validation/diagnostics/safe-json-logging-20261013/`。

> 执行方式：在本会话按阶段委派执行 Agent；统一只读 reviewer 在实现与相关验证结束后验收。用户已提供目标流程并要求分阶段实施，本计划落实当前实现证据。

日期：2026-10-12

目标：按实际内容规划总览，在现有模型请求、任务和用户额度保护内恢复可处理的中间超限，保持正式结果完整性。

技术栈：现有 Java 21 / Spring Boot 4、Jackson 3、AI Gateway / task scope、Overview validator、Flyway / JPA。

状态：P0–P3实现与私有V32集成完成；最终需求核对后fresh门禁210/210、test/package exit 0，随后 recovery no-progress 本地修复的隔离门禁141/141通过。唯一reviewer首审B0/I1/O0，I1经Luna high执行代理最小修复，由主代理依据完整diff/回归关闭，剩余B0/I0/O0；同reviewer复审被线程上限拒绝。指定真实Source ALL及单输入Subject ALL已完成并返回合法候选，主要正文主题初步覆盖。主代理只读观察到业务库Flyway V32成功；后续用户更新镜像并retry，运行镜像源码/class provenance未验证；本地 recovery 修复尚未部署。正式保存、GUI、真实恢复成功及多文件成功验收仍待证据；Subject JSON相关校验风险开放。

### 2026-10-13 用户实测 Subject ALL MAP2 JSON_PARSE 失败（只读观察）

- 运行态首次观察：主代理只读观察镜像 `sha256:f0c3e886175dadd709876988c7570a395793ae67a637545cbe5825a570317593` healthy，StartedAt `2026-10-13T03:34:43.093506959Z`，Flyway V32 `success=true`。该次执行器未部署、迁移、构建/替换容器或验证运行 class/source provenance，也没有备份证据；用户其后更新镜像并进行了 retry。
- 日志 request `5c927548-22b0-4bac-bba9-4cb4f0c3b544`，实际 generation `18226745-50bc-4ce9-be30-97cf8c61f57c`，Subject ALL MAP 流程。MAP1 返回 5194 chars / 2619 output tokens / stop，JSON/schema 成功；self-pair 12546 仅诊断，MAP1 已保存一个 checkpoint。MAP2 返回 5076 chars / 2511 output tokens / stop，JSON 相关 validator 失败并报 `MODEL_PROVIDER_ERROR`。stop 不证明 JSON 合法；原始响应和准确 Jackson 类型/位置无法从现有日志或数据库恢复。
- 只读 PostgreSQL 账本以稳定 Overview task ID 查询得到两笔 `OVERVIEW_MAP` / DEEPSEEK reservation，均 `COMPLETED` 且已派发：实际 token/charged 为 4672/2619/7291 和 4502/2511/7013；总计 input 9174、output 5130、charged 14304，usage完整、unknown-dispatched/活动reservation为0。generation 为 FAILED 且无结果，活动 TASK owner/lease 为空。稳定账本 ID 是 `UUID.nameUUIDFromBytes(UTF8(userId + ':' + feature + ':' + budgetTaskId))`，不等于 `budget_task_id` 本身。
- 当时的代码路径预期：同 input/profile 请求接管相同 generation/budget lineage，读取并重新验证匹配 checkpoint后从 MAP2 续做；截至该段只读归因时尚无实际 retry，也没有 checkpoint hit/restore 日志。用户随后已进行真实 retry，时序记录见后续运行观察。现有证据不足以判定 frozen validator 的 correctness 问题，未改 parser/validator 或重试策略。建议只记录不含正文的 parser exception 类别与安全位置/拒绝原因，再用固定样本本地重放。
- 命令/退出码/只读结果见 [现场诊断](D:/Temp/auralis-overview-dynamic-budget-20261012/validation/diagnostics/subject-map-json-20261013/readonly-attribution.md) 与 [commands-and-exits](D:/Temp/auralis-overview-dynamic-budget-20261012/validation/diagnostics/subject-map-json-20261013/commands-and-exits.txt)。本执行器未调用 Provider、执行迁移/部署或重跑测试。

### 2026-10-13 同 generation retry 续做至 REDUCE 后再次 JSON_PARSE 失败（只读观察）

- request `70b1a9f6-e190-4932-920e-8ec738d61617` 沿用 generation `18226745-50bc-4ce9-be30-97cf8c61f57c`。MAP1 在 MAP1 阶段无 Provider request 的情况下约6ms内成功；DB recovery_count=1、checkpoint count=5，与 checkpoint 复用相符，但日志无显式 hit/restore phase。MAP2 4,661 chars / 2,287 tokens、MAP3 1,888 / 1,006 均成功。
- REDUCE round1 两组成功；round2 响应 5,789 chars / 3,020 output tokens / stop 后再次进入 JSON_PARSE 并以 `MODEL_PROVIDER_ERROR` 失败，generation FAILED、无结果。准确 Jackson 原因和原始响应仍不可取得；finishReason 不证明 JSON 合法，尚不能定位 frozen validator correctness 问题。
- PostgreSQL READ ONLY：recovery_count=1、5 checkpoints、usage complete、unknown dispatch / active reservations 为0，三类用量锁无 owner/lease。7笔reservation均COMPLETED，累计 input/output/charged 26,627/16,894/43,521；相较首次两笔快照新增5笔及17,453/11,764/29,217。没有最终候选，本次不关闭运行态故障记录。
- 脱敏phase、只读SQL结果与命令/exit见[重试归因报告](D:/Temp/auralis-overview-dynamic-budget-20261012/validation/diagnostics/subject-map-json-20261013/retry-20261013-040434-report.md)及[命令清单](D:/Temp/auralis-overview-dynamic-budget-20261012/validation/diagnostics/subject-map-json-20261013/retry-20261013-040434-commands-and-exits.txt)。执行器未发起 Provider 请求、重试、PUT、迁移、部署或测试。

### 2026-10-13 最终需求核对与交接

- Luna high执行代理补齐精确软限制+1%（5252/5200字符）及1000段重复OCR统计回归；原文片段保持不变，正文/章节统计保留。最终fresh门禁20 suites / 210 tests，0 failure/error/skip，clean编译335 main / 111 test，test/package exit 0。命令、XML、源码/class/JAR证据见[最终门禁报告](D:/Temp/auralis-overview-dynamic-budget-20261012/validation/final-20261013-111727-620/final-run-report.md)。下面208项记录是用量错误修复阶段证据，以本段为最终计数。
- 中间209项门禁保留为失败：账户删除测试把wall-clock纳秒向下截断后与PostgreSQL微秒舍入比较，偶发相差1微秒。固定JDBC输入已复现；仅在该Testcontainers测试上下文注入整微秒Clock，跨时区设置、UTC绑定与原断言保留，生产时间策略没有变化。归因报告见[时间精度复现](D:/Temp/auralis-overview-dynamic-budget-20261012/validation/diagnostics/account-deletion-timestamp-20261013/timestamp-rounding-attribution.md)。
- 根目录Server/src共480文件，479与最终210项快照逐字节一致，335 main / 111 test Java均一致。唯一未包含的是验证脚本显式排除的tracked `application-local.yml`，其Git blob与HEAD相同；test profile/package不代表该本地配置验收。真实P4副本包含全部367 main/resources且hash一致。软planner的remainingCalls/remainingTaskTokens是每次尝试的建议值；跨失败尝试的累计硬限制由稳定Gateway账本执行。
- Backend/API/Database/Status/Issues/Changelog/README均已回写；OpenAPI和两端SDK保持事前hash。最终保护快照18项中16项一致：外部AppHeader窗口修改保持；账户删除测试仅有上述已证明必要的合成Clock修正，其余既有测试代码保留。范围内diff check退出0。未提交/推送、部署、业务V32迁移或正式PUT。完整文件清单、证据、审查限制及真实P4边界见[最终交接](D:/Temp/auralis-overview-dynamic-budget-20261012/resume-context/final-handoff-20261013.md)。

### 2026-10-13 最终修复裁决与指定真实评估

- 执行：GPT-6 Luna / high完成普通实现与测试，唯一Codex reviewer首审指出持久waiter错误信息丢失。私有V32保存安全status/retry/reset，fenced提交与接管清除，Service还原 `AiUsageLimitException`。新增六类跨实例真实临时PG回归旧RED→新GREEN，HTTP/SSE映射按异常类型独立验证。未修改本轮前端，未使用Antigravity；GUI/真机未验收。
- 原reviewer复审调度返回 `agent thread limit reached`，Provider/docs代理遇用量上限。主代理接续最终裁决、P4执行与文档收尾，检查完整修复diff、新约束、208项测试及TEMP运行边界，关闭I1；首次独立审查记录保留，不冒称复审通过。证据：[审查与主代理裁决](D:/Temp/auralis-overview-dynamic-budget-20261012/review/final-review-20261013.md)。
- 最新fresh完整源码编译335 main / 111 test，20 suites / 208 tests，0 failure/error/skip，test/package exit 0。命令、XML/CSV、source/class/JAR hash：[权威门禁报告](D:/Temp/auralis-overview-dynamic-budget-20261012/resume-p3-persistence/final-20261013-011827-403/failure-metadata-final-report.md)。Service `3DEDE365…C7EF0`，Coordinator `40856D86…D1BD`，V32 `A6D748A0…493A`。
- P4 TEMP runner4与367份root main/resources逐项hash一致。自测/reader4/4、只读precheck exit 0。真实DEEPSEEK `deepseek-v4-flash` / `api.deepseek.com`：Source ALL 9calls、44,097 input / 12,643 output、56,740 charged、69.595s；同文件Subject ALL 1call、1,806 / 1,489、3,295 charged、6.414s；合计10calls、60,035 charged，provider usage完整，零unknown-dispatched/活动预留/租约，recovery=0。最大完整prompt11,964字符；硬上限和实际用户/系统额度保持。
- 真实过程仅通过原业务PG用量账本reservation/dispatch/settlement；输入owner/READY/revision/chunks只读，私有V32仅独立TEMP H2，完整候选/指标仅TEMP，正式结果行数1→1，无PUT/部署/业务迁移。`ai.enabled=false`在生产生成路径无读取；初次TEMP额外条件曾在Provider前阻断，核验实际代码后只移除该TEMP条件，未改变运行配置。TEMP按stage计数回调漏首行问题已修正并4/4复验，未再次真实调用。
- 主代理核对实际正文八组主题均有覆盖，细节压缩；Subject outline/summary与Source一致。输入含前言/目录及第1章，目录中的18章不证明全文存在。各路由仅1个样本，不推算通用成功率、最佳预算或真实恢复成功率；recovery=0没有额外恢复延迟，币种账单成本未知；多文件、真实HTTP取消、GUI/专业内容验收仍需独立验证。证据：[P4报告](D:/Temp/auralis-overview-dynamic-budget-20261012/resume-p4/live-runs/2026-10-13T02-45-18.484374800Z-52ff083e-6c90-42ca-ba27-888f53bd88cb/P4-live-evaluation-report.md)、[主题覆盖核对](D:/Temp/auralis-overview-dynamic-budget-20261012/resume-p4/live-runs/2026-10-13T02-45-18.484374800Z-52ff083e-6c90-42ca-ba27-888f53bd88cb/semantic-coverage-review.md)。
- 保护检查18项中17项一致；外部PC AppHeader窗口修改保留，不还原。OpenAPI与PC/Mobile SDK保持事前hash，runtime契约/SDK标准生成验证无额外字节变化。未提交/推送；下面早期189项、旧snapshot和首次审查pending记录是阶段历史，以本段最新结论为准。

### 2026-10-13 续做状态

- 仅续写文档契约与生成 artifact：在独立 TEMP fresh Server 副本执行 `mvnw -B -ntp -Dtest=OpenApiArtifactTests -Dauralis.openapi.export=true test`，退出码 0。JSON 树比较未发现 runtime artifact 与完整输入的结构差异。根据恢复上下文中的 artifact patch，经 TEMP `git show HEAD` 重建并仅应用该文件 patch，按原 CRLF 规范化后得到 SHA-256 `2A17C775A165C594CA579B01C38775B56D98C672103DF4D4BA84553B72B0B4D5`，与事前 artifact hash 一致；主树 artifact 已按此 hash 原样恢复，runtime export 不需要提交文件变化。runtime artifact recursive JSON pointer 检查未发现 `retrievalEnabled`；`ApiProblemDetails.code` 仍是普通字符串，不存在可生成的三值 ErrorCode enum diff。错误码语义按 API 文档及 Handler/Test 记录。
- 由新 runtime artifact 使用 `openapi-typescript@7.13.0` 分别生成 PC/Mobile schema，两个命令均退出码 0，生成结果与工作树现有两个文件 SHA-256 完全一致，保留 RAG 请求 DTO 字段删除及既有 schema。
- P4 TEMP reader 检查发现 `subjects.default_subject` 与现行 `is_default` 不符，只修正 TEMP `P4PostgresInputs`。全量 Flyway V1–V32 + H2 reader self-test 1/1；业务 PostgreSQL `transaction_read_only=on` metadata/owner/READY/revision/42 active chunk reader probe 1/1，均退出码 0。该探针未调用 Provider 或写结果；Service 最终集成快照到位后仍需复测。
- 本段记录最终集成前的契约/SDK 与 TEMP reader 检查；Service 集成、自动门禁与最新 TEMP composition 结果见下方续做记录。V32 尚未应用于业务库，Provider / GUI / 部署仍未验收。

### 2026-10-13 最终 backend 集成门禁与 P4 harness 准备

- 生产 `OverviewGenerationService` 已集成 dynamic budget planner、语义分片/实际分包、同 task scope 有界恢复、Gateway usage accounting 与 V32 private coordinator；来源仍在用户 owner、READY、revision 及 active-chunk 围栏内。有效规范化 UUID 的 request mapping 绑定 generation；缺失、空白或非法 ID 由服务端生成 UUID，不承诺客户端重放。失败 lineage 跨新 request ID 累计，不会重置预算。
- V32 `recovery_count` 按 generation 累计，`recovery_actions_json` 合并历史与本次动作并按安全动作集合去重。成功结果 payload 按 14 天期限清理，checkpoints 按独立到期策略清理；request mapping、generation 和预算 lineage metadata 保留，因此已过期 response 的 request ID 不能重新绑定。生成端不写 V27 正式 `overview_results`，仍由客户端独立 PUT 围栏保存。
- 最终 fresh Server run：19 suites / 189 tests，0 failure/error/skip；clean 编译 335 main / 111 test；package build exit 0。详细命令、逐 suite XML 与源码/类/JAR hash：`D:/Temp/auralis-overview-dynamic-budget-20261012/validation/final-20261013-004653-853/final-run-report.md`。
- 最终测试报告确认 V31→V32 与 clean migration、PostgreSQL coordinator claims/fence/lease、request association/replay、result integrity/expiry、累计预算恢复、账号清理、Service recovery/waiter、usage Gateway、Controller、SSE/TLS deadline 等自动覆盖。PostgreSQL 只在 Testcontainers 临时实例；未触达业务数据库或 AI Provider。
- TEMP runner `D:/Temp/auralis-overview-dynamic-budget-20261012/resume-p4/service-runner3` 对比 main `src/main/java` 与 `src/main/resources` 共 367 文件，0 missing/changed；Service 与 Coordinator SHA-256 分别为 `457ED70FB374758A71DB0CC692C97A1B48AC64D96B8EAFAF196B327402A69E6F` 与 `D6C88C157956C53871EDC57FCF7F0906D0D0A8CE09F59A4A4BB22AC4DE0962CF`。TEMP stub Service composition 2/2 + H2 input reader 1/1 通过；stub metrics 检查 calls / actual tokens / charges / coverage / leases。只读 `Run-P4-Live.ps1 -Mode Precheck` exit 0，按当前业务配置解析 DEEPSEEK `deepseek-v4-flash` / `api.deepseek.com`，核验当前 owner/Source/Subject/revision/42 active chunks/PDF SHA 与配额；未启动 provider 或业务写入。
- 只读 precheck 和 stub 不等于 P4。P4 真实运行入口仍由 parent gate 控制，只能在唯一 reviewer 通过并显式放行后使用业务账本原 Gateway/Guard；generation coordinator 仅独立 TEMP H2。P4 仅测一份 Source ALL 和其作为唯一输入的 Subject ALL，不称多文件 Subject 或 PC GUI。候选内容质量/语义覆盖需人工检查；coordinator schema 没有独立 recovery event timestamp，只记录 stage elapsed、累计 recovery count/actions，不冒称 recovery-only duration。
- 唯一只读 reviewer 已返回 BLOCKER=0、IMPORTANT=1、OPTIONAL=0。I1 为跨实例 durable waiter 丢失原 AI usage limit 异常的 HTTP status、retry-after 与 reset 状态。最小修复已授权：私有 V32 failure details 保存 `error_status`、`error_retry_after_seconds`、`error_reset_at`，Service 恢复原 `AiUsageLimitException`；不改公开 DTO。待代码冻结、fresh 门禁和唯一 reviewer 复审。此期间不运行 P4 Live。真实 Provider、业务账本结算、正式 Overview 保存、PC GUI、部署和业务运行库迁移仍未执行。

## 现行机制与直接成因

- Source 已按 active chunks 分批；Subject 大输入已有语义字段分片、按完整 SYSTEM + JSON USER 长度分包和有界 MAP / REDUCE。
- P0 历史诊断确认 Self-Pair 曾把中间 JSON 复制两份作假想 REDUCE 容量检查，产生 5062 / 5200 字符、12167 / 12000 字符受控 fixture 的拒绝；原现场完整 JSON 未提供。当前实现把 5200 字符作为内容软目标，由真实消费者组合执行完整 prompt 检查。
- 实现保留 12000 实际 prompt 字符防护、4608 intermediate / 6144 final 输出硬限、24 次 Overview 调用、524288 task token、240000ms 任务期限及现有 Gateway 预留/结算/并发/取消。UTF-8 byte estimate 是保守估算，不是 tokenizer 实际值。
- 动态 planner、语义分包及三类预算/截断/恢复错误码已进入代码。V32 private generation/checkpoint/request mapping migration 与 coordinator 已接入 Service；最终端到端门禁通过，业务运行库迁移仍未执行。
- 正式 Overview results PUT 的 revision/manifest/baseVersion/write receipt 仍只保护客户端保存。生成 endpoint 不写正式 results；迁移尚未应用于运行数据库。

## 全局约束

- 保护上一轮未提交且已验证的 RAG 改动，不重置工作树、不提交或部署本轮改动。
- 保留 12000 实际 prompt 字符防护、4608 intermediate / 6144 final 输出上限、24 次调用、524288 task token、240000ms 绝对期限、Provider 超时 / 取消 / 响应体防护和现有用户额度。
- 不跳过必需 REDUCE，不任意截断 JSON、末尾章节、知识点或某个文件；本地统计清理不得改变用于生成的有效内容。
- 不改 PC OCR、预览、核心同步协议或前端详细程度设置。正式 Overview Schema、owner / alias / locator / mode 约束保留。
- 所有额外恢复模型调用必须经同一 Gateway，计入同一任务用量 / 调用上限和原绝对期限。
- 模型 Token 能力未知时必须明确标为估算 / 未知，不能以字符或单次 Provider usage 比例宣称精确 tokenizer / 真实上下文保证。

## P1：当前误拒绝的最小修复

修改文件：`Auralis-Server/src/main/java/com/auralis/app/ai/OverviewGenerationService.java`、`Auralis-Server/src/test/java/com/auralis/app/AiOverviewServiceTests.java`；需要明确新错误分类时按现有 shared error 模式局部扩展。公开 DTO 与数据库此阶段不变。

1. 已解析中间文档保留现有 schema / mode / alias 校验；5200 转为内容软目标 / 数值日志，不单独拒绝合法产物。删除“复制自身两份即可证明无法合并”的判定，实际消费者始终做完整 prompt 预算预检。
2. 按真实结果复用 `packDocuments`，能合并的不增加模型调用；真实组合无法进展时按章节、section、summary 字段拆成不重叠片段，再精确分组。必要时进行次数受限且有严格尺寸缩减目标的 singleton REDUCE，保持原 task scope / deadline。
3. 单文档放不下时也不得直接丢弃：使用语义片段和 code point 边界拆包。拆包保留字段 / 来源 / 结构上下文，不能复制其他 prose 列表导致膨胀。
4. 恢复必须有次数、层数及严格进展界限；真实模型请求无法安全拆包、没有缩减、预算或期限耗尽时明确失败。
5. JSON parse、schema、中间预算、实际 prompt、模型 `finishReason=length` 和 recovery 阶段分别记录；Guard 真实拒绝不包装为通用生成失败，不把格式合法但截断的模型结果当成功。

测试顺序：先 RED，再最小实现和 GREEN；不只更新静态字符串断言。

- [x] P0：只读诊断、隔离 clean probe、预算 / 保存边界核验。
- [x] 合成合法 JSON 的 5062 / 5200 / 自配对 12167 / prompt 12000 回归（合成 fixture 明确标识）。
- [x] 两份不等长 MAP：大结果自配对超限而真实组合可用，成功且不额外调用。
- [x] 真组合超限、单文档超限、受控再次归纳、无缩减和恢复耗尽。
- [x] 三 mode、转义 / Unicode、alias、字段分片完整性、多来源分配、输出截断、parse/schema 错误分类。
- [x] 原 deadline / cancel、Gateway 调用 / task budget 拒绝继续准确传播。
- [x] fresh相关门禁208/208及唯一reviewer首审；I1已由主代理根据修复与回归关闭，同reviewer复审工具受限已登记；API/Backend/Database/Status/Issues/Changelog/README回写。

执行命令（在 Server 或隔离 fresh Server 副本）：

```powershell
.\mvnw.cmd -B -ntp clean test '-Dtest=AiOverviewServiceTests,AiInvocationGatewayTests,OverviewBudgetIntegrationTests,OverviewCancellationTests,OverviewSchedulerCancellationTests,AiOverviewControllerTests'
```

具体测试类以当前 `rg --files src/test/java` 确認，任何不存在的名称不得用来伪称已执行。源码 / test / class hash 与实际 Surefire、退出码单独保留；不采用旧增量 target 作为最终证据。

## P2：内容与单次模型预算

独立组件由预算 Agent 实施，Service 唯一执行 Agent 集成，避免多人写同一文件。

1. `OverviewContentStats` 从现有文本单位统计有效内容保守估算、结构数量、来源数及输入 fingerprint。重复 OCR / 页眉清理只影响统计视图，不删生成输入。无法取得 pageCount 或真实 tokenizer 时明确 unknown / estimate kind。
2. `OverviewBudgetPlanner` 按内容量和结构以有界次线性增长生成 MAP / REDUCE / FINAL 输出目标，仍受 4608 / 6144 硬上限约束；长输入主要增加语义分组。ALL 的每个所选有效 Source 必须获得输入处理机会，不用文件字节大小分配预算。
3. `OverviewModelBudget` 只对经过官方资料核验的 provider + 官方 endpoint + exact model 应用已知 context / output 能力。DeepSeek 官方 pricing 文档显示 `deepseek-v4-flash`（现由 V4.1 Flash serving）容量为输入 1,000,000 / 输出 384,000；profile 精确匹配 `DEEPSEEK`、官方 `https://api.deepseek.com` endpoint 与 exact model。OpenAI 官方 `gpt-4o-mini` 为 128000 / 16384。来源：[DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/)、[OpenAI gpt-4o-mini](https://developers.openai.com/api/docs/models/gpt-4o-mini)。自定义兼容 endpoint 同名模型保持 unknown。完整 SYSTEM + USER 的保守 token estimate + 请求最大输出 + safety margin 在可信上下文内；原 Gateway 原子额度检查仍为最终授权点。
4. 服务将内容目标传入实际 stage prompt、分组规划与安全日志，作为软指导，知识覆盖优先且不填充。硬 completion maxTokens / 预留继续以 4608 / 6144 和可信 model/context 上限协调，不能将未实测软目标直接降成硬输出上限。精确 5062 fixture 的合法输出为 2521 tokens，而约 10KB 输入的初步内容公式可能给出约 752；直接使用后者作为 maxTokens 会制造新的截断，stub 也可能掩盖。硬输出参数待 P4 真实数据调优。不把字符日志称为实际 Token，不从一次 usage 比例降低安全预留。
5. RED / GREEN 覆盖短、中、长、超大输入的单调饱和、重复噪声、Unicode、算术溢出、多来源和可信 / 未知模型边界。不会新增用户详细程度设置。

## P3：有界恢复与私有检查点

1. P1 的实际分包和受控归纳沿同一 task scope；按严格缩减、有限层数 / recovery 次数和原绝对期限拒绝无进展循环。必须阶段不作可选降级；只有完整 final 经现行业务 validator 才可返回。
2. 新增私有 generation、validated checkpoint 和 request mapping 三类记录（迁移编号在当前最大版本后），不进入 core Sync 或正式 Overview results。绑定 owner、scope、内容版本 / fingerprint、mode、instruction hash、Provider profile 及 prompt/schema 版本，不保存密钥或在日志写正文。
3. Same request mapping 仅以服务端规范化后的有效 UUID 为键：缺失、空白、非法 UUID 均分配新的 server UUID，不提供对原始无效值的客户端幂等保证。同 owner 的有效 UUID 绑定不可变 generation 与输入；相同内容重放，冲突内容拒绝。成功 response payload 满 14 天清除，但 request mapping / generation metadata 保留，过期 request ID 不可复用。失败元数据保留原逻辑任务 budget lineage；新有效 request ID 可以在接管后继续失败 generation、复用已验证检查点，不得重置累计预算。新 ID 在既有成功后开始新 generation；不同 profile 的检查点不得复用。最终 Service 集成及 clean/upgrade PostgreSQL 自动回归已通过；后续只读观察见本计划顶部的 2026-10-13 状态记录。
4. `AiTaskContext` 增加仅服务端内部 stable budget identity，保留原三参构造器；Overview Guard 以该身份延续调用 / token 账本，其他 feature 行为和锁序不变。旧记录、embedding 排除、未知 usage 保守结算和并发保护不修改。
5. Claim / takeover 增加 owner / fence，短事务只做协调，不涵盖 Provider I/O；独立心跳复用现有 scheduler。检查点 / 成功 / 失败写入均校验 fence / lease，旧 owner 不得迟到覆盖，失去 lease 不得继续授权出站。
6. 每个 Provider 调用先完成结算，解析、schema 和 alias 验证后才保存检查点；Provider 返回到检查点提交之间的崩溃窗口可能重做，不能承诺 exactly once 或不计实际已发生用量。
7. 完成和 replay 在 Service 再校验活动 owner、READY、Source revision / Subject 来源 fingerprint；正式 PUT 的 manifest、baseVersion、clientWriteId 围栏保持。删除 / 内容变化不得通过检查点复活旧结果。
8. 保留失败的预算 lineage，清理策略不能让 payload 过期变成预算重置；账户物理删除包含新增私有表。成功结果 payload 满 14 天后清除；request mapping、generation 与 budget metadata 不因该期限清理而删除，因此旧 request ID 仍不可复用。Checkpoint 采用独立过期清理策略；失败预算 lineage 不清理。clean 与 V31→V32 PostgreSQL 临时容器回归通过，业务运行库未迁移。
9. 必要集成回归：失败后 MAP 复用、同 request replay、成功后手动新生成、跨实例 claim / fence / lease、累计预算不重置、Provider profile 变化、revision / 删除 / 账号隔离、V31 升级和 clean schema。执行结果区分 H2、临时 PostgreSQL 和真实业务环境。

## P4：评估证据

准备受控规模 / 故障矩阵并记录 calls、估算 / 实际 tokens、恢复方式和耗时。真实文件成功率、语义覆盖、成本与额外延迟必须由真实 Provider / PC 工作流测量；stub JSON 测试仅证明控制流和确定性结构约束。不得依据自动测试预先宣布已找到最终最佳限额。

用户已选 `docs/test/1.pdf`：50 页扫描 PDF，29629815 bytes，SHA-256 `70FC69365E6C9E75A1933191BB4CC6A4F1E60939A89D76592B44A5C27D2BD8B9`。Poppler / pdfplumber 只读检查发现 0/50 页可提取文本、50 个图像对象；没有重新 OCR。同 SHA 的现行数据库已有一份 READY 未删除 Source、一份 ACCEPTED ParsedDocument 和 42 个 active chunks。

实测先准备独立 TEMP 进程执行 Service / 原 Provider transport / Gateway；私有 V32 generation/checkpoint 仅在独立 H2，不迁移运行数据库。真实调用使用运行态当前用户的 PostgreSQL 用量账本和配置限制，输入及 owner / READY / revision 从运行库只读取得，避免用独立假额度规避原限制。运行 Provider 凭据只在测试子进程内存使用，不写日志、命令参数或明文文件。前后用量、租约、私有结果与恢复指标分别保留；不写正式 Overview results。完成最终组合自动门禁与唯一 reviewer 后，测文件 ALL 以及该单文件输入的 Subject ALL，不能将其称为多文件或 PC GUI 验收。若环境无法安全连接真实账本，不绕过限制制造“成功实测”。

## 证据与验收边界

初始 HEAD：`83f3e9211f027079d86dd33afb72859b19c015ec`。既有 29 份 RAG 改动与两份 Overview frozen 源码 / 测试 hash 已保存至 `D:/Temp/auralis-overview-dynamic-budget-20261012/baseline/`。

P0 报告：`diagnosis/diagnostic-report.md`、`safety/overview-budget-safety-readonly.md`；证据根为 `D:/Temp/auralis-overview-dynamic-budget-20261012/`。真实 Provider、PDF/PC GUI、Mobile/Tablet、部署、跨进程恢复与 PostgreSQL 集成尚未由该诊断验证；后续逐项按实际结果回填。

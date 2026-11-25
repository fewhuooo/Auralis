# Overview M3.3：持久后台执行、控制与安全接管

日期：2026-10-19 计划；2026-10-22 结案（Asia/Hong_Kong）。

范围：交付可运行的后端 job enqueue/claim/status/progress/pause/resume/cancel 与安全接管，完整已验证候选可读取。正式 OverviewResult 发布与分节预览留待 M3.4，PC UI 留待后续端侧阶段；本计划结案不表示这些阶段完成。

## 1. Job 身份、输入与期限

- 新增单一 Overview jobs 业务边界及当前空闲迁移（预计 V36，先核对），job 持久保存 owner、scope、mode、经授权请求快照、完整有序 source/revision/active-generation manifest、input/profile/algorithm 身份、稳定内部 generationRequestId、generation/budgetTaskId 关联、状态/阶段/进度/版本、worker owner/fence/lease、deadline、安全错误和控制意图。不存明文凭据、ResolvedSettings、TaskLease、完整 prompt 或 Provider 请求。请求快照有严格现有 DTO 上限及序列化资源上限，不复制原文。
- Enqueue 只校验现有 owner/subject/source/READY/输入与 settings profile，不做 Provider I/O；内部 `AiSettingsService.jobProfileMetadata(UUID userId, AiProviderType provider)` 返回 provider/chatModel/normalizedEndpoint/source/fingerprint，其中 fingerprint 是 job 配置身份：BYOK 对保存的加密凭据做 hash，默认配置对已加载 API key 做 hash；不解密 BYOK、不构造 AiCredential，也不持久化明文密钥或原密文。enqueue 用该 fingerprint 固定配置身份；worker claim 调用 `AiSettingsService.resolveJobSettings(UUID userId, AiProviderType provider, String expectedFingerprint)`，在一次只读事务中从同一 BYOK entity 或 default 配置对象计算并先校验 fingerprint，再解密同一 entity 密文或构造 default credential，返回配对的 `JobResolvedSettings(metadata, settings)` 并 pin 此 settings 给后台生成，避免 metadata 与凭据分次读取期间切换配置而错配。既有同步 resolve 行为不变，事务不跨 Provider I/O。该 job 指纹独立于 resolve 后才计算的运行时 generation `profileFingerprint`。请求提供 clientRequestId UUID，(owner,clientRequestId) 唯一且绑定请求 hash，重复同输入返回同 job，异输入冲突。内部 generationRequestId 由服务端生成，不与旧同步 request ID 共用命名空间。
- 同一 owner/scope 不同时执行冲突 jobs；同快照重复可返回现行 job，不同快照明确冲突。不得为 resume 新建 job/generation/budget 或重写输入/profile。新 job 或执行前 profile/资料变动明确过期/冲突，不偷偷换模型或凭据身份。
- absolute deadline_at 在首次后台 claim 原子确定为 now+当前 overview task timeout；排队不占 Provider slot，已有 deadline 的任何重启/暂停/继续/接管不延长它。暂停也计入这一期限；超过期限转 EXPIRED，不以新 scope 重置。每次执行创建 monotonic deadline=min(持久剩余时间,现有单次上限)。需把这一产品边界清楚写入 API/设计。
- 真正 claim 后才解析当前 settings/credential 并 begin Gateway scope。generation acquisition 后将其身份/预算原子绑定当前 job；此后必须严格同 generation/task。现行同步 JSON/SSE 路径继续可用，但后台执行不依赖网页连接或 Source 的进程内消费者 flight。

## 2. 所有调用的精确 lineage 与 dispatch 授权

- 新增 generation 级 invocation 关联，覆盖当前算法的 index、目录/层级 metadata、writer 和所有递归 JSON repair，不只 M3.2 writer。关联至少包含 generation/task/user、真实 reservation UUID、stage/step 或 purpose、owner/fence；有界总量，使用同父预算。writer 的 node binding 与 generation binding 同时生效，不能互相覆盖。
- 沿已有 reserve 提交→binding→markDispatched→Provider 顺序。binding 在 dispatch 前持久精确记录，失败释放未派发 reservation 并禁止 I/O。涉及 guard 的额外 seam 只增加内部通用 dispatch check，usage 不依赖 job/journal：AiInvocationBinding 保留 SAM onReserved(UUID)，增加默认 beforeDispatch(UUID)；Guard 的新 markDispatched overload 接受 Runnable，旧 overload 行为不变。Gateway 把 binding.beforeDispatch 传入新 overload。
- beforeDispatch 在 Guard 已锁 user/usage scopes 并确认 task owner 的同一事务内执行，再更新 dispatched。回调仅当前事务内 DB 身份/lease/fence/控制检查，无远端 I/O、无 REQUIRES_NEW、无重新 reserve/settle 或反向锁账本。取消事务同样首先锁 user，因此 dispatch 授权与 cancel 串行；已在 cancel 前获授权的在途请求可能继续耗费，不能声称撤回远端。
- 同一用户变更一律先 user 行；保持现有 generation→plan→node→call 顺序，新的 job/关联锁不能和其它回调组成反向锁序。Provider I/O、JSON处理和长等待均不在数据库事务中。
- 恢复必须检查所有历史精确 invocations：COMPLETED 可重算（旧消耗保留），未派发 RESERVED/RELEASED/EXPIRED 安全，FAILED 仅未派发或实际 input/output 完整可重试；派发中/未知/缺失关联/身份不符则 RECOVERY_REQUIRED。不能用全 task aggregate 推断，不自动抹除 unknown，不接受用户声称成功/无费用。恢复/对账操作只重读可信 ledger，再安全排队或继续 hold，绝不改账本或手动覆盖 usage。generation/job 的 `budget_task_id` 是原始预算 UUID；invocation `task_id` 是 AiUsageGuard 按 `(userId, feature, rawBudgetTaskId)` 稳定派生的真实 ledger UUID，恢复绑定必须使用该 ledger 身份而预算、结算与重试仍沿用 raw ID。
- 当前唯一算法推进版本隔离不具备全调用 lineage 的旧 checkpoint/generation；无旧算法双读/回退。同步当前算法也走全调用 binding，避免与后台共享 generation 时留下未跟踪调用。

## 3. Worker、控制与候选

- DB 有界 claim（跨 worker 原子互斥、lease/fence/attempt）；任务 executor/heartbeat 有界，轮询不能每次建立无界队列/线程。复用当前 adaptive 默认 false 开关控制后台可执行性；关闭时新启动明确不可用，不默默接受永远不运行的任务。不自动生成新任务、不改部署环境。
- 状态至少 QUEUED/RUNNING/PAUSING/PAUSED/CANCELLING/CANCELLED/COMPLETED/FAILED/RECOVERY_REQUIRED/EXPIRED（可用等价少量状态+intent实现，但 API语义明确）。queued可暂停/取消；running pause 持久意图，阻止后续 dispatch，让当前已派发调用正常结算并通过校验保存完整 checkpoint，再进入 PAUSED；不能伪造节点完成。
- cancel 持久意图并撤销当前 generation owner/fence 授权，停止后续 dispatch/候选提交。当前传输可协作关闭，远端未知保留 ledger。迟到 worker 不能写 checkpoint/node/job/candidate；同 fence 边界内已完成的独立章节可保留历史，不删除旧正式结果。后台断线不 cancel。
- resume/reconcile 只在原 job 上，核验 owner/source/profile/algorithm/deadline/全部 invocations；用原 generation/task，未知仍hold，过期失败。control 并发用版本 CAS，重复已达同目标的操作自然幂等；明确返回冲突状态，禁止取消被 resume 撤销。无需可覆盖财务状态的管理员/用户接口。
- progress 为真实阶段及已验证/总节点数，未规划时 total=null，不凭估计伪报百分比。查询只 owner 范围、有界列表，可断线后读取。详细文本只在完整候选成功且重新 owner/input/hash 校验后读；候选过期清理不能触发自动重发。正式 overview_results/KB/Review 不写。

## 4. HTTP 与现行文档

优先单一 /api/ai/overview-jobs：POST 启动（scope/source或subject/选定sources、mode=ALL或OUTLINE、instruction、clientRequestId），GET单job/owner-scoped有界list，POST /{id}/pause、resume、cancel、reconcile（带expectedVersion CAS），GET /{id}/candidate。可复用现有 Source/Subject 请求 DTO 的内部验证与解析，但不能信任客户端 user/profile/budget/manifest/节点ID。SUMMARY仍走现行短摘要，不纳入新后台API。具体字段在实施前给主模型核对，不自行新增产品能力。

新增计划登记 docs/README；同步 Backend/API/Database/Architecture/ProductRequirements/Status/Issues/设计/总计划/Changelog。修复 docs/README 当前 adaptive design 条目缺链接目标这一相关文档缺口。保留最终全项目 unused兼容清理gate；此阶段不做全仓清理。OpenAPI运行态artifact和两端生成SDK必须一致，不改端侧业务/UI，故无需Antigravity或前端业务重构。

## 5. 一次集中验证与结束

全部实现/测试/文档候选完成前不运行测试、静态或构建。先做范围、哈希与文档检查，然后在隔离环境中只跑一次后端 `clean package` 全量批次，并在 Maven 命令中加入 `-Dauralis.openapi.export=true`，让同一真实全量测试运行导出测试 profile 的 OpenAPI 文档。该 flag 会让已检入 artifact 对比方法提前返回；这表示跳过对比，不代表 artifact 门禁通过。不得在全量批次前再跑 13 项 OpenAPI focused tests。

全量批次通过后，从候选 workspace 复制运行态 JSON，使用固定版本 openapi-typescript 7.13.0 生成两端 SDK，并单独记录与候选 SDK 文件的字节比较。如果三个正式 artifact（OpenAPI JSON、PC schema、Mobile schema）有变化，先保存其候选旧字节与哈希；收到明确 artifact 同步授权后，只同步这三个文件。随后在 export flag 关闭时，只运行 `OpenApiArtifactTests#checkedInArtifactMatchesTheRuntimeOpenApiDocument`，由该单方法实际确认已检入 JSON 与运行态 `/v3/api-docs` 一致；其它运行态 OpenAPI 语义已由全量批次覆盖。最后核对三个 artifact 的哈希。若将官方脚本拆成准备好的离线生成和字节比较步骤，报告为等价生成/比较步骤，不得称 `scripts/check-openapi.ps1` 已成功运行。

后端全量失败时完整归因；最小修复后只复验受影响失败组，不自动再跑第二次全量。与 API 公有形状相关的 SDK schema/type 影响按单独授权验证；Mobile 已知基线错误单独报告。

所有门禁完成后，只启动一个 6-luna 只读 reviewer 检查正确性、需求、回归、竞态、事务/数据完整性和安全。只修 BLOCKER/IMPORTANT，不处理 OPTIONAL 清理。主 Agent 做最终裁决，再做纯文档状态收尾。分别报告代码、自动验证、部署、真实 Provider 与 GUI 验收；满足适用验证与 review 条件后停止。

合成Provider核心case：enqueue幂等/隔离；两worker只claim一次；断线不停止job；queue/running暂停继续；cancel和dispatch/候选竞争，旧fence失败；全部stage/repair reservation覆盖；上游unknown不重发；同task/deadline恢复；profile/revision变化拒绝；verified checkpoint复用；完整candidate不写正式结果；账号删除级联；新migration clean/upgrade。复用已有证据避免镜像测试。

全部gate后仅一个6-luna只读reviewer，B/I最小修复，OPTIONAL不动；main最终裁决，不重复普通检查。通过后只doc状态收尾，明确源码/自动验证/部署/真实Provider/GUI分别状态，满足Stop Rule即停。

## 主模型 wire 细化（实施前确认）

POST /api/ai/overview-jobs 使用 clientRequestId UUID、scope=SOURCE|SUBJECT、mode=ALL|OUTLINE、instruction。SOURCE仅sourceId；SUBJECT仅subjectId+sourceIds有序UUID清单（去重、1..100），互斥字段校验；不要求客户端提供文件overview正文、不伪造空outline DTO绕过已有验证。服务端计算owner/profile/manifest/budget。queued deadlineAt为明确nullable，首次claim固定；控制expectedVersion为必填正整数。GET详情含真实stage、verifiedNodes和未规划时null的totalNodes、安全错误与必要scope字段；列表有界。candidate仅完整成功且owner/input复核后读；未完成/冲突明确HTTP409或现有安全错误。worker/control/API范围如上，正式发布和PC UI后续。

## 主模型统一门禁顺序细化（基于只读测试事实）

OpenApiArtifactTests 的导出开关在 compare 方法直接return，在export方法写runtime文档，无测试执行顺序依赖。故唯一 backend full clean package 带 -Dauralis.openapi.export=true，运行全部业务/PG/运行态语义并导出新JSON，避免先跑focused13再full。此轮并未比较旧checked-in artifact，不得声称它比对通过。full成功或相关失败组修好后，validator按固定7.13.0生成两SDK，保存三正式artifact当前dirtybytes再同步live，形成单独artifact baseline/manifest；export flag OFF只执行 OpenApiArtifactTests#checkedInArtifactMatchesTheRuntimeOpenApiDocument 实际比对，不重复其它12语义和full。使用官方脚本的真实生成参数/逐字节比对；若拆开执行则准确报告等价步骤，不能声称未执行的整脚本通过。源码候选由实现者冻结，artifact附加候选由validator生成，唯一最终review合看两部分。此项覆盖第5节原“full后独立13测试export”的顺序。

## 实施前确认的 HTTP wire

以下是主模型确认的字段形状，用于消除第 4 节中的字段草案，不增加新的产品能力。`POST /api/ai/overview-jobs` 请求为 `{clientRequestId,scope,sourceId?,subjectId?,sourceIds?,mode,instruction?}`：`SOURCE` 只接收 `sourceId`；`SUBJECT` 只接收 `subjectId` 与 1–100 个有序、去重的 `sourceIds`。不要求客户端复制 Overview 正文或构造空 outline DTO。服务端派生 user、settings profile、source manifest 和 budget。排队时 `deadlineAt` 为 nullable，首次 claim 后固定；所有控制请求带正数 `expectedVersion`。

详情返回实际 stage、verifiedNodes、未规划时为 null 的 totalNodes、安全错误码和必要 scope 字段；列表有界。候选仅在完整成功且 owner/input 再校验后读取；未完成或冲突使用 HTTP 409 或现有安全错误。已 `COMPLETED` 候选的 GET 不再检查执行 deadline，因此首次 claim deadline 过后仍可读取；读取仍检查 owner、请求/source/profile/algorithm snapshot 与现存 payload。超过 deadline 的未完成 job 由 claim、resume 检查或每轮 worker poll 有界 expire（每轮至多一个）转 `EXPIRED` 并撤销旧 generation 授权；`COMPLETED` 不被扫为 `EXPIRED`。按现有 payload 保留策略清除后候选变为不可用，不触发自动重发。正式发布 API 和 PC UI 属于后续阶段。

## 统一门禁顺序的确认

整个源代码与文档候选完成前不运行测试、静态检查、构建或 OpenAPI/SDK 导出。集中 validator 先做 scope/hash/文档核对，再以 `-Dauralis.openapi.export=true` 运行唯一后端 full `clean package`，同一全量运行负责导出测试 profile OpenAPI。该 flag 会令已检入 artifact compare 方法提前 return；这不构成 artifact 比对通过。不得在 full 前运行 13 个 OpenAPI focused tests。

full 通过后，使用固定 `openapi-typescript 7.13.0` 生成 PC/Mobile schema，分别比较并记录。若正式 OpenAPI JSON 或 SDK schema 需要同步 live，先保存对应旧字节与哈希，并按主模型确定的 artifact 授权流程操作。之后关闭 export flag，只运行 `OpenApiArtifactTests#checkedInArtifactMatchesTheRuntimeOpenApiDocument` 对运行态 JSON 做实际逐字节契约比对。若拆分官方脚本生成步骤，报告为等价生成/比较，不得写成官方脚本成功。失败时完整归因并只复验修复所影响的失败组，不因 harness 捕获问题重复 full。

以上章节记录批准的设计与执行顺序，实际完成状态、验证证据与未覆盖边界见下方 M3.3 结案记录。最终全项目 unused-compatibility cleanup gate 保留至后续整合，本阶段未做全仓清理。

## 6. M3.3 交付与验证结案（2026-10-22 HKT）

### 结果与边界

M3.3 源码、相关自动验证和唯一只读审查完成；未部署。已实现 owner-scoped 持久 jobs、bounded worker/claim、lease/fence、固定 deadline、progress、pause/resume/cancel/reconcile、精确 generation invocation lineage 与 private candidate。完整候选只在 owner、请求、source/profile/algorithm identity 再校验后读取，不自动发布到 overview_results、KB 或 Review。M3.4 正式发布与分节预览、PC UI 后续阶段和 M4–M6 不在本阶段完成范围。最终全项目 unused-compatibility cleanup gate 保留至后续整合。

coordinator/job 的 raw budget_task_id 保持原始预算 UUID。真实账本 task ID 由既有 Guard 算法派生：UUID.nameUUIDFromBytes((userId + ":" + feature + ":" + rawBudgetTaskId).getBytes(UTF_8))。invocation journal 与 reservation 保存真实 ledger task ID；预算、额度、结算和安全重试继续沿用 raw budget task 的既有语义。派发后 usage 未知、invocation 缺失/错配仍 fail-closed 并 hold，不会被恢复流程或用户重试视为安全。cancel 不能确认撤回已发给 Provider 的请求。

### 自动验证

- 首次真实 backend full：131 XML / 752 tests / 724 passed / 19 failures / 9 errors / 0 skipped。之后相关失败组 67 tests / 61 passed / 1 failure / 5 errors / 0 skipped；五个相关 suite 通过。最后只对六个失败方法与一个 unknown-usage 负向方法复验，7 tests / 7 passed / 0 failures / 0 errors / 0 skipped，Maven native exit 0。外层 Docker runner exit 2 源自 wrapper 脚本 CRLF 污染最终 shell exit 参数；Maven 输出、退出码和 fresh XML 均成功。相关失败项均通过受影响组复验，但修复后未再次运行 full suite，不声明 full suite 全绿。
- -DskipTests package：Maven/Docker exit 0。JAR 为 93,372,456 bytes，SHA-256 efd0911f72c05c1ff8678706beab18daf9ada1a7638393300792c6000e85f234，包含 job/journal class 与 V36 migration。运行态 OpenAPI JSON SHA-256 bc5f6b57357d8b8c24ccbbc0fececc351362cdb0358d49de285c7d6bdc0b177f；两端使用固定 openapi-typescript@7.13.0 离线生成，SDK SHA-256 均为 bed903a8fcee8727fc61dbdbc9622414a457be2e6e434702b45928006ea3c742。checkedInArtifactMatchesTheRuntimeOpenApiDocument 单方法 1/1、Maven/Docker exit 0。未运行官方完整 scripts/check-openapi.ps1。
- PC npm run type-check exit 0。Mobile type-check exit 2，只有既有 EventRequest 与 EventResponse 两个 TS2339；本阶段未改其业务或 SDK 兼容代码。
- 唯一 reviewer 最终报告：BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0；SHA-256 d6495d0714a513d3c5ec08de0e85bec1d7d4b58dd1e9fa5eee452f655aa59ab0。

### 证据路径

完整验证摘要：D:/Temp/auralis-overview-m33-background-20261019/run/m33-final-validation-20261022.md。唯一审查：D:/Temp/auralis-overview-m33-background-20261019/reviewer-final-report.md。修订 candidate evidence：D:/Temp/auralis-overview-m33-background-20261019/candidate-backend-reconciled-20261022/；原 candidate-backend-final/ 保留为未修订证据，其两处 unknown-before gap 未伪造或替换。

### 未覆盖验收

没有部署或更改运行环境；没有真实 Provider 调用、生产/业务数据库迁移、GUI/真实用户流程或内容质量验收。隔离 PostgreSQL 自动验证不等于业务数据库验收。本阶段未使用 Antigravity 进行前端业务实现；M3.3 gate 的自动证据不替代这些后续验收。

### M3.4 frozen-correctness follow-up (2026-10-22; source candidate only)

Static review for M3.4 found one necessary M3.3 seam fix: `OverviewGenerationService.snapshotForJob` canonical request hash built `List.of(scope, scopeId, sourceId, subjectId, sourceIds, ...)`; legal SOURCE and SUBJECT request shapes set different list elements to null, so the actual hash path throws `NullPointerException`. M3.4 changed only the null-hostile container to an order-preserving null-tolerant list and added actual SOURCE/SUBJECT snapshot-path regressions without Provider calls. No legacy hash fallback was added. The correctness follow-up passed as part of M3.4 source, related validation and review; prior M3.3 verification above remains historical.

Current follow-on status: M3.4 formal publication and verified section preview are closed for source, related automated validation and sole review, but not deployed. See [M3.4 plan and validation boundary](2026-10-22-overview-m34-publication.md). PC consumer/GUI and M4–M6 remain open.

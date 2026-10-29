# 学习 Agent 实施计划

> 2026-10-29：本文的 Chat 实施入口已由[Chat Agent 与流式可视化教学计划](2026-10-29-chat-agent-visual-teaching.md)接替。下文保留原计划与当时前置证据，不再执行学习专属任务；当前任务以新计划的范围、协议、LangChain4j 接线及验收为准。新功能尚未实施。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 在现有 PC AI 面板实现沿大纲或自由目标的可恢复交互带学，并以可编辑、可安全重试的知识块完成本节，衔接现有正式学习/复习。

**Architecture:** 模型接入依赖[统一限额独立方案](2026-10-16-ai-unified-limits.md)，学习只声明操作用途并消费统一 Gateway。应用管理目标、步骤、授权、资料读取与持久状态；一次模型响应提供教学内容。新增 learning 领域依赖 ai 的公开能力，ai 不反向依赖 learning；KB 复用 PC 本地 outbox/Core Sync。

**Tech Stack:** 现有 Java 21 / Spring Boot / Spring Modulith / JPA / Flyway / PostgreSQL，Vue 3 / Pinia / TypeScript / Tauri SQLite，现有 AI Gateway、marked/DOMPurify；不为一期增加 Agent 框架或渲染依赖。

日期：2026-10-16；2026-10-19 状态补充：Learning Agent 尚未实施。Task 1 所依赖的 Overview 稳定身份与可信原文关联能力已实现并完成相关验证与复审；这只交付稳定 ID/version 与来源快照契约，不代表 Learning 会话、进度、服务或交互已实现。依据：[修订设计](../design/2026-10-16-learning-agent-design.md) 与 [Overview M2 计划](2026-10-19-overview-m2-identity-provenance.md)。下文学习专属任务仍未勾选；历史测试结果均为计划预期，不是本轮运行结果。

## 全局约束

- 范围：PC Tauri + 后端；Mobile/Tablet 本期不新增学习入口，生成 SDK 随 API 一致更新。
- 保留当前脏工作树和 frozen 行为；每项只修改列出的功能挂接点，不重构整体 SubjectWorkspace、Overview、Chat、Sync 或 Review。
- 保持当前配置：Chat 默认 2 calls/task、TopK 8、excerpt 400 Java 字符、prompt 12000 Java UTF-16 字符；取实际配置更小边界，不提高 Guard 或 admission 限额。
- 数值和计量规则归[统一限额方案](2026-10-16-ai-unified-limits.md)；本计划后文的教学 2 / 草稿 1、上下文 12000 是消费端初始值与验收基线，学习不复制限额判断。
- 平台提供模型执行平台额度/任务预算，用户 BYOK 只计量并保留共有运行保护；一期教学/草稿调用形态属于共同协议。来源由设置服务按每次实际凭据确认，同 task 可混合平台 embedding 与 BYOK completion。usage 分来源汇总，不能用平台窗口耗尽拒绝 BYOK；本计划不新增模型切换或 BYOK embedding 配置。
- 模型不 function-call；补查 0 Provider；教学一次 embedding + 一次 completion；草稿独立一次 completion，无摘要/结构修复 completion。
- 单会话一个在途生成；提交不排队。重放同操作不能新收费，显式新尝试才创建新 task，原调用未实际退出前不得再次生成。
- 数据及消息按 owner 隔离，保持 subject/source/READY/active/generation/revision；来源不可信，活动白名单，外链图片禁止。
- UI 同时呈现本机保存、同步、关联结果；不能拿本地保存当作服务端完成。教学与 KB 创建不写正式 Review 状态。
- 实施执行者沿用已确定的 6-luna；前端由执行者按 AGENTS 管理 Antigravity MCP。本轮计划由主模型编写。普通检查不重复，多阶段结束后一个独立只读 reviewer，必要高风险裁决由主 Agent 负责。
- 每任务完成编辑后统一一次相关检查；新增 API/数据、鉴权/并发阶段合并后做全量测试与构建。日志、Maven 临时目录与证据放 D 盘；不得启动无上限重放或把大日志写回 C 盘。

## 已核实的前置依赖

| 依赖 | 结论及落点 |
| --- | --- |
| 大纲节点 ID/版本 | 不存在；只有整体 outlineVersion。Task 1 必须先实现，后续不能拿临时编辑 ID 关联进度。 |
| KB 幂等 | 普通 POST 不支持；PC 的稳定 resourceId + clientMutationId + Core Sync 重放存在。Task 6 复用此路径。 |
| Review 入池 | KB create 不入池，查询不合成无状态记录。Task 6 只给现有正式学习/复习入口。 |
| 关键词/邻接 | 无现成通路；Task 3 新增受范围围栏的数据库读取。query-aware excerpt 只用于已召回文本选窗口。 |
| 消息与 SSE | READING_SESSION 24h 清理，现有消息无证据快照，Chat delta 不做教学 JSON 校验；Task 2/4/5 新增专用用途和整轮结果协议。 |
| usage 累计 | 现有额度查询是窗口，普通 scope 的 task_id 并非由 taskKey 稳定生成；依赖统一方案新增用途字段和 taskId 读取口，Task 4 持久绑定实际 ID 后汇总。 |
| 跨功能统一限额 | 由[独立方案](2026-10-16-ai-unified-limits.md)负责；学习模型接入前消费 U1–U3 实现及 U4 代码/自动验证结果，不承担其他功能的接入改造。 |

只读证据：[前置核对报告](D:/Temp/auralis-learning-agent-design-20261016/prerequisites-report.md)。关键现行签名：

```java
// ai.usage，现有
record AiTaskContext(UUID userId, AiFeature feature, String taskKey, UUID budgetTaskId) {}
AiTaskScope AiInvocationGateway.beginTask(AiTaskContext context);
// scope 是 AutoCloseable；调用走 scope.embed / scope.complete，不能绕过直接访问 Provider
// knowledge，现有：Sync 对稳定 resourceId 使用第二个入口
KnowledgeBlockView create(UUID userId, KnowledgeBlockCommand command);
KnowledgeBlockView create(UUID userId, UUID blockId, KnowledgeBlockCommand command);
```

```ts
// PC，现有
addBlock(block: Partial<KnowledgeBlockModel> & { title: string; subjectId: string }): Promise<string>
commitMutation<T>(input: LocalCommitInput<T>): Promise<LocalEntity<T>>
```

## 共用数据与交互契约

本节命名是拟新增契约，实施时写入 API/Database 与生成 SDK；不是现行 API。

```ts
type GoalStatus = 'OPEN' | 'COMPLETED' | 'ABANDONED'
type SessionStatus = 'ACTIVE' | 'PAUSED' | 'FINISHING' | 'COMPLETED' | 'ABANDONED'
type FinishPhase = 'DRAFT_GENERATING' | 'DRAFT_FAILED' | 'DRAFT_READY'
  | 'KB_PENDING_SYNC' | 'KB_CONFLICT' | 'LINK_PENDING'
type NextAction = 'CONTINUE' | 'REEXPLAIN' | 'HINT' | 'CHANGE_EXAMPLE' | 'PROPOSE_FINISH'
type OperationPurpose = 'TEACH' | 'DRAFT'
type OperationStatus = 'ACCEPTED' | 'GENERATING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN' | 'CANCELLED'
type SourceFence = { sourceId: string; ingestionRevision: string; generation: string }
type OutlineBinding = { overviewResultId: string; nodeId: string; contentVersion: number }
type CommandEnvelope = { requestId: string; expectedVersion: number }
type TurnSubmission = CommandEnvelope & {
  stepId: string | null; stepVersion: number | null;
  action: 'START' | 'ANSWER' | 'ASK' | 'HINT' | 'CHANGE_EXAMPLE' | 'SKIP';
  answer: string; activityResult: Record<string, string | number | boolean | string[]>
}
// 首轮 stepId/stepVersion 为 null；其余必须指向当前步骤。
```

每步 ID 由应用在请求前生成。模型输出 schemaVersion=1、feedback、explanation、question、evidenceIds、keyPoints、activity、diagram、nextAction；不接受 stepId/owner/toolCall/URL 图片字段。question 为可空字符串，最多 800 字符；有活动时必须非空，作为界面题干及下轮完整当前问题的唯一来源，不从讲解文字猜题。无问题步骤禁用 ANSWER，仍可追问/继续。keyPoints 最多 3 条、每条最多 120 字符，与证据 ID 一起校验；供同一次 completion 顺带记录要点，避免后续额外摘要调用。实际活动采用 Task 5 的 discriminated union。

| 新接口 | 参数与结果 | 幂等/冲突 |
| --- | --- | --- |
| POST /api/learning-sessions | requestId、subjectId、goal、Source 范围、可空 OutlineBinding；返回 session 快照 | owner/requestId 同内容回放；校验已同步节点与当前来源。 |
| GET /api/learning-sessions/{id} | 会话、当前步、完成阶段、操作状态、关联；历史分页，单页最多 50 | owner 隔离；无自动模型调用。 |
| POST /api/learning-sessions/{id}/turns | TurnSubmission，SSE accepted/heartbeat/result/error | 同键同内容回放；不同内容/旧版本/另一在途请求 409。 |
| POST /api/learning-sessions/{id}/state | envelope + PAUSE/RESUME/ABANDON/CHANGE_GOAL/BIND_NODE/CANCEL_FINISH；目标/关联参数 | 版本检查，放弃由 UI 明确确认；0 Provider。 |
| POST /api/learning-sessions/{id}/drafts | envelope、已选步骤/固定要点 ID（最多 8）；SSE draft/error | 持久 FINISHING 和固定完成意图；1 completion。 |
| PUT /api/learning-sessions/{id}/completion | envelope、draftId、kbId、kbVersion、contentHash | 只关联已同步且 owned/active 的 KB，不创建 KB；完成记录+目标/会话/节点事务一致。 |
| GET /api/learning-sessions/{id}/usage | 分用途/task 的累计 actual/unknown/charged/reserved | 只读、owner 过滤、唯一任务聚合；未知不作 0。 |

操作 requestId 对应 taskKey `learning:{sessionId}:{operationId}`，唯一性在 owner 下持久化；操作另存 Gateway 实际分配的 usageTaskId，在任何 Provider 派发前确认绑定提交成功。HTTP 重放只读原回执与 task_id，不再次 beginTask；显式重试使用新 requestId/operationId 并保存 retryOf。失败响应后同 ID 重放仍返回原失败，不偷偷重试。结构错误/Guard 拒绝/已派发失败分别记录，不混为一个“未收费失败”。

## 外部依赖：统一 AI 限额方案

统一操作策略、Guard/Gateway 接入和跨功能额度验收由[AI 统一限额与用量治理方案](2026-10-16-ai-unified-limits.md)独立负责。本计划只消费其 AiOperationKind、有效 AiOperationPolicy 和现有 Gateway；模型接入前须完成 U1–U3 实现并通过 U4 的代码/自动验证门禁。部署、真实 Provider 和 GUI 验收另行记录，不作为学习代码开发前置。

Task 1/2 的节点身份和纯持久状态可独立推进；Task 3/4/6 接入已提供的策略与第五字段 AiTaskContext，不实现本地替代限额。学习只声明 TEACH→LEARNING_TURN、DRAFT→LEARNING_DRAFT 和稳定 taskKey，budgetTaskId 为 null；派发前绑定实际 scope.taskId，中央 ledger 同时记录 operation_kind。以下 migration 暂占 V34/V35，V33 留给统一账本用途；实施前按实际合并顺序统一分配，不能改已应用迁移。

### Task 1：持久大纲身份（阶段 A 的前置）

**Files — 修改：**

- Server `src/main/java/com/auralis/app/ai/OverviewResultCommand.java`、`OverviewResultView.java`、`OverviewResultService.java`、`internal/persistence/OverviewResultEntity.java`。
- PC `src/services/overviewRepository.ts`、`overviewResultsSyncService.ts`、`src/views/SubjectWorkspace/index.vue`，限身份初始化/编辑序列化/重生成挂接。
- 契约 `docs/contracts/API.md`、`Database.md`，模块 `FrontendPC.md`、`Backend.md`。

**Create：** Server `ai/OutlineIdentity.java`、`OutlineIdentityService.java`、`db/migration/V34__overview_outline_identity.sql`；PC `src/services/outlineIdentity.ts`；Server `OutlineIdentityTests.java`、`OverviewOutlineIdentityPostgresTests.java`；PC `scripts/r4-outline-identity.test.mjs`。后端 Java 路径均位于 `src/main/java/com/auralis/app/`，测试位于 `src/test/java/com/auralis/app/`。

**Consumes:** 当前 OverviewResultCommand/View、现有 baseVersion/clientWriteId 收据。
**Produces:** 结果 DTO 独立属性 outlineIdentity；`{schemaVersion:1,nodes:[{nodeId,path,contentVersion,contentHash}]}`，不改变 Provider 的 OverviewDtos 输出 schema。

- [ ] 先添加用例：保存/重读后 ID 一致；章节/小节重排不变；实质文本/sourceIds/locator 改变增加版本；重生成获得新 ID；重复/跨结果 ID 拒绝；旧大纲初始化、PUT 冲突和 summary-only 更新不损坏身份。用例表达当前缺口；未实际执行不能声称取得 RED 证据，不在编辑中反复跑。
- [ ] V34 只为 overview_results 增加可空 `outline_identity_json TEXT`。旧结果保留 null/identityReady=false；用户首次学习操作触发初始化保存并等同步，未同步前禁用进度绑定。不静默按下标/标题回填已有完成记录。
- [ ] 实现身份规则：应用生成 UUID；section hash 对 title/summary/有序规范化 sourceIds/locator 计算 SHA-256；chapter hash 包含 title 与按 nodeId 排序的子节点 ID/hash，排除展示顺序。服务端根据旧身份与内容重新计算版本，不相信客户端自报 hash/version。
- [ ] `OUTLINE/ALL` 更新携带覆盖全部节点的身份元数据；`SUMMARY` 不改变身份。PC 重排移动身份一起移动；手工新增/重新生成分配新 ID。保存序列化不能再剥离身份。旧无身份结果先显式初始化，其余写入缺失/不完整身份拒绝，更新两端 SDK 与写入方。
- [ ] 完成后统一验证：Server `./mvnw.cmd -B -ntp '-Dtest=OutlineIdentityTests,OverviewOutlineIdentityPostgresTests' test`；PC `node --experimental-strip-types --test scripts/r4-outline-identity.test.mjs scripts/r4-overview-sync.test.mjs scripts/r4-subject-overview-ui.test.mjs`，再类型检查。预期 ID/版本/owner/CAS 用例全部通过，PostgreSQL 前置不满足不能报通过。
- [ ] 定向检查通过后仅提交本任务文件；在已有脏文件上按任务差量提交，不把既有改动一起纳入。

### Task 2：目标、会话、步骤、回执与清理（阶段 A）

**Create：** Server `learning/LearningSessionService.java`、`LearningSessionController.java`、`LearningDtos.java`、`LearningStateMachine.java`、`LearningCleanupService.java`；`learning/internal/persistence/` 下 `LearningSessionEntity/Repository`、`LearningStepEntity/Repository`、`LearningOperationEntity/Repository`、`LearningEvidenceEntity/Repository`、`LearningCompletionEntity/Repository`；`V35__learning_sessions.sql`；`LearningStateMachineTests.java`、`LearningSessionPostgresTests.java`、`LearningCleanupTests.java`。

**Modify：** `ai/ConversationPurpose.java`、`ConversationService.java`、`AiController.java`、`AiStreamingService.java`，限新 purpose 的普通读写入口防护；新增 `ai/LearningConversationPort.java`（ai 内实现访问现有消息仓储）、`identity/AccountDataCleanupParticipant.java`、`learning/LearningAccountCleanupParticipant.java`；`identity/AccountDeletionCleanupService.java`、相关账号清理集成测试；API/Database/Backend/Architecture。Conversation V16 的 purpose/source CHECK 在 V35 扩为 GENERAL、READING_SESSION、LEARNING_SESSION，后两者中只有 READING_SESSION 要求 sourceId，学习用途为 null，范围放会话表。

**Consumes:** Task 1 的已同步身份；当前已认证 owner、Source/Subject 授权与删除事件。
**Produces:** 本文共用 DTO、会话/状态接口；`LearningConversationPort` 提供创建学习用途会话、owner 校验的用户/assistant 消息追加、删除学习消息，返回现有消息 ID；learning 不直接 import ai 的 internal entity/repository。

- [ ] 添加状态与持久回放用例：OPEN/ACTIVE→FINISHING→COMPLETED，PAUSED/resumeState，DRAFT_FAILED 恢复，自由完成 node=null，重复键/不同内容拒绝、过期版本拒绝、两实例并发只接受一项、跨 owner/source/节点拒绝。
- [ ] V35 建立五类表：session 存目标/版本/状态/恢复点/来源快照；step 存稳定 ID/序号/用户与 assistant 消息 ID/活动最终值；operation 存 requestHash/taskKey/可空 usageTaskId/retryOf/status/lease；evidence 存来源类型/Source revision/generation/摘录；completion 存 draft/固定 KB ID/保存意图/关联版本。owner 外键及唯一(owner,requestId)、唯一(session,ordinal)、唯一 operation.taskKey、唯一(owner,usageTaskId)。用户答案正文只在 user message 保存；学习 assistant message.content 存唯一 canonical JSON（已校验的反馈/讲解/活动），step 不复制全文；证据摘录只在 evidence 保存。学习读取口负责解释此格式。
- [ ] 在 session 行锁/版本下登记 inFlightOperationId；Provider 请求不在数据库事务里。实体验证所有外来关联 owner；节点实质变更后旧完成仍留历史，新节点版本为未完成。
- [ ] 状态读与已完成步骤分页，不把全部历史塞 prompt。放弃保留历史；目标更改创建版本。恢复只恢复数据，不触发模型。READING_SESSION 清理严格保持原用途筛选。
- [ ] 普通 `GET /api/ai/conversations` 排除 LEARNING_SESSION；普通 `GET /api/ai/conversations/{id}` 对学习用途拒绝读取，不能通过 ConversationView.messages 暴露 canonical JSON。普通创建/消息生成/修改/删除同样拒绝。AI 模块按 purpose 防护，不反向调用 learning；LearningConversationPort 提供专用创建/读写，学习接口解码结构。增加普通 list/get/POST 绕入被拒和学习端口正常工作的用例。
- [ ] 接 Subject/Source 软删除：隐藏/冻结会话、使未提交结果失效。本期无独立 Source 硬删 API；evidence 的 source FK 使用 RESTRICT，硬删维护先通过 LearningCleanupService 清关联摘录、用户正文和复制消息，否则拒绝物理删除。本地删除投影由 Task 5 清缓存。
- [ ] 账号清理端口归 identity：`AccountDataCleanupParticipant.purgeOwnedRows(UUID userId)`；learning 实现只清自己的表，幂等且不调用需要 ACTIVE 账号的普通业务服务。identity 的现有 job 注入端口列表，在删除 Message/Conversation/Source 前调用，再沿现有顺序清余下数据和用户。identity 不 import learning；参与者不依赖 AI Service/IdentityService，避免静态与 Bean 构造环。ArchitectureTests 检查 learning→ai→identity 单向依赖，真实账号清理测试证明先后与回滚。
- [ ] 统一验证：`./mvnw.cmd -B -ntp '-Dtest=LearningStateMachineTests,LearningSessionPostgresTests,LearningCleanupTests,AiConversationServiceTests,AccountDeletionCleanupPostgresIntegrationTests,ArchitectureTests' test`。预期会话回放、真实 PG 并发/回滚和清理通过；H2/Mock 不能替代 PostgreSQL 锁行为。
- [ ] 提交任务差量。Task 1/2 完成只代表身份/状态基础，不开放“带学已可用”入口。

### Task 3：非 embedding 补查与有界上下文（阶段 B 前置）

**Create：** `ai/LearningRetrievalService.java`、`LearningPromptAssembler.java`、`LearningPromptInput.java`、`LearningPromptResult.java`、`LearningContextLimitException.java`；`LearningRetrievalTests.java`、`LearningPromptAssemblerTests.java`、`LearningScopedRetrievalPostgresTests.java`。
**Modify：** `ai/retrieval/PgVectorRetrievalRepository.java`、`ai/internal/persistence/SourceChunkRepository.java` 仅增加 scoped 字面/邻接方法，原 RetrievalService/普通 Chat 行为保持。

**Consumes:** 统一限额独立方案的有效字符/请求策略、现有一次 query embedding 的初检结果、Task 2 SourceFence、用户明确 focus。
**Produces:** `LearningPromptResult(List<AiProviderRequest.Message> messages, List<String> includedEvidenceIds, List<String> omittedStepIds, int promptChars)`；`assemble(LearningPromptInput input, AiOperationPolicy effectivePolicy)` 明确接收服务端解析的策略；只有 includedEvidenceIds 能作为本轮模型依据。

- [ ] 用合成资料写断言：0 hit + focus 才查关键词；无 focus 空 hit 不补；命中内选窗口不重复 embedding；邻接只 ordinal±1/同活动 generation；focus 缺失补查仅一次；owner/subject/显式选择/READY 过滤先于 TopK；所有路径 embedding 计数≤1。
- [ ] 查询方法显式收 userId、subjectId、sourceIds、revision/generation 与上限；关键词用绑定参数字面匹配，不拼 SQL。scope 过滤后 limit≤TopK；邻接最多 2 行；单查询超时 1000ms，失败明确返回检索错误，不当作无资料。读取窗口沿现有有界片段规则，不扫描/回传无限正文。
- [ ] Focus 使用选区/引号术语，或确定性前后缀匹配，长于 32 Unicode 字符则不推断。补查条件和分支精确按设计表，无相似度“置信度阈值”。
- [ ] 上下文内容按 3200/1800/2500/3500/1000 的初始分配：固定协议、当前目标/问题、完整答案、证据、历史。总上限从独立方案提供的有效策略读取，不另定义 12000 常量；配置更小则按必需块/裁剪规则收紧。先清旧历史/重复段，再整段移除低优先证据；必需块超限返回 LEARNING_CONTEXT_LIMIT，0 Provider。对 UTF-16 裁剪保留完整 surrogate pair。
- [ ] 编写可执行边界断言：

```java
// LearningPromptAssemblerTests：每个参数化 fixture 从中央配置构造 resolver/完整输入
var effectivePolicy = policyResolver.resolve(AiOperationKind.LEARNING_TURN);
var result = assembler.assemble(input, effectivePolicy);
assertThat(result.promptChars()).isLessThanOrEqualTo(effectivePolicy.maxPromptChars());
assertThat(result.includedEvidenceIds()).doesNotContain(omittedEvidenceId);
assertThatThrownBy(() -> assembler.assemble(inputWithAnswerOver2500, effectivePolicy))
    .isInstanceOf(LearningContextLimitException.class);
// 验证这条异常发生在 AiInvocationGateway.beginTask/embed/complete 之前。
```

- [ ] 参数化中央 prompt 配置为 6000 与 12000 的 fixture，验证同一个 assembler 分别服从有效策略，业务无默认值回退。补充长会话测试：100 轮存储完整但 prompt 只取最近 2 轮；当前答案原样在内；schema 自身超限失败；不同来源标签正确；恶意片段始终在非指令数据区。草稿从最多 8 个已选要点确定性裁剪，输出省略清单供 UI 确认，不额外摘要。
- [ ] 统一验证：`./mvnw.cmd -B -ntp '-Dtest=LearningRetrievalTests,LearningScopedRetrievalPostgresTests,LearningPromptAssemblerTests,AiRetrievalTests,PromptAssemblerTests' test`，预期原 query-aware excerpt 冻结用例及新边界一起通过。提交本任务差量。

### Task 4：有 Guard 的教学生成、结构校验、SSE 与 usage（阶段 B）

**Create：** `ai/LearningAiService.java`、`LearningAiRequest.java`、`LearningAiResult.java`、`LearningOutputValidator.java`、`LearningOutputSchema.java`；`learning/LearningGenerationService.java`、`LearningSseAdapter.java`；`LearningAiBudgetTests.java`、`LearningOutputValidatorTests.java`、`LearningGenerationPostgresTests.java`、`LearningStreamingControllerTests.java`。
**Modify：** Task 2 Controller/Service、`ai/usage/AiUsageQueryService.java`（消费中央 owner+task_id 查询，新增会话汇总适配，不改 reserve 算法）；API、Backend。ai 的新门面类型均定义在 ai，不能 import learning DTO 形成反向依赖。

**Consumes:** 独立方案提供的统一操作策略；Task 2 持久操作与消息端口；Task 3 输入/实际证据清单；当前 Provider 配置解析与 Gateway。
**Produces:** 教学 SSE 与完整已校验轮次；会话 usage 按唯一已绑定 usageTaskId 去重，actual 未知数量、charged exposure、reservation 分开返回。

- [ ] 添加计数测试：TEACH 最多 embed1+complete1，补查不调用模型；无 embed 的第二次 complete 仍被中央 stage cap 拒绝；相同 requestId 回放 0 新调用；Guard 拒绝不派发；无 embedding 配置明确失败；draft 计数在 Task 6 覆盖。未知 usage 不能补 0，取消/失败仍按原 Gateway 结算。
- [ ] 教学请求先本地校验所有必需输入可容纳，再登记操作；scope 只创建一次：

```java
static AiTaskContext learningTask(UUID userId, UUID sessionId, UUID operationId,
        AiOperationKind operationKind) {
    return new AiTaskContext(userId, AiFeature.CHAT,
            "learning:" + sessionId + ":" + operationId, null, operationKind);
}
```

- [ ] 输出 strict schema：schemaVersion=1；feedback/explanation 有界；question≤800且有活动时非空；evidenceIds 必须是实际入模 ID 子集；keyPoints≤3且每条≤120；activity 与 diagram 按 Task 5；nextAction 枚举。拒绝未知工具请求和应用 ID，模型不得改变会话/步骤版本。无证据不允许伪造引用。
- [ ] 生成过程：①短事务登记 requestHash/taskKey/输出 stepId/lease；②ai 门面 beginTask，通过 ai 定义的回调把 scope.taskId 在短事务内按 owner/operation/sessionVersion CAS 绑定为 usageTaskId；确认提交成功后才在事务外进行 embed/complete 与校验；③短事务重新核对账号仍可用及 session/step/source fence，追加反馈和新消息/步骤、完成操作、释放在途。绑定失败或提交结果未确认时先读持久结果，仍未确认则关闭 scope、0 Provider；绑定后崩溃可按实际 ID 查账，不重新分配 task。不把生成期间的数据库锁作为取消手段。
- [ ] SSE accepted 返回 operationId 与版本；心跳不夹正文。原始 JSON 不做 delta 投影。校验成功后唯一 result；交互不合法但正文/引用有效时由服务端确定性降级，核心无效则 error。失败不调用模型修复，客户端不自动重试。
- [ ] 暂停/来源变更立即提高 session 代次；旧调用结束后只结算/释放、不推进。重启后 lease 过期先核对账本，结果不能确认记 UNKNOWN；不自动再次派发。显式重试需新 attempt，不能把旧在途操作换 taskKey 逃过并发。
- [ ] usage 按本会话已验证 operation.usageTaskId 集合及 owner 查账本，核对学习 Kind，按 credential_source 分平台/BYOK/历史未知；不接受客户端任意 taskKey/task_id/source。平台 remaining 与全来源 actual/unknown/charged/reserved 分开展示；未绑定无派发不伪造 actual=0。覆盖绑定前后崩溃、回放不 beginTask、跨 owner/重复 ID、混合来源与平台额度耗尽但 BYOK 可用。该接口从本阶段供 Task 5 展示，阶段 D 验收，不与缓存相加。
- [ ] 统一验证：`./mvnw.cmd -B -ntp '-Dtest=LearningAiBudgetTests,LearningOutputValidatorTests,LearningGenerationPostgresTests,LearningStreamingControllerTests,ChatAiExecutionSafetyTests,ArchitectureTests' test`，预期 2-call cap、结构和真实 PG 并发/取消围栏通过。提交差量。

### Task 5：PC 双入口、恢复与安全交互（阶段 B/C）

**Create：** PC `src/api/useLearningApi.ts`、`src/services/learningSessionRepository.ts`、`learningStream.ts`、`learningContextCommand.ts`、`learningActivity.ts`、`src/store/useLearningStore.ts`；组件 `src/components/learning/LearningPanel.vue`、`LearningActivity.vue`、`LearningDiagram.vue`、`LearningMarkdown.vue`、`LearningUsage.vue`；测试 `scripts/r4-learning-session.test.mjs`、`r4-learning-activity.test.mjs`、`r4-learning-security.test.mjs`。
**Modify：** `SubjectWorkspace/index.vue` 的 AI 面板/大纲继续入口，`components/subject/FileOutlineList.vue` 的进度投影，`services/localDb.ts` 的学习仓储接入和既有登出/删除清理挂接；`package.json` 只登记新增测试。复用 `localDatabaseRuntime.ts` 的现行单连接，不更换 runtime、不另建数据库。更新 FrontendPC/Frontend。

**Consumes:** 共用 DTO/生成 SDK，Task 4 SSE、Task 1 身份和当前账号/device/session 代次。
**Produces:** 可恢复学习面板和声明式活动；完整答案/最终值自动带入下轮。

```ts
type Activity =
  | { kind: 'single'; options: { id: string; label: string }[] }
  | { kind: 'multi'; options: { id: string; label: string }[] }
  | { kind: 'order'; items: { id: string; label: string }[] }
  | { kind: 'match'; left: { id: string; label: string }[]; right: { id: string; label: string }[] }
  | { kind: 'slider'; min: number; max: number; step: number; initial: number }
  | { kind: 'toggle'; label: string; initial: boolean }
  | { kind: 'text'; maxLength: number }
// 选项/配对每边≤8；字符串 label≤120；slider 都是有限数，min<max、step>0且值在区间。
// 图节点≤12、边≤24，edge 端点必须存在；标签≤120，不含 HTML/SVG/URL。
```

- [ ] 先写行为测试：提交包含原题/完整答案/最终活动值、在途禁用第二次操作、同 ID 重放、切账号忽略旧流、暂停恢复 pending 输入与当前题、自由学习无自动关联、没有节点身份时先初始化等待同步。
- [ ] Store 只保留 UI 投影；本地学习 cache 按 owner/device/session 隔离，使用现有单连接事务保存已提交快照与未提交草稿，不扩五类 Core Sync。重新进入 GET 权威快照后比较版本；离线仅恢复本机记录，不自动发模型请求。网络错误不紧密轮询/重复 toast。
- [ ] 生成中禁用提交和目标/范围更改；允许本地编辑草稿、暂停/取消。所有结果绑定账号票据+sessionId+stepId+version；应用只接受完整 result，不显示原始半截 JSON。丢失终端事件时只 GET 状态恢复，不重新 POST 生成。
- [ ] 活动组件只按 union 渲染 Vue 元素；拖拽/滑块/开关变化本地保存，提交或“解释当前结果”才请求模型。只创建有界 SVG/DOM 图形，不执行模型脚本。
- [ ] LearningMarkdown 使用当前 renderMarkdown 的净化结果，再移除 img/iframe/object/原始 HTML；仅应用自己的本地资源组件可显示受管图。链接协议检查并确认外部跳转；恶意 source 文本与回答不能突破。保留现有普通 KB/Chat 渲染行为。
- [ ] 一并显示 session 累计 actual/unknown/charged/reserved、用途和安全拒绝信息；无值/加载失败不能显示 0。完成/取消后的用量刷新是只读，不触发生成。
- [ ] 由 6-luna 执行者按 AGENTS 委派 Antigravity：先提交计划，只允许本任务 PC 文件，禁改后端/契约/密钥。回收后看完整 diff、依赖、删除与跨目录写入，检查不合格项后统一验证。
- [ ] 命令：`npm.cmd run type-check` → `node --experimental-strip-types --test scripts/r4-learning-session.test.mjs scripts/r4-learning-activity.test.mjs scripts/r4-learning-security.test.mjs scripts/r4-ai-stream.test.mjs scripts/r4-reading-session.test.mjs`。预期行为与安全断言全过。当前任务相关文件未变则后续不重复同一套检查。提交差量。

### Task 6：草稿 AI、KB 幂等桥接与完成关联（阶段 C）

**Create：** Server `learning/LearningCompletionService.java`、`LearningDraftService.java`；PC `src/services/learningCompletionService.ts`、`src/components/learning/LearningDraftReview.vue`；测试 `LearningDraftBudgetTests.java`、`LearningCompletionPostgresTests.java`、PC `scripts/r4-learning-completion.test.mjs`。
**Modify：** Task 2/4 的 DRAFT/finish 状态端点、Task 5 Store；`src/store/useKnowledgeStore.ts` 仅增加可选固定创建意图参数，不改普通调用默认语义；API/Database/Backend/FrontendPC/Frontend。

**Consumes:** 已校验步骤要点、有效证据、现有知识块编辑器与本地 outbox。
**Produces:** DRAFT_GENERATING→DRAFT_READY→KB_PENDING_SYNC/KB_CONFLICT→LINK_PENDING→COMPLETED；固定 resourceId 与 clientMutationId 贯穿同一完成意图。

- [ ] 添加用例：草稿 1 completion/0 embedding、Guard 拒绝/输出非法/已派发超时均保留 DRAFT_FAILED 与用量；同 ID 重放无新调用；用户明确重新生成才新 attempt；取消/暂停恢复 phase 不丢草稿。
- [ ] 点击完成先持久 FINISHING 和覆盖清单，再生成草稿。服务端把 TEACH/DRAFT 映射为 LEARNING_TURN/LEARNING_DRAFT，草稿经统一策略强制 1 次 scope.complete，使用 CHAT_COMPLETION、structuredJson=true；沿 Task 3 prompt 分配和 source fence。返回 title/content 与合法来源引用，不生成隐藏业务字段。对旧/删除证据拒绝，用户可返回教学重新取证，不在草稿内加 embedding。
- [ ] 完成意图在保存前固定 KB ID 与 mutation ID。扩展签名为：

```ts
type KnowledgeCreationIntent = { resourceId: string; clientMutationId: string }
// 仅增加可选第二参数；现有 addBlock(block) 行为保持
addBlock(block: Partial<KnowledgeBlockModel> & { title: string; subjectId: string },
  intent?: KnowledgeCreationIntent): Promise<string>
```

- [ ] 固定意图、学习草稿与本地 KB/outbox 的必要关联须同一现行本地事务保存：给现有 LocalCommitInput 增加可选学习完成附带写入，具体事务实现仍归 localRepository 单一入口；不能先写 KB 再靠第二个事务保存 mutation ID。再次保存发现本机同 ID 同内容则复用；同 ID 异内容交冲突处理，不盲目覆盖已同步版本。禁止以新 UUID 重试。
- [ ] 只在现有 Sync ACK/权威读取证明目标 KB 已存在、owner/subject/source 正确、版本/hash 与草稿相符后发送 completion。未知 ACK 时查状态，不重发普通 POST。跨设备同 ID 冲突让用户明确采用已有版本；不伪造旧 device/clientMutationId 的 ACK。
- [ ] completion 在现行 Subject→KB 锁序之后锁 Session（其他学习事务不得反向同时锁资源），校验 KB/source/node 当前版本，然后同事务写完成回执、目标/会话和节点进度。自由会话 node=null 不做节点写入。重放返回原完成，失败只有关联待重试；不重新生成草稿/建块。
- [ ] KB create 不写 Review；完成后“前往学习/复习”打开现有入口，由用户执行现有正式 learning-completed/lifecycle。保存、完成关联和正式 Review 三个结果分别记录；任何教学模型评价均不代替它们。
- [ ] 统一验证：Server `./mvnw.cmd -B -ntp '-Dtest=LearningDraftBudgetTests,LearningCompletionPostgresTests,ReviewLifecycleServiceTests,SubjectReviewQueryTests' test`；PC 类型检查后 `node --experimental-strip-types --test scripts/r4-learning-completion.test.mjs scripts/r4-sync.test.mjs scripts/r4-subject-review.test.mjs`。覆盖本地事务失败、离线/冲突、同步成功关联失败、同意图重复点击与正式 Review 无隐式变更。提交差量。

### Task 7：合并验证、契约生成与业务验收（阶段 D）

**Modify：** `docs/contracts/API.md`、`Database.md`、`docs/modules/FrontendPC.md`、`Backend.md`、`docs/design/Frontend.md`、`docs/project/ProductRequirements.md`、`Architecture.md`、`docs/current/Status.md`、`IssuesAndReview.md`；实际发布时再写 Changelog。OpenAPI 与两端 SDK 只通过现有脚本生成。

- [ ] 对照以下矩阵确认 Task 1–6 的证据，不再把已通过且未变化的定向检查重复运行；尚未通过项不勾选。
- [ ] 在 Task 1/2/4/6 的契约变动完成时各按需要运行 `powershell -NoProfile -File scripts/export-openapi.ps1`、`powershell -NoProfile -File scripts/generate-openapi-sdk.ps1 -SkipExport`。本阶段只运行 `powershell -NoProfile -File scripts/check-openapi.ps1` 比对最终结果，未改变契约不重复导出；共享 API 更新 PC/Mobile SDK，不手改生成文件。
- [ ] 合并后一次后端 `./mvnw.cmd -B -ntp clean test` 与 `./mvnw.cmd -B -ntp '-DskipTests=true' package`，PC `npm.cmd run check:r4-pc`、`npm.cmd run test:r4-pc`、`npm.cmd run build`；跨模块迁移/并发/清理需有真实 PostgreSQL 测试。D 盘隔离数据库与日志，失败读完整输出，同一失败最多 3 次尝试，不无限回放。记录实际计数、skip、退出码及未覆盖项，不能拿 package 代替 test。
- [ ] 一个独立只读 6-luna reviewer 检查需求、预算、owner/来源、竞态/事务、幂等、删除与渲染安全；不重设计，不改 OPTIONAL。BLOCKER/IMPORTANT=0 才交付代码阶段。
- [ ] 真实 Provider 验收需沿已有授权和配置窗口执行有界样本：每个用途至少一个成功和一个可控失败/拒绝，记录 task、actual/unknown/charged、入模证据和输出质量。不得将真实课件/答案/凭据提交仓库；不为“校准”无限采样。若配置/额度不具备，明确保持该项待验收。
- [ ] 部署候选之前给出具体 commit/配置/迁移/回滚清单，部署沿现有用户授权边界。随后 Tauri 走双入口完整闭环与异常场景。代码/自动检查、部署、真实模型、GUI/业务分别报告。

## 需求—任务—验收对应表

| 场景/约束 | 任务 | 自动/人工证据 |
| --- | --- | --- |
| 学习用途接入统一准入/账本 | 独立方案 U1–U4 代码门禁；本计划 4/7 | 引用统一方案验收，补学习实际出站/会话 usage 的消费端证据。 |
| 大纲 ID/版本、重排/编辑/重生成 | 1/2 | 持久重读与冲突测试；GUI 初始化/重排后恢复。 |
| 自由目标匹配与无节点完成 | 2/5/6 | 0 模型匹配、不自动关联、node=null 完成；GUI 选关联/保留自由。 |
| step 来源、回答自动入下轮 | 2/4/5 | 应用 ID、当前题/原始答案、先反馈；真实模型反馈质量。 |
| 补查与 2-call cap、确定性触发 | 3/4 | Provider spy 计数、scoped SQL 真 PG、无 focus 不推测。 |
| FINISHING/暂停/失败恢复 | 2/6 | 所有 phase、重启/重复键、未知调用不自动重发。 |
| 草稿调用/Guard/失败费用 | 4/6 | embed0/complete1，已派发失败记账；真实 usage 对照。 |
| 12000 上限、裁剪顺序与 schema | 3/4 | 超长/Unicode/实际入模证据 ID；schema 固定块过大 0 请求。 |
| 受控能力/提示注入/来源三类 | 3/4/5 | 无 toolCall、非法引用/恶意片段；用户材料单独标记。 |
| 图形/活动/开关、外链图片/链接 | 5 | 白名单和协议测试，拖动不请求；GUI 可操作。 |
| SSE 整轮校验、在途二次提交 | 2/4/5 | 半截/非法 JSON 不显示，第二提交禁用+409，迟到不串写。 |
| KB 幂等、本机/同步/关联、Review | 6 | 固定 ID、本地原子、ACK 未知、关联事务、无隐式 Review 状态。 |
| Source/Subject/账号删除 | 2/5/7 | 软件事件与最终物理清理/消息/缓存；真实账号清理环境验收。 |
| 会话累计 usage 与拒绝 | 4/5/7 | 唯一任务聚合、actual/unknown/reserved 分离；GUI 与账本对照。 |

## 执行节奏与完成定义

学习任务顺序：1 → 2 → 3 → 4 → 5 → 6 → 7；统一限额独立推进，模型接入前满足其 U1–U3 实现与 U4 代码/自动门禁。任务内部按复现/最小实现/统一验证/差量提交推进；未通过前置不得声称后续可用，不默认并行修改同一文件。前端委派遵守当前 AGENTS，后端/API/数据不交 Antigravity。

计划交付不代表实现开始。本轮只核对代码、修订设计、写计划并检查文档。实施交接必须给出本轮差量、实际命令/退出码/计数、唯一 review 结论、未验收边界和下一项动作；Stop Rule 仍为 B0/I0、需求满足、一次相关验证通过。真实外部依赖缺失时不得把业务验收写成完成。

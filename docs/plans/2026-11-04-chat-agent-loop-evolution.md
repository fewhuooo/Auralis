# Chat Agent Loop 容错、收敛与上下文治理

日期：2026-11-04

最后更新：2026-11-05（Asia/Hong_Kong）

状态：第 1–7 步后端源码与相关验证完成；PC 前端 Step 4（全学科资料请求契约）、Step 7（UNKNOWN 显式恢复）及 Step 9（Conversation Scope Binding 与生命周期治理）接入全部完成并通过全量类型检查、生产构建与定向回归；工具并发只读评估完成，当前保持串行。部署和真实模型跨端验收仍未完成。

## 目标与边界

单 Agent 在当前学科内自主寻找资料，工具参数错误可以有限纠正，证据不足或接近容量边界时仍能收敛回复。沿用现行 Turn/Run/Attempt、权限、资料 revision、预算预留与持久化契约。新 conversation 在首次 turn 固定读取策略与 IDs；每次 attempt 重新捕获并验证当前资料版本。

普通答案不要求输出出处，不新增答案引用字段或引用绑定。工具内部真实 ID 校验保持。SSE 断点续传不在本计划范围；工具并发最后实施。PC/Mobile 代码及生成类型由用户修改，本任务提供必要接入说明。不调用 Antigravity，不重启开发服务器或应用，不部署或操作业务数据。

当前工作树已有大量并行修改，各执行步骤先保存目标文件开工快照，仅编辑当前任务差量。冻结实现仅因已证明的 correctness 问题或用户已授权的目标修改，不进行无关重构。

## 顺序与验收

每一步完成设计裁决、实现、相关验证、唯一只读审查及权威文档回写后进入下一步；验证按 `docs/agent/BeforeCoding.md` 选择，不重复已通过且未受后续变更影响的检查。测试遵守 AGENTS.md 的可观测契约、真实回归和单一归属准则。

### 1. 资料读取容错与回答收敛（源码与定向验证完成，未部署）

- 授权范围及 revision 未变化时，错误片段 ID 或可明确识别的参数错误作为安全的 native tool result 回传，允许有限纠正。
- 权限、资料版本变化、取消、预算、所有权、Provider 和系统错误保持原终止边界，不宽泛吞异常。
- 空或不相关结果允许有限换词/定向查找；仍不足则正常说明资料不足。仅依据资料的要求必须遵守；通用解释明确与资料结论区分；手选范围不擅自扩大。
- 保持工具调用/result 配对、私有 evidence、历史重建和公开事件一致；不影响现有展示工具修正和题卡 READY 原子语义。
- 验收：错误片段不直接杀死对话，纠正后可完成；重复错误能收敛；权限和版本错误仍终止；无资料正常回答，不无限搜索。

最终定向 `DisplayToolOrchestratorTests,ChatEvidenceHistoryProjectorTests,ChatAgentProtocolPublicationTests` 22/22 通过，唯一只读审查 B0/I0/O0。历史只投影固定中性错误结果，不携带当前 attempt 的 `repairable` 控制标志；公开工具错误仍为 `tool.error`，前端无需变更。空/无关搜索的单次定向重查是模型提示规则，不是新增独立检索次数硬帽。真实 Provider 是否遵循及 PC 体验尚未验收。证据：`D:/Temp/auralis-chat-agent-loop-evolution-20261104/step1.md`。

### 2. 容量诊断（源码与定向验证完成，未部署）

- 记录容量触发维度、实际值、上限，以及 mapped request 各角色正文、工具参数、工具定义和完整序列化请求的安全统计；不记录完整私有 prompt 或秘密。
- Gateway 只持有扁平消息，不用最后一条 USER 猜测历史/当前轮边界（选中文本与活动上下文也是 USER）。历史与当前轮的细分在第 3 步由真正掌握边界的上下文投影处记录。
- 区分消息内容、单工具结果、完整序列化请求及 token/次数预算。
- 验收：容量失败可准确定位；通过与拒绝边界不因观测改变。

Gateway 最终拒绝日志记录真实 dimension/actual/limit 和角色/工具/序列化统计；不泄露内容值，也不增加成功或 projector 候选拒绝日志。容量与 Gateway 定向 28/28 通过，唯一只读审查 B0/I0/O0。证据：`D:/Temp/auralis-chat-agent-loop-evolution-20261104/step2.md`。

### 3. 分层上下文压缩（源码与定向验证完成，未部署）

- 保留核心规则、当前问题、权限与活动提交；先去重/移除冗余，再缩短旧摘录与移除旧完整回合。
- 当前轮较早结果可缩成真实来源、片段 ID、版本及短摘录，保持调用/result 配对并可重读；完整执行记录不被压缩覆盖。
- 真实 mapped request 分维度检查，预留正常收尾空间；首版采用确定性裁剪，不额外调用摘要模型。
- 在投影层按明确的历史/当前轮边界补充分层统计，不通过消息角色推测业务回合。
- 验收：连续检索后仍能回答；压缩不改变资料身份、不破坏协议/题卡；容量不足有明确结果。

投影明确分离保护上下文与当前工具交换，只对成功资料工具的副本去重/缩短；保留原始 evidence、配对、版本和较新内容。最终 no-fit 在 Provider/reservation 前记录一次有边界的容量诊断；不增加任意 byte headroom。工具/迭代机会耗尽时在既有额度内收尾，指令优先级明确。clean 定向 48/48，唯一只读审查 B0/I0/O0。证据：`D:/Temp/auralis-chat-agent-loop-evolution-20261104/step3.md`。

### 4. 全学科自主选资料与有界 Catalog（后端与 PC 源码均已完成，定向验证通过）

- 提供当前学科 READY 文档的有界发现信息：真实 ID、标题、已有摘要/一级目录；缺失元信息不自动生成。
- 首版采用按需 native `list_sources`，返回捕获授权快照内的 ID、标题、revision 和分页信息；每页最多 20 条，不强行把清单注入不可裁剪的初始上下文，不读取摘要/目录或依赖 Overview。
- 文件多时分批发现，所有读取保持用户/学科/资料 revision 边界。
- PC 默认 SUBJECT 模式由用户接入；后端能力与客户端切换分别验收。
- 验收：无需手选即可找到资料，跨文档问题有覆盖且不跨学科。

`list_sources` 和既有 native tool 注册/错误恢复已接通，SUBJECT 非法携带 source IDs 在 scope 入口按原检索契约拒绝。最终定向 22/22、唯一只读审查 B0/I0/O0。第 4 步完成时 search 仍为 query-only，第 5 步已补上模型工具 sourceIds 子集筛选。证据及前端交接：`D:/Temp/auralis-chat-agent-loop-evolution-20261104/step4.md`、`step4-frontend-handoff.md`。

PC 端已于 2026-11-05 完成接入：在 `useChatStore.ts` 中实现统一规范化构造函数 `buildReadingContext`，`SUBJECT` 模式严格输出 `currentSourceId: null` 与 `sourceIds: []`；`AUTO` 模式输出当前文档 ID 与 `sourceIds: []`；`SELECTED_SOURCES` 模式输出 `currentSourceId: null` 与选中文档 ID 列表；在 `useChatStore.sendMessage` 与 `retryPendingMessage` 中统一接入，保留显式手选窄范围。定向测试 `scripts/r4-chat-recovery-handoff.test.mjs` 3/3 通过。真实模型分页与跨端表现仍待验收。

### 5. 检索效果改进（定向检索源码与验证完成，真实语义质量待验收）

- 用实际问题确定漏召回类型后，选择适合当前中文资料及运行依赖的关键词候选与向量融合实现。
- Rerank 是否引入由质量/耗时对照决定，不预先增加基础设施或模型依赖。
- 验收：术语、自然语言、跨文档问题有可比较结果，不以增加链路代替效果证据。

第 5 步开工时，Catalog 已能发现文档，但 query-only search 不能按已选 ID 定向。本步补模型工具的可选 `sourceIds` 子集过滤，不能扩大 run 冻结范围，显式空/非法列表不退化成全范围；同一 query 仅做一次 embedding，复用现有预算和候选排序。此参数位于模型工具参数，不是允许 SUBJECT 客户端 ReadingContext 带 sourceIds。最近两次已复现失败不证明排序缺陷，缺少真实漏召回证据时不直接引入 Hybrid/RRF/Rerank；合成向量测试不作为语义质量证明。

已完成 `search(query,sourceIds?)` 与既有预算计量、真实 Catalog→定向搜索闭环；非法列表拒绝，不静默扩大范围，global scope 也仅可缩小至已捕获 owner 范围。最终相关集合 30/30，补强真实清单消费后受影响类 8/8，唯一只读审查 B0/I0/O0。证据：`D:/Temp/auralis-chat-agent-loop-evolution-20261104/step5.md`。

### 6. 真正空回复的结束保护（源码与定向验证完成，未部署）

- 无有效正文、组件或题卡时才允许一次有界补答；有效纯组件可结束，题卡 READY 仍结束等待作答。
- 验收：没有空白气泡，不强行给图表补话，不泄露题卡答案；不绕过已有预算。

正常空 STOP 最多追加一次 continuation；再次空或无迭代余量时追加可见的重新发送/换问法说明。reasoning/空白/无效预览不算回答，纯 READY 组件不强制文字，题卡保持原原子结束路径。真实预算、Provider、取消、权限等异常不转成功。clean 定向 22/22，唯一只读审查 B0/I0/O0。证据：`D:/Temp/auralis-chat-agent-loop-evolution-20261104/step6.md`。

### 7. UNKNOWN 恢复（后端与 PC 前端均已完成，定向验证通过，未部署）

- 先确定旧执行者失权、迟到结果隔离、预算结算、会话释放与重试的安全协议，再实现最小闭环。
- 租约过期不等于外部调用停止，不按超时直接假定失败/退款。
- 验收：执行进程退出后可安全恢复，旧结果不覆盖新 attempt，不重复提交或错误结算。

已裁定新增 attempt-scoped 显式 `POST /api/ai/conversations/{conversationId}/runs/{runId}/attempts/{attemptId}/recover`，复用现有状态响应。锁序 conversation→run→target attempt；只有当前 UNKNOWN 且仍占本会话槽才结算/释放，已解决目标的重复操作不得影响新 attempt/其它 run。锁内再次 fence，保留未知用量账本；没有已提交活动则 FAILED 并可用现有 retry，当前 attempt 已有 READY/SUBMITTED 活动则恢复 COMPLETED、不允许重复生成。普通 retry/cancel 不被隐式改成自动 UNKNOWN 重派。

现行 `readyActivity` 提交与普通 finish 之间有 attempt 仍 RUNNING 的窗口；重启恢复需保留已提交活动成功状态。`finish` 释放槽也需依据实际 terminal status，不能在已提交业务实际 COMPLETED 时因请求状态 UNKNOWN 继续占槽。此两处按已证明的状态机正确性做局部修正，不引入新 lease 框架或退款策略。

最终受影响 API/handler 检查 46/46，真实 PostgreSQL 门禁/恢复 4/4，官方 OpenAPI 导出与比较 18/18；唯一只读审查 B0/I0/O0，修复了新拒绝码未注册导致 500 的问题，当前应返回 409。最终全量 `1090 tests / 3 failures / 0 errors / 2 skipped`，失败为既有 AiFeaturePolicyParity stage=0、TaskColor migration 42→43、OverviewIdentity migration 41→43；package 成功。首轮额外 Source/Asset 旧版本删除冲突在隔离 3/3 和最终全量未复现，原因尚未确证，未改相关生产代码。证据和前端接入：`D:/Temp/auralis-chat-agent-loop-evolution-20261104/step7.md`、`step7-frontend-handoff.md`。PC 端接入已于 2026-11-05 完成：在 `aiClient.ts` 中接入 `recoverChatRunAttempt`；在 `useChatStore.ts` 中建立四重 Ticket Guard（`targetUserId`、`targetSessionId`、`runId`、`attemptId`）；409 刷新抑制自循环重试；`pollRunStatusUntilSettled` 与 `loadMessages` 停止 UNKNOWN 自动轮询；在 `SubjectWorkspace/index.vue` 中提供微晶提示条与气泡内联操作，统一“恢复状态”文案。定向测试 3/3 通过，类型检查与全量构建通过，唯一只读 Reviewer 审查通过（B0/I0/O2）。

### 8. 只读工具有界并发（只读评估完成，当前未实施）

- 先隔离每次调用的 budget/cancel/执行状态，再并发独立资料工具，结果按 provider 顺序提交；有业务状态的工具保持串行。
- 验收：预算、取消、顺序和持久化正确后，对照测量耗时。

当前 usage Scope 只有一个 active reservation/heartbeat 指针，search 还会产生真实 embedding 用量；同时存在按 provider 顺序的错误修复/停止执行语义。没有逐工具耗时证据可量化收益，不能直接 parallelStream 或承诺端到端加速。只读评估建议先实测前七项，再决定是否增加执行器、调用状态隔离和并发结算。已向用户请求这一偏好，收到进一步决定前保留串行，不新增并发生产实现。评估报告：`D:/Temp/auralis-chat-agent-loop-evolution-20261104/step8-assessment.md`。

## 证据与回写

### 9. Conversation scope binding 与越界工具参数收敛（源码、验证与审查完成；PC 前端接入完成）

- 新对话先处于 UNBOUND；首次有效 turn 与 USER/run 同事务绑定规范化 SUBJECT/SELECTED/AUTO 策略及 scope IDs。选择文件可在首条消息之前完成，首条提交后切换范围需新对话；首条生成失败或取消也保留绑定。重复 ID、空 SELECTED 或 subject/source 校验失败时不得保存 USER/run/绑定。
- 后续省略 readingContext 继承绑定；显式不同返回 409 `CHAT_SCOPE_CONFLICT`，不进入 admission slot。重试使用原 run context；activity submission 继承 conversation scope 并验证来源 run 相同。selectionText 不属于固定范围；ready/revision 每 attempt 重新捕获和校验。
- V44 显式添加 `LEGACY/UNBOUND/BOUND` 和 JSON scope。历史 conversation 保留可读，但不从首轮/末轮推断混合范围，不自动转换；新 turn/retry 要求新建 conversation。Owner-wide 绑定使用 BOUND + null scope，AUTO 保留原语义。
- 模型显式提供当前 attempt 范围外 source ID 归为限次修复的 `CHAT_TOOL_ARGUMENT_INVALID`，严格不查询/返回越界资料；内部读取越界和真实 owner/READY/revision变化仍走 fatal path。提示说明 Catalog 是索引，目录分页不代表正文阅读完成，不向用户输出分页控制字段。
- 验收：并发首次绑定只有一个 scope 成功，竞争范围冲突不写第二个 USER/run；模型误用历史 ID 后可在稳定 scope 内纠正并完成；真实授权/版本变化仍失败。接口、V44 migration、OpenAPI 与数据库契约同步。PC 对话创建、首条范围提交、detail 恢复及 409 新建入口已由 PC 前端于 2026-11-05 接入完成（覆盖 UNBOUND 首轮绑定、后续轮次 readingContext 省略继承、409 CHAT_SCOPE_CONFLICT 乐观消息清除与引导、LEGACY 会话只读禁用提问与重试、UI 选项目标还原与范围切换拦截）。
- 本步不改变 retrieval 算法/caps、不提供兼容迁移、不删除历史数据，不部署、不重启、不调用真实 Provider、不编辑 PC/Mobile/generated schema。

最终验证：scope 与工具参数受影响目标测试通过；OpenAPI 导出与 artifact 19/19、`-DskipTests package` exit 0；正确配置 task-owned PostgreSQL 的 backend full 1096 tests / 3 failures / 0 errors / 2 skipped。三个失败为既有 AiFeaturePolicyParity stage=0、TaskColor fixture expected V42/actual V44、OverviewIdentity fixture expected V41/actual V44，未修改无关断言。唯一只读 reviewer B0/I0/O0。全量日志、命令与失败行见 `D:/Temp/auralis-chat-screenshot-failure-20261105/implementation.md`；未部署、未调用真实 Provider/AGY、未执行 GUI/业务验收。PC 前端由用户接入，交接 `D:/Temp/auralis-chat-screenshot-failure-20261105/frontend-scope-handoff.md`，临时 OpenAPI TS 在 `D:/Temp/auralis-chat-screenshot-failure-20261105/sdk-types/schema.ts`。

当前已复现的问题记录：`D:/Temp/auralis-latest-two-chat-20261104/findings.md`。本计划执行证据目录：`D:/Temp/auralis-chat-agent-loop-evolution-20261104/`。

本计划只跟踪步骤与边界；现行行为回写 [Backend](../modules/Backend.md)、[Chat Runtime API](../contracts/chat-runtime-api.md)，状态与风险回写 [Status](../current/Status.md)、[IssuesAndReview](../current/IssuesAndReview.md)。接口/数据库/配置实际变化再按权威回写矩阵同步，不为形式修改无关文档。

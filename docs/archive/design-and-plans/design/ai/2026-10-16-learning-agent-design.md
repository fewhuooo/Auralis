# 学习 Agent 产品与交互设计

> Chat 的后续实施入口为 [Display Tool 计划](../../plans/ai/2026-10-31-chat-display-tools.md)，当前字段以 [Chat Runtime API](../../contracts/chat-runtime-api.md) 为准。本文保留 2026-10-16 的原设计记录，Chat 不再执行本文目标、进度与知识块完成状态方案；下文 Overview 前置与实施状态也仅记录当时判断，当前能力见模块与契约。

更新时间：2026-10-16

文档状态：用户书面评审后修订；实施计划已编制，功能尚未实施

权威范围：PC 学习目标、教学交互、进度、知识块产出及安全和预算边界。任务见[实施计划](../../plans/ai/2026-10-16-learning-agent-implementation.md)。

## 目标与入口

用户沿总览大纲或自由选择目标，在 AI 面板接受讲解、操作图形、选择或回答问题。应用自动把已提交答案及必要活动结果编入下一轮上下文，Agent 先反馈，再讲解、换例子、提示或提议结束。用户可追问、调整目标、跳过活动、暂停和回到原路线。

完成目标后生成可编辑知识块草稿；确认保存、完成同步并关联后更新学习进度，然后由用户进入现有正式学习/复习。大纲是进度和继续学习的入口，对话与活动记录用于恢复现场。一期覆盖 PC Tauri 与后端；模型生成需要在线，断线保留输入且不自动重发收费请求。

自然语言支持“按大纲继续上次学习”“检索当前学科关于 X 的资料，带我理解 Y”“换成交互演示”“整理为知识块”“回到原大纲”等同义表达。应用识别明确命令；含糊输入展示目标/范围选择，不为识别意图另调模型。自由目标关联大纲时，应用仅按明确节点 ID 或规范化标题完全匹配列候选，由用户选择；不额外调用模型匹配，也不自动关联。

## 代码基线与前置工作

下表为 2026-10-16 脏工作树只读核对，不代表运行态、测试或业务验收。

| 项目 | 当前事实 | 需要新增 |
| --- | --- | --- |
| 大纲身份 | 有整体 version/outlineVersion 和来源 manifest；chapter/section 无持久 ID/内容版本。PC 编辑 ID 保存时被剥离。 | 持久节点身份、内容版本；编辑/重排保留，重生成不按标题继承。 |
| KB 保存 | 普通 REST POST 服务端生成 UUID，无创建幂等键，重发重复建块。PC 正常路径预分配资源 ID、clientMutationId，经本地 outbox/Core Sync 重放。 | 完成意图固定 KB/mutation ID，复用 PC 同步；不用普通 POST 重试。 |
| Review | KB create 不创建 review_state；查询不为无状态 KB 合成队列项。正式 lifecycle 操作才建立/变更状态。 | 保存后提供现有学习/复习入口；教学与 KB 创建不代替正式操作。 |
| Chat 预算 | task 绑定 user + CHAT + userMessage.id；默认总次数≤2，正常链路是 embedding 与 completion 各一次，当前未单独限制 stage 次数。 | 教学和草稿分别经统一策略限制总/stage 次数并记账。 |
| 检索/上下文 | 默认 TopK 8、excerpt 最多 400 Java 字符、prompt 12000 字符。只有向量检索，query-aware excerpt 不是关键词召回。 | 关键词/邻接通路、教学上下文分配器及实际入模证据清单。 |
| 对话 | READING_SESSION 无活动 24 小时清理；不能泛化为 GENERAL。消息无持久 citation/locator。 | 独立持久学习状态、学习用途及证据清理策略。 |
| 图文/流式 | Chat 为文字 delta；现有 Markdown 使用 DOMPurify，无教学活动/外链专用策略。 | 结构校验、受控组件及校验后的整轮投影。 |

依据：`ai/OverviewDtos.java:40–67`、`ai/OverviewResultView.java:10–29`、`ai/internal/persistence/OverviewResultEntity.java:30–100`、PC `SubjectWorkspace/index.vue:1718–1968`；`knowledge/KnowledgeBlockService.java:43–61`、PC `useKnowledgeStore.ts:90–123`、`sync/SyncMutationProcessor.java:35–90`；`review/ReviewService.java:31–50`、`ReviewLifecycleService.java:70–150`；`AiStreamingService.java:93–150,282–307`、`PromptAssembler.java:25–128`、`AuralisProperties.java:104–118`、`ReadingConversationCleanupService`、PC `utils/markdown.ts:139–188`。后端路径相对 `Auralis-Server/src/main/java/com/auralis/app/`，PC 相对 `Auralis-PC/src/`。现行文档：[API](../../contracts/API.md)、[Database](../../contracts/Database.md)。

## 编排与应用侧能力

采用单一学习编排 Agent。模型负责教学、反馈和白名单后续动作；应用负责检索、授权、状态、渲染和保存。模型不发起 function calling 或任何工具调用。检索、补取、状态读取、活动执行和保存统一称为“应用侧能力”。

步骤 step 是应用分配稳定 ID 的一次教学轮次，最多一个主要问题或活动，也可以只有讲解和下一步选择。不预先生成完整脚本列表。应用在请求前分配输出步骤 ID；模型不能指定 ID、版本或资源范围。用户提交针对当前 step 的答案/最终操作值；同一次 completion 返回反馈、下一段教学和 `CONTINUE / REEXPLAIN / HINT / CHANGE_EXAMPLE / PROPOSE_FINISH` 之一。校验通过后应用才登记新步骤、推进恢复点。已完成步骤仅表示提交和反馈已保存；PROPOSE_FINISH 只显示结束入口，目标完成仍由用户确认。

## 检索、补查与来源

每个教学操作最多一次 embedding 加一次 completion。初检/embedding 服务错误明确失败，不能伪装为空命中。补查只用数据库关键词查询或邻接片段读取，不改写 query 后重新 embedding。

focus 只取用户选中/引用术语，或确定性格式“解释 X 的定义”“什么是 X”，最多 32 个 Unicode 字符，允许单字。无法确定则为空，不由模型猜测。下列规则按顺序选择一个路径，每轮至多一次补查：

| 可检查条件 | 动作 |
| --- | --- |
| 有 focus，初检 0 命中，或命中的原文及 excerpt 都未含 focus | 在原范围做一次转义的字面关键词查询，最多当前 TopK 个候选。 |
| 有 focus，初检 chunk 含 focus，但 excerpt 无 focus/定义线索 | 先在该 chunk 内选窗口；仍无邻近线索且有命中 ordinal 时，一次读取同 Source/活动 generation 前后各 1 个邻接。 |
| 无 focus 且初检为空，或其他情况 | 不补查；说明当前检索未找到支持，或正常继续。 |

这些为新增查询，必须在 limit 前核对 owner、subject、用户选择 Source、READY、active、generation/revision，并设置查询期限。候选去重重排后最多 TopK 个、每段 400 字符。这只识别未命中/焦点覆盖缺口，不证明整份资料没有答案；相似度是相关性，不是置信度。

来源分为检索原文、用户提供文字/选区、模型教学解释。用户材料标 USER_PROVIDED，不冒充检索课件。证据作为不可信数据放入独立资料区，其中的指令、链接、系统提示不获得执行权限。只展示实际进入模型的证据；当前 Chat 在裁剪前发送全部 citation 的行为不能直接复用。无可信页码/slide 元数据时只展示来源和片段。

例：用户提供“遍”的定义“对源语言或等价的中间语言程序从头到尾地扫描并完成规定的任务的过程”，标作用户提供。Agent 另画信息依赖图，用开关演示“前一遍是否产生符号信息”，标作教学示例。开关在本地更新，提交最终值和答案才请求反馈。

## 交互、渲染、SSE 与在途操作

白名单：讲解、证据、步骤图、单选、多选、排序、配对、滑块、开关、文本回答。声明式活动限制数量、长度、选项和数值区间；不运行模型脚本、任意 HTML、远程 iframe 或模型 SVG。步骤图由应用组件绘制。

教学 Markdown 在现有 sanitizer 后增加专用策略：禁原始 HTML、外链图片，只允许应用映射的本地受管图片。正文链接仅 http/https，点击展示地址并由用户打开；禁 javascript/data/file/自定义 scheme。证据/节点/KB 导航只由应用按已授权 ID 构造。策略仅影响教学组件。

SSE 提前只发送操作 ID、处理中、心跳、已结算用量；原始模型文字/JSON 缓冲。整轮结构、长度、证据 ID、活动和动作校验后，原子保存并发送完整结果，客户端二次校验再替换等待占位。活动块无效而文字/引用独立有效时，由服务端构造安全降级结果再整轮发送；核心结构/来源无效则报错，不显示部分输出，不增加修复 completion。

会话最多一个在途生成。UI 禁用提交、生成草稿、再次完成和目标/范围改写，不排队；保留输入，允许暂停/取消。不同 requestId 的第二次提交由服务端拒绝；同 ID 返回相同 pending/结果/失败。暂停使旧响应失效，但旧调用实际退出、结算和释放资源前不启动新生成。切账号、学科、revision 或页面代际后，迟到事件不得覆盖新上下文。

## 三层状态与结束

| 层 | 持久状态 | 转移 |
| --- | --- | --- |
| 目标 | OPEN / COMPLETED / ABANDONED | 创建 OPEN；KB 同步确认并关联后 COMPLETED；明确放弃为 ABANDONED。调整目标产生新目标版本，历史保留原版本。 |
| 会话 | ACTIVE / PAUSED / FINISHING / COMPLETED / ABANDONED | ACTIVE 可暂停/结束；PAUSED 保存 resumeState，恢复 ACTIVE/FINISHING；FINISHING 完成后 COMPLETED，取消结束回 ACTIVE；放弃转 ABANDONED。 |
| 节点当前内容版本 | NOT_STARTED / IN_PROGRESS / COMPLETED | 首次关联为 IN_PROGRESS，完成关联后 COMPLETED；暂停/失败保持 IN_PROGRESS。显式重新学习回 IN_PROGRESS 并保留历史；无记录为 NOT_STARTED。 |

FINISHING 保存 finishPhase：DRAFT_GENERATING、DRAFT_FAILED、DRAFT_READY、KB_PENDING_SYNC、KB_CONFLICT、LINK_PENDING。暂停保留 phase。草稿失败保留目标、覆盖要点和操作；保存失败保留草稿及固定 KB/mutation ID；关联失败只重试关联。已放弃目标若无完成记录，节点保留学习中/已暂停入口，用户可明确重置进度，不静默删历史。

“完成本节”先进入 FINISHING，展示草稿覆盖步骤，默认用户固定要点优先、其后最近步骤，最多 8 项；用户确认后单独生成草稿。预览编辑并确认保存，经 PC 本地事务保存 KB 与 outbox。UI 区分本机保存/已同步；服务端确认 KB 归属、版本、正文 hash 后，同事务完成目标、会话和节点关联。失败保持完成中，可恢复。

同一完成意图固定 KB ID/clientMutationId；同步冲突沿现有流程处理，不换 ID。跨设备恢复遇原设备未同步时显示待同步；另一设备恢复保存仍须沿用 KB ID，发现已存在时核对并由用户采用，不冒充原设备 ACK。

无节点的自由会话按同样流程完成目标/会话，节点更新明确为空操作；结束前也可由用户选择关联。KB 保存不自动进入 Review；“前往学习/复习”让用户进行现有正式 lifecycle 操作，教学不生成评分或调度状态。

## 记录、身份与删除

最小记录：目标/版本、会话/恢复点、步骤定义、原始答案和活动最终值、反馈、已展示证据、草稿及操作回执。正文复用 Conversation/Message，新增学习用途不受 READING_SESSION 24h 清理；结构化学习状态独立持久保存，不复制一份聊天历史。学习用途通过专用读写口访问；普通聊天的列表/详情/生成/编辑/删除入口均隔离该用途，避免 canonical 教学 JSON 被当作普通聊天正文。

节点元数据在 Overview 持久结果中用独立于模型 schema 的字段保存 nodeId、contentVersion、内容 hash 和路径，由应用分配。仅重排保留身份和版本，实质内容变更增版本。无身份旧大纲先显式初始化并同步，再允许关联。重生成默认新身份，不按标题/下标迁移完成状态；用户可查看并关联旧记录，新内容仍需明确学习/完成动作。

提交绑定 owner、sessionVersion、stepId/stepVersion、requestId、内容 hash；同键同内容回放，不同内容拒绝。模型调用在短事务之外执行，前后登记操作并检查版本/来源围栏，不在等待模型时持有行锁。结果未知或已派发请求不自动重试；显式重试为可见的新 attempt，继续受相同限额约束。

Source 软删除/修订后，原 owner 的历史摘录可保留并标过期，禁止用于新回答；Subject 软删除隐藏并冻结学习记录；KB 软删除隐藏正文和可用关联，不回写历史学习完成。Source/Subject 硬删除或账号最终清理时，按删除范围清除摘录、用户文本/活动和可逆识别关联，包括 Message 中复制的正文；账号删除清除全部学习内容。对应本地缓存随删除投影/账号清理清除，断网设备下次同步/登录清除。必须接现有软删除事件与延迟账号清理服务。

## 上下文预算与用量

用量统一归[AI 用量设计](2026-09-14-ai-usage-guard-design.md)和[统一方案](../../plans/ai/2026-10-16-ai-unified-limits.md)。平台调用受平台窗口/任务配额，BYOK 只计量并保留运行保护及一期教学协议；学习仅声明用途、身份和需求。实际来源由设置服务逐调用传递：当前 embedding 为平台提供、completion 可为 BYOK，两者分别统计。平台额度耗尽不得阻止 BYOK，平台 embedding 仍沿原窗口豁免。

prompt 总上限从统一策略读取，初始为 12000 Java UTF-16 字符；更小配置收紧分配。下表是教学内容的初始分配，各类别包含模板、标签和最终内容，不在学习模块复制硬上限。最终 messages 总长再核对有效策略，不能漏算 schema 或重复计算传输 JSON 转义。

| 类别 | 默认最大字符数 | 处理 |
| --- | ---: | --- |
| 系统指令、格式/schema、资料不可信声明 | 3200 | 固定协议放不下则失败，0 Provider。 |
| 当前目标、节点/版本、完整当前问题、请求动作 | 1800 | 必需，超限 CONTEXT_LIMIT，保留输入。 |
| 当前完整答案/活动最终值 | 2500 | 前后端复核，超限拒绝，不静默截断。 |
| 当前证据与标签 | 3500 | 最多 TopK 个、每段 400 字符，低优先整段移除。 |
| 历史片段/草稿要点与覆盖说明 | 1000 | 默认最近 2 轮；草稿最多 8 个已选要点，按顺序有界摘取。 |
| 合计 | 12000 | 与实际配置上限共同约束。 |

裁剪顺序：最旧历史 → 重复历史说明 → 低优先证据整段。固定指令、当前完整问题和答案不被挤出；仍放不下则失败，不新增摘要 completion。草稿要点取同一次教学 completion 的短要点或用户固定文本，展示省略步骤数，用户可改覆盖范围，不宣称整段长会话都已入模。来源投影从最终入模 ID 集生成。

| 操作 | 统一策略与 task/ledger | 初始最多 Provider 调用 |
| --- | --- | ---: |
| 教学提交、追问、换例子 | LEARNING_TURN，仍按 CHAT 计量；每个持久操作独立 taskId，RETRIEVAL_EMBEDDING + CHAT_COMPLETION | 2；补查 0。 |
| 生成/明确重新生成 KB 草稿 | LEARNING_DRAFT，仍按 CHAT 计量；独立操作/taskId，CHAT_COMPLETION，复用仍有效的已选内容/证据 | 1；无 embedding。 |
| 显式重试失败生成 | 新 attempt 关联原操作；先核对原任务在途情况，公开新增消耗 | 同对应操作；不后台循环。 |
| 交互、节点匹配、保存/同步/关联、恢复读取 | 应用/数据库操作 | 0。 |

现有 Guard/Gateway 已有并发、reservation 与结算；来源分流拟由统一方案实施。一期教学每 stage≤1、草稿 completion≤1 是两来源共同的操作协议；平台 token/次数配额只检查平台来源，BYOK 不套平台费用预算。Embedding 保持原窗口豁免，仍审计并受运行保护。重放不重新 beginTask，明确重试才新建 task。reservation 拟记录 operation_kind/credential_source；学习派发前绑定真实 usageTaskId，按 owner+唯一 task_id 汇总，再分平台/BYOK/历史未知展示 actual、unknown/charged exposure、reservation；unknown 不作 0，charged 审计不直接等于平台扣额。

草稿生成失败保持 FINISHING/DRAFT_FAILED；已派发仍结算费用，不能因无草稿宣称未计费。预算拒绝保留输入/状态并显示现有安全 retry/reset 字段，等待用户操作。取消只承诺本地停止消费与可控传输中止，不承诺远端计算/费用撤回。

## 阶段与验收

| 阶段 | 用户结果 | 必验场景 |
| --- | --- | --- |
| 外部依赖：统一限额 | 消费独立方案提供的操作策略，学习仅声明用途 | 引用统一方案证据，并验证学习接入；不重复实施跨功能治理。 |
| A 身份与恢复 | 节点身份持久化、两入口目标、暂停/恢复 | 重排/编辑/重生成；自由目标无关联；版本、账号和清理。 |
| B 教学与补查 | 答案自动带入反馈，实际入模来源，非 embedding 补查 | 确定性触发、2-call cap、长会话、来源类别、整轮 SSE、在途二次提交。 |
| C 交互与完成 | 活动、草稿、固定 ID 保存同步、进度与正式学习/复习入口 | 草稿 1-call/失败计费；生成/保存/同步/关联失败恢复；自由完成；Review 无隐式写入。 |
| D 综合与用量 | 累计 usage 可见、拒绝可恢复、完整闭环 | actual/unknown/reserved；提示注入、外链/图片、删除；真实模型和 Tauri GUI 分别验收。 |

自动检查用合成资料验证状态、幂等、竞态、授权、预算和安全。真实模型质量验证反馈/证据/活动与 usage；GUI 验收两入口、恢复、交互、KB 同步和正式学习/复习。代码、测试、构建、部署与业务验收分别记录。本轮仅修订设计和编制计划，不改变现行 API/Database 或发布状态。


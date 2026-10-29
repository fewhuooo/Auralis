# Chat Agent 与流式可视化教学重写计划

日期：2026-10-29（Asia/Hong_Kong）

状态：需求方向已确认，实施未开始；本文件为实施顺序、协议约束和验收依据。P0 接线与契约冻结后再进入功能实施。

执行分支：`codex/chat-agent-rewrite`。工作区：`D:/CodeBase/CodexWorktree/chat-agent-rewrite/Auralis`。从原分支当前 HEAD `ff83eaa` 创建，并带入创建时未提交的文件状态作为基础；原目录 `D:/CodeBase/Active/Auralis` 与原分支保持不动。复制的并行改动只作为基础，不自动归入 Chat 交付。

范围：在现有仓库和业务基础上，直接重写 PC Tauri Chat 与 Server ai Chat 实现；所有调用该 Chat 契约的客户端完成必要接线。事实依据为当前源码、[PC 模块](../modules/FrontendPC.md)、[后端模块](../modules/Backend.md)、[API](../contracts/API.md)、[Database](../contracts/Database.md)。下文接口、对象与事件均为拟新增，不代表现有能力。

## 1. 目标、范围与完成定义

通过 LangChain4j 单 Agent Loop 提供轻量资料教学：模型按需搜索、读取原文、大纲，输出自然语言、步骤、对比、路线、图表、单/多选和开放问答卡；用户作答转为关联原题的消息，模型自主反馈和继续教学。

- 普通文字逐字显示；组件中的标题、项目、选项和图表数据按完整 NDJSON 行逐项显示。
- 过渡说明、工具胶囊和教学内容按时间线排列，避免预判或事后搬移文本。
- 题卡只是输入入口。程序验证提交合法性，不判分、不写正确率或掌握状态；LLM 在下一条回复中点评。
- 保存对话、组件、题目和作答以便展示与恢复。填空、学习进度/完成率/步骤推进、知识块完成闭环不进入本计划。
- Overview、Review、核心 Sync 保持当前行为。Mobile/Tablet 不新增可视化教学 UI，但凡消费 Chat 契约的接口、类型和文本投影需要一起更新，不能以保留旧后端执行链来维持调用。
- 完成定义：真实 PC 中可以查资料、逐字/逐项展示、提交两类题卡、由 AI 接续回答，刷新可恢复已保存题卡与作答；异常可局部显示并安全结束执行。源码、自动验证、部署、真实 Provider 和 GUI 验收分别记录。

本计划接替 2026-10-16 学习 Agent 文档的 Chat 产品范围与实施入口。已实现的 Overview 身份/来源、统一预算仍为可复用基础，不能误报为本功能已实施。

### 重写边界

- 直接替换当前 Chat 的固定检索→一次 completion、Prompt 拼装、流式 reducer/Store 与聊天展示接线。可以重组或删除 Chat 专属代码，不以 frozen 或最小补丁约束保留已授权替换的实现。
- 新 Agent Loop 和新消息/组件协议作为唯一现行 Chat 路径；功能重写不做旧版本兼容。完成切换后删除旧专属执行分支、旧接口/字段/配置/缓存读取路径、旧协议适配、fallback、自动格式转换、双读双写、feature flag 双轨及不再使用的测试/文档，所有调用端同步到新契约。
- 在现有入口与模块内完成重写，不复制一套并行 Chat 产品或通过新会话用途长期保留旧流程。实际路由和内部类名按新契约定稿。
- 复用现有用户、学科、资料、Conversation/Message 身份以及鉴权、安全出站、统一用量治理等业务基础。共有能力可做必要适配，但不能为 Chat 绕开或重写无关功能。
- 旧 Chat 数据保留不代表兼容旧格式。新运行链路只读取现行 schema，不通过旧记录纯文本投影、格式探测或自动转换维持旧版本可用；相关模块/契约与状态文档明确旧数据留存及不可用范围，需要显式迁移时单独定义执行方式。新结构通过追加迁移建立，不能伪造题卡/工具记录。删除业务数据或部署另按明确授权执行。

## 2. 当前实现与必要差量

| 当前源码事实 | 实施含义 |
| --- | --- |
| `Auralis-Server/pom.xml` 无 LangChain4j 依赖 | 先核实版本与 Java 21 / Boot 4 / Jackson 3 的兼容性，锁定依赖；不能照搬旧计划的 starter |
| `AiStreamingService` 固定检索、拼 prompt、一次 completion | 直接改写为有界工具循环；复用所依赖的身份与治理能力，不保留旧执行分支 |
| `AiProviderRequest.Message` 只有 role/content，`AiMessageRole` 无 TOOL，`AiProviderChunk` 无工具增量 | 必须增加受治理的工具消息/流式适配；单加 SDK 无法接通 |
| `OpenAiCompatibleProvider` 当前仅传 role/content、读取 delta.content | 在 Chat 适配中承载 tool definitions、call ID、参数、结果及 finish/usage，不改变 Overview 正文协议 |
| `ProviderHttpClient.postStream` 没有可供 Chat 使用的显式取消句柄 | 新增 Chat 流的取消传播和实际退出证据；停止 UI 不等于 Provider 停止 |
| `AiOperationPolicyResolver` 的 CHAT_TURN 对 completion stage 限 1，既有 LEARNING 策略也不支持任意 Loop | 新增受信任的 Chat Agent 操作用途和明确策略；不能只提高总 calls 或绕过 Guard |
| `ConversationService.reserveUserMessage` 仅短事务锁定，不覆盖整个生成期 | 新增原子执行占位和所有权/fence，保护跨请求与跨实例互斥 |
| `MessageEntity` 没有组件、题卡、submission、attempt 和工具记录 | 在现有 Conversation/Message 之上补最小持久记录，复用 owner、消息顺序与精确回复关系 |
| PC `aiStreamReducer` 聚合单个 content，Workspace 用 `renderMarkdown` 渲染 | 在消息边界加入有序片段/组件渲染，不重构整个 Workspace |
| Workspace 进入时会结束并删除旧 READING_SESSION；服务端 24h 无活动清理阅读会话 | 重写现有 Chat 的会话保留、恢复与清理规则，不另建长期双轨用途 |
| `useChatStore` 有离线 PENDING 自动重放 | 新 Agent 请求和题卡提交必须显式区分网络幂等重送、用户重试与自动收费重放 |

以上为 2026-10-29 只读核对，不代表本轮运行测试或真实 Provider 验证。

## 3. 运行架构

```text
PC 输入 / 题卡提交
  → 会话原子准入、请求幂等
  → 上下文构建器
  → LangChain4j 单 Agent Loop
      → 受治理的模型适配器 → 现有 Gateway/Guard/安全 HTTP
      → 授权工具执行器 → 资料公开读取能力
  → Markdown + NDJSON 流式解析
  → 有序 SSE 事件 → PC reducer → 时间线与组件
  → 消息/组件/作答持久化、状态查询、取消与用量结算
```

### 模型与共有执行治理

- 由 LangChain4j 模型接口接入现有 Gateway；按工具与流式语义重写 Chat 请求/事件结构。共有端口按真实调用边界调整，非 Chat 业务仍验证现有约束。
- LangChain4j 不自行创建绕过端点 allowlist、DNS pinning、凭据解析、reservation/dispatch/settle 的网络请求。
- 每次 completion 和检索 embedding 均属于当前执行的同一治理 task；工具循环不重置额度、deadline 或并发计数。平台/BYOK 来源继续逐调用确认。
- 工具 schema、历史和工具结果计入真实序列化请求的容量评估，不仅计算用户正文。
- 禁止框架默认重试在应用不知情的情况下重复派发；所有实际重试要有 attempt 和 reservation 证据。
- P0 冻结 Chat Agent 的循环、completion/embedding 次数、Token、时间、行/块/工具结果大小等配置含义；数值集中确定，不在组件内散落魔法数字。
- Provider 不支持工具调用或目标版本的取消/usage 能力时明确返回能力错误，不默默降级成另一套生成流程。

### 资料与历史上下文

- 前置当前问题、选区、授权资料范围、局部轻量目录及相关历史；总量按实际预算评估，不假定整份目录天然很小。
- 初始工具为 `search_materials`、`read_source_excerpt`、`read_outline`（拟名）。对每次读取验证 owner、subject/source 范围、READY/active、generation/revision；来源变更后不继续使用过期结果生成新引用。
- 原文、生成总览、用户材料区分标识；只为实际提供给模型的证据建立来源，不把检索候选都当成已入模引用。
- 当前轮工具结果保持完整；上一轮优先保留；较早结果按相关性和预算折叠。预算不足时上一轮也可精简。
- 折叠是代码对已保存数据的确定性投影，保留来源/版本/范围/查询锚点及必要摘录，不额外请求模型摘要，也不保证助手已复述全部证据。
- 工具请求/结果 ID、配对和顺序保持接口有效；完整历史与模型上下文分开保存。前缀缓存仅作测量指标。

## 4. 内容协议与事件流

### 模型输出

普通 Markdown 混排 `:::auralis-steps`、`compare`、`roadmap`、`chart`、`quiz`、`question` 等块（后缀拟名）。块内每行一个完整 JSON 对象，独立结束行 `:::` 关闭组件。组件使用有限的声明式字段，前端用现有 Vue 组件和净化后的 Markdown 渲染。

```text
普通讲解逐字出现……
:::auralis-steps
{"type":"meta","title":"请求流程"}
{"type":"item","title":"发起请求","description":"提交问题与资料范围"}
{"type":"item","title":"执行工具","description":"应用校验并读取资料"}
:::
补充讲解……
:::auralis-quiz
{"type":"stem","questionType":"single","question":"谁执行资料工具？"}
{"type":"option","key":"A","text":"模型本身"}
{"type":"option","key":"B","text":"应用服务"}
{"type":"reference","answer":["B"],"explanation":"模型提出请求，应用执行。"}
:::
```

- 单选/多选题有题干、唯一选项 key 和服务端参考行；开放问答卡有问题、输入配置和可选参考要点。参考放块尾，完成保存后才开放提交。
- 参考仅用于后续 LLM 讨论，不作为程序判分依据；正常解析到的 reference 不发送给前端展示/历史/恢复投影。
- 用户可以质疑答案，LLM 可核对原文纠正参考。偶发自然语言提前输出答案属于可接受的教学生成偏差，不设置苛刻保密恢复路径。
- 组件、题目、消息 ID 由应用分配，协议版本在应用侧明确。路线高亮只影响展示。

### 后端到 PC 的事件

复用现有认证 SSE 基础，在 PC 新协议中定义 started、text delta、工具 start/end/error、block start/item/complete/error、activity ready/submitted、终态和安全错误事件（拟名）。每个事件绑定 run/attempt、消息、迭代、片段/块身份及递增序号。

- 文本直接增量显示；项目在完整 JSON 行校验通过后插入。正常文字与组件不能重新排序。
- 每次模型迭代保留独立片段身份，同一助手回复关联所有文本和工具胶囊。前端不按“稍后是否调用工具”搬移已显示内容。
- 工具状态来自真实调用，不伪造固定耗时或数量；可见过渡说明照常显示，不依赖内部推理。
- 用户切账号/学科/会话后的迟到事件不能覆盖新上下文。重复或乱序事件按身份和序号处理。
- Chat 统一使用新协议，PC 直接消费时间线和组件。Mobile/Tablet 同步更新契约并按其现有展示能力消费公开文本投影，不能收到私有参考或未经解析的组件缓冲。具体入口与各端响应字段 P0 冻结，不保留旧执行协议协商。

### 流式解析与宽松恢复

- 状态包括正文、普通代码围栏、组件、已结束。跨网络 chunk 保留必要前缀，不把 chunk 当完整行。
- 维护反引号/波浪号围栏字符与长度，按 Markdown 规则匹配；普通代码围栏内所有 Auralis 标记均为代码。
- 仅在允许的独立行识别组件边界；组件内 JSON 字符串中的围栏、换行转义和 `:::` 不切换状态。
- 已完成 JSON 行解析、按块类型校验后，只发布公开字段；reference 正常转存私有记录。未知字段不作为任意 HTML/脚本执行。
- 坏 JSON 原始缓冲不回吐正文；发送 block error。遇到明显普通正文时允许关闭异常组件并恢复正文展示。偶发答案提前出现可接受，不因此隔离整段后文。
- 异常组件保留已显示有效项目并标记异常；题目缺必要内容则不可提交。不静默补造题目或答案。
- 行内中文、Markdown、代码与公式用序列化和既有 sanitizer 处理；长度/资源超限安全终止当前单元，不能无限缓存。

## 5. 题卡、提交与回复

### 生命周期与自动衔接

- 题卡展示状态：GENERATING / READY / SUBMITTED / INVALID。已提交显示选项或文本，不染对错颜色、不显示程序分数。
- 首版采用单次提交；同题的新 submissionId 再次提交返回已提交状态或明确冲突。网络重送同 submissionId 同内容回放，内容不同则拒绝。
- 用户草稿、选项在本地保留，只有提交成功才标记 SUBMITTED。
- 一次提交关联 questionId、questionVersion、submissionId、用户答案和可见摘要。不存在新的学习目标/步骤表。
- 提交成功后自动创建关联原题的用户消息和回复执行；模型负责点评、补讲、追问或继续，不增加“请先判分”的专用协议。
- UI 可由题卡显示用户输入，不再重复显示含原题/参考的长气泡；服务端仍保留与现有 assistant→USER 精确回复一致的稳定用户消息身份。

### 模型上下文边界

- 应用从服务端题目重建原题/选项，客户端只提交题目身份和答案，不信任客户端重传的参考内容。
- 原题、真实用户答案、服务端参考分区并标注来源。统一序列化/转义，禁止裸拼 XML 或把参考伪装成用户发言。
- 固定系统规则说明数据分区不是指令，参考可能有误；XML 标签本身不提供角色或权限隔离。
- 历史题卡提交时同时带当前相关对话；过期/删除/越权资料不能作为新检索授权，保留的历史题意按明确来源状态使用。

### 回合结束与重试

- READY 题卡应在本轮末尾。结束行后完整校验并持久化成功，立即关闭本轮公开输出和新工具执行，发送 activity ready，再尝试取消底层生成。
- 题卡只是本轮输出断点，不锁普通聊天。历史题卡在有效会话中可稍后提交。
- 回复执行独立保存 PENDING/RUNNING/COMPLETED/FAILED/CANCELLED 等状态，不用“已经输出几个字”冒充完成。
- 回复失败/取消时保留答案、已收到内容和关联消息，提供“重试回复”；同 submissionId 下创建新 attemptId，同 attemptId 的重复请求仅回放，不再收费派发。
- 重试创建新助手尝试或可审计的尝试投影，不能覆盖此前部分回复或把同一消息插入两次；具体消息关系 P0 冻结。
- 旧调用尚未真实结束或未知派发不满足恢复准入时，不创建新 attempt。费用、未知 usage 和先前消耗保持可追踪。

## 6. 会话、持久化、互斥与清理

### 会话保留

目标为同一有效 Chat 可刷新恢复内容与历史题卡。当前 READING_SESSION 的删除与 24h 清理不满足这一目标。

P0 直接定义现有 Chat 会话的保留、恢复与清理语义，复用 Conversation/Message，不新增 VISUAL_CHAT 双轨用途或学习领域。Workspace 按用户/学科保存可重新读取的会话身份，不随页面卸载删除；恢复当前 Chat 与新建/清空入口明确区分。清理服务、列表查询和实际消费端一并更新。现有 GENERAL/READING_SESSION 元数据是否还需区分展示入口，由真实消费者决定，不能继续承载两套不同的生成实现。保留期与账号/学科/会话删除规则在契约中明确，已有用户内容不因代码重写而被删除。

### 最小持久记录（拟定，具体 schema P0 冻结）

| 记录 | 关键关联与职责 |
| --- | --- |
| 现有 conversations/messages | owner、消息顺序、幂等用户消息、精确 assistant 回复，关联新协议版本 |
| Chat execution/attempt | conversation/request/submission、状态、owner/fence、deadline、实际 task、replyMessageId、安全错误和取消意图 |
| 有序消息片段/组件 | message、iteration、block、顺序、公开 payload、生成/完成/异常状态；支持快照恢复 |
| Activity + 私有 reference | 题目身份/版本、源消息/块、公开题意与服务端参考；普通 DTO 分离 |
| Submission | 唯一题目提交、客户端幂等身份、原答案、关联 USER 消息和各次回复尝试 |
| 工具 trace/证据 | 配对 ID、调用范围、结果快照/引用身份和用于折叠的元数据 |

先评估现有列和存储可复用点，再新增必要结构；不按每个 token 写数据库。题目 READY 与参考保存必须原子，提交与自动回复执行的持久意图必须原子或有可恢复回执，避免答案已存却永远未启动回复。刷新读取快照和当前状态，不要求完整 SSE 日志无限重放，也不承诺后台自动续跑生成。

### 单会话互斥

- 准入在持久短事务中原子检查并占位。同请求重放优先；不同新请求遇有效执行返回 HTTP 409 / `SESSION_GENERATING`（拟新增），不创建新消息、不预留新费用。
- 不在 Provider I/O 期间持有数据库行锁；不靠单进程 mutex 提供跨实例保证。进程重启后的占位恢复与旧结果 fence 需要明确实现。
- 无服务端消息排队。生成中发送按钮提供停止，题卡提交 disabled；聊天/问答输入及选择草稿保留。
- 停止展示、请求取消、实际 Provider/工具退出和互斥释放分别记录。取消确认后用户手动发送，不自动把草稿变成下一次收费请求。
- 新协议断线后可读取状态/快照，不沿用旧离线队列自动新建收费执行。未知派发按账本证据处理。
- Conversation/Subject/Source 软删、硬删、账号注销和本地缓存清理接现有生命周期；新增记录不得变为孤儿或跨 owner 可读。

## 7. 分阶段任务与文件边界

### P0 接线与契约冻结

- [x] 创建 `codex/chat-agent-rewrite` 独立工作树并带入当前工作状态；更新为在原入口上直接重写。
- [ ] 列出当前 Chat 的所有服务端/PC/Mobile/Tablet 消费点，以及直接替换、删除、共有复用的文件清单；按 dirty 基线区分并行改动。
- [ ] 锁定 LangChain4j 版本及必要模块，验证 Boot/Jackson、工具流、usage、取消；记录实际 Provider 的工具支持，不换模型或擅自调用真实服务。
- [ ] 定稿 Gateway model adapter、Chat Agent 操作用途和配置清单；保留现有安全 HTTP 出站路径。
- [ ] 定稿唯一 Chat 契约、组件行 schema、事件 envelope、题卡提交/回复重试/快照/取消接口和所有消费端的切换清单。
- [ ] 定稿会话用途与恢复入口、最小 schema、消息投影、请求与 attempt 身份、原子提交和删除政策。
- [ ] 把拟定契约整理为实施差量，具体代码变更时同步 API/Database/OpenAPI；P0 不把计划写成已实现接口。

允许目录：本计划、相关设计/产品/架构文档；依赖兼容探针放 D:/Temp，不修改生产实现。验收：关键适配与生命周期都有具体契约，无依赖“SDK 自动处理”的空白。

### P1 流式协议与 PC 渲染纵切

- [ ] 实现纯增量解析器和有序事件 reducer，用合成流验证文字、steps、quiz、question。
- [ ] 直接重写 PC Chat 的消息渲染、reducer 和 Store 接线，形成组件容器、时间线、表单草稿及生成/异常/就绪显示；复用既有 Markdown sanitizer、公式/代码渲染和主题。
- [ ] 覆盖逐字/逐项、任意分片、围栏示例、坏行/漏结束、宽松恢复、重复事件和页代际切换。
- [ ] 扩展 compare/roadmap/chart 的行 schema 和组件，图表采用受控数据渲染。

允许目录：Server ai 内协议/解析单元、PC `src/services/aiStream*`、`src/api/sse.ts`、`src/components/chat/`、`src/store/useChatStore.ts` 与 `SubjectWorkspace/index.vue` 的 Chat 范围、对应测试。允许重组 Chat 专属实现，Workspace 非 Chat 区域保持当前范围。合成原型不宣称模型链路完成。

### P2 LangChain4j、工具与执行治理

- [ ] 重写现有 Chat 服务为 P0 冻结的模型/工具循环，工具请求和结果精确配对，覆盖 text/tool 混合和多迭代 usage；切换后删除旧固定检索生成链及其废弃接线。
- [ ] 增加授权的搜索、原文和大纲工具；确定性上下文构建、历史折叠和精确来源。
- [ ] 接入独立 Chat Agent operation 和既有 reserve/dispatch/settle；配置总/阶段/运行边界，处理 BYOK 与平台来源。
- [ ] 实现原子会话准入、取消传播、重启后状态恢复与 late-result fence；工具和模型结束前不释放执行权。
- [ ] 用合成 Provider 把真实 SSE 工具胶囊和 P1 组件接通，关闭框架隐式重试旁路。

允许目录：Server `pom.xml`、ai 与其 internal provider/security/persistence、必要共享配置及追加迁移、PC Chat API/controller/store，以及 Mobile/Tablet Chat 的必要协议/文本消费接线。共有 HTTP/Gateway 对 Overview、embedding 和其他业务的约束不回归；旧 Chat 实现不是回归目标，测试按新需求重写。

### P3 题卡提交、保存与恢复闭环

- [ ] 接通可保留会话、公开/私有 DTO、组件快照、历史题卡恢复与删除。
- [ ] 单/多选和开放问答单次提交；稳定 USER 消息身份，原子落库并自动触发回复。
- [ ] 上下文来源分区，用户答案与原题精确关联；程序仅校验提交，不判分。
- [ ] 题卡 READY 后硬停止；LLM 普通回复接续，失败/部分输出/取消后同提交的新 attempt 可控重试。
- [ ] 前端忙碌互斥、停止确认、草稿保留、历史提交、刷新和账号切换都沿新契约，不自动收费重放。
- [ ] 对照 P0 消费点清单完成各端新契约切换，删除旧 Chat fallback/协议分支和失效测试；保留真实业务历史数据，更新新需求对应测试。

允许目录：P2 的 Chat 持久化/API、PC 聊天组件/Store 及实际调用端；会话清理规则按本次重写范围同步。复用原身份/消息能力，不修改 KB/Review/核心 Sync。

### P4 整合验证与实际验收

- [ ] 按契约变化完成相关、全量与构建门禁，汇总一次最终验证证据；已跑且文件未变的结果不重复执行。
- [ ] 默认一个只读 reviewer 检查 correctness、并发、权限、数据完整性及需求；OPTIONAL 不在任务内顺手修改。
- [ ] 实际 Provider、Tauri UI 的工具调用、流式组件、两类提交、停止、刷新和失败恢复分别记录，按当次授权执行，不自行部署/操作业务库。
- [ ] 统计格式成功率、局部异常、首字/首项延迟、循环次数、token 和可恢复情况，不仅看是否成功返回。

## 8. 验证节奏和命令

本轮仅文档：检查本计划、相对链接、登记及文档差量，不运行应用测试/构建。

后续实施按 [BeforeCoding](../agent/BeforeCoding.md)：每个交付阶段全部编辑完成后统一检查；类型/静态 → 对应测试 → 构建。依赖、共有层、API/数据库/鉴权并发变化完成后需要全量与构建，可合并为阶段交付门禁，不在编辑过程中反复执行。同一失败最多三次重试，保留真实输出。

现有命令基线（下列本轮未执行）：

```powershell
# cwd: D:/CodeBase/Active/Auralis/Auralis-Server
.\mvnw.cmd -B -ntp '-Dtest=AiStreamingTests,AiStreamingControllerTests,AiConversationServiceTests,AiConversationControllerTests,PromptAssemblerTests,ProviderHttpClientTests,ChatAiExecutionSafetyTests,AiInvocationGatewayTests' test
.\mvnw.cmd -B -ntp test
.\mvnw.cmd -B -ntp package

# cwd: D:/CodeBase/Active/Auralis/Auralis-PC
npm.cmd run type-check
npm.cmd run check:r4-pc
node --experimental-strip-types --test scripts/r4-ai-stream.test.mjs scripts/r4-reliability.test.mjs scripts/r4-reading-session.test.mjs
npm.cmd run test:r4-pc
npm.cmd run build

# cwd: D:/CodeBase/Active/Auralis
pwsh -NoProfile -File scripts/check-openapi.ps1
```

新增协议、执行、提交、迁移及组件测试类在 P0/P1 确认名称后加入 focused batch，不把示例类名当成已存在测试。真实 PostgreSQL 覆盖会话竞争、幂等、取消/重启和删除；模拟流覆盖任意分片、异常尾部、工具重入与部分回复。

## 9. 文档、委派与工作树保护

- 本计划实施时同步 ProductRequirements、Architecture、Frontend、FrontendPC、Backend、API、Database 与当阶段真实 Status/Issues；新增公开契约更新 OpenAPI 和 SDK。配置变化同步 Infrastructure/Deployment/Runbook，已发生的交付才进入 Changelog。
- 普通实现/检查依 AGENTS 委派；前端实现按仓库 Antigravity MCP 规则先提交计划、目录范围与验证命令，再实施授权差量。纯计划编写不调用前端生成工具。
- 前端委派返回后核对完整 diff、生成/依赖/删除和跨模块写入。高风险策略/并发/迁移由主 Agent 决策，最终一次只读 review；不重复执行已有证据的普通检查。
- 在 `codex/chat-agent-rewrite` 的独立工作区实施。原目录保持原分支与未提交状态；带入的 Overview 与资料处理文件作为工作基础，按 dirty 基线隔离，不归因到 Chat 交付。Chat 专属代码按新方案直接替换并删除弃用执行路径；证据放 D:/Temp，不清业务缓存、不删除数据、不恢复用户修改。
- 官方能力参考仅用于 P0 选型，以实际锁定版本验证为准：[Tools](https://docs.langchain4j.dev/tutorials/tools/)、[Streaming](https://docs.langchain4j.dev/tutorials/response-streaming/)、[ChatMemory](https://docs.langchain4j.dev/tutorials/chat-memory/)、[NDJSON](https://github.com/ndjson/ndjson-spec)。

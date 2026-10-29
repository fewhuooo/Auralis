# Chat Agent 与流式可视化教学重写计划

日期：2026-10-29（Asia/Hong_Kong）

状态：Chat 需求/消费点与核心执行、投影、账务规则已冻结。稳定 `langchain4j-core:1.22.0` 与 Boot 4.1.0/Jackson 3.1.4 的隔离兼容探针通过 5/5；Server 纯 parser 单元 15/15，PC 内容投影/组件基础 type-check exit 0、Node 测试 6/6。唯一 reviewer 已复核围栏 info string 疑点并关闭，且未发现前端 BLOCKER/IMPORTANT。PC 尚未接入 Workspace、Store、SSE API 或 reducer，也未挂载/GUI 验收。Server Chat 生产接线尚未开始；Gateway adapter、运行配置、DTO 与持久化 schema 仍未冻结。本文件中的新接口、事件与对象字段均为目标契约，不代表现有生产能力。

执行分支：`codex/chat-agent-rewrite`。工作区：`D:/CodeBase/CodexWorktree/chat-agent-rewrite/Auralis`。主 Agent 已将 `main` fast-forward 并 push 至 `20b5c87`；本分支从该基线继续。旧 main 工作副本的未提交变化已 stash 备份。并行改动不自动归入 Chat 交付。

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
| PC Workspace 换文件/卸载时调用 endActiveSession 并最终 deleteSession；服务端 cleanupInactive 有 24h 截止，但当前 Java 生产代码中未找到 scheduler/caller（仅服务方法与测试直接调用） | 实际运行删除路径是 PC；重写后同一有效 Chat 不随文件/页面生命周期删除，目标不增加 TTL 清理 |
| `useChatStore` 有离线 PENDING 自动重放 | 新 Agent 请求和题卡提交必须显式区分网络幂等重送、用户重试与自动收费重放 |

以上为 2026-10-29 只读核对，不代表本轮运行测试或真实 Provider 验证。

### P0 消费点盘点（只读核对，源码基线 20b5c87）

| 范围 | 当前入口与证据 | 本次重写的消费点 |
| --- | --- | --- |
| Server 路由 | `Auralis-Server/src/main/java/com/auralis/app/ai/AiController.java:100-151`：会话列表/创建/详情/删除及 `POST /api/ai/messages/stream`；同一 controller 的 settings、suggestions、usage、Overview 等非 Chat 能力保留 | 保留认证 SSE 入口路径，切换为新 Chat DTO/事件；不为 Chat 保留旧 DTO/event fallback |
| Server Chat 执行/会话 | `AiStreamingService.java:58-265`；`ConversationService.java` 的 list/get/reserve/append；`ReadingConversationCleanupService.java:15-37` | 旧固定检索→单次 completion Chat 执行链被新 Loop 替换；Conversation/Message owner、顺序、精确回复身份共用并补充快照/组件持久化。24h cleanup 当前没有生产调用者 |
| PC transport/reducer | `Auralis-PC/src/api/aiClient.ts:78-124`、`src/api/sse.ts:18-24,50-`、`src/services/aiStreamController.ts:27-65`、`src/services/aiStreamReducer.ts:20-34` | 继续调用同一 Chat 路由；改为新请求/事件类型与有序 segment reducer，保留共用 SSE framing |
| PC Store/页面 | `Auralis-PC/src/store/useChatStore.ts:213-240,440-478,492-534`；`src/views/SubjectWorkspace/index.vue:842-944,1728-1740,2763-2916,2942,3163` | Store 与 Workspace Chat 范围切换到新消息/组件/题卡/快照；修正换文件和卸载时删除会话，并将离线未提交内容限定为草稿 |
| Mobile Chat | `Auralis-Mobile/src/api/aiClient.ts:126,193-230`；`src/pages/mobile/ai-search/index.vue:446` | 删除进程内 user→conversation Map；Chat 调用必须持有显式 conversationId；消费公开文本投影 |
| Tablet Chat/历史 | `Auralis-Mobile/src/pages/tablet/ai-search/index.vue:291-315,473`；`src/pages/tablet/workspace/index.vue:1484-1499` | 流式 Chat 改为新契约；历史列表选中会话后用 conversation detail/snapshot 读消息，不能把 message-less list 当历史正文 |
| 非 Chat 单次文本生成 | `Auralis-Mobile/src/api/aiClient.ts:205-215`、`src/store/useSubjectStore.ts:176`、`src/pages/tablet/workspace/index.vue:1691-1705` | extraction/JSON formatting/handwriting Markdown 和 Tablet summary 从 Chat Loop 移出，使用独立 one-shot text generation 操作 |

实际旧消费点不含新增组件 UI；Mobile/Tablet 以文本能力为主。Server 会话 list 当前不含 messages，详情才读取有序消息；PC Workspace 当前没有从详情恢复会话，并在换文件/卸载时结束会话。`cleanupInactive()` 的 24h 是方法内部筛选，不等于生产定时任务。

### 替换、删除与共享复用清单（目标，未实现）

- **原入口直接替换**：Server 的 `POST /api/ai/messages/stream` 只执行新 Chat Loop；PC `aiClient / SSE types / controller / reducer / useChatStore / SubjectWorkspace` 一起切换；Mobile AI Search、Tablet AI Search 与 Tablet Workspace 的 Chat 调用跟随同一协议。所有 Chat 消息关联显式 `conversationId`。
- **删除旧 Chat 专属路径**：固定检索后单次 completion 的 Chat 分支、旧请求/事件 DTO、旧事件 reducer/字段、Mobile 进程内 `conversationIds` Map、PC 会话换文件/卸载即删的 READING_SESSION 接线，以及 Chat 离线恢复时自动派发 PENDING 收费请求；不转换旧记录、不提供双读、fallback 或 feature-flag 双轨。对应测试迁移到新契约。
- **独立 one-shot operation**：拟新增 `POST /api/ai/text-generations`，只承载摘要/提取/格式化/转写等非对话单次生成。共享认证、用户设置/BYOK、`AiInvocationGateway`、额度/审计与安全 HTTP 出站基础；不复制旧 `AiStreamingService` 的整条 Chat 检索/流式执行链。该 endpoint 与 DTO 尚未实现或进入 API/OpenAPI。
- **保留共享能力**：Conversation/Message owner 与顺序、认证/授权、settings/BYOK/env、`AiInvocationGateway` / `AiUsageGuard`、Provider 安全 HTTP allowlist/DNS pinning、来源 READY/revision 校验、低层 SSE framing；`Overview`、Review、核心 Sync 与非 Chat controller 路由保持现状。Chat 与 one-shot 可共用治理基础，不共享 Chat Loop。
- **运行/存储可恢复性**：Chat 单次执行、题卡提交与回复重试使用同一 Loop。提交是原子保存 submission、关联 USER 消息和回复执行意图；程序只校验结构与归属，不判分、不写正确率/掌握度。刷新取 detail/snapshot；未知派发不自动重跑收费执行。

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

- 固定依赖为稳定版 `langchain4j-core:1.22.0`，不引入 starter、内置 HTTP client 或隐式 Agent loop。应用通过显式 orchestrator 循环调用模型、处理工具和结束条件；逐 iteration 组装上下文并写入 attempt/iteration 身份，执行权限由当前 owner/conversation fence 校验，模型每次派发都走既有预算 task 和独立 reservation/dispatch/settle。
- 由 LangChain4j 模型接口接入现有 Gateway；按工具与流式语义重写 Chat 请求/事件结构。共有端口按真实调用边界调整，非 Chat 业务仍验证现有约束。隔离兼容探针已证实 core 内部 Jackson2 codec 可与应用 Jackson3.1.4 共存；生产 mapper、Gateway 与 Provider adapter 仍待实现。
- LangChain4j 不自行创建绕过端点 allowlist、DNS pinning、凭据解析、reservation/dispatch/settle 的网络请求。
- 每次 completion 和检索 embedding 均属于当前执行的同一治理 task；工具循环不重置额度、deadline 或并发计数。每次 iteration 都以当前 conversation/run/attempt fence 和该治理 task 的额度账本为准，不以 SDK 隐式循环代替应用记录。平台/BYOK 来源继续逐调用确认。
- 工具 schema、历史和工具结果计入真实序列化请求的容量评估，不仅计算用户正文。
- 禁止框架默认重试在应用不知情的情况下重复派发；所有实际重试要有 attempt 和 reservation 证据。
- P0 冻结 Chat Agent 的循环、completion/embedding 次数、Token、时间、行/块/工具结果大小等配置含义；数值集中确定，不在组件内散落魔法数字。
- Provider 不支持工具调用或目标版本的取消/usage 能力时明确返回能力错误，不默默降级成另一套生成流程。

### 迭代、工具流与业务/账务状态

- 应用显式控制每次 completion → 工具执行 → 下一 iteration 的循环。iteration 开始前确定性构造模型上下文；每次写消息、片段、工具 trace 或终态都验证 run/attempt/conversation fence。单个预算 task 覆盖本轮的全部模型/embedding 调用，但每次模型调用保留独立 reservation 与真实 usage。
- 按 provider response 中的 tool call `index` 聚合增量，同一响应中的每个调用分别累积 `id`、`name` 和 `arguments`，并绑定响应与顺序；text delta 独立交给 Markdown/组件 parser。不得把零散 arguments 当成可执行参数。
- 只有正常、有效的 tool-call 终止响应且所有聚合调用的 ID/name/完整参数均通过 schema 和授权校验后，才逐项执行工具。异常 EOF、连接中断或 cancel 即使已有部分 tool delta，也不得执行；完成与错误终止不可混淆。
- 对照现行 `AiUsageGuard` / `AiUsageGatewayService`：dispatch 后缺失或不完整 Provider usage 不表示 0，正常成功 settlement 仅在完整 usage 时按实际 token 结算，否则沿既有 `estimated_input_tokens + reserved_output_tokens` 保守收费；失败且已派发按现有保守规则收费，未派发才可释放 reservation。不得用输入/输出字符数填入实际 token，也不得以题卡/业务完成释放已派发费用。
- 业务运行态（如题卡已 READY、回复或迭代正常结束）与 reservation settlement/账务可接受性分开持久化。只有当前 owner/fence 校验成功并已原子持久化 READY 的题卡，后续服务端主动取消和保守结算才不能倒改成业务 FAILED。若 `settleSuccessful.accepted=false` 表示 task/execution lease 或 owner/fence 已失效，且 READY 尚未原子保存，则不得忽略拒绝或发布 READY。结算异常不能覆盖已经持久化的业务终态；分别记录 safe accounting error、真实 usage 缺失和业务终态，query 返回持久快照中的真实状态。执行互斥仅在模型/工具 worker 实际退出、取消已确认退出或异常终止已收敛后释放；停止展示/断开 SSE 不构成 worker 已退出的证据。
- 代码路径核对：`AiUsageGuard.java:262-295,299-332,644-649` 实现 settlement 与缺失 usage 保守计费；`AiUsageGatewayService.java:287-322` 在 dispatch/调用后结算并对不接受的 settlement 抛限额异常；当前 `AiStreamingService.java:183-229` 将该异常分支映射到消息失败，需在重写时拆开业务终态与账务状态。`AiTaskScope.close()` 调 `guard.closeTask`（`AiUsageGatewayService.java:573-578`），当前 Chat 在 finally 调用（`AiStreamingService.java:225-228`）；新 worker 生命周期应先确认真正退出再 close。

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

### P1 块行 schema（规则已冻结；纯 parser 已实现，未接入 Chat 运行链）

每个块仅接受对应白名单字段；未知字段忽略，未知 rowtype 使当前块 INVALID。应用为 block、item、activity 和 message 分配稳定 ID。`reference` 只保存在服务端私有记录，不进入客户端公开投影。

| 块 | 有序 NDJSON 行与约束 |
| --- | --- |
| `steps` / `compare` | 首行 `meta`：`title` 必填，`description` 可选；之后至少一行 `item`：`title` 必填，`description` 可选。 |
| `roadmap` | 同 `steps`；`item` 可额外有 `tag: string`、`current: boolean`，只影响展示。 |
| `chart` | 首行 `meta`：`chartType` 必填且为 `bar` 或 `proportion`，`unit` 可选；之后 `item` 的 `label` 必须非空，`value` 必须有限且非负。`proportion` 的总和须大于 0，不要求等于 100。 |
| `quiz` | 首行 `stem`：`questionType` 为 `single` 或 `multiple`，`question` 非空；之后至少 2 个 `option`，每个 `key` 唯一且 `text` 非空；末行必须为唯一 `reference`，`answer` 为选项 key 数组且不重复，single 恰好 1 项、multiple 至少 1 项，`explanation` 可选；其后不允许再有行。 |
| `question` | 首行 `stem`：`question` 非空，`placeholder` 可选；可无 `reference`，若有则必须是末行；允许 `points: string[]` 或 `answer: string`，`explanation` 可选。 |

单选/多选和开放问答的提交都只是把用户答案组装成关联原题的短 USER 消息交给 LLM；程序只校验协议形状、选项归属和提交幂等性，不判分、不计算正确率或掌握度。此表是 P1 parser/UI 的输入契约。独立 `ChatStreamParser` 和对应 15 项单元测试已实现；parser 尚未接入 Chat 执行、SSE、reducer 或 UI。唯一 reviewer 已复核围栏 info string：实现先识别 delimiter run 再处理 info 字符，tests 250–276 覆盖全部 split，该 IMPORTANT 已关闭。

### 后端到 PC 的事件

复用现有认证 SSE 基础，在 PC 新协议中定义 started、text delta、工具 start/end/error、block start/item/complete/error、activity ready/submitted、终态和安全错误事件（拟名）。每个事件绑定 run/attempt、消息、迭代、片段/块身份及递增序号。

- 文本直接增量显示；项目在完整 JSON 行校验通过后插入。正常文字与组件不能重新排序。
- 每次模型迭代保留独立片段身份，同一助手回复关联所有文本和工具胶囊。前端不按“稍后是否调用工具”搬移已显示内容。
- 工具状态来自真实调用，不伪造固定耗时或数量；可见过渡说明照常显示，不依赖内部推理。
- 用户切账号/学科/会话后的迟到事件不能覆盖新上下文。重复或乱序事件按身份和序号处理。
- Chat 统一使用新协议，PC 直接消费时间线和组件。Mobile/Tablet 同步更新契约并按其现有展示能力消费公开文本投影，不能收到私有参考或未经解析的组件缓冲。具体入口与各端响应字段 P0 冻结，不保留旧执行协议协商。

### P0 Chat API、事件和公开投影（拟案，未实现）

- 唯一 Chat Loop 复用 `POST /api/ai/messages/stream` 路径并更换为唯一新 DTO；它只承载 Chat，不接受旧字段/事件兼容。请求至少含 `action`（`turn` / `activity_submission` / `retry_reply`）、必填 `conversationId`、客户端幂等 `requestId` 和相应消息/题目身份。新会话先显式创建，再带 conversationId 执行。
- 普通发言、题卡提交、对失败/取消回复的重试都进入同一执行与消息/事件协议。提交通过一个短数据库事务原子写入 `Submission + 关联 USER Message + PENDING attempt + 预分配 replyMessageId + 会话执行占位`，事务提交后才调用模型；事务内不做 Provider I/O。刷新/进程重启可 query pending/terminal 状态，只有用户显式 retry 才对稳定 submission 创建新 attempt；相同 attempt 的网络重送只回放状态，不重复保存关联消息或再次 dispatch/charge，该 submission 上的新 attempt 各自按实际模型派发记入 reservation。相同身份不同答案拒绝；不做自动排队或崩溃后自动重派。
- 历史读取复用 `GET /api/ai/conversations/{conversationId}` detail，返回完整有序公开 snapshot；会话列表继续只作目录。Tablet 选历史会话时必须读 detail，而非期待 list 带 messages。独立 status/cancel operation 需要存在，但具体 route 与 DTO 名称仍待 P0 API 冻结。
- 拟事件 envelope：`protocolVersion, conversationId, requestId, runId, attemptId, messageId, replyToMessageId, iterationId, blockId, sequence, event, payload`。应用生成除 `requestId` 外的运行/消息/块身份，`sequence` 在 run 内单调递增。
- 拟事件名：`run.started`, `text.delta`, `tool.started`, `tool.completed`, `tool.error`, `block.started`, `block.item`, `block.completed`, `block.error`, `activity.ready`, `activity.submitted`, `run.completed`, `run.failed`, `run.cancelled`。工具事件描述真实调用；Chat text segment 逐字保留模型正文，组件只在整行校验后逐项公开。
- 服务端在回复完成或中断收敛时，确定性地从已保存公开片段生成公开 Markdown 投影并写入 `messages.content`；结构化 segment/activity/tool 数据分别存储，不把它们塞进 `content` 后再解析。Mobile/Tablet 与 PC 历史文本统一消费同一个 `messages.content` 公开投影，实时端也只能用同一公开规则；原始 NDJSON 缓冲、`reference`/答案要点和私有工具证据不进入公开投影、客户端 DTO、历史快照或移动端日志。
- `reference` 在服务端私有存储中保留，不能由普通消息内容或 snapshot 泄漏。模型自然语言可能在 reference 行之前提前说出答案属于已接受的生成偏差，不承诺绝不提前泄题，也不因此隔离整段后文。
- 非 Chat 单次任务调用独立 `POST /api/ai/text-generations`，拟请求 `{operation, input, requestId?}`、响应 `{text}`；operation 白名单至少覆盖 summary、extract/JSON、format Markdown 与当前 transcript/text 生成。request/response 字段和限额仍待 API 冻结。

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
- 回复执行独立保存 PENDING/RUNNING/COMPLETED/FAILED/CANCELLED 等状态，不用“已经输出几个字”冒充完成。题卡 READY/提交成功等业务状态与 provider usage、费用结算状态独立；结束时没有 usage 按现行 Guard 保守结算，不能推导为零费用或业务失败。
- 回复失败/取消时保留答案、已收到内容和关联消息，提供“重试回复”；同 submissionId 下创建新 attemptId，同 attemptId 的重复请求仅回放，不再收费派发。
- 重试创建新助手尝试或可审计的尝试投影，不能覆盖此前部分回复或把同一消息插入两次；具体消息关系 P0 冻结。
- 旧调用尚未真实结束或未知派发不满足恢复准入时，不创建新 attempt。只有 worker 实际退出后才释放执行互斥；费用、缺失/未知 usage 和先前消耗保持可追踪。业务已成功后出现独立的 settlement 拒绝不得改写业务成功状态；若 READY 写入前 fence/owner 已失效，则拒绝发布 READY。

## 6. 会话、持久化、互斥与清理

### 会话保留

目标规则已冻结，物理 schema/事务仍待 P0 实施设计：

- PC 的会话身份按认证用户 + subject 保留；切换当前文件只改变本轮 `readingContext`，不创建另一条 Chat，也不删除会话。页面卸载、换学科前的组件清理只停止当前 UI 工作，不删服务端历史。
- 不新建 `VISUAL_CHAT` 双轨 purpose、不引入全局学习目标/进度/掌握度。复用现有 Conversation/Message 语义，允许现有 purpose metadata 仅服务历史展示；具体列表筛选需按当前消费端核对。
- 24h 是 `ReadingConversationCleanupService.cleanupInactive()` 的方法内截止条件；只读搜索没有找到生产 scheduler/caller，测试会直接调用该方法。当前实际运行删除由 PC `SubjectWorkspace/index.vue:1728-1740,2942,3163` 调 `endActiveSession`，再由 `useChatStore.ts:492-534` 调 `deleteConversation` 并 tombstone 本地记录。该删除行为在新 Chat 中移除。
- 刷新/重登恢复按同一显式 conversationId 调 detail/snapshot；Conversation list 只作目录，现有 Server `ConversationService.list()` 返回空 messages，而 `get()` 才读有序消息。Tablet 历史选择必须获取 detail，不从 list 推断内容。
- Mobile/Tablet 每个 Chat 命令显式携带 `conversationId`；删除 `Auralis-Mobile/src/api/aiClient.ts` 的进程内 user→conversation Map。PC 当前会话身份在 owner+subject 范围稳定。
- 会话没有自动 24h/TTL 删除；只有显式删除或既有账号/学科清理生命周期可移除记录。新代码不删除已有用户数据，也不在运行时转换旧格式；没有新 schema 的旧记录可以保留但不进入新组件/活动执行。
- 离线时只留本地草稿，不自动创建或重放新的收费执行；联网后由用户明确重发。未知派发仍依据账本证据处理，不自动重跑。

### 最小持久记录与字段（拟案，未实现）

| 对象 | 拟字段与职责 |
| --- | --- |
| Conversation / Message | 现有 `ownerUserId`, `conversationId`, `messageSequence`, `role`, `status`, `replyToMessageId`; 增加/关联 `protocolVersion` 与公开有序 segment。 |
| `ChatRun` | `runId`, `ownerUserId`, `conversationId`, `requestId`, `status`, `deadlineAt`, `fenceVersion`, `createdAt/updatedAt`；以 owner 和 fence 防止跨账号/迟到结果写入。 |
| `ChatAttempt` | `attemptId`, `runId`, `attemptNumber`, `status`, `replyMessageId`, `cancelState`, `usage/reservation references`, `safeErrorCode`；每次用户重试新 attempt，不覆盖旧输出或费用。 |
| `MessageSegment` | `segmentId`, `messageId`, `iterationId`, `sequence`, `kind(text/tool/block)`, `blockId`, `componentType`, `status`, `publicPayload`, `publicTextProjection`；供 detail snapshot 恢复。 |
| `Activity` | `activityId`, `conversationId`, `messageId`, `blockId`, `questionVersion`, `questionType`, `state`，白名单公开 question/options/placeholder；不含 reference。 |
| `PrivateReference` | `activityId`, answer key(s)/answer text, points, explanation；服务端私有存储与调用，不进入普通消息 DTO、日志和 snapshot。 |
| `Submission` | `submissionId`, `activityId`, `questionVersion`, `answer`, `requestId`, `userMessageId`, `replyRunId`, `status`；唯一提交与原子关联短 USER 消息/回复执行意图。 |
| `ToolTrace` | `runId`, `attemptId`, `toolCallId`, `toolName`, `sequence`, `status`，授权范围、结果/来源引用身份；结果按恢复/折叠需要保存。 |

表中对象名和字段仍是契约建议，尚未进入 Database/API/OpenAPI；这不是新表清单或表数量承诺，不预设 6 张表。先评估 Conversation/Message、既有账本及可复用关系，再追加真正必要的结构；不按每个 token 写数据库。题目 READY 与私有 reference 保存必须原子；submission、关联 USER 消息、PENDING attempt、预分配 reply ID 和会话占位必须在一个短事务原子提交，之后事务外调用模型。崩溃后通过 query 显示持久状态，由用户显式 retry 创建新 attempt；相同 attempt 的请求重送不重复保存 message 或重复 dispatch/charge，新 retry attempt 的 Provider 调用各自按 reservation 结算。不创建自动队列。刷新读取快照和当前状态，不要求无限重放 SSE 日志，也不承诺后台自动续跑生成。

### 单会话互斥

- 准入在持久短事务中原子检查并占位。同请求重放优先；不同新请求遇有效执行返回 HTTP 409 / `SESSION_GENERATING`（拟新增），不创建新消息、不预留新费用。
- 不在 Provider I/O 期间持有数据库行锁；不靠单进程 mutex 提供跨实例保证。进程重启后的占位恢复与旧结果 fence 需要明确实现。
- 题卡提交事务与新 run 准入同一原子边界，持久化 submission、关联 USER 消息、PENDING attempt、预分配的助手回复身份和会话占位；模型调用发生在事务结束之后。服务端 query 暴露 pending/终态，用户显式 retry 才能开始新 attempt；无自动队列/自动重派。
- 无服务端消息排队。生成中发送按钮提供停止，题卡提交 disabled；聊天/问答输入及选择草稿保留。
- 停止展示、请求取消、实际 Provider/工具退出和互斥释放分别记录。取消确认后用户手动发送，不自动把草稿变成下一次收费请求。
- 新协议断线后可读取状态/快照，不沿用旧离线队列自动新建收费执行。未知派发按账本证据处理。
- Conversation/Subject/Source 软删、硬删、账号注销和本地缓存清理接现有生命周期；新增记录不得变为孤儿或跨 owner 可读。

## 7. 分阶段任务与文件边界

### P0 接线与契约冻结

- [x] 在 `codex/chat-agent-rewrite` 从 `20b5c87` 基线继续；main 已 fast-forward/push，旧 main 工作副本变化已 stash 备份。
- [x] 盘点 Server、PC、Mobile、Tablet 的实际消费点，以及原入口替换、弃用路径删除和共享治理复用清单；证据见本计划 `P0 消费点盘点`。
- [x] 选定稳定 `langchain4j-core:1.22.0`，不使用 starter、内置 HTTP client 或隐式 `AiServices` Loop；预期使用其内部 Jackson 2 codec，而应用 HTTP/持久化/NDJSON 保持 Jackson 3.1.4，不采用 beta32 Jackson 3 codec、不加静态 mapper bridge、不改 Boot BOM。
- [x] 隔离验证 Boot mapper 共存及 LangChain4j core model/tool/usage/cancel API：`langchain4j-core:1.22.0`、Jackson2 core `2.21.4` 与 Boot Jackson3 `3.1.4` 共存，Boot context 仅有单一应用 Jackson3 mapper，探针 5/5、Maven exit 0；不含 LangChain4j starter、Provider HTTP 或 beta32 codec。详情见 `D:/Temp/auralis-chat-p0-20261029/adapter/reports/report.md`。真实 Provider 与取消到 Auralis HTTP 的映射不在探针证明范围。
- [ ] 定稿 Gateway model adapter、Chat Agent 操作用途和配置清单；保留现有安全 HTTP 出站路径。
- [x] 冻结唯一 Chat Loop、非 Chat one-shot 分离、逐字正文/逐项 NDJSON、单/多选/开放问答提交与 LLM 衔接、不判分，以及 Mobile/Tablet publicTextProjection 和无旧 fallback 的方向。
- [x] 冻结 PC owner+subject 会话保留、文件切换不删除、Mobile 显式 conversationId、Tablet detail/snapshot 历史恢复、无 TTL、离线不自动收费重放、旧数据保留且无运行时转换的最小产品语义。
- [x] 冻结 P1 块行 schema；当前候选含 `Auralis-Server/src/main/java/com/auralis/app/ai/internal/chat/ChatStreamParser.java` 纯 parser 单元，15 项通过；它尚未接入 Chat 运行链。
- [x] 唯一 reviewer 复核 parser code fence info string：delimiter run 在 info 字符前识别，tests 250–276 覆盖全部 split；原 IMPORTANT 关闭。PC 新增内容基础的实现复核未发现 BLOCKER/IMPORTANT。
- [x] 冻结应用显式 iteration orchestrator、逐 iteration 上下文与 run/attempt fence、逐模型调用账本；工具 delta 按 response/index 聚合且异常 EOF/cancel 不执行；业务终态与财务 settlement 分离并沿用缺 usage 保守费用；结束/中断时确定性公开 Markdown 写回 `messages.content`；题卡提交短事务原子保存 submission、USER 消息、PENDING attempt、预分配 reply ID 与会话占位，事务外模型调用、query 后显式 retry、无自动排队。
- [ ] 冻结 Chat/one-shot DTO 细节、run status/cancel 路由、完整数据库字段/迁移和物理 schema；本计划对象字段仍是拟案，后续实现前必须先评估复用现有结构，并同步 API/Database/OpenAPI。
- [ ] 完成 P0 的 Gateway adapter、Loop 配置与物理持久化/并发/重启恢复契约；消费点清单不代表 P0 全部完成。

允许目录：本计划、相关设计/产品/架构文档；依赖兼容探针放 D:/Temp，不修改生产实现。验收：关键适配与生命周期都有具体契约，无依赖“SDK 自动处理”的空白。

### P1 流式协议与 PC 渲染纵切

- [x] 实现 Server 纯增量 `ChatStreamParser`；15/15 测试通过，覆盖文字、steps/compare/roadmap/chart/quiz/question 与分片输入。唯一 reviewer 已核对 fence info string，确认 delimiter run 在 info 字符前处理，tests 250–276 覆盖全部 split；原 IMPORTANT 已关闭。parser 仍未接入生产 Chat 流。
- [x] 建立 PC 内容投影与局部渲染基础：新增 `chatContentProjection.ts`、`types/chatContent.ts`、`ChatContentRenderer.vue`、`ChatContentBlock.vue`、`ChatActivityCard.vue` 及 `scripts/r4-chat-content.test.mjs`；type-check exit 0、Node 6/6。投影与题卡纯逻辑已测，组件尚未接入 Workspace/Store/SSE/reducer，无页面挂载或 GUI 验收。证据 `D:/Temp/auralis-chat-p1-components-20261029/`。
- [ ] 将 parser 接入有序事件 reducer / SSE，并用合成流验证跨端时序和稳定公开投影。
- [ ] 将 PC 渲染基础接入消息时间线、reducer、Store 和 Workspace，形成组件容器、题卡草稿及生成/异常/就绪显示；复用既有 Markdown sanitizer、公式/代码渲染和主题。
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

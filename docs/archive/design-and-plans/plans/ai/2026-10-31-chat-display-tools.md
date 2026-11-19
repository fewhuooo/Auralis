# Chat Agent Display Tool 重写实施计划

日期：2026-10-31（Asia/Hong_Kong）

状态：后端实现、契约/交接文档与聚焦验证已完成；126 条定向测试通过，skipTests package 通过。后端全量测试（排除既有超慢校准测试）完成但未全绿：1036 条、3 failures、2 errors、2 skipped；失败均为基线已有的配额/迁移断言不同步，2 个 TLS deadline errors 因漏传测试专用 keystore 属性，补齐后该类 3/3 通过。`IngestionBudgetCalibrationTests` 因既有 `TextChunker.boundaries` CPU 密集执行超过 2 分钟而仅在全量命令中排除，未改其代码。详细命令与证据见 `D:\Temp\auralis-display-tools-validation-20261031\validation.md`。PC 接入、PC 源/生成代码验证、部署、真实 Provider 与 GUI 验收均待完成；本计划不将它们视为后端测试已覆盖。

后续单项“display 参数单次修正”已按本计划 §4 实施，仍未改变字段/SSE/DB schema。四类定向验证共25 tests、0 failures/errors/skips：修正行为2/2、Validator 11/11、HistoryProjector 7/7、`ChatAgentProtocolPublicationTests` 5/5。历史工具测试 fixture 显式 stub execution owner 与未取消状态，避免250ms heartbeat取消 synthetic run。只读 review B0/I0。详细最后一次日志：`D:\Temp\auralis-display-tool-argument-repair-20261031\focused-tests.log`。source/fence/cancel/provider异常、真实 Provider、部署与 GUI 不在本次自动验证范围。

### 2026-11-03 Chat 提示、工具自然触发与安全重试提示增量

SYSTEM prompt 与九项工具 description 使用中文；保留资料相关性、授权、真实 `tool_calls`、Schema、活动规则及默认中文/可见原生 `reasoning_content` 语言偏好。用户明确请求结构化视觉内容时仍正向要求调用对应组件；自然表达“带我走一遍过程/追踪状态变化”“对比概念/怎么选/代价差异”“规划学习路径/先学什么/拆解主题”时分别优先 steps/compare/roadmap，同时保留严格使用条件。调用 `render_steps`、`render_compare`、`render_roadmap`、`render_chart` 前，单次请求迭代最多只写一句简短过渡并立即发送原生 `tool_calls`；服务端 TOOL 结果返回并进入下一次模型调用后，继续完整 Markdown 背景说明与深入讲解，无需逐项复述组件已有内容。Activity READY 仍是 terminal barrier。考查、检验理解、练习、巩固或复述检查即使未点名卡片也按选择题/开放回答分别使用 quiz/question；普通澄清和纯导航仍无需机械追加。

后续单项措辞精简只替换 SYSTEM 的“正文与结构化展示”第二小段，并更新初始与续轮 mapped request 断言。clean 重编译后 `ChatAgentProtocolPublicationTests` 5/5通过，0 failures/errors/skips；最终 SYSTEM 快照保存在 `D:/Temp/auralis-visual-transition-wording-20261103/SYSTEM_PROMPT.zh-CN.txt`。真实 Provider 遵循、部署与业务验收未进行。

单次修正触发后，同批高 index 未执行调用的配对 TOOL result 含固定 hint：工具本次尚未执行并非不可用，先修正前一工具参数；若仍需要可再次调用，且不要重复成功工具。当前结果与后续 history result 均使用该提示；历史 projector 只从固定 status/code/reason 重建，任意历史 hint 不透传。原生 call/result 配对、原单次 attempt 修正额度、取消、source/fence、budget 与正常 finish 条件保持不变。不增加公开字段、Schema 或数据库字段。提示和 descriptions 不保证真实 Provider 遵循。验证按本轮最终状态记录于当前状态文档。

唯一字段契约：[Chat Runtime API — Display Tool protocol](../../contracts/chat-runtime-api.md)。PC 消费接手说明：[Chat Display Tool 前端接手说明](2026-10-29-chat-frontend-handoff.md)。

## 1. 目标与范围

把 Chat 可视化教学输出收敛为六个独立、严格校验的 Display Tool。每个 `render_*` call 只描述一个组件，服务端从类型化 provider 参数 delta 做安全渐进预览，只有完整合法终态才能确定完成状态。自然语言、工具活动和卡片按首次出现位置保持顺序。

直接替换旧的生成协议：模型通过实际工具调用生成卡片，不再把组件 marker 和 JSON 行嵌在 assistant 正文中。服务端和客户端不保留旧 marker/NDJSON body parser、自动格式转换、双读双写、fallback 或协议 feature flag。已有 canonical public parts 若符合当前 part 契约，继续作为当前数据读写和展示，不属于旧协议兼容层。旧 `:::auralis` 原始消息文本保留且不删除、不重写，也不自动解析或转换为新卡片。

本计划覆盖 Server Chat 工具定义、provider→adapter delta 运输、runtime preview/public projection、Activity 原子 READY 事务、相应测试、Runtime API 契约、PC 消费 handoff 及其文档登记。既有 HTTP route、protocol-1 请求 envelope、认证、Gateway/accounting、数据迁移和其它业务边界保持现行契约；不改 PC 源码或生成产物，不部署、不调用真实模型、不操作业务库。

## 2. 六个 Display Tool

完整字段表、公共行、part 与 SSE 字段定义以[运行时契约](../../contracts/chat-runtime-api.md)为唯一权威。所有根/子 object 都是 closed schema；最终 server validator 还检查重复键、trailing tokens、类型、字段白名单及语义约束。

| Tool | 参数要求 | 示例要点 |
| --- | --- | --- |
| `render_steps` | `title`、至少 1 个 `items[{title,description?}]`；根可选 `description` | 按源顺序展示步骤。 |
| `render_compare` | `title`、至少 1 个 `items[{title,entries:[{label,text},至少2项]}]`；根可选 `description` | 一项是一整个比较维度；entries 按源顺序竖排。 |
| `render_roadmap` | `title`、至少 1 个 `items[{title,description?,tag?,current?}]`；根可选 `description` | `current` 若存在必须为 boolean。 |
| `render_chart` | `title`、`chartType:bar|proportion`、至少 1 个 `items[{label,value}]`；根可选 `description`、`unit` | 值必须是有限非负数；proportion 合计必须大于 0。 |
| `render_quiz` | `question`、`questionType:single|multiple`、至少 2 个唯一键 `options[{key,text}]`；`reference?` | reference 可选且私有；答案键必须存在、不可重复，single 恰一项。 |
| `render_question` | `question`；可选 `placeholder` 与 `reference` | reference 可选且私有；存在时 `points` 非空数组和 `answer` 非空字符串必须且仅有一项。 |

### 参数上限与严格性

- Schema 没有业务字符串 maxlength 或数组 maxItems 上限；每个完整工具参数 JSON 字符串按 `auralis.ai.chat-agent.max-serialized-request-utf8-bytes` 限制，默认 524,288 UTF-8 bytes。它同时限制完整序列化 Chat 请求。
- `max-tool-calls` 默认 12，可配置范围 1–12。只在执行完整终态调用时消耗 tool-call 配额，delta 预览本身不执行工具。
- `max-tool-result-utf8-bytes` 是独立结果限制，默认 65,536 bytes；不用于参数上限。
- 没有单独配置 display JSON 深度；使用当前 Jackson parser 设置。
- Required text 必须非空白；可选 text 存在时必须为字符串。数字 chart 值还需 finite。
- 预览是临时 UI 展示，不代表完整根 JSON 最终合法。

## 3. Read-only data tools 与来源边界

保留实际工具名 `search`、`read_source_excerpt`、`read_source_overview`。总览只读取当前有效的已保存 SOURCE 结果，不触发生成；每页按 `overviewVersion` 检查一致性。历史 `read_outline` 沿未知工具历史处理，不做兼容映射。

- `search({query})`：trim 后 1–1000 个字符；仅检索当前用户、有效 subject、retrieval mode、source selection 所允许的 READY 资料，最多返回 5 个 evidence 结果。
- `read_source_excerpt({sourceId,chunkId})`：参数为 UUID；只读授权来源中匹配的 active chunk。
- `read_source_overview({sourceId,offset?,limit?,overviewVersion?})`：只读授权范围内当前有效的已保存 SOURCE 总览，确定性渲染大纲和总结为 Markdown，按 Unicode code point 分页并受原工具结果字节上限约束；缺失或过期时返回普通不可用状态。
- ReadScope 在执行前验证 source/version/scope，并在执行及 publication 边界重验；模型参数不能扩展用户授权的资料范围。
- data tool arguments/results 不进入 SSE 或 public parts。只有合法终态完整 tool call 能被执行。

## 4. Transport 与渐进预览

1. 每次模型调用仍由原 `AiUsageGateway` 处理 reservation、账务与 Provider dispatch。Provider 保持 typed `AiProviderToolCallDelta`，包括 response ID、index、id/name fragment 与原始 arguments fragment。
2. Adapter 按 `(responseId,index)` 累加 identity，并通过明确的 per-request observer 无损转发每个 delta。observer 与 raw content capture 同次请求传入，不用全局 setter 或 ThreadLocal；SDK `PartialToolCall` 不作为组件识别来源。
3. 累积 name 完整匹配六个 Display Tool 名称时发一个 `block.started`。每个 component ID 对应该 call 的单一卡片。工具名若之后增长为未知终态，已启动 block 最终变 `INVALID`。
4. Assembler 仅预览完整、允许的顶层 scalar 和 `items` / `options` 的完整直接 child object。compare item 的 `entries` 必须作为一个完整维度同时展示。Quiz `reference` 不预览或公开。
5. Full terminal 还须满足正常 `tool_calls` finish、call ID 唯一且非空、tool index 连续、名称已注册、arguments 是 JSON object，且完整参数逐字匹配已收到的 delta。Display 参数再走 duplicate-key/trailing-token/schema/semantic validator，并与之前发出的预览对照。
6. 不满足任一终态条件时不执行任何未获准的 call；已开始组件保留已验证 rows 并成为 `INVALID`，不得提交活动。收到 provider 正常 `stop` 且无工具调用才按普通文本终止。

### 单次 display 参数修正

- 仅在完整、正常 `tool_calls` terminal、调用 identity/name/arguments 与 delta 完全一致且 name 是已注册 `render_*` 时，strict schema/semantic validator 拒绝可触发修正反馈。JSON 语法/重复键/尾随 token、preview mismatch、oversize、未知工具、错误 finish、provider、预算、取消、source 或 owner fence 错误都按既有安全失败处理。
- 每个 attempt 最多允许一次反馈轮。首个可修 display call 仍变为 `INVALID` 并保存 `ERROR` evidence；result 只含固定错误码、受控字段路径和缺少的必填字段。当前 assistant 完整 tool_calls 与每个 result 保持配对并进入同一轮下一次请求和私有历史 evidence。参数正文、reference、原模型文本与异常 message 不写入反馈。
- 按 provider index 执行当前批次。修正触发后，不执行更高 index calls；为每个 call 添加固定 `not_executed/PREVIOUS_DISPLAY_ARGUMENT_INVALID` 配对 result/evidence，其已开始的 display preview 置 `INVALID`，Activity 不会 READY。此前已成功的 calls/正文/组件保留。若合法 Activity 在坏 call 之前提交，仍沿现有 READY terminal barrier 结束，不再请求修正轮。
- 修正轮沿用现有 iteration、Provider/Gateway、tool-call、token 和 deadline 限制；第 2 次 schema/semantic 拒绝按原安全失败终止。不新增漏调用检测、补造参数、强制 tool choice、API 字段或数据库列。

### 首次出现顺序及多 index

- 每个 `block.started` 在首次识别该工具名的时间点向有序 `parts` 插入 `GENERATING` shell。之后的 text delta 放在后续 text segment；组件完成或出错后留在同一位置。
- `text.delta`、`block.started`、`block.item` 按 SSE sequence 表现时间顺序。对交错 index，预览也按 delta 到达顺序；完整终态调用和 model history/tool result 则按 provider index 处理。
- Block 完成是原位替换，不能移到消息末尾或按 index 重排。
- 已启动的未知/坏 JSON/坏 schema/重复 field/length/other finish/EOF/cancel/provider error block 最终发 `block.error` 并使 part `INVALID`。此前已验证 row 保留；未完成 child 不推测补全。

## 5. 活动 READY 原子边界

- `render_quiz`、`render_question` 只创建活动候选；`block.started` 和渐进 row 均不可提交。
- 每轮完整终态按 provider index 执行。第一个通过最终 payload validator 的 activity 通过 `readyActivity` 原子提交 question/part、tool trace/evidence、source revision fence、私有 reference 和 Markdown projection。
- 只有事务成功后依序发 `block.completed`（part state `READY`）、`activity.ready`、`tool.completed`。`activity.ready` 的 `activityId`、`questionId`、`questionVersion` 取自持久化记录。
- 成功提交后取消余下 loop，不再请求模型。更高 index 的 display 预览标为 `INVALID`，更高 index calls 不执行。
- 事务失败、参数无效、输入截断或运行取消不得留下可提交活动。提交只验证输入形状与选项键；不自动判分或更新 mastery。
- activity reference 永不进入 SSE、`MessageView.parts`、public markdown 或客户端提交请求；只用于服务器后续 model context。

## 6. Public parts 与事件

SSE envelope 维持现行 protocol 1 的 `conversationId/requestId/runId/attemptId/userMessageId/replyMessageId/iterationId/blockId/sequence/event/payload` identity。事件 payload 保持 runtime API 契约的字段：

- `block.started`: `{componentId,component,publicTextDelta:"\n"}`
- `block.item`: `{componentId,component,row,publicTextDelta}`
- `block.completed`: `{componentId,part,publicTextDelta:"\n"}`
- `block.error`: `{componentId,safeErrorCode,publicTextDelta}`
- `tool.started` / `tool.completed`: `{toolCallId,name}`
- `tool.error`: `{toolCallId,name,safeErrorCode}`
- `activity.ready`: `{activityId,questionId,questionVersion,componentId,publicTextDelta:""}`

完整事件样例、run/reasoning/text 事件和 `ChatContentPart` 公共字段见[运行时契约 §4–5](../../contracts/chat-runtime-api.md)。公共 row 类别：steps/compare/roadmap/chart 使用 meta/item；quiz 使用 stem/option；question 使用 stem。最终 `part` 统一含 `id,componentId,kind:"block",component,state,meta,items`，活动额外有 `questionId`。reference、arguments、tool results 永不公开。`MessageView.content` 为同一 ordered parts 的确定性 Markdown 投影。

历史投影对每个 private evidence iteration 保留原生 assistant tool_calls 与逐个配对的 ToolExecutionResult；是否 pass back reasoning 仅由 evidence 中真实保存的 provider reasoning 决定。容量折叠可缩短旧结果，但保持 call/result 配对，进一步超限时按现有策略移除完整旧 evidence iteration。历史公开 assistant Markdown 保持原样，可能与该结构化 exchange 同时出现在后续模型上下文；本轮不做历史清洗或重写。SYSTEM prompt 与六个 tool descriptions 将组件作为高密度结构骨架：title 短，description 为简短结论；长原理、直觉类比、原因、推导、边界与难点留在正文。组件前的短引子只约束过渡句；卡片之后可继续讲解，不逐项完整复述。steps 仅表示有序执行、状态流转或因果链；并列特点、优缺点、注意事项使用普通 Markdown。compare 至少比较两个对等主体的共同维度，不凑比较；roadmap 只表示带依赖的阶段。明确请求理解检查、练习或巩固时使用匹配题型的真实 activity tool；核心知识点的主动学习轮可以在有检查价值时提供一个自然 checkpoint。局部澄清、未消化补讲、纯导航轮不机械追加，普通澄清问句不自动卡片化。指定资料问题在上下文不足时先搜索相关资料；未收到结果前不得称组件基于该次检索，已有有效选中文本/近期原文可直接使用，找不到时说明且不强凑。保留明确可视化请求的真实 provider tool_calls 规则与 literal marker/JSON/Mermaid 替代禁令。提示不设硬长度配额，不新增 schema 限制、运行时校验、tool choice、自动补卡或强制检索策略；不保证模型必然遵循。

本轮回归：`mvnw.cmd -B -ntp '-Dtest=ChatEvidenceHistoryProjectorTests,ChatAgentProtocolPublicationTests' test` exit 0，11 tests、0 failures/errors/skips；详细日志 `D:/Temp/auralis-ui-tool-use-improvement-20261031/focused-tests-final.log`。这验证合成 mapped provider requests 与历史投影，不证明真实 Provider 输出遵循提示。

## 7. Raw diagnostic capture

可选本地 capture 只用于故障诊断，不改变事件或执行授权。属性 `auralis.ai.chat-agent.raw-content-capture-enabled` / 环境变量 `AURALIS_AI_CHAT_DIAGNOSTIC_RAW_CONTENT_ENABLED` 默认 `false`；目录默认 `/tmp/auralis-chat-diagnostics`。已识别 Display Tool 的 raw arguments 可保存为 `runUUID-attemptUUID-iterationUUID-tool-providerIndex.json`。attempt 累积捕获字节共用 `providerMaxResponseBytes` 上限。日志仅含 safe 身份、provider index、tool name、路径、字节、complete/truncated 标志，不写 arguments 内容。诊断数据不得进入 public DB fields、SSE 或 prompt。

## 8. 前端接手边界

前端按 SSE 事件和 `MessageView.parts` 渲染，不解析模型输出正文。PC 由用户接手实现；本计划不改 `Auralis-PC` 源码、Store、生成 API artifact 或生成 types。必须阅读[PC handoff](2026-10-29-chat-frontend-handoff.md)，将六类 public part、流式 preview、READY gate、顺序与恢复接入现有 consumer。Mobile/Tablet 具体 UI 不在本计划内；会消费 Chat 公共契约的类型/投影仍须保持字段一致。

## 9. 文档所有权

- `docs/contracts/chat-runtime-api.md`：本轮唯一字段/SSE/part/tool contract。
- `docs/plans/ai/2026-10-31-chat-display-tools.md`：本轮边界、顺序语义、验收和验证状态。
- `docs/plans/ai/2026-10-29-chat-frontend-handoff.md`：PC consumer 实施说明。
- [2026-10-29 旧计划](../../archive/superseded-2026-11-15/2026-10-29-chat-agent-visual-teaching.md)：已归档，正文仅保留为历史说明。
- Backend、Status、Issues、Frontend design、API、Database 等其余权威文档由 runtime 主实现责任人按实现和验证结果同步。

## 10. 验收与验证状态

### 自动验证

- Provider → typed chunks → adapter progress：首片仅 name/id、args 在 name 前、中文/转义内容、多 index 交错、准确回调次数、累计身份和 raw arguments fragment。
- Display payload validator：六组件必填/可选字段、未知/重复字段、根非 object、尾随 token、错误类型、min items、compare entries、chart 数值与比例和、quiz keys/reference、question reference 二选一。
- Stream assembler：字符级/随机 delta 切片、部分 metadata、完整子对象、args-before-name 回放、多 index 分离、未知 name、 malformed preview、完整 root close 与 UTF-8 byte cap。
- Runtime publication：started/item/complete/error event order、原位替换、parts/markdown 恢复、正常 terminal gate、invalid finish/EOF/cancel no execution、activity READY 提交先于事件并停止后续 model iteration、read-scope revalidation。
- 执行 Agent 已完成 clean focused Chat/DisplayTool suites：126 tests，0 failures/errors/skips；隔离 PG + Testcontainers MinIO 的剩余全量执行结果、单类排除原因、TLS fixture 定向复跑与 package 退出码见验证记录。全量结果不是全绿，不能据此宣称后端整体验证通过；主 Agent按基线差量最终裁决。
- 后续 display 参数修正定向命令 `mvnw.cmd -B -ntp '-Dtest=ChatDisplayToolArgumentRepairTests,DisplayToolPayloadValidatorTests,ChatEvidenceHistoryProjectorTests,ChatAgentProtocolPublicationTests' test` 执行25/25，0F/0E/0S；四类结果分别2/2、11/11、7/7、5/5。历史工具 fixture 的 owner/cancellation stub 修复后再统一运行，结果保存在 `D:\Temp\auralis-display-tool-argument-repair-20261031\focused-tests.log`，未运行full suite。

### 人工与外部验收

部署、真实 Provider 输出、计费账户、PC/Tauri 实时 GUI、刷新恢复、cancel/slot 退出和题卡提交分别记录证据。以上均不由单元测试或 Maven 结果代替。

### 完成条件

- BLOCKER = 0 且 IMPORTANT = 0；本计划范围内协议、实现、文档一致。
- 聚焦自动验证已通过，reviewer 只读检查无 actionable issues；全量测试仍有基线失败且排除一项既有超慢校准测试，故全量验证条件未满足。
- 后端范围内契约与 PC handoff 完整；PC 实际接入由用户实施，源码验证、生成产物、GUI 和真实 Provider 验收分别标记，均不算本后端计划的完成证据。
- 状态和风险由主 Agent 按最终测试结果同步，不能提前把本计划或 current docs 标成验收完成。

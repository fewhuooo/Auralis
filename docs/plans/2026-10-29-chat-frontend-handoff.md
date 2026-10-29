# Chat 前端接手说明（PC 用户实施）

更新时间：2026-10-29

状态：PC 前端 P2/P3 草稿进行中，未 type-check、未通过 P2 集成测试、未人工验收。Server protocol 1 runtime 已完成本轮六项后端行为修复的 focused clean/test（6 suites、21/21）和 package；全量结果仍失败，PostgreSQL integration、真实 Provider、部署与 GUI/业务验收未完成。接口变化必须同步本说明、[Chat 重写计划](2026-10-29-chat-agent-visual-teaching.md)、API/OpenAPI 和消费者。

分支基线：`feat/pc-chat-frontend`，本轮起始 commit `6de8d3a`。本说明只记录本次交接，不表示 PC 前端或 Server runtime 已完成整体验收。

## 1. 范围和工作树保护

本次交接的实施范围是 **PC Chat 前端**：API/SSE、reducer/controller、Store、SubjectWorkspace 时间线和题卡、状态恢复及对应测试。用户已要求 Mobile/Tablet 暂停并由用户亲自实现；已写入的 Mobile/Tablet 草稿保留在工作树和下方备份，不要据此视为接线完成。

前端草稿没有被提交、还原或丢弃。可恢复备份位于：

`D:/Temp/auralis-chat-frontend-user-handoff-20261029/`

其中 `frontend-working-tree.patch` 保存当时所有已跟踪前端差异，`untracked/Auralis-PC/src/types/chatProtocol.ts` 保存未跟踪类型文件，`frontend-status.txt` 保存状态，`handoff.md` 保存首轮交接。该备份用于恢复和核对，不代表其代码经过验证。

当前 `docs/contracts/API.md` 已记录 protocol 1 候选契约，OpenAPI artifact 已按当前 Server runtime 导出；PC/Mobile 的生成客户端类型仍反映旧契约。本任务只更新 Server 侧 OpenAPI artifact，不覆盖并行前端草稿或生成类型。PC 前端收口时由用户按现行流程生成并核对两端 SDK，再同步更新本说明。

主计划开头的状态描述记录了 P1 完成时 PC 尚未接入 Workspace/Store/SSE 的快照；本说明描述之后写入的未验证 PC 草稿。主计划未在本轮修改，后续实现收口时须同步状态。

## 2. P1 基线与当前草稿

P1 基线已进入 `6de8d3a`，在该基线记录的证据为：纯 `ChatStreamParser` 15/15，PC 内容投影/题卡逻辑 Node 测试 6/6，PC `type-check` 退出码 0。证据目录为 `D:/Temp/auralis-chat-p1-components-20261029/`。这些结果只证明 P1 parser 与组件基础；parser 尚未由 P1 接入生产 Chat 链。此交接没有重跑这些检查，也没有验证当前 P2 工作树。

本次已写入的 PC 草稿文件：

| 文件 | 当前草稿 | 接手时需要完成 |
| --- | --- | --- |
| `Auralis-PC/src/types/chatProtocol.ts` | 新增 envelope、run、message、conversation 本地类型 | 补全与当前 Server DTO 一致的 `activeRun`、snapshot/status 等字段；等后端 OpenAPI 稳定后改用生成类型，不手改 generated schema。 |
| `Auralis-PC/src/api/aiClient.ts` | 新 Chat stream、retry/status/cancel、one-shot wrappers | 对齐真实 DTO 与生成类型；核对请求字段、错误响应、detail 顶层 `activeRun`。 |
| `Auralis-PC/src/api/sse.ts` | 移除了旧 `AiStreamEvent` 联合类型，保留 SSE framing | 确认仅解码 protocol 1 envelope；旧 message event 不保留 fallback。 |
| `Auralis-PC/src/services/aiStreamController.ts` | 消费新 envelope 并派发 reducer state | 补齐请求生命周期、错误/断流恢复和 run/attempt 代次隔离。 |
| `Auralis-PC/src/services/aiStreamReducer.ts` | 新文本、block、tool、terminal 和 sequence reducer | 题卡提交必须按原题 `componentId`/part ID 更新原消息；核对 malformed block 展示、重复/迟到/attempt 事件。 |
| `Auralis-PC/src/store/useChatStore.ts` | 新 conversation、owner+subject 本地映射、发送/提交/重试/取消初稿 | 补齐顶层快照恢复、稳定 request/submission 重送、status polling、草稿保存及错误状态；不以 READY 或 cancel 请求返回推断 executor 已停止。 |
| `Auralis-PC/src/views/SubjectWorkspace/index.vue` | 挂载 P1 renderer、tool capsule、发送/停止、题卡 submit 初稿 | 完成时间线、旧会话禁用、新建映射、切文件/切 subject/卸载生命周期、题卡状态与刷新恢复；去除残留空 citation 展示。 |

这 7 个文件**均为未验证草稿，没有任何一个构成已验收的 P2 接线**。当前没有新增 P2 前端测试文件，也没有执行 PC type-check 或 Node 测试。

已暂停但保留的 Mobile/Tablet 文件：`Auralis-Mobile/src/api/aiClient.ts`、`src/pages/mobile/ai-search/index.vue`、`src/pages/tablet/ai-search/index.vue`、`src/pages/tablet/workspace/index.vue`。它们尚未验收，旧调用消费者契约不保证可运行。用户接手 PC 范围时不要继续改这些文件。

## 3. PC 实施顺序

建议按以下顺序把草稿做成可验证实现。涉及后端 API/OpenAPI 生成时，先确认 runtime 合并后的 DTO；不得手工改 generated 文件，也不要保留旧协议 fallback。

1. **对齐 DTO 和 API wrappers。** 以本说明第 4 节当前 Server 源码为准，完成 `aiClient.ts` 与生成类型对齐。Server/OpenAPI 尚未全部稳定，字段有变时以最新 Controller/record/test 为准并同步接口文档。
2. **实现稳定会话选择。** 认证用户 + subject 的 `conversationId` 映射持久保存在 PC 客户端，只用于界面恢复，不作为授权。首次新会话先 `POST /conversations`；使用其返回 ID。切换当前文件只改变本轮 `readingContext`，不创建/删除会话。切 subject 时载入对应映射；页面卸载只停止本地监听，不删除服务端会话。用户明确删除会话时才走 delete API。
3. **切换 SSE 与事件身份。** 解码完整 JSON envelope，校验 `protocolVersion===1`、conversation/run/attempt 和事件名；按 `(runId,attemptId,sequence)` 去重，旧 generation/owner/session 的迟到事件丢弃。sequence 按 attempt 递增；retry 新 attempt 可从新序号开始。不能读取或解析 NDJSON，也不能把私有 reference 带入客户端。
4. **完成 Store 状态机。** 普通 USER turn 使用稳定 requestId；题卡提交使用稳定 submissionId/requestId。离线未派发输入留作草稿，联网后不自动提交/计费。Store 以服务端返回的 `runId/attemptId/replyMessageId` 更新对应消息；消息 `parts` 用稳定 part ID 更新，不重建整条时间线。
5. **接上正文、工具和六种组件。** timeline 按消息顺序展示普通 Markdown（继续使用现有 sanitizer、公式和代码渲染）、tool capsule、`steps/compare/roadmap/chart/quiz/question`。组件行由 `block.item` 增量更新；`block.completed.part` 是服务端规范化快照。未知字段丢弃，不做协议兼容展示。
6. **完成题卡提交闭环。** READY 且结构有效、executor 空闲时才允许提交。GENERATING、INVALID、SUBMITTED 和 busy 状态必须区分；busy 时可以继续编辑草稿，但提交 disabled。成功后按返回的 public part 把原卡片变成 SUBMITTED 并显示答案，不判分、不显示对错、不写学习进度或掌握度。
7. **完成 retry 与 cancel。** retry 使用同一个 `runId` 下的 attempts route；attempt/reply 身份由服务端生成，稳定 requestId 防止重复执行。若返回 HTTP 409 `CHAT_PROFILE_CHANGED`，服务端已确认原 run 的 provider/model/normalized endpoint 与当前配置不一致，用户需发起新 turn；不能静默用新 profile 重跑旧 run。相同 provider/model/endpoint 下的 credential rotation 可继续 retry。停止按钮调用 cancel route，但返回只表示取消请求/当前状态；继续保持 busy，直至 status/detail 确认 `executionActive:false`。不能用前端 abort/断流来伪装 worker 已退出。
8. **完成刷新恢复、错误和草稿。** `GET conversation detail` 恢复有序 messages/parts 及顶层 activeRun 的 publicSnapshot/toolTrace；断流后用 status/detail 查明终态，不自动重跑。只展示安全错误码/映射文案。组件输入/选择草稿按稳定 `componentId` 保留，事件更新 parts 时不重置。
9. **更新行为测试并统一验证。** 将旧协议 SSE、离线自动收费恢复、临时会话生命周期测试改成新 protocol 1 行为测试。全部编辑结束后跑本说明第 7 节所列检查；不在编辑过程中反复运行。

## 4. 当前 Server protocol 1 源码接口

以下记录按 2026-10-29 当前未提交 runtime 源码核对。它表示分支中的实现形状，**不表示已部署或通过测试**。对应源码：`Auralis-Server/src/main/java/com/auralis/app/ai/ChatRuntimeController.java`、`AiMessageCommand.java`、`ChatSseEnvelope.java`、`ConversationView.java`、`MessageView.java`、`ChatRunStatusView.java`、`ActiveChatRunView.java`、`internal/chat/ChatAgentOrchestrator.java` 与 `internal/chat/ChatRuntimePersistenceService.java`。

### 4.1 新建会话、turn 与题卡提交

新会话是显式请求，stream 不隐式创建。`POST /api/ai/conversations` 使用现有 `ConversationCommand`；创建时 `baseVersion` 必须为 0，当前服务将新会话标记 `chatProtocolVersion=1`。

```json
{
  "title": "线性代数",
  "baseVersion": 0,
  "clientRequestId": "stable-create-request-id"
}
```

普通 turn：

```http
POST /api/ai/messages/stream
Accept: text/event-stream
Content-Type: application/json
```

```json
{
  "protocolVersion": 1,
  "action": "turn",
  "conversationId": "<conversation-uuid>",
  "requestId": "<stable-request-id>",
  "content": "解释矩阵乘法的几何含义。",
  "readingContext": {
    "currentSourceId": "<source-uuid>",
    "subjectId": "<subject-uuid>",
    "retrievalMode": "AUTO",
    "sourceIds": [],
    "selectionText": "<optional selected text>"
  },
  "selectionText": "<optional selected text>"
}
```

`readingContext` 和顶层 `selectionText` 可省略。`readingContext` 当前字段是 `currentSourceId?`、`subjectId`、`retrievalMode`（`AUTO|SELECTED_SOURCES|SUBJECT`）、`sourceIds?`（最多 100）和 `selectionText?`（最多 4000）。服务端仍按 owner、subject、READY 状态及 source revision 授权；客户端字段不是权限。

题卡 submission 也用同一路由，字段为 `protocolVersion=1`、`action="activity_submission"`、`conversationId`、`requestId`、`activityId`、`questionVersion`、`submissionId` 和 `answer`。不传 `content`，不传题干、reference、答案解析或私有数据。

```json
{
  "protocolVersion": 1,
  "action": "activity_submission",
  "conversationId": "<conversation-uuid>",
  "requestId": "<stable-submission-request-id>",
  "activityId": "<activity-uuid>",
  "questionVersion": 1,
  "submissionId": "<stable-submission-uuid>",
  "answer": ["B"]
}
```

**最终 answer 网络值：** quiz 单选传一个元素的 JSON 字符串数组（如 `"answer":["B"]`），多选传 JSON 字符串数组（如 `"answer":["B","D"]`）；开放问答传 JSON 字符串（如 `"answer":"我会先检查矩阵维度。"`）。不使用 `{optionKeys:[...]}` 或 `{text:"..."}` 包装。DTO 是 `AiMessageCommand.answer` 的 `JsonNode`，Server OpenAPI 注解显式声明 `string | string[]`；`ChatRuntimePersistenceService` 校验答案与活动公开选项。实现源码未经过统一构建/测试验证，PC 草稿 Store 的对象包装仍需由用户接线时改为上述网络值。

服务端根据 activityId 找到原活动/题目，校验答案类型、长度/选项归属与提交幂等；服务端创建关联 USER 消息并将答案和原题上下文组装后交给 LLM。程序不判分、不填写学习进度。reference 仅在服务端私有持久化中，绝不发送给前端。

### 4.2 重试、状态、取消与详情

重试：

```http
POST /api/ai/conversations/{conversationId}/runs/{runId}/attempts
Content-Type: application/json
```

```json
{ "requestId": "<stable-retry-request-id>" }
```

该 route 返回 SSE。当前 `ChatRunStatusView` JSON 字段为 `protocolVersion`、`conversationId`、`runId`、`requestId`、`userMessageId`、`currentAttemptId`、`currentReplyMessageId`、`status`、`fenceVersion`、`executionActive`、`accountingSummary`、`publicSnapshot`、`toolTrace`、`createdAt`、`updatedAt`、`attempts`；每个 attempt 含 `attemptId`、`attemptNo`、`requestId`、`status`、`replyMessageId`、`createdAt`、`startedAt`、`endedAt`、`safeErrorCode`。status 值按 runtime 实际响应读取，不在客户端硬编码尚未冻结的枚举。

```http
GET /api/ai/conversations/{conversationId}/runs/{runId}
```

停止是请求，不是终止确认：

```http
POST /api/ai/conversations/{conversationId}/runs/{runId}/cancel
```

cancel 返回同形状的 `ChatRunStatusView`。直到 `executionActive=false`，新 turn 和提交都保持 disabled。业务 `READY` 或 activity `SUBMITTED` 可以在执行器还清理时出现，故 READY/SUBMITTED 不等于空闲。

```http
GET /api/ai/conversations/{conversationId}
```

`ConversationView` 在**顶层**返回 `chatProtocolVersion`、`chatSupported` 和 `activeRun`（或 null），并有 `messages`。`activeRun` 是 `{runId,userMessageId,currentAttemptId,currentReplyMessageId,status,executionActive,publicSnapshot,toolTrace,updatedAt}`。它不在 `MessageView` 内。`MessageView` 每条含 `id,messageSequence,role,status,content,model,errorCode,createdAt,parts,chatProtocolVersion`；`content` 是服务端 Markdown 投影，`parts` 是同一消息的 canonical public parts。

list `GET /api/ai/conversations` 当前以空 `messages` 返回，不可当作历史正文；`ConversationService.toView` 也会附上顶层 `activeRun`（若该 conversation 正在占用 run）。历史详情必须调用 GET detail。旧/null/不支持协议的详情返回 Problem Details code `CHAT_PROTOCOL_UNSUPPORTED`，不给 content-only 兼容显示或执行。旧数据保留；用户显式创建 protocol 1 新会话。

非 Chat 单次生成走独立接口，不进入 Agent loop：

```http
POST /api/ai/text-generations
```

```json
{ "operation": "summary", "input": "<text>", "requestId": "<optional-id>" }
```

当前 command 支持 `summary|extract|format|transcript`，返回 `{ "text": "..." }`，不接收客户端 provider。

### 4.3 SSE envelope、事件和 sequence

每个 SSE event 的 `data` 是完整 JSON `ChatSseEnvelope`：

```json
{
  "protocolVersion": 1,
  "conversationId": "<uuid>",
  "requestId": "<request-id>",
  "runId": "<uuid>",
  "attemptId": "<uuid>",
  "userMessageId": "<uuid>",
  "replyMessageId": "<uuid>",
  "iterationId": "<uuid-or-null>",
  "blockId": "<uuid-or-null>",
  "sequence": 1,
  "event": "text.delta",
  "payload": { "text": "正文", "publicTextDelta": "正文" }
}
```

身份字段由服务端生成，`requestId` 由请求端提供。sequence 由 attempt 流递增；attemptId 是去重及旧 attempt 隔离的一部分。按 `(runId,attemptId,sequence)` 去重；切换 conversation/owner/session 或 attempt 后不能应用旧事件。

当前 orchestrator 源码中的事件和 payload：

| event | 当前 payload 字段 | 前端作用 |
| --- | --- | --- |
| `run.started` | `status` | 绑定 run/attempt 并进入 busy。 |
| `text.delta` | `text`, `publicTextDelta` | 普通 Markdown 正文增量。 |
| `tool.started` / `tool.completed` | `toolCallId`, `name` | 真实工具 capsule 生命周期。 |
| `tool.error` | `toolCallId`, `name`, `safeErrorCode` | 只展示安全错误状态，不展示内部调用参数/结果。 |
| `block.started` | `componentId`, `component`, `publicTextDelta` | 建立 GENERATING block 预览。 |
| `block.item` | `componentId`, `component`, `row`, `publicTextDelta` | 增量更新一行；只渲染 allowlist row。 |
| `block.completed` | `componentId`, `part`, `publicTextDelta` | 应用 server part；活动 part 可直接为持久化后的 READY。 |
| `block.error` | `componentId`, `safeErrorCode`, `publicTextDelta`（当前 `"\n"`） | 标记异常且不回显坏 JSON。 |
| `activity.ready` | `activityId`, `questionId`, `questionVersion`, `componentId`, `publicTextDelta` | READY 持久化事实的通知；不由 parser 完成自行推断。 |
| `activity.submitted` | `activityId`, `submissionId`, `questionId`, `part`, `publicTextDelta` | 把服务端 SUBMITTED part 更新回原题卡。提交 USER ID 读取 **envelope 顶层 `userMessageId`**，不要从 payload 猜。 |
| `run.completed` | `replyMessageId`, `executionActive:false` | 本次已确认 executor idle。 |
| `run.failed` | `safeErrorCode` | 映射安全错误并提供适当 retry。 |
| `run.cancelled` | 正常终态 `replyMessageId`, `executionActive:false`；终态回放可带 `replayed:true`。 | 不从 SSE 断流推断执行已停止。 |

`ChatSseEnvelope` 的顶层身份字段对所有事件一致，且额外有可空 `iterationId`、`blockId`。`activity.submitted` 的 `userMessageId` 在顶层 envelope；payload 没有冗余 `userMessageId` 字段。工具参数、工具结果、reference、quiz answer key/explanation 不作为公开事件字段。

### 4.4 公有 parts 与 READY 时序

canonical `ChatContentPart`：

```json
{ "id": "<part-id>", "kind": "text", "text": "Markdown text" }
```

或 block：

```json
{
  "id": "<block-uuid>",
  "componentId": "<block-uuid>",
  "kind": "block",
  "component": "quiz",
  "state": "READY",
  "meta": { "question": "...", "questionType": "single" },
  "items": [{ "key": "A", "text": "..." }, { "key": "B", "text": "..." }],
  "questionId": "<activity-uuid>"
}
```

组件值固定为 `steps|compare|roadmap|chart|quiz|question`。`state` 当前公开类型为 `GENERATING|READY|SUBMITTED|INVALID`。steps/compare 行用 `title` 和可选 `description`；roadmap 另可有 `tag/current`；chart meta 是 `chartType:bar|proportion`、可选 `unit`，item 是 `label/value`；quiz meta 是 `question/questionType:single|multiple`，item 是 `key/text`；question meta 是 `question/placeholder`。只渲染这些白名单字段。

`questionId` 与服务端 `activityId` 相同，但 block/part 的 `id` 和 `componentId` 是 block identity。提交后 source message 的 part 变为 `state:"SUBMITTED"` 且有 `submittedAnswer`（字符串或字符串数组），用于展示用户答案，无对错、score、private reference 或 explanation。服务端在发有效活动 `block.completed` 前已提交 READY 事务，所以该 part 可以直接 READY；`activity.ready` 是通知。READY 是业务状态；执行器可继续清理工具/模型资源，必须等 `executionActive:false` 才能重新发送。

## 5. 产品与安全边界

- 程序只校验题卡结构、答案类型/选项归属、长度、权限与提交幂等性；不判分、不写学习进度、正确率或掌握度。
- answer body 只传用户答案。服务端根据 `activityId` 找原题并装配原题给 LLM。前端不读、不发送 reference、答案/解析或私有工具数据。
- 题卡 GENERATING/READY/SUBMITTED/INVALID 与 run 的 `executionActive` 是独立状态维度；READY 后仍可能 busy。cancel 只请求停止，实际释放互斥要等 executor 退出证据。
- PC 会话按 owner+subject 保存本地选择映射，不是授权。切文件改变 `readingContext`，不删会话；换页/卸载不删会话。旧列表记录 `chatSupported=false` 可显示元信息，但不能打开正文或继续执行。
- Mobile/Tablet 暂停，不在本轮实现或验收；未来只消费 `publicTextDelta`，不得自行解析 NDJSON，也不得自动重放离线输入。

## 6. 后端待完成与同步

当前 branch 有未提交 Server runtime 草稿，包括 `ChatRuntimeController`、`ChatAgentOrchestrator`、持久化服务、DTO、V42 migration 与 Gateway/Adapter 相关代码。该实现仍在进行中且未验证；不要将本说明或源码存在写成 API 已发布/部署。接口发生变化时，同步本文件、Chat 主计划、`docs/contracts/API.md`、OpenAPI 与生成端类型。当前 activeRun 的确切位置是 `ConversationView.activeRun` 顶层，`activity.submitted.userMessageId` 的确切位置是 SSE envelope 顶层。

尚待后端收口/联调确认的项目：

- protocol 1 DTO、answer 原始 JSON 形状与验证注解/测试一致（已裁决为 string / string[]，无对象 wrapper）。
- Controller、run/status/cancel/retry、detail snapshot、错误映射、SSE 事件与 sequence 的统一测试通过。
- Gateway/Provider/tool adapter、并发/fence、READY transaction、失败/取消结算、executor join、restart/UNKNOWN hold 和 V42 schema 的测试通过。
- OpenAPI artifact 已按当前 Server runtime 导出并与运行时比较通过15/15；PC/Mobile 生成类型仍待用户完成前端实现后统一生成。回填类型后同步本说明。当前 API.md/OpenAPI 是 protocol 1 候选契约，仍不代表部署或业务验收。
- 真实 Provider、数据库持久化、PC GUI、刷新/断流恢复尚未完成验收。

## 7. 验证与可执行验收

本次只整理文档，没有运行 PC、Mobile/Tablet 或 Server 检查，没有启动应用/浏览器/GUI。P1 历史证据不能替代当前 P2 type-check 和测试。

用户完成 PC 草稿后，在 `Auralis-PC` 目录统一运行：

```powershell
npm.cmd run type-check
node --experimental-strip-types --test scripts/r4-chat-content.test.mjs
node --experimental-strip-types --test scripts/r4-ai-stream.test.mjs scripts/r4-reliability.test.mjs scripts/r4-reading-session.test.mjs
```

最后一条旧测试目前有旧消息协议、离线自动重放、阅读会话删除等断言；应先将其改为真实 protocol 1 行为测试，再将命令作为最终 focused 验证。测试应实际验证 SSE parser/reducer/controller 的重复和迟到事件、parts/schema/题卡提交、stable IDs、attempt retry、cancel/status busy、draft preserve、old protocol rejection；不能只扫源码字符串。之后视改动范围运行 `npm.cmd run test:r4-pc` 和 `npm.cmd run build`。

`npm.cmd run check:r4-pc` 既有基线命中未修改 Rust `cfg(test)` 模块里的 localhost 测试地址，属于静态扫描误报，可能仍返回非 0；不要把它当作本轮 PC 功能测试，也不要在本工作范围顺手改 Rust 测试。具体以实际命令输出为准。

建议最终人工验收逐项勾选：

- 新建会话得到 protocol 1 ID；刷新/返回同一 owner+subject 恢复；新 subject 选对映射；切文件、切页和卸载不删除服务端会话。
- 普通 Markdown 增量、代码围栏/公式/链接安全渲染；六类 block 逐行增量、最终 part 更新且不重复显示公开 Markdown。
- 每个工具有 start/complete/error capsule；safe error 不泄漏参数/reference/result。
- READY 之前不可提交；READY 但 `executionActive=true` 时可保留草稿但提交 disabled；空闲后允许提交；single、多选、开放题答案分别用数组/字符串发送并保持 request/submission IDs。
- 提交后同一原题卡显示答案且无对错；服务端 LLM 回复与原题关联。断流后 detail/status 恢复 parts/activity/tool trace；cancel 等待 `executionActive:false` 后才解锁。
- 旧协议列表元信息可见，但 detail/继续均走 unsupported 行为；新建 protocol 1 正常可用，不做旧数据转换。

type-check、Node tests 和静态脚本仅证明对应代码范围；Server 测试、真实模型/数据库、刷新恢复、PC GUI/业务 acceptance 需要分别记录，未执行时不得宣称通过。

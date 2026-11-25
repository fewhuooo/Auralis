# Chat Display Tool 前端接手说明

更新时间：2026-10-31

状态：当前 PC 接入契约与实现已就位；服务端实现的 focused backend 验证已通过，PC 端 `aiStreamReducer`、`useChatStore`、`ChatContentBlock`、`ChatActivityCard`、`ChatProcessArea` 与工作区重试/中断闭环已完成静态检查、类型检查、测试（23/23）与生产构建（vite build 通过）；桌面端 GUI 与真实模型交互待最终端到端核验。服务端字段权威以 [Chat Runtime API](../../contracts/chat-runtime-api.md) 为准；后端验证边界见[2026-10-31 Display Tool 重写计划](2026-10-31-chat-display-tools.md)和本机验证记录保存在 `D:\Temp\auralis-display-tools-validation-20261031\validation.md`。

## 目标

让 Chat 前端使用现行六种 Display Tool 与 `ChatContentPart` 协议：普通文字和卡片按首次出现顺序展示；组件逐行预览；终态替换原位置；Quiz / Question 只在服务端提交 READY 后开放输入。前端不解析 Markdown 中的组件 marker，也不解析 body 内的 NDJSON。

## 实时事件到 UI 状态

同一个逻辑消息由有序 text segment 与 block segment 构成。不要把组件前后的文字合并成一段再把卡片追加到末尾。`block.started` 到来时，在当时的消息位置插入一个由 `componentId` 标识的 `GENERATING` shell；之后同一 block 的 `block.item` 更新这个 shell；`block.completed` 用 `payload.part` 原位替换；`block.error` 将现有 shell 标为 `INVALID` 并保留已接收行。event envelope 的 `blockId`、payload `componentId` 与 part ID 应保持关联。

| SSE 事件 | 前端动作 |
| --- | --- |
| `text.delta` | 在当前位置将原文追加到连续 text segment；保留服务器提供的 `publicTextDelta` 用于纯文本投影。 |
| `reasoning.delta` | 更新过程区；不要放进消息正文或 Markdown。 |
| `block.started` | 新建 block shell 与加载态；`component` 是 `steps`、`compare`、`roadmap`、`chart`、`quiz`、`question`。 |
| `block.item` | 只合并到相同 `componentId` 的 `GENERATING` block。`row.type` 与字段按组件解释。 |
| `block.completed` | 以 `payload.part` 整体替换该 block，不能再从 accumulated text 重解析。 |
| `block.error` | 保留已有行并显示不可提交的 `INVALID` 卡片；错误文案用安全错误码映射。 |
| `activity.ready` | 以持久化的 `activityId`、`questionId`、`questionVersion` 激活提交入口。该事件只会在服务端 READY 事务提交后发出。 |
| `activity.submitted` | 更新对应 part 到 `SUBMITTED` 并显示原题与作答。 |
| `tool.started/completed/error` | 仅在过程区显示工具名与状态；事件不含参数或结果。 |
| `run.completed/failed/cancelled/unknown` | 依事件刷新运行态；`unknown` 表示 server slot 仍由执行归属保护，断流或关闭页面不能自行当作终止。 |

普通文字和 block 按其第一次 SSE 出现的位置保持顺序。一个 block 的部分行不会因为完成或报错而移动。多工具 delta 的预览顺序跟随 delta 到达顺序；服务端按 Provider index 执行终态工具。

## 六种卡片

终态 part 字段为 `{id,componentId,kind:"block",component,state,meta,items,questionId?}`。状态包括 `GENERATING`、`READY`、`SUBMITTED`、`INVALID`。

| `component` | `meta` | `items` |
| --- | --- | --- |
| `steps` | `{title,description?}` | `{title,description?}`，按序显示步骤。 |
| `compare` | `{title,description?}` | `{title,entries:[{label,text},...]}`；每个维度单独竖排，标题下按源顺序显示所有 entries。不要把 A/B 位置跨维度横向配对。 |
| `roadmap` | `{title,description?}` | `{title,description?,tag?,current?}`。 |
| `chart` | `{title,description?,chartType,unit?}` | `{label,value}`；只渲染服务端允许的 `bar` 或 `proportion`。 |
| `quiz` | `{question,questionType}` | `{key,text}` 选项；答案/reference 不在公开 part。 |
| `question` | `{question,placeholder?}` | 空数组；开放作答控件由 `meta` 生成。 |

`quiz` 和 `question` 是活动卡。收到 `block.started`、stem、options 或 question 时只显示 `GENERATING`；即使局部字段看起来完整，也不能开放提交。收到 `activity.ready` 后使用服务端 activity 身份和版本提交。提交答案发 `action:"activity_submission"`，使用现有消息流请求契约；服务端验证答案格式和选项键但不判分。`reference` 只供服务器后续模型上下文，不显示、不提交、不通过 history API 读取。

## 失败与恢复

- 无效 JSON、未知字段、重复字段、不合法终态、EOF、取消或 Provider 错误会让已 started block 变成 `INVALID`；保留已验证并公开的行，禁用 Quiz / Question 提交。
- 未收到 `activity.ready` 不得把活动卡推断为 READY。活动事务已提交而 SSE 断开时，通过现有 run/conversation recovery 获取持久 `parts` 与 activity 状态。
- 不根据 `tool.started` 推断 Display Tool 已成功；最终 part 以 `block.completed` 或恢复结果为准。
- 文本本体、reasoning、工具活动和 block 按各自 SSE 事件处理，不从工具 arguments 或 Markdown 隐藏字段重构卡片。
- 新客户端不读取旧 marker/NDJSON。历史纯文本和已存 canonical parts 均保留；不删除或重写用户旧数据，也不把旧文本 marker 自动转换为卡片。符合当前 `ChatContentPart` 契约的 canonical public parts 是当前格式数据，继续通过现行 history/read path 渲染，不是兼容层。

## PC 实施与验收

先检查当前 `Auralis-PC/src/services/aiStreamReducer.ts`、`chatContentProjection.ts`、`Auralis-PC/src/types/chatContent.ts`、`chatProtocol.ts`、Chat Store 与实际渲染组件，再按现行实现做最小接线。至少核对：

1. stream reducer 能按 envelope sequence 处理 started/item/completed/error，并以稳定 component ID 更新原 block。
2. 实时消息、历史 `MessageView.parts`、刷新恢复和本地缓存共用同一 `ChatContentPart` 投影；不以 Markdown reparsing 恢复块。
3. `compare.entries` 的完整数组被 allowlist、类型、Store 和 renderer 保留；chart、steps、roadmap、活动题卡也都消费工具形状。
4. Quiz / Question 只有收到 READY 状态才能提交；INVALID、GENERATING、SUBMITTED 状态各自有明确呈现。
5. 文本→block→文本和 interleaved 多工具的顺序保持；恢复后不用重新生成来补齐已保存组件。
6. 运行与改动范围相符的 PC 静态检查、测试和构建；最后在 PC/Tauri GUI 上验证事件顺序、刷新恢复、提交、取消及失败卡片。代码、自动测试、构建、GUI 与真实 Provider 体验分别报告。

前端改动应同步 `docs/modules/FrontendPC.md` 与适用时的 `docs/design/Frontend.md`。生成文件按既定生成流程更新；本 handoff 本身不代表这些源或生成结果已更改，也不代表 GUI 验收完成。

# Chat Runtime API — Display Tool protocol

Updated: 2026-11-11

Status: Current field contract implemented in the server source. The 2026-11-05 source overview tool change passed focused backend validation (43/43) and skipTests package. Earlier display-tool full-suite and validation history is retained below; no deployment, real Provider, PC, or GUI acceptance is claimed for this change.

Authority: This is the field-level contract for the current Chat runtime and public parts/events. The 2026-10-31 [Display Tool rewrite plan](../plans/2026-10-31-chat-display-tools.md) records implementation scope and acceptance steps. The 2026-10-29 plan is superseded for current protocol details.

## Model conversation history

The runtime combines each turn's question and persisted `selectionText` into one USER message, both for the current request and when rebuilding prior turns. Quoted text remains untrusted context. It is retained and trimmed with its owning turn under the existing capacity policy; the HTTP command field and stored request context are unchanged.

Prior turns follow their USER message sequence. Each USER is associated with its run by `user_message_id`; its reply and private tool evidence come from that run's `current_reply_message_id` and `current_attempt_id`. Retrying an older question therefore keeps its replacement answer and evidence in the original turn, even when the reply was persisted after later questions. Earlier attempt records remain stored but are not mixed into the model history. When retrying an older run, only USER turns preceding its original question enter the request.

## Explicit UNKNOWN recovery

`POST /api/ai/conversations/{conversationId}/runs/{runId}/attempts/{attemptId}/recover` accepts no body and returns the existing `ChatRunStatusView`. It requires the authenticated owner and the target to be both the run's current attempt and the conversation's active run. The operation is an explicit settlement action; it never automatically re-dispatches the model.

For an unresolved UNKNOWN attempt without a committed `READY` or `SUBMITTED` activity, recovery fences the conversation and settles the run and attempt as `FAILED` with safe code `CHAT_UNKNOWN_ABANDONED`. It preserves public text and validated rows, marks remaining `GENERATING` blocks `INVALID`, and retains private evidence and all usage/task/reservation ledger rows without refund. If a committed activity exists, recovery settles as `COMPLETED` and releases the slot while retaining the activity and its private reference. An already-resolved target, including one that became an older attempt after retry, is idempotent and cannot change the current attempt or another run. Fence checks reject late worker publication after settlement. A deadline or UNKNOWN status does not establish that an upstream Provider has stopped.

The PC client may call this route after presenting the user with the persisted UNKNOWN state and an explicit recovery action. It does not replace retry: after an abandoned UNKNOWN attempt is settled as FAILED, the existing retry route can create the next attempt under the same run and usage task.

If the target is not the active run's current attempt, or the current target is not UNKNOWN, the route returns HTTP 409 with `CHAT_RECOVERY_NOT_ALLOWED`. Cross-owner/missing conversation, run, and attempt lookups retain the existing non-disclosing not-found behavior.

## 1. Runtime boundary

The authenticated Chat stream remains `POST /api/ai/messages/stream` and uses protocol 1. Existing request, run, attempt, cancellation, accounting, and persistence envelopes remain as documented by [API.md](API.md). Each model request still goes through the existing usage Gateway and provider/accounting path.

### Conversation reading scope

New Chat conversations start `UNBOUND`. The first successfully admitted `turn` binds its normalized reading policy and IDs in the same transaction as the USER message and run. This binding remains even if generation later fails or is cancelled. `ConversationView` returns `chatScopeState` (`LEGACY`, `UNBOUND`, or `BOUND`) and the bound `chatScope` when applicable, so a client can restore the conversation scope. The scope stores `retrievalMode`, `subjectId`, `currentSourceId`, and normalized `sourceIds`; it does not store `selectionText` or an ingestion revision. The first scoped turn validates its requested context before binding. Each attempt independently captures and validates the current owner, subject, READY sources, and ingestion revisions.

An omitted `readingContext` on a later turn inherits the bound conversation scope. A supplied non-null context must match the bound policy and IDs; selected source ordering does not affect equality. A mismatch returns HTTP 409 `CHAT_SCOPE_CONFLICT` before persisting a USER message or run. Clients should start a new conversation to change scope. A conversation first bound without `readingContext` is explicitly owner-wide (`BOUND` with `chatScope: null`); this remains distinct from `UNBOUND`. `AUTO` retains its existing semantics and is stored as `AUTO`. `ReadingContext` contains `subjectId`, `retrievalMode`, `currentSourceId`, and `sourceIds`. The command accepts an optional top-level `selectionText` of up to 4000 characters as quoted context for that turn, including when the turn inherits its scope. Omitted or blank text leaves the turn unquoted.

Existing rows migrate as `LEGACY` and remain available for history viewing. They are not automatically assigned a scope from their first or latest run; a new turn or retry against a LEGACY conversation returns `CHAT_SCOPE_CONFLICT`, and the client must create a new conversation. Existing run status reads and supported history reads use the persisted records. Reposting a pre-upgrade command with the same request ID and a non-null `readingContext` can return HTTP 409 `CHAT_REQUEST_CONFLICT` because replay compares the hash of the current command shape. An eligible retry targets the persisted run and uses its original context, subject to the conversation binding. Activity submission inherits the conversation binding and is admitted only when the source activity run has the same normalized scope.

An otherwise valid provider `STOP` with no nonblank public text and no `READY` non-activity display block receives at most one continuation request in the same attempt, only when the existing iteration allowance has room. Reasoning-only, whitespace-only, and invalid/in-progress display previews are not public answers. A valid display component may finish without prose, and a `READY` quiz/question activity still commits and ends immediately. If there is no iteration room or the continuation also stops without public content, the server emits a short visible completion message. Existing Gateway model/token limits, deadline, cancellation, owner, source scope, revision, and Provider failures retain their current terminal behavior. No request, event, or persisted schema changes.

The Agent receives four read-only, owner-scoped data tools and six local display tools. Each `render_*` call describes exactly one component. The model does not send a component-marked body, and the client does not parse component markup from Markdown. There is no legacy marker, NDJSON body, parser fallback, or format conversion path.

### Bounded subject source discovery

The current native read-only tools are `search`, `list_sources`, `read_source_excerpt`, and `read_source_overview`. `list_sources` accepts an optional integer `offset` (default `0`) and `limit` (default `20`, maximum `20`). It returns `{items:[{sourceId,title,revision,hasOverview}],total,hasMore,nextOffset}` from the source/revision snapshot captured when the attempt began. `hasOverview` is true only when a complete, current formal SOURCE overview is readable for that captured source revision. The page is bounded to 20 records and loads formal overview records in one batch; current SOURCE_CONTENT inputs are still checked by rebuilding the exact raw descriptor for each of those at most 20 rows. `total` counts only documents inside that attempt's authorized scope; it is not a user-wide or cross-subject count. Catalog titles are untrusted text. A catalog `sourceId` can be used with `read_source_overview`, with a real `chunkId` in `read_source_excerpt`, or as an optional `search.sourceIds` selector that narrows this attempt's authorized scope.

`read_source_overview` reads only the current formally saved SOURCE result, after owner, READY, captured revision, and the existing complete-result/input-descriptor checks pass. It does not read SUBJECT aggregate overviews, candidates, in-progress results, stale revisions, or generate anything. It deterministically renders the saved title, outline, and all three summary fields as Markdown, then pages the text by Unicode code point using `offset` (default `0`) and `limit` (default `8192`, maximum `8192`). The JSON envelope remains complete and is dynamically shortened to fit the existing `max-tool-result-utf8-bytes`; if metadata or one code point cannot fit, the existing tool-result-too-large path is used. Each available page returns `overviewVersion`, `total`, `hasMore`, and `nextOffset`. Continuation pages require the prior `overviewVersion`; if the saved version changes, the tool returns `STALE` without mixing versions, and a missing/current-invalid result returns `UNAVAILABLE`. Both are normal tool results so source search and excerpt reading can continue. The overview is AI-generated navigation, not verbatim source evidence; detailed or quoted claims require search or source excerpts. History compaction retains bounded overview text, status, source/revision, and pagination/version metadata while preserving native tool call/result pairing. An earlier `read_outline` call in preserved history follows the existing unknown-tool history boundary; it is not aliased or converted.

For `retrievalMode=SUBJECT`, client `currentSourceId` must be null and client `sourceIds` empty; either supplied value is rejected with `VALIDATION_FAILED`, consistent with subject retrieval validation. Native `search.sourceIds` is a per-call selector and does not modify that client context. When supplied, it must be a nonempty array of at most 100 unique UUIDs, each inside the captured owner/subject/READY/revision scope; search queries only that set. An explicit null, empty array, duplicate, invalid UUID, unknown argument, or explicit model tool ID outside this attempt's captured scope returns repairable `CHAT_TOOL_ARGUMENT_INVALID`; the request is rejected without querying or returning out-of-scope material. The model may correct the argument once while the captured scope remains valid. Internally returned out-of-scope sources and real owner, READY, or revision changes remain terminal (`SOURCE_SCOPE_DENIED` / scope or revision error), and are never converted to an intersection or a wider scope. Without this argument, search uses all READY source IDs captured at the start of the attempt, including for an owner-wide conversation. An empty snapshot returns empty evidence without requesting an embedding. The 100-ID limit applies only to an explicit tool argument. The prompt directs the model to discover the catalog for document-distribution and cross-document coverage questions. Catalog pagination metadata is internal tool control data; it must not be shown to users or used to claim the document bodies were fully read. The model can claim only the specific list pages and excerpts/outline passages it actually inspected. The tool can only enumerate the current attempt's authorized scope and does not broaden it. `AUTO` with `currentSourceId` and `SELECTED_SOURCES` retain their existing source/current-selection scope. Invalid pagination parameters use the existing repairable `CHAT_TOOL_ARGUMENT_INVALID` read-tool path; real owner/READY/revision failures remain terminal.

The catalog is not injected into protected required context. It enters a model request only as a native tool definition/result, so existing full mapped-request capacity checks still decide whether each request fits. The server reads source metadata from the attempt snapshot; it does not issue per-catalog-row reads to external storage.

Focused validation for this contract: `ChatReadToolsCatalogTests`, `ChatAgentProtocolPublicationTests`, and `DisplayToolPayloadValidatorTests` passed 22/22 (0 failures/errors/skips) for bounded discovery. Step5 focused validation is recorded in `D:/Temp/auralis-chat-agent-loop-evolution-20261104/step5.md`; controllable vectors verify only source isolation and real chunk IDs, not semantic retrieval quality. Real Provider/model behavior and PC/Mobile acceptance remain separate.

### Capacity rejection diagnostics

The existing Gateway rejects an oversized mapped request with the existing `AI_REQUEST_BUDGET_EXCEEDED` response before usage reservation and Provider dispatch. A rejection emits an internal structured log with the rejecting dimension and its actual/limit byte values. Only that final rejection computes additional UTF-8 diagnostics for message content grouped by `SYSTEM`/`USER`/`ASSISTANT`/`TOOL` role, reasoning content, tool-call arguments, tool-definition count and bytes, and the serialized request. The mapped request does not preserve reliable history/current-turn boundaries; `USER` messages may include selection or activity context, so role alone cannot identify the current question or current-turn evidence. These byte views are not additive to serialized request bytes, which also include JSON fields, structure and escaping. Logs contain no message, prompt, tool argument values, credentials, or model response. Projector trial reductions and accepted requests do not emit these logs or compute the additional breakdown. No public response or event fields change.

### Current-turn evidence projection

Before dispatch, the projector evaluates the fully mapped provider request with the same capacity check used by the Gateway. In addition to the existing older-history reductions, it can reduce only successful read/search/source-overview results from the current turn. Exact duplicate evidence rows are omitted only when source, chunk, revision, and complete row content match; the projection retains a numeric omission marker and source metadata. Earlier excerpts and overview text are shortened in deterministic order before metadata-only projection; overview status, source/revision, overviewVersion, and page offsets remain available. The newest result is retained as long as the request fits. System instructions, the current user question, selected/activity context, quiz submission data, and authorization scope remain protected. Display/activity results and failures are preserved.

Projection does not rewrite the private evidence ledger. Native assistant tool calls and their results remain complete pairs in iteration order, with reasoning mapped to the same call group; ambiguous pairs are left untouched. If no safe projection fits, the existing `AI_REQUEST_BUDGET_EXCEEDED` is returned before reservation or Provider dispatch. Diagnostics are emitted only for final no-fit and contain numeric boundary-specific byte counts, not prompt contents. When tool-call allowance is exhausted, the existing final iteration may close out without executing another tool; that closeout instruction takes precedence over repairing an earlier tool error. Repair is permitted only while the attempt still has tool-call and iteration allowance and no closeout instruction has been issued. All existing call, iteration, task-usage, and deadline accounting remains in force. No public API/SSE fields, database structure, configured limits, or additional model calls are introduced.

Only a complete tool call on a valid provider `tool_calls` terminal can enter execution. A display preview is provisional presentation state; it never executes a tool, makes an activity submit-ready, or bypasses final validation.

## 2. Tool catalog and argument contract

All six display tools accept one JSON object. Root and child objects have closed field sets (`additionalProperties:false`). The provider schema advertises the required fields and minimum array sizes below. The final display-tool server validator rejects duplicate JSON keys, trailing tokens, unknown fields, wrong types, invalid values, and semantically invalid payloads. Required text must be nonblank. Optional text fields, when present, must be strings. No display-specific string-length or maximum-array-item count is defined; every individual serialized Chat request and complete display-tool argument string is bounded by `auralis.ai.chat-agent.max-serialized-request-utf8-bytes` (default 524,288 UTF-8 bytes). The same limit is used for the complete serialized request. The tool-result limit is separate (default 65,536 UTF-8 bytes). No custom display JSON nesting-depth limit is configured.

### `render_steps`

```json
{
  "title": "Release",
  "description": "Safe rollout",
  "items": [
    {"title": "Build", "description": "Compile and package"},
    {"title": "Deploy"}
  ]
}
```

Required: nonblank `title`; `items` with at least one object. Each item requires nonblank `title` and may include string `description`. Root fields: `title`, `description`, `items`. Item fields: `title`, `description`.

### `render_compare`

```json
{
  "title": "Polling vs SSE",
  "items": [
    {
      "title": "Update delivery",
      "entries": [
        {"label": "Polling", "text": "Client requests repeatedly."},
        {"label": "SSE", "text": "Server streams updates."}
      ]
    }
  ]
}
```

Root requires nonblank `title` and `items` with at least one dimension. Each dimension requires nonblank `title` and at least two `entries`; each entry requires nonblank `label` and `text`. Root fields: `title`, `description`, `items`. Dimension fields: `title`, `entries`. Entry fields: `label`, `text`. A dimension is one preview row; entries are published together in their original order.

### `render_roadmap`

```json
{
  "title": "Learning path",
  "description": "Build the ideas in order",
  "items": [
    {"title": "Foundations", "tag": "Start", "current": true},
    {"title": "Applications", "description": "Apply the model", "current": false}
  ]
}
```

Root requires nonblank `title` and at least one item. Each item requires nonblank `title`; `description` and `tag` are optional strings, and `current` is an optional boolean. Root fields: `title`, `description`, `items`. Item fields: `title`, `description`, `tag`, `current`.

### `render_chart`

```json
{
  "title": "Requests by transport",
  "description": "Measured in one test run",
  "chartType": "bar",
  "unit": "requests",
  "items": [
    {"label": "Polling", "value": 18},
    {"label": "SSE", "value": 7}
  ]
}
```

Required: nonblank `title`, `chartType` equal to `bar` or `proportion`, and at least one item. Each item requires nonblank `label` and a finite numeric `value >= 0`. A `proportion` chart must have a positive total. Optional root fields are `description` and `unit` strings. Root fields: `title`, `description`, `chartType`, `unit`, `items`. Item fields: `label`, `value`. Values must come from user-provided information or evidence received by the Agent; the tool schema does not establish that a value is factually supported.

### `render_quiz`

```json
{
  "question": "Which transport sends updates from server to client?",
  "questionType": "single",
  "options": [
    {"key": "A", "text": "Periodic polling"},
    {"key": "B", "text": "Server-sent events"}
  ],
  "reference": {"answer": ["B"], "explanation": "The server streams events."}
}
```

Required: nonblank `question`, `questionType` equal to `single` or `multiple`, and at least two `options`. Every option requires a unique, nonblank `key` and nonblank `text`. `reference` is optional and private. If present, it requires a nonempty `answer` array of distinct keys that exist in `options`; `single` requires exactly one answer key and `multiple` allows one or more. `explanation` is optional text. Root fields: `question`, `questionType`, `options`, `reference`. Option fields: `key`, `text`. Reference fields: `answer`, `explanation`.

### `render_question`

```json
{
  "question": "Explain why the server can send an update before the next poll.",
  "placeholder": "Write a few sentences",
  "reference": {
    "points": ["A persistent stream is already open."],
    "explanation": "Contrast this with periodic client requests."
  }
}
```

Required: nonblank `question`. `placeholder` is optional text. `reference` is optional and private; when present it must contain exactly one of a nonempty `points` array of nonblank strings or a nonblank `answer` string. `explanation` is optional text. Root fields: `question`, `placeholder`, `reference`. Reference fields: `points`, `answer`, `explanation`.

### Read-only data tools

| Tool | Arguments | Scope and result |
| --- | --- | --- |
| `search` | `{"query":"..."}`; required trimmed string, 1–1000 characters; optional `sourceIds` is a nonempty unique UUID array, maximum 100 | Without `sourceIds`, searches all READY sources captured for the attempt. An empty snapshot returns empty evidence without an embedding request. When supplied, searches only those IDs after they are verified inside the captured scope. Explicit model-selected IDs outside that scope are repairable argument errors and never cause a read. Returns up to five evidence entries with real `sourceId`, `chunkId`, `ordinal`, `title`, and `excerpt`. |
| `read_source_excerpt` | `{"sourceId":"<uuid>","chunkId":"<uuid>"}` | Reads the addressed active excerpt only if the source and chunk are within the current user's authorized read scope. Returns source/chunk IDs, ordinal, title, and excerpt. |
| `read_source_overview` | `{"sourceId":"<uuid>","offset":0,"limit":8192,"overviewVersion":7}` (`offset`, `limit`, and `overviewVersion` optional; `offset>0` requires `overviewVersion`) | Reads the saved current SOURCE overview only. Returns a complete JSON page with status `AVAILABLE`, `UNAVAILABLE`, or `STALE`, source revision, overview version, Markdown text, code-point offset/total, and continuation metadata. It does not generate or read a SUBJECT overview. |

Each data-tool provider schema declares `additionalProperties:false`. Search also rejects unknown argument names so a misspelled `sourceIds` cannot silently fall back to the wider scope. UUID, source/chunk ownership, READY state, selection, and revision checks remain server-enforced. Explicit model arguments outside the captured attempt scope are repairable `CHAT_TOOL_ARGUMENT_INVALID`; a source returned from internal validation outside the scope and real owner/READY/revision changes remain terminal. The execution path validates source revisions before and after retrieval. Data-tool results are passed to the model as tool results, not exposed as raw SSE payloads.

## 3. Streamed tool progress and terminal execution

The provider emits typed deltas carrying provider response ID, choice-local tool index, optional call ID/name fragment, and the exact arguments fragment. The adapter forwards each delta through a per-request progress observer with the accumulated call ID and name; fragments are isolated by `(responseId,index)`. This observer is not the LangChain partial-call builder and does not alter the Gateway invocation.

When an accumulated name exactly matches one of the six display tools, the runtime creates one `GENERATING` block and emits `block.started`. It incrementally previews only complete, allowlisted scalar values and complete direct child objects from `items` or `options`. The final full arguments are parsed and validated again. Previewed rows remain in place if final validation fails, but the block becomes `INVALID` and cannot be submitted. If a name later grows beyond a known tool name, the final call is rejected; any started preview is invalidated.

No call executes unless the provider finishes with a normal `tool_calls` terminal and every terminal call has a unique nonblank ID, a known name, a contiguous valid index, and arguments that exactly match its streamed deltas. Display calls must also pass the complete payload validator and match their preview. `stop`, `length`, content-filter/other terminals, malformed arguments, unknown calls, EOF before the provider terminal, cancellation, and provider errors do not execute accumulated calls. These failures leave already-started display blocks `INVALID`, preserve validated public rows, and prohibit activity submission.

After a valid terminal, complete calls are processed in provider-index order. `tool.started` is emitted at execution time and contains only `{toolCallId,name}`. A valid visual display call emits its final `block.completed` part, then `tool.completed`; the model receives `{"status":"rendered","blockId":"..."}` as the tool result and may continue its loop. Data tools remain read-only and execute only after the same terminal gate. At most 20 executed tool calls are allowed by default; `max-tool-calls` bounds the configured maximum to 20. Model iterations default to and are bounded at 12. The final allowed iteration is reserved for answering from existing evidence: tool schemas remain available for native history validation, but no new data, display, or activity tool executes. If the model still requests tools, they are recorded as not executed and the attempt ends with a visible limitation statement instead of dispatching another iteration. Earlier normal answers and READY activities end immediately. Smaller configured iteration limits use the same final-iteration rule; existing token, independent model/embedding call, deadline and cancellation gates still apply. Merely previewing a display block does not consume a call slot.

For a complete normal `tool_calls` terminal, the first repairable display schema/semantic rejection in an attempt may receive one correction iteration under the existing model, tool, token, cancellation, source/fence, and deadline gates. Higher-index calls in that same batch are paired with `not_executed/CHAT_TOOL_NOT_EXECUTED/PREVIOUS_DISPLAY_ARGUMENT_INVALID` tool results; the result includes a fixed hint that the tool did not run and may be called again after correcting the previous tool's arguments if still needed, without repeating successful tools. The result contains no raw arguments or reference. Current-iteration and historical tool-call/result pairing remains native; history projection reconstructs only this fixed hint from the allowlisted status/code/reason and ignores arbitrary historical hint text. This is private model context, not a public HTTP/SSE field. No repair occurs for cancellation, source/fence, budget, identity, JSON syntax, preview, or provider-finish failures.

Read tools have a separate bounded recovery rule. `CHAT_TOOL_ARGUMENT_INVALID` from a known read tool and `RESOURCE_NOT_FOUND` from `read_source_excerpt` may return one private native `tool_error` result per attempt, but only after the current owner scope and source revisions validate again. An explicit source ID supplied by the model outside the captured scope is an argument error; a source returned by internal validation outside the scope and real owner/READY/revision changes retain their terminal path. The result contains only the safe error code, a repairable flag, and fixed guidance; arguments and source/chunk IDs are never copied into the hint. Cancellation, budget, Provider, and system failures also retain their normal terminal path. A second eligible error closes source reading for that attempt and requests one final model iteration under the existing iteration, call, usage, and deadline limits. The existing tool definitions remain in that request to preserve native history call/result validation; the backend refuses to execute any requested tool in this closeout iteration. If the model still requests a tool, the paired private result is recorded as not executed and the run completes with a fixed material-insufficiency sentence after rechecking scope and owner. Each read failure keeps the existing public `tool.error` payload and may be followed by normal output/`run.completed`; no SSE field or event was added. Historical projection rebuilds these outcomes from allowlisted status/code/reason and fixed hints only; hints identify prior-attempt state and do not impose a read restriction on the current attempt.

For retrieval convergence, an empty or clearly irrelevant search may be followed by one targeted rewrite or lookup from a trustworthy clue. If it still supplies no relevant support, the model stops searching and states that the material is insufficient; a general-knowledge supplement is allowed only when the user did not require a material-only answer and must be clearly distinguished. Existing retrieval scope and runtime limits remain in force.

The first fully valid activity tool reached in provider-index execution order commits READY through the existing atomic `readyActivity` transaction before any READY SSE event. That commit includes the activity/part state, tool trace/evidence, source revision fence, question data, and private reference. After commit, the server emits `block.completed` with the `READY` part, `activity.ready`, and `tool.completed`, then ends the model loop without another model request. Higher-index display previews are marked `INVALID`; higher-index calls are not executed. A transaction failure emits no READY claim and cannot leave the card submit-ready.

## 4. Public SSE event contract

Each SSE `data:` item is one `ChatSseEnvelope`. Existing top-level identity and sequencing fields remain stable:

```json
{
  "protocolVersion": 1,
  "conversationId": "conversation-uuid",
  "requestId": "request-id",
  "runId": "run-uuid",
  "attemptId": "attempt-uuid",
  "userMessageId": "user-message-uuid",
  "replyMessageId": "reply-message-uuid",
  "iterationId": "iteration-uuid",
  "blockId": "block-uuid-or-null",
  "sequence": 12,
  "event": "block.item",
  "payload": {}
}
```

`event:` matches `envelope.event`; `sequence` increases within the attempt. `blockId` is the component identity for component events. Arguments, raw provider buffers, tool results, private references, credentials, and answer keys never appear in public SSE payloads.

| Event | Payload |
| --- | --- |
| `text.delta` | `{text,publicTextDelta}`; both carry the original text increment. |
| `reasoning.delta` | `{text}`; only the explicit provider reasoning delta. |
| `block.started` | `{componentId,component,publicTextDelta}`; `component` is `steps`, `compare`, `roadmap`, `chart`, `quiz`, or `question`; initial public delta is the block boundary newline. |
| `block.item` | `{componentId,component,row,publicTextDelta}`; `row` is one validated public row below. |
| `block.completed` | `{componentId,part,publicTextDelta}`; `part` is the completed public block. |
| `block.error` | `{componentId,safeErrorCode,publicTextDelta}`; invalid blocks retain their earlier validated rows. |
| `activity.ready` | `{activityId,questionId,questionVersion,componentId,publicTextDelta:""}`; emitted only after READY commits. |
| `activity.submitted` | `{activityId,submissionId,questionId,part,publicTextDelta:""}`; `part.state` is `SUBMITTED` and contains the user's answer. |
| `tool.started`, `tool.completed` | `{toolCallId,name}`; no arguments or result. |
| `tool.error` | `{toolCallId,name,safeErrorCode}`. |
| `run.completed` | `{replyMessageId,executionActive:false}`. |
| `run.failed` | `{replyMessageId,executionActive:false,safeErrorCode}`. |
| `run.cancelled` | `{replyMessageId,executionActive:false}`. |
| `run.unknown` | `{replyMessageId,executionActive:true,safeErrorCode:"CHAT_WORKER_OWNERSHIP_UNKNOWN"}`; the slot remains held. |

Example preview events:

```json
{"event":"block.started","payload":{"componentId":"block-uuid","component":"compare","publicTextDelta":"\n"}}
{"event":"block.item","payload":{"componentId":"block-uuid","component":"compare","row":{"type":"item","title":"Update delivery","entries":[{"label":"Polling","text":"Client requests repeatedly."},{"label":"SSE","text":"Server streams updates."}]},"publicTextDelta":"### Update delivery\n- **Polling**: Client requests repeatedly.\n- **SSE**: Server streams updates.\n"}}
```

The surrounding envelope fields are present on each real event. The event `publicTextDelta` is a deterministic Markdown projection of that event's text or row, not a second source of component data.

Terminal visual and activity payload examples:

```json
{"event":"block.completed","payload":{"componentId":"block-uuid","part":{"id":"block-uuid","componentId":"block-uuid","kind":"block","component":"steps","state":"READY","meta":{"title":"Release"},"items":[{"title":"Build"}]},"publicTextDelta":"\n"}}
{"event":"activity.ready","payload":{"activityId":"activity-uuid","questionId":"activity-uuid","questionVersion":1,"componentId":"block-uuid","publicTextDelta":""}}
```

The visual payload is emitted after complete final validation. The activity payload follows the successful READY transaction; it is never emitted from preview state.

## 5. Component row and part shapes

Rows are the only progressive component payloads. `type` and field allowlists are component-specific:

| Component | Metadata/stem row | Item/option row |
| --- | --- | --- |
| `steps` | `{type:"meta",title,description?}` | `{type:"item",title,description?}` |
| `compare` | `{type:"meta",title,description?}` | `{type:"item",title,entries:[{label,text},...]}` |
| `roadmap` | `{type:"meta",title,description?}` | `{type:"item",title,description?,tag?,current?}` |
| `chart` | `{type:"meta",title,description?,chartType,unit?}` | `{type:"item",label,value}` |
| `quiz` | `{type:"stem",question,questionType}` | `{type:"option",key,text}` |
| `question` | `{type:"stem",question,placeholder?}` | No item rows. |

The canonical public part is `{id,componentId,kind:"block",component,state,meta,items,questionId?}`. `state` is `GENERATING`, `READY`, `SUBMITTED`, or `INVALID`. Visual blocks use empty `questionId` omission. Quiz and question blocks include `questionId`; it starts as the component ID while generating and becomes the committed activity ID when READY.

Example completed visual part:

```json
{
  "id":"block-uuid","componentId":"block-uuid","kind":"block",
  "component":"compare","state":"READY",
  "meta":{"title":"Polling vs SSE"},
  "items":[{"title":"Update delivery","entries":[{"label":"Polling","text":"Client requests repeatedly."},{"label":"SSE","text":"Server streams updates."}]}]
}
```

Example ready activity part:

```json
{
  "id":"block-uuid","componentId":"block-uuid","kind":"block",
  "component":"quiz","state":"READY","questionId":"activity-uuid",
  "meta":{"question":"Which transport streams updates?","questionType":"single"},
  "items":[{"key":"A","text":"Polling"},{"key":"B","text":"SSE"}]
}
```

The activity `reference` is deliberately absent from `meta`, `items`, SSE, and public history. It remains private server-side for the following model context. Submission validates the answer shape and option membership; the server does not grade it or write mastery/progress results. The next model turn receives the original question and submitted answer.

`MessageView.parts` returns the same public part shape. `MessageView.content` is the server's deterministic Markdown projection of the ordered parts. Text and block boundaries are preserved: a `block.started` inserts its shell at that first-appearance position; subsequent text becomes a separate text segment; completion replaces the shell in place and never moves it. If multiple provider indices interleave, preview events and slots follow delta arrival order, while terminal tool execution and its model history results follow provider index order.

## 6. Cancellation, recovery, and slot ownership

Cancellation requests stop the synchronous provider read and prevent subsequent tool execution, but a run does not release its conversation slot while that reader or a read tool is still executing. The worker publishes terminal cancellation/unknown state only through the existing owner fence. If cancellation, malformed output, EOF, or another failure interrupts a started display call, the visible part transitions to `INVALID`; accepted rows stay visible and submission remains disabled. An `activity.ready` transaction that has already committed is durable even if cancellation arrives immediately afterward.

An `UNKNOWN` owner state retains the conversation slot. Reconnecting to SSE or closing a client connection does not prove that a provider reader or tool exited. A slot is released only after the executing worker has returned and persisted its terminal result, or existing recovery has safely established that no execution owns it.

## 7. Optional local diagnostic capture

Raw assistant text and recognized display-tool argument fragments may be captured locally only when `auralis.ai.chat-agent.raw-content-capture-enabled=true` (environment variable `AURALIS_AI_CHAT_DIAGNOSTIC_RAW_CONTENT_ENABLED`, default `false`). The directory defaults to `/tmp/auralis-chat-diagnostics`. Tool argument files are named from run, attempt, iteration UUIDs and provider index (`...-tool-<index>.json`); the filename does not use the call ID or tool name. Capture is capped against the configured provider response-byte limit across the attempt. Logs contain safe identity, tool name, path, byte count, completion and truncation status; they do not contain argument text. Diagnostic capture is not an SSE field, a persisted public part, or a model-visible tool result.

## 8. Compatibility boundary

This contract has one current display path: typed provider tool-call deltas, strict final tool arguments, public part projection, and the SSE events above. Old `:::auralis` component markers or body-embedded NDJSON are not parsed or converted. Existing canonical public parts that already match this contract remain the current shape and are read/rendered as current data; this is not a legacy compatibility layer. Existing stored message text is not rewritten or deleted as part of this protocol change; old text does not become a generated component through a fallback reader. The runtime does not add dual-read, dual-write, legacy parser, or feature-flag protocol paths.

# Chat Runtime API (protocol 1)

Updated: 2026-10-29

Status: Server source candidate with six focused backend fixes implemented. The unified focused clean/test run covered 6 suites / 21 tests (0 failures/errors/skips), and `mvn -B -ntp -DskipTests package` succeeded. V43 adds private `chat_attempts.private_tool_evidence_json` used only for subsequent model context; it is excluded from public status/detail/trace. Initial full Maven remains 940 tests / 2 failures / 58 errors / 7 skipped, exit 1. PostgreSQL integration, production migration, real Provider, deployment, and client/GUI acceptance remain unverified.

This document supplements [API.md](API.md) for the Chat rewrite. It is the field-level handoff for backend Chat routes. The current consumer changes remain outside this backend task.

## Routes

All routes require the existing authenticated user session. The server derives `userId` from the principal; request data never selects an owner.

| Method and route | Purpose | Response |
| --- | --- | --- |
| `POST /api/ai/messages/stream` | Start or replay a regular turn or activity submission | `text/event-stream`; admission runs before the response body is returned, so an occupied conversation is rejected as HTTP 409 |
| `POST /api/ai/conversations/{conversationId}/runs/{runId}/attempts` | Explicitly retry a settled failed/cancelled attempt, or retire a foreign PENDING attempt only after its persisted deadline expired | `text/event-stream`; body `{ "requestId": "..." }` |
| `GET /api/ai/conversations/{conversationId}/runs/{runId}` | Read run/attempt state, accounting summary, and current public snapshot | `ChatRunStatusView` |
| `POST /api/ai/conversations/{conversationId}/runs/{runId}/cancel` | Request cancellation; a RUNNING attempt keeps the slot until its synchronous provider reader and tools exit | `ChatRunStatusView` |
| `POST /api/ai/text-generations` | One-shot text operations used for extraction/formatting/summary/transcript work | `{ "text": "..." }` |

`GET /api/ai/conversations/{conversationId}` returns messages with `parts` on each `MessageView`, plus a top-level `activeRun` recovery snapshot when a run still owns the conversation slot. `MessageView` does not carry `runId`, `attemptId`, or a per-message request ID. Protocol-1 details reject conversations whose protocol is absent or unsupported; list rows expose `chatSupported:false` for retained legacy records.

## Chat request body

The only Chat request shape is `AiMessageCommand`:

```json
{
  "protocolVersion": 1,
  "action": "turn",
  "conversationId": "uuid",
  "requestId": "client-generated-idempotency-key",
  "content": "What does this passage mean?",
  "readingContext": {
    "currentSourceId": "uuid-or-null",
    "subjectId": "uuid",
    "retrievalMode": "AUTO",
    "sourceIds": [],
    "selectionText": null
  },
  "selectionText": null
}
```

`protocolVersion`, `action`, `conversationId`, and a nonblank `requestId` (1–128 characters) are required. `action` is `turn` or `activity_submission`. `content` is required for `turn` (maximum 12,000 characters); activity-only fields are rejected for a turn. `readingContext` is optional and its server-side source scope is always revalidated for the authenticated owner.

Activity submission uses the same route and stable conversation/run protocol:

```json
{
  "protocolVersion": 1,
  "action": "activity_submission",
  "conversationId": "uuid",
  "requestId": "request-id-for-this-submission",
  "activityId": "uuid",
  "questionVersion": 1,
  "submissionId": "uuid",
  "answer": "free text answer"
}
```

For an open question, `answer` is a nonblank string up to 4,000 characters. For a choice activity it is a nonempty array of distinct option-key strings; a single-choice question accepts exactly one key and a multi-choice question accepts up to 12. The server validates keys against the saved public options. The answer is persisted as the stable USER message content. Replaying the same `submissionId` and answer is idempotent; changing either after submission returns HTTP 409.

The retry request body contains only a new `requestId`. Retry reuses the run's saved normalized context and stable USER message; it creates a new attempt and reply message ID. Before creating that attempt or reserving the conversation, the server resolves the provider saved for the run and compares provider, model, and normalized endpoint hash. A changed profile returns HTTP 409 `CHAT_PROFILE_CHANGED`. Rotating credentials on the same provider/model/endpoint is allowed. Changing the current default provider does not change the provider saved by an existing run. The same retry `requestId` replay is resolved before this profile lookup.

For a new turn, the server looks up `(userId, requestId)` and compares the normalized client-body hash before resolving provider settings. `request_hash` covers only normalized request-body fields; it excludes `requestId` and the resolved profile. A matching replay therefore returns the existing run even if provider configuration later changes. A newly admitted run stores `provider`, `chatModel`, and `endpointHash` in `request_context_json`; the endpoint value is a SHA-256 hash of the normalized endpoint, and no credential or plaintext endpoint is stored there. Immediately before execution and before any Provider/tool call, the worker resolves the saved provider again and rejects a changed provider/model/endpoint with `CHAT_PROFILE_CHANGED`.

A PENDING attempt has not passed the database claim that precedes all Provider calls. Startup recovery marks an expired persisted PENDING attempt failed and releases its slot without redispatch. A retry may do the same only for an expired PENDING attempt from another worker instance; a fresh or same-instance PENDING attempt remains protected and an occupied slot returns HTTP 409. A RUNNING or UNKNOWN attempt cannot be retried.

## SSE envelope and public event payloads

Each SSE `data:` item is a JSON `ChatSseEnvelope`:

```json
{
  "protocolVersion": 1,
  "conversationId": "uuid",
  "requestId": "request-id-for-this-attempt",
  "runId": "stable-run-uuid",
  "attemptId": "attempt-uuid",
  "userMessageId": "stable-user-message-uuid",
  "replyMessageId": "this-attempt-reply-message-uuid",
  "iterationId": "uuid-or-null",
  "blockId": "uuid-or-null",
  "sequence": 1,
  "event": "text.delta",
  "payload": {}
}
```

The `event:` line matches `envelope.event`. `sequence` increases for every envelope within an attempt. Replaying a terminal request repeats its persisted terminal sequence; it does not create another attempt. A new retry gets a new `attemptId`, reply message ID, and sequence starting at 1. Event payloads contain only public projection data and safe identifiers; private references, raw provider buffers, tool arguments/results, and credentials are not serialized.

| Event | Payload |
| --- | --- |
| `run.started` | `{ status, replayed? }` |
| `text.delta` | `{ text, publicTextDelta }`; both fields contain the same original text increment |
| `block.started` | `{ componentId, component, publicTextDelta }`; component is `steps`, `compare`, `roadmap`, `chart`, `quiz`, or `question` |
| `block.item` | `{ componentId, component, row, publicTextDelta }`; `row` is parser-validated and allowlisted |
| `block.completed` | `{ componentId, part, publicTextDelta }`; `part` is the complete `ChatContentPart` public shape below |
| `block.error` | `{ componentId, safeErrorCode, publicTextDelta }` |
| `activity.ready` | `{ activityId, questionId, questionVersion, componentId, publicTextDelta:"" }`; emitted only after the READY transaction commits |
| `activity.submitted` | `{ activityId, submissionId, questionId, part, publicTextDelta:"" }`; `part.state` is `SUBMITTED` and includes the user's submitted answer |
| `tool.started`, `tool.completed` | `{ toolCallId, name }`; no arguments or result body |
| `tool.error` | `{ toolCallId, name, safeErrorCode }` |
| `run.completed` | `{ replyMessageId, executionActive:false }` |
| `run.failed` | `{ replyMessageId, executionActive:false, safeErrorCode }` |
| `run.cancelled` | `{ replyMessageId, executionActive:false }` |
| `run.unknown` | `{ replyMessageId, executionActive:true, safeErrorCode:"CHAT_WORKER_OWNERSHIP_UNKNOWN" }`; slot remains held |

The canonical block part is:

```json
{
  "id": "block-uuid",
  "componentId": "block-uuid",
  "kind": "block",
  "component": "quiz",
  "state": "READY",
  "meta": { "question": "...", "questionType": "single" },
  "items": [{ "key": "A", "text": "..." }],
  "questionId": "activity-uuid"
}
```

`state` is one of `GENERATING`, `READY`, `SUBMITTED`, `INVALID`; completed valid structures are committed and emitted as `READY`. A quiz requires its validated private answer reference before it can become a submit-ready activity; an open question may be submitted without an optional private reference. Invalid/non-submittable activity blocks are emitted as `INVALID`. Activity submission updates a READY part to `SUBMITTED` with `submittedAnswer` as a string or a string array. Visual components use their allowlisted `meta`/`items` fields. `messages.content` is the server's deterministic Markdown projection of the same ordered `parts`; `publicTextDelta` includes block boundary newlines so clients can append it without re-projecting components.

## Run status and recovery fields

`ChatRunStatusView` fields:

```text
protocolVersion, conversationId, runId, requestId, userMessageId,
currentAttemptId, currentReplyMessageId, status, fenceVersion,
executionActive, accountingSummary, publicSnapshot, toolTrace,
createdAt, updatedAt, attempts[]
```

Each attempt contains `attemptId`, `attemptNo`, `requestId`, `status`, `replyMessageId`, `createdAt`, `startedAt`, `endedAt`, and `safeErrorCode`. Status values are `PENDING`, `RUNNING`, `CANCEL_REQUESTED`, `COMPLETED`, `FAILED`, `CANCELLED`, and `UNKNOWN`. Attempt deadlines are captured at admission and do not move when configuration changes or the SSE body starts late.

Conversation detail's top-level `activeRun` contains `runId`, `userMessageId`, `currentAttemptId`, `currentReplyMessageId`, `status`, `executionActive`, `publicSnapshot`, `toolTrace`, and `updatedAt`. Its presence means the conversation slot remains occupied, including after a card is durably READY while the provider reader is still stopping. `run.completed` is emitted only after cleanup releases the slot. If an SSE connection drops, read conversation detail or the run-status route to recover the latest checkpoint.

`accountingSummary` contains only owner-scoped aggregate values: `chargedTokens`, `reservedTokens`, `calls`, `unknownDispatchedCalls`, and `reservedCalls`. Raw reservation rows, credentials, and provider request data are never returned.

UNKNOWN is reserved for a persisted RUNNING/CANCEL_REQUESTED attempt owned by another process whose persisted attempt deadline expired and whose worker is not local. Startup recovery advances the conversation fence, creates the allocated assistant reply as `FAILED` with the last public snapshot, marks the attempt/run UNKNOWN, and retains the conversation slot, preventing late writes and redispatch. A fresh foreign run within its persisted deadline remains untouched, even if this process has different configuration. Expired PENDING attempts are safe to fail without redispatch because they have no dispatch claim; fresh foreign PENDING attempts are protected. Usage incompleteness alone does not make a business run UNKNOWN: after the local synchronous worker/reader exits, the run settles as completed, failed, or cancelled while the Gateway retains its full conservative reservation. Lease expiry alone never unlocks an UNKNOWN run. Recovery requires an auditable operator action confirming the old worker/reader is isolated and the reservation has been conservatively settled; no generic unlock route is provided.

Admission and its short transaction complete before the controller returns the streaming response. A concurrent request for an occupied conversation therefore returns an HTTP 409 Problem Details response before SSE headers are committed. The streaming callback claims the persisted PENDING attempt before any Provider call; if cancellation or recovery fences it first, the callback cannot dispatch or publish.

## One-shot text generation

```json
{ "operation": "format", "input": "...", "requestId": "optional-stable-budget-key" }
```

`operation` is `summary`, `extract`, `format`, or `transcript`; `input` is nonblank and up to 48,000 characters. Response: `{ "text": "..." }`. This endpoint makes one governed model call and does not enter the Chat conversation loop or create Chat messages.

## Persistence and implementation boundary

New Chat runs write protocol version 1 on conversations and messages. Existing rows remain unchanged; the Chat API does not convert old rows or expose their old body format. The V42 migration adds `chat_runs`, `chat_attempts`, `chat_activities`, protocol/fence columns, idempotency and per-attempt reply constraints, and owner/message/run foreign keys. Run admission, stable USER persistence, PENDING attempt creation, and conversation slot reservation share one short transaction; Provider and tool calls run after it commits. Activity READY commits the real ASSISTANT message, public snapshot, and private reference atomically before public completion is emitted.

This source contract is not a claim that the Server full suite passed or that PostgreSQL integration, deployment, provider, or any client has been verified. See the current validation status above.

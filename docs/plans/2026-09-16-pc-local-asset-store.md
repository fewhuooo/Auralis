# PC Local Asset Store 全栈实施计划

> **For agentic workers:** Luna 子代理负责实现、审查和验证；只有涉及 Auralis-PC 视觉样式调整时才使用 Antigravity MCP。Track progress with the checkboxes in this document.

**Goal:** 将 PC 文件导入改造为本地资料库：导入后原文件长期保存在受管目录，断网时仍可预览和解析；所有文件最终自动同步到 Server/MinIO；只有用户删除最后一个引用该 Asset 的 Source 时才删除本地文件。

**Architecture:** Tauri Rust 负责受管文件目录、原子写入、校验与删除；SQLite 负责本地 Asset、同步任务和 Source draft 元数据；PC TypeScript 负责导入编排、后台同步、预览与解析消费；Server 通过稳定 `clientImportId` 幂等创建 Asset。`localSourceId` 直接作为未来的 Server Source ID，但 Source CREATE 只有在 Asset READY 后才进入既有 outbox。离线解析使用独立 `localContentRevision` 保存可重封装派生结果，拿到服务端 `ingestionRevision` 后才生成 ParsedDocument 上传包。

**Tech Stack:** Vue 3、TypeScript、Zustand-compatible Pinia-style store modules、Tauri 2/Rust、SQLite、Spring Boot/Java、Flyway、MinIO、Node test、JUnit 5；Luna 子代理负责 Server、Rust、契约、集成和前端逻辑，Antigravity MCP 仅在 Auralis-PC 视觉样式调整时使用。

## 冻结决策与全局约束

- [ ] 路径边界服从已安装运行时的实际行为：`tauri-plugin-sql 2.4.0` 将 `sqlite:auralis.db` 解析到 `app_config_dir()`，Rust snapshot command 必须指向同一数据库；Local Asset 的 `assets/`、`asset-staging/`、`asset-orphans/` 与 `document-cache/` 从 `app_data_dir()` 派生。用真实 Tauri 路径测试分别验证两类根目录。
- [ ] `clientImportId` 是 `POST /api/assets/upload-intents` 的必填 UUID；同一用户同一 key 且元数据一致时返回同一 Asset，元数据冲突时返回稳定 409；不同用户可复用同一 key。
- [ ] `localSourceId` 由 PC 生成并直接作为 Server `sourceId`，不新增 Source ID 映射表；Asset READY 前只存在 `local_source_drafts`，不得把 `localAssetId` 写入 `assetId`。
- [ ] `localContentRevision` 与 Server `ingestionRevision` 永久分离；无 Server revision 时不得调用 ParsedDocument 上传接口，也不得修改 SQLite 字段伪装续传。
- [ ] Local Asset 是长期资料库，不因登出、应用升级、同步失败或缓存清理删除；仅最后一个 Source 引用被用户删除时进入受控删除。
- [ ] 本地原文件保持明文，由 OS ACL 和受管路径保护；派生文档继续沿用现有加密边界。日志不得包含正文、绝对路径、签名 URL 或密钥。
- [ ] 不实现导出、恢复或副本管理能力；reconciliation 只修复运行时元数据/文件不一致。
- [ ] 保护当前工作树，尤其不得覆盖 `AppSidebar.vue`、`components/subject/**`、`taskViewRules.ts`、`useTaskStore.ts` 和现有 views 的用户修改。
- [ ] 涉及 Auralis-PC 视觉样式时，Antigravity 任务先输出计划，再实施明确授权的前端样式文件；收集后检查完整 diff、删除、依赖和越界写入。
- [ ] 代码存在、构建通过、自动测试通过、GUI/断网/多设备业务验收必须分别记录。

---

## Task 1：Server Asset 幂等导入契约

**负责人：** Luna

**文件：**

- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/AssetUploadIntentCommand.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/AssetDtos.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/AssetService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/internal/persistence/AssetEntity.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/internal/persistence/AssetRepository.java`
- Create: next unused `Auralis-Server/src/main/resources/db/migration/Vxx__asset_client_import_id.sql`
- Modify/Create: focused Asset service, controller and schema tests
- Modify: `docs/contracts/API.md`, `docs/contracts/Database.md`, `docs/modules/Backend.md`

**Contract:**

```java
record AssetUploadIntentCommand(
    long baseVersion,
    UUID clientImportId,
    String originalName,
    long sizeBytes,
    String mimeType,
    String sha256
) {}
```

- [ ] Add RED tests for same-user replay, concurrent replay, cross-user isolation and same-key metadata conflict.
- [ ] Add nullable migration column, backfill is unnecessary for historical rows, then add `(user_id, client_import_id)` unique constraint for non-null values; make the new request field required at validation boundary.
- [ ] Implement transactional lookup/create; on unique-race reload the winning row and verify immutable metadata before returning it.
- [ ] Preserve the current complete/download authorization and Asset state machine.
- [ ] Run focused tests:

```powershell
cd D:\CodeBase\Active\Auralis\Auralis-Server
.\mvnw.cmd -B -ntp -Dtest=SourceAssetRelationServiceTests,SourceAssetRelationControllerTests,SyncSchemaTests test
```

- [ ] Run `powershell.exe -ExecutionPolicy Bypass -File ..\scripts\check-openapi.ps1` and record any generated-client diff.

---

## Task 2：Tauri scoped Local Asset Native Store

**负责人：** Luna

**文件：**

- Create: `Auralis-PC/src-tauri/src/local_asset_store.rs`
- Modify: `Auralis-PC/src-tauri/src/lib.rs`
- Modify: `Auralis-PC/src-tauri/src/local_database.rs`
- Modify only if required: `Auralis-PC/src-tauri/Cargo.toml`, `Auralis-PC/src-tauri/Cargo.lock`
- Modify: `docs/modules/FrontendPC.md`, `docs/contracts/Database.md`

**Commands exposed to TypeScript:**

```rust
import_local_asset(user_scope, device_id, local_asset_id, source_path, safe_extension, expected_size, expected_sha256)
import_local_asset_bytes(user_scope, device_id, local_asset_id, safe_extension, expected_size, expected_sha256, content)
resolve_local_asset(user_scope, device_id, local_asset_id)
download_local_asset(user_scope, device_id, local_asset_id, remote_url, expected_size, expected_sha256)
delete_local_asset(user_scope, device_id, local_asset_id)
reconcile_local_assets(user_scope, device_id)
```

The implementation accepts logical identities, never a caller-selected destination path. `resolve` returns a capability-like descriptor suitable for a narrowly scoped reader, not an unrestricted filesystem root.

- [ ] Add RED Rust tests for path traversal, absolute paths, separator/extension normalization, symlink/junction containment, cross-scope access and delete isolation.
- [ ] Add RED tests for `.part -> flush/fsync -> atomic rename`, hash/size mismatch, interrupted staging, concurrent import and missing/tampered content.
- [ ] Keep the database resolver aligned with SQL plugin `app_config_dir()` and introduce a separate `app_data_dir()` resolver for managed assets; prove both paths with an integration probe.
- [ ] Implement import, resolve, remote materialization, delete and reconciliation with allowlisted logical IDs and bounded error DTOs.
- [ ] Do not enable a broad Tauri asset protocol scope. If preview requires protocol access later, defer its exact allowlist and CSP change to Task 7.
- [ ] Run:

```powershell
cargo test --manifest-path D:\CodeBase\Active\Auralis\Auralis-PC\src-tauri\Cargo.toml
```

---

## Task 3：PC schema v8、Repository 与 Native adapter

**负责人：** Luna；仅视觉样式调整使用 Antigravity MCP

**允许范围：** `Auralis-PC/src/services/**`, `Auralis-PC/src/types/**`, `Auralis-PC/src/api/tauri.ts`, `Auralis-PC/scripts/**`

**文件：**

- Modify: `Auralis-PC/src/services/localSchema.ts`
- Modify: `Auralis-PC/src/services/localDb.ts`
- Modify: `Auralis-PC/src/services/localRepository.ts`
- Create: `Auralis-PC/src/services/localAssetRepository.ts`
- Create: `Auralis-PC/src/services/localAssetService.ts`
- Modify: `Auralis-PC/src/api/tauri.ts`
- Create: `Auralis-PC/scripts/r4-local-asset-store.test.mjs`
- Modify: related local repository/schema tests

**Required records:**

```ts
type LocalAssetState = 'STAGING' | 'READY_LOCAL' | 'SYNCING' | 'SYNCED' | 'CORRUPT' | 'DELETING' | 'FAILED'
type LocalAssetSyncPhase = 'PENDING' | 'CREATING_REMOTE_ASSET' | 'UPLOADING' | 'COMPLETING_REMOTE_ASSET' | 'BINDING_SOURCE' | 'SYNCED' | 'FAILED'

interface LocalAssetRecord {
  userId: string
  deviceId: string
  localAssetId: string
  clientImportId: string
  originalName: string
  safeExtension: string
  mimeType: string
  sizeBytes: number
  sha256: string
  state: LocalAssetState
  serverAssetId: string | null
  sourceRefCount: number
}
```

- [ ] Add RED tests for idempotent schema initialization, v7→v8 upgrade, failed-upgrade retry, owner/device scoping, legal state transitions, job claim/retry and reference counting.
- [ ] Add `local_asset_files`, `local_asset_sync_jobs`, `local_source_drafts` with owner/device-scoped keys and indexes; do not merely increment `LOCAL_SCHEMA_VERSION` without upgrade behavior.
- [ ] Keep file I/O outside repositories. `LocalAssetService` coordinates native commands and metadata transaction boundaries, including staging cleanup on failure.
- [ ] Ensure browser fallback remains explicitly transient and never claims durable Local Asset semantics.
- [ ] Run focused RED/GREEN tests and then:

```powershell
cd D:\CodeBase\Active\Auralis\Auralis-PC
npm.cmd run type-check
npm.cmd run test:r4-pc
```

---

## Task 4：离线导入、Source draft 与 Asset Sync Queue

**负责人：** Luna；仅视觉样式调整使用 Antigravity MCP

**允许范围：** `Auralis-PC/src/api/**`, `Auralis-PC/src/services/**`, `Auralis-PC/src/store/**`, `Auralis-PC/scripts/**`

**文件：**

- Modify: `Auralis-PC/src/store/useAssetStore.ts`
- Modify: `Auralis-PC/src/store/useSourceStore.ts`
- Modify: `Auralis-PC/src/store/useSyncStore.ts`
- Modify: `Auralis-PC/src/services/syncCycle.ts`
- Create: `Auralis-PC/src/services/localAssetSyncQueue.ts`
- Create: `Auralis-PC/src/services/localSourceDraftService.ts`
- Modify: `Auralis-PC/src/api/useAssetApi.ts`
- Modify: `Auralis-PC/src/api/useSourceApi.ts`
- Modify/Create: focused import, sync ordering and offline tests

**Ordering:**

```text
native import -> READY_LOCAL -> local Source projection
-> upload-intent(clientImportId) -> PUT -> complete -> serverAssetId
-> SOURCE/CREATE(resourceId = localSourceId, assetId = serverAssetId)
-> sync push/pull -> server ingestionRevision
```

- [ ] Add RED tests proving offline import succeeds without HTTP, survives store recreation and never emits premature FILE Source CREATE.
- [ ] Add RED tests for restart at every upload phase, duplicate intent replay, retry/backoff, online wakeup, two concurrent workers and stale/deleted draft fences.
- [ ] Replace long-lived `Map<string, File>` ownership with persisted metadata; an in-memory handle may exist only as an optimization during the active import call.
- [ ] Persist `clientImportId` once at import. Pass it through `useAssetApi.createUploadIntent`; never regenerate it on retry.
- [ ] After Asset complete, enqueue the existing Source mutation with the pre-existing `localSourceId`; persist the resulting server `ingestionRevision` only from authoritative sync response.
- [ ] Ensure all files default to sync and failed cloud sync does not block local preview/parse.
- [ ] Run focused tests, `npm.cmd run type-check`, and `npm.cmd run test:r4-pc`.

---

## Task 5：离线解析派生结果与 ParsedDocument 重封装

**负责人：** Luna 负责 native、协议边界、PC TypeScript 流程和测试；仅视觉样式调整使用 Antigravity MCP。

**文件：**

- Modify: `Auralis-PC/src/services/documentProcessing/sourceJobScheduler.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/DocumentJobRunner.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/ParsedDocumentUploadCoordinator.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/runtime.ts`
- Modify: relevant parser/OCR adapters and local schema/repository
- Modify: `Auralis-PC/src/api/tauri.ts`
- Modify/Create: document-processing and ParsedDocument tests

**Boundary:**

```ts
prepareLocalParsedDocument(localSourceId: string, localContentRevision: string): Promise<LocalParsedReceipt>
bindLocalParsedDocument(input: {
  localSourceId: string
  localContentRevision: string
  serverSourceId: string
  ingestionRevision: string
  sourceAssetSha256: string
}): Promise<ParsedDocumentUploadInput>
```

- [ ] First add an executable spike/test proving existing encrypted cache cannot be safely rebound by updating SQLite identity fields.
- [ ] Add RED tests for offline OCR/parse completion, restart reuse without repeated OCR, no server endpoint call before `ingestionRevision`, SHA mismatch, stale revision and deleted Source fences.
- [ ] Persist a local-derived receipt whose identity is `(userId, deviceId, localSourceId, localContentRevision, sourceAssetSha256)` and whose blocks can be re-enveloped without re-running OCR.
- [ ] On authoritative Source bind, create a new ParsedDocument envelope/AAD using `serverSourceId + jobId + ingestionRevision`; keep the existing server-only resume path compatible.
- [ ] Run focused document processing suites, type-check and PC test gate.

---

## Task 6：Preview、OCR、Parser 消费方迁移

**负责人：** Luna；仅视觉样式调整使用 Antigravity MCP

**允许范围：** affected Auralis-PC components, services, stores, utils and scripts only.

**文件：**

- Modify: `Auralis-PC/src/components/FilePreview.vue`
- Modify: `Auralis-PC/src/components/preview/FileViewerRenderer.vue`
- Modify: `Auralis-PC/src/services/documentProcessing/runtime.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/sourceJobScheduler.ts`
- Modify: `Auralis-PC/src/store/useAssetStore.ts`
- Modify: `Auralis-PC/src/services/domainMappers.ts`
- Modify: `Auralis-PC/src/utils/filePreview.ts`
- Modify: preview/runtime/scheduler tests

- [ ] Add RED tests for local-first resolution, signed-URL repair fallback, offline preview, missing/corrupt local file and stable preview keys.
- [ ] Extend `FileViewerRenderer` input to accept the actual core-supported `File | Blob | ArrayBuffer`/safe URL descriptor while preserving filename, MIME and size.
- [ ] Make Preview, OCR and Parser resolve the same Local Asset descriptor; no consumer may independently persist another original-file copy.
- [ ] Use signed URL only to repair/materialize a missing local copy, not as the normal online preview path.
- [ ] Remove durable behavior from `Map<string, File>` after all consumers migrate.
- [ ] Run focused suites, `npm.cmd run type-check`, `npm.cmd run check:r4-pc`, and `npm.cmd run build`.

---

## Task 7：删除传播、reconciliation 与安全收口

**负责人：** Luna 负责 Rust/security/Server 与 PC TypeScript/UI/tests；仅视觉样式调整使用 Antigravity MCP。

- [ ] Add RED tests proving Source delete decrements references but preserves the file while any local/server Source still refers to it.
- [ ] Fence pending upload, document processing and repair jobs before the last-reference delete; make delete restart-safe and idempotent.
- [ ] Propagate Source tombstones through the existing sync boundary; do not add Asset as a generic sync resource unless a separately reviewed server protocol is required.
- [ ] On startup reconcile DB rows, managed files and staging remnants; mark missing/hash-mismatched content `CORRUPT`, quarantine unexplained files, and never silently delete user content.
- [ ] Scope any Tauri asset protocol/capability to the managed directory and tighten CSP from `null` only after preview tests prove required schemes.
- [ ] Add UI states for local-ready/syncing/sync-failed/corrupt/deleting without exposing paths or signed URLs.
- [ ] Run Rust, focused Server, full PC type/test/check/build gates.

---

## Task 8：文档、回归与人工验收

**负责人：** Luna 执行，主 Agent 验收。

**Docs to update according to actual completed behavior:**

- `docs/contracts/API.md`
- `docs/contracts/Database.md`
- `docs/modules/FrontendPC.md`
- `docs/modules/Backend.md`
- `docs/project/Architecture.md`
- `docs/design/Frontend.md` when visible interaction changes
- `docs/current/Status.md`
- `docs/current/IssuesAndReview.md`
- `docs/release/Changelog.md`

- [ ] Review `git diff --name-status`, `git diff --stat`, full diffs, generated files, dependency changes and deletions after every delegated task.
- [ ] Run final automated gates:

```powershell
cd D:\CodeBase\Active\Auralis\Auralis-PC
npm.cmd run type-check
npm.cmd run test:r4-pc
npm.cmd run check:r4-pc
npm.cmd run build
cargo test --manifest-path src-tauri\Cargo.toml

cd ..\Auralis-Server
.\mvnw.cmd -B -ntp clean test-compile
```

- [ ] Record external-infrastructure failures separately; Docker/MinIO/PgVector unavailable is not an application test pass or fail without attribution.
- [ ] Manually verify: offline import and restart; local preview; offline OCR/parse and later upload; upload interrupted at every phase; two-device convergence; account switching; last-reference deletion; tampered/missing file; low disk; app upgrade.
- [ ] Keep business acceptance open until real Tauri GUI, real filesystem and real Server/MinIO paths are exercised.

## Commit Boundaries

1. `server: add idempotent client asset import contract`
2. `native: add scoped local asset store`
3. `pc: add local asset metadata schema and repository`
4. `pc: add offline asset queue and source draft gating`
5. `pc: add offline parsed document rebinding`
6. `pc: migrate file consumers to local assets`
7. `native/pc: add deletion reconciliation and scoped access`
8. `docs: record local asset store implementation evidence`

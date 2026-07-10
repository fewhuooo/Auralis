# Auralis Documentation Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended when the user explicitly authorizes subagents) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Archive the complete pre-reorganization documentation tree, replace it with a code-verified categorized documentation system, and make repository rules explicit enough for any coding Agent to follow mechanically.

**Architecture:** Preserve the current documentation as a dated snapshot before rewriting. Build the new documentation by authority domain (`agent`, `project`, `current`, `modules`, `contracts`, `design`, `operations`, `planning`, `release`, `user`, and `showcase`), then remove the obsolete live paths only after every new authority document exists. Treat source code and configuration as implementation evidence, command output as verification evidence, and GUI/device/external-service checks as separate manual acceptance.

**Tech Stack:** Markdown, Git, PowerShell, Vue 3/Vite/Tauri, Uni-app, Spring Boot/Maven, Docker Compose.

更新时间：2026-07-10

文档状态：计划

权威范围：`docs/design/DocumentationArchitecture.md` 的逐任务实施步骤、验证命令和提交边界

事实来源：已批准的文档架构设计、当前工作树、代码路由/页面/Controller/实体/配置盘点

## Global Constraints

- Do not modify business code under `Auralis-PC`, `Auralis-Mobile`, `Auralis-Server`, `data`, or `docker-compose.yml`.
- Preserve all pre-existing working-tree changes; the modified old documents must appear in the dated snapshot before live paths are removed.
- Keep `docs/design/DocumentationArchitecture.md` as the approved design and exclude it from the old-document snapshot.
- After cutover, `docs/README.md` must be the only Markdown file directly under `docs/`.
- Every live document must declare `更新时间`, `文档状态`, `权威范围`, and `事实来源`.
- Use `必须`, `禁止`, `应当`, and `可以` for Agent rules; do not express mandatory behavior with ambiguous wording.
- Do not treat archived documents, showcase copy, planned work, code presence, build success, and business acceptance as interchangeable evidence.
- Do not claim a build or test passed unless that exact command is run during Task 9.
- If a build fails because of the existing code or environment, record the real failure; do not change business code in this documentation task.
- Do not add CI, a documentation site generator, or a permanent validation program.
- Stage only `AGENTS.md` and `docs/`; never stage the user's unrelated application-code changes.

---

### Task 1: Freeze the complete pre-reorganization snapshot

**Files:**

- Create: `docs/archive/snapshots/2026-07-10-pre-reorganization/README.md`
- Create: `docs/archive/snapshots/2026-07-10-pre-reorganization/**` as a mirror of the old documentation tree
- Rewrite: `docs/archive/README.md`
- Move: `docs/archive/PROJECT_OVERVIEW.md` to `docs/archive/legacy-project/PROJECT_OVERVIEW.md`
- Modify: every Markdown file under `docs/archive/` except the live design and implementation plan, adding the standard archive warning before the original body

**Interfaces:**

- Consumes: the current working-tree contents of all old `docs/*.md`, `docs/frontend/*.md`, `docs/plans/*.md`, and the existing `docs/archive/**` tree.
- Produces: a dated, non-authoritative snapshot that later tasks can consult for historical wording without treating it as current truth.

- [ ] **Step 1: Record and verify safe absolute paths**

Run:

```powershell
$workspace = (Resolve-Path '.').Path
$docs = (Resolve-Path 'docs').Path
$snapshot = [System.IO.Path]::GetFullPath((Join-Path $docs 'archive\snapshots\2026-07-10-pre-reorganization'))
if (-not $snapshot.StartsWith($docs + [System.IO.Path]::DirectorySeparatorChar)) {
  throw "Snapshot target escaped docs: $snapshot"
}
"workspace=$workspace"
"docs=$docs"
"snapshot=$snapshot"
```

Expected: all three paths resolve under `D:\CodeBase\Active\Auralis`, and `snapshot` is under `docs\archive\snapshots`.

- [ ] **Step 2: Inventory the old source documents before copying**

Run:

```powershell
$oldRoot = Get-ChildItem -LiteralPath 'docs' -File -Filter '*.md'
$oldFrontend = Get-ChildItem -LiteralPath 'docs\frontend' -Recurse -File -Filter '*.md'
$oldPlans = Get-ChildItem -LiteralPath 'docs\plans' -Recurse -File -Filter '*.md'
$oldArchive = Get-ChildItem -LiteralPath 'docs\archive' -Recurse -File -Filter '*.md' |
  Where-Object { $_.FullName -notmatch '\\snapshots\\' }
$old = @($oldRoot + $oldFrontend + $oldPlans + $oldArchive)
$old | Sort-Object FullName | ForEach-Object { $_.FullName.Substring((Resolve-Path 'docs').Path.Length + 1) }
"count=$($old.Count)"
```

Expected: the list includes the currently modified `Changelog.md`, `FrontendPC.md`, `StatusIndex.md`, and `frontend\design.md`, plus all existing archive documents. It must not include `design\DocumentationArchitecture.md` or this implementation plan.

- [ ] **Step 3: Copy the old tree into the dated snapshot and verify pre-banner hashes**

Create the target directories, copy each inventoried file to the same relative path under the snapshot, and compare SHA-256 before adding any warning. Use one PowerShell session so the source inventory and hash comparison remain in memory:

```powershell
$docs = (Resolve-Path 'docs').Path
$snapshot = [System.IO.Path]::GetFullPath((Join-Path $docs 'archive\snapshots\2026-07-10-pre-reorganization'))
New-Item -ItemType Directory -Force -Path $snapshot | Out-Null

$sources = @(
  Get-ChildItem -LiteralPath 'docs' -File -Filter '*.md'
  Get-ChildItem -LiteralPath 'docs\frontend' -Recurse -File -Filter '*.md'
  Get-ChildItem -LiteralPath 'docs\plans' -Recurse -File -Filter '*.md'
  Get-ChildItem -LiteralPath 'docs\archive' -Recurse -File -Filter '*.md' |
    Where-Object { $_.FullName -notmatch '\\snapshots\\' }
) | Where-Object {
  $_.FullName -ne (Join-Path $docs 'design\DocumentationArchitecture.md') -and
  $_.FullName -ne (Join-Path $docs 'planning\DocumentationReorganizationImplementation.md')
}

foreach ($source in $sources) {
  $relative = $source.FullName.Substring($docs.Length + 1)
  $target = Join-Path $snapshot $relative
  New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
  Copy-Item -LiteralPath $source.FullName -Destination $target -Force
  $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $source.FullName).Hash
  $targetHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash
  if ($sourceHash -ne $targetHash) { throw "Hash mismatch: $relative" }
}
"copied=$($sources.Count)"
```

Expected: exits successfully with a non-zero copied count and no `Hash mismatch` exception.

- [ ] **Step 4: Add the exact archive warning without editing original bodies**

Use `apply_patch` to prepend this block to every snapshot Markdown and to the retained legacy documents:

```markdown
> [!WARNING]
> 本文档为历史归档，仅用于追溯需求、设计与项目演进。它不是 Auralis 当前实现、状态、接口或任务的依据。开发者与 AI Agent 禁止依据本文恢复旧实现、判断当前完成度或创建当前任务；请从 [`docs/README.md`](../../README.md) 进入现行文档体系。

```

Adjust only the relative link depth for nested archive files. Do not change any text after the warning block.

- [ ] **Step 5: Write the archive indexes and organize existing legacy material**

`docs/archive/README.md` must contain: archive purpose, prohibition on current-state use, snapshot list, `legacy-project/` description, `legacy-demand/` description, and the link back to `../README.md`.

`docs/archive/snapshots/2026-07-10-pre-reorganization/README.md` must contain: snapshot date `2026-07-10`, source commit `9fdfebe`, note that the source worktree contained uncommitted documentation changes, exact excluded files, integrity method, and the same prohibition.

Move `docs/archive/PROJECT_OVERVIEW.md` to `docs/archive/legacy-project/PROJECT_OVERVIEW.md` after confirming the snapshot copy exists.

- [ ] **Step 6: Verify snapshot coverage and archive warnings**

Run:

```powershell
$snapshot = 'docs\archive\snapshots\2026-07-10-pre-reorganization'
$snapshotFiles = Get-ChildItem -LiteralPath $snapshot -Recurse -File -Filter '*.md'
$missingWarning = $snapshotFiles | Where-Object {
  -not (Select-String -LiteralPath $_.FullName -Pattern '本文档为历史归档' -Quiet)
}
"snapshotMarkdown=$($snapshotFiles.Count)"
"missingWarning=$($missingWarning.Count)"
$missingWarning.FullName
```

Expected: `snapshotMarkdown` is greater than the old live-document count because it includes the archive mirror and snapshot README; `missingWarning=0`.

- [ ] **Step 7: Commit the archive snapshot only**

```powershell
git add -- docs/archive
git diff --cached --check
git commit -m "docs: archive pre-reorganization documentation"
```

Expected: the commit contains only `docs/archive/**`; application-code changes and old live-document modifications remain unstaged.

---

### Task 2: Establish the new Agent entry points and documentation hub

**Files:**

- Modify: `AGENTS.md`
- Rewrite: `docs/README.md`
- Create: `docs/agent/BeforeCoding.md`
- Create: `docs/agent/CodingAndGitStandards.md`

**Interfaces:**

- Consumes: the authority matrix and Agent protocol in `docs/design/DocumentationArchitecture.md`.
- Produces: the mandatory entry path every later document and external Agent will follow.

- [ ] **Step 1: Rewrite `AGENTS.md` as the minimal hard gate**

Include these exact requirements:

- `docs/README.md` is the only documentation entry.
- Before any code change, read `docs/agent/BeforeCoding.md`, `docs/current/Status.md`, `docs/current/IssuesAndReview.md`, and the mapped module document.
- API changes require `docs/contracts/API.md`; data changes require `docs/contracts/Database.md`.
- Status/risk changes require both current documents; release-impacting changes require `docs/release/Changelog.md`.
- Archived or showcase documents are explicitly non-authoritative.
- Existing working-tree changes must be preserved.

- [ ] **Step 2: Rewrite `docs/README.md` as the single live index**

Sections must be: `定位`, `30 秒开始`, `按任务选择文档`, `文档权威边界`, `状态词典`, `事实与验证口径`, `目录索引`, `维护与冲突处理`, and `归档说明`.

The task-selection table must map PC, Mobile/Tablet, Backend, API, database/sync, infrastructure/deployment, product/design, documentation-only, and release tasks to exact new paths.

- [ ] **Step 3: Write `docs/agent/BeforeCoding.md` as a three-phase protocol**

Sections must be: `指令优先级`, `任务分类与必读矩阵`, `开始前必须完成`, `修改中必须遵守`, `完成前必须回写`, `禁止事项`, `证据格式`, and `最终交接模板`.

The final handoff template must require: completed result, modified files, commands actually run, results, documentation updates, remaining risks, and manual acceptance.

- [ ] **Step 4: Write `docs/agent/CodingAndGitStandards.md`**

Sections must cover: scope, workspace protection, existing-pattern-first rule, frontend conventions, backend conventions, documentation conventions, testing evidence, branch/commit naming, staging scope, forbidden destructive Git operations, and commit checklist.

- [ ] **Step 5: Verify that the root Agent entry resolves only to live paths**

Run:

```powershell
Select-String -LiteralPath 'AGENTS.md' -Pattern 'docs/' | ForEach-Object { $_.Line }
Select-String -Path 'AGENTS.md','docs\README.md','docs\agent\*.md' -Pattern 'docs/(AgentBeforeCoding|StatusIndex|CurrentIssuesAndReview|FrontendPC|APIManifest|DatabaseDesign)\.md'
```

Expected: the first command lists only new categorized paths; the second command returns no matches.

- [ ] **Step 6: Commit the Agent entry layer**

```powershell
git add -- AGENTS.md docs/README.md docs/agent
git diff --cached --check
git commit -m "docs: establish agent documentation protocol"
```

---

### Task 3: Rewrite product, architecture, design, user, and showcase documents

**Files:**

- Create: `docs/project/Overview.md`
- Create: `docs/project/ProductRequirements.md`
- Create: `docs/project/Architecture.md`
- Create: `docs/design/Frontend.md`
- Create: `docs/user/UserManual.md`
- Create: `docs/showcase/TraeCompetitionApplication.md`

**Interfaces:**

- Consumes: current source structure, current routes/pages, approved design, and the old snapshot for historical wording.
- Produces: product intent and experience design without claiming implementation status.

- [ ] **Step 1: Write `docs/project/Overview.md` from current repository facts**

Document the three application directories, infrastructure entry, exact runtime requirements, verified package versions, startup command matrix, configuration entry points, and links to module/status documents. Do not duplicate route tables or API tables.

- [ ] **Step 2: Write `docs/project/ProductRequirements.md`**

Separate `产品目标`, `目标用户`, `核心场景`, `功能范围`, `跨端职责`, `非功能需求`, `当前里程碑范围`, `明确非目标`, and `产品验收条件`. Mark unimplemented or unverified capabilities as requirements, not current facts.

- [ ] **Step 3: Write `docs/project/Architecture.md`**

Document PC, Mobile/Tablet, Spring Boot, PostgreSQL, Redis, MinIO, Milvus, and external AI boundaries; auth, local-first sync, upload/ingestion, RAG, and WebSocket flows; configuration sources; trust boundaries; and current architecture risks. Link API and schema details instead of copying them.

- [ ] **Step 4: Rewrite the frontend design into `docs/design/Frontend.md`**

Preserve the user's current Zen Minimalist design changes from the snapshot. Organize by shared design tokens, PC page map, Mobile page map, Tablet page map, cross-page flows, responsive/platform constraints, accessibility, motion, empty/loading/error states, and page-level acceptance. Keep implementation status out of this document.

- [ ] **Step 5: Write `docs/user/UserManual.md`**

Use task-oriented sections for login, dashboard, subject spaces, files/assets, knowledge blocks, tasks/scheduling, AI, focus/review/statistics, settings, cross-device behavior, and troubleshooting. Label unavailable, feature-flagged, or unverified paths explicitly.

- [ ] **Step 6: Isolate showcase copy**

Move and refine the competition material into `docs/showcase/TraeCompetitionApplication.md`. Add `文档状态：展示` and an opening statement that technical facts and status must be checked against the live engineering documents.

- [ ] **Step 7: Verify route names mentioned in product/design/user documents**

Compare against:

```powershell
Select-String -LiteralPath 'Auralis-PC\src\router\index.ts' -Pattern 'path:'
Select-String -LiteralPath 'Auralis-Mobile\src\pages.json' -Pattern '"path"'
```

Expected: PC documentation covers `/login`, `/`, `/subjects`, `/subject/:id`, `/asset`, `/timeline`, and `/profile`; Mobile/Tablet descriptions cover only currently registered pages.

- [ ] **Step 8: Commit product and experience documents**

```powershell
git add -- docs/project docs/design/Frontend.md docs/user docs/showcase
git diff --cached --check
git commit -m "docs: rewrite product architecture and experience guides"
```

---

### Task 4: Rewrite implementation module documents from code

**Files:**

- Create: `docs/modules/FrontendPC.md`
- Create: `docs/modules/FrontendMobileTablet.md`
- Create: `docs/modules/Backend.md`
- Create: `docs/modules/Infrastructure.md`

**Interfaces:**

- Consumes: package manifests, routes/pages, stores, controllers, configs, Docker Compose, and current feature flags.
- Produces: authoritative implementation inventories referenced by status, planning, and Agent documents.

- [ ] **Step 1: Write the PC module document**

Use `Auralis-PC/package.json`, `src/router/index.ts`, `src/store/*.ts`, `src/api/*.ts`, `src/views/**`, `src-tauri/Cargo.toml`, and Tauri configuration. Include exact routes, stores, API clients, build commands, current login-guard risk, Tauri `2.11.1` alignment, and manual GUI boundaries.

- [ ] **Step 2: Write the Mobile/Tablet module document**

Use `Auralis-Mobile/package.json`, `src/pages.json`, `src/store/*.ts`, `src/api/**`, `src/services/**`, `src/config/features.ts`, and `scripts/**`. Include conditional `MP-WEIXIN` page registration, launch routing, phone/tablet page tables, local storage, feature-flagged tablet notes, exact build scripts, and real-device boundaries.

- [ ] **Step 3: Write the backend module document**

Use `pom.xml`, controller/service/entity/config packages, `application*.yml`, and the empty `src/test` result. Include Spring Boot `3.2.5`, Java `21`, all nine controllers, auth boundaries, sync behavior, MinIO/Milvus/AI integration, WebSocket code presence, no-test-source limitation, and configuration inconsistency risk.

- [ ] **Step 4: Write the infrastructure module document**

Use `docker-compose.yml`, `.env.example`, `.gitignore`, `application*.yml`, and `data/`. Include service/container/image/port tables, persistent directories, local-only defaults, required production environment variables, backup scope, missing CI/monitoring, and MinIO shared-stack risk.

- [ ] **Step 5: Verify every inventory against files**

Run:

```powershell
Get-ChildItem -LiteralPath 'Auralis-PC\src\store' -File | Select-Object -ExpandProperty Name
Get-ChildItem -LiteralPath 'Auralis-Mobile\src\store' -File | Select-Object -ExpandProperty Name
Get-ChildItem -LiteralPath 'Auralis-Server\src\main\java\com\auralis\server\controller' -File | Select-Object -ExpandProperty Name
Get-ChildItem -LiteralPath 'Auralis-Server\src\main\java\com\auralis\server\entity' -File | Select-Object -ExpandProperty Name
```

Expected: each listed file is represented once in the applicable module inventory or explicitly excluded as an internal helper.

- [ ] **Step 6: Commit module documents**

```powershell
git add -- docs/modules
git diff --cached --check
git commit -m "docs: document current module implementations"
```

---

### Task 5: Rebuild API and data contracts from implementation sources

**Files:**

- Create: `docs/contracts/API.md`
- Create: `docs/contracts/Database.md`
- Create: `docs/contracts/MobilePagesAPIMap.md`

**Interfaces:**

- Consumes: backend controllers/entities/database setup, PC/Mobile API clients, Mobile stores/services, and tablet note code.
- Produces: exact contracts that module and planning documents may reference without duplicating signatures or fields.

- [ ] **Step 1: Inventory the API directly from annotations**

Run:

```powershell
Get-ChildItem -LiteralPath 'Auralis-Server\src\main\java\com\auralis\server\controller' -File |
  Select-String -Pattern '@RequestMapping|@GetMapping|@PostMapping|@PutMapping|@DeleteMapping' |
  ForEach-Object { '{0}:{1}: {2}' -f $_.Filename,$_.LineNumber,$_.Line.Trim() }
```

Expected: Auth 3 endpoints; KnowledgeBlock 4; TaskBlock 4; BlockRelation 3; Sync 2; FileStorage 1; Asset 2; AI 7; Stats 2.

- [ ] **Step 2: Write `docs/contracts/API.md`**

For every endpoint, include method, path, authentication, parameters/body, response shape, error behavior visible in code, owning Controller, caller status, and verification status. Document `/ws/sync` separately with query-token handshake, PING token refresh, PONG, and 60-second audit as code-confirmed but not automatically tested.

- [ ] **Step 3: Write `docs/contracts/Database.md`**

Use `DbMigrationConfig.java`, `V2__add_encrypted_payload.sql`, entity fields, MyBatis mapping behavior, and Mobile local DB services. Cover `users`, `knowledge_block`, `task_block`, `block_relations`, `mutation_log`, `asset`, and `tablet_notes`; explicitly note that `task_block.position` exists in DDL but not `TaskBlock.java`, making it a schema/entity drift risk rather than silently treating it as mapped.

- [ ] **Step 4: Write `docs/contracts/MobilePagesAPIMap.md`**

For each registered phone page, state remote endpoints called, stores/services used, local-storage keys, data ownership, loading/error behavior, and known mock/local-only data. Add a separate Tablet mapping section or a clear link to the Tablet module when no remote API is called.

- [ ] **Step 5: Cross-check client callers against the server contract**

Inspect `Auralis-PC/src/api/*.ts`, `Auralis-Mobile/src/api/*.ts`, and `Auralis-Mobile/src/services/*.ts`. Every literal `/api/` or `/ws/` path must either appear in `contracts/API.md` or be flagged as an unresolved mismatch.

- [ ] **Step 6: Commit contract documents**

```powershell
git add -- docs/contracts
git diff --cached --check
git commit -m "docs: rebuild api and data contracts"
```

---

### Task 6: Rewrite deployment and operational runbooks

**Files:**

- Create: `docs/operations/Deployment.md`
- Create: `docs/operations/Runbook.md`

**Interfaces:**

- Consumes: package scripts, Maven project, Docker Compose, application profiles, `.env.example`, and documented risks.
- Produces: repeatable operational steps with success criteria and escalation boundaries.

- [ ] **Step 1: Write `docs/operations/Deployment.md`**

Separate prerequisites, local dependency startup, backend build/run, PC Web build, Tauri boundary, Mobile H5 build, WeChat build, Docker Compose deployment, environment variables, production hardening, smoke checks, rollback, and release checklist. Use exact current commands and label missing secrets/configuration.

- [ ] **Step 2: Write `docs/operations/Runbook.md`**

For backend startup, database, Redis, MinIO upload, Milvus/RAG, AI provider, HTTP 401/403, PC guard, sync, WebSocket, Mobile build, backup, and restore incidents, provide: trigger, checks, commands, success condition, recovery action, and escalation condition.

- [ ] **Step 3: Validate all commands against manifests/configuration**

Check that each command exists in `package.json`, Maven, or Docker Compose. Do not include `npm test`, a server test class, backup script, or CI command that does not exist.

- [ ] **Step 4: Commit operational documents**

```powershell
git add -- docs/operations
git diff --cached --check
git commit -m "docs: rewrite deployment and operations guides"
```

---

### Task 7: Rebuild current status, plans, and release history

**Files:**

- Create: `docs/current/Status.md`
- Create: `docs/current/IssuesAndReview.md`
- Create: `docs/planning/README.md`
- Create: `docs/planning/Overview.md`
- Create: `docs/planning/AIRag.md`
- Create: `docs/planning/BackendCore.md`
- Create: `docs/planning/DocsAcceptance.md`
- Create: `docs/planning/FrontendMobileTablet.md`
- Create: `docs/planning/FrontendPC.md`
- Create: `docs/planning/InfraRelease.md`
- Create: `docs/planning/TabletHandwritingNotes.md`
- Create: `docs/release/Changelog.md`

**Interfaces:**

- Consumes: all new authority documents and the old snapshot's current user edits.
- Produces: one concise current snapshot, one open-risk register, executable future plans, and one historical log.

- [ ] **Step 1: Write the concise current status**

Use a table with module, state, code evidence, latest command evidence, manual acceptance, and next action. Move the long PC/Tablet UI narrative to `design/Frontend.md`, module documents, and Changelog. Before Task 9, write command status as `本轮尚未执行`.

- [ ] **Step 2: Write the open-risk register**

Retain only unresolved issues with priority, evidence path, impact, action, owner domain, and closure condition. At minimum cover: PC guard disabled, no backend tests, delete-semantics consistency, MinIO object verification, production LangChain4j key mismatch, schema/entity `position` drift, CI/monitoring/backup gaps, and GUI/device/external-service acceptance.

- [ ] **Step 3: Rebuild the planning index and overview**

Define task states, dependencies, priority, acceptance evidence, and completion rules. Ensure completed historical work is removed from future task lists and represented in Changelog instead.

- [ ] **Step 4: Rewrite each domain plan**

Each plan must contain current facts, objective, prerequisites, ordered tasks, exact verification, blockers, and completion definition. Tablet handwriting remains feature-flagged and must not be promoted ahead of the core multi-device flow.

- [ ] **Step 5: Rebuild the Changelog**

Preserve confirmed historical entries from the snapshot, including the user's current PC design and dependency changes. Add an Unreleased documentation entry describing the new architecture without claiming completion until Task 9 succeeds.

- [ ] **Step 6: Check separation of concerns**

Search `current/Status.md` for multi-paragraph page implementation narratives and `planning/*.md` for claims that planned items are already accepted. Rewrite any violation into a short fact plus an authority link.

- [ ] **Step 7: Commit status, plans, and release documents**

```powershell
git add -- docs/current docs/planning docs/release
git diff --cached --check
git commit -m "docs: rebuild status plans and release history"
```

---

### Task 8: Cut over from old live paths and repair all references

**Files:**

- Delete from live tree after snapshot confirmation: all obsolete root Markdown under `docs/` except `README.md`
- Delete from live tree: `docs/frontend/design.md`
- Delete from live tree: all `docs/plans/*.md`
- Modify: any repository Markdown or Agent configuration that still links to an old live path

**Interfaces:**

- Consumes: complete new categorized documentation and verified dated snapshot.
- Produces: a single unambiguous live documentation tree with no duplicate authority documents.

- [ ] **Step 1: Reconfirm every obsolete file exists in the snapshot**

For each old live path, assert the corresponding file exists below `docs/archive/snapshots/2026-07-10-pre-reorganization/`. Stop if any file is missing.

- [ ] **Step 2: Remove the obsolete live documents**

Remove only the old root documents listed in the migration table, `docs/frontend/design.md`, and the old `docs/plans/*.md`. Do not remove `docs/README.md`, `docs/design/DocumentationArchitecture.md`, `docs/planning/DocumentationReorganizationImplementation.md`, or anything under `docs/archive/`.

- [ ] **Step 3: Search the repository for old documentation paths**

Run:

```powershell
$patterns = @(
  'docs/AgentBeforeCoding.md','docs/StatusIndex.md','docs/CurrentIssuesAndReview.md',
  'docs/FrontendPC.md','docs/FrontendMobileTablet.md','docs/Backend.md',
  'docs/InfrastructureAndData.md','docs/APIManifest.md','docs/DatabaseDesign.md',
  'docs/frontend/design.md','docs/plans/'
)
Get-ChildItem -LiteralPath . -Recurse -File -Include '*.md','*.txt','*.yml','*.yaml','*.json' |
  Where-Object { $_.FullName -notmatch '\\.git\\|\\node_modules\\|\\dist\\|docs\\archive\\' } |
  Select-String -SimpleMatch -Pattern $patterns
```

Expected: no matches outside `docs/archive/` after repairing references.

- [ ] **Step 4: Verify the live root and document metadata**

Run:

```powershell
Get-ChildItem -LiteralPath 'docs' -File -Filter '*.md' | Select-Object -ExpandProperty Name
$liveDocs = Get-ChildItem -LiteralPath 'docs' -Recurse -File -Filter '*.md' |
  Where-Object { $_.FullName -notmatch '\\archive\\' }
foreach ($file in $liveDocs) {
  $content = Get-Content -Raw -LiteralPath $file.FullName
  foreach ($field in @('更新时间：','文档状态：','权威范围：','事实来源：')) {
    if (-not $content.Contains($field)) { "MISSING $field $($file.FullName)" }
  }
}
```

Expected: the root list is only `README.md`; the metadata loop prints no `MISSING` lines.

- [ ] **Step 5: Commit the cutover**

```powershell
git add -- AGENTS.md docs
git diff --cached --check
git commit -m "docs: cut over to categorized documentation"
```

Expected: only documentation deletions/reference fixes are committed; no application code is staged.

---

### Task 9: Run full documentation, build, and test verification

**Files:**

- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`
- Modify only if validation finds errors: the affected live documentation files

**Interfaces:**

- Consumes: the fully cut-over live documentation tree and current application code.
- Produces: dated, evidence-backed verification results and an explicit manual-acceptance backlog.

- [ ] **Step 1: Validate all live Markdown relative links**

Run this one-off PowerShell link scan over live documents:

```powershell
$liveDocs = Get-ChildItem -LiteralPath 'docs' -Recurse -File -Filter '*.md' |
  Where-Object { $_.FullName -notmatch '\\archive\\' }
$missing = @()
$linkPattern = '!?' + '\[[^\]]*\]\((?<target><[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)'
foreach ($file in $liveDocs) {
  $content = Get-Content -Raw -LiteralPath $file.FullName
  foreach ($match in [regex]::Matches($content, $linkPattern)) {
    $target = $match.Groups['target'].Value.Trim('<','>')
    if ($target -match '^(https?://|mailto:|#|data:)') { continue }
    $pathOnly = [System.Uri]::UnescapeDataString(($target -split '#', 2)[0])
    if ([string]::IsNullOrWhiteSpace($pathOnly)) { continue }
    $resolved = [System.IO.Path]::GetFullPath((Join-Path $file.DirectoryName $pathOnly))
    if (-not (Test-Path -LiteralPath $resolved)) {
      $missing += [pscustomobject]@{ File = $file.FullName; Target = $target; Resolved = $resolved }
    }
  }
}
$missing | Format-Table -AutoSize
"missingLinks=$($missing.Count)"
```

Expected: zero missing live relative-link targets.

- [ ] **Step 2: Validate live path references and current naming**

List path candidates and legacy-name occurrences:

```powershell
$liveDocs = Get-ChildItem -LiteralPath 'docs' -Recurse -File -Filter '*.md' |
  Where-Object { $_.FullName -notmatch '\\archive\\' }
$pathPattern = '`(?<path>(?:Auralis-PC|Auralis-Mobile|Auralis-Server|docs|data)[^`\r\n]*)`'
foreach ($file in $liveDocs) {
  $content = Get-Content -Raw -LiteralPath $file.FullName
  foreach ($match in [regex]::Matches($content, $pathPattern)) {
    '{0}`t{1}' -f $file.FullName,$match.Groups['path'].Value
  }
}
$liveDocs | Select-String -Pattern 'StudyCore' -CaseSensitive:$false
```

Review every emitted path: it must exist or be explicitly labeled historical, planned, generated, environment-specific, wildcard, or example-only. `StudyCore` is allowed only in the rename history inside Changelog or a clearly labeled old-name note.

- [ ] **Step 3: Validate API, entity, route, and infrastructure inventories**

Repeat the annotation, entity, PC route, Mobile page, package script, application config, and Compose service scans used in Tasks 3–6. Compare every result to the corresponding authority document and fix documentation mismatches only.

- [ ] **Step 4: Run the PC Web build**

```powershell
cd Auralis-PC
npm.cmd run build
```

Expected: exit code 0. If it fails, capture the failing command and first actionable error without modifying PC code.

- [ ] **Step 5: Run Mobile H5 and WeChat builds**

```powershell
cd Auralis-Mobile
npm.cmd run build:h5
npm.cmd run build:mp-weixin
node scripts\check-tablet-sidebar-transition.mjs
```

Expected: record each result independently. Do not infer App, Harmony, developer-tool, phone, or tablet acceptance from these commands.

- [ ] **Step 6: Run backend tests**

```powershell
cd Auralis-Server
mvn test
```

Expected: record the Maven result and explicitly state that `src/test` contains no test source files if that remains true.

- [ ] **Step 7: Update evidence documents with actual results**

In `current/Status.md`, replace `本轮尚未执行` with the exact date, command, and outcome for each command. In `current/IssuesAndReview.md`, retain any failed build or unresolved test gap with closure conditions. In `release/Changelog.md`, record the completed documentation migration and only the commands that actually passed.

- [ ] **Step 8: Run final Git and formatting checks**

```powershell
git diff --check
git status --short
git diff --name-status -- AGENTS.md docs
```

Expected: no whitespace errors; only intended `AGENTS.md`/documentation changes remain for this task; the user's unrelated application-code modifications remain present and unstaged.

- [ ] **Step 9: Commit final verification evidence**

```powershell
git add -- docs/current docs/release docs
git diff --cached --check
git commit -m "docs: record documentation verification evidence"
```

- [ ] **Step 10: Produce the mandatory handoff**

The final response must list: completed result, categorized document entry link, archive snapshot link, modified-document summary, all commands and outcomes, unresolved risks, Tauri/WeChat/real-device/external-service manual acceptance, and confirmation that unrelated user code changes were preserved.

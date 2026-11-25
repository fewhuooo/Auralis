# PC Tauri AI 辅助阅读 Implementation Plan（任务拆分优化版）

**Goal:** 在 Windows 10/11 x64 的 Tauri PC 客户端完成“本地文件解析/OCR → ParsedDocument 安全上传 → 服务端校验、索引与 RAG → 当前文件优先的 AI 阅读会话 → 选中文本解释和知识块保存”全链路；不发布 PC Web，不在 Mobile/Tablet 实现本地 OCR 或深度阅读。

**Architecture:** Vue 只负责任务编排和阅读 UI；`BackgroundParserHost`、PDF.js 与文档适配器生成统一 ParsedDocument；Tauri Rust 负责 sidecar 生命周期、加密缓存、断点恢复和流式上传；固定 RapidOCR/ONNX 模型的 `auralis-ocr.exe` 长驻运行。服务端使用 `ingestionRevision`、Asset SHA、payload SHA 和 Source 行锁完成首个有效 ParsedDocument 仲裁，再复用现有 generation/pgvector/RAG；`readingContext` 默认只检索当前 Source，只有确定性规则才扩大到当前 Subject。

**Tech Stack:** Vue 3、TypeScript、Pinia、`@file-viewer/vue3`、`pdfjs-dist`；Tauri 2.11.1、Rust 2021、SQLite、AES-256-GCM、Windows Credential Manager；RapidOCR（PP-OCRv6 small）、ONNX Runtime CPU、PyInstaller；Spring Boot 4.1、Java 21、JPA/Flyway、PostgreSQL 17/pgvector、MinIO、SSE。

**Plan Status:** 2026-08-26 已完成 G1–G4、G5/G6、C1–C5、S1–S6、A1–A4、K1/K2、U1–U3 的代码与自动门禁；服务端 AI/OpenAPI 定向 31/31、PC `test:r4-pc` 134/134、type-check、Web build、Tauri `--no-bundle` 通过。R1/R2 保持未完成，仅剩真实 PostgreSQL/MinIO/Provider、Tauri 文件/OCR/缓存/上传/重启、阅读 GUI、Windows MSI 安装和人工业务验收；本机 Docker 与 all-users 安装权限不足，不能将这些边界伪装为自动通过。用户授权跳过每个任务的独立 commit，改为保留任务边界并在后续统一提交。

## Global Constraints

- 硬门 A：Windows x64 MSI 必须完整携带 sidecar、模型、manifest 和 license，断网可运行并记录 cold/warm/RSS/包体积基线。
- 硬门 B：`BackgroundParserHost` 必须用固定 DOC/DOCX/PPT/PPTX 样本稳定产出非空、有序文本或稳定失败；不能用“预览成功”替代提取成功。
- G4 与 G5 未通过前，不开始 S1 之后的服务端改造、C1 之后的生产客户端任务链或任何大规模 UI 工作。
- FILE 状态固定为 `AWAITING_CLIENT → VALIDATING → INDEXING → READY|FAILED`；TEXT/URL 保持 `PENDING → PARSING → INDEXING → READY|FAILED`。
- ParsedDocument 不进入 change log、snapshot 或普通 mutation。`payloadSha256` 是 exact gzip bytes 的 hash；`plainTextSha256` 是归一化拼接文本的 hash；两者不得混用。
- SQLite 只保存任务元数据；正文和 gzip payload 只允许以现有 keyring 主密钥派生的分块 AES-256-GCM envelope 落盘，AAD 固定绑定 user/device/source/job/revision/schema。
- 不做 Excel、未知格式、超限文件、GPU、OCR overlay、bbox、citation jump、跨 Subject/全局检索、运行时模型下载、Mobile/Tablet OCR 或 PC Web 发布。
- 每个实现任务必须先写红灯测试，再写最小实现；每个任务只修改自己拥有的文件/代码块并记录任务边界。用户已授权跳过每个任务的独立 commit，后续统一提交；执行前若任务文件已有未提交修改，先停下确认归属，禁止 `git stash`、`reset`、`checkout` 或 `git add .`。
- 接口、数据库、页面、Tauri/基础设施变化必须在同一任务回写对应权威文档；代码存在、构建通过、自动测试和人工验收分别记录。
- 在用户明确执行前本计划只允许编辑计划文档；用户已授权执行后，按任务边界修改实现文件。未完成的任务和被环境阻断的提交步骤必须保持未勾选。

---

## Dependency Graph

| Gate / lane | 顺序 | 可并行条件 |
| --- | --- | --- |
| 技术硬门 | G1 → G2 → G3 → G4；G1 → G5 | G2/G3 与 G5 可并行；只有 G4、G5 都通过才开放生产实现 |
| 解析核心 | G4+G5 → G6 | G6 与 C1/S1 可并行，但 C3 必须等待 G6 |
| PC 本地链 | C1 → C2 → C3 → C4 → C5 | C1–C3 可与 S1–S6 并行 |
| 服务端链 | S1 → S2 → S3 → S4 → S5 → S6 | 严格顺序，避免状态、存储和事务语义互相覆盖 |
| ParsedDocument 契约 | S5 → K1 → C4 | K1 冻结上传契约后 PC 才接入真实 API |
| AI 阅读链 | A1 → A2；S6 → A3 → A4 | A1/A2 可与 A3/A4 并行 |
| AI 契约 | A1+A2+A4 → K2 | K2 冻结 readingContext/conversation 后才接 UI |
| UI | C5 → U1；K2+U1 → U2；K2+U2 → U3 | U1 不依赖 AI scope；U2/U3 必须等待契约 |
| 交付 | S6+C5+K2+U1+U2+U3 → R1 → R2 | R2 是唯一发布/文档收口任务 |

## Review Units

每个任务是一个独立 reviewer gate：可单独接受或拒绝，必须有自己的测试循环和提交。命令中的“Expected”是实施时必须观察到的结果；本轮没有运行这些命令。

---

## Phase G — 两个技术硬门

### Task G1：冻结 OCR IPC、错误码和 fixture 清单

**Files**
- Create: `Auralis-PC/ocr-sidecar/protocol.py`
- Create: `Auralis-PC/ocr-sidecar/tests/test_protocol.py`
- Create: `Auralis-PC/scripts/fixtures/ocr/manifest.json`
- Create: `Auralis-PC/src/types/ocrProtocol.ts`

**Interfaces**
- Consumes: 无。
- Produces: `OcrPageRequest { protocolVersion: 1; taskId; pageNumber; imagePath; timeoutMs }`；`OcrPageResponse { ok; taskId; pageNumber; lines; timingMs; errorCode? }`；sidecar 启动参数固定携带 Rust 创建的 `allowedImageRoot`，请求路径必须 canonicalize 后仍位于该目录；稳定错误码 `OCR_PROTOCOL_INVALID`、`OCR_TIMEOUT`、`OCR_MODEL_FAILED`、`OCR_RESPONSE_TOO_LARGE`。

- [x] **Step 1:** 写 `test_rejects_unknown_protocol_version`、`test_rejects_relative_or_external_image_path`、`test_caps_response_lines_and_bytes`；fixture manifest 固定 clear-zh、mixed-zh-en、rotated、low-contrast、scanned-pdf 五组输入和 expected text hash。
- [x] **Step 2:** Run `python -m unittest discover -s Auralis-PC/ocr-sidecar/tests -p "test_protocol.py"`. Expected: FAIL，因为 `protocol.py` 尚无验证实现。
- [x] **Step 3:** 实现纯协议解析、上限和错误映射；不得加载模型或访问网络。
- [x] **Step 4:** 重跑同一命令。Expected: PASS，且序列化 JSON 不包含原文路径之外的任意 host/URL 字段。
- [x] **Step 5:** 用户已授权跳过独立 commit；G1 文件保持未提交并纳入后续统一提交边界。

### Task G2：构建固定模型的 Python OCR engine

**Files**
- Create: `Auralis-PC/ocr-sidecar/main.py`
- Create: `Auralis-PC/ocr-sidecar/engine.py`
- Create: `Auralis-PC/ocr-sidecar/model_manifest.json`
- Create: `Auralis-PC/ocr-sidecar/requirements.in`
- Create: `Auralis-PC/ocr-sidecar/requirements-lock.txt`
- Create: `Auralis-PC/ocr-sidecar/auralis-ocr.spec`
- Create: `Auralis-PC/ocr-sidecar/tests/test_engine.py`
- Create: `Auralis-PC/scripts/build-ocr-sidecar.ps1`

**Interfaces**
- Consumes: G1 `OcrPageRequest/OcrPageResponse`。
- Produces: 长驻 stdin/stdout JSON 进程；资源名固定为 `det.onnx`、`rec.onnx`、`cls.onnx`；manifest 记录 model/version/SHA-256、RapidOCR/ORT/PyInstaller exact versions。

- [x] **Step 1:** 写 warm-once、serial request、manifest SHA mismatch、rotated page classifier 和 no-network 测试。
- [x] **Step 2:** Run `python -m unittest discover -s Auralis-PC/ocr-sidecar/tests -p "test_engine.py"`. Expected: FAIL，因为 engine/manifest 不存在。
- [x] **Step 3:** 在 `rapidocr>=3.9.0,<4` 约束内选择首个通过 PP-OCRv6 fixture 的版本并冻结全部 transitive versions；engine 只从相邻 resources 读取三个固定模型。
- [x] **Step 4:** 重跑 protocol+engine 测试。Expected: PASS；同一进程处理两页时模型只初始化一次；真实 PP-OCRv6-small 中文 fixture 和长驻 stdin/stdout 入口均通过。
- [x] **Step 5:** 用户已授权跳过独立 commit；G2 文件保持未提交并纳入后续统一提交边界。

### Task G3：实现 Rust sidecar supervisor 与 bounded commands

**Files**
- Modify: `Auralis-PC/src-tauri/Cargo.toml`
- Modify: `Auralis-PC/src-tauri/src/lib.rs`
- Create: `Auralis-PC/src-tauri/src/ocr_sidecar.rs`
- Modify: `Auralis-PC/src/api/tauri.ts`
- Create: `Auralis-PC/scripts/r4-ocr-sidecar.test.mjs`

**Interfaces**
- Consumes: G2 长驻 sidecar。
- Produces: Tauri commands `ocr_warmup() -> OcrWarmupView`、`ocr_recognize_page(request: OcrPageCommand) -> OcrPageResult`、`ocr_shutdown() -> ()`；`OcrPageCommand { taskId: string; pageNumber: number; imageBytes: number[]; timeoutMs: number }`，Rust 将有界 bytes 写入 `allowedImageRoot` 后才生成内部 `imagePath`；前端不能传 executable/model/path。

- [x] **Step 1:** 写 Rust unit tests 覆盖队列长度、timeout、最大 image bytes、最多两次 supervisor restart；写 JS contract test 禁止通用 shell/fs/http command。
- [x] **Step 2:** Run `cargo test --manifest-path Auralis-PC/src-tauri/Cargo.toml ocr_sidecar`. Expected: FAIL，模块不存在。
- [x] **Step 3:** 使用 Tauri 2 Rust 侧固定 sidecar API 启动 `auralis-ocr`，维持单进程串行队列；仅 Rust 内部解析资源路径。
- [x] **Step 4:** Run Rust tests and `node --experimental-strip-types --test Auralis-PC/scripts/r4-ocr-sidecar.test.mjs`. Expected: PASS。
- [x] **Step 5:** 用户已授权跳过独立 commit；G3 文件保持未提交并纳入后续统一提交边界。

### Task G4：完成 MSI externalBin/resources 离线硬门 A

**Files**
- Modify: `Auralis-PC/src-tauri/tauri.conf.json`
- Create: `Auralis-PC/scripts/verify-ocr-bundle.mjs`
- Create: `Auralis-PC/scripts/measure-ocr-baseline.ps1`
- Create: `Auralis-PC/scripts/fixtures/ocr/budgets.json`
- Create: `Auralis-PC/src-tauri/resources/licenses/THIRD-PARTY-NOTICES.txt`
- Create: `Auralis-PC/src-tauri/resources/sbom/ocr-components.cdx.json`
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/modules/Infrastructure.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`

**Interfaces**
- Consumes: G2 binary/models，G3 supervisor。
- Produces: `bundle.targets=["msi"]`、`externalBin=["bin/auralis-ocr"]`、resources manifest；`budgets.json` 将测得 baseline 固化为 p95/RSS/package-size 的 baseline + 15% regression ceiling。

- [x] **Step 1:** 已写 bundle verifier，要求 bundle 目录恰好一个 MSI、sidecar target-triple binary、三个模型、manifest、notices 和 SBOM。
- [x] **Step 2:** 已执行 verifier 红灯：`BUNDLE_VERIFY_FAILED: bundle directory does not exist`，当前无 MSI 产物。
- [x] **Step 3:** 已修正 `../ocr-sidecar` resource source，修复 WiX externalBin 安装名解析，并执行 `npm --prefix Auralis-PC run tauri -- build --bundles msi`；MSI 已生成，前端/Rust release build 与 WiX 均通过。
- [x] **Step 4:** verifier 通过并确认 MSI、target-triple sidecar、三个模型、manifest、notices、SBOM 均被生成 WiX 引用；五组离线 fixture baseline 已测量，运行期间 sidecar 不发起网络请求。
- [x] **Step 5:** baseline 固化到 `budgets.json`；临时 all-users MSI 安装因宿主 Error 1925 未完成，留给 R2；按用户授权不创建独立 commit。

### Task G5：完成 BackgroundParserHost Office 能力硬门 B

**Files**
- Create: `Auralis-PC/src/components/preview/BackgroundParserHost.vue`
- Modify: `Auralis-PC/src/components/preview/FileViewerRenderer.vue`
- Create: `Auralis-PC/src/services/documentParser/fileViewerBridge.ts`
- Create: `Auralis-PC/scripts/document-office-matrix.test.mjs`
- Create: `Auralis-PC/scripts/fixtures/document-parser/office-manifest.json`
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`

**Interfaces**
- Consumes: 当前 `@file-viewer/vue3` renderer。
- Produces: `FileViewerParserBridge.prepare(file)`、`extractChunks()`、`extractAnchors()`、`renderPageBitmap(pageNumber)`、`dispose()`；host 单实例、可渲染离屏、一次只处理一个 Office 文件。

- [x] **Step 1:** 已写 DOC/DOCX/PPT/PPTX fixture matrix tests，断言 host 未在可见 preview 打开时也会加载；chunks/anchors 必须非空、有序，否则必须得到 `OFFICE_TEXT_UNAVAILABLE` 或 bitmap fallback。
- [x] **Step 2:** 已运行 `node --experimental-strip-types --test Auralis-PC/scripts/document-office-matrix.test.mjs` 红灯；初次因 bridge/host 不存在失败，当前静态契约 2/2 通过，真样本 fixture 仍缺失。
- [x] **Step 3:** 已实现固定尺寸离屏容器，禁止 `display:none`；只暴露 parser bridge，不改变现有 zoom/rotate/page UI contract。
- [x] **Step 4:** `npm --prefix Auralis-PC run type-check` 已通过，bridge/host 静态契约 2/2、Office fixture matrix 3/3 和现有 PC 回归 `test:r4-pc` 102/102 通过；DOC、DOCX、PPT、PPTX 均有非空 fixture，旧式 PPT 通过 OLE compound-document magic 校验。
- [ ] **Step 5:** G5 仍等待实际 File Viewer/Tauri 环境让四种真实样本各自得到 extract、bitmap fallback 或稳定 `OFFICE_TEXT_UNAVAILABLE` 结论；按用户授权不创建独立 commit。

### Task G6：实现 PDF 分类与 bounded block producer

**Files**
- Create: `Auralis-PC/src/services/documentParser/types.ts`
- Create: `Auralis-PC/src/services/documentParser/normalization.ts`
- Create: `Auralis-PC/src/services/documentParser/PdfPageClassifier.ts`
- Create: `Auralis-PC/src/services/documentParser/PdfTextAdapter.ts`
- Create: `Auralis-PC/src/services/documentParser/OfficeTextAdapter.ts`
- Create: `Auralis-PC/src/services/documentParser/OcrAdapter.ts`
- Create: `Auralis-PC/src/services/documentParser/DocumentParser.ts`
- Create: `Auralis-PC/scripts/document-parser-core.test.mjs`

**Interfaces**
- Consumes: G3 OCR page command，G5 bridge。
- Produces: `parseDocument(input, sink: (block: ParsedBlock) => Promise<void>): Promise<ParserSummary>`；`ParsedBlock` 只携带当前 bounded block，`ordinal` 从 0 连续，`kind` 仅 `paragraph|page|slide|ocr-page`；`ParserSummary` 只含 parser/version/normalization/OCR model/blockCount，Vue 不累积完整 ParsedDocument。

- [x] **Step 1:** 已写文本 PDF、扫描 PDF、混合 PDF、Office direct/fallback、Unicode/newline、连续 ordinal、sink backpressure 和 bounded block 测试；另以 `docs/test` 两份真实 PDF 验证 text-layer/扫描分类。
- [x] **Step 2:** 已运行 `node --experimental-strip-types --test Auralis-PC/scripts/document-parser-core.test.mjs` 红灯，初次因 `DocumentParser.ts` 不存在失败。
- [x] **Step 3:** 已实现确定性 text-layer 阈值和逐页 OCR；每页完成后把单个 normalized block 交给 sink 并等待 backpressure；拒绝空文本、bbox/path/html 和超过单块上限的输出。
- [x] **Step 4:** core 7/7、真实 PDF 2/2、Office matrix 3/3 通过；相同输入产生连续 ordinal，测试证明 sink 未释放前不读取下一页。
- [ ] **Step 5:** Commit `git commit -m "feat(pc): stream deterministic document blocks"`。

---

## Phase C — PC 本地任务链

### Task C1：新增 document_processing_jobs schema 与状态机

**Files**
- Modify: `Auralis-PC/src/services/localSchema.ts`
- Modify: `Auralis-PC/src/services/localRepository.ts`
- Create: `Auralis-PC/src/types/documentProcessing.ts`
- Create: `Auralis-PC/scripts/r4-document-job-schema.test.mjs`
- Modify: `docs/contracts/Database.md`

**Interfaces**
- Consumes: G6 parser metadata。
- Produces: `DocumentProcessingJob`；phase 固定为 `QUEUED|DOWNLOADING_SOURCE|EXTRACTING|OCR_RUNNING|PACKAGING|UPLOADING|SERVER_VALIDATING|SERVER_INDEXING|READY|FAILED_LOCAL|FAILED_SERVER|PAUSED_NETWORK`。

- [x] **Step 1:** 已写 v2→v3 migration、user/device isolation、legal transition、checkpoint atomicity、source/revision uniqueness tests。
- [x] **Step 2:** 已运行 `node --experimental-strip-types --test Auralis-PC/scripts/r4-document-job-schema.test.mjs` 红灯，初次因 v3 表/类型/repository 不存在失败。
- [x] **Step 3:** 已新增专用表和 repository 方法；任务不进入 `local_resource_records` 或 Sync mutation，浏览器 fallback 使用独立 v3 namespace。
- [x] **Step 4:** `r4-document-job-schema.test.mjs` 3/3、type-check 通过；现有 `r4-local-repository.test.mjs` 待本轮最终回归一并复跑。
- [ ] **Step 5:** Commit `git commit -m "feat(pc): persist document processing jobs"`。

### Task C2：实现 Rust ParsedDocument packager 与分块加密 cache

**Files**
- Modify: `Auralis-PC/src-tauri/src/crypto.rs`
- Create: `Auralis-PC/src-tauri/src/document_packager.rs`
- Create: `Auralis-PC/src-tauri/src/document_cache.rs`
- Modify: `Auralis-PC/src-tauri/src/lib.rs`
- Modify: `Auralis-PC/src/api/tauri.ts`
- Create: `Auralis-PC/scripts/r4-document-cache.test.mjs`

**Interfaces**
- Consumes: 现有 keyring master key，G6 bounded blocks。
- Produces: commands `document_package_begin(header) -> PackageId`、`document_package_append(packageId, block)`、`document_package_finish(packageId) -> CacheReceipt`、`document_cache_delete(cacheId)`；Rust internal-only `open_decrypted_reader(cacheId)` 供 C4 上传使用，不暴露给 Vue；envelope version 1、4 MiB chunks、每块 12-byte unique nonce。

- [x] **Step 1:** 已写 Rust tests 覆盖 schemaVersion=1 JSON 流式序列化、连续 ordinal、plainTextSha256/payloadSha256 分离、AAD user/device/source/job/revision/schema、nonce uniqueness、tamper、atomic replace、跨用户拒绝和 plaintext scan。
- [x] **Step 2:** 已运行 `cargo test --manifest-path Auralis-PC/src-tauri/Cargo.toml document_cache` 红灯，初次因 cache/packager 模块不存在失败。
- [x] **Step 3:** 已实现逐块 JSON/gzip/hash/encryption pipeline；Vue 和 Rust 不构造完整正文 String，cache 写入 app private data dir，Rust 内部 reader 按 4 MiB chunk 解密。
- [x] **Step 4:** Rust 全量 10/10、cache 3/3、packager 2/2、JS contract 2/2 和 type-check 通过。
- [ ] **Step 5:** Commit `git commit -m "feat(pc): encrypt document payload cache"`。

### Task C3：实现可恢复 DocumentJobRunner

**Files**
- Create: `Auralis-PC/src/services/documentProcessing/DocumentJobRunner.ts`
- Create: `Auralis-PC/src/services/documentProcessing/checkpointPolicy.ts`
- Create: `Auralis-PC/src/store/useDocumentProcessingStore.ts`
- Create: `Auralis-PC/scripts/r4-document-job-runner.test.mjs`

**Interfaces**
- Consumes: C1 repository，C2 packager/cache，G6 block producer。
- Produces: `start(jobId)`、`resumePending()`、`pauseForNetwork(jobId)`、`retry(jobId)`、`cancel(jobId)`；单设备 bounded serial queue。

- [x] **Step 1:** 已写 app close、sidecar crash at page N、network pause、retry exhaustion、same revision dedupe tests。
- [x] **Step 2:** 已运行 `node --experimental-strip-types --test Auralis-PC/scripts/r4-document-job-runner.test.mjs` 红灯，初次因 runner 不存在失败。
- [x] **Step 3:** 已实现单设备串行 runner、每页 checkpoint、PACKAGING 后 encrypted payload receipt、最多三次自动重试；人工 retry 重置 attempt 但保留安全 checkpoint；store 提供 start/resume/pause/retry/cancel actions。
- [x] **Step 4:** runner 5/5、type-check 通过。
- [ ] **Step 5:** Commit `git commit -m "feat(pc): resume document processing jobs"`。

---

## Phase S — 服务端 ParsedDocument 与索引

### Task S1：新增 V15 数据结构

**Files**
- Create: `Auralis-Server/src/main/resources/db/migration/V15__tauri_parsed_document_schema.sql`
- Create: `Auralis-Server/src/test/java/com/auralis/app/ParsedDocumentSchemaTests.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/PgVectorMigrationIntegrationTests.java`
- Modify: `docs/contracts/Database.md`

**Interfaces**
- Consumes: V1–V14。
- Produces: `sources.ingestion_revision`；`parsed_documents`；`ingestion_jobs.parsed_document_id/ingestion_revision`；Source CHECK 加入 `AWAITING_CLIENT/VALIDATING`。

- [x] **Step 1:** 已写 clean/upgrade schema tests，断言 READY FILE+active chunk 保持 READY，非 READY FILE 获得 UUID revision 并迁移 AWAITING_CLIENT。
- [x] **Step 2:** 已按 TDD 运行红灯测试；初次因 V15 不存在失败。
- [x] **Step 3:** 已写 append-only V15；`parsed_documents` 不进入 sync 表/约束；状态、外键和 owner/status 索引已冻结。
- [x] **Step 4:** H2 `ParsedDocumentSchemaTests` 4/4 通过；PostgreSQL 定向测试代码已补充，但本机无 Docker，容器测试保持未验收；JPA validation 通过。
- [ ] **Step 5:** Commit `git commit -m "feat(server): add parsed document schema"`。

### Task S2：切分 FILE 与 TEXT/URL ingestion 语义

**Files**
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/SourceIngestionStatus.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/internal/persistence/SourceEntity.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/SourceView.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/SourceDtos.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/SourceService.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/SourceAssetRelationServiceTests.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/AiIngestionJobTests.java`
- Modify: `docs/contracts/API.md`
- Modify: `docs/modules/Backend.md`

**Interfaces**
- Consumes: S1 revision/status。
- Produces: FILE create/asset-changing update/new parse → AWAITING_CLIENT without `SourceIngestionRequestedEvent`；TEXT/URL continue existing event; compatible FILE reingest is handled in S6 by reusing the accepted ParsedDocument and revision。

- [x] **Step 1:** 已写 FILE no-event、TEXT/URL event、revision read-only DTO、client mutation cannot overwrite revision tests。
- [x] **Step 2:** 已按 TDD 运行红灯；初次因 SourceView 尚未暴露 revision 编译失败。
- [x] **Step 3:** 已实现 type-specific transition、revision rotation 和 event publishing；保持 Source version/sync DTO compatibility。
- [x] **Step 4:** `SourceAssetRelationServiceTests` 8/8、`AiIngestionJobTests` 3/3 通过。
- [ ] **Step 5:** Commit `git commit -m "feat(server): await client parsing for file sources"`。

### Task S3：实现 ParsedDocument upload intent 与私有对象元数据

**Files**
- Create: `Auralis-Server/src/main/java/com/auralis/app/source/ParsedDocumentStatus.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/source/ParsedDocumentDtos.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/source/ParsedDocumentUploadCommand.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/source/ParsedDocumentUploadIntentView.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/source/internal/persistence/ParsedDocumentEntity.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/source/internal/persistence/ParsedDocumentRepository.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/source/ParsedDocumentController.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/source/ParsedDocumentService.java`
- Create: `Auralis-Server/src/test/java/com/auralis/app/ParsedDocumentControllerTests.java`

**Interfaces**
- Consumes: S2 Source revision，`AssetStoragePort.createUploadIntent`。
- Produces: `POST /api/sources/{sourceId}/parsed-documents/upload-intents`；object key 固定 user/source/revision/parsedDocumentId 前缀；intent 不预留 winner。

- [x] **Step 1:** 已写 owner scope、stale revision、invalid parser/schema/hash/size、private object key、signed headers/expiry tests。
- [x] **Step 2:** 已运行 `Auralis-Server/mvnw.cmd -B -ntp -Dtest=ParsedDocumentControllerTests test` 红灯，确认 route 404。
- [x] **Step 3:** 已实现 intent DTO/entity/service/controller；不接受 userId/objectKey，schemaVersion 固定为 1，记录状态为 UPLOADING。
- [x] **Step 4:** 已重跑测试，`ParsedDocumentControllerTests` 3/3 通过，Source 保持 AWAITING_CLIENT。
- [x] **Step 5:** 按用户授权跳过独立 commit，保留任务边界并在后续统一提交。

### Task S4：实现 payload validator 与 legacy Asset SHA backfill

**Files**
- Create: `Auralis-Server/src/main/java/com/auralis/app/source/ParsedDocumentValidator.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/AssetService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/internal/persistence/AssetEntity.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/internal/persistence/AssetRepository.java`
- Create: `Auralis-Server/src/test/java/com/auralis/app/ParsedDocumentValidatorTests.java`
- Create: `Auralis-Server/src/test/java/com/auralis/app/AssetShaBackfillTests.java`

**Interfaces**
- Consumes: S3 object stream。
- Produces: `validate(InputStream, Metadata) -> ValidatedParsedDocument`；验证 compressed bytes、ratio、UTF-8、schemaVersion=1、blocks/length/total、ordinal、plainTextSha256、payloadSha256 和 current Asset SHA。

- [x] **Step 1:** 已写 gzip bomb、invalid UTF-8/JSON、unknown field、discontinuous ordinal、hash mismatch、concurrent null-SHA backfill tests。
- [x] **Step 1:** 已写 gzip bomb、invalid UTF-8/JSON、unknown field、discontinuous ordinal、hash mismatch、concurrent null-SHA backfill tests。
- [x] **Step 2:** 已运行 targeted tests 红灯，确认 `ParsedDocumentValidator` 不存在。
- [x] **Step 3:** 已实现 bounded streaming validation；legacy Asset 只以服务端原对象流 hash 条件更新，不写客户端声明。
- [x] **Step 4:** 已运行 `Auralis-Server/mvnw.cmd -B -ntp -Dtest=ParsedDocumentValidatorTests,AssetShaBackfillTests test`，6/6 通过。
- [x] **Step 5:** 按用户授权跳过独立 commit，保留任务边界并在后续统一提交。

### Task S5：实现 complete 首胜事务与唯一 indexing job

**Files**
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/ParsedDocumentController.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/ParsedDocumentService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/internal/persistence/SourceRepository.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/ingestion/IngestionJobService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/internal/persistence/IngestionJobEntity.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/internal/persistence/IngestionJobRepository.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/internal/persistence/ParsedDocumentEntity.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/internal/persistence/ParsedDocumentRepository.java`
- Create: `Auralis-Server/src/test/java/com/auralis/app/ParsedDocumentCompleteTests.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/shared/error/ApiErrorCode.java`

**Interfaces**
- Consumes: S4 validator。
- Produces: `POST /api/sources/{sourceId}/parsed-documents/{parsedDocumentId}/complete`；idempotent same payload；409 `PARSED_DOCUMENT_CONFLICT` / `INGESTION_REVISION_STALE`；exactly one job per source+revision。

- [x] **Step 1:** 写 same-id replay、same revision+same hash replay、different payload conflict、stale revision、two concurrent complete tests。
- [x] **Step 2:** Run targeted tests. Expected: FAIL，complete route/locking 不存在；已取得红灯编译/路由证据。
- [x] **Step 3:** 在 owner-scoped Source pessimistic lock 内 HEAD→VALIDATING→validate→first-wins→enqueue；事务失败不能留下 ACCEPTED。
- [x] **Step 4:** Run `Auralis-Server/mvnw.cmd -B -ntp -Dtest=ParsedDocumentCompleteTests test`. Expected: PASS，并发测试 job count=1；实际 3/3 通过。
- [x] **Step 5:** 用户已授权跳过独立 commit；保留 S5 任务边界，后续统一提交。

### Task S6：从 ParsedDocument 索引并管理 generation/object 生命周期

**Files**
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/ingestion/IngestionWorker.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/ingestion/FileSourceParser.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/retrieval/SourceChunkService.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/source/ParsedDocumentCleanupService.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/source/ParsedDocumentReadView.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/SourceService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/internal/persistence/ParsedDocumentRepository.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/AiIngestionWorkerTests.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/AiSourceChunkTests.java`
- Create: `Auralis-Server/src/test/java/com/auralis/app/ParsedDocumentCleanupTests.java`

**Interfaces**
- Consumes: S5 accepted doc/job。
- Produces: FILE job reads validated ParsedDocument blocks；new generation atomically becomes active；compatible reingest reuses accepted doc；old objects SUPERSEDED/deleted，metadata retained 30 days。

- [x] **Step 1:** 写 no-original-file-parser、failed generation preserves old chunks、compatible reingest、late revision fencing、rejected/upload-timeout cleanup tests；覆盖 `AiIngestionWorkerTests` 5、`AiSourceChunkTests` 3、`ParsedDocumentCleanupTests` 2 和 `ParsedDocumentCompleteTests` 3。
- [x] **Step 2:** Run targeted tests；旧 FILE worker 路径基线已确认，随后新增测试驱动实现。
- [x] **Step 3:** 实现 parsed-doc reader/index path 和 cleanup scheduler；Source/Asset revision change invalidates late work。
- [x] **Step 4:** Run worker/chunk/cleanup tests。实际定向集合 21/21 通过。
- [x] **Step 5:** 用户已授权跳过独立 commit；保留 S6 任务边界，后续统一提交。

---

## Phase K/C — 契约冻结与 PC 上传闭环

### Task K1：冻结 ParsedDocument OpenAPI 与生成 SDK

**Files**
- Modify: `docs/contracts/openapi/auralis-openapi.json`
- Modify: `Auralis-PC/src/api/generated/schema.ts`
- Modify: `Auralis-Mobile/src/api/generated/schema.ts`
- Modify: `Auralis-PC/src/api/useSourceApi.ts`
- Modify: `Auralis-PC/src/api/useAssetApi.ts`
- Modify: `Auralis-Mobile/src/api/assetApi.ts`
- Modify: `docs/contracts/API.md`

**Interfaces**
- Consumes: S5 routes/DTO。
- Produces: generated intent/complete and Source `ingestionRevision/ingestionStatus` types；禁止手改 generated schema。

- [x] **Step 1:** 扩展 `OpenApiArtifactTests` 断言两条 route、409 codes、nullable OCR model、read-only revision。
- [x] **Step 2:** 按 TDD 运行 `Auralis-Server/mvnw.cmd -B -ntp -Dtest=OpenApiArtifactTests test`，先确认旧 artifact drift 红灯，再补齐运行时契约。
- [x] **Step 3:** 运行 `powershell -ExecutionPolicy Bypass -File scripts/export-openapi.ps1` 和 `scripts/generate-openapi-sdk.ps1`；为 Source/Asset/ParsedDocument DTO 固定 schema 名称，避免同名 `Response`/`UploadIntent` 覆盖。
- [x] **Step 4:** `scripts/check-openapi.ps1` 通过，PC `npm run type-check` 通过；Mobile 只更新生成类型，不新增 OCR UI/逻辑。用户授权跳过独立 commit。
- [x] **Step 5:** 用户已授权跳过独立 commit；K1 文件保持未提交并纳入后续统一提交边界。

### Task C4：实现 Rust 流式上传与 PC upload coordinator

**Files**
- Create: `Auralis-PC/src-tauri/src/document_upload.rs`
- Modify: `Auralis-PC/src-tauri/src/lib.rs`
- Modify: `Auralis-PC/src/api/tauri.ts`
- Create: `Auralis-PC/src/services/documentProcessing/ParsedDocumentUploadCoordinator.ts`
- Create: `Auralis-PC/scripts/r4-parsed-document-upload.test.mjs`
- Modify: `Auralis-PC/src/services/localSchema.ts`, `Auralis-PC/src/services/localRepository.ts`, `Auralis-PC/src/types/documentProcessing.ts`, `Auralis-PC/src-tauri/src/document_cache.rs`, `Auralis-PC/src-tauri/src/document_packager.rs`

**Interfaces**
- Consumes: C2 encrypted cache，C3 runner，K1 API。
- Produces: `upload(jobId, cacheReceipt) -> ServerReceipt`；signed URL 不持久化；PUT 可恢复到重新申请 intent，不重复 OCR/package。

- [x] **Step 1:** 已写 payload hash/size、expired URL re-intent、network pause、complete idempotency、stale revision failure 和 transport boundary tests。
- [x] **Step 2:** 已先运行 JS 红灯（coordinator 不存在），再运行 Rust 目标测试并进入实现循环。
- [x] **Step 3:** 已实现 Rust 解密 reader → streaming PUT、请求/状态/hash/size校验；Vue 只接收 phase/receipt，签名 URL 不落库且正文不穿过 coordinator。
- [x] **Step 4:** Rust 12/12、C4 JS 6/6、PC 回归 108/108、C1/C2/C3 定向 12/12 和 PC type-check 通过；本地 schema v4 将 revision 对齐服务端 UUID，并覆盖旧数字 v3 可恢复迁移。
- [x] **Step 5:** 用户已授权跳过独立 commit；C4 文件保持未提交并纳入后续统一提交边界。

### Task C5：接入 FILE Source 调度、替换与 reingest

**Files**
- Modify: `Auralis-PC/src/store/useSourceStore.ts`
- Modify: `Auralis-PC/src/store/useAssetStore.ts`
- Modify: `Auralis-PC/src/services/domainMappers.ts`
- Create: `Auralis-PC/src/services/documentProcessing/sourceJobScheduler.ts`
- Create: `Auralis-PC/src/services/documentProcessing/runtime.ts`
- Create: `Auralis-PC/src/services/documentParser/backgroundParserHost.ts`
- Modify: `Auralis-PC/src/components/preview/BackgroundParserHost.vue`
- Modify: `Auralis-PC/src/App.vue`
- Modify: `Auralis-PC/src/services/localDb.ts`
- Modify: `Auralis-PC/src/services/localRepository.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/ParsedDocumentUploadCoordinator.ts`
- Modify: `Auralis-PC/scripts/r4-register-file.test.mjs`
- Create: `Auralis-PC/scripts/r4-source-processing-schedule.test.mjs`
- Create: `Auralis-PC/scripts/r4-document-processing-runtime.test.mjs`

**Interfaces**
- Consumes: C4 coordinator，K1 Source DTO。
- Produces: local File/Blob upload fast path；restart/cross-device owner-scoped download URL path；revision change supersedes old local job。

- [x] **Step 1:** 写 create immediate job、mobile-created FILE picked up on PC、asset SHA mismatch、revision change, compatible READY no OCR, TEXT/URL unchanged tests，并补充 durable receipt/restart resume 覆盖。
- [x] **Step 2:** 先运行 targeted tests 红灯（schema version/browser namespace 与 runner receipt），再进入实现循环。
- [x] **Step 3:** 实现 scheduler；签名 URL 仅在 download adapter 内存中使用，Source Store 只在 FILE + revision + `AWAITING_CLIENT` 时调度，revision 变化 supersede 旧 job，完成后清理 cache/临时输入；job schema 升级 v5 持久化非敏感 receipt 元数据以支持重启续传。
- [x] **Step 4:** 将 `DocumentProcessingRuntime` 接入 Tauri App：复用全局 `BackgroundParserHost`，组装 SQLite job repository、PDF/Office parser、OCR、Rust package、upload coordinator 和 Source scheduler；登录后启动，登出时解绑，sync/online 后恢复 pending jobs；修复带 durable receipt 的暂停上传恢复。
- [x] **Step 5:** `test:r4-pc` 134/134、`vue-tsc -b`、`vite build`、`check:r4-pc`（79 个生产文件）和 `git diff --check` 通过；Tauri `--no-bundle` 生成 `src-tauri/target/release/app.exe`，构建保留既有 File Viewer 大 chunk 与动态 import 警告。
- [x] **Step 6:** 用户已授权跳过独立 commit；C5 文件保持未提交并纳入后续统一提交边界。真实 Tauri/Server/MinIO/GUI 联调转入人工测试。

---

## Phase A — 阅读会话与检索范围

### Task A1：新增 V16 阅读会话 scope 与清理

**Files**
- Create: `Auralis-Server/src/main/resources/db/migration/V16__reading_conversation_scope.sql`
- Create: `Auralis-Server/src/main/java/com/auralis/app/ai/ConversationPurpose.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/internal/persistence/ConversationEntity.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/internal/persistence/ConversationRepository.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/ConversationCommand.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/ConversationView.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/ConversationService.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/ai/ReadingConversationCleanupService.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/AiConversationServiceTests.java`
- Modify: `docs/contracts/Database.md`

**Interfaces**
- Consumes: active owner-scoped Source。
- Produces: `purpose=GENERAL|READING_SESSION`、nullable sourceId；list excludes READING_SESSION；inactive >24h reading sessions soft-delete。

- [x] **Step 1–4:** 已完成 migration/default GENERAL/source owner/list filtering/cleanup boundary tests 与实现；`AiConversationServiceTests` 4/4 通过。
- [x] **Step 5:** 用户已授权跳过独立 commit，改纳入统一提交边界。

### Task A2：组装已完成历史和固定 Prompt 顺序

**Files**
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/internal/persistence/MessageRepository.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/ai/PromptAssembler.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/AiStreamingService.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/AiStreamingTests.java`

**Interfaces**
- Consumes: A1 conversation。
- Produces: prompt order `system → completed history → selection → retrieved blocks → current user`；FAILED/CANCELLED/incomplete assistant excluded；oldest completed pairs cropped first。

- [x] **Step 1–4:** 已完成 multi-turn、失败/未完成消息过滤、预算裁剪、reply pair 顺序测试和 `PromptAssembler` 接线；`PromptAssemblerTests` 2/2、`AiStreamingTests` 12/12 通过。
- [x] **Step 5:** 用户已授权跳过独立 commit，改纳入统一提交边界。

### Task A3：实现 readingContext 校验和当前 Source 检索

**Files**
- Create: `Auralis-Server/src/main/java/com/auralis/app/ai/retrieval/ReadingContext.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/AiMessageCommand.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/retrieval/RetrievalService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/retrieval/PgVectorRetrievalRepository.java`
- Create: `Auralis-Server/src/test/java/com/auralis/app/AiReadingCurrentSourceTests.java`

**Interfaces**
- Consumes: S6 active chunks。
- Produces: optional `readingContext { currentSourceId, subjectId, retrievalMode:AUTO, selectionText? }`；提供时验证 owner/subject/READY 并先只查 currentSourceId；省略时保持 generic chat。

- [x] **Step 1–4:** 已完成 owner/subject/READY、current-only、generic compatibility 和 selectionText 边界测试；`AiRetrievalTests` 5/5、`AiReadingScopeTests` 3/3 通过，citation 仍只来自 retrieved chunk。
- [x] **Step 5:** 用户已授权跳过独立 commit，改纳入统一提交边界。

### Task A4：实现同 Subject 确定性升级策略和引用去重

**Files**
- Create: `Auralis-Server/src/main/java/com/auralis/app/ai/retrieval/ScopeEscalationReason.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/ai/retrieval/ScopeEscalationPolicy.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/ai/retrieval/ReadingRetrievalConfig.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/retrieval/RetrievalService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/AiStreamingService.java`
- Create: `Auralis-Server/src/test/java/com/auralis/app/AiReadingScopeTests.java`

**Interfaces**
- Consumes: A3 current hits。
- Produces: only `EXPLICIT_CROSS_FILE`、`SUBJECT_SOURCE_TITLE_MATCH`、`INSUFFICIENT_CURRENT_RESULTS`；errors/uncertainty stay current；never cross Subject/user global。

- [x] **Step 1–4:** 已完成显式比较、标题命中/停用词、当前命中不足、跨 Subject 隔离与 citation 去重测试；策略为纯确定性规则，`AiReadingScopeTests` 3/3、检索/流式回归通过。
- [x] **Step 5:** 用户已授权跳过独立 commit，改纳入统一提交边界。

### Task K2：冻结阅读会话与 readingContext OpenAPI

**Files**
- Modify: `docs/contracts/openapi/auralis-openapi.json`
- Modify: `Auralis-PC/src/api/generated/schema.ts`
- Modify: `Auralis-Mobile/src/api/generated/schema.ts`
- Modify: `Auralis-PC/src/api/aiClient.ts`
- Modify: `docs/contracts/API.md`

**Interfaces**
- Consumes: A1/A2/A4。
- Produces: generated Conversation purpose/source and AiMessage readingContext types；Mobile 只更新类型，不接工作区策略。

- [x] **Step 1–4:** 已扩展 OpenAPI 断言并导出 artifact；PC schema 已生成，Mobile schema 已同步 `ReadingContext`/purpose/source 字段；`OpenApiArtifactTests` 5/5、PC type-check 和 AI 定向测试通过。
- [x] **Step 5:** 用户已授权跳过独立 commit，改纳入统一提交边界。

---

## Phase U — PC 阅读 UI

### Task U1：状态点与 Profile 文档处理中心

**Files**
- Create: `Auralis-PC/src/components/document-processing/DocumentProcessingDot.vue`
- Create: `Auralis-PC/src/components/document-processing/DocumentProcessingCenter.vue`
- Modify: `Auralis-PC/src/views/Profile/index.vue`
- Modify: `Auralis-PC/src/views/SubjectWorkspace/index.vue`
- Create: `Auralis-PC/scripts/r4-document-processing-ui.test.mjs`
- Modify: `docs/design/Frontend.md`
- Modify: `docs/modules/FrontendPC.md`

**Interfaces**
- Consumes: C5 jobs/Source status。
- Produces: file list only status dot；READY dot disappears；Profile shows phase/progress/error/retry；Office unknown page count uses indeterminate stage。

- [x] **Step 1–4:** 已完成状态点、Profile 解析中心、阶段/错误/重试/取消和轮询刷新；UI 契约测试、完整 PC 回归 134/134、type-check、Web build 通过。
- [x] **Step 5:** 用户已授权跳过独立 commit，改纳入统一提交边界。

### Task U2：阅读会话生命周期与未 READY 弹窗

**Files**
- Modify: `Auralis-PC/src/store/useChatStore.ts`
- Modify: `Auralis-PC/src/services/aiStreamReducer.ts`
- Modify: `Auralis-PC/src/views/SubjectWorkspace/index.vue`
- Create: `Auralis-PC/src/components/document-processing/DocumentNotReadyDialog.vue`
- Create: `Auralis-PC/scripts/r4-reading-session.test.mjs`
- Modify: `Auralis-PC/scripts/r4-ai-stream.test.mjs`

**Interfaces**
- Consumes: K2 conversation API，U1 status。
- Produces: 进入学科且存在当前 Source、或切换文件时创建空白 `READING_SESSION` 并绑定该 Source；没有 Source 时不提前创建；switch/leave/logout best-effort delete；non-READY AI action offers Profile or cancel，Profile action 只导航 `/profile`，不保存回跳入口；citation UI 只显示去重来源文件名，不显示伪页码/摘录/jump。

- [x] **Step 1–4:** 已完成 enter/switch/leave、无历史恢复、同次打开多轮消息、未 READY 弹窗和 `/profile` 导航；reading/session/UI 协议测试与 type-check 通过。
- [x] **Step 5:** 用户已授权跳过独立 commit，改纳入统一提交边界。

### Task U3：选中文本解释/提问/保存知识块

**Files**
- Modify: `Auralis-PC/src/components/preview/FileViewerRenderer.vue`
- Modify: `Auralis-PC/src/components/FilePreview.vue`
- Modify: `Auralis-PC/src/views/SubjectWorkspace/index.vue`
- Create: `Auralis-PC/src/components/knowledge/KnowledgeBlockEditor.vue`
- Modify: `Auralis-PC/src/store/useKnowledgeStore.ts`
- Create: `Auralis-PC/scripts/r4-reading-selection.test.mjs`
- Modify: `docs/design/Frontend.md`

**Interfaces**
- Consumes: K2 readingContext，U2 active session。
- Produces: bounded selection event；`explain`/`ask` send selectionText as user context；`save` opens editable title/body/tags editor bound to current subject/source。

- [x] **Step 1–4:** 已完成 4000 字上限的原生 selection、解释/追问、确认标题/正文/标签编辑和 subject/source 绑定；selection/UI、PC 回归、type-check、Web build 通过。
- [x] **Step 5:** 用户已授权跳过独立 commit，改纳入统一提交边界。

---

## Phase R — 端到端与发布门禁

### Task R1：真实 PostgreSQL/MinIO 与 PC 可控 E2E

**Files**
- Create: `Auralis-Server/src/test/java/com/auralis/app/ParsedDocumentMinioPgVectorIntegrationTests.java`
- Create: `Auralis-PC/scripts/r4-ai-reading-e2e.test.mjs`

**Interfaces**
- Consumes: S6、C5、K2、U1–U3。
- Produces: create FILE → parse/OCR → encrypted cache → intent/PUT/complete → READY → current Source answer → Subject escalation → selection → KnowledgeBlock 的可重复证据。

- [ ] **Step 1:** 写 clean environment E2E，另写 server unavailable、sidecar crash、upload expiry、stale revision、duplicate complete、Source delete cases。
- [ ] **Step 2:** Run server integration and PC E2E. Expected: PASS，因为所有生产依赖任务均已完成；禁止在 E2E 中绕过校验或使用假 READY。
- [ ] **Step 3:** 若任一场景失败，R1 立即保持红灯；在本计划 R1 前插入一个包含 exact files、红灯测试和独立 commit 的修复任务，修复完成后从 Step 2 重跑，不能在 R1 中临时修改生产代码。
- [ ] **Step 4:** Run `Auralis-Server/mvnw.cmd -B -ntp clean test`、`npm --prefix Auralis-PC run test:r4-pc`、`npm --prefix Auralis-PC run build`. Expected: all PASS；这仍不证明 MSI/GUI。
- [ ] **Step 5:** Commit `git commit -m "test: verify ai reading end to end"`。

### Task R2：迁移、安全、MSI、人工验收与文档收口

**Files**
- Modify: `docs/contracts/API.md`
- Modify: `docs/contracts/Database.md`
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/modules/Backend.md`
- Modify: `docs/modules/Infrastructure.md`
- Modify: `docs/design/Frontend.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`
- Modify: `docs/README.md`
- Modify: `Auralis-PC/src-tauri/resources/licenses/THIRD-PARTY-NOTICES.txt`
- Modify: `Auralis-PC/src-tauri/resources/sbom/ocr-components.cdx.json`

**Interfaces**
- Consumes: R1 all automated evidence。
- Produces: clean/upgrade migration evidence、dependency/license/SBOM evidence、Windows 10/11 x64 MSI install/upgrade/uninstall/offline OCR/GUI/performance evidence；只把真实执行结果写成完成。

- [ ] **Step 1:** 验证 clean V1→V16、upgrade V14→V16、旧 READY FILE 保留、旧 non-ready FILE→AWAITING_CLIENT、Asset null SHA backfill、client v2→v3 pending preservation。
- [ ] **Step 2:** Run `scripts/check-openapi.ps1`、`npm --prefix Auralis-PC run check:r4-pc`、bundle verifier、SBOM/license scan。Expected: PASS。
- [ ] **Step 3:** 在干净 Windows 10/11 x64 安装 MSI，断网跑五组 OCR；走查状态点/Profile retry/not-ready modal/current-source/Subject escalation/no jump/KB save/restart resume。
- [ ] **Step 4:** 对照 G4 `budgets.json` 检查 p95/RSS/package size 不超过 regression ceiling；任何失败保持风险开放，不修改验收口径。
- [ ] **Step 5:** 回写权威文档并 commit `git commit -m "docs: close ai reading delivery evidence"`；若人工项未通过，commit message 改为 `docs: record ai reading validation gaps` 且 R2 保持未完成。

## Execution Checklist

- [ ] G1 OCR IPC、错误码和 fixture 已冻结。
- [ ] G2 固定模型 sidecar engine 与 exact lock 已通过。
- [ ] G3 Rust supervisor 与 bounded commands 已通过。
- [x] G4 MSI 离线硬门 A 已通过（构建/verifier/baseline 通过；安装 smoke 留给 R2）。
- [ ] G5 Office BackgroundParserHost 硬门 B 已通过（host/bridge 已实现，真样本矩阵待补）。
- [ ] G6 PDF/Office/OCR ParsedDocument builder 已通过。
- [x] C1 本地 job schema/state machine 已通过。
- [x] C2 streaming encrypted cache 已通过。
- [x] C3 crash/network/restart runner 已通过。
- [x] S1 V15 schema clean/upgrade 已通过（H2 4/4；PostgreSQL upgrade 待 Docker）。
- [x] S2 FILE/TEXT/URL event split 已通过（Source 8/8、Ai ingestion 3/3）。
- [x] S3 upload intent/private object metadata 已通过（`ParsedDocumentControllerTests` 3/3；无独立 commit）。
- [x] S4 validator/legacy Asset SHA backfill 已通过（validator 4/4、SHA backfill 2/2；无独立 commit）。
- [x] S5 complete first-wins/concurrency 已通过（`ParsedDocumentCompleteTests` 3/3；无独立 commit）。
- [x] S6 ParsedDocument indexing/generation/cleanup 已通过（定向 21/21；无独立 commit）。
- [x] K1 ParsedDocument OpenAPI/SDK 已冻结（`OpenApiArtifactTests` 5/5、`check-openapi.ps1`、PC type-check）。
- [x] C4 PC upload coordinator 已通过（Rust 12/12、JS 6/6、coordinator 纳入 PC 回归）。
- [x] C5 FILE Source scheduling/reingest 已通过（134/134、runtime 组装/启动恢复已接入；真实 Tauri/Server/MinIO/GUI 留给人工验收）。
- [x] A1 reading conversation scope/cleanup 已通过。
- [x] A2 completed history/prompt assembly 已通过。
- [x] A3 current Source retrieval 已通过。
- [x] A4 Subject-only deterministic escalation 已通过。
- [x] K2 AI reading OpenAPI/SDK 已冻结。
- [x] U1 status dot/Profile processing center 已通过。
- [x] U2 session lifecycle/not-ready modal 已通过。
- [x] U3 selection/KnowledgeBlock 已通过。
- [ ] R1 PostgreSQL/MinIO/PC E2E 已通过。
- [ ] R2 migration/security/MSI/manual/docs gate 已通过。

## Self-review Checklist

- 规格覆盖：PC-only、两个硬门、Office/PDF/OCR、ParsedDocument、revision/hash/首胜、generation、加密缓存、恢复、Source 状态、阅读会话、当前 Source→Subject、selection、Profile、MSI/SBOM/性能和人工验收都有唯一任务归属。
- 任务尺寸：原计划 12 个大任务拆成 28 个 reviewer gates；每项只产出一个主要接口，可独立红灯、绿灯、评审和提交。
- 依赖一致：K1/K2 分开冻结，避免 PC 在服务端 DTO 未稳定时手写类型；C4 等待 K1，U2/U3 等待 K2；R1 等待所有生产链完成。
- 类型一致：`ingestionRevision`、`payloadSha256`、`plainTextSha256`、`READING_SESSION`、三类 escalation reason 和所有状态名在前后任务一致。
- 范围一致：未加入 Web 发布、Mobile/Tablet OCR、Excel/GPU/overlay/jump、跨 Subject/global 检索或运行时模型下载。
- 工作树保护：计划明确禁止自动 stash/reset 和整树 staging；当前重叠文件必须在执行时先确认用户既有修改归属。
- A1–A4、K2、U1–U3 已执行并完成代码/自动门禁；R1/R2 未伪造外部依赖或 GUI 证据，保留为人工联调与发布验收任务。

# PC Tauri AI 辅助阅读全流程设计

日期：2026-08-23

复核修订：2026-08-24

状态：已批准并完成技术复核修订，计划中，尚未实现

适用范围：Auralis PC Tauri、Auralis Server、文件摄入与 AI/RAG 契约

## 1. 背景与目标

现有系统已经具备 AI Provider 配置、会话与 SSE 消息、Source 摄入、文本切块、1024 维 Embedding、PostgreSQL pgvector 检索和引用事件等后端基线。PC 学科工作区也已具备文件上传、文件预览和右侧 AI 面板，但当前链路仍存在以下断点：

- 服务端文件解析只覆盖文本型 MIME，PDF、DOC/DOCX、PPT/PPTX 和图片不能完整进入 RAG。
- PC AI 请求没有强类型的当前 Source 与 Subject 范围，当前文件名被拼接在用户消息正文中。
- 检索默认跨当前用户的全部可用来源，不能保证当前文件优先或学科隔离。
- AI 回答引用尚未形成最终阅读交互，知识块保存也没有确认编辑流程。
- OCR、处理进度、失败恢复和应用关闭后的续作尚无端到端设计。

本设计的目标是完成首期 PC 深度阅读闭环：

1. 用户上传当前可预览的文件后立即看到 Source，并在本地后台提取文字或执行 OCR。
2. 客户端把统一、版本化的 ParsedDocument 交给服务端；服务端只负责校验、分块、Embedding 与检索。
3. AI 默认只检索当前文件，必要时以确定性规则静默扩大到当前学科，永不跨学科。
4. 原生可选文本支持解释、提问与保存知识块；图片和扫描 PDF 不构建 OCR 文本覆盖层。
5. AI 回答只显示来源文件名，并能经用户确认编辑后保存为当前 Source 下的知识块。
6. 处理任务可观察、可恢复、可重试，同时保持清晰的本地与服务端信任边界。

## 2. 已批准产品决策

| 主题 | 决策 |
| --- | --- |
| 首期平台 | Windows 10/11 x64 的 PC Tauri |
| PC Web | 退出发布目标；Vite 只作为 Tauri 内部开发工具 |
| Mobile / Tablet | 继续使用现有 Uni-app；本期不实现端侧 OCR 深度阅读 |
| 支持格式 | 当前可预览的 PDF、DOC/DOCX、PPT/PPTX、图片、TXT 等文本文件 |
| 不支持格式 | Excel、未知格式和超过现有限制的文件继续阻止进入阅读解析 |
| 解析归属 | PC 本地统一解析；服务端不执行扫描 PDF 或图片 OCR |
| OCR | PP-OCRv6-small，随安装包提供，不运行时下载 |
| 安装包 | 只交付 Windows x64 MSI；Sidecar、模型和许可证均随包离线提供 |
| 引用呈现 | 只显示去重后的来源文件名，无页码、摘录、相似度、点击或原文回跳 |
| OCR 文本层 | 图片和扫描 PDF 不生成可选择覆盖层 |
| 检索范围 | 默认当前文件；命中规则后静默扩大到当前学科；永不跨当前学科 |
| 会话生命周期 | 进入工作区或切换文件时新建空白会话，不恢复历史会话 |
| 知识块保存 | 必须打开确认编辑器，可修改标题、正文、标签，确认后关联当前 Subject 与 Source |
| 进度入口 | 工作区仅保留状态点；个人中心展示详细进度、错误和重试 |

## 3. 总体架构

```text
Vue 学科工作区
    │
    ├─ File Viewer / PDF.js：预览、原生文本、文本选区
    ├─ BackgroundParserHost：离屏挂载 Office renderer，串行提取
    └─ DocumentParser：统一编排门面
          ├─ OfficeTextAdapter
          ├─ PdfPageClassifier / PdfTextAdapter
          └─ OcrAdapter
                 │ bounded typed Tauri commands
                 ▼
          Tauri Rust JobController
          ├─ 任务/检查点与分块加密缓存
          ├─ ParsedDocument 流式上传
          └─ 长驻 auralis-ocr.exe Sidecar
                 │
                 ▼
          RapidOCR + ONNX Runtime CPU
          + 固定 OCR 模型清单
                 │
                 ▼
Spring Boot：校验 → chunk → embedding → pgvector → RAG → SSE
```

### 3.1 PC 边界

- Vue 负责阅读交互、现有 File Viewer 适配、文本选区和任务状态展示。
- `DocumentParser` 是唯一的格式解析编排入口，向上只暴露任务状态或结构化错误；正文按有界批次交给 Rust，不在 Vue 持久化。
- `BackgroundParserHost` 是挂载在应用根部、具有固定桌面布局尺寸但不可交互的单实例离屏宿主。它一次只加载一个 Office 文件，等待 renderer 就绪后调用 File Viewer 的 anchors/chunks 能力，不依赖用户当前是否打开该文件。
- Rust 持久化任务和检查点；Vue/WebView 重启后由 Rust 返回待续任务，再由 `BackgroundParserHost` 重新挂载对应文件。应用退出后不驻留后台。
- Tauri Rust 负责受控命令、任务持久化、加密缓存、Sidecar 生命周期、上传续作和清理。
- Vue 不获得通用 Shell 能力，也不能传入任意可执行文件、输入路径或输出路径。
- 应用运行时后台处理；应用关闭时保存安全检查点，下次启动恢复，不承诺退出后继续驻留运行。

### 3.2 OCR 交付边界

- 首期固定使用 `auralis-ocr.exe` Windows x64 Sidecar、RapidOCR、ONNX Runtime CPU 与 PP-OCRv6-small。
- `auralis-ocr.exe` 使用 Tauri `bundle.externalBin` 打包，并按 Tauri target triple 命名；检测、识别、方向分类模型、配置、第三方许可证和模型清单使用 `bundle.resources`。`bundle.targets` 收敛为 Windows x64 `msi`，不再使用 `all`。
- RapidOCR 必须选择支持 PP-OCRv6 的版本（最低 `3.9.0`），并在构建清单中精确锁定 RapidOCR、ONNX Runtime、Python/PyInstaller 及其原生依赖版本。模型清单固定检测、识别和方向分类模型的文件名、版本与 SHA-256；方向分类模型如沿用 PP-OCRv4 mobile 默认模型，必须显式记录，不得隐式下载或漂移。
- 构建在 Sidecar、Runtime、模型或许可证缺失时失败；正式运行期间不得访问网络下载或更新模型。
- Rust 启动一个应用级长驻 Sidecar，模型只预热一次；任务通过有界队列串行进入，崩溃后由 Rust 限次重启并从页级检查点恢复。禁止每页启动新进程。
- Sidecar 使用带 `protocolVersion`、任务 ID、页号、超时和响应大小上限的 JSON 标准输入输出协议，不监听本地端口。Vue 只提交有界图像字节；Rust 写入内部工作目录后向 Sidecar 传递受控临时路径，Sidecar 不接受前端提供的任意路径。
- 首期不启用 DirectML、CUDA、GPU 探测、模型热更新或首次使用下载。

### 3.3 服务端边界

- FILE Source 的 PDF、Office、图片和文本文件统一接收客户端 ParsedDocument，不再尝试服务端 OCR。
- TEXT 与 URL Source 保持现有服务端解析路径。
- 服务端是用户归属、Source/Subject 关系、解析代际、索引状态和检索范围的最终权威。
- ParsedDocument 是非同步派生资源，不进入普通 Source/Knowledge/Task Sync。
- 任意端仍可上传和查看原始 FILE Source，但只有 PC Tauri 生成 ParsedDocument；Mobile/Tablet 上传的 FILE 会保持 `AWAITING_CLIENT`，直到同一用户在 PC Tauri 登录并完成解析。Mobile/Tablet 本期不伪装 READY，也不执行本地 OCR。

## 4. 文件解析策略

| 文件类型 | 首期策略 |
| --- | --- |
| TXT、Markdown 及其他已支持文本预览 | 原生文本提取 |
| DOC/DOCX | 在 `BackgroundParserHost` 中复用 File Viewer 的 document chunks/anchors 输出 |
| PPT/PPTX | 在 `BackgroundParserHost` 中优先读取 chunks/anchors；Canvas/WASM renderer 无可靠文本时对渲染后的页/幻灯片逐张 OCR |
| 文字型 PDF | PDF.js 按页提取文字 |
| 扫描型 PDF | PDF.js 按页渲染后调用 OCR |
| 混合型 PDF | 每页判断；文字充分的页原生提取，其他页 OCR |
| 图片 | 调用 OCR |

PDF 页分类使用确定性规则，综合文字字符数、有效字符比例和页面覆盖信号。阈值必须配置化并以固定夹具测试。OCR 一次只渲染和处理一页，完成后释放位图；默认渲染质量以清晰中文扫描件为基线，不把整份 PDF 同时载入内存。

Office 提取不是预览能力的自然推论。实施前必须建立格式能力矩阵，分别用 DOC、DOCX、PPT、PPTX 固定样本验证：renderer 能否在离屏宿主稳定加载、是否产生非空且顺序正确的 chunks/anchors、Canvas 页面能否导出 OCR 输入。某格式只有在原生提取或逐页 OCR fallback 至少一条路径通过后才能标记为支持；提取为空、顺序不可确定或页图不可获得时返回稳定失败，禁止生成空 ParsedDocument 后进入 READY。

离屏宿主与用户可见预览互不复用组件实例，避免切换当前文件打断后台任务；两者复用同一格式适配器、renderer 资源和解析规则。后台 Office 任务首期全局并发为 1，PDF/OCR 也进入同一设备级有界队列，优先保证内存可控和可恢复性。

当前上传会话可直接使用用户已选择的 File/Blob 作为解析输入；应用重启、跨设备或本地输入失效时，PC 通过 owner-scoped Asset download-url 重新取得原文件。每次恢复都重新核对 Asset SHA-256 和 `ingestionRevision`；下载 URL 过期时重新申请，不持久化签名 URL。临时原文件只存在于应用私有工作区并随任务清理，不能把用户原路径写入 ParsedDocument 或日志。

原生格式可在阅读器中提供选区交互；OCR 结果只用于 RAG，不回写预览器，不生成隐藏或可见文本覆盖层。

## 5. ParsedDocument 契约

客户端统一生成 gzip 压缩的 UTF-8 JSON：

```json
{
  "schemaVersion": 1,
  "sourceId": "uuid",
  "ingestionRevision": "uuid",
  "sourceAssetSha256": "hex-sha256",
  "parser": {
    "id": "file-viewer | pdfjs | pp-ocr | hybrid",
    "version": "string",
    "normalizationVersion": "string",
    "ocrModelVersion": "model-manifest-version | null"
  },
  "blocks": [
    {
      "ordinal": 0,
      "kind": "paragraph | page | slide | ocr-page",
      "text": "normalized text"
    }
  ],
  "characterCount": 12345,
  "plainTextSha256": "hex-sha256"
}
```

约束：

- `ordinal` 从 0 连续递增，并构成文档的唯一阅读顺序。
- 文本使用统一换行和 Unicode 规范化规则；哈希在规范化后计算。
- 不包含 OCR bbox、预览坐标、用户本地路径、任意 HTML 或可执行内容。
- 服务端配置 block 数、单 block 字符数、总字符数、压缩后大小和解压比例上限。
- `ingestionRevision` 必须等于服务端当前 Source revision；旧 revision 的结果不能参与校验或索引。
- PC 在原 Asset upload-intent 前流式计算 SHA-256 并提交；`sourceAssetSha256` 必须匹配 Source 当前绑定 Asset。历史 Asset 哈希为空时，服务端在首次接受 ParsedDocument 前流式读取原对象、校验并原子回填哈希，不能把客户端声明直接写成可信事实。
- `plainTextSha256` 对按 ordinal 连接后的规范化正文计算；upload-intent 的 `payloadSha256` 对实际上传的 gzip 字节计算，服务端分别校验，二者不能混用。
- payload 在内存中以有界 block 批次生成，经 gzip 后直接进入本地加密封装；禁止先落盘为明文 JSON。

## 6. API 与持久化设计

### 6.1 ParsedDocument 上传

新增：

```text
POST /api/sources/{sourceId}/parsed-documents/upload-intents
POST /api/sources/{sourceId}/parsed-documents/{parsedDocumentId}/complete
```

upload-intent 请求包含当前 `ingestionRevision`、`schemaVersion`、`parserId`、`parserVersion`、`normalizationVersion`、可选 `ocrModelVersion`、`sourceAssetSha256`、`payloadSha256` 和 `sizeBytes`。响应沿用现有 Asset 预签名风格，返回 `parsedDocumentId`、服务端确认的 `ingestionRevision`、私有上传 URL、限定 headers 与过期时间。

complete 不接受客户端对象元数据。服务端锁定 owner-scoped Source，对固定 object key 执行 HEAD/stat，验证真实大小、类型、哈希、Source/Asset 关系和当前 revision，再流式解压并校验结构。

同一 revision 的接受规则固定为“首个有效结果胜出”：

- 同一 `parsedDocumentId` 或相同 revision + payload hash 的重放返回同一接受结果，不重复创建 ingestion job。
- 同一 revision 已接受不同 payload 后，其他结果返回 HTTP 409 / `PARSED_DOCUMENT_CONFLICT`。
- Source 删除、Asset 替换或 revision 轮换后，迟到请求返回 HTTP 409 / `INGESTION_REVISION_STALE`。
- upload-intent 只表示允许上传，不预占最终胜出权；最终仲裁发生在 complete 的 Source 行锁事务内。

### 6.2 服务端派生数据

新增 `parsed_documents`，至少记录：

- `id`、`user_id`、`source_id`；
- `ingestion_revision`、当前 Asset 哈希；
- schema、parser、OCR model 版本；
- 私有 object key、payload 哈希、大小；
- `status`、`created_at`、`accepted_at`；
- 对应 ingestion generation。

`parsed_documents.status` 至少包括 `UPLOADING`、`VALIDATING`、`ACCEPTED`、`REJECTED`、`SUPERSEDED`。`ingestion_jobs` 关联被接受的 `parsed_document_id`、`ingestion_revision` 与 generation。新一代 chunks 与 embedding 全部成功后原子切换为 READY；旧代结果随后清理，失败代不能污染当前 READY 结果。

对象生命周期固定为：最新兼容的 ACCEPTED ParsedDocument 保留用于重新分块或重新 Embedding；同 revision 的相同 payload 重放所产生的多余对象标记 `SUPERSEDED` 并异步删除；新 revision 成功 READY 后，旧派生对象异步删除、元数据标记 `SUPERSEDED` 并记录 `object_deleted_at`，最少保留 30 天诊断信息后再清理。`REJECTED` 和未完成 `UPLOADING` 对象由定时任务清理，不能无限形成 MinIO 孤儿。

Source 新增服务端生成、客户端只读的 `ingestionRevision`。Asset 替换、需要重新端侧解析的 schema/model 变化或显式“重新解析”会轮换 revision；单纯重新分块/Embedding 不轮换 revision，而是复用最新兼容的 ACCEPTED ParsedDocument 创建新 chunk generation。

### 6.3 Source 状态

FILE Source 使用：

```text
AWAITING_CLIENT → VALIDATING → INDEXING → READY | FAILED
```

TEXT 与 URL Source 继续使用：

```text
PENDING → PARSING → INDEXING → READY | FAILED
```

`AWAITING_CLIENT` 长度不超过现有 `VARCHAR(16)`，但仍需迁移 Source 状态 CHECK；`VALIDATING` 也只存在于 Source，不写入 `ingestion_jobs.status`。FILE Source 创建、Asset 更新和缺少兼容 ParsedDocument 的 reingest 不发布现有 `SourceIngestionRequestedEvent`，也不创建服务端解析 job；只有 ParsedDocument complete 被接受后才创建 indexing job。TEXT 与 URL 保持现有事件与解析器路径。

现有 `POST /api/sources/{id}/reingest` 对已有成功 ParsedDocument 的 FILE Source 复用该派生对象，不要求再次 OCR。原 Asset 变化、解析 schema 不兼容或用户选择“重新解析”时轮换 revision 并回到 `AWAITING_CLIENT`。迁移既有数据时：有活动 chunks 的 READY FILE Source 保持 READY；未 READY 的 FILE Source 分配 revision 并转为 `AWAITING_CLIENT`；历史 FILE 若无 ParsedDocument，下一次 reingest 必须先由 PC 重新解析。

## 7. 客户端任务与本地缓存

本地 `document_processing_jobs` 至少保存：

- 当前用户、设备、Source、Asset；
- 当前 `ingestionRevision`；
- 任务 phase、进度、已完成页/块、尝试次数；
- parser/model/schema 版本与内容哈希；
- 加密 payload 路径及服务器接收凭证；
- 安全错误码、创建和更新时间。

任务状态：

```text
QUEUED
  → DOWNLOADING_SOURCE（仅恢复/跨设备需要）
  → EXTRACTING | OCR_RUNNING
  → PACKAGING
  → UPLOADING
  → SERVER_VALIDATING
  → SERVER_INDEXING
  → READY
```

错误终态为 `FAILED_LOCAL` 或 `FAILED_SERVER`；等待网络是可恢复暂停原因，不是失败终态。应用关闭时活动任务转为可恢复状态；Sidecar 崩溃从最近完成页继续；上传中断保留加密 payload 并续传；自动重试达到上限后等待用户从个人中心手动重试。

ParsedDocument 缓存位于 Tauri 应用私有目录。复用当前 `crypto.rs` 已建立的 OS keyring 主密钥，不再创建第二套独立 DPAPI 密钥；Windows MSI 验收时必须确认 keyring 在目标系统的 Credential Manager/用户边界行为。新增面向大文件的分块 AES-256-GCM envelope：每块使用唯一 nonce，AAD 固定绑定 `userId`、`deviceId`、`sourceId`、`jobId`、`ingestionRevision` 与 `schemaVersion`，写入临时文件并在完整校验后原子替换。

当前一次性字符串加解密命令不能用于 ParsedDocument。新 Rust 文件接口必须流式写入、读取、gzip 和上传，不把整份明文或解密后的文件路径返回 Vue；SQLite 只保存任务元数据，不保存正文。Office 文字仅以有界批次短暂经过 Vue→Rust 命令边界，OCR 结果由 Rust 直接写入加密缓存。上传由 Rust 使用服务端签发的 URL 和限定 headers 流式解密发送，避免在 WebView 中重建整份 payload。

服务端 complete 确认接收后删除本地正文；退出登录、Source 删除和原 Asset 替换时清理相关正文、临时页图与失效任务。崩溃残留临时文件在下次启动按 owner/job 元数据清扫，解密失败不得降级读取或保留明文副本。

## 8. 阅读工作区交互

### 8.1 状态呈现

原文件完成上传并创建 Source 后立即显示和允许预览。文件列表只显示状态点：处理中为动态状态点，失败为持续异常点，READY 后状态点消失。阶段、百分比、错误与重试统一放在个人中心“文档解析”任务中心。

进度不能伪造精确值：PDF、图片和可枚举页数的 OCR 显示 `已完成页/总页数` 与确定百分比；Office renderer 在总块数未知时只显示阶段型不确定进度，提取完成并进入打包/上传后才显示可计算比例。个人中心同时显示当前阶段、最近更新时间和是否等待网络/服务端。

当前 Source 非 READY 时，任何当前文件 AI 操作都被阻止，并显示带“前往个人中心”和“取消”的弹窗。服务端同时校验 READY，不能只依赖客户端禁用。

### 8.2 会话

- 每次进入学科工作区新建空白会话。
- 每次切换当前文件新建空白会话。
- 不恢复或展示历史会话入口。
- 阅读会话创建时标记 `purpose=READING_SESSION` 并绑定当前 Source；不出现在普通历史会话列表。
- 当前打开期间保留多轮上下文；超过 Provider 上下文预算时从最早已完成轮次开始裁剪。
- 失败、取消或未完成的 Assistant 消息不进入后续提示词。
- 切换文件、离开工作区或注销时客户端 best-effort 软删除当前阅读会话；服务端每日清理超过 24 小时无活动的 `READING_SESSION`，处理崩溃或断网遗留。普通会话不受该清理规则影响。

### 8.3 文本选区

原生可选文本提供：

- “解释”：直接提交结构化 selection context 与解释指令；
- “提问”：把选区放入输入框上下文，等待用户补充问题；
- “保存知识块”：打开确认编辑器并以选区原文预填正文。

selection text 通过独立字段传输，不拼接进用户可见消息，也不能关联当前 Source 以外的资料。

`selectionText` 是客户端提供的用户上下文，服务端无法证明它确实来自当前文件。它受长度和字符校验，只进入 prompt 的“用户选区”区域，不参与向量命中、引用生成或资料事实证明；保存知识块时仍只能关联当前 owner-scoped Source/Subject。

### 8.4 回答与知识块

AI 回答提供复制和“保存为知识块”。引用事件在界面中只聚合为去重文件名，不显示页码、excerpt、similarity、chunk id 或跳转入口。

保存动作打开确认编辑器：标题默认由回答首段生成，正文预填 AI 回答，标签为空或使用已确认建议；用户可修改全部内容。确认后调用现有 KnowledgeBlock 创建接口，自动带入当前 `subjectId` 与 `sourceId`。AI 不直接写入领域数据。

## 9. 检索与提示词

AI 消息增加可选的结构化 `readingContext`：

```json
{
  "currentSourceId": "uuid",
  "subjectId": "uuid",
  "retrievalMode": "AUTO",
  "selectionText": "optional text"
}
```

PC 当前文件检索请求必须提供完整 `readingContext`；不启用当前文件检索的普通聊天可以省略，避免破坏 Mobile/Tablet 现有普通问答。服务端验证 Source/Subject/用户归属关系和 Source READY 状态。

兼容语义固定如下：携带 `readingContext` 时启用本设计的当前 Source→当前 Subject 严格策略；未携带时保留现有普通聊天契约，不套用阅读工作区升级规则。PC 学科工作区禁止用“把文件名拼进 message”替代 `readingContext`；其他现有聊天入口是否启用通用检索由各自 UI 明确决定，本设计不隐式改变其范围。

### 9.1 两阶段检索

第一阶段只检索 `currentSourceId`。满足任一条件时，第二阶段检索同 `subjectId` 下其他 READY Source：

- 明确出现其他资料、课堂笔记、教材、本学科等跨文件表达；
- 出现比较、结合、综合、分别等多来源表达；
- 命中当前学科内另一 Source 的标题；
- 当前 Source 无命中、命中不足或最高相似度低于配置阈值。

判定由服务端 `ScopeEscalationPolicy` 完成，不调用大模型自由决定范围。Source 标题匹配使用 Unicode/空白/大小写规范化后的确定性包含或完整短语匹配，不使用无边界模糊匹配；过短标题进入停用规则，避免常见词误触发。阈值、最少命中数和停用规则配置化，并用固定问题集校准。

升级原因持久化为稳定枚举：`EXPLICIT_CROSS_FILE`、`SUBJECT_SOURCE_TITLE_MATCH` 或 `INSUFFICIENT_CURRENT_RESULTS`。第二阶段排除已删除、未 READY 和其他 Subject 的 Source，与第一阶段结果去重后统一重排。扩大范围不显示额外 UI；实际使用的其他文件通过回答末尾的来源文件名体现。任何异常或规则无法判定时保持当前 Source，不能回退到用户全库。

### 9.2 Prompt 组装

Provider 输入顺序固定为：

1. 系统规则；
2. 当前会话已完成历史消息；
3. 可选当前选区；
4. 本次检索资料块；
5. 当前用户问题。

系统规则要求当前文件优先、资料事实必须基于检索证据、一般知识与文档观点明确区分、资料不足时直说。模型不自行生成引用元数据；引用由服务端实际检索结果生成。服务端持久化真实检索范围、升级原因和来源块供诊断，PC 只显示文件名。

## 10. 安全与错误处理

- 所有 ParsedDocument、检索与知识块请求必须执行 owner scope；客户端提交的 Source/Subject 关系不可信。
- 预签名 URL 只允许上传到服务端生成的用户私有 object key，并固定 Content-Type、Content-Length 与内容哈希。
- ParsedDocument 按不可信输入处理，限制解压比例、层级、block 数、文本长度和字符编码，拒绝 HTML/脚本执行。
- Sidecar 只接受 Rust 生成的任务标识和私有工作路径；模型目录只读。
- Rust 启动 Sidecar 前核对可执行文件与模型清单 SHA-256；协议输出超过大小限制、超时、页号错位或 JSON 畸形时终止当前任务并按安全错误处理。Vue capability 仍不授予通用 shell/fs/http。
- 日志与遥测不得记录正文、selection text、API key、签名 URL 或完整本地路径。
- 解析、OCR、上传、验证、Embedding 和 Provider 错误使用分层稳定错误码；用户界面只显示安全说明。
- Source 删除或 Asset 更新必须使旧 generation 失效，迟到请求不得恢复或覆盖已删除/新版本数据。
- 发布产物生成 SBOM/第三方清单，覆盖 RapidOCR、ONNX Runtime、Python/PyInstaller 依赖、OCR 模型和 File Viewer/legacy PPT renderer 的许可证与水印要求；许可证不明确的依赖不得进入正式 MSI。

## 11. 验证与验收

### 11.1 自动化验证

PC/Tauri 覆盖：

- PDF 文字页、扫描页和混合页分类；
- DOC/DOCX、PPT/PPTX、TXT 原生提取、Office fallback 和图片 OCR；
- 离屏解析宿主在用户未打开文件、切换预览和应用重启后的串行恢复；
- 页级恢复、Sidecar 崩溃、断网上传续作、缓存删除和版本迁移；
- 分块加密完整性、AAD owner/revision 错配拒绝和无明文落盘；
- 状态点、非 READY 弹窗、个人中心任务、选区菜单；
- 来源只显示文件名；
- 知识块确认编辑和 Source/Subject 关联。

后端覆盖：

- upload-intent、complete、真实对象校验、Asset 空哈希回填、幂等、同 revision 冲突与过期结果拒绝；
- FILE 与 TEXT/URL 事件分流、既有 FILE 状态迁移和无重复 ingestion job；
- 压缩炸弹、超限数据、畸形 schema 和跨用户访问；
- ingestion generation 原子切换、失败重试与 reingest；
- 当前 Source 检索、三类升级原因、标题停用规则、普通聊天兼容和永不跨 Subject；
- 多轮历史裁剪、失败消息排除和引用来源一致性；
- 阅读会话隐藏、离开时软删除和 24 小时遗留清理；
- PostgreSQL/pgvector 与 MinIO Testcontainers。

### 11.2 安装与人工验收

- 在干净 Windows 10/11 x64 环境安装正式 MSI。
- 断网启动并完成中文图片/扫描 PDF OCR，证明模型和 Runtime 已随包发布。
- OCR 固定夹具至少覆盖清晰中文、中文/英文/数字混排、旋转、低对比和混合型 PDF。清晰中文夹具按统一 Unicode、空白和标点规范化后计算字符错误率，准确率不低于 90%；其他夹具在技术验证阶段记录基线，并把确认后的结果固化为回归预算。
- 分别记录 MSI 增量体积、Sidecar 冷启动/模型预热、标准夹具每页耗时和峰值 RSS。技术验证阶段先测量再锁定回归上限，后续不得以未测量的主观阈值声明性能通过。
- 用 DOC、DOCX、PPT、PPTX 真实固定样本验证顺序、非空文本和 fallback；仅能预览但无法形成可靠文本的格式不算完成。
- 在安装与 OCR 全程监控网络请求，证明模型、Runtime 和许可证均来自安装包且运行时无下载。
- 验证应用关闭后的恢复、服务端不可用后的续传和个人中心手动重试。
- 验证当前文件优先、静默学科升级、来源文件名、无回跳和知识块确认保存。

构建通过、自动测试通过、真实依赖联调和 GUI/业务验收必须分别记录，不能互相替代。

## 12. 首期非目标

- PC Web 发布；
- Mobile/Tablet 本地 OCR 与深度阅读改造；
- Excel、未知格式或超过现有限制的文件；
- GPU、DirectML 或 CUDA；
- OCR 文本覆盖层；
- 引用页码、摘录、区域定位或原文回跳；
- 跨学科、全局知识库或其他用户检索；
- 历史 AI 会话恢复；
- 模型运行时下载、热更新或多模型选择。

## 13. 实施顺序约束

详细实施计划必须至少按以下依赖顺序拆分：

1. Phase 0 技术验证：Windows x64 MSI 的 `externalBin/resources` 离线打包、精确依赖/模型清单、长驻 Sidecar、无网络启动与固定 OCR 性能基线；
2. Phase 0 格式验证：离屏 `BackgroundParserHost`，DOC/DOCX/PPT/PPTX chunks/anchors 与 Canvas OCR fallback 能力矩阵；任一批准格式无可靠路径时先关闭技术缺口，不继续伪装支持；
3. ParsedDocument schema、`ingestionRevision`、客户端任务数据库和 Tauri 有界安全命令；
4. 原生提取、PDF 页分类、OCR、分块加密缓存、Rust 流式上传与恢复；
5. ParsedDocument 服务端契约、Asset 哈希回填、Source 状态/事件分流、并发仲裁、派生表与 ingestion generation；
6. current Source 检索、确定性 Subject 升级、普通聊天兼容和 selection 信任边界；
7. PC 状态点、阶段型任务中心、非 READY 弹窗和选区操作；
8. 阅读会话生命周期、多轮 Prompt、来源文件名和知识块确认保存；
9. 端到端、迁移、SBOM/许可证、安装包、性能与人工验收。

前两项是硬门禁。在正式 MSI 可离线调用 Sidecar 与固定模型、且所有批准 Office 格式至少有一条可靠解析路径前，不开始大规模 UI 或服务端实现，也不扩大到 Mobile/Tablet 或 GPU 优化。

## 14. 外部技术依据

- [Tauri 2 Resources](https://v2.tauri.app/develop/resources/)
- [Tauri 2 Sidecar](https://v2.tauri.app/develop/sidecar/)
- [RapidOCR 安装与 Runtime 说明](https://rapidai.github.io/RapidOCRDocs/main/install_usage/rapidocr/install/)
- [RapidOCR 参数与 PP-OCRv6 支持](https://rapidai.github.io/RapidOCRDocs/latest/install_usage/rapidocr/parameters/)
- [PP-OCRv6 Introduction](https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv6/PP-OCRv6.html)
- [PaddleOCR OCR Pipeline](https://www.paddleocr.ai/main/en/version3.x/pipeline_usage/OCR.html)
- [ONNX Runtime Execution Providers](https://onnxruntime.ai/docs/execution-providers/)
- [RapidOCR](https://github.com/rapidai/rapidocr)

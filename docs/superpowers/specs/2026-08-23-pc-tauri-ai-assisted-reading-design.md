# PC Tauri AI 辅助阅读全流程设计

日期：2026-08-23

状态：已批准，计划中，尚未实现

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
    │
    └─ DocumentParser：统一解析门面
          ├─ NativeTextAdapter
          ├─ PdfPageClassifier
          └─ OcrAdapter
                 │ typed Tauri command
                 ▼
          Tauri Rust JobController
                 │
                 ▼
          auralis-ocr.exe sidecar
          RapidOCR + ONNX Runtime CPU
          + PP-OCRv6-small
                 │
                 ▼
          加密 ParsedDocument 缓存
                 │ 预签名上传 + complete
                 ▼
Spring Boot：校验 → chunk → embedding → pgvector → RAG → SSE
```

### 3.1 PC 边界

- Vue 负责阅读交互、现有 File Viewer 适配、文本选区和任务状态展示。
- `DocumentParser` 是唯一的格式解析入口，向上只返回统一 ParsedDocument 或结构化错误。
- Tauri Rust 负责受控命令、任务持久化、加密缓存、Sidecar 生命周期、上传续作和清理。
- Vue 不获得通用 Shell 能力，也不能传入任意可执行文件、输入路径或输出路径。
- 应用运行时后台处理；应用关闭时保存安全检查点，下次启动恢复，不承诺退出后继续驻留运行。

### 3.2 OCR 交付边界

- 首期固定使用 `auralis-ocr.exe` Windows x64 Sidecar、RapidOCR、ONNX Runtime CPU 与 PP-OCRv6-small。
- Sidecar 和模型通过 Tauri `bundle.resources` 随安装包发布，模型版本与应用版本绑定。
- Sidecar 使用受控 JSON 标准输入输出协议，不监听本地端口。
- 首期不启用 DirectML、CUDA、GPU 探测、模型热更新或首次使用下载。

### 3.3 服务端边界

- FILE Source 的 PDF、Office、图片和文本文件统一接收客户端 ParsedDocument，不再尝试服务端 OCR。
- TEXT 与 URL Source 保持现有服务端解析路径。
- 服务端是用户归属、Source/Subject 关系、解析代际、索引状态和检索范围的最终权威。
- ParsedDocument 是非同步派生资源，不进入普通 Source/Knowledge/Task Sync。

## 4. 文件解析策略

| 文件类型 | 首期策略 |
| --- | --- |
| TXT、Markdown 及其他已支持文本预览 | 原生文本提取 |
| DOC/DOCX | 复用 File Viewer 的 document chunks/anchors 输出 |
| PPT/PPTX | 复用 File Viewer 的 document chunks/anchors 输出 |
| 文字型 PDF | PDF.js 按页提取文字 |
| 扫描型 PDF | PDF.js 按页渲染后调用 OCR |
| 混合型 PDF | 每页判断；文字充分的页原生提取，其他页 OCR |
| 图片 | 调用 OCR |

PDF 页分类使用确定性规则，综合文字字符数、有效字符比例和页面覆盖信号。阈值必须配置化并以固定夹具测试。OCR 一次只渲染和处理一页，完成后释放位图；默认渲染质量以清晰中文扫描件为基线，不把整份 PDF 同时载入内存。

原生格式可在阅读器中提供选区交互；OCR 结果只用于 RAG，不回写预览器，不生成隐藏或可见文本覆盖层。

## 5. ParsedDocument 契约

客户端统一生成 gzip 压缩的 UTF-8 JSON：

```json
{
  "schemaVersion": 1,
  "sourceId": "uuid",
  "sourceAssetSha256": "hex-sha256",
  "parser": {
    "id": "file-viewer | pdfjs | pp-ocr",
    "version": "string",
    "ocrModelVersion": "PP-OCRv6-small | null"
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
- `sourceAssetSha256` 必须匹配 Source 当前绑定 Asset，旧文件的解析结果不能覆盖新文件。

## 6. API 与持久化设计

### 6.1 ParsedDocument 上传

新增：

```text
POST /api/sources/{sourceId}/parsed-documents/upload-intents
POST /api/sources/{sourceId}/parsed-documents/{parsedDocumentId}/complete
```

upload-intent 请求包含 `schemaVersion`、`parserId`、`parserVersion`、可选 `ocrModelVersion`、`sourceAssetSha256`、`payloadSha256` 和 `sizeBytes`。响应沿用现有 Asset 预签名风格，返回 `parsedDocumentId`、私有上传 URL、限定 headers 与过期时间。

complete 不接受客户端对象元数据。服务端对固定 object key 执行 HEAD/stat，验证真实大小、类型、哈希、Source/Asset 关系和当前用户归属，再流式解压并校验结构。相同 ParsedDocument 的 complete 重放返回同一接收结果，不重复创建索引代际。

### 6.2 服务端派生数据

新增 `parsed_documents`，至少记录：

- `id`、`user_id`、`source_id`；
- 当前 Asset 哈希；
- schema、parser、OCR model 版本；
- 私有 object key、payload 哈希、大小；
- `status`、`created_at`、`accepted_at`；
- 对应 ingestion generation。

`ingestion_jobs` 关联被接受的 `parsed_document_id` 与 generation。新一代 chunks 与 embedding 全部成功后原子切换为 READY；旧代结果随后清理，失败代不能污染当前 READY 结果。最新成功的 ParsedDocument 保留用于重新分块或重新 Embedding，旧 ParsedDocument 在成功切换后异步删除。

### 6.3 Source 状态

FILE Source 使用：

```text
AWAITING_PARSED_DOCUMENT → VALIDATING → INDEXING → READY | FAILED
```

TEXT 与 URL Source 继续使用：

```text
PENDING → PARSING → INDEXING → READY | FAILED
```

现有 `POST /api/sources/{id}/reingest` 对已有成功 ParsedDocument 的 FILE Source 复用该派生对象，不要求再次 OCR。原 Asset 变化、解析 schema 不兼容或本地校验失败时才创建新解析任务。

## 7. 客户端任务与本地缓存

本地 `document_processing_jobs` 至少保存：

- 当前用户、设备、Source、Asset；
- 任务 phase、进度、已完成页/块、尝试次数；
- parser/model/schema 版本与内容哈希；
- 加密 payload 路径及服务器接收凭证；
- 安全错误码、创建和更新时间。

任务状态：

```text
QUEUED
  → EXTRACTING | OCR_RUNNING
  → PACKAGING
  → UPLOADING
  → SERVER_INDEXING
  → READY
```

错误终态为 `FAILED_LOCAL` 或 `FAILED_SERVER`。应用关闭时活动任务转为可恢复状态；Sidecar 崩溃从最近完成页继续；上传中断保留加密 payload 并续传；自动重试达到上限后等待用户从个人中心手动重试。

ParsedDocument 缓存位于 Tauri 应用私有目录，使用 AES-GCM 加密，设备密钥由 Windows DPAPI 保护。SQLite 不保存正文。服务端 complete 确认接收后删除本地正文；退出登录、Source 删除和原 Asset 替换时清理相关正文、临时页图与失效任务。

## 8. 阅读工作区交互

### 8.1 状态呈现

原文件完成上传并创建 Source 后立即显示和允许预览。文件列表只显示状态点：处理中为动态状态点，失败为持续异常点，READY 后状态点消失。阶段、百分比、错误与重试统一放在个人中心“文档解析”任务中心。

当前 Source 非 READY 时，任何当前文件 AI 操作都被阻止，并显示带“前往个人中心”和“取消”的弹窗。服务端同时校验 READY，不能只依赖客户端禁用。

### 8.2 会话

- 每次进入学科工作区新建空白会话。
- 每次切换当前文件新建空白会话。
- 不恢复或展示历史会话入口。
- 当前打开期间保留多轮上下文；超过 Provider 上下文预算时从最早已完成轮次开始裁剪。
- 失败、取消或未完成的 Assistant 消息不进入后续提示词。

### 8.3 文本选区

原生可选文本提供：

- “解释”：直接提交结构化 selection context 与解释指令；
- “提问”：把选区放入输入框上下文，等待用户补充问题；
- “保存知识块”：打开确认编辑器并以选区原文预填正文。

selection text 通过独立字段传输，不拼接进用户可见消息，也不能关联当前 Source 以外的资料。

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

### 9.1 两阶段检索

第一阶段只检索 `currentSourceId`。满足任一条件时，第二阶段检索同 `subjectId` 下其他 READY Source：

- 明确出现其他资料、课堂笔记、教材、本学科等跨文件表达；
- 出现比较、结合、综合、分别等多来源表达；
- 命中当前学科内另一 Source 的标题；
- 当前 Source 无命中、命中不足或最高相似度低于配置阈值。

判定由服务端 `ScopeEscalationPolicy` 完成，不调用大模型自由决定范围。第二阶段排除已删除、未 READY 和其他 Subject 的 Source，与第一阶段结果去重后统一重排。扩大范围不显示额外 UI；实际使用的其他文件通过回答末尾的来源文件名体现。

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
- 日志与遥测不得记录正文、selection text、API key、签名 URL 或完整本地路径。
- 解析、OCR、上传、验证、Embedding 和 Provider 错误使用分层稳定错误码；用户界面只显示安全说明。
- Source 删除或 Asset 更新必须使旧 generation 失效，迟到请求不得恢复或覆盖已删除/新版本数据。

## 11. 验证与验收

### 11.1 自动化验证

PC/Tauri 覆盖：

- PDF 文字页、扫描页和混合页分类；
- DOC/DOCX、PPT/PPTX、TXT 原生提取和图片 OCR；
- 页级恢复、Sidecar 崩溃、断网上传续作、缓存删除和版本迁移；
- 状态点、非 READY 弹窗、个人中心任务、选区菜单；
- 来源只显示文件名；
- 知识块确认编辑和 Source/Subject 关联。

后端覆盖：

- upload-intent、complete、真实对象校验、幂等与过期结果拒绝；
- 压缩炸弹、超限数据、畸形 schema 和跨用户访问；
- ingestion generation 原子切换、失败重试与 reingest；
- 当前 Source 检索、三类升级触发、永不跨 Subject；
- 多轮历史裁剪、失败消息排除和引用来源一致性；
- PostgreSQL/pgvector 与 MinIO Testcontainers。

### 11.2 安装与人工验收

- 在干净 Windows 10/11 x64 环境安装正式 MSI。
- 断网启动并完成中文图片/扫描 PDF OCR，证明模型和 Runtime 已随包发布。
- 固定清晰中文扫描夹具归一化字符准确率不低于 90%。
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

1. Windows Sidecar + PP-OCRv6-small 离线打包与固定夹具技术验证；
2. ParsedDocument schema、客户端任务数据库和 Tauri 安全命令；
3. 原生提取、PDF 页分类、OCR、加密缓存与恢复；
4. ParsedDocument 服务端契约、对象校验、派生表与 ingestion generation；
5. current Source 检索和确定性 Subject 升级；
6. PC 状态点、任务中心、非 READY 弹窗和选区操作；
7. 多轮 Prompt、来源文件名和知识块确认保存；
8. 端到端、安装包和人工验收。

在第一项证明正式 MSI 可离线调用 Sidecar 与模型前，不扩大到 Mobile/Tablet 或 GPU 优化。

## 14. 外部技术依据

- [Tauri 2 Resources](https://v2.tauri.app/develop/resources/)
- [Tauri 2 Sidecar](https://v2.tauri.app/develop/sidecar/)
- [PP-OCRv6 Introduction](https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv6/PP-OCRv6.html)
- [PaddleOCR OCR Pipeline](https://www.paddleocr.ai/main/en/version3.x/pipeline_usage/OCR.html)
- [ONNX Runtime Execution Providers](https://onnxruntime.ai/docs/execution-providers/)
- [RapidOCR](https://github.com/rapidai/rapidocr)

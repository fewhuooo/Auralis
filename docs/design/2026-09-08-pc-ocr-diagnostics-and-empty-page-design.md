# PC OCR 诊断与空白页容错设计

更新时间：2026-09-08

文档状态：已批准设计（含累计统计、上传恢复与 schema v1 打包增量）

## 背景

真实 `docs/test/1.pdf` 的第一页渲染图可由当前 RapidOCR sidecar 正常识别为 6 行，约耗时 1.8 秒；现有失败 `OCR_TEXT_EMPTY` 因 `DocumentParser` 将任意单页空识别结果直接作为整份文档的本地失败。错误仅保存稳定码，未携带页码、总页数、图片大小、耗时或行数，Profile 只能展示一行摘要，重复重试会在同一页确定性失败。

## 方案比较

1. 只增加终端日志：实现最小，但普通用户无法查看，且任务记录重启后没有诊断。
2. 只把更多文本拼入 `errorDetail`：可持久化并展示，但无法表达进行中的逐页进度，也不适合后续复制诊断。
3. 采用有界结构化页级诊断，并在 UI 展开/复制：同时覆盖运行中进度、失败定位和隐私边界。选择此方案。

## 行为设计

- OCR 调用结果保留 `pageNumber`、`timingMs` 和识别行数；解析器知道 PDF/Office 总页数。
- 每次 OCR 开始前更新本地任务为 `OCR_RUNNING`，checkpoint 记录正在处理的页码；成功后再推进 block ordinal。
- 单页归一化文本为空时，不再终止整份文档。该页记为安全警告并继续，避免封面背面、分隔页等空白页导致全局失败。
- 整份文档结束时若没有产出任何内容块，返回 `OCR_DOCUMENT_EMPTY`；这与“个别空白页”区分。
- 失败详情至少包含稳定错误码、当前页/总页数、原始行数、归一化行数、OCR 总耗时和重试次数。运行中显示“正在识别第 X/Y 页”。
- Profile 文档处理中心保留简短状态行，增加可展开的“诊断详情”和“复制诊断”操作。复制内容来自安全结构化数据。

## 日志与隐私

- Rust/sidecar 每页只记录任务 ID、页码、图片字节数、结果状态、行数、耗时和稳定错误码。
- 不记录 OCR 正文、PDF 内容、Authorization、签名 URL、完整原始文件路径或模型文件内容。
- stderr 继续使用既有 20 行有界尾部；页面级诊断同样保持有界，不能形成无限增长日志。
- 前端诊断详情持久化在现有任务 `error_detail`/checkpoint JSON 边界内，不新增同步字段或服务端 API。

## 组件边界

- `OcrAdapter`：返回现有协议中已经存在的 timing 信息，不解释业务空页。
- `DocumentParser`：决定空页继续、整份文档为空失败，并产生页级进度/诊断事件。
- `DocumentJobRunner`：将进度事件原子写入任务 phase/checkpoint，并在失败时保存安全详情。
- `DocumentProcessingCenter`：展示并复制诊断，不自行推断 OCR 状态。
- Rust supervisor：输出安全的请求/响应摘要，继续管理 sidecar 生命周期和 stderr 尾部。

## 累计统计与阶段分组增量

真实 50 页文档完成本地解析后，现有诊断展示 `页码 50/50`、`原始行数 35`、`规范化行数 35`。这里的 `35` 实际只来自最后一个 OCR 页事件，并非整份文档累计数量；上传因网络暂停后，最后一页 OCR 快照又与 `NETWORK_OFFLINE` 同组展示，容易被理解为“OCR 只识别了 35 行并且发生网络错误”。本增量采用方案 B：同时保留本页诊断和文档级累计统计，并把当前上传错误与已完成的 OCR 摘要分组。

### 统计口径

- “文档页码”继续表示当前或最近处理的真实页码，例如 `50/50`。
- 单页字段明确命名为“本页原始行数”“本页规范化行数”“本页图片大小”“本页耗时”，不再暗示整份文档总量。
- 文档级累计只统计实际进入 OCR 的页：`ocrProcessedPages`、`ocrTextPages`、`ocrEmptyPages`、`totalRawLineCount`、`totalNormalizedLineCount`。文本层直接提取的页不计入 OCR 页数或 OCR 行数；总文档页数仍由 `totalPages` 表示。
- `ocrProcessedPages = ocrTextPages + ocrEmptyPages`；累计行数是每个已完成 OCR 页结果的加总。开始识别但尚未返回的页不计入累计完成页。
- 累计值由单次 parser 执行按页结果生成，runner 持久化事件中的权威快照，不在 UI 中从最后一页数据推算。自动重试重新开始解析时累计从零开始，避免重复计数；同一页的中间事件不得增加累计值。
- checkpoint sanitizer 对新增累计值继续采用非负有限整数和明确上限；未知字段、负数、非有限值和越界值不进入 SQLite 或 browser localStorage。

### 阶段展示

- `OCR_RUNNING` 阶段显示当前页、本页数据和截至上一已完成页/当前已完成页的累计 OCR 摘要。
- `PACKAGING`、`UPLOADING`、`SERVER_VALIDATING`、`SERVER_INDEXING` 或 `PAUSED_NETWORK` 阶段，将累计 OCR 数据放在“本地 OCR 摘要”分组；当前 `errorCode/errorDetail` 放在“当前处理状态”分组。
- `NETWORK_OFFLINE` 表示解析结果上传等待网络，不得显示为 OCR 识别错误。简短状态文案应说明“本地解析已完成，等待网络继续上传”。
- 复制诊断保留两个显式分组及稳定字段名，仍不包含 OCR 正文、完整路径、Authorization、签名 URL 或未知原始字段。

### 实施任务拆分

1. 扩展 parser 进度事件与 checkpoint 类型，生成幂等的文档级 OCR 累计快照，并为混合文本层/OCR、空页、重试起点补充测试。
2. 在 runner、SQLite 映射和 browser localStorage 边界持久化并清洗累计值，证明最后一页事件和后续上传暂停不会丢失累计摘要。
3. 调整 formatter/Profile 处理中心，把单页字段改为“本页”口径，将 OCR 摘要与上传/网络状态分组，并覆盖可执行 formatter/clipboard 测试。
4. 运行 PC 聚焦测试、R4、type-check 和 diff 检查；真实 Tauri 使用 `1.pdf` 核对累计数值、网络暂停文案和复制内容。Rust sidecar 协议与页级日志无需因此修改。

## 上传恢复与传输诊断增量

真实运行证据表明 Backend 与 MinIO 容器均为 healthy，宿主机 `127.0.0.1:8080` 和 `127.0.0.1:9000` 返回 200；Server 已为当前 Source 创建 `parsed_documents` 的 `UPLOADING` 记录，但对应 MinIO 对象尚不存在。因此首次暂停发生在 Tauri 使用预签名 URL 执行对象 PUT 的阶段，不是 OCR、上传意图或服务未启动。

点击“继续”后，`SourceJobScheduler.retry()` 先把 `PAUSED_NETWORK` 改成 `QUEUED`；检测到已有加密 payload receipt 后再进入 `UPLOADING`。该恢复路径是既有代码的明确意图，但生产状态表缺少 `QUEUED -> UPLOADING`，导致真正重试 PUT 之前被 `DOCUMENT_JOB_ILLEGAL_TRANSITION` 阻断。

### 状态机修复

- 对拥有有效 `payloadReceipt` 的任务，允许 `QUEUED -> UPLOADING`；无 receipt 的普通 `QUEUED` 任务仍进入下载/解析路径。
- `PAUSED_NETWORK -> QUEUED -> UPLOADING` 用于用户显式重试，`PAUSED_NETWORK -> UPLOADING` 继续用于自动恢复；两条路径都不得重新 OCR、重新下载或重新哈希原始文件。
- 使用真实 `DocumentProcessingJobRepository` 状态规则补回归，不能只依赖不校验 transition 的 fake repository。
- 重试成功后沿现有 `UPLOADING -> SERVER_VALIDATING -> READY` 推进；失败仍保留 receipt 和 cache，以便再次恢复。

### 安全传输诊断

- 对外稳定错误码继续使用 `NETWORK_OFFLINE`，但 `errorDetail` 必须保留阶段和经过 allowlist 的传输原因：`connect`、`timeout`、`body`、`request`、`client` 或 `retryable-response`。
- Rust/Tauri 返回的 `NETWORK_OFFLINE:<reason>` 不得在 `errorCode()` 截断后彻底丢失；协调器只提取已知后缀，不展示任意异常文本、预签名 URL、headers、Authorization 或对象路径。
- HTTP 408/425/429/5xx 继续作为可重试响应处理，但详情应标为 `retryable-response`，不能误称为设备断网。
- Profile 的“当前处理状态”根据安全原因区分“连接失败”“请求超时”“传输中断”和“存储服务暂时拒绝”，同时明确本地 OCR 已完成。
- Tauri 开发终端继续保留现有 `[Document Upload] PUT failed: <stable diagnostic>`，不增加 URL 或敏感 header 日志。

### 修复验收

- repository 测试证明 `QUEUED -> UPLOADING` 合法，且其它未授权 transition 仍被拒绝。
- scheduler 测试使用真实 transition 规则证明：带 receipt 的暂停任务点击继续后直接调用 upload，OCR/download/hash 调用均为零。
- upload coordinator 测试分别覆盖 `NETWORK_OFFLINE:connect`、`NETWORK_OFFLINE:timeout`、`NETWORK_OFFLINE:body` 和 `DOCUMENT_UPLOAD_RETRYABLE`，断言稳定 code 与安全 detail，且不包含 URL/header。
- UI formatter 测试覆盖传输原因本地化及未知后缀降级，不渲染原始异常。
- 自动测试通过后，真实 Tauri 再点击“继续”，确认不再出现 `DOCUMENT_JOB_ILLEGAL_TRANSITION`；若 PUT 仍失败，以新详情确定 MinIO 传输原因。该验证不等同于最终上传成功验收。

## ParsedDocument schema v1 打包增量

真实重试已证明 MinIO PUT 成功、对象大小与 `payloadSha256` 和数据库完全一致，但 Server `complete` 返回 `400 PARSED_DOCUMENT_INVALID`。根因不是对象存储或 revision：PC Rust packager 当前把每个 block 直接写为 gzip NDJSON，而 Server `ParsedDocumentValidator` 的现行契约要求 gzip 内只有一个 schema v1 JSON object。Validator 读取 NDJSON 的首个 `ordinal` 字段时会以 `unknown or duplicate payload field: ordinal` 拒绝，因此不能通过放宽 Server 校验、重复 complete 或重新 PUT 解决。

### 方案选择

- 选择修正 PC 打包格式：Rust 流式产生 Server 已冻结的 schema v1 envelope，Server validator 保持严格、不增加 NDJSON 兼容分支。
- 不选择 Server 同时接受 NDJSON；这会把已确认错误的临时格式变成长期协议，并扩大未受顶层 metadata 约束的输入面。
- 不选择 Server 收到后转换 NDJSON；旧 payload 缺少可信的顶层 Asset hash、parser metadata、字符数和正文 hash，无法在不伪造数据的前提下补全。

### 上传 JSON 契约

解密 cache 后的 gzip 内容必须是且只能是一个 JSON object：

```json
{
  "schemaVersion": 1,
  "sourceId": "<uuid>",
  "ingestionRevision": "<uuid>",
  "sourceAssetSha256": "<64 lowercase hex>",
  "parser": {
    "id": "<non-empty parser id>",
    "version": "<non-empty parser version>",
    "normalizationVersion": "<non-empty normalization version>",
    "ocrModelVersion": null
  },
  "blocks": [
    {
      "ordinal": 0,
      "kind": "page",
      "text": "示例",
      "pageNumber": 1,
      "anchorIndex": null,
      "startLine": null
    }
  ],
  "characterCount": 2,
  "plainTextSha256": "<64 lowercase hex>"
}
```

- `blocks` 按连续零基 `ordinal` 流式写入，不在内存聚合整份正文；每个 block 只允许 `ordinal/kind/text/pageNumber/anchorIndex/startLine`。
- `characterCount` 是所有规范化 block 文本的 Unicode code point 数之和，不包含 block 间分隔换行。
- `plainTextSha256` 按 block 顺序对每个规范化 UTF-8 `text` 后追加一个字节 `\n` 计算，与 Server validator 完全一致。
- `userId/serverDeviceId/jobId/cacheId` 只用于本地加密 cache 的 owner/AAD 作用域，不进入上传 JSON。
- `sourceAssetSha256` 来自 scheduler 对真实 Asset bytes 的 SHA-256；不得为空、伪造或从 ParsedDocument payload 自身推导。

### 流式打包与 receipt 语义

- `document_package_begin` 接收本地 cache scope 与上传 envelope metadata。Gzip encoder 在 begin 写入 object prefix 和 `blocks` 数组开头；append 在 block 间写逗号并更新 code-point count/plain digest；finish 写入数组结尾、`characterCount/plainTextSha256` suffix，再完成 gzip 和本地 envelope 加密。
- `DocumentCacheReceipt` 增加明确的 `payloadFormat = parsed-document-v1` 以及恢复上传所需的 `sourceAssetSha256` 和 parser metadata。字段经 SQLite/browser sanitizer 持久化；不包含正文、路径、签名 URL、headers 或密钥。
- `payloadBytes/payloadSha256` 继续只描述解密 reader 输出的 gzip payload；`encryptedBytes` 只描述本地加密 envelope。Server intent `sizeBytes`、PUT `Content-Length`、reader 输出和发送后校验必须使用同一 payload 口径。
- 新 receipt 在首次 upload 和应用重启后的 resume 都从 receipt 自身恢复 Asset/parser metadata，不再以空对象调用 coordinator。

### 旧 NDJSON cache 处理

- 缺少 `payloadFormat` 或格式不是 `parsed-document-v1` 的 receipt 视为旧 NDJSON 派生缓存，禁止再次创建 intent、PUT 或 complete。
- 用户已批准方案 1；scheduler 可删除该任务对应的旧派生 cache，原子清空 `payloadCacheId/payloadReceipt`，回到 `QUEUED` 后重新下载/读取原始 Asset、校验 Asset hash、解析和打包。原始文件、Source、Asset 和服务端 REJECTED 审计行不删除。
- 旧格式失效属于一次性本地重建，不提供 NDJSON 转换器或双格式 reader。重建失败保留稳定本地错误与可重试任务，不伪装为上传失败。
- 已是 `parsed-document-v1` 的 receipt 继续直接续传，不重新 OCR、download、hash 或 package。

### 契约与恢复测试

- 新增共享 schema v1 JSON fixture。Rust 测试对实际 packager 的解密、解压结果做结构等价比较；Java validator 测试 gzip 同一 fixture 后必须接受，形成跨语言契约闭环。
- Rust 测试覆盖零/多 block（生产任务仍拒绝空文档）、Unicode code-point 计数、逐 block `text + \n` hash、可选位置字段、payload/encrypted bytes 分离以及临时文件清理。
- PC runner/scheduler/repository 测试覆盖 metadata 传入、receipt round-trip、重启续传不丢 Asset SHA、旧格式在任何 intent 前失效并只重建一次、新格式 receipt 不重复解析。
- Server validator 保留 unknown/duplicate field、hash/count/revision/Asset SHA 和大小边界测试；不得为通过 PC 产物而降低限制。
- 最终自动门禁包含 Rust packager/cache/upload、PC R4/type-check、Server validator/complete 定向测试和 `git diff --check`。真实验收必须重新启动 Tauri，用 `1.pdf` 观察旧 cache 触发一次重建、PUT、complete、indexing 和 Source `READY`；自动测试不等同该 GUI/外部服务结果。

## 测试与验收

- Node 单元测试先证明：含一个空白扫描页和一个有效页的文档继续完成；全部 OCR 页为空时才失败为 `OCR_DOCUMENT_EMPTY`；诊断包含页码/总页数/耗时/行数但不含正文和完整路径。
- Runner 测试证明 OCR 开始前即可看到 `OCR_RUNNING` 与当前页，而不是等待首个成功 block。
- 累计统计测试证明 50 页等多页输入不会把最后一页行数当作全文总数，空页计数与有效页计数相加等于已完成 OCR 页数，重试不会重复累计。
- UI 静态/组件测试证明详情可展开并复制，默认列表仍紧凑。
- Rust 测试证明每页摘要有界且不包含识别正文或完整图片路径。
- 运行 PC type-check、相关 Node 套件、Rust OCR 定向测试、`cargo check --lib` 与 `git diff --check`。
- 自动测试不代替真实 Tauri GUI：最终仍需用 `1.pdf` 确认逐页进度、空白页继续、复制诊断以及最终进入打包/上传阶段。

## “开始本机处理”启动观测增量

真实 GUI 在重新登录后仍可能停留于“等待桌面端处理”：点击按钮时没有行内错误、按钮状态变化或 Source API 请求，Network 只出现本地 SQLite 与同步 pull。当前组件只在 Promise 抛错时显示错误，并忽略 scheduler 的成功或 `SKIPPED` 返回值，因此无法区分点击未进入处理函数、同步尚未结束、本地 Source 未同步、scheduler 未挂载，以及服务端 Source 已离开 `AWAITING_CLIENT` 等静默路径。

### 范围与状态

- 本增量只增加 PC 手动启动入口的有界观测，不改变 Server、同步协议、OCR、打包或上传状态机。
- 每个 Source 保存一个仅内存启动状态：`IDLE`、`CLICKED`、`SYNCING`、`LOCAL_SOURCE_CHECK`、`SCHEDULING`、`COMPLETED`、`SKIPPED`、`FAILED`。离开页面或重新加载后可丢弃，不写 SQLite/localStorage。
- 点击处理函数的第一条同步语句必须写入 `CLICKED`，按钮立即禁用并显示“正在检查…”。后续每个异步边界前更新阶段，最终在 `finally` 恢复按钮可用，但保留最终摘要供用户查看。
- `resumeDocumentProcessing` 返回结构化启动结果，而不是丢弃 `SourceJobScheduler.schedule()` 的结果；组件显示 `READY/PAUSED_NETWORK/FAILED_LOCAL/FAILED_SERVER/SKIPPED` 及稳定 reason。`ALREADY_READY` 和 `SOURCE_NOT_AWAITING_CLIENT` 必须明确提示“服务端状态已变化，正在等待本地状态同步”，不能继续伪装为未点击。

### 安全日志与错误处理

- 开发控制台使用固定前缀 `[Document Start]`，只记录 Source ID、阶段、结果 status/reason 和耗时；禁止记录 token、Authorization、签名 URL、文件路径、OCR 正文、receipt 或任意服务端异常 body。
- 认证失效、scheduler 未挂载、本地 Source 不存在/未同步及同步失败使用稳定可操作中文提示；未知错误仍通过现有安全错误归一化，不能直接展开任意对象。
- 同一 Source 启动期间忽略重复点击；不同 Source 状态相互隔离。页面现有轮询不得清除启动结果或制造第二次启动。
- 本增量不把 `reportAllChanges/startTime` 注入脚本异常归因于 Auralis；仓库不存在该函数，仍作为外部 DevTools/扩展噪声单独排查。

### 测试与人工判定

- 组件/Store 测试使用可控 Promise 证明点击后立即进入 `CLICKED/SYNCING`，完成前按钮禁用，且每个边界按顺序可见。
- 测试覆盖认证失败、scheduler 缺失、本地 Source 未同步、scheduler `SKIPPED`、正常创建/恢复 job 和重复点击；断言安全日志不含 token、URL、路径、OCR 或 receipt。
- PC type-check、相关 UI/Store/runtime 套件、完整 R4 与 `git diff --check` 必须通过。
- 真实 Tauri 再点击一次：若连 `CLICKED` 都不可见，则事件被 WebView/注入脚本阻断；若停在某个阶段，则以该阶段定位下一层。该观测结果本身不等于文档已完成 OCR、上传或索引。

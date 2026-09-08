# PC OCR 诊断与空白页容错设计

更新时间：2026-09-08

文档状态：已批准设计（含累计统计增量）

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

## 测试与验收

- Node 单元测试先证明：含一个空白扫描页和一个有效页的文档继续完成；全部 OCR 页为空时才失败为 `OCR_DOCUMENT_EMPTY`；诊断包含页码/总页数/耗时/行数但不含正文和完整路径。
- Runner 测试证明 OCR 开始前即可看到 `OCR_RUNNING` 与当前页，而不是等待首个成功 block。
- 累计统计测试证明 50 页等多页输入不会把最后一页行数当作全文总数，空页计数与有效页计数相加等于已完成 OCR 页数，重试不会重复累计。
- UI 静态/组件测试证明详情可展开并复制，默认列表仍紧凑。
- Rust 测试证明每页摘要有界且不包含识别正文或完整图片路径。
- 运行 PC type-check、相关 Node 套件、Rust OCR 定向测试、`cargo check --lib` 与 `git diff --check`。
- 自动测试不代替真实 Tauri GUI：最终仍需用 `1.pdf` 确认逐页进度、空白页继续、复制诊断以及最终进入打包/上传阶段。

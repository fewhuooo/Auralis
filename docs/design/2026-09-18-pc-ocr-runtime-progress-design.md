# PC OCR 运行时页级进度恢复设计

更新时间：2026-09-18

文档状态：已批准设计，待实施

## 目标

恢复默认本地文件导入路径中的 OCR 页级进度数据传递。OCR 运行期间，现有处理状态界面应在不刷新页面的情况下继续使用既有“正在识别第 X/Y 页”展现方式。

## 已确认根因

默认导入先创建 Local Asset、Local Source draft，并由 `LocalParsedDocumentCoordinator` 执行本地解析。Parser 已产生 `pageNumber` 与 `totalPages`，`LocalParsedDocumentRepository` 也会持久化这些信息；但 `useDocumentProcessingStore` 只读取 `DocumentProcessingJobRepository`，因此 local-only OCR 记录没有进入 Pinia 和现有状态组件。

刷新或后续绑定服务端 revision 后会进入 server-backed Job 路径，但这不能提供 local-only OCR 运行期间的页级状态。

### 2026-09-18 进度闪烁补充

真机观察到 OCR 实际继续推进时，详情偶发短暂回退到“等待本机处理”。根因有两层：Local Parsed Document 的同一 `checkpointJson` 会依次记录 `before-recognize`、`after-recognize`、`after-normalize` 和 `page-result`，而页进度投影只接受 `before-recognize`；同时 Store 在异步读取 SQLite 前先清空旧投影。两者都会在下一次有效页起始事件到达前制造短暂空投影。

修复保持最近一次有效页进度：刷新期间不预先清空，读取成功后以新有效进度覆盖；处于 `OCR_RUNNING` 但最新事件为同页后续事件时，沿用该 Source 已有的有效页进度。记录退出 `OCR_RUNNING`、reader 被替换/解绑或新读取明确不再包含该 Source 时，仍按现有生命周期清理，不把旧进度保留到后续阶段。

## 设计

### 本地进度投影

- 保留 Parser 事件、SQLite schema、Local Parsed Document 和 Document Processing Job 的现有职责。
- 由 document processing runtime 向 `useDocumentProcessingStore` 提供 owner/device scoped 的 Local Parsed Document 只读入口。
- `useDocumentProcessingStore.refresh()` 同时刷新现有 Job 列表和活动 local-only OCR 记录。
- Store 将 `pageNumber` 映射为 UI 使用的 `currentPage`，并保留 `totalPages`；只投影当前用户和设备、尚未进入终态的记录。
- local-only 记录不伪装成服务端 `DocumentProcessingJob`，避免混淆重试、取消、上传和服务端状态语义。

### UI 消费

- 复用 Subject Workspace 和 Document Processing Center 已有的 1.5 秒刷新周期。
- 复用 Document Processing Center 已有的 OCR 诊断格式化与“正在识别第 X/Y 页”展示，不新增组件、入口、文案或状态样式。
- 文件状态点、Subject Workspace 布局、主题和动画保持现有行为。

### Source 投影可靠性验证

- 新增“READY realtime 事件缺失”测试，验证客户端是否仍能自动收敛到服务端最终状态。
- 新增“WebSocket 断线后重连”测试，验证重连是否补一次 read sync。
- 若现有实现已经收敛，只保留回归测试。
- 若测试证明不能收敛，只增加与处理中 Source 绑定的有限 reconciliation；不引入 Source 全量轮询，不重构 realtime、Store 或同步架构。

## 测试策略

先以失败测试固定以下行为，再实施最小生产修改：

1. local-only OCR 在 Parser 发出第 2/4 页事件后，Store 能在 server revision 建立前读到 `currentPage=2`、`totalPages=4`。
2. 现有处理状态展示在获得 local-only 进度后继续输出“正在识别第 2/4 页”。
3. 进入 server-backed Job 后，既有 Job 状态与操作行为不回归。
4. READY realtime 缺失和 WebSocket 重连分别具有明确的自动收敛结论。
5. `before-recognize → after-recognize → page-result` 的页内事件切换不会清空最近有效页进度；reader 延迟时刷新期间也不先清空旧投影。

验证范围包括聚焦测试、`test:r4-pc`、`type-check`、生产 build 与 `git diff --check`。自动测试不替代真实 Tauri OCR 运行验收。

## 范围边界

- 不修改公开 API、数据库 schema、MinIO、Server ingestion 或上传协议。
- 不合并 Local Parsed Document 与 Document Processing Job 两套持久化模型。
- 不重做 realtime、Store 或同步架构。
- 不处理与 OCR 页级进度无关的页面或技术债。

## 完成条件

- 默认本地导入路径在 OCR 运行期间无需刷新即可显示当前页和总页数。
- OCR 完成后继续进入现有同步、上传与 AI 处理阶段。
- Source 两项可靠性测试具有可复现结论；只有测试证明无法收敛时才实施有限 reconciliation。
- 相关自动门禁通过，并记录真实 Tauri 复验边界。

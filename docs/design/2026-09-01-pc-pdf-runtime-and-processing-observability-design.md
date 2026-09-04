# PC PDF Runtime 一致性与文档处理可观测性设计

更新时间：2026-09-01

文档状态：代码与自动验证完成；真实 Tauri/Server/MinIO 联调待验收

## 背景与问题

学科页的 File Viewer PDF renderer 固定依赖 `pdfjs-dist@5.4.624`，而 PC 的本地 PDF 解析适配器从根依赖加载 `pdfjs-dist@6.0.227`。两套 PDF.js 会运行在同一 Tauri WebView 中，并共享 worker 相关全局状态；扫描 PDF 触发渲染和 OCR 位图回退并发时，可能因此报出 `Cannot read properties of undefined (reading 'instance')`。

同时，FILE Source 的本地调度是异步发起的。任务中心仅轮询本地 runner；当 Tauri runtime 未挂载时，界面把“本地解析不可用”显示为“暂无文件解析任务”，用户无法据此判断为何当前文件还不能进入阅读问答。

恢复队列原先按 Source 串行等待：一个历史 FILE 在读取输入时失败会抛出并终止整批恢复，使排在其后的 `AWAITING_CLIENT` 文件没有本地 job，界面只能长期显示“等待桌面端处理”。

## 目标与非目标

目标：

- File Viewer 和本地 PDF/OCR 适配器解析为唯一的 `pdfjs-dist@5.4.624` 运行时，锁文件不再保留 renderer 的嵌套 PDF.js 副本。
- 新建、失败或完成的 FILE 处理任务立即同步到 Pinia 状态，文件行状态点和个人中心能反映真实本地任务。
- 未挂载 Tauri 本地 runner 时，个人中心明确说明该限制，不再伪装为空任务。
- 以自动化测试覆盖依赖锁定、FILE job 创建到上传完成的调度链路和 UI 状态接线。

非目标：

- 不修改 Source / ParsedDocument 的服务端 API、数据库或 OCR 协议。
- 不让浏览器版模拟 Tauri OCR；PC Web 仍不是发布目标。
- 不把 OCR 扩展到有可提取文本层的 PDF 及其它文件类型。它们仍需要解析、打包、上传和服务端索引后才能用于文件范围问答。

## 设计决策

### 单一 PDF.js 解析图

根 `pdfjs-dist` 精确固定为 `5.4.624`，与 `@file-viewer/renderer-pdf@2.3.0` 的精确依赖相同。更新 npm lockfile，使 renderer 从根级同一副本解析模块；不保留 `renderer-pdf/node_modules/pdfjs-dist`。`PdfTextAdapter` 继续使用离线本地的 legacy build，但去除无效的 `disableWorker` 选项和不符合 PDF.js 实际行为的注释。

```text
File Viewer ─┐
             ├─ pdfjs-dist@5.4.624 ─ worker / rendering runtime
OCR adapter ─┘
```

这保证 worker API 和主线程 API 同 ABI，也使打包器能够解析为一个模块实例。

### 处理状态传播

`SourceJobScheduler` 增加只读 `onJobChanged` 回调：在创建本地 job 后以及调度退出时通知。运行时把回调连接到 `useDocumentProcessingStore.refresh()` 和 `useSourceStore.loadSources()`；回调失败只记录，不得影响解析、上传或清理。Profile 已有轮询作为兜底，状态点因 Store 立即刷新而无需等待进入 Profile。

```text
Source AWAITING_CLIENT
  → scheduler 创建 QUEUED job
  → onJobChanged → Pinia refresh → 文件状态点 / 个人中心
  → parser/OCR → package → upload → server index
  → local job READY + Source VALIDATING/INDEXING
  → Profile 轮询 Source，直至 Source READY 才允许提问
```

`DocumentProcessingCenter` 在 runner 未挂载时渲染明确的桌面端可用性说明；runner 挂载后才使用“暂无文件解析任务”作为真实空态。它同时展示没有本地 active job 的 FILE Source 服务端 `AWAITING_CLIENT`、`VALIDATING`、`PARSING`、`INDEXING` 或 `FAILED` 阶段；只在存在这些阶段时低频轮询 Source，避免全量高频请求。阅读问答继续以服务端 `ingestionStatus === READY` 为最终门禁，前端状态点不替代服务端就绪判断。

恢复批次以每个 Source 为隔离边界：单项失败会返回 `FAILED_LOCAL` 结果（已有 job 则保留其错误详情），但不终止后续 Source 的调度。Profile 对无本地 job 的 `AWAITING_CLIENT` Source 提供“开始本机处理”入口：它先触发同步并读取本地 `SOURCE` 的 `syncStatus`，只有 `synced` 才交给 scheduler；pending、conflict 或 error 则呈现相应的本地同步状态。桌面 runner 未挂载时仍只说明运行环境限制，不在浏览器模拟 OCR。

## 验收与边界

- 定向测试先在旧实现失败：根 PDF.js 版本/锁结构不一致；scheduler 不通知状态回调。
- 实施后，依赖锁定测试、scheduler FILE→解析/打包→上传 READY 测试、处理 UI/runtime 接线测试和完整 PC 回归通过。
- 必须在实际 Windows Tauri + Server/MinIO 中手动上传扫描 PDF，确认预览无上述异常、个人中心显示阶段、Source 最终 READY 且可提问。自动化测试不能取代该外部联调。

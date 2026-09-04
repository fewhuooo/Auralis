# PC PDF Runtime 一致性与文档处理可观测性实施计划

更新时间：2026-09-01

文档状态：代码与自动验证完成；真实 Tauri/Server/MinIO 联调待验收

## 目标

消除扫描 PDF 预览与本地 OCR 解析使用不同 PDF.js 版本的运行时冲突，并让 FILE Source 从创建、本地解析、上传、索引到可提问前的状态在桌面端可见、删除后可彻底清理。

## 实施步骤

1. 添加会失败的依赖一致性测试，检查 `package.json`、`package-lock.json` 和 File Viewer renderer 的 PDF.js 都为 `5.4.624`，且 lockfile 无 renderer 的嵌套 PDF.js。
2. 添加会失败的 scheduler 通知测试，验证 FILE Source 创建后与处理结束后触发状态更新回调；补强 runtime/UI 静态契约，验证回调刷新 Pinia 和 runner 缺失提示。
3. 将根 `pdfjs-dist` 精确固定为 `5.4.624`，安全更新 `package-lock.json` 的根依赖解析；调整 `PdfTextAdapter` 移除无效 worker 配置。
4. 为 `SourceJobScheduler` 接入不影响主流程的状态变更通知，并由 `DocumentProcessingRuntime` 刷新 `useDocumentProcessingStore` 与 `useSourceStore`；恢复批次对单个 Source 失败隔离，不能阻断后续 `AWAITING_CLIENT` 文件。在 Profile 区分“桌面处理不可用”、本地任务和服务端 `VALIDATING/INDEXING` 阶段，为无 job 的 `AWAITING_CLIENT` 提供本机重试入口；入口先同步并确认本地 SOURCE 为 `synced`，再调用 scheduler，以免未落库的 Source 触发 404，持续到 Source `READY` 才允许提问。
4.1. runtime 仍在创建 Rust package/cache 前检查原生 `auralis/master_key`：无可恢复加密缓存时自动初始化；若 job 仍保留 `payloadCacheId` 或 `payloadReceipt` 而密钥缺失，则报告恢复需要且不生成新密钥，保护历史任务的可恢复性。Rust `document_package_begin` 还须在新建 cache 的原生边界再次确保密钥存在，并只把 keyring `NoEntry` 当作可创建条件，避免生命周期绕过与 credential-manager 故障被误判为密钥缺失。
4.2. 删除 FILE Source 时，先停止仍在运行的本地 parser，再按当前用户/设备删除该 Source 的所有持久任务行、清理相关加密 cache 与内存 parser input，最后刷新 Profile 任务中心；调度中的删除竞争只能返回 `SOURCE_DELETED`，不能重新创建 job 或把已删文件上传。Subject Store 在删除后重算本地 Source 投影，文件计数立即同步。预览的每次签名 URL 下载使用单调请求标记，旧请求不得覆盖新选文件；本地 OCR 用完 PDF.js document 后释放 worker 资源，避免同一 PDF 的可视预览与已结束解析竞争资源。
5. 运行定向测试、`npm.cmd run test:r4-pc`、type-check、静态检查和 production build。依赖安装若因受控网络而需要提升权限，使用 npm 仅重建这一个精确版本的本地依赖树。
6. 回写 PC 模块、前端设计、当前状态、风险和 Changelog；记录自动验证与 Tauri/Server/MinIO 人工联调边界。

## 预期修改

- `Auralis-PC/package.json`、`Auralis-PC/package-lock.json`
- `Auralis-PC/src/services/documentParser/PdfTextAdapter.ts`
- `Auralis-PC/src/services/documentParser/DocumentParser.ts`
- `Auralis-PC/src/components/FilePreview.vue`
- `Auralis-PC/src/services/documentProcessing/sourceJobScheduler.ts`
- `Auralis-PC/src/services/documentProcessing/DocumentJobRunner.ts`
- `Auralis-PC/src/services/localRepository.ts`
- `Auralis-PC/src/store/useSourceStore.ts`
- `Auralis-PC/src/store/useSubjectStore.ts`
- `Auralis-PC/src/services/documentProcessing/runtime.ts`
- `Auralis-PC/src/store/useDocumentProcessingStore.ts`
- `Auralis-PC/src/components/documentProcessing/DocumentProcessingCenter.vue`
- 对应 `r4-*` 测试及现行文档

## 验证命令

```powershell
cd Auralis-PC
node --experimental-strip-types --test scripts/document-parser-core.test.mjs scripts/r4-file-preview.test.mjs scripts/r4-document-job-schema.test.mjs scripts/r4-document-job-runner.test.mjs scripts/r4-source-processing-schedule.test.mjs
npm.cmd run test:r4-pc
npm.cmd run type-check
npm.cmd run check:r4-pc
npm.cmd run build
```

实际 Windows Tauri、OCR sidecar、MinIO 和 Server 的扫描 PDF 上传/问答属于额外人工联调，不由上述命令证明。

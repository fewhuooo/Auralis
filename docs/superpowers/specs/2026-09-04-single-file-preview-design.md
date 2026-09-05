# PC 单一文件预览设计

更新时间：2026-09-04

文档状态：已批准，待实施

## 目标

PC 端只保留 `FilePreview` 作为真实资料文件的预览实现。移除已经冗余的 PDF 专用 `PdfViewer`、首页旧“PDF 伴读”标签及其入口；资产库的真实文件改用 `FilePreview`。

## 范围

- 首页移除旧“PDF 伴读”标签、触发动作、状态与 `PdfViewer` 引用。
- 资产库文件树节点保留 Source 的 `id`、`assetId`、文件名和 MIME/文件类型，并把选中的真实文件传给 `FilePreview`。
- 删除资产库未被赋值的 `selected.markdown` / `markdown` 文件预览分支和旧 `filePath` 预览字段。
- 删除 `PdfViewer.vue`、其测试、自动组件声明和所有生产引用。
- 保持 `FilePreview` 现有签名下载、取消过期请求、加载/失败/重试、下载原文件、File Viewer 解析与缩放/旋转/分页行为不变。

## 非目标

- 不新增新的预览适配器、PDF.js 专用兼容层或第二个预览入口。
- 不改变上传、Source/Asset API、签名 URL、文档解析或 OCR 链路。
- 不改变知识块、任务或资产库树的非文件交互。

## 数据流

```text
资产库选择真实 Source 文件
→ TreeNode 保留 Source 的 id / assetId / fileType
→ FilePreview
→ Asset download-url
→ 签名 GET 下载 Blob
→ File Viewer 渲染
```

资产库原有的 `markdown` 条件分支没有任何文件节点为其赋值；移除该不可达遗留代码，不把它视为保留的预览实现。

## 验收

1. `PdfViewer` 不存在于生产代码、组件声明或测试脚本中。
2. 首页不再显示或切换到旧“PDF 伴读”标签。
3. 资产库的真实 Source 文件只经 `FilePreview` 预览，并保留其现有失败和切换语义。
4. 定向回归覆盖资产库采用 `FilePreview`、无 `PdfViewer` 引用及现有 `FilePreview` 请求门禁。
5. PC 模块、前端设计、状态、风险与 Changelog 仅记录实际修改和验证证据；Tauri GUI 仍单列为人工验收边界。

## 风险

- 资产树若未将 `assetId` 和 `fileType` 从 Source 保留到选中节点，`FilePreview` 将明确显示没有可用文件资产；回归必须检查字段映射。
- 当前工作树已有 `PdfViewer.vue` 与 `useTaskStore.ts` 未提交变动。实现必须在隔离工作树中进行，收集 diff 时不得覆盖这些变动。

# PC 单一文件预览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除旧 PDF 专用预览器，使首页不再暴露冗余 PDF 伴读入口，并让资产库真实文件只通过 `FilePreview` 预览。

**Architecture:** 资产库树节点从当前 Source 投影保留 `id`、`assetId` 和 `fileType`，选中真实文件时将这些字段直接提供给 `FilePreview`。`FilePreview` 继续是唯一负责签名 URL、取消替代下载、Blob、加载/失败/重试与 File Viewer 渲染的组件；不保留 `PdfViewer`、`filePath` 或不可达 Markdown 文件预览兼容分支。

**Tech Stack:** Vue 3、TypeScript、Pinia、`@file-viewer/vue3`、Node 内置 test runner。

## Global Constraints

- 仅保留 `FilePreview` 作为真实 Source 文件预览组件；禁止新建第二个 PDF.js 或预览适配器。
- 不改变上传、Source/Asset API、签名 URL、OCR 或文档处理数据流。
- 保护当前用户工作树的 `Auralis-PC/src/store/useTaskStore.ts` 改动；隔离 worktree 的 diff 只能按审查后应用。
- 不保留弃用的 `PdfViewer`、`filePath` 或未赋值的 `selected.markdown` 文件预览路径。
- 文档必须区分代码/自动测试与尚未完成的 Tauri GUI 验收。

---

## File Structure

- Delete: `Auralis-PC/src/components/subject/PdfViewer.vue` — 旧 PDF.js Canvas 预览器。
- Modify: `Auralis-PC/src/views/Home/index.vue` — 移除旧 PDF 伴读 tab、入口状态与组件引用。
- Modify: `Auralis-PC/src/views/Asset/index.vue` — Source 文件节点保留 `assetId/fileType` 并使用 `FilePreview`。
- Modify: `Auralis-PC/scripts/r4-file-preview.test.mjs` — 覆盖资产库的唯一预览路径和遗留引用禁止项。
- Delete: `Auralis-PC/scripts/r4-pdf-viewer-switch.test.mjs` — 删除仅验证弃用组件的测试。
- Modify: `Auralis-PC/package.json` — 从 `test:r4-pc` 中删除弃用测试文件。
- Modify: `Auralis-PC/components.d.ts` — 删除自动组件的 `PdfViewer` 声明。
- Modify: `docs/modules/FrontendPC.md`, `docs/design/Frontend.md`, `docs/current/Status.md`, `docs/current/IssuesAndReview.md`, `docs/release/Changelog.md` — 回写现行行为、风险和验证边界。

### Task 1: 建立移除遗留预览器的回归门禁

**Files:**
- Modify: `Auralis-PC/scripts/r4-file-preview.test.mjs`
- Test: `Auralis-PC/scripts/r4-file-preview.test.mjs`

**Interfaces:**
- Consumes: `FilePreview` 的 props `{ id, name, assetId, fileType }`。
- Produces: 静态回归，保证首页没有 PDF 伴读路径、资产库通过 `FilePreview` 渲染真实文件、生产代码没有 `PdfViewer` 引用。

- [ ] **Step 1: 写失败测试**

在 `r4-file-preview.test.mjs` 追加三个断言：读取 `src/views/Home/index.vue` 并断言不含 `PdfViewer`、`openPdfCompanion`、`activeTab === 'pdf'`；读取 `src/views/Asset/index.vue` 并断言含 `FilePreview`、`:file="selectedPreviewFile"`、`assetId`、`fileType`，且不含 `selected.markdown`、`filePath`、`PdfViewer`；使用 `fs.existsSync` 断言 `src/components/subject/PdfViewer.vue` 为 false。

- [ ] **Step 2: 运行测试确认失败**

运行：`node --experimental-strip-types --test scripts/r4-file-preview.test.mjs`

预期：新增遗留引用断言失败，因为当前首页、资产库和组件文件仍包含 `PdfViewer`。

- [ ] **Step 3: 保持测试聚焦**

不要修改 `FilePreview.vue`。该任务的唯一生产行为约束是：资产库需提供其已经定义的 Source 字段，而不是扩展 `FilePreview` 的契约。

### Task 2: 移除首页旧 PDF 伴读入口

**Files:**
- Modify: `Auralis-PC/src/views/Home/index.vue`

**Interfaces:**
- Consumes: 首页当前的 tab 状态和学习材料动作。
- Produces: 首页不再能进入 PDF 伴读；学科工作区是唯一现行文件阅读入口。

- [ ] **Step 1: 删除旧 tab UI**

删除 `activeTab === 'pdf'` 的 `<PdfViewer>` 区块和其空状态文案；移除 `PdfViewer` import。

- [ ] **Step 2: 删除旧入口状态**

删除 `openPdfCompanion(fileId)` 及只为它服务的 `activeTab.value = 'pdf'`、`selectedFileId` 写入或材料行“伴读”点击路径。保留与目录、知识块、任务、上传有关的代码。

- [ ] **Step 3: 复查无孤立 UI**

运行：`rg -n "PdfViewer|openPdfCompanion|activeTab === 'pdf'|PDF Companion" src/views/Home/index.vue`

预期：无匹配；首页不显示已经失效的 PDF 伴读文案或按钮。

### Task 3: 让资产库真实文件使用 FilePreview

**Files:**
- Modify: `Auralis-PC/src/views/Asset/index.vue`

**Interfaces:**
- Consumes: `sourceStore.sources` 中的 Source 文件模型，包含 `id`、`name`、`assetId`、`fileType`。
- Produces: `selectedPreviewFile: ComputedRef<{ id: string; name: string; assetId?: string; fileType?: string } | null>`，供 `<FilePreview :file="selectedPreviewFile" bare />` 使用。

- [ ] **Step 1: 将 Source 身份字段保留到 TreeNode**

扩展 `TreeNode` 的文件字段为 `assetId?: string` 与 `fileType?: string`，移除 `filePath?: string` 与 `markdown?: string`。在“全部文件”和“按学科文件”两处创建节点时，分别赋值 `assetId: file.assetId` 和 `fileType: file.fileType`。

- [ ] **Step 2: 提供单一 FilePreview 输入**

导入 `FilePreview`，新增 `selectedPreviewFile` computed：当 `selected.value?.type !== 'file'` 时返回 `null`；否则返回 `{ id: selected.id, name: selected.name, assetId: selected.assetId, fileType: selected.fileType }`。在文件主体仅当该 computed 非空时渲染 `<FilePreview :file="selectedPreviewFile" :bare="true" />`。

- [ ] **Step 3: 删除旧分支**

删除 `selected.markdown` 的不可达 `<pre>` 分支、`PdfViewer` import/DOM、`pdf-viewer-container` 专用包装和所有 `filePath` 赋值。不要删除资产库的知识块或任务预览。

- [ ] **Step 4: 运行测试确认变绿**

运行：`node --experimental-strip-types --test scripts/r4-file-preview.test.mjs`

预期：20 个既有测试及新增回归全部通过；失败数为 0。

### Task 4: 删除弃用实现和专用测试注册

**Files:**
- Delete: `Auralis-PC/src/components/subject/PdfViewer.vue`
- Delete: `Auralis-PC/scripts/r4-pdf-viewer-switch.test.mjs`
- Modify: `Auralis-PC/package.json`
- Modify: `Auralis-PC/components.d.ts`

**Interfaces:**
- Consumes: Task 1 的不存在性回归。
- Produces: 生产源码、测试命令与组件声明中均没有 `PdfViewer`。

- [ ] **Step 1: 删除文件与注册**

删除旧组件和其仅服务该组件的测试；从 `test:r4-pc` 的显式测试列表移除 `scripts/r4-pdf-viewer-switch.test.mjs`，从 `components.d.ts` 移除 `PdfViewer` 声明。

- [ ] **Step 2: 全仓现行路径扫描**

运行：`rg -n "PdfViewer|r4-pdf-viewer-switch|convertFileSrc" Auralis-PC/src Auralis-PC/scripts Auralis-PC/package.json Auralis-PC/components.d.ts`

预期：无匹配。不要修改历史 Changelog 中的过去时记录，除非其表述与当前现行状态冲突。

- [ ] **Step 3: 运行定向回归**

运行：`node --experimental-strip-types --test scripts/r4-file-preview.test.mjs`

预期：退出码 0，且新增的“组件不存在”断言通过。

### Task 5: 回写现行文档与验证

**Files:**
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/design/Frontend.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

**Interfaces:**
- Consumes: Task 2–4 的实际 diff 和实际命令输出。
- Produces: 当前文档只描述 `FilePreview` 为唯一真实文件预览路径，历史/风险不再要求验证已删除的 `PdfViewer`。

- [ ] **Step 1: 更新模块与设计事实**

在 PC 模块和前端设计中明确：首页不再提供 PDF 伴读入口；学科工作区与资产库的真实 Source 文件都使用 `FilePreview`；签名下载和 File Viewer 仍为唯一文件预览契约。

- [ ] **Step 2: 更新状态与风险**

在 Status 记录本次移除与定向测试实际结果；删除或改写只针对已删除 `PdfViewer` 的 P1 GUI 风险。保留 `FilePreview` 的 Tauri/真实文档兼容性人工验收风险，不能把自动测试写成 GUI 验收。

- [ ] **Step 3: 记录 Changelog**

新增本次变更记录：移除重复 PDF.js/Cavas 预览器，首页移除冗余入口，资产库接入 `FilePreview`；仅记录实际执行的回归命令和其结果。

- [ ] **Step 4: 执行验证**

运行：

```powershell
node --experimental-strip-types --test scripts/r4-file-preview.test.mjs
npm.cmd run type-check
npm.cmd run build
git diff --check
```

预期：定向回归、类型检查、构建和 diff 格式检查均退出码 0。若工作树既有的无关问题阻断后两项，记录具体错误并不得归因于本次预览迁移。

## Plan Self-Review

- Spec coverage：Task 2 移除首页冗余入口；Task 3 迁移资产库；Task 4 删除所有弃用实现；Task 1/4 保证无遗留引用；Task 5 覆盖所有要求文档和验证边界。
- Placeholder scan：本计划没有 TBD、TODO 或“适当处理”等未定义实现动作。
- Type consistency：资产树输出 `assetId/fileType`，`selectedPreviewFile` 以 `FilePreview` 已有的 `{ id, name, assetId, fileType }` props 契约消费，无新增生产接口。

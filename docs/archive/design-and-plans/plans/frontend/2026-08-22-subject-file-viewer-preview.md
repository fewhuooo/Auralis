# PC 学科统一 File Viewer 预览实施计划

**Goal:** 在 PC 学科工作区用一个统一的 `FilePreview` 组件试用浏览器端 File Viewer，先覆盖 DOC/DOCX、PDF、图片和文本预览，并在上传入口直接拒绝 Excel 与未知格式。

**Architecture:** `FilePreview.vue` 负责加载态、错误态、下载和关闭等公共行为，通过 `filePreview.ts` 能力注册表选择 `FileViewerRenderer` 或后续可替换的 PDF fallback。学科页只传入 `SourceFileModel`，资产下载地址仍由现有 `useAssetStore.downloadUrl` 获取；不新增后端接口。

**Tech Stack:** Vue 3、TypeScript、Vite、Pinia、`@file-viewer/vue3-full`、现有 Node test runner。

## Global Constraints

- XLS/XLSX 和未知格式在 input、drop、粘贴和 `assetStore.upload` 前置校验阶段拒绝，不请求上传意图。
- DOC/DOCX 首先交给 File Viewer；不得在本阶段接入在线第三方预览服务或后端转 PDF。
- `FilePreview` 是学科页唯一预览入口，页面不得继续散落文件类型判断。
- File Viewer 的 Worker/WASM/vendor 资源必须可通过 Vite/Tauri 自托管，不使用运行时 CDN。
- 不触碰 `.claude/`，不恢复旧页面、旧路由或旧接口，不修改后端。
- 遵循 Auralis 前端字体、颜色、加载失败和可访问性设计令牌。

---

### Task 1: 安装 File Viewer 并配置自托管资源

**Files:**
- Modify: `Auralis-PC/package.json`
- Modify: `Auralis-PC/package-lock.json`
- Modify: `Auralis-PC/vite.config.ts`
- Create: `Auralis-PC/public/file-viewer/.gitkeep`（仅当 Vite 资源复制需要显式目录时）

**Interfaces:**
- Produces a Vue 3 `FileViewer` component import and a build-time asset copy path under `/file-viewer/`.

- [ ] **Step 1: Add the exact packages**

Run from `Auralis-PC`:

```powershell
npm install @file-viewer/vue3-full @file-viewer/vite-plugin
```

Expected: `package.json` and `package-lock.json` contain both packages and `npm` exits 0.

- [ ] **Step 2: Configure asset copying**

Update `vite.config.ts` to register the same-version File Viewer Vite plugin with `copyAssets: true`, preserving all existing plugins and aliases. The configured runtime asset base must be `/file-viewer/` so Web/Tauri builds do not fetch a CDN.

- [ ] **Step 3: Verify dependency/build discovery before application code**

```powershell
npm run type-check
```

Expected: the command reaches TypeScript checking; any failure must be fixed as dependency/configuration failure before continuing.

- [ ] **Step 4: Commit**

```powershell
git add package.json package-lock.json vite.config.ts public/file-viewer
git commit -m "build: add self-hosted file viewer"
```

### Task 2: Add the file capability registry and upload validation

**Files:**
- Create: `Auralis-PC/src/utils/filePreview.ts`
- Modify: `Auralis-PC/src/api/useAssetApi.ts`
- Modify: `Auralis-PC/src/store/useAssetStore.ts`
- Create: `Auralis-PC/scripts/r4-file-preview.test.mjs`
- Modify: `Auralis-PC/package.json`

**Interfaces:**
- `resolveFileCapability(file: Pick<File, 'name' | 'type'>): FileCapability`
- `validateUploadFile(file: Pick<File, 'name' | 'type' | 'size'>): FileCapability`
- `getPreviewFileName(source: { name: string }): string`
- `FileCapability.kind` is one of `pdf | office | image | text | csv | unsupported`.

- [ ] **Step 1: Write the failing registry tests**

Add Node tests that import `src/utils/filePreview.ts` and assert:

```js
test('rejects Excel before upload intent', () => {
  assert.throws(() => validateUploadFile({ name: 'grades.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 10 }), /Excel/)
})

test('maps DOCX to the File Viewer office renderer', () => {
  assert.deepEqual(resolveFileCapability({ name: 'lesson.docx', type: '' }), {
    allowedForUpload: true,
    kind: 'office',
    renderer: 'file-viewer',
    extension: 'docx',
  })
})
```

Include PDF, image, text, CSV and unknown extension cases, plus the 50 MB size error.

- [ ] **Step 2: Run the tests and verify RED**

```powershell
node --experimental-strip-types --test scripts/r4-file-preview.test.mjs
```

Expected: FAIL because `src/utils/filePreview.ts` does not exist yet.

- [ ] **Step 3: Implement the minimal registry**

Use extension-first resolution with MIME as a secondary signal. The registry must expose a single `SUPPORTED_UPLOAD_EXTENSIONS` list for the file input `accept` attribute. `.xls` and `.xlsx` must return `allowedForUpload: false` with the error text `暂不支持 Excel 文件`; unknown extensions must return `暂不支持此文件类型`.

- [ ] **Step 4: Connect validation to the upload pipeline**

Call `validateUploadFile(file)` at the first line of `uploadAsset` before `createUploadIntent`. Re-export the helper through `useAssetApi`. Make `useAssetStore.upload` inherit this behavior without duplicating type rules.

- [ ] **Step 5: Run the tests and verify GREEN**

```powershell
node --experimental-strip-types --test scripts/r4-file-preview.test.mjs
```

Expected: all file capability and upload validation tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/utils/filePreview.ts src/api/useAssetApi.ts src/store/useAssetStore.ts scripts/r4-file-preview.test.mjs package.json
git commit -m "feat: validate subject file preview capabilities"
```

### Task 3: Build the unified `FilePreview` component

**Files:**
- Create: `Auralis-PC/src/components/FilePreview.vue`
- Create: `Auralis-PC/src/components/preview/FileViewerRenderer.vue`
- Create: `Auralis-PC/src/components/preview/UnsupportedPreview.vue`
- Modify: `Auralis-PC/scripts/r4-file-preview.test.mjs`

**Interfaces:**
- `FilePreview.vue` props: `file: Pick<SourceFileModel, 'id' | 'name' | 'assetId' | 'fileType'>`, `compact?: boolean`.
- Emits: `close`, `download`, `preview-error`.
- `FileViewerRenderer.vue` props: `url: string`, `filename: string`, `capability: FileCapability`.

- [ ] **Step 1: Add the component contract test**

Extend the Node static contract test to assert `FilePreview.vue` imports the File Viewer wrapper, owns loading/error states, calls `downloadUrl`, and does not contain a second extension allowlist.

- [ ] **Step 2: Run the test and verify RED**

```powershell
node --experimental-strip-types --test scripts/r4-file-preview.test.mjs
```

Expected: FAIL because the component files do not exist.

- [ ] **Step 3: Implement the wrapper**

`FilePreview` resolves the capability once, obtains a signed URL from `useAssetStore.downloadUrl(file.assetId)`, then renders `FileViewerRenderer` for `pdf`, `office`, `image`, `text` and `csv`. While loading it shows a skeleton; on failure it shows a readable error and a download action. Unsupported capabilities render `UnsupportedPreview` and never call the download API.

- [ ] **Step 4: Implement the File Viewer adapter**

Use the installed Vue component with the URL and filename. Keep the adapter isolated so a future PDF renderer can replace it without changing `FilePreview.vue` or `SubjectWorkspace/index.vue`. Ensure the mount target has a minimum height, the File Viewer asset base points to `/file-viewer/`, and cleanup runs on unmount.

- [ ] **Step 5: Run tests and type-check**

```powershell
node --experimental-strip-types --test scripts/r4-file-preview.test.mjs
npm run type-check
```

Expected: tests pass and Vue/TypeScript emits no new errors.

- [ ] **Step 6: Commit**

```powershell
git add src/components/FilePreview.vue src/components/preview scripts/r4-file-preview.test.mjs
git commit -m "feat: add unified file preview component"
```

### Task 4: Integrate SubjectWorkspace and intercept unsupported uploads

**Files:**
- Modify: `Auralis-PC/src/views/SubjectWorkspace/index.vue`
- Modify: `Auralis-PC/scripts/r4-file-preview.test.mjs`

**Interfaces:**
- SubjectWorkspace uses `FilePreview` for the selected source file and passes only the source model.
- The file input uses `SUPPORTED_UPLOAD_EXTENSIONS.join(',')`.

- [ ] **Step 1: Add the failing integration contracts**

Assert that SubjectWorkspace imports `FilePreview`, binds `accept` to the shared extension list, calls `validateUploadFile` in both selection and drop paths, and does not leave the old `getFileIcon` type branching as the preview decision.

- [ ] **Step 2: Run the test and verify RED**

```powershell
node --experimental-strip-types --test scripts/r4-file-preview.test.mjs
```

Expected: FAIL until SubjectWorkspace is wired to the shared component and validator.

- [ ] **Step 3: Integrate preview-first behavior**

Import `FilePreview`, add a preview state to the selected-file center area, and keep the existing summary action available without duplicating preview logic. Clicking a file must render the unified component. Use the existing notification system for errors and leave the modal open after an invalid file is rejected.

- [ ] **Step 4: Intercept input/drop before state mutation**

Run `validateUploadFile` before assigning `droppedFile` or changing `registerForm`. On rejection, clear the native input, keep the prior valid selection unchanged, and show the specific message. Set the input `accept` attribute from the shared registry.

- [ ] **Step 5: Run the focused and existing checks**

```powershell
node --experimental-strip-types --test scripts/r4-file-preview.test.mjs
npm run check:subject-workspace
npm run test:r4-pc
npm run type-check
```

Expected: all commands exit 0. Any existing unrelated failure must be recorded rather than hidden.

- [ ] **Step 6: Commit**

```powershell
git add src/views/SubjectWorkspace/index.vue scripts/r4-file-preview.test.mjs
git commit -m "feat: preview subject files with file viewer"
```

### Task 5: Update current documentation and verify real samples

**Files:**
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/design/Frontend.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

- [ ] **Step 1: Record the current implementation boundary**

Document that SubjectWorkspace has one `FilePreview` entry, File Viewer is the current DOC/DOCX renderer, XLS/XLSX are rejected before upload intent, and PDF fallback remains a planned replacement if sample validation fails.

- [ ] **Step 2: Run production verification**

```powershell
npm run build
npm run check:r4-pc
npm run check:subject-icons
npm run check:subject-workspace
npm run test:r4-pc
```

Expected: all commands exit 0; build output must include locally copied File Viewer assets and no CDN-only URL.

- [ ] **Step 3: Perform manual sample acceptance**

In the running PC app, register one PDF, DOCX with tables/images, DOC, PNG, TXT and CSV. Confirm each opens inside the same FilePreview shell. Try XLSX and an unknown extension from both file picker and drag/drop; confirm no upload-intent request is sent and the modal remains usable. Record any DOC/DOCX layout failure as the explicit trigger for PDF fallback.

- [ ] **Step 4: Commit documentation and verification evidence**

```powershell
git add docs/modules/FrontendPC.md docs/design/Frontend.md docs/current/Status.md docs/current/IssuesAndReview.md docs/release/Changelog.md
git commit -m "docs: record file viewer preview verification"
```

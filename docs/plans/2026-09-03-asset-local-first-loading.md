# 资产库本地优先加载 Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 PC 资产库先展示本地树，在云端读取失败时保持本地数据，并在云端缓存写回后自动重建树。

**Architecture:** `Asset/index.vue` 负责本地 hydration 的生命周期和树投影，四个 Store 继续作为唯一的云端→repository 同步边界。页面通过 `Promise.allSettled` 等待本地读取收敛，以避免单项失败阻塞 spinner；通过 Vue `watch` 监听 Store 投影，在已有后台 refresh 写回本地/Pinia 后重建 `rootNodes`。

**Tech Stack:** Vue 3 Composition API、Pinia、TypeScript、Node test runner、LocalRepository/outbox。

## Global Constraints

- 不向 Asset 页面新增直接 API 调用或绕过 repository 的写入。
- 远端失败不得清空已显示的本地树或重新打开 spinner。
- 不修改 API 或数据库契约。
- 保留用户当前工作树的无关修改，不提交或还原它们。

---

### Task 1: 锁定资产库本地优先加载契约

**Files:**
- Modify: `Auralis-PC/scripts/r4-asset-tasks.test.mjs`

**Interfaces:**
- Consumes: `loadAssetsFromBackend()`、`isLoadingAssets`、`rootNodes`。
- Produces: 资产库测试，要求并行容错本地 hydration 与 Store 投影变更后的树重建。

- [x] **Step 1: Write the failing test**

```js
assert.match(assetSource, /Promise\.allSettled\(/)
assert.match(assetSource, /watch\(\s*\[\s*\(\) => subjectStore\.subjects/)
assert.match(assetSource, /rebuildAssetTree\(\)/)
assert.doesNotMatch(assetSource, /await subjectStore\.loadSubjects\(\)[\s\S]*await sourceStore\.loadSources\(\)/)
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test scripts/r4-asset-tasks.test.mjs`

Expected: FAIL because the current asset loader serially awaits Store loads and does not observe Store projection updates.

- [x] **Step 3: Keep the test scoped to user-visible behavior**

The assertion must also require `isLoadingAssets.value = false` in the `finally` block so a rejected local resource read cannot leave the tree permanently loading.

- [x] **Step 4: Re-run the test before production edits**

Run: `node --experimental-strip-types --test scripts/r4-asset-tasks.test.mjs`

Expected: FAIL only on the missing local-first loader/rebuild contract.

### Task 2: 构建本地树并响应后台云端结果

**Files:**
- Modify: `Auralis-PC/src/views/Asset/index.vue:316-550`
- Test: `Auralis-PC/scripts/r4-asset-tasks.test.mjs`

**Interfaces:**
- Consumes: `subjectStore.subjects`、`sourceStore.sources`、`blockStore.recentBlocks`、`taskStore.allTasks` 的本地 Pinia 投影；各 Store 的既有后台 refresh/cache 行为。
- Produces: `rebuildAssetTree(): void` 和本地优先的 `loadAssetsFromBackend(): Promise<void>`。

- [x] **Step 1: Extract the pure tree projection**

Move the existing `newRoots` construction into `rebuildAssetTree()`. It must read only the four Store projections and `route.query.focus`, then assign `rootNodes.value` and `focusUnassigned.value`.

- [x] **Step 2: Make first load parallel and failure-tolerant**

Replace serial Store waits with:

```ts
const results = await Promise.allSettled([
  subjectStore.loadSubjects(),
  sourceStore.loadSources(),
  blockStore.loadLocalBlocks(),
  taskStore.fetchTasks(),
])
rebuildAssetTree()
for (const result of results) {
  if (result.status === 'rejected') console.warn('[Asset] local asset hydration failed', result.reason)
}
```

Keep `isLoadingAssets.value = false` in `finally`; do not throw away partial local data.

- [x] **Step 3: Rebuild after background refresh updates Store projections**

Import `watch` and install one watcher:

```ts
watch(
  [
    () => subjectStore.subjects,
    () => sourceStore.sources,
    () => blockStore.recentBlocks,
    () => taskStore.allTasks,
  ],
  () => {
    if (!isLoadingAssets.value) rebuildAssetTree()
  },
)
```

This watcher must not invoke network requests or set the loading state. Store cache methods remain responsible for applying cloud differences to the local repository and Pinia state.

- [x] **Step 4: Verify the focused test passes**

Run: `node --experimental-strip-types --test scripts/r4-asset-tasks.test.mjs`

Expected: PASS.

- [x] **Step 5: Type-check the affected view**

Run: `npm run type-check`

Expected: `vue-tsc -b` exits 0.

### Task 3: 回写现行文档与完整验证

**Files:**
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/design/Frontend.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`

**Interfaces:**
- Consumes: Task 2 verified behavior and command output.
- Produces: Current PC behavior, remaining GUI risks and exact command evidence.

- [x] **Step 1: Document the loading contract**

State that Asset renders from local projections first, keeps them when cloud refresh fails, and rebuilds after Store cache writes cloud differences locally.

- [x] **Step 2: Record evidence without overstating GUI coverage**

Record the final test count, static-check and build results. Keep browser/Tauri weak-network verification open until manually exercised.

- [x] **Step 3: Run complete PC verification**

Run: `npm run test:r4-pc; npm run check:r4-pc; npm run build`

Expected: all PC tests pass, the static check passes, and production build exits 0; existing chunk-size/browser-compatibility warnings may remain warnings.

- [x] **Step 4: Check changed-file whitespace**

Run: `git diff --check -- Auralis-PC/src/views/Asset/index.vue Auralis-PC/scripts/r4-asset-tasks.test.mjs docs/modules/FrontendPC.md docs/design/Frontend.md docs/current/Status.md docs/current/IssuesAndReview.md`

Expected: exit 0; repository-wide CRLF conversion warnings are not whitespace errors in the scoped diff.

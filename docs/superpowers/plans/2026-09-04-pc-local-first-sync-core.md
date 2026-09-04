# PC 本地优先同步核心实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 PC 端 Subject、Source、KnowledgeBlock、Task 与 Relation 在本地持久化成功后立即可用，并由单一后台同步器按服务端 cursor 收敛跨端状态，不再让普通页面或操作等待远端请求。

**Architecture:** 本地 SQLite/localStorage repository 保存每个同步资源的投影、墓碑、同步状态和 outbox。一次领域写入通过事务同时写资源和 immutable mutation；后台同步器以 `pending → inflight → applied/conflict/error` 状态机领取 mutation、push 后再 cursor pull，并只在本地不存在未解决写入时应用服务端记录。Store 不再调用普通资源列表 API 刷新；它们读取本地投影并订阅同步器的批量投影变更通知。

**Tech Stack:** Vue 3、Pinia、TypeScript、Tauri SQLite、localStorage fallback、Node `node:test`、既有 Spring `/api/sync` cursor API。

**实施状态（2026-09-04）：** Task 1–5 的代码与定向回归已落地；Task 6 的文档回写已开始。完整 PC 门禁、production build、Tauri GUI、弱网双设备与冲突可见性仍保持未验收，不以定向 Node 测试替代。

## Global Constraints

- 本计划只改 `Auralis-PC`；Mobile/Tablet、服务端 API 与数据库 schema 不在本计划内。
- 同步资源固定为 `SUBJECT`、`SOURCE`、`KNOWLEDGE_BLOCK`、`TASK`、`RELATION`；Asset 二进制上传、ParsedDocument、Review、Stats、AI 会话不进入普通 outbox。
- 用户操作的成功条件是本地事务成功，不是 HTTP 成功；本地事务失败必须向调用者抛错，调用页面维持原状态并显示既有错误反馈。
- 服务端 cursor/change log 是跨端最终记录；同资源存在本地 `pending`、`inflight`、`conflict` 或 `error` mutation 时，pull/snapshot 不得覆盖本地投影。
- 服务端以 `baseVersion` 判定冲突的现行契约保持不变。冲突时保存服务端 current DTO/version 供诊断，并把本地资源标为 `conflict`；不新增自动 last-write-wins 覆盖或人工冲突页面。
- 所有自动同步仅调用 `requestBackgroundSync()`；只有用户点击“立即同步”或 FILE 解析前需要确认 Source 已建成时才调用 `flushNow()` 并等待。
- 每个 task 必须先观察目标测试失败，再写生产代码；不提交、不还原、不覆盖工作树中无关改动。

---

## 文件结构与职责

| 路径 | 改动职责 |
| --- | --- |
| `Auralis-PC/src/types/api.ts` | 定义本地 mutation 的发送中状态与服务器诊断元数据类型。 |
| `Auralis-PC/src/services/localSchema.ts` | 将 PC local schema 升级至 v6，给 `local_mutations` 加入发送中/远端诊断列。 |
| `Auralis-PC/src/services/localSqlQueue.ts` | 提供整段 SQLite 事务独占执行，避免 `BEGIN` 与其它排队 SQL 交错。 |
| `Auralis-PC/src/services/localRepository.ts` | 提供资源+outbox 原子提交、领取发送批次、结算结果和未解决投影保护。 |
| `Auralis-PC/src/services/syncOrdering.ts` | 按资源依赖和 mutation 类型稳定排序 push 批次。 |
| `Auralis-PC/src/services/localProjectionEvents.ts` | 发布一次同步周期后的合并资源类型变更，避免 Store 各自访问远端。 |
| `Auralis-PC/src/store/useSyncStore.ts` | 实现后台防抖调度、inflight 生命周期、cursor pull 与投影通知。 |
| `Auralis-PC/src/store/useSubjectStore.ts` | 使用原子本地写入；仅从本地投影加载。 |
| `Auralis-PC/src/store/useSourceStore.ts` | 使用原子本地写入；仅从本地投影加载；保留 FILE 处理前的显式 `flushNow()`。 |
| `Auralis-PC/src/store/useKnowledgeStore.ts` | 使用原子本地写入；仅从本地投影加载。 |
| `Auralis-PC/src/store/useTaskStore.ts` | 删除远端优先删除与 UI 先于持久化行为；全部 Task 操作统一原子本地写入。 |
| `Auralis-PC/src/App.vue`、`Auralis-PC/src/services/realtimeController.ts`、`Auralis-PC/src/views/Profile/index.vue` | 将启动、实时与手动同步切换为对应的后台/显式 flush 入口。 |
| `Auralis-PC/scripts/r4-local-repository.test.mjs`、`r4-sync.test.mjs`、`r4-register-file.test.mjs` | 覆盖原子性、inflight 竞态、投影保护、后台调度和 Store 静态边界。 |
| `docs/contracts/Database.md`、`docs/project/Architecture.md`、`docs/modules/FrontendPC.md`、`docs/current/Status.md`、`docs/current/IssuesAndReview.md`、`docs/release/Changelog.md` | 记录实际 schema、数据流、验证和剩余 GUI 风险。 |

## Task 1: 建立事务 outbox 与发送中 mutation 状态

**Files:**

- Modify: `Auralis-PC/src/types/api.ts`
- Modify: `Auralis-PC/src/services/localSchema.ts`
- Modify: `Auralis-PC/src/services/localSqlQueue.ts`
- Modify: `Auralis-PC/src/services/localRepository.ts`
- Test: `Auralis-PC/scripts/r4-local-repository.test.mjs`

**Consumes:** 当前 `LocalRepository.upsert()`、`tombstone()`、`enqueueMutation()` 和 `LocalSqlQueue`。

**Produces:** `LocalRepository.commitMutation()`、`claimPending()`、`releaseInflight()`、`settleMutation()`；后续 Store 和 Sync Store 不得再把 `upsert/tombstone` 与 `enqueueMutation` 分开调用。

- [ ] **Step 1: 写失败测试，锁定资源与 mutation 的原子持久化。**

  在 `r4-local-repository.test.mjs` 新增以下测试；其中 `FailingSqlite` 的第二次 execute 抛错，证明资源写成功但 mutation 写失败时整个事务回滚：

  ```js
  test('commitMutation writes the resource and outbox row atomically', async () => {
    const { first } = createRepositories()

    await first.commitMutation({
      resourceType: 'TASK', resourceId: 'task-1', value: { id: 'task-1', title: 'Local' },
      version: 0, deletedAt: null,
      mutation: {
        clientMutationId: 'task-create-1', resourceType: 'TASK', resourceId: 'task-1',
        mutationType: 'CREATE', baseVersion: 0, payload: { id: 'task-1', title: 'Local' },
      },
    })

    assert.equal((await first.read('TASK', 'task-1'))?.syncStatus, 'pending')
    assert.deepEqual((await first.listPending()).map((item) => item.clientMutationId), ['task-create-1'])
  })
  ```

- [ ] **Step 2: 运行测试，确认它因方法不存在而失败。**

  Run: `node --experimental-strip-types --test scripts/r4-local-repository.test.mjs`

  Expected: FAIL，错误包含 `commitMutation is not a function`；现有工作树的其它已知断言失败单独记录，不修改它们。

- [ ] **Step 3: 定义类型和 v6 schema。**

  在 `types/api.ts` 将状态扩大为：

  ```ts
  export type LocalMutationStatus = 'pending' | 'inflight' | 'applied' | 'conflict' | 'error'

  export interface LocalMutation {
    clientMutationId: string
    userId: string
    resourceType: 'SUBJECT' | 'SOURCE' | 'KNOWLEDGE_BLOCK' | 'TASK' | 'RELATION'
    resourceId: string
    mutationType: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE'
    baseVersion: number
    payload: Record<string, unknown>
    createdAt: string
    status: LocalMutationStatus
    error?: string
    remoteValue?: unknown
    remoteVersion?: number
  }
  ```

  在 `localSchema.ts` 将 `LOCAL_SCHEMA_VERSION` 改为 `6`，并在 migration 中对已有 `local_mutations` 增加 `in_flight_at TEXT`、`remote_payload TEXT`、`remote_version INTEGER`。新建表定义也必须包含这些列；row mapper 对空列返回 `undefined`。不要删除任何历史 mutation 或资源记录。

- [ ] **Step 4: 为 SQLite 提供不可交错的事务执行器。**

  将 `LocalSqlDatabase` 扩展为可选 `transaction`，并由 `serializeLocalSqlDatabase()` 以同一个 `LocalSqlQueue` 包装整个 closure：

  ```ts
  export interface LocalSqlDatabase {
    execute(sql: string, bindValues?: unknown[]): Promise<unknown>
    select<T>(sql: string, bindValues?: unknown[]): Promise<T[]>
    transaction?<T>(operation: (transaction: LocalSqlDatabase) => Promise<T>): Promise<T>
  }

  transaction: <T>(operation: (transaction: LocalSqlDatabase) => Promise<T>) => queue.enqueue(async () => {
    await database.execute('BEGIN IMMEDIATE')
    try {
      const result = await operation(database)
      await database.execute('COMMIT')
      return result
    } catch (error) {
      await database.execute('ROLLBACK')
      throw error
    }
  }),
  ```

  `operation` 接收未再次排队的底层 database，防止 transaction 内部递归进入同一 queue。

- [ ] **Step 5: 实现 repository 原子写接口。**

  在 `localRepository.ts` 新增接口和方法：

  ```ts
  export interface LocalCommitInput<T> {
    resourceType: string
    resourceId: string
    value: T
    version: number
    deletedAt: string | null
    mutation: LocalMutationInput
  }

  async commitMutation<T>(input: LocalCommitInput<T>): Promise<LocalEntity<T>>
  async claimPending(limit: number): Promise<LocalMutation[]>
  async releaseInflight(clientMutationIds: string[]): Promise<void>
  async settleMutation(input: {
    clientMutationId: string
    status: Extract<LocalMutationStatus, 'applied' | 'conflict' | 'error'>
    error?: string
    remoteValue?: unknown
    remoteVersion?: number
  }): Promise<void>
  ```

  `commitMutation()` 在 SQL `transaction` 内执行一条 `local_resource_records` UPSERT 和一条 `local_mutations` INSERT/UPDATE；资源状态固定为 `pending`。localStorage fallback 读取一次 `StoredBrowserState`、在内存同时修改 resources/mutations、仅调用一次 `writeBrowserState()`。

  `claimPending(200)` 必须在同一事务中取得最多 200 条 `pending` mutation、按 `created_at` 和 `client_mutation_id` 稳定排序、更新为 `inflight` 并返回发送前的不可变副本。合并逻辑只允许合并 `pending` mutation，绝不修改 `inflight` mutation。

- [ ] **Step 6: 写并运行发送中竞态测试。**

  ```js
  test('a new local edit remains pending when an older claimed mutation is acknowledged', async () => {
    const { first } = createRepositories()
    await first.commitMutation({
      resourceType: 'TASK', resourceId: 'task-1', value: { title: 'first' }, version: 1, deletedAt: null,
      mutation: { clientMutationId: 'm-1', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'UPDATE', baseVersion: 1, payload: { title: 'first' } },
    })
    assert.deepEqual((await first.claimPending(200)).map((item) => item.clientMutationId), ['m-1'])
    await first.commitMutation({
      resourceType: 'TASK', resourceId: 'task-1', value: { title: 'second' }, version: 1, deletedAt: null,
      mutation: { clientMutationId: 'm-2', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'UPDATE', baseVersion: 1, payload: { title: 'second' } },
    })
    await first.settleMutation({ clientMutationId: 'm-1', status: 'applied', remoteVersion: 2 })

    assert.equal((await first.read('TASK', 'task-1'))?.syncStatus, 'pending')
    assert.deepEqual((await first.listPending()).map((item) => item.clientMutationId), ['m-2'])
  })
  ```

  Run: `node --experimental-strip-types --test scripts/r4-local-repository.test.mjs`

  Expected: PASS for the two new tests; no SQLite “transaction within transaction” error.

- [ ] **Step 7: Commit only task-owned files after green verification.**

  ```bash
  git add Auralis-PC/src/types/api.ts Auralis-PC/src/services/localSchema.ts Auralis-PC/src/services/localSqlQueue.ts Auralis-PC/src/services/localRepository.ts Auralis-PC/scripts/r4-local-repository.test.mjs
  git commit -m "feat(pc): make local mutations atomic"
  ```

## Task 2: 建立可测试的 cursor 同步循环与服务端最终状态合并

**Files:**

- Create: `Auralis-PC/src/services/syncCycle.ts`
- Create: `Auralis-PC/src/services/syncOrdering.ts`
- Modify: `Auralis-PC/src/store/useSyncStore.ts`
- Test: `Auralis-PC/scripts/r4-sync.test.mjs`

**Consumes:** Task 1 的 atomic repository API 和现有 `useSyncApi` DTO。

**Produces:** `runSyncCycle()` 和 `orderMutationsForPush()`；Pinia 只管理可视状态和调度，不直接承载同步业务状态机。

- [ ] **Step 1: 写失败测试，确认 push 使用 immutable claimed mutation，且旧响应不覆盖新本地投影。**

  ```js
  test('sync cycle settles only the claimed mutation and preserves later pending work', async () => {
    const repository = createFakeRepositoryWithClaimedAndPendingMutation()
    const api = {
      pushChanges: async ({ mutations }) => ({
        results: [{ clientMutationId: mutations[0].clientMutationId, decision: 'APPLIED', resourceType: 'TASK', resourceId: 'task-1', current: { id: 'task-1', version: 2 } }],
        serverCursor: 'c-2',
      }),
      pullChanges: async () => ({ changes: [], nextCursor: 'c-2', hasMore: false, resetRequired: false }),
      getSnapshot: async () => ({ snapshotCursor: 'c-2', subjects: [], sources: [], knowledgeBlocks: [], tasks: [], relations: [] }),
    }

    await runSyncCycle({ repository, api, serverDeviceId: 'device-1' })
    assert.equal(repository.resource('TASK', 'task-1').syncStatus, 'pending')
    assert.deepEqual(repository.pendingIds(), ['m-2'])
  })
  ```

- [ ] **Step 2: 运行测试，确认 `syncCycle.ts` 尚不存在而失败。**

  Run: `node --experimental-strip-types --test scripts/r4-sync.test.mjs`

  Expected: FAIL，错误包含 `Cannot find module '../src/services/syncCycle.ts'`。

- [ ] **Step 3: 实现稳定的 dependency ordering。**

  `syncOrdering.ts` 必须导出：

  ```ts
  export function orderMutationsForPush(mutations: LocalMutation[]): LocalMutation[] {
    const createOrder = ['SUBJECT', 'SOURCE', 'KNOWLEDGE_BLOCK', 'TASK', 'RELATION']
    const deleteOrder = ['RELATION', 'KNOWLEDGE_BLOCK', 'TASK', 'SOURCE', 'SUBJECT']
    return [...mutations].sort((left, right) => {
      const leftOrder = left.mutationType === 'DELETE' ? deleteOrder : createOrder
      const rightOrder = right.mutationType === 'DELETE' ? deleteOrder : createOrder
      const leftPriority = leftOrder.indexOf(left.resourceType)
      const rightPriority = rightOrder.indexOf(right.resourceType)
      return leftPriority - rightPriority
        || left.createdAt.localeCompare(right.createdAt)
        || left.clientMutationId.localeCompare(right.clientMutationId)
    })
  }
  ```

- [ ] **Step 4: 实现 `runSyncCycle()`。**

  ```ts
  export async function runSyncCycle(input: SyncCycleInput): Promise<SyncCycleResult> {
    const claimed = orderMutationsForPush(await input.repository.claimPending(200))
    try {
      if (claimed.length > 0) {
        const pushed = await input.api.pushChanges({ serverDeviceId: input.serverDeviceId, mutations: claimed })
        for (const result of pushed.results) await settlePushResult(input.repository, result)
      }
    } catch (error) {
      await input.repository.releaseInflight(claimed.map((mutation) => mutation.clientMutationId))
      throw error
    }
    await pullToCursor(input.repository, input.api)
    return { changedResourceTypes: changedTypes, cursor: await input.repository.getSyncState() }
  }
  ```

  `settlePushResult()` 只结算 result 对应的 mutation。`APPLIED` 时仅当该资源没有其它未解决 mutation 才以 server `current` 和 server version 更新本地投影；`CONFLICT`/`REJECTED` 写入 mutation 的 `remoteValue/remoteVersion/error` 并让资源进入 `conflict`/`error`。`pullToCursor()` 对一个 response 内同资源的多条 change 只保留 cursor 最大的最终 change，保存 cursor 后一次性返回变更的 resource types。

- [ ] **Step 5: 为 snapshot/pull 投影保护补测试。**

  ```js
  test('pull retains a local unresolved resource and applies the latest server record after it settles', async () => {
    const repository = createRepositoryWithPendingTask('task-1', { title: 'local' })
    await applyPullPage(repository, [{ resourceType: 'TASK', resourceId: 'task-1', version: 4, mutationType: 'UPDATE', payload: { title: 'server' } }])
    assert.equal(repository.resource('TASK', 'task-1').value.title, 'local')

    await repository.settleMutation({ clientMutationId: 'm-1', status: 'conflict', remoteValue: { title: 'server' }, remoteVersion: 4 })
    assert.equal(repository.resource('TASK', 'task-1').syncStatus, 'conflict')
  })
  ```

- [ ] **Step 6: 将 `useSyncStore.ts` 改为 syncCycle 薄包装并验证。**

  保留 `cursor`、`isPulling`、`isPushing`、`lastSyncError` 的 UI 状态。删除 Store 内的 `applyPushResult`、`pullLoop` 和直接 `listPending()`/`markApplied()`逻辑，改由：

  ```ts
  async function flushNow(): Promise<void> {
    if (!isOnline()) return
    if (cyclePromise) return cyclePromise
    cyclePromise = runCycle('manual')
    try { await cyclePromise } finally { cyclePromise = null }
  }
  ```

  `runCycle()` 调用 `runSyncCycle()`、保存 Store cursor、发布 Task 3 的投影事件。`triggerSync` 暂时保留为 `flushNow` 的兼容别名，直到所有调用点迁移完成。

- [ ] **Step 7: 运行定向套件并提交。**

  Run: `node --experimental-strip-types --test scripts/r4-sync.test.mjs scripts/r4-local-repository.test.mjs`

  Expected: PASS。

  ```bash
  git add Auralis-PC/src/services/syncCycle.ts Auralis-PC/src/services/syncOrdering.ts Auralis-PC/src/store/useSyncStore.ts Auralis-PC/scripts/r4-sync.test.mjs Auralis-PC/scripts/r4-local-repository.test.mjs
  git commit -m "feat(pc): serialize cursor sync cycles"
  ```

## Task 3: 加入后台调度与本地投影通知

**Files:**

- Create: `Auralis-PC/src/services/localProjectionEvents.ts`
- Modify: `Auralis-PC/src/store/useSyncStore.ts`
- Modify: `Auralis-PC/src/App.vue`
- Modify: `Auralis-PC/src/services/realtimeController.ts`
- Modify: `Auralis-PC/src/views/Profile/index.vue`
- Test: `Auralis-PC/scripts/r4-sync.test.mjs`

**Consumes:** Task 2 的 `runSyncCycle()`。

**Produces:** `requestBackgroundSync(reason)`、`flushNow()` 和类型化的本地投影变更通知。

- [ ] **Step 1: 写失败测试，确认多个后台触发合并为一次同步。**

  ```js
  test('background sync coalesces multiple requests into one delayed cycle', async () => {
    const scheduler = createSyncScheduler({ delayMs: 300, run: async () => calls++ })
    scheduler.request('write')
    scheduler.request('realtime')
    scheduler.request('startup')
    await scheduler.flushTimersForTest()
    assert.equal(calls, 1)
  })
  ```

- [ ] **Step 2: 运行测试，确认 scheduler 尚不存在而失败。**

  Run: `node --experimental-strip-types --test scripts/r4-sync.test.mjs`

  Expected: FAIL，错误包含 `createSyncScheduler is not exported`。

- [ ] **Step 3: 实现投影事件与 500ms 后台调度器。**

  `localProjectionEvents.ts` 导出：

  ```ts
  export type ProjectionChange = { resourceTypes: ReadonlySet<string> }
  export function publishProjectionChange(change: ProjectionChange): void
  export function subscribeProjectionChange(listener: (change: ProjectionChange) => void): () => void
  ```

  `useSyncStore.ts` 导出 `requestBackgroundSync(reason: 'startup' | 'write' | 'realtime' | 'online' | 'read')`；它只设置一个 500ms timer。timer 触发后调用 `flushNow()`，若运行期间又收到 request，则在当前 cycle 完成后再执行一次。网络离线时不抛错、不清空 outbox。

- [ ] **Step 4: 迁移启动、实时、手动入口。**

  - `App.vue`：认证成功后先 `void taskStore.fetchTasks()` 展示本地，再 `syncStore.requestBackgroundSync('startup')`；`realtimeController.start()` 与 document runtime 均不等待网络。
  - `realtimeController.ts`：收到事件时改为 `syncStore.requestBackgroundSync('realtime')`，不 `await triggerSync()`。
  - `Profile/index.vue`：用户点击立即同步时改为 `await syncStore.flushNow()`，保留现有按钮 loading 和错误提示。

- [ ] **Step 5: 运行测试并提交。**

  Run: `node --experimental-strip-types --test scripts/r4-sync.test.mjs`

  Expected: PASS。

  ```bash
  git add Auralis-PC/src/services/localProjectionEvents.ts Auralis-PC/src/store/useSyncStore.ts Auralis-PC/src/App.vue Auralis-PC/src/services/realtimeController.ts Auralis-PC/src/views/Profile/index.vue Auralis-PC/scripts/r4-sync.test.mjs
  git commit -m "feat(pc): schedule sync outside interaction paths"
  ```

## Task 4: 将 Subject、Source、KnowledgeBlock 和 Task Store 收口到原子本地写入

**Files:**

- Modify: `Auralis-PC/src/store/useSubjectStore.ts`
- Modify: `Auralis-PC/src/store/useSourceStore.ts`
- Modify: `Auralis-PC/src/store/useKnowledgeStore.ts`
- Modify: `Auralis-PC/src/store/useTaskStore.ts`
- Modify: `Auralis-PC/scripts/r4-register-file.test.mjs`
- Modify: `Auralis-PC/scripts/r4-dashboard-timeline.test.mjs`

**Consumes:** Task 1 的 `commitMutation()`、Task 3 的 `requestBackgroundSync()` 与 projection events。

**Produces:** 所有普通资源写入都遵守“本地提交后更新 UI”；Store 不再以常规 API list 作为刷新来源。

- [ ] **Step 1: 写失败测试，禁止 Task 的远端优先删除和 UI 先写。**

  在 `r4-register-file.test.mjs` 将旧字符串断言替换为行为边界断言：

  ```js
  test('PC task writes commit locally before changing memory and never call CRUD endpoints', async () => {
    const taskStore = await readFile(new URL('../src/store/useTaskStore.ts', import.meta.url), 'utf8')
    const taskWrite = taskStore.slice(taskStore.indexOf('async function persistOffline'), taskStore.indexOf('const completedCount'))
    assert.match(taskWrite, /await repo\.commitMutation\(/)
    assert.match(taskWrite, /replaceInMemory\(task\)/)
    assert.ok(taskWrite.indexOf('await repo.commitMutation(') < taskWrite.indexOf('replaceInMemory(task)'))
    assert.doesNotMatch(taskWrite, /useTaskApi\.(delete|update|create)/)
  })
  ```

- [ ] **Step 2: 运行测试，确认它在旧 `persistOffline` 实现上失败。**

  Run: `node --experimental-strip-types --test scripts/r4-register-file.test.mjs`

  Expected: FAIL，错误显示 `commitMutation` 未匹配且仍匹配 `useTaskApi.delete`。

- [ ] **Step 3: 对四个 Store 使用统一写法。**

  每次 CREATE/UPDATE/DELETE 都构建 immutable DTO 和 mutation，再按下列顺序执行：

  ```ts
  await repo.commitMutation({
    resourceType: 'TASK',
    resourceId: model.id,
    value: taskDto(model),
    version: model.version,
    deletedAt: model.deletedAt ?? null,
    mutation: clientMutation(model.id, mutationType, model.version, payload),
  })
  replaceInMemory(toPresentationTask(model, 'pending_update'))
  useSyncStore().requestBackgroundSync('write')
  ```

  将类型替换为 Store 各自的 `SUBJECT`、`SOURCE`、`KNOWLEDGE_BLOCK`。删除使用已有 DTO value、`deletedAt: new Date().toISOString()` 和 `DELETE` mutation；不得调用 `useTaskApi.delete()`、`useSubjectApi.delete()`、`useSourceApi.delete()` 或 `useKnowledgeApi.delete()`。

- [ ] **Step 4: 删除普通资源的远端列表刷新。**

  删除 `refreshSubjects`、`refreshSources`、`refreshBlocks`、`refreshTasks` 和 `loadFromApi` 中的 API list/caching 路径。`loadSubjects`、`loadSources`、`fetchBlocks`、`fetchTasks` 只读取 repository 并立即结束 loading；结束后调用 `requestBackgroundSync('read')`，但不等待。

  每个 setup Store 用 `subscribeProjectionChange()` 监听所属 resource type：收到后仅调用自身本地 hydration 方法，绝不调用 API。Source hydration 仍要对同步后出现的 `AWAITING_CLIENT` FILE Source 调用既有 `documentScheduler.schedule()`；该调度失败仅记录后台诊断。

- [ ] **Step 5: 保留唯一的显式等待例外。**

  在 `useSourceStore.resumeDocumentProcessing()` 中把 `await useSyncStore().triggerSync()` 改为 `await useSyncStore().flushNow()`，随后检查 Source 本地投影已是 `synced` 才允许 `documentScheduler.schedule(sourceId)`。这是 FILE 服务端解析启动的前置条件，不能泛化给页面读取或普通编辑。

- [ ] **Step 6: 运行 Store 与页面定向测试。**

  Run: `node --experimental-strip-types --test scripts/r4-register-file.test.mjs scripts/r4-dashboard-timeline.test.mjs scripts/r4-task-store-schedule.test.mjs`

  Expected: 新增本地优先断言 PASS；任何已存在的时间轴视觉/拖放断言失败保持独立记录，不能通过放宽断言隐藏。

- [ ] **Step 7: Commit。**

  ```bash
  git add Auralis-PC/src/store/useSubjectStore.ts Auralis-PC/src/store/useSourceStore.ts Auralis-PC/src/store/useKnowledgeStore.ts Auralis-PC/src/store/useTaskStore.ts Auralis-PC/scripts/r4-register-file.test.mjs Auralis-PC/scripts/r4-dashboard-timeline.test.mjs
  git commit -m "feat(pc): make domain stores local first"
  ```

## Task 5: 把 cursor 同步变更安全写回本地投影

**Files:**

- Modify: `Auralis-PC/src/services/syncCycle.ts`
- Modify: `Auralis-PC/src/services/localRepository.ts`
- Modify: `Auralis-PC/scripts/r4-sync.test.mjs`
- Modify: `Auralis-PC/scripts/r4-local-repository.test.mjs`

**Consumes:** Tasks 1–4。

**Produces:** pull/snapshot 只使用服务端同一资源最后一条记录；未解决本地变更始终受保护；服务端已确认的最终 DTO 更新本地缓存并通过事件刷新界面。

- [ ] **Step 1: 写失败测试，验证同一 pull page 只写最后一条资源记录。**

  ```js
  test('pull applies only the latest change per resource before publishing projections', async () => {
    const repository = createEmptyRepository()
    const changes = [
      { cursor: 'c-10', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'UPDATE', version: 2, payload: { title: 'old' } },
      { cursor: 'c-11', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'UPDATE', version: 3, payload: { title: 'latest' } },
    ]
    await applyPullPage(repository, changes)
    assert.equal(repository.resource('TASK', 'task-1').value.title, 'latest')
    assert.equal(repository.resourceWritesFor('TASK', 'task-1'), 1)
  })
  ```

- [ ] **Step 2: 运行测试，确认旧实现逐条写入而失败。**

  Run: `node --experimental-strip-types --test scripts/r4-sync.test.mjs`

  Expected: FAIL，`resourceWritesFor` 为 `2` 或 helper 未导出。

- [ ] **Step 3: 实现 pull/snapshot 合并规则。**

  在 `syncCycle.ts`：

  ```ts
  function latestChangesByResource(changes: SyncChange[]): SyncChange[] {
    const latest = new Map<string, SyncChange>()
    for (const change of changes) latest.set(`${change.resourceType}\u0000${change.resourceId}`, change)
    return [...latest.values()]
  }
  ```

  对 `latestChangesByResource()` 的结果调用 repository 写入。写入前检查该 resource 的 unresolved mutation：存在则不触碰投影，仅推进 cursor；不存在则按 `deletedAt` 写墓碑或 current payload 写同步资源。snapshot 使用 `replaceSnapshotPreservingPending()`；该方法的 pending 集合必须包含 `inflight/conflict/error`，不只是 `pending`。

- [ ] **Step 4: 写并运行删除墓碑与重连测试。**

  ```js
  test('a remote tombstone removes a settled resource but never removes a pending local edit', async () => {
    const repository = createRepositoryWithSyncedTask('task-1')
    await applyPullPage(repository, [{ cursor: 'c-4', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'DELETE', version: 4, deletedAt: '2026-09-04T10:00:00Z', payload: null }])
    assert.equal(repository.resource('TASK', 'task-1').deletedAt, '2026-09-04T10:00:00Z')
  })
  ```

  Run: `node --experimental-strip-types --test scripts/r4-sync.test.mjs scripts/r4-local-repository.test.mjs`

  Expected: PASS。

- [ ] **Step 5: Commit。**

  ```bash
  git add Auralis-PC/src/services/syncCycle.ts Auralis-PC/src/services/localRepository.ts Auralis-PC/scripts/r4-sync.test.mjs Auralis-PC/scripts/r4-local-repository.test.mjs
  git commit -m "fix(pc): apply cursor changes without overwriting local writes"
  ```

## Task 6: 完整验证、文档回写与 Tauri 人工验收

**Files:**

- Modify: `docs/contracts/Database.md`
- Modify: `docs/project/Architecture.md`
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`
- Modify: `docs/README.md`（仅在新增文档入口需要调整时）

**Consumes:** Tasks 1–5 的实际命令输出。

**Produces:** 当前实现、数据库契约、自动验证和 GUI 边界分别可追溯，且不将自动测试写成跨端或 Tauri 人工验收。

- [ ] **Step 1: 写失败的全量边界守卫。**

  在 `r4-register-file.test.mjs` 增加：

  ```js
  test('ordinary PC resource stores do not refresh through resource list APIs', async () => {
    for (const file of ['useSubjectStore.ts', 'useSourceStore.ts', 'useKnowledgeStore.ts', 'useTaskStore.ts']) {
      const source = await readFile(new URL(`../src/store/${file}`, import.meta.url), 'utf8')
      assert.doesNotMatch(source, /await use(?:Subject|Source|Knowledge|Task)Api\.list\(/)
      assert.match(source, /requestBackgroundSync\('read'\)/)
    }
  })
  ```

- [ ] **Step 2: 运行定向和完整 PC 自动测试。**

  Run:

  ```bash
  node --experimental-strip-types --test scripts/r4-local-repository.test.mjs scripts/r4-sync.test.mjs scripts/r4-register-file.test.mjs scripts/r4-dashboard-timeline.test.mjs scripts/r4-task-store-schedule.test.mjs
  npm run test:r4-pc
  npm run type-check
  npm run check:r4-pc
  npm run build
  git diff --check
  ```

  Expected: 新增同步测试全部 PASS；既有失败必须以文件、测试名和与本改造的相关性记录在 `IssuesAndReview.md`，不修改测试来掩盖。

- [ ] **Step 3: 更新权威文档。**

  - `Database.md`：记录 v6 local mutation `inflight`、`remote_payload`、`remote_version`，并定义资源+outbox 的端侧原子提交和 cursor 投影保护。
  - `Architecture.md`：将本地优先流程更新为“本地事务 → 后台批量 push → cursor pull → 本地投影”，注明普通资源不走列表全量刷新。
  - `FrontendPC.md`：记录 Store 只能读取本地投影、`flushNow()` 的两种显式等待例外（手动同步、FILE 处理前确认）。
  - `Status.md`、`IssuesAndReview.md`：仅记录实际命令结果，保留双设备弱网、Tauri GUI、冲突可见性等未验收项目。
  - `Changelog.md`：列出已发生的 PC 同步行为变更和已实际通过的验证。

- [ ] **Step 4: 在 Tauri 做人工验收，不以命令结果替代。**

  1. 离线创建、编辑、删除 Subject、Task、KnowledgeBlock、Source；每项立即反映且重启后仍在。
  2. 恢复联网，确认待同步项一次批量上传；页面无重新转圈或因 pull 闪回旧值。
  3. 两台设备分别更新同一 Task；确认本地未发送期间不被远端覆盖，服务端返回冲突后同步状态明确且数据不静默丢失。
  4. 连续三次编辑同一 Task，确认旧 push 响应不能把最后一次编辑显示为已同步。
  5. 打开 Home、Dashboard、Timeline、SubjectWorkspace、Asset，确认首屏从本地投影渲染，网络慢时不等待资源列表 API。
  6. 创建 FILE Source 后在 Profile 手动启动本机处理，确认此处显式等待 Source 同步；其它普通页面不等待。

- [ ] **Step 5: Commit 文档和测试守卫。**

  ```bash
  git add docs/contracts/Database.md docs/project/Architecture.md docs/modules/FrontendPC.md docs/current/Status.md docs/current/IssuesAndReview.md docs/release/Changelog.md docs/README.md Auralis-PC/scripts/r4-register-file.test.mjs
  git commit -m "docs: record pc local first sync behavior"
  ```

## 计划自检

- 覆盖性：Task 1 解决本地原子性；Task 2 解决 immutable/inflight 与 cursor loop；Task 3 移除前台同步等待；Task 4 移除 Store 远端优先与列表刷新；Task 5 处理服务端最终记录的安全回写；Task 6 完成验证、文档和人工边界。
- API/数据库范围：服务端 `/api/sync` 契约不变；PC local schema 升级为 v6，属于 `Database.md` 必须记录的端侧数据结构变更。
- 冲突边界：本计划保存冲突诊断但不引入 CRDT、锁或人工冲突页面；不将服务端 baseVersion 冲突伪装成已成功同步。
- Placeholder scan：本计划不包含 TBD、TODO 或“同上”式实现步骤；所有新增接口、状态名、命令和验收动作已明确给出。

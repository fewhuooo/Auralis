import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { startPreviewServer } from './mobile-preview-server.mjs'

async function jsonFetch(baseUrl, path, init = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : undefined
  return { status: res.status, data }
}

test('loads subjects and due review cards from external fixture JSON with valid hashes', async (t) => {
  const started = await startPreviewServer({ port: 0, host: '127.0.0.1', staticDir: null })
  t.after(() => new Promise(resolve => started.server.close(resolve)))
  const baseUrl = `http://${started.host}:${started.port}`

  const snap = await jsonFetch(baseUrl, '/api/sync/snapshot')
  assert.equal(snap.status, 200)
  assert.equal(snap.data.subjects.length, 6)
  assert.equal(snap.data.knowledgeBlocks.length, 18)
  assert.ok(snap.data.tasks.some(task => task.scheduledAt && task.subject))
  assert.ok(snap.data.tasks.every(task => typeof task.sortKey === 'string' && Number.isNaN(Number(task.sortKey))))

  for (const subject of snap.data.subjects) {
    const queue = await jsonFetch(baseUrl, `/api/reviews/queue?subjectId=${encodeURIComponent(subject.id)}&at=${encodeURIComponent(new Date().toISOString())}`)
    assert.equal(queue.status, 200)
    assert.ok(queue.data.items.length >= 3, `Expected >= 3 due cards for subject ${subject.name}`)

    const first = queue.data.items[0]
    assert.ok(/^[0-9a-f]{64}$/.test(first.contentHash))
    const block = await jsonFetch(baseUrl, `/api/knowledge-blocks/${first.knowledgeBlockId}`)
    assert.equal(block.status, 200)
    assert.equal(block.data.version, first.knowledgeBlockVersion)
    assert.equal(block.data.subject, subject.name)
  }
})

test('review GOOD confirmation and idempotent replay consume card from due queue', async (t) => {
  const started = await startPreviewServer({ port: 0, host: '127.0.0.1', staticDir: null })
  t.after(() => new Promise(resolve => started.server.close(resolve)))
  const baseUrl = `http://${started.host}:${started.port}`

  const queueBefore = await jsonFetch(baseUrl, `/api/reviews/queue?at=${encodeURIComponent(new Date().toISOString())}`)
  const card = queueBefore.data.items[0]
  const reviewId = randomUUID()
  const attemptCmdId = randomUUID()

  const attempt = await jsonFetch(baseUrl, '/api/reviews/lifecycle/attempts', {
    method: 'POST',
    body: JSON.stringify({
      clientCommandId: attemptCmdId,
      knowledgeBlockId: card.knowledgeBlockId,
      knowledgeBlockVersion: card.knowledgeBlockVersion,
      contentHash: card.contentHash,
      baseVersion: card.version,
      reviewId,
      rating: 'GOOD',
      durationSeconds: 12,
    }),
  })
  assert.equal(attempt.status, 200)
  assert.equal(typeof attempt.data.state.version, 'number')

  const attemptReplay = await jsonFetch(baseUrl, '/api/reviews/lifecycle/attempts', {
    method: 'POST',
    body: JSON.stringify({
      clientCommandId: attemptCmdId,
      knowledgeBlockId: card.knowledgeBlockId,
      knowledgeBlockVersion: card.knowledgeBlockVersion,
      contentHash: card.contentHash,
      baseVersion: card.version,
      reviewId,
      rating: 'GOOD',
      durationSeconds: 12,
    }),
  })
  assert.equal(attemptReplay.status, 200)
  assert.equal(attemptReplay.data.commandId, attempt.data.commandId)

  const confirm = await jsonFetch(baseUrl, `/api/reviews/lifecycle/attempts/${reviewId}/confirmations`, {
    method: 'POST',
    body: JSON.stringify({
      clientCommandId: randomUUID(),
      knowledgeBlockId: card.knowledgeBlockId,
      knowledgeBlockVersion: card.knowledgeBlockVersion,
      contentHash: card.contentHash,
      baseVersion: attempt.data.state.version,
    }),
  })
  assert.equal(confirm.status, 200)
  assert.equal(confirm.data.effectiveReview.effectiveRating, 'GOOD')

  const queueAfter = await jsonFetch(baseUrl, `/api/reviews/queue?at=${encodeURIComponent(new Date().toISOString())}`)
  assert.equal(queueAfter.data.items.length, queueBefore.data.items.length - 1)
  assert.ok(!queueAfter.data.items.some(item => item.knowledgeBlockId === card.knowledgeBlockId))
})

test('supports sync push mutations, focus session stats, and reloads external JSON edits without hardcoded data', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'auralis-mobile-preview-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const fixturePath = join(dir, 'custom-preview.json')

  const initialFixture = {
    user: { id: randomUUID(), username: 'tester', displayName: 'Tester', email: 't@example.com', version: 1 },
    subjects: [{ id: randomUUID(), name: '量子物理', description: '波函数与算符', iconKey: 'research', sortKey: '001', version: 1 }],
    knowledgeBlocks: [],
    tasks: [],
    sources: [],
    conversations: [],
    statsBaseline: { historicalFocusSeconds: 600, historicalFocusCompletedCount: 1 },
  }
  await writeFile(fixturePath, JSON.stringify(initialFixture, null, 2), 'utf8')

  const started = await startPreviewServer({ port: 0, host: '127.0.0.1', dataPath: fixturePath, staticDir: null })
  t.after(() => new Promise(resolve => started.server.close(resolve)))
  const baseUrl = `http://${started.host}:${started.port}`

  const snap1 = await jsonFetch(baseUrl, '/api/sync/snapshot')
  assert.equal(snap1.data.subjects.map(s => s.name).join(','), '量子物理')

  const newSubId = randomUUID()
  const push = await jsonFetch(baseUrl, '/api/sync/push', {
    method: 'POST',
    body: JSON.stringify({
      serverDeviceId: randomUUID(),
      mutations: [{
        clientMutationId: randomUUID(),
        resourceType: 'SUBJECT',
        resourceId: newSubId,
        mutationType: 'CREATE',
        baseVersion: 0,
        payload: { name: '热力学', description: '熵与统计力学', iconKey: 'analysis', sortKey: '002' },
      }],
    }),
  })
  assert.equal(push.status, 200)
  assert.equal(push.data.results[0].decision, 'APPLIED')

  const pullSameEpoch = await jsonFetch(baseUrl, `/api/sync/pull?cursor=${encodeURIComponent(snap1.data.snapshotCursor)}`)
  assert.equal(pullSameEpoch.data.resetRequired, false)
  assert.equal(pullSameEpoch.data.changes.length, 1)
  assert.equal(pullSameEpoch.data.changes[0].payload.name, '热力学')

  const focusRes = await jsonFetch(baseUrl, '/api/focus-sessions', {
    method: 'POST',
    body: JSON.stringify({ clientSessionId: randomUUID(), durationSeconds: 1500, completed: true }),
  })
  assert.equal(focusRes.status, 201)
  const stats = await jsonFetch(baseUrl, '/api/stats/overview')
  assert.equal(stats.data.focusSeconds, 2100)
  assert.equal(stats.data.focusCompletedCount, 2)

  // Modify the external JSON on disk and verify mtime-based reload triggers resetRequired for stale cursor
  await new Promise(r => setTimeout(r, 30))
  const edited = JSON.parse(await readFile(fixturePath, 'utf8'))
  edited.subjects[0].name = '编译原理实战'
  await writeFile(fixturePath, JSON.stringify(edited, null, 2), 'utf8')

  const pullAfterEdit = await jsonFetch(baseUrl, `/api/sync/pull?cursor=${encodeURIComponent(push.data.serverCursor)}`)
  assert.equal(pullAfterEdit.data.resetRequired, true)

  const snap2 = await jsonFetch(baseUrl, '/api/sync/snapshot')
  assert.equal(snap2.data.subjects.map(s => s.name).join(','), '编译原理实战')

  // Simulate a server restart after editing JSON: a fresh server instance must still reject an old-fixture cursor
  await new Promise(resolve => started.server.close(resolve))
  const restarted = await startPreviewServer({ port: 0, host: '127.0.0.1', dataPath: fixturePath, staticDir: null })
  t.after(() => new Promise(resolve => restarted.server.close(resolve)))
  const restartedBaseUrl = `http://${restarted.host}:${restarted.port}`

  const pullAfterRestartWithOldCursor = await jsonFetch(
    restartedBaseUrl,
    `/api/sync/pull?cursor=${encodeURIComponent(snap1.data.snapshotCursor)}`,
  )
  assert.equal(pullAfterRestartWithOldCursor.data.resetRequired, true)
})

test('persists AI messages/scope, avoids double-counting weekly tasks, keeps AGAIN re-reviewable, and serves uploaded preview assets', async (t) => {
  const started = await startPreviewServer({ port: 0, host: '127.0.0.1', staticDir: null })
  t.after(() => new Promise(resolve => started.server.close(resolve)))
  const baseUrl = `http://${started.host}:${started.port}`

  const snap = await jsonFetch(baseUrl, '/api/sync/snapshot')
  const subjectId = snap.data.subjects[0].id
  const pendingTask = snap.data.tasks.find(task => task.status === 'TODO')

  const weeklyBefore = await jsonFetch(baseUrl, '/api/stats/weekly')
  const doneBefore = weeklyBefore.data.days[0].completedTaskCount

  await jsonFetch(baseUrl, '/api/sync/push', {
    method: 'POST',
    body: JSON.stringify({
      serverDeviceId: randomUUID(),
      mutations: [{
        clientMutationId: randomUUID(),
        resourceType: 'TASK',
        resourceId: pendingTask.id,
        mutationType: 'UPDATE',
        baseVersion: pendingTask.version,
        payload: { ...pendingTask, status: 'DONE' },
      }],
    }),
  })
  const weeklyAfterDone = await jsonFetch(baseUrl, '/api/stats/weekly')
  assert.equal(weeklyAfterDone.data.days[0].completedTaskCount, doneBefore + 1)

  await jsonFetch(baseUrl, '/api/sync/push', {
    method: 'POST',
    body: JSON.stringify({
      serverDeviceId: randomUUID(),
      mutations: [{
        clientMutationId: randomUUID(),
        resourceType: 'TASK',
        resourceId: pendingTask.id,
        mutationType: 'UPDATE',
        baseVersion: pendingTask.version + 1,
        payload: { ...pendingTask, status: 'TODO' },
      }],
    }),
  })
  const weeklyAfterUndo = await jsonFetch(baseUrl, '/api/stats/weekly')
  assert.equal(weeklyAfterUndo.data.days[0].completedTaskCount, doneBefore)

  // AI conversation scope binding & message persistence
  const createdConv = await jsonFetch(baseUrl, '/api/ai/conversations', {
    method: 'POST',
    body: JSON.stringify({ title: '测试会话', baseVersion: 0 }),
  })
  const streamRes = await fetch(`${baseUrl}/api/ai/messages/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      protocolVersion: 1,
      action: 'turn',
      conversationId: createdConv.data.id,
      requestId: randomUUID(),
      content: '讲解中值定理',
      readingContext: { subjectId, retrievalMode: 'SUBJECT', sourceIds: [] },
    }),
  })
  assert.equal(streamRes.status, 200)
  await streamRes.text()
  const fetchedConv = await jsonFetch(baseUrl, `/api/ai/conversations/${createdConv.data.id}`)
  assert.equal(fetchedConv.data.chatScopeState, 'BOUND')
  assert.equal(fetchedConv.data.chatScope.subjectId, subjectId)
  assert.equal(fetchedConv.data.messages.length, 2)

  // Asset upload -> download-url -> GET /__preview-asset/:id
  const intent = await jsonFetch(baseUrl, '/api/assets/upload-intents', {
    method: 'POST',
    body: JSON.stringify({
      baseVersion: 0,
      clientImportId: randomUUID(),
      originalName: 'notes.md',
      sizeBytes: 11,
      mimeType: 'text/markdown',
    }),
  })
  assert.equal(intent.status, 201)
  const putRes = await fetch(intent.data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/markdown' },
    body: '# Test Note',
  })
  assert.equal(putRes.status, 200)
  const dl = await jsonFetch(baseUrl, `/api/assets/${intent.data.assetId}/download-url`, { method: 'POST' })
  assert.equal(dl.status, 200)
  assert.equal(dl.data.mimeType, 'text/markdown')
  const assetRes = await fetch(dl.data.url)
  assert.equal(assetRes.status, 200)
  assert.equal(await assetRes.text(), '# Test Note')

  // AGAIN rating sets needsLearning=true matching PC/server lifecycle, stays queryable via /states, and resolves via learning-completions
  const queue = await jsonFetch(baseUrl, `/api/reviews/queue?subjectId=${encodeURIComponent(subjectId)}&at=${encodeURIComponent(new Date().toISOString())}`)
  const card = queue.data.items[0]
  const againReviewId = randomUUID()
  const again = await jsonFetch(baseUrl, '/api/reviews/lifecycle/attempts', {
    method: 'POST',
    body: JSON.stringify({
      clientCommandId: randomUUID(),
      knowledgeBlockId: card.knowledgeBlockId,
      knowledgeBlockVersion: card.knowledgeBlockVersion,
      contentHash: card.contentHash,
      baseVersion: card.version,
      reviewId: againReviewId,
      rating: 'AGAIN',
      durationSeconds: 5,
    }),
  })
  assert.equal(again.status, 200)
  assert.equal(again.data.state.needsLearning, true)

  const statesAfterAgain = await jsonFetch(baseUrl, `/api/reviews/states?subjectId=${encodeURIComponent(subjectId)}`)
  assert.equal(statesAfterAgain.status, 200)
  assert.ok(statesAfterAgain.data.items.some(item => item.knowledgeBlockId === card.knowledgeBlockId && item.needsLearning === true))

  const rejectedAttempt = await jsonFetch(baseUrl, '/api/reviews/lifecycle/attempts', {
    method: 'POST',
    body: JSON.stringify({
      clientCommandId: randomUUID(),
      knowledgeBlockId: card.knowledgeBlockId,
      knowledgeBlockVersion: card.knowledgeBlockVersion,
      contentHash: card.contentHash,
      baseVersion: again.data.state.version,
      reviewId: randomUUID(),
      rating: 'GOOD',
      durationSeconds: 3,
    }),
  })
  assert.equal(rejectedAttempt.status, 409)

  const completeCmdId = randomUUID()
  const completedLearning = await jsonFetch(baseUrl, '/api/reviews/lifecycle/learning-completions', {
    method: 'POST',
    body: JSON.stringify({
      clientCommandId: completeCmdId,
      knowledgeBlockId: card.knowledgeBlockId,
      knowledgeBlockVersion: card.knowledgeBlockVersion,
      contentHash: card.contentHash,
      baseVersion: again.data.state.version,
      reviewId: againReviewId,
    }),
  })
  assert.equal(completedLearning.status, 200)
  assert.equal(completedLearning.data.action, 'LEARNING_COMPLETED')
  assert.equal(completedLearning.data.state.needsLearning, false)

  const replayedLearning = await jsonFetch(baseUrl, '/api/reviews/lifecycle/learning-completions', {
    method: 'POST',
    body: JSON.stringify({
      clientCommandId: completeCmdId,
      knowledgeBlockId: card.knowledgeBlockId,
      knowledgeBlockVersion: card.knowledgeBlockVersion,
      contentHash: card.contentHash,
      baseVersion: again.data.state.version,
      reviewId: againReviewId,
    }),
  })
  assert.equal(replayedLearning.status, 200)
  assert.equal(replayedLearning.data.commandId, completedLearning.data.commandId)
})

test('self-test review works after due queue empties and matches server scheduling rules', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'auralis-mobile-selftest-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const fixturePath = join(dir, 'selftest.json')
  const subjectId = randomUUID()
  const dueBlockId = randomUUID()
  const finalBlockId = randomUUID()
  const masteredBlockId = randomUUID()
  const thirtyOneDaysAgo = new Date(Date.now() - 31 * 86_400_000).toISOString()
  await writeFile(fixturePath, JSON.stringify({
    user: { id: randomUUID(), username: 'tester', displayName: 'Tester', email: 't@example.com', version: 1 },
    subjects: [{ id: subjectId, name: '编译原理', iconKey: 'code', sortKey: '001', version: 1 }],
    knowledgeBlocks: [
      {
        id: dueBlockId,
        subjectId,
        title: 'LL(1) 分析表',
        content: 'First 与 Follow 集构造',
        version: 1,
        review: { dueOffsetHours: -2, stableSuccessCount: 1, nextReviewStage: 'CROSS_DAY' },
      },
      {
        id: finalBlockId,
        subjectId,
        title: 'DAG 局部优化',
        content: '公共子表达式消除',
        version: 1,
        review: { dueOffsetHours: -1, stableSuccessCount: 3, nextReviewStage: 'FINAL_VERIFICATION', lastPracticeAt: thirtyOneDaysAgo },
      },
      {
        id: masteredBlockId,
        subjectId,
        title: 'LR(1) 状态闭包',
        content: '展望符传播',
        version: 1,
        review: { dueOffsetHours: 720, mastered: true, stableSuccessCount: 3, nextReviewStage: null },
      },
    ],
    tasks: [],
    sources: [],
    conversations: [],
  }, null, 2), 'utf8')

  const started = await startPreviewServer({ port: 0, host: '127.0.0.1', dataPath: fixturePath, staticDir: null })
  t.after(() => new Promise(resolve => started.server.close(resolve)))
  const baseUrl = `http://${started.host}:${started.port}`

  const dueQueue1 = await jsonFetch(baseUrl, `/api/reviews/queue?subjectId=${subjectId}&at=${encodeURIComponent(new Date().toISOString())}`)
  assert.equal(dueQueue1.data.items.length, 2)
  const dueItem = dueQueue1.data.items.find(item => item.knowledgeBlockId === dueBlockId)
  const finalItem = dueQueue1.data.items.find(item => item.knowledgeBlockId === finalBlockId)

  const r1 = randomUUID()
  const a1 = await jsonFetch(baseUrl, '/api/reviews/lifecycle/attempts', {
    method: 'POST',
    body: JSON.stringify({
      clientCommandId: randomUUID(),
      knowledgeBlockId: dueItem.knowledgeBlockId,
      knowledgeBlockVersion: dueItem.knowledgeBlockVersion,
      contentHash: dueItem.contentHash,
      baseVersion: dueItem.version,
      reviewId: r1,
      rating: 'GOOD',
      durationSeconds: 4,
    }),
  })
  assert.equal(a1.data.state.stableSuccessCount, 1)
  const c1 = await jsonFetch(baseUrl, `/api/reviews/lifecycle/attempts/${r1}/confirmations`, {
    method: 'POST',
    body: JSON.stringify({
      clientCommandId: randomUUID(),
      knowledgeBlockId: dueItem.knowledgeBlockId,
      knowledgeBlockVersion: dueItem.knowledgeBlockVersion,
      contentHash: dueItem.contentHash,
      baseVersion: a1.data.state.version,
    }),
  })
  assert.equal(c1.status, 200)
  assert.equal(c1.data.state.stableSuccessCount, 2)

  // FINAL_VERIFICATION (>=30d) stays mastered=false during attempts, then graduates to mastered=true on confirmation
  const rFinal = randomUUID()
  const aFinal = await jsonFetch(baseUrl, '/api/reviews/lifecycle/attempts', {
    method: 'POST',
    body: JSON.stringify({
      clientCommandId: randomUUID(),
      knowledgeBlockId: finalItem.knowledgeBlockId,
      knowledgeBlockVersion: finalItem.knowledgeBlockVersion,
      contentHash: finalItem.contentHash,
      baseVersion: finalItem.version,
      reviewId: rFinal,
      rating: 'GOOD',
      durationSeconds: 5,
    }),
  })
  assert.equal(aFinal.data.state.mastered, false)
  const cFinal = await jsonFetch(baseUrl, `/api/reviews/lifecycle/attempts/${rFinal}/confirmations`, {
    method: 'POST',
    body: JSON.stringify({
      clientCommandId: randomUUID(),
      knowledgeBlockId: finalItem.knowledgeBlockId,
      knowledgeBlockVersion: finalItem.knowledgeBlockVersion,
      contentHash: finalItem.contentHash,
      baseVersion: aFinal.data.state.version,
    }),
  })
  assert.equal(cFinal.data.state.mastered, true)
  assert.equal(cFinal.data.state.nextReviewStage, null)

  // Queue is now empty, while /states still returns all learned blocks for self-test
  const dueQueue2 = await jsonFetch(baseUrl, `/api/reviews/queue?subjectId=${subjectId}&at=${encodeURIComponent(new Date().toISOString())}`)
  assert.equal(dueQueue2.data.items.length, 0)
  const statesRes = await jsonFetch(baseUrl, `/api/reviews/states?subjectId=${subjectId}`)
  assert.equal(statesRes.data.items.length, 3)

  // Ahead-of-due GOOD on dueBlock does not falsely bump stableSuccessCount or overwrite dueAt
  const futureItem = statesRes.data.items.find(item => item.knowledgeBlockId === dueBlockId)
  const r2 = randomUUID()
  const a2 = await jsonFetch(baseUrl, '/api/reviews/lifecycle/attempts', {
    method: 'POST',
    body: JSON.stringify({
      clientCommandId: randomUUID(),
      knowledgeBlockId: futureItem.knowledgeBlockId,
      knowledgeBlockVersion: futureItem.knowledgeBlockVersion,
      contentHash: futureItem.contentHash,
      baseVersion: futureItem.version,
      reviewId: r2,
      rating: 'GOOD',
      durationSeconds: 3,
    }),
  })
  const c2 = await jsonFetch(baseUrl, `/api/reviews/lifecycle/attempts/${r2}/confirmations`, {
    method: 'POST',
    body: JSON.stringify({
      clientCommandId: randomUUID(),
      knowledgeBlockId: futureItem.knowledgeBlockId,
      knowledgeBlockVersion: futureItem.knowledgeBlockVersion,
      contentHash: futureItem.contentHash,
      baseVersion: a2.data.state.version,
    }),
  })
  assert.equal(c2.data.state.stableSuccessCount, 2)
  assert.equal(c2.data.state.dueAt, futureItem.dueAt)

  // GOOD on mastered block keeps mastered=true
  const masteredItem = statesRes.data.items.find(item => item.knowledgeBlockId === masteredBlockId)
  const r3 = randomUUID()
  const a3 = await jsonFetch(baseUrl, '/api/reviews/lifecycle/attempts', {
    method: 'POST',
    body: JSON.stringify({
      clientCommandId: randomUUID(),
      knowledgeBlockId: masteredItem.knowledgeBlockId,
      knowledgeBlockVersion: masteredItem.knowledgeBlockVersion,
      contentHash: masteredItem.contentHash,
      baseVersion: masteredItem.version,
      reviewId: r3,
      rating: 'GOOD',
      durationSeconds: 2,
    }),
  })
  const c3 = await jsonFetch(baseUrl, `/api/reviews/lifecycle/attempts/${r3}/confirmations`, {
    method: 'POST',
    body: JSON.stringify({
      clientCommandId: randomUUID(),
      knowledgeBlockId: masteredItem.knowledgeBlockId,
      knowledgeBlockVersion: masteredItem.knowledgeBlockVersion,
      contentHash: masteredItem.contentHash,
      baseVersion: a3.data.state.version,
    }),
  })
  assert.equal(c3.data.state.mastered, true)
  assert.equal(c3.data.state.dueAt, masteredItem.dueAt)
})

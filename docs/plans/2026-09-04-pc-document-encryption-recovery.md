# PC 文档处理密钥恢复边界 Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让终态历史任务的残留加密 receipt 不再阻止新主密钥初始化，同时继续保护可续传缓存不被错误密钥覆盖。

**Architecture:** 将“此任务是否必须恢复已有密钥”的判定提取为无副作用的纯函数。运行时只对带缓存的可续传上传阶段调用该判定；随后继续沿用现有 e2ee 初始化和 Rust 新 package 兜底，不修改任何既有缓存的读取、上传或删除命令。

**Tech Stack:** Vue 3、TypeScript、Node `node:test`（`--experimental-strip-types`）、Tauri/Rust 既有安全边界。

## 2026-10-10 已确认的后续产品决策

本计划原定“可续传 cache 缺少原密钥时保留恢复错误”描述的是当前 fail-closed 行为。最新产品决策要求：keyring 明确确认密钥不存在时，创建新密钥、废弃该任务的旧加密 cache/receipt/续传进度，并从可取得的原始文件重新处理上传；没有可用原始输入时提示用户重新选择文件。新密钥不得尝试解密旧密文。keyring 访问被拒或其他错误仍报告原错误，不自动轮换密钥。

该行为尚未实现；完成时应补充旧 cache 不会被读取、失效检查点不会重新进入旧续传、原始输入不可用时提示明确，以及非缺失类 keyring 错误不轮换的自动回归和 Windows Tauri/真实 Server 验收。现有下方 Task 1/2 记录的是先前恢复边界工作，不得据此把上述新决策写成已实现。

## Global Constraints

- 主密钥仍存放在 OS keyring `auralis/master_key`，不写入 SQLite、localStorage 或日志。
- `READY`、`FAILED_LOCAL`、`FAILED_SERVER` 终态任务的 receipt 不得阻塞首次初始化。
- 当前实现对有 `payloadCacheId` 或 `payloadReceipt` 的 `PACKAGING`、`UPLOADING`、`SERVER_VALIDATING`、`SERVER_INDEXING`、`PAUSED_NETWORK` 任务仍报告 `DOCUMENT_ENCRYPTION_KEY_RECOVERY_REQUIRED`；这不是 2026-10-10 决策的目标行为。
- 读取既有 cache 必须使用创建它的原密钥；keyring 明确确认该密钥丢失后，废弃旧 cache/receipt/续传状态并新建 package，不得用新密钥读取旧 cache。
- 不更改 API、数据库 schema、Source 同步契约或已存在的用户工作树改动。

---

### Task 1: 显式建模密钥恢复判定并接入 runtime

**Files:**
- Create: `Auralis-PC/src/services/documentProcessing/encryptionRecovery.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/runtime.ts:1-260`
- Modify: `Auralis-PC/scripts/r4-document-processing-runtime.test.mjs:1-80`

**Interfaces:**
- Consumes: `DocumentProcessingJob.phase`, `payloadCacheId`, `payloadReceipt`。
- Produces: `requiresDocumentEncryptionKeyRecovery(job): boolean`，供 `DocumentProcessingRuntime.ensureEncryptionReady()` 使用。

- [ ] **Step 1: 写出失败的行为测试**

在 `r4-document-processing-runtime.test.mjs` 加入对纯函数的直接导入和以下测试：

```js
import { requiresDocumentEncryptionKeyRecovery } from '../src/services/documentProcessing/encryptionRecovery.ts'

const cachedJob = (phase) => ({ phase, payloadCacheId: 'cache-1', payloadReceipt: { cacheId: 'cache-1' } })

test('only resumable encrypted-cache phases require the original master key', () => {
  for (const phase of ['PACKAGING', 'UPLOADING', 'SERVER_VALIDATING', 'SERVER_INDEXING', 'PAUSED_NETWORK']) {
    assert.equal(requiresDocumentEncryptionKeyRecovery(cachedJob(phase)), true)
  }
  for (const phase of ['READY', 'FAILED_LOCAL', 'FAILED_SERVER', 'QUEUED', 'EXTRACTING', 'OCR_RUNNING']) {
    assert.equal(requiresDocumentEncryptionKeyRecovery(cachedJob(phase)), false)
  }
  assert.equal(requiresDocumentEncryptionKeyRecovery({ phase: 'PAUSED_NETWORK', payloadCacheId: null, payloadReceipt: null }), false)
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --experimental-strip-types --test scripts/r4-document-processing-runtime.test.mjs`

Expected: FAIL，原因是 `encryptionRecovery.ts` 或导出的判定函数尚不存在。

- [ ] **Step 3: 实现最小纯函数并替换宽泛检查**

创建 `encryptionRecovery.ts`：

```ts
import type { DocumentProcessingJob } from '@/types/documentProcessing'

const RECOVERABLE_CACHE_PHASES = new Set<DocumentProcessingJob['phase']>([
  'PACKAGING', 'UPLOADING', 'SERVER_VALIDATING', 'SERVER_INDEXING', 'PAUSED_NETWORK',
])

export function requiresDocumentEncryptionKeyRecovery(
  job: Pick<DocumentProcessingJob, 'phase' | 'payloadCacheId' | 'payloadReceipt'>,
): boolean {
  return RECOVERABLE_CACHE_PHASES.has(job.phase)
    && (job.payloadCacheId !== null || job.payloadReceipt !== null)
}
```

在 `runtime.ts` 导入函数，并将：

```ts
const hasRecoverableCache = jobs.some((job) => job.payloadCacheId !== null || job.payloadReceipt !== null)
```

替换为：

```ts
const hasRecoverableCache = jobs.some(requiresDocumentEncryptionKeyRecovery)
```

不改变 `e2ee.initialize()` 或 Rust `ensure_master_key_bytes()` 的调用顺序。

- [ ] **Step 4: 运行定向回归并确认通过**

Run: `node --experimental-strip-types --test scripts/r4-document-processing-runtime.test.mjs`

Expected: PASS，包含新行为测试和既有 runtime/native-boundary 断言。

- [ ] **Step 5: 提交代码与定向测试**

```bash
git add Auralis-PC/src/services/documentProcessing/encryptionRecovery.ts Auralis-PC/src/services/documentProcessing/runtime.ts Auralis-PC/scripts/r4-document-processing-runtime.test.mjs
git commit -m "fix: unblock document encryption initialization"
```

### Task 2: 完成回归、文档状态回写与检查

**Files:**
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`
- Modify: `docs/plans/2026-09-04-pc-document-encryption-recovery.md`

**Interfaces:**
- Consumes: Task 1 的 `requiresDocumentEncryptionKeyRecovery()` 和实际命令输出。
- Produces: 现行文档中可区分代码/自动测试与 Windows Tauri 人工验收的准确状态。

- [ ] **Step 1: 运行文档处理完整定向套件**

Run: `node --experimental-strip-types --test scripts/r4-document-job-schema.test.mjs scripts/r4-document-job-runner.test.mjs scripts/r4-source-processing-schedule.test.mjs scripts/r4-document-processing-flow.test.mjs scripts/r4-parsed-document-upload.test.mjs scripts/r4-document-processing-runtime.test.mjs scripts/r4-document-processing-ui.test.mjs`

Expected: PASS；证明本轮修改未破坏任务 schema、runner、调度、上传协调、runtime 或任务中心契约。

- [ ] **Step 2: 运行 TypeScript 检查和 diff 检查**

Run: `npm.cmd run type-check`

Expected: 退出码 0；若失败，记录实际既有错误，不将其归因于密钥恢复修复。

Run: `git diff --check`

Expected: 退出码 0。

- [ ] **Step 3: 回写文档与计划复选框**

在 `FrontendPC.md` 的文档处理边界说明：终态 receipt 不再阻止 keyring 首次初始化；可续传 cache 仍要求原密钥。将本计划全部复选框改为 `[x]`。在 `Status.md` 和 `IssuesAndReview.md` 中记录实际定向测试结果、仍待 Windows Tauri keyring/真实 cache 的人工验收边界；在 `Changelog.md` 记录已发生的修复，避免声明 GUI 已验收。

- [ ] **Step 4: 提交文档与验证证据**

```bash
git add docs/modules/FrontendPC.md docs/current/Status.md docs/current/IssuesAndReview.md docs/release/Changelog.md docs/plans/2026-09-04-pc-document-encryption-recovery.md
git commit -m "docs: record document encryption recovery fix"
```

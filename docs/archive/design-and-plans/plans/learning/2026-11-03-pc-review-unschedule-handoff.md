# PC 复习同步与取消排期修复交接

日期：2026-11-03

状态：方案与现场定位完成；PC 端由用户实施，本文不表示已修复或已验收。

范围：复习状态的审计时间精度比较、未发送误冲突定向恢复、取消排期进入现有持久队列。后端回执精度与 Overview 并发修复由当前后端任务负责。

## 1. 复习同步

### 现场与原因

本机 8 条 REVIEW_CONFIRMED、2 条 REVIEW_SELECTED 被标为 conflict，均为 prepared=false。在 canonicalAnchor 与云端 history 的对照中，业务字段和版本一致，差异为 createdAt/updatedAt：

| 本地回执时间 | PostgreSQL 重读时间 |
| --- | --- |
| 2026-11-03T11:53:24.375032699Z | 2026-11-03T11:53:24.375033Z |
| 2026-11-03T11:53:25.555019533Z | 2026-11-03T11:53:25.555020Z |

`reviewSyncService.ts` 的 `sameRemoteAnchor`、`matchesMetadataOnlyUpdate` 对完整 state 做 stableJson 比较，故发送前即误冲突。后端将冻结数据库回读后的新回执；旧冻结回执保持原样。

### 修改位置和比较规则

- `Auralis-PC/src/services/reviewSyncService.ts`：`sameRemoteAnchor`、`matchesMetadataOnlyUpdate`、`matchesContentInvalidation` 中的 state 比较。
- 仅 createdAt/updatedAt 接受精确的数据库微秒表示等价；其他字段、commands、effectiveReviews 保持现行完整校验。
- 使用精确小数/整数时间解析；覆盖时区、合法 RFC3339、小数补零和跨秒进位。舍入边界通过隔离 PostgreSQL/JDBC round-trip 测试确定，不用 Date.parse 毫秒相等或任意时间容差。
- 保留原始 anchor、preparation.anchorFingerprint、occurredAt 和 payload；比较使用独立投影，不能原地规范化存储记录。
- 业务时间 dueAt、lastPracticeAt、selectedAt 等继续按现行契约校验。无效时间、缺失时间不能因规范化而被当作相等。

### 已有误冲突恢复

`processBlock` 目前遇 conflict 就返回；只修比较不会恢复已存在的 10 条记录。恢复应在该提前返回之前进入严格受限的重新核验路径：

1. 固定 user/device/session scope，读取当前活动 KB、Subject、正式记录和 FIFO 队首。
2. 只处理 status=conflict 且 prepared=false 的队首；prepared=true、已派发或结果未知的命令不进入恢复。
3. 读取 protocolVersion=2 完整 history，复用原有 preparation/自身 predecessor ACK 血缘证明。
4. 证明原严格比较失败，而仅对两个审计时间使用精度等价后完整匹配；版本、正文 hash、身份、命令历史等不得存在其他差异。
5. 在 `ReviewRepository.executeAtomicReviewCommit` 的原子边界重核 scope、KB/Subject、record revision、intent 状态以及原 payload/preparation。
6. 以带 status/prepared/payload/preparation 条件的 CAS 将单条 conflict 改为 pending；保留 clientCommandId、occurredAt、FIFO 顺序和原载荷。
7. 继续正常 prepare → freeze → dispatch → ACK，成功后才处理后继。不得直接标 applied 或整批解锁。

无法证明以上条件时，继续保留冲突与本机操作。恢复不选择云端进度、不归档用户操作，不修改已发送请求。

### 回归

扩展 `r4-review-local-first.test.mjs`、`r4-review-sync-concurrency.test.mjs` 及相应仓储测试：

- 两种现场误冲突分别恢复，ID/操作时间/原 payload/preparation 不变。
- 审计时间舍入、跨秒、无效输入，以及业务时间或其他字段真正变化。
- prepared=true、外来 command、同 ID 不同内容、正文变化、Subject 移动不能误恢复。
- 原子校验期间账号变化、intent 变化或新写入，CAS 拒绝恢复。
- 多个本机后继严格沿实际 ACK 前缀逐条恢复。
- SQLite 与 browser fallback，当前 Web Locks 测试环境条件明确。

## 2. 取消排期

### 现场与原因

`Timeline.handleDropOnPending → useTaskStore.unscheduleTask → updateTaskModel → commitMutation` 使用普通 UPDATE；前序 INSERTION/SWAP 尚未结算时被 `assertNoScheduleFence` 拒绝。现场报错中的 UUID 为 clientMutationId，前序命令后来已 applied，并非持续服务端拒绝。

### 实施方式

取消排期属于现有持久排期队列，wire 仍使用已有 `TASK/UPDATE`、`scheduledAt:null`；不新增服务器取消接口，不创建第二套队列。

| 位置 | 必须完成的行为 |
| --- | --- |
| `src/store/useTaskStore.ts` | unscheduleTask 复用排期原子提交，界面立即移回待办；保留已完成任务固定限制，操作队列不等待网络 |
| `src/services/localRepository.ts` | 本地取消标记纳入排期分类、基线核对、FIFO 领取、版本衔接、回执结算和重启恢复；普通其他 CRUD 保留现有保护 |
| `src/services/syncCycle.ts` | 仅对取消队列项把普通 UPDATE 的单 Task 响应交给同一排期结算路径；拒绝、PROCESSING、预测偏差、墓碑沿现有恢复语义处理 |
| `src/api/useSyncApi.ts` | 明确取消请求的 wire 白名单，本地标记与 `_local*` 字段不得上传 |
| 本地 mutation 类型 | 定义明确的端侧取消分类；保持服务器 mutationType 为 UPDATE |

### 队列约束

- 本地取消投影和命令同一事务或 browser lock 保存，并在保存时原子核对排期基线。
- 插入、交换、取消只领取持久顺序的队首。
- 前驱成功仅衔接未首发后继的 baseVersion 及载荷对应字段；首次派发后同 ID 同载荷重试。
- 旧插入/移动 ACK 不得覆盖较新的取消投影；取消 ACK 不得覆盖之后再次排期的投影。
- 前驱业务拒绝或恢复数据与预测不符时，按现有恢复流程处理后继，不依据旧假设继续发送。
- 不撤销已派发插入命令、不改其载荷；插入可能已在服务端提交并顺延其他任务。
- 离线取消后关闭客户端，重启仍从同一持久队列恢复。

### 回归

扩展 `r4-task-store-schedule.test.mjs`、`r4-local-repository.test.mjs`、`r4-sync.test.mjs`：

1. 插入未 ACK 立即取消：本地立即移出，网络先插入后取消。
2. 插入 → 移动 → 取消 → 再排期，最终位置由最后有效操作决定。
3. 离线取消、关窗重启与恢复联网。
4. 两种旧 ACK 都不覆盖后继乐观状态。
5. 前驱拒绝、PROCESSING、响应丢失、超时重试保持幂等和稳定载荷。
6. 跨窗口、墓碑、已完成任务固定规则仍有效。
7. wire 无私有字段，单 Task 响应正确结算，不影响普通 UPDATE。

## 3. 验证与交接

全部 PC 编辑完成后统一执行类型检查、相关回归，再按同步公共逻辑变更要求执行全量与构建。失败按 BeforeCoding.md 的节奏归因，不以全量现有失败替代本次回归。

```powershell
npm.cmd --prefix Auralis-PC run type-check
cd Auralis-PC
node --experimental-strip-types --test scripts/r4-review-local-first.test.mjs scripts/r4-review-sync-concurrency.test.mjs scripts/r4-task-store-schedule.test.mjs scripts/r4-local-repository.test.mjs scripts/r4-sync.test.mjs
npm.cmd run test:r4-pc
npm.cmd run build
```

`test:r4-pc` 为固定名单，不能推断覆盖所有 scripts 中的测试；本轮相关脚本必须明确包含。GUI 验收需要新 PC bundle：复习原有误冲突重新核验、取消排期连续操作、离线重启与真实服务收敛。

实现后同步 FrontendPC.md、API.md、Database.md、Status.md、IssuesAndReview.md。当前只是实施交接，不更新为 PC 已完成或已通过验收。

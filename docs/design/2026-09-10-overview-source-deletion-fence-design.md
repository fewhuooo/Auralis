# Overview Source 删除屏障设计

日期：2026-09-10

状态：已批准，待实施

## 问题与证据

一次现场运行中，旧 Source `01a08ae0…` 的 Overview 于 `15:26:19Z` 启动，Server 到 `15:26:25Z` 才提交该 Source 的软删除；重新上传在 `15:26:31Z` 创建了新的 Source `01a08bed…`。因此新文件 OCR 没有提前触发 Overview，实际问题是旧 Source 在本地删除、document job 清理和 Server DELETE 同步之间仍可被 Overview 恢复扫描选中。

当前 PC 删除路径先写入本地 tombstone、移除页面投影并安排后台同步，再以 fire-and-forget 方式清理 document job。Overview 恢复路径只从本地 job repository 枚举 `phase=READY`，随后只验证 Server Source 仍是 `READY` 且 revision 相同。在 Server DELETE 尚未提交的窗口内，这两个条件都可能成立。已经进入 Server Map-Reduce 的请求也不会因随后发生的软删除自动停止。

## 目标

- 本地 Source 一旦进入删除流程，旧 Source 不得再启动新的文件 Overview。
- 自动和手动文件 Overview 都必须绑定同一 Source、同一 ingestion revision、未删除的本地投影和本地 document job `READY`。
- 删除发生时，中止对应 PC HTTP 请求；即使网络中止未及时传播，返回结果也不得写入本地 Overview cache。
- Server 在每次 Source Overview Provider 调用前后重新确认 Source 仍 active、`READY` 且 revision 未变化，删除或换 revision 后停止后续 Map/Reduce 调用。
- Source 删除统一清理文件 Overview cache。

## 非目标

- 不新增 Overview cancellation HTTP API。
- 不改变 Map-Reduce 分组、串并行策略、Provider、timeout、普通重试或 Server 缓存语义。
- 不改变 Source、document job、Overview cache 的数据库结构或同步字段。
- 不处理学科 Overview 的并发或取消策略。

## 方案

采用 PC 删除屏障、本地资格门槛和 Server 阶段围栏三层防护。

### PC 删除屏障

`OverviewGenerationService` 维护当前进程内的已删除 Source 集合，并公开删除入口。入口必须在第一次异步等待之前同步登记 Source ID，然后中止该 Source 的所有 in-flight HTTP controller，最后按 owner/device 作用域删除该 Source 的文件 Overview cache。

`useSourceStore.deleteSourceFile` 在本地 tombstone 成功、内存投影移除后，先调用 Overview 删除入口，再安排 Sync 和 document job 派生数据清理。页面不等待慢速 OCR/cache 清理后才消失，但从本地删除确认开始，Overview 已有同步屏障。

删除入口必须幂等；重复调用不能影响其他 Source。重新上传会获得新 Source ID，不继承旧 ID 的屏障。

### 本地生成资格门槛

Runtime 向 `OverviewGenerationService` 注入一个精确资格检查：

```text
sourceId 存在于当前未删除本地 Source 投影
AND Source ingestionRevision == 请求 revision
AND 本地 document job 存在
AND job.sourceId/revision 精确匹配
AND job.phase == READY
```

`generateReadyFileOverview`、`regenerateFileOverview` 和恢复扫描最终都经过该检查。检查失败只记录 allowlist `SKIPPED` 结果，不调用 Server，也不把它标记为生成失败。Server READY 不能替代本地 READY 门槛。

资格检查在 PC 发出 Server Overview HTTP 请求前执行一次，并在响应落盘前再次执行，以覆盖删除或 revision 变化发生在请求执行期间的情况。

### PC 请求中止与结果丢弃

每个文件生成 in-flight 记录增加 `AbortController`。服务创建的 request context 同时携带 `requestId` 和 `signal`；`useOverviewApi` 将 signal 传给现有 Axios POST。删除 Source 时中止匹配请求。

中止或删除屏障命中属于预期失效，不写 `FAILED` Overview cache；日志使用固定前缀和 allowlist 字段记录稳定 outcome。无论 Axios 是否在中止时立即返回，保存前的第二次资格检查都会阻止迟到结果落盘。

### Server 阶段围栏

Server `OverviewGenerationService` 对 Source Overview 在每次 `invoke` 调用前后执行围栏校验：

```text
requireActiveSource(userId, sourceId)
AND ingestionStatus == READY
AND ingestionRevision == generation context revision
```

Map 与 Reduce 都复用 `invoke`，因此删除或 revision 变化最多允许当前已发出的单次 Provider 调用完成；下一次 Provider 调用不会开始。Provider 返回后、JSON 解析前再校验一次，避免继续处理和返回已失效结果。

围栏失败使用现有稳定领域错误边界，不暴露 Source 标题、正文、Provider 响应或 instruction。Subject Overview 不使用该 Source-generation 围栏。

## 数据与接口影响

不新增 HTTP 路由、请求字段、响应字段、数据库列或同步字段。`OverviewRequestContext` 仅增加 PC 内部可选 `AbortSignal`；现有 `X-Overview-Request-Id` 关联保持不变。

## 测试设计

PC 先增加失败回归，证明以下行为：

- 本地 DELETE tombstone 已写入但旧 READY job 尚未清理时，自动恢复不会调用 Overview API。
- 手动生成在本地 job 不是 `READY` 时不会调用 Overview API。
- 删除 in-flight Source 会触发 signal abort，迟到响应不保存、不写失败 cache，并清理既有文件 Overview cache。
- 新 Source ID 不受旧 Source 删除屏障影响。
- SourceStore 删除顺序保证 Overview 屏障早于 background Sync 和 document job cleanup。

Server 先增加失败回归，令首个 Provider 调用期间 Source 被软删除或 revision 改变，断言后续 Provider 调用不会发生且请求以稳定领域错误结束。

完成后运行 Overview、SourceStore、document scheduler 的 PC 聚焦测试、完整 PC R4、type-check、静态检查；Server 运行 Overview 聚焦测试和可执行的全量门禁。外部 Provider、真实 Tauri 取消传播和 GUI 删除/重新上传仍单独记录为人工验收边界。

## 文档回写

实施完成后更新 `docs/modules/FrontendPC.md`、`docs/modules/Backend.md`、`docs/current/Status.md`、`docs/current/IssuesAndReview.md` 和 `docs/release/Changelog.md`。由于无 HTTP 或数据结构变化，不修改 `docs/contracts/API.md` 与 `docs/contracts/Database.md`。

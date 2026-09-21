# Task 2 实施报告：Sidebar projection 与聊天错误可见性

## 状态

完成。Task 2 范围已实现并提交；未进入 Overview Task 3+。

## 改动

- `App.vue` 维护浏览器 `online/offline` 响应式状态并传入 `AppSidebar`，挂载/卸载事件监听。
- `AppSidebar.vue` 以 `projectConnectionStatus` 的单一 `connectionProjection` 消费 sync、Realtime、chat error 和在线状态；tooltip 使用 projection message，状态点按 level 映射，Realtime status 通过已有事件驱动更新，无轮询。
- `useChatStore.ts` 暴露当前会话的 `pendingMessage`；`sendMessage` 支持仅凭现有 `clientRequestId` 重试 PENDING 用户消息，找不到可靠 ID 时不创建新消息；错误保持可见直到流成功完成，恢复失败也写入 `lastError`。
- `SubjectWorkspace/index.vue` 在 `.ai-messages` 内渲染 `role="alert"` 错误行和 retry 按钮，retry 复用原 pending message/clientRequestId；保留全局通知作为次级提示。
- 新增 Sidebar projection、chat-region alert 和 pending request retry 静态断言。

## 验证

日期：2026-09-21

命令：

```powershell
node --experimental-strip-types --test scripts/r4-issues-3-4-frontend.test.mjs scripts/r4-subject-overview-ui.test.mjs
```

结果：退出码 1（实施前 TDD 失败基线）；12 pass、2 fail，失败为 Sidebar 缺少 `connectionProjection` 与工作区缺少 chat-region `role="alert"`。

命令：

```powershell
node --experimental-strip-types --test scripts/r4-issues-3-4-frontend.test.mjs scripts/r4-subject-overview-ui.test.mjs scripts/r4-reliability.test.mjs
```

结果：退出码 0；20/20 pass。

命令：

```powershell
npm.cmd run type-check
```

结果：退出码 0；`vue-tsc -b` 通过。

命令：

```powershell
git diff --check
```

结果：退出码 0；无 whitespace 错误。

## Commit

`fix: show real sync and chat connection state`（最终提交 hash 以交接时的 `git rev-parse HEAD` 为准）

## 未覆盖 / concerns

- 未执行真实 Tauri/GUI、浏览器真实 online/offline、WebSocket delivery 或真实 AI provider 验收；这些仍需人工验收。
- 未执行 PC 全量 `test:r4-pc` 或 production build；本 Task brief 要求的 focused tests、reliability 和 type-check 已执行。
- 工作树提交前仅包含本 Task 六个实现/测试文件；未覆盖用户未提交修改。

## Review follow-up

评审指出 Sidebar 不应直接依赖 Store/Realtime 内部，且 projection 的 `retryable` 必须有渲染用途。已修复：

- `App.vue` 现在统一组装 `connectionProjection`，订阅浏览器 `online/offline` 和已有 `auralis-realtime-status` 事件，并通过明确的 `connection-projection` prop 传给 Sidebar。
- `AppSidebar.vue` 移除 `useSyncStore`、`useChatStore`、`realtimeController` 及 Realtime 事件监听，只消费 `ConnectionProjection`；`retryable` 用于 `data-retryable`、ARIA 标签及现有浮动提示的“可重试”文案。
- 新增静态断言证明 Sidebar 无内部连接依赖、App 持有 projection assembly/subscription，以及 `retryable` 有 DOM 渲染用途。

复核命令：

```powershell
node --experimental-strip-types --test scripts/r4-issues-3-4-frontend.test.mjs scripts/r4-subject-overview-ui.test.mjs
node --experimental-strip-types --test scripts/r4-issues-3-4-frontend.test.mjs scripts/r4-subject-overview-ui.test.mjs scripts/r4-reliability.test.mjs
npm.cmd run type-check
git diff --check
```

复核结果：TDD 修复前 14 pass、2 fail；修复后聚焦 + reliability 21/21 pass，type-check 与 diff-check 均退出码 0。

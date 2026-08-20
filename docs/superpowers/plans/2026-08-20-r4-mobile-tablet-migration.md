# R4 Mobile / Tablet Client Migration Implementation Plan

> **For agentic workers:** Execute this plan inline in dependency order. Every task ends with a fresh command result; GUI, developer-tool and real-device acceptance remain separate evidence.

**Goal:** 将 `Auralis-Mobile` 的 H5、微信和 Tablet 主工作区迁移到 R3 冻结契约、用户/设备隔离端侧副本和 realtime ticket 协议，完成 R4-04～R4-07 的代码与自动门禁。

**Architecture:** 页面保留现有 Mobile/Tablet 视觉与 view model，网络层统一为 `runtime config → direct DTO transport → typed API wrapper`，Store 负责 DTO/view-model 映射和离线 mutation，端侧 repository 只按 `userId + deviceId` 保存资源、墓碑、cursor 与 pending mutation。Realtime 只携带一次性 ticket，事件只触发同一 cursor sync；Tablet NoteDocument 继续走既有专用仓库和 feature flag。

**Tech Stack:** Uni-app、Vue 3.4.21、Pinia 2.1.7、TypeScript 5.3.3、Node built-in test、冻结 OpenAPI schema。

## Global Constraints

- 不修改生成文件 `src/api/generated/schema.ts`；契约变化只能通过根脚本重生成。
- 不恢复归档页面、旧 `Result<T>`、`/ws/sync`、URL access token、`afterId/lastMutationId/truncated` 或固定 localhost。
- CREATE 使用稳定 `resourceId/clientMutationId` 和 `baseVersion=0`；冲突保留 pending mutation，不做 last-write-wins。
- H5、微信、Tablet 共用业务 Store；微信继续通过条件编译排除 Tablet 页面。
- Tablet 手写、NoteDocument、stroke、snapshot 和 viewport 保持 local-only，不进入 Server Sync。
- 自动测试/构建通过不等同于微信开发者工具、真机、横屏触控或真实服务验收。

---

### Task 1: 工具链和 R4 红灯门禁

**Files:** Modify `Auralis-Mobile/package.json`, `package-lock.json`; create `scripts/check-r4-mobile.mjs`, `scripts/r4-mobile-protocol.test.mjs`.

**Interfaces:** `npm run check:r4-mobile` 扫描生产源码；`npm run test:r4-mobile` 运行协议测试；`npm run test:tablet` 运行三个既有 Tablet 逻辑测试。

- [ ] 添加静态失败断言，覆盖固定 localhost、`/ws/sync`、`/api/ai/chat`、旧 Result 判断、旧 sync cursor 字段和 URL token。
- [ ] 添加协议红灯，覆盖 Problem Details、直接 DTO、环境地址、单飞 refresh、opaque cursor、ticket URL 和用户 namespace。
- [ ] 将 Pinia 固定为与 Vue 3.4.21 兼容的 2.1.7，并确认 `npm ls pinia vue` 不再报告 peer invalid。
- [ ] 运行 `npm.cmd run test:r4-mobile`；迁移前预期协议断言失败。运行 `npm.cmd run test:tablet`；预期三个脚本退出 0。

### Task 2: Runtime、Auth、HTTP 与 Realtime

**Files:** Create `src/config/runtime.ts`, `src/api/httpError.ts`, `src/api/useAuthApi.ts`, `src/api/realtime.ts`; modify `src/api/request.ts`, `src/store/useAuthStore.ts`, `src/App.vue`, `.env.example`.

**Interfaces:** `resolveRuntimeConfig(env, platform)`；`mobileRequest.request<T>()`；`useAuthStore.user/sessionId/deviceId`；`connectRealtimeEvents()` / `disconnectRealtimeEvents()`。

- [ ] 实现环境驱动 HTTP/WSS base、RFC Problem Details 和 204/direct DTO transport。
- [ ] Auth 使用生成 DTO 的 register/login/refresh/logout/me/sessions，刷新只允许一个并发请求，持久化完整 user/session/device 边界。
- [ ] Realtime 先 `POST /api/realtime/ticket`，再连接响应 `websocketUrl`；query 仅含 ticket，重连重新取票，重复事件按稳定键去重并触发 sync。
- [ ] 运行协议测试、类型检查，预期全部退出 0；静态检查只允许后续旧 Sync/AI/Store 命中。

### Task 3: 用户隔离 repository 与 cursor Sync

**Files:** Create `src/services/localRepository.ts`, `src/services/legacyLocalData.ts`; modify `src/api/useSyncApi.ts`, `src/store/useSyncStore.ts`.

**Interfaces:** `LocalResourceRecord`、`LocalMutation`、`createLocalRepository({userId,deviceId})`；`pullChanges(cursor,limit)`、`pushChanges(deviceId,mutations)`、`getSnapshot()`。

- [ ] repository namespace 固定为 `auralis:mobile:v2:<userId>:<deviceId>`，保存 resource/version/deletedAt/syncStatus/payload、pending mutation、cursor/resetRequired。
- [ ] 首次看到旧 account-less 数据时只复制到 `auralis:mobile:legacy_unassigned:v1`，不静默归属或删除。
- [ ] Sync 使用 `changes/nextCursor/hasMore/resetRequired`；reset 先 snapshot，再保留并重放 pending mutation。
- [ ] 增加用户隔离、tombstone、冲突、snapshot pending 保留、push 部分决策和 opaque cursor 测试；运行测试与类型检查。

### Task 4: 核心资源 Store 与上传链路

**Files:** Create `src/api/domainClient.ts`, `src/api/assetClient.ts`, `src/store/domainMappers.ts`, `src/store/useSourceStore.ts`, `src/store/useReviewStore.ts`, `src/store/useStatsStore.ts`; modify `src/store/useSubjectStore.ts`, `src/store/useBlockStore.ts`, `src/store/useTaskStore.ts`, `src/pages/mobile/asset/index.vue`.

**Interfaces:** Subject/KnowledgeBlock/Task/Source/Review/Stats typed methods；`upload-intent → uni.uploadFile/request PUT → complete → Source create`；现有页面继续消费稳定 view model。

- [ ] Subject、KnowledgeBlock、Task、Source 读取 server list envelope 并写入 user/device repository；写入先建立稳定 mutation 身份。
- [ ] 保留页面需要的显示字段，但不把 `loadText/mastery/relatedBlockIds/sourceFileId` 发送给 Server。
- [ ] 资产页完成 intent、对象 PUT、complete、Source create，明确 pending/failed/ready 状态。
- [ ] Review/Stats 改为强类型服务端 DTO；补 mapper 与 API route 测试并运行静态/协议/类型门禁。

### Task 5: AI 与 Mobile/Tablet 页面主路径

**Files:** Modify `src/api/aiClient.ts` and affected files under `src/pages/mobile/` and `src/pages/tablet/`.

**Interfaces:** `createConversation(clientRequestId)`、`streamAiMessage(request,onEvent)`、`getAiSettings/setAiSettings`；SSE 事件为 `message.started/citation/message.delta/message.completed/message.error`。

- [ ] AI 页面和 Tablet workspace 切换到 conversation + message SSE，重试复用同一 clientRequestId，不保存或附加 BYOK 明文。
- [ ] Home、Timeline、Pomodoro、Review、Stats、Profile、Dashboard、SubjectHall、Workspace 只通过迁移后 Store/API 获取云端事实；允许明确标注的 UI 本地派生值。
- [ ] Profile/Settings 的账号与 AI 设置只展示脱敏状态；退出断开 realtime 并保留其他账号 namespace。
- [ ] 运行静态检查，预期生产源码不再命中旧协议；运行协议/Tablet/type-check。

### Task 6: 构建、契约与权威文档

**Files:** Modify `docs/modules/FrontendMobileTablet.md`, `docs/contracts/MobilePagesAPIMap.md`, `docs/contracts/Database.md`, `docs/current/Status.md`, `docs/current/IssuesAndReview.md`, `docs/planning/PreDeploymentReadinessTasks.md`, `docs/release/Changelog.md`.

**Interfaces:** 文档只记录实际代码和本轮命令证据，人工验收边界保持开放。

- [ ] 运行 `npm.cmd run check:r4-mobile`, `npm.cmd run test:r4-mobile`, `npm.cmd run test:tablet`, `npm.cmd run type-check`, `npm.cmd run build:h5`, `npm.cmd run build:mp-weixin`。
- [ ] 从仓库根运行 `scripts/check-openapi.ps1` 和 `git diff --check`。
- [ ] 更新 R4-04/R4-05 的代码与自动门禁记录；R4-06 微信 AppID/域名/开发者工具/真机和 R4-07 横屏触控仍无证据时保持未勾选。
- [ ] 提交并推送到 `codex/r4-client-migration`，记录 commit、命令结果、已知构建警告和人工验收边界。

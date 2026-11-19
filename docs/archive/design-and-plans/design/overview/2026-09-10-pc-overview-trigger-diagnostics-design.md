# PC 文件 Overview 触发链诊断设计

更新时间：2026-09-10

文档状态：已批准设计

权威范围：PC 文件 Overview 自动生成的触发来源、请求关联、生命周期日志与验证边界

事实来源：`Auralis-PC/src/services/overviewGenerationService.ts`、`Auralis-PC/src/services/documentProcessing/runtime.ts`、`Auralis-PC/src/store/useSourceStore.ts`、`Auralis-PC/src/api/useOverviewApi.ts` 与 2026-09-10 真实 Server 日志

## 目标

为同一 `sourceId + ingestionRevision + mode + instruction` 的文件 Overview 生成建立可关联的 PC 诊断链，直接回答：哪个入口触发、是否复用已有请求、为何跳过、何时真正发出 HTTP 请求、为何释放 `inFlight`。诊断增强不改变自动生成、重试、缓存、Provider、Server API 或幂等行为。

## 设计

新增封闭的 `FileOverviewTrigger` 类型，覆盖 `SOURCE_READY`、`RESUME_BOOTSTRAP`、`RESUME_ONLINE`、`RESUME_SYNC`、`JOB_CHANGED` 与 `MANUAL_RETRY`。所有文件 Overview 入口必须显式传递 trigger；通用 `resumePending` 不自行猜测来源。

`OverviewGenerationService` 在准备创建一次新文件请求时生成 request ID，并把同一值传给 `useOverviewApi` 作为 `X-Overview-Request-Id`。PC 日志与 Server 的 `requestId/generationId` 因而可以精确关联。已有同键 Promise 时不创建新 request ID，只记录 `COALESCED`。

日志统一使用 `FILE_OVERVIEW_TRIGGER` 前缀和结构化键值，事件限定为：

- `TRIGGER`：入口已到达。
- `SKIPPED`：Source 非当前 READY revision、缓存已完整或能力未绑定。
- `COALESCED`：同一 service 实例已有相同 key 的请求。
- `START`：即将调用 Overview API，包含与 Server header 相同的 request ID。
- `FAILED`：请求、验证或缓存写入失败，仅记录稳定安全错误码和耗时。
- `RELEASED`：对应请求从 `inFlight` 删除。

允许字段为 `event`、`trigger`、`requestId`、`sourceId`、`revision`、`mode`、`outcome`、`errorCode`、`durationMs`。禁止记录 instruction、Source 标题、文件内容、Provider 响应、Authorization、API key、URL 或原始异常消息。

## 数据流与错误边界

Runtime 的启动、联网、同步更新和 job change 分别把确定的 trigger 传给 `resumePending`；SourceStore 的 READY 回调和人工继续入口分别传 `SOURCE_READY`、`MANUAL_RETRY`。`resumePending` 仍只扫描 READY job，`generateReadyFileOverview` 仍执行权威 Source 和本地缓存预检。

API、响应校验或 repository 写入失败后继续维持现有安全失败持久化和 `inFlight` 释放语义。日志不得重新抛出、吞掉新的异常或触发额外重试。Server 端并发互斥、客户端/Server timeout 对齐、MAP/REDUCE prompt 上限修复均不在本设计范围内。

## 验证

自动测试至少覆盖：每个自动入口传入正确 trigger；同键并发只产生一个 request ID 和一次 API 调用并记录 `COALESCED`；失败记录安全错误码后释放；后续独立触发会生成新 request ID；API header 与 `START` 日志使用同一 request ID；日志不包含 instruction、原始异常文本或凭据字段。

运行 Overview 聚焦测试、PC 完整回归、type-check、静态检查和 `git diff --check`。真实 Tauri + Provider 现场仍需人工观察 PC `FILE_OVERVIEW_TRIGGER` 与 Server `OVERVIEW_GENERATION_START` 的 request ID 是否一致；自动测试不等同于真实重复触发根因已关闭。

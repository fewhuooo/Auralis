# Overview M3.4 正式发布与已验证分节预览

日期：2026-10-22。此计划只交付 M3.4；获批的 M1–M6 总目标与最终 unused-compatibility cleanup gate 仍 active。M3.4 源码、相关自动验证与唯一审查已完成，未部署；没有业务数据库、真实 Provider、GUI/用户流程或内容质量验收。

## 目标与边界

- 将完成的 native Source/Subject ALL、OUTLINE job candidate 经一个持久 publication intent 接入唯一正式 `overview_results` 与现行 GET/PUT/CAS/write-receipt 边界。
- 每个 outline/summary part 保存显式 input origin 与原始输入 identity snapshot。`SOURCE_CONTENT` 绑定 job 已授权的有序 selected source/chunk manifest（含 TEXT/URL、subset）；不虚构 FILE part versions，不要求无关 saved source overviews。
- `SOURCE_REVISION` 与 `SOURCE_OVERVIEW_PARTS` 保持已有手工单源和 Subject 派生摘要语义。未触及部分保留原 descriptor/fingerprint/version/provenance。
- 只读 VERIFIED journal checkpoint，提供有界 preview 和按正式稳定 section identity/version 取单节正文；预览 execution node ID 与 M2 formal outline node ID 不混用。
- GET job list 允许 `scope` 与 `scopeId` 同时过滤或同时省略；owner/scope 授权与 opaque cursor 的 owner/filter domain 绑定，支撑 M4 断线重连。
- 不改 PC/Mobile UI、OpenAPI/SDK 手写生成物、Provider/Gateway/Guard 预算、部署、真实业务数据库或凭据；M4–M6 和最终清理继续后续交付。

## 源码候选行为

Enqueue 先锁 ACTIVE user，再锁现有 scope serialization rows，捕获 formal logical version 与物理 result ID/version；未 current/不存在时 logical base 为 0，但仍记住观察到的物理行。幂等 enqueue replay 保留首次 baseline。发布 request 是 `{clientPublishId,expectedVersion,baseVersion}`；唯一 intent 绑定 user/client ID、job/assembled plan、expected job version、candidate hash 与 base。相同请求返回同一 intent；不同请求或同 job/plan 第二 intent 冲突。

Intent PENDING 在短事务持久化。提交事务按 user → canonical Subject → Source → job → generation/plan → intent → formal result → exact write receipt 顺序锁定/写入，并复核完成 job/version、assembled plan、候选 hash、job input/profile/algorithm identity、raw source snapshot 和 captured physical/logical baseline。正式结果、write receipt 与 intent 的 PUBLISHED 状态同事务提交。OUTLINE 只覆盖 outline part，要求当前完整 formal result 并保留 summary binding；缺失/过期 scope 只可 ALL 初始化。预期 CAS/input conflict 留存 candidate 并转为 CONFLICT；unexpected failure 有界三次、间隔重试，publisher poll 只做本地数据库工作。

正式 part descriptor 是显式 `SOURCE_REVISION`、`SOURCE_OVERVIEW_PARTS` 或 `SOURCE_CONTENT`。`SOURCE_CONTENT` snapshot 只存最多 500 条 raw unit 的 UUID/revision/active generation/hash/range 元数据，最多 262144 字符，不存正文、prompt 或凭据；GET currentness 用 provider/config-free 的当前 raw identity helper。Subject SOURCE_CONTENT 可在同一当前持久 binding 下手工部分编辑，CAS receipt 仍走正式 result store。

Preview 根页返回真实 job status、active plan ID/fingerprint、incomplete 标记和最多 50 个 VERIFIED writer node；无 plan 时返回空列表与 null plan。cursor/node 都绑定 owner/job/plan，node body 每次校验当前 raw source scope、descriptor/checkpoint hash 和 alias coverage，投影为实际 source UUID 与 canonical provenance。取消、过期或输入失效拒绝读取；暂停、失败、恢复待处理 job 的已验证单元保持只读可见。正式 Source/Subject outline 仅返回带 M2 stable IDs 的 headings metadata（path、title 与 chapter 标记），不返回 section 正文或 summary；section 读取校验当前 result version、身份及 canonical provenance，并返回完整 section 正文。

## 必需数据库变化

V37 为现行空闲迁移号。job 增加 captured formal baseline 的 logical/physical columns；`overview_results` 增加 per-part origin 与 bounded snapshot JSON，按现有确定性 scope contract 明确回填已存 parts；新 `overview_publication_intents` 以 owner/clientPublishId 与 job/plan 唯一，保存 PENDING/PUBLISHED/CONFLICT/FAILED、稳定 write ID、candidate/input/profile/algorithm hashes、expected job version、baseline、bounded attempts/retryAt、安全错误与结果引用。账号/job/generation/plan 生命周期级联符合既有删除边界，候选正文不重复写进 intent。

## 必要 correctness 修复

M3.3 `snapshotForJob` 的合法 SOURCE 与 SUBJECT 请求分别带有 null source/subject 字段；原 request hash 使用 `List.of(...)` 会对 null 抛 NPE。只将 canonical list 容器换成允许 null 的等价有序容器，保留 serializer 字段次序与字节语义，不提供旧 hash fallback；新增实际 SOURCE 与 SUBJECT snapshot 路径 fixture 回归，不发 Provider 调用。

## 验证/审查结案

- 首次实际 full run04 为 135 fresh XML / 729 tests / 2 failures / 258 errors / 0 skipped；保留其失败历史，不声称 full suite 全绿。随后相关失败组完成原因归属与定向复验闭合；run05 为 98 tests / 1F / 3E，run06 为 240 tests / 2F / 2E。最终 PublicationPG 8/8、Auth 1/1、ResultHTTP 1/1 等重点组通过；64 个失败 suite 条目均有实际映射。
- Post-I1 HTTP 1/1；`-DskipTests` package exit 0；runtime export 1/1；离线 `openapi-typescript@7.13.0` 生成双 SDK；`export=false` runtime artifact comparison 1/1；PC direct `vue-tsc` exit 0。Mobile 保留既有 `reviewApi.ts` 两个 TS2339（EventRequest/EventResponse），未修。首次 full 的 failure 不能被这些定向结果覆盖。
- Post-I1 JAR 93,450,046 bytes，SHA-256 `e3e80595b19861d1b41131e71ab3fd2590a2aa4ea0b42e33770793e1db503f46`；runtime JSON 177,725 bytes，SHA-256 `e5856cde92dd7167281c7bb01b291477eaa4ee659adfb2fd5a890a8e088a933d`；双 SDK 共 138,191 bytes，SHA-256 `8122d2f866444be25783df139fb67a57e7bdeec17d066a7051504e1f4fcc53d7`。最终 45-path snapshot manifest SHA-256 `ff14fab66e136011076d757f7ba70f965fd5d09770d1aa4cf3ff435378e57896`。
- 首次 reviewer 报告的 I1（正式 outline metadata 包含 section 正文）已修复：outline 返回 metadata，完整正文只经单节 endpoint 读取；delta reviewer 复审为 B0/I0/O0。源码必要 correctness 修复仅为 SOURCE/SUBJECT `snapshotForJob` null 形状 hash NPE、真实 Source ID title/canonical hash/provenance 校验和 preview 内部 ID 映射；未改变模型功能或预算。
- 权威验证报告、review 与 artifact 证据保存在 `D:/Temp/auralis-overview-m34-publication-20261022/`。M3.4 未部署，未连接业务 DB/真实 Provider 或 GUI。M4 PC native job consumer/GUI、M5 cache/reuse、M6 真实 Provider/usage 校准、内容质量、部署和最终 unused-compatibility cleanup 仍未交付；M1–M6 总目标仍 active。

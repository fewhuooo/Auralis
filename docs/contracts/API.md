# Auralis API 契约

### 2026-11-12 Overview 退役接口清理

删除旧作业的 `GET /api/ai/overview-jobs/{id}/preview`、`POST /{id}/publish`、`GET /{id}/publication` 及其 DTO。正式结果 PUT 删除无调用方的 `candidateInput`，使用当前 `inputDescriptor` 路径；JobView 删除仅服务旧发布的 `publicationBaseVersion`。作业创建、查询、候选获取和控制生命周期保留；直接生成与正式结果 GET/PUT 的现行 Markdown 行为保持。

下方 10-22、10-23 的 candidateInput、publication、preview 和章/节专属接口记录为历史实施快照，不是当前可用契约。现行接口以本节、下节与生成的 OpenAPI 为准。

### 2026-11-12 Overview Markdown 契约替换

本节优先于下方旧生成快照。生成结果采用 `schemaVersion: 2`、`title`、`outlineMarkdown`、`summaryMarkdown`。两内容字段为 string/null；ALL 两项非空，OUTLINE 仅交付大纲，SUMMARY 仅交付总结。现有 URL、mode 和 SSE 事件外壳保留。`SubjectOverviewSourceInput` 使用 `sourceId/title/outlineMarkdown/summaryMarkdown`。

正式 PUT 保留 `baseVersion/clientWriteId/mode/ingestionRevision/sourceManifest/inputFingerprint/outlineGeneratedAt/summaryGeneratedAt/result/inputDescriptor`，移除 `outlineIdentity/outlineProvenance/candidateInput`。正式 GET 保留既有 ID、scope、source/subject、版本、分项 manifest/fingerprint/生成时间和 `outlineInputDescriptor/summaryInputDescriptor`，内容改为两项非 null 的 Markdown 字符串，不再返回 `identityReady/outlineIdentity/outlineProvenance`。

旧 schemaVersion=1 正式记录保留但不作为当前内容读取，GET 使用既有缺失语义。替换它必须使用 ALL 和真实行版本；版本不符时返回 409 `RESOURCE_VERSION_CONFLICT`，`current` 为版本元数据 `{version, schemaVersion}`，不是完整内容。客户端必须识别这个元数据形态，不把它渲染为总览或将版本重置为 0。旧内容不做自动转换。章/节专属读取接口随新契约移除。

清理只产生输入副本，范围格式校验不等于语义分类正确。来源身份继续由现有 inputDescriptor 与 revision/fingerprint 复核。生成实现与验证状态见[替换说明](../plans/2026-11-12-overview-markdown-replacement.md)。

Overview 派发前要求当前生成模型具有服务端声明的容量。平台生成使用 `AURALIS_AI_GENERATION_CONTEXT_TOKENS` 和 `AURALIS_AI_GENERATION_MAX_OUTPUT_TOKENS`，BYOK 使用其 Provider、端点和模型匹配的 `overview-model-capacities` 条目。缺少对应容量沿用 `MODEL_UNAVAILABLE`（HTTP 503），SSE 与后台作业沿用各自的错误承载方式。

### 2026-11-11 资料下载元数据与解析接收一致性

- `POST /api/assets/{id}/download-url` 在既有 `url`、`expiresAt` 外返回必填 `originalName`、`mimeType`，取自当前用户的 READY Asset。PC 预览与解析使用原资产格式，Source 标题仅用于展示；鉴权、签名和有效期规则保持。
- ParsedDocument complete 在接受前核对 upload intent 的 `sourceAssetSha256` 与服务端确定的当前 Asset SHA；不一致返回 `400 PARSED_DOCUMENT_INVALID`，记录为 REJECTED，不创建索引任务。现有 ACCEPTED 历史记录保留，不执行数据迁移。
- ParsedDocument upload-intent 的 `sourceAssetSha256` 为必填的 64 位十六进制 SHA-256；省略、null 或非法格式在申请阶段返回 `400 VALIDATION_FAILED`，不创建候选或签发上传地址。OpenAPI 与双端生成类型同步为必填。该声明仍须在 complete 与服务端计算的资产摘要核对，不能替代原文件验证。
- complete 为历史空 SHA Asset 读取原对象时，预期的存储领域错误返回 `400 UPLOAD_VALIDATION_FAILED`，候选的 REJECTED 状态提交；未知异常仍回滚。历史缺少声明 SHA 的候选不自动补填，首次接受仍按现行 complete 校验拒绝；已存在同 payload 成功结果时保持既有幂等规则。
- 恢复处于处理中的 FILE Source 时，存在当前 owner/revision 的 ACCEPTED ParsedDocument 则复用其 generation 并确保有索引任务；无可复用结果则轮换 revision 并回到 `AWAITING_CLIENT`。恢复已有活动任务时不重复入队。
- 恢复时撤销已领取解析/索引任务的租约并重新排队，保留任务 ID、revision、generation、已接受结果及已发生的失败计数。被撤销 claim 的状态更新和终态回调不能再修改 Source；新的领取继续使用现有 attempt 校验。
- PC 资料处理的网络暂停只由用户明确继续恢复；启动、同步和联网事件不自动恢复 `PAUSED_NETWORK`。完整交互见 [前端设计](../design/Frontend.md)。

### 2026-11-04 Chat UNKNOWN 显式恢复

新增需 Bearer access token 鉴权的 `POST /api/ai/conversations/{conversationId}/runs/{runId}/attempts/{attemptId}/recover`，无请求 body，返回现有 `ChatRunStatusView`。它只对当前 active run 的 current attempt 执行 UNKNOWN 终结，不会重新派发模型请求。目标与会话、run、attempt 通过 owner 复合归属验证；目标已被解决或成为旧 attempt 时只返回该 run 当前状态，不改变后续 attempt 或其他 run。状态不允许恢复时返回 HTTP 409 `CHAT_RECOVERY_NOT_ALLOWED`。

Chat 流任务在执行前被 MVC 队列拒绝时返回现有 HTTP 503。服务端将本次新准入且未派发的尝试结算为 `FAILED / CHAT_ATTEMPT_NOT_DISPATCHED` 并释放会话。题卡答案及重放语义见 [Chat Runtime API](chat-runtime-api.md#6-cancellation-recovery-and-slot-ownership)。

当前 UNKNOWN attempt 没有已提交 READY/SUBMITTED activity 时，显式恢复把 run/attempt 终结为 `FAILED`，错误码 `CHAT_UNKNOWN_ABANDONED`，保留已验证公开正文和行；未闭合 GENERATING block 转为 INVALID。私有 tool evidence、activity/ref 和 usage task/reservation/charged 状态保留，不退款。若已有 READY/SUBMITTED activity，按已提交业务结果完成 run/attempt 并释放执行槽，不撤销 activity 或 private reference。两种路径均通过 conversation fence 阻止迟到 worker 发布；TTL 不证明 Provider 已停止，恢复不代表取消上游请求。

### 2026-11-04 用户资料头像存在提示

AuthResult 中的 `user`、`GET /api/auth/me` 和 `PUT /api/auth/me` 共用 `UserView { id, username, displayName, version, hasAvatar }`，其中 `hasAvatar` 是必填布尔字段。它在响应读取时根据当前用户 `user_avatars` 行是否存在计算，不增加数据库字段，不修改用户 `version`。注册、登录、刷新、资料读取和资料更新均使用相同语义。头像图片仍通过独立头像接口读取和写入，不进入 UserView。

客户端收到 `hasAvatar=false` 时应跳过头像 GET 并清除当前用户头像缓存/显示；为 true 时才 GET。头像可在其他设备删除，因此 true 后仍可能遇到现有 404，客户端应保留默认头像 fallback。上传和删除继续返回 HTTP 204，不返回新的 UserView；成功后客户端可本地更新标志，或重新读取 `/api/auth/me`。无头像时 `GET /api/auth/me/avatar` 仍返回 404。

运行时 OpenAPI 已导出到本文件对应的 artifact，`OpenApiArtifactTests` 17/17 通过并确认 `hasAvatar` 为必填。PC/Mobile generated schema 已通过项目既有脚本同步；PC 端已完成 `hasAvatar` 契约接入（`useAuthStore`、`Profile/index.vue`、`r4-profile-live-links.test.mjs`）：`hasAvatar=false` 时跳过头像 GET 并清理显示/缓存，`true` 时按需拉取，404 时平滑 fallback 到默认首字母头像，上传/重置头像及更新资料正确同步本地标志位。测试全量与 package 状态见[后端模块](../modules/Backend.md)和[当前状态](../current/Status.md)。

### 2026-11-04 学科总览批量状态（后端与 PC 源码均已完成，定向验证通过，未部署）

新增只读 `POST /api/overview-results/subjects/statuses`，现有 Bearer access token 鉴权。请求 `{subjectIds:[UUID...]}`，数组必填、原始长度 1–100、元素不得为 null；非法输入返回 400，未认证沿用 401。重复 ID 按首次出现去重，响应按去重后请求顺序返回。

HTTP 200 响应为 `{items:[{subjectId,status,version,outlineVersion,summaryVersion,updatedAt}]}`。`AVAILABLE` 表示当前用户活动学科存在完整且符合现行来源/输入有效性校验的总览，版本与更新时间和单 GET 一致（整体 version 可以为 0）；`MISSING` 表示本人活动学科没有当前有效结果，包括无记录、不完整和已失效；`UNAVAILABLE` 统一表示不存在、已删除或非当前用户学科，不披露是否有结果。后两态的三个版本字段及 updatedAt 均为 null，正常缺失不产生逐学科 404。

批量读取仅返回状态元数据，不返回目录/摘要/正文，不写入记录、不触发生成或更新事件；并发变更后的详情 GET/PUT 仍执行原有版本和输入校验。结果状态复用现行有效性规则，不将表中存在等同于 AVAILABLE。服务错误不能包装成缺失。完整客户端接入与验收见[交接](../plans/2026-11-04-overview-batch-status-handoff.md)。PC 端已完成批量请求接入、<=100 分批切片、去重、MISSING/AVAILABLE 判定与草稿/种子上传保护，避免了无总览学科逐个 GET 的 404 循环噪声。

### 2026-11-03 Overview 并发准入（源码候选，未部署）

同用户 SOURCE_OVERVIEW/SUBJECT_OVERVIEW 的有效调用预留合并限制为 `max(1, perUserConcurrent-1)`，所有阶段及凭据来源共用，仍同时受原用户和全局总并发上限约束。默认用户总上限 2 时总览最多占 1 槽；单槽配置可运行总览但不承诺 Chat 即时可用，全局额度被占满时仍返回繁忙。

Overview completion 仅在创建 reservation 前遇并发容量不足时，允许后端内部有界等候（每实例最多 4 个等待者、最多 120 秒）。等待不产生 reservation、模型调用次数或 token 消耗；超出等待人数或时间仍返回现行 `AI_CONCURRENCY_LIMIT` 及安全重试元数据。等待期间检查取消、deadline 和绑定生成的 owner/source 资格，派发前复核并按剩余期限计算响应超时；额度不足和已派发 Provider 失败不进入这条等候重试路径。此为服务端单次调用内的准入，不改变客户端不自动循环补发的规则，不增加 HTTP/SSE 字段。

### 2026-10-27 Overview direct 重试身份（契约自动检查通过，未部署）

`POST /api/ai/source-overviews`及`/api/ai/subject-overviews`的JSON/SSE请求增加可选UUID字段`retryOfRequestId`，省略/null为普通生成；字段取上次的`X-Overview-Request-Id`，本次header仍用新的UUID。字段只控制执行/幂等，不参与内容、模型或阶段缓存指纹，公开OverviewResponse不变，不新增SSE事件。

相同requestId重放同一尝试状态/结果，失败不复活；普通新request对有效ACTIVE合流，对FAILED/过期direct任务创建新尝试。显式重试同user/scope目标，父代同身份后继已存在则返回后继；已有后继身份不匹配按普通direct独立生成处理。当前user下未找到旧映射也按普通生成，不读取、接替或复用他人任务；已解析的跨scope目标返回冲突。同requestId变更payload或retryOf意图拒绝。显式重试碰到非目标后继的有效同身份ACTIVE时返回明确冲突，不终止无关执行；job-owned目标/过期job generation不由direct接替。

`AI_*`额度/并发错误保持；旧调用按原Guard结算，重试不清账。现有durable-job接口及其原预算/恢复语义不变。runtime OpenAPI导出15/15通过，PC/Mobile以openapi-typescript7.13.0同步schema，二者字节一致；差分仅两处optional retry字段及JsonNode无语义属性顺序变化。最终SDK与验证证据见[实施计划](../plans/2026-10-27-overview-explicit-retry.md)。

### 2026-10-27 原章顺序候选（公开shape不变，未部署）

Source/Subject adaptive ALL/OUTLINE新增内部原章绑定：可靠原章按原文顺序固定，章内可重组小节；跨章混装程序分拆归位，不作为新的公开失败原因或增加模型重试。前置BODY保留为导论，无可靠章结构则允许自由组织并按首次BODY位置排章。原引用授权、唯一归属、最终容量与保存围栏保持；SUMMARY语义不变。

`sourceChapterStart`、sourceChapters和位置双键均为内部索引/路由信息，不进入公开OverviewResponse、provenance输入或正式结果字段；端点、schemaVersion=1、鉴权和前端入口保持。本轮只做相关后端检查，不重新生成OpenAPI/SDK，未部署。[规则与验证](../plans/2026-10-27-overview-original-chapter-order.md)。

### 2026-10-26 Overview 容量由环境配置控制（当前候选，未部署）

JSON/SSE、正式结果 GET/PUT、mode、公开 `schemaVersion`、`sourceIds` 及 raw/canonical provenance 的字段形状保持。Overview 的请求、输出、章节、正文、导读、来源和 provenance 容量由服务端 `OverviewLimits` 正数配置执行，默认 0 不增加固定帽；必填、非空、合法 UUID、路径、唯一性及来源归属仍校验。OpenAPI 不再声明旧固定最大长度/数量，PC 接收端不复制这些容量上限。Writer 两字段输出是内部契约，不改变公开结果。

未知模型能力使用既有 `MODEL_UNAVAILABLE` 在模型派发前明确拒绝，需要服务器提供完整 provider/endpoint/model capacity profile；不回退到聊天的小容量。最终来源数量按不同来源 UUID 计算，不按中间主题或原文单元数量计算。原模型调用额度、鉴权和保存围栏继续生效。OpenAPI artifact 与 PC/Mobile 生成类型比较通过，真实 Provider/GUI 未验收；验证详情见[动态容量计划](../plans/2026-10-26-overview-dynamic-capacity-and-simplification.md)。以下较早日期条目保留当时的工程记录。

### 2026-10-26 Overview导航与正文阅读边界（公开shape不变，本轮未部署）

ALL/OUTLINE章节阅读区仅装配有BODY支撑的Writer结果，不直接插入NAVIGATION原始解析文本；删除纯导航小节后的空章不返回，provenance路径依最终输出重排。导航主题的轻量结构信息仍可辅助ALL导读，不能描述成已提供的教学正文。当本次索引/路由没有BODY写作组时，使用既有MUTATION_REJECTED返回无可生成正文的明确原因，不进入EDIT或输出空章节结果。

EDIT只读取成稿标题、小标题和首尾块的轻量视图，完整正文由程序保留及应用补丁。Writer统一依据本批原文写作，父级目标只说明位置；INDEX提示尽量提取实质主题，合法子集校验保持。OUTLINE仍是无导读的完整章节模式，SUMMARY保持原语义。未新增API字段、模式、错误码或数据库schema；未运行真实Provider/GUI验收。

### 2026-10-26 Overview 索引选择与 instruction 语义（公开shape不变，本轮未部署）

总览是基于资料选择组织的学习入口，不保证原文无损替代；内部INDEX允许授权原文单元的非空合法子集，未引用不表示已确认属于背景，原资料不删除。不再为补齐每个原文编号触发模型修复，但已返回引用的授权和角色配对继续校验，目录继续处理已选主题。

现有 instruction 字段及长度限制不变。自适应索引、metadata和route等结构阶段使用空instruction；Writer/EDIT接收顶层用户偏好且不得越过阶段输出结构和来源授权，资料内嵌命令不作为指令。Writer内部UUID/hash/range不再作为模型输入，程序侧来源绑定和公开provenance保持。未修改路由、响应字段、OpenAPI或数据库schema；验证与本轮未部署边界见[实施计划](../plans/2026-10-25-overview-boundary-edit-quality.md)。

### 2026-10-26 Overview 内容组织与边界编辑（公开shape不变，未部署）

自适应Source/Subject的ALL/OUTLINE采用内部用途索引与独立正文生成，完成后由一次边界编辑返回受控补丁；ALL同时返回summary导读，OUTLINE保持summary=null，SUMMARY保持现有独立短摘要语义。章节预告、目录只提供导航，背景默认不进入生成总览；原资料保留。新的用途字段、分段/块hash及补丁指令是内部契约，不加入公开OverviewResponse或provenance输入。现有路由、鉴权、正式GET/PUT、生成接收与冲突保护入口保持。

补丁不重分配核心正文来源，生成响应继续使用raw OutlineProvenanceInput，正式结果继续返回canonical view；来源关联不证明逐句事实正确。内部新算法与checkpoint namespace隔离不匹配的中间产物，不清理已有成功结果或正式记录。源码与分批验证边界见[实施计划](../plans/2026-10-25-overview-boundary-edit-quality.md)；未部署、未运行真实Provider或GUI验收。

### 2026-10-25 Overview 生成 provenance 与正式结果视图

Source/Subject Overview 生成 SSE 的 `outlineProvenance` 使用 `OutlineProvenanceInput`：每个 section 按 path 提供 source refs，refs 只含 source/revision 与可选 chunk/generation/半开字符范围。PC 在接收时按 Java UUID 字符串形状（含 nil UUID）、section 覆盖、Source 绑定及范围配对校验，并原样作为 `outlineProvenance` 输入发送到正式结果 PUT；生成响应不含服务端尚未解析的 canonical locator 字段。正式 Overview results GET/PUT 响应仍是 canonical `OutlineProvenanceView`，要求精确度、解析文档/解析器信息和完整 locations；每节最多 500 refs，不能把生成输入当作正式视图。服务端生成响应字段的语义已存在，本次只修正 PC 接收与持久化接线，不改变 wire shape 或数据库结构。

### 2026-10-25 Overview job 可空 deadline 语义（shape 不变；未部署）

`AURALIS_AI_OVERVIEW_TASK_TIMEOUT_MILLIS=0` 后，新 claim 的持久 job 以 `deadlineAt=null` 表示无整任务期限；该值也可能仍表示首次 claim 前尚未设期限，需结合 status 判断。正数配置和已有正数 deadline 的到期、EXPIRED、pause/resume/reconcile 语义不变，已有期限不会因重试而延长。`JobView.deadlineAt` 的 required-but-nullable wire shape、OpenAPI 和 SDK 类型不变；候选完成后的读取规则不变。

### 2026-10-24 Overview 阶段 3–7 writer preview fragments

`GET /api/ai/overview-jobs/{id}/preview/{nodeId}?planId=` 的 NodeView 正文由 `fragments` 返回；每项包含一个完整 Overview section 和该片段的 canonical provenance。旧单字段 `section` 与 `provenance` 已移除。服务端校验 VERIFIED parent checkpoint、片段哈希、source range manifest 和聚合输入覆盖后才返回全部片段。正式 OverviewResponse 与原 4000 字符 section.summary 上限不变。

更新时间：2026-10-24
文档状态：阶段 1 Auth、阶段 2A Subject/KnowledgeBlock/Task、阶段 2B Source/Asset/Relation、阶段 3 Sync、阶段 4 Review/Stats/Realtime 与阶段 5 AI/RAG 后端基线已构建；R3 已固定运行时 OpenAPI 产物并生成 PC/Mobile 类型 SDK；真实 PostgreSQL/MinIO/外部模型、前端联调和人工验收仍未完成
权威范围：新后端 REST、SSE、WebSocket 的目标路径、鉴权、请求/响应规则和阶段状态。
事实来源：docs/plans/backend-greenfield-rewrite-plan.md、阶段 0 对象差异矩阵、替换前旧 Server 代码盘点。

### 2026-10-22 Overview M4 candidateInput（源码、相关 API 验证、唯一审查与隔离浏览器接口流程完成；未部署）

本项为历史记录，`candidateInput` 已于 2026-11-12 移除。PC M4 selector/preview/publish/adopt/section-reader 交互此前已撤回；下列接口流程只描述当时的实现，不是现行契约。

- 现行 formal Source/Subject result PUT 可选 nullable `candidateInput`：`{jobId: UUID, jobVersion: positive integer}`，用于 ALL/OUTLINE 候选。Server 按授权 owner/scope/current job version、raw snapshot、profile/algorithm 与 assembled plan 重建输入 descriptor；不接受客户端伪造内容。
- 原 `baseVersion`/CAS、`clientWriteId` 幂等、identity/provenance、summary partial update 与 receipt hash 语义保留；候选引用不能改变既有 publication intent。Candidate GET wire shape 不变，无新 route。Job start 仍按 owner/clientRequestId 回放；profile/raw currentness 由 candidate GET/publication 校验，不承诺 start 返回 409。隔离浏览器已验证 publish/read/conflict/local save/adoption 后端接口流程；SQL bind 修复没有改变 API artifact，未重新生成 SDK。未部署，未进行正式用户业务验收。

### 2026-10-22 Overview M3.4 publication/preview（源码与相关 API artifacts/验证完成；未部署）

- Job list 新增可选配对的 `scope=SOURCE|SUBJECT` 与 `scopeId=UUID`；两者必须同时存在或同时省略。过滤查询先校验 authenticated owner 下的 active scope；opaque cursor 绑定 owner 与 filter domain。`limit` 仍为 1–50。
- `POST /api/ai/overview-jobs/{id}/publish` 接收 `{clientPublishId,expectedVersion,baseVersion}`，`GET /{id}/publication` 读取 durable intent。意图绑定 completed candidate、assembled plan、captured enqueue baseline 与独立 write-receipt key；不会接受 client 自带 result 内容。冲突保留 private candidate，不自动 rebase。
- `GET /api/ai/overview-jobs/{id}/preview?limit=&cursor=` 返回 active plan 的 VERIFIED writer node metadata；`GET /{id}/preview/{nodeId}?planId=` 读取单个已验证 node body。owner/job/plan/input/checkpoint fences 每次读取重验，非完成 job 标 incomplete，失败/暂停/恢复状态只读展示已验证节点。
- `/api/overview-results/sources/{sourceId}/outline`、`/subjects/{subjectId}/outline` 返回正式稳定 section UUID、path、title、chapter metadata 与 result version，不包含 section 正文或 summary；相应 `/sections/{sectionId}?version={positive}` 才读取单节完整正文与 canonical provenance。全量结果 GET/PUT 仍是现行正式路径。
- API artifacts、双 SDK 生成和 `export=false` 实际 artifact comparison 已在隔离门禁完成；相关 HTTP 契约测试通过。正式结案与 full-suite 失败边界见 [M3.4 计划](../plans/2026-10-22-overview-m34-publication.md)。未部署或进行 GUI 业务验收。

### 2026-10-22 Overview M3.3 后台作业 API（源码与相关契约验证完成；未部署）

自适应生成提供 /api/ai/overview-jobs：POST 返回 HTTP 201，创建或按 owner 与 clientRequestId 幂等返回 job；相同 key 绑定不同请求 hash 时冲突。GET 列表支持 limit（默认 20、1–50）和 opaque cursor，GET /{id} 查询单 job。POST /{id}/pause|resume|cancel|reconcile 均要求正数 expectedVersion 作并发版本围栏；GET /{id}/candidate 仅检查 job 为 COMPLETED、当前 owner/request/source manifest/profile/algorithm snapshot 匹配且已存 payload 可用，不检查执行 deadline。

启动请求为 {clientRequestId,scope,sourceId?,subjectId?,sourceIds?,mode,instruction?}，其中 scope=SOURCE 只接受 sourceId；scope=SUBJECT 只接受 subjectId 与有序、去重的 1–100 个 sourceIds。mode 为 ALL|OUTLINE；instruction 最多 2,000 字符。不接收客户端 user、profile、manifest、budget、generation 或节点身份。响应 JobView 包含 jobId/status/version/scope、必要 scope ids、mode、stage、verifiedNodes、可空 totalNodes/deadlineAt/safeErrorCode/completedAt 与创建/更新时间；totalNodes=null 表示尚未规划，不伪造百分比。deadline 在首次 claim 前为 null。

状态为 QUEUED/RUNNING/PAUSING/PAUSED/CANCELLING/CANCELLED/COMPLETED/FAILED/RECOVERY_REQUIRED/EXPIRED。暂停在安全边界阻止后续 dispatch；当前已授权调用可结算并仅在完整验证后保存 checkpoint。取消提升 fence 并撤销当前 generation owner，迟到 worker 不能提交候选；已发请求的远端执行不保证可撤回。恢复/对账只复核原 job、原 generation 与所有精确 reservation；未知派发、缺失或不一致关联保持 RECOVERY_REQUIRED，不得重发。raw budget UUID 保留在 job/generation；精确 invocation 的 task_id 是 Guard 按用户、feature 与 raw budget UUID 稳定派生的真实 ledger 身份，该内部身份不改变预算或结算语义，也不作为客户端请求字段。所有查询从认证用户推导 owner，列表有界。

首次 claim 后固定的 deadline 约束未完成 job；暂停或运行中 job 到期后，经 resume 检查、worker claim 或每次有界 worker poll 最多处理一个到期 job 转为 EXPIRED 并撤销旧 generation fence。已 COMPLETED 的候选不因执行 deadline 过期而变为 EXPIRED，到期后仍可按前述 owner/snapshot/payload 条件读取；若候选 payload 按现有保留策略已清理或当前 snapshot 失效，则明确不可用且不会自动重发 Provider 请求。

该 API 只提供私有完整候选读取，不写 overview_results、KB 或 Review；正式结果发布与分节预览由 M3.4 提供。PC consumer 曾在后续阶段接入，但当前已按用户决定撤回，不作为后续端侧待办。M3.3 相关 API、OpenAPI/SDK 自动对照与唯一 review 已完成；full backend 未在受影响组修复后重跑，未部署、未做真实 Provider/业务数据库/GUI 验收。

Overview candidate retention remains owner- and current-input-fenced. A Source/Subject revocation fences the associated job/generation/publication path and clears its private raw-derived payload copies; formal saved results follow the existing explicit resource lifecycle. After revocation, replay of a retained write-receipt tombstone returns the existing RESOURCE_VERSION_CONFLICT outcome. An expired or revoked private candidate cannot be resumed by read/replay and does not trigger a new Provider dispatch. This closeout adds no route or wire-shape change.
### 2026-10-19 Overview M3.2 内部 writer journal（无公开 API 变化；相关验证与唯一审查完成）

M3.2 adds only private backend execution metadata for the existing adaptive Source/Subject ALL/OUTLINE generation flow. It does not add job/control/progress endpoints or change request/response, Provider canonical JSON, OpenAPI, or generated SDK shapes. Provider reservations bind to the current writer node before dispatch; precise recovery state remains internal and does not publish partial results. Related focused PostgreSQL/backend validation and the package completed, and the sole review closed with BLOCKER=0, IMPORTANT=0, OPTIONAL=0. The full backend suite was not rerun after focused fixes. It is not deployed.




### 2026-10-19 Overview M1 内部生成路径（公开契约不变）

本轮没有新增或修改 Overview endpoint、request/response DTO、`OverviewResponse` 字段、`schemaVersion=1`、`sourceIds` 或 `mode`，也没有数据库迁移；OpenAPI/SDK shape 不变。默认 false 的内部开关启用后，Source/Subject ALL、OUTLINE 使用当前 READY 原文按节生成并在应用内装配；SUMMARY 保持旧短摘要语义。错误继续使用既有错误投影。适配 inventory 合计最多 500 条 active 原始 chunk row（含空白），通过 bounded remaining+1 sentinel 在完整 identity/hash 与 Provider dispatch 前拒绝超限。小输入保持单次有界目录请求；聚合索引不适配时，M3.1 已实现并完成相关验证和唯一审查的有限层级 metadata 规划会将最终路由展开到原始单元后沿用既有写作与来源装配。分层仍受上限约束，无进展或超限明确失败；不改变 endpoint、DTO、OpenAPI 或 SDK shape。未部署。

### 2026-10-19 Overview M3.1 分层规划路径（契约 shape 不变；未部署）

有限层级只重组轻量索引 metadata，不传递原文，也不改写已完成正文；内部 plan alias 不作为 Source UUID 或 provenance。最终目录会展开到原始 unit aliases 并按原 inventory 顺序交给现有 writer。相关验证及唯一 review 已完成；验证报告见 `D:/Temp/auralis-overview-m3-planning-20261019/final-validation-report.md`。本阶段不改变公开契约 shape，也不等于部署或业务验收。

### 2026-10-19 Overview M2 身份与来源 metadata（实现、artifact 与 SDK 验证完成）

- Source/Subject Overview PUT 可带 `outlineIdentity:{schemaVersion,nodes:[{path,nodeId}]}`；`path` 与 `nodeId` 均为必需字段，nodeId 为 UUID 或 null（新节点必须显式传 null），现有节点必须使用当前结果内 ID。服务端生成/校验身份及版本，不接受客户端提供 hash/version。SUMMARY builder 省略身份和 provenance，服务端保留已有大纲 metadata。
- 写入可带 `outlineProvenance:{schemaVersion,sections:[{path,sourceRefs:[{sourceId,ingestionRevision,chunkId?,generation?,charStart?,charEnd?}]}]}`；chunkId、generation 与范围可省略或为 null。输出必须包含 `identityReady` 与 `outlineIdentity`（旧结果显式 null），`outlineProvenance` 在不存在时省略；canonical refs 固定字段可为 null 的部分由 nullable schema 表达。坐标均为 UTF-16 半开范围；客户端页码、block 与位置不作事实来源。
- Provider canonical Overview JSON 仍为 schemaVersion/title/outline/summary 四字段，模型提供的同名 app metadata 会在类型转换前丢弃；不改 Provider schema。最终 attempt13 OpenApiArtifactTests 13/13，官方 artifact SHA-256 `660b28e4a0e527d8779b9b7009ad31801b4e0e9c501489f40b7192f4e802c1b0`；四个对象引用字段使用 anyOf reference/null，PC/Mobile SDK 7.13.0 均 byte-identical，SHA-256 `9ae585615f8062cdb8d9a8b0b43a19a173701c9acd878df4d760d040cebd0002`。

### 2026-10-16 AI usage provenance extension

`GET /api/ai/usage` keeps the existing `hourly` and `daily` window fields. These windows represent platform quota charged/reserved tokens, including historical rows whose credential source is NULL as conservative legacy occupancy. The response adds `allCalls`, keyed by `PLATFORM`, `USER_SUPPLIED`, and `LEGACY_UNKNOWN`. Each entry reports nullable `actualInputTokens`/`actualOutputTokens`, `unknownDispatchedCalls`, `chargedTokens`, `reservedTokens`, `reservedCalls`, and ledger `calls`. The all-call summary is an audit view and does not change platform remaining quota. Token values are not currency amounts.

New internal Provider invocations carry a server-resolved credential source with the exact credential snapshot used for dispatch. No request field accepts a source label. A missing or legacy-unknown source on a new call fails before reservation with HTTP 500 `AI_POLICY_CONTRACT_VIOLATION`; it is not a quota exemption. Existing JSON/SSE error projections use the sanitized code. This extension adds no public task-id lookup route; task usage lookup is owner-scoped inside the server and accepts only a server-supplied operation-kind set.


## 契约状态说明

本文件同时保留替换前旧 Server 的代码事实，和绿地重写后的目标契约。旧代码事实不代表新 Server 兼容旧请求；目标契约的 planned-after-phase-0 路由必须在对应阶段实现并测试后，才能升级为可用。

当前已实现并可访问的实际路径：

| Method | Path | 当前行为 |
| --- | --- | --- |
| GET | /actuator/health | Spring Boot 健康汇总 |
| GET | /actuator/health/liveness | 进程存活探针 |
| GET | /actuator/health/readiness | 阶段 0 就绪探针 |
| GET | /v3/api-docs | OpenAPI 文档，骨架完成后可访问 |
| GET | /swagger-ui/index.html | OpenAPI UI，骨架完成后可访问 |
| POST | /api/auth/register/email-code | 申请注册邮箱验证码，HTTP 204 |
| POST | /api/auth/register | 以验证邮箱注册用户、设备和 refresh session，HTTP 201，并返回 Location |
| POST | /api/auth/login | 以用户名或已验证邮箱校验密码并签发 token pair，HTTP 200 |
| POST | /api/auth/password/reset/email-code | 申请已验证邮箱的密码重置验证码，HTTP 204 |
| POST | /api/auth/password/reset | 使用邮箱验证码重置密码并撤销旧凭证，HTTP 204 |
| POST | /api/auth/refresh | rotation refresh session 并签发新 token pair，HTTP 200 |
| POST | /api/auth/logout | 撤销当前 access token 对应的 refresh session，HTTP 204 |
| GET | /api/auth/me | 返回当前用户公开资料，需 Bearer access token |
| PUT | /api/auth/me | 按 baseVersion 更新当前用户昵称，返回 UserView |
| PUT | /api/auth/password | 校验原密码并修改密码，撤销该用户 refresh sessions，HTTP 204 |
| POST | /api/auth/me/avatar | 上传当前用户 PNG/JPEG 头像并规范化保存，HTTP 204 |
| GET | /api/auth/me/avatar | 读取当前用户私有 PNG 头像；无头像返回 404 |
| DELETE | /api/auth/me/avatar | 重置当前用户头像，HTTP 204 |
| DELETE | /api/auth/me | 校验密码并受理可恢复账户注销，HTTP 202 |
| GET | /api/auth/sessions | 返回当前用户每台设备的活动会话元数据，需 Bearer access token |
| DELETE | /api/auth/sessions/{sessionId} | 按所属会话定位设备并撤销该设备的活动 refresh 会话，HTTP 204 |
| DELETE | /api/auth/sessions/others | 撤销当前设备以外设备的活动 refresh 会话，HTTP 204 |

阶段 2A 已开放 Subject、KnowledgeBlock、Task；阶段 2B 已开放 Source、Asset、Relation；阶段 3 已开放 Sync push/pull/snapshot；阶段 4 已开放 Review、Stats 和 Realtime ticket。R1-05 已为五类核心资源列表接入稳定 keyset cursor；真实 PostgreSQL/MinIO、双设备和三端联调未验证。

阶段 0 HTTP 验证：`/actuator/health/liveness` 和 `/actuator/health/readiness` 真实启动返回 HTTP 200、`status=UP`；`/v3/api-docs` 返回 HTTP 200 且 `info.title=Auralis API`；`/swagger-ui/index.html` 返回 HTTP 200。MockMvc 同时验证未知路由的 `404`、`RESOURCE_NOT_FOUND`、`application/problem+json` 和 `X-Trace-Id` 回写。

## 新后端基础规则

- REST 业务路径保留 /api 总前缀，不增加 /v1，也不承诺旧子路径兼容。
- API 字段使用 camelCase；ID 使用 UUID 字符串；时间使用 RFC 3339 UTC。
- 成功响应直接返回显式 DTO，不使用统一 Result 包装。
- 创建成功返回 HTTP 201 和 Location；成功删除返回 HTTP 204。
- 更新、删除和恢复请求必须提供 baseVersion；创建使用 baseVersion = 0。
- 版本冲突返回 HTTP 409、错误码 RESOURCE_VERSION_CONFLICT 和服务器当前 DTO；服务器不执行 last-write-wins。
- 列表统一使用不透明 cursor；响应包含 items、nextCursor、hasMore。
- 默认不返回已删除记录；同步接口和显式 includeDeleted 才能读取必要墓碑。
- userId 只能从 SecurityContext 推导，不能进入资源创建/更新请求，也不能信任客户端提交。
- Entity、JPA lazy proxy 和内部持久化类型不得直接序列化为 API。

## OpenAPI 产物与兼容策略

- 当前冻结产物为 `docs/contracts/openapi/auralis-openapi.json`，由测试 profile 的真实 Spring MVC `/v3/api-docs` 运行时文档导出；`OpenApiArtifactTests` 比较运行时 JSON，`scripts/check-openapi.ps1` 还会用固定的 `openapi-typescript@7.13.0` 重新生成两端 schema 并拒绝漂移。
- API 版本继续使用现有 `/api` 前缀，不新增 `/v1`；当前最低客户端基线是本产物对应的 R3 生成 SDK。向后兼容的字段只允许以可选字段或新增路由方式加入；删除字段、改变类型、改变状态码/错误码或改变语义必须先更新契约并安排客户端迁移。
- 当前没有为旧客户端保留兼容窗口：旧 `/ws/sync`、旧 `Result<T>` DTO、旧字段和旧接口不属于新 Server 契约；R4 客户端迁移完成后应删除旧调用路径，R5 前不得把旧协议重新接回主路径。
- cursor 过期或服务端返回 `resetRequired=true` 时，客户端必须停止增量 pull，清理本地同步游标并执行完整 snapshot；版本冲突必须保留本地未提交 mutation、展示服务器当前 DTO 并由用户或上层冲突策略决定重试，不使用 last-write-wins。
- 当前服务端尚未启用最低版本强制门禁；未来若返回 HTTP 426 / `CLIENT_UPGRADE_REQUIRED`，客户端必须停止写入、保留本地待同步数据并引导升级，不得静默降级到旧 DTO。
- 空值使用 JSON null，不用空字符串、0 或展示文案替代。

## Problem Details

所有错误使用 RFC Problem Details，并增加 code、traceId、fieldErrors：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| type | URI | 稳定问题类型 |
| title | string | 安全标题 |
| status | integer | HTTP 状态码 |
| detail | string | 安全业务说明，不包含异常、SQL、路径或 secret |
| instance | string | 当前请求路径 |
| code | string | 稳定错误码 |
| traceId | string | 诊断关联值 |
| fieldErrors | array | 参数字段错误 |

错误码至少包含 VALIDATION_FAILED、UNAUTHENTICATED、FORBIDDEN、NOT_ACCEPTABLE、RESOURCE_NOT_FOUND、RESOURCE_DELETED、RESOURCE_VERSION_CONFLICT、MUTATION_REJECTED、SOURCE_NOT_READY、UPLOAD_VALIDATION_FAILED、INGESTION_FAILED、MODEL_PROVIDER_ERROR、OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE、OVERVIEW_REDUCE_NO_PROGRESS、MODEL_UNAVAILABLE、MODEL_TIMEOUT 和 RATE_LIMITED。无法协商可接受的响应表示返回 HTTP 406 `NOT_ACCEPTABLE`。

## 目标路由总览

以下路由是已批准目标契约；Auth、Subject、Knowledge、Task、Source、Asset、Relation、Review、Stats、Sync、Realtime 已分别在阶段 1/2A/2B/3/4 构建，AI 已完成阶段 5 后端基线：

| 模块 | 目标路径 | 状态 |
| --- | --- | --- |
| Auth | /api/auth/register、/login、/refresh、/logout、/me、/sessions | implemented-phase-1 |
| Subject | /api/subjects、/api/subjects/{id}、/api/subjects/{id}/restore | implemented-phase-2a |
| Asset | /api/assets/upload-intents、/api/assets/{id}/complete、/api/assets/{id}/download-url | implemented-phase-2b |
| Source | /api/sources、/api/sources/{id}、/api/sources/{id}/restore、/api/sources/{id}/reingest | implemented-phase-2b |
| Knowledge | /api/knowledge-blocks、/api/knowledge-blocks/{id}、/api/knowledge-blocks/{id}/restore | implemented-phase-2a |
| Task | /api/tasks、/api/tasks/{id}、/api/tasks/{id}/restore、/api/tasks/schedule-swaps、/api/tasks/schedule-insertions | implemented-phase-2a |
| Relation | /api/relations、/api/relations/{id}、/api/relations/{id}/restore | implemented-phase-2b |
| Review | /api/reviews/states、/api/reviews/lifecycle/* | implemented-phase-4 |
| Stats | /api/stats/overview、/api/stats/weekly、/api/stats/subjects/{subjectId} | implemented-phase-4 |
| Sync | /api/sync/push、/api/sync/pull、/api/sync/snapshot | implemented-phase-3 |
| AI | /api/ai/settings、/api/ai/conversations、/api/ai/messages/stream、Chat run/text-generation routes、建议类接口、/api/ai/source-overviews、/api/ai/subject-overviews | chat-protocol-1-backend-candidate; focused backend tests/package pass; full/PG/client acceptance pending |
| Realtime | /api/realtime/ticket；WebSocket 地址 /ws/events | implemented-phase-4 |

### 2026-10-11 复习旧接口移除

- `GET /api/reviews/due`、`POST /api/reviews/events`、`GET /api/reviews/history` 已从服务端路由和当前 OpenAPI 契约移除；`ReviewScheduler` / FSRS Lite 动态间隔实现已删除。
- 当前复习使用 `GET /api/reviews/states`、`/api/reviews/lifecycle/*` 和下方 lifecycle history。PC 不再调用旧接口或导入旧事件历史。数据库参数集标识仍由 `review_states.parameter_set_id` 引用，事件表仍供现有统计查询使用；本次未更改数据库结构。
- Mobile / Tablet 页面调用方未在本次修改，仍引用上述已删除路由，待单独迁移；此次不包含非 PC 页面改动。

## 阶段 1 Auth 已实现契约

### 请求与成功响应

- `POST /api/auth/register/email-code` 接收 `email`。注册用 `POST /api/auth/register`，请求字段为 `username`、`email`、`emailCode`、`password`、`clientDeviceKey`、`deviceName`、`platform`。新用户名为 1–64 个字符，不能包含 `@`。初始 `displayName` 由服务端设为用户名。邮箱最长 254 个字符，验证后作为唯一登录标识之一。注册成功返回 HTTP 201、`Location: /api/auth/sessions/{sessionId}` 和 AuthResult。
- `POST /api/auth/login` 的 `username` 可传用户名或已验证邮箱，其他字段为 `password`、`clientDeviceKey`、`deviceName`、`platform`。成功返回 HTTP 200 和 AuthResult。
- `POST /api/auth/password/reset/email-code` 接收 `email`，已受理统一返回 HTTP 204，未知邮箱不发送。客户端不得根据 204 宣称该邮箱已存在或邮件已送达。用 `POST /api/auth/password/reset` 提交 `email`、`emailCode`、`newPassword`，成功 HTTP 204，旧访问与续期凭证失效，用户重新登录。
- 验证码为 6 位数字，10 分钟内有效，注册和重置用途分别校验，成功后单次使用。注册、改密和重置密码均要求至少 12 个 UTF-16 代码单元、最多 72 个 UTF-8 字节。
- `POST /api/auth/refresh` 请求字段为 `refreshToken`；成功返回 HTTP 200 和新的 AuthResult，其中 `tokens` 和 `sessionId` 一起轮换，`serverDeviceId` 继续标识该设备。旧 refresh token 立即失效。
- AuthResult 使用直接 DTO，不使用 `Result<T>` 包装：`user { id, username, displayName, version, hasAvatar }`、`tokens { accessToken, refreshToken, accessTokenExpiresInSeconds, refreshTokenExpiresInSeconds }`、`sessionId`、`serverDeviceId`。
- `GET /api/auth/me` 返回 `UserView { id, username, displayName, version, hasAvatar }`。`PUT /api/auth/me` 接受 `{baseVersion,displayName}`，服务端修剪昵称并限制为 1–120 字符，版本不一致返回 `409 RESOURCE_VERSION_CONFLICT`；`hasAvatar` 按读取时 `user_avatars` 行存在性计算，不递增用户版本。头像图片单独读写，不进入 UserView。
- `PUT /api/auth/password` 接受 `{baseVersion,currentPassword,newPassword}`，新密码与注册密码采用相同长度要求，且不得与原密码相同。服务端校验原密码和用户版本，更新密码哈希并撤销该用户全部 refresh sessions。已签发的 access JWT 仍遵循原 15 分钟有效期边界。原密码错误返回 HTTP 401 `UNAUTHENTICATED`，detail 为 `Invalid credentials`。无效 Bearer 的 detail 为 `Authentication is required`。
- `PUT /api/auth/password` 是已登录且持有当前密码的改密接口。API 目前没有通用用户偏好同步或完整数据备份/导出端点。
- `POST /api/auth/me/avatar` 使用 `multipart/form-data` 的 `file` 字段，只接受实际 PNG/JPEG、原文件最大 5 MiB、边长不超过 4096 像素且总像素不超过 1600 万；Spring multipart 单文件接收上限为 5 MiB，完整请求上限为 6 MiB，以容纳表单封装开销。服务端解码并统一重编码为 PNG，私有存储于当前用户头像表。`GET /api/auth/me/avatar` 只返回当前用户头像且设置 no-store/nosniff；客户端须接受 `image/png`，并可同时接受 `application/problem+json` 用于错误响应，不能仅发送 `Accept: application/json`。`DELETE /api/auth/me/avatar` 删除当前用户头像。头像不复用资料 Asset 上传协议。
- `DELETE /api/auth/me` 接受 `{password}` 并返回 HTTP 202 `{id,status,requestedAt}`，表示注销清理已受理而非永久删除已完成。服务端在事务中停用用户、撤销 refresh sessions、持久化 Asset 与 ParsedDocument 对象键；上传意图签发与停用用户通过用户锁串行化。后台任务等待既有上传签名有效期及缓冲后，按键幂等清理对象并在用户归属锁下重扫，最后按 owner 显式删除关联数据和用户，保留不含用户外键的完成记录。已完成作业继续分批复扫已记录对象键，处理预签名 PUT 晚到造成的对象重现；对象清理失败保留作业并重试。没有公开的跨账户作业状态查询路由。
- `GET /api/auth/sessions` 返回 `{ items, nextCursor, hasMore }`；每个 item 包含 `id`、`serverDeviceId`、`deviceName`、`platform`、`createdAt`、`lastUsedAt`、`expiresAt`、`revokedAt`、`current`。列表只展示未轮换、未撤销、未过期的活动会话，并按 `serverDeviceId` 归并为一条。`current` 比较 access JWT 的 `serverDeviceId`。同一用户在同一设备再次登录会先撤销该设备的旧活动 refresh session，再签发新的会话。阶段 1 当前不提供 cursor，因此 `nextCursor=null`、`hasMore=false`。
- `DELETE /api/auth/sessions/{sessionId}` 使用属于当前用户的会话 ID 定位设备并撤销该设备当前活动的 refresh sessions。列表中的 ID 在会话轮换后仍可用于定位原设备。`DELETE /api/auth/sessions/others` 按 access JWT 的 `serverDeviceId` 保留当前设备，撤销其他设备的活动 refresh sessions。
- 登出和会话撤销成功返回 HTTP 204；会话查询和撤销始终从 SecurityContext 的 userId 推导归属，不接受客户端 userId。撤销会阻止 refresh token 续期；已签发的 access JWT 仍在其 15 分钟有效期内自然过期，不承诺瞬时断开。

### 鉴权和安全错误

- 注册、登录、刷新为公开路径；登出、当前用户和会话路径使用 `Authorization: Bearer <accessToken>`。
- access JWT 有效期配置默认 900 秒；refresh session 默认 2,592,000 秒（30 天）。JWT 只含 `sub`、`sid`、`serverDeviceId`、`typ=access`、`iat`、`exp`；refresh token 只保存 SHA-256 hash。
- 未登录、无效、过期、撤销或重放 refresh token 返回 HTTP 401、错误码 `UNAUTHENTICATED` 和安全 detail，不返回 token 内容。refresh token 不能作为 access token 使用。
- 重复使用已轮换的 refresh token 会撤销整个 rotation family；跨用户撤销不存在的 owner-scoped session 返回 HTTP 404、`RESOURCE_NOT_FOUND`，不泄漏归属。
- 参数校验返回 HTTP 400、`VALIDATION_FAILED` 和 `fieldErrors`；重复用户名返回 HTTP 409、`MUTATION_REJECTED`。安全过滤器错误也返回 `application/problem+json` 和 `X-Trace-Id`。

## 阶段 2A Subject、KnowledgeBlock、Task 已实现契约

- 三类资源均使用 `POST` 创建、`GET` 列表/详情、`PUT` 更新、`DELETE` 软删除和 `POST /{id}/restore` 恢复；创建返回 `201 + Location`，删除返回 `204`。
- 创建请求必须携带 `baseVersion=0`；更新、删除和恢复请求携带精确的 `baseVersion`。成功更新、删除、恢复均使服务器 `version` 增加 1。注册后的 Subject 列表允许为空；历史遗留的 `defaultSubject=true` 记录也按普通 Subject 软删除，不再设置不可删除特权。
- Subject DELETE 的请求/响应形状不变。成功删除 Subject 会在同一服务端事务内为同一用户且 `subjectId` 匹配的活动 Source、KnowledgeBlock、Task 生成普通 `DELETE` 同步墓碑，并为受影响 Relation 生成普通 `DELETE` 墓碑；每个资源只生成一次，已删除子资源保持幂等，Subject restore 不自动恢复子资源。级联失败会回滚整次删除；客户端仍通过既有 Sync change-log/snapshot 协议收敛。
- Subject-owned 写入在服务端使用统一数据库锁协议：先由内部 `SubjectLockCoordinator` 对所有涉及 Subject 去重并按 UUID 升序获取悲观行锁，再锁具体业务资源并重新读取、校验活动状态、归属、`subjectId` 和 Relation 端点。该并发实现不改变任何公开 API 请求/响应、版本或同步字段。
- `GET /api/subjects`、`GET /api/knowledge-blocks`、`GET /api/tasks` 返回 `{items,nextCursor,hasMore}`，接受不透明 `cursor` 和可选 `limit`（默认 100，范围 1–200），默认过滤已删除记录。Subject 按 `sortKey ASC, updatedAt DESC, id ASC` 稳定分页，其余三类按 `updatedAt DESC, id ASC` 稳定分页。
- Subject 请求字段为 `name`、`description`、`iconKey`、`sortKey`；响应另含 `defaultSubject`、`version`、`createdAt`、`updatedAt`、`deletedAt`。Subject 不提供专属颜色字段，客户端使用全局语义设计色。
- KnowledgeBlock 请求字段为 `subjectId`、可空 `sourceId`、`title`、`content`、`colorOverride`；不再提供知识块 `summary/tags`。新建、更换来源或变更所属学科时，非空 `sourceId` 必须指向同一用户下活动的 Source。更新时若 `subjectId/sourceId` 均与锁定的现有知识块一致，允许原 Source 已软删除，普通标题、正文或颜色修改仍可保存；知识块 owner、活动状态和版本校验保持。响应不序列化 Entity，正文不会从摘要回退。已排队旧 mutation 的多余字段可被解析器忽略，客户端不得改写其不可变载荷和请求 ID。
- Task 请求字段为 `subjectId`、`title`、`description`、`status`、`scheduledAt`、`dueAt`、`durationMinutes`、`sortKey`；status 仅接受 `TODO`、`IN_PROGRESS`、`DONE`、`CANCELLED`。更新任务时 `scheduledAt: null` 或 `dueAt: null` 分别明确清除排期或截止时间。PC 客户端把活动的 `TODO`/`IN_PROGRESS` 任务在到期时更新为 `DONE`：有排期时按 `scheduledAt + durationMinutes <= now`，无排期时按有效 `dueAt <= now`，保留原排期和截止时间。复用普通 TASK UPDATE 与现有同步队列，不增加接口；检查在 PC 启动/任务投影刷新及运行中每分钟执行，应用关闭时由下次启动补处理，Server 不提供此自动完成定时器。V21 删除 `tasks.color_override` 并清理 TASK 历史 JSON 颜色键，KnowledgeBlock 的 `colorOverride` 保留。
- 所有 Task 排期写入均阻止同一用户未删除且非 `CANCELLED` Task 的排期区间重叠，区间按半开形式 `[scheduledAt, scheduledAt + durationMinutes)` 计算，首尾相接允许；`durationMinutes` 为 `null` 时按 30 分钟计算。REST 冲突返回 `400 VALIDATION_FAILED`；Sync push 冲突将该 mutation 记为 `REJECTED` 并返回 `VALIDATION_FAILED`，其他 mutation 仍按各自结果处理。服务端在事务内以同一用户行锁串行化排期写入，覆盖跨 Subject 并发。
- Task 的 `dueAt` 同时用于截止提醒、排序和完整排期上限。创建、恢复、新排期或修改排期/有效时长/截止时间时，若 `scheduledAt` 与 `dueAt` 均存在，必须满足 `scheduledAt + effectiveDurationMinutes <= dueAt`；恰好结束允许，`durationMinutes=null` 按 30 分钟，没有截止时间不施加此限制。Server 不改写用户提供的截止时间。不合法区间返回 `400 VALIDATION_FAILED`，Sync 将该 mutation 记为 `REJECTED`。历史排期不批量重写；有效时间字段未变化的标题、备注、状态更新（含自动 DONE）仍可保存，空时长与显式 30 等价；`CANCELLED` 重新进入活动排期必须重新校验。
- `POST /api/tasks/schedule-swaps` 用于两个已排期 Task 的原子时段交换。请求为 `{sourceTaskId,sourceBaseVersion,targetTaskId,targetBaseVersion}`，四项均必填；服务端按稳定顺序加锁并在一次事务内校验两个版本和换位后的区间；若两任务原区间首尾紧邻，则交换先后顺序并将两任务紧凑排在原共同时间窗口内，窗口起止不变；非紧邻任务仍互换原开始时间。服务端确认双方新区间不互相重叠且不与同用户其他未取消任务冲突，成功返回 `{source,target}` 两个更新后的 Task。双方的新完整区间均必须结束于各自 `dueAt` 或之前（无截止除外），任一超限整笔返回 `400 VALIDATION_FAILED`；`DONE` 和 `CANCELLED` 任务不可交换。任一版本、区间校验或持久化失败均回滚整个交换，不产生半交换状态。`scheduledAt`/`dueAt` 均为 RFC 3339 UTC/带时区 instant；无法反序列化的字段返回 `400 VALIDATION_FAILED` 与 `fieldErrors`。
- `POST /api/tasks/schedule-insertions` 支持普通空白槽位的插入顺延与任务主体的严格放置，只有顶部交互栏落点使用 `schedule-swaps`。请求为 `{taskId,baseVersion,scheduledAt,windowStartAt,windowLastStartAt,targetTaskId?}`，前五项必填；`targetTaskId` 是可选 UUID，三个时间字段为 RFC 3339 带时区 instant；窗口必须正好覆盖 PC Timeline 当天 08:00 至 22:30 的起始槽，客户端提交这两个本地时间对应的 instants。服务端以 `windowStartAt` 为半小时网格起点将目标向上取整；按目标顺序检查 Task 完整时长，仅当下一任务的原起始时间早于前项结束时间才将其顺延到前项结束后的第一个半小时槽，原有空档会保留。不含 `targetTaskId` 的普通空白槽位请求维持原有插入顺延。含 `targetTaskId` 的卡片主体请求以锁定后的目标任务结束时间计算首个半小时槽，仅移动被拖任务，目标及其他任务不变；若被拖任务完整区间与任何其他排期冲突或目标后无可用起始槽，则整笔返回 `400 VALIDATION_FAILED`；目标已变化导致结束槽不符返回 `409 RESOURCE_VERSION_CONFLICT`，目标不存在返回资源未找到。`DONE` 任务固定，`CANCELLED` 不占用区间；如果需移动 DONE 或任何顺延起点超过 `windowLastStartAt`，则返回 `400 VALIDATION_FAILED` 并回滚整组。被拖任务和全部实际顺延任务的新完整区间均必须结束于各自截止时间或之前（无截止除外），任一超限整组返回 `400 VALIDATION_FAILED`，所有任务时间和版本保持不变。服务端按 User→Subject(UUID 升序)→相关 Task(UUID 升序) 获取悲观锁并在同一事务中提交。成功返回 HTTP 200 `{tasks:[TaskResponse...]}`，列表只含 `scheduledAt` 实际改变的 Task，按新排期时间和 UUID 排序；每项版本增加 1，并发布普通 `UPDATE` change-log/realtime 事件。该 REST 路由保留供在线调用；PC Timeline 统一通过下方 `SCHEDULE_INSERTION` Sync 命令提交，离线和在线采用同一服务端事务与截止/冲突校验。
- `schedule-insertions` 请求另支持可选的 `placementMode: "STRICT"`，用于周视图跨天放置。该字段与 `targetTaskId` 互斥。`scheduledAt` 必须是窗口内的精确半小时槽；服务端检查源任务的版本、状态、过去时间、完整时长、截止时间及其他任务占用，只移动源任务。成功返回该任务，若起点相同则返回空列表。Sync 拒绝或冲突时返回当前源任务（可读取时）。PC 周列拖放需连接支持该模式的 Server。
- 插入顺延仅移动起始时间处于请求当天窗口内的 Task。跨入窗口的窗口外任务保留原位，若它与插入后的排期冲突，整个请求返回 `400 VALIDATION_FAILED`。零分钟任务的区间为空，可占用一个显示位置而不参与区间冲突或顺延。
- 所有资源的用户归属均从 Bearer access token 推导；跨用户 ID 统一按未找到处理。版本冲突返回 `409 RESOURCE_VERSION_CONFLICT`，删除后的普通详情/列表不返回墓碑。

PC 任务日期输入约束（2026-10-09）：日期选择器的 `YYYY-MM-DD` 在客户端转换为当地当天 `23:59:59.999` 对应的 UTC ISO instant；例如香港 `2026-10-09` 为 `2026-10-09T15:59:59.999Z`。API 不接收纯日期，不将已提供的午夜或 UTC 日末改解释为全天。未改日期的标题/备注编辑保留原精确截止值。排期插入请求不含 `dueAt`，Server 读取当前任务截止值校验；前端必须采用相同 instant 比较。

## 阶段 2B Source、Asset、Relation 已构建契约

- `POST /api/assets/upload-intents` 请求字段为 `baseVersion=0`、必填 UUID `clientImportId`、`originalName`、`sizeBytes`、`mimeType`、可选 `sha256`；成功返回 `201 + Location` 和 `{assetId,uploadUrl,headers,expiresAt,uploadStatus}`。同一用户重放同一 `clientImportId` 且 immutable metadata（文件名、大小、MIME、sha256）一致时返回同一 Asset 及当前 `uploadStatus`；`UPLOADING` 会重新签发 URL，`READY`/`ORPHANED` 不会签发可覆盖对象的 URL。metadata 冲突返回 `409 MUTATION_REJECTED`。该 key 按用户隔离，不同用户可以复用。服务端生成用户前缀 object key，不接受客户端提交 object key；配置 MinIO 时 headers 包含 Content-Type/Content-Length，声明 sha256 时额外包含 `X-Amz-Meta-Sha256`。
- `POST /api/assets/{id}/complete` 不接受客户端对象元数据；服务端对绑定 object key 执行 HEAD/stat，校验真实大小、MIME 和已声明 sha256，成功返回 `AssetResponse` 并将状态置为 `READY`。校验失败返回 `400 UPLOAD_VALIDATION_FAILED` 并记录 `FAILED`。
- `POST /api/assets/{id}/download-url` 只对当前用户拥有且 `READY` 的 Asset 返回 `{url,expiresAt,originalName,mimeType}`；Asset 不作为 Relation 节点，也不进入普通同步资源列表。
- Source 创建/更新字段为 `baseVersion`、`subjectId`、`type`、`title`、可选 `assetId`、`originUrl`、`rawText`、`outline`；type 仅为 `FILE`、`TEXT`、`URL`。FILE 必须引用同一用户的 READY Asset，TEXT 必须有 rawText，URL 必须是 HTTP/HTTPS URL。Source 成功响应对 FILE 资料额外返回可选 `assetSizeBytes`（Asset 原始字节数），以及服务端生成、客户端只读的 `ingestionRevision`；TEXT/URL 或无法关联 Asset 时 `assetSizeBytes` 为 JSON `null`。
- FILE Source 创建进入 `AWAITING_CLIENT`，Asset 替换或 FILE reingest 轮换 revision 并保持该状态，不发布服务端 ingestion event；TEXT/URL 创建、更新和 reingest 清理安全错误并进入 `PENDING`，继续发布 `SourceIngestionRequestedEvent`。FILE 仅标题等不影响解析的更新保留当前状态。Source 其余成功操作沿用直接 DTO、版本冲突、软删除、恢复和列表 envelope 规则。
- Relation 创建/更新字段为 `baseVersion`、`sourceType`、`sourceId`、`targetType`、`targetId`、`type`、可选 `label`；节点仅允许 `SUBJECT`、`SOURCE`、`KNOWLEDGE_BLOCK`、`TASK`，关系类型仅允许 `CONTAINS`、`REFERENCES`、`DERIVED_FROM`、`DEPENDS_ON`、`RELATED_TO`。
- Relation 创建、更新、恢复都会验证两端属于当前用户且未删除，禁止自关联；`RELATED_TO` 对端点排序后去重，其他类型保持方向性。端点软删除会级联软删除相关 Relation，端点恢复不自动恢复关系。
- `GET /api/sources` 和 `GET /api/relations` 同样返回 `{items,nextCursor,hasMore}`，接受不透明 `cursor` 与 `limit`（1–200），按 `updatedAt DESC, id ASC` 稳定分页。
- 阶段 2B 的 H2/MockMvc 自动测试覆盖以上路由、错误、版本、用户隔离和级联语义；真实 MinIO 签名 URL、HEAD/stat、PostgreSQL 和人工验收仍未执行。

## 阶段 3 离线同步已实现契约

PC 连续排期使用原有 `SCHEDULE_INSERTION` / `SCHEDULE_SWAP` wire 契约；客户端对排期 payload 使用现行字段白名单，本地队列预测、成员围栏及首发标记不上传。后继排期只在前驱终态结算后首次派发；已发送命令以同一 ID 和相同内容重试，不改变现有服务端幂等约束。端侧持久化细节见 [数据库与端侧数据契约](Database.md#2026-10-31-pc-排期命令本地串行队列无-schema-迁移)。

- `POST /api/sync/push` 接受 `serverDeviceId` 和 `mutations[]`；每条 mutation 包含 `clientMutationId`、`resourceType`、`resourceId`、`mutationType`、`baseVersion` 和可选 `payload`。首批资源为 `SUBJECT`、`SOURCE`、`KNOWLEDGE_BLOCK`、`TASK`、`RELATION`，操作为 `CREATE`、`UPDATE`、`DELETE`、`RESTORE`。
- `CREATE` 要求 `baseVersion=0`，通过业务校验后仅插入新行。数据库主键碰撞时，该条返回 `REJECTED`，`code` 为 `MUTATION_REJECTED`，`current` 和 `changeCursor` 为空。同批后续 mutation 继续处理。已记录的同请求重放仍返回原回执。
- `MutationRequest.payload` 与增量 `ChangeResponse.payload` 在 OpenAPI 中声明为允许领域字段的可空 JSON 对象。请求字段由资源和操作决定，增量字段由资源类型决定。
- PC Timeline 的 `TASK` inbound mutation 额外支持 `SCHEDULE_INSERTION` 和 `SCHEDULE_SWAP`。插入命令 payload 为 `{taskId,baseVersion,scheduledAt,windowStartAt,windowLastStartAt,targetTaskId?,placementMode?}`，字段规则与 REST 插入一致。换位命令 payload 为 `{sourceTaskId,sourceBaseVersion,targetTaskId,targetBaseVersion}`，四项必填，外层 `resourceId/baseVersion` 标识命令源 Task。一个命令承载整次放置、插入顺延或换位，服务端在单个幂等事务中执行并以 `MutationResponse.current` 返回 Task 数组。格式错误会将该 mutation 记为 `REJECTED/VALIDATION_FAILED`，业务拒绝或版本冲突也返回可读取的相关当前排期，版本冲突决策为 `CONFLICT`。成功时受影响 Task 仍各自产生普通 `UPDATE` change-log，pull 的 `ChangeResponse.mutationType` 仍只有 CRUD。相同用户/设备和 mutation ID、相同请求内容会回放首次结果。
- Push 返回 `results` 和 `serverCursor`。结果 decision 为 `APPLIED`、`CONFLICT` 或 `REJECTED`，包含资源、mutation、change cursor、当前 DTO/快照、稳定 code 和 `recordedAt`。同一用户/设备/`clientMutationId` 重放时返回首次结果；同键不同内容只拒绝该条 mutation，并返回 `MUTATION_REJECTED`，不会中止同批其他 mutation。
- PC 的本地 `SCHEDULE_UNSCHEDULE` 发送为 `TASK/UPDATE`，请求 `scheduledAt: null`。目标 Task 已删除时，该请求返回 `REJECTED / RESOURCE_NOT_FOUND`，`current` 为空；客户端可从含 Task 软删除记录的快照恢复。
- 领域写入遇到版本冲突、资源不存在或已删除、业务校验或业务拒绝时，先回滚该项写入，再记录可回放的 `CONFLICT` 或 `REJECTED` 回执。同批后续项继续处理。PC 重试未确认的请求使用原 ID 和原载荷；仅首次结算的成功回执可为尚未派发的直接后继推进基版本。
- `GET /api/sync/pull?cursor=<opaque>&limit=<1..200>` 返回 `changes`、`nextCursor`、`hasMore`、`resetRequired`；省略 cursor 从 0 开始。cursor 为 Base64URL 不透明值，资源变更由 REST 直接写入和 push 共同记录。
- `GET /api/sync/snapshot` 返回 `snapshotCursor` 以及当前用户 subjects、sources、knowledgeBlocks、tasks、relations 的完整视图，包含 `deletedAt` 非空的墓碑记录；快照 cursor 与这些列表在同一可重复读事务中确定。快照与同步数据不暴露 JPA Entity，Asset 不进入普通 mutation。
- 同步设备必须属于当前用户且未撤销；所有资源、change log 和幂等记录均执行 userId 隔离。默认保留窗口为 30 天，`SyncRetentionService` 按 `auralis.sync.retention-cleanup-delay-millis` 定时清理，并通过 Micrometer 记录清理行数、失败数和 `resetRequired` 次数；高水位 cursor 不随清理回退。省略 cursor 或 cursor=0 时，若该用户无历史变更或从 1 起的日志仍完整，可正常 pull；若早期日志已部分或全部清理，则返回 `resetRequired=true`。所有过期 cursor 均要求客户端执行完整 snapshot。PostgreSQL、双设备断网重连和生产调度验收仍未执行。

## 阶段 4 Review、Stats、Realtime 已实现契约

### 2026-10-09 本地复习补传扩展（Service/PC 代码与相关自动验证通过；真实联调待验收）

用户要求完整本地使用并联网同步。下方生命周期请求/历史已按 [本轮计划](../plans/2026-10-09-review-stats-local-first.md)扩展，Service 最终相关32/32、独立OpenAPI9/9及SDK生成通过；PC最终R4 664/664、类型/学科静态/构建通过。PC网络证明使用API adapter，SQLite证明使用真实SQLite测试adapter；真实Tauri/HTTP/双设备未验收。运行中的后端须重建才支持protocolVersion=2，旧协议阻止补传但保留本地数据。

- 五类 POST 可选 `occurredAt`（RFC3339）及 `expectedStateAbsent`（boolean）。省略时间继续用服务端 Clock；显式时间作为操作/调度/历史时间，规范到微秒，最多允许服务器时间后 5 分钟，不早于该 KB 最新已接受命令、lastReviewedAt/lastPracticeAt。超未来 400 VALIDATION_FAILED，倒退 409 RESOURCE_VERSION_CONFLICT，均不写入。
- `expectedStateAbsent=true` 要求当前无状态，false 要求状态存在，均继续精确检查 baseVersion；省略保留在线规则。它区分无状态与已有 version=0，防止离线首学覆写旧进度。
- 服务端先锁定当前用户的活动资源并校验正文 hash，再查找同 ID、同载荷的冻结回执。仅首次应用检查当前 KB 版本、复习状态版本、时间和存在性。已接受的原请求可在同正文的 KB 修订后精确重放，未接受的旧修订请求返回 `409 RESOURCE_VERSION_CONFLICT`。同 ID 异载荷返回 `409 MUTATION_REJECTED`。两个离线字段均省略时 fingerprint 保持原结构。
- 命令 effectiveReview 与 lifecycle/history effectiveReviews 增加可空 `schedulingBaseline`：`{dueAt,mastered,stableSuccessCount,nextReviewStage,lastPracticeAt,stability}`，时间/阶段可空。它是初选前调度快照的公开投影；导入未确认 GOOD/HARD 后本地确认使用该快照，不能从暂定当前状态推断。
- lifecycle/history 顶层固定 `protocolVersion:2`。PC 在任何 lifecycle POST（包括 prepared 重试）前读取并确认该版本；旧后端无字段则保留 pending 并提示更新，不上传。已固化/结果未知的请求不因后续查询而重基；回执 occurredAt 与固化请求规范时间不一致时不得 ACK 或覆盖本机投影。
- 2026-11-03 源码候选：新生命周期命令在状态 flush 后从数据库 refresh，再冻结完整 `state` 回执，使 `createdAt/updatedAt` 使用数据库实际保存的时间精度，与后续独立事务的 history 一致。旧冻结回执和请求指纹保持原样，不迁移历史命令；PC 对既有纳秒锚点及未发送误冲突的处理见 [PC 修复交接](../plans/2026-11-03-pc-review-unschedule-handoff.md)，尚待 PC 实施。
- 旧五档事件读取与 firstLearning 派生曾用于迁移统计，相关 HTTP 路由于 2026-10-11 移除；生命周期审计仍由本节的 lifecycle/history 提供。

### 学科复习生命周期（2026-10-08，代码、相关自动验证及只读审查通过；真实联调待验收）

新PC流程使用独立生命周期命令，沿用 `/api/reviews` 与原owner鉴权。未提供操作时间时日期由服务端Clock决定；离线时间补传按上方 2026-10-09 扩展。下方先前events/states/stats交付记录保留原证明范围，原轮次进度见 [实施记录](../plans/2026-10-08-review-learning-mastery-implementation.md)。

| Method | Path | 请求扩展 |
| --- | --- | --- |
| POST | `/api/reviews/lifecycle/learning-completions` | 可选 `reviewId` |
| POST | `/api/reviews/lifecycle/attempts` | `reviewId`、`rating`、可选 `durationSeconds` |
| POST | `/api/reviews/lifecycle/attempts/{reviewId}/confirmations` | 无 |
| POST | `/api/reviews/lifecycle/attempts/{reviewId}/corrections` | 无 |
| POST | `/api/reviews/lifecycle/learning-reopens` | 可选 `reviewId` |
| GET | `/api/reviews/lifecycle/history?knowledgeBlockId=<UUID>` | 无请求体 |

- 五个POST共同必填 `clientCommandId,knowledgeBlockId,knowledgeBlockVersion,contentHash,baseVersion`；UUID为字符串，rating仅 `AGAIN/HARD/GOOD`。contentHash为实际回忆正文原字符串UTF-8的SHA-256小写64位hex，不trim、不做Unicode或换行归一化。服务端在owner知识块锁后验证版本及正文，未同步正文不能凭旧服务端版本获得正式评分资格。
- 成功回执为 `commandId,clientCommandId,action,occurredAt,knowledgeBlockVersion,state,effectiveReview`。action为 `LEARNING_COMPLETED/REVIEW_SELECTED/REVIEW_CONFIRMED/REVIEW_CORRECTED/LEARNING_REOPENED`，state为完整非空当前命令后状态。effectiveReview可空，有值时为 `reviewId,selectedRating,effectiveRating,selectedAt,resolvedAt,resolution,schedulingBaseline`；初选GOOD/HARD未核对时effectiveRating/resolvedAt/resolution可空，最终resolution为 `AGAIN_SELECTED/CONFIRMED/CORRECTED_AGAIN`。schedulingBaseline字段按上方离线协议公开。
- ReviewStateView扩展 `knowledgeBlockVersion,needsLearning,mastered,stableSuccessCount,nextReviewStage,lastPracticeAt,lastReviewId,pendingReviewId,contentHash`。stableSuccessCount为0–3；nextReviewStage为 `EARLY_RECALL/CROSS_DAY/FINAL_VERIFICATION` 或null，其余业务ID/时刻可null，历史迁移state的contentHash可空。state.version保持乐观版本，缺状态首次创建使用baseVersion=0；不能只靠version=0判首次。
- 同clientCommandId与同载荷精确返回冻结回执，异载荷 `409 MUTATION_REJECTED`；状态或内容资格冲突 `409 RESOURCE_VERSION_CONFLICT`，附服务端当前状态。旧成功重放也必须通过当前活动资源与正文资格，禁止重新绑定已删除或已改正文的旧结果。
- 初选立即保存日期；GOOD/HARD由confirmations确认，corrections关联同reviewId从初选前基准纠正为AGAIN。最终有效结果计一次，未核对GOOD/HARD不计完成。确认沿初选时间锚点，纠正按纠正时间；learning-completions独立记录学习。仅标题等元信息变化时，使用当前 KB 版本和精确正文 hash 的请求可继续处理仍为当前因果目标的初选或重学链。正文变化或移科使旧因果目标失效。
- 首次学习3天，HARD初始1天，AGAIN及重新学习10分钟；10分钟再回忆GOOD后3天、稳定次数仍0。合法到期跨天GOOD核对后按7/14/30天推进，最终至少30天验证且核对成功持久化mastered。mastered/needsLearning均排除自动due；手动失败、明确重学或正文实质变化可以重新开启。
- lifecycle/history 返回 `{protocolVersion:2,knowledgeBlockId,knowledgeBlockVersion,state,commands,effectiveReviews}`，state 无记录可空，非空时投影当前 KB 版本。commands 按 occurredAt/commandId 升序，每项为 `commandId,clientCommandId,action,occurredAt,reviewId,rating,durationSeconds,baseVersion,knowledgeBlockVersion`，reviewId/rating/durationSeconds 可空。确认审计的 rating 为初选评分，纠正审计为 `AGAIN`。effectiveReviews 按 selectedAt/reviewId 升序，每项为 `reviewId,selectedRating,effectiveRating,selectedAt,resolvedAt,resolution,schedulingBaseline`。新初选、正文变化或移科使未确认初选失效时标记为 `SUPERSEDED`，无有效结果且不计完成。正式复习量使用有效结果。
- 同一次 `lifecycle/history` 响应的知识块版本、状态、命令和有效结果来自同一数据库快照。并发提交初选、核对或纠正时，该响应中的各字段对应同一个时间点。
- 学科overview新增 `pendingLearningCount,reviewingCount,masteredCount`，三类互斥且和为activeKnowledgeBlockCount。dueReviewCount为reviewing已到期子集；newLearningCount仅统计无state，scheduledReviewCount统计reviewing未来到期子集，这两个保留字段不用于新PC三态分区。daily新增 `learningCompletionCount,distinctStudiedKnowledgeBlockCount`；原复习量/不同KB/反馈分布组合旧非SKIP事件与新最终有效结果，确认与纠正归初选本地日期，学习完成归完成日期。专注仍只在个人页。

### 学科复习状态与统计（2026-10-08，代码、相关自动验证与只读审查通过；真实联调待验收）

- `GET /api/reviews/states?subjectId=<UUID>&cursor=<opaque>&limit=<1..200>` 使用现行 `{items,nextCursor,hasMore}`，默认 limit 为 50。items 为完整 `ReviewStateView`，包含当前用户、活动学科中活动知识块的到期及未来状态；无状态知识块不注入虚构行。按 knowledgeBlockId 升序 keyset 分页，过滤发生在 limit 前，游标绑定用户与学科范围；跨范围或非法游标返回 `400 VALIDATION_FAILED`，不存在或跨用户学科按未找到处理。
- `GET /api/stats/subjects/{subjectId}?days=7|30&timeZone=<IANA>` 返回 `SubjectStatsView`。days 仅接受 7 或 30，timeZone 为服务端支持的 IANA 区域 ID（包括 UTC）；非法参数返回 `400 VALIDATION_FAILED`。所有聚合先校验当前用户的活动学科，并以同一可重复读事务读取。
- 顶层字段为 `subjectId,generatedAt,timeZone,from,to,overview,daily,ratingCounts`；from/to 是包含首尾的本地日期，to 为请求时该时区的今天。每天使用 `[dayStart,nextDayStart)`，按日期升序返回 7 / 30 项并补零；现行用户级 weekly 仍为 UTC 七天，不改语义。
- overview 返回资料、知识块和任务原计数字段，以及 `newLearningCount,dueReviewCount,scheduledReviewCount,pendingLearningCount,reviewingCount,masteredCount`。无state计newLearningCount；reviewing的到期/未来子集分别计dueReviewCount/scheduledReviewCount。当前互斥分区为pendingLearning/reviewing/mastered，三者之和等于活动KB总数；资料总量由三种Source相加。
- daily 每项包含 `date,nonSkipReviewEventCount,distinctReviewedKnowledgeBlockCount,firstLearningKnowledgeBlockCount,subsequentReviewKnowledgeBlockCount,createdKnowledgeBlockCount,completedTaskCount,learningCompletionCount,distinctStudiedKnowledgeBlockCount`。正式复习组合legacy非SKIP事件与新effectiveRating非空结果，按初选日期计量；legacy首次/后续仍由before_state是否SQL NULL判定，新生命周期有效复习归subsequent，学习完成单独计量。不同KB按日去重，不用baseVersion=0判首次。
- ratingCounts包含 `againCount,hardCount,goodCount,easyCount`，组合范围内legacy非SKIP事件与新同次最终有效结果，不表示长期掌握率。学习内部循环和成功末尾巩固不增加正式结果；失败可能纠正同次结果为AGAIN，不增加第二次复习。统计不返回专注字段。
- 历史事件按 KB 当前活动学科归属，评分与新增 KB 趋势保留已软删除 KB 的历史，当前状态概况只包含活动 KB。任务按当前学科归属；completedTaskCount 仅计当前 DONE 且 completed_at 落在当日的任务，保留已完成软删除历史，不恢复重新打开任务的旧完成转换。资料、任务、知识与事件独立聚合，避免多表 fanout。
- 旧 `/due`、`/events`、`/history` 路由已于 2026-10-11 移除；既有 `review_events` 数据表仍供统计聚合读取。V29新增状态字段和独立命令/有效结果表，不新增core Sync资源；临时轮次仍仅内存。此小节基础交付的旧命令记录只证明当时版本，新机制门槛见本轮实施记录。
- 实现、生成契约和自动验证进度见 [实施计划](../plans/2026-10-08-subject-review-stats-implementation.md)；GUI、真实 HTTP/Tauri 与多端业务验收独立记录。

### 专注记录与统计（2026-10-01，服务端代码与聚焦自动验证）

- `POST /api/focus-sessions` 接收 `{clientSessionId,taskId?,startedAt,endedAt,durationSeconds,completed}`，时间为 RFC3339。owner 从当前 access token 获取；taskId 只校验用户归属，允许任务后来完成、取消或软删除时补传历史。时长为 0–86400 秒且不得超过时间区间，结束不得早于开始，时间不得超过服务器当前时刻 5 分钟。暂停、休息不由客户端计入，只有自然结束传 completed=true。成功 HTTP 200 返回 `{id,clientSessionId,taskId,startedAt,endedAt,durationSeconds,completed,createdAt}`；非法时间返回 VALIDATION_FAILED，跨用户任务按 RESOURCE_NOT_FOUND 处理。
- 同一用户与 clientSessionId 的相同规范载荷回放同一结果，异载荷拒绝；时间落库与回放比较统一到数据库微秒精度。最终记录持久化后才由客户端 ACK 本地队列。
- Stats overview 与 weekly 每日项新增 `focusSeconds/focusCompletedCount`。原 `studySeconds` 保持复习事件耗时含义；PC 个人空间学习时长/专注次数读取专注字段，不盲目叠加未确认的本地 pending 数量。

### 完整 Overview 结果持久化（2026-10-01，服务端代码与聚焦自动验证）

- 独立 `GET/PUT /api/overview-results/sources/{sourceId}` 与 `GET/PUT /api/overview-results/subjects/{subjectId}`，不扩展五类核心 Sync inbound mutation。Source GET 可带 ingestionRevision，仅返回当前活动 READY 资料对应的结果。
- PUT 为 `{baseVersion,clientWriteId,mode,ingestionRevision?,sourceManifest?,inputFingerprint?,outlineGeneratedAt?,summaryGeneratedAt?,result}`；result 使用 OverviewResponse v2 内容 schemaVersion/title/outlineMarkdown/summaryMarkdown。首次或当前结果失效后的 seed 必须 ALL 且两部分完整；后续分项写入原子保留另一项。
- FILE 校验当前 owner、活动 READY Source 与 ingestionRevision，inputFingerprint 可空。SUBJECT 的当前 manifest 只包含所属学科的活动 READY FILE Source，符合本轮 PC 文件 Overview 生成范围；TEXT/URL 不进入该集合。服务端校验来源归属、当前修订、已持久化文件结果 part versions 与输入 fingerprint，GET/PUT 使用同一来源集合。
- Subject manifest entry 为 `{sourceId,ingestionRevision,outlineVersion,summaryVersion}`，按小写 Source UUID 排序。OUTLINE 不依赖的 summaryVersion 为 null，SUMMARY 不依赖的 outlineVersion 为 null，ALL 两者必须为正数。fingerprint 为 UTF-8 SHA-256：`AURALIS-SUBJECT-OVERVIEW-MANIFEST-V1\n` 后逐项 `sourceId\tingestionRevision\toutlineVersion-or--\tsummaryVersion-or--\n`，LF 换行、十进制版本。
- 返回 `id/scopeType/sourceId/subjectId/ingestionRevision/version/outlineVersion/summaryVersion/schemaVersion/title/outlineMarkdown/summaryMarkdown/outlineSourceManifest/summarySourceManifest/outlineInputFingerprint/summaryInputFingerprint/outlineGeneratedAt/summaryGeneratedAt/updatedAt`。FILE 两个 fingerprint 可空；客户端由 scopeType 和相应 ID 确定 scopeId。
- whole-record baseVersion 冲突拒绝，不做 LWW；独立持久 write receipt 保证 clientWriteId 同载荷回放、异载荷拒绝。回放仍受资料活动状态和当前修订约束。提交后发布 `OVERVIEW_UPDATED`，客户端重新对账。生成进度、错误和失败记录不进入远端产物。

- 旧 `/api/reviews/due`、`/api/reviews/events`、`/api/reviews/history` 接口及 FSRS Lite 动态调度已于 2026-10-11 移除；现行复习接口见上方“复习旧接口移除”和“学科复习生命周期”。
- `GET /api/stats/overview?at=<RFC3339>` 返回活动知识块、活动任务、到期复习、已完成复习和活动来源的强类型统计；`GET /api/stats/weekly?from=<date>&to=<date>` 只接受连续 7 天，并按 UTC 日期返回复习、学习秒数、完成任务和新增知识块计数。
- `POST /api/realtime/ticket` 不接受请求体，服务端从 Bearer access JWT 的 `serverDeviceId` 解析并校验当前设备，返回一次性短期 `{ticket,expiresAt,websocketUrl}`；`/ws/events` 仅接受 WebSocket upgrade，不提供 HTTP `GET` 订阅回退。握手通过 query `ticket` 或 `X-Realtime-Ticket` 认证，不能把 Bearer access token 放入 WebSocket URL；领域写入提交后才发布 `SYNC_CHANGED`/`REVIEW_UPDATED` 事件，同用户的进程内订阅者接收通知。ticket 只持久化 hash，不能跨用户、重用或过期使用。
- 阶段 4 自动测试证明 H2/JPA/MockMvc、参数调度、幂等、用户隔离和进程内事件桥；浏览器 WebSocket、跨实例 broker、真实设备和前端消费仍未执行。

## 目标认证规则

除公开注册、登录和刷新路径外，业务请求使用 Authorization: Bearer access-token。

- access JWT 有效期 15 分钟，只包含最小 subject、session/device、签发和过期信息。
- refresh session 有效期 30 天；每次刷新执行 rotation。
- refresh token 只保存不可逆 hash，不能作为普通 access token 使用。
- refresh token 重放会撤销对应 rotation 链。
- 登录失败对未知用户和错误密码返回相同外部错误。
- 所有业务 Repository 必须在查询条件中包含当前 userId。

## 旧 Server 代码事实（仅供替换前盘点）

旧代码仍使用 /api/auth、/api/blocks、/api/tasks、/api/relations、/api/sync、/api/fs、/api/assets 和 /api/ai；普通 REST 使用 Result<T>，分页和错误码没有新目标契约的稳定定义，WebSocket 使用 /ws/sync。

这些旧路径、Result 包装、状态码、请求体、响应体和行为不被新后端承诺兼容。旧前端迁移必须等待新 OpenAPI 稳定后单独进行。

## 阶段 0/1/2A/2B/3/4 契约边界

已完成：目标路由表、通用响应规则、Problem Details 字段、阶段 1 Auth、阶段 2A 三类核心资源、阶段 2B Source/Asset/Relation 请求/响应、阶段 3 Sync、阶段 4 Review/Stats/Realtime、R1-05 核心列表 cursor/会话并发版本规则和旧契约不兼容结论。

未完成：真实 Provider/外部模型联调、MinIO 异常路径、双设备/过期 cursor 生产验收、浏览器 WebSocket、前后端联调和人工业务验收。R1/R2 已由默认 `clean test` 实际执行 PostgreSQL clean/upgrade、pgvector 与 MinIO Testcontainers；这不代表完整 Compose 或全模块生产验收。

## 阶段 5 AI/RAG 后端基线契约（2026-08-16）

### Overview 硬期限与可选 SSE（2026-10-11；代码、OpenAPI 与本地自动验证通过，未部署）

- `POST /api/ai/source-overviews` 与 `POST /api/ai/subject-overviews` 保留现行 JSON 请求、Bearer 鉴权、可选 `X-Overview-Request-Id` 和默认 `application/json` 响应。PC 通过 `Accept: text/event-stream` 选择 SSE；不增加取消路由或持久生成任务。
- SSE 每 750ms 写入注释心跳。终端 `event: result` 的 JSON data 为现行 `OverviewResponse`；终端 `event: error` 的 JSON data 为 `{code,detail,status,retryAfterSeconds?,resetAt?}`。错误详情沿用安全文案，额度错误保留等待/重置字段。响应开始前的认证、输入验证及准入拒绝使用现行 HTTP ProblemDetails。HTTP 200 或心跳本身不表示生成成功，缺少终端事件的 EOF 不能当作成功。
- 总期限默认 240000ms（现行可配置边界 1000–300000ms），从入口准入开始，包括预检、排队和各 Provider 阶段；PC 外层绝对期限为 300000ms。到期主动关闭本调用独占 socket，终止本地连接、TLS、写入和读取等待；已派发且 usage 未知的调用仍按 B 规则保守结算。共享 Source 生成由原 owner 的入口绝对期限和消费者兴趣控制，单个消费者退出不停止其他消费者或重置期限；最后兴趣退出或 owner 总期限到达才中止共享调用。
- 本地总准入 24，SSE 连接上限 8，生成 executor core/max/queue 为 4/8/16，writer 8 线程/8 队列；有界资源拒绝使用 `503 SERVICE_UNAVAILABLE`，SSE 已开始后的终端错误也保留业务 status 503 与 `retryAfterSeconds=1`。SSE/准入名额在实际 worker 退出且该请求的排队/执行写入全部清理后释放。单线程期限与心跳 scheduler 分离，到期终端错误不依赖 MVC 排队任务执行，取消计时任务即时移出队列。JSON 默认路径有硬期限，但在最终响应写入前无法保证及时检测客户端断连；SSE 用心跳写失败传递断连。socket 关闭不证明远端 Provider 撤回已接收的计算。代理缓冲、真实 Tauri/GUI 与真实 Provider 另验。
- 本轮完成状态、实际回归和源码证据统一见 [实施计划](../plans/2026-10-11-overview-hard-timeout-cancellation.md)。以下 Overview 的结构、mode、alias、预算与结果持久化规则继续适用。
- 入口计时包含预检耗时，表示预检/数据库等待后剩余预算会减少或拒绝出站，并非能强制中止 JDBC/数据库锁等待。同步 preflight 若卡在数据库中，HTTP 响应可晚于任务期限，SSE 此时尚未建立；本轮只取消本地 Provider 传输与客户端请求，不改数据库事务取消。PC 自身 300 秒期限仍可退出等待。
- socket 建立前的 Overview DNS 使用 4 线程/8 队列的有界等待，观察剩余调用窗口和取消。容量不足沿用服务繁忙，超时沿用 `MODEL_TIMEOUT`；取消后晚解析结果不得 HTTP 出站。原公共地址过滤/DNS pinning 保留；原生 DNS 线程可能占用固定 slot 至 OS 返回，Future.cancel 不证明 OS lookup 被中止。

### 既有 AI 请求与结构规则

- `GET /api/ai/settings` 返回当前用户各 Provider 的配置摘要；`PUT /api/ai/settings` 接受 `provider`、`baseUrl`、`chatModel` 和可选 `apiKey`，不接受用户 Embedding 模型配置。返回值只暴露 `hasApiKey`，不返回明文或密文。Provider 配置按用户隔离，首次创建必须提供 key，更新时可保留原 key。客户端只能在本请求 body 中提交 key，禁止持久化明文或在普通请求中附加 BYOK header。新 Chat 和 Overview 生成先使用当前用户有效的 `OPENAI_COMPATIBLE` 槽位，再使用服务端平台生成配置。检索及入库使用服务端独立的 Embedding 配置。平台 Key 仅用于服务端运行时调用。
- `GET /api/ai/settings/{provider}/models` 返回 `{provider,models}`，可选地读取已保存 BYOK Provider 的 `GET /models`，按 `data[].id` 最多提取 200 个模型；不支持该端点的服务仍可手动填写 `chatModel`。`POST /api/ai/settings/{provider}/test-connection` 使用已保存的聊天模型发起最小 `POST /chat/completions` 请求，返回 `{provider,reachable,chatModel}`，不依赖 `/models`。两者均不读取 env 默认凭据，也不接收临时明文密钥。未保存配置返回 `503 MODEL_UNAVAILABLE`；无效/不安全地址返回 `400 VALIDATION_FAILED`；上游认证拒绝或响应格式无效返回 `502 MODEL_PROVIDER_ERROR`；超时返回 `504 MODEL_TIMEOUT`，429 返回 `RATE_LIMITED`，上游 5xx 返回 `503 MODEL_UNAVAILABLE`。`OPENAI_COMPATIBLE` 是通用协议类型，服务商名称不单独持久化。
- `POST /api/ai/conversations` 创建会话；请求可选 `clientRequestId`，同一用户重放同一非空值必须返回同一会话，供离线会话恢复使用。`GET /api/ai/conversations` 列出当前用户未删除会话；`GET /api/ai/conversations/{conversationId}` 返回消息和会话 `version`；`DELETE /api/ai/conversations/{conversationId}?baseVersion=<n>` 必须携带当前 `baseVersion` 并执行 owner-scoped 软删除，版本冲突返回 `409 RESOURCE_VERSION_CONFLICT`。
- 新建 Chat 会话返回 `chatScopeState=UNBOUND`、`chatScope=null`；首次成功准入 `turn` 时在持久化 USER/run 的同一事务中绑定规范化 reading scope，之后 detail/list 返回 `BOUND` 及 scope。后续省略 `readingContext` 继承绑定；显式不同的策略或 ID 返回 `409 CHAT_SCOPE_CONFLICT`，不保存 USER/run。范围固定 retrieval mode 与 source/subject IDs，不固定 `selectionText` 或 ingestion revision；每次 attempt 仍按当下 owner、subject、READY 和 revision 校验。数据库既有会话标记为 `LEGACY`，可查看但不能创建新 turn/retry；必须新建会话，不从历史 run 自动推断。Owner-wide 会话为 `BOUND` 且 `chatScope=null`；AUTO 保持原语义。Activity submission 只能继承绑定，且来源 run scope 必须一致。
- Chat API、DTO、SSE、content projection、attempt/retry/status/cancel、activity submission、one-shot text generation 与旧数据处理以 [Chat Runtime API protocol 1](chat-runtime-api.md) 为准。现行展示组件由六个 provider function tools 生成；compare item 采用 `{title,entries:[{label,text},...]}` 且至少两个 entry，每个完整维度经 `block.item` 发布。旧正文 marker/NDJSON 协议已删除，历史 parts 保留但不自动转换。此为既有 Chat public parts 语义调整，不改变 HTTP 路由、外层 SSE envelope 或 OpenAPI/SDK schema。后端 focused suite 126/126，review B0/I0；受限全量及 package 边界见[当前状态](../current/Status.md)。

- `POST /api/ai/suggestions` 接受 `type`（`SUMMARY`、`QUESTIONS`、`NEXT_STEPS`、`REVIEW_PROMPT`）、`knowledgeBlockId` 和 `limit`（1–20），仅允许访问当前用户 KnowledgeBlock；当前输出为可替换的确定性后端基线，引用列表可能为空。
- `POST /api/ai/source-overviews` 接受 `{sourceId,mode,instruction?}`；`POST /api/ai/subject-overviews` 接受 `{subjectId,mode,instruction?,sources}`。客户端可通过 `X-Overview-Request-Id` 传递本次尝试的关联 ID；服务端日志为每次生成记录 `generationId`，并按 user/source/revision 和 MAP、REDUCE、JSON_PARSE、SCHEMA_VALIDATE、CACHE_RETURN 阶段关联。两者都从 Bearer access token 推导 user，拒绝 `userId`、Provider 凭据及非当前 owner 的 Source/Subject。`mode` 只能为 `ALL`、`OUTLINE`、`SUMMARY`；响应固定为 `{schemaVersion:1,title,outline,summary}`，其中 `OUTLINE` 的 `summary` 为 `null`，`SUMMARY` 的 `outline` 为 `null`，`ALL` 两项均非 null；可空响应字段仍是契约的一部分而非缺省字段。
- Overview 生成请求 ID 仅对服务端规范化后的有效 UUID 提供持久映射与重放：同一 owner 重放相同有效 ID 与相同输入时复用原生成；同一 ID 绑定不同输入时拒绝冲突。缺失、空白或非法 UUID 会生成新的服务端 UUID，因此这些输入值本身不构成客户端幂等键。成功 response payload 满 14 天后清除；request mapping、generation 与 budget metadata 保留，因此过期 ID 不可复用。失败元数据保留原 generation/budget lineage，新的有效请求 ID 可在协调器接管后继续该失败生成，不能重置累计预算。上述 V32 coordinator 已接入 Overview Service，最终 clean 与 V31→V32 PostgreSQL 自动集成门禁通过；2026-10-13 主代理只读运行态观察确认 backend healthy 且 Flyway V32 `success=true`，本执行器未部署或迁移，也未验证运行 class/source provenance。指定Source ALL和单输入Subject ALL真实评估已完成；唯一首审I1已修复并由主代理据208项门禁关闭，同reviewer复审工具受限，详见实施计划。`CACHE_RETURN` 仍是生成阶段名，不代表正式结果缓存；PC 收到完整结果后仍通过独立 Overview results PUT 保存。生成端点不会写正式 Overview results。
- `instruction` 最长 2,000 字符，Subject `sources` 必须为 1–100 项且不能重复 Source；响应 title 最长 300 字符、最多 60 个 chapter/500 个 section/100 个 key point，所有 prose 字段最长 4,000 字符。Source overview 只读取 owner-scoped `READY` Source 的 active chunks；Subject overview 按请求 mode 要求每个输入拥有相应非空 outline/summary，逐项验证 Source 属于请求 Subject 和当前 user，并将服务端 Source UUID 映射为短别名后才交给模型。
- 2026-10-12：Subject 超出完整 SYSTEM + JSON-转义 USER prompt 上限时，按所选语义片段精确分包并有界 MAP / REDUCE；单字段按 code point 分片，不截断资料。5200 字符是中间内容软目标，不再以自配对推测拒绝真实结果；每个实际消费者用完整序列化 prompt 做硬检查。实际 prompt 上限 12000 字符，INTERMEDIATE / FINAL `max_tokens` 硬上限分别 4608 / 6144；共享现有 Gateway、任务预算 / 调用数、deadline 和取消。输入 reservation 默认按 UTF-8 bytes 加 framing 估算，不是 tokenizer 结果；显式配置的 Overview 分类 profile 只对受支持的精确 provider/endpoint/requested model 生效，未知身份和不支持的输入形态按 bytes，profile 估算会改变预算拒绝与 usage 缺失时的保守 charged accounting，但不改变公开 DTO、路由或数据库结构。OverviewModelBudget 仅对精确 DEEPSEEK + 官方 api.deepseek.com + deepseek-v4-flash 使用官方输入 1,000,000 / 输出 384,000 context profile（官方资料称由 V4.1 Flash serving）；同名自定义兼容 endpoint 保持 unknown。来源：[DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/)。公开路由/请求 DTO/模式不变。服务实现与业务验收状态见[计划](../plans/2026-10-12-overview-dynamic-budget-recovery.md)。
- 持久跨实例等待者与owner保留同一用量错误类型和安全元数据：请求预算 `413 AI_REQUEST_BUDGET_EXCEEDED`、任务预算 `422 AI_TASK_BUDGET_EXCEEDED`、并发/个人小时/日额度 `429 AI_CONCURRENCY_LIMIT` / `AI_HOURLY_QUOTA_EXCEEDED` / `AI_DAILY_QUOTA_EXCEEDED`、系统日额度 `503 AI_GLOBAL_QUOTA_EXCEEDED`；JSON/SSE继续使用现有 `retryAfterSeconds` / `resetAt`，JSON保留适用的Retry-After header。私有failure details不新增公开DTO字段，失败不自动无限重试。
- 模型只接收固定 SYSTEM schema/安全规则与独立的 USER 数据字段（instruction、title、chunks/map JSON、显式 alias）；USER 资料内命令不能改变 SYSTEM 规则。回复仅接受单个 JSON object 或单个 `json` fenced block；服务端拒绝包围 prose、malformed JSON、未知/重复 Source alias、过量节点及任何 locator（当前 chunks 没有可信页码/block alias，输出 `locator` 必须为 `null`），并只在最终响应映射为实际 Source UUID。多 batch Source MAP 与非最终 multi-group REDUCE 是 intermediate，使用 `max_tokens=4608`；single-batch Source MAP、Subject direct 与最终单 group REDUCE 是 final，使用 `max_tokens=6144`。中间 JSON 的 5200 字符为软目标；self-pair 只作日志诊断，不作拒绝。每个真实消费者仍受完整 prompt 12000 字符硬限，Reduce 每轮结果数量必须严格下降；有界恢复受原任务预算与 deadline 约束。UTF-8 byte-based token estimate 是保守估算，不是 tokenizer 输出。所有 Overview 调用继续使用内部 structured JSON 标记要求 OpenAI-compatible `json_object` response format；DeepSeek completion 同时关闭 thinking，且不会把 `reasoning_content` 回退为最终 JSON。普通聊天/流式请求不启用该标记，公开请求/响应 DTO 不变。V32 私有 generation/checkpoint/request mapping 已接入 Overview Service；有效规范化 UUID 可持久 replay，失败 lineage 跨新 request ID 累计，recovery_count 按 generation 累计且 recovery actions 按安全集合去重。14 天清理只删除成功 response payload 与到期 checkpoint，request mapping/generation/budget metadata 保留，旧 ID 不可复用。最终 clean 与 V31→V32 PostgreSQL 自动集成门禁通过；2026-10-13 主代理只读观察到业务库 Flyway V32 `success=true`，但本执行器未部署/迁移或验证部署 class/source；指定Source ALL和单输入Subject ALL真实评估已完成；唯一首审I1已修复并由主代理据208项门禁关闭，同reviewer复审工具受限，详见实施计划。生成 endpoint 不写正式 Overview results；完整成功产物仍经客户端独立 Overview results GET/PUT 持久化与对账。客户端字段/结构等输入验证返回 400 `VALIDATION_FAILED`；模型上下文或实际 prompt 预算超限映射为 502 `OVERVIEW_PROMPT_BUDGET_EXCEEDED`；Provider 输出截断返回 502 `OVERVIEW_PROVIDER_OUTPUT_TRUNCATED`，恢复耗尽返回 502 `OVERVIEW_RECOVERY_EXHAUSTED`，中间输出既有超限返回 `OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE`，Reduce 无进展返回 `OVERVIEW_REDUCE_NO_PROGRESS`；其它 Provider 输出 parse/schema/alias/locator 错误返回 502 `MODEL_PROVIDER_ERROR`，Provider 不可用返回 `MODEL_UNAVAILABLE`。公开 routes/request DTO 保持不变。
- TEXT/URL Source 创建、更新和 reingest 与对应 ingestion job 在同一事务持久化，job 入队失败则 Source 与 change log 一起回滚；恢复处于 `PENDING/PARSING/INDEXING` 的 TEXT/URL Source 时，按当前 revision 原子补建或复用活跃 job，`READY/FAILED` 不自动重跑；FILE 继续等待 ParsedDocument complete。TEXT 正文或 URL 地址等解析输入变化轮换只读 `ingestionRevision`，不同修订分别建 job，同修订活跃 job 可复用。启用 `auralis.ai.ingestion-worker-enabled` 后，定时 worker 通过数据库锁定的 claim-next 自动执行；提交前核对 Source revision、job/generation、attempt 和在取得行锁后仍有效的 lease，旧 worker 不得覆盖新修订的 Source/chunks。租约过期任务可恢复，失败按 `auralis.ai.ingestion-max-attempts` 重试后进入 `FAILED` 终态。worker 执行 `PARSING → INDEXING → READY/FAILED`，文本/文本型文件/URL 解析后切块，生成 1024 维 embedding 并按 userId/sourceId 保存。PostgreSQL 使用 pgvector SQL/HNSW 执行用户隔离的 cosine 检索；H2 保留 JSON embedding 的确定性 cosine fallback。
- Chat protocol 1 uses Spring MVC `StreamingResponseBody` and an explicit `ChatAgentOrchestrator` loop over the governed model adapter; complete tool calls are executed only after a valid provider terminal. Admission and replay lookup happen before the SSE response is returned, so an occupied conversation is rejected as HTTP 409 `CHAT_RUN_ACTIVE`. A new run stores provider, model, and a SHA-256 hash of the normalized endpoint in `request_context_json`; credentials and the plaintext endpoint are excluded. Matching request replays are checked by normalized client-body hash before resolving current settings. Retry checks the saved provider profile before reserving a new attempt and returns HTTP 409 `CHAT_PROFILE_CHANGED` if provider/model/endpoint changed; same-profile credential rotation is allowed, and a changed default provider does not replace an existing run's provider. The worker validates the saved profile again before any Provider/tool call. Overview's optional SSE remains `SseEmitter`. See [current status](../current/Status.md) for automated validation and client acceptance. File parsing scope remains as documented elsewhere.
- Provider `baseUrl` 只允许 HTTPS、无 userinfo/query/fragment、无危险端口（默认或显式 443）。`DEEPSEEK` 与 `SILICONFLOW` 的 host 必须精确匹配 `AURALIS_AI_ALLOWED_PROVIDER_HOSTS`。`OPENAI_COMPATIBLE` 接受公网 HTTPS host，平台生成与 Embedding 也使用此策略。保存个人配置和实际请求前执行地址安全校验，实际连接固定到已检查的公网 DNS 地址，Provider 重定向关闭；本地、内网及 NAT64、6to4、Teredo IPv6 转换前缀不在通用 Provider 范围内。
- Provider 请求使用独立的 `AURALIS_AI_PROVIDER_CONNECT_TIMEOUT_MILLIS` 连接超时与 `AURALIS_AI_REQUEST_TIMEOUT_MILLIS` 普通聊天/流式/embedding response-read 窗口；Overview map/reduce 非流式 completion 使用可配置的 `AURALIS_AI_OVERVIEW_RESPONSE_TIMEOUT_MILLIS`（默认 120000ms，允许范围 60000–120000ms）。连接超时只用于固定地址 TLS socket，普通请求 response/read 默认 10000ms。`SocketTimeoutException` 返回稳定 `MODEL_TIMEOUT`（HTTP 504），其它 IOException 仍为 `MODEL_UNAVAILABLE`（HTTP 503），429/5xx/400 的既有映射不变；来源 URL 保留 HTTP/HTTPS，但每个手动重定向都会重新校验并重新固定 DNS 地址。BYOK key 只以 AES-GCM 密文存储，设置响应、异常和 `toString()` 不输出 key。
- 阶段 5 的自动证据包括 H2/JPA/MockMvc、Stub Provider、Flyway V1–V14、架构测试、出站安全专项，以及默认 `clean test` 的真实 PostgreSQL 17/pgvector 与 MinIO Testcontainers。R1-03 已验证 HNSW、vector(1024) 写入、用户隔离、generation 原子切换、失败回滚和 Source 删除过滤；R1-04/R1-05 增加了会话恢复键、同一请求并发保留、精确 assistant 关联及流式回放测试。真实 Provider 网络/证书/限流、浏览器前端联调和人工业务验收仍未完成。

### 2026-10-10 Overview deadline 与 ingestion 分批

- Source/Subject Overview 从请求入口共享单调时钟任务 deadline，`AURALIS_AI_OVERVIEW_TASK_TIMEOUT_MILLIS` 默认 240000ms，允许 1000–300000ms；每次 Provider response timeout 取阶段配置和任务剩余时间的较小值。返回后、后续调用前及最终成功前均检查，超期返回既有 `504 MODEL_TIMEOUT`；同实例相同 Source 的等待者也有自身 deadline，等待者超时不取消 owner。PC 仍使用 300000ms 窗口。
- 此处记录 2026-10-10 的合作式 deadline 基线，其持续慢流/断连限制已由上方 2026-10-11 的独占 socket 关闭、可选 SSE 和有界解析等待补修。真实 PC/代理/Provider 与同步 JDBC、原生 DNS 边界仍按本轮实施计划验收。
- ingestion embedding 每批文本最多 `AURALIS_AI_INGESTION_EMBEDDING_BATCH_MAX_ITEMS`（默认 32）条，文本累计 UTF-8 字节最多 `AURALIS_AI_INGESTION_EMBEDDING_BATCH_MAX_UTF8_BYTES`（默认 32768）；单项超限拒绝而不截断。响应 index 必须是完整、唯一、范围内整数，adapter 按 index 归位并拒绝非数值向量。每批检查响应 count；全部向量收集后，由 `SourceChunkService.replace` 统一校验每个向量包含 1024 个有限值，通过后才原子切换 generation。
- 每批 Provider I/O 前后以独立短事务锁定 job，核对原 claim 身份、attempt、状态和锁后新鲜时钟下有效 lease，再按现有租期续租；过期或被接管即停止后续调用/提交，不用旧 attempt 写失败。Provider 网络等待不占有该事务。本轮没有新增公开 DTO、错误码、route 或数据库结构，失败仍沿用现有 ingestion 错误与 generation 保留语义。

### 2026-10-10 Usage Guard B 与本人额度（代码、相关自动验证与只读审查通过；未部署）

- 用户已明确选择完整持久配额。`GET /api/ai/usage` 通过 Bearer 当前账号读取本人小时/每日额度；不接受 userId 或 Provider 凭据参数，不公开系统额度或其他账号用量。响应为 `{hourly,daily}`，每窗口包含 `limitTokens`、`chargedTokens`、`reservedTokens`、`remainingTokens`、`resetAt`；数值为非负 token，remaining 基于 charged + reserved，resetAt 是 UTC ISO instant。窗口为服务端 UTC 整点/自然日，个人中心按当地时间显示。
- charged 表示已结算额度消耗：Provider usage 完整时用实际 token，缺失或已派发但状态未知时按保守估算；reserved 是当前窗口内在途预留。只读查询不调用 Provider，不是金额账单或用量购买接口。
- 2026-10-12 用户策略调整：`INGESTION_EMBEDDING` / `RETRIEVAL_EMBEDDING` 不计用户小时、每日和系统每日 token 额度；本人窗口的 charged / reserved / remaining 排除这两个 stage，包括历史记录。原调用审计不修改，接口字段和 UTC 窗口不变；生成调用仍按既有完整 / 未知 usage 规则计量。单人测试默认 limit 为 1000000 / 小时、2000000 / 日，允许现行环境变量覆盖，运行态以实际 backend 配置为准。实现与验收见 [策略计划](../plans/2026-10-12-embedding-quota-exemption-and-test-limits.md)。
- 单次预算超限返回 `413 AI_REQUEST_BUDGET_EXCEEDED`，任务累计预算/调用次数耗尽返回 `422 AI_TASK_BUDGET_EXCEEDED`；并发、用户小时、用户每日额度分别为 `429 AI_CONCURRENCY_LIMIT`、`429 AI_HOURLY_QUOTA_EXCEEDED`、`429 AI_DAILY_QUOTA_EXCEEDED`；系统每日额度耗尽为 `503 AI_GLOBAL_QUOTA_EXCEEDED`。等待类拒绝包含安全 `retryAfterSeconds/resetAt` 与适用 `Retry-After`；不暴露其他用户或全局额度数值。
- Chat 已进入 SSE 后继续发 `message.error`，持久化关联 assistant 失败与安全 usage；Overview 默认 JSON 或响应开始前用 Problem Details，SSE 已开始后用终端 `error` 保留业务 code/status 及额度等待字段。PC/Mobile/Tablet 显示明确预算/繁忙/等待反馈，不自动循环补发。额度延期的 ingestion job 保持非终态，按 next_attempt_at 领取并从已验证持久批次继续；ingestion 请求/任务硬预算拒绝成为 fenced 终态，413/422 的 retryAfterSeconds 为 0、resetAt 为 null，不发送等待型 Retry-After。Overview durable generation 的预算停止遵循下一条所述可恢复语义。账户缺失/停用的锁后重查沿现行 UNAUTHENTICATED，不增加额度错误码。
- Overview 的 `AI_TASK_BUDGET_EXCEEDED` 保持既有 422 响应，但 durable generation 将此预算停止记录为可恢复失败；相同有效输入重试继续原 generation 与 `budgetTaskId`，保留 verified checkpoint 和 charged usage。额度调整后可继续未完成工作，拒绝本身不派发 Provider 调用。此说明不增加响应字段或 `PAUSED` 状态；其余调用次数、token 上限和错误格式不变。
- 应用的有界 MVC 异步线程池拒绝入队时，返回 `503 SERVICE_UNAVAILABLE` 的安全 Problem Details，`Retry-After: 1`、`retryAfterSeconds=1`、`resetAt=null`；它属于应用资源繁忙，与上述六种额度拒绝及 Provider `MODEL_UNAVAILABLE` 分开。响应不公开任务堆栈、线程池内部状态或原异常消息。
- 运行时 OpenAPI 9/9 与 PC/Mobile 同源 schema 已更新，最终 schema SHA-256 为 `CDC86A9A4E0823AEA05A74F6ACE053EA414AE0BC5D007DAC9100C0D4EA41985B`，新 schema 下两端 type-check 退出 0。该契约的执行、最终审查与自动证据见 [B 实施计划](../plans/2026-10-10-ai-usage-guard-b.md)；未部署或完成真实 Provider/GUI 联调。

## PC 本地数据库初始化命令（2026-10-01）

内部 Tauri invoke `initialize_local_database_pool` 无参数，成功返回 void，失败拒绝并返回本地数据库错误。仅操作已由 SQL 插件加载的固定 `sqlite:auralis.db`，不接受任意路径或 SQL。PC 在 `Database.load` 后、暴露数据库及任何业务 SQL 前调用；失败阻止初始化成功。命令沿用原连接参数，将插件池替换为 max/min connections 均为 1、禁用正常 idle/lifetime 回收的池，再关闭旧池。既有 JS SQL 队列继续串行化，确保分次调用的 BEGIN/COMMIT 使用同一连接；独立 native snapshot 事务保持原实现。

## PC Tauri AI 辅助阅读契约（2026-08-23，2026-08-26 已实现代码门禁，真实联调与验收待完成）

本节登记 S1–S6、K1、C4 和 C5 已落地的接口行为、生成 SDK 与端侧上传边界；真实客户端业务联调和人工业务验收仍未完成。完整决策见 [PC Tauri AI 辅助阅读全流程设计](../design/2026-08-23-pc-tauri-ai-assisted-reading-design.md)。

- FILE Source 完成原 Asset 上传并创建后进入 `AWAITING_CLIENT`；客户端提交解析结果后经过 `VALIDATING → INDEXING → READY/FAILED`。SourceResponse 已新增服务端生成、客户端只读的 `ingestionRevision`。TEXT/URL Source 保持现有服务端解析状态机。
- S2 已落地 FILE/TEXT/URL 分流：FILE create 不发布 `SourceIngestionRequestedEvent`；Asset 替换或 FILE reingest 轮换 revision 并回到 `AWAITING_CLIENT`，仅标题等不影响解析的 FILE 更新保留当前状态；TEXT/URL create/update/reingest 继续进入 `PENDING` 并发布现有 server ingestion event。请求 DTO 不接受 `ingestionRevision`，客户端不能覆盖该字段。
- 任意端可继续上传和预览 FILE Source；只有 PC Tauri 提交 ParsedDocument。Mobile/Tablet 上传的 FILE 在 PC 处理前保持 `AWAITING_CLIENT`，本期不由移动端伪装为 AI READY。
- PC Tauri 在原 Asset upload-intent 前流式计算并提交 SHA-256。历史 Asset 的 `sha256` 为空时，服务端在首次接受 ParsedDocument 前流式读取原对象并原子回填；不能直接信任客户端声明。
- `POST /api/sources/{sourceId}/parsed-documents/upload-intents` 接受 `ingestionRevision`、`schemaVersion`、`parserId`、`parserVersion`、`normalizationVersion`、可选 `ocrModelVersion`、`sourceAssetSha256`、`payloadSha256` 和 `sizeBytes`，返回 `parsedDocumentId`、服务端确认的 `ingestionRevision`、私有预签名上传 URL、限定 headers 与过期时间。
- S3 已实现上述 upload-intent：仅允许当前用户拥有的 FILE Source 和匹配的只读 revision，schemaVersion 当前固定为 `1`，payload/size 在签名请求前校验；服务端创建 `UPLOADING` ParsedDocument，object key 固定为 `users/{userId}/sources/{sourceId}/revisions/{ingestionRevision}/parsed-documents/{parsedDocumentId}`，不接受客户端 `userId` 或 `objectKey`，Source 仍保持 `AWAITING_CLIENT`。MockMvc 定向测试 `ParsedDocumentControllerTests` 3/3 通过。
- S4 已加入服务端有界流式 payload validator：限制 gzip 压缩/解压字节、解压比例、UTF-8 JSON schema、parser/block 字段、连续 ordinal、规范化正文 characterCount/plainTextSha256 和 upload-intent payloadSha256；历史 Asset 的空 SHA 只通过服务端原对象流计算并条件回填，客户端声明不作为可信来源。`ParsedDocumentValidatorTests` 4/4、`AssetShaBackfillTests` 2/2 通过。
- S5 已实现 `POST /api/sources/{sourceId}/parsed-documents/{parsedDocumentId}/complete`：不信任客户端对象元数据，服务端锁定 owner-scoped Source，执行 HEAD/stat、Asset/payload 哈希、revision、压缩与 schema 上限校验；同一 ParsedDocument 或相同 revision + payload hash 重放幂等，同 revision 不同 payload 返回 `409 PARSED_DOCUMENT_CONFLICT`，旧 revision 返回 `409 INGESTION_REVISION_STALE`，成功只创建一个带 ParsedDocument/revision 的 PENDING indexing job 并将 FILE Source 切为 `INDEXING`。`ParsedDocumentCompleteTests` 3/3 通过，覆盖相同 payload、冲突、旧 revision 和并发首胜。
- S6 已让 indexing worker 对带 `parsedDocumentId` 的 FILE job 读取并重新验证已接受 payload 的 blocks，禁止回退原始文件 parser；job 的 revision/generation 与当前 Source/ParsedDocument 不一致时只失败旧 job，不污染当前 Source。FILE 兼容 reingest 复用当前 accepted ParsedDocument/revision 并重新排队 job；Asset 变更会将旧 revision 的 accepted 派生记录标记 `SUPERSEDED`，定时清理任务删除过期 `UPLOADING/REJECTED/SUPERSEDED` 对象并保留审计行。
- K1 已冻结两条 ParsedDocument route、`201/200/409` 响应、`PARSED_DOCUMENT_CONFLICT`/`INGESTION_REVISION_STALE` 描述、可选 `ocrModelVersion`、Source 只读 `ingestionRevision` 与 `AWAITING_CLIENT/VALIDATING` 状态；运行时 artifact、PC/Mobile 生成 schema 和 `useSourceApi` typed wrapper 已同步。`OpenApiArtifactTests` 4/4、`scripts/check-openapi.ps1` 和 PC type-check 通过。
- C4 已将 PC Tauri 的加密 cache receipt 接入 upload coordinator：Rust 只解密流式 PUT 到服务端签名 URL，URL/headers 只保留在内存；PUT 过期可重新申请 intent，网络错误进入 `PAUSED_NETWORK`，随后调用幂等 complete。SQLite 任务 `ingestion_revision` 使用服务端 UUID 文本，旧数字 v3 行迁移到可恢复 legacy 表；正文不穿过 Vue/HTTP coordinator。C5 的 FILE Source scheduler 只在 `AWAITING_CLIENT + ingestionRevision` 下创建本地 job，重启/跨设备通过 owner-scoped Asset download adapter 恢复，签名 URL 不落库。
- C5 将本地 job 的完整 `DocumentCacheReceipt` 元数据（cache id、大小、hash、chunk/envelope 信息）持久化为任务元数据，正文仍只在加密 Tauri cache；`PACKAGING/UPLOADING/PAUSED_NETWORK` 可恢复上传而不重复 OCR/package。Asset SHA mismatch、旧 revision 和非 FILE Source 在客户端边界拒绝或跳过。2026-08-26 起 `DocumentProcessingRuntime` 在 Tauri 登录后负责组装并绑定这些组件，sync/online 事件触发 Source 重载与未暂停的 pending job 恢复；带 receipt 的网络暂停仅在用户点击继续后回到 `UPLOADING` 边界。
- FILE Source 创建、Asset 替换和缺少兼容 ParsedDocument 的 reingest 不发布现有服务端解析事件；只有 complete 接受成功后创建 indexing job。`POST /api/sources/{id}/reingest` 在存在最新兼容 ParsedDocument 时复用该派生对象；原 Asset/schema 变化或显式重新解析时轮换 `ingestionRevision` 并回到 `AWAITING_CLIENT`。
- `readingContext` 只含 `subjectId`、`retrievalMode`（`AUTO`、`SELECTED_SOURCES` 或 `SUBJECT`）、`currentSourceId`、`sourceIds`。首次 turn 固定会话范围，后续省略时继承。可选的顶层 `selectionText` 最长 4000 字符，在模型上下文中与所属轮次的问题合为一条 USER 消息；后续历史重建恢复该引用，并随所属轮次参与容量裁剪。每次 attempt 捕获符合 owner、会话范围和 READY 条件的来源及其 revision。`search` 默认仅查询该快照，显式 `sourceIds` 可缩窄范围。空快照直接返回空 evidence。字段、范围规则与错误码详见 [Chat Runtime API protocol 1](chat-runtime-api.md)。
- 协议 1 创建 `GENERAL` conversation，`source_id` 为空。NULL/未知 protocol 的会话保留于列表并标记 `chatSupported=false`，详情返回 `CHAT_PROTOCOL_UNSUPPORTED`。协议 1 的 `LEGACY` 会话保留历史查看，新 turn/retry 返回 `409 CHAT_SCOPE_CONFLICT`。使用相同 request ID 重发升级前带非空 `readingContext` 的原始命令可能返回 `409 CHAT_REQUEST_CONFLICT`。现行 run 状态读取和符合会话绑定规则的按 run 重试使用原有持久化数据。
- Chat 历史保持 stable USER/run、每 attempt 独立 assistant reply message 与公开 snapshot；私有 reference、工具结果和答案资料不进入 public DTO。`reasoning.delta` 仅转发 provider 明确返回的 reasoning 字符串，和工具调用事件同属过程流，不进入正文/parts；字段、过程/正文事件边界、thinking 回传规则与 activeRun 恢复以 [Chat Runtime API protocol 1](chat-runtime-api.md) 为准。
- Chat run status 的既有 `accountingSummary` Map 仅增加 `modelCalls`、`embeddingCalls`（同一 run ledger，跨 retry 按 RESERVED/已派发 reservation 统计）和 `currentAttemptToolCalls`（当前 attempt trace 内 distinct tool call ID）；不增加数据库列或改变 DTO Map 形状。
- Chat `request_hash` 仅使用规范化客户端 body 字段，不包含独立的 `requestId`、解析后的 provider profile 或凭据。retry 通过 `CHAT_PROFILE_CHANGED`（409）告知客户端该 run 的 provider/model/endpoint 已变化；失败前不会新增 attempt 或 reservation。详见 [Chat Runtime API protocol 1](chat-runtime-api.md)。

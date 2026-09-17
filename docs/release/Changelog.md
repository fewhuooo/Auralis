# Auralis 变更记录

### PC Local Asset Store Task 8 收尾（2026-09-17）

- `b7a3bb7..c560d8b` 完成 PC Tauri 永久本地资料库：原始文件在 OS ACL 保护的受管目录中保持明文，所有文件默认同步；断网可导入、预览和本地 OCR/Parser，联网后以稳定 `clientImportId` 幂等同步对象存储。Asset/Source draft 与任务边界按 owner/device 隔离，Preview、OCR、Parser 共享 Local Asset；不提供 Local Asset 备份、导出、恢复或副本管理。
- 仅用户明确删除 Source 且最后一个 Source 引用消失后才删除本地文件；上传、解析、修复和删除任务带 fence。启动 reconcile 会校验数据库、文件和 staging，缺失/校验不符标记 `CORRUPT`，未知残留 quarantine。
- 自动证据：Task 7 定向 77/77、FilePreview+store 38/38、Rust 30/30，`cargo fmt --check`/`cargo check` 通过；schema v8→v9 旧断言已由 `c560d8b` 修正；最新 `test:r4-pc` 333/334，仅剩用户 dirty `task-view` 断言失败，`type-check` 仍有用户 dirty UI/Store 的 7 项错误。真实 Tauri GUI、断网/重启、真实对象存储和业务验收仍待执行。

### Overview 非 JSON 失败体验收口（2026-09-15）

- 真实第二次 Overview 全链路已成功，证明永久预算链路可运行；生成内容质量仍需用户判断。
- PC Overview 对现有 `MODEL_PROVIDER_ERROR` 显示“遇到意外情况，请重试”，不新增 Server/API 错误码；FAILED 终态继续禁止自动重试，只有手动“重新生成”会发起新请求。
- 文案仅调整 Overview 专用 failure policy，普通 AI 聊天与流式行为不变。

### Overview 最小 JSON 诊断（2026-09-15）

- 为定位真实 DeepSeek FINAL `JSON_PARSE` 失败，Provider 发送前从最终序列化 request body 记录 allowlisted `AI_JSON_MODE`（`structuredJson`、`responseFormat=json_object`、`maxTokens`、stage）；Overview FINAL 在既有 validator 前用同一 Jackson `ObjectMapper.readTree` 记录 `FINAL_JSON_CHECK` 的 valid、字符数、行列号和异常类型。
- 诊断不记录 request body、prompt、响应正文、原始异常 message、URL 或凭据；`FINAL_JSON_CHECK` 对原始 `message.content` 直接 `readTree`，不做 fence stripping，因此 fenced JSON 会记录 `valid=false`，但不改变后续 validator 行为。普通聊天/流式行为不变。聚焦测试通过；尚未部署，真实请求和业务验收待重跑。

### Overview 永久阶段预算（2026-09-15）

- Overview 多批 MAP/非最终 REDUCE 使用 `max_tokens=3072`，最终 completion 使用 `4096`；规范化 intermediate JSON 上限为 `5200` 字符，self-pair 仍为 `12000`。
- 保留覆盖率优先的紧凑 prompt 与现有错误边界，不自动压缩重试；普通聊天、流式和 embedding 不变。Overview 38/38、兼容集合 63/63 通过，backend 已重建且 healthy。
- 部署后真实 42-chunk 请求通过全部 6 个 MAP 和第一轮 2 个 REDUCE；最终 REDUCE 收到 DeepSeek 2xx、自然 `stop`、`2992 outputTokens`、`6556 responseChars` 后在 JSON 解析失败。中间预算已实通，但完整链路和业务验收未通过。

### DeepSeek Overview 无 max_tokens 诊断实验（2026-09-15）

- 现场请求已返回非空 `content`，但首个 MAP 在 `responseChars=2553` 后 JSON 解析失败；为验证 1024 token 截断假设，Overview completion 暂时不发送 `max_tokens`，并移除 intermediate 1024 output token 前置拒绝。普通聊天/流式不变。
- `AiProviderResponse` 现在携带 allowlisted `finishReason`；未知、超长或含换行值归一为 `other`。`JSON_PARSE_START` 记录实际字符数、output tokens 和停止原因，不输出模型正文。
- 新增安全的 `INTERMEDIATE_BUDGET_CHECK`，以同一次实际判定记录规范化 JSON 字符数、self-pair prompt 字符数、各自上限与 overflow 布尔值；不输出正文或 prompt，错误行为不变。相关兼容集合 58/58 通过，待第二轮真实生成采样。
- 第二轮 42-chunk 真实生成在 MAP2 得到 `2612 outputTokens`、`5105 normalizedChars`、`11450 selfPairPromptChars` 和自然 `finishReason=stop`；仅 4000 字符边界超限，12000 self-pair 边界未超限。MAP3–6/REDUCE 未执行，永久策略未在本轮实施。
- Task 4C 用真实 42-chunk 生成验证覆盖率保留的压缩 prompt：六个 MAP 均通过且为 1447–3680 字符，此前 5105 字符的 MAP2 降至 2027；REDUCE round 1 第一组 2446 字符通过，第二组仍以 4678 字符触发 4000 字符边界，但 self-pair 10899/12000 未超限。Prompt 有效但不能代替硬边界；永久参数未实施。
- 4000 字符 intermediate 上限、self-pair、schema、Source fence、Reduce no-progress、HTTP response-size 和 120 秒 timeout 仍保留。本轮 fresh test compilation 与相关 58/58 通过。真实 42-chunk 请求已观测 MAP 1–5 为 991–2071 output tokens、2500–4091 response chars，全部 `stop` 且 JSON/schema 成功；第 5 个 MAP 随后命中 intermediate convergence guard，MAP 6/REDUCE 未运行。当前行为仍是临时测量手段而非永久成本策略。

### Overview 手动重试与生成收敛修复（2026-09-14）

- PC 当前 revision 的 FILE Overview `FAILED` 与部分 `READY` 记录现在是自动触发终态；`SOURCE_READY`、启动/联网/同步恢复和 `JOB_CHANGED` 不再自动 POST，只有 `MANUAL_RETRY` 可发起新请求并继续使用 in-flight coalescing。失败或部分结果保留旧大纲/总结，失败区域只显示一个可见“重新生成”，生成中 disabled；状态不确定与确定性失败使用不同文案。
- Server 为 Overview Provider 调用明确区分 intermediate/final：多 batch Source MAP 与非最终 multi-group REDUCE 使用 1024 `maxTokens`，single-batch Source MAP、Subject direct 与最终单 group REDUCE 使用 4096；中间输出校验 token、规范化 JSON 4000 字符和 self-pair prompt fit，Reduce no-progress 严格要求结果数量下降。
- Overview completion 新增内部 structured JSON 契约：OpenAI-compatible 请求发送 `response_format={type:json_object}`，DeepSeek 额外发送 `thinking={type:disabled}`；普通聊天/流式请求保持原有 body。响应适配器不回退 `reasoning_content`，无有效 content 时新增只含清洗/限长模型标识及 envelope 数量元数据的安全诊断，不记录 prompt、正文、URL 或凭据。
- 新增稳定错误语义：`OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE` 与 `OVERVIEW_REDUCE_NO_PROGRESS` 返回 HTTP 502，parse/schema 等其它 Provider 输出错误统一为 `MODEL_PROVIDER_ERROR`/502；API route、DTO、OpenAPI schema 和数据库未变。原持续自动补发与 Reduce `VALIDATION_FAILED` 问题已完成代码修复及自动验证。
- 自动证据：PC Overview focused 54/54，最新 `test:r4-pc` 331/331、type-check、94 文件静态检查、workspace check 与 build 通过；Server 本轮 fresh `clean test-compile` 通过，Overview/Controller/Provider/Streaming 聚焦 56/56，OpenAPI gate green。Server 既有全量证据为 255 项中 252 pass、3 项 Docker/Testcontainers errors；真实 DeepSeek/Provider、Tauri、网络、GUI、设备和业务验收仍待完成，Server 持久 generation 幂等仍是开放风险。

### Build/OpenAPI Task 3：最终回归与门禁同步（2026-09-12）

- Server fresh 聚焦命令实际 57/57、0 failures、0 errors、0 skipped；测试 double 补齐 `ProviderHttpTransport.post(..., byte[])` 后 fresh test compilation 通过，生产 Provider transport 未改变。
- Server 全量 `mvnw -B -ntp test` 实际 239 项，0 failures、3 errors；错误仅为 MinIO/PgVector/Testcontainers 无法连接 Docker。`check-openapi.ps1` 退出 0，Server OpenAPI artifact 8/8，PC/Mobile generated schema 与 artifact 一致；`subjectOverview`/`sourceOverview` 均暴露可选 `X-Overview-Request-Id`。
- PC/Mobile type-check 退出 0，Mobile protocol test 23/23。Mobile 的一行 payload boundary cast 只为适配生成 `JsonNode` 的结构窄类型，运行时序列化不变；未来 contract-cleanup 风险仍开放。API/Database 语义未新增变化；真实 Provider、Docker、PostgreSQL/MinIO、Tauri/GUI、设备和业务验收仍待完成。

### Server Test Gates Task 4：全量回归与契约门禁记录（2026-09-11）

- `source` 现在通过 source-owned `ParsedDocumentIngestionPort`/`IngestionJobReference` 调用 `ai.ingestion`，消除 source 对 ai 内部服务/实体的依赖并保持 `ai → source` 单向边界；H2 fixture 清理顺序已固定为逆外键顺序。
- Server 当前增量编译产物下标准聚焦 Maven 40/40；架构隔离命令（含 `ArchitectureTests`）7 类合计 20/20，其中 `ArchitectureTests` 1/1；H2 隔离连续两次 24/24、OpenAPI artifact 8/8。标准全量 `test` 实际执行 239 项，0 failures、3 errors，错误仅来自 Docker 不可用的 MinIO/PgVector/Testcontainers；fresh `clean test-compile` 仍受 `AiProviderSecurityTests.java:182` blocker 阻断。
- `check-openapi.ps1` 的 artifact 比对通过，但 PC generated schema stale；未在本轮运行 SDK 生成。上述自动证据不替代真实 PostgreSQL/MinIO、Provider、Tauri/GUI 或业务验收；无语义 API 或数据库契约变化，仅同步 OpenAPI artifact。

### Overview Source 删除 fence 与回归门禁（2026-09-11）

- PC 文件总览生成现在要求活动 FILE Source 的精确 `ingestionRevision` 与本地文档任务 `READY`；Source 删除在 tombstone/投影移除后同步阻断、abort 匹配请求并清理文件总览缓存，晚到响应不写入或标记失败，且 fence 先于同步与后台文档清理。
- Server 在每个共享 Map/Reduce Provider 调用前后复核活动 `READY`/精确 revision；进行中的 Provider 调用可完成但其结果被拒绝，不再启动后续调用。Subject 总览及 API、数据库、同步契约未改变。
- 本轮门禁：PC R4 322/322、type-check 通过、静态检查扫描 93 个生产文件并通过；Server `AiOverviewServiceTests` 19/19 通过；Overview 失败日志使用 allowlist，`requestId` 规范为 UUID（非法或含敏感内容时替换为服务端新 UUID），不记录原始 exception/cause 文本或 throwable stack；Server 全量 239 项实际为 0 failures、3 Docker/Testcontainers errors，fresh testCompile 仍有独立 `AiProviderSecurityTests` blocker，OpenAPI/PC schema 仍需处理。真实 Tauri、Axios、Provider、PostgreSQL/MinIO、GUI 和业务验收不由自动回归替代。

### Provider Overview 超时与错误映射修复（2026-09-10）

- ProviderHttpClient 分离连接超时与 response/read 超时：连接默认 3000ms，普通非流式 completion、流式请求和 embedding 默认保持 10000ms；Overview map/reduce 非流式 completion 新增独立可配置的 120000ms 窗口。
- `SocketTimeoutException` 现在稳定映射为 `MODEL_TIMEOUT`/HTTP 504，并保留 cause；其它 IOException 继续为 `MODEL_UNAVAILABLE`/503，429/5xx/400 映射及普通聊天/流式行为保持不变。同步更新 Server 配置、Compose、环境样例与 API/部署文档。
- TDD RED 先复现 timeout overload/配置缺失、旧 `MODEL_UNAVAILABLE` 及配置越界未拒绝；最终 Provider、Overview、普通 streaming、embedding、错误映射及 OpenAPI 聚焦回归 60/60 通过。真实 Provider 网络、生产代理和业务端到端仍待人工验收。

### PC 学科总览与本地 AI 大纲/总结（2026-09-10）

- 将工作区原“大纲”入口升级为“总览”，保持现有 `AI 梳理` 按钮位置和三栏宽度。顶部学科总览默认折叠且按用户请求生成；下方直接展开全部文件大纲，每个文件可在中间预览区查看总结并分项重新生成。
- 文件解析 READY 后自动请求结构化大纲与总结；Server 生成保持无状态，PC 结果按 user/device/source revision 存入本地 schema v7，不进入 Server 数据库或 Sync。失败保留旧内容，损坏缓存和异常 Provider 响应在持久化边界拒绝。
- 当前自动证据包括 Server 聚焦 23/23、PC 完整 R4 306/306、overview/UI 聚焦 18/18、type-check、静态检查、工作区契约、生产构建和 diff-check。终审补齐了零可用输入的 stale 判断、空内容过滤和学科大纲独立重生成。OpenAPI artifact 8/8 且 PC 生成类型一致；仓库级契约门禁仍被既有 Mobile schema 过期/文件占用问题阻断。Server 全量仍有 28 个既有环境/共享测试错误，真实 Provider/Tauri/GUI 尚未验收。

### PC 时间轴空槽拖动 400 修复（2026-09-09）

- 修复排期任务拖到空槽时仍调用 `POST /api/tasks/schedule-swaps` 并发送空 `targetTaskId` 导致 400 的问题。空槽现按单 Task 写入本地 repository/outbox，只有两个占用槽之间才使用原子 swap API。
- TDD 回归修复前实际命中 `targetTaskId: ''`；修复后时间轴相关 35/35、完整 PC 272/272、type-check 与静态检查通过。真实 Tauri GUI 拖动与后台同步仍待人工验收。

### PC 知识块来源名称修复（2026-09-09）

- 修正 KnowledgeBlock UI 投影把 `sourceId` 直接显示为来源名的问题；现从同一本地 Source 投影取得 `title`，并在 Source 变化时刷新。缺失关联投影时显示“来源资料”，不再泄露 UUID。
- TDD 回归使用 `编译原理课件chap01(陈火旺)-v9.ppt` 复现并锁定中英文/括号文件名；聚焦 11/11、完整 PC 270/270、type-check 与静态检查通过。真实 Tauri GUI 仍需人工走查。

### PC 知识块学科名称映射修复（2026-09-09）

- 修正 KnowledgeBlock UI 投影把 `subjectId` 直接显示为学科名称的问题；现从同一本地 Subject 投影取得 `name`，缺失关联时使用“未分类学科”，并继续保留 `subjectId` 作为关联标识。
- 新增 TDD 回归覆盖 UUID 不得成为可见学科标签；映射聚焦 12/12、完整 PC 271/271、type-check、静态检查、生产构建与 diff-check 通过。真实 Tauri GUI 仍需人工验收。

### PC PDF 混合页面阶段修复（2026-09-09）

- `DocumentJobRunner` 在 OCR 已启动后保持 `OCR_RUNNING` 处理后续普通文字 block，直到进入 `PACKAGING`，消除文字→OCR→文字 PDF 的非法阶段回退；未改变 PDF 分类、API、schema 或 PPT 行为。
- 修复前回归实际触发 `DOCUMENT_JOB_ILLEGAL_TRANSITION` 并最终 `FAILED_LOCAL`；修复后 runner 12/12。真实 51 页 PDF/Tauri GUI 仍待验收。

### Server Sync retention 定时事务修复（2026-09-09）

- `SyncRetentionService.scheduledPurgeExpired()` 现在从 Spring 调度代理入口即建立事务，真实 JPA delete query 不再因同 Bean 自调用绕过 `purgeExpired()` 的事务代理而抛出 `TransactionRequiredException`。
- 新增 Spring 代理入口回归测试；测试先复现异常，修复后聚焦用例 1/1、`SyncServiceTests` 11/11 通过。未修改 API、数据库 schema 或 retention 语义；重建 backend 后的实际 scheduled run 仍待运行日志复核。

### PC ParsedDocument upload trace（2026-09-09）

- 新增有界 `[Document Upload Trace]` 开发日志，记录 PUT/complete 边界与稳定失败阶段，保持现有重试、缓存安全和状态机不变；真实 Tauri/MinIO/Server/GUI 仍待验收。

### PC ParsedDocument stale/current revision preflight correction（2026-09-09）

- scheduler 先执行一次权威 Source GET 取得当前 revision，再处理 stale jobs，并只在 current revision 选定后校验 cache ownership；stale corrupt row 不再阻塞 valid current row。
- current mismatch 仍阻止后续 hash、runner、上传网络和 cache deletion。scheduler 33/33、完整 PC R4 259/259、type-check、diff-check 通过；真实 Tauri/Server/MinIO/GUI 仍待验收。

### PC ParsedDocument recoverable server-phase mismatch（2026-09-09）

- `SERVER_VALIDATING`/`SERVER_INDEXING` 的本地 cache ownership mismatch 现在合法进入 `FAILED_LOCAL` 并支持 retry；READY/FAILED_SERVER 保留原 phase。scheduler 在一次权威 Source read 后对选中的 current revision 完成本地关系预检，异常时不执行后续网络、OCR 或 cache deletion。
- schema 17/17、scheduler 32/32、完整 PC R4 258/258、type-check、diff-check 通过；真实 Tauri/Server/MinIO/GUI 仍待验收。

### PC ParsedDocument phase-safe cache mismatch closure（2026-09-09）

- scheduler schema-v1 cache ownership mismatch 统一走 phase-safe cleanup failure preservation；READY、SERVER_VALIDATING、SERVER_INDEXING、FAILED_SERVER 不再非法迁移到 FAILED_LOCAL，recoverable phases 仍按既有规则失败。两侧 cache ID/receipt 保留，且不会删除 mismatch cache 或触发网络/OCR。
- Real repository table regression 31/31，完整 PC R4 256/256、type-check、diff-check 通过；真实 Tauri/Server/MinIO/GUI 仍待验收。

### PC ParsedDocument cache-safety follow-up（2026-09-09）

- READY 派生 cache 现在删除成功后才清除本地 receipt/ID；删除失败保留证据并允许后续 READY scheduling 重试，不重新执行 upload/parser/backend 请求。
- schema-v1 cache ID ownership mismatch 在 scheduler 和 coordinator 的网络边界前统一拒绝。Focused upload 16/16、scheduler 30/30、schema 16/16，完整 PC R4 255/255、type-check、diff-check 通过；真实 Tauri/Server/MinIO/GUI 仍待验收。

### PC ParsedDocument upload 状态迁移修复（2026-09-09）

- complete 返回 `ACCEPTED` 后，PC coordinator 现在按现行本地状态机依次持久化 `SERVER_INDEXING`、`READY`，不再直接跨越中间阶段；未修改迁移表或 scheduler 的 READY 后 cache cleanup 责任。
- TDD 回归先用真实 `DocumentProcessingJobRepository` 复现 `DOCUMENT_JOB_ILLEGAL_TRANSITION`，修复后 ParsedDocument upload 15/15、processing flow 1/1、job schema 16/16、source scheduler 27/27、完整 `npm.cmd run test:r4-pc` 251/251、`npm.cmd run type-check` 与 `git diff --check` 通过。真实 Tauri/Server/MinIO 与 GUI 仍待验收。

更新时间：2026-09-09

文档状态：现行历史记录

### PC ParsedDocument schema-v1 打包与兼容恢复（2026-09-08）

- Rust packager 现在生成单个 gzip JSON schema-v1 envelope，Java validator/complete 与共享 fixture 对齐；不提供 NDJSON fallback。
- 本地加密 cache/receipt 保存 `parsed-document-v1`、Source Asset SHA 和 parser metadata；兼容 receipt 直接续传，旧或不完整 receipt 在 upload intent 前只清理派生 cache 并重建一次。未新增 Server migration 或 OpenAPI shape。
- 自动验证：Rust packager 5/5、cache 5/5、upload 8/8，Java 定向 8/8，最终 scheduler 27/27、完整 PC R4 250/250、type-check 和 `git diff --check` 通过。Final reviewer 的所有 Critical/Important findings 已关闭；真实 Tauri/Server/MinIO 与 `1.pdf` GUI retry 仍待人工验收。

### PC ParsedDocument PUT 安全诊断增强（2026-09-08）

- Tauri 上传失败日志在 `reqwest::Error::without_url()` 后增加 request/builder/redirect/status/decode 等 flags，并最多保留三层 source cause；对 URL、预签名 query、Authorization、header value、路径和控制字符执行脱敏，最终诊断总长限制为 256 字节。
- 保持现有 `NETWORK_OFFLINE:*` 错误码、前端诊断和 SQLite 持久化契约不变；真实 Tauri/MinIO 上传根因仍待人工复现。

### PC ParsedDocument cache payload 长度修复（2026-09-08）

- 修复加密 cache receipt 把 envelope 总大小误记为 `payloadBytes/payloadSha256` 的问题；receipt、服务端 upload intent、Rust `Body::sized`/`Content-Length` 和发送后校验现在都对应解密 reader 实际 gzip payload。
- 历史 receipt 若 `payloadBytes === encryptedBytes`，恢复上传前通过 owner-scoped native cache reader 重新计算 payload size/hash，不要求重新 OCR 或重新打包。

### PC OCR 诊断文档同步（2026-09-08）

- 记录 OCR 页级 continuation、全空文档 `OCR_DOCUMENT_EMPTY`、有界可复制诊断及本机隐私边界；focused 自动测试与 Rust 检查结果按本轮报告登记。
- 未宣称 `1.pdf` 真实 Tauri GUI、剪贴板/accessibility、sidecar 日志或 OCR 质量验收通过；这些仍需人工验证。

### PC 断网上传恢复状态机（2026-09-08）

- 带持久化 payload receipt 的 `PAUSED_NETWORK` 任务继续时经 `QUEUED -> UPLOADING` 直接续传，不重跑 OCR、download 或 hash；`NETWORK_OFFLINE` 保持稳定错误码，详情仅保留 allowlist reason。真实 Tauri/MinIO PUT 与 GUI 成功仍待验收。

### PC/Server/Mobile 全端认知负荷移除复核（2026-09-07）

- 后端移除 `TaskEntity` 及其相关 DTOs 和视图中的 `cognitiveLoad` 字段，完成 V20 Flyway 数据库迁移：丢弃旧负荷值，保留 Task 同步 JSON 中的其余字段、cursor 和版本。
- PC/Mobile 前端移除所有的 `load` 和 `loadText` 参数，并更新了 `Timeline`、`SubjectWorkspace` 及双端本地存储的 JSON 同步解析逻辑，不再回传并清理旧废弃数据。
- 本轮自动证据：Server OpenAPI/V20 定向 8/8；PC type-check 及 R4 211/211；Mobile type-check、R4 静态检查及协议测试 21/21。Server 全量 198 项仍有 28 个已知环境/共享数据错误，OpenAPI 整体门禁仍受既有 WebSocket/JsonNode 漂移阻断；真实 PostgreSQL 和 GUI/真机验收尚未执行。
- 确认全仓无残留，并保护了 PC 端独立增加的文件上传验证以及其它近期的 2026-09-07 修复成果。

### PC 失效会话与浏览器 JSZip 入口收口（2026-09-07）

- refresh session 因后端重建失效时，PC 清除本地 access/refresh token 并进入 `reauthentication-required`；受保护 Axios、sync 和 Source document background scheduling 停止，避免 realtime ticket 与 Asset download-url 的 401 无限扩散，也不再调用受保护 logout 进行递归清理。
- 登录、注册、refresh 和 health 保留恢复路径；现有 refresh 单飞与单次请求重放行为保留。
- PPTX parser 使用自包含 JSZip 浏览器 bundle，Vite 对包根入口增加精确 alias，不使用空 stream polyfill。
- 本轮聚焦 Node 回归 24/24 通过；完整 Vite build、真实 Tauri bundle 产物扫描和 GUI 验收仍未完成。

### MinIO 真实读写健康检查与非破坏性恢复（2026-09-07）

- 保留 `auralis_auralis-minio-data` volume，诊断宿主/容器容量、inode、挂载和权限后，仅安全重启并安全重建 MinIO 容器以加载配置；未删除 volume、数据库或对象。
- Compose MinIO healthcheck 现在用随机 `.healthcheck/` 对象执行 PUT、HEAD、GET、DELETE，并清理测试对象；回归断言 `scripts/minio-healthcheck.test.mjs` 通过。
- 复核证据：最终独立 PUT/HEAD/GET/DELETE 通过，MinIO ready 和 backend readiness HTTP 200；Tauri 三任务未执行 GUI 重试，仍待人工验收。

### PC OCR sidecar 临时目录与文档处理恢复复核（2026-09-07）

- OCR sidecar 启动前创建应用 cache 专属临时目录，将 TEMP/TMP 指向该目录；只有受管 sidecar 已停止时才清理该目录直属 `_MEI*` 文件夹，不触碰系统 TEMP 其它目录。
- 保留最多 20 行、每行最多 1024 字符的 stderr tail，并将 PyInstaller extraction failure 保留为稳定的 `OCR_SIDECAR_UNAVAILABLE:pyinstaller-extraction-failed` 诊断后缀。
- PPTX 使用 OOXML presentation relationships 读取实际 slide 顺序/页数/文本；49 页真实 fixture 和 legacy OLE `.ppt` 拒绝回归通过。Tauri invoke 归一化补充结构化错误对象，Rust PUT 补充 client 网络诊断。
- `SERVER_VALIDATING/SERVER_INDEXING` 的网络失败现在可进入 `PAUSED_NETWORK`；带持久化加密 receipt 的暂停上传恢复时不重新下载或哈希原始 Asset。Docker Desktop unable to start，真实 Server/MinIO/Tauri GUI 验收仍待外部依赖恢复。

### PC 文档调度、Office 提取与 OCR 可诊断性（2026-09-06）

- 切断 job 变化通知重新加载 Source 所形成的递归调度；任务通知现在只刷新处理 Store。
- 允许 `UPLOADING -> FAILED_LOCAL`，并将 stale `PACKAGING` 归类为本地失败，保留真实错误而不是二次抛出 `DOCUMENT_JOB_ILLEGAL_TRANSITION`。
- Office bridge 先收集锚点再读取文本 chunks；无可靠页数的纯图片 Office 文件返回 `DOCUMENT_FILE_TYPE_UNSUPPORTED`，不再使用误导性的 `OFFICE_PAGE_COUNT_UNAVAILABLE` 或锚点数量伪造页数。
- OCR warmup 使用受控 1×1 PNG 走现有 sidecar 协议并实际初始化模型；Rust 侧捕获最多 20 行、每行最多 1024 字符的 stderr，记录启动/读写/退出诊断，同时保持面向 UI 的安全错误码不变。
- focused Node 42/42、Python sidecar 11/11、Rust OCR 7/7 与 `cargo check --lib` 通过；真实 Tauri/Server/MinIO GUI 联调仍待验收。

### PC PDF 解析与 Source 调度竞态修复（2026-09-06）

- `PdfTextAdapter` 通过 Vite `?url` 将同版本 `pdf.worker.min.mjs` 绑定到 `pdfjs.GlobalWorkerOptions.workerSrc`，PDF.js 不再依赖 CDN 或缺省 worker 配置。
- `useSourceStore` 的自动文档调度现在要求 `AWAITING_CLIENT` Source 已有非空 `assetId` 与 `ingestionRevision`；本地 Source CREATE 尚未同步时不再提前请求服务端并触发 404 孤儿清理，待同步投影带 revision 后再创建本地 job。
- 新增 Source 调度策略回归；PDF runtime、Source 注册及相邻文档处理 focused 测试 70/70 通过，Vite production build 通过。PC type-check 仍受既有 `useTaskStore`/Timeline 共 7 项错误阻断；认证、MinIO、API 与数据库契约未修改，真实 Tauri/Server/MinIO GUI 联调仍待验收。

### PC 上传与处理恢复（2026-09-05）

- Tauri keyring 3 显式启用 `windows-native`，继续使用 `auralis/master_key`，不增加明文或环境变量回退；新增 Windows-only 跨新 Entry 写入/读取/精确清理测试，但本机 `cargo test` 因 Credential Manager `NoStorageAccess(Error(1312))` 未通过，真实持久化仍未验收。
- StatsQueryRepository 在 JDBC 参数边界统一将 `Instant` 转为 `Timestamp`，保持 SQL、API 和 schema 不变；测试覆盖六个统计查询的全部时间参数、UUID 和顺序，`StatsQueryRepositoryTests` 与 `StatsServiceTests` 共 3/3 通过。
- 上传入口仅接受 PDF、DOC、DOCX、PPT、PPTX；图片/文本保留预览能力但在 upload intent 前拒绝，`canPreviewFile()` 与 upload allowlist 解耦，SubjectWorkspace 给出支持格式提示。
- DocumentProcessingCenter 区分本机等待 `AWAITING_CLIENT` 与服务端 `VALIDATING/PARSING/INDEXING`，`DocumentProcessingDot` 复用共享 Source 状态映射，未知/undefined phase 使用中性同步提示并将 `READY` 显示为“处理完成”，保留本地任务 retry/cancel/start 行为；本轮 file-preview 27/27、processing UI 1/1、runtime static 9/9 通过。真实 Tauri/Server/GUI 验收仍开放。

### PC 孤儿 Source 调度清理（2026-09-05）

- `SourceJobScheduler` 仅在 `sourceApi.get(sourceId)` 边界识别结构化 `ApiProblemError` 的 HTTP 404 或 `problem.code === 'RESOURCE_NOT_FOUND'`；命中后复用 owner-scoped `discard(sourceId)` 清理文档任务和加密 cache，并返回稳定的 `{ status: 'SKIPPED', reason: 'SOURCE_NOT_FOUND' }`。非 404 异常继续原样拒绝并保留任务，后续 parser/upload 异常不使用该分类。
- TDD focused scheduler suite 14/14、相邻文档处理套件 35/35、`check:r4-pc`（87 个生产文件）和 `git diff --check` 通过；`npm run type-check` 退出 1，7 项既有错误位于 `useTaskStore.ts`（3 项）和 `Timeline/index.vue`（4 项），未归因于 scheduler。开发环境在停止当前仓库 Tauri 进程树后，已精确删除应用配置目录中的 `auralis.db`、`auralis.db-wal`、`auralis.db-shm`；未删除同目录其它内容。重启后数据库与完整表集重新建立，远端投影恢复；文档任务随后暴露 master key 缺失并进入 `FAILED_LOCAL`，密钥恢复与重新上传另行验收。

### PC 本地优先同步核心（2026-09-04）

- 本地 schema 升至 v6；普通 Subject、Source、KnowledgeBlock、Task 写入原子保存资源投影和 immutable outbox，UI 在本地成功后立即确认，后台以合并调度执行 push 后 cursor pull。
- Store 列表仅从本地投影 hydration；远端响应仅结算对应 mutation，并在资源没有未解决本地 mutation 时更新投影。同一 cursor page 对每资源只应用最后一条 change，远端 tombstone 不覆盖本地未解决编辑。
- `r4-local-repository`、`r4-sync`、`r4-register-file` 定向 Node 套件 28/28 通过。完整 PC 门禁、类型检查、production build、Tauri GUI、弱网双设备与冲突可见性仍未验收。

### PC 学科文件删除即时投影（2026-09-04）

- `useSourceStore` 在 Source tombstone 和 DELETE outbox 持久化完成后，立即移除文件列表投影；同步与 parser/job/cache 清理继续后台执行，删除不再等待耗时的调度器收尾。
- `r4-file-preview` 删除顺序回归 20/20 通过；真实 Tauri 的 OCR 运行中删除、缓存清理及服务端同步仍待人工联调。

### PC 文件预览快速选择合并（2026-09-04）

- `FilePreview` 在启动二进制下载前合并 80ms 内的选择，并以 `AbortController` 中止被替代的 fetch，避免多份大文件同时转为 Blob 并进入 File Viewer。
- `r4-file-preview` 19/19 通过；真实 Tauri 大 PDF 首次解析仍待 GUI 验收。

### PC 单一文件预览（2026-09-04）

- 删除旧 `PdfViewer`、首页 PDF 伴读入口及其专项回归；资产库真实 Source 文件改用 `FilePreview`，保留既有签名下载、失败重试与 File Viewer 渲染路径。
- 资产树传递 Source `id`、`assetId`、`name`、`fileType`；删除 Asset 的 `filePath` 和不可达 Markdown 预览分支。`r4-file-preview` 24/24 通过；真实 Tauri/浏览器 GUI 验收仍待完成。

### PC Subject 全局主题色清理（2026-09-04）

- Dashboard、Timeline 与 Home 不再读取已删除的 `Subject.color`；学科相关视觉和新建知识块/任务默认统一为 `#7D9372`，Task 与 KnowledgeBlock 的 `colorOverride` 保持不变。
- Home 新建学科调用恢复为现行的 `addSubject(name, description, icon)` 签名。
- `r4-store-mapping` 10/10、`npm run type-check` 和目标差异检查通过；真实 GUI 仍待验收。

### PC 已完成排期任务固定（2026-09-04）

- 已完成且仍有 `scheduledAt` 的任务继续显示在原时间轴槽位；Store 拒绝其移动、替换和取消排期，Timeline/Dashboard 同时移除拖放与取消排期入口。
- 历史本地展示态任务记录不再兼容；`completed` 等弃用格式在本地加载时忽略，在线刷新以现行领域 DTO 重建。
- 新增固定任务的 Store 与页面回归。完整 PC 回归最新结果为 173/181，现有 8 项时间轴/本地优先契约失败仍待其他工作收敛；Tauri GUI 拖放未验收。

### PC SQLite 并发写入修复（2026-09-03）

- Tauri SQLite 改为应用生命周期单次加载、建表和迁移；按用户/服务端设备范围复用 repository，所有 SQL 插件命令走单一串行队列，并在初始连接设置 WAL 与 5 秒 `busy_timeout`。
- 同步 snapshot reset 改由 Rust `replace_local_resource_snapshot` 在同一连接事务内执行：未解决 mutation 的资源行保持不变，任何非法 snapshot 项都会回滚本批。
- `r4-local-repository` 11/11 与 Rust lib 13/13 已通过；真实 Tauri GUI、数据库升级和多写入压力验收仍待执行。当前 PC 全量回归与类型检查受其他未收敛工作树改动阻断，未将其记作本项通过。

### PC 时间轴本地任务投影修复（2026-09-03）

- Task Store 改用认证态 `serverDeviceId` 访问本地 repository，修复设备标识契约迁移后本地读取失败并清空时间轴任务的问题。
- 列表加载现在先返回本地任务投影、后台刷新云端；本地读取或云端刷新失败均保留已有任务。Timeline 与 Dashboard 切换日期只重建内存槽位，不再重新读取本地库。
- 旧本地排期字符串会统一为 UTC ISO instant，确保可参与自然周过滤、半小时槽位渲染与更新请求。展示回归和静态检查通过；完整排期回归、类型检查、构建和 Tauri GUI 验收仍见当前问题登记。
- 拖放更新不再等待远端 `PUT`：任务先写入当前用户/`serverDeviceId` 范围内的本地 repository 与 outbox，再更新 Timeline/Dashboard 内存槽位；后台 push/pull 失败不回退本地结果，本地写入失败通过页面通知反馈。原生 payload 现同时携带 `taskId` 与已排期任务的 `sourceSlotTime`，原槽放置为 no-op。双任务换位持久化原子组仍未完成，保留在 P1 风险。

### Subject 专属颜色移除（2026-09-03）

- 服务端 Subject API/Entity 不再暴露 `color`，新增 Flyway V19 删除 `subjects.color`；已有 Subject 行与 KnowledgeBlock/Task 的 `color_override` 保留。
- PC/Mobile 前端清理 Subject 颜色状态、同步和主题化残留，统一使用全局语义色；两端构建/回归与本地 Docker PostgreSQL V19 升级均已验证，真实三端 GUI/业务联调仍待人工验收。

### PC 扫描 PDF Runtime 统一与文档处理状态修复（2026-09-01）

- 根 `pdfjs-dist` 精确固定为 `5.4.624`，与 `@file-viewer/renderer-pdf@2.3.0` 一致；npm lockfile 已收敛为同一根级副本，PDF 本地适配器不再传递无效 `disableWorker`。
- FILE scheduler 在创建和结束时刷新 Pinia 处理状态及 Source；文件行和 Profile 同时反映本地解析与服务端 `VALIDATING/PARSING/INDEXING`，直至 Source `READY` 才开放提问；未挂载 Tauri runner 时 Profile 明确提示桌面端限制，不再显示为“暂无文件解析任务”。
- 恢复批次现在隔离单个 Source 失败，避免历史失败文件阻塞后续 `AWAITING_CLIENT` 文件；Profile 对无本地 job 的等待文件提供“开始本机处理”并显示触发失败。手动入口先同步并确认本地 Source 为 `synced`，否则显示可理解的同步状态，只调度已由服务端确认的资料。
- `useSourceStore` 接入 Pinia HMR 更新，开发页新增处理 action 时会更新既有 Store 实例，不再出现方法不存在。
- Tauri SQL capability 显式允许持久化任务写入；后端对未预期 API 异常输出带 trace ID、路径和异常类型的诊断日志，客户端仍只收到脱敏的错误响应。
- 文档 runtime 保留前置检查，Rust `document_package_begin` 同时成为新建加密 package/cache 的最终密钥边界：只有 keyring 明确返回 `NoEntry` 时才创建原生 `auralis/master_key`，其他 credential-manager 错误会以 keyring 访问失败报告；已有 cache/receipt 仍只读取既有密钥，密钥丢失时停止并提示恢复，不会新建密钥覆盖旧密文。
- 服务端自有 JSON 类型统一到 Jackson 3 `tools.jackson`；`/api/sync/push` 的 object payload 已通过 MockMvc 回归，ParsedDocument 的有界解压异常语义保持有效，并以源码守卫防止重新引入 Jackson 2。OpenAPI artifact 已与运行时文档同步。
- `/ws/events` 移除会抢占 WebSocket upgrade 的 MVC `GET` 回退；实时认证只通过一次性 ticket 在 WebSocket handshake 中消费，不再因缺失 MVC principal 产生 500。真实 Java WebSocket client 已验证已签发 ticket 在不携带 Bearer header 时可成功 upgrade。
- 删除 FILE Source 现在会停止运行中的本地 parser，按当前用户/设备清理全部文档任务、关联加密 cache 和内存输入，并刷新 Profile；学科页经 Subject Store 重算文件计数。调度竞争只会安全跳过已删除 Source，不会重建任务。
- OCR 完成释放其 PDF.js document；预览签名 URL 下载加入最新选择门禁，旧响应不会覆盖当前 File Viewer 输入，降低扫描 PDF 在切换或 OCR 结束时反复重载的风险。
- 新增 PDF runtime、状态通知、删除清理与扫描型 FILE 组合链路回归；文档删除/预览定向 52/52、Rust 12/12、PC 全量 165/165、type-check、静态检查（80 个生产文件）、production build，以及 Realtime service/controller/HTTP upgrade 5/5 均已通过。扫描样本用 PDF.js `5.4.624` 实测加载 50 页、首屏无文本层且位图绘制成功；真实 Tauri/Server/MinIO GUI 联调仍待验收。

### 文档设计稿与实施计划目录归类整理（2026-09-01）

- 设计稿统一归入 `docs/design/`，已批准的详细实施计划统一归入 `docs/plans/`；文档入口与交叉链接已同步更新。
- 清理计划文档中的外部工作流指令，保留项目设计、实施步骤和验证内容。

### PC/Mobile 设备标识契约切换（2026-08-29）

- 客户端生成并持久化的设备注册标识统一为 `clientDeviceKey`；服务端设备主键、AuthResult/Session、Sync、本地隔离 scope 和 JWT claim 统一为 `serverDeviceId`。
- `POST /api/realtime/ticket` 改为无请求体，服务端从 Bearer JWT 解析并校验 `serverDeviceId`；旧 `deviceId` 字段不保留，也未增加兼容测试。OpenAPI artifact 与 PC/Mobile 生成 schema 已更新。
- PC `test:r4-pc` 150/150、Mobile `test:r4-mobile` 21/21、两端 type-check 通过；真实 Server、Realtime/WebSocket、移动端真机和 Tauri GUI 联调仍待验收。

### PC 时间轴过去时段保护（2026-08-31）

- 目标 `scheduledAt` 严格早于当前时刻时，PC Store 拒绝拖放排期、按天排期与已排期任务换位，保留原任务数据并使用既有错误反馈；换位校验两个任务的目标时段后才调用原子换位接口。
- 新增可注入时钟的纯判定与三条入口回归，确保被拒绝的操作不会调用 Task API、离线 mutation 或排期换位接口。
- PC 定向测试 28/28、`test:r4-pc` 154/154、`type-check`、`check:r4-pc`（80 个生产文件）和生产 build 通过；真实 Tauri GUI 拖放和服务端联调仍待人工验收。

### PC 任务到期自动转换（2026-08-31）

- Store 在启动 fetch 和每分钟检查中，把已过 `scheduledAt` 且未完成/未取消的任务更新为 `DONE`，同时保留排期；无排期且已过 `dueAt` 的任务显式提交 `dueAt: null`，进入未排期分组。
- Task 更新请求支持显式 `dueAt: null`；全局页面不再维护任务到期提醒。
- PC 任务/视图定向回归 26/26、`test:r4-pc` 152/152、`type-check`、`check:r4-pc`（80 个生产文件）和生产 build 通过；真实 Tauri GUI、服务版本和冲突/断网路径仍待人工验收。

### PC/Backend 任务排期原子性与逾期回归（2026-08-27）

- PC 在 API 边界统一将 `scheduledAt` 归一化为 UTC ISO instant；后端把时间反序列化失败转换为字段级 `400 VALIDATION_FAILED`，避免展示字符串 `Thu 08:30` 被当作 `Instant` 提交时返回未处理 500。
- 新增 `POST /api/tasks/schedule-swaps`：服务端以稳定顺序悲观锁定两项任务，在单事务内交换排期并校验版本/截止时间，任一失败均回滚。Dashboard、Timeline、Home 的拖拽 payload 改为任务 ID 与原槽位，原槽 no-op，拖回待办按任务 ID 取消排期。
- 登录后会将逾期可行动任务自动回归未排期并从任务视图隐藏，App 以一次可关闭提示列出受影响任务。`CoreDomainControllerTests` 5/5、PC `test:r4-pc` 142/142、type-check、生产 build 和 `git diff --check` 通过。真实 Tauri 原生拖放、冲突/断网和逾期提示仍待人工验收；Mobile generated schema 因外部文件锁尚未同步，详见当前问题登记。

### PC 任务未排期与排期视图显示修复（2026-08-28）

- 资产库任务分组的用户可见文案统一为“未排期”，保留原有 focus query 兼容。
- 逾期任务由 Store 自动取消排期后重新进入待排期队列；时间轴不再额外隐藏仍带排期的逾期任务，取消排期失败时保留原排期以暴露失败状态，完成/取消规则不变。
- 排期页移除高中低负荷的可见标签，内部负荷字段和分析逻辑保留；逾期清单提示按认证会话去重，同一会话内子页面刷新不再重复弹出，登出后新会话可重新提示。PC `test:r4-pc` 145/145、type-check、静态检查通过；真实 Tauri GUI 仍需人工验收。

### PC Vite 开发 HMR 竞态修复（2026-08-27）

- `@vitejs/plugin-vue` 显式使用 `vue/compiler-sfc`，避免 File Viewer 开发期资源复制触发早期 HMR 时读取空 compiler 并报 `invalidateTypeCache`。
- Vite watcher 忽略 `public/file-viewer/**` 生成资源，保留资源复制/静态服务但不触发业务热更新。
- `test:r4-pc` 138/138、type-check、静态检查、Tauri `--no-bundle` 通过；真实 Tauri dev 热更新仍需人工重启确认。

### PC Tauri debug 前端启动修复（2026-08-26）

- 修复 `tauri-plugin-log` 默认文件日志目标在已有日志文件/目录状态下返回 Windows `os error 183`、导致 debug/Tauri dev 在窗口创建前退出的问题。
- debug 日志改为 stdout 目标；新增静态回归断言，`cargo run` 已能正常越过原崩溃点。真实 Tauri GUI 仍需人工验收。

### PC Tauri 白屏运行时修复（2026-08-26）

- 独立 WebView2 证据确认资源加载成功，白屏由公共登录路由仍挂载 `AppSidebar` 并在无 refresh token 时抛出未处理 401 刷新异常触发。
- `/login` 现使用独立公共布局；认证壳、实时运行时和侧栏仅在完整 user+token 会话下启用，侧栏学科请求增加异常兜底；路由与登录页统一完整会话判定。
- `test:r4-pc` 137/137、type-check、Tauri `--no-bundle` 通过；真实 Tauri GUI 重启后的登录/过期验收仍待执行。

### PC Tauri 上传/解析联调修复（2026-08-26）

- `DocumentProcessingRuntime` 在加载 Source 和恢复本地解析任务前先执行一次完整 `triggerSync`，让应用重启后遗留的 SOURCE outbox 能先到达服务端并创建解析任务。
- 保留既有 localStorage fallback，避免尚未迁移的待同步 outbox 因切换到空 SQLite 而暂时不可见；SQLite capability 迁移另行处理。
- Docker 本地 `AURALIS_MINIO_PUBLIC_ENDPOINT` 默认改为 `http://127.0.0.1:9000`，避免 Windows `localhost` 解析到不可达 IPv6 `::1` 时预览/直传出现 `Failed to fetch`。
- 新增 runtime 与 Tauri capability 回归断言；真实 Tauri 上传、任务中心和扫描 PDF 预览仍需人工复测。

### PC Tauri AI 辅助阅读 A1–A4、K2、U1–U3 自动门禁（2026-08-26）

- 服务端新增 V16 阅读会话 scope/清理、已完成历史 Prompt 组装、`readingContext` 当前 Source 检索和同学科确定性升级；OpenAPI artifact 与 PC/Mobile 生成 schema 已同步。
- PC 学科工作区创建并清理临时 `READING_SESSION`，未 READY 文件提示前往 Profile；文件列表仅显示解析状态点，Profile 提供阶段/进度/失败重试/取消；预览原生选中文本可解释、追问或确认保存为知识块。
- 文件状态点仅在任务进入 `READY` 后消失；本地/服务端失败保留红色静态点并引导到个人中心重试。
- 服务端 AI/OpenAPI 定向 31/31、PC `test:r4-pc` 135/135、type-check、Web build 和 Tauri `--no-bundle` 通过。真实 Server/MinIO/Provider、扫描 PDF/Office/Tauri GUI、断网重启、MSI 和业务质量仍待人工验收；按用户授权跳过独立 commit。

### PC Tauri AI 辅助阅读 G1–G4 技术门禁（2026-08-24）

- G1 冻结 OCR stdin/stdout 协议、错误码、路径/大小边界和五组离线 fixture；G2 固定 RapidOCR/PP-OCRv6-small、模型哈希、依赖锁和 PyInstaller sidecar；G3 接入 Tauri Rust supervisor、串行队列、超时和重启预算，相关定向测试通过。
- G4 已声明 target-triple `externalBin`、`../ocr-sidecar` resources、第三方 notices 与 CycloneDX SBOM；最终 MSI 生成 220,286,976 bytes，verifier 通过 generated WiX 对 sidecar、三个模型、manifest、notices 和 SBOM 的引用，五组 fixture 离线 baseline 已固化到 `budgets.json`。
- 复核发现 WiX 实际 externalBin 文件名为 `Bin_auralis_ocr.exe`，先补失败测试再修正 supervisor resolver；5 个 Rust OCR supervisor 测试通过。临时 all-users 安装返回 Error 1925/1603，安装后 GUI/OCR 留给 R2；用户已授权继续 G5。
- G5 已接入固定尺寸、不可 `display:none` 的 `BackgroundParserHost` 和 `FileViewerParserBridge`，复用 File Viewer 文本块/锚点 API，并提供 bitmap fallback/`OFFICE_TEXT_UNAVAILABLE`；type-check 与静态契约 2/2 通过，DOC/DOCX/PPT/PPTX 真样本矩阵仍待补齐。
- G5 实现后的现有 PC 回归 `test:r4-pc` 通过 102/102；用户已将 DOC、DOCX、PPTX 和 text-layer/扫描型 PDF 放入 `docs/test`，并由 Apache POI 生成真实 OLE 旧式 PPT fixture；Office fixture matrix 3/3 通过，实际 File Viewer/Tauri 运行时结论仍待验收。
- G6 新增 bounded `DocumentParser`、PDF text-layer/扫描分类、逐页 OCR、Office direct/fallback、Unicode 归一化和 sink 背压；core parser 7/7、真实 PDF 分类 2/2、Office matrix 3/3、PC 回归 102/102 和 type-check 通过。
- C1 新增本地 schema v3 `document_processing_jobs`，固定用户/设备/source revision 唯一键、合法 phase 状态机、原子 checkpoint 及浏览器 v3 namespace；定向 schema/repository 测试 3/3 通过。
- C2 新增 4 MiB 分块 gzip/AES-GCM ParsedDocument cache、AAD scope、plain/payload 双 hash、nonce/tamper/atomic replace 校验、内部解密 reader 与 package commands；Rust 全量测试 10/10、JS contract 2/2、type-check 通过。
- C3 新增单设备串行可恢复 `DocumentJobRunner`、app close/sidecar/network 错误策略、最多三次自动重试、人工 retry/cancel 和 Pinia store；runner 测试 5/5、type-check 通过。

### PC Tauri AI 辅助阅读 K1 OpenAPI/SDK 契约冻结（2026-08-24）

- 为 Source/Asset/ParsedDocument DTO 固定独立 OpenAPI schema 名称，避免同名 `Response`、`CreateRequest` 和 `UploadIntent` 在生成文档中互相覆盖；ParsedDocument 两条 route 明确 `201/200/409` 响应及 `PARSED_DOCUMENT_CONFLICT`、`INGESTION_REVISION_STALE`。
- Source schema 暴露 `AWAITING_CLIENT`/`VALIDATING`，`ingestionRevision` 为客户端只读；ParsedDocument upload intent 的 `ocrModelVersion` 保持可选；PC `useSourceApi` 已接入 typed upload-intent/complete wrapper，Mobile 仅同步生成类型。
- `OpenApiArtifactTests` 4/4、`scripts/check-openapi.ps1` 和 PC `npm run type-check` 通过；未创建独立 commit，按用户授权纳入后续统一提交。

### PC Tauri AI 辅助阅读 C4 加密 ParsedDocument 上传闭环（2026-08-24）

- 新增 Rust `document_upload_put`：从本地 AES-GCM cache 内部解密 reader 流式 PUT 到签名 URL，按实际 bytes/SHA-256 校验，网络、过期 intent 和非 2xx 状态映射为稳定错误码；签名 URL、headers 和正文不进入 Vue 或本地任务表。
- 新增 PC `ParsedDocumentUploadCoordinator`：以任务 phase/receipt 驱动 upload-intent → PUT → complete；过期 URL 重新申请而不重复 OCR/package，网络暂停可恢复，complete 在 coordinator 生命周期内去重并处理 `INGESTION_REVISION_STALE`。
- 本地文档任务 schema 升级为 v4，`ingestion_revision` 对齐服务端 UUID；旧数字 v3 任务复制到 legacy 表后转为文本。Rust 12/12、C4 JS 6/6、PC 回归 108/108、PC type-check 通过；按用户授权跳过独立 commit。

### PC Tauri AI 辅助阅读 C5 FILE Source 调度与可恢复续传（2026-08-24）

- 新增 `SourceJobScheduler` 与 Source Store 调度接线：FILE Source 在 `AWAITING_CLIENT + ingestionRevision` 时创建本地 job，优先使用当前上传会话 File，移动端创建/重启恢复通过 owner-scoped Asset download adapter 获取临时输入；TEXT/URL 保持服务端 ingestion。
- 本地 job schema 升级 v5，持久化 `DocumentCacheReceipt` 非敏感元数据；runner 对 `PACKAGING`/上传阶段不重复 OCR/package，scheduler 核对 Asset SHA、supersede 旧 revision、完成后清理 cache 和临时输入，签名 URL 不进入本地存储。
- C5 定向 21/21、完整 PC 回归 128/128、type-check、R4 静态检查通过；真实 Tauri 私有临时目录、MinIO/Server 联调、跨设备恢复和 GUI/安装验收仍待完成；按用户授权跳过独立 commit。

### PC Tauri AI 辅助阅读 C5 runtime 接线（2026-08-26）

- 新增 `DocumentProcessingRuntime` 与全局 `BackgroundParserHost` registry；Tauri 登录后自动组装 SQLite job repository、PDF.js/Office parser、Tauri OCR、Rust package/cache、ParsedDocument upload coordinator 和 Source scheduler，sync/online 后恢复 pending jobs，登出时解绑。
- 暂停网络且已有 durable cache receipt 的任务可从 `UPLOADING` 边界恢复；SQLite 初始化兼容 Tauri v2 `__TAURI_INTERNALS__`。新增 runtime 静态契约和暂停恢复覆盖，`test:r4-pc` 131/131、type-check、Web build、`check:r4-pc`（79 文件）通过；真实 Tauri/MinIO/Server/GUI 联调转入人工验收；按用户授权跳过独立 commit。

### PC Tauri AI 辅助阅读 S1 V15 数据结构（2026-08-24）

- 追加式 Flyway V15 新增 `sources.ingestion_revision`、`parsed_documents` 派生表和 `ingestion_jobs.parsed_document_id/ingestion_revision`；ParsedDocument 保留 parser/normalization/OCR model、Asset/payload/plain-text SHA、私有 object key、状态、generation 与对象生命周期字段，不进入同步表或普通 mutation。
- Source 状态约束加入 `AWAITING_CLIENT`、`VALIDATING`；历史非 READY FILE 迁移为 `AWAITING_CLIENT` 并获得稳定 UUID revision，既有 READY FILE 与活动 chunks 保持 READY。
- `ParsedDocumentSchemaTests` H2 clean/upgrade 4/4 通过；PostgreSQL upgrade 断言已加入 `PgVectorMigrationIntegrationTests`，本机 Docker 不可用因此保持未验收。

### PC Tauri AI 辅助阅读 S2 Source ingestion 分流（2026-08-24）

- `SourceEntity`/`SourceView`/Source DTO 已承载服务端只读 `ingestionRevision`，新增 `AWAITING_CLIENT` 与 `VALIDATING` 枚举状态；客户端请求模型不接受 revision 写入。
- FILE create、Asset 替换和 FILE reingest 进入 `AWAITING_CLIENT`、轮换 revision 且不发布旧 `SourceIngestionRequestedEvent`；TEXT/URL 继续使用 `PENDING` 和现有 server ingestion event。FILE 仅标题等不影响解析的更新保留当前状态。
- Source/Ai ingestion 定向测试 11/11 通过，覆盖 FILE 无事件、TEXT/URL 事件、revision 不可覆盖和 FILE 资产替换/reingest。

### PC Tauri AI 辅助阅读 S3 ParsedDocument upload intent（2026-08-24）

- 新增 `ParsedDocumentStatus`、JPA `ParsedDocumentEntity/Repository` 以及 owner-scoped `POST /api/sources/{sourceId}/parsed-documents/upload-intents`；schemaVersion 当前固定为 1，服务端生成私有 `users/{user}/sources/{source}/revisions/{revision}/parsed-documents/{id}` object key，并将元数据以 `UPLOADING` 状态保存。
- upload intent 只接受匹配的 FILE Source/revision、payload SHA-256 和正数且受配置上限约束的 gzip payload 大小；不接受客户端 userId/objectKey，签名 headers/expiry 由现有 AssetStoragePort 返回，Source 保持 `AWAITING_CLIENT`。
- `ParsedDocumentControllerTests` 3/3 通过；S3 未包含 complete、payload 流式验证或首胜 indexing 语义，后续由 S4/S5 实现。

### PC Tauri AI 辅助阅读 S4 payload validator 与 Asset SHA 回填（2026-08-24）

- 新增有界流式 `ParsedDocumentValidator`：服务端按 upload-intent 的 gzip 大小核对压缩 bytes，限制解压字节/比例/block 数/单 block 与总字符数，拒绝未知字段、非法 UTF-8、非连续 ordinal、错误 schema、规范化正文 characterCount/plainTextSha256 和 payloadSha256。
- `AssetService.ensureSha256` 只从服务端原始对象流计算历史空 SHA，并用条件更新保证并发回填不会 last-write-wins；客户端声明不作为可信哈希。
- `ParsedDocumentValidatorTests` 4/4、`AssetShaBackfillTests` 2/2 通过；S4 未包含 complete 首胜和 indexing，后续由 S5/S6 实现。

### PC Tauri AI 辅助阅读 S5 complete 首胜与 indexing job（2026-08-24）

- 新增 `POST /api/sources/{sourceId}/parsed-documents/{parsedDocumentId}/complete`。服务端在 owner-scoped Source 行锁内校验对象 HEAD、Asset SHA、payload SHA、revision 和有界 payload schema；首个有效 ParsedDocument 进入 `ACCEPTED`，Source 进入 `INDEXING`，并创建带 `parsedDocumentId`/`ingestionRevision` 的唯一 PENDING indexing job。
- 同一 ParsedDocument 重放和同 revision + 同 payload SHA 的重复上传幂等；不同 payload 返回 `PARSED_DOCUMENT_CONFLICT`，旧 revision 返回 `INGESTION_REVISION_STALE`；并发 complete 只允许一个胜出。
- `ParsedDocumentCompleteTests` 3/3 通过，覆盖相同文档重放、相同 payload 重放、冲突、revision 过期和并发首胜；S6 的实际 ParsedDocument block 索引、generation 切换与对象清理仍待实现。

### PC Tauri AI 辅助阅读 S6 ParsedDocument indexing 与对象清理（2026-08-24）

- FILE indexing job 现在读取并重新验证 accepted ParsedDocument 的 blocks，使用其 generation 写入新 chunks；原始 FILE parser 不再作为该路径的回退，revision/generation 过期 job 只失败自身。
- FILE 兼容 reingest 复用 accepted ParsedDocument 与 revision；Asset 变更会标记旧 revision 的 accepted 派生记录为 `SUPERSEDED`。新增 cleanup scheduler 删除过期 `UPLOADING`/`REJECTED`/`SUPERSEDED` payload 对象并保留 ParsedDocument 审计行。
- `AiIngestionWorkerTests` 5/5、`AiSourceChunkTests` 3/3、`ParsedDocumentCleanupTests` 2/2 与 S5 回归通过；PostgreSQL upgrade 和实际 Tauri/Provider 联调仍待环境验收。

### PC File Viewer Vue ref 运行时 API 修复（2026-08-23）

- Chrome 真实运行复现点击缩放时的 `viewer.getZoomState is not a function`，确认 `@file-viewer/vue3-full@2.3.2` 包装组件通过空 `Proxy` expose，TypeScript 声明中的方法没有出现在 Vue 父级 ref 上；前一轮 ready 门禁调整不是最终根因。
- renderer 改用 `@file-viewer/vue3@2.3.0` 基础组件并通过 `withFullViewerOptions` 保留 full preset；缩放直接调用 `zoomIn`/`zoomOut`/`resetZoom`，旋转继续使用 `applyViewState`，Office renderer 保留外层旋转回退。
- Chrome 合成图片组件实测宽度由 800px 增至 896px、旋转角由 0° 变为 90°；定向预览回归 16/16、完整 `test:r4-pc` 101/101、type-check、静态检查和 Web build 通过。Docker 已无缓存重建，frontend 容器镜像 ID 与新镜像一致并返回 HTTP 200；真实业务文件和 Tauri GUI 仍待人工复验。

### PC 学科文件列表移除文件类型图案（2026-08-23）

- 移除学习文件行左侧的文件类型 Emoji 图案，文件名、大小、选中态和删除操作保持不变；新增静态回归断言，定向预览回归 17/17、完整 `test:r4-pc` 102/102。

### PC File Viewer 缩放/旋转无响应修复（2026-08-23）

- 移除 `FilePreview` 与 `FileViewerRenderer` 中依赖 `load-complete` 的两级 ready 硬门禁；动作只在组件 ref 尚未建立时暂存，避免正文已显示但生命周期事件未及时到达时点击被永久排队。
- 保留 File Viewer `applyViewState` 的缩放与 PDF/图片旋转路径，以及 Office 外层旋转回退；定向预览回归 16/16、type-check 和完整 PC 回归通过，真实 GUI 点击仍需复验。

### PC File Viewer PDF/图片缩放旋转与就绪队列修复（2026-08-23）

- 恢复 `FilePreview` 与 `FileViewerRenderer` 两级 ready 门禁，加载期间点击的缩放、重置、旋转和翻页操作会排队到 renderer 完成后执行。
- 缩放与 PDF/图片旋转统一通过 File Viewer `applyViewState` 执行；读取缩放状态增加未就绪保护，图片 renderer 自带旋转工具栏隐藏，Office renderer 在不提供旋转视图状态时回退外层旋转。
- 定向预览回归 16/16、完整 `test:r4-pc` 101/101、type-check、静态检查、Web build 和 Docker 重建已通过，frontend/backend HTTP 200；真实 PDF/图片 GUI 点击仍需人工确认。

### PC File Viewer 缩放与渲染遮罩修复（2026-08-23）

- 移除宿主 `FilePreview` 覆盖正文的“正在渲染文档”遮罩，避免首屏已可见时正文持续发白；加载语义保留在 `aria-busy` 和 File Viewer 内部状态。
- 缩放改用 File Viewer 通用视图状态 API 写入目标倍率，并将首次宽度适配设为用户交互后停止，避免 PDF 首屏 fit 将缩放操作重置；缩放与旋转分别放入同款简单圆角控制组。
- 定向预览回归 16/16、完整 `test:r4-pc` 101/101、type-check、静态检查和 Web build 已通过；真实 PDF/DOCX GUI 点击仍需人工验收。

### PC File Viewer 控件交互与留白修复（2026-08-23）

- 顶栏移除预览控件外层容器，缩放改为 `− / 实际倍率 / ＋`，旋转改为线条左旋图标、角度、线条右旋图标，并保留实体按钮的 hover/focus 层次。
- 预览上下文档留白收窄为 12–16px；按钮不再因 renderer 尚未完成而被直接禁用，点击操作通过 FilePreview/renderer 两级队列在就绪后执行，倍率通过 File Viewer `zoom-change` 回传，DOC/DOCX 左右旋转由 renderer 外层状态驱动。
- `test:r4-pc` 101/101、`type-check`、`check:r4-pc`（60 个生产文件）和 Web build 通过；真实 DOC/DOCX/PDF 样本的浏览器/Tauri GUI 仍待人工验收。

### PC 学科文件预览统一面板与拆分工具栏（2026-08-23）

- File Viewer 不再显示通用搜索、下载、打印、HTML、主题和内部重复工具栏；学科页现有文件名顶栏承载缩放/旋转，页码/总页数和前后页在预览主体底部以同级布局显示，renderer 内层边框/圆角移除。
- 保留 `FilePreview` 的签名 URL、下载、加载/失败和生命周期事件；新增宿主接线与 API 视图状态回归。补充 renderer 就绪前后的控制队列，顶部/底部栏增加轻微投影和实体按钮，中间文档上下保留 24–32px 安全留白。`test:r4-pc` 101/101、type-check、`check:r4-pc`（60 个生产文件）和 Web build 通过；真实 DOC/DOCX/PDF 样本的浏览器/Tauri GUI、分页能力与窄栏布局仍待人工验收。

### PC 文件预览工具栏简化（2026-08-23）

- File Viewer 隐藏通用搜索、下载、打印、HTML 导出、主题和重复缩放控件；PDF renderer 关闭导航侧栏，仅保留页码、缩放和旋转，并将控件栏移到预览底部。
- 新增工具栏配置静态回归；`test:r4-pc` 99/99、type-check、`check:r4-pc`（60 个生产文件）和 Web build 通过。真实 DOC/DOCX/PDF 样本的浏览器/Tauri GUI 仍待人工验收。

### PC 学科文件删除与同步竞态修复（2026-08-23）

- SubjectWorkspace 文件行的删除按钮恢复为悬停显示，键盘 focus-visible 仍可发现；行点击与删除按钮继续隔离。
- 本地 Source CREATE 尚未推送时，删除写入有序 DELETE outbox，不再提前直接请求远端 Source；已同步文件仍调用现有 Source DELETE 软删除。404、未登录、版本冲突和后端异常转换为明确反馈。
- 实时同步信号改为完整 push→pull；同步周期期间加入新 mutation 会在当前周期结束后自动再跑一轮。`test:r4-pc` 98/98；type-check、静态检查、Web build、Docker 重建和浏览器人工点击验收待执行。

### PC 学科文件改为知识块总结与软删除清理（2026-08-23）

- Antigravity Gemini 3.1 Pro 参与收敛 SubjectWorkspace：文件栏只显示真实 Source 文件，不再生成独立 `· 总结.md`；知识块入口承载总结，选中文件后直接显示无嵌套标题容器的 `FilePreview`。
- 文件行新增确认后的软删除入口，调用现有 Source DELETE；后端 `AssetRetentionCleanupService` 默认 30 天后按小时删除 MinIO 对象并将 Asset 标记为 `ORPHANED`，保留 Source/Asset 数据库审计行。
- 新增前端 flat-file/direct-preview/delete 回归与后端 MinIO retention 回归；`test:r4-pc` 95/95、type-check、静态检查、Web build、后端 `mvn -B -ntp test` 155/155 和 Compose config 通过。Docker 重建后 backend healthy、frontend HTTP 200、readiness `UP`；浏览器人工验收仍待执行。

### PC 学科文件大小即时显示（2026-08-23）

- 文件上传完成后的 `asset.sizeBytes` 现在会保留在本地优先 Source 副本，避免同步完成前学科文件列表显示 `0.0 MB`；该字段不会进入后端 Source 创建 mutation。
- 新增登记链路回归；`test:r4-pc` 94/94、type-check 和 Web build 通过。既有文件刷新及新文件浏览器 GUI 验收仍待执行。

### AI 失败日志保留原始异常诊断（2026-08-23）

- `AI_STREAM_FAILED`、`AI_PROVIDER_SELECTION_FAILED`、`AI_STREAM_VALIDATION_FAILED` 以及 embedding 失败事件现在输出异常类名、脱敏/截断后的 message 和 root cause，避免只剩统一 `VALIDATION_FAILED` 业务码。
- 新增 Authorization 脱敏回归；前端 Problem Details 仍保持安全统一错误码和 detail，不回显异常、密钥或上游响应体。
- `AiStreamingTests` 12/12 通过；Docker 运行态将在推送后重建并确认新字段出现。

### Docker MinIO 下载链路与资料大小修复（2026-08-23）

- MinIO 下载 URL 改为服务端离线 SigV4 签名，避免后端容器错误连接浏览器 public endpoint 的 `localhost:9000`，并增加脱敏失败阶段日志。
- Source FILE 响应返回可选 `assetSizeBytes`，PC 资料映射器使用真实 Asset 字节数，上传后不再固定显示 `0.0MB`。
- `MinioAssetStorageIntegrationTests` 3/3、`SourceAssetRelationServiceTests` 5/5、PC mapper tests 8/8 通过；Docker 临时账号真实 PUT/complete/download GET 链路通过。浏览器 GUI 仍待人工验收。

### PC 学科总结拆分为独立 Markdown 文件（2026-08-23）

- SubjectWorkspace 文件列表为每个真实资料增加 `· 总结.md` 独立虚拟项；原文件预览不再嵌套总结，点击总结项进入独立 Markdown 文档视图并可下载 `.md`。
- 总结由当前关联知识块实时生成，新增知识块仍归属原 Source；本阶段不新增后端 Source/Asset 持久化。`test:r4-pc` 93/93、type-check 和 Web build 通过，浏览器/Tauri GUI 仍待人工验收。

### PC Dashboard 窄宽待办名称显示修复（2026-08-23）

- 待办条目为学科徽标设置可收缩的最大宽度和省略号，避免长学科名称占满整行；任务名称在页面缩小时仍保留可见空间。
- 新增回归断言覆盖该 flex 布局边界，`test:r4-pc` 94/94、type-check 和静态检查通过；窄栏/浏览器缩放仍需人工验收。

### PC 学科统一文件预览（2026-08-22）

- 学科页新增统一 `FilePreview`：先通过服务端签名 URL 获取带正确扩展名的 `File`，再由自托管 File Viewer 渲染 PDF、DOC/DOCX、PPT/PPTX、图片和文本，并统一提供加载、失败、重试和下载状态。
- 上传选择器与拖拽入口共用文件能力注册表；Excel、未知格式及超过 50 MB 文件在创建 upload intent 前拦截，避免无效对象进入资产链路。
- `test:r4-pc` 92/92、`check:r4-pc`、SubjectWorkspace 契约、type-check 和 Web build 通过；Vite 已复制 47/47 File Viewer renderer assets。真实 Office 样本、浏览器/Tauri GUI 和窄栏布局仍待人工验收，必要时可在不改工作区契约的前提下切换 PDF renderer。

### PC 学科文件登记与 Docker MinIO 直传修复（2026-08-22）

- 文件登记确认现在校验文件、名称和归档学科，上传中防重复提交；直传或 Source 创建失败会显示通知并保留弹层重试，成功后刷新当前学科资料列表。
- MinIO 新增容器内 `AURALIS_MINIO_ENDPOINT` 与浏览器 `AURALIS_MINIO_PUBLIC_ENDPOINT` 分离配置，并使用 `AURALIS_CORS_ALLOWED_ORIGINS` 配置 API CORS，避免向浏览器返回无法解析的 `minio:9000`。
- `test:r4-pc` 82/82、PC type-check/static check、后端 clean test 149/149、MinIO public endpoint 集成测试 2/2 和 Compose config 已通过；Docker 重建后 frontend/backend 健康、readiness 和 MinIO CORS 预检通过，浏览器业务验收仍待执行。
- Backend 新增 `ASSET_UPLOAD_*` 与 `SOURCE_CREATED` 安全结构化日志，Docker 中可按阶段定位浏览器直传或 Source 登记失败；不记录文件内容、Token 或密钥。

### Docker 本地 loopback CORS 修复（2026-08-22）

- 本地 PC Web 通过 `http://127.0.0.1` 访问时，MinIO CORS 白名单现在与 `localhost` 一样允许直传；upload-intent 成功后不再因浏览器预检缺失而显示 network error。

### PC 全局字体与字号令牌统一（2026-08-22）

- PC 根字号统一为 `16px`，新增 caption/body-sm/label/body/body-lg/title-sm/title/title-lg/display 语义字号令牌，并保留旧基础字号变量别名。
- 普通 UI、表单控件和番茄钟统一使用 `--font-family-base`；代码、知识图谱等宽场景统一使用 `--font-family-mono`，移除局部字体族覆盖。
- 新增 typography contract 回归；浏览器窄栏、深色主题和真实字体加载后的视觉验收仍待执行。

### PC 时间轴使用自然周并显示英文星期缩写（2026-08-22）

- Dashboard 与 Timeline 改为展示当前/所选日期所在的完整自然周（周日至周六），并按真实日期计算 `isToday`。
- 首页日期选择器在数字上方显示 `Sun` 至 `Sat` 英文星期缩写，日期徽标保持约 `36px × 36px` 圆形绿色选中态，7 项均匀分布。
- 自然周边界、星期标签和时间轴契约已补充回归；浏览器周日/周六拖拽和视觉验收仍待执行。

### PC 时间轴恢复单周窗口与日期选择器视觉调整（2026-08-22）

- 根据跨周边界反馈，Dashboard 与 Timeline 从当日居中、前后三天的滚动窗口恢复为从当天开始连续 7 个日历日，避免 `dayCode` 排期被解析到下一周后任务消失。
- 首页日期选择器只显示日数字；未选中态去除边框，选中态使用固定约 `36px × 36px` 的圆形绿色背景，标题改为“时间轴 · X月”。
- 单周日期回归、首页视觉契约、type-check 和 Web build 已纳入本轮验证；浏览器拖拽与实际服务状态仍待人工验收。

### PC 首页与时间轴改为当日居中日期窗口（2026-08-22）

- Dashboard 与 Timeline 共用以当日为中心、前后三天的 7 日滚动窗口，所有日期列/选择器显示真实日期，当日固定在中间。
- 任务筛选仍保留已完成/已过去排期，取消任务不显示；日期边界回归后 `test:r4-pc` 75/75、type-check 通过，浏览器跨月/跨周和拖拽走查仍待人工验收。

### PC 时间轴拖拽与首页日期视觉修复（2026-08-22）

- 修复独立时间轴原生拖拽 payload 缺失、drop 未等待写回，以及 30 分钟槽位沿用整小时任务高度导致的任务块错位；首页覆盖判断改为分钟精度。
- 首页日期格改为只显示紧凑日期，顶栏显示选中日期的完整星期/月日信息；`test:r4-pc` 77/77、type-check、静态检查和 Web build 通过，浏览器拖拽交换仍待人工验收。

### PC 资产库任务改用真实 Task Store（2026-08-22）

- 移除资产库“全部任务”中的固定 Vue/Tauri 演示任务，改为通过 `useTaskStore.fetchTasks()` 加载当前用户任务。
- 资产树同时填充全部任务和各学科任务目录，任务完成切换回写 Task Store；PC 回归测试 64/64、静态检查、图标/工作区契约、type-check 和 Web build 通过。
- 浏览器资产库任务展示、状态切换和真实服务失败态仍需人工验收。

### PC 学科大厅编辑保存修复（2026-08-21）

- 修复编辑已有学科时表单丢失 `version`、导致更新请求缺少 `baseVersion` 而无法保存的问题。
- 新增 SubjectCreateModal 版本契约回归；PC 回归测试 63/63、静态检查、图标契约、type-check 和 Web build 通过。
- 浏览器实际修改、刷新后持久化和并发冲突提示仍需人工验收。

### PC 个人空间登出入口（2026-08-21）

- 个人空间新增“退出登录”按钮，确认后调用当前会话 logout，清理本地会话并跳转 `/login`。
- 服务端 logout 异常会给出提示，认证刷新失败触发的自动登出也不会产生未处理 rejection；PC 回归测试 62/62、type-check 和 Web build 通过。
- 浏览器实际点击、网络失败态仍需人工验收。

### PC 学科 AI 不回溯历史（2026-08-21）

- 学科工作区每次进入或切换学科都会清空当前消息并创建新的 AI 伴读会话，不再恢复全局旧会话记录。
- PC 回归测试 59/59、type-check 和 SubjectWorkspace 静态契约通过；真实浏览器 SSE 仍需人工验收。

### PC 注册默认学科修复（2026-08-21）

- 注册不再自动创建“未分类” Subject，新用户的 Subject 列表可以保持真实空状态。
- 历史 `defaultSubject=true` 记录不再被删除规则特殊保护，PC SubjectHall 可通过普通删除接口软删除；核心领域与资源归属回归 7/7 通过。
- 浏览器空状态、确认弹窗和真实服务删除仍需人工验收。

### AI 后端运行日志补强（2026-08-21）

- 为 AI 请求增加 `AI_STREAM_*`、`AI_SETTINGS_RESOLVED`、`AI_EMBEDDING_*`、`AI_RETRIEVAL_SUCCESS` 和 `AI_PROVIDER_HTTP_*` 事件，覆盖请求保留、Provider/模型与 env/BYOK 来源、Embedding/检索、Chat SSE、上游状态、字节/行数、耗时和失败阶段。
- 日志仅输出安全诊断元数据，不输出 API Key、Authorization、完整 prompt、模型回复或上游响应体；新增默认 Provider 选择失败、Embedding 失败和 HTTP 生命周期脱敏回归测试。
- AI 日志/Provider 定向测试 26/26 通过；真实 Provider、生产日志采集/轮转和前端业务验收仍需人工/部署环境验证。

### Java 21 Provider 固定地址 TLS 连接修复（2026-08-21）

- 修复 `HttpsURLConnection` 在 Java 21 先调用 `SSLSocketFactory.createSocket()`、再调用 `Socket.connect()` 时，固定地址 TLS 工厂提前抛错并令 embedding/chat 在发出请求前失败的问题。
- 无参 Socket 路径在 `connect` 时仍只连接安全策略已确认的公网 IP 和配置端口，保留 DNS 固定地址与 SSRF 防护；新增本地连接生命周期回归测试。
- 真实 Java `ProviderHttpClient` 链路调用 SiliconFlow `BAAI/bge-m3` 返回 1 条 embedding；全量后端测试 148/148 通过，Compose backend 重建后健康。PC 浏览器业务验收仍由人工完成。

### Provider DNS 与 SiliconFlow 模型配置修复（2026-08-21）

- Provider DNS 解析返回混合地址时，后端仅固定连接公网地址；解析结果全部为私网/合成地址时仍拒绝，避免误判可用的 embedding endpoint。
- Compose 显式透传 `AURALIS_AI_SILICONFLOW_BASE_URL`、`AURALIS_AI_SILICONFLOW_CHAT_MODEL` 和 `AURALIS_AI_SILICONFLOW_EMBEDDING_MODEL`，默认 embedding 模型为 `BAAI/bge-m3`。
- 新增混合 DNS 与全私网解析回归测试。

### AI env 默认 Provider 与 BYOK 覆盖（2026-08-21）

- 后端新增服务端 env Provider 默认配置：未指定聊天 Provider 时使用 `AURALIS_AI_DEFAULT_PROVIDER`，按 Provider 从 `DEEPSEEK_API_KEY`、`OPENAI_API_KEY` 或 `SILICONFLOW_API_KEY` 解析默认凭据。
- 用户 BYOK 仍优先于 env 默认，API Key 仅在服务端运行时使用；不写入 `ai_credentials`，也不返回前端。
- 新增配置绑定、env fallback、默认 Provider 流式回归测试；真实 Provider 网络与 PC 浏览器联调仍未验收。

权威范围：已发生且可确认的产品、代码、文档和验证变化

事实来源：Git 提交、本轮实际验证记录与重构前快照

## Unreleased

### PC Dashboard 时间轴拖拽与测试数据粒度修复（2026-08-22）

- 修复已排期任务拖动到新槽位后仍使用旧 `scheduledAt` 的问题；显式目标 `startTime` 现在覆盖旧时间，未提供时保留原排期。`test:r4-pc` 81/81、type-check、静态检查和 Web build 通过。
- 仅校正 Docker 测试账号的 17 个任务：预计用时与已有排期统一到 30 分钟粒度，未修改其他用户数据；浏览器/Tauri 实际拖拽验收仍待完成。
- 将 Store 缺省时长、时间轴创建任务兜底和间隔复习自动任务统一为 30 分钟粒度，避免后续新建任务再次产生 25/45 分钟数据。

### PC 时间轴任务显示修复（2026-08-22）

- 日视图改用半小时排期槽位匹配 `scheduledAt`，修复周视图可见但对应日时间轴因非整点开始时间而消失的问题。
- 已过去的排期任务不再从时间轴移除，日/周视图任务名称显示删除线；`test:r4-pc` 74/74、type-check 和静态检查通过，浏览器实际走查仍待验收。

### PC 资产库任务编辑时长（2026-08-22）

- 资产库任务编辑器移除低/中/高负荷按钮，改为 30 分钟步进的预计用时选择，并支持保存标题、备注、截止日期和 `durationMinutes`。
- `test:r4-pc` 73/73、type-check 与 Web build 通过；浏览器实际编辑、刷新后持久化仍待人工验收。

### R4：PC 任务时间轴与资产分组逻辑（2026-08-22）

- 排期队列仅展示有截止时间、尚未排期且未完成/未取消的任务；时间轴限制为今天起 7 个日历日，并保留已完成但仍有排期的任务。
- 资产库“全部任务”和学科任务目录按未分布、未完成、已完成并列分组，组内按截止时间排序；时间轴“导入任务”跳转并聚焦 `/asset?focus=unassigned-tasks`。
- 修复 Dashboard 三栏网格与内部滚动，统一拖拽/状态语义；`test:r4-pc` 73/73、type-check、静态检查、学科契约和 Web build 通过。浏览器/Tauri GUI 及真实服务联调仍待验收。

### R4：Mobile / 微信新契约与隔离本地库（2026-08-20）

- Mobile 的 Auth、直接 DTO/Problem Details、共享 refresh、Sync opaque cursor/snapshot、Realtime ticket、AI SSE、Review、Stats 和 Asset upload-intent/PUT/complete 已切换到冻结 OpenAPI；生产代码不再使用固定本机地址、旧 `/ws/sync`、旧数值游标或旧 AI 路由。
- H5 与原生端按 userId/deviceId 新建独立本地 namespace；用户明确授权后，旧全局 `h5_db_*` 与 `_doc/auralis.db` 业务表在认证会话建立时一次性清除。同步冲突保留 pending mutation，手写笔记继续受 feature flag 控制且不进入云同步。
- Pinia 固定为 2.1.7 并与 Vue 3.4.21 对齐；三个 Tablet 逻辑脚本进入 `test:tablet`。`check:r4-mobile` 扫描 62 个生产文件、协议测试 20/20、Tablet 测试、type-check、H5 build 和微信 build 通过；真实 Server/MinIO/Provider、微信合法域名、开发者工具、双设备和真机未验收。
- Tablet Dashboard 改用服务端 overview/weekly 统计并移除随机热力图和虚构学科兜底；Tablet Review 改用 due/event 契约，只有不可变事件保存成功才推进卡片，右滑仅取消手势。静态门禁新增对应回归断言，H5 与微信构建重新通过。
- Tablet 独立 Stats 页面同步改用 overview/weekly 统计，移除静态连续学习值、随机周数据和 180 天伪热力图；页面映射、状态和 R4-07 执行记录已同步更新。
- 共享任务选择器不再注入 mock tasks；Mobile Pomodoro 完成专注时改为调用 Task Store 今日计数，空任务和完成反馈均来自真实端侧状态。
- Mobile Settings 移除固定“已加入 12 天”演示值；User DTO 未提供注册时间时显示中性跨端同步说明。
- Mobile Home 移除空任务时注入的 `demo-*` 日程，Profile 统计改用真实 Task/Block Store，并在无注册时间字段时显示中性账户元信息。
- Mobile 手写页移除 Mock 笔迹覆盖和伪 OCR/知识抽取成功流程；当前保留本地画布并提示识别服务未接通。
- Tablet Workspace 总结移除固定演示文案和延时伪造，改用 `chatWithAI` 真实 SSE 流；AI 失败时保持空态并提示错误。
- Tablet AI 历史会话改用 Conversation GET/DELETE，消息从服务端 DTO 恢复，删除携带版本；移除硬编码历史和图片识别伪结果，图片入口在上传链路未接通前明确提示。
- Mobile Pomodoro 今日计数改用 userId/deviceId 本地 namespace key，不再读取跨账号共享的全局 `pomodoro_counts`；新增协议回归断言，`test:r4-mobile` 通过 20/20。
- Tablet 新对话在首条消息前显式创建服务端 Conversation，并将真实 ID 传入 SSE，避免复用用户级缓存会话。

### R1/R4：AI 可靠性与离线恢复（2026-08-20）

- Identity 登录设备列表改为每用户/设备一条活动 refresh session：重复登录同一设备会撤销旧会话，Profile 不再展示同设备的旧会话为可撤销设备；撤销提示明确 access token 会按有效期自然失效。
- PC 不再把 BYOK key/base URL 保存为浏览器明文或附加到普通请求 header；正式个人中心内嵌的 BYOK 卡片仅通过 `PUT /api/ai/settings` 请求体提交 key，展示服务端脱敏状态并在成功后清空输入框。
- 核心资源的离线 CREATE 改为本地优先且保留同一 `resourceId/clientMutationId`；仅明确离线或传输失败进入 outbox，5xx/冲突不再伪装为离线成功。SSE 在 401 时共享一次刷新并以原请求 ID 重试。
- Chat 会话与待发送 USER 消息持久化稳定创建/请求 ID，在网络恢复后按会话和消息顺序恢复。服务端 V14 为会话恢复键和 assistant→USER 精确关联建模，流式 Provider I/O 移出数据库事务，并发重复请求只保留一次 USER 消息。
- `test:r4-pc` 58/58、PC type-check、OpenAPI artifact/两端生成比对、服务端专项 12/12 和含 MinIO/PostgreSQL/pgvector Testcontainers 的 `mvn -B -ntp clean test` 137/137 通过；真实 Provider 与浏览器业务联调仍未验收。

### R4：PC Task/Review/Stats/Chat、运行时与联调前门禁（2026-08-20）

- `useTaskStore`、`useReviewStore`、`useStatsStore`、`useChatStore`、`usePomodoroStore` 已切换到当前 typed DTO、用户/设备隔离 repository 和页面模型；Dashboard、Timeline、Profile、Home、SearchPalette、SubjectWorkspace、Pomodoro 不再以旧 `localDb` 或静态演示数据作为云端事实。
- Profile 增加当前 user/device/session 展示和其它会话撤销；AI `AiStreamController` 统一处理 SSE 增量、citation 去重、取消、中断和失败；Vite 开发代理改为环境驱动，Tauri 默认 capability 保持最小权限。
- R4 PC 静态检查扫描 57 个生产文件通过，`test:r4-pc` 53/53、type-check、Web build 通过；Tauri `--no-bundle` 生成 `src-tauri/target/release/app.exe`。完整 MSI bundling 返回宿主权限错误 `拒绝访问 (os error 5)`，因此安装包、GUI、真实服务和前后端业务联调仍未完成。

### R4：PC Subject/KnowledgeBlock/Source/Asset 主流程迁移（2026-08-20）

- 新增固定 DTO mapping、分页 cursor 和 optimistic mutation 测试；`useSubjectStore`、`useSourceStore`、`useKnowledgeStore`、`useAssetStore` 通过 typed API 和 user/device-scoped local repository 处理版本、软删除、离线 pending 与冲突边界。
- SubjectWorkspace、Asset、Home 的文件路径登记改为真实 Asset upload-intent → 对象存储 PUT → complete → Source create；目录更新使用 Source API，上传失败保留明确 pending/failed 状态，不伪造云端成功。
- 正式页面路径移除旧资料 snake_case、旧 `/api/ai/chat` 和兼容 Asset 调用；AI 伴读改用当前消息 SSE。R4 PC 静态检查、mapping/protocol/local repository/sync 测试、type-check、Web build 已通过；真实服务、GUI、Tauri、双设备和前后端业务联调仍未完成。

### 前端 AI 辅助开发约定（2026-08-17）

- 新增 `docs/agent/FrontendAIAssistedDevelopment.md`：前端实现默认优先使用 AGY/Antigravity 中当时可用的 Gemini，但要求对生成代码进行范围、契约、安全、视觉、响应式、可访问性和验证证据审查。
- 在文档入口、PC 模块和 Mobile/Tablet 模块中登记该约定；该偏好不改变后端、API、数据库、鉴权、密钥和人工验收规则。
- 已联网核对 Antigravity 官方关于模型选择、Review-driven development、代码 diff、walkthrough、浏览器检查和 workspace rules 的资料；当前 Codex 工作区没有直接调用 AGY/Gemini 的模型入口，因此不把本轮文档变更声称为 Gemini 生成。
- 补充 Codex 沙箱与宿主机 AGY 的边界：本机 `cmd.exe /c agy --version` 实测为 `1.1.13`，调用时需使用沙箱外的一次一审命令审批；文档给出 `where agy`、`agy models`、计划模式和前端任务调用示例，并明确禁止 `--dangerously-skip-permissions`。

### R3：OpenAPI 与客户端类型冻结（2026-08-17）

- 从 Spring MVC `/v3/api-docs` 导出并固定 `docs/contracts/openapi/auralis-openapi.json`；新增运行时 artifact 对比测试、可重复导出/生成/校验脚本和 GitHub Actions 契约漂移门禁。
- 使用固定 `openapi-typescript@7.13.0` 从同一 artifact 生成 PC/Mobile `schema.ts`，并增加由生成路径、方法、请求体、path/query 参数和成功响应类型约束的轻量请求客户端；两端均通过同一生成器重新生成比对。
- 在 API、Database、PC 与 Mobile/Tablet 文档中冻结 `/api` 版本边界、旧 `/ws/sync`/旧 DTO 退出策略、cursor 过期、版本冲突和未来强制升级行为；当前只完成契约/类型冻结，未宣称前后端联调或业务验收完成。
- 后端默认全量 `mvn -B -ntp clean test`（系统 Maven 与 Wrapper）均为 135 通过、0 失败/错误/跳过，PostgreSQL/MinIO 容器测试已自动执行；PC `npm run build`、Mobile `npm run type-check` 与 H5 `npm run build:h5` 均通过。Mobile TypeScript 已固定为 5.3.3 以匹配 `vue-tsc@1.8.27`；G3 契约迁移前置门禁通过，但前端页面仍未完成新契约迁移与联调。
- G3 已确认 G1/G2 阶段门禁、OpenAPI artifact、两端生成类型和契约 diff 均通过；该门禁只允许进入 R4 大规模客户端迁移，不代表真实 Provider smoke 或前后端业务验收完成。

### R2：真实依赖测试基线（2026-08-17）

- Compose 已切换为固定版本的 PostgreSQL 17/pgvector、MinIO、bucket 初始化和新 Server 健康检查，移除 Redis/Milvus/etcd 主依赖；`.env.example` 补齐数据库、JWT、AI 加密、CORS、MinIO、Provider 和超时变量，并将本地 AI 加密示例固定为 32 字节。
- 新增 Java 21 多阶段、非 root 后端 Dockerfile 与 `.dockerignore`；新增 Testcontainers 2.0.5 PostgreSQL clean/upgrade 测试、MinIO presigned PUT/HEAD/GET/delete 测试和 Provider 错误矩阵测试。
- MinIO 资产 intent 在声明 sha256 时传递签名 metadata；完成校验失败尝试清理对象，并新增数据库/对象孤儿核对脚本。
- `docker compose --env-file .env.example config --quiet`、backend/frontend 镜像构建、Compose db/MinIO/backend/frontend 启动与健康检查均通过；PostgreSQL 17.11 + pgvector verify 135/0/0（另 1 个非 PostgreSQL opt-in 测试跳过）、MinIO 真实链路 1/1、Provider stub 2/2 通过。真实 Provider chat/embedding smoke 和 MinIO 异常路径仍需显式模型、密钥与网络条件。

### R1-06：后端工具链和运行配置（2026-08-17）

- 修复 Windows Maven Wrapper 对普通 Maven 仓库目录的空 `Target` 索引异常；`.\mvnw.cmd -v` 和 `.\mvnw.cmd -B -ntp clean test` 均可运行。
- 全局关闭 `spring.jpa.open-in-view`；prod profile 显式关闭 springdoc API docs 和 Swagger UI，local OpenAPI smoke 保持可用。
- H2 固定到 2.2.224，Surefire 配置 Mockito 5.23.0 Java agent，并在默认生命周期自动启用 PostgreSQL/MinIO Testcontainers；定向配置测试 6/6、系统 Maven 与 Wrapper 全量各 135 通过、0 失败/错误/跳过。
- G1 已通过；该证据仍不包含真实 Provider、生产 secret 或 GUI/真机验收。

### R1-05：并发、版本和分页（2026-08-17）

- 新增 Flyway V13，为 Conversation 增加 `version` 与 `next_message_sequence`；删除严格校验 `baseVersion`，消息追加通过会话行写锁和计数器分配序号，移除 `max + 1` 竞争窗口。
- Subject、KnowledgeBlock、Task、Source、Relation 列表接入带资源类型校验的不透明 keyset cursor，支持 `limit=1..200`，返回稳定 `nextCursor` 与 `hasMore`。
- Sync 保留清理增加可配置定时任务，并记录清理行数、失败数和过期 cursor reset 指标；清理不回退用户 cursor 高水位。
- 新增 R1-05 并发、版本、分页边界、清理恢复、指标和 Modulith 架构测试；定向套件 16/16、全量后端 `mvn -B -ntp clean test` 126 通过、0 失败/错误、1 个 opt-in PostgreSQL 测试跳过。真实 PostgreSQL 全量并发、生产调度、前端联调和人工验收仍未完成。

### R1-03：pgvector 检索和原子切换（2026-08-17）

- 新增 Flyway V10/V11：source chunk generation/active cutover、活动 chunk 查询索引，以及 PostgreSQL 历史 JSON embedding 回填。
- PostgreSQL 写入同时保存 `embedding_json` 和 `vector(1024)`；检索使用带用户、活动 generation、Source 删除过滤的 pgvector cosine SQL 和 HNSW，H2 保留 JSON fallback。
- chunk 重建先写入新 generation，事务成功后切换 active；数据库失败时旧 generation 保持可检索；Source 删除和用户隔离均进入检索过滤。
- 2026-08-17：R1-03 定向测试 11/11 通过；PostgreSQL 17.11 + pgvector 隔离容器集成测试 1/1 通过。该证据不包含完整 Compose、MinIO、真实 Provider、lease fencing、性能、前端联调或人工验收。

### R1-04：AI 请求与真实流式（2026-08-17）

- 新增 `V12__ai_message_client_request_id.sql`，为 AI USER 消息提供用户隔离的 `clientRequestId` 唯一键；重复请求回放已有 assistant 结果，不重复调用 Provider。
- `retrievalEnabled`、动态 topK 校验和 SiliconFlow embedding → pgvector/JSON retrieval 已进入消息执行链；citation 事件携带 Source/chunk 可追踪字段。
- Controller 改为 callback 式 SSE，Provider 增量直接写入 `StreamingResponseBody`；OpenAI-compatible 适配器解析上游 `data:`/`[DONE]`，并统一映射超时、限流、断流、错误和 assistant FAILED/INTERRUPTED 状态。
- 2026-08-17：R1-04 定向 AI 流式/Provider/Controller 测试 16/16 通过，全量后端测试 121 通过且 1 个 opt-in PostgreSQL 测试跳过。证据使用 Stub/受控 HTTP，不包含真实 Provider 网络/证书/配额、前端联调或人工验收。

### 后端绿地重写阶段 5：AI/RAG 后端基线（2026-08-16）

- 新增 Flyway V8/V9：AI credential、ingestion job、source chunks、Conversation/Message，以及 PostgreSQL pgvector/HNSW 条件迁移；H2 使用 JSON embedding 列完成可测试基线。
- 新增 BYOK AES-GCM 加密、用户/Provider 配置、OpenAI-compatible/DeepSeek 聊天适配器和 SiliconFlow 1024 维 embedding 适配器；API/DTO 不回显 key。
- Source 提交后触发 ingestion job，支持文本/文本型文件/URL 解析、固定重叠切块、embedding 持久化、用户隔离 cosine retrieval 和安全失败状态。
- 新增 owner-scoped Conversation/Message、`/api/ai/messages/stream` MVC SSE 生命周期事件和类型化 Suggestions 基线。
- 修复默认 local profile 缺少 AI 加密 key 导致应用上下文无法启动的问题；生产仍要求 `AURALIS_AI_ENCRYPTION_KEY`。
- 2026-08-16 `mvn -B -ntp clean test` 通过：92 个测试全部通过，包含 Spring context、Flyway V1–V9、JPA validate、MockMvc、AI/RAG 单测和架构测试。未包含 PostgreSQL/pgvector、MinIO、真实 Provider、性能/安全专项、前端联调和人工验收。

### 阶段 3/4 审核修复（2026-08-14）

- Sync push 改为每条 mutation 独立事务内的幂等占位、领域写入、change log 与最终决策原子提交；同一 `clientMutationId` 的 hash 冲突按单条 `REJECTED` 返回，不中止同批其他 mutation。
- 新增 V6 cursor 高水位表，游标分配使用锁定的用户行，change log 保留清理后不回退；snapshot 在 REPEATABLE_READ 事务内读取包含删除墓碑的全量资源视图，pull payload 改为 JSON 节点。
- 新增提交后实时事件桥，覆盖 REST/Sync 资源变更和 Review 更新；Review 幂等重放使用事件保存的完整 afterState；任务新增 V7 `completed_at`，weekly 完成任务按进入 DONE 时间统计。
- 新增审核回归测试后，`Auralis-Server\mvnw.cmd -B -ntp clean test` 退出码 0：27 个测试类、69 个测试用例全部通过，失败/错误/跳过均为 0，包含并发 cursor 与并发 mutation 重放。证据仍限于 H2/JPA/MockMvc/架构测试，不包含 PostgreSQL、Docker、真实 MinIO、双设备、浏览器 WebSocket、跨实例 broker、前端联调或人工验收。

### 后端绿地重写阶段 3/4：Sync、Review、Stats、Realtime（2026-08-13）

- 新增 Flyway `V4__sync_schema.sql`，创建用户域 `change_log`、设备 mutation 幂等表 `inbound_mutations`、保留清理索引和资源/操作约束；REST 直接写入与 Sync push 通过 shared `ResourceChangedEvent` 进入统一 change log。
- 实现 `/api/sync/push`、`/api/sync/pull`、`/api/sync/snapshot`，支持活动设备校验、不透明 cursor、幂等重放、请求 hash 冲突、版本冲突、REJECTED 结果和 30 天清理入口；当前 snapshot 返回活动资源，墓碑通过 pull change log 获取。
- 新增 Flyway `V5__review_stats_realtime_schema.sql`，创建版本化 Review 参数集、ReviewState、不可变 ReviewEvent 和一次性 Realtime ticket 表；实现 FSRS-lite due/event/history、SKIP 语义、overview/weekly 用户隔离统计及 hash-only ticket/进程内用户事件桥。
- 2026-08-13 `Auralis-Server\mvnw.cmd -B -ntp clean test` 退出码 0：27 个测试类、61 个测试用例全部通过，失败/错误/跳过均为 0；`git diff --check` 通过。证据限于 H2/JPA/MockMvc/架构测试，不包含 PostgreSQL、Docker、真实 MinIO、双设备、浏览器 WebSocket、跨实例 broker、前端联调或人工验收。
- 未关闭风险：Sync 游标并发/清理后的高水位连续性，以及 snapshot 包含墓碑的完整冷启动契约，已登记到 `docs/current/IssuesAndReview.md`。

### 后端绿地重写阶段 2B：Source、Asset、Relation（2026-08-13）

- 新增 Flyway `V3__source_asset_relation_schema.sql`，创建 `assets`、`sources`、`relations`，并为 `knowledge_blocks.source_id` 增加 Source 外键、索引和删除约束。
- 实现 Source FILE/TEXT/URL CRUD、版本/墓碑/恢复、reingest `PENDING` 边界，以及 KnowledgeBlock 的活动 Source/用户归属校验。
- 实现 Asset 上传 intent、对象完成时 HEAD/stat 元数据校验、READY 下载 URL、失败状态持久化和用户前缀；对象存储通过 `AssetStoragePort` 抽象，test profile 使用可控适配器，配置开启后使用 MinIO presigned PUT/GET。
- 实现 Relation 端点类型/用户/活动状态校验、`RELATED_TO` 无向去重、版本/墓碑/恢复，以及通过 shared `ResourceDeletedEvent` 的端点删除级联。
- 2026-08-13 `Auralis-Server\\mvnw.cmd -B -ntp clean test` 通过，42 个自动测试全部通过；PostgreSQL、Docker、真实 MinIO、ingestion worker、前端联调和人工验收仍未完成。

### 后端绿地重写阶段 2A：核心领域（2026-08-12）

- 新增 Flyway `V2__core_domain_schema.sql`，创建 `subjects`、`knowledge_blocks`、`tasks`，统一使用 UUID、用户归属、JPA `@Version`、审计时间和软删除墓碑；KnowledgeBlock 的 `source_id` 暂作为阶段 2B Source 接入前的可空字段。
- 实现 Subject、KnowledgeBlock、Task 的 Entity、Repository、显式 DTO、领域服务和 REST Controller，覆盖创建、查询、更新、软删除、恢复、用户隔离和精确 `baseVersion` 冲突。
- 注册用户同事务创建受保护的“未分类”默认 Subject；默认 Subject 不可删除，KnowledgeBlock/Task 不可引用其他用户或已删除 Subject。
- 将认证主体移入 shared security named interface，解除 identity 与业务模块的 Modulith 循环依赖；更新阶段1测试清理夹具以遵守新表 `ON DELETE RESTRICT`。
- 2026-08-12 `Auralis-Server\\mvnw.cmd -B -ntp clean test` 通过，31 个自动测试全部通过；PostgreSQL/pgvector、Docker、MinIO、Source/Asset/Relation 和三端联调仍未执行。

### 后端绿地重写阶段 1：Identity 与认证（2026-08-12）

- 在新 `com.auralis.app` 后端加入 Spring Data JPA、Spring Security、OAuth2 Resource Server、Flyway、PostgreSQL runtime 和 H2 test scope；创建面向干净数据库的 `V1__identity_schema.sql`，包含 `users`、`devices`、`refresh_sessions` 及归属/rotation 索引。
- 实现 User、Device、RefreshSession Entity 和 owner-scoped Repository 查询；refresh token 只保存 SHA-256 hash，access JWT 默认 15 分钟，refresh session 默认 30 天。
- 实现注册、登录、refresh rotation、重放撤销整个 rotation family、登出、当前用户、会话列表和会话撤销；公开错误统一为 Problem Details，凭据失败使用 `UNAUTHENTICATED`，跨用户会话访问不泄漏归属。
- 新增 Auth MockMvc 测试，覆盖用户隔离、密码/JWT、过期/撤销/重放、refresh token 误用、字段校验和安全错误；2026-08-12 `Auralis-Server\\mvnw.cmd -B -ntp clean test` 通过，19 个测试全部通过。
- 使用 H2 test-scope classpath 运行 test profile HTTP smoke：health liveness 和 OpenAPI 返回 200，register 返回 201，login 返回 200 且 token pair 存在。PostgreSQL/pgvector、Docker、MinIO、Testcontainers 和人工三端验收未执行。

### 后端绿地重写阶段 0（2026-08-12）

- 在 `Auralis-backups\\20260812-205737` 创建仓库外可恢复备份：完整归档 152 个文件、210984 bytes，SHA-256 为 `C59AD2AB39F05B114D7B13FAA948C8A8ED29CB0CA1F26DDBCF04794B431C4BEC`；空 Server 工作树补丁为 0 bytes，归档展开复核通过。
- 将旧 `Auralis-Server` 精确移动到备份目录的 `Auralis-Server-source`，在原路径创建新 Server；PC、Mobile、docs 其他范围和 Compose 未因替换命令被递归移动。
- 新 Server 固定为 Java 21、Spring Boot 4.1.0、Spring Modulith 2.1.0、`com.auralis.app`；移除旧 `com.auralis.server`、MyBatis/Redis/Milvus/etcd/JJWT/LangChain4j/MinIO 等依赖和旧统一 `Result`。
- 建立 12 个 Modulith 模块边界、配置绑定、Trace ID、RFC Problem Details、Actuator 健康检查和 `Auralis API` OpenAPI 基础；阶段 0 不开放 Auth、业务对象、同步、AI/RAG、WebSocket 或数据库路由。
- 验证证据：`Auralis-Server\\mvnw.cmd -B -ntp clean test` 退出码 0，5 个测试通过并生成 4 份 Surefire 报告；真实启动 smoke 的 readiness/liveness 为 HTTP 200 + `UP`，OpenAPI 与 Swagger UI 为 HTTP 200。Docker、数据库、MinIO、前端联调、GUI、真机和业务验收未执行。

### 前端重构进度与现行文档同步（2026-08-12）

- 更新 `docs/README.md`、`AGENTS.md`、当前状态、风险登记、PC/Mobile/Tablet 模块和前端设计文档，使正式路由、近期视觉改动、构建证据与人工验收边界保持一致。
- 明确 PC 当前为 8 条正式路由，并登记 Pomodoro、工作区、导航、弹窗和 Mobile/Tablet 热力图等近期代码变化。
- 记录本轮验证：PC 两个静态契约检查通过，TS5101 已通过配置调整解除，但生产构建继续受 TS6133 阻塞；Mobile H5、微信小程序构建和 Tablet 侧栏检查通过，仍需 GUI/真机验收。

### PC TypeScript 6 构建配置修正（2026-08-12）

- 从 `Auralis-PC/tsconfig.app.json` 移除已弃用的 `baseUrl`，保留 `@/*` 的 `paths` 映射；PC 两个静态契约检查继续通过。
- 修正后生产构建已越过 TS5101，但进一步暴露 `Auralis-PC/src/components/layout/AppHeader.vue` 的未使用 `ElMessage` 导入（TS6133），因此仍未形成完整 PC bundle 验证。
- 随后删除未使用的 `ElMessage` 导入，2026-08-12 `npm.cmd run build` 通过（3477 modules）；Vite 仍提示部分 chunk 超过 500 kB，待后续评估拆包。

### 平板与手机端热力图可配置化与自适应布局（2026-08-11）

- 改造了 `HeatmapChart.vue` 组件，使其支持动态传入 `weeks` 属性配置显示的周数（默认 16 周），并根据周数动态调整标题文本（5周及以内显示“近一个月”）。
- **优化热力图视觉**：强制所有热力格子为严格的正方形（`aspect-ratio: 1/1`）。为了解决短期数据（如近一个月，5周）导致中间窄条且两侧留白过多的问题，引入了自适应布局：当 `weeks <= 5` 时，自动从纵向 GitHub 风格切换为更舒展的 7列 x 5行“标准日历”横排布局，在保持禅意留白的同时，使网格能更均匀地分布在宽屏卡片中。
- 在平板端首页 (`Auralis-Mobile/src/pages/tablet/dashboard/index.vue`) 的热力图组件中显式传入 `:weeks="5"`，确保大屏下只展示一个月的数据并触发日历布局。
- 修复了平板端首页横幅（Hero Banner）卡片的渐变背景色，将其从旧的硬编码绿色（包含不合规的 `#687f5d`）统一为前端设计文档 (`Frontend.md`) 中规定的 `Primary Gradient` 品牌线性渐变（`linear-gradient(135deg, #A3B19B 0%, #7D9372 100%)`）。

### 文档体系

- 建立以 `docs/README.md` 为唯一入口的分类文档体系。
- 新增 Agent 强制协议、权威边界、状态词典、回写矩阵和交接模板。
- 完整归档 2026-07-10 重构前 35 份旧文档，并保留当时未提交的文档修改。
- 新增项目、设计、模块、契约、运维、当前状态和计划文档。
- 旧现行路径已切换，现行链接、根目录、元数据和旧路径扫描通过。

### 本轮验证

- PC：2026-07-10 `npm.cmd run build` 通过（`vue-tsc -b && vite build`）。
- Mobile：2026-07-10 `npm.cmd run build:h5` 和 `npm.cmd run build:mp-weixin` 通过。
- Tablet：2026-07-10 `node scripts\check-tablet-sidebar-transition.mjs` 通过，120ms 指示器在 160ms 路由重载前落位。
- Server：2026-07-10 `mvn test` 通过；Maven 日志显示没有测试源码，不能当作业务测试覆盖。
- Mobile H5 构建保留动态/静态 import 和 Sass legacy API 非阻断警告。

### PC 学科图标兼容（2026-07-13）

- 新增 `src/utils/subjectIcon.ts`：学科图标统一兼容 Emoji 与历史名称（如 `book`、`code`），空值或未知名称回退为书本图标；大厅、工作区、首页和时间线使用同一解析逻辑。
- `node scripts\check-subject-icon-rendering.mjs` 与 `npm.cmd run build` 已通过；浏览器/Tauri 显示仍待人工验收。

### PC 新建学科线条图标（2026-07-14）

- 引入了更精致、具有现代细腻设计感的第三方图标库 `lucide-vue-next`。创建学科弹层改用 16 个 Lucide 线条图标（如 BookOpen, Sigma, Sparkles 等），完全符合“极简禅意”设计目标，同时保留原有语义键以向后兼容；大厅、首页和工作区用同一解析器渲染。
- 已有 Emoji 学科不迁移，编辑时未重选图标会原样保存；原生任务学科下拉保留旧 Emoji 前缀但不输出新的语义键。
- 应用入口加载 `element-plus/theme-chalk/el-icon.css`，确保图标容器及 SVG 按指定尺寸渲染。
- 移除创建学科的主题色选择；新建学科默认色及工作区左下角学科图标底色统一为 Sage Green `#7D9372`，图标使用白色。
- 全局功能侧栏学科入口复用同一图标解析器，直接渲染语义线条 SVG；保留既有 Emoji 分支，底色统一为 Sage Green `#7D9372`。
- 2026-08-10：修复 PC 首页 (Dashboard) 左侧栏及任务创建弹窗因未正确调用 `subjectIcon` 解析器而直接输出语义键文本 (如 `math`, `laptop`) 的渲染 Bug，并将 Dashboard 加入静态脚本契约 (`check-subject-icons`) 校验范围。当前该检查及 `npm.cmd run build` 已重新验证通过。
- 2026-08-10：重构 PC 首页 (Dashboard) 左侧栏“全部”选项的展现样式，将其从普通列表项提升为独立的全局视图卡片 (Global View Card)，以清晰区分全局知识流与专属学科空间。
- 2026-08-10：统一 PC 任务编排中心 (Timeline) 的日/周视图切换按钮样式，对齐首页 (Dashboard) 的全圆角胶囊无 Emoji 设计，保持极简禅意视觉语言的一致性。
- 2026-08-10：全局替换了 16 个默认学科语义线条图标 (`src/utils/subjectIcon.ts`)，使用更加柔和、抽象的图形 (如 `Feather`, `Orbit`, `Telescope`, `Infinity`) 替代了此前较为硬核的组件；同时，将全局左侧栏 (`AppSidebar.vue`) 的核心导航图标也由 Element Plus 默认图标替换为了一致的 Lucide 线条图标，并特意采用 `LayoutDashboard` (首页看盘) 和 `Compass` (学科大厅) 以避免视觉上的重复感，全面提升了界面的“极简禅意”美感。
- 2026-08-10：在排期页 (`Timeline/index.vue`) 完整复刻了首页 (`Dashboard/index.vue`) 的现代卡片化新建任务弹窗，包括网格化胶囊学科选择器与可拖拽交互的长条形专注时长配置条，统一了全局核心交互体验与视觉范式。

### PC 学科工作区原型（2026-07-13）

- 文件选择改为中栏 Markdown 总结；文件项移除右侧操作按钮。
- 大纲改为“AI 梳理”与圆形“+”顶栏，支持左栏内联新增、章节排序与限定在章节内的小节排序；当前不持久化。
- 2026-07-14：右侧 AI 伴读完整复刻手机端的渐变四芒星、脉冲星环、消息气泡、三点输入中状态和纯文本胶囊输入；保留现有 `streamFetch`、模型菜单与学科/文件上下文，不提供附件或麦克风入口，清空和发送均有可读标签。
- 2026-07-26：优化知识块阅读弹窗和手动录入界面的排版与样式。阅读界面采用统一的 Markdown 渲染样式 (`.summary-markdown`)，优化了标题字号和时间标签的微标展现；编辑界面的输入框应用了标准 `.styled-textarea`，支持 Focus 光晕和高度自适应。
- 2026-07-26：重构大厅（Home）页面的“手动录入知识块”、“创建学习任务”、“登记本地材料”弹窗，将其样式统一为全局标准的 `.modal-container`，实现与其他核心业务弹窗的视觉及动效一致性。
- 2026-07-26：重构工作区（Workspace）的“手动录入知识块”和“创建学习任务”弹窗，将其样式统一为全局标准的 `.modal-container`。
- 2026-07-26：优化排期布局页（Timeline）顶栏，去掉多余的“认知负荷”数据展示，并将待排期、已完成和专注时长这三个核心指标收纳为紧凑的药丸标签（Pill Tags）放置在标题与操作按钮之间，大幅提升了屏幕空间利用率与信息层级。
- 2026-08-11：在 PC 端完成专注时钟（Pomodoro）功能移植。移除了移动端的 `rpx` 与 `<view>` 标签限制并重写了样式；针对 PC 宽屏引入了大圆角胶囊状的任务选择器；移除了全局顶栏多余的占位图标；在大纲编排模式中新增了章节与小节的删除功能，进一步完善核心流程。

### 已确认的近期工作树变化（待随当前功能分支验证）

- PC 前端继续向 Zen Minimalist 体系对齐，使用禅白、鼠尾草绿和发丝边框。
- PC 首页移除知识流上方统计/热力图卡片及副标题。
- PC 依赖中 Tauri JavaScript API、CLI 与 Rust Tauri 统一为 `2.11.1`。
- Mobile / Tablet 的近期布局、图表、设置与 workspace 改动已在日期快照保留。

这些条目来自当前工作树和历史记录；只有任务 9 中命令实际通过后，才会追加本轮验证结果。

## 2026-07-10

### 已确认

- `d752b62`：项目目录名称从 StudyCore 更新为 Auralis。

## 2026-07-09

### 已确认

- `78c46de`：完成 Tablet workspace 重构、统一头部高度并修复侧栏收起 CSS。

## 2026-07-08

### 已确认

- `2babfbe`：默认隐藏 Tablet 手写笔记入口。
- `e2a09a9`：新增 Tablet 手写笔记本地存储。
- `4db4347`：新增 Tablet 手写专项计划。
- `dcdd5db`：整合 v3 Tablet 工作流。

## 2026-06-10

### 已确认

- `7384215`：重设计复习、统计、设置和个人资料页面为极简线性风格。

## [Unreleased]

- Task 16 runtime verification (2026-09-09): backend-only Docker rebuild/recreate passed Compose config, health/readiness, and ingestion worker flag checks; PostgreSQL/MinIO volumes were preserved. Read-only inspection found existing READY data without historical SOURCE UPDATE events (expected for pre-fix rows). The scheduled Sync retention `TransactionRequiredException` is fixed in code with focused H2 regression evidence; rebuilt-backend scheduled logs and end-to-end authenticated reingest/upload plus PC GUI retry remain pending.

- Server Task 14: Source ingestion state and safe failure diagnostic changes now emit existing `SOURCE/UPDATE` sync events exactly once per actual persisted change; identical repeated calls are no-ops, and ParsedDocument complete routes locked `INDEXING` through the same transactional service path.
- Removed Task `colorOverride`/legacy `color` from Server, V21 schema, OpenAPI, PC, and Mobile/Tablet projections; Task visuals now use semantic CSS tokens while KnowledgeBlock colors remain unchanged.
- PC Task 15: after an explicit ParsedDocument `ACCEPTED` complete, request one coalesced background `read` sync; callback failures are best-effort and cannot alter accepted upload or local readiness transitions.
- PC Overview trigger diagnostics (2026-09-10): added allowlisted `[FILE_OVERVIEW_TRIGGER]` lifecycle events with trigger values supplied by the TypeScript closed type and known call sites (`SOURCE_READY`, `RESUME_BOOTSTRAP`, `RESUME_ONLINE`, `RESUME_SYNC`, `JOB_CHANGED`, `MANUAL_RETRY`), without claiming runtime validation. A service-owned request ID is created only for a generation attempt that reaches `runFile` and reused in `X-Overview-Request-Id`; preflight/skip events may omit it. Existing in-memory coalescing and generation behavior are unchanged; no retry, cache, Provider, Server, or timeout behavior changed. Automated PC checks passed (focused 16/16, full 310/310, type-check and static check), while real Tauri/provider attribution and business acceptance remain pending; Server same-key in-progress idempotency and the PC/Server timeout mismatch remain open.

## 维护规则

- 只记录已发生并可追溯到提交、命令或人工记录的变化。
- 未来任务进入 `planning/`，未关闭风险进入 `current/IssuesAndReview.md`。
- 历史命令结果必须标明日期，不能写成当前验证。
- 重大发布应记录版本、环境、构建结果、迁移、回滚点和人工验收设备。

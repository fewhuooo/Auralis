# Spring Boot 后端模块

更新时间：2026-11-15

文档状态：现行模块说明

权威范围：后端代码结构、领域边界、执行流程、开发命令与限制

事实来源：`Auralis-Server/pom.xml`、`src/main/java/com/auralis/app/`、`src/main/resources/` 与现行契约

## 阅读入口与证据边界

本页描述当前源码，不以源码存在推断部署或业务验收。接口字段与错误语义见 [API](../contracts/API.md)、[Chat 协议](../contracts/chat-runtime-api.md)，表与迁移见 [数据库契约](../contracts/Database.md)，部署和测试进度见 [当前状态](../current/Status.md)，未关闭项见 [问题登记](../current/IssuesAndReview.md)。

逐轮实现、测试数量和部署记录已完整保存在[整理前记录](../archive/maintenance-2026-11-13/Backend.md)，仅供历史追溯。维护本页时更新对应主题，不再把日期流水插到标题与元数据之间。

## 技术与目录

- Java 21、Spring Boot 4.1.0、Spring Modulith 2.1.0，Maven Wrapper 为仓库构建入口。
- Spring MVC、Bean Validation、Actuator、springdoc OpenAPI；生产 profile 关闭 API docs 和 Swagger UI。
- Spring Data JPA 与 Flyway；迁移目录当前包含 V1–V45。PostgreSQL 17 / pgvector 使用 JDBC 向量仓储，向量维度为 1024；测试环境另有 H2 路径。
- JSON 使用 Jackson 3 `tools.jackson`；注解允许 `com.fasterxml.jackson.annotation`，命名空间守卫防止其它 Jackson 2 类型混入。
- 公共配置关闭 JPA Open-in-View；服务层完成事务与 DTO 映射。

基础包为 `com.auralis.app`：

| 模块 | 当前职责 |
| --- | --- |
| `identity` | 用户、密码、JWT、refresh session、设备、账号删除 |
| `subject` | 学科及所属资源边界 |
| `source` | Source、Asset、MinIO、ParsedDocument 接收及保留清理 |
| `knowledge` | 知识块、来源关联及正文变更事件 |
| `task` | 任务、排期冲突、原子换位和插入顺延 |
| `relation` | 跨对象关系、端点校验和删除事件处理 |
| `review` | 学习与复习生命周期、回执、状态及有效历史 |
| `focus` | 用户范围幂等专注会话 |
| `sync` | mutation、change log、cursor、snapshot、墓碑和保留清理 |
| `ai` | Provider/BYOK、Chat、用量治理、摄入/检索、Overview |
| `stats` | 用户及学科统计读取模型 |
| `realtime` | 一次性 WebSocket ticket 与用户级变更通知 |
| `shared` | 错误、认证主体、领域事件和最小公共设施 |

业务模块通过根包公开 API、DTO 与 `shared.domain` 事件协作，不跨模块引用 `internal` 持久化实现。`source` 通过自身的 `ParsedDocumentIngestionPort` 调用摄入能力，避免反向依赖 `ai` 内部服务。Relation 监听删除事件，不反向依赖资源实现。

## 身份、事务与数据隔离

所有业务读写按当前用户隔离，版本、活动状态与墓碑在服务边界校验。列表采用契约规定的不透明 keyset cursor；不要用未限定 owner 的实体查询替代。

登录设备列表以活动 refresh session 为边界；同一用户/设备重复登录替换旧活动会话。提供登录、刷新、退出、改密、会话管理与异步账号注销。账号删除作业暂未提供进度查询接口。

注册要求邮箱验证码，登录可使用用户名或已验证邮箱，忘记密码可通过已验证邮箱重置。验证码按用途隔离，带有有效期及发送和校验次数限制。已登录改密在用户行锁内递增凭据代次，并撤销其他设备的刷新会话。当前设备可自动续期。邮箱重置撤销全部刷新会话。两种操作都会使已签发的访问凭证在后续认证时失效。发信使用 [SMTP 配置](../operations/Deployment.md#2026-11-15-验证码邮件配置)。

涉及学科所属资源的写事务先收集 Subject ID，去重并按 UUID 顺序经 `SubjectLockCoordinator` 加锁，再锁具体资源，最后重新读取和校验归属、活动状态、版本及关系端点。首次未加锁读取仅用于发现锁集合，不直接据其值写入。

Task 排期写入先锁所属 User，再按 Subject → Task 顺序加锁，覆盖冲突查询和整个写入事务。换位、插入顺延按稳定 Task 顺序获取所需锁；不得持有 Task/Subject 锁后反向获取 User 锁。Source/Asset 路径遵循 Subject → Source → Asset；保留清理锁 Asset 后不反向锁 Subject/Source。

Subject 删除在同一事务内通过公开事件级联软删除活动 Source、知识块、Task 和关联 Relation，并产生版本及 DELETE 事件。恢复 Subject 不恢复子资源。Source 单独删除保留知识块；知识块来源和学科均未改变时可继续编辑，创建、改绑和移科仍要求来源活动有效。

## 任务、复习与同步

Task 使用半开时间区间检查同用户活动排期；首尾相接允许，空时长按 30 分钟处理。排期或有效时长/截止时间改变、恢复及重新进入活动排期时要求结束时间不晚于截止时间。普通元信息修改不批量修正历史越界排期。

换位和插入顺延是整组原子事务，完成任务固定、取消任务不占时间；窗口、版本、截止时间或第三方冲突导致整组拒绝。PC 经 Sync 的 `SCHEDULE_SWAP` / `SCHEDULE_INSERTION` 承载同一领域语义，change log 仍发布各 Task 的普通 UPDATE。请求源 ID/baseVersion 必须与 mutation 外层一致。

REST 与 Sync 共用 Task 排期事务。周列跨天以 `placementMode: "STRICT"` 指定窗口内的半小时起点，只检查和写入源任务。空槽顺延、卡片主体放置和换位按各自规则执行。普通插入将窗口外和零分钟任务排除出顺延集合，最后按完整区间检查冲突。试测周列跨天需使用支持该模式的后端。字段规则见 [API 契约](../contracts/API.md)。

Sync 按用户、设备、mutation ID 和指纹幂等处理，批次逐条执行。预期业务异常回滚该条领域事务后，在独立事务保存 CONFLICT/REJECTED 回执并继续；未知基础设施错误继续传播。创建主键冲突不得覆盖已有资源。pull/snapshot 保留用户独立高水位、墓碑与过期 cursor 重置语义；保留清理入口自身建立事务。

Review 使用独立生命周期命令、冻结回执和有效结果投影。owner、活动知识块、正文 hash、版本及因果目标共同约束写入；同块锁序为 Subject → KnowledgeBlock → ReviewState。正文变化失效对应学习进度；同正文元信息更新保留有效目标，移科保留已生效历史但清除旧因果 ID 和未确认初选。旧复习事件只作历史读取，不恢复退役写入接口。离线补传、首次学习判定和协议版本详见 API 契约。

`GET /api/reviews/lifecycle/history` 在只读 `REPEATABLE_READ` 事务中读取知识块、状态、命令和有效结果。另一事务提交核对时，本次响应仍以同一数据库快照构成。

Focus 通过稳定 session ID 在用户范围内幂等记录实际秒数及自然完成标记。Stats 按 owner 聚合，学科统计使用同一读取快照与 IANA 自然日，不通过多表 fanout 重复计数。

## 资料、对象存储与摄入

入库 worker 仍按学科、资料、任务的顺序锁定。资料或所属学科已删除时，旧任务按失效处理，结算任务自身的状态并释放队列。资料状态及恢复流程继续由现行 Source 契约控制。

Asset upload intent 使用用户范围 `clientImportId` 幂等键，并校验不可变元信息；complete 通过存储 HEAD、大小/MIME/hash 等边界验证。download-url 返回原始文件名和 MIME，Source 标题不作为文件格式依据。

FILE 等待客户端 Tauri 解析。ParsedDocument upload intent 绑定 owner、Source revision 和源 Asset SHA；complete 在 Source 锁内校验有界 gzip/JSON、顺序及 hash，首个有效 payload 胜出，同 payload 可幂等重放。源 SHA 不一致记录 REJECTED，不创建索引任务；历史 ACCEPTED 数据不在运行路径自动迁移。

worker 消费已接受的解析块并以 revision、job/generation、attempt 和有效 lease 校验写入。恢复处理中 FILE 时优先复用当前 revision 的 ACCEPTED 结果；恢复已领取任务时撤销旧租约并置回 PENDING，旧执行不得覆盖新状态。无可复用结果时轮换 revision 并返回 AWAITING_CLIENT。TEXT/URL 使用服务端解析摄入路径。

Source 删除为可恢复软删除。`AssetRetentionCleanupService` 按保留期锁定并复查引用，提交 ORPHANED 后才删除对象；失败保留状态供幂等重试，元数据保留审计。ParsedDocument 私有 payload 清理与元数据保留分别管理。具体字段、保留期和账号物理删除边界见数据库契约与 Runbook。

## Chat 与检索

Chat 协议 1 使用持久化 run/attempt、会话资料范围及私有工具证据。范围在会话绑定，attempt 冻结 owner、subject、READY Source 与 ingestion revision，工具调用前后复核，禁止模型通过参数扩大授权范围。

- 原生工具承担资料目录、搜索、摘录、已保存总览及展示组件；展示必须经真实 `tool_calls`，正文中的参数 JSON 不替代工具调用。
- `list_sources` 最多每页 20 条；`search.sourceIds` 只能缩窄当前范围。目录读取不等于全文已读，返回真实来源/片段身份。
- `read_source_overview` 只读当前有效的正式 SOURCE Markdown，不生成内容、不读候选。分页绑定 `overviewVersion`，缺失返回 UNAVAILABLE，版本变更返回 STALE；复用来源锁的读取入口使用可加锁事务。
- 每轮问题与引用合成同一模型 USER 上下文；重试回复与工具证据归原 run/轮次，重试旧问题不会引入后来的问题。
- `ChatEvidenceHistoryProjector` 仅压缩请求投影，保留原证据账本及工具调用/结果配对；受保护上下文不可删减。完整请求仍超限时在 Provider 派发和预留前拒绝。
- 默认及硬上限为 12 次迭代、20 次工具执行。最后允许轮进入无新工具收尾；模型/embedding 调用帽、Token、并发和 deadline 仍独立生效。
- Chat 的 MVC 执行器拒绝首次发送、点评或重试入队时，按会话、run、attempt 与 fence 结算尚未启动的尝试为 `FAILED / CHAT_ATTEMPT_NOT_DISPATCHED`，释放会话并返回现有 503。已提交的题卡答案仍可查看，点评可在原 run 重试。重放请求被拒绝时不会结算它查询的原尝试。
- 空 STOP 在剩余额度内最多补答一次；有效 READY 展示可独立完成，题卡沿其原子提交点结束。UNKNOWN 通过协议规定的显式用户操作终结。
- Provider 失败后未完成块在 finally 失效；断线不阻断终态持久化和槽位释放，持久化错误仍须传播。

检索统一使用平台 Embedding 与当前来源范围。1024 维模型改变时须核对已有向量空间，不因配置可连接就认定召回质量通过。Suggestions 仍需与真实模型/RAG 质量验收分开看待。

## Overview

当前实现位于 `OverviewGenerationService`、`OverviewMarkdownPipeline`、`OverviewBatchPipeline`、`OverviewBudgetPlanner` 和 `OverviewResultService`。

生成采用 CLEAN → OUTLINE → SUMMARY。FILE 与学科直接入口支持 ALL / OUTLINE / SUMMARY；TEXT/URL 保持对应 SUMMARY 边界。清理产生保留位置映射的输入副本，大纲和总结为独立 Markdown 分项。SUMMARY 内部仍生成大纲但只交付总结。

先检查完整请求与最低输出预留，整篇不能装入时自动分批清理、归并大纲、回读原文提炼并统一总结；后续阶段超限可复用已完成阶段。批次共享原任务的 Gateway、账本、期限和来源复核，无法继续缩减仍明确失败。单行边界、模型容量和实际请求大小共同限制批次，不把分批解释成无限容量。

输入规划和 Gateway 使用同一 `unicode-category-v1` 估算；阶段输出按材料规模估最低需求并增加 50% 目标裕量，再受模型、上下文、可选上限和平台余额限制。Provider `max_tokens` 与预留一致，实际用量由账本结算。平台容量来自生成模型配置，BYOK 容量需精确匹配 Provider/端点/模型；未知容量拒绝派发。

公开内容为 schemaVersion 2 的 `outlineMarkdown` / `summaryMarkdown`。生成与正式保存分离；保存继续校验 inputDescriptor、来源 revision/fingerprint、baseVersion CAS 和 clientWriteId 回执。旧 schemaVersion 1 内容保留但不自动转换，替换须遵循现行 ALL/CAS 契约。旧 INDEX/ROUTE/分节 WRITER、preview/publication 和 candidateInput 不属于现行生成或接口。

后台作业仍保留创建、查询、候选、控制、租约及生命周期清理能力；不能由直接入口通过推断后台学科输入路径已验收，相关未关闭问题见问题登记。历史表及安全保留清理不等于兼容旧生成。

## 配置、安全与诊断

生产环境从环境变量读取数据库、MinIO、JWT、BYOK 加密、平台生成/Embedding 与 CORS；关键配置缺失时 fail-fast。local/test 的临时 JWT 行为不替代生产密钥管理。

Provider 请求须遵守允许主机、网络地址/重定向限制、响应大小、取消和期限。用量账本区分预留、已结算和未知派发，不通过重新生成、删除缓存或重复请求绕过计量。Embedding 是否计入窗口额度与其技术调用/并发保护分别判断。

普通日志仅记录稳定错误码、身份关联、状态、数量及长度等诊断信息，禁止输出凭据、完整 prompt、文件正文或模型全文。Overview trace 与 Chat raw-content capture 是显式启用的本机诊断，可能包含资料内容，导出不随账号/Source 删除自动清理；用后关闭并按 Runbook 处理。

Realtime 使用 `POST /api/realtime/ticket` 获取一次性 ticket，再连接 `/ws/events?ticket=...`；通知触发客户端按正式接口刷新，不替代同步数据通道。

## 开发与验证

在 `Auralis-Server` 目录执行：

```powershell
.\mvnw.cmd -B -ntp test
.\mvnw.cmd -B -ntp -DskipTests package
```

从仓库根目录运行 `scripts/check-openapi.ps1` 检查运行时 OpenAPI 与双端 SDK 漂移；仓库已有对应 GitHub workflow。H2/MockMvc、PostgreSQL/MinIO Testcontainers、受控 Provider 网络测试各自证明不同边界；容器、TLS fixture 等前置条件与真实 Provider/GUI 验收不能互相替代。

本次仅整理文档，未执行以上测试、构建、部署或服务重启。最新实际命令结果由 current 文档维护，不在本页重复测试数量与镜像状态。

## 回写规则

模块实现变化更新本页对应主题；接口和数据变化分别更新 API / Database；配置拓扑变化更新基础设施与运维；验证结果及未关闭风险更新 current，已发生的交付变化进入 Changelog。

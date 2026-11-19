# Overview 全流程测试追踪实施计划

日期：2026-10-23（Asia/Hong_Kong）

状态：采集工具实现、自动验证、Compose 合成配置检查与唯一审查完成。2026-10-23 已捕获两次真实资料生成尝试，均为 FAILED，captureComplete=true 且 droppedEvents=0；没有成功生成证据，M6 尚未验收。详情见 `D:/Temp/auralis-overview-traces/d34f634f-6ad3-45e4-9aed-292b13f9ddbf/`。

## 目标与范围

为 M6 人工实测提供可导出的单次 Overview 执行记录。覆盖现行 Source/Subject、同步 SSE 与后台 job 的生成链路；不扩展 Chat、OCR、Ingestion 或前端界面。业务输入为已解析原文，不能将该快照称为原始文件或 OCR 全流程记录。

主流程仅发送追踪事件，独立模块负责有界队列、写盘、汇总、保留期和失败处理。不改变 Provider 次数、预算、缓存身份、重试、事务、发布或任务状态。默认关闭；关闭时不创建目录、线程或采集正文。测试配置显式开启后，默认元数据采集；完整正文另设开关。

## 主模型实施定案

1. 在独立 `ai.diagnostics` 包建立追踪接口、不可变事件和文件采集实现。业务通过安全适配器发事件；不向模块传递 ResolvedSettings、HTTP 请求、认证头、API key 或 endpoint。只传 UUID、允许的模型/阶段信息、内容和用量快照。
2. 每次应用执行建立独立 run ID，关联 owner、request、generation、job、节点、step、attempt、reservation/task ID（取得时才记录）。复用、等待和重放与真实 Provider 调用明确区分，未知身份不猜测。
3. 事件覆盖请求与原文输入快照、索引、metadata/路由、写作计划、逐小节校验输出、缓存复用、Provider 请求前的实际 system/user prompt、返回的原始文本及 finish reason/usage、校验或修复、最终装配及成功/失败/取消。原始响应指 ProviderPort 返回的 content，不宣称是 HTTP 原始 envelope、网络流或模型私有推理过程。未派发或未返回的内容明确缺失。
4. 模块不参与业务决策。用量来自已有响应/账本快照，不重新结算，不调用模型；记录 Provider 等待耗时与实际可获得阶段耗时，未知数据保留 null。普通应用日志继续原有不输出正文规则。
5. 文件按 owner UUID/run UUID 隔离，使用固定文件名 `events.ndjson`、`summary.json`、`report.md`。报告展示阶段时间线、输入/输出、缓存来源、模型调用、usage、失败及采集完整性；Markdown 将模型正文作为文本/代码块呈现，不能执行或自动加载外部资源。
6. 默认队列 64、单事件上限 1 MiB、单 run 上限 32 MiB、目录总量上限 256 MiB、保留 24 小时；均为采集限制，不是 AI 业务预算。异步单写者、有界内存和存储；饱和/超限/写盘失败仅令追踪不完整，生成照常。截断必须记录原长度及原因，不将截断文本标为完整；丢失终止事件也应能由采集器给出不完整结果。关闭采集不得生成完整 prompt/响应的额外序列化副本。
7. 本地文件是显式测试导出，不是可供业务恢复或再次生成的来源，不添加数据库表或 HTTP 读取接口。完整内容导出仅用于用户主动开启的受控实测；文件按采集保留期清理，和业务数据库删除事务独立。文档明确文件保留位置、关闭与删除方法；不将其描述为已受 M5 数据库级联删除管理。
8. 提供可选 `docker-compose.overview-trace.yml`，仅供用户显式组合启动 backend：启用追踪、正文采集及自适应链路，将容器采集目录 bind 到 D 盘。默认 Compose 不增加挂载、不启用追踪。提供 JVM/IDE 的对应环境变量。不得读取实际 .env、更改凭据、部署容器或调用真实 Provider。

## 执行与验收

- Luna high 负责实现与命令验证；一个 Luna high reviewer 在阶段末只读审查 correctness/并发/数据/安全。主模型负责设计及必要裁决。
- 保护当前 dirty 工作树，保存本轮文件前像和最终哈希；证据、构建、临时文件均在 `D:/Temp/auralis-overview-trace-20261023`。
- 全部实现完成后统一检查：关闭路径无副作用；开启后成功、修复、缓存、失败均有正确关联的文件；饱和/超限/无写权限/采集异常不改变业务结果；输入或输出含特殊字符不会破坏报告；不把凭据对象序列化；同步和后台任务均可观察。使用合成 Provider 证明开关不增加调用次数，且输入与输出对照正确。
- 配置/Compose 变化按 BeforeCoding 运行相关检查、完整后端测试和打包；复用已核对的隔离 PostgreSQL、合成 TLS 与文档夹具布局，严禁把缺少测试环境当产品错误。Compose 验证使用合成环境而非真实 .env。
- 同步 README 登记、Backend、Infrastructure、Status、Issues、Changelog 和现行总览计划必要状态。没有公共 wire 或数据库结构变化，不生成 SDK 或 migration。
- 交接给用户：准确启动命令、D 盘目录、如何判定记录完整、如何关闭/清理，以及第一份真实资料的建议操作。本轮只完成追踪模块和合成验证；真实模型、GUI、内容质量仍由用户实测与 M6 后续验收决定。

## 本轮实现与验证记录（2026-10-23）

- 默认关闭及三个环境变量：`AURALIS_OVERVIEW_TRACE_ENABLED=false`、`AURALIS_OVERVIEW_TRACE_CAPTURE_CONTENT=false`、`AURALIS_OVERVIEW_TRACE_DIRECTORY=/app/overview-traces`。backend-only overlay 显式开启追踪、完整正文和 adaptive generation，将目录映射到 `D:/Temp/auralis-overview-traces`；基础 Compose 未增挂载/默认开关。运行步骤：在仓库根目录执行 `docker compose -f docker-compose.yml -f docker-compose.overview-trace.yml up -d --build backend`；在现有 UI 用一份已解析资料生成 Overview，核对 `report.md` 中 `captureComplete: true`、`droppedEvents: 0` 和事件时间线，再查看 NDJSON 详细事件/捕获正文。
- 路径为 `D:\Temp\auralis-overview-traces\<owner UUID>\<run UUID>\`，包含 `events.ndjson`、`summary.json` 和 `report.md`。报告正文会以惰性文本 fence 显示 opt-in 捕获内容；summary 提供 counts/status；NDJSON 包含完整结构化字段。记录从后端已解析输入快照开始，不包含原始文件、OCR、HTTP envelope 或模型私有推理。usage 只反映已返回响应中的观察值，持久化用量账本为权威；cache reuse 不计 provider call。
- 有界规则：field 350 KiB UTF-8，event 行 <1 MiB，队列 64；事件数据预算 31 MiB/run 与 248 MiB/root，总 run/root 硬限 32/256 MiB。截断标记原 UTF-8 长度及不完整；饱和/写盘失败使追踪不完整但不改变生成。collector root-preparation 时按 24 小时阈值检查并删除有所有权标记的旧 run；这不是常驻清理服务。关闭 collector 后文件保留，需人工检查/清理；Source/account 删除不会清理本地导出，也不把导出当业务恢复输入。
- 验证：focused Maven `OverviewTraceFileCollectorTests,OverviewTraceConfigurationTests,AiOverviewServiceTests` 87/87，exit 0；统一全量 Maven 813/813，0 failures/errors/skips，exit 0；`-DskipTests package` exit 0。合成 Compose 配置验证 exit 0，证明 base tracing off/no mount、overlay tracing/content/adaptive on/D: bind；未启动服务、未读取真实 `.env`。唯一只读 reviewer B0/I0/O0。命令与日志：`D:/Temp/auralis-overview-trace-20261023/validation/focused-overview-trace-v2.log`、`backend-full-suite.log`、`package-skiptests.log`；Compose 脚本与 synthetic env 在 `delivery/`。
- frozen backend 10-path manifest：`D:/Temp/auralis-overview-trace-20261023/postimage-manifest.json`；交付前像及当前 `.env.example`/overlay 哈希在 `D:/Temp/auralis-overview-trace-20261023/delivery/`。评审及完整交接：`review.md`、`delivery/final-handoff.md`。没有 API/database/OpenAPI/SDK 变化。未部署、未调用真实 Provider、未完成人工 GUI/内容质量验收。
- 实测结束后恢复 backend：先从实际 `.env`/IDE 配置移除本轮显式添加的追踪变量，再在仓库根目录执行 `docker compose -f docker-compose.yml up -d --no-deps --force-recreate backend`（无需 rebuild）。若不再需要导出，人工检查后只清理 `D:\Temp\auralis-overview-traces`。M6 真实资料及内容质量验收仍待用户执行。

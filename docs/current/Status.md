# Auralis 当前状态

更新时间：2026-08-20

文档状态：现行状态快照

权威范围：当前代码存在情况、本轮命令证据、人工验收边界与下一步

事实来源：模块/契约文档、当前代码盘点、部署测试前主任务清单与本轮验证命令

## 证据规则

- **代码确认**仅说明实现存在。
- **本轮命令**只记录本任务实际执行结果。
- **历史命令**可在 Changelog 追溯，不能当作本轮结果。
- **人工验收**必须单列设备、GUI 或外部服务边界。

## 首个候选版本范围基线（R0-01）

目标端已冻结为 PC Web、PC Tauri、Mobile H5、微信小程序和 Tablet 主工作区。候选主流程为注册登录、资料上传、学习工作区、同步、复习、统计和 AI 对话；Tablet 手写笔记云同步、微信之外的其它小程序平台、旧 Server 数据自动迁移、跨实例事件 Broker、AI 自动执行领域写操作不进入本候选版本。

验收责任按角色分工：产品/业务验收负责范围和用户结果，后端/基础设施负责 API、数据、安全与真实依赖证据，PC/Tauri 与 Mobile/Tablet 负责人负责端侧主流程，QA/发布负责证据汇总和门禁判断。当前仅完成范围基线写入，未因此把任何模块或风险状态改写为“已验收”。详细验收结果见[产品需求](../project/ProductRequirements.md)和[部署测试前主任务清单](../planning/PreDeploymentReadinessTasks.md)。

## 状态总览

截至 2026-08-17，PC、Mobile、Tablet 的基础页面与主要视觉/布局重构已基本收敛到当前代码。这里的“基本收敛”只表示代码整理和可执行检查达到当前阶段，不等同于生产构建、GUI、真机、后端联调或业务验收全部完成。

后端方向已确定为在 `Auralis-Server` 原路径进行绿地重写，完整方案见[后端绿地重写计划](../plans/backend-greenfield-rewrite-plan.md)。阶段 0 已完成仓库外备份、旧 Server 可恢复替换、Boot 4.1 / Modulith 骨架、基础错误协议、健康检查、OpenAPI 和模块边界测试；阶段 1 已实现 Identity V1，阶段 2A 已实现 Subject、KnowledgeBlock、Task 核心领域闭环，阶段 2B 已构建 Source、Asset、Relation 闭环，阶段 3/4 已构建 Sync、Review、Stats、Realtime，阶段 5/R1-03 已完成 pgvector 核心检索验证，R1-04 已完成 AI 参数透传、幂等重试、引用事件和回调式流式基线，R2 已写入真实依赖测试与 Compose 基线，R3 已固定 OpenAPI artifact 和 PC/Mobile SDK 类型边界。当前仍为“已构建待验收”，因为 Docker Engine、真实 MinIO/Provider、全量 PostgreSQL、双设备、浏览器 WebSocket、前端联调和人工验收未完成。

| 模块 | 当前状态 | 代码证据 | 命令证据 | 人工验收 | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 文档体系 | 已构建待验收 | 新分类体系、Agent 规则、归档快照、旧路径切换已完成 | 2026-08-12：`docs/README.md` 相对链接检查 33 项通过；2026-07-10 的元数据、根目录、旧路径扫描仍保留为历史证据 | 无 | 随后续代码变化持续回写 |
| PC Web | 已构建待验收 | 8 条正式路由、页面、Store、API 客户端存在；近期完成学科工作区、线条图标、统一弹窗、全局导航、Timeline 与 Pomodoro 基础整理，保留手机同源 AI 伴读视觉 | 2026-08-12：`npm.cmd run check:subject-icons`、`npm.cmd run check:subject-workspace` 与 `npm.cmd run build` 通过（`vue-tsc -b && vite build`，3477 modules）；Vite 提示部分 chunk 超过 500 kB | 工作区文件总结/大纲编排、AI 动效、Pomodoro、窄栏/深色主题与新旧学科图标显示 | 恢复守卫并验收主流程，评估 bundle 拆分 |
| PC Tauri | 已构建待验收 | Tauri 2.11.1、SQL 插件配置存在 | 本轮未执行 GUI | Windows GUI、权限、安装包 | 手工桌面验收 |
| Mobile H5 | 已构建待验收 | 手机页面、Store、本地服务与构建脚本存在 | 2026-08-12：`npm.cmd run build:h5` 通过；保留动态/静态 import 与 Sass legacy API 警告 | 手机浏览器、弱网、输入法 | H5 真机走查与警告治理 |
| 微信小程序 | 已构建待验收 | `MP-WEIXIN` 条件编译排除 Tablet 页面 | 2026-08-12：`npm.cmd run build:mp-weixin` 通过；保留 Sass legacy API 警告 | 开发者工具、真机、合法域名 | 微信走查 |
| Tablet | 已构建待验收 | 9 个注册页、TabletLayout、多栏 workspace、可配置热力图存在；首页当前以 `weeks=5` 使用自适应日历布局 | 2026-08-12：`node scripts\check-tablet-sidebar-transition.mjs` 通过（120ms 早于 160ms） | 横屏触控、布局、手写 | 平板真机走查 |
| Tablet 手写笔记 | 已隐藏保留 | `tablet_notes`、NoteDocument、仓库与 feature flag 存在 | 本轮未执行专项脚本 | 笔迹、导入导出、长时间书写 | 核心链路后再开启 |
| 后端绿地重写 | 已构建待验收 | `Auralis-Server` 已替换为 `com.auralis.app` 的 Java 21 / Boot 4.1 / Modulith 2.1；Identity V1、Subject/KnowledgeBlock/Task V2、Source/Asset/Relation V3、Sync V4/V6、Review/Stats/Realtime V5、Task V7、AI/RAG V8–V13、版本/墓碑/恢复、Auth 与核心 API 存在；R1-06 工具链、R2 Compose/Testcontainers、R3 OpenAPI/SDK 代码基线已写入 | 2026-08-17：R1-03 11/11、R1-04 16/16、R1-05 16/16、R1-06 配置定向 6/6；默认系统 Maven 与 Wrapper `clean test` 均为 135 通过、0 失败/错误/跳过，PostgreSQL/pgvector 与 MinIO 容器测试已自动执行；真实 PostgreSQL 17.11 + pgvector 迁移/检索 2/2、MinIO presigned 资产链路 1/1；Compose config/build/up 通过，db、MinIO、backend readiness 和 frontend 首页均返回成功；Provider stub 2/2；R3 OpenAPI artifact 运行时对比 3/3、PC build、Mobile type-check 与 H5 build、固定生成器重生成比对通过；G3 契约迁移前置门禁通过 | PostgreSQL 并发 cursor/约束专项、MinIO 异常路径、真实 Provider chat/embedding、Source 文件链路、双设备、浏览器 WebSocket、前端新契约迁移、GUI/真机和外部 AI | 完成 R2 剩余专项和真实 Provider smoke，再进入 R4 前端新契约迁移；G3 通过不等于真实 Provider 或前后端业务联调完成 |
| Auth | 已构建待验收 | 新 `com.auralis.app` 已有 BCrypt、15 分钟 access JWT、30 天 refresh rotation、会话撤销、owner-scoped sessions 和 Problem Details 安全错误 | 2026-08-12：IdentityService 5 个测试、AuthController 6 个 MockMvc 测试；test profile HTTP smoke 注册 201、登录 200、token pair 存在 | 三端登录/刷新/退出、人工业务验收和生产 JWT/数据库环境 | 接入后续业务模块并完成 PostgreSQL/前端联调 |
| 块与任务 | 已构建待验收 | CRUD、实体、端侧副本与同步路径存在 | 2026-07-10：`mvn test` 生命周期通过，无业务断言 | 跨用户、删除、多端一致性 | 统一删除并测试 |
| Asset | 已构建待验收 | V3 Asset 元数据、上传 intent、完成时对象 HEAD/stat 校验、READY 下载 URL、用户归属和失败状态持久化存在；MinIO 适配器按配置启用 | 2026-08-17：真实 MinIO presigned PUT/HEAD/GET/open/delete 集成 1/1 通过；测试 profile 仍使用可控存储端口 | MinIO 异常路径、上传回调和部署凭据验证 | 完成对象不存在、大小/hash 不符、超时、重复完成和生产凭据验收 |
| Source | 已构建待验收 | V3 Source FILE/TEXT/URL CRUD、版本/墓碑/恢复、reingest PENDING、Subject/Asset 归属校验和 KnowledgeBlock Source 关联存在 | 2026-08-13：阶段 2B Repository/Service/Controller 与全量 42 测试通过 | ingestion worker、Tika/文本解析、真实文件链路和三端业务验收 | 先完成真实对象/解析边界，再进入同步接入 |
| Relation | 已构建待验收 | V3 Relation 端点类型/用户/活动状态校验、RELATED_TO 无向去重、版本/墓碑/恢复和 shared 删除事件级联存在 | 2026-08-13：阶段 2B Repository/Service/Controller 与全量 42 测试通过 | PostgreSQL 约束、跨模块人工业务链路和同步一致性 | 与删除/同步阶段一起完成外部验收 |
| Sync | 已构建待验收 | V4/V6 change log/inbound mutation、高水位 cursor、原子 push/pull/snapshot、包含墓碑的快照、设备校验、幂等、版本冲突、30天自动清理与指标存在 | 2026-08-17：R1-05 定向套件 16/16 通过，覆盖清理后 cursor reset、高水位延续、清理指标、并发 cursor/并发重放；全量 126 通过、1 个 opt-in PostgreSQL 测试跳过 | 双设备、断网重连、过期 cursor 的真实调度、PostgreSQL 并发游标 | 完成真实数据库/双设备验收 |
| Review | 已构建待验收 | V5 ReviewState/ReviewEvent/参数集、FSRS-lite、due/event/history、完整状态快照、SKIP 与事件幂等存在 | 2026-08-14：Review 定向 6/6 通过，全量回归通过，覆盖后续复习后重放原始状态 | 多端复习主流程和调度业务验收 | 接入前端并进行真实用户流程验收 |
| Stats | 已构建待验收 | V5/V7 强类型 overview/weekly 查询，所有统计按 userId 过滤，任务按 completed_at 统计 | 2026-08-14：Stats/迁移定向 4/4 通过，全量回归通过，覆盖后续编辑不改变完成日统计 | 真实数据量、跨用户和前端展示验收 | PostgreSQL 查询计划和前端联调 |
| Realtime | 已构建待验收 | V5 一次性 hash-only ticket、设备绑定、WebSocket handler 和提交后用户级事件桥存在 | 2026-08-14：Realtime 定向 3/3 通过，全量回归通过，覆盖已提交领域写入产生 SYNC_CHANGED | 浏览器 WebSocket、跨实例、断线重连和前端消费 | 加入真实 WebSocket 客户端与部署拓扑验收 |
| AI / RAG | 已构建待验收 | chat、回调式 SSE、clientRequestId 幂等、citation、ingest、PostgreSQL pgvector/HNSW、generation 原子切换、用户隔离 retrieval 和 MinIO 端口存在；Conversation 已加入版本/并发序号控制 | 2026-08-17：R1-03 定向 11/11、R1-04 定向 16/16、R1-05 定向 16/16、系统 Maven `-Ppostgres-it verify` 135 通过且 1 个非 PostgreSQL opt-in 测试跳过；真实 PostgreSQL 17.11 + pgvector 集成 2/2，覆盖 vector 写入、HNSW、隔离、失败回滚、Source 删除过滤和 V8 升级回填；真实 MinIO 资产集成 1/1 | 真实模型/网络、MinIO 异常路径、前端 SSE 消费、引用质量 | 完成 Provider/MinIO 异常路径/前端联调和 AI 业务验收 |
| 基础设施 | 已构建待验收 | Compose 已切换 PostgreSQL/pgvector、MinIO、bucket init、backend healthcheck，固定镜像并移除 Redis/Milvus/etcd 主依赖 | 2026-08-17：`docker compose --env-file .env.example config --quiet`、backend/frontend build、db/MinIO/backend/frontend up 通过；db/MinIO/backend 为 healthy，MinIO init 退出 0，frontend HTTP 首页 200，backend readiness `UP` | 真实 volume、备份/恢复、监控、生产 secret、MinIO 异常路径和真实 Provider | 完成备份/恢复、监控、生产 secret、异常路径与 Provider smoke，再进入部署演练 |

块与任务、Sync/WebSocket、AI/RAG 和基础设施行描述的是替换前能力盘点或后续目标；Auth、Asset、Source、Relation 行已由新实现和测试证据更新。旧 Server 实现已移出工作树并保留在仓库外备份中，其余新后端能力必须按绿地计划重新实现并产生新的测试和验收证据。

## 当前里程碑判断

当前优先级不是继续扩展页面数量或修补旧 Server，而是在已完成阶段 0 骨架上按已批准计划闭环以下主线：

```text
保护工作树并备份旧 Server（阶段 0 已完成）
→ 新工程骨架与 Identity（阶段 0 骨架、阶段 1 Identity 已构建待验收）
→ Subject / Source / Knowledge / Task / Relation
→ 离线同步、墓碑与冲突（阶段 3 已构建待验收）
→ Review / Stats / Realtime（阶段 4 已构建待验收）
→ AI / RAG
→ 综合测试与 OpenAPI/SDK 交付（R3 已完成本地契约门禁）
→ 三端另行迁移新契约（R4）
```

Tablet 手写、更多 AI 体验和更多平台构建在主线稳定后推进。

## 既有验证证据

2026-07-10 已实际完成：

- `Auralis-PC`: `npm.cmd run build` 通过。
- `Auralis-Mobile`: `npm.cmd run build:h5` 通过，保留非阻断动态/静态 import 与 Sass legacy API 警告。
- `Auralis-Mobile`: `npm.cmd run build:mp-weixin` 通过，产物可由微信开发者工具导入。
- `Auralis-Mobile`: `node scripts\check-tablet-sidebar-transition.mjs` 通过。
- 旧 `Auralis-Server`: 2026-07-10 `mvn test` 通过；日志明确为 `No sources to compile`，该结果仅是替换前历史证据。
- 文档相对链接、元数据、根目录和旧路径扫描通过。

2026-08-20 R4 Task 5 已实际完成：

- `Auralis-PC` 新增 Subject、KnowledgeBlock、Task、Source、Relation、Review、Stats typed API wrapper 和 SSE 解析器；Asset 已迁移到 upload-intent → 对象存储 PUT → complete → download-url，AI 客户端已移除旧 chat/ingest 路径并接入 `/api/ai/messages/stream`。
- `Auralis-PC`：`npm.cmd run test:r4-pc` 29/29 通过；`npm.cmd run type-check` 通过；`npm.cmd run build` 通过，保留既有大 chunk 非阻断警告。
- `npm.cmd run check:r4-pc` 仍因后续 Task 6–8 尚未迁移的 `useSyncApi`、`useSubjectStore`、`useSyncStore`、Home 和 SubjectWorkspace 旧实现而失败；本任务 wrapper/API 文件未命中旧 asset/AI 路径。真实后端、对象存储、Provider、GUI 和前后端业务联调未验证。

这些结果不替代 GUI、真机、真实基础设施或外部 AI 服务验收。

2026-08-20 R4 Task 6 已完成代码与定向自动测试：

- `Auralis-PC/src/services/localSchema.ts`、`localRepository.ts` 和 `legacyLocalData.ts` 建立了用户/设备隔离的 SQLite v2 schema、浏览器 namespace fallback、tombstone、版本冲突、pending mutation、cursor、snapshot reset 和旧 SQLite 行备份边界；`localDb.ts` 仅保留未迁移 Store 的兼容 facade。
- `npm.cmd run test:r4-pc` 35/35 通过，其中包含临时内存 SQLite 和独立 localStorage namespace 测试；`npm.cmd run type-check` 通过。
- Task 7/8 尚未将正式 Sync/Subject/Task/Workspace Store 全部切换到 repository，`npm.cmd run check:r4-pc` 的既有旧 cursor/response/AI endpoint 命中仍保持开放；真实 Tauri plugin、旧数据库升级、GUI 迁移选择、后端/对象存储/Provider 和前后端业务联调仍未验证。

## 本轮验证结论（2026-08-13）

- PC：`npm.cmd run check:subject-icons` 与 `npm.cmd run check:subject-workspace` 通过。
- PC：移除弃用 `baseUrl` 并删除 `AppHeader.vue` 未使用的 `ElMessage` 导入后，`npm.cmd run build` 通过；Vite 提示部分 chunk 超过 500 kB。
- Mobile：`npm.cmd run build:h5` 通过，仍有动态/静态 import 与 Sass legacy API 非阻断警告。
- 微信小程序：`npm.cmd run build:mp-weixin` 通过，仍有 Sass legacy API 非阻断警告。
- Tablet：`node scripts\check-tablet-sidebar-transition.mjs` 通过，120ms 指示器在 160ms 路由重载前落位。
- 后端阶段 0：仓库外备份可读取，`Auralis-Server` 目标路径审计通过；新 Server `mvnw.cmd -B -ntp clean test` 退出码 0，Surefire 报告 4 份、测试 5 个全通过。
- 后端阶段 0：真实进程启动后 readiness/liveness 返回 HTTP 200 和 `UP`，`/v3/api-docs` 返回 HTTP 200、标题 `Auralis API`，Swagger UI 返回 HTTP 200；smoke 进程已停止且 8080 已释放。
- 后端阶段 1：`Auralis-Server\\mvnw.cmd -B -ntp clean test` 退出码 0，19 个测试全部通过；覆盖 V1 schema、Repository owner isolation、IdentityService、AuthController、Problem Details 和 Modulith 边界。
- 后端阶段 1：使用 test profile + H2 test-scope classpath 的临时 HTTP smoke 中，health liveness/OpenAPI 返回 200，register 返回 201、login 返回 200、token pair 存在；临时 Java PID 已停止且 18080 已释放。
- 后端阶段 2A：`Auralis-Server\\mvnw.cmd -B -ntp clean test` 退出码 0，31 个测试全部通过；覆盖 V2 schema、Subject/KnowledgeBlock/Task Repository owner isolation、默认 Subject、版本冲突、软删除/恢复、核心 MockMvc 和 Modulith named interface。
- 后端阶段 2B：`Auralis-Server\\mvnw.cmd -B -ntp clean test` 退出码 0，42 个测试全部通过；覆盖 V3 schema、Asset/Source/Relation Repository owner isolation、Source/Asset/Relation 服务规则、对象 HEAD 校验、核心 MockMvc 和 Modulith named interface。
- 后端阶段 3/4 审核修复：`Auralis-Server\\mvnw.cmd -B -ntp clean test` 退出码 0，27 个测试类、69 个测试用例全部通过；覆盖 V4/V5/V6/V7 schema、Sync 原子幂等/高水位/push/pull/并发重放/墓碑 snapshot、Review 完整状态回放、Stats completed_at、Realtime 提交后事件和架构测试。
- 后端 R1-05：`Auralis-Server\\mvnw.cmd -B -ntp clean test` 退出码 0，126 个测试通过、0 失败/错误，1 个 opt-in PostgreSQL 测试跳过；定向 `R1ConcurrencyTests`、`R1PaginationTests`、`SyncServiceTests`、`AiSchemaTests` 共 16/16 通过，ArchitectureTests 通过。覆盖 V13、Conversation baseVersion、消息写锁序号、五类核心列表 keyset cursor、Sync 定时清理配置/指标和过期 cursor reset。
- 后端阶段 3/4/R1-05 仍未证明全量 PostgreSQL/pgvector 并发、Docker、真实 MinIO、Source ingestion worker、双设备断网恢复、生产定时清理、浏览器 WebSocket/跨实例 broker、前端联调、Tauri GUI、微信开发者工具或真机验收。

## 阶段 5 AI/RAG 当前状态（2026-08-17）

- 代码实现：已完成 V8–V13、AI 配置、BYOK AES-GCM、Provider/embedding 端口、DeepSeek/OpenAI-compatible/SiliconFlow 适配器、HTTPS Provider allowlist、全 DNS 地址校验与固定连接、来源 URL 重定向复核/固定连接、Source ingestion job 的 claim-next/lease/自动轮询/有限重试、解析/切块/embedding、PostgreSQL pgvector/HNSW 用户隔离 retrieval、H2 JSON fallback、generation 原子切换、Conversation/Message clientRequestId 幂等回放、会话版本/消息并发序号、citation、回调式 SSE 生命周期和 Suggestions 基线。
- 自动测试：R1-03 定向测试 11/11、R1-04 定向 AI 流式/Provider/Controller 测试 16/16、R1-05 定向套件 16/16 通过；`PgVectorIntegrationTests` 使用 PostgreSQL 17.11 + pgvector 容器通过 1/1，覆盖 Flyway V1→V11、HNSW、vector 写入、用户隔离、失败回滚和 Source 删除过滤；`mvn -B -ntp clean test` 通过 126 个测试，失败/错误 0，默认跳过 1 个需显式 PostgreSQL 参数启用的集成测试。
- 已修复问题：默认 local profile 缺少 `auralis.ai.encryption-key` 会使 AI 未启用的上下文也启动失败；已加入仅 local profile 使用的 32 字节开发占位值，生产仍要求 `AURALIS_AI_ENCRYPTION_KEY`，并保留空值拒绝。
- 未完成验收：全量 PostgreSQL/Compose、MinIO、外部 DeepSeek/SiliconFlow/BYOK Provider 网络/证书/限流、真实 token 流式、生产网络策略与 secret rotation、性能、前端联调和人工业务验收。受控安全测试和隔离 pgvector 容器不替代完整生产网络专项。
- 实现边界：chunk generation 原子切换和 Source 删除过滤已完成；ingestion lease fencing、Suggestions 真实 LLM/citations、文件解析边界（当前仅文本型 MIME）和端到端 AI 质量仍未完成并继续登记为未关闭风险。

以上结果只证明对应命令的执行范围，不替代 GUI、真机、真实基础设施或外部 AI 服务验收。

- 后端 R1-06/G1：默认 Surefire 自动启用 PostgreSQL/MinIO Testcontainers；系统 Maven 与 Wrapper `clean test` 均为 135 个测试通过、0 失败/错误/跳过。覆盖普通 Maven 仓库路径、全局 `open-in-view=false`、prod springdoc 关闭、local OpenAPI 保留、H2 2.2.224 和 Mockito Java agent。
- 后端 R2：已新增 Compose 固定镜像/健康检查/secret fail-fast、Java 21 非 root Dockerfile、PostgreSQL Testcontainers clean/upgrade 输入、MinIO presigned 链路、Provider stub 错误矩阵和对象孤儿核对脚本；Compose config/build/up/health、真实 PostgreSQL/MinIO 主链路均通过，异常专项和真实 Provider smoke 仍开放。
- 后端 R3/G3：`OpenApiArtifactTests` 导出并比较 `docs/contracts/openapi/auralis-openapi.json`；`scripts/check-openapi.ps1` 运行时比较通过（3/3），使用 `openapi-typescript@7.13.0` 对 PC/Mobile schema 重生成比对通过；PC `npm run build`、Mobile `npm run type-check` 和 H5 `npm run build:h5` 均通过。Mobile 通过将 TypeScript 固定为 5.3.3 与现有 `vue-tsc@1.8.27` 对齐；G3 契约迁移前置门禁已通过，但该结果不等于真实 Provider smoke 或前后端业务联调。

## 人工验收边界

- Tauri 权限、GUI、插件与安装包。
- 微信开发者工具、真机、域名和平台限制。
- H5/原生 App/Harmony 等目标设备。
- Tablet 触控、手写、双指缩放、文件批注和长时间书写。
- 真实 PostgreSQL、Redis、MinIO、Milvus 和外部 AI 提供商全链路。

## 阅读与回写

- 风险、优先级、关闭条件：[问题和审查](IssuesAndReview.md)
- 未来任务：[计划入口](../planning/README.md)
- 构建/部署：[部署指南](../operations/Deployment.md)
- 已发生变化：[Changelog](../release/Changelog.md)

# Auralis 当前问题与审查登记

更新时间：2026-08-16

文档状态：现行风险登记

权威范围：尚未关闭的工程风险、证据、影响、处理动作和关闭条件

事实来源：当前代码、配置、模块/契约文档与本轮验证结果

## 使用规则

- 只登记未关闭问题；已确认完成的变化进入 Changelog。
- 每项必须可追溯到代码、配置、命令或人工观察。
- 关闭问题必须写出新证据，禁止仅因代码存在而关闭。
- 优先级：P0 为安全/数据不可逆，P1 为主流程或发布阻断，P2 为重要体验或维护风险。

## 首个候选版本范围基线（R0-01）

- **目标端**：PC Web、PC Tauri、Mobile H5、微信小程序、Tablet 主工作区。
- **主流程**：注册登录、资料上传、学习工作区、同步、复习、统计、AI 对话。
- **范围外**：Tablet 手写笔记云同步、微信之外的其它小程序平台、旧 Server 数据自动迁移、跨实例事件 Broker、AI 自动执行领域写操作。
- **责任角色**：产品/业务验收、后端/基础设施、PC/Tauri、Mobile/Tablet、QA/发布。
- **证据口径**：范围冻结不等于功能验收；代码、自动测试、真实依赖联调和 GUI/真机证据继续分别登记，既有 P1/P2 风险不因本基线关闭。

主流程的逐项验收结果以[产品需求](../project/ProductRequirements.md)为准；本节只登记范围和证据边界，不替代风险项的关闭条件。

## P1 风险

| ID | 问题 | 证据 | 影响 | 处理动作 | 关闭条件 | 领域 |
| --- | --- | --- | --- | --- | --- | --- |
| P1-Backend-Contract-Cutover | 新后端保留 `/api` 前缀但不兼容旧 DTO、状态码和行为，三端仍依赖旧契约 | `docs/contracts/API.md`、`docs/contracts/ObjectModelMatrix.md`；阶段 1 仅实现 Auth，核心业务仍未迁移 | 新后端启动后，旧前端不能直接完成登录、同步、资产、AI 等主流程 | 先稳定业务 OpenAPI 和对象矩阵，再独立生成 SDK、迁移本地模型并逐端联调 | PC、Mobile、Tablet 目标流程全部使用新生成契约且联调证据齐全 | Frontend/Backend |
| P1-Backend-Docker-Gate | 阶段 1 仍未执行 Docker、PostgreSQL/pgvector、MinIO 和 Testcontainers 验收 | 阶段 1 `clean test` 和 H2 HTTP smoke 通过；计划明确 H2 不替代 PostgreSQL/容器证据 | JVM/H2 测试和启动 smoke 不能证明真实迁移、对象存储、向量检索和 Compose 可用 | 完成业务代码阶段后启动 Docker Desktop，运行 Testcontainers 与最小 Compose 验证 | PostgreSQL/pgvector、MinIO、Server 的集成与健康检查均有退出码 0 证据 | Backend/Infra |
| P1-Auth-Guard | PC 登录守卫临时直接 `next()` | `Auralis-PC/src/router/index.ts` | 未登录可打开受保护页面 | 恢复 `useAuthStore` 守卫并测试所有跳转 | 未登录、登录、刷新、退出自动测试/人工证据齐全 | PC/Auth |
| P1-Test-Coverage | 新后端已覆盖 Identity/Auth、阶段2A核心领域、阶段2B Source/Asset/Relation 和阶段3/4主要服务路径；真实基础设施、多设备和浏览器客户端仍缺业务回归保护 | 2026-08-14 `Auralis-Server/src/test` 的 27 个测试类执行 69 个真实测试，失败/错误/跳过均为 0 | H2/JPA/MockMvc 通过不等于 PostgreSQL、双设备断网恢复和真实 WebSocket 可用 | 增加 Testcontainers、双设备和浏览器 WebSocket 回归 | CI 或本地门禁执行到真实基础设施与目标客户端断言并保留报告 | Backend |
| P1-Asset-Verification | Asset 上传完成的服务端对象实体验证已构建，但真实 MinIO 链路尚未验收 | V3 Asset、`AssetStoragePort`、测试存储和配置开关已实现；2026-08-13 服务/Controller 与全量 42 测试通过，覆盖大小/MIME/SHA 校验和失败状态 | 未完成真实 MinIO 验证前，部署配置或 presigned PUT/GET 差异仍可能导致上传失败或错误绑定 | 启动 MinIO 完成 presigned PUT/GET、HEAD/stat、metadata 和异常路径验证 | 真实 MinIO、凭据、bucket policy 和部署配置测试通过 | Asset/Infrastructure |

## P2 风险

| ID | 问题 | 证据 | 影响 | 处理动作 | 关闭条件 | 领域 |
| --- | --- | --- | --- | --- | --- | --- |
| P2-Mobile-BaseUrl | Mobile Auth/WS 使用 localhost/127.0.0.1 | Mobile Store/API | 真机无法访问开发服务 | 使用平台环境配置 | 模拟器、真机、生产地址均验证 | Mobile |
| P2-Mobile-Contract | Mobile 多数页面依赖端侧数据，未接完整 Server API | 页面 API 映射 | 多端功能完成度易被误判 | 标注 local-only，逐步定义契约 | 主流程页面来源与同步一致 | Mobile |
| P2-Tablet-Validation | Tablet 多栏和手写缺真机验证 | 页面、feature flag、脚本 | 触控和长时间使用风险 | 设备走查与专项记录 | 指定设备清单全通过 | Tablet |
| P2-PC-Subject-Icon-Validation | PC 新建学科线条图标与已有 Emoji 的实际显示未做 GUI 验收 | `src/utils/subjectIcon.ts`、`AppSidebar.vue`；2026-07-14 `check:subject-icons` 与生产构建通过 | 线条图标的尺寸、对齐、统一 Sage Green 底色或选择态可能异常，已有 Emoji 可能在个别入口未保持原样 | 在浏览器或 Tauri 中检查既有学科及新建学科，覆盖全局功能侧栏 | 新建线条图标与统一底色、既有 Emoji、空值/未知语义键三类均显示正确且可操作 | PC |
| P2-PC-Workspace-Prototype-Validation | 学科大纲编排与文件总结目前仅为静态交互原型，且 PC AI 伴读尚未进行 GUI 验收 | `SubjectWorkspace/index.vue`；2026-07-14 `check:subject-workspace` 与生产构建通过 | 刷新后编排丢失；浏览器中的拖拽手势、三栏尺寸、AI 星环/三点动效、窄栏换行和深色主题仍可能有问题 | 确认持久化模型后接入 Store；在浏览器/Tauri 验收文件选择、章节排序、小节边界与 AI 右栏 | 指定原型范围获确认或持久化完成，且 GUI 验收记录通过 | PC |
| P2-PC-Frontend-Refactor-Validation | PC 近期页面重构（Pomodoro、Timeline、Asset、Dashboard 与全局导航）尚未完成跨页面 GUI 验收 | 最近 PC 提交与 `Auralis-PC/src/views/`、`src/components/`；2026-08-12 构建与两个静态契约检查通过，但未做 GUI | 宽屏布局、任务计时、弹窗、删除操作和导航图标可能存在只在浏览器/Tauri 中暴露的回归 | 按正式路由逐页走查主要任务和失败/空状态 | PC Web 构建通过，且 Dashboard、Subject、Asset、Timeline、Pomodoro、Profile 主流程 GUI 记录通过 | PC |
| P2-PC-Bundle-Size | PC 生产构建存在大 chunk 警告 | 2026-08-12 `npm.cmd run build`：`Asset-B7Y2PPYt.js` 约 595 kB，Vite 提示部分 chunk 超过 500 kB | 首屏加载和缓存粒度可能受影响 | 评估 Asset、Element Plus 等依赖的拆包与懒加载策略 | 关键入口 chunk 达到团队阈值，或形成明确的警告接受记录 | PC/Performance |
| P2-Migration-Strategy | Flyway V1 已针对干净 H2 schema 验证，但 PostgreSQL 升级/回滚门禁尚未执行 | `V1__identity_schema.sql`、IdentitySchemaTests、2026-08-12 clean test；未运行 PostgreSQL/Testcontainers | 生产升级/回滚和 PostgreSQL 方言行为仍不可预测 | 在容器集成阶段执行 PostgreSQL clean/migrate/validate、备份恢复和迁移演练 | 干净 PostgreSQL 升级、回滚和备份恢复均有证据 | Data/Infra |
| P2-Infra-Readiness | 无 CI、监控、告警、正式备份演练 | 仓库现状 | 发布与恢复门禁不足 | 建流水线、指标、备份恢复 | 发布演练和告警测试 | Infra |
| P2-Mobile-Build-Warning | Mobile H5/微信构建有动态/静态 import 与 Sass legacy API 警告 | 2026-08-12 `build:h5` 与 `build:mp-weixin` 输出 | 未来打包与 Sass 升级可能出现行为或兼容性问题 | 明确 `useSyncStore` 的加载策略，升级/替换 Sass legacy API | 构建无对应警告，或有记录的接受决定 | Mobile |

| P1-Phase5-External-Infra | 阶段 5 只在 H2/JPA/Stub Provider 上验证，尚未通过 PostgreSQL/pgvector/HNSW、MinIO 和真实模型服务 | 2026-08-16 clean test：92/92；V8/V9 与 Provider 代码存在，但无真实外部环境证据 | 方言、vector 索引、对象读取、超时、限流和真实模型响应可能与基线不同 | 增加 PostgreSQL/pgvector/Testcontainers、MinIO 和 WireMock/受控 Provider 集成门禁 | migration、JPA validate、embedding 检索、对象链路和错误路径在真实依赖上通过 |
| P1-Phase5-Ingestion-Cutover | ingestion 已具备数据库锁 claim-next、lease 过期恢复、自动轮询和有限重试，但仍没有 generation/旧新索引原子切换或 lease fencing | `IngestionJobService`、`IngestionWorkerScheduler`、`IngestionWorker`；新增 claim/lease/retry/terminal 单测，完整测试当前 108/108；`SourceChunkService.replace` 仍删除旧 chunks 后保存新 chunks | 重试、进程中断或 lease 过期并发可能造成短暂空索引、旧新版本边界不清或 stale worker 写入 | 引入 generation/lease fencing、临时索引和成功后原子切换，补数据库崩溃/并发/重复执行测试 | 重复执行、崩溃恢复和读路径均证明不会暴露不完整索引 |
| P1-Phase5-Provider-Security | BYOK/URL 已具备 HTTPS allowlist、IPv4/IPv6 SSRF、全地址 DNS 固定、重定向关闭/复核、超时和响应体上限；真实网络、限流、审计和密钥轮换仍未验收 | `ProviderEndpointPolicy`、`ProviderHttpClient`、`PinnedSslSocketFactory`、`UrlSourceFetcher`；2026-08-16 `mvn -B -ntp clean test` 103/103，含受控重定向/DNS/超时/key 脱敏测试 | 真实 DNS/证书/代理环境仍可能暴露连接兼容性、网络策略或 provider 异常映射问题 | 补受控真实网络、DNS rebinding、redirect、超时、429/5xx、日志脱敏、审计和密钥轮换专项 | 安全专项测试和生产 secret/网络策略记录通过 |
| P1-Phase5-Suggestion-Quality | Suggestions 是确定性基线，未接入真实 LLM、RAG citation 或质量评估 | `SuggestionService` owner check 与 controller 测试通过，返回 citations 当前为空 | 产品可能误认为已具备 AI 总结/提问质量 | 接入受控模型与 RetrievalService，增加 schema、引用正确性、提示注入和人工质量验收 | 质量指标、引用回链和人工样例验收记录完成 |
| P2-Phase5-Stream-Granularity | SSE API 已实现，但当前 completion adapter 只产生单个 delta，未完成上游 token 级流 | `AiStreamingTests`、`AiStreamingControllerTests` 通过；适配器使用 completion REST | UI 流式体验和取消/背压语义不等同真实 token stream | 接入真实 SSE provider 或明确 completion-only 产品契约，补断线/取消/超时测试 | 真实 provider 的增量、断线、取消和错误事件契约通过 |

## 审查结论

- 2026-08-12：后端阶段 0 已完成仓库外备份、精确路径替换、Boot 4.1 / Modulith 骨架、12 个模块边界、Problem Details、健康检查、OpenAPI 和基础测试。
- 2026-08-12：后端阶段 1 Identity 已实现 Flyway V1、User/Device/RefreshSession、密码/JWT、refresh rotation/replay 撤销、Auth 路由和 owner-scoped session 操作；19 个自动测试和 H2 test profile HTTP smoke 通过。PostgreSQL、Docker 和人工业务验收仍开放为风险。
- 2026-08-13：后端阶段 2B 已实现 Flyway V3、Source/Asset/Relation、KnowledgeBlock Source 关联、对象存储端口、核心 MockMvc 和 42 个全量自动测试；PostgreSQL、Docker、真实 MinIO、ingestion worker 和人工业务验收仍开放为风险。
- 2026-08-14：针对审核发现的同步原子性、游标高水位、墓碑快照、实时提交后事件、Review 历史回放和任务完成时间统计完成修复；新增 V6/V7 迁移，`clean test` 通过 27 个测试类、69 个 H2/JPA/MockMvc 自动测试，并增加并发 cursor 与并发 mutation 重放回归。原 P1-Sync-Cursor-Concurrency 与 P1-Sync-Snapshot-Tombstone 已关闭；PostgreSQL、双设备、浏览器 WebSocket 和前端联调仍由 P1-Test-Coverage/基础设施风险覆盖。
- 新后端继续使用 `/api` 只代表保留总前缀，不代表旧客户端兼容。OpenAPI 和对象差异矩阵完成前，禁止声明前后端已可直接联调。
- 旧 Server 的 AuthInterceptor、WebSocket 握手/心跳审计、资产用户前缀校验只属于替换前盘点，已移至仓库外备份；新实现不得将其视为已迁移能力。
- PC、Mobile/Tablet 近期视觉与布局改动属于用户工作树成果，文档已在归档快照保留；最终构建结果须与当前代码一起记录。
- 不应依据 StudyCore 归档恢复旧目录、旧路由或旧任务。
- 2026-07-10：PC Web、Mobile H5、微信小程序、Tablet 侧栏检查和旧 Server Maven 生命周期均通过；该旧 Server 结果已被阶段 0 替换，新后端另有独立测试证据。
- 2026-07-14：PC 新建学科改为语义线条图标，已有 Emoji 不迁移；`npm.cmd run check:subject-icons` 与 `npm.cmd run build` 通过，仍需 P2-PC-Subject-Icon-Validation 所列 GUI 验收。
- 2026-07-14：PC 学科工作区右侧 AI 伴读已复刻手机端四芒星、星环、气泡、三点输入中状态和纯文本胶囊输入；`npm.cmd run check:subject-workspace` 与 `npm.cmd run build` 通过，仍需 P2-PC-Workspace-Prototype-Validation 所列 GUI 验收。
- 2026-08-11：PC 已加入 Pomodoro 页面并继续收敛 Dashboard、Timeline、Asset、全局导航和工作区交互；Mobile/Tablet 已更新平板热力图自适应布局与品牌渐变，代码变化已记录在 Changelog，仍需当前构建与 GUI/真机验收。
- 2026-08-12：PC 学科图标、工作区静态契约检查和生产构建均通过；移除弃用 `baseUrl`、删除未使用 `ElMessage` 导入后，Vite 仍提示大 chunk。Mobile H5、微信小程序构建与 Tablet 侧栏检查通过，保留既有非阻断警告，未进行 GUI/真机验收。
- 2026-08-16：阶段 5 AI/RAG 后端基线完成，V8/V9、BYOK、ingestion/retrieval、Conversation、SSE 和 Suggestions 已实现；完整 clean test 通过 92 个测试。上述 P1 风险保持开放，未声称 PostgreSQL/pgvector、MinIO、真实 Provider、性能、安全专项或前端业务验收通过。

## 推荐关闭顺序

1. 完成阶段 1–5 的 PostgreSQL/Testcontainers/Docker/MinIO/Provider 外部门禁，验证 Sync、Source ingestion 和 pgvector 检索在真实依赖上成立。
2. 补齐 ingestion generation/崩溃恢复、BYOK/SSRF/限流专项和真实 SSE 取消/断线契约。
3. 完成真实 Suggestions/RAG citations 的质量与提示注入验收、双设备断网恢复和真实 WebSocket。
4. 完成前端新契约联调，生成客户端后进行 PC/Mobile/Tablet 主流程和人工业务验收。
5. 完成 Docker/基础设施集成、CI、备份、监控和发布演练。

## 更新方式

新增风险时必须提供 ID、优先级、证据、影响、动作和关闭条件。关闭后移除该表并在 Changelog 记录可确认变化；历史讨论不留在本文件。

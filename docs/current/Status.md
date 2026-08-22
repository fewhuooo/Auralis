# Auralis 当前状态

更新时间：2026-08-22

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

截至 2026-08-20，PC 的 R4 客户端迁移已推进到联调前门禁：正式 PC Store/页面已切换到当前 typed API 和用户/设备隔离 repository，AI SSE、Vite 代理和 Tauri 最小权限边界已有代码与自动检查证据。这里的“联调前门禁”只表示客户端代码和本地检查达到当前阶段，不等同于生产构建、GUI、真机、后端联调或业务验收全部完成。

后端方向已确定为在 `Auralis-Server` 原路径进行绿地重写，完整方案见[后端绿地重写计划](../plans/backend-greenfield-rewrite-plan.md)。阶段 0 已完成仓库外备份、旧 Server 可恢复替换、Boot 4.1 / Modulith 骨架、基础错误协议、健康检查、OpenAPI 和模块边界测试；阶段 1 已实现 Identity V1，阶段 2A 已实现 Subject、KnowledgeBlock、Task 核心领域闭环，阶段 2B 已构建 Source、Asset、Relation 闭环，阶段 3/4 已构建 Sync、Review、Stats、Realtime，阶段 5/R1 已完成 pgvector、AI 请求并发保留、会话恢复键和回调式流式基线，R2 已执行真实依赖 Testcontainers，R3 已固定 OpenAPI artifact 和 PC/Mobile SDK 类型边界。当前仍为“已构建待验收”，因为真实 Provider、MinIO 异常路径、双设备、浏览器 WebSocket、前端联调和人工验收未完成。

2026-08-20 本轮修复完成后，PC 不再持久化或附加 BYOK 明文，核心资源离线 CREATE 使用稳定 outbox 身份，Chat 保留本地会话/消息请求 ID 并在上线后顺序恢复；SSE 401 使用共享的单次刷新且复用原请求 ID。服务端 V14 增加会话恢复键与 assistant→USER 精确关联，并将 Provider I/O 移出事务。`test:r4-pc` 58/58、type-check、`check:r4-pc` 59 文件、Web build、OpenAPI artifact/PC+Mobile 类型比对、服务端专项 12/12 和含 PostgreSQL/pgvector/MinIO 容器的 `clean test` 137/137 均通过；这仍不等同于真实 Provider 或浏览器业务验收。

2026-08-20：正式 `/profile` 已内嵌 BYOK 配置卡片，支持读取脱敏状态、按 Provider 切换、更新 Base URL 与一次性提交 API Key；保存成功立即清空输入框。该页面的静态安全回归、type-check 与 Web build 已通过，但浏览器连接真实 Server 的读取、保存和错误态仍待人工联调。

2026-08-20：Identity 会话列表已改为每用户/设备一条活动 refresh session 视图；重复登录同一设备会撤销旧 refresh session，避免 Profile 出现重复设备和误撤销旧记录。定向 AuthControllerTests 7/7 与 Docker Testcontainers 全量 `mvn -B -ntp test` 138/138 通过。撤销仍不会令已签发 access JWT 瞬时失效，当前 15 分钟有效期结束前的远端请求阻断属于后续鉴权架构取舍，不写成已完成的即时踢下线。

2026-08-21：Mobile/微信共享主路径已切到当前 Auth、Sync/Realtime、Asset、Review、Stats 与 AI 契约；Mobile Home/Profile 移除演示日程和固定统计，手写页移除伪 OCR/知识抽取，Tablet Workspace 总结改用真实 AI SSE，Dashboard/Review/Stats 也已使用 Stats/Review 服务端契约并移除随机统计和本地结果伪写。本地数据使用 userId/deviceId 独立 namespace，Pomodoro 计数同样按 namespace 隔离，旧全局库按用户授权一次性清除。`check:r4-mobile` 扫描 62 个生产文件、协议测试 20/20、Tablet 逻辑测试、type-check、H5 与微信构建通过；真实服务、微信合法域名、开发者工具、双设备和真机仍未验收。

2026-08-21：AI 运行时配置改为服务端 env 默认 Provider + 用户 BYOK 覆盖：`AURALIS_AI_DEFAULT_PROVIDER` 决定未指定 Provider 的聊天请求，`DEEPSEEK_API_KEY`/`OPENAI_API_KEY`/`SILICONFLOW_API_KEY` 仅在服务端运行时作为 fallback，不写入用户表或 API 响应；BYOK 仍按 userId/provider 加密保存。Compose 显式透传 SiliconFlow Base URL、聊天模型和 `BAAI/bge-m3` embedding 模型；Provider DNS 混合解析只固定公网地址。已修复 Java 21 `HttpsURLConnection` 调用固定地址 TLS Socket 无参 `createSocket()` 时在连接前失败的问题；真实 Java Provider 链路调用 SiliconFlow `BAAI/bge-m3` 返回 1 条 embedding，全量后端测试 148/148 通过，重建后的 Compose backend 健康。PC 浏览器完整对话仍待人工验收。

2026-08-21：补强 AI 后端运行日志：请求开始/校验/Provider 选择、env/BYOK 来源、Embedding/检索、Chat 流式、上游 HTTP JSON/SSE、成功/中断/失败均输出安全事件名、模型/host、状态、数量和耗时；不输出 API Key、Authorization、完整 prompt、模型回复或响应体。新增日志脱敏与失败阶段回归，AI 定向 26/26 通过。

2026-08-22：PC 资产库任务编辑移除认知负荷按钮，改为 30 分钟步进的预计用时控件；保存时通过 Task Store 写回标题、备注、截止日期和 `durationMinutes`。`test:r4-pc` 73/73、type-check 与 Web build 通过；浏览器实际编辑、刷新后持久化仍待人工验收。

2026-08-22：修复 PC 时间轴日视图排期匹配：Task Store 使用半小时槽位承接 `scheduledAt`，时间轴保留已过去排期并对任务名称/详情应用删除线。`test:r4-pc` 74/74、type-check、静态检查和 Web build 通过；浏览器实际跨日、半点排期和拖拽走查仍待人工验收。

2026-08-22：PC 首页与独立时间轴统一为以当日为中心的 7 日滚动窗口，展示前后三天的真实日期并将当日置于中间；共享日期计算同时驱动日视图选择器、周视图列和任务分组。新增日期窗口/边界回归后 `test:r4-pc` 75/75、type-check 通过；浏览器跨月/跨周日期、拖拽和刷新后的真实服务状态仍待人工验收。

2026-08-22：修复 PC 时间轴拖拽与 30 分钟槽位错位：原生拖拽补齐 `dataTransfer` payload，Dashboard/Timeline 的任务高度按半小时槽位和间距计算，首页覆盖判断改为分钟精度，drop 操作等待排期写回并在 finally 清理拖拽状态；首页日期格改为只显示紧凑日期，顶栏显示完整星期/月日信息。`test:r4-pc` 77/77、type-check、静态检查和 Web build 通过；浏览器拖拽交换、跨槽位显示和窄栏视觉仍待人工验收。

2026-08-22：根据边界反馈，PC Dashboard/Timeline 日期窗口从“当日居中、前后三天”恢复为从当天开始的连续 7 日单周窗口；首页日期格改为只显示日数字，选中态使用固定圆形绿色背景，顶栏改为“时间轴 · X月”。单周窗口与 `dayCode` 排期语义一致，避免拖拽到窗口前几日后任务被写入下一周而不可见。`test:r4-pc`、type-check、静态检查和 Web build 仍需以本轮命令结果为准；浏览器拖拽和视觉走查仍待人工验收。

2026-08-22：按最新日期语义，PC Dashboard/Timeline 改为展示当前/所选日期所在的完整自然周（周日至周六），`isToday` 按真实日期匹配；首页日期数字上方增加 `Sun` 至 `Sat` 英文星期缩写，选中日期徽标保持约 36px 圆形绿色背景。自然周边界、日期标签和首页视觉回归需以本轮命令结果为准，浏览器跨周拖拽仍待人工验收。

2026-08-21：修复 PC 注册后的默认学科问题：注册不再自动创建“未分类” Subject，Subject 列表允许为空；历史 `defaultSubject=true` 记录可通过普通删除接口软删除。核心领域与资源归属回归 7/7 通过，PC SubjectHall 空状态和删除路径仍需浏览器人工验收。

2026-08-21：修复 PC 学科工作区 AI 回溯：进入或切换学科时清空当前消息并创建新的伴读会话，不再加载全局会话列表或恢复旧 `activeSessionId`；PC 回归测试 59/59、type-check 和 SubjectWorkspace 静态契约通过，浏览器真实 SSE 仍需人工验收。

2026-08-21：补齐 PC 个人空间登出入口：个人空间提供确认后的“退出登录”，Auth Store 在本地会话清理后将服务端异常交给 UI，失败仍跳转 `/login`；PC 回归测试 62/62、type-check 和 Web build 通过，浏览器手工点击验收仍待执行。

2026-08-21：修复 PC 学科大厅编辑无法保存：编辑弹层现在保留 Subject `version`，更新请求正确携带 `baseVersion`；新增版本契约回归，PC 回归测试 63/63、静态检查、图标契约、type-check 和 Web build 通过，浏览器真实编辑/刷新验收仍待执行。

2026-08-22：修复 PC 资产库任务来源：移除“全部任务”中的固定 Vue/Tauri 演示任务，改用 `useTaskStore.fetchTasks()` 加载当前用户任务，并填充全部任务及各学科任务目录；PC 回归测试 64/64、静态检查、图标/工作区契约、type-check 和 Web build 通过，浏览器资产库任务展示与状态切换仍待人工验收。
2026-08-22：完成 PC 任务视图逻辑收敛：排期队列仅保留有截止时间且未排期的未完成任务；时间轴限定今天起 7 个日历日并保留已完成排期；资产库任务按未分布/未完成/已完成分组并按截止时间排序；时间轴“导入任务”聚焦 `/asset?focus=unassigned-tasks`。`test:r4-pc` 73/73、type-check、`check:r4-pc`、学科图标/工作区契约和 Web build 通过；浏览器拖拽、宽屏布局和真实服务状态切换仍待人工验收。

低优先级待办：PC 注册/登录页需要补齐与服务端一致的客户端约束提示，并将 RFC Problem Details 的 `fieldErrors[]` 映射到具体输入框；后端 HTTP 400 校验仍是最终安全边界，详见 P2-PC-Auth-Validation-UX。

| 模块 | 当前状态 | 代码证据 | 命令证据 | 人工验收 | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 文档体系 | 已构建待验收 | 新分类体系、Agent 规则、归档快照、旧路径切换已完成 | 2026-08-12：`docs/README.md` 相对链接检查 33 项通过；2026-07-10 的元数据、根目录、旧路径扫描仍保留为历史证据 | 无 | 随后续代码变化持续回写 |
| PC Web | 已构建待验收 | 8 条正式路由、typed API Store、用户/设备隔离本地 repository、无明文 BYOK 的 AI SSE 控制器和离线会话恢复存在；正式页面已移除静态演示数据主路径，个人空间已有确认登出入口，学科编辑保留版本并提交 `baseVersion`，资产库任务来自 Task Store | 2026-08-22：`check:r4-pc` 扫描 59 个生产文件通过，`test:r4-pc` 64/64、type-check、Web build、Subject icon 和 Subject workspace 契约通过；Vite 仍提示 Asset chunk 约 594 kB 和无效动态 import | 浏览器主流程、资产库真实任务展示/状态切换、真实 API/SSE、学科编辑保存/刷新、登出成功/失败提示、会话撤销、AI 失败态、窄栏/深色主题和 GUI | 完成真实前后端联调、浏览器/Tauri GUI 验收，评估 bundle 拆分 |
| PC Tauri | 已构建待验收 | Tauri 2.11.1、SQL 插件配置存在 | 本轮未执行 GUI | Windows GUI、权限、安装包 | 手工桌面验收 |
| Mobile H5 | 已构建待验收 | Auth/Sync/Realtime/Asset/Review/Stats/AI 新契约、用户/设备隔离本地库与手机页面存在 | 2026-08-21：`check:r4-mobile` 62 文件、协议测试 20/20、type-check、H5 build 通过；保留 import 与 Sass 警告 | 真实服务、手机浏览器、弱网、输入法 | H5 联调与真机走查 |
| 微信小程序 | 已构建待验收 | `MP-WEIXIN` 排除 Tablet；环境强制 HTTPS/WSS；手机主路径共享新契约 | 2026-08-20：微信 build 通过 | AppID、开发者工具、真机、合法请求/WSS/upload/download 域名 | 配置平台域名并完成微信走查 |
| Tablet | 已构建待验收 | 9 个注册页、TabletLayout、多栏 workspace、共享 Auth/Sync/Asset/AI 边界；Dashboard/Review/Stats 已接 Stats/Review API；手写仍默认关闭 | 2026-08-21：`check:r4-mobile`、`test:tablet`、type-check、H5 build 通过 | 真实服务、横屏触控、键盘、缩放、前后台 | 完成 R4-07 平板真实服务与真机走查 |
| Tablet 手写笔记 | 已隐藏保留 | `tablet_notes`、NoteDocument、仓库与 feature flag 存在 | 本轮未执行专项脚本 | 笔迹、导入导出、长时间书写 | 核心链路后再开启 |
| 后端绿地重写 | 已构建待验收 | `Auralis-Server` 已替换为 `com.auralis.app` 的 Java 21 / Boot 4.1 / Modulith 2.1；Identity V1、Subject/KnowledgeBlock/Task V2、Source/Asset/Relation V3、Sync V4/V6、Review/Stats/Realtime V5、Task V7、AI/RAG V8–V14、版本/墓碑/恢复、Auth 与核心 API 存在 | 2026-08-21：默认 `mvn -B -ntp test` 148/148 通过、零失败/错误/跳过；Testcontainers 实际启动 PostgreSQL 17/pgvector clean/upgrade 与 MinIO；真实 Java Provider 链路调用 SiliconFlow `BAAI/bge-m3` embedding 通过；AI 日志定向 26/26 通过 | 真实 Provider chat、MinIO 异常路径、Source 文件链路、双设备、浏览器 WebSocket、GUI/真机和外部 AI 完整业务 | 完成目标客户端业务联调；自动门禁和单次 Provider smoke 不等于人工验收 |
| Auth | 已构建待验收 | 新 `com.auralis.app` 已有 BCrypt、15 分钟 access JWT、30 天 refresh rotation、会话撤销、owner-scoped sessions 和 Problem Details 安全错误 | 2026-08-12：IdentityService 5 个测试、AuthController 6 个 MockMvc 测试；test profile HTTP smoke 注册 201、登录 200、token pair 存在 | 三端登录/刷新/退出、人工业务验收和生产 JWT/数据库环境 | 接入后续业务模块并完成 PostgreSQL/前端联调 |
| 块与任务 | 已构建待验收 | CRUD、实体、端侧副本与同步路径存在 | 2026-07-10：`mvn test` 生命周期通过，无业务断言 | 跨用户、删除、多端一致性 | 统一删除并测试 |
| Asset | 已构建待验收 | V3 Asset 元数据、上传 intent、完成时对象 HEAD/stat 校验、READY 下载 URL、用户归属和失败状态持久化存在；MinIO 适配器按配置启用 | 2026-08-17：真实 MinIO presigned PUT/HEAD/GET/open/delete 集成 1/1 通过；测试 profile 仍使用可控存储端口 | MinIO 异常路径、上传回调和部署凭据验证 | 完成对象不存在、大小/hash 不符、超时、重复完成和生产凭据验收 |
| Source | 已构建待验收 | V3 Source FILE/TEXT/URL CRUD、版本/墓碑/恢复、reingest PENDING、Subject/Asset 归属校验和 KnowledgeBlock Source 关联存在 | 2026-08-13：阶段 2B Repository/Service/Controller 与全量 42 测试通过 | ingestion worker、Tika/文本解析、真实文件链路和三端业务验收 | 先完成真实对象/解析边界，再进入同步接入 |
| Relation | 已构建待验收 | V3 Relation 端点类型/用户/活动状态校验、RELATED_TO 无向去重、版本/墓碑/恢复和 shared 删除事件级联存在 | 2026-08-13：阶段 2B Repository/Service/Controller 与全量 42 测试通过 | PostgreSQL 约束、跨模块人工业务链路和同步一致性 | 与删除/同步阶段一起完成外部验收 |
| Sync | 已构建待验收 | V4/V6 change log/inbound mutation、高水位 cursor、原子 push/pull/snapshot、包含墓碑的快照、设备校验、幂等、版本冲突、30天自动清理与指标存在 | 2026-08-17：R1-05 定向套件 16/16 通过，覆盖清理后 cursor reset、高水位延续、清理指标、并发 cursor/并发重放；全量 126 通过、1 个 opt-in PostgreSQL 测试跳过 | 双设备、断网重连、过期 cursor 的真实调度、PostgreSQL 并发游标 | 完成真实数据库/双设备验收 |
| Review | 已构建待验收 | V5 ReviewState/ReviewEvent/参数集、FSRS-lite、due/event/history、完整状态快照、SKIP 与事件幂等存在 | 2026-08-14：Review 定向 6/6 通过，全量回归通过，覆盖后续复习后重放原始状态 | 多端复习主流程和调度业务验收 | 接入前端并进行真实用户流程验收 |
| Stats | 已构建待验收 | V5/V7 强类型 overview/weekly 查询，所有统计按 userId 过滤，任务按 completed_at 统计 | 2026-08-14：Stats/迁移定向 4/4 通过，全量回归通过，覆盖后续编辑不改变完成日统计 | 真实数据量、跨用户和前端展示验收 | PostgreSQL 查询计划和前端联调 |
| Realtime | 已构建待验收 | V5 一次性 hash-only ticket、设备绑定、WebSocket handler 和提交后用户级事件桥存在 | 2026-08-14：Realtime 定向 3/3 通过，全量回归通过，覆盖已提交领域写入产生 SYNC_CHANGED | 浏览器 WebSocket、跨实例、断线重连和前端消费 | 加入真实 WebSocket 客户端与部署拓扑验收 |
| AI / RAG | 已构建待验收 | chat、回调式 SSE、会话/消息 `clientRequestId` 幂等、精确 assistant reply、citation、ingest、PostgreSQL pgvector/HNSW、generation 原子切换和 MinIO 端口存在 | 2026-08-20：R1 专项 12/12；`clean test` 137/137，实际覆盖 PostgreSQL 17/pgvector V1→V14 clean/upgrade 与 MinIO 主链路；PC 离线恢复/SSE 测试 58/58 | 真实模型/网络、MinIO 异常路径、前端 SSE 消费、引用质量 | 完成 Provider/MinIO 异常路径/前端联调和 AI 业务验收 |
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

2026-08-20 R4 Task 7 已完成代码与定向自动测试：

- `Auralis-PC/src/api/useSyncApi.ts` 已切换到 OpenAPI 的 `pullChanges`、`pushChanges`、`getSnapshot`；生产源码不再使用 `afterId`、`lastMutationId`、`truncated` 或旧 block/task merge。
- `useSyncStore` 已维护 `cursor`、`resetRequired`、`isPulling`、`isPushing`、`lastSyncError`；realtime、启动恢复、网络恢复和主动同步统一调用 cursor pull，reset 会先 snapshot、保留 unresolved mutation，再重放 pending。
- `npm.cmd run test:r4-pc` 39/39 通过；`npm.cmd run type-check` 通过。`npm.cmd run check:r4-pc` 仍只命中 Task 8/10 的 Subject/页面/AI 旧实现；真实后端、多设备、浏览器 WebSocket、Tauri、GUI 和前后端联调仍未验证。

2026-08-20 R4 Task 8 已完成 PC Subject/KnowledgeBlock/Source/Asset 主流程代码迁移与自动验证：

- `useSubjectStore`、`useSourceStore`、`useKnowledgeStore`、`useAssetStore` 已使用 typed API、user/device-scoped local repository、`version/deletedAt/baseVersion` 和 pending mutation；SubjectWorkspace、Asset、Home 的资料上传改为 upload-intent → object storage PUT → complete → Source create，目录更新使用当前 Source DTO，AI 流改用 `/api/ai/messages/stream`。
- 新增 `domainMappers.ts` 和固定 DTO mapping/cursor/optimistic mutation 测试；旧 PC snake_case 资料字段、旧 `/api/ai/chat`、旧 Asset 兼容调用已从本轮正式页面路径移除。`npm.cmd run check:r4-pc` 扫描 52 个生产文件通过。
- `npm.cmd run test:r4-pc` 44/44、`npm.cmd run type-check`、`npm.cmd run build` 和 `git diff --check` 通过；Vite 仍提示 Asset chunk 约 594 kB 超过 500 kB 阈值。
- R4-08 不等于真实前后端联调或人工验收：真实 Auth/Subject/Source/Asset/AI SSE、MinIO 异常路径、Tauri SQLite 升级、浏览器/Tauri GUI、离线双设备和业务验收仍未执行；`useBlockStore`、`useTaskStore` 等剩余 Store 仍待后续 R4 任务迁移。

2026-08-20 R4 Task 9–11 已完成 PC 联调前代码迁移与自动验证：

- `useTaskStore`、`useReviewStore`、`useStatsStore`、`useChatStore`、`usePomodoroStore` 已建立 typed DTO 到页面模型的边界；Dashboard、Timeline、Profile、Home、SearchPalette、SubjectWorkspace 和 Pomodoro 不再直接把 `localDb` 或旧 block Store 当作云端事实。Profile 展示当前 user/device/session，并支持撤销其它会话；Dashboard 的静态演示知识、任务和学科数据已移除。
- AI 已由 `AiStreamController` 管理取消、增量合并、citation 去重、失败和中断状态；Vite `/api`、`/ws` 开发代理只读取 `VITE_DEV_API_TARGET` / `VITE_DEV_WS_TARGET`，Tauri capability 保持 `core:default`、`log:default`、`sql:default`，未授予 shell/http/fs。
- `npm.cmd run check:r4-pc` 扫描 57 个生产文件通过；`npm.cmd run test:r4-pc` 53/53、`npm.cmd run type-check`、`npm.cmd run build` 通过。`npm.cmd run tauri -- build --no-bundle` 通过并生成 `Auralis-PC/src-tauri/target/release/app.exe`；完整 `tauri build` 在 MSI bundling 阶段被宿主权限错误 `拒绝访问 (os error 5)` 阻断，不能写成安装包验收通过。
- 本条只证明 PC 代码、类型、自动测试、Web 构建和桌面应用本体构建；真实 Server/MinIO/Provider、浏览器或 Tauri GUI、安装升级卸载、双设备同步、真实 AI SSE 和前后端业务联调仍未执行。构建保留 Asset 大 chunk 与 `useSyncStore` 无效动态 import 警告。

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

- 代码实现：已完成 V8–V13、AI 配置、BYOK AES-GCM、Provider/embedding 端口、DeepSeek/OpenAI-compatible/SiliconFlow 适配器、HTTPS Provider allowlist、DNS 公网地址过滤与固定连接、来源 URL 重定向复核/固定连接、Source ingestion job 的 claim-next/lease/自动轮询/有限重试、解析/切块/embedding、PostgreSQL pgvector/HNSW 用户隔离 retrieval、H2 JSON fallback、generation 原子切换、Conversation/Message clientRequestId 幂等回放、会话版本/消息并发序号、citation、回调式 SSE 生命周期和 Suggestions 基线。
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

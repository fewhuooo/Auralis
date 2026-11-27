# Auralis 路线规划与发布前门禁

更新时间：2026-11-27

文档状态：现行路线与门禁

权威范围：工作优先级、分领域收口清单、Tablet 手写保留边界与候选部署测试前门禁（R0–R6）

事实来源：[当前状态](Status.md)、[问题和审查](IssuesAndReview.md)、各模块与契约文档（合并原 planning 分目录）

## 阅读入口

1. 先读[当前状态](Status.md)与[问题和审查](IssuesAndReview.md)，确认已有实现、最近验证边界和仍开放的问题。
2. 用下方「推进原则与工作优先级」确定任务范围；按「分领域收口清单」核对各端与后端收尾目标；准备候选发布时用「部署测试前门禁（R0–R6）」逐项核对证据。
3. 历史专题设计与单次实施计划见[历史设计与方案索引](../archive/design-and-plans/README.md)；整理前计划原文保存在[2026-11-15 快照](../archive/snapshots/maintenance-2026-11-15/README.md)。

历史 R0–R6 是可复用的验收分类，不要求重新执行已完成迁移。早期计划中的“当前事实”与未勾选状态均不能单独证明今天仍未实现，须以当前源码、模块与 `current/` 记录为准；代码存在、自动构建/测试通过、运行健康与真实设备/业务验收分别判断。

## 推进原则与工作优先级

近期工作由开放问题驱动，不把早期重写或迁移清单重新当成未实现功能（`position`、BlockRelation、LangChain4j 配置和旧“恢复守卫”均非现行任务依据）。PC 登录守卫、后端测试源码、现行同步与 ticket 实时协议已有实现；后续重点核对实际行为、跨端差异与真实验收证据。

| 顺序 | 工作范围 | 进入条件与完成边界 |
| --- | --- | --- |
| 1 | 已知 correctness 与类型/测试门禁问题 | 按问题登记的证据和关闭条件处理剩余类型与测试门禁；知识块会话发布已有源码修复，持久后台 Overview job 已退役；Mobile 类型阻断已处理，独立复习和平板工作区复习的真机验收继续跟踪 |
| 2 | 身份、资料与数据恢复 | 验证注册/重置/会话撤销、账号隔离、上传解析、删除、冲突、离线队列与恢复；保留失败证据 |
| 3 | PC 与跨端主流程 | PC Tauri、Android 手机 App（Auralis）与平板 App（Auralis HD）分端验收，再验证双设备同步、排期、复习与 Chat 恢复 |
| 4 | AI 与外部依赖质量 | 验证现行 Markdown Overview、Chat 原生工具、检索与来源、真实 Provider 异常和用量；自动测试不替代质量样例 |
| 5 | 候选发布 | 按本页「部署测试前门禁（R0–R6）」收口配置、制品、安全、监控、备份恢复和回滚 |
| 6 | 后续能力 | 手写和其他平台按已确认产品范围独立排期，不能擅自扩大当前发布范围 |

### Mobile / Tablet 设计落地顺序

已确认范围见[产品需求](../project/ProductRequirements.md#跨端职责)，当前差距与边界见[模块说明](../modules/FrontendMobileTablet.md#已确认目标与收口状态)。按独立可验证阶段推进：

1. 统一任务日期、学习复习生命周期和数据范围，覆盖手机及平板独立与内嵌入口。
2. 打通手机资料采集、PC 整理与平板阅读，接入真实文件和正式总览。
3. 完成平板资料伴读、知识内容编辑和来源回跳，以及专注实际计时与统计。
4. 完成本地自由画布及分屏学习，验证自动保存、账号隔离、导出与真机书写。
5. 收口手机导航、平板学习首页与触控体验，并逐端验收。

### Mobile / Tablet 技术栈迁移（已完成）

2026-11-26～27 已将 `Auralis-Mobile` 从 Uni-app 重构为 Vue 3 + Vite + Tauri 2，拆分为 Android 手机 App（`Auralis`，`com.auralis.mobile`）与平板 App（`Auralis HD`，`com.auralis.hd`）两个独立原生应用；微信小程序与 Mobile H5 退出发布范围，iOS 与移动端 Rust 共享层不做；原 Uni-app 历史归档至 `D:\CodeBase\Archive\Auralis-Mobile-uniapp-20261127\` 与 Git 标签 `archive/mobile-uniapp-20261127`。迁移方案已归档至[移动端 Tauri 2 迁移方案](../archive/design-and-plans/plans/frontend/2026-11-26-mobile-tauri-migration.md)，现行架构、命令与限制见[Mobile / Tablet 模块](../modules/FrontendMobileTablet.md)。

### 优先级定义

| 优先级 | 目标 | 证据要求 |
| --- | --- | --- |
| P0 | 防止数据泄露、不可逆损失和生产凭据泄漏 | 用户隔离、安全检查及可恢复证据 |
| P1 | 可靠主流程与外部服务闭环 | 对应自动验证及真实环境验收 |
| P2 | 发布和体验完善 | 构建、GUI、真机、监控和发布演练 |
| P3 | 增强能力 | 核心门禁完成后的专项验证 |

优先级不替代具体问题的影响评估。先关闭阻断项，无法关闭的风险必须说明影响、补偿措施和负责人；不能因为文档归档而默认接受。

### 推进流程

1. 选定当前问题或产品目标，核对对应模块、契约与[编码前协议](../agent/BeforeCoding.md)。
2. 记录源码版本、工作树保护范围、所需环境和完成定义。
3. 按仓库规则进行最小实现与一次有针对性的验证。
4. 将结果回写 `current/`；实现细节写模块，接口和数据写契约，过程变更留[变更记录](../operations/Changelog.md)。
5. 需要发布时统一核对候选版本与制品，不能拼接不同版本的通过记录。

## 分领域收口清单

### 后端与数据

- **目标**：让账号、数据、删除、同步、资产和 WebSocket 具备可重复验证的安全主流程。具体结构与边界见[后端模块](../modules/Backend.md)、[API](../contracts/API.md)、[数据库契约](../contracts/Database.md)。
- **前置条件**：按[基础设施模块](../modules/Infrastructure.md)准备 PostgreSQL/pgvector、MinIO 与受控 Provider 环境；测试 profile 不使用生产 secret；先定义测试数据清理与用户隔离策略。
- **有序收口任务**：
  1. 核对邮箱注册、登录、找回密码、refresh、改密、会话撤销与过期测试，补足缺口并完成真实双设备验收。
  2. 验证知识块、任务、资产和 Relation 的跨用户拒绝及账号切换隔离。
  3. 按现行 API/数据库契约验收资源删除、恢复、墓碑、mutation 和冷启动收敛。
  4. 验证 Sync create/update/delete、重复回执、cursor、冷启动/增量、并发及保留清理。
  5. 对 Asset intent/complete 校验完成真实对象存在、大小、MIME、hash、归属及异常恢复验收。
  6. 按现行 Task 排期命令验证时间、版本、冲突和事务原子性；不恢复退役 `task_block.position`。
  7. 按现行 Relation 多态端点和 owner 边界验收删除事件与隔离。
  8. 验证一次性 ticket、`/ws/events` 通知、重连/退出和提交后通知；不恢复旧 `/ws/sync` 或 PING 协议。
  9. 对平台生成/Embedding 分组及 BYOK 配置进行 production-like 加载与安全验证。
- **验证与完成定义**：`Auralis-Server` 执行 `.\mvnw.cmd -B -ntp test`（含真实断言与跨用户双账号用例）；P1 Auth、删除、Asset 与配置风险关闭；排期、Relation 隔离与数据恢复风险关闭或有明确接受记录；权威文档同步。

### PC 桌面与 Web

- **目标**：让 PC Web 与 Tauri 在真实登录、数据、文件、时间线和学科工作区流程中可验收。具体边界见[PC 模块](../modules/FrontendPC.md)与[前端设计](../project/FrontendDesign.md)。
- **有序收口任务**：
  1. 验收 `useAuthStore` 与 `resolveAuthRedirect` 登录守卫在 `/login`、受保护路由、刷新和退出时的行为。
  2. 核对已有路由/401/会话测试，针对明确缺口验证刷新失败、退出回退与跨账号迟到结果。
  3. 核对 Dashboard、SubjectHall、Workspace、Asset、Timeline、Pomodoro、Profile 的 Store 字段与 API 调用。
  4. 验收上传、解析、错误、重试和用户提示（含文档密钥丢失后的安全重建边界）。
  5. 验收时间线拖拽、保存、冲突、取消排期和任务排序。
  6. 验收工作区文件预览、AI 上下文、关系图和辅助栏折叠。
  7. 验收深色模式、键盘焦点、窄宽度和加载/空/错状态。
  8. 在 Windows 运行 Tauri，验证权限、SQL 插件、文件、Keyring、OCR 打包和安装升级卸载流程。
- **验证与完成定义**：`Auralis-PC` 按范围执行 `npm.cmd run check:subject-icons`、`npm.cmd run check:subject-workspace`、`npm.cmd run type-check`、`npm.cmd run build` 及 `npm run tauri dev`（Web 产物与 Tauri GUI 分开记录）；受保护路由不可绕过，无过期 Store/API 引用，Web、主流程人工验收与指定设备 Tauri 验收均有证据。

### Mobile / Tablet

- **目标**：让 Android 手机 App（`Auralis`，`com.auralis.mobile`）与平板 App（`Auralis HD`，`com.auralis.hd`）在不跨端跳转、数据来源清楚、登录正确和触控可用的前提下完成主流程验收。具体页面与边界见[Mobile / Tablet 模块](../modules/FrontendMobileTablet.md)。
- **已知前提**：手机端 7 个页面、平板端 8 个页面已按 `VITE_APP_TARGET=phone|tablet` 分别打包并移除 `pages/launch` 启动页与微信/H5 构建分支；设备标识统一使用请求 `clientDeviceKey` 与服务端返回的 `serverDeviceId`，不保留旧 `deviceId` 兼容字段；Realtime ticket 不带请求体且须携带有效 Bearer access token。
- **有序收口任务**：
  1. 验证双端各自根路由、内部导航、Android 系统返回键与 401 登录回退。
  2. 验证 `VITE_API_BASE_URL`、`VITE_WS_BASE_URL`、`network_security_config.xml` 与服务端 CORS（`http://tauri.localhost`）在模拟器/真机上的连通性；正式发行版强制 HTTPS/WSS。
  3. 逐页收口 `tauri-plugin-sql` 本地库、Sync、AI、Asset、Stats 与 Review 数据来源，验证 `close()` 与登录世代围栏。
  4. 验收 Home 新建日程/待办/上传、Pomodoro、Review 生命周期、Stats 与全局触控反馈。
  5. 验收 Mobile AI 输入、流式/失败状态与上下文。
  6. 验收 TabletLayout 导航、AI 浮窗、Dashboard 多栏、workspace 文档阅读（IndexedDB 缓存）与总览/复习面板。
  7. 运行并维护侧栏切换脚本（`node scripts/check-tablet-sidebar-transition.mjs`）、`test:r4-mobile`（含 `node:sqlite` 与 `touchFeedback` 测试）和 `test:tablet`，按实际行为缺口补齐验证。
  8. 在物理 Android 手机与横屏平板真机完成真实交互、软键盘、清澈比例与长时间运行记录。
- **验证与完成定义**：`Auralis-Mobile` 执行 `npm run type-check`、`npm run check:r4-mobile`、`npm run test:r4-mobile`、`npm run test:tablet`、`node scripts/check-tablet-sidebar-transition.mjs`、`npm run build:phone`、`npm run build:tablet` 与 `scripts/build-mobile-release.ps1`；手机与平板只包含本端路由，双端各自在物理真机留存独立验收证据。

### AI 与 RAG

- **目标**：在不泄露密钥、不伪造结构化结果和不丢失来源的前提下，让 AI 聊天、Overview 与资料摄入可质量验收。契约见[后端模块](../modules/Backend.md)、[API](../contracts/API.md)与[Chat Runtime API](../contracts/chat-runtime-api.md)。
- **有序收口任务**：
  1. 核对平台生成/Embedding/BYOK 配置在目标环境的完整性与安全边界。
  2. 验证当前 embedding 维度（1024）、已有向量空间和来源 revision/owner 契约；换模型须评估旧向量。
  3. 核对 Chat/Overview/摄入/网络错误测试，补足缺口及真实取消、断流、UNKNOWN 恢复、现行直接 Overview 生成与用量结算验收。
  4. 对文件类型、大小、解析失败和恶意输入建立限制与提示。
  5. 为每种 AI 输出定义用户可见来源、置信限制、编辑与重试入口；单独交付 Suggestions 真实质量（当前仍是确定性基线）。
  6. 建立经授权脱敏的评测集，覆盖学科问答、Overview 和检索来源；任务抽取、手写文本和排期建议只按已确认产品范围独立评估。
  7. 记录成本、延迟、失败率和向量检索质量指标。
- **验证与完成定义**：测试 profile 使用 mock/可控 provider；真实 provider 验证记录模型、日期、输入类型与脱敏结果；文件摄入同时核查资产、块、向量和错误回滚；配置可加载、来源可追溯、质量/成本达到产品门槛。

### 基础设施与发布

- **目标**：把本地 Compose 基础转为可审计、可恢复、可发布的受控环境。详见[基础设施模块](../modules/Infrastructure.md)、[部署指南](../operations/Deployment.md)、[Runbook](../operations/Runbook.md)。
- **有序收口任务**：
  1. 核对 `.env.example`、Compose 与 Server 配置绑定，验证生产必需 secret 与 fail-fast 行为。
  2. 验证 MinIO 用户资源隔离、bucket policy、凭据和预签名 URL 外部可达性。
  3. 验证 PostgreSQL、MinIO 与解密密钥的一致性备份恢复步骤。
  4. 进行至少一次恢复演练并记录 RPO/RTO。
  5. 验证健康检查与指标，补齐结构化日志、告警和实际送达演练。
  6. 在已有 OpenAPI CI 上收口格式、PC/Mobile/Tauri 构建、Server/真实依赖测试及供应链扫描。
  7. 建立镜像版本、部署、迁移、冒烟和回滚流水线。
  8. 限制 CORS、管理端口、网络和权限。
- **验证与完成定义**：干净环境从非默认 secret 启动成功，模拟故障告警可见，备份恢复通过 Auth/Data/Asset/Sync 冒烟，发布与回滚有执行日志。

### 文档维护验收

- **目标**：保持文档体系简洁、事实唯一，作为开发者与 Agent 的可靠维护接口。
- **维护与检查规范**：
  1. 保护工作树中已有修改，归档正文保留历史原貌，不把 `archive/` 当作现状依据。
  2. 现行 Markdown 除 `docs/README.md` 外必须位于 `agent/`、`project/`、`current/`、`modules/`、`contracts/`、`operations/` 六个分类目录，附带四项元数据并从 `docs/README.md` 可达。
  3. 修改路径或链接后全仓搜索旧引用并确认相对链接与锚点全部有效；纯文档整理按[编码前协议](../agent/BeforeCoding.md#验证节奏)检查登记与链接，不跑应用测试或构建。
  4. 修改实现说明时对照对应路由、Controller、Entity、配置或 Compose；记录 GUI、真机与外部服务未验收边界；代码变更按协议回写。

## Tablet 手写保留边界

文档状态：计划，入口已隐藏保留。`tablet_notes`、`NoteDocument`、repository、`handwritingEngine` 与页面代码已存在于仓库中，`VITE_TABLET_HANDWRITING_NOTES_ENABLED` 默认关闭入口（workspace 不显示“+ 笔记”与批注工具条、侧栏不显示随手记入口），产品已确认采用仅本地保存的自由画布，不进入 Server 同步；完整混合内容、分屏、自动保存恢复与手动导出仍待逐项实施验收。

### 架构原则

- 端侧笔记是独立数据域，不能伪装成已同步知识块。
- 文件批注通过 `subject_id`、`asset_id` 和 mode 绑定上下文。
- 笔迹原始数据优先保存，AI 转换是可选派生结果。
- 入口开关与数据迁移分开，关闭入口不能删除用户数据。

### 启用前有序任务

1. 运行现有 `Auralis-Mobile` 的 `npm.cmd run test:tablet`（覆盖 feature flags、note model 与 repository core 三组测试），按实际行为缺口补齐验证。
2. 定义笔记版本、序列化、迁移、损坏恢复和容量策略。
3. 实现手动导出并验证导出内容完整性；明确本地账号隔离、存储位置和保存失败恢复。
4. 在真实平板验证文件切换恢复、画布平移缩放、笔刷、橡皮、撤销、清屏。
5. 验证长时间书写、低内存、后台恢复和大文档。
6. 验证文本、图片、笔迹的自由排布、套索移动，以及阅读/AI 与画布分屏切换后的上下文保持。
7. 通过专项验收后再打开 feature flag，并在启用前同步状态、用户手册与 Changelog。

### 阻塞与完成定义

- **阻塞**：真机、笔输入设备、本地存储位置、导出格式与隐私策略。
- **完成定义**：数据不因开关、崩溃或文件切换丢失；自动保存、重启恢复、手动导出和损坏恢复可验证；指定真实平板完成专项走查（`test:tablet` 不替代真机与备份验收）。

## 部署测试前门禁（R0–R6）

R0–R6 与原任务 ID 保留，便于旧交接定位。下表是候选版本进入受控部署测试前须核对的门禁，不表示实现未开始，也不继承早期勾选状态为当前通过。每个候选须绑定同一 commit、工作树差异、目标平台、环境、完整命令及退出码、人工证据、剩余风险和负责人；P0 必须关闭，保留 P1 须有明确接受记录及补偿措施，P2 可排入后续优化。

候选范围包括 Windows x64 PC Tauri、Android 手机 App（Auralis）与 Android 平板 App（Auralis HD）（实际发布组合在 R0 确认；PC Web、Mobile H5 与微信小程序已退出发布范围）。Tablet 手写云同步、iOS / 小程序平台、旧 Server 数据自动迁移、跨实例事件 Broker、AI 自动执行领域写操作不纳入本清单范围。本文不授权部署、重启、删除数据或更改凭据；实际操作按[部署指南](../operations/Deployment.md)与[Runbook](../operations/Runbook.md)执行。

### R0：范围与工作基线

| ID | 核对项与完成条件 |
| --- | --- |
| R0-01 | 明确目标端、主流程、范围外项、验收角色和候选完成定义；与产品需求一致 |
| R0-02 | 记录分支/提交/工作树，保护已有修改，明确每项变更的审查及回退边界 |
| G0 | 范围与执行规则可追溯，不将局部试测等同于正式发布范围全部通过 |

### R1：后端正确性与安全

| ID | 核对项与完成条件 |
| --- | --- |
| R1-01 | BYOK/Provider 的 HTTPS、主机/地址、DNS/重定向、期限、响应上限和密钥保护；受控测试与真实网络专项分别记录 |
| R1-02 | 摄入 claim/lease/revision、重试和终态；覆盖重启、stale worker、删除与恢复，不能由单 worker 成功推断并发安全 |
| R1-03 | pgvector 写入/检索、用户隔离、generation 切换及失败回滚，在真实 PostgreSQL 取得证据 |
| R1-04 | 按现行 Chat 协议验证 run/attempt、幂等命令、原生工具、流式事件、取消/retry/UNKNOWN 与可追踪来源；不恢复旧流式协议 |
| R1-05 | 版本、锁序、分页、cursor、墓碑、Sync 回执及保留清理在并发与异常路径正确 |
| R1-06 | Maven Wrapper、Java、测试 fixture、生产配置与运行权限适配目标环境；Open-in-View 与调试端点按配置边界核对 |
| G1 | 已知后端 correctness 与安全阻断项关闭，当前契约可供客户端验证；源码存在不是自动放行 |

### R2：真实依赖与运行条件

| ID | 核对项与完成条件 |
| --- | --- |
| R2-01 | 当前 Compose 的 db、minio、minio-init、backend/frontend 配置可解析，实际配置与文档一致；不打印凭据 |
| R2-02 | 后端镜像能构建并按非 root、健康检查及生产配置运行，记录 digest 与环境 |
| R2-03 | 真实 PostgreSQL/pgvector 覆盖当前迁移、历史升级输入、约束、事务/锁、cursor、向量及必要查询计划 |
| R2-04 | MinIO PUT/HEAD/complete/GET/delete 与对象对账；覆盖缺失、大小/hash 不符、超时和重复 complete，失败可恢复 |
| R2-05 | Provider 受控成功/429/5xx/超时/断流/非法响应矩阵及受控真实 chat/embedding smoke，保留模型、日期和脱敏证据 |
| G2 | 依赖主路径及所需异常边界已取得实际证据，H2 或 stub 不作为真实外部环境的替代 |

### R3：契约与生成类型

| ID | 核对项与完成条件 |
| --- | --- |
| R3-01 | 运行时 OpenAPI 与冻结产物一致，接口、错误、分页、Sync、ticket、SSE 与上传文档同步 |
| R3-02 | PC/Mobile 从同一产物生成 SDK，生成结果无未解释差异；消费者通过相应类型门禁 |
| R3-03 | 当前版本、旧数据保留/显式迁移、cursor reset、冲突及升级边界一致；重写范围不加入旧协议兼容路径 |
| G3 | 契约、生成类型和实际消费者一致；生成成功不证明所有页面完成迁移 |

仓库已有 OpenAPI workflow、`scripts/check-openapi.ps1` 与生成脚本，候选应验证这些现有入口，不重新建立平行流程。

### R4：客户端与平台

| ID | 核对项与完成条件 |
| --- | --- |
| R4-01 | PC 现行登录守卫与会话隔离、环境配置、`/ws/events` + ticket、重连与退出行为；守卫和新实时协议已有源码，重点验证当前行为 |
| R4-02 | PC 页面/Store/仓储使用现行契约；user/device 隔离、outbox、删除、上传和 AI 上下文无旧数据越界 |
| R4-03 | Tauri 本地 SQL、文件/keyring/网络权限、安装升级卸载、数据保留及异常恢复；打包通过不等于实机可用 |
| R4-04 | Mobile / Tablet（Vue 3 + Vite + Tauri 2 双包）通过 `type-check`、`check:r4-mobile`、`node:sqlite` 与平台适配回归（`test:r4-mobile` / `test:tablet`）及双端 Vite / Android 构建，不含已退役 Uni-app / 微信代码 |
| R4-05 | Android 手机与平板连接真实 API、本地 SQLite、用户隔离、冲突/reset 与 `/ws/events` 实时协议；逐端核对 Review 生命周期、Chat 范围和恢复能力 |
| R4-06 | Android 双目标正式 Release 签名、HTTPS/WSS 与 `network_security_config.xml` 收口、服务端 `http://tauri.localhost` CORS、APK 体积基线与双端物理真机主流程 |
| R4-07 | Tablet 主工作区契约、横屏触控/键盘/原生 1.0 视口比例/前后台及文档阅读器（IndexedDB 缓存）；手写开关与本地能力边界如实标明 |
| G4 | 选定客户端的类型/构建/协议与真实主路径符合当前 API，模块/契约回写齐全 |

### R5：跨端与人工验收

| ID | 核对项与完成条件 |
| --- | --- |
| R5-01 | 邮箱注册/找回密码、登录、refresh、改密、退出和会话撤销；双用户 API/本地数据/资料/向量/AI 隔离 |
| R5-02 | 原文件上传→客户端解析/摄入→检索/引用→删除/失效全链路，覆盖失败恢复与任务状态收敛 |
| R5-03 | 双设备首次/增量同步、断网编辑、重复提交、版本冲突、重连、过期 cursor/reset 及墓碑一致性 |
| R5-04 | 按现行 Review 生命周期验证初选/核对/纠正/重放/恢复、有效历史和统计；Task 状态与日期统计正确，不要求恢复旧 due/events 写入 |
| R5-05 | 有/无/冲突资料和用户隔离、引用质量、Overview 多批内容、Chat 工具及取消恢复；记录延迟、用量、失败率，日志脱敏 |
| R5-06 | Windows x64 PC Tauri、Android 手机 App（Auralis）与 Android 平板 App（Auralis HD）按目标设备覆盖视觉清晰度、触控动效、输入、权限、文件、网络、横屏分屏与长时间使用，保留版本/日期/设备证据 |
| G5 | 身份、资料、同步核心场景通过，其他保留项有明确接受记录；无未关闭安全、隔离或数据丢失 P0 |

### R6：候选交付与放行

| ID | 核对项与完成条件 |
| --- | --- |
| R6-01 | 在已有 OpenAPI CI 之外验证所需后端/真实依赖、PC/Tauri、Mobile、镜像及安全门禁；候选 CI 全绿，P0 不允许失败 |
| R6-02 | 固定依赖/镜像，SBOM/依赖/镜像/secret scan；核对 CORS、TLS、JWT/BYOK/MinIO 密钥、调试端点、上传/速率/AI 用量限制 |
| R6-03 | 脱敏关联日志、健康/延迟/错误/队列/同步/AI/存储指标和告警；至少一次关键告警触发及恢复证据 |
| R6-04 | PostgreSQL、MinIO 和解密密钥的备份恢复步骤，RPO/RTO、保留/加密/负责人及隔离恢复校验；个人中心 JSON 导出不是完整备份 |
| R6-05 | 选定后端镜像和客户端产物、OpenAPI/SDK、Flyway 清单、SBOM/校验值来自同一候选版本并可追溯 |
| R6-06 | 项目/模块/契约/运维/用户手册/current/Changelog 一致；历史计划中的旧事实需按当前代码核对 |
| R6-07 | 对实际构建警告和体积建立当前测量，保留未发布平台/功能清单；端侧复习投影已有实现，后续优化按现行问题和性能证据决定 |
| G6 | G0–G5 的适用证据齐全、R6 无阻断项、候选与环境/测试账号可追溯、监控/恢复/中止/回滚输入具备，才记录允许进入受控部署测试 |

G6 放行必须记录候选 commit、目标环境、范围、实际门禁结果及接受的 P1 例外；不得提前写成“部署测试通过”。命令入口由各模块与运维文档维护；历史逐项勾选记录保存在[2026-11-15 快照](../archive/snapshots/maintenance-2026-11-15/planning/PreDeploymentReadinessTasks.md)。

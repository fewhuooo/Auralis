# Auralis 当前问题与审查登记

更新时间：2026-09-03

文档状态：现行风险登记

权威范围：尚未关闭的工程风险、证据、影响、处理动作和关闭条件

事实来源：当前代码、配置、模块/契约文档与本轮验证结果

## 使用规则

- 只登记未关闭问题；已确认完成的变化进入 Changelog。
- 每项必须可追溯到代码、配置、命令或人工观察。
- 关闭问题必须写出新证据，禁止仅因代码存在而关闭。
- 优先级：P0 为安全/数据不可逆，P1 为主流程或发布阻断，P2 为重要体验或维护风险。

## 首个候选版本范围基线（R0-01）

- **目标端**：Windows x64 PC Tauri、Mobile H5、微信小程序、Tablet 主工作区；PC Web 仅保留内部开发用途，不进入发布目标。
- **主流程**：注册登录、资料上传、学习工作区、同步、复习、统计、AI 对话。
- **范围外**：Tablet 手写笔记云同步、微信之外的其它小程序平台、旧 Server 数据自动迁移、跨实例事件 Broker、AI 自动执行领域写操作。
- **责任角色**：产品/业务验收、后端/基础设施、PC/Tauri、Mobile/Tablet、QA/发布。
- **证据口径**：范围冻结不等于功能验收；代码、自动测试、真实依赖联调和 GUI/真机证据继续分别登记，既有 P1/P2 风险不因本基线关闭。

主流程的逐项验收结果以[产品需求](../project/ProductRequirements.md)为准；本节只登记范围和证据边界，不替代风险项的关闭条件。

## P1 风险

### P1-PC-PDF-Preview-GUI-Validation

`PdfViewer` 已取消旧 loading/render、销毁旧 document、清空 Canvas，并以代际标记拒绝旧异步结果；`r4-pdf-viewer-switch` 3/3 通过。自动测试无法证明 Tauri asset protocol 在大 PDF、连续快速切换和实际 GPU/worker 压力下的帧率与内存回收，需在桌面端以真实大 PDF 人工验收。

### P1-Subject-Color-Contract-Cutover

2026-09-03 Subject 专属颜色完成破坏性契约切换：服务端 API/Entity、V19 schema 与 PC/Mobile 前端已移除 `color`，现有该列值不可恢复；本地 Docker PostgreSQL 已升级到 V19，Subject 行和 KnowledgeBlock/Task 的 `color_override` 均已核验保留。KnowledgeBlock/Task 的 `colorOverride` 不在本次范围内。2026-09-04 PC 已清除 Dashboard、Timeline 与 Home 的 `Subject.color` 页面残留，统一使用 `#7D9372`；`r4-store-mapping` 10/10 与 type-check 通过。剩余风险是三端真实 GUI/业务联调尚未完成人工验收。

### P1-Device-Identifier-Contract-Cutover

2026-08-29 已完成一次破坏性设备标识契约切换：Auth 注册/登录使用 `clientDeviceKey`，AuthResult/Session/Sync 使用 `serverDeviceId`，Realtime ticket 不再接受设备字段而从 JWT 解析；旧 `deviceId` 字段和兼容测试均不保留。PC/Mobile 自动协议测试与 type-check 已通过，但真实 Server、双设备、Realtime/WebSocket、Mobile/Tablet 真机及既有本地会话重登仍需验收；关闭条件是新 OpenAPI 产物、三端请求和真实设备流程全部只使用新字段并取得脱敏联调证据。

| ID | 问题 | 证据 | 影响 | 处理动作 | 关闭条件 | 领域 |
| --- | --- | --- | --- | --- | --- | --- |
| P1-Backend-Contract-Cutover | 新后端保留 `/api` 前缀但不兼容旧 DTO；PC、Mobile 与 Tablet 目标代码路径已迁移，三端真实联调仍未完成 | 2026-08-20 PC/Mobile/Tablet 静态门禁、协议测试、类型检查和 Web/H5/微信构建通过；Tablet Dashboard/Review 已接 Stats/Review API。2026-09-01 服务端真实 HTTP WebSocket upgrade 已验证 ticket 握手，但浏览器和目标端消费尚未验收 | 自动检查无法证明真实 Server、MinIO、Provider、浏览器/目标端 WebSocket 和多设备行为 | 按 R5 逐端完成真实服务与设备联调 | PC、Mobile、Tablet 目标流程全部使用新生成契约且联调证据齐全 | Frontend/Backend |
| P1-Mobile-Platform-Validation | Mobile 新契约与双构建已完成，但微信平台配置、真实上传/SSE/WebSocket、双设备 reset 和真机未验收 | `check:r4-mobile` 62 文件、协议 20/20、type-check、H5/微信 build 通过；无 AppID/合法域名/开发者工具/真机证据 | 命令行产物可能在域名、证书、对象存储 PUT、前后台或弱网条件下失败 | 配置请求/WSS/upload/download 域名，在 H5、微信工具和真机覆盖登录、上传、同步、复习、统计和 AI | 真实 Server/MinIO/Provider 与目标设备流程通过并保留脱敏证据 | Mobile/WeChat |
| P1-PC-Local-Repository-Cutover | PC 普通同步资源已收口为本地 v6 projection/outbox，但 `localDb.ts` 与 `useBlockStore.ts` 仍保留兼容 facade，且真实 Tauri 迁移/GUI 尚未验收 | 2026-09-04：Subject/Source/KnowledgeBlock/Task 均先 `commitMutation()` 原子保存本地资源+outbox，之后才更新 Pinia；后台 cursor cycle 合并启动、实时、读写请求，远端只结算对应 mutation 或更新无未解决写入的资源。cursor page 仅写每资源最后 change，墓碑不会删除 pending 本地编辑。`r4-local-repository`、`r4-sync`、`r4-register-file` 合计 28/28 通过；`npm run type-check` 仅报 Timeline 的 3 个 `Subject.color` 与未使用 `Sparkles`，完整 PC 门禁未通过 | 首次登录旧数据迁移、Tauri SQLite 升级、reset/离线恢复、连续离线编辑、双设备冲突及跨账号切换仍缺真实桌面证据；当前类型检查和完整 PC 回归不能作为整体绿灯 | 保持 facade 只读兼容范围，补 Tauri/Web GUI、真实服务、弱网连续编辑、三次连续编辑旧回包保护与双设备冲突验收；修复 Timeline 类型残留后复跑完整 PC 门禁 | 正式 PC 业务路径不再读写旧全局 key；Tauri/Web/GUI 证据齐全；真实后端联调确认 user/device 隔离、合并 mutation 回放、cursor 保护和冲突状态可见 | PC/Data |
| P1-PC-AI-Recovery-Validation | 离线 Chat 已持久化稳定会话/消息请求 ID，并在网络恢复后自动顺序重发；但尚未以浏览器连接真实 Server/Provider 验收 | `useChatStore.ts`、`authenticatedSse.ts`、`r4-reliability.test.mjs`；2026-08-20 `test:r4-pc` 58/58、type-check/build 通过 | 浏览器断线、token 刷新与真实 SSE 代理交叠时仍可能暴露时序或 UI 回归 | 在真实 API 上覆盖离线新建会话、断流重试、401 刷新、恢复顺序和重复点击 | 浏览器/Tauri 中真实 Server/SSE 的恢复、无重复消息和失败态证据齐全 | PC/AI |
| P1-PC-AI-Reading-Flow | PC Tauri AI 辅助阅读 G1–G4、G5/G6、C1–C5、S1–S6、A1–A4、K1/K2、U1–U3 的代码与自动门禁已完成；真实联调和 GUI 仍未完成 | `DocumentProcessingRuntime`、阅读会话/PromptAssembler/ScopeEscalationPolicy、状态点/Profile 解析中心、选中文本编辑器；启动前同步修复、MinIO IPv4 public endpoint 和 debug log stdout 修复已补齐；`test:r4-pc` 需以本轮完整命令结果为准；`docs/test` 含 DOC/DOCX/PPTX、真实 OLE PPT、text-layer/扫描型 PDF | 临时 all-users MSI 安装因宿主 Error 1925 未完成，安装后 sidecar/OCR、升级卸载和 GUI 仍缺真实证据；实际 File Viewer/Tauri extract/fallback/failure、扫描 PDF 真实渲染/OCR、Tauri SQLite/cache/upload/restart、跨设备接手、MinIO/Server 业务联调、阅读会话/current Source→Subject 升级/选中文本仍待验收 | 在具备安装权限的 Windows x64 宿主补齐真实 Server/MinIO/Provider、文件样本、断网重启/跨设备和阅读 GUI 验收；自动门禁只作为代码证据，不替代人工验收 | Windows x64 MSI 安装后离线 OCR、四类 Office 固定样本、revision 并发、加密缓存上传、当前 Source→Subject 检索升级、选中文本知识块和 GUI/业务证据全部通过 | PC/AI/Backend |
| P1-Backend-Docker-Gate | [已关闭] Docker、PostgreSQL/pgvector、MinIO 和 Compose/Testcontainers 基础门禁 | 2026-08-20 Docker Desktop Linux engine 下默认 `clean test` 137/0/0；Testcontainers 实际启动 PostgreSQL 17/pgvector clean/upgrade 与 MinIO。既有 Compose config/build/up/health 证据仍有效 | 基础设施主链路已具备可重复验证证据；异常专项和真实 Provider 仍由独立风险跟踪 | 保留 Docker 门禁并在 CI/本地复跑；继续完成 R2-03/R2-04 异常专项和 R2-05 真实 Provider smoke | Compose 服务健康、默认容器测试零跳过、PostgreSQL/MinIO 主链路集成证据齐全 | Backend/Infra |
| P1-Auth-Guard | PC 登录守卫逻辑已恢复，公共登录页已与认证壳隔离，但浏览器/Tauri 的登录、刷新、退出和过期仍未人工验收 | `Auralis-PC/src/router/index.ts`、`src/auth/authGuard.ts`、`src/App.vue`、`src/components/layout/AppSidebar.vue`；`r4-pc-protocol.test.mjs` 与 runtime 回归已覆盖公开/受保护/登录页决策及白屏回归 | 会话持久化、过期和退出后的实际导航行为仍可能与纯函数决策不一致 | 在浏览器和 Tauri GUI 走查登录、刷新、退出、过期和返回地址，并确认无 token/refresh token 时不出现空白页 | 自动测试与目标 GUI 的登录/刷新/退出/过期证据齐全 | PC/Auth |
| P1-Test-Coverage | 新后端已覆盖主要模块自动测试；多设备和浏览器客户端仍缺业务回归保护，且当前宿主无法完成全量 Testcontainers 门禁 | 2026-08-20 默认 `clean test` 已执行 PostgreSQL/MinIO 容器测试并通过 137/0/0；2026-09-01 本机复跑时，68 个测试类共 192 个测试出现 2 个失败、28 个错误：模块依赖环、Testcontainers 初始化失败及共享 H2 的 `assets → users` 清理外键错误。与本次 Jackson 迁移直接相关的 Sync HTTP、namespace guard、Sync、ParsedDocument、Provider 和 AI 定向套件 32/32 通过 | 主链路通过不等于 PostgreSQL 全量并发行为、双设备断网恢复和真实 WebSocket 可用；当前环境也无法复现全量容器证据 | 恢复 Docker 后复跑并分离共享 H2 测试数据清理；增加 PostgreSQL/MinIO 异常与并发、双设备和浏览器 WebSocket 回归 | CI 或本地门禁执行到真实基础设施与目标客户端断言并保留报告 | Backend |
| P1-Asset-Verification | Asset 上传完成的服务端对象实体验证已构建，异常分支仍未闭环 | R2 已补充 sha256 metadata header、失败对象清理、MinIO integration test 和 `scripts/audit-minio-assets.ps1`；2026-08-23 新增离线 GET signer 回归 3/3，Docker 临时账号真实 upload PUT 200、READY、download GET 200/26 bytes | 对象不存在、大小/hash 不符、超时和重复完成仍可能在部署差异下产生未覆盖行为；真实生产凭据与 bucket policy 仍未验收 | 补充真实 MinIO 异常路径、完成回调和生产凭据验证 | 真实 MinIO 主链路与异常路径、凭据、bucket policy 和部署配置测试通过 | Asset/Infrastructure |
| P1-PC-Task-Scheduling-Atomicity | 时间轴拖放已改为本地 outbox 优先，但双任务换位的持久化原子组、到期转换与过去时段保护仍与现行回归契约不一致 | 2026-09-03：Task Store 已用 `serverDeviceId` 读取本地 repository，加载先呈现本地任务、后台刷新云端，日期切换只重建内存槽位；单任务拖放不再等待远端 `PUT`，本地 repository/outbox 成功后立即更新内存，云端 push/pull 在后台执行且失败不回退本地结果。本地写入失败由 Timeline/Dashboard 通知反馈；原生 payload 现含 `taskId` 与 `sourceSlotTime`。时间轴相关 Node 套件 31 项中 26 项通过、5 项失败：负荷标签、排期换位、到期自动转换与过去时段保护；`check:r4-pc`（80 文件）通过，本机 `vue-tsc` 缺失 | 双任务本地写入仍不是持久化原子组；WebView 原生拖放、离线/409、两类转换失败、过去时段错误反馈与真实服务版本仍可能产生半交换或错误状态；无法用历史通过记录覆盖当前失败 | 先为双任务换位补齐本地原子组/服务端 swap 协调和剩余 5 个静态/行为回归，再运行 type-check、完整 PC 回归与 production build；随后在 Tauri 以过去/当前/未来槽位、已排期双向换位、未排期逾期、完成/取消、原槽、拖回待办、断网/冲突和重启后转换走查 | 当前 Node 套件、type-check、完整 PC 回归和生产 build 均通过；Tauri 上述路径可用且失败不留半交换；过去时段操作不产生写入；已过排期任务完成且保留排期，未排期逾期任务清除截止时间进入未排期 | PC/Backend |
| P1-OpenAPI-Mobile-Schema-Lock | 新 Task 换位端点已写入 OpenAPI 和 PC generated schema，但 Mobile `schema.ts` 当前被外部进程占用，无法重新生成 | 2026-08-27 `scripts/check-openapi.ps1` 成功比较后端 artifact 与 PC schema，但报 Mobile schema stale；`scripts/generate-openapi-sdk.ps1 -SkipExport` 对 `Auralis-Mobile/src/api/generated/schema.ts` 返回 Windows `EPERM` | 契约漂移门禁不能通过，Mobile 生成类型暂未反映新端点 | 关闭占用该文件的编辑器/进程后重新运行生成与 `scripts/check-openapi.ps1`；不强制结束用户进程 | 两端 schema 与 artifact 一致，`scripts/check-openapi.ps1` 退出 0 | Contract/Mobile |

### 2026-09-04 PC 排期固定补充

- 已完成且已排期的 Task 现已在 Store、Timeline 与 Dashboard 固定，防止拖放替换、移动或取消排期；该行为的两项 Node 回归通过。历史本地 `completed` 展示态记录已按弃用策略移除兼容：加载时忽略、在线刷新后以现行领域 DTO 重建；映射与 Store 定向回归通过。Subject `color` 类型错误已通过全局主题色清理关闭；最新完整 PC 回归为 173/181，剩余 8 项失败继续由本 P1 风险跟踪，真实 Tauri 拖放仍待验收。

## P2 风险

| ID | 问题 | 证据 | 影响 | 处理动作 | 关闭条件 | 领域 |
| --- | --- | --- | --- | --- | --- | --- |
| P2-Mobile-BaseUrl | Mobile Auth/WS 使用 localhost/127.0.0.1 | Mobile Store/API | 真机无法访问开发服务 | 使用平台环境配置 | 模拟器、真机、生产地址均验证 | Mobile |
| P2-Mobile-Contract | Mobile 多数页面依赖端侧数据，未接完整 Server API | 页面 API 映射 | 多端功能完成度易被误判 | 标注 local-only，逐步定义契约 | 主流程页面来源与同步一致 | Mobile |
| P2-Tablet-Validation | Tablet 多栏和手写缺真机验证 | 页面、feature flag、脚本 | 触控和长时间使用风险 | 设备走查与专项记录 | 指定设备清单全通过 | Tablet |
| P2-PC-Subject-Icon-Validation | PC 新建学科线条图标与已有 Emoji 的实际显示未做 GUI 验收 | `src/utils/subjectIcon.ts`、`AppSidebar.vue`；2026-07-14 `check:subject-icons` 与生产构建通过 | 线条图标的尺寸、对齐、统一 Sage Green 底色或选择态可能异常，已有 Emoji 可能在个别入口未保持原样 | 在浏览器或 Tauri 中检查既有学科及新建学科，覆盖全局功能侧栏 | 新建线条图标与统一底色、既有 Emoji、空值/未知语义键三类均显示正确且可操作 | PC |
| P2-PC-Workspace-Prototype-Validation | 学科大纲编排仍为静态交互原型；文件预览/删除、知识块总结与 PC AI 伴读尚未完成 GUI 验收 | `SubjectWorkspace/index.vue`、`FilePreview.vue`、`useSourceStore.ts`；2026-09-04 文件删除在 Source tombstone/DELETE outbox 成功后立即移除本地文件投影，parser/job/cache 清理改为后台 best-effort，`r4-file-preview` 20/20 通过；File Viewer 直接预览新增旧签名下载响应抑制 | 刷新后大纲编排丢失；浏览器中的删除确认、删除 OCR 中文件后的列表/计数/Profile 同步、File Viewer 文档兼容性、三栏尺寸、AI 星环/三点动效、窄栏换行和深色主题仍可能有问题 | 在浏览器/Tauri 验收文件选择、删除静态及 OCR 中资料后列表/计数/当前文件/Profile 同步、知识块总结、章节排序、小节边界与 AI 右栏 | 指定交互范围获确认或持久化完成，且 GUI 验收记录通过 | PC |
| P2-PC-Frontend-Refactor-Validation | PC 近期页面重构（Pomodoro、Timeline、Asset、Dashboard 与全局导航）尚未完成跨页面 GUI 验收 | 最近 PC 提交与 `Auralis-PC/src/views/`、`src/components/`；2026-08-12 构建与两个静态契约检查通过，但未做 GUI | 宽屏布局、任务计时、弹窗、删除操作和导航图标可能存在只在浏览器/Tauri 中暴露的回归 | 按正式路由逐页走查主要任务和失败/空状态 | PC Web 构建通过，且 Dashboard、Subject、Asset、Timeline、Pomodoro、Profile 主流程 GUI 记录通过 | PC |
| P2-PC-Modal-Consistency | PC 自定义弹窗仍有多套视觉实现：`modal-container`、Dashboard `block-modal`/详情弹窗和 `ConfirmDialog` 的遮罩、容器、标题栏、圆角、阴影与操作区不一致 | `Auralis-PC/src/views/Home/index.vue`、`Asset/index.vue`、`SubjectWorkspace/index.vue`、`Dashboard/index.vue`、`src/components/ConfirmDialog.vue`；当前仅记录，未开始改动 | 跨页面打开弹窗时视觉语言不连续，深色模式、窄屏和关闭按钮行为的 GUI 观感可能不一致 | 采用“全局弹窗令牌 + 兼容现有类名”方案，统一遮罩、容器、标题/内容/操作区与 Sage 主按钮，同时保留业务逻辑 | Dashboard、Subject、Asset、Workspace、ConfirmDialog 等弹窗在浏览器/Tauri 的浅色、深色、窄屏走查通过，且无关闭/焦点回归 | PC |
| P2-PC-Bundle-Size | PC 生产构建存在大 chunk 警告 | 2026-08-12 `npm.cmd run build`：`Asset-B7Y2PPYt.js` 约 595 kB，Vite 提示部分 chunk 超过 500 kB | 首屏加载和缓存粒度可能受影响 | 评估 Asset、Element Plus 等依赖的拆包与懒加载策略 | 关键入口 chunk 达到团队阈值，或形成明确的警告接受记录 | PC/Performance |
| P2-PC-File-Viewer-Validation | PC 学科页已接入自托管 File Viewer；真实 DOC/DOCX 排版、跨浏览器资源加载、分页能力和窄栏 GUI 尚未验收 | `src/components/FilePreview.vue`、`src/components/preview/FileViewerRenderer.vue`、`src/views/SubjectWorkspace/index.vue`、`@file-viewer/vite-plugin`；2026-09-01 OCR 完成会释放 PDF.js document，预览采用最新选择请求门禁，阻止旧下载响应回写 renderer；固定版本约束仍为 `pdfjs-dist@5.4.624` | Office 文档可能出现字体、布局、Worker/资源路径或性能差异；不同 renderer 的视图状态可能不提供真实页数；快速切换/删除扫描 PDF 时仍需真实 Tauri 证明不再反复加载；File Viewer preset-all 还增加多个大 chunk | 使用真实 DOC/DOCX/PPT/PDF/图片/文本样本在浏览器与 Tauri 走查；特别覆盖扫描 PDF OCR 与预览并行、快速切换和删除；确认文件名顶栏两组圆角控制、底部页码导航、资源加载和窄栏布局 | 指定样本加载、分页/缩放/旋转、下载、失败重试、快速切换、删除及窄栏布局均有 GUI 证据，或 PDF fallback 已通过 | PC/Preview |
| P2-PC-Tauri-MSI-Bundle | MSI 已生成并通过 bundle/WiX/baseline 门禁，但本机 all-users 安装权限不足 | 2026-08-24：MSI 220,286,976 bytes；verifier 通过 MSI、target-triple sidecar、模型哈希、manifest、notices、SBOM 与 generated WiX references；五组 fixture 离线 baseline 通过；临时安装返回 Error 1925/1603 | 安装、升级、卸载、安装后 sidecar/OCR 和数据保留仍无法在当前宿主验收 | 在有安装权限的 Windows x64 环境完成 install/upgrade/uninstall、断网 OCR 和 GUI evidence | MSI/安装包安装成功且 Windows GUI 完成登录、主流程、离线 OCR 和数据保留验收 | PC/Release |
| P2-PC-Document-Processing-Validation | C5 FILE Source 调度、Tauri runtime 组装、跨设备恢复和上传已具备代码/自动测试，但真实 Tauri 私有临时目录、MinIO/Server 联调与任务中心 GUI 尚未验收 | `SourceJobScheduler`、`DocumentProcessingRuntime`、`DocumentJobRunner`、`useSourceStore`、`useAssetStore`、全局 `BackgroundParserHost`；2026-09-01 已补充“单个恢复失败不阻塞后续 AWAITING_CLIENT Source”、Profile 本机重试、手动重试前的 Source 同步确认、删除 Source 时取消运行 parser、删除同用户/设备 job、cache 和 parser input；Rust `document_package_begin` 还会在新建 cache 时确保 keyring 中存在原生 master key，且只把 `NoEntry` 视作可初始化的缺失状态。`/api/sync/push` 的 JSON payload 已迁移到 Jackson 3 `tools.jackson`，并有真实 HTTP object payload 与全源码 import 守卫回归；OpenAPI artifact 已重新导出；定向 52/52、PC 回归 165/165、type-check 通过 | 实际下载 URL 生命周期、删除同时上传时的远端收尾、原文件临时目录清理、Asset SHA 回填/异常、应用重启和跨设备接手仍可能暴露运行时差异；系统凭据库被清除时，有加密 cache 的历史任务必须走密钥恢复，不能靠生成新密钥恢复；credential manager 拒绝访问必须报告实际 keyring 错误；Office/PDF renderer 在 Tauri 的资源和性能尚未证明 | 在 Windows Tauri +真实 Server/MinIO 验证 FILE create、OCR 中删除、移动端创建后 PC 接手、断网暂停/恢复、revision 替换和 READY 跳过 OCR；同时覆盖首次启动自动建 key、keyring 拒绝访问，以及清除/恢复系统凭据后的历史任务提示，并检查个人中心状态 | 私有临时文件无残留、删除后本地任务/cache/UI 都不复现、签名 URL 不落库、重启续传不重复 OCR、服务端 complete/indexing 和个人中心状态均有 GUI/日志证据；首次新建 package 与密钥恢复提示均经 Tauri GUI 验证 | PC/Tauri/Integration |
| P2-PC-Auth-Validation-UX | 注册页仍只做非空校验；PC 已统一读取后端 RFC Problem Details 的 `fieldErrors[]`，不再依赖旧 `errors` 对象 | 2026-08-20 Docker 后端联调确认注册请求返回 HTTP 400；2026-08-29 `r4-login-validation` 4/4、PC 全量回归 154/154、type-check/build 通过，登录页已将字段错误映射到 username/displayName/password，并在通用提示中优先展示具体校验信息 | 注册时密码长度等约束仍要等待服务端响应，未影响后端鉴权边界或数据一致性 | 在注册前同步 username/password/displayName 约束 | 注册和登录的客户端预校验与服务器 `fieldErrors[]` 均能在对应表单字段展示；保留服务端校验为最终边界 | PC/Auth |
| P2-Migration-Strategy | Flyway V1 已针对干净 H2 schema 验证，但 PostgreSQL 升级/回滚门禁尚未执行 | `V1__identity_schema.sql`、IdentitySchemaTests、2026-08-12 clean test；未运行 PostgreSQL/Testcontainers | 生产升级/回滚和 PostgreSQL 方言行为仍不可预测 | 在容器集成阶段执行 PostgreSQL clean/migrate/validate、备份恢复和迁移演练 | 干净 PostgreSQL 升级、回滚和备份恢复均有证据 | Data/Infra |
| P2-Infra-Readiness | 无 CI、监控、告警、正式备份演练 | 仓库现状 | 发布与恢复门禁不足 | 建流水线、指标、备份恢复 | 发布演练和告警测试 | Infra |
| P2-Mobile-Build-Warning | Mobile H5/微信构建有动态/静态 import 与 Sass legacy API 警告 | 2026-08-12 `build:h5` 与 `build:mp-weixin` 输出 | 未来打包与 Sass 升级可能出现行为或兼容性问题 | 明确 `useSyncStore` 的加载策略，升级/替换 Sass legacy API | 构建无对应警告，或有记录的接受决定 | Mobile |

| P1-Phase5-External-Infra | 阶段 5 的 PostgreSQL/pgvector、MinIO 主链路、默认容器门禁和 SiliconFlow embedding 单次 smoke 已通过，但真实聊天服务与异常路径未验收 | 2026-08-21 `mvn -B -ntp test` 148/0/0：PostgreSQL 17.11 + pgvector V1→V14 clean/upgrade 与 MinIO 主链路均实际运行；真实 Java Provider 链路调用 SiliconFlow `BAAI/bge-m3` 返回 1 条 embedding | 真实聊天响应、限流/断流网络、对象异常和完整部署拓扑仍可能与基线不同 | 增加 chat smoke、MinIO 异常路径和生产 Compose 验证 | migration、JPA validate、embedding 检索、对象链路、异常路径和真实 Provider 在真实依赖上通过 |
| P1-Phase5-Ingestion-Fencing | ingestion 已具备数据库锁 claim-next、lease 过期恢复、自动轮询、有限重试和 generation 原子切换，但仍没有 lease fencing | `IngestionJobService`、`IngestionWorkerScheduler`、`IngestionWorker`、`SourceChunkService`；2026-08-17 R1-03 定向 11/11 和真实 PostgreSQL 1/1，失败 generation 不会替换旧 active generation | lease 过期后的 stale worker 仍可能在极端并发/恢复场景写入较新的任务边界之外 | 为 worker 写入增加 lease token/version fencing，并补数据库崩溃/并发/重复执行测试 | stale worker 无法提交旧任务结果，重复执行、崩溃恢复和读路径均有真实数据库证据 |
| P1-Phase5-Provider-Security | BYOK/URL 已具备 HTTPS allowlist、IPv4/IPv6 SSRF、DNS 公网地址过滤与固定连接、重定向关闭/复核、超时和响应体上限；AI 失败日志现保留脱敏后的异常类名/message/root cause；真实网络、限流、审计和密钥轮换仍未验收 | `ProviderEndpointPolicy`、`ProviderHttpClient`、`PinnedSslSocketFactory`、`UrlSourceFetcher`、`AiStreamingService`；2026-08-23 原始异常日志/Authorization 脱敏回归与 `AiStreamingTests` 12/12 通过，真实 SiliconFlow embedding smoke 通过 | 真实 DNS/证书/代理环境仍可能暴露网络策略或 provider 异常映射问题；截断日志不替代完整上游诊断 | 补受控 DNS rebinding、redirect、超时、429/5xx、日志采集/轮转、审计和密钥轮换专项 | 安全专项测试和生产 secret/网络策略、日志采集记录通过 |
| P1-Phase5-Suggestion-Quality | Suggestions 是确定性基线，未接入真实 LLM、RAG citation 或质量评估 | `SuggestionService` owner check 与 controller 测试通过，返回 citations 当前为空 | 产品可能误认为已具备 AI 总结/提问质量 | 接入受控模型与 RetrievalService，增加 schema、引用正确性、提示注入和人工质量验收 | 质量指标、引用回链和人工样例验收记录完成 |
| P2-Phase5-Stream-Granularity | SSE 回调链和 OpenAI-compatible 上游增量解析已构建，但真实 Provider 网络/证书/背压和前端消费仍未验收 | `AiStreamingService`、`AiController`、`OpenAiCompatibleProvider`、`AiProviderSecurityTests`；2026-08-17 受控 SSE/超时/断流/错误测试通过 | 真实网络断线、代理缓冲、Provider 特有 SSE 变体或客户端背压仍可能影响 UI 流式体验 | 在 R2 受控真实 Provider 环境验证首包、增量、取消、断流、429/5xx、超时和前端消费 | 真实 Provider 的增量、断线、取消、超时、错误事件和前端消费契约通过 |

## 审查结论

- 2026-09-01：PC 已将 File Viewer 与离线 PDF/OCR adapter 统一到 `pdfjs-dist@5.4.624`，lockfile 已去除 renderer 的嵌套副本；扫描样本的同版本加载、无 text layer 识别和位图绘制通过。FILE 处理从本地 OCR block、加密包、upload-intent、PUT、complete 到本地 `READY` 的组合自动测试已通过；恢复批次会隔离单项异常，Profile 可对没有本地 job 的 `AWAITING_CLIENT` 文件手动开始本机处理。手动入口会先确认 Source 已同步到服务端，未确认时显示同步状态，避免将未创建的 Source 调度为原始 404；运行时会刷新 Source，状态点继续展示服务器 `VALIDATING/PARSING/INDEXING`，直至真正可提问的 Source `READY`。未挂载 Tauri runner 会显示明确限制。本机 `docker compose ps` 因 Docker 配置和 `docker_engine` 命名管道拒绝访问而无法启动真实 Server/MinIO 验证。P2-PC-File-Viewer-Validation 与 P2-PC-Document-Processing-Validation 继续开放，关闭仍需要 Windows Tauri + OCR sidecar + 真实 Server/MinIO 的扫描 PDF 预览、解析状态、索引和可提问 GUI 证据。

- 2026-08-12：后端阶段 0 已完成仓库外备份、精确路径替换、Boot 4.1 / Modulith 骨架、12 个模块边界、Problem Details、健康检查、OpenAPI 和基础测试。
- 2026-08-12：后端阶段 1 Identity 已实现 Flyway V1、User/Device/RefreshSession、密码/JWT、refresh rotation/replay 撤销、Auth 路由和 owner-scoped session 操作；19 个自动测试和 H2 test profile HTTP smoke 通过。PostgreSQL、Docker 和人工业务验收仍开放为风险。
- 2026-08-13：后端阶段 2B 已实现 Flyway V3、Source/Asset/Relation、KnowledgeBlock Source 关联、对象存储端口、核心 MockMvc 和 42 个全量自动测试；PostgreSQL、Docker、真实 MinIO、ingestion worker 和人工业务验收仍开放为风险。
- 2026-08-14：针对审核发现的同步原子性、游标高水位、墓碑快照、实时提交后事件、Review 历史回放和任务完成时间统计完成修复；新增 V6/V7 迁移，`clean test` 通过 27 个测试类、69 个 H2/JPA/MockMvc 自动测试，并增加并发 cursor 与并发 mutation 重放回归。原 P1-Sync-Cursor-Concurrency 与 P1-Sync-Snapshot-Tombstone 已关闭；PostgreSQL、双设备、浏览器 WebSocket 和前端联调仍由 P1-Test-Coverage/基础设施风险覆盖。
- 新后端继续使用 `/api` 只代表保留总前缀，不代表旧客户端兼容。R3 已完成 OpenAPI artifact/SDK 冻结，但在 R4 页面迁移和真实服务联调完成前，仍禁止声明前后端已可直接联调。
- 旧 Server 的 AuthInterceptor、WebSocket 握手/心跳审计、资产用户前缀校验只属于替换前盘点，已移至仓库外备份；新实现不得将其视为已迁移能力。
- PC、Mobile/Tablet 近期视觉与布局改动属于用户工作树成果，文档已在归档快照保留；最终构建结果须与当前代码一起记录。
- 不应依据 StudyCore 归档恢复旧目录、旧路由或旧任务。
- 2026-07-10：PC Web、Mobile H5、微信小程序、Tablet 侧栏检查和旧 Server Maven 生命周期均通过；该旧 Server 结果已被阶段 0 替换，新后端另有独立测试证据。
- 2026-07-14：PC 新建学科改为语义线条图标，已有 Emoji 不迁移；`npm.cmd run check:subject-icons` 与 `npm.cmd run build` 通过，仍需 P2-PC-Subject-Icon-Validation 所列 GUI 验收。
- 2026-07-14：PC 学科工作区右侧 AI 伴读已复刻手机端四芒星、星环、气泡、三点输入中状态和纯文本胶囊输入；`npm.cmd run check:subject-workspace` 与 `npm.cmd run build` 通过，仍需 P2-PC-Workspace-Prototype-Validation 所列 GUI 验收。
- 2026-08-11：PC 已加入 Pomodoro 页面并继续收敛 Dashboard、Timeline、Asset、全局导航和工作区交互；Mobile/Tablet 已更新平板热力图自适应布局与品牌渐变，代码变化已记录在 Changelog，仍需当前构建与 GUI/真机验收。
- 2026-08-12：PC 学科图标、工作区静态契约检查和生产构建均通过；移除弃用 `baseUrl`、删除未使用 `ElMessage` 导入后，Vite 仍提示大 chunk。Mobile H5、微信小程序构建与 Tablet 侧栏检查通过，保留既有非阻断警告，未进行 GUI/真机验收。
- 2026-08-17：阶段 5 R1-03 完成 V10/V11、PostgreSQL pgvector/HNSW 检索、generation 原子切换和历史 vector 回填；定向测试 11/11、真实 PostgreSQL 17.11 + pgvector 集成 2/2 通过。P1-Backend-Docker-Gate 已完成 Compose/db/MinIO/backend/frontend 健康门禁；P1-Phase5-External-Infra 和 P1-Phase5-Ingestion-Fencing 仍保持开放，未声称真实 Provider、lease fencing、性能或前端业务验收通过。
- 2026-08-17：R1-05 完成 V13 Conversation 版本/消息序号并发控制、五类核心列表 keyset cursor、Sync 定时保留清理/指标/reset；定向套件 16/16、全量 `mvn -B -ntp clean test` 126 通过且 1 个 opt-in PostgreSQL 测试跳过。该证据仍不等价于全量 PostgreSQL 并发、生产调度、双设备断网、前端联调或人工业务验收。
- 2026-08-17：R3 固定 `/v3/api-docs` 运行时导出 artifact，新增 OpenAPI runtime/artifact 对比测试、固定 `openapi-typescript@7.13.0` 的 PC/Mobile schema 与轻量 typed client、PowerShell 生成/校验脚本和 CI drift workflow；R3 本地门禁通过，PC/Mobile 类型与构建检查通过；G3 契约迁移前置门禁通过。R2-05 真实 Provider smoke、R4 前端页面迁移和真实业务联调仍保持开放。
- 2026-08-17：G1 已通过；默认 Surefire 启用 PostgreSQL/MinIO Testcontainers，系统 Maven 与 Wrapper `clean test` 均为 135/0/0。G1 的 Docker/零跳过门禁已关闭；真实 Provider、lease fencing、性能、前端业务联调和人工验收仍保持开放。
- 2026-08-20：针对审查发现，PC 已清除普通请求 BYOK header/浏览器明文读取，离线写入只在明确传输失败时排队并复用身份；服务端 V14 将 AI USER 请求保留在短事务内，assistant 精确关联其 USER 消息。专项 12/12、PC 58/58、OpenAPI 比对和含 MinIO/pgvector 的 `clean test` 137/137 通过。真实 Provider 与浏览器断线/刷新业务验收以 P1-PC-AI-Recovery-Validation 保持开放。
- 2026-08-20：已修复同一 `deviceId` 的重复登录会在 Profile 显示多个可撤销条目的问题：新登录撤销同设备旧 refresh session，列表只展示每台设备一条活动会话；AuthControllerTests 7/7 和 Docker Testcontainers 全量 Maven 138/138 通过。撤销 refresh session 不使已签发 access JWT 瞬时失效，远端 access token 最多可持续至 15 分钟到期；若产品要求即时踢下线，需要单独设计每请求会话状态校验或 token denylist，当前保持为开放安全/产品决策。
- 2026-08-20：正式 `/profile` 的 BYOK 卡片已读取脱敏设置、按 Provider 展示 `hasApiKey`、以请求体更新配置并在成功后清空 API Key 输入；`test:r4-pc` 58/58、type-check 和 Web build 通过。真实浏览器对服务端读取、保存、失败提示与不同 Provider 的人工联调仍未完成，继续由 P1-PC-AI-Recovery-Validation 覆盖。
- 2026-08-20：R4 Task 5 完成 PC typed API 边界、Asset upload-intent/complete/download-url、AI conversation/message SSE 和分块安全解析；PC 定向协议测试 29/29、type-check 与 Web build 通过。全局 `check:r4-pc` 仍报告后续 Task 6–8 的旧 Store/页面命中，真实后端/MinIO/Provider/GUI/业务联调风险保持开放。
- 2026-08-20：R4 Task 6 完成 PC v2 localSchema/localRepository/legacy backup 边界；临时 SQLite/localStorage 定向测试 6/6，合并 `test:r4-pc` 为 35/35，type-check 通过。旧 Store 尚未切换，P1-PC-Local-Repository-Cutover 保持开放；真实 Tauri 数据库升级、首次登录迁移选择、GUI 和前后端联调未声称通过。
- 2026-08-20：R4 Task 7 完成 cursor Sync API/Store 迁移；定向 Sync 测试 4/4，合并 `test:r4-pc` 为 39/39，type-check 通过；静态检查仅剩 Task 8/10 的 Subject/页面/AI 旧实现命中。真实后端、多设备断网、浏览器 WebSocket、Tauri、GUI 和前后端联调未声称通过。
- 2026-08-20：R4 Task 8 完成 Subject/KnowledgeBlock/Source/Asset Store 与 SubjectHall/SubjectWorkspace/Asset/Home 主路径迁移；mapping 测试纳入 `test:r4-pc` 后为 44/44，`check:r4-pc` 扫描 52 个生产文件通过，type-check/build/diff check 通过。真实后端、MinIO/Provider、Tauri、GUI、双设备和前后端业务联调仍未声称通过。
- 2026-08-20：R4 Task 9–11 完成 PC Task/Review/Stats/Chat/Pomodoro Store、剩余正式页面、AI SSE controller、环境驱动 Vite 代理和 Tauri 最小权限边界；`check:r4-pc` 57 个生产文件、`test:r4-pc` 53/53、type-check、Web build 和 Tauri `--no-bundle` 通过。MSI bundling 因宿主 `os error 5` 阻断，P1-PC-Local-Repository-Cutover、P2-PC-Tauri-MSI-Bundle、真实服务/GUI/双设备/前后端联调仍开放。
- 2026-08-20：Mobile R4-04/R4-05 完成 Pinia/Vue 对齐、统一 Tablet 测试、环境驱动 runtime、Auth/Sync/Realtime/Asset/Review/Stats/AI 新契约和用户/设备独立本地库；用户明确授权后旧全局库在认证时一次性清除。静态检查 62 文件、协议 20/20、Tablet 测试、type-check、H5/微信构建通过；微信配置、真实外部依赖、双设备和真机风险由 P1-Mobile-Platform-Validation 保持开放。
- 2026-08-21：R4-07 的 Tablet Dashboard/Review/Stats 已接入 `statsApi` 与 `reviewApi`，移除随机统计、虚构学科兜底和本地 mastery 伪写；复习事件服务端保存成功后才推进，右滑不撤销不可变事件。静态门禁红灯覆盖上述边界，随后 `check:r4-mobile`、20/20 协议测试、Tablet 测试、type-check、H5/微信构建通过；真实服务和横屏真机仍开放。
- 2026-08-21：共享 TaskSelectSheet 的 mock tasks 和 Mobile Pomodoro 固定完成数已移除；静态门禁覆盖任务空态与 Store 计数边界，验证命令保持通过。
- 2026-08-21：Mobile Settings 固定加入天数已移除；当前 User DTO 没有注册时间字段，因此页面显示中性账户元信息，避免把演示值写成业务事实。
- 2026-08-21：Tablet AI 历史会话已切换到 Conversation 列表/删除 API，移除硬编码历史和图片识别伪结果；真实 Provider、断流和上传链路仍由现有外部依赖风险覆盖。
- 2026-08-21：Mobile Pomodoro 今日计数改用 `auralis:local:<scope>:pomodoro_counts`，与 userId/deviceId 本地库保持同一 namespace，避免账号切换读取全局计数；协议回归测试增至 20/20。
- 2026-08-21：Mobile Home 空任务不再注入演示日程，Profile 统计改为真实 Task/Block Store，账号元信息不再显示固定加入天数；静态门禁覆盖 `demo-*`、固定统计和中性空态边界。
- 2026-08-21：Mobile 手写页移除 Mock 覆盖和伪 OCR 成功弹窗；当前保留本地画布并明确提示识别服务未接通，不生成虚构知识块。协议回归测试增至 20/20，真实手写识别服务仍未进入当前候选版本。
- 2026-08-21：Tablet Workspace 总结移除定时器和固定摘要，改用 `chatWithAI` 的真实 SSE 增量并在失败时保持空态；协议回归测试增至 20/20，真实 Provider/断流仍由外部依赖风险覆盖。
- 2026-08-21：修复 AI 默认凭据解析边界：服务端 env Provider 作为无 BYOK 时的 fallback，用户 BYOK 按 Provider 优先覆盖；未指定聊天 Provider 时使用 `AURALIS_AI_DEFAULT_PROVIDER`。定向配置、设置和流式测试 10/10 通过，真实 Provider smoke 与 PC 浏览器联调仍未验收。
- 2026-08-21：Tablet 新对话改为首条消息前显式创建 Conversation，并将服务端 ID 传给 SSE；避免“新对话”继续写入用户级缓存会话。
- 2026-08-21：修复 PC 注册后的默认 Subject 行为：新用户不再自动创建“未分类”，历史默认标记可普通软删除；核心领域与资源归属回归 7/7 通过，浏览器空状态和删除操作仍待人工验收。
- 2026-08-21：修复 PC 学科工作区 AI 回溯：每次进入或切换学科创建新的伴读会话并清空当前消息，不恢复旧会话；PC 回归测试 59/59、type-check 和 SubjectWorkspace 静态契约通过，浏览器真实 SSE 仍待人工验收。
- 2026-08-21：补齐 PC 个人空间登出入口：确认、服务端 logout、本地清理和 `/login` 跳转已接入；PC 回归测试 62/62、type-check、Web build 通过，浏览器实际点击和服务端失败态仍待人工验收。
- 2026-08-21：修复 PC 学科大厅编辑无法保存：编辑表单补回 Subject `version`，更新请求继续遵守 `baseVersion` 并发契约；PC 回归测试 63/63、静态检查、图标契约、type-check 和 Web build 通过，浏览器实际编辑/刷新仍待人工验收。
- 2026-08-22：修复 PC 资产库“全部任务”仍显示固定演示任务且看不到真实任务：改用 `useTaskStore.fetchTasks()`，同时填充全部任务和学科任务目录；PC 回归测试 64/64、静态检查、图标/工作区契约、type-check 和 Web build 通过，浏览器资产库展示与状态切换仍待人工验收。
- 2026-08-22：PC Dashboard/Timeline/Asset 任务视图规则已统一：排期队列只显示有截止时间且未排期的未完成任务，时间轴为今天起 7 日窗口且保留已完成排期，资产库按未分布/未完成/已完成分组，导入入口聚焦未分布。`test:r4-pc` 73/73、type-check、静态检查、图标/工作区契约和 Web build 通过；P2-PC-Frontend-Refactor-Validation 继续开放，待浏览器/Tauri 实际走查宽屏不裁切、拖拽排期、完成/移出排期和导入跳转。
- 2026-08-22：资产库任务编辑已移除负荷按钮并改为 30 分钟步进的预计用时，Task Store 更新接口覆盖标题、备注、截止日期及时长；`test:r4-pc` 73/73、type-check 与 Web build 通过。P2-PC-Frontend-Refactor-Validation 仍开放，待浏览器实际编辑、刷新后持久化与错误态验收。
- 2026-08-22：修复时间轴周视图与日视图不一致：日视图增加半小时排期槽位匹配，已过去排期保留并以删除线展示；`test:r4-pc` 74/74、type-check、静态检查和 Web build 通过。P2-PC-Frontend-Refactor-Validation 仍开放，待浏览器跨日、半点排期和拖拽走查。
- 2026-08-22：PC Dashboard/Timeline 时间轴改为共享的当日居中 7 日窗口（前后三天），所有可见列显示真实日期；日期边界与任务筛选回归使 `test:r4-pc` 达到 75/75，type-check 通过。P2-PC-Frontend-Refactor-Validation 仍开放，待浏览器跨月/跨周日期、半点排期和拖拽走查。
- 2026-08-22：修复 PC 时间轴拖拽失效和任务块错位：补齐原生拖拽数据、等待 drop 排期写回、按半小时槽位/间距计算任务高度，并将首页日期格改为只显示日期、顶栏显示完整星期/月日；`test:r4-pc` 77/77、type-check、静态检查和 Web build 通过。P2-PC-Frontend-Refactor-Validation 仍开放，待浏览器实际拖拽交换、跨槽位任务高度和窄栏视觉走查。
- 2026-08-22：根据日期边界反馈，Dashboard/Timeline 从当日居中滚动窗口恢复为从当天开始的连续 7 日单周窗口；首页日期选择器改为纯日数字、选中圆形背景，标题改为“时间轴 · X月”。P2-PC-Frontend-Refactor-Validation 仍开放，待浏览器验证跨周排期不消失、拖拽写回和窄栏视觉。
- 2026-08-22：按最新需求将 Dashboard/Timeline 日期窗口改为当前/所选日期所在的自然周（周日至周六），首页日期数字上方显示 `Sun` 至 `Sat` 英文星期缩写，选中徽标保持约 36px 圆形绿色背景。P2-PC-Frontend-Refactor-Validation 仍开放，待浏览器验证周日/周六边界、跨周拖拽和窄栏视觉。
- 2026-08-22：PC 全局排版已收敛到 16px 根字号、语义字号令牌和统一字体栈；普通 UI/控件使用 `--font-family-base`，代码/图表等宽内容使用 `--font-family-mono`，已移除 Pomodoro、Dashboard、KnowledgeGraph 的局部字体族。`test:r4-pc` typography contract 纳入回归；P2-PC-Frontend-Refactor-Validation 仍开放，待浏览器窄栏、深色主题和字体加载后的实际视觉验收。
- 2026-08-22：修复 PC Dashboard 已排期任务拖拽后仍停留在旧时间的问题：显式目标 `startTime` 现在覆盖旧 `scheduledAt`，未提供时仍保留原排期；新建/复习任务和 Store 缺省时长统一为 30 分钟倍数。`test:r4-pc` 81/81、type-check、静态检查和 Web build 通过。Docker 测试账号 17 个任务的时长与排期已统一到半小时粒度，P2-PC-Frontend-Refactor-Validation 仍开放，待浏览器实际拖拽和刷新后持久化走查。
- 2026-08-22：修复 PC 学科工作区文件登记前端静默失败、Docker MinIO 预签名 URL 使用容器 hostname 以及直传 CORS 缺失。`test:r4-pc` 82/82、type-check、静态检查、后端 clean test 149/149、MinIO public endpoint 集成测试 2/2 和 Compose config 通过；push 后 Docker 重建、frontend/backend 健康、HTTP readiness 和 `localhost:5173` CORS 预检均通过。新增 P2-PC-Asset-Upload-Validation 风险，关闭条件为真实浏览器上传、Source 列表刷新和失败重试均通过。
- 2026-08-22：为 Docker backend 增加资产直传与 Source 登记阶段日志，能从 `docker logs` 区分 intent、complete/HEAD、READY、校验拒绝和 Source 创建；日志已脱敏。P2-PC-Asset-Upload-Validation 仍开放，需结合这些阶段日志完成真实浏览器上传/登记/失败重试走查。
- 2026-08-22：补齐本地 `http://127.0.0.1` 访问时 MinIO CORS 白名单缺失，upload-intent 201 后浏览器 PUT network error 的配置问题；重启 MinIO/backend 后预检 204 通过。P2-PC-Asset-Upload-Validation 仍开放，待浏览器刷新后完成真实上传登记。
- 2026-08-23：PC 学科文件工作区将总结从原文件预览容器拆为独立 `· 总结.md` 虚拟文件项，点击原文件不再同时渲染总结；总结项支持独立 Markdown 阅读和下载，关联知识块仍写入原始 Source。`test:r4-pc` 93/93、type-check 和 Web build 通过；P2-PC-Frontend-Refactor-Validation 仍开放，待浏览器走查文件切换、Markdown 下载和深色/窄栏布局。
- 2026-08-23：修复 PC Dashboard 窄宽待办条目中长学科名称挤掉任务名称的问题；`.todo-subject` 现在允许收缩、限制最大宽度并省略显示，任务名称保留主 flex 空间。`test:r4-pc` 94/94、type-check、静态检查通过；P2-PC-Frontend-Refactor-Validation 仍开放，待浏览器缩放/窄栏和长中英文名称人工走查。
- 2026-08-23：修复 PC 学科文件登记的本地优先 Source 未保留上传字节数，避免同步完成前显示 `0.0 MB`；上传大小仅用于本地展示，不进入 Source 创建请求。`test:r4-pc` 94/94、type-check 和 Web build 通过；P2-PC-Asset-Upload-Validation 仍需浏览器刷新、既有文件与新文件 GUI 验收。
- 2026-08-23：PC 学科文件栏改为只显示真实 Source 文件，移除独立 `· 总结.md` 虚拟项；知识块入口承载总结，文件预览由 `FilePreview` 直接渲染，文件行新增确认后的 Source 软删除。后端新增 30 天默认保留的 MinIO 清理调度，清理后保留 Asset/Source 审计行并标记 `ORPHANED`。`test:r4-pc` 95/95、后端全量 155/155、Compose config、Docker 重建、backend healthy、frontend HTTP 200 和 readiness `UP` 均通过；P2-PC-Workspace-Prototype-Validation、P2-PC-File-Viewer-Validation 和 P2-PC-Asset-Upload-Validation 仍以浏览器人工验收为关闭条件。
- 2026-08-23：PC File Viewer 预览工具栏收敛为底部页码/缩放/旋转三组控件，隐藏通用搜索、下载、打印、HTML、主题和 PDF 导航侧栏；`test:r4-pc` 99/99、type-check、`check:r4-pc` 与 Web build 通过。P2-PC-File-Viewer-Validation 仍开放，需用真实 DOC/DOCX/PDF 样本确认底部定位、分页、缩放、旋转、资源加载和窄栏布局。
- 2026-08-23：PC File Viewer 改为统一预览面板：学科页文件名顶栏承载缩放/旋转，bare 预览主体底部同级显示页码/总页数和前后页，去除 renderer 内层边框/圆角；补充 renderer 就绪前后的控制队列、上下栏投影、实体按钮状态和 24–32px 文档安全留白；`test:r4-pc` 101/101、type-check、`check:r4-pc` 与 Web build 通过。P2-PC-File-Viewer-Validation 仍开放，需用真实 DOC/DOCX/PDF 样本确认底部定位、分页能力、缩放、旋转、资源加载和窄栏布局。
- 2026-08-23：PC File Viewer 控件继续收敛：去除顶栏外层容器，缩放显示实际倍率，旋转提供线条左旋/右旋图标和角度；顶栏按钮不再以 `previewControlsReady` 禁用，renderer 负责队列执行，DOC/DOCX 旋转由外层视图状态驱动，文档上下留白改为 12–16px。`test:r4-pc` 101/101、type-check、`check:r4-pc` 与 Web build 通过。P2-PC-File-Viewer-Validation 仍开放，需用真实 DOC/DOCX/PDF 样本确认按钮点击后的页面缩放、左右旋转可视区域、分页、资源加载和窄栏布局。
- 2026-08-23：根据真实 PDF 截图反馈，移除宿主“正在渲染文档”遮罩，缩放改为 File Viewer 视图状态 API 并将首次宽度 fit 限定到用户首次交互，缩放与旋转分别使用同款圆角控制组；定向预览回归 16/16，完整 `test:r4-pc` 101/101、type-check、静态检查和生产构建均通过。P2-PC-File-Viewer-Validation 仍开放，需确认真实 PDF/DOCX 点击缩放后的页面尺寸和加载完成后的可视区域。
- 2026-08-23：针对 PDF/图片缩放、旋转无响应反馈，移除 FilePreview 与 renderer 中依赖 `load-complete` 的两级 ready 硬门禁；动作只在组件 ref 尚未建立时暂存，缩放和 PDF/图片旋转继续通过 File Viewer `applyViewState`，图片内部旋转工具栏隐藏，Office renderer 保留外层旋转回退。定向预览回归 16/16、`test:r4-pc` 101/101、type-check、静态检查和 Web build 通过。P2-PC-File-Viewer-Validation 仍开放，需确认真实 PDF/图片点击缩放与左右旋转后的页面状态。
- 2026-08-23：继续以 Chrome 调试 PC File Viewer，确认前一轮 ready 门禁调整不是最终根因；点击会抛出 `viewer.getZoomState is not a function`，原因是 `@file-viewer/vue3-full@2.3.2` 包装组件的空 `Proxy` expose 未形成 Vue 父级可调用方法。renderer 已切换为 `@file-viewer/vue3@2.3.0` 基础组件并使用 `withFullViewerOptions`，缩放调用公开的 `zoomIn`/`zoomOut`/`resetZoom`，旋转调用 `applyViewState`。Chrome 合成图片实测宽度 800px→896px、角度 0°→90°；定向回归 16/16、完整 PC 回归 101/101、type-check、静态检查、Web build、Docker 无缓存重建、容器镜像一致性与 HTTP 200 均通过。P2-PC-File-Viewer-Validation 仍开放，仅保留真实业务 DOC/DOCX/PPT/PDF/图片/文本和 Tauri GUI 验收。
- 2026-08-23：按截图移除 PC 学科文件列表行左侧的文件类型图案，保留文件名、大小、选中态和删除操作；新增静态回归断言，定向预览回归 17/17、完整 `test:r4-pc` 102/102。P2-PC-File-Viewer-Validation 仍开放，需人工确认窄栏、长文件名和真实样本布局。

## 推荐关闭顺序

R1-06、G1、G2 与 G3 契约迁移前置门禁已完成代码、配置和自动测试闭环；仍需完成 R2 剩余真实 Provider/异常专项和 R4 前端契约迁移验收。

2026-08-17：R2 代码/配置基线已完成，Compose config/build/up/health、真实 PostgreSQL 17.11 + pgvector 2/2、真实 MinIO 1/1 和 Provider stub 2/2 已通过；MinIO 异常路径、真实 Provider smoke 仍需要明确模型、key 和网络窗口。

1. 完成阶段 1–5 的 PostgreSQL/Testcontainers/Docker/MinIO/Provider 外部门禁，验证 Sync、Source ingestion 和 pgvector 检索在真实依赖上成立。
2. 补齐 ingestion generation/崩溃恢复、BYOK/SSRF/限流专项和真实 SSE 取消/断线契约。
3. 完成真实 Suggestions/RAG citations 的质量与提示注入验收、双设备断网恢复和真实 WebSocket。
4. 完成前端新契约联调，生成客户端后进行 PC/Mobile/Tablet 主流程和人工业务验收。
5. 完成 Docker/基础设施集成、CI、备份、监控和发布演练。

## 更新方式

新增风险时必须提供 ID、优先级、证据、影响、动作和关闭条件。关闭后移除该表并在 Changelog 记录可确认变化；历史讨论不留在本文件。

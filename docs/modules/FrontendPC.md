# PC 前端模块

更新时间：2026-11-16

文档状态：现行模块说明

权威范围：PC 的目录、页面、状态与服务边界、开发命令及验收限制

事实来源：`Auralis-PC/package.json`、`src/router/index.ts`、`src/store/`、`src/services/`、`src-tauri/` 与现行契约

## 模块定位与阅读入口

`Auralis-PC` 是桌面与 Web 共用的 Vue 客户端，浏览器构建由 Vite 提供，桌面能力由 Tauri 2 提供。本文维护当前实现结构与行为；验证结果和未关闭问题分别维护在[当前状态](../current/Status.md)与[问题登记](../current/IssuesAndReview.md)，视觉细节见[前端设计](../project/FrontendDesign.md)。

逐轮实施、测试数字和当时部署状态保存在[整理前原文](../archive/snapshots/maintenance-2026-11-13/FrontendPC.md)，仅供追溯，不代表当前运行版本。新增变更应更新对应章节，不再在文件顶部追加任务流水。

## 技术栈与目录

| 依赖 | package / Cargo 声明 |
| --- | --- |
| Vue / Vue Router | `^3.5.32` / `^4.6.4` |
| Vite / TypeScript | `^8.0.10` / `~6.0.2` |
| Pinia / Element Plus | `^3.0.4` / `^2.13.7` |
| Tauri API、CLI、Rust | `2.11.1` |

依赖声明不等于安装包或 GUI 已验收。

| 目录 | 职责 |
| --- | --- |
| `src/api/` | HTTP、Chat SSE、同步、资产、鉴权和 Tauri 调用 |
| `src/auth/`、`src/router/` | 会话边界、公开/受保护路由 |
| `src/store/` | Pinia 页面投影与操作入口 |
| `src/services/` | 本地仓储、同步、复习、专注、Overview 与文档处理 |
| `src/components/`、`src/views/` | 共享组件与正式页面 |
| `src/styles/` | 全局设计令牌和样式，入口为 `index.css` |
| `src-tauri/` | Rust、本地文件、OCR、权限和桌面配置 |
| `scripts/` | 协议、行为与静态检查 |

UI 使用语义字体、颜色和字重令牌；图标解析集中在 `src/utils/subjectIcon.ts`，使用语义键对应的 Tabler 图标，缺省为书本图标。TypeScript/Vue 源码旁的同名编译输出不是另一份源码，现行配置继承 `noEmit: true`。

桌面语言、自动同步、自动概览分别使用 `auralis.settings.language`、`auralis.settings.autoSync`、`auralis.settings.autoOverview`；新键缺省值为简体中文、开启、开启，不读取或迁移旧键。主题通知统一为 `auralis:theme-change`。本地完整 Overview 缓存形成上传意图时使用 `LOCAL_CACHE_SEED`，正常缓存上传与冲突规则保持。认证状态统一由 `useAuthStore` 管理，请求层复用认证边界工具函数。

## 正式路由与页面职责

| 路由 | 页面 | 职责 |
| --- | --- | --- |
| `/login` | Login | 公开登录、验证码注册与找回密码 |
| `/` | Dashboard | 日程、待办、搜索与快速创建 |
| `/subjects` | SubjectHall | 学科搜索、创建、编辑、删除 |
| `/subject/:id` | SubjectWorkspace | 文件、知识、任务、复习统计、图谱与 AI |
| `/asset` | Asset | 跨学科资料、知识块和任务管理 |
| `/timeline` | Timeline | 时间槽位、拖放、插入与取消排期 |
| `/profile` | Profile | 个人资料、设置、同步、AI 额度与处理中心 |
| `/pomodoro` | Pomodoro | 排期任务专注与自由学习 |

除 `/login` 外均要求认证。`router.beforeEach` 使用 `resolveAuthRedirect`；未登录进入 `/login`，已有完整会话访问登录页时，优先回到安全的返回地址，否则回首页。`App.vue` 的认证壳、侧栏和搜索只在认证页面挂载。Server API 仍独立校验 access token。

登录可用用户名或已验证邮箱，注册与找回密码均使用邮箱验证码。注册、重置与改密共用新密码校验：至少 8 位，包含大写字母、小写字母和标点或符号，最多 72 个 UTF-8 字节。旧密码登录不受新复杂度校验影响。桌面登录页有透明拖动区，窗口按钮在悬停或键盘聚焦时显示。

## 会话、请求与数据隔离

- `useAuthStore` 管理用户、token pair、本地登录世代和服务端 session。普通 token 轮换保留本地登录身份；退出后重新登录同一账号仍使旧操作失效。
- 普通/AI Axios、同步请求与 Chat SSE 在派发、刷新和回包前复核登录世代。旧操作以 `SYNC_SCOPE_CHANGED` 结束，不能向新会话发布结果。
- 知识块创建在本地原子提交前记录登录世代；若提交期间切换会话，写入仍归属原账号仓储，但不更新当前知识投影或调度新会话同步。
- 同一登录世代共享一次在途 refresh，每个业务请求最多重放一次。明确续期失效时进入 `reauthentication-required`，停止受保护工作并导航登录，保留原受保护入口。暂时性续期故障保留本机会话。登录、注册、邮箱发码、密码重置、显式 refresh 和 health 使用公开入口。
- Element Plus 确认与密码输入弹窗依赖入口全局加载的 `el-overlay.css`，确保遮罩固定于视窗；个人中心危险操作及文件删除继续要求确认。
- 登出使用发起时的凭据，确认、清理、通知和导航绑定同一世代。BYOK 密钥不从浏览器存储读取或作为自定义请求头发送。
- `main.ts` / `DesktopDatabaseStartup.vue` / `StartupSplashScreen.vue` 在应用渲染前提前同步持久化暗色主题，并在桌面 SQLite 初始化成功且 `router.isReady()` 解析初始路由后才卸载启动页并挂载 `App.vue`；失败时显示「无法打开本地数据库」与「重试」，初始化失败时不启动同步、解析和资产整理。
- 已登录冷启动在主窗口就绪前通过 `StartupSplashScreen.vue` 与 `startupBootstrap.ts` 并行完成本地投影加载（学科、知识块、任务与专注态）、各受保护路由分片预加载（`routePreload.ts`）与受控初始同步预热（遵守 `autoSyncEnabled` 与在线状态，受最长等待上限与登录世代围栏约束，并在退场后启动文档处理后台运行时）；`router/index.ts` 与 `vite.config.ts` 预构建 Element Plus 样式子路径、热身核心页面并在动态模块拉取失效时执行限同源路径与冷却上限的单次自愈重载。
- Rust Tauri 命令 `local_asset_store`（导入、解析、字节读取、PUT 上传、删除、磁盘对账）、`crypto` 密钥检查/生成与 `document_upload_put` 均通过异步 `spawn_blocking` 在后台线程池执行，避免阻塞桌面 WebView 主界面线程。

## Store 与 API 边界

| Store | 主要职责 |
| --- | --- |
| `useAuthStore` | 登录、token 与会话 |
| `useTaskStore` | Task 本地投影、排期命令、状态和 mutation |
| `useSubjectStore` | 学科投影、创建编辑与删除 |
| `useSourceStore` | Source、本地资料目录、Asset 元数据和删除 |
| `useKnowledgeStore` | 知识块内容、本地读取与 mutation |
| `useAssetStore` | 本地资产、upload-intent/PUT/complete、下载地址 |
| `useSyncStore` | cursor、push/pull/snapshot 和后台调度 |
| `useReviewStore` | 学科本地复习生命周期、队列、核对与补传 |
| `useStatsStore` | 服务端个人统计与本地学科统计展示 |
| `useChatStore` | 会话、run/attempt、流式投影与显式恢复 |
| `usePomodoroStore` | 用户/设备隔离的计时状态与专注事件 |
| `useSettingsStore` | 主题和偏好 |
| `useDocumentProcessingStore` | 文档任务、OCR 进度与手动恢复 |

API 包装集中在 `src/api/`：`request.ts` 管理普通请求；`aiClient.ts` 与 `src/types/chatProtocol.ts` 管理 Chat；`useReviewApi.ts` 使用生命周期接口；`useOverviewResultsApi.ts` 读写独立总览结果；`useFocusSessionApi.ts` 上传稳定 `clientSessionId` 的最终专注事件。完整字段和端点见 [API](../contracts/API.md)与 [Chat Runtime API](../contracts/chat-runtime-api.md)。

`api/generated/schema.ts` 来自冻结 OpenAPI，禁止手改。仓库根目录的 `scripts/generate-openapi-sdk.ps1` 生成两端类型，`scripts/check-openapi.ps1` 核对产物。共享类型更新不能作为调用端完成接入的证据。

## 本地仓储与同步

- `localSchema.ts` 当前版本为 **14**，启动直接创建现行完整 schema；不再执行旧表搬迁、旧字段清洗或旧版本升级。既有当前版本数据库正常打开，清理代码不删除已有表和数据。Web 使用自身本地存储；完整字段和迁移边界见[数据库契约](../contracts/Database.md)。
- Subject、Source、KnowledgeBlock、Task 常规写入通过 `commitMutation()` 原子持久化资源投影和 immutable outbox，提交成功后才更新 Pinia 并请求后台同步。列表先 hydration 本地投影，不在 loading 中等待网络。
- 普通命令首次领取后固定 ID、版本与载荷；丢包或重启原样重放。队首在本地事务结算，重复回执不会重复写投影；同资源有未解决本地写入时，push/pull/snapshot 不覆盖该投影。普通 `TASK` CRUD 在遇到 `CONFLICT`（带有效云端快照）、`MUTATION_REJECTED`（含同版本冲突或有效快照）、`RESOURCE_NOT_FOUND`/`RESOURCE_DELETED` 或 `CREATE` 失败时直接按服务端权威状态或墓碑归档收敛，存在队列后继时先归档失效前驱而不覆盖后继；缺失有效内联快照的 `TASK` 拒绝（如 `VALIDATION_FAILED`）推迟到 `getSnapshot()` 成功并经 `resolveRejectedTaskMutation` 对齐后才结算，且 `useTaskStore` 通过版本/排期指纹令牌抑制同一拒收过期任务的无限重试循环（任务属性或版本变更后自动解除）。
- `syncScheduler` 合并后台请求；共享 cursor cycle 串行处理同步。用户“立即同步”和 FILE 处理前确认 Source 已同步属于显式等待边界。
- `localDatabaseRuntime` 缓存初始化和 scope 仓储，`localSqlQueue` 串行 SQL 插件访问；`LocalRepository.replaceSnapshotPreservingPending` 在同一事务替换快照并保留待同步修改，桌面端 SQLite 单连接池启用 `PRAGMA journal_mode = WAL`、`PRAGMA synchronous = NORMAL`、`PRAGMA temp_store = MEMORY` 与 `busy_timeout = 5000`。
- Subject 删除由 durable DELETE marker 与 `subjectDeletionCoordinator` 协调：先隐藏子投影及清理其 outbox，后续重放 Overview、任务、草稿和资产清理；pending/rejected 保留可恢复资料，最后引用释放才删除共享资产。
- Profile 的离线重置通过 Sync Store 的当前账号仓储。不再扫描或备份旧未分配账号的数据。

## 搜索、学科与资料编辑

- `SearchPalette` 读取当前账号本地仓储，不改变知识列表学科范围或共享投影。输入变化、清空和关闭使旧查询失效，防抖/读取期间不可提交旧结果；输入法组合回车不导航。
- 搜索随登录世代重建，退出清空面板和知识投影，迟到读取不能发布；首页搜索详情加载同样复核世代。普通 token 轮换保留搜索。
- 首页日程按任务 ID 防重复写入，结束后按实际投影校准复选框。快速创建在写入期间锁定提交与关闭，失败保留表单并提示；`TaskCreateDialog.saving` 由调用页传入。
- 学科新建和改名在本机活动学科中去首尾空白、忽略大小写查重，改名排除自身；保存保留用户大小写。跨设备重名仍由服务端处理。
- 知识块和任务详情使用独立草稿。刷新只合并未编辑字段，保存保留原版本进行冲突校验；资源删除关闭详情，不能用旧详情覆盖墓碑或新版本。
- 学科工作区的知识块详情按 ID 跟随本地投影。编辑时保留草稿和原版本，确认使用新版本继续编辑时只合并未改字段。同步冲突显示本机内容与当前云端状态，用户可采用云端版本，或以最新版本重试本机修改。两处创建入口共用提交锁，失败保留草稿。删除校验确认时的版本，收到明确的云端拒绝回执后按服务器记录恢复有效知识块或保留墓碑。
- 资料管理按原分组恢复当前文件，并使用最新的本地投影刷新标题和预览信息。若文件移入另一个已显示的学科，选择跟随新学科。当前文件同步删除后，中栏和星图回到各自的空态。
- 知识详情复制优先 Clipboard API，失败使用临时文本框路径并恢复焦点/选区；只有实际成功才显示成功反馈。
- 学科工作区的 Chat 初始化与本地资料读取并行；会话未就绪时不发送，失败保留输入并允许从现有新会话操作恢复。

## 文件导入、预览与处理

- 本机文件登记和上传完成后的草稿释放共用资产生命周期锁。原文件还在上传时先保存本机草稿。服务端确认原件就绪后才发出资料登记。原文件上传队列按最近到期的退避任务唤醒，沿用当前账号和设备的后台同步条件。手动同步区分原文件仍在等待或失败的状态。资料库的索引、失败和就绪徽标取自当前 Source。等待本机处理时，仅显示与当前资料 ID 和 ingestion revision 一致的本机进度。本机提交完成但 Source 还在等待时显示「已提交，等待索引」。
- 文件选择器和拖放复用登记弹窗；换选更新默认标题但保留自定义标题。Source 标题与原始 File 名称分开，解析和预览依据 Asset 的 `originalName/mimeType`，改标题不改变文件格式。
- 已登记文件先原子保存 Source 墓碑与 DELETE outbox，再从列表移除；纯本机文件还写入草稿 `DELETED`。工作区切换到同学科剩余首项或总览，删除期间用户改选/切学科优先。后台清理不阻塞切换，旧登录/旧学科读取不能覆盖新视图。
- `FilePreview` 按资产和请求身份隔离结果。带资产 ID 的加载失败提供手动重试，加载期间不重复提交；现有分页保留，不自动轮询重试。
- 已有云端原件的资料若本机副本大小或哈希校验失败，预览会尝试从云端取回原件。本机副本保留，未完成上传的草稿仍显示本机读取错误。PDF 解码报错或阅读器 60 秒内未就绪时，错误区显示本地化提示和「重试」，点击后重新加载当前文件。
- `documentProcessing/runtime.ts` 组装隐藏 `BackgroundParserHost`、PDF.js/Office、OCR、加密 cache、上传协调器与 scope job repository。`SourceJobScheduler` 只调度具备 `assetId/ingestionRevision` 的 `AWAITING_CLIENT` FILE，TEXT/URL 不进入队列。
- FILE 启动前确认本地 Source 已同步；每次处理核对 Asset SHA，旧 revision 被 supersede。自动恢复处理未暂停 pending jobs，`PAUSED_NETWORK` 必须由用户继续；有 receipt 时直接续传，不重跑 OCR 或原文件下载。
- `ParsedDocumentUploadCoordinator` 校验 receipt 后由 Rust 解密流式 PUT；前端不持久化正文或签名 URL。明确 `COMPLETE_ACCEPTED` 后请求后台同步，回调失败不撤销 accepted 状态。服务端 complete 后清理加密 cache，临时输入由 scheduler 回收。
- Source lookup 仅将该边界的结构化 404/`RESOURCE_NOT_FOUND` 归为 `SOURCE_NOT_FOUND` 并清理任务；503 及解析/上传错误不能误当资源已删除。恢复批次隔离单项失败。
- PDF 本地解析与预览共用精确版本 PDF.js 和本地 worker；PPTX 读取 OOXML 的真实幻灯片信息，legacy `.ppt` 不当作 `.pptx`。Office 图片缺少可靠分页时明确报不支持。
- 新加密 cache 的密钥只在 OS keyring 明确 `NoEntry` 时创建；已有 cache 只能读既有密钥，不以新密钥覆盖历史密文。receipt 可持久化，签名 URL、headers 和原始路径不可持久化。
- 处理中心保留本地与服务端真实阶段、页级 OCR 进度、索引状态和失败恢复。长文件名/错误文本截断保留操作区，网络暂停显示明确继续入口。

## Overview Markdown 与同步

- 现行内容为 `schemaVersion=2` 的 `outlineMarkdown` / `summaryMarkdown`。分项生成允许另一项 null，正式完整结果两项必须非空；持久化拒绝空白 Markdown。
- 大纲直接编辑 Markdown，与总结共用渲染。旧章/节、provenance 与候选输入路径不参与新生成，不自动转换旧内容；新建 SQLite 缓存只定义 Markdown v2 列，不提供 v1 缓存或 outbox 的转换、重试与覆盖流程。
- `outlineVersion/summaryVersion` 各自必须是非负整数，不从总版本推导。404 表示缺失；409 可仅含真实版本元数据，保留草稿供显式重试，不能把元数据展示为空白内容或无限用 baseVersion=0 重试。
- 生成前立即置位状态，运行期间保留上次缓存、禁止重复触发，并提供停止操作。取消和回包受登录、来源修订、页面生命周期及编辑代次约束，迟到生成不覆盖未保存编辑。
- 总览独立 GET/PUT 与核心 Sync 分离，服务为 `overviewRepository`、`overviewGenerationService` 和 `overviewResultsSyncService`。学科批量状态按最多 100 个 ID 查询；未变版本跳过 GET，缺失/不可用不产生循环请求或删除本地草稿，当前 v2 完整本地结果可进入补传。
- 文件大纲的读写按当前解析修订查找，修订未知时仅展示已有结果。文件和学科大纲保存均确认提交时的文本，后续输入留在编辑器中。
- 总览同步用完整的有效文件清单校验待写记录，以每批最多 500 个文件处理全部清单，再按每批最多 100 个学科查询状态。文件处理结束后才组装学科来源清单。来源已更新时重新核对修订后再判定待写记录是否过期。单个学科超过 100 份文件时，仍会跳过该学科的总览同步。
- 文件与学科大纲均保留 Markdown 标题、列表、代码、引用和暗色主题层级；具体样式令牌由前端设计维护。

## Chat 会话与流式内容

- Chat 消息正文选区提供「添加到对话」与「保存为知识块」。前者追加到输入区引用并由用户手动发送；后者预填当前学科的知识块编辑器，确认保存后创建。Chat 选文标记为「对话选文」，不自动关联当前打开文件；文件预览选文仍关联其有效文件。
- FAILED 助手回复隐藏该次残留正文、过程与引用，仅显示错误和重试；已完成轮次和已提交题卡保留，UNKNOWN 与中断回复沿用各自的恢复展示。持久消息及账本不随界面隐藏而删除。
- 会话绑定资料读取范围；首轮确定范围，后续省略 `readingContext` 继承绑定，显式不同范围交由服务端报告冲突。`selectionText` 在命令顶层，不改变会话范围。
- `aiStreamReducer` 按 run/attempt/sequence 接收事件，正文、过程和结构化块按到达顺序构成 `ChatContentPart[]`。块 started/item/completed/error 原位更新，失败项保留已有效内容，重试替换对应失败块。
- 活动题卡从 READY 提交后发布的 `block.completed` 读取规范结构，提交复用稳定 `submissionId`，点评失败可重试回复。重试清理当前轮未完成助手气泡，保留其他已完成轮次。
- 有 run ID 时，SSE 提前结束或断开都查询原 run。状态仍在执行或暂时查不到时保留停止入口，并在现有上限内继续查询。首帧前结束时保留原命令，供用户显式重试。UNKNOWN 恢复按服务端消息 ID 关联原 run 和 attempt，核对会话和操作世代后再更新消息。题卡按协议 1 的现行字段显示；提交与重试受当前会话绑定及活动状态约束。
- Store 的加载/创建、流回调、轮询和取消提交均核对操作世代与登录身份。新会话失败恢复仍在当前学科/账号的原活动 run 查询并保留输入。
- 首帧前断线无 run ID 时，重发原独立命令快照，保留 request ID、范围省略、引用和活动答案；已有 run ID 使用 attempt 重试。既无 run ID 又无快照时明确拒绝重发，不重建新载荷。
- 断流后只查询原 run；RUNNING 保持占槽，UNKNOWN 停止轮询并提供显式恢复。查询最多 220 次、间隔 1.5 秒；到限保留未确认状态，不伪造终态或自动调用 Provider。
- 终态历史回读按服务端消息 ID 复原关联。UNKNOWN 恢复只调用服务端恢复入口；409 后重新读取状态，不自动循环恢复或重试。
- `smoothStreamBuffer`、Chat renderer 与 Markdown 工具负责流式显示；展示缓冲不改变服务端持久化和计费状态。

<a id="2026-10-12-timeline-离线排期命令"></a>

## 任务、时间线与专注

- Dashboard 只展示线性日程和待办；槽位拖放统一由 Timeline 承担。Task 读写统一使用 title/description/durationMinutes，startTime 仅为 scheduledAt 的时分展示投影；无数据颜色字段，外观来自主题令牌。
- Dashboard 周日期条在星期缩写下方只显示日序号数字，避免本地化日期格式附加“日”等单位。
- Timeline 的空槽插入、卡片主体放置、标题换位、周列跨天和拖回待办都交给 Task Store。预览与提交共用排期计算，以任务 ID、原排期的实际时刻与落点完整日期核对操作。等价时间戳写法允许当前拖放继续，实际改期时提示重试。取消拖动立即清除高亮。
- 排期通过现行本地命令队列持久化，本地提交后立即更新页面，后台按顺序同步。周视图拖到同一天保留原位，跨天默认发送 `SCHEDULE_INSERTION` 的 `STRICT` 放置。取消排期结算前拖回周视图，放置命令排在取消之后。已有普通创建或更新的任务，在排期队列结算后沿用单任务更新链，避免抢先占用尚未腾出的时段。时长、重叠、截止时间与固定任务约束继续在领域规则校验。
- 连续换位的前一笔回执在计算后、写入前推进版本时，本地事务复核排期、任务状态、时长和截止时间。计算基线一致时使用当前版本，只修改两个开始时刻并保留最新任务资料。实际排期基线变化时提示重试。服务端拒绝后，本地恢复结束即发布任务刷新和错误提示，随后独立执行增量下拉。
- 日视图行间留白计入上一行的落点。卡片主体的计算落点与源任务当前位置相同，显示「已在目标时段」。日视图和周视图的排期区域禁用文字选取，任务编辑表单仍可选取和复制文字。
- 创建任务保存期间防止重复提交，保存失败保留草稿。删除结果使用现有消息反馈。
- 时间线日视图和周视图卡片的 × 为「移回待办」，复用取消排期队列并保留任务内容；本地写入期间禁用重复点击，失败显示排期错误。
- 已完成排期任务保留原槽位并固定，禁止移动、替换或取消；恢复为未完成后才允许调整。仅接受 `TODO/IN_PROGRESS/DONE/CANCELLED` 领域状态。
- 取消排期返回匹配源任务的 `REJECTED/RESOURCE_NOT_FOUND` 且无 current 时，使用快照恢复受影响任务、结算队首并撤回未发送后继；快照缺失则按原 mutation ID 重试。
- 专注任务列表和当前任务说明显示具体月、日与时间；跨年补全年份，按界面语言格式化。
- 专注计时生命周期独立于 TimerCore 挂载，支持排期任务和自由学习。活动状态与最终 focus event 按账号/设备原子保存，上传使用稳定 clientSessionId，ACK 后保留本地今日统计。

## 复习、统计与个人中心

- 学科复习从本地正式状态和生命周期历史恢复，新提交仅走 lifecycle 命令；PC 不再调用旧 due/events/history 接口。
- `reviewRepository`、`localReviewService`、`reviewLifecycleEngine` 和 `reviewSyncService` 分离持久状态、队列与独立补传，核心 Sync 不阻塞复习本地读取。
- 计划复习包含普通到期与可恢复未核对初选，按知识块去重；待核对优先，继续使用原 reviewId，不重复提交初选。确认/纠正后退出待核对集合。
- 未固化请求核对完整云端状态/历史后绑定当前修订；已固化请求保留原 ID 与载荷。移科保留调度/学习/掌握状态，原学科初选失效但审计保留，旧待同步意图进入显式冲突处理。
- 复习操作失败时在轮次内提供重试、重新确认或返回规划。`LocalReviewService` 在同一 SQLite 事务中复核知识块版本和正文，拒绝过期的冻结请求，再计算并原子写入复习状态与补传队列。
- 学科统计以现行本地学习/复习数据为基础；个人概览和 AI 额度使用对应 API，额度仅展示实际返回值并按当地时间显示重置点。
- 左栏「账号与安全凭证」分为账号资料、登录设备管理、数据与账户重置，退出登录位于设备区。右栏「AI 设置」顶部为自动生成概览偏好，其下分为模型与服务、使用额度两区，分区内容向内缩进。模型配置依次为服务商、Base URL、API Key 和对话模型，服务商通过输入框填写。同步和文件处理入口仍在 Profile。`hasAvatar=false` 不发头像请求；缓存及异步回包按账号隔离。
- 个人资料卡展示用户名与当前设备，登录账号在「账号与安全凭证」查看。设置面板保留会话和同步状态、配置要求与操作反馈，分组标题和设置项标签采用 Tabler 图标。「立即同步」位于「同步状态」行。
- 改密成功后当前设备自动续期并刷新设备列表，其他设备需用新密码登录。原密码错误显示在改密表单。
- Local Asset 尚无备份、导出和恢复闭环。

### 外观与显示

紧凑布局即时缩小首页、排期、资料管理、专注计时、学科大厅、学科工作区和个人中心的页面留白。基础字号可选 12px、14px、16px。14px 保持当前视觉基准，其余选项通过语义字号调整已接入的正文、标签和标题。阅读器内容和按钮点击区域使用各自的尺寸。

界面语言可选简体中文、英语和日语，即时更新导航、登录和主要页面。已接入的日期使用当前语言格式。用户输入、文件内容和服务端详情按原文显示。三项偏好都在本机保存，重新打开应用时恢复。

个人中心保留外观、同步和 AI 设置。旧的提醒偏好值留在本机存储中，应用不再读取。

### 同步与文件概览

- **自动同步**默认开启。关闭后本机继续保存编辑和待同步记录，后台同步暂停。已经开始的同步批次可收尾。重新开启会唤醒同步队列。点击「立即同步」可手动同步。
- **自动生成概览**默认开启。文件处理完成并符合条件时，可自动生成大纲和总结。关闭后跳过尚未派发的自动生成，已派发的生成继续保存结果。文件与学科的手动生成入口继续可用。重新开启按现有文件就绪事件和扫描规则触发。
- 两项选择保存在本机。

RAG 不提供关闭设置，聊天按当前检索范围执行。

## 开发、验证与限制

在 `Auralis-PC` 执行：

```powershell
npm.cmd ci
npm.cmd run dev
npm.cmd run tauri dev
npm.cmd run type-check
npm.cmd run check:r4-pc
npm.cmd run test:r4-pc
npm.cmd run build
npm.cmd run tauri -- build --no-bundle
```

按任务范围选择命令，不默认全部执行。未全部纳入聚合脚本的定向测试以 `package.json` 与对应脚本为准。CLI 缺失排障见 [Runbook](../operations/Runbook.md)。

- 类型检查与 Web 构建不能证明 Tauri、安装包或业务流程；`--no-bundle` 不证明 MSI 安装/升级/卸载。
- 登录切换、真实 Server/Provider、双设备同步、OCR/keyring、文件上传与断网恢复仍须按当前问题清单取得实际环境证据。
- 当前测试状态见 Status；本次文档整理没有执行业务测试、构建或启动服务。
- 窗口配置和主题实现存在，不等于所有缩放、窄窗与触控交互已验收。

### 时间线隔离试测

在 `Auralis-Server` 启动回环地址上的内存测试后端。测试后端每次重启时清空其测试数据。周列跨天需要支持 `STRICT` 放置的后端。

```powershell
.\mvnw.cmd -B -ntp spring-boot:test-run '-Dspring-boot.run.profiles=test' '-Dspring-boot.run.arguments=--server.port=18080 --server.address=127.0.0.1'
```

在另一个 PowerShell 中进入 `Auralis-PC`，使用独立应用 ID 保存试测的本地缓存。

```powershell
$env:VITE_API_BASE_URL = 'http://127.0.0.1:18080'
$env:VITE_WS_BASE_URL = 'ws://127.0.0.1:18080'
$timelineTrialConfig = Join-Path $env:TEMP 'auralis-timeline-test-tauri.json'
'{"identifier":"com.auralis.timeline-test"}' | Set-Content -LiteralPath $timelineTrialConfig
npm.cmd run tauri -- dev --config $timelineTrialConfig
```

注册测试账号并新建学科和几项未来任务。日视图分别拖向空槽、卡片主体和标题栏，检查重叠任务顺延、放到卡片结束后第一个半小时槽和两卡换位。连续快速换位时观察前一笔回执是否误报改期。周视图拖到另一日期和原日期，检查首个可用时段、其他任务原位和同日位置。最后拖回待办，并按 `Esc` 取消一次拖动检查高亮。试测离线重放时保持后端运行，在桌面端开发者工具模拟离线，连续拖放后恢复连接并检查同步。

## 修改后的回写

页面、路由、Store、服务或 Tauri 边界变化更新本文对应章节；视觉和交互更新 `docs/project/FrontendDesign.md`；API/数据变化更新契约；验证和风险更新 `current/`；发布相关变化更新 `docs/operations/Changelog.md`。历史任务详情进入追溯记录，避免重新堆入模块说明。

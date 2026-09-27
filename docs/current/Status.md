# Auralis 当前状态

2026-09-27 PC 任务编排中心下周排期精确自然日比对与槽位计算修复（代码与门禁验证通过，GUI 待验收）：排查并彻底解决点击侧栏下周排期时当周任务被误关联至下周的根因：在 `useTaskStore.ts` 中增强 `dateForDay` 与 `rebuildSchedule` 支持 `YYYY-MM-DD` 格式的 `dateKey` 精确比对，打破原有仅依赖单周 `DayCode` ('Mon'~'Sun') 导致的跨周模糊匹配；更新 `setSelectedDay` 与 `insertTaskAtSlot` 支持 `dateKey` 级传递；并在 `Timeline/index.vue` 中由 `selectedTimelineDay.dateKey` 精确驱动中间“时间流细节”各槽位任务与当前点渲染，确保选中下周某一天时只精确呈现下周该天的实际排期任务。PC 全量回归测试 `npm.cmd run test:r4-pc`（433/433 全量通过）、`npm.cmd run type-check` 退出 0。

2026-09-27 PC 任务编排中心侧栏下周排期概览实现（代码与门禁验证通过，GUI 待验收）：在任务编排中心（`Timeline/index.vue`）侧栏中，直接于“本周排期概览”下方新增“下周排期概览”区块，与本周排期呈现样式 100% 同款对齐（无需 Tab 切换，自适应铺满侧栏并支持纵向平滑滚动）。基于 `getTimelineDays` 与 `dateKey` 实现精确的下周 7 天时间轮播与下周各日任务排期筛选；点击下周任意一天，高亮自适应切至目标项，中间“时间流细节”标题与半小时槽位排期自动联动切换为选中日期。PC 全量回归测试 `npm.cmd run test:r4-pc`（433/433 全量通过）、`npm.cmd run type-check` 退出 0。

2026-09-27 PC/Service 风险定向修复（代码及自动验证，真实运行待验收）：PC 暂不暴露 Suggestions 调用入口，服务端基线接口保留；Timeline 两项交换改为本地单事务批量写入，失败后保留 cursor/outbox 并拉取服务端结果恢复。Server Sync pull 对省略/零 cursor 检测日志清理缺口；Subject Overview 先建立全量 Source 别名；Source Overview 同实例按含标题的键合并进行中请求。TEXT/URL 解析输入改变轮换 ingestion revision，Source 与 job 同事务持久化且入队失败整体回滚；恢复处理中的 Source 时补建或复用 job；worker 以 revision、job/generation、attempt 和锁后有效 lease 栅栏化完成/失败，Source/chunks/job 成功在同一短事务提交。PC 全量 433/433、type-check，Server clean 聚焦 114/114、PostgreSQL pgvector 2/2 通过；`check:r4-pc` 仍受既有 Rust 测试 loopback 地址扫描误报阻断。跨 Server 实例 Overview 去重、真实 Provider/双设备/Tauri GUI 尚未验收。

2026-09-26 PC 同步、AI 参考范围与连接/预览问题定向修复（代码与自动验证，GUI/真实服务待验收）：新设备本地 `cursor=null` 时先取完整 Sync snapshot，沿用保留未解决本地 mutation 的替换路径，并通知五类资源投影刷新；Tauri 原生替换现同时保护 `inflight` 写入，已有 cursor 仍增量拉取。学科工作区的显式多文件选择现随聊天请求传入，Server 限定到同一活动学科内、当前用户拥有且 READY 的 Source；显式集合最多 100 份（含当前文件），全学科检索仅在用户显式选择时启用，原 `AUTO` 保持兼容。PC Overview 单次 HTTP 超时设为 300 秒；文件仅改显示名不再重载预览；通用请求的服务错误与网络错误进入侧栏连接状态，并按请求先后防止旧响应覆盖新状态；个人空间准确描述 JSON 导出范围、密码单向哈希和 AI 经服务端转发。PC 全量回归 430/430、type-check、build 通过；Tauri snapshot 定向 1/1、`cargo fmt --check` 通过；Server clean `AiRetrievalTests` 12/12、`ArchitectureTests` 1/1；OpenAPI runtime artifact 8/8、双端 SDK 生成和 `check-openapi.ps1` 通过。`check:r4-pc` 仍因未修改的 `local_asset_store.rs` 测试固定地址规则退出 1。真实 PostgreSQL/Provider、双设备、Tauri/GUI 行为仍待验收。

2026-09-26 PC 排期未完成划掉样式修复（代码与门禁验证通过，GUI 待验收）：彻底修复时间轴（Timeline）视图中过去时间的未完成排期任务被误加上划线（`text-decoration: line-through`）的问题。移除了 `Timeline/index.vue` 中对 `.is-past` 的 `line-through` 强制规则，确保仅真正勾选完成的已完成任务（`is-completed`）才具有划线删除样式与置灰半透明效果；勾选框与完成状态保持由 `isCompletedTask` / `isCompletedScheduledTask` 统一掌控。PC 全量回归测试 `npm.cmd run test:r4-pc`（423/423 全量通过）、`npm.cmd run type-check` 退出 0。

2026-09-26 Source/RAG 与文档处理入口优化（Issue 2/6/7，代码及定向验证）：PostgreSQL 检索原已在 TopK 前排除软删除 Source；H2/fallback 路径已改为先按用户批量解析活动 Source 再排序取 TopK，避免已删除 Source 的旧 chunk 占名额。Source 列表/分页/含删除项列表与 Retrieval citation 使用 owner-scoped Source/Asset 批量读取，保留排序、大小与引用语义；两条 FILE Source 列表验证为 1 次 Source 查询加 1 次 Asset 批量查询。PC `DocumentProcessingStore.start/resumePending` 现经 `SourceJobScheduler`，重启/重试与现有 UI 入口继续由 Scheduler 处理。Server focused clean 8/8、PostgreSQL 17/pgvector 2/2；PC focused 66/66、type-check 与 build 通过。`check:r4-pc` 仍因未修改的 `src-tauri/src/local_asset_store.rs: fixed local address` 失败；真实 Tauri/Server/RAG 业务链路及性能负载未验收，运行服务未部署本轮变更。

2026-09-26 注销账户运行验收：用户自行重建前后端并提交一次注销后，按该账号已关联的精确作业只读查询，`requested_at=06:43:18.077669 UTC`、`not_before=06:49:18.077669 UTC`、`completed_at=06:50:10.172777 UTC`，作业为 `COMPLETED`、`last_error=NULL`、用户行已删除。该用户归属的 21 张清理表及本作业对象键记录均为 0 行；运行中前后端容器镜像分别匹配当前本地 tag，backend healthy。数据库证据确认这次注销受理并完成物理清理；未单独检查 MinIO 对象，也没有从缺少请求日志的服务中恢复当时 HTTP 状态或 GUI 提示原文。

2026-09-26 账户注销链路复核与 PC 401 修复：只读数据库按登录使用的规范化用户名检查指定测试账号，当前为 `ACTIVE`、关联注销作业 0；因此此前无法登录不等于注销受理成功。运行中 backend JAR 的 `requestAccountDeletion()` 字节码已核实两个 `timestamptz` INSERT 参数均调用 UTC `OffsetDateTime.ofInstant`，V25 已安装。PC 在确认密码错误返回 `401 UNAUTHENTICATED / Invalid credentials` 时，现仅显示原有错误通知，不触发全局 access token 刷新、DELETE 重放或登录跳转；真正的 Bearer 失效仍按 `Authentication is required` 走原刷新流程。PC 定向回归 6/6、type-check 与生产构建通过；独立 PostgreSQL 17/pgvector 的注销受理→到期清理、错误密码回滚等定向回归 4/4 通过。`check:r4-pc` 因本次未修改的 `src-tauri/src/local_asset_store.rs: fixed local address` 报 1 项失败。`docker compose build frontend` 成功，新镜像 `428f946d`，现运行 frontend 容器仍为 `f937324a`；未对真实账号执行 DELETE 或完成 GUI 验收，且缺少现场 HTTP 响应，仍不能确定先前请求实际返回的是 401 还是其他错误。

2026-09-26 注销账户受理入口 PostgreSQL 时间参数：现场 `DELETE /api/auth/me` 日志在 `IdentityService.requestAccountDeletion()` 的作业 INSERT 报 pgJDBC 无法推断 `Instant` 类型。已把 `requested_at`、`not_before` 两个 JDBC 参数转为 UTC `OffsetDateTime`，业务时刻和响应保持 `Instant`。285 个主源码 clean compile 通过；独立 Testcontainers PostgreSQL 17/pgvector + Flyway V1–V25 异时区定向回归 2/2，覆盖入口作业写入与清理任务；`docker compose build backend` 成功。Maven 全量测试编译仍受其他工作树测试源码不匹配阻断；现运行容器镜像 ID `00c3eaa2` 与新构建镜像 ID `a30cdbe6` 不同，本次入口修复尚未部署，未对真实账户执行 DELETE。

2026-09-25 注销账户清理任务 PostgreSQL 参数修复（代码与隔离数据库回归通过，运行中服务待更新）：现场日志表明 `AccountDeletionCleanupService.claimNext` 将 `Instant` 直接交给 pgJDBC，驱动无法推断 SQL 参数类型。清理服务内同类 JDBC 时间参数已统一改为 UTC `OffsetDateTime`，匹配 V25 的带时区列；原有状态机、数据删除顺序及公开 API 不变。独立 Testcontainers PostgreSQL 17/pgvector 完成 Flyway V1–V25 并运行合成作业回归 1/1，覆盖领取、租约、对象标记、完成及复扫，JVM 与 PostgreSQL 会话使用不同时区验证绝对时刻。仓库当前全量 `testCompile` 被其他未提交测试与生产接口不匹配阻断，未据此声称全量测试通过；`docker compose build backend` 已成功构建新镜像，但当前 Compose 容器仍运行旧镜像，未对真实账户执行清理。

2026-09-25 AI 通用聊天 Provider（代码与自动验证完成，真实 Provider/GUI 待验收）：用户设置只提交聊天 Provider、Base URL、聊天模型及可选 API Key，设置响应不再提供 Embedding 模型；索引及 RAG Embedding 固定读取服务端 SiliconFlow 配置。`OPENAI_COMPATIBLE` 支持经公网地址校验的 HTTPS host，命名 Provider 保持 allowlist；本地/内网和 NAT64、6to4、Teredo 转换前缀被拒绝。连接测试用已保存模型发起最小聊天请求，不再依赖 `/models`。Server clean 定向 45/45、安全专项 clean 18/18、OpenAPI artifact 8/8、双端 SDK 一致性检查、PC 定向 5/5 与 PC type-check 均通过。真实服务商协议差异、网络与 GUI 尚未验收；Mobile type-check 因既有 `assetUpload.ts` 未传 `clientImportId` 失败，此字段在本次修改前的 HEAD schema 已为必填，与本轮 AI 改动无关。

2026-09-25 PC 顶栏头像真实映射与状态指示点移除（代码与回归测试通过，GUI 已验证）：
1. 真实头像映射与响应式全站同步：在 `useAuthStore.ts` 中引入全局 `avatarUrl` 状态与 `loadAvatar()` / `setAvatarUrl()`，在登录（`setSession`）与顶栏组件挂载（`onMounted`）时通过 `useAuthApi.getAvatarBlob()` 拉取头像 Blob 并构建安全 ObjectURL，无头像或 404 时静默降级展示首字母；在退出登录（`clearSession`）时妥善释放（`URL.revokeObjectURL`）；
2. 个人中心实时联动闭环：`Profile/index.vue` 在头像上传（`uploadAvatar`）、重新拉取（`loadAvatar`）及重置头像（`resetAvatar`）时，同步更新 `authStore.setAvatarUrl`，页面内修改头像即时反映至全局顶栏，且避免组件卸载时误注销跨页面共享的 ObjectURL；
3. 彻底移除右上角状态圆点：在 `AppHeader.vue` 模板与样式中彻底移除 `.avatar-status` 绿色状态圆点元素与样式，保持纯净禅意头像视觉；
4. 门禁验证与浏览器检查：`npm.cmd run test:r4-pc`（420/420 pass）、`npm.cmd run type-check`（0 error）与 `git diff --check` 全部通过；浏览器端界面检查确认右上角状态圆点已移除且首字母/头像渲染正常。

2026-09-25 PC 首页已完成勾选状态全链路修复（代码与全量回归通过，GUI 待验收）：排查并彻底解决首页已结束排期任务无法打勾和待办任务规范状态穿透的问题：
1. 离线写屏障豁免已完成任务历史排期校验：在 `useTaskStore.ts` 的 `persistOffline` 中豁免已完成任务（`model.status !== 'DONE'`）执行过去的排期拦截（`assertScheduledAtIsNotPast`），消除由于时间细微精度差异或历史时间导致自动完成（`recoverOverdueTasks`）静默崩溃及手动勾选报错“不能排期到过去的时间”的问题；引入 `isSameScheduleTime` 时间戳规整比对；
2. 规范状态全域收敛：在 `taskViewRules.ts` 中修正 `isActionableTask` 与 `isSchedulableTask`，统一使用 `!isCompletedTask(task)`，杜绝服务端与本地规范状态 `'DONE'` 的已完成任务被误当作活动待办或可调度项；
3. 首页指标统计与待办清单纯粹化：`useTaskStore.ts` 的 `completedCount` 与 `totalFocusHours` 统一采用 `isCompletedTask(task)`，首页顶部“已完成 X 项”统计准确恢复；待办清单 `.todo-item` 移除复选框与点击完成，聚焦纯净待排期信息展示；
4. 全量自动化门禁：更新 `scripts/r4-dashboard-timeline.test.mjs`，PC 全量回归测试 `npm.cmd run test:r4-pc`（420/420 全量通过），`npm.cmd run type-check` 与 `git diff --check` 全部通过。真实 GUI 行为待验收。


2026-09-25 PC 头像读取 406 修复（实现与定向验证完成，真实 HTTP/GUI 待验收）：个人空间头像 GET 请求显式接受 `image/png` 和 `application/problem+json`，覆盖 PC 通用请求客户端的 `Accept: application/json` 默认值；继续使用 Blob 响应。服务端头像读取与 OpenAPI 原本均声明 `image/png`，本次不改接口或 multipart 上传限制。Profile 定向测试 5/5、PC type-check 与相关 diff-check 通过；Axios mock adapter 验证最终请求头覆盖默认值。

2026-09-25 PC 完成任务分组与首页日程自动勾选补充修复（定向测试通过，GUI 待验收）：资产库任务分组先识别完成状态，再判断有无排期，已完成且未设置截止/排期的任务进入“已完成”；任务树节点的勾选标记复用同一完成状态规则。Task Store 在 TASK 投影刷新后立即重新检查已结束的排期任务，补上同步或本地写入期间跳过检查后的重试时机。已结束且已完成的排期任务禁止取消完成，避免首页与资产库按钮的手动操作被下一轮自动恢复立即覆盖；资产库树刷新同步更新选中任务状态。仓储写入与同步拉取后规范状态 `DONE` 映射至展示状态 `completed`，首页日程勾选谓词的动态测试均通过；原始首页 DOM 故障尚未在 GUI 中复现。任务规则 14/14、资产库 2/2、首页/时间轴 15/15、Store 排期 25/25、PC type-check 和相关 diff-check 均通过。

2026-09-25 PC 时间轴排期任务自动完成修复（代码与定向测试完成，GUI/跨设备待验收）：自动完成以 `scheduledAt + durationMinutes` 的任务结束时刻为准；任务本地加载后立即检查，并在应用打开期间每分钟检查。单项保存失败记录错误且不阻断其他任务；自动写入与手动改期/编辑共用任务变更队列，在写入前重读当前本地 TASK 行，并以可选的仓储版本及 outbox 状态条件原子提交；增量 pull 对同资源未解决本地写入也进行原子跳过。任务规则与 Store 定向 35/35、本地仓储 18/18、同步 12/12、PC type-check 通过。未更改 Task API、数据库字段或同步协议。

2026-09-25 PC 个人空间清除离线数据底层持久化与 AI 脏配置自动持久化测试（已修复）：
1. 离线数据重置底层贯通：在 `localRepository.ts` 实现 `resetOfflineStorage()`，清空 `local_mutations` 与 `local_resource_records`，原子写入 `cursor = NULL, reset_required = 1`；在 `useSyncStore.ts` 暴露 `resetOfflineData()` 统一调度，触发全量快照拉取；`Profile/index.vue` 的“清除本地离线数据”操作真实清空本地仓储并重启同步；
2. AI 脏配置自动保存后再测试：在 `Profile/index.vue` 引入 `ensureAiSettingsSavedForTest()`，在用户点击“自动检测”或“测试连接”前自动比对未保存的新 Base URL、模型或 API Key，先静默持久化至服务端托管库，避免后端用已有旧凭证测试导致误报成功；补齐了 `handleTestConnection` 与 `testingConnection` 连通性测试加载态与反馈；
3. 全量自动化验证：`scripts/r4-profile-live-links.test.mjs`，`npm.cmd run test:r4-pc`（408/408 全量通过），`npm.cmd run type-check` 与 `git diff --check` 全部退出 0。真实外部服务连通性与 GUI 待验收。

2026-09-25 PC 首页已完成任务勾选状态与完成切换修复（已修复）：
1. 勾选状态识别增强：在 `taskViewRules.ts` 中增强 `isCompletedTask` 与 `isCompletedScheduledTask`，同时支持展示层 `'completed'` 与规范数据枚举 `'DONE'`，解决后端同步或原始状态下已完成任务渲染为空心复选框的问题；
2. 首页状态流转与交互完善：`Dashboard/index.vue` 的 `toggleTaskCompletion` 升级为智能识别，排期任务解勾选后返回 `'scheduled'`，无排期任务返回 `'pending'`，未完成任务推进至 `'completed'`；增加了 `try...catch` 异常提示；为任务卡片内容区增加点击勾选与手势指针，为待办清单 `.todo-item` 补充复选框控件，支持直接在首页勾选完成待办；
3. 全量自动化门禁：更新 `scripts/r4-dashboard-timeline.test.mjs`，`npm.cmd run test:r4-pc`（407/407 全量通过），`npm.cmd run type-check` 与 `git diff --check` 全部退出 0。真实 GUI 行为待验收。

2026-09-25 头像上传 multipart 接收上限：Spring 单文件上限设为 5 MiB，整个请求上限设为 6 MiB，避免框架默认 1 MiB 先于头像业务校验拒绝上传。配置位于共享服务端 profile，适用于 local/test/prod。`mvnw.cmd -B -ntp clean -Dtest=ConfigurationTests test` 退出 0，3/3 通过；测试确认配置绑定，实际 Servlet 容器 HTTP 上传尚未验证。

2026-09-25 PC 个人空间与设置页 10 类前端缺口真实链路打通（实现与测试完成，GUI 验收待办）：
PC 设置页面（`Profile/index.vue`）已全面打通真实服务端与数据链路，消除所有 mock 与伪逻辑：
1. 账户资料（3 类）：昵称接入 `PUT /api/auth/me`（带版本防并发覆写）；头像通过 `GET /api/auth/me/avatar` 获取真实私有 Blob 并通过 `POST /api/auth/me/avatar`（≤5MB PNG/JPEG 校验）与 `DELETE` 实现云端流转，彻底移除 localStorage 缓存；修改密码升级至 12~200 位校验并接入 `PUT /api/auth/password`；
2. AI 设置（3 类）：Provider 引入 `normalizeProvider`，将自由输入与非标准服务商映射为 `OPENAI_COMPATIBLE`；模型自动检测接入真实 `GET /api/ai/settings/{provider}/models` 探测候选模型；连接测试接入真实 `POST /api/ai/settings/{provider}/test-connection` 反馈聊天模型的可达状态；
3. 数据与状态（4 类）：数据导出打包完整知识库块与任务排期；两级清理分层解耦为视图缓存清理与高危离线重置（触发全量拉取）；注销账户接入 `DELETE /api/auth/me` 处理 202 Accepted 异步受理并清空会话；同步状态动态响应 `syncStore` 的 `isSyncing`、`lastSyncError` 与 `resetRequired` 状态。
全量自动化验证：新增定向门禁 `scripts/r4-profile-live-links.test.mjs`，PC 全量回归 `npm.cmd run test:r4-pc`（406/406 全量通过），`npm.cmd run type-check` 与 `git diff --check` 全部退出 0。真实外部模型与人工 GUI 体验待验收。

2026-09-24 PC 个人中心与系统设置（Profile / Settings）左栏精简与账号卡片高级重构收口：
根据可用性与视觉呼吸感要求，对左侧概览与账户卡片实施进一步打磨：
1. 移除每周专注时长柱状图：从核心学习指标卡片（`.study-stats-card`）中彻底移除原本拥挤的 7 日迷你柱状走势图，使核心指标卡片回归纯粹的 4 宫格数据微胶囊，大幅释放纵向空间并提升呼吸感；
2. 彻底重构账号与安全凭证卡片（`.account-card`）：
   - 消除昵称重复：移除底部卡片内与顶部用户资料卡重复的昵称修改行；
   - 引入精致单元格体系（`.account-cell`）：账号绑定、登录密码、当前授权设备均采用独立的温润燕麦米白（`#F7F2EB`）圆角单元格，配有细致字距与状态徽标（`已认证`、`当前授权`）；
   - 顶部状态徽标：集成柔和绿点呼吸状态（`安全运行中`）；
   - 底部双操作按钮重绘（`.account-card-actions`）：`切换账号`（次级优雅按钮）与 `退出登录`（低饱和温润柔红边框告警按钮，严格保留 `@click="handleLogout"` 交互契约）；
3. 全量自动化门禁：`npm.cmd run test:r4-pc`（403/403 pass）、`npm.cmd run type-check`（0 error）、`git diff --check` 全部通过。

2026-09-24 PC 任务编排中心（Timeline）配色三层级对齐、待安排栏加宽与全卡片按钮立体微阴影收口（主内容 #F7F2EB、卡片模块 #FAF7F2、页面背景 #EEEEEE、任务栏 400px、全卡片按钮底影）：
依据极简禅意三层级配色系统规范与空间可用性，全面对齐 PC 任务编排中心（`Timeline/index.vue`）的层级对比关系、交互色彩、列宽布局与立体阴影：
1. 页面大背景（#EEEEEE，rgb(238, 238, 238)）：外层页面容器 `.timeline-page` 采用清爽冷灰底板 `var(--color-bg-secondary, #EEEEEE)`；
2. 主内容大容器（#F7F2EB，rgb(247, 242, 235)）：顶栏卡片 `.timeline-header-card`、日视图时间轴列 `.timeline-column`、待安排任务列 `.tasks-column`、周视图概览列 `.weekly-overview-column`、各星期列 `.weekly-column`、周视图底部坞 `.weekly-bottom-dock` 与看板列 `.kanban-column` 全部统一为沉稳温润的浅燕麦米白底板 `var(--color-bg-primary, #F7F2EB)`，并配置沉降分层阴影；
3. 待安排任务栏（`.tasks-column`）加宽扩展：`.timeline-body` 网格列由原本的 `280px 1fr 340px` 调整为 `280px 1fr 400px`，右侧待安排任务块宽度增加 60px，彻底解除长任务名称、学科标签、知识关联胶囊与截止日期提醒徽标在待安排卡片内的排版拥挤感；
4. 全卡片与模块底部立体阴影：时间轴任务卡片 `.slot-task`、待安排卡片 `.pending-card`、周视图任务卡片 `.weekly-task-card`、周概览行 `.weekly-overview-row`、周底坞胶囊 `.pending-pill`、看板卡片 `.kanban-task-card`、学科胶囊 `.subject-capsule-item`、统计胶囊 `.stat-pill` 及知识块关联徽标 `.kb-relation-badge` 统一配置分层立体微阴影（基础态 `box-shadow: 0 2~4px ...`，悬浮态 `transform: translateY(-1~2px)` 并扩散至 `0 6~8px ...`），实现如宣纸般在底板上自然立体浮起；
5. 全操作按钮底部立体阴影：主按钮 `.btn-primary`、次级按钮 `.btn-secondary`、视图切换栏 `.view-toggle` 与激活切换胶囊 `.toggle-btn`、日期按钮 `.day-btn`、智能顺延按钮 `.btn-auto-delay`、弹窗确定/取消按钮 `.task-btn-submit`/`.task-btn-cancel`、时长交互条 `.duration-long-bar-btn`、关闭与删除按钮 `.modal-close`/`.task-delete-btn` 底层全量补齐微阴影与高亮悬浮投影，彻底消除死白无边界扁平感。
全量自动化验证：`npm.cmd run test:r4-pc`（401/401 全量通过）、`npm.cmd run type-check`、`npm.cmd run build`、`git diff --check` 全部退出 0。

2026-09-24 PC 个人中心（Profile）左栏布局调优、头像更换、多模型自动检测与账号操作精简：
全面落实个人中心（Profile）左右分区结构与 AI BYOK 自由配置：
1. 左右功能边界清晰化：左侧明确为个人账户与学习概览（用户资料卡、核心学习指标、TOP 5 学科知识块统计、文件解析进度中心、账号与安全凭证管理卡片）；右侧明确为应用偏好设置（外观与显示、提醒与自动化、同步与数据、AI 模型与服务、数据与安全、登录设备会话）；
2. 账号与头像操作重构：顶部用户资料卡支持点击头像直接上传更换；下侧账号与安全凭证卡片聚合排列「用户头像、用户昵称、登录密码」三个可交互修改项于上部，随后呈现「登录账号、当前设备」两项只读认证信息，结构层次清晰；精简去除了与「退出登录」功能重复的「切换账号」多余操作，操作更纯粹清爽；
3. 设置项精简降噪：按要求移除不必要的「AI 学科归类」与「每周学习报告」开关配置，避免多余概念干扰；
4. 数据与隐私设置项归类：将具备主动交互按钮的「数据备份导出」与「清理本地缓存」聚合排列在数据与隐私区块前列，其后承接开关项与加密说明，操作体验更为聚焦；
5. 学科分布真实统计：仅统计真实知识块数（Block Count），降序排列并严格仅展示 TOP 5 学科，胶囊徽标对齐 `{{ sub.count }} 块` 格式；
6. AI 配置自由输入与多候选模型自动检测：完全去除原嵌入模型输入，开放服务商（Provider）、对话模型（Chat Model）、Base URL、API Key 供用户自由文本输入；对话模型集成「自动检测」按钮与多模型候选托盘（`detected-models-tray`），检测成功后渲染多个模型选择标签（Model Chips），支持一键点击填入或手动自定义输入；
7. 全量自动化门禁：`npm.cmd run test:r4-pc`（403/403 pass）、`npm.cmd run type-check`（0 error）、`git diff --check` 全部通过。

2026-09-24 PC 学科中心与总览视图配色三层级修正（主内容 #F7F2EB、卡片模块 #FAF7F2、页面背景 #EEEEEE）：
依据禅意温润米白视觉系统规范，彻底修复学科中心（`SubjectHall`）与学科工作区（`SubjectWorkspace`）的层级对比关系：
1. 页面大背景（#EEEEEE，rgb(238, 238, 238)）：外层容器 `.hall-container` 与 `.workspace-container` 维持冷灰底板；
2. 主内容大容器（#F7F2EB，rgb(247, 242, 235)）：纠正此前 `SubjectHall/index.vue` 中 `.hall-content` 误设为 `#FAF7F2` 的问题，恢复为 `var(--color-bg-primary, #F7F2EB)`；同时同步纠正 `OverviewSummaryView.vue` 根容器与头部背景以及 `FilePreview.vue` 在 bare 模式下的 body 背景为 `#F7F2EB`；
3. 卡片模块（#FAF7F2，rgb(250, 247, 242)）：学科卡片 `.subject-card`、新建卡片 `.add-card`、搜索框 `.search-input`、操作按钮、知识块卡片 `.block-card`、总结卡片 `article`、阅读器纸张底板 `.file-preview-renderer-shell` 统一呈现暖米白宣纸质感，在 `#F7F2EB` 主内容底板上轻柔浮起，恢复清晰舒适的界面视觉纵深。
全量自动化验证：`npm.cmd run test:r4-pc`（401/401 全量通过）、`npm.cmd run type-check`、`npm.cmd run check:subject-icons`、`npm.cmd run check:subject-workspace` 全绿无报错。

1. Asset 关系星图以真实 Subject、Source、KnowledgeBlock 投影建图。Source 连接所属 Subject；KnowledgeBlock 在 `sourceFileId` 指向同学科现存 Source 时连接该 Source，否则连接所属 Subject，不补造关系。
2. 力导向布局使用对称节点互斥、按关系类型设目标长度的弹簧吸引、弱重力回中与速度阻尼。初始坐标由稳定 ID 决定；同范围刷新保留现存节点坐标与镜头，切换 Subject/全局范围重置并适配。初始模拟最多运行 180 帧，并在收敛时提前停止。
3. 鼠标、触控和触控笔通过 Pointer Events 拖动所有节点；空白区域拖动平移。达到拖动阈值时暂停初始布局 RAF，正在拖动的节点锁定在指针坐标，实时力帧推动关联邻居并重画连线；拖动响应每段最多 36 帧并在收敛时提前停止，释放后最多 30 帧低强度松弛，让节点轻微调整。用户摆放在同范围更新中保留，切换范围后重新布局。点击 Source/KnowledgeBlock 仍选择资产树对应项并在中栏打开 `FilePreview` 或知识块编辑器；Home 继续触发 `open-block-detail`。
验证：力计算、拖动邻居响应与释放松弛专项 6/6，`npm.cmd run test:r4-pc` 403/403、`npm.cmd run type-check`、`npm.cmd run build`、根目录 `git diff --check` 均退出 0。生产构建仍有既有模块外置、dynamic import、插件耗时与大 chunk 警告。浏览器/Tauri GUI 的实际拖动手感、鼠标离开画布后的捕获及触控设备行为仍待人工验收。

2026-09-24 PC 学科中心小卡片/模块/宣纸底全层级统一与文件总览选中态顶栏高亮去除收口：
全面响应学科中心视觉细化要求，对齐温润米白宣纸底板色（`#FAF7F2`，对应 CSS 令牌 `var(--color-bg-tertiary, #FAF7F2)` / `var(--bg-card)`）：
1. 模块底板与纸张渲染底统一：`SubjectWorkspace` 抽屉卡片、状态栏、主工作区、右侧面板与所有文件阅读器容器（`.pdf-workspace`、`.blocks-workspace`、`.onboarding-workspace`、`FilePreview`、`FileViewerRenderer` 内部纸张底板）全部统一为 `#FAF7F2`；
2. 输入框、状态胶囊与学科 AI 控件统一：弹窗与抽屉内输入框（常态与 focus）、下拉选择、学科状态胶囊、未就绪发送圆钮、AI 清空按钮、报错重试按钮、划词工具条全部收敛为 `#FAF7F2`；
3. 总览卡片纯净底色与选中态顶栏去高亮：彻底去除 `FileOutlineList` 文件总览卡片在被选中状态（`is-selected`）下顶栏的渐变绿铺色，保持统一纯净的 `#FAF7F2` 顶栏底色；同时去除 `SubjectOverviewSection` 学科总览顶栏的 `linear-gradient` 绿晕，使所有总览卡片在常态与选中态下均融入宣纸底板，选中态完全交由细致发丝边框、微立体阴影与文字强调色表达。
全量自动化验证：`npm.cmd run test:r4-pc`（397/397 通过）、`npm.cmd run type-check`、`npm.cmd run check:subject-icons`、`npm.cmd run check:subject-workspace` 全绿无报错。

2026-09-24 PC 专注时钟（Pomodoro）温润极简配色重构、时间轴智能感知与版面尺度调优收口：
针对番茄专注时钟原配色刺眼、任务混杂及视觉版面尺度进行系统性优化收口：
1. 温润极简禅意配色全面对齐：大页面统一为浅中性底色 `#EEEEEE`，左右双栏采用温润燕麦米白大容器卡片（`#F7F2EB`）、24px 大圆角与柔和微质感阴影；圆环轨道由原本刺眼高饱和纯橙色（`#E85D04`）重构为专注态禅意鼠尾草绿（`#8B9A6E`），茶歇阶段升级为温润琥珀茶色（`#C89B6D`），底轨采用半透明发丝柔光，中央开始/暂停大圆钮采用品牌渐变配合柔和绿晕（茶歇态切为茶金渐变），重置/跳过按钮采用全圆角米白宣纸胶囊（`#FAF7F2`）；
2. 任务选择器专属过滤与时间轴深度联动：彻底移除无排期待办的混杂展示，严格仅过滤已在时间轴上拥有明确排期（`Boolean(task.scheduledAt)`）、处于未完成且未取消状态的有效排期任务，并按排期时间由近及远升序排列；补充内置「自由学习」（`free-study`）专属任务项；
3. 智能时间感知默认任务定位：初次进入或时间轴更新时，自动识别当前时刻正处于执行区间（`[start, end)`）或即将在 10 分钟内开始的任务并默认选中；当前无任务时默认落入「自由学习」心流模式；用户手动自选后锁定选择，不被后台刷新篡改；
4. 视觉排版降噪与纯粹文字化：移除选择器多余的「时间轴联动」徽标，移除当前专注横幅内的所有装饰图标，保留纯净文本与学科徽标排版；修复横幅由于长任务名称挤压导致「已排期」胶囊纵向折行（`已排\n期`）及文字过度截断的排版缺陷，将标题与状态信息拆分为独立双层结构，标题独占上层（支持两行优雅换行），下层状态胶囊强制单行不折行紧贴排期时间；
5. 空间尺度开阔度与圆环字号提升：左侧时钟区比例加宽至 `flex: 6.4`（右侧 `flex: 3.6`，间隙 `64px`，容器最大宽度 `1240px`）；时钟圆环尺寸扩大至 `440px × 440px`，时间数字字号扩大至 `clamp(76px, 8.5vw, 92px)`（700 粗体，`-2px` 字距）；
6. 内嵌小圆点胶囊平衡抬升：将圆环内部的状态指示小圆点胶囊（`.ring-pill`）位置调高（`bottom: 64px`），消除原先贴近底部进度圆弧的局促下沉感，整体视觉居中舒展；
7. 全量自动化门禁：`npm.cmd run test:r4-pc`（403/403 pass）、`npm.cmd run type-check`（0 error）、`git diff --check` 全部通过。


2026-09-24 PC 关系星图（KnowledgeGraph）中间圆角边框消除与星空动效升级：
针对资产库（Asset Studio）与全局关系星图右侧视口中间存在的嵌套圆角边框及静态感问题进行全面设计重构：
1. 消除中间嵌套圆角边框并进一步拓宽画幅：彻底去除 `KnowledgeGraph.vue` 内部容器 `.knowledge-graph-wrapper` 的独立边框、圆角（原 20px）和硬编码背景色，使其完全融入宿主容器；在 `Asset/index.vue` 中将 `.ctx-graph` 设置为弹性占满且穿透去除内层包裹边框，实现真正浑然一体的无界画布；右侧星图面板宽度进一步由 540px 拓宽至 620px，赋予星空网络更开阔通透的展示画幅；
2. 极简毛玻璃 HUD 图例胶囊：废除原有遮挡星图的顶部粗重长条形卡片，升级为悬浮于顶部的毛玻璃胶囊（`border-radius: 9999px; backdrop-filter: blur(8px)`），呈现精致的“学科空间 / 关联文件 / 知识点”类型图例，右侧集成上浮微发光的“适配画幅”圆形按钮；
3. 动态星空与呼吸光晕体系：引入 60fps 连续渲染管线，将力导向物理布局计算（180 帧收敛后完全休眠，0 CPU 额外开销）与微动效渲染解耦；深层视野布设 28 颗带有正弦闪烁周期的微尘星芒；连线间流动着平滑滑行的能量光子（Energy Photons）；核心学科天体具备外层扩散光晕与纯色实体天体（去除中间小白点，保持纯净禅意质感），所有节点呈现有机呼吸节律；
4. 交互焦点聚焦模式：鼠标悬停在特定天体节点时，高亮关联的链路与邻接节点，其余无关节点柔和降淡至 0.28 透明度，大幅提升复杂星图的可读性与沉浸感；
5. 全量自动化门禁：`npm.cmd run test:r4-pc`（403/403 pass）、`npm.cmd run type-check`（0 error）、`git diff --check` 全部通过。

2026-09-24 PC 资产库（Asset Studio）知识块与任务编辑排版重构、标签精简与任务所属学科自选收口：
根据沉浸式现代笔记与任务工坊交互体验，全面重构 `Asset/index.vue` 中栏知识块与任务编辑区域排版：
1. 消除标题冲突与冗余操作栏：重构中栏顶栏 `.detail-header`，移除原有与正文编辑输入框重复展示的标题文字及双重保存按钮，升级为自适应顶部工作条；文件呈现信息概览，知识块精简顶栏展示纯净面包屑（`知识库 / 学科`）与字数统计及保存按钮，任务呈现状态切换胶囊（待处理/已完成）、排期元数据与保存按钮；
2. 知识块顶部标签精简：去除知识块纸张卡片顶部多余的 `# {{ tag }}` 标签徽标，保持纯净学科胶囊与沉浸式笔记排版；
3. 任务所属学科与预计用时支持自选与全圆角化：在任务属性工坊中，将所属学科与预计用时均升级为定制胶囊圆角的 `el-select`（`.zen-select`，配合 `popper-class="zen-select-popper"` 实现触发框 9999px 胶囊圆角与弹出下拉面板 16px 大圆角设计，选项项 10px 圆角与柔和微阴影）；修正 Vue scoped 样式下 `html.dark` 祖先选择器被编译器脱落导致的浮层底色异常，确保浅色模式下稳定呈现米白宣纸底色 `#FAF7F2`；在 `useTaskStore.ts` 的 `updateTaskDetails` 中支持 `subjectId` 字段流转与离线持久化同步，用户可在编辑任务时自由切换归属学科并持久化保存；
4. 统一温润纸张画布（Paper Canvas）与无滚动条纯净视图：知识块与任务正文编辑区采用统一定制纸张卡片 `.editor-paper-card`（`#FAF7F2` 宣纸底色、圆角 20px、微质感边框与柔和浮起阴影），居中最大宽度 860px，彻底消除原标题浮于大底板、内容孤立卡片的破碎感；中栏滚动区、左右侧栏、文本域与弹出下拉列表全量隐藏滚动条外观，保留平滑流畅滚轮交互；
5. 全量自动化验证通过：`npm.cmd run test:r4-pc`（403/403 pass）、`npm.cmd run type-check`（0 error）、`git diff --check` 全部通过。

2026-09-24 PC 资产库（Asset Studio）温润配色全面对齐与关系星图拓宽收口：
根据温润浅燕麦米白规范（页面底色 #EEEEEE、大容器/主底板 #F7F2EB、卡片/模块 #FAF7F2、主强调色 #8B9A6E）对齐 `Asset/index.vue` 配色，并扩大右侧关系星图：
1. 拓宽关系星图并清理旧内联样式：移除 `<aside class="studio-right-context">` 原写死的内联 `style="width: 450px;"`，将 CSS 宽度提升至 `540px`（+90px，拓宽 20%），为力导向节点与文件名展示提供充足空间；移除子标题栏写死的 `style="background: var(--color-bg-secondary);"`，统一由 CSS 控制；
2. 三栏容器与头部底色对齐：`.studio-left`、`.studio-middle`、`.studio-right-context` 三栏背景统一为 `var(--color-bg-primary, #F7F2EB)`，添加 `0 10px 24px -4px rgba(0,0,0,0.05)` 柔和阴影与边框；修复 `.middle-content-scroll` 误用 `#EEEEEE` 导致的中间断层色差；
3. 卡片、输入框与模态框底色对齐：`.search-input`、`.editor-content-wrapper`、`.block-row`、`.task-row`、`.inline-block-editor`、`.modal-container`、`.styled-input`、`.styled-textarea`、`.subject-capsule-item` 统一对齐为 `#FAF7F2`，并添加微阴影；聚焦轮廓收敛为 `#8B9A6E` 发光；
4. 按钮与组件库主题收拢：主按钮 `.btn-primary` 与保存按钮采用 `#8B9A6E` 渐变及阴影，次级按钮采用 `#FAF7F2`；统一 Element Plus 日期选择器与弹出层的 hover/focus/selected 强调色；
5. 类型定义与全量测试守卫：修复 `KnowledgeGraph.vue` 中 `down` 交互状态缺失 `pointerId`、`startX`、`startY` 的 TypeScript 检查报错。全量 `npm.cmd run test:r4-pc`（401/401 pass）、`npm.cmd run type-check`（0 error）、`git diff --check` 全部通过。

2026-09-24 紧邻任务交换逻辑调整：顶部交互栏交换两个原排期首尾相接的任务时，按交换后的顺序紧凑排在两项原共同时间窗口内，窗口起止不变；其他交换保持原规则。PC 移除会误拒绝不同时长紧邻任务的“互换开始时间”预检，以服务端原子校验和返回时间为准。PC 全量回归 397/397、类型检查与构建通过；Server clean 聚焦 3/3。本机只重建并重启 backend，health/readiness HTTP 200、Flyway 23，db/minio 容器未变化；真实 GUI 拖放及认证业务请求待验收。

2026-09-24 Timeline 卡片主体放置规则调整：主体 drop 携带目标任务 ID，被拖任务接在目标结束后的首个半小时槽；目标及其他任务不移动，若占用后续排期则整笔拒绝。普通空白槽位维持原有插入顺延，仅顶部交互栏交换。PC 完整回归 397/397、类型检查和构建通过；Server 严格主体放置/普通插入聚焦 5/5，OpenAPI artifact 校验与双端 SDK 生成检查通过。本机只重建并重启 backend，health/readiness UP，Flyway V23 成功，db/minio 容器未重建；真实 GUI 拖拽与认证后的业务请求仍待验收。

2026-09-24 PC Timeline 日视图固定刻度轴与卡片网格跨越编排收口：日视图固定呈现 08:00–22:30 全部 30 个半小时刻度槽位行，彻底移除基于任务覆盖隐藏整行刻度的旧逻辑（`v-show="!isSlotCovered(slot.time)"`）；刻度行保持定高 80px 与 4px 垂直间隙，不随任务存在而压缩或隐藏；任务卡片自起始槽位绝对定位跨越网格，左侧时间标尺所有半小时刻度完整可见；交互分流保持不变：卡片顶部 `.task-header` 用于原子交换，主体（按垂直偏移计算落点）与普通空白槽位用于单事务插入顺延。PC 全量回归 `npm.cmd run test:r4-pc` 397/397 全量通过，`npm.cmd run type-check`、`npm.cmd run build`、`git diff --check` 全部退出 0。

2026-09-23 Server 排期截止时间门禁修复：`dueAt` 作为纯提醒/排序字段，服务端 create/update/swap/schedule-insertion 允许排期晚于截止时间且保留原始 `dueAt`；V23 移除 `ck_tasks_schedule_order`，不改写现有行。排期重叠、固定完成任务和可用窗口检查不变。Server `CoreDomainServiceTests` + `CoreDomainControllerTests` fresh 聚焦 26/26，`mvnw -B -ntp -DskipTests package` 退出 0；真实 PostgreSQL migration、Docker 部署与 GUI 验收待执行。V18 历史迁移清空的 `scheduled_at` 不会自动恢复。

2026-09-23 排期插入运行恢复：backend 日志证实旧容器镜像对 `POST /api/tasks/schedule-insertions` 抛 `HttpRequestMethodNotSupportedException`，通用处理器将其包装为 HTTP 500 `An unexpected error occurred`。重建 Docker image 后仅重启 backend，容器 healthy、readiness HTTP 200；容器 Created 2026-09-23，backend 无数据挂载。为适配 Windows CRLF Maven wrapper，Dockerfile build stage 先转 LF。默认 prod profile 关闭运行时 OpenAPI（`/v3/api-docs` HTTP 404）；仓库 OpenAPI artifact 包含此 POST。db/minio 为恢复 backend 临时启动现有容器，未重建服务或卷。此运行证据尚未包含 GUI 拖动或认证后的业务请求复验。

2026-09-24 知识块资源清理与纯结构化知识块规范（杜绝上传态假文件）：针对测试账号（`pc-ai-test-20260918@example.com`）全面清理先前注入的 20 个测试 Source 以及 MinIO 中 8 个虚假文件资产（彻底消除 `invalid-fixture-*` 等处于 `AWAITING_CLIENT` 上传态/解析失败态的假文件），保留用户真实上传的文件；所有 32 个结构化知识块（`knowledge_blocks`）与假文件解耦（`source_id = NULL`），覆盖 12 个学科空间作为自包含的核心考点卡片展示。注入脚本 `scripts/seed-knowledge-blocks.mjs` 同步重构，严格收敛为仅注入纯知识块，绝不生成上传态假文件或假 Source。PC 端本地 SQLite 同步完成状态清理，全量回归 `npm.cmd run test:r4-pc` 397/397 全部通过。

2026-09-23 PC Timeline 插入顺延与顶部交换：日视图普通槽位、任务卡片主体落点现在通过 `POST /api/tasks/schedule-insertions` 由 Server 单事务插入并连锁顺延发生冲突的后续任务，保留原有空档；仅卡片顶部 `.task-header` 落点调用双任务原子交换。顺延按半小时网格对齐，已完成任务固定，越出当天 08:00–22:30 起始槽窗口时整组拒绝；`dueAt` 不再限制排期。Server 只顺延当日开始的任务；前一日开始且跨入窗口的长任务保持原状，若阻挡落点则整组拒绝。PC 成功后缓存返回的任务并请求 read sync；目标日有未解决本地写入时拒绝在线操作。原完整 PC 回归 395/395、type-check、build、OpenAPI/PC/Mobile SDK 契约检查退出 0；Server 服务/控制器/OpenAPI 定向测试最终 32/32。Mobile type-check 被既有 `assetUpload.ts:47` 缺少 `clientImportId` 阻断；Server 全量 testCompile 受本机 IDE 写入的错误 class stub 干扰。真实 PostgreSQL 并发、跨设备 Sync 与 GUI 拖放尚未验收。

2026-09-23 PC 首页待办清单与排期副驾待安排队列多级排序收口（分支 `agy/deadline-as-reminder`）：
在 `taskViewRules.ts` 中实现并导出纯函数 `comparePendingTasks`，待办清单严格按照「有 DDL 时间优先 → DDL 时间较近优先（时间戳升序） → 持续时间较短优先（时长升序） → 名称兜底稳定排序」的规则排序；在 `Dashboard/index.vue`（首页待办清单）与 `Timeline/index.vue`（排期副驾待安排队列）中统一应用该排序规则；在 `r4-task-view-rules.test.mjs` 中添加针对多级排序规则的单元测试。PC 全量回归 `npm.cmd run test:r4-pc` 为 393/393 全部通过，`npm.cmd run type-check` 与 `git diff --check` 退出 0。

2026-09-23 PC 与 Server 排期区间重叠防护：根因是时间轴以半小时槽位定位任务，但 Store 只校验起始槽位，没有按 `durationMinutes` 判断完整任务区间；PC 的 `mapTaskView` 还将远端空时长映射为 25 分钟，与 Server 的 30 分钟有效默认值不一致。现已在 PC 本地持久化入口对新增/变化的非取消排期区间按 `[scheduledAt, scheduledAt + durationMinutes)` 检查，按天排期逐 30 分钟寻找可用槽位；本端相关操作由 Store 队列串行执行。未排期任务落入占用槽被拒绝，避免分两次本地写入导致原任务排期丢失。`mapTaskView` 现将 null/缺失、非整数、负数或超出 Java Integer 范围的时长统一映射为 30 分钟，API 合法的 0 保持原值。Server 的 REST 与 Sync 共用 TaskService 校验，create/update/restore/swap 在事务内按 User→Subject→Task 锁序串行化同用户写入；空时长按 30 分钟处理，首尾相接允许。PC 排期、任务视图及 DTO 映射定向回归 40/40、type-check、build 及 diff-check 退出 0；Server 聚焦 29 项测试与 diff-check 退出 0。既存重叠数据不会被自动迁移；真实 PostgreSQL 并发、跨设备同步和 GUI 业务验收尚未执行。PC 构建仍有既有模块 externalization、chunk size、dynamic import 警告。

同一最终工作树的完整 PC 回归 `npm.cmd run test:r4-pc` 为 393/393，通过且无跳过；该结果仅证明自动测试，不代表真实 GUI 或跨设备验收。

2026-09-23 PC 学科工作区生命周期、会话清理防 ABA 覆盖与阅读会话竞态收口（分支 `agy/deadline-as-reminder`）：
1. 解决旧阅读会话晚于新会话完成导致覆盖问题：在 `onMounted`、`watch(subjectId)` 与 `selectFile` 的 `await chatStore.startReadingSession(...)` 后均严格加入后置代次、卸载态与学科/文件匹配守卫；
2. 解决旧会话清理误清空新活动会话的 ABA 竞态：在 `useChatStore.ts` 的 `endActiveSession()` 中记录目标会话 ID，`finally` 块仅在 `activeSessionId === targetSessionId` 时才清空活动会话；同时在 `useChatStore.ts` 中新增并导出 `endSessionById(sessionId)`，`SubjectWorkspace` 在代次失效时直接调用 `endSessionById(readingSessionId)` 精准回收特定会话，杜绝误杀已经接管的新学科会话；
3. 解决组件卸载后定时器与会话泄漏问题：引入 `isComponentMounted` 挂载标记，在 `onUnmounted` 时立即递增 `currentSubjectSwitchGen` 并标记组件卸载，彻底阻断异步挂载流程在卸载后的恢复执行，并安全停止定时器与结束会话；
4. 解决首次加载切学科导致文件处理轮询定时器丢失问题：将后台文档处理状态刷新提取为幂等函数 `startProcessingRefresh()` 与 `stopProcessingRefresh()`，并在 `onMounted` 挂载入口立即启动，与特定学科的异步加载链路解耦。
自动化测试与门禁验证：`npm.cmd run test:r4-pc` 387/387 全量通过，`npm.cmd run type-check`、`npm.cmd run build`、`git diff --check` 全部通过。

2026-09-24 PC 学科中心与学科工作区（SubjectWorkspace）配色系统全层级对齐与预览栏底色收口：
根据温润浅燕麦米白配色方案（大页面底色 #EEEEEE、大容器/主底板 #F7F2EB、小卡片/模块色 #FAF7F2、主强调色 #8B9A6E）全面对齐 PC 学科中心、学科工作区、预览栏与各功能模块：
1. 修复预览栏全层级背景：统一 `workspace-center`、`.center-status-bar`、`.center-body`、`.preview-page-footer` 以及 `.pdf-workspace`、`.blocks-workspace`、`.onboarding-workspace` 为 `var(--color-bg-primary, #F7F2EB)`；彻底解决预览栏与子区域冷灰或死白不协调问题；
2. 修复 `FilePreview.vue` 与阅读器画布：`FilePreview` 在 bare 模式下 body 背景设为 `#F7F2EB`，渲染器外壳 `.file-preview-renderer-shell` 与 `UnsupportedPreview.vue` 设为温润宣纸底色 `#FAF7F2`；在 `FileViewerRenderer.vue` 中显式设置并 deep 覆盖第三方 `@file-viewer/vue3` 的 `--file-viewer-bg` 与 `--file-viewer-render-surface-background` 为 `var(--color-bg-tertiary, #FAF7F2)`，彻底消除第三方阅读器默认纯白/冷灰底板；
3. 修复 AI 总结面板（`OverviewSummaryView.vue`）：将根容器与头部背景对齐为 `#F7F2EB`，总结内容卡片对齐为 `#FAF7F2`，补全 `index.css` 的 `--bg-primary`、`--bg-secondary`、`--bg-card` 别名变量映射；
4. 按钮与微交互色彩统一：抽屉 `.drawer-action`（学习文件按钮）与总览加号按钮统一采用 `#8B9A6E` 渐变圆角及柔和立体阴影（`box-shadow: 0 2px 8px rgba(139, 154, 110, 0.35)`），预览栏顶部缩放/旋转/重置按钮组与 AI 栏顶底控制（清空按钮、发送圆钮、模型胶囊）全部应用统一主色微质感与悬浮高亮；
5. 全量测试与类型构建通过：`npm.cmd run type-check`、`npm.cmd run test:r4-pc`（397/397 pass）、`npm.cmd run check:subject-icons`、`npm.cmd run check:subject-workspace` 及生产打包 `npm.cmd run build` 全绿，所有针对布局与文件预览的断言完全保持一致。

2026-09-23 测试数据与数据库全量重置并按新待办约束完成重新注入：执行本机 PostgreSQL `public` schema 重建与 Flyway v1~v22 全量迁移，清空 MinIO 历史测试对象，并按规定安全移除本地旧 SQLite 缓存（`auralis.db*`）。重构注入约束与脚本（`scripts/seed-test-account.mjs` 及 `docs/operations/TestAccountDataResetAndSeed.md`）：
1. 任务时长严格约束为整半小时（30、60、90、120 分钟），严格杜绝 45 分钟或任何非 30 分钟整倍数任务；
2. 严格不注入知识块（保持 0 知识块）；
3. 标准 240 项任务中，合理保留 48 项为时间轴合法白天槽位任务（每个学科 4 项，槽位唯一无重叠）；将 144 项设为未排期活跃任务（`scheduledAt: null`，每个学科 12 项），其中 72 项为无截止日期纯待办任务（`dueAt: null`），72 项带未来截止日期，供首页看盘与排期副驾充分验证无 DDL 待办与 DDL 徽标提醒；其余 24 项为已完成，24 项为已取消。
数据库重新注入校验结果：`total_users=1`、`total_subjects=12`、`total_tasks=240`、`invalid_durations=0`（时长为 30m:60, 60m:60, 90m:60, 120m:60）、`knowledge_blocks=0`、`active_scheduled=48`、未排期活跃任务 `active_unscheduled=144`（`no_due=72`，`has_due=72`）、重复排期槽位为 0。

2026-09-24 PC Timeline 日视图固定刻度轴与卡片网格跨越编排收口：日视图固定呈现 08:00–22:30 全部 30 个半小时刻度槽位行，彻底消除长任务导致后续刻度断档隐藏的问题；网格行定高 80px 防压缩；任务卡片 `.slot-task` 改为绝对定位跨格，视觉高度匹配任务时长。交互分流精准锁定：卡片最顶部文字标题栏（`.task-header`，收敛为 `fit-content` 且文字子节点设为 `pointer-events: none` 阻断误清除）作为双任务交换落点（`swapScheduledTasks`）；离开顶部文字区域的卡片主体与空白区域按垂直偏移进入插入顺延（`insertTaskAtSlot`），杜绝主体误触发交换。全量 `npm.cmd run test:r4-pc` 397/397、`npm.cmd run type-check`、`npm.cmd run build` 及 `git diff --check` 全部通过。

2026-09-23 PC 截止日期（dueAt）与排期门禁解耦为纯 DDL 提醒特性收口（独立分支 `agy/deadline-as-reminder`）：全面将截止日期从排期/待办资格限制中解耦，任务无需截止日期即可进入待办清单与排期副驾待安排队列，`dueAt` 仅作为到期提醒与排序参考。移除 `recoverOverdueTasks` 中清空逾期未排期任务 `dueAt` 的逻辑，永久保留用户的真实截止日期；首页待办清单标题行最右侧补充「前往排期」微胶囊跳转按钮；首页待办卡片与 Timeline 待安排卡片均新增截止日期徽标（`todo-due-badge`、`pending-due-badge`），逾期时低饱和暖红高亮告警；更新 `r4-task-view-rules.test.mjs` 与 `r4-task-store-schedule.test.mjs` 自动化测试守卫，确保无 DDL 任务可排期、真实 DDL 不被抹除或篡改、`unscheduleTask` 绝不捏造假 `dueAt`。同步修复学科工作区 `saveCurrentOutline` 保存返回后校验目标学科 ID 防止大纲跨学科污染，在 `onMounted`/`watch(subjectId)` 中引入递增序号 `currentSubjectSwitchGen` 与路由 ID 守卫彻底消除快速连续切换学科时的异步覆盖竞态，并在切换学科时同步重置总览过期标记（`isSubjectOverviewStale`）、手动错误（`subjectOverviewManualError`、`fileOverviewManualErrors`）与生成中状态。全量 `npm.cmd run test:r4-pc` 386/386、`npm.cmd run type-check`、`npm.cmd run build` 全部通过。

2026-09-23 PC 学科大纲保存数据保留、消除切换异步残留、彻底消除伪轮转覆写、首页移出日程按 ID 寻址、严禁捏造 dueAt、学科切换 AI 请求旧文件隔离与测试脚本一致性收口：修复学科工作区（`SubjectWorkspace/index.vue`）大纲手工编排保存时覆盖丢失小节 `summary`、多文件 `sourceIds` 及 `locator` 的问题，UI 扩展支持每小节展示多文件胶囊与独立解除关联；彻底移除早期原型遗留的 `syncOutlineFileLinks` 及其在 `onMounted`/`watch(subjectId)` 的覆写调用，确保真实文件关联不受伪轮转破坏；在 `watch(subjectId)` 入口第一行立即同步调用 `chatStore.abortStream()`、`chatStore.clearActiveConversation()`、清空 `selectedFileId`、`selectedAiSourceIds`、`sourceStore.clearActiveSourceFiles()`、`subjectOutline` 与草稿并为 `saveCurrentOutline` 加入非空守卫，彻底消灭切换学科等待期间旧大纲被保存进新学科及 AI 请求携带旧学科文件 ID 的异步竞态窗口；在 `sendChat`、`retryChat`、`sendSelectionQuestion` 与 `saveKnowledgeBlock` 中严格增加跨学科文件归属校验，非当前学科文件 ID 一律过滤置空；扩展 `useTaskStore.ts` 的 `unscheduleTask` 优先通过唯一任务 ID 匹配，避免 `Dashboard/index.vue` 移出日程在同槽多任务时的串操作，并在发生异常时通过 `ElNotification` 弹出清晰错误提示；严格禁止在 `unscheduleTask` 中为未设置截止日期的任务捏造并持久化假 `dueAt`，任务移出日程仅清除 `scheduledAt` 与 `startTime`，首页“待办清单”展示由 `Dashboard/index.vue` 纯 UI 计算属性安全投影未排期活跃任务；同步清理 `scripts/seed-test-account.mjs` 中多余注册第二个 companion 账号的逻辑，严格维持单一测试账号 `users=1` 基准。全量 `npm.cmd run test:r4-pc` 386/386、`npm.cmd run type-check`、`npm.cmd run check:subject-workspace`、`npm.cmd run check:subject-icons` 及 `git diff --check` 全部通过。

2026-09-22 测试注入数据已按新时间轴规范全量重置并注入完成：执行本机 PostgreSQL `public` schema 重建与 Flyway v1~v22 全量迁移，清空 MinIO 历史测试对象。通过标准 REST API 重新为测试账号 `pc-ai-test-20260918@example.com` 注入 12 个学科空间与 240 个类真实任务。排期严格限定在时间轴合法可视窗口（`08:00 ~ 22:30`）内的 6 个标准半小时槽位（`08:30`、`10:30`、`14:00`、`16:00`、`19:00`、`21:00`），从次日起按日均分（每日 6 项），彻底消除凌晨与深夜排期。数据库校验结果：`users=1`、`subjects=12`、`tasks=240`、`active_scheduled=192`、重复槽位为 0、非法时段排期为 0。PC 端 `npm.cmd run test:r4-pc` 382/382 全部通过。

2026-09-22 PC 首页看盘时间轴简化为纯任务排列：重构首页看盘（`Dashboard/index.vue`）右侧面板，采用上下双卡片分区架构。上半部移除 06:00~23:30 垂直网格刻度槽位、当前时间指示红线及拖拽换槽改期逻辑，改为「日程任务」简单线性排列，按任务开始时间升序排列卡片，展示时间微胶囊、学科标签、标题及即时完成复选框和移出日程按钮；保留顶部日视图/周视图胶囊切换与 7 天日期快捷选择；下半部「待办清单」移除拖动手柄与拖动属性，纯列表展示未排期任务并支持直接勾选完成。时间轴复杂拖拽与全天半小时网格编排完全收敛至 `/timeline`（排期副驾）。`r4-dashboard-timeline.test.mjs` 测试对齐完成，PC 全量测试 `npm.cmd run test:r4-pc` 382/382、`npm.cmd run type-check` 与 `npm.cmd run build` 全部退出 0。

2026-09-22 PC 学科中心知识块布局微调与底部立体阴影优化：将学科工作区（`SubjectWorkspace/index.vue`）知识库网格（`.blocks-grid`）与上方微状态栏及操作条（`.blocks-top-bar`）之间增加缓冲下移距离，`.blocks-workspace` 调整为 `padding: 24px 28px 20px`，`.blocks-top-bar` 调整为 `margin-bottom: 24px`，`.blocks-grid` 引入 `padding: 8px 6px 24px 6px` 与 `margin: 0 -6px`，整体视觉向下自然沉降 16px，彻底消除卡片鼠标悬浮态（`transform: translateY(-3px)`）被滚动容器顶边界及上方状态栏/操作条遮挡裁切的问题。同时为知识块卡片（`.block-card`）、学科空间卡片（`.subject-card`）及搜索输入框（`.search-input`）加入双层立体底部微阴影与暗色模式适配，悬浮态提升至 `z-index: 2` 并扩展投影。PC `npm.cmd run test:r4-pc` 382/382、`npm.cmd run type-check`、`npm.cmd run build` 及 `git diff --check` 全部通过。

2026-09-22 PC 总览栏展现与交互优化：移除抽屉顶栏“AI 梳理”按钮，保留总览标题与大纲编排入口；大纲编排加号按钮在激活编辑状态时支持平滑旋转 45° 转换为灰色 `×`；重构 `SubjectOverviewSection.vue`，将学科总览卡片边框加粗为 2px 灰绿边框以凸显主次，顶栏错误集成“遇到意外错误，请重试”与操作一体化胶囊，一键生成换为纯文本胶囊与上下居中排版；文件总结按钮升级为圆角胶囊；“...”弹出菜单与菜单项全面升级为圆角微质感风格；大纲展现彻底移除生硬折线分支，重构为现代极简导轨与微圆点对齐风格。同时完整保留学科总览生成、大纲重新生成、查看总结、资料更新提示与错误重试全部功能。全量 `npm.cmd run test:r4-pc` 382/382、`npm.cmd run type-check`、`npm.cmd run build` 及 `git diff --check` 全部通过。


2026-09-21 Issue 3/4 前端实现与自动验证已收口：PC 连接状态 projection 按错误、离线、Realtime 重连、同步中、已同步的优先级展示，问答错误在聊天区域保持可见并可重试；Overview 手动重生成返回 `STARTED`/`SKIPPED`/`FAILED` 结构化结果，自动触发静默处理，失败/跳过保留既有缓存，并以 generation/abort/Source 状态 fence 阻止删除或修订后的晚到 Subject 结果写回。最终 focused 68/68，`npm.cmd run test:r4-pc` 382/382，`npm.cmd run type-check`、`npm.cmd run build`、`git diff --check` 均通过。自动证据不等价于真实 WebSocket、浏览器 online/offline、Tauri/GUI 文件预览或真实 Provider 验收；SQLite experimental、Vite externalized/dynamic-import/chunk size 警告仍存在。Issue 2（删除 Source 后 Chunk/RAG TopK）仍为计划未实现，Issue 5–7 仍待分别核实；本轮未改 API 或数据库契约。

2026-09-20 Overview Reduce prompt compression Task 2 已完成文档与自动验证收口：Task 1 保持 MAP prompt 行为不变，并为非最终及最终文档 REDUCE 接入专用均衡压缩 prompt；其规范化长度为 843 字符，目标约 2500–3000 个序列化 JSON 字符。`max_tokens=4608/6144`、规范化 intermediate `<=5200`、self-pair `<=12000`、no-progress、schema/alias/mode/locator 校验及分组/批次边界均不变。focused Server 四类测试实际 55/55，test-compile 与根目录 `git diff --check` 通过；自动证据只覆盖路由、prompt 约束和既有不变量，不等价于真实 DeepSeek 压缩质量验收。真实样本的输出字符数、内容覆盖、JSON/schema 成功、延迟、token 使用和成本仍未验证。

2026-09-18 OCR 页级进度 Task 5 已完成代码和自动验证：Pinia Store 的 Local OCR projection 改为成功 reader 结果的原子更新，并以已有 `attempt + localContentRevision` 作为内部 run identity；同一 run 的允许后续事件必须与最近有效 page/total 一致才保留，倒退 `before-recognize`（包括 totalPages 变化）不覆盖，新 run 必须先建立自己的 checkpoint，reader pending 时保留旧值，reader detach、Source 从 OCR_RUNNING 读集中消失或 reader 失败时清除失效投影。新增回归与 Store/UI/coordinator/runtime 套件 68/68、`npm.cmd run type-check`、`git diff --check` 通过。仅证明 Store/runtime 投影代码和自动回归，不等价于真实 Tauri/GUI OCR 进度观察；本轮未改 UI、OCR Coordinator、sync、API 或数据库契约。

2026-09-18 测试注入排期问题已定位并修正：注入脚本原使用 45 分钟起始间隔，但任务时长包含 60/90 分钟，导致时间轴任务块必然重叠。现行流程改为全局 2 小时起始间隔，并要求间隔不小于最大任务时长；当前 192 条活动排期已通过 API 修正，区间重叠为 0、最小空档为 30 分钟。该问题确认为测试注入数据问题，不归因于前端时间轴布局。

2026-09-18 OCR 页进度与 Source 收敛 Task 4 已完成代码和自动验证收口：本地 OCR 页级进度投影已修复，复用既有 `正在识别第 X/Y 页` 文案，不新增百分比或新 UI；替换 WebSocket 在 `onopen` 只触发一次既有 background `read` sync；处理 runtime 以生命周期/认证 scope guard 管理共享有界 reconciliation，覆盖遗漏的 Source `READY`。focused OCR/UI/runtime/protocol/sync 套件 90/90、`npm.cmd run type-check`、PC `npm.cmd run test:r4-pc` 352/352、`npm.cmd run build` 与 `git diff --check` 通过。上述为自动验证和代码状态证据，不等价于真实 Tauri/GUI OCR 进度、真实后端 WebSocket/event delivery 或跨设备收敛；这些仍属人工/发布验收边界。API、数据库 schema 和契约未变化。

2026-09-17 修复点 1（待处理）：PC 前端实时解析状态展示缺失。当前需沿 `Source → ParsedDocument/DocumentProcessingJob → 前端状态组件` 链路核对状态事件、Store 映射和 UI 消费；本条仅记录问题，尚未声称修复或完成真实 Tauri 验收。

2026-09-17 修复点 2（待实现）：AI 多文件提问交互需要从“静默调用其他文件”调整为显式选择。输入栏左侧提供 `+` 按钮，用户主动选择其他文件后，才将所选文件与当前上下文一起提交提问；未选择时不得静默引入其他文件。

2026-09-17 修复点 3（待处理）：文件预览首次打开时疑似发生约 2–3 次重复加载；预览失败时的错误信息未在预览区域居中显示。当前仅记录现象，加载触发链和错误态布局仍待核对。

2026-09-17 修复点 4（待处理）：无法连接后端时缺少用户可见的失败状态。问答请求没有错误反馈，左下角连接/同步状态也没有变化；需补齐连接状态传播、问答错误处理和全局状态展示。

2026-09-18 修复点 5（已完成并通过真机验收）：Server 删除 Subject 时在同一事务内软删除 Source、KnowledgeBlock、Task、Relation 并写入既有同步事件；相关 mutation 统一遵循“UUID 排序锁全部 Subject → 锁并重读具体资源 → 重校验 → 修改”的数据库锁协议。PC 先持久提交父删除标记，再围栏子投影、draft、处理任务与文件总览；父删除未决期间保留可回滚的 draft/bytes，服务端确认 APPLIED 后才终结 draft 并按最后引用规则清理本地 Asset，拒绝时原子恢复父记录并持久请求 authoritative snapshot。Server 聚焦 40/40，PC `test:r4-pc` 342/342、`type-check`、build 均通过；本轮 Subject 删除生命周期、重启与强杀恢复已完成人工真机验收，未发现阻塞问题。

2026-09-18 修复点 6（已完成并通过真机验收）：根因是 PC `replaceSources()` 从可见首行推断当前 Subject，导致跨学科导入、空学科和异步 A→B 加载时投影错位；现已把当前 Subject 与可见行解耦，并用 generation/subject guard 丢弃过期完成结果。Local Asset 的物理路径继续使用与学科无关的稳定 `assets/{userScope}/{localAssetId}/content.{ext}`，业务学科归属由 Source/draft 的 `subjectId` 表达，不新增按学科复制或搬移文件。相关流程 9/9、PC `test:r4-pc` 334/334、`type-check` 通过；本轮文件学科归属真机验收通过。

2026-09-18 release/stability 非阻塞测试项：双设备真实收敛、低磁盘、MinIO 故障注入和长时间稳定性尚未取得明确逐项执行记录，继续保留在发布稳定性测试范围，但不再作为 Local Asset Store 改造的未完成任务。MinIO 实际同步主链路此前已人工验证；本轮重启、强杀及异常恢复流程已人工验证，未发现阻塞问题。

2026-09-18 PC Local Asset Store 改造已完成并通过本轮真机验收。`b7a3bb7..c560d8b`（含 `f770277`、`e040e78`）完成永久本地资料库、owner/device scope、所有文件默认同步、断网导入/预览/本地 OCR/Parser、Source draft 与服务端 Asset 映射；后续提交完成文件学科归属与 Subject 删除生命周期收口。原始文件在受管目录中以明文保存，由 OS ACL 保护；Local Asset 不提供备份、导出或恢复。只有用户明确删除且最后一个 Source 引用消失后才删除本地文件；上传、解析、修复和删除任务在该边界前后均受 fence 保护。启动同步前 reconcile 数据库、受管文件和 staging 残留，缺失或 hash/size 不一致标记 `CORRUPT`，未知内容 quarantine。本轮主要流程、Subject 删除、重启/强杀及异常恢复均已人工验证，基本未发现问题；MinIO 实际同步主链路此前已人工验证。

自动与人工证据分开记录：Task 7 定向 77/77、FilePreview+store 38/38、Rust 30/30，`cargo fmt --check` 与 `cargo check` 通过；schema v8→v9 旧断言已由 `c560d8b` 对齐。最新本轮 PC 全量 `test:r4-pc` 为 342/342，`type-check` 与 build 通过。本轮另有真机人工验收结论；双设备、低磁盘、MinIO 故障注入和长时间稳定性仍属于未逐项执行的 release/stability 测试，不影响本地仓库改造完成状态。

2026-09-15 PC Local Asset Store 设计快照（已由 2026-09-17 实施记录更新）：当日产品与架构设计确认“已批准设计，尚未实施”，定义 PC Tauri 的永久本地文件、断网预览/解析、联网幂等同步、身份映射和最后 Source 引用删除语义；当日代码、SQLite schema、Server API 和运行行为尚未改变。

2026-09-15 Overview 失败体验与真实运行证据收口：用户复跑同一真实 Overview 后，第二次全链路成功，证明永久预算链路已能完成运行；生成内容质量仍需用户判断。Overview 的 `MODEL_PROVIDER_ERROR` 现在由 PC 显示为“遇到意外情况，请重试”，不新增 Server/API 错误码；FAILED 终态保护继续生效，不自动重试，只有用户点击“重新生成”才发起新请求。该 Overview 专用文案不影响普通 AI 聊天/流式路径。

2026-09-17 Overview token budget 调整为原预算的 150%：多批 MAP/非最终 REDUCE 为 `max_tokens=4608`，最终调用为 `6144`；规范化 intermediate JSON 上限与 self-pair 边界不变。普通聊天/流式不变。

2026-09-15 DeepSeek Overview prompt 压缩真实验证：同一 42-chunk/6-MAP 资料在新 intermediate prompt 下，六个 MAP 全部通过，`normalizedChars` 依次为 `2131,2027,2581,2817,3680,1447`，最大 MAP5 为 `1750 outputTokens`；此前超限的 MAP2 从 5105 降至 2027。随后 REDUCE round 1 分两组，第一组为 `2446 chars/1041 tokens` 并通过，第二组为 `4678 chars/2239 tokens`，在 `finishReason=stop` 且 JSON/schema 成功后仅触发 `characterOverflow=true`；其 `selfPairPromptChars=10899<=12000`。结论是 prompt 能显著压缩 MAP，但不能独自保证所有 REDUCE 输出低于 4000。Final prompt、4000/12000 硬校验、batch 和临时无 `max_tokens` 行为未变；TDD RED/GREEN、review 与相关兼容集合 58/58 均完成，永久参数尚未实施。

2026-09-14 Overview retry/convergence 与 DeepSeek structured response 修复：PC 对当前 revision 的 `FAILED` 与部分 `READY` 文件总览缓存视为自动终态，`SOURCE_READY`、`RESUME_BOOTSTRAP`、`RESUME_ONLINE`、`RESUME_SYNC`、`JOB_CHANGED` 不再自动 POST；`MANUAL_RETRY` 可绕过并继续使用 in-flight coalescing。失败/部分结果只保留一个可见“重新生成”，生成中 disabled，旧内容保留；网络/状态不确定文案与确定性失败分开。Server 中间调用使用 1024 `maxTokens`、最终调用 4096；中间输出在下一轮前校验 `outputTokens<=1024`、规范化 JSON `<=4000` 字符和 self-pair prompt fit，Reduce 保持 no-progress 单调性。Overview completion 现在显式声明结构化 JSON：OpenAI-compatible 请求发送 `response_format={type:json_object}`，DeepSeek 额外发送 `thinking={type:disabled}`，普通聊天/流式请求保持非结构化且不携带这两个字段；适配器不把 `reasoning_content` 当作最终 JSON。无有效 `message.content` 时只记录经过限制和清洗的模型标识、choice/finish/content/reasoning/usage 数量元数据，不记录 prompt、响应体、URL 或 key。`OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE` 与 `OVERVIEW_REDUCE_NO_PROGRESS` 均为 HTTP 502，parse/schema 统一 `MODEL_PROVIDER_ERROR`；API route/DTO/OpenAPI schema/数据库未变。原持续自动补发、Reduce `VALIDATION_FAILED` 与 DeepSeek nullable content 的代码级适配问题已修复。PC Overview focused 54/54；最新 `test:r4-pc` 331/331，type-check、`check:r4-pc`（94 个生产文件）、`check:subject-workspace`、build 均退出 0。Server 本轮 fresh `clean test-compile` 退出 0，Overview/Provider/Streaming 聚焦 56/56；既有全量证据为 255 项中 252 pass、3 项 Docker/Testcontainers errors（MinioAssetStorageIntegrationTests、PgVectorIntegrationTests、PgVectorMigrationIntegrationTests）。OpenAPI gate green。上述自动证据不替代真实 DeepSeek/Provider、Tauri、网络、GUI、设备或业务验收；Server 持久 generation 幂等仍是开放风险。

2026-09-12 Build/OpenAPI Task 3 最终回归：Server fresh 聚焦命令实际执行 57 项，0 failures、0 errors、0 skipped，且 fresh test compilation 已通过；缺失的 `ProviderHttpTransport.post(..., byte[])` 仅在 `AiProviderSecurityTests` 测试 double 中补齐，生产 Provider transport 未改变。Server 全量 `mvnw -B -ntp test` 实际执行 239 项，0 failures、3 errors，错误仅为 MinIO/PgVector/Testcontainers 无法连接 Docker。`check-openapi.ps1` 退出 0（Server OpenAPI artifact 8/8，PC/Mobile 生成结果均与 artifact 一致）；artifact SHA-256 为 `BF91089DD4F272ACE0E4AC98744F0298D425DD5A43CD0EFE15E3C3627CBC5370`，两端 schema SHA-256 均为 `2152390C192BCBE34B7618D11B71F28DF72AC9262C39625594B5EF3CC7D219C7`，`subjectOverview` 与 `sourceOverview` 均暴露可选 `X-Overview-Request-Id`。PC/Mobile type-check 均退出 0，Mobile protocol test 23/23 通过；Mobile `useSyncStore` 仅增加一行编译期 payload boundary cast 以适配生成 `JsonNode` 的结构窄类型，运行时序列化不变，未来应以更精确的生成/契约类型清理该风险但不视为本轮已完成。`docs/contracts/API.md` 与 `docs/contracts/Database.md` 已核对，本轮未发现新的语义契约或数据结构变化。自动证据不替代真实 Provider、Docker、PostgreSQL/MinIO、Tauri/GUI、设备或业务验收。

2026-09-11 Server Test Gates Task 4：source 通过 source-owned `ParsedDocumentIngestionPort`/`IngestionJobReference` 与 `ai.ingestion` 保持单向模块边界；ArchitectureTests 标准聚焦 1/1、隔离架构复核 20/20；H2 清理聚焦连续两次 24/24；OpenAPI artifact 聚焦 8/8。标准聚焦 Maven 命令实际 40/40、0 failures、0 errors；全量 `mvnw -B -ntp test` 实际执行 239 项，0 failures、3 errors，错误仅为 MinIO/PgVector/Testcontainers 的 Docker 不可用。fresh `clean test-compile` 仍被 `AiProviderSecurityTests.java:182` 的匿名 `ProviderHttpTransport` 缺少 `post(..., byte[])` 阻断，未修改该 blocker；增量运行的 testCompile 显示 `Nothing to compile`，不改变 fresh 结论。`check-openapi.ps1` 的 artifact 比对和 Server 8/8 已通过，但报告 `Auralis-PC/src/api/generated/schema.ts` stale。自动门禁不替代真实 Tauri、Provider、PostgreSQL/MinIO、GUI 或业务验收。

2026-09-10 Overview 诊断增强：PC Overview 请求携带 `X-Overview-Request-Id`；Server 将请求 ID 规范为 UUID（非法值生成新 UUID），为每次生成记录 `generationId`，输出 MAP/REDUCE/JSON_PARSE/SCHEMA_VALIDATE/CACHE_RETURN 阶段；失败日志只保留 allowlisted `errorCode` 与 exception/cause 类型，不写原始 exception/cause 文本或 throwable stack。未改变生成、分块或缓存逻辑；真实 OCR 重传日志仍待人工验收。

2026-09-10 Provider Overview 503 修复：`ProviderHttpClient` 已将 Provider connect timeout 与 response/read timeout 分离，默认分别为 3000ms 与普通请求 10000ms；Overview map/reduce 非流式 completion 通过显式 timeout overload 使用默认 120000ms，配置限制为 60000–120000ms。`SocketTimeoutException` 现在返回 `MODEL_TIMEOUT`/HTTP 504，普通 IOException 仍为 `MODEL_UNAVAILABLE`/503；默认 JSON、embedding、stream 窗口保持 10000ms。TDD RED 捕获 timeout overload/配置缺失、旧错误码和配置越界未拒绝；最终 Provider、Overview、普通 streaming、embedding、错误映射及 OpenAPI 聚焦回归 60/60 通过。Provider 真实网络重试和生产外部依赖仍待人工验收。

2026-09-10 PC 学科“总览”升级：Server 新增两个认证、无状态的结构化生成端点；PC 本地 schema v7 按 user/device/source revision 保存文件与学科大纲/总结。文件处理 READY 后后台生成文件 `ALL`，学科总览仍只由用户点击原位置的“AI 梳理”触发；左栏默认折叠学科总览并直接展开各文件大纲，文件总结在中栏预览。分项重生成失败保留旧内容，学科大纲可单独重生成；空大纲/总结不会进入无效请求，全部输入删除或失效会将旧学科总览标记为资料已更新。Server 聚焦 23/23、PC 完整 R4 306/306、overview/UI 聚焦 18/18、type-check、静态检查、工作区契约、生产构建与 diff-check 已通过；OpenAPI artifact 8/8 与 PC 生成类型一致，仓库级契约门禁仍被既有 Mobile schema 过期问题阻断。Server 全量 223 项中 0 失败、28 错误，仍为既有 Modulith 边界、共享 H2 清理和 Docker 不可用问题。真实 Provider、Tauri restart/upload callback、locator 和 GUI 深浅色/窄屏仍待人工验证。

2026-09-09 PC 时间轴空槽拖动 400 修复：`rescheduleTask` 不再对空目标槽调用双任务 `POST /api/tasks/schedule-swaps` 并伪造空 `targetTaskId`；空槽调度现通过单 Task 的本地 repository/outbox 更新，仅已占用槽之间继续使用原子 swap API。TDD 修复前聚焦 12/13，确认空槽分支发送 `targetTaskId: ''`；修复后时间轴相关 35/35、完整 PC 272/272、type-check 和静态检查通过。真实 Tauri GUI 拖动与后台同步待人工验收。

2026-09-09 PC 知识块来源与学科名称映射修复：`KnowledgeBlock.sourceId/subjectId` 仅作为关联标识，`useKnowledgeStore` 现从同一用户/设备的本地 Source/Subject 投影解析可读 `title/name`，不再把 UUID 直接显示为来源或学科名称。新建/更新知识块即时保留当前可读名称，关联投影缺失时使用中性占位而不泄露 ID。TDD 回归先复现学科 UUID 被展示为标签，修复后知识块映射聚焦 12/12、完整 PC 271/271、type-check、静态检查与生产构建通过；真实 Tauri GUI 仍待人工验收。

2026-09-09 PC PDF 混合页面阶段修复：新增严格状态转换回归覆盖“文字页→OCR页→文字页”；`DocumentJobRunner` 现保持 `OCR_RUNNING` 到 `PACKAGING`，避免第三页普通文字 block 触发 `DOCUMENT_JOB_ILLEGAL_TRANSITION` 并落入 `FAILED_LOCAL`。runner 聚焦测试 12/12，完整 PC 269/269，type-check 与 diff-check 通过。自动测试未替代真实 51 页 PDF 的 Tauri GUI 重试、上传与服务端验收。

2026-09-09 Task 16 部署运行验证：仅重建/recreate backend；Compose config、backend health/readiness 和 `AURALIS_AI_INGESTION_WORKER_ENABLED=true` 通过，PostgreSQL/MinIO volume 未触碰。只读库有 18 READY Source/Job，但既有 READY 数据的 SOURCE change-log 只有 CREATE/DELETE、无 UPDATE（符合事件修复前数据预期）；未执行认证 reingest/upload，PC/Tauri/MinIO/GUI 端到端仍待验收。scheduled Sync retention 的事务入口已修复，Spring 代理入口真实 delete query 回归与 `SyncServiceTests` 11/11 通过；重建 backend 后的实际 scheduled run 日志仍待复核。

2026-09-09 Task 14：Server Source ingestion 状态与安全失败诊断的实际变化统一写入既有 `SOURCE/UPDATE` change-log/realtime 事件链；重复相同状态/诊断保持版本和 cursor 不变。Task 14 聚焦 4/4、worker/controller 8/8 通过；Server 全量 207 项中 0 失败、28 错误，错误为既有架构循环、Docker 不可用及 H2 清理外键问题。真实 Server/MinIO/Tauri/GUI 仍未验收。

2026-09-09 Task 13：ParsedDocument 上传增加有界 `[Document Upload Trace]` 事件，覆盖 PUT/complete 成功、失败和过期 intent 重试，保持缓存安全与状态机不变。upload 19/19、scheduler/flow/schema 51/51、完整 PC 262/262、type-check 和 diff-check 通过；真实 Tauri/MinIO/Server/GUI 仍待验收。

2026-09-09 PC stale/current revision preflight correction：scheduler 先进行一次权威 Source GET，取得当前 `ingestionRevision` 后再处理 stale jobs，并只对选中的 current-revision job 做 cache ID 关系校验。stale corrupt row 保留 evidence 但不阻塞 valid current row；current mismatch 在 Source GET 之后、hash/prepare/runner/upload/complete/delete 之前停止。scheduler 33/33、schema 17/17、upload 16/16，完整 PC 259/259、type-check、diff-check 通过；真实 Tauri/Server/MinIO/GUI 仍待验收。

2026-09-09 PC recoverable server-phase cache mismatch：`SERVER_VALIDATING`/`SERVER_INDEXING` 的本地 cache ownership corruption 现在合法转入 `FAILED_LOCAL`，保留两侧 ID/receipt 并可由 `retry()` 重新入队；READY/FAILED_SERVER 保持原 phase。scheduler 先加载并预检当前 Source 的本地 jobs，再读取 Source backend，mismatch 时 sourceGet/hash/prepare/runner/upload/delete 均为零。schema 17/17、scheduler 32/32、upload 16/16，完整 PC 258/258、type-check、diff-check 通过；真实 Tauri/Server/MinIO/GUI 仍待验收。

2026-09-09 PC phase-safe mismatch follow-up：scheduler 的 schema-v1 cache ownership mismatch 现在统一经过 phase-safe cleanup failure helper；READY、SERVER_VALIDATING、SERVER_INDEXING、FAILED_SERVER 使用合法同阶段 preservation，recoverable phases 才转 FAILED_LOCAL。table-driven real repository regression 31/31，upload 16/16、schema 16/16，完整 PC 256/256、type-check、diff-check 通过；零 upload/OCR/backend/deletion，真实 Tauri/Server/MinIO/GUI 仍待验收。

2026-09-09 PC cache-safety follow-up：READY 任务现在先按已验证的 payload column/receipt cache ID 关系删除派生 cache，成功后同阶段清除 `payloadCacheId` 与 `payloadReceipt`；删除或 ownership 校验失败保留证据并写入 bounded cleanup error，后续 `schedule()` 会在 `ALREADY_READY` 边界重试。schema-v1 cache ID mismatch 在 scheduler 和 coordinator 的 intent 前均被拒绝。Focused upload 16/16、scheduler 30/30、schema 16/16，完整 PC 255/255、type-check、diff-check 通过；真实 Tauri/Server/MinIO/GUI 仍待验收。

2026-09-09 PC ParsedDocument upload 状态机修复：`ParsedDocumentUploadCoordinator` 在 complete 返回 `ACCEPTED` 后先持久化 `SERVER_INDEXING`，再持久化 `READY`，与 `DocumentProcessingJobRepository` 的合法迁移表一致。真实 transition-validating repository 回归先复现 `DOCUMENT_JOB_ILLEGAL_TRANSITION`，修复后 ParsedDocument upload 15/15、processing flow 1/1、job schema 16/16、source scheduler 27/27 通过；完整 `npm.cmd run test:r4-pc` 251/251、`npm.cmd run type-check` 和 `git diff --check` 也通过。scheduler 仍在 READY 之后负责返回结果与 cache cleanup；真实 Tauri/Server/MinIO PUT、complete、indexing 和 GUI retry 尚未验收。

2026-09-09 Task 12 final review closure：Rust `document_packager` 5/5、`document_cache` 5/5、`document_upload` 8/8，Java `ParsedDocumentValidatorTests,ParsedDocumentCompleteTests` 8/8；最终 PC scheduler focused 27/27、完整 `test:r4-pc` 250/250、`npm.cmd run type-check` 和 `git diff --check` 通过。最终 reviewer 的所有 Critical/Important findings 已关闭：scheduler SHA 透传、receipt/cache ID 安全清理（含 discard/stale/terminal 任务）和 legacy/incomplete receipt 的网络前拒绝。上传内容仍是单个 gzip JSON schema-v1 envelope，不是 NDJSON；未改变 Server migration/OpenAPI。真实重建 Tauri、Server/MinIO PUT/complete/indexing 和 `1.pdf` GUI retry 尚未观察，仍是业务验收边界。

更新时间：2026-09-09

2026-09-09 Task 15：PC ParsedDocument complete 在明确 `ACCEPTED` 后通过可注入回调请求一次 background `read` sync；回调异常不会改变 accepted 结果或阻止本地 `SERVER_INDEXING → READY`，非 accepted/异常路径不请求。Task 15 upload focused 24/24、runtime/scheduler/flow/schema 组合 64/64；完整 PC、type-check 和 diff-check 结果见任务报告。真实 Tauri/Server/MinIO/sync pull/GUI 仍待验收。

2026-09-10 PC Overview 触发/关联诊断已接入：`[FILE_OVERVIEW_TRIGGER]` 输出结构化 allowlist 生命周期事件，触发值来自 TypeScript 封闭类型和已知调用点：`SOURCE_READY`、`RESUME_BOOTSTRAP`、`RESUME_ONLINE`、`RESUME_SYNC`、`JOB_CHANGED`、`MANUAL_RETRY`（不代表运行时动态校验）。仅在实际进入 `runFile` 的生成尝试中由服务创建 request ID，并由 API 原样写入既有 `X-Overview-Request-Id`，可关联 PC 与 Server 日志；preflight/skip 事件可能没有 `requestId`。现有内存 coalescing 保持不变，未改变重试、缓存、Provider、Server 或 timeout 行为。自动验证：Overview focused 16/16、完整 `test:r4-pc` 310/310、type-check、`check:r4-pc`（93 个生产文件）和 `git diff --check` 均通过；这些仅证明代码/自动门禁，不替代真实 Tauri、Provider attribution 或业务验收。Server 同一 `(user, source, revision, mode)` 进行中去重/idempotency、PC/Server timeout mismatch 与真实触发归因仍待外部验证。

文档状态：现行状态快照

权威范围：当前代码存在情况、本轮命令证据、人工验收边界与下一步

事实来源：模块/契约文档、当前代码盘点、部署测试前主任务清单与本轮验证命令

2026-09-08 PC ParsedDocument 上传诊断与长度修复：Tauri reqwest PUT 失败日志现在在 `without_url()` 后输出 allowlist 风险范围内的 flags、顶层摘要和最多三层 source cause；最终诊断总长限制为 256 字节，保持 `NETWORK_OFFLINE:*` 对外错误契约不变，不向前端或 SQLite 返回摘要。根因已由真实日志定位为旧 receipt 声明了比解密 reader 多出的 encrypted envelope 字节；新 receipt 的 payload size/hash 与解密 reader 对齐，历史 receipt 恢复前按 owner scope 重算。真实 Tauri/MinIO PUT/complete/indexing 仍待重启后人工验收。

2026-09-08 PC 断网续传状态机已补齐：真实 `DocumentProcessingJobRepository` 回归证明带 payload receipt 的 `PAUSED_NETWORK` 用户继续经 `QUEUED -> UPLOADING` 直接上传，不重跑 OCR/download/hash；无 receipt 的 `QUEUED` 仍进入解析。PC 自动证据最终已知为 237/237，`npm.cmd run type-check` 通过，聚焦复审 40/40 通过。真实 Tauri 点击继续、MinIO PUT/complete/indexing 与 GUI 结果仍未由本轮自动证据证明。

2026-09-08 Task 颜色破坏性契约切换已应用：Server Task API/Entity、V21 迁移、OpenAPI artifact/生成类型、PC/Mobile/Tablet Task 投影、同步和页面不再产生或渲染 Task `colorOverride`/`color`；KnowledgeBlock 颜色保留。PC/Mobile 本地迁移清洗有效 Task JSON 颜色键，非法 JSON 原样保留并限次告警。Server/PC/Mobile 本轮门禁结果仍待本轮命令完成，真实数据库升级、端侧旧库和 GUI 仍需人工验收。

2026-09-07 Task 认知负荷破坏性契约切换：Server Task 领域模型、请求/响应、OpenAPI 和同步载荷已移除该字段；V20 删除数据库列并仅从 Task 历史 JSON 中清理废弃键。PC/Mobile/Tablet 的生成类型、Store、本地存储、同步转换和可见页面已移除 `cognitiveLoad`/`load`/`loadText` 依赖。本轮 Server 定向测试 8/8、PC type-check 与 R4 211/211、Mobile type-check/静态检查/协议测试 21/21 通过。Server 全量测试实际运行为 198 项、0 失败、28 错误，错误仍是已记录的 Docker 不可用、模块暴露边界和共享 H2 `assets → users` 清理外键。OpenAPI 定向测试通过，但两端生成 schema 与 artifact 之间仍有本任务之前存在的 WebSocket/JsonNode 漂移，`check-openapi.ps1` 仍不通过；该漂移未在本轮扩大修改。

2026-09-07 MinIO 恢复复核：宿主/容器磁盘与 inode、volume 挂载和权限检查未发现容量或权限耗尽；MinIO 曾周期性报告 `/data offline` 和 read/write quorum 失败。已在不删除 volume 的前提下安全重启并重新加载真实对象读写 healthcheck；最终随机对象 PUT/HEAD/GET/DELETE 通过，MinIO ready 与 backend readiness 均返回 HTTP 200。Tauri 三条任务未重试，仍保留此前只读快照中的 PDF `FAILED_LOCAL/OCR_SIDECAR_UNAVAILABLE`、PPTX `FAILED_LOCAL/DOCUMENT_FILE_TYPE_UNSUPPORTED`、DOCX `FAILED_LOCAL/NETWORK_OFFLINE`，SQLite 未修改；GUI 重试验收仍开放。

2026-09-07 PC 认证与浏览器依赖收口：后端重建导致持久 refresh session 失效时，PC 会清除 access/refresh token、进入 `reauthentication-required`，停止受保护 Axios、sync 和 Source document background scheduling，且不再通过受保护 logout 递归制造 401；登录/注册保留恢复路径，refresh 单飞和一次重放契约保留。PPTX parser 与 Vite resolver 均固定到 JSZip 浏览器 bundle；24/24 聚焦 Node 回归通过。本轮未运行完整 Vite build，stream 是否已从最终 Tauri bundle 消失及真实 Tauri GUI 仍待验收。

## 证据规则

- **代码确认**仅说明实现存在。
- **本轮命令**只记录本任务实际执行结果。
- **历史命令**可在 Changelog 追溯，不能当作本轮结果。
- **人工验收**必须单列设备、GUI 或外部服务边界。

## 首个候选版本范围基线（R0-01）

目标端已冻结为 Windows x64 PC Tauri、Mobile H5、微信小程序和 Tablet 主工作区；PC Web 只保留 Tauri 内部开发用途，不作为发布目标。候选主流程为注册登录、资料上传、学习工作区、同步、复习、统计和 AI 对话；Tablet 手写笔记云同步、微信之外的其它小程序平台、旧 Server 数据自动迁移、跨实例事件 Broker、AI 自动执行领域写操作不进入本候选版本。

验收责任按角色分工：产品/业务验收负责范围和用户结果，后端/基础设施负责 API、数据、安全与真实依赖证据，PC/Tauri 与 Mobile/Tablet 负责人负责端侧主流程，QA/发布负责证据汇总和门禁判断。当前仅完成范围基线写入，未因此把任何模块或风险状态改写为“已验收”。详细验收结果见[产品需求](../project/ProductRequirements.md)和[部署测试前主任务清单](../planning/PreDeploymentReadinessTasks.md)。

## 状态总览

2026-09-07 PC 文档处理复核：OCR sidecar 的 PyInstaller 临时目录统一位于应用 cache 下，启动前创建；仅在受管 sidecar 已确认停止时清理该目录直属 `_MEI*` 子目录，并将 TEMP/TMP 注入 sidecar 环境。bounded stderr 继续保留，PyInstaller extraction failure 对外保留稳定 `OCR_SIDECAR_UNAVAILABLE:pyinstaller-extraction-failed` 后缀。PPTX 已使用 OOXML presentation relationships 读取实际 slide 顺序、页数和文本；49 页真实 fixture 与 legacy OLE `.ppt` 拒绝测试通过。Tauri invoke 归一化保留字符串、Error 和结构化 `{message/error/code}` 诊断；Rust PUT 的网络分类补充 client 诊断，`SERVER_VALIDATING/SERVER_INDEXING` 网络失败可进入 `PAUSED_NETWORK`，已有加密 receipt 时恢复不会重新下载/哈希源文件。Docker Desktop 当前 unable to start，真实 Server/MinIO 复验仍阻塞；本轮自动证据与既有失败分开记录。

2026-09-06 PC 文档处理稳定性修复：任务变化通知只刷新本地处理 Store，不再调用 `sourceStore.loadSources()` 形成 `loadSources -> schedule -> onJobChanged` 递归；`UPLOADING -> FAILED_LOCAL` 与 stale `PACKAGING -> FAILED_LOCAL` 已按实际本地失败语义补齐，避免 `DOCUMENT_JOB_ILLEGAL_TRANSITION` 掩盖原始错误。Office bridge 改为先收集锚点再读取 chunks，带文本的 DOCX/PPTX 不再因首次 chunks 为空误入位图 OCR；无可靠 renderer 页数的纯图片 Office 文件明确返回 `DOCUMENT_FILE_TYPE_UNSUPPORTED`，不伪造页数。OCR warmup 使用受控 1×1 PNG 走现有 sidecar 协议，实际初始化模型后才返回 ready；Rust 保留公开 `OCR_SIDECAR_UNAVAILABLE`，并记录受限的启动路径、进程状态及最多 20 行 stderr 诊断。focused Node 42/42、Python sidecar 11/11、Rust OCR 7/7 与 `cargo check --lib` 通过；真实 Tauri + 文件样本 + Server/MinIO GUI 仍待重启验收。

2026-09-06 PC 文档处理竞态修复：PDF.js 本地适配器已通过 Vite `?url` 配置同版本 `pdf.worker.min.mjs`，扫描 PDF 不再因缺少 `GlobalWorkerOptions.workerSrc` 在解析入口失败；`useSourceStore` 自动调度仅接受带非空 `assetId` 和 `ingestionRevision` 的 `AWAITING_CLIENT` Source，避免本地 Source 尚未 push 时请求服务端并被 404 孤儿清理。PDF runtime、Source 注册及相邻文档处理 focused 测试共 70/70 通过；`npm.cmd exec vite build` 通过并实际产出本地 worker。`npm.cmd run type-check` 仍有工作树既有 7 项错误（`useTaskStore.ts` 3 项、`Timeline/index.vue` 4 项），未归因于本轮修复。认证、MinIO 和 API/数据库契约未修改；真实 Tauri/Server/MinIO 处理与 GUI 仍待验收。

 2026-09-05 PC 上传与处理恢复：Tauri `keyring` 3 已显式启用 `windows-native`，继续使用 `auralis/master_key`，不引入明文或环境变量回退；Stats JDBC repository 在参数边界将所有 `Instant` 转为 `java.sql.Timestamp`，不改 SQL/API/schema；PC 上传白名单收敛为 PDF、DOC、DOCX、PPT、PPTX，图片和文本仍保留 File Viewer 预览但 `allowedForUpload=false`，`canPreviewFile()` 与上传能力解耦，并在 upload intent 前给出支持格式提示；Profile 文档处理中心将无本地 job 的 `AWAITING_CLIENT` 显示为等待桌面端开始处理，并分别标注服务端 `VALIDATING/PARSING/INDEXING`，状态映射由纯工具函数承载；`DocumentProcessingDot` 的 Source 文案复用共享映射，未知/undefined phase 使用“等待状态同步”和“处理状态尚未同步，请稍后刷新”，`READY` 显示“处理完成”。新增 Windows-only Rust keyring 跨新 Entry 写入/读取/清理测试；本机 `cargo test` 的真实 Credential Manager 写入因 `NoStorageAccess(Error(1312))` 失败，不能视为持久化已验收。Stats focused 测试覆盖六个查询的全部 `Instant` 参数、UUID 与顺序保留；file-preview 27/27、processing UI 1/1、runtime static 9/9、Stats 3/3、`check:r4-pc`（87 个生产文件）、Cargo check、keyring feature tree 通过。完整 `test:r4-pc` 为 202 项中 196 通过、6 项失败，仍为既有 Timeline 拖放/本地投影/可见负荷和 `Subject.color` 静态契约；`npm.cmd run type-check` 仍为既有 7 项错误。真实 Server/GUI 仍需联调。

2026-09-05 PC 孤儿 Source 调度清理：`SourceJobScheduler` 仅在 `sourceApi.get(sourceId)` 边界识别结构化 `ApiProblemError` 的 HTTP 404 或 `RESOURCE_NOT_FOUND`，命中后复用 owner-scoped `discard(sourceId)` 清理文档任务/加密 cache，并返回稳定的 `SKIPPED/SOURCE_NOT_FOUND`；503/`INTERNAL_ERROR` 等非 404 异常仍原样拒绝并保留任务，后续 parser/upload 异常不使用该分类。TDD focused scheduler 14/14、相邻文档处理套件 35/35 通过，`check:r4-pc` 扫描 87 个生产文件通过，`git diff --check` 通过；`npm run type-check` 退出 1，7 项错误仍位于既有 `useTaskStore.ts`（3 项）和 `Timeline/index.vue`（4 项），未归因于本次 scheduler 改动。开发环境已确认运行进程为仓库 `src-tauri/target/debug/app.exe`，停止对应 Tauri 进程树后，精确删除 `%APPDATA%\com.auralis.app` 下的 `auralis.db`、`auralis.db-wal`、`auralis.db-shm`；未删除目录内其他内容。重启后数据库及完整表集已重新建立，远端同步恢复 48 条资源投影且旧 Source ID 可再次由服务端返回；3 个本地文档任务均因 `Master key not found. Please initialize encryption first.` 进入 `FAILED_LOCAL`。这证明本地数据代际已重建，但重新上传与密钥恢复仍需 GUI/Server 联调。

2026-09-05 PC 文档处理状态机修复：解析器连续产出同一阶段的多个 block/page 时，允许同阶段 transition 用于原子推进 checkpoint；原先第二个 `EXTRACTING`/`OCR_RUNNING` block 会触发 `DOCUMENT_JOB_ILLEGAL_TRANSITION`。新增本地 repository 回归覆盖同阶段 checkpoint 更新。统计接口在当前工作树尚未取得运行中服务的异常堆栈，真实数据库迁移状态仍待核对。

2026-09-04 PC 本地优先同步核心完成代码收口：本地 schema 升至 v6；Subject、Source、KnowledgeBlock、Task 的普通写入先在一个本地提交中保存资源投影和 immutable outbox，随后才更新 UI，并由 500ms 合并的后台 cursor cycle 批量同步。普通 Store 不再调用领域列表 API；服务端响应只结算相同 mutation，同资源存在未解决写入时不会覆盖本地投影，cursor page 只应用每个资源最后一条 change。`r4-local-repository`、`r4-sync`、`r4-register-file` 定向 Node 套件合计 28/28 通过；新增 cursor 合并/墓碑保护回归通过。完整 `test:r4-pc` 为 181/191，10 项失败均在既有 Timeline/排期或 Subject 主题色静态断言；`npm run type-check` 与 build 均被 Timeline 的 3 个 `Subject.color` 类型残留与未使用 `Sparkles` 阻断，未将其写成同步改造错误或通过。Tauri GUI、双设备弱网和冲突可见性尚未验收。

2026-09-04 学科文件删除投影修复：`useSourceStore.deleteSourceFile()` 先持久化 Source tombstone 与 DELETE outbox，再立即从 `sources/activeSourceFiles` 移除；后台同步与 parser/job/cache 清理不再阻塞列表、计数或选中项回退。`r4-file-preview` 删除顺序回归 20/20 通过。真实 Tauri 中 OCR 运行时删除、缓存清理和重新打开学科后的同步仍待 GUI/Server 联调验收；组合运行的 `r4-register-file` 另有两项既有 Task/Subject 静态断言失败，未归因于本次 Source 删除修复。

2026-09-04 PC 单一文件预览收敛：删除旧 `PdfViewer.vue`、首页 PDF 伴读标签及入口、组件声明和专用回归；资产库真实 Source 文件改由 `FilePreview` 统一预览，并从 TreeNode 保留 `id`、`assetId`、`name` 与 `fileType`。资产库不可达的 `selected.markdown` 与 `filePath` 预览分支已删除，知识块与任务编辑保持不变。新增预览回归先失败后通过，`r4-file-preview` 24/24 通过，生产路径的 `PdfViewer`/`convertFileSrc` 扫描为空且 `git diff --check` 通过。`npm.cmd run type-check` 与 `npm.cmd run build` 均被既有 `useTaskStore.ts`（3 项）和 Timeline（4 项 `Subject.color`/未使用 `Sparkles`）错误在 `vue-tsc` 阶段阻断，未归因于本次预览迁移；真实 Tauri/浏览器中的大 PDF 与多格式连续切换仍待 GUI 验收。

2026-09-04 PC 已完成排期任务固定：Task 完成后保留原 `scheduledAt` 与时间轴位置，并同时在 Store、Timeline、Dashboard 拦截拖动、替换与取消排期；恢复为未完成后才重新允许调整。新增两项 Node 回归已先失败后通过。后续发现历史本地缓存可能保存展示态 `completed`：按当前工程弃用策略，加载时仅接受 `TODO`、`IN_PROGRESS`、`DONE`、`CANCELLED` 领域 DTO，旧展示态记录不再转换或兼容、会在本地加载时忽略，并由在线刷新按现行契约重建；对应映射与 Store 定向回归通过。`npm run test:r4-pc` 最新结果为 173/181，8 项失败仍是可见负荷、旧拖放/本地优先、到期转换及过去时段契约；本轮已清除 Subject `color` 页面残留，`r4-store-mapping` 10/10 与 `npm run type-check` 通过。真实 Tauri 拖放 GUI 仍待人工验收。

2026-09-03 PC 时间轴任务投影与拖放性能修复：Task Store 的本地 repository scope 已从废弃的 `deviceId` 改为认证态 `serverDeviceId`，避免本地读取抛错后清空 `allTasks`，并把列表远端刷新改为本地快照后的后台操作。Timeline 与 Dashboard 切换日期只在内存中更新选中日和槽位；旧本地 `Sun 09:00` 式排期会归一为 UTC ISO instant 后再参与时间轴过滤和 API 更新。单任务拖放不再等待远端 `PUT`，而是先写本地 repository/outbox 并更新内存槽位，后台 push/pull 失败不回退本地结果；拖拽 payload 同时携带 `taskId` 与 `sourceSlotTime`，本地写入失败显示通知。新增定向回归已先失败后通过，`check:r4-pc` 仍扫描 80 个生产文件通过。当前宿主缺少 `vue-tsc`，`npm run type-check` 返回命令未找到；时间轴相关定向套件当前为 31 项中 26 项通过、5 项失败，未完成项是可见负荷标签、排期换位、到期自动转换与过去时段保护。双任务换位尚无持久化原子组，不能把本轮修复写为完整排期或 GUI 验收通过。

2026-09-03 PC SQLite 并发写入修复：Tauri SQLite 现由单个初始化 Promise 管理，建表/迁移仅在首次加载运行；用户/服务端设备隔离的 repository 复用实例，SQL 插件调用经单一队列串行化。初始连接启用 WAL 与 5 秒 `busy_timeout`；同步 reset 改由 Rust `replace_local_resource_snapshot` 在同一连接的事务内替换非 pending 行，保留未解决 mutation 的本地资源，非法项使整批回滚。`node --experimental-strip-types --test scripts/r4-local-repository.test.mjs` 为 11/11，`cargo test --lib` 为 13/13。SQLite 修复时的完整 PC 回归为 168/176，8 个失败集中在本工作树既有的时间轴/本地优先调度变更；后续 Subject 全局主题色清理已消除 Dashboard/Home/Timeline 的 `Subject.color` 类型错误，最新 `npm run test:r4-pc` 为 173/181，`npm run type-check` 通过。真实 Tauri GUI、已有数据库升级及弱网/多写入压力验收仍待执行。

2026-09-03 Subject 专属颜色已从服务端 Subject API/Entity、Flyway V19 数据库 schema、PC/Mobile 前端和当前契约中移除；V19 仅删除 `subjects.color`，保留 Subject 行及 KnowledgeBlock/Task 的 `color_override`。本地 Docker PostgreSQL 已完成 V19 升级并确认 Subject 行仍保留；该变化会丢弃现有 Subject 颜色值，不影响其他资源颜色覆盖。两端 type-check、回归测试、静态检查和 PC/Mobile H5 production build 均通过；真实三端 GUI/业务联调仍需人工验收。

 2026-09-03 PC 本地优先修复：Subject、Source、KnowledgeBlock 的常规写入与 Task 的创建/更新先保存用户/服务端设备隔离的资源副本与 outbox，再更新当前 UI 并后台执行 push/pull；列表加载也先展示本地快照，远端列表刷新转后台，首次无缓存时先呈现空态再自动更新。资产库首屏并行读取四类本地投影，任一项失败仍展示其余本地树并关闭 loading；云端结果由 Store cache 写回本地后，资产树自动重建而不重新转圈。outbox 会将同一资源连续的 CREATE→UPDATE、UPDATE→UPDATE 与 UPDATE→DELETE 合并为保留初始 `baseVersion` 的单一 mutation。学科文件登记仍等待实际 Asset 二进制直传和 complete，但现在显示阶段/进度，Source 随后立即本地登记，不再等待同步或重复的远端资料刷新。双任务排期交换的持久化原子组仍属于 P1，不得由本地优先单任务写入替代；认证、ReviewEvent、AI/SSE、签名下载与文档处理手动启动确认仍按其服务端权威需求等待。PC 回归 169/169、`check:r4-pc`（80 个生产文件）与 production build 已通过；构建仍有既有浏览器兼容外部化、大分包和无效动态 import 警告，真实浏览器/Tauri 弱网 GUI 验收待补。

2026-09-01 PC 扫描 PDF runtime 与处理状态可观测性修复：根 `pdfjs-dist` 与 File Viewer renderer 已统一精确锁定为 `5.4.624`，npm lockfile 不再保留 renderer 的嵌套副本；本地 PDF 适配器移除无效 `disableWorker` 选项。FILE scheduler 在创建和调度结束时刷新处理 Store 和 Source 列表，恢复批次隔离单个 Source 失败，避免历史失败文件阻塞后续 `AWAITING_CLIENT` 文件；Profile 同时呈现本地处理与服务端 `VALIDATING/PARSING/INDEXING` 阶段，并允许在有桌面 runner 时手动开始无本地 job 的等待文件。该入口会先触发同步并确认本地 Source 为 `synced`，未确认时显示同步中的、冲突或失败提示而不调用服务端 scheduler；Source `READY` 前明确不可提问。未挂载 Tauri runner 时显示桌面端限制而非空任务。Tauri SQL capability 已补齐 `sql:allow-execute`，避免任务 repository 因只读权限退回 localStorage；后端未预期 API 失败现在记录 `UNEXPECTED_API_ERROR` 诊断日志。`/api/sync/push` 的 JSON 边界已确认并修复为 Jackson 3 converter 与 `tools.jackson.databind.JsonNode` 全链路一致，生产/测试源码守卫禁止 Jackson 2 导入；HTTP Sync object payload、ParsedDocument 有界解压与 OpenAPI artifact 回归均通过。`useSourceStore` 已接入 Pinia HMR 更新，避免开发页新增 action 时组件更新而旧 Store 实例缺少方法。Document runtime 保留创建前的密钥检查，而 Rust `document_package_begin` 也会在新建 package/cache 的最终边界确保 `auralis/master_key` 存在：只有 keyring 的 `NoEntry` 才会创建密钥，credential-manager 的其他错误返回实际 keyring 访问失败；已有 cache/receipt 的读取、上传和清理始终只读取既有密钥，丢失时报告恢复需要而不覆盖旧密文。`/ws/events` 已移除抢占 WebSocket upgrade 的 MVC `GET` 回退，ticket 只在 WebSocket handshake 中消费，未认证 HTTP GET 不再触发空 principal 的 500。针对性 runtime 回归 7/7、Rust 12/12、PC 完整回归 161/161、type-check、静态检查和 production build 已通过；Realtime service/controller/真实 HTTP upgrade 定向测试 5/5 通过。`docs/test/1.pdf` 以同一版本实际加载为 50 页、首屏 0 个 text item 并成功渲染 105,139-byte PNG，证明扫描 PDF 进入位图/OCR 前置路径；真实 Tauri + OCR sidecar + Server/MinIO 上传、索引到可提问仍需人工联调，不能由 mock 自动测试替代。

2026-09-01 学科文件删除与预览稳定性补充：删除 FILE Source 后，PC 先取消运行中的本地 parser，再按当前用户/设备删除该 Source 的所有 `document_processing_jobs`、删除关联加密 cache 和内存 parser input，随后刷新 Profile；进行中的 scheduler 观察到 `SOURCE_DELETED` 后只会退出，不会重建任务或继续上传。Subject Store 删除后重算本地 Source 投影，学科文件计数立即递减。可视预览与 OCR 仍使用固定的同一 PDF.js 版本，OCR 的 PDF.js document 在解析结束时释放；FilePreview 的签名 URL 下载只允许最新选中文件提交结果，旧响应不能覆盖 renderer，避免表现为预览反复加载。定向回归 52/52、PC 全量回归 165/165、type-check、`check:r4-pc`（80 个生产文件）和 production build 均通过；构建保留既有 File Viewer 大 chunk、Node 浏览器外置与无效动态 import 警告。真实 Tauri 的删除/扫描 PDF GUI 走查仍待人工记录。

2026-08-29 设备标识契约切换：客户端注册标识统一命名为 `clientDeviceKey`，服务端 canonical 设备标识统一命名为 `serverDeviceId`；Auth、Sync、Realtime、PC/Mobile 本地 scope、Tauri 文档缓存和 JWT claim 已同步切换。Realtime ticket 改为无请求体并从 Bearer JWT 解析服务端设备，旧 `deviceId` 字段不保留，也未新增兼容测试。PC `test:r4-pc` 150/150、Mobile `test:r4-mobile` 21/21、两端 type-check 通过；后端 clean test 与真实 Mobile/Tablet/Tauri GUI 联调仍需单独验收。

2026-08-31 PC 任务到期转换修订：`useTaskStore.fetchTasks()` 与软件运行中的分钟级检查会把 `scheduledAt` 已过、仍未完成/取消的任务更新为 `DONE`，同时保留排期；无 `scheduledAt` 且 `dueAt` 已过的任务显式提交 `dueAt: null`，回到资产库的未排期分组。全局页面不显示提醒，失败时保留原任务数据并记录 Store 错误。PC 定向测试 26/26、`test:r4-pc` 152/152、`type-check`、`check:r4-pc`（80 个生产文件）和生产 build 已通过；Tauri GUI 与真实服务仍需人工复测。

2026-08-31 PC 时间轴过去时段保护：`isScheduledAtInPast` 以可注入时钟判定有效目标时间是否严格早于当前时刻；`scheduleTask`、`scheduleTaskToDay` 和 `rescheduleTask` 均在 API、离线 mutation 或原子换位前校验。换位会校验两个任务的目标时段，拒绝时抛出“不能排期到过去的时间”并保留原位置。PC 定向测试 28/28、`test:r4-pc` 154/154、`type-check`、`check:r4-pc`（80 个生产文件）和生产 build 已通过；Tauri GUI 拖放与真实服务仍需人工复测。

2026-08-27 任务排期修复：PC API 边界将历史展示时间归一化为 UTC ISO instant；后端把无法反序列化的时间字段映射为 `400 VALIDATION_FAILED + fieldErrors`，并新增带稳定锁顺序的 `POST /api/tasks/schedule-swaps` 原子交换。Dashboard、Timeline 与 Home 拖拽均改为传递任务 ID 和已排期任务的原槽位，原槽为 no-op，拖回待办只以任务 ID 取消排期；任务到期后的状态转换以本页 2026-08-31 规则为准。`CoreDomainControllerTests` 5/5、PC `test:r4-pc` 144/144、type-check、生产 build 和 `git diff --check` 通过。自动证据不替代 Tauri 原生拖放、真实 409/断网和任务到期转换人工验收。OpenAPI artifact 与 PC schema 已一致；Mobile `schema.ts` 被外部进程锁定，生成/契约校验暂以 `EPERM` 失败，已登记为 P1，未强制终止用户进程。

2026-08-27 全量后端验证边界：本机 `Auralis-Server\\mvnw.cmd clean test` 实际执行到 189 个测试、28 个错误后失败；三个 Testcontainers 用例因 Docker 环境不可用失败，随后共享 H2 数据中的 `assets → users` 清理外键错误连带影响多个既有测试类。该失败不能当作本轮 Task 换位回归：同一清洁进程下的 `CoreDomainControllerTests` 5/5 通过，并覆盖非法时间字段、原子交换及失败不留半交换。Docker/共享清理问题保持为 P1-Test-Coverage 的开放项。

2026-08-24：PC Tauri AI 辅助阅读已开始执行。G1 OCR 协议/fixture、G2 RapidOCR sidecar、G3 Rust supervisor 和 G4 MSI externalBin/resources 硬门已有代码及证据；最终 MSI 已生成，verifier 已核验 WiX 对 sidecar、三个模型、manifest、license 和 SBOM 的引用，五组离线 OCR baseline 已写入 budgets。用户已在 `docs/test` 提供真实 DOC、DOCX、PPTX 及两份 PDF，并由 Apache POI 生成了一个真实 OLE 旧式 PPT fixture；数据库 PDF 无 text layer，可作为扫描 PDF OCR 样本，学生手册 PDF 有 text layer。G5 已实现固定尺寸 BackgroundParserHost 与 FileViewerParserBridge，type-check、host/bridge 静态契约 2/2、Office fixture matrix 3/3 和现有 PC 回归 102/102 通过；G6 已实现 PDF text-layer/扫描分类、逐页 OCR、Office direct/fallback、Unicode 归一化与 sink 背压，core 7/7、真实 PDF 2/2 通过；C1 已新增 v3 `document_processing_jobs` schema、用户/设备隔离、合法状态迁移和原子 checkpoint repository，定向测试 3/3、现有 local repository 6/6、type-check 通过；C2 已新增 4 MiB 分块 gzip/AES-GCM cache、AAD scope、nonce/tamper/atomic replace 校验、内部解密 reader 和 package commands，Rust 全量 10/10、JS contract 2/2、type-check 通过；C3 已新增单设备串行可恢复 runner、自动重试/网络暂停/人工 retry/cancel 与 Pinia store，runner 5/5、type-check 通过；S1 已追加 V15 ParsedDocument schema，S2 已完成 FILE/TEXT/URL ingestion 分流，S3 已完成 owner-scoped ParsedDocument upload-intent 与私有 `UPLOADING` 元数据落库，S4 已完成有界 payload validator 与 legacy Asset SHA 条件回填，S5 已完成 complete 首胜、同 payload 幂等、冲突/过期拒绝和唯一 revision indexing job，S6 已完成 accepted blocks indexing、generation/revision 旧任务隔离、兼容 reingest 复用和过期 payload 清理；H2 clean/upgrade schema 4/4、Source/Ai ingestion 11/11、ParsedDocument upload-intent 3/3、validator 4/4、SHA backfill 2/2、complete 3/3、S6 定向 21/21 通过，并覆盖 READY FILE/活动 chunk 保留、非 READY FILE→AWAITING_CLIENT、并发 SHA 回填、complete 并发仲裁、worker block 索引和 cleanup。PostgreSQL upgrade 定向测试已补充但本机 Docker 不可用。实际 File Viewer/Tauri 环境的四种文件提取/回退结论仍待验证。临时 all-users MSI 安装 smoke 受宿主 Error 1925 权限限制，留给 R2；不能把安装/升级/卸载 GUI 或 Office 格式支持写成已验收。
2026-08-24 C4 复核：本地文档任务已升级 v4，服务端 UUID revision 与 Rust cache/package header 对齐；Rust `document_upload_put` 从加密 cache 流式 PUT 并校验实际大小/hash，PC coordinator 覆盖 intent/过期重取/网络暂停/幂等 complete/stale revision。Rust 12/12、C4 JS 6/6、PC 回归 108/108、PC type-check 通过。C4 代码门禁完成，但真实 Tauri/MinIO/Server 上传联调、C5 Source 调度和 GUI/安装验收仍未完成。
2026-08-24 C5 复核：本地文档任务升级 v5，`payload_receipt_json` 持久化非敏感 cache receipt；`DocumentJobRunner` 不再重复执行 `PACKAGING` job，`SourceJobScheduler` 接入 FILE immediate job、移动端/重启 owner-scoped download adapter、Asset SHA mismatch、revision supersede、READY/TEXT/URL 分流和完成后 cache/临时输入清理。C5 定向 21/21、完整 PC 回归 128/128、type-check、R4 静态检查通过。真实 Tauri 私有临时目录、MinIO/Server 上传联调、跨设备实际恢复和 GUI/安装验收仍未完成。
2026-08-26 C5 runtime 接线：新增 `DocumentProcessingRuntime`，Tauri App 登录后组装并启动 SQLite job repository、全局 `BackgroundParserHost`、PDF.js/Office parser、Tauri OCR、Rust package/cache、ParsedDocument upload coordinator 和 Source scheduler；sync/online 自动重载 Source 并恢复 pending jobs，登出时解绑；带 durable receipt 的暂停上传可从 `UPLOADING` 边界恢复；SQLite 兼容识别 Tauri v2 `__TAURI_INTERNALS__`。新增 runtime 静态契约与暂停恢复测试后，`test:r4-pc` 135/135、type-check、Web build、`check:r4-pc`（79 个生产文件）和 `git diff --check` 通过。真实 Tauri/MinIO/Server、扫描 PDF OCR、四类 Office、重启/跨设备和 GUI 仍待人工测试。
2026-08-26 AI 辅助阅读链路：V16 阅读会话增加 `GENERAL/READING_SESSION` purpose 与 Source 绑定，普通会话列表排除阅读会话，24 小时清理服务和 owner/source 约束已接入；PromptAssembler 只纳入已完成成对历史并保证当前用户消息预算，`readingContext` 先限定当前 READY Source，确定性规则仅在同学科内按显式跨文件意图、标题命中或当前命中不足升级，citation 按 source/chunk 去重。PC 已接入 OpenAPI/PC-Mobile schema、当前文件临时会话生命周期、未 READY 弹窗、非 READY 文件状态点（失败保留红色静态点，READY 后消失）、Profile 解析中心、原生选中文本解释/追问/知识块编辑；新增前端回归后 `test:r4-pc` 135/135、服务端定向 AI/OpenAPI 31/31、PC type-check、Web build 和 Tauri `--no-bundle` 通过。真实 Server/MinIO、扫描 PDF/Office/Tauri GUI、断网重启及安装验收仍未执行。

2026-08-26 上传/解析联调修复：确认上传后的 SOURCE CREATE 已写入客户端 user/device 隔离 outbox，但因运行时只加载 Source、未在启动前 flush 同步，服务端没有 Source/ingestion job；`DocumentProcessingRuntime` 现会在 Source bootstrap 前主动执行一次 `triggerSync`。为保护既有 localStorage fallback 中尚未迁移的 outbox，本轮不切换 SQLite capability。Docker 本地 MinIO 预签名 public endpoint 固定为 `http://127.0.0.1:9000`，规避 Windows `localhost→::1` 不可达导致的 `Failed to fetch`；真实 Tauri 重新上传、解析任务中心和扫描 PDF 预览仍待人工复测。

2026-08-26 Tauri debug 启动修复：复现 `cargo run`/`tauri dev` 在窗口创建前因 `tauri-plugin-log` 默认文件目标返回 Windows `os error 183`；debug 日志现仅输出 stdout，避免已有日志文件/目录阻止前端窗口启动。回归测试与 debug `cargo run` 已通过；真实 Tauri GUI 仍需人工确认。
2026-08-26 PC 白屏运行时修复：独立 WebView2 证据显示页面资源加载成功，但未登录/残留半截会话时 `AppSidebar` 仍请求 `/api/subjects`，401 刷新失败抛出 `No refresh token` 未处理异常。公共登录路由现使用独立布局，认证壳仅在完整 user+token 会话下挂载，侧栏请求增加认证判断与异常兜底，路由/登录页统一完整会话判定。`test:r4-pc` 137/137、type-check、Tauri `--no-bundle` 通过；真实 Tauri GUI 仍需重启后人工确认。
2026-08-27 Vite 开发 HMR 修复：`@vitejs/plugin-vue` 在 File Viewer 开发期复制资源触发的早期 HMR 中可能读取空 `compiler`，报 `invalidateTypeCache`。Vite 现显式注入 `vue/compiler-sfc`，并忽略 `public/file-viewer/**` 生成资源监听；新增回归后 `test:r4-pc` 138/138、type-check、静态检查、Tauri `--no-bundle` 通过。真实 Tauri dev 热更新仍需人工重启验证。

截至 2026-08-20，PC 的 R4 客户端迁移已推进到联调前门禁：正式 PC Store/页面已切换到当前 typed API 和用户/设备隔离 repository，AI SSE、Vite 代理和 Tauri 最小权限边界已有代码与自动检查证据。这里的“联调前门禁”只表示客户端代码和本地检查达到当前阶段，不等同于生产构建、GUI、真机、后端联调或业务验收全部完成。

后端方向已确定为在 `Auralis-Server` 原路径进行绿地重写，完整方案见[后端绿地重写计划](../plans/backend-greenfield-rewrite-plan.md)。阶段 0 已完成仓库外备份、旧 Server 可恢复替换、Boot 4.1 / Modulith 骨架、基础错误协议、健康检查、OpenAPI 和模块边界测试；阶段 1 已实现 Identity V1，阶段 2A 已实现 Subject、KnowledgeBlock、Task 核心领域闭环，阶段 2B 已构建 Source、Asset、Relation 闭环，阶段 3/4 已构建 Sync、Review、Stats、Realtime，阶段 5/R1 已完成 pgvector、AI 请求并发保留、会话恢复键和回调式流式基线，R2 已执行真实依赖 Testcontainers，R3 已固定 OpenAPI artifact 和 PC/Mobile SDK 类型边界。当前仍为“已构建待验收”，因为真实 Provider、MinIO 异常路径、双设备、浏览器 WebSocket、前端联调和人工验收未完成。

2026-08-20 本轮修复完成后，PC 不再持久化或附加 BYOK 明文，核心资源离线 CREATE 使用稳定 outbox 身份，Chat 保留本地会话/消息请求 ID 并在上线后顺序恢复；SSE 401 使用共享的单次刷新且复用原请求 ID。服务端 V14 增加会话恢复键与 assistant→USER 精确关联，并将 Provider I/O 移出事务。`test:r4-pc` 58/58、type-check、`check:r4-pc` 59 文件、Web build、OpenAPI artifact/PC+Mobile 类型比对、服务端专项 12/12 和含 PostgreSQL/pgvector/MinIO 容器的 `clean test` 137/137 均通过；这仍不等同于真实 Provider 或浏览器业务验收。

2026-08-20：正式 `/profile` 已内嵌 BYOK 配置卡片，支持读取脱敏状态、按 Provider 切换、更新 Base URL 与一次性提交 API Key；保存成功立即清空输入框。该页面的静态安全回归、type-check 与 Web build 已通过，但浏览器连接真实 Server 的读取、保存和错误态仍待人工联调。

2026-08-20：Identity 会话列表已改为每用户/设备一条活动 refresh session 视图；重复登录同一设备会撤销旧 refresh session，避免 Profile 出现重复设备和误撤销旧记录。定向 AuthControllerTests 7/7 与 Docker Testcontainers 全量 `mvn -B -ntp test` 138/138 通过。撤销仍不会令已签发 access JWT 瞬时失效，当前 15 分钟有效期结束前的远端请求阻断属于后续鉴权架构取舍，不写成已完成的即时踢下线。

2026-08-21：Mobile/微信共享主路径已切到当前 Auth、Sync/Realtime、Asset、Review、Stats 与 AI 契约；Mobile Home/Profile 移除演示日程和固定统计，手写页移除伪 OCR/知识抽取，Tablet Workspace 总结改用真实 AI SSE，Dashboard/Review/Stats 也已使用 Stats/Review 服务端契约并移除随机统计和本地结果伪写。本地数据使用 userId/deviceId 独立 namespace，Pomodoro 计数同样按 namespace 隔离，旧全局库按用户授权一次性清除。`check:r4-mobile` 扫描 62 个生产文件、协议测试 20/20、Tablet 逻辑测试、type-check、H5 与微信构建通过；真实服务、微信合法域名、开发者工具、双设备和真机仍未验收。

2026-08-21：AI 运行时配置改为服务端 env 默认 Provider + 用户 BYOK 覆盖：`AURALIS_AI_DEFAULT_PROVIDER` 决定未指定 Provider 的聊天请求，`DEEPSEEK_API_KEY`/`OPENAI_API_KEY`/`SILICONFLOW_API_KEY` 仅在服务端运行时作为 fallback，不写入用户表或 API 响应；BYOK 仍按 userId/provider 加密保存。Compose 显式透传 SiliconFlow Base URL、聊天模型和 `BAAI/bge-m3` embedding 模型；Provider DNS 混合解析只固定公网地址。已修复 Java 21 `HttpsURLConnection` 调用固定地址 TLS Socket 无参 `createSocket()` 时在连接前失败的问题；真实 Java Provider 链路调用 SiliconFlow `BAAI/bge-m3` 返回 1 条 embedding，全量后端测试 148/148 通过，重建后的 Compose backend 健康。PC 浏览器完整对话仍待人工验收。

2026-08-21：补强 AI 后端运行日志：请求开始/校验/Provider 选择、env/BYOK 来源、Embedding/检索、Chat 流式、上游 HTTP JSON/SSE、成功/中断/失败均输出安全事件名、模型/host、状态、数量和耗时；不输出 API Key、Authorization、完整 prompt、模型回复或响应体。新增日志脱敏与失败阶段回归，AI 定向 26/26 通过。

2026-08-23：按 `VALIDATION_FAILED` 排障反馈，AI 失败事件新增 `exceptionType`、单行截断并脱敏后的 `exceptionMessage`、`rootCauseType` 与 `rootCauseMessage`，覆盖聊天、Provider 选择、请求校验和 embedding 失败；前端 Problem Details 错误码/安全 detail 契约不变。新增原始异常日志与 Authorization 脱敏回归，`AiStreamingTests` 12/12 通过。

2026-08-22：PC 资产库任务编辑移除认知负荷按钮，改为 30 分钟步进的预计用时控件；保存时通过 Task Store 写回标题、备注、截止日期和 `durationMinutes`。`test:r4-pc` 73/73、type-check 与 Web build 通过；浏览器实际编辑、刷新后持久化仍待人工验收。

2026-08-22：修复 PC 时间轴日视图排期匹配：Task Store 使用半小时槽位承接 `scheduledAt`，时间轴保留已过去排期并对任务名称/详情应用删除线。`test:r4-pc` 74/74、type-check、静态检查和 Web build 通过；浏览器实际跨日、半点排期和拖拽走查仍待人工验收。

2026-08-22：PC 首页与独立时间轴统一为以当日为中心的 7 日滚动窗口，展示前后三天的真实日期并将当日置于中间；共享日期计算同时驱动日视图选择器、周视图列和任务分组。新增日期窗口/边界回归后 `test:r4-pc` 75/75、type-check 通过；浏览器跨月/跨周日期、拖拽和刷新后的真实服务状态仍待人工验收。

2026-08-22：修复 PC 时间轴拖拽与 30 分钟槽位错位：原生拖拽补齐 `dataTransfer` payload，Dashboard/Timeline 的任务高度按半小时槽位和间距计算，首页覆盖判断改为分钟精度，drop 操作等待排期写回并在 finally 清理拖拽状态；首页日期格改为只显示紧凑日期，顶栏显示完整星期/月日信息。`test:r4-pc` 77/77、type-check、静态检查和 Web build 通过；浏览器拖拽交换、跨槽位显示和窄栏视觉仍待人工验收。

2026-08-22：根据边界反馈，PC Dashboard/Timeline 日期窗口从“当日居中、前后三天”恢复为从当天开始的连续 7 日单周窗口；首页日期格改为只显示日数字，选中态使用固定圆形绿色背景，顶栏改为“时间轴 · X月”。单周窗口与 `dayCode` 排期语义一致，避免拖拽到窗口前几日后任务被写入下一周而不可见。`test:r4-pc`、type-check、静态检查和 Web build 仍需以本轮命令结果为准；浏览器拖拽和视觉走查仍待人工验收。

2026-08-22：按最新日期语义，PC Dashboard/Timeline 改为展示当前/所选日期所在的完整自然周（周日至周六），`isToday` 按真实日期匹配；首页日期数字上方增加 `Sun` 至 `Sat` 英文星期缩写，选中日期徽标保持约 36px 圆形绿色背景。自然周边界、日期标签和首页视觉回归需以本轮命令结果为准，浏览器跨周拖拽仍待人工验收。

2026-08-22：统一 PC 全局排版：根字号恢复为 16px，新增 caption/body-sm/label/body/body-lg/title-sm/title/title-lg/display 语义字号令牌并保留旧变量别名；普通控件与 Pomodoro 使用 `--font-family-base`，代码/知识图谱等宽内容使用 `--font-family-mono`，移除页面级 Inter、Outfit、Plus Jakarta Sans、JetBrains Mono 覆盖。`test:r4-pc` 79/79、type-check、`check:r4-pc` 60 个生产文件和 Web build 均通过；构建保留既有 Asset 大 chunk 与无效动态 import 警告，浏览器窄栏和深色主题视觉仍待人工验收。

2026-08-23：修复 Docker MinIO 下载地址生成：后端不再用 `AURALIS_MINIO_PUBLIC_ENDPOINT` 初始化会主动连接的 SDK，而是使用离线 SigV4 signer 生成 GET URL；`AURALIS_MINIO_ENDPOINT` 继续只负责容器内对象校验和读取。新增 `MinioAssetStorageIntegrationTests` 回归（3/3）和脱敏 `ASSET_DOWNLOAD_URL_FAILED` 日志；Compose 重建后 backend healthy。临时隔离账号真实链路验证 upload PUT 200、Asset READY、download GET 200/26 bytes。Source 响应新增可选 `assetSizeBytes`，PC 映射器不再无条件显示 `0.0MB`；SourceAssetRelationServiceTests 5/5、PC mapper tests 8/8 通过。浏览器 GUI 仍需人工刷新页面验证。

2026-08-23：修复 PC 学科文件登记后的大小丢失：上传完成返回的 `asset.sizeBytes` 现在写入本地优先 Source 副本，并从同步 mutation payload 中排除展示字段；文件在同步完成前也会显示真实大小。新增登记链路回归；`test:r4-pc` 94/94、type-check 和 Web build 通过。浏览器刷新后对既有文件及新登记文件的 GUI 验收仍待执行。

2026-08-23：PC 学科文件栏已由 Antigravity Gemini 3.1 Pro 参与改造：移除独立 `· 总结.md` 虚拟项，文件栏只显示真实 Source，知识块入口作为总结/知识表面；选中文件后由 `FilePreview` 直接承载文档预览，并新增确认后的 Source 软删除按钮。后端新增 `AssetRetentionCleanupService`，默认保留 30 天后按小时物理删除 MinIO 对象并将 Asset 标记为 `ORPHANED`，数据库审计行保留。`test:r4-pc` 95/95、type-check、静态检查、Web build、后端 `mvn -B -ntp test` 155/155 和 Compose config 均通过；Docker 重建后 backend healthy、frontend HTTP 200、readiness `UP`。浏览器文件预览、删除确认、知识块和实际定时清理仍待人工验收。
2026-08-23：修复 PC 学科文件删除竞态：本地 outbox 中仍有 `SOURCE/CREATE` 时，删除改为写入有序 `DELETE` mutation，不再提前直接请求不存在的远端 Source；已同步文件继续走 Source 软删除。删除入口恢复为悬停显示并保留键盘 focus-visible，404/版本冲突等反馈明确化。同步实时信号改为完整 push→pull，活动同步周期收到新 mutation 会自动再跑一轮，避免 pending Source 停在本地。`test:r4-pc` 98/98；type-check、静态检查、Web build 和浏览器实际删除/刷新验收仍待执行。
2026-08-23：按预览工具栏反馈，PC File Viewer 关闭通用搜索、下载、打印、HTML 导出、主题、重复缩放和内部 PDF 工具栏；学科页的现有文件名顶栏承载缩放/旋转，页码/总页数和前后页在 bare 预览主体底部以同级布局占位，去除 renderer 内层边框/圆角。补充 renderer 就绪前后的控制时序队列，顶部/底部栏使用轻微投影和实体按钮，中间文档上下保留 24–32px 安全留白。`test:r4-pc` 101/101、type-check、`check:r4-pc`（60 个生产文件）和 Web build 通过；真实 DOC/DOCX/PDF 样本的浏览器/Tauri GUI 位置、分页和交互仍待人工验收。

2026-08-23：继续收敛 PC File Viewer 控件：移除顶栏控件外层容器，缩放改为 `− / 实际倍率 / ＋`，旋转改为线条左旋图标、当前角度、线条右旋图标；DOC/DOCX 旋转由 renderer 外层状态驱动，倍率由 File Viewer `zoom-change` 实际事件回传。预览上下留白收窄为 12–16px；顶部控件不再因 `previewControlsReady=false` 直接禁用，动作仅在组件 ref 尚未建立时暂存，不再依赖 `load-complete` 作为执行硬门禁。`test:r4-pc` 101/101、type-check、`check:r4-pc`（60 个生产文件）和 Web build 通过；真实样本浏览器/Tauri GUI 仍需确认缩放、左右旋转后的页面可视区域、分页和窄栏布局。
2026-08-23：根据真实 PDF 截图反馈，移除宿主“正在渲染文档”遮罩，避免正文已出现时持续发白；缩放改由 File Viewer 视图状态 API 写入目标倍率，首次宽度适配在用户交互后停止，缩放与旋转分别放入同款圆角控制组。定向预览回归 16/16、完整 `test:r4-pc` 101/101、type-check、静态检查和 Web build 已通过；Docker 重建和真实 GUI 点击验收仍待本轮后续步骤。
2026-08-23：继续排查 PDF/图片缩放、旋转无响应，Chrome 真实运行复现 `viewer.getZoomState is not a function`：`@file-viewer/vue3-full@2.3.2` 的包装组件通过空 `Proxy` 暴露 API，Vue 父级 ref 实际取不到声明中的方法。renderer 已改用 `@file-viewer/vue3@2.3.0` 基础组件并通过 `withFullViewerOptions` 保留 full preset；缩放直接调用 `zoomIn`/`zoomOut`/`resetZoom`，旋转继续调用 `applyViewState`。浏览器组件验证中图片宽度由 800px 增至 896px、旋转角由 0° 变为 90°；定向预览回归 16/16、`test:r4-pc` 101/101、type-check、静态检查和 Web build 通过。Docker 已无缓存重建并重建 frontend 容器，运行容器镜像与新镜像 ID 一致，首页 HTTP 200；真实业务样本的浏览器/Tauri GUI 仍待人工复验。
2026-08-23：按 PC 文件栏截图移除学习文件行左侧的文件类型图案；文件行现在从文件名开始布局，删除操作、大小和选中态保持不变。新增静态回归断言，定向预览回归 17/17；真实浏览器窄栏与长文件名仍待人工复验。

2026-08-21：修复 PC 注册后的默认学科问题：注册不再自动创建“未分类” Subject，Subject 列表允许为空；历史 `defaultSubject=true` 记录可通过普通删除接口软删除。核心领域与资源归属回归 7/7 通过，PC SubjectHall 空状态和删除路径仍需浏览器人工验收。

2026-08-21：修复 PC 学科工作区 AI 回溯：进入或切换学科时清空当前消息并创建新的伴读会话，不再加载全局会话列表或恢复旧 `activeSessionId`；PC 回归测试 59/59、type-check 和 SubjectWorkspace 静态契约通过，浏览器真实 SSE 仍需人工验收。

2026-08-21：补齐 PC 个人空间登出入口：个人空间提供确认后的“退出登录”，Auth Store 在本地会话清理后将服务端异常交给 UI，失败仍跳转 `/login`；PC 回归测试 62/62、type-check 和 Web build 通过，浏览器手工点击验收仍待执行。

2026-08-21：修复 PC 学科大厅编辑无法保存：编辑弹层现在保留 Subject `version`，更新请求正确携带 `baseVersion`；新增版本契约回归，PC 回归测试 63/63、静态检查、图标契约、type-check 和 Web build 通过，浏览器真实编辑/刷新验收仍待执行。

2026-08-22：修复 PC 资产库任务来源：移除“全部任务”中的固定 Vue/Tauri 演示任务，改用 `useTaskStore.fetchTasks()` 加载当前用户任务，并填充全部任务及各学科任务目录；PC 回归测试 64/64、静态检查、图标/工作区契约、type-check 和 Web build 通过，浏览器资产库任务展示与状态切换仍待人工验收。
2026-08-22：完成 PC 任务视图逻辑收敛：排期队列仅保留有截止时间且未排期的未完成任务；时间轴限定今天起 7 个日历日并保留已完成排期；资产库任务按未分布/未完成/已完成分组并按截止时间排序；时间轴“导入任务”聚焦 `/asset?focus=unassigned-tasks`。`test:r4-pc` 73/73、type-check、`check:r4-pc`、学科图标/工作区契约和 Web build 通过；浏览器拖拽、宽屏布局和真实服务状态切换仍待人工验收。

2026-08-22：PC 学科文件预览先接入自托管 File Viewer：`FilePreview` 统一管理签名 URL、下载、加载/失败态，DOC/DOCX、PPT/PPTX、PDF、图片和文本走 File Viewer；Excel、未知格式及超过 50 MB 文件在 upload intent 前拦截。依赖资源复制、`test:r4-pc` 92/92、`check:r4-pc`、SubjectWorkspace 契约、type-check 和 Web build 已通过；真实 DOC/DOCX 样本、浏览器/Tauri GUI 和窄栏布局仍待人工验收，若兼容性不足再切换组件内部 PDF renderer。

低优先级待办：PC 注册页仍需补齐与服务端一致的客户端约束提示；RFC Problem Details 的 `fieldErrors[]` 已映射到登录/注册输入框，不再依赖旧 `errors` 对象；登录页通用提示会优先展示字段级校验消息。PC 自定义弹窗还需按 P2-PC-Modal-Consistency 统一视觉令牌；后端 HTTP 400 校验仍是最终安全边界，详见 P2-PC-Auth-Validation-UX。

| 模块 | 当前状态 | 代码证据 | 命令证据 | 人工验收 | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 文档体系 | 已构建待验收 | 新分类体系、Agent 规则、归档快照、旧路径切换已完成 | 2026-08-12：`docs/README.md` 相对链接检查 33 项通过；2026-07-10 的元数据、根目录、旧路径扫描仍保留为历史证据 | 无 | 随后续代码变化持续回写 |
| PC Web | 已构建待验收 | 8 条正式路由、typed API Store、用户/设备隔离本地 repository、无明文 BYOK 的 AI SSE 控制器和离线会话恢复存在；正式页面已移除静态演示数据主路径，个人空间已有确认登出入口，学科编辑保留版本并提交 `baseVersion`，资产库任务来自 Task Store，学科页使用统一 FilePreview 和文件名顶栏/底部页码布局 | 2026-08-23：`check:r4-pc` 扫描 60 个生产文件通过，`test:r4-pc` 101/101、type-check、Web build、Subject icon、Subject workspace 和文件预览契约通过；File Viewer 资源 47/47 已复制，预览控件队列、倍率和左右旋转状态已接入，保留大 chunk 与无效动态 import 警告 | 浏览器主流程、真实 DOC/DOCX/PPT/PDF/图片/文本预览、资产库真实任务展示/状态切换、真实 API/SSE、学科编辑保存/刷新、登出成功/失败提示、会话撤销、AI 失败态、窄栏/深色主题和 GUI | 完成真实前后端联调、样本文件 GUI 验收，若 File Viewer 兼容性不足则切换 PDF renderer，评估 bundle 拆分 |
| PC Tauri | K1/C4/C5/A1–A4/K2/U1–U3 代码与自动门禁已完成，真实联调待验收 | Tauri 2.11.1、SQL 插件配置、OCR sidecar supervisor、固定模型资源、bundle verifier、license/SBOM、BackgroundParserHost、FileViewerParserBridge、bounded document parser、`document_processing_jobs` v5 repository（服务端 UUID revision）、encrypted cache package commands、DocumentJobRunner/Pinia store、Rust `document_upload_put` 与 PC `ParsedDocumentUploadCoordinator`；登录后 runtime 组装 parser/OCR/package/cache/upload/scheduler，启动前执行一次同步以恢复 SOURCE outbox，在线与同步事件可恢复任务；服务端 V15/V16 ParsedDocument 与阅读会话 schema、Source FILE/TEXT/URL 分流、owner-scoped upload intent、complete 首胜、revision indexing、accepted block indexing、cleanup、当前 Source 检索和同学科确定性升级；PC 已接入 reading session、未 READY 弹窗、状态点/Profile 进度中心和选中文本知识块操作 | `test:r4-pc` 135/135、服务端定向 AI/OpenAPI 31/31、PC type-check、Web build、`check:r4-pc`（79 个生产文件）、Tauri `--no-bundle` 生成 `src-tauri/target/release/app.exe`；完整 MSI bundling 仍受宿主 WiX 文件/权限错误阻断，PostgreSQL upgrade 因本机 Docker 不可用未执行 | 四种 Office 在实际 File Viewer/Tauri 中的提取/bitmap fallback、扫描 PDF OCR 真实渲染、C2/C3 Tauri 真机 cache/上传/恢复、S1 PostgreSQL upgrade、C4/C5 真实 Server/MinIO 联调、阅读会话与当前文件/同学科升级真实 SSE、选中文本/知识块、Windows GUI、宿主权限、MSI 安装/升级/卸载、安装后 OCR、真实性能回归 | 启动 Tauri 接入真实 Server/MinIO，完成样本文件、重启/断网恢复、阅读/选择操作和 GUI 业务验收；随后在具备安装权限的 Windows x64 环境完成安装验收 |
| Mobile H5 | 已构建待验收 | Auth/Sync/Realtime/Asset/Review/Stats/AI 新契约、用户/设备隔离本地库与手机页面存在 | 2026-08-21：`check:r4-mobile` 62 文件、协议测试 20/20、type-check、H5 build 通过；保留 import 与 Sass 警告 | 真实服务、手机浏览器、弱网、输入法 | H5 联调与真机走查 |
| 微信小程序 | 已构建待验收 | `MP-WEIXIN` 排除 Tablet；环境强制 HTTPS/WSS；手机主路径共享新契约 | 2026-08-20：微信 build 通过 | AppID、开发者工具、真机、合法请求/WSS/upload/download 域名 | 配置平台域名并完成微信走查 |
| Tablet | 已构建待验收 | 9 个注册页、TabletLayout、多栏 workspace、共享 Auth/Sync/Asset/AI 边界；Dashboard/Review/Stats 已接 Stats/Review API；手写仍默认关闭 | 2026-08-21：`check:r4-mobile`、`test:tablet`、type-check、H5 build 通过 | 真实服务、横屏触控、键盘、缩放、前后台 | 完成 R4-07 平板真实服务与真机走查 |
| Tablet 手写笔记 | 已隐藏保留 | `tablet_notes`、NoteDocument、仓库与 feature flag 存在 | 本轮未执行专项脚本 | 笔迹、导入导出、长时间书写 | 核心链路后再开启 |
| 后端绿地重写 | 已构建待验收 | `Auralis-Server` 已替换为 `com.auralis.app` 的 Java 21 / Boot 4.1 / Modulith 2.1；Identity V1、Subject/KnowledgeBlock/Task V2、Source/Asset/Relation V3、Sync V4/V6、Review/Stats/Realtime V5、Task V7、AI/RAG V8–V14 与 PC Tauri ParsedDocument V15、版本/墓碑/恢复、Auth 与核心 API 存在；S3 upload intent、S4 payload validator、legacy Asset SHA 条件回填、S5 complete 首胜、S6 block indexing/cleanup 和 K1 OpenAPI/SDK 冻结已实现 | 2026-08-24：`ParsedDocumentSchemaTests` H2 clean/upgrade 4/4、`ParsedDocumentControllerTests` 3/3、`ParsedDocumentValidatorTests` 4/4、`AssetShaBackfillTests` 2/2、`ParsedDocumentCompleteTests` 3/3、S6 定向 21/21、K1 `OpenApiArtifactTests` 4/4 和 PC type-check 通过，覆盖 V15 字段/索引/非同步边界、READY FILE/活动 chunk 保留、非 READY FILE→AWAITING_CLIENT、owner/revision/hash/size/schema、gzip/UTF-8/ordinal、并发 SHA 回填、complete 首胜/冲突/过期、worker block indexing/revision fencing、兼容 reingest、object cleanup 和生成契约；PgVector upgrade 断言已补充但本机 Docker 不可用，未取得 PostgreSQL 执行证据；既有默认后端测试证据仍保持此前结果 | 真实 Provider chat、MinIO 异常路径、Source 文件链路、双设备、浏览器 WebSocket、GUI/真机和外部 AI 完整业务 | 完成 C4/C5 和目标客户端业务联调；自动门禁和单次 Provider smoke 不等于人工验收 |
| Auth | 已构建待验收 | 新 `com.auralis.app` 已有 BCrypt、15 分钟 access JWT、30 天 refresh rotation、会话撤销、owner-scoped sessions 和 Problem Details 安全错误 | 2026-08-12：IdentityService 5 个测试、AuthController 6 个 MockMvc 测试；test profile HTTP smoke 注册 201、登录 200、token pair 存在 | 三端登录/刷新/退出、人工业务验收和生产 JWT/数据库环境 | 接入后续业务模块并完成 PostgreSQL/前端联调 |
| 块与任务 | 已构建待验收 | CRUD、实体、端侧副本与同步路径存在 | 2026-07-10：`mvn test` 生命周期通过，无业务断言 | 跨用户、删除、多端一致性 | 统一删除并测试 |
| Asset | 已构建待验收 | V3 Asset 元数据、上传 intent、完成时对象 HEAD/stat 校验、READY 下载 URL、用户归属和失败状态持久化存在；MinIO 适配器按配置启用 | 2026-08-17：真实 MinIO presigned PUT/HEAD/GET/open/delete 集成 1/1 通过；测试 profile 仍使用可控存储端口 | MinIO 异常路径、上传回调和部署凭据验证 | 完成对象不存在、大小/hash 不符、超时、重复完成和生产凭据验收 |
| Source | 已构建待验收 | V3 Source FILE/TEXT/URL CRUD、版本/墓碑/恢复、reingest PENDING、Subject/Asset 归属校验和 KnowledgeBlock Source 关联存在 | 2026-08-13：阶段 2B Repository/Service/Controller 与全量 42 测试通过 | ingestion worker、Tika/文本解析、真实文件链路和三端业务验收 | 先完成真实对象/解析边界，再进入同步接入 |
| Relation | 已构建待验收 | V3 Relation 端点类型/用户/活动状态校验、RELATED_TO 无向去重、版本/墓碑/恢复和 shared 删除事件级联存在 | 2026-08-13：阶段 2B Repository/Service/Controller 与全量 42 测试通过 | PostgreSQL 约束、跨模块人工业务链路和同步一致性 | 与删除/同步阶段一起完成外部验收 |
| Sync | 已构建待验收 | V4/V6 change log/inbound mutation、高水位 cursor、原子 push/pull/snapshot、包含墓碑的快照、设备校验、幂等、版本冲突、30天自动清理与指标存在 | 2026-08-17：R1-05 定向套件 16/16 通过，覆盖清理后 cursor reset、高水位延续、清理指标、并发 cursor/并发重放；全量 126 通过、1 个 opt-in PostgreSQL 测试跳过 | 双设备、断网重连、过期 cursor 的真实调度、PostgreSQL 并发游标 | 完成真实数据库/双设备验收 |
| Review | 已构建待验收 | V5 ReviewState/ReviewEvent/参数集、FSRS-lite、due/event/history、完整状态快照、SKIP 与事件幂等存在 | 2026-08-14：Review 定向 6/6 通过，全量回归通过，覆盖后续复习后重放原始状态 | 多端复习主流程和调度业务验收 | 接入前端并进行真实用户流程验收 |
| Stats | 已构建待验收 | V5/V7 强类型 overview/weekly 查询，所有统计按 userId 过滤，任务按 completed_at 统计 | 2026-08-14：Stats/迁移定向 4/4 通过，全量回归通过，覆盖后续编辑不改变完成日统计 | 真实数据量、跨用户和前端展示验收 | PostgreSQL 查询计划和前端联调 |
| Realtime | 已构建待验收 | V5 一次性 hash-only ticket、设备绑定、WebSocket handler 和提交后用户级事件桥存在；`/ws/events` 仅由 WebSocket handler 承接，没有 MVC GET 回退 | 2026-09-01：Realtime service/controller/真实 HTTP upgrade 定向 5/5 通过，已验证签发 ticket 可以不带 Bearer header 完成 WebSocket 握手，并覆盖已提交领域写入产生 SYNC_CHANGED | 浏览器/目标端 WebSocket、跨实例、断线重连和前端消费 | 加入真实目标客户端与部署拓扑验收 |
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
- 实现边界：chunk generation 原子切换、Source 删除过滤和 2026-09-27 的 ingestion 同事务入队及 revision/lease/attempt fencing 已完成代码与聚焦验证；Suggestions 真实 LLM/citations、文件解析边界（当前仅文本型 MIME）和端到端 AI 质量仍登记为未关闭风险。

以上结果只证明对应命令的执行范围，不替代 GUI、真机、真实基础设施或外部 AI 服务验收。

- 后端 R1-06/G1：默认 Surefire 自动启用 PostgreSQL/MinIO Testcontainers；系统 Maven 与 Wrapper `clean test` 均为 135 个测试通过、0 失败/错误/跳过。覆盖普通 Maven 仓库路径、全局 `open-in-view=false`、prod springdoc 关闭、local OpenAPI 保留、H2 2.2.224 和 Mockito Java agent。
- 后端 R2：已新增 Compose 固定镜像/健康检查/secret fail-fast、Java 21 非 root Dockerfile、PostgreSQL Testcontainers clean/upgrade 输入、MinIO presigned 链路、Provider stub 错误矩阵和对象孤儿核对脚本；Compose config/build/up/health、真实 PostgreSQL/MinIO 主链路均通过，异常专项和真实 Provider smoke 仍开放。
- 后端 R3/G3：`OpenApiArtifactTests` 导出并比较 `docs/contracts/openapi/auralis-openapi.json`；`scripts/check-openapi.ps1` 运行时比较通过（3/3），使用 `openapi-typescript@7.13.0` 对 PC/Mobile schema 重生成比对通过；PC `npm run build`、Mobile `npm run type-check` 和 H5 `npm run build:h5` 均通过。Mobile 通过将 TypeScript 固定为 5.3.3 与现有 `vue-tsc@1.8.27` 对齐；G3 契约迁移前置门禁已通过，但该结果不等于真实 Provider smoke 或前后端业务联调。

## 本轮验证结论（2026-08-22）

- 修复 PC 学科工作区文件登记的两个断点：前端不再对缺少文件/学科/名称静默 return，确认按钮会反映前置条件与上传中状态，失败通知保留弹层以便重试并刷新当前资料列表；Docker MinIO 将容器内 endpoint 与浏览器 public endpoint 分离，并按 CORS 白名单允许直传。
- 验证：`Auralis-PC` `npm.cmd run test:r4-pc` 82/82、`type-check`、`check:r4-pc`（60 个生产文件）通过；`Auralis-Server` `mvnw.cmd -B -ntp clean test` 149/149 通过，含 MinIO public endpoint 集成测试 2/2；Compose config 校验通过。push 后 Docker backend/frontend 已重建并健康，frontend HTTP 200、backend readiness HTTP 200/UP，MinIO CORS 预检对 `localhost:5173` 返回 204 和允许源；浏览器真实点击验收仍未自动化，不能以容器健康替代 GUI 验收。

- 修复 PC Dashboard 已排期任务拖拽后时间不变化的问题：`toTaskModel` 在显式提供 legacy `startTime` 时优先按新槽位生成 `scheduledAt`，未提供时继续保留现有 `scheduledAt`。回归测试覆盖原槽位到目标槽位的写回语义。
- `Auralis-PC`：`npm.cmd run test:r4-pc` 81/81、`npm.cmd run type-check`、`npm.cmd run check:r4-pc`（60 个生产文件）和 `npm.cmd run build` 均通过；新建任务、复习任务和 Store 缺省时长均收敛到 30 分钟倍数。构建仍保留既有 Asset 大 chunk 与无效动态 import 非阻断警告。浏览器/Tauri 拖拽实际走查仍待验收。
- Docker 测试账号 `pc-ai-test-20260821-180412@example.com` 的 17 个任务已限定范围校正：预计时长统一到 30 分钟倍数，已有排期统一到整点或半点；校验结果为 `17|0|0`（总数|非半小时用时|非半小时排期）。其他用户数据未修改。
- Docker backend 已补充安全的资产/登记生命周期日志：`ASSET_UPLOAD_INTENT_*`、`ASSET_UPLOAD_COMPLETE_*`、`ASSET_UPLOAD_READY`、`ASSET_UPLOAD_REJECTED`、`SOURCE_CREATED`；不记录文件内容、Authorization、API Key 或响应体。该日志只证明请求阶段可见，浏览器实际选择文件和业务成功仍需人工验收。
- 2026-08-22 运行态补充：用户从 `http://127.0.0.1` 访问时，upload-intent 已返回 201 但 MinIO PUT 因 CORS origin 未列入白名单而被浏览器包装为 network error；`.env` 与 `.env.example` 已加入 localhost/127.0.0.1 两组 origin。重启后 127.0.0.1 预检返回 204、frontend/readiness 均为 200；浏览器需刷新后重试。

## 人工验收边界

- Tauri 权限、GUI、插件与安装包。
- 微信开发者工具、真机、域名和平台限制。
- H5/原生 App/Harmony 等目标设备。
- Tablet 触控、手写、双指缩放、文件批注和长时间书写。
- 真实 PostgreSQL、Redis、MinIO、Milvus 和外部 AI 提供商全链路。

## 2026-09-08 Task 5 OCR 文档同步

- OCR parser、页级 continuation、全空文档 `OCR_DOCUMENT_EMPTY`、bounded/copyable diagnostics 与隐私边界已在代码实现，并有 focused Node/Rust 自动测试覆盖；本条不等同于业务验收。
- 本轮计划的 focused Node suite、PC `type-check`、`test:r4-pc` 与 OCR Rust 单元测试/`cargo check` 将分别记录实际命令结果；`cargo check` 若受本机依赖或网络环境阻断，保留精确错误，不改写为通过。
- `1.pdf` 尚未在真实 Tauri GUI 中完成打开、OCR、任务中心状态和失败态验收；真实剪贴板写入、Windows accessibility/窗口可见性以及 sidecar/日志现场观察仍待人工执行。
- 当前实现和自动化证据不能证明真实文件质量、GUI 交互或生产日志脱敏已验收；这些边界继续列为开放项。

## 本轮验证结论（2026-08-23）

- PC SubjectWorkspace 已将总结从原文件预览容器拆为独立 `· 总结.md` 虚拟文件项；原文件仍由 `FilePreview` 单独渲染，点击总结项显示独立 Markdown 文档并可下载。总结只由当前知识块实时生成，未新增后端 Source/Asset 持久化。
- `Auralis-PC` `npm.cmd run test:r4-pc` 93/93、`npm.cmd run type-check` 和 `npm.cmd run build` 通过；构建保留既有 File Viewer/Asset 大 chunk 与无效动态 import 非阻断警告。浏览器文件切换、Markdown 下载、深色和窄栏布局仍需人工验收。
- PC Dashboard 待办列表已修复窄宽布局：长学科徽标可收缩并省略，任务名称不再被挤到不可见。`npm.cmd run test:r4-pc` 94/94、`npm.cmd run type-check`、`npm.cmd run check:r4-pc`（60 个生产文件）通过；浏览器缩放和真实长名称仍需人工走查。

## 阅读与回写

- 风险、优先级、关闭条件：[问题和审查](IssuesAndReview.md)
- 未来任务：[计划入口](../planning/README.md)
- 构建/部署：[部署指南](../operations/Deployment.md)
- 已发生变化：[Changelog](../release/Changelog.md)
2026-09-15 Overview 最小 JSON 诊断已加入但尚未部署：Provider 从最终序列化 request body 记录 structured JSON 的 `responseFormat=json_object`、预算和阶段；FINAL validator 前对原始 `message.content` 直接执行 `readTree`，记录 `FINAL_JSON_CHECK` 的 valid/chars/line/column/exceptionType，不做 fence stripping，因此 fenced JSON 会 valid=false。日志不含 body、prompt、正文、原始异常 message、URL 或 key，普通聊天/流式不变。聚焦自动测试已通过，真实 DeepSeek 链路需用户重跑确认；不能将该诊断视为业务验收完成。

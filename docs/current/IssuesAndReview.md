# Auralis 当前问题与审查登记

### 2026-09-27 PC 全局弹窗与模态层组件化规范与提取重构（Modal & Dialog Optimization）

- **背景与目标**：此前 PC 端各个视图分散内联自制弹窗（`Dashboard`、`Timeline`、`Profile`、`Asset`、`SubjectWorkspace`），样式代码重复、尺寸不一、缺乏无障碍与 Esc 监听、动效参差不齐。目标是在不破坏业务逻辑、不改变响应式状态归属、不破坏既有测试断言的前提下，建立统一的 `ModalShell` 基础组件并提取 6 个独立业务弹窗。
- **实施架构与提取清单**：
  1. 基础规范与壳组件：`src/components/modal/modal.css`（Token、5 档尺寸、标准按钮与输入）与 `src/components/modal/ModalShell.vue`（Teleport、fade-in/scale-up 动效、Esc 监听、遮罩防误触关闭、body 滚动锁定）；
  2. 提取业务弹窗：
     - `src/components/profile/ChangePasswordDialog.vue`（用于 Profile 修改密码）
     - `src/components/subject/SummaryInstructionDialog.vue`（用于 OverviewSummaryView 提炼要求）
     - `src/components/task/TaskCreateDialog.vue`（用于 Dashboard、Timeline、SubjectWorkspace 新建排期任务）
     - `src/components/asset/FileRegisterDialog.vue`（用于 Asset、SubjectWorkspace 文件参考登记）
     - `src/components/knowledge/KnowledgeBlockViewDialog.vue`（用于 Dashboard 与 Timeline 知识卡片查看，彻底消除 Timeline 原内联 block-modal）
     - `src/components/knowledge/WorkspaceKnowledgeBlockDialog.vue`（用于 SubjectWorkspace 知识块三态流转）
  3. 统一外壳改造：
     - `src/components/subject/SubjectCreateModal.vue`（学科空间创建/编辑）全面接入统一 `ModalShell`（`size="md"`），消除手写遮罩/容器样式，保留 `version: props.subjectData.version` 契约断言；
     - `src/components/ConfirmDialog.vue`（通用确认对话框）全面接入统一 `ModalShell`（`size="sm"`），统一标题、遮罩与确认/取消按钮层级；
- **契约保护与兼容**：
  - `Timeline/index.vue`：保持 `/duration:\s*newTaskForm\.value\.duration\s*\|\|\s*60/` 契约断言；
  - `SubjectWorkspace/index.vue`：保持 `!registerForm.subjectId || !droppedFile || isUploading`、`createFileSource(targetSubjectId, registerForm.value.name.trim(), ...)`、`SUPPORTED_UPLOAD_EXTENSIONS.join(',')` 与 `validateUploadFile` 契约断言；
  - `Profile/index.vue` 与 `OverviewSummaryView.vue`：保持密码长度校验与 2000 字限制断言；
- **门禁与测试**：PC 全量回归 `npm.cmd run test:r4-pc`（433/433 全量通过），`npm.cmd run type-check`（0 error）与 `npm.cmd run build` 生产构建均顺利通过。

### 2026-09-27 PC 任务编排中心下周排期精确自然日比对与槽位计算修复

- **现象与根因**：用户反馈“下周的还显示当周的”。排查定位到 `useTaskStore.ts` 中 `rebuildSchedule` 与 `dateForDay` 此前仅依赖 `DayCode` ('Mon'~'Sun') 匹配当周星期几，且 `rebuildSchedule` 限定只拉取 `getTasksForTimeline` 当周区间的任务，导致点击侧栏下周的某一天（如下周一 `2026-10-05`）时，`taskStore` 将下周一的选中态降级归为当周一 `Mon` 匹配，从而把当周一的任务错塞进了下周一的时间槽中。
- **修复与打通**：
  1. `useTaskStore.ts`：扩展 `dateForDay` 原生解析 `YYYY-MM-DD` 格式 `dateKey`，直接构造指定年月日的精确 `Date` 对象与 ISO 字符串；扩展 `rebuildSchedule` 支持 `targetDateKey`，并在 `setSelectedDay` 中接受 `dateKey` 参数，彻底打通跨周精准比对；
  2. `Timeline/index.vue`：`selectDay` 传递 `(dayCode, dateKey)` 给 `taskStore.setSelectedDay`，并由选中的 `selectedTimelineDay.dateKey` 准确派生槽位任务与选中效果，确保点选下周任意一天时只渲染下周该天的实际排期任务。
- **门禁验证**：PC 全量回归测试 `npm.cmd run test:r4-pc`（433/433 全量通过），`npm.cmd run type-check` 类型检查通过。

### 2026-09-27 PC 任务编排中心下周排期概览实现

- **需求与实现**：响应在任务编排中心（`Timeline/index.vue`）侧栏中无需 Tab 切换、直接展示“下周排期概览”的要求。在侧栏原本的“本周排期概览”下方新增“下周排期概览”区块，与本周视觉卡片 100% 同款对齐。
- **关联数据流**：在 script 中新增 `nextWeekTimelineDays`（`taskStore.currentNow` + 7 天的 7 天时间段）与 `allTimelineDays`；引入 `getScheduledTasksForDateKey` 精确比对具体自然日的已排期任务；支持点击下周任意一天，`selectedTimelineDay` 自动联动更新中间栏“时间流细节”标题及当天半小时槽位细节。
- **门禁验证**：PC 全量回归 `npm.cmd run test:r4-pc`（433/433 全量通过），`npm.cmd run type-check` 退出 0。

### 2026-09-27 PC/Service 风险修复与剩余边界

- **Suggestions 暂藏**：PC 无可见界面入口，未使用的 `aiClient` 调用封装已移除；Server 确定性基线接口和既有 API 契约仍保留。真实 LLM、citation 与质量验收未完成，开放条件不变。
- **Timeline 本地半交换**：两条服务端交换响应现用一个 SQLite 事务写入，第二条注入失败可回滚首条；cursor/outbox 不变，随后增量同步恢复两项排期。浏览器 fallback 一次提交；服务端成功而本地失败时一次更新两项内存投影并请求读同步。PC 全量 433/433、type-check 通过；真实 GUI/双设备待验收。
- **Sync cursor=0 保留期缺口**：按 owner 高水位与最早保留 cursor 检测省略/零 cursor 的部分或全部日志清理；新空用户和完整历史不误 reset。Sync 聚焦 15/15 通过，真实 PostgreSQL 长期清理与双设备待验收。
- **Overview 输入及并发**：Subject 输入先建立全部 alias，允许前项引用请求中后项；Source 同键进行中调用在单个服务实例内按含标题的键复用 Provider 结果。Overview 聚焦 46/46 通过；跨实例并发仍可重复生成，真实 Provider/代理时延与 PC 300 秒总超时仍待验收。
- **Source ingestion 更新竞态**：TEXT/URL 解析输入变化轮换 revision；不同修订独立 job。Source 与 job 同事务持久化，入队失败时 Source 与 change log 一起回滚；恢复仍在处理中的 Source 时按当前 revision 补建或复用 job。完成/失败均按当前 revision、job/generation、attempt 和锁后有效 lease 栅栏化；成功的 Source READY、chunks、job READY 同事务提交。相关 clean 聚焦测试纳入 114/114，PostgreSQL pgvector 2/2 通过；真实运行和长耗时 Provider 尚未验收。
- **本轮门禁**：PC 433/433/type-check、Server clean 114/114 与 PostgreSQL 2/2；`check:r4-pc` 因未改 Rust 测试固定地址扫描退出 1。不能据此宣称业务验收完成。

### 2026-09-26 PC 功能缺口定向修复与开放验收

- **首次同步漏数风险（代码修复）**：PC 在 `cursor=null` 时改为先请求完整 snapshot，避免新设备因服务端超过日志保留期的变更被清理而只获得近期增量。snapshot 保留未解决本地写入并刷新 Subject、Source、KnowledgeBlock、Task、Relation 投影；Tauri SQLite 快照也保护 `inflight` mutation。Sync 定向 13/13、Rust 定向 1/1、类型检查通过。真实双设备、长期离线和服务端保留期场景未联调。
- **AI 显式参考范围（代码修复）**：当前文件默认 `AUTO`；显式多文件只检索当前文件与用户所选的同学科 READY Source，最多 100 份；全学科模式必须由用户显式选择。Server 验证 Subject owner/active、Source owner/归属/READY；PC 定向 3/3、Server clean 检索 12/12 与模块边界 1/1、PC 类型检查通过。clean 重编译后 OpenAPI runtime artifact 8/8，重新导出 artifact、生成双端 SDK，`check-openapi.ps1` 退出 0。真实 Provider/向量检索与 GUI 未验收。
- **Overview 与状态/预览（代码修复）**：PC Overview 请求单次超时 300 秒，仍可能在更多轮 Provider 调用时超时；纯显示名变化不重载预览，内容身份变化仍重载；通用 HTTP 5xx/网络/超时进入全局服务状态，响应按请求序号裁决且取消不改状态。对应 PC 定向 47/47、32/32、8/8 通过。真实 Server、Tauri GUI 与网络竞态仍待验收。
- **个人空间说明（文案修正）**：JSON 导出明确只含知识块与任务；AI 请求经 Server 转发，登录密码说明为单向哈希保存。原始文件备份/恢复能力未新增。
- **本轮整体门禁**：PC 全量回归 430/430、type-check 与生产构建通过；`check:r4-pc` 仍因未修改的 `local_asset_store.rs` 测试固定地址规则退出 1，不能称全门禁通过。

### 2026-09-26 PC 未完成排期任务提前划掉（Line-through）问题修复

- **现象与根因**：用户反馈“排期还没完成就被划掉了，但是勾选状态是正确到任务完成才勾选”。排查发现 `Timeline/index.vue` 中对 `.is-past`（排期时间落入过去时刻的任务）在 CSS 1524–1530 行设置了无条件删除线 `.is-past .task-name, .is-past .task-detail ... { text-decoration: line-through; }`。导致时间过期的排期任务即便【尚未完成】（勾选框未勾选、`isCompletedScheduledTask` 为 false），其文字内容也被强制渲染了划下划线（划掉）样式，导致界面文字渲染与勾选状态脱节。
- **修复**：移除 `Timeline/index.vue` 中 `.is-past` 导致的强制删除线样式。划线删除样式与浅色半透明灰度收敛由 `.is-completed` 统一控制（即仅当 `isCompletedTask` / `isCompletedScheduledTask` 为 true 任务真实完成时才应用 `line-through` 样式与勾选标记）。
- **验证与门禁**：PC 全量回归测试 `npm.cmd run test:r4-pc`（423/423 全量通过），`npm.cmd run type-check` 类型检查通过。

### 2026-09-26 Issue 2/6/7 定向修复与待验收边界

- Issue 2：PostgreSQL 查询原已在 TopK 前过滤软删除 Source；H2/fallback 曾先取 TopK 再过滤引用，删除 Source 的高分旧 chunk 可挤占有效名额。现先批量读取当前用户活动 Source，再排序取 TopK；定向 RED 复现空 citation，GREEN 8/8，PostgreSQL 17/pgvector 2/2 覆盖删除竞争和恢复后新 generation 可检索。
- Issue 6：`DocumentProcessingStore.start/resumePending` 原可直入 Runner；现通过 SourceJobScheduler。当前 UI 手动开始、retry 与 runtime 恢复原已走 Scheduler；PC 相关运行时回归 66/66、type-check 与 build 通过。只读审查将 Store `resumePending` 仍沿用旧 Runner 的本地阶段筛选列为 OPTIONAL：正式 runtime 恢复直接把全部 Source ID 交给 Scheduler，本轮未扩大该 Store 方法语义。
- Issue 7：Source 列表/分页及 Retrieval citation 的逐条查询改为 owner-scoped 批量读取；测试验证两条 FILE Source 为 1 次 Source 查询加 1 次 Asset 批量查询，引用候选 Source 一次批量查询，保持顺序和内容。`check:r4-pc` 仍被未改 Rust 文件的固定地址规则阻断。真实运行、GUI、负载性能和多数据量查询计划尚未验收；本轮未改 API/schema。

### 2026-09-26 注销作业到期后运行复核

- 用户重建前后端并重试后，指定账号的精确关联作业从 `PENDING` 在 `not_before=06:49:18.077669 UTC` 后转为 `COMPLETED`，完成时间 `06:50:10.172777 UTC`；用户行已删除，`last_error` 为空。针对该用户归属的 21 张清理表和本作业对象键记录只读统计均为 0。前后端运行镜像与各自本地 tag 一致。
- 验收边界：数据库确认本次账户物理清理完成；尚未单独检查 MinIO，也没有可恢复的 DELETE HTTP 响应或 GUI 提示原文。早前旧镜像与 PC 401 误判问题的历史记录保留作为修复背景，不代表当前作业仍未完成。

### 2026-09-26 注销确认密码 401 被 PC 误判为会话失效

- 现场数据库：指定测试账号规范化用户名唯一匹配，状态 `ACTIVE`、关联作业数 0；未受理注销。运行中 backend 字节码已包含 UTC `OffsetDateTime` JDBC 参数修复，V25 已安装。现场没有可恢复的 DELETE HTTP 状态或错误内容，不能断言用户遇到的具体错误。
- 代码问题：后端确认密码错误返回 `401 UNAUTHENTICATED / Invalid credentials`，PC 原共享拦截器把所有受保护请求的 401 当成令牌过期，刷新并重放 DELETE，随后可能跳转登录，造成“账号无法登录、似乎已注销”的误判。
- 处理与验证：PC 仅对该 DELETE 的确认密码错误跳过刷新、重放和跳转；Bearer 失效仍按原流程处理。PC 定向测试 6/6、type-check、生产构建与 frontend Docker 镜像构建通过；独立 PostgreSQL 注销完整生命周期与错误密码回归 4/4 通过。`check:r4-pc` 因未修改的 `src-tauri/src/local_asset_store.rs: fixed local address` 报 1 项失败。当前 frontend 容器仍用旧镜像、GUI 未验收，真实账号未触发注销。该判别依赖服务端现行 Problem Details `detail`，若错误文案改变须同步调整或改用专用机器码。

### 2026-09-26 账户注销受理入口 PostgreSQL 时间参数错误

- 现场证据：当前运行容器与上次构建的镜像 ID 一致；`DELETE /api/auth/me` 在 `IdentityService.requestAccountDeletion()` 插入 `account_deletion_jobs` 时直接绑定 `Instant`，pgJDBC 无法推断 SQL 类型，受理失败。
- 处理：仅将 `requested_at` 与 `not_before` 的 JDBC 参数转为 UTC `OffsetDateTime`，不改作业状态机、API 和表结构；已增加隔离 PostgreSQL 异时区回归。
- 验证：285 个主源码 clean compile 通过；独立 Testcontainers PostgreSQL 17/pgvector + Flyway V1–V25 异时区定向回归 2/2；新 backend 镜像已构建。其他未提交测试源码与当前接口不匹配导致 Maven 全量测试编译失败。运行容器仍用旧镜像；真实账户注销未验收。

### 2026-09-25 账户注销清理定时任务 PostgreSQL 参数错误

- 现场证据：`AccountDeletionCleanupService.claimNext` 的 `JdbcTemplate` 绑定 `java.time.Instant`，pgJDBC 抛出“Can't infer the SQL type”，导致定时任务在领取作业前失败，已受理的注销无法完成后台清理。
- 处理：同一服务中所有 JDBC 时间参数改用 UTC `OffsetDateTime`；隔离 PostgreSQL 17/pgvector + Flyway V1–V25 的合成作业回归 1/1 覆盖领取至完成后复扫，并使用异时区 JVM/数据库会话校验绝对时刻。新后端镜像已构建，当前运行中 Compose 容器尚未更新，真实用户数据未触碰。
- 验证限制：仓库全量 `testCompile` 受其他未提交测试与现行生产接口不匹配阻断；需待该测试基线恢复后重跑全量门禁，并在受控环境验收真实对象存储、延迟和最终删除。

### 2026-09-25 通用 AI 聊天 Provider 验证边界

- 设置 API 不接收用户 Embedding 模型；Embedding 使用服务端 SiliconFlow 凭据与模型。聊天配置保存、普通聊天及连接测试不依赖该凭据；启用 RAG 或索引仍需要服务端可用的 Embedding 配置。
- `OPENAI_COMPATIBLE` 可连接用户指定的公网 HTTPS 地址，保留 DNS 公网筛选、固定地址连接、443 端口限制和关闭重定向；本地/内网服务不在当前支持范围。审查发现的 NAT64 绕过风险已通过拒绝 NAT64、6to4、Teredo 转换前缀并补安全测试关闭；尚未以真实第三方服务商和生产 DNS/代理环境验收其兼容性与出站策略。
- 最新 Server clean 定向 45/45、安全专项 clean 18/18、OpenAPI artifact 8/8、SDK gate、PC 定向 5/5 与类型检查通过。Mobile 类型检查中的 `clientImportId` 缺失为既有上传链路问题，本次未修改该链路。

### 2026-09-25 PC 首页已完成勾选状态全链路修复（代码修复，GUI 待验收）

- **现象与根因**：
  1. 历史排期校验误拦截已完成写入：`persistOffline` 中的 `assertScheduleMutationAllowed` 在排期检查中直接对任务调用 `assertScheduledAtIsNotPast`，未豁免已完成任务（`model.status === 'DONE'`）。导致无论是在应用加载/定时轮询中自动完成已过期的排期任务（`recoverOverdueTasks`），还是用户在首页手动点击勾选已结束的排期任务，均抛出 `不能排期到过去的时间` 异常，造成自动完成静默失败、手动点击报错回弹；
  2. 规范状态 `DONE` 穿透漏判：`taskViewRules.ts` 中的 `isActionableTask` 和 `isSchedulableTask` 仅判断了 `status !== 'completed'`，遗漏了规范枚举 `'DONE'`，导致服务端拉取或本地存储的已完成任务被错误判定为活动逾期任务或待排期任务；
  3. 首页指标统计脱节：`useTaskStore.ts` 中的 `completedCount` 与 `totalFocusHours` 仅按 `task.status === 'completed'` 统计，遗漏 `'DONE'`，导致首页顶部“已完成 X 项”未正确统计；
  4. 待办清单定位纯粹化：待办清单 `.todo-item` 聚焦未排期待办呈现，移除复选框与点击完成控件，避免无排期待办直接在首页被误勾选，保留前往排期副驾规划流。
- **修复**：
  1. `useTaskStore.ts`：在 `persistOffline` 中豁免已完成任务 `model.status !== 'DONE'` 校验过去的排期；引入 `isSameScheduleTime` 时间戳比对；指标统计统一使用 `isCompletedTask(task)`；
  2. `taskViewRules.ts`：`isActionableTask` 与 `isSchedulableTask` 统一使用 `!isCompletedTask(task)`，全量收敛规范与展示层已完成状态；
  3. `Dashboard/index.vue`：`.todo-item` 移除复选框与点击完成，保持纯净信息胶囊；今日日程卡片保留勾选与完成切换；
  4. 测试与验证：更新 `scripts/r4-dashboard-timeline.test.mjs`，PC 全量回归测试（420/420 全量通过），`vue-tsc` 类型检查通过，`git diff --check` 通过。浏览器界面核验完成。

### 2026-09-25 PC 顶栏头像真实映射与右上角在线状态点移除（已修复）

- **现象与根因**：
  1. 顶栏头像未对接服务端真实头像：`AppHeader.vue` 此前仅展示静态首字母占位符，未对接 `GET /api/auth/me/avatar` 服务端私有头像 Blob，无法在用户上传头像后全局同步显示；
  2. 右上角状态绿点视觉干扰：顶栏头像右下角渲染了绿色在线状态点（`.avatar-status`），存在视觉干扰且与极简温润禅意设计规范不契合；
  3. 头像状态全站响应式同步缺失：个人中心 `Profile/index.vue` 修改或重置头像后，顶栏头像未能单向响应式联动更新。
- **修复**：
  1. `useAuthStore.ts`：增加响应式 `avatarUrl`、`loadAvatar()` 与 `setAvatarUrl()`，在登录（`setSession`）时自动拉取头像 Blob 并生成内存安全的 ObjectURL，在登出（`clearSession`）时妥善调用 `URL.revokeObjectURL` 释放；
  2. `AppHeader.vue`：对接 `authStore.avatarUrl`（有头像时呈现真实图片、无头像时优雅降级首字母），彻底移除 `.avatar-status` 模板节点与对应 CSS 样式；
  3. `Profile/index.vue`：在 `loadAvatar`、`uploadAvatar` 与 `resetAvatar` 时同步调用 `authStore.setAvatarUrl`，且在组件卸载时避免误销毁全站共享的头像 ObjectURL；
  4. 自动化与视觉验证：`npm.cmd run test:r4-pc`（420/420 全量通过），`npm.cmd run type-check`（0 error）与 `git diff --check` 全部通过；浏览器实时截屏核验右上角头像渲染正常且状态绿点已完全移除。

### 2026-09-25 PC 头像 GET 返回 406（代码修复，真实 HTTP 待验收）

- **证据与根因**：现场日志显示 `GET /api/auth/me/avatar` 在 Spring MVC handler 选择阶段抛出 `HttpMediaTypeNotAcceptableException`；服务端 `AuthController.avatar` 声明 `produces=image/png`，而 PC 通用 Axios 客户端默认发送 `Accept: application/json`。`getAvatarBlob` 原先只设 `responseType: blob`，未覆盖该请求头。
- **处理与边界**：头像 GET 单独接受 PNG 和 Problem Details，保留无头像时的 404 错误响应协商。Profile 定向测试 5/5、PC type-check 与相关 diff-check 通过；Axios mock adapter 验证最终请求头。服务端和 OpenAPI 已是 PNG，无需改动；真实 HTTP、个人空间 GUI 尚待验收。引用分析中的账户注销清理错误不在本次范围。

### 2026-09-25 完成任务未进入已完成目录、首页日程结束后未勾选（补充修复，GUI 待验收）

- **根因与处理**：资产库原先优先判断任务没有截止时间或排期，导致已完成的此类任务被放入“未排期”；现改为完成状态优先，并统一任务树节点完成标记。首页日程已完成状态的本地提交与远端拉取映射在动态测试中均得到正确勾选；另发现任务投影刷新只重载列表，未立即重试自动完成检查，现于重载后触发恢复，保留现有冲突保护。审查发现已结束排期任务可手动取消完成、随后被恢复逻辑重新完成的往返状态；现禁止此类取消操作并在控件说明原因。
- **验证边界**：任务规则 14/14、资产库 2/2、Store 排期 25/25、首页/时间轴 15/15、PC type-check 与相关 diff-check 退出 0。原始首页 DOM 症状和真实同步时序仍需 GUI 验收；不能仅凭状态映射测试断言所有用户现场已恢复。

### 2026-09-25 时间轴任务结束后仍未自动完成（代码修复，GUI 验收开放）

- **现象与根因**：用户反馈排期任务结束后仍未自动完成。原判定只看排期开始时刻，未计入持续时长；本地任务加载后没有立即恢复，仅依赖一分钟轮询；一项任务写回失败会中断整轮检查。并发审查还发现自动恢复若绕过任务变更队列，可能与手动编辑/改期用旧快照交错。
- **处理**：按 `scheduledAt + durationMinutes` 判定结束；加载后立即恢复、运行中按分钟复查；单项失败记录并继续其他任务；恢复写入与手动任务操作串行，并在提交前重新核对当前本地行、待处理 mutation 与版本。自动完成提交在本地仓储写边界原子拒绝旧版本和已被领取的同资源 mutation；增量 pull 也在落库时重新检查同资源未解决 mutation，避免用远端响应覆盖新建的本地写入。Task API 与数据库 schema 无变化。
- **验证边界**：任务规则与 Store 定向 35/35、本地仓储 18/18、同步 12/12、PC type-check 退出 0；真实 GUI、后台计时器节流和跨设备同步仍待验收。
- **最终只读复查**：自动完成提交与增量 pull 的资源/outbox 检查位于各自原子写边界，先前指出的同任务 claim 和 pull 快照过期竞态已收口；Reviewer 未发现本轮新增 BLOCKER 或 IMPORTANT。

### 2026-09-25 PC 个人空间清除离线数据底层持久化与 AI 脏配置自动持久化测试（已修复）

- **现象与根因**：
  1. 清除本地离线数据未生效：此前在设置页（`Profile/index.vue`）点击“清除本地离线数据”时，仅修改了内存中的 `syncStore.resetRequired = true` 并清除了少量 localStorage 键，并未清空 SQLite/IndexedDB 底层的 `local_mutations` 和 `local_resource_records` 表，且没有将 `reset_required = 1` 写入 `sync_metadata` 持久化表。`syncCycle` 在同步时无法持久感知该重置标志，按钮所承诺的“清除离线数据并从云端全量拉取”不会真实发生；
  2. AI 模型检测与连接测试可能测旧配置：在 AI 设置中，用户修改了 Base URL、切换了 Model 或填入了新的 API Key，但在尚未点击“保存 AI 配置”时，直接点击“自动检测”或“测试连接”，此前直接调用服务端的 `GET /api/ai/settings/{provider}/models` 或 `POST /api/ai/settings/{provider}/test-connection`。由于后端接口强制要求从服务端数据库读取该用户的已有托管凭证，导致测试的仍是服务端已保存的旧配置或旧 Base URL，甚至在用户填入错误的新密钥时仍可能对旧配置显示测试成功，引发误导；同时脚本中遗漏了 `testingConnection` 与 `handleTestConnection` 的完整关联。
- **修复**：
  1. 离线存储重置全链路闭环：
     - `localRepository.ts`：新增 `resetOfflineStorage()`，在一个事务中清空 `local_mutations` 和 `local_resource_records`，并在 `sync_metadata` 中原子设置 `cursor = NULL, reset_required = 1`（同时重置 `browserState` 内存与键值存储），使 `syncCycle` 可以在下次周期中真正触发快照拉取；
     - `useSyncStore.ts`：导出 `resetOfflineData()` 统一 action，调用 `repository.resetOfflineStorage()`、发布资源投影变更通知、触发立即同步 `flushNow()`；
     - `Profile/index.vue`：`handleResetOfflineData()` 调用 `syncStore.resetOfflineData()`，捕获异常并反馈用户。
  2. AI 脏配置自动持久化校验：
     - `Profile/index.vue`：实现 `ensureAiSettingsSavedForTest()` 机制，在用户点击“自动检测”或“测试连接”时，深度比对当前表单与已保存配置（新密钥、Base URL 变更、模型变更）；
     - 检测到配置变动时，先自动静默调用 `handleSaveAiSettings()` 将最新配置持久化至服务端托管库，再发起服务端连通性测试或可用模型拉取；若未曾配置密钥且未填入新密钥，则提前拦截并明确提醒用户填入 API Key；
     - 补齐 `handleTestConnection` 与 `testingConnection` 响应式加载状态与测试反馈，防止并发重复点击。
- **验证与门禁**：在 `scripts/r4-profile-live-links.test.mjs` 中补充断言，`npm.cmd run test:r4-pc`（408/408 全量通过），`npm.cmd run type-check` 与 `git diff --check` 全部通过。真实网络环境与 GUI 行为待验收。


### 2026-09-25 PC 首页已完成任务勾选状态与完成切换修复（已修复）

- **现象与根因**：首页看盘（`Dashboard/index.vue`）中，已完成任务未正常渲染为勾选状态，且点击复选框无法顺畅切换状态：
  1. 状态判断未兼容规范状态：`taskViewRules.ts` 中的 `isCompletedTask` 与 `isCompletedScheduledTask` 仅判断了展示层状态 `'completed'`，对从后端同步或本地数据层透传的规范枚举 `'DONE'` 判断为未完成，导致已完成任务呈现为空心复选框；
  2. 首页切换状态流转与容错：`Dashboard/index.vue` 中的 `toggleTaskCompletion` 仅以固定字面量切换 `'pending'`，未根据任务是否有排期智能流转为 `'scheduled'` 或 `'pending'`；未对异步更新错误提供捕获与通知提示；
  3. 待办清单（Todo List）缺少勾选控件：待办清单任务此前无复选框，用户无法直接在首页待办中勾选完成未排期任务；
  4. 交互热区优化：日程任务卡片文字区域补充点击勾选切换与手势指针，提升交互易用性。
- **修复**：
  1. `taskViewRules.ts`：在 `isCompletedTask` 与 `isCompletedScheduledTask` 中兼容规范完成状态 `(task.status as any) === 'DONE'` 与展示状态 `'completed'`，确保所有来源的已完成任务均能正确被判定并勾选；
  2. `Dashboard/index.vue`：
     - 引入 `isCompletedTask` 与 `TaskPresentationStatus` 类型；
     - 升级 `toggleTaskCompletion`：智能识别当前完成状态，已完成的排期任务解勾选后返回 `'scheduled'`，无排期任务返回 `'pending'`，未完成任务则推进至 `'completed'`；增加 `try...catch` 异常捕获与 `ElNotification` 友好提示；
     - 为待办清单 `.todo-item` 增加复选框绑定 `:checked="isCompletedTask(task)"` 与 `@change="toggleTaskCompletion(task)"`；
     - 为 `.scheduled-task-content` 增加快速勾选点击与手势指针。
- **验证与门禁**：更新 `scripts/r4-dashboard-timeline.test.mjs`，PC 全量回归测试 `npm.cmd run test:r4-pc`（407/407 全量通过），`npm.cmd run type-check` 与 `git diff --check` 全部通过。真实 GUI 行为仍待验收。

### 2026-09-25 头像上传被 Spring 默认 multipart 1 MiB 上限拦截

- **原因与处理**：头像业务接口允许原文件最大 5 MiB，但共享 Spring 配置未显式设置 multipart 上限，默认 1 MiB 会在请求进入 Controller 前拒绝较大的文件。已在共享配置中设置单文件 5 MiB、整个请求 6 MiB，保留表单封装开销；业务侧图片格式、像素和重编码校验继续生效。
- **验证与边界**：`mvnw.cmd -B -ntp clean -Dtest=ConfigurationTests test` 退出 0，3/3 通过，确认配置绑定。MockMvc 头像测试使用模拟 multipart，不证明嵌入式 Servlet 容器实际放行 5 MiB；真实 HTTP 上传仍需联调确认。

### 2026-09-25 PC 个人空间与设置页 10 类前端真实链路打通与闭环（已修复）

- **现象与背景**：此前 PC 设置页面（`Profile/index.vue`）存在 10 类前端缺口（涉及 12 个可见控件与状态项），导致部分交互为纯内存修改、本地 localStorage 临时模拟或延时 mock：
  1. 账户资料（3 类）：昵称保存仅修改内存；头像首次读取/上传/重置仅操作本地存储；改密码仅做 350ms 假延时提示成功，且密码校验长度仅限制 6 位（后端契约要求 12~200 位）；
  2. AI 设置（3 类）：Provider 自由输入未对齐服务端 `AiProviderType` 枚举；模型自动检测使用本地硬编码数组；连接测试延时 600ms 后直接提示成功；
  3. 数据与状态（4 类）：数据导出仅包含知识块，遗漏任务排期；“清理本地缓存”与敏感区“清除本地离线数据”共用同一个仅清理少量 localStorage 的实现；注销账户仅弹提示未调后端；同步状态为静态固定文案。
- **修复与真实链路打通**：
  1. 账户资料全量接入真实后端：
     - 昵称：`saveNickname()` 接入 `PUT /api/auth/me`（携带 `baseVersion` 与 `displayName`），处理 409 版本冲突与 store 状态更新；
     - 头像：接入 `GET /api/auth/me/avatar` 获取真实 Blob 并转为安全可释放的 Blob URL 展示，上传接入 `POST /api/auth/me/avatar`（带类型与 ≤5MB 校验），重置接入 `DELETE /api/auth/me/avatar`，彻底清理本地 localStorage 模拟；
     - 改密：升级为 12~200 位安全校验，接入 `PUT /api/auth/password`（携带 `baseVersion`、`currentPassword`、`newPassword`），正确处理原密码错误并关闭弹窗；
  2. AI 设置真实规范化与探测测试：
     - Provider 归一化：通过 `normalizeProvider` 将非枚举输入自动映射为 `OPENAI_COMPATIBLE`，识别 DeepSeek 与 SiliconFlow；
     - 模型自动检测：接入 `GET /api/ai/settings/{provider}/models`，依据用户已保存的云端密钥探测真实可用候选模型并渲染托盘；
     - 连通性测试：接入 `POST /api/ai/settings/{provider}/test-connection`，依据服务端聊天请求返回 `{ reachable, chatModel }` 反馈；
  3. 数据与状态真实闭环：
     - 完整数据导出：`handleExportData()` 整合拉取 `knowledgeStore.recentBlocks` 与 `taskStore.allTasks`，结构化输出包含元数据、知识库块与排期任务的完整 JSON；
     - 两级清理分层解耦：“清理本地缓存”仅清理视图与临时会话日志；敏感区“清除本地离线数据”绑定独立高危处理器 `handleResetOfflineData()`，高危确认后重置离线存储并标记 `syncStore.resetRequired = true` 触发全量同步；
     - 注销账户：接入 `DELETE /api/auth/me`（提交密码），处理 HTTP 202 Accepted 响应，清空本地会话并跳转登录页；
     - 响应式同步状态：`sync_status` 动态关联 `syncStatusText`（响应 `isSyncing`、`lastSyncError`、`resetRequired`）及异常样式。
- **验证与门禁**：新增定向测试 `scripts/r4-profile-live-links.test.mjs`，PC 全量回归测试 `npm.cmd run test:r4-pc`（406/406 全量通过），`npm.cmd run type-check` 与 `git diff --check` 全部退出 0。真实外部服务与 GUI 行为仍待验收。

### 2026-09-24 PC 个人中心与系统设置（Profile / Settings）纵向挤压塌陷修复与满屏布局重构（已修复）

- **现象与根因**：设置页面（`Profile/index.vue`）中，右侧面板 `.studio-right` 声明了 `height: 100%; display: flex; flex-direction: column;`。在没有声明 `flex-shrink: 0` 的情况下，Flex 容器会将所有设置分组卡片（`.settings-group`、`.danger-zone`、`.logout-group` 等）纵向强行挤压缩放以试图塞进 100% 视口高度中，配合卡片自带的 `overflow: hidden`，导致设置组被挤压压扁成细缝，内部表单与按钮被大面积截断。
- **修复**：
  1. 将 `.studio-right` 布局从 `display: flex; flex-direction: column` 调整为块级自适应纵向流动 `display: block;`，同时为子元素配置 `flex-shrink: 0;`；
  2. 为设置组 `.settings-group`、`.danger-zone`、`.logout-group`、会话行 `.session-row` 与操作行 `.settings-row`、`.danger-row` 配置 `min-height: 52px` 坚实保底约束，确保每一行均有舒适呼吸空间，视口超高时由外层容器触发丝滑垂直滚动；
  3. 左侧数据透视面板 `.studio-left` 同步添加 `.studio-left > * { flex-shrink: 0; }`，杜绝任何视口高度收缩下的组件挤压；
  4. 保持纯文字排版（右侧无多余图标胶囊）与 100% 满屏网格自适应架构。
- **验证与边界**：PC 全量回归 `npm.cmd run test:r4-pc`（403/403 全量通过）、`npm.cmd run type-check`、`git diff --check` 全部退出 0。真实 GUI 视觉体验仍待人工验收。

### 2026-09-24 PC 资产库（Asset Studio）知识块与任务编辑排版重构、标签精简与任务所属学科自选（已修复）

- **现象与根因**：资产库（`Asset/index.vue`）中栏编辑区存在排版体验与交互限制缺陷：
  1. 顶栏与输入框标题重复：顶栏展示 `<h1 class="detail-name">{{ selected.name }}</h1>`，而下方正文直接出现 `<input v-model="selected.name" />`，用户输入时上下两处同时闪烁变化；知识块甚至同时存在两个“保存修改”按钮；
  2. 知识块顶部标签杂乱：正文卡片顶部渲染多余的 `# {{ tag }}` 徽标，影响整体极简禅意阅读体验；
  3. 任务学科不可变更：任务属性中所属学科仅为静态文本展示，无法在编辑任务时更换所属学科；
  4. 画布碎片化：标题输入框浮于 `#F7F2EB` 大底板上，而正文文本域却包裹在小卡片中，形成视觉割裂；
  5. 任务属性排列扁平：截止日期与时长简单堆叠，缺乏清晰的小节划分，与任务备注混在一起。
- **修复**：按现代沉浸式笔记与工坊标准重构：
  1. 顶栏去重自适应：文件呈现只读信息，知识块呈现纯净路径（`知识库 / 学科`）、字符统计与单侧保存主按钮，任务呈现状态切换胶囊（待处理/已完成）、截止日期与保存按钮；
  2. 移除知识块顶部标签：彻底移除纸张卡片顶部多余的 `# {{ tag }}` 徽标，保留温和学科胶囊；
  3. 任务所属学科与预计用时自选与圆角禅意下拉栏：在任务属性工坊中，将所属学科与预计用时均升级为定制禅意圆角下拉选择器（`<el-select class="zen-select" popper-class="zen-select-popper">`），触发栏具备 `border-radius: 9999px` 胶囊圆角与 `#FAF7F2` 底色，浮层具备 `border-radius: 16px` 与选项 `10px` 圆角；排查并解决 Vue scoped CSS 编译剥离 `html.dark` 导致暗色底色泄漏的问题，彻底恢复温润宣纸色 `#FAF7F2`；在 `useTaskStore.ts` 的 `updateTaskDetails` 中支持 `subjectId` 字段流转与离线持久化同步，用户可在编辑任务时自由切换归属学科并持久化保存；
  4. 统一温润纸张画布（`.editor-paper-card`）：知识块与任务统一置于 `#FAF7F2` 宣纸卡片中（居中 860px），配备 20px 圆角与立体微阴影；
  5. 任务属性工坊（Property Panel）：Notion/Linear 风格属性网格，集成截止日期选择器、预计用时下拉选择与所属学科展示，并通过导轨与小节标签清晰隔开下方“任务备注与详细说明”编辑框；
  6. 沉浸式滚动条全量隐藏：全面清理中栏滚动容器（`.middle-content-scroll`）、左右侧栏容器、笔记/任务备注文本域以及下拉面板（`.zen-select-popper` 的虚拟滚动轨道 `.el-scrollbar__bar`）的滚动条视觉露出，保留自然流畅鼠标滚轮与触控滚动，彻底消除突兀滑条。
- **验证与边界**：PC 全量回归 `npm.cmd run test:r4-pc`（403/403 全量通过）、`npm.cmd run type-check`、`git diff --check` 全部退出 0。真实 GUI 视觉体验仍待人工验收。

### 2026-09-24 PC 资产库（Asset Studio）温润配色全面对齐与关系星图拓宽（已修复）

- **现象与根因**：资产库页面（`Asset/index.vue`）中，右侧关系星图容器写死了内联 `style="width: 450px;"`，在宽屏下视觉偏窄，力导向图谱节点与小部件排布空间局促；子标题栏写死 `style="background: var(--color-bg-secondary);"` 破坏层级；同时页面残留老旧高饱和强调绿 `#7D9372`、卡片底板纯白 `#FFFFFF`，以及中间列 `.middle-content-scroll` 误用 `#EEEEEE` 导致中间容器出现底色断层。
- **修复**：严格对齐温润极简禅意配色方案与舒适度布局规范：
  1. 页面大底色维持 `#EEEEEE`（`--color-bg-secondary`）；
  2. 三栏容器底板（`.studio-left`、`.studio-middle`、`.studio-right-context`）统一为 `#F7F2EB`（`--color-bg-primary`），修复 `.middle-content-scroll` 的断层色差；
  3. 拓宽关系星图：清理写死的内联样式，将 `.studio-right-context` 宽度由 `450px` 拓宽至 `540px`（+90px，拓宽 20%），为节点和交互提供充裕画幅；
  4. 卡片、输入框与模态框底色统一为温润米白宣纸色 `#FAF7F2`（`--color-bg-tertiary`），并添加微阴影；聚焦轮廓统一步伐为 `#8B9A6E` 发光；
  5. 主按钮与保存按钮应用 `#8B9A6E` 渐变立体投影，次级按钮使用 `#FAF7F2`；
  6. 修复 `KnowledgeGraph.vue` 中 `down` 交互状态缺失 `pointerId`、`startX`、`startY` 导致的类型报错。
- **验证与边界**：PC 全量回归 `npm.cmd run test:r4-pc`（401/401 全量通过）、`npm.cmd run type-check`、`git diff --check` 全部退出 0。真实 GUI 视觉体验仍待人工验收。

### 2026-09-24 PC 任务编排中心（Timeline）主内容与卡片背景层级混淆、待安排栏偏窄及控件缺乏阴影（已修复）

- **现象与根因**：任务编排中心（`Timeline/index.vue`）中，日视图时间轴卡片 `.slot-task` 此前使用了 `var(--color-bg-primary)`（#F7F2EB），而其承载的列容器 `.timeline-column` 同样为 `#F7F2EB`，造成任务卡片与背景底板同色、毫无视觉层次深度；周视图概览行 `.weekly-overview-row` 与周任务卡片使用微弱的 `rgba(255, 255, 255, 0.02)`，在浅色模式下接近透空；同时部分组件（如新建弹窗、输入框、时长滑块）还残留硬编码的 `#7D9372` 与纯白背景。此外，日视图三栏布局中右侧「待安排任务块」（`.tasks-column`）固定宽度为 340px，扣除内边距与拖拽手柄后，卡片内部可用宽度偏窄，长任务名与学科标签、知识关联胶囊和截止日期徽标排版较为拥挤。另外，页面各级次级按钮（`.btn-secondary`、`.day-btn`、`.btn-auto-delay`、`.task-btn-cancel`、`.view-toggle`）以及各卡片（`.stat-pill`、`.weekly-column`、`.subject-capsule-item`）缺少柔和立体阴影，导致在低饱和温润底板上略显生硬或扁平。
- **修复**：严格执行极简禅意三层级配色系统、空间舒适度与分层立体投影调优：
  1. 页面底色：`.timeline-page` 维持 `#EEEEEE`（`--color-bg-secondary`）；
  2. 主内容底板：顶栏 `.timeline-header-card`、日视图列 `.timeline-column`、待安排队列 `.tasks-column`、周视图列与坞、看板列统一使用 `#F7F2EB`（`--color-bg-primary`）；
  3. 待安排任务栏扩展：`.timeline-body` 列宽定义由 `280px 1fr 340px` 调整为 `280px 1fr 400px`，右侧待安排块宽度扩增 60px，为任务卡片提供从容舒展的信息承载空间；
  4. 全卡片与模块底部立体阴影：`.slot-task`、`.weekly-task-card`、`.pending-card`、`.kanban-task-card`、`.weekly-column`、`.stat-pill`、`.subject-capsule-item`、`.weekly-overview-row` 等全量配置双层立体微阴影（如 `box-shadow: 0 4px 14px -2px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03)`），并在 hover 时伴随轻微 `translateY(-1~2px)` 放大扩散高质感外溢投影；
  5. 全按钮底部立体阴影：主按钮 `.btn-primary`、次级按钮 `.btn-secondary`、日期切换按钮 `.day-btn`、视图切换外壳 `.view-toggle`、弹窗取消与保存按钮、时长条及关闭/删除小圆钮均补齐微阴影与高亮悬浮投影。
- **验证与边界**：PC 全量回归 `npm.cmd run test:r4-pc`（401/401 全量通过）、`npm.cmd run type-check`、`npm.cmd run build` 及 `git diff --check` 全部通过。真实 GUI 视觉体验仍待人工验收。

### 2026-09-24 PC 学科中心页与总览主内容与卡片背景层级混淆（已修复）

- **现象与根因**：此前在对齐卡片宣纸底色（#FAF7F2）时，将 `SubjectHall/index.vue` 的主内容大容器（`.hall-content`）及 `OverviewSummaryView.vue` 根容器也一并设为了 `#FAF7F2`。由于卡片模块（`.subject-card`、`.add-card`、`article`）同样使用 `#FAF7F2`，导致大容器底色与内部卡片颜色一致，失去了层次对比，使得卡片无法在燕麦米白底板上轻柔浮起。
- **修复**：严格对齐三层级配色系统：页面大背景使用 `#EEEEEE`（`.hall-container`、`.workspace-container`），主内容大容器使用 `#F7F2EB`（`.hall-content`、`.overview-summary-view`、`FilePreview` body），卡片模块与纸张底板使用 `#FAF7F2`（`.subject-card`、`.add-card`、`.search-input`、`article`、`.file-preview-renderer-shell`）。
- **验证与边界**：PC 全量回归 `npm.cmd run test:r4-pc` 401/401 全量通过，`npm.cmd run type-check`、`npm.cmd run check:subject-icons`、`npm.cmd run check:subject-workspace` 及生产打包均退出 0。真实 GUI 视觉体验仍待人工验收。

### 2026-09-24 PC Asset 关系星图与节点预览（代码更新，GUI 验收开放）

- **处理**：关系星图使用对称互斥力、关系弹簧、弱重力和速度阻尼；确定性初始坐标保证相同输入可复现，初始模拟最多 180 帧。同范围刷新保留现存节点位置和镜头，切换全局/学科范围重新适配。鼠标/触控/触控笔均可用 Pointer Events 拖动任意节点或平移画布；手势超过阈值后暂停初始布局，正在拖动节点锁在指针位置，关联邻居实时受弹簧力推动，每段响应最多 36 帧并在收敛时提前停止，释放后仅运行最多 30 帧低强度松弛，避免大幅回弹；用户摆放在同范围更新中保留。点击 Source/KnowledgeBlock 选择资产树对应项并显示中栏预览/编辑器，Home 的 `open-block-detail` 继续有效。
- **自动验证**：力计算、拖动邻居响应与释放松弛专项 6/6，PC 全量回归 403/403，类型检查、生产构建及 `git diff --check` 均退出 0。构建有模块外置、dynamic import、插件耗时和大 chunk 警告；实际浏览器/Tauri GUI 行为仍待验收。
- **P2-PC-Asset-Graph-GUI-Validation（开放）**：自动检查不证明浏览器/Tauri 中图谱分布、预览加载或鼠标交互效果。关闭条件：在 Asset 页面验证全局与学科图谱、缩放和平移、节点拖动，以及文件预览和知识块编辑跳转。

### 2026-09-24 不同时长的紧邻任务无法在原共同窗口内交换（代码修复）

- **根因**：PC 在请求前按“互换开始时间”预检，时长不同的紧邻任务会被判为重叠；Server 原交换也只互换开始时间，未表达两项任务在原共同窗口内交换先后顺序。
- **处理**：Server 对原区间首尾紧邻的两项任务紧凑换序，并在原事务内核对完整区间；PC 直接采用服务端返回的两项时间。非紧邻交换沿用原规则。
- **验证边界**：PC 全量回归 397/397、类型检查和构建通过；Server clean 聚焦 3/3。本机 backend 单独重建重启后 health/readiness HTTP 200、Flyway 23；db/minio 容器未变化。GUI 拖放与认证业务请求尚未验收。

### 2026-09-24 Timeline 主体落点错误移动目标和后续任务（代码修复）

- **根因**：主体 drop 按鼠标纵向偏移提交目标任务内部时间，服务端普通插入逻辑把目标及后续冲突任务向后顺延，表现为先交换再顺延。
- **处理**：主体落点显式传目标任务 ID；服务端只把被拖任务放到目标结束后的首个半小时槽，完整区间冲突则拒绝且不改任何排期。普通空白槽位和顶部交换各保留独立语义。
- **验证边界**：PC 完整回归 397/397、类型检查和构建通过；Server 聚焦 5/5、OpenAPI artifact 与双端 SDK 生成检查通过。本机 backend 单独重建重启后 healthy、readiness UP，Flyway V23 成功，db/minio 容器未重建。真实 GUI 拖拽和认证后的业务请求仍待验收。

### 2026-09-24 Timeline 日视图长任务导致后续时间刻度被隐藏或断档（已关闭）

- **现象与根因**：此前为适应长任务卡片在 flex 布局中撑高高度，在 `.time-slot` 上配置了 `v-show="!isSlotCovered(slot.time)"`，导致长任务后续时段的整行时间槽被 `display: none` 隐藏，左侧时间标尺的刻度（如 09:00、09:30）断档消失。
- **修复**：移除 `.time-slot` 的行级隐藏，固定完整呈现 08:00–22:30 所有 30 个半小时刻度槽位；刻度行固定为 80px 高度（防压缩）；任务卡片改为绝对定位层并依据时长跨越网格（`height = slots * 80 + (slots - 1) * 4 - 6`px）；卡片顶部继续处理交换，主体与普通槽位继续处理插入顺延；完善长任务覆盖区间的完成任务守卫。
- **验证与边界**：PC 全量回归 397/397、`npm.cmd run type-check`、`npm.cmd run build` 及 `git diff --check` 全部通过。自动验证不代替真实浏览器拖拽交互的人工视觉验收。

### 2026-09-23 Server 将截止时间错误地作为排期门禁（已修复）

- **根因**：PC 与当前状态文档定义 `dueAt` 为纯提醒/排序字段，但 `TaskService.validateSchedule()` 与数据库 `ck_tasks_schedule_order` 仍拒绝 `scheduledAt > dueAt`，导致 REST 拖放和 Sync 更新返回 `VALIDATION_FAILED`。
- **修复**：服务端 create/update/swap/schedule-insertion 不再比较截止时间与排期；新增 V23 迁移移除该 CHECK，不改写现有 Task。区间冲突、完成任务固定和插入窗口限制保持有效，截止时间原值保留。
- **验证边界**：`CoreDomainServiceTests` + `CoreDomainControllerTests` fresh H2 聚焦 26/26，覆盖截止时间已过时的更新、交换和插入，并保留交换重叠/插入越窗的原子拒绝测试；`mvnw -B -ntp -DskipTests package` 退出 0。真实 PostgreSQL migration 与 Docker 部署尚未执行；V18 早先清空的 scheduledAt 不会由 V23 恢复。

### 2026-09-23 排期插入接口运行镜像过旧（已恢复）

- **现象与证据**：Timeline 调用 `POST /api/tasks/schedule-insertions` 时 backend 多次记录 `HttpRequestMethodNotSupportedException`；通用异常处理器返回 `INTERNAL_ERROR` 与 `An unexpected error occurred`。运行容器使用 2026-09-20 创建的旧镜像；当前 `TaskController` 已声明该 POST 路由。
- **处理**：重建并只重启 backend。首次构建暴露 Windows 工作树的 `mvnw` CRLF shebang 无法被 Linux `/bin/sh` 执行；Dockerfile 加入 LF 规范化步骤后构建成功。
- **关闭证据与限制**：backend 新容器和镜像 ID 均为 `sha256:cbf0b32b…`，Created 2026-09-23，health `healthy`，readiness HTTP 200。OpenAPI artifact 已含 POST；运行 `/v3/api-docs` 返回 404，因 Compose 默认 prod profile 明确关闭 springdoc。GUI 拖动和认证请求尚未复验。

### 2026-09-23 Timeline 插入长任务后仍会与后续任务重叠（代码路径已收口）

- **现象与根因**：此前排期按完整时长检测冲突后直接拒绝；任务卡片顶部和主体仍共用槽位 drop，无法表达“顶部交换、其他位置插入顺延”。
- **修复**：日视图顶部交互栏单独处理原子交换，任务主体和普通槽位调用服务端单事务插入。服务端将落点任务及连续冲突的后续任务向后对齐至半小时槽，保留不冲突的空档；任一版本、固定任务或窗口校验失败时整组回滚。截止时间仅用于提醒与排序，不阻止晚于 `dueAt` 的排期。前一日开始的跨日任务不进入顺延链，发生区间冲突时拒绝，避免覆盖未同步的历史日任务。
- **验证与边界**：PC 完整回归 395/395、type-check、build 及 OpenAPI/双端生成类型检查脚本通过；Server 服务/控制器/OpenAPI 定向测试最终 32/32。Mobile type-check 仍有本轮未改的 `assetUpload.ts:47` 缺 `clientImportId` 错误；Server 全量 testCompile 被本机 IDE 生成的错误 class stub 阻断。真实 PostgreSQL、跨设备和 GUI 验收未做；已有重叠数据不自动改动。

### 2026-09-23 PC 与 Server 排期任务区间可重叠（已关闭）

- **根因**：Timeline 以半小时起始槽渲染任务，但排期写入路径未用任务时长计算结束时间。相同起始槽检查无法阻止长任务覆盖后续任务；按天排期仅排除重复开始小时；修改已排期任务时长或新建时直接带 `scheduledAt` 也能绕过槽位检测。
- **修复**：在 `taskViewRules.ts` 统一按半开区间 `[scheduledAt, scheduledAt + durationMinutes)` 比较；在本地创建/更新边界校验新建、排期、改期、时长变化及取消后重新激活；本端排期相关操作由 Store 队列串行并在本地 repository 初始化后复核；按天排期寻找可用 30 分钟槽。未排期任务落入占用槽直接拒绝，避免两次提交造成旧排期被移除；两个已排期任务仍由服务端原子换位，且调用前验证双方换位后的区间互不冲突并与其它排期均不重叠。
- **服务端收口**：TaskService 对 REST 与 Sync 共用的 create/update/restore/swap 加入同用户区间校验；事务内先锁 User，再按 Subject→Task 既有顺序加锁，阻止跨学科并发写入同时通过冲突检查。空时长按 30 分钟，首尾相接允许；换位同时检查双方新区间及第三方任务。
- **限制**：不会自动修复已有重叠排期；修复会拒绝与其冲突的新安排，必须人工调整到无冲突时间。真实 PostgreSQL 并发、跨设备同步及 GUI 行为尚未验收。
- **关闭证据**：PC 排期、任务视图与 DTO 映射定向回归 40/40（含远端 null/无效时长到区间判断的联动验证）、完整 PC 回归 392/392、`npm.cmd run type-check`、`npm.cmd run build` 与 `git diff --check` 均退出 0；Server fresh 聚焦测试 29/29（含 REST、Sync、并发）与 diff-check 退出 0。未执行 GUI/业务验收；已有重叠排期未自动修复。

### 2026-09-23 学科大纲保存、大纲草稿生命周期、首页移出日程按 ID 操作与测试脚本一致性收口

- **1. 手工保存学科大纲丢失小节数据与文件关联被覆盖（已关闭）**：
  - 现象：`initSubjectOutlineFromExisting` 只加载每小节的第一个 `sourceId`，忽略 `summary` 和 `locator`；保存时 `saveCurrentOutline` 硬编码设置 `summary: null` 且仅取单文件 `sourceIds`；更严重的是，原先遗留的原型函数 `syncOutlineFileLinks()` 在 `onMounted` 与 `watch(subjectId)` 中按章节顺序无条件重设每节的文件 ID，导致保存时写入的关联全被轮转覆盖。
  - 修复：扩充 `OutlineSection` 类型包含 `summary`、`sourceIds` 及 `locator`；载入时深拷贝完整 `sourceIds` 数组、保留已有 `summary` 与 `locator`；保存时优先保留小节现有 `summary`、`sourceIds`（非空优先）与 `locator`；支持 UI 为每个关联文件展示文件胶囊并支持分别解除关联；**彻底移除 `syncOutlineFileLinks()` 及其在挂载和学科切换时的调用**，禁止任何顺序伪轮转重设文件 ID。
- **2. 切换学科沿用上一个学科的大纲草稿与异步竞态（已关闭）**：
  - 现象：`watch(subjectId)` 切换学科时清空了 `subjectOverviewRecord` 与 `fileOverviewRecords`，但未清空 `subjectOutline` 及相关章节/小节草稿，导致目标学科若无大纲时继承旧学科草稿；且原先等待结束聊天会话（`await startFreshChatSession()`）发生在前，异步等待期间保存按钮仍可点击，而 `saveCurrentOutline` 读取的已是新 `subjectId`，存在把旧草稿写入新学科的竞态窗口。
  - 修复：在 `watch(subjectId)` 进入时**第一行立即同步清空** `subjectOutline.value = []`、`fileOutlineDrafts.value = {}`、草稿字段及总览记录，彻底消除异步等待期间的数据残留；在 `saveCurrentOutline` 中增加 `if (!subjectOutline.value.length) return` 及 `isSavingOutline` 防重复保存守卫；在目标学科缓存刷新后，若编排器处于开启态，按新学科数据安全初始化。
- **3. 首页“移出日程”可能操作同时间槽另一任务及失败无用户提示（已关闭）**：
  - 现象：`Dashboard/index.vue` 移出日程只传递 `slotTime` 给 Store，`unscheduleTask` 从 `timeSlots` 获取该时间槽的首项任务；若同槽有多项任务，可能移错任务，或者首项若已完成则抛出异常导致点击的任务无法移出；且非“已完成任务固定”的异常仅写入控制台，无可见错误提示。
  - 修复：`useTaskStore.ts` 的 `unscheduleTask(idOrSlotTime)` 升级为优先通过 `findTask(idOrSlotTime)` 按任务 ID 查找目标任务，未命中时回退按槽位查找；`Dashboard/index.vue` 的 `handleRemoveSchedule` 直接传递 `task.id`，并在发生异常时通过 `ElNotification` 区分弹出“已完成的排期任务已固定”警告或具体失败原因错误提示；`Timeline/index.vue` 拖动至待办时优先传递 `draggedItem.value.taskId`。
- **4. 测试数据注入脚本 companion 账号一致性问题（已关闭）**：
  - 现象：`scripts/seed-test-account.mjs:40` 额外注册第二个 companion 账号，导致数据库预期从 `users=1` 变成 `users=2`。
  - 修复：删除 `seed-test-account.mjs` 中注册第二个账号的冗余逻辑，保持全流程仅注册并注入单一测试账号 `pc-ai-test-20260918@example.com`，与 `docs/current/Status.md:3` 及 `TestAccountDataResetAndSeed.md` 预期一致。
- **5. 切换学科期间 AI 请求短暂携带旧文件 ID（已关闭）**：
  - 现象：切换学科时，路由变化使得 `subjectId` 立即切为新学科，而 `selectedFileId` 原先直到异步数据全部加载完成后才更新；在此等待窗口内若触发发送消息，AI 请求会携带新学科 ID 与旧学科文件 ID；重试发送（`retryChat`）也可能残留旧文件 ID。
  - 修复：在 `watch(subjectId)` 进入的第一行同步调用 `chatStore.abortStream()`、`chatStore.clearActiveConversation()`、`selectedFileId.value = null`、`selectedAiSourceIds.value = []` 及 `sourceStore.clearActiveSourceFiles()`，阻断旧会话与旧状态；并在 `sendChat`、`retryChat`、`sendSelectionQuestion` 和 `saveKnowledgeBlock` 中对关联文件做强制归属校验：文件 ID 必须属于 `activeSourceFiles` 且属于当前 `subjectId`，否则过滤置空，彻底杜绝跨学科文件 ID 渗透。
- **6. 移出日程时不当捏造并持久化 fake dueAt（已关闭）**：
  - 现象：`useTaskStore.ts` 的 `unscheduleTask` 在移除 `scheduledAt` 时，曾试图通过 `fallbackDueAt` 把任务原有排期时间或未来 24 小时作为 `dueAt` 写入任务模型，导致未设置截止日期的任务在移出日程或槽位换位被替换时被悄悄创建并持久化了虚假截止日期。
  - 修复：完全移除 `unscheduleTask` 中捏造 `dueAt` 的逻辑，严格只清除 `scheduledAt` 与 `startTime`，保持任务原有的 `dueAt`（无论是 null 还是已有日期）完全不变；首页看盘的待办展示由 `Dashboard/index.vue` 内部纯 UI 计算属性 `filteredPendingTasks` 进行合集投影（包含 `pendingTasks` 与无排期的活跃任务 `unscheduledActive`），不污染 Store 和后端数据；新增 `r4-task-store-schedule.test.mjs` 测试守卫断言禁止在 `unscheduleTask` 中注入捏造 deadline。
- **7. 截止日期（dueAt）门禁解耦与 DDL 视觉提醒改造（已完成）**：
  - 需求与根因：此前业务规则 `isSchedulableTask` 将 `Number.isFinite(dueTimestamp)` 作为任务进入待办与排期队列的强制硬性前置条件，导致用户未设截止日期的任务无法排期，且在 `recoverOverdueTasks` 中未排期任务一旦逾期便会强制被置为 `dueAt: null` 抹除用户真实设定的截止日期。
  - 改造与修复：
    1. 在 `taskViewRules.ts` 中解耦 `isSchedulableTask`，只要状态非 completed/cancelled 且未被排期（`!task.scheduledAt`）即视为可排期待办，无需强制持有 `dueAt`；
    2. 在 `useTaskStore.ts` 中移除 `recoverOverdueTasks` 清除未排期逾期任务 `dueAt` 的操作，永久保留真实 DDL；
    3. 在 `Dashboard/index.vue` 待办清单标题行最右侧增加「前往排期」微胶囊按钮（带 `<IconChevronRight>`），待办项卡片增加 `todo-due-badge`，支持格式化显示截止日期并在逾期时显示低饱和暖红醒目标记；
    4. 在 `Timeline/index.vue` 待安排任务卡片中增加 `pending-due-badge`，同步提供 DDL 显示与逾期高亮；
    5. 更新 `r4-task-view-rules.test.mjs` 与 `r4-task-store-schedule.test.mjs` 单元测试，守卫断言无 DDL 任务可排期、真实 DDL 不抹除、排期操作不造假。
- **8. 切换学科时大纲保存竞态、旧流程覆盖与未重置总览错误过期状态（已关闭）**：
  - 现象：
    1. A 学科保存大纲期间切到 B，保存完成后仍会把 A 的 record 写入当前页面，触发大纲监听器将 A 的大纲载入 B 的草稿；
    2. 连续快速切换学科时，旧的异步加载流程在多个 await 恢复后没有校验当前路由 ID，导致旧学科被重新激活、旧文件被选中或以旧学科启动阅读会话；
    3. A 学科生成失败或总览过期后切到 B，页面未重置相关错误与标记，继续显示 A 的错误提示或过期标记。
  - 修复：
    1. `saveCurrentOutline` 保存成功与失败捕获后严格校验 `if (subjectId.value !== targetSubjectId) return`，阻止跨学科写回与弹窗；
    2. `onMounted` 与 `watch(subjectId)` 引入递增 `currentSubjectSwitchGen` 与 `subjectId.value !== newId` 守卫，在每个 `await`（会话结束、文件加载、总览初始化、知识块加载等）返回后立即检查，失效则直接退出；并在 watcher 第一时间切换 `subjectStore.setActiveSubject(newId)`；
    3. 在 `watch(subjectId)` 同步清空入口中补齐重置 `isSubjectOverviewStale.value = false`、`subjectOverviewManualError.value = null`、`fileOverviewManualErrors.value = {}`、`subjectOverviewGenerating.value = false` 与 `generatingFileIds.value = new Set()`，彻底清除上一个学科的残留错误与过期标记；
    4. `r4-subject-overview-ui.test.mjs` 新增针对 `targetSubjectId` 守卫、`switchGen` 检查以及错误与过期状态同步重置的自动化断言。
  - OPTIONAL 说明：
    - 旧学科图标键：用户确认后续统一清理历史旧契约数据，无需在前端做历史别名回退扩展。
- **10. 切换学科旧阅读会话清理误清空新活动会话 ABA 竞态（已关闭）**：
  - 现象：`SubjectWorkspace/index.vue` 在旧请求失效后调用 `endActiveSession()`；该方法等待删除完成后，在 `useChatStore.ts` 的 `finally` 块中无条件清空当前活跃会话 ID。若新会话在此期间成为活动会话，也会被一同清空置 null。
  - 修复：
    1. 在 `useChatStore.ts` 的 `endActiveSession()` 中记录 `targetSessionId = session.id`，并在 `finally` 块中增加守卫：仅当 `activeSessionId.value === targetSessionId` 时才清空 `activeSessionId` 与会话数据；若已有新会话接管，绝不误杀；
    2. 在 `useChatStore.ts` 中新增并导出 `endSessionById(sessionId: string)`，若被清理的会话非当前活动会话，仅安全在后台删除并释放该会话，完全不触碰当前的活跃会话状态；
    3. 在 `SubjectWorkspace/index.vue` 的 `selectFile`、`onMounted` 与 `watch(subjectId)` 中，获取 `const readingSessionId = await startReadingSession(...)` 后，若代次或路由失效，精确调用 `endSessionById(readingSessionId)` 清理刚刚创建的具体会话，杜绝全局会话串扰；
    4. 在 `r4-subject-overview-ui.test.mjs` 与 `r4-reading-session.test.mjs` 中补充针对 ABA 会话清理守卫与精准会话 ID 终结的自动化测试断言。
- 自动证据：`npm.cmd run test:r4-pc` 387/387 全量通过；`npm.cmd run type-check`、`npm.cmd run build`、`npm.cmd run check:subject-workspace`、`npm.cmd run check:subject-icons` 及 `git diff --check` 全部退出 0。

### 2026-09-21 Server + PC 功能问题登记（附件 2–7，待核实）

来源：`Auralis_Server_PC_Function_Issues_2-7.md`。以下内容是用户报告及建议，不代表当前代码已确认存在，也不代表已完成根因定位或业务验收；各项应分别实施、验证和关闭，不合并为一次大重构。

#### P1

- **2. 删除 Source 后的 Chunk 仍可能占用 RAG TopK**：需核对 Source 软删除与 `source_chunks` active/generation 语义，以及 Retrieval 先取 TopK、后过滤 Source 的链路。关闭条件：删除后对应 chunk 不再参与 TopK；restore 后通过 reingest 生成的新 generation 可检索；删除其他 Source 不减少有效 Source 的 TopK/citation 名额。
- **3. PC 左下角同步/连接状态不能反映真实错误**：需核对 `useSyncStore`、Realtime 状态、问答错误和 `AppSidebar.vue` 的统一状态投影。至少覆盖已同步、同步中、离线、服务不可达、Realtime 重连中、同步错误，以及恢复连接并完成一次 Sync 后恢复已同步。
- **4. Overview 手动重新生成存在静默 no-op**：需核对 `OverviewGenerationService.regenerateFileOverview()` 的所有提前返回及调用方反馈。关闭条件：成功、Source 未 READY、网络错误、runtime/revision 不满足和 eligibility 失败均有明确结果/UI反馈；失败不无条件清空已有 Overview。

#### P2

- **5. `FilePreview` 可能重复触发加载**：需记录首次打开时每次 load 的触发原因，核对 watcher 与 projection hydration。候选 identity 为 user/device、asset、content revision 或 sha256；显示名称变化不应触发内容重新读取，asset/content revision 变化仍须正确重载，旧请求不得覆盖当前文件。
- **6. `DocumentProcessingStore` 仍暴露 Runner 直接入口**：需核对 `start(jobId)`、`resumePending()`、`retry` 及 UI 调用关系。目标是 UI 统一经 `SourceJobScheduler`，由其重新解析 Source/Asset/SHA256 并准备 metadata；重启 pending job 和 retry 也不得绕过该边界。
- **7. `SourceService` / Retrieval 存在 N+1 查询**：需核对 Source list/view 的逐条 Asset 查询及 Retrieval citation 中重复 `sourceService.get()`。优先采用 owner-scoped 批量查询和 `Map<UUID, Asset>` 组装；关闭条件包括查询数不随 Source 数量线性增长，且 SourceView 与 Retrieval/citation 语义不变。

登记时状态：仅完成问题登记，尚未修改代码、API、数据库或前端行为；后续实施状态与验证证据以紧随其后的同日更新为准。

### 2026-09-21 Issue 3/4 前端实现与自动验证收口

- **Issue 3（PC 同步/连接状态）**：已实现统一状态 projection，按错误、离线、Realtime 重连、同步中、已同步的优先级展示；同步/服务/问答错误保持可见，问答区域保留错误和重试入口。
- **Issue 4（Overview 手动重生成）**：已实现 `STARTED`/`SKIPPED`/`FAILED` 结构化结果及手动反馈；自动触发静默处理预期失败，不递归重试；失败或跳过保留已有 Overview 缓存，手动重试仍是绕过终态策略的入口。
- 自动证据：最终 focused 68/68；`npm.cmd run test:r4-pc` 382/382；`npm.cmd run type-check`、`npm.cmd run build`、`git diff --check` 均通过。日志仍有既有 SQLite experimental、Vite externalized/dynamic-import/chunk size 警告。
- 限制：上述仅证明代码和自动门禁；真实 WebSocket delivery、浏览器 online/offline 事件、Tauri/GUI 文件预览、真实 AI Provider 输出尚未验收。Issue 2 仍为计划未实现；Issue 5–7 仍按原登记待核实。本轮未修改 API 或数据库契约。

### 2026-09-20 Overview Reduce prompt compression：代码/自动验证完成，真实质量验收开放

- Task 1 已将 MAP 与 REDUCE 的内部 prompt 路由分离：MAP 行为未改变；非最终及最终 REDUCE 使用专用均衡压缩指令，规范化长度 843 字符，目标约 2500–3000 个序列化 JSON 字符。预算 `max_tokens=4608/6144`、intermediate `<=5200`、self-pair `<=12000`、no-progress、schema/alias/mode/locator 校验、分组/批次和 Subject/Source 隔离边界均未改变；API、数据库、Provider 安全和普通聊天/流式契约未改变。
- 自动证据：`.\mvnw.cmd -B -ntp '-Dtest=AiOverviewServiceTests,AiOverviewControllerTests,AiProviderContractTests,AiProviderResilienceTests' test` 退出 0，55/55（2+42+1+10），无 failures/errors/skipped；`.\mvnw.cmd -B -ntp -DskipTests test-compile` 退出 0；根目录 `git diff --check` 退出 0。测试日志中的 SpringDoc/JVM 警告及 Provider resilience failure/invalid-response 日志属于现有测试场景或运行提示，不构成失败。
- P1 外部验收仍开放：尚未完成真实 DeepSeek 样本的 Reduce 输出字符数、内容覆盖、JSON/schema 成功、延迟、token 使用和成本核对。自动测试只证明 prompt routing、文本约束和既有硬边界，不得写成真实 Provider 或业务质量已验收。

### 2026-09-18 测试注入排期间隔不足：时间轴任务块重叠（已定位）

- 根因：注入流程使用 45 分钟起始间隔，但任务时长包含 60/90 分钟；即使 `scheduled_at` 各不相同，任务块仍会在时间轴上相互覆盖。
- 修复：注入流程改为 2 小时起始间隔，并明确要求相邻排期的间隔不小于最大 `durationMinutes`。
- 当前状态：根因已定位并修正流程；当前 192 条活动排期已通过 API 重新写入，区间重叠为 0，最小空档为 30 分钟。
- 关闭条件：已满足测试注入数据层面的关闭条件；后续若真实文件或用户手工拖拽仍出现重叠，应另开前端时间轴布局问题，不再归因于本次测试注入。

### 2026-09-22 测试注入排期超出时间轴有效窗口：任务落在时间轴没有的区间（已定位并修正）

- 现象与影响：部分测试注入的任务虽然带有 `scheduledAt`，但在时间轴日视图或周视图中无法匹配到任何可见时间槽，导致排期任务在界面上不可见或无法操作。
- 根因分析：此前测试注入脚本采用全局简单累加（`$scheduleSlotIndex * 2`），未按日做时间窗口约束。当累加超过当天白天时段后，任务被分配到了凌晨（如 01:00、03:00、05:00）或深夜（23:00 之后），而系统前端时间轴的合法有效槽位固定为每日 `08:00 ~ 22:30`（半小时刻度）。落入该窗口之外的时间在时间轴上属于“时间轴没有的位置”。
- 修复方案：
  1. 更新测试数据注入规范与流程（`docs/operations/TestAccountDataResetAndSeed.md`），明确定义每日有效槽位（如 `08:30`、`10:30`、`14:00`、`16:00`、`19:00`、`21:00`）；
  2. 任务排期按日严格循环约束在有效窗口内（每天最多 6 项），超出容量自动滚动至下一天白天，严禁排入 08:00 之前或 22:30 之后的无效时间；
  3. 任务开始时间严格对齐到时间轴半小时槽位。
- 关闭条件：测试注入脚本已增加白天时段与槽位合法性约束，所有注入排期均可落在时间轴的有效可视槽位中；关闭该测试数据注入问题。

### 2026-09-18 release/stability 非阻塞测试项

以下场景尚未取得明确逐项执行记录，继续作为发布与长期稳定性测试项保留，但不再作为 Local Asset Store 改造的未完成任务：

- 双设备真实收敛
- 低磁盘空间
- MinIO 故障注入
- 长时间稳定性测试

MinIO 实际同步主链路此前已人工验证；本轮真机验收覆盖本地文件仓库主要流程、文件学科归属、Subject 删除生命周期、重启/强杀及异常恢复，基本未发现问题。上述未逐项执行的 release/stability 测试不得写成已验证。

### 2026-09-17 修复点 1：PC 前端实时解析状态展示缺失，待沿数据链路定位

- 现象：前端不再显示文件实时解析/处理状态。
- 排查边界：`Source`、`ParsedDocument`/`DocumentProcessingJob`、本地 processing Store/事件订阅、状态组件和 Tauri 实际回调；先确认状态是未产生、未映射、未订阅，还是仅 UI 未消费。
- 当前结论：仅登记为待处理问题，尚未修改代码，也未进行真实 Tauri GUI 验收；不得将现有自动构建通过写成该问题已修复。

### 2026-09-17 修复点 2：AI 多文件提问必须改为用户显式选择

- 现状问题：AI 功能会静默调用其他文件，用户无法明确控制本次提问使用哪些资料。
- 目标交互：在输入栏左侧增加 `+` 按钮；用户点击后选择一个或多个其他文件，再将所选文件与当前文件/当前上下文一起提问。
- 约束：未主动选择时不得静默引入其他文件；选择状态应在输入栏中可见、可移除，并在发送请求时传递明确的 Source ID 列表。
- 2026-09-17 登记时仅为待实现需求；2026-09-26 已完成 UI、Store、API 请求及 Server 检索范围的代码修复与定向验证，真实 GUI/Provider 验收仍开放，见本文件顶部最新记录。

### 2026-09-17 修复点 3：预览重复加载与错误态位置异常

- 现象一：文件预览刚开始时疑似触发约 2–3 次加载，需要确认是组件挂载、文件 URL/Blob 更新、`watch` 或重试逻辑重复触发。
- 现象二：预览失败后的错误信息没有位于预览栏中间，影响错误态的可见性和布局一致性。
- 排查范围：`FilePreview`、SubjectWorkspace 的预览状态/事件链、文件输入解析和相关 `watch`/生命周期；需分别记录每次加载触发原因与错误态容器尺寸/定位规则。
- 当前结论：仅登记现象，尚未修改加载逻辑或错误提示布局，也未进行真实 GUI 验收。

### 2026-09-17 修复点 4：后端连接失败缺少状态反馈

- 现象一：后端不可连接时，问答请求没有向用户显示失败或离线提示。
- 现象二：左下角连接/同步状态没有随后端连接失败发生变化，用户无法判断当前是否在线或请求是否可用。
- 排查范围：API/HTTP 错误归一化、问答发送与流式错误回调、连接/同步 Store 状态传播、左下角状态组件及网络恢复后的状态重置。
- 目标：连接失败应形成明确的全局状态；问答失败应在对话区域显示可理解的错误并结束 loading/streaming 状态；恢复连接后状态应可自动恢复。
- 当前结论：仅登记现象和目标，尚未修改代码，也未进行断网/恢复网络的真实 GUI 验收。

### 2026-09-18 修复点 5：删除学科级联与统一数据库锁协议已完成代码收口

- 现象：直接删除学科后，相关文件、知识块、任务、解析/总览数据或本地受管文件可能继续存在。
- Server 实现：Subject 删除在同一事务内软删除所属 Source、KnowledgeBlock、Task、Relation 并写既有 DELETE change-log；创建、恢复、移动、Task swap 与 Relation mutation 统一经薄层 `SubjectLockCoordinator`，按 UUID 排序锁 Subject，再锁并重读资源、重校验归属和 active 状态。禁止 Resource → Subject 的反向锁序。
- PC 实现：父 `SUBJECT/DELETE` 是崩溃恢复标记；本地级联围栏子投影、未决 outbox、处理任务和 Overview。未决/推送中保留 draft 与 bytes；APPLIED 后才终结 draft 并按最后 Source 引用清理 Asset。拒绝时父恢复、mutation resolution 与 `reset_required=1` 同事务持久化，snapshot 失败后可在下一轮重试。
- 并发边界：draft release 与 Subject 围栏共用 owner/device lifecycle lock，并在锁内重读父 Subject 与未决 `SUBJECT/DELETE`，关闭“父标记已提交、子围栏未获取锁”时创建 `SOURCE/CREATE` 的窗口。
- 自动证据：Server 聚焦组合 40/40、PostgreSQL 锁集成 1/1、`clean test-compile` 通过；全量 287/288，唯一失败是既有 `TaskColorRemovalMigrationTests` 仍预期 Flyway 21 而仓库已应用 22。PC cascade 8/8、Store 12/12、`test:r4-pc` 342/342、`type-check`、build 通过；两轮 reviewer 最终均 Approved。
- 人工验收：本轮真机完成 Subject 删除生命周期、重启/强杀和异常恢复验证，未发现阻塞问题；MinIO 实际同步主链路此前已人工验证。
- 当前结论：该修复点已完成并通过当前范围真机验收。双设备、低磁盘、MinIO 故障注入和长期稳定性作为 release/stability 非阻塞测试项单独保留。

### 2026-09-18 修复点 6：PC 学科文件投影错位已完成并通过真机验收

- 根因：`useSourceStore.replaceSources()` 通过第一条可见 Source 推断当前 Subject，跨学科导入、空学科和异步加载竞态会让文件投影进入错误工作区。
- 修复：Store 独立维护当前 Subject；跨学科导入不再切换当前投影；空学科立即清空；A→B 异步加载以 generation/subject guard 丢弃 A 的迟到结果，迟到调用方返回空数组。
- 存储边界：Local Asset 物理原件仍按稳定 Asset 身份保存到 `assets/{userScope}/{localAssetId}/content.{ext}`。学科归属由 Source/Source draft 的 `subjectId` 表达；不按学科复制文件，也不因学科改名或移动而改写物理路径。
- 自动证据：聚焦 Local Asset/Source 流程 9/9、`test:r4-pc` 334/334、`type-check` 通过，reviewer Approved。
- 人工验收：本轮文件学科归属真机验收通过；重启和异常恢复后的归属未发现阻塞问题。
- 当前结论：该修复点已完成并通过当前范围真机验收。双设备、低磁盘、MinIO 故障注入和长期稳定性继续作为 release/stability 非阻塞测试项保留。

### 2026-09-18 PC Local Asset Store：改造与本轮真机验收完成

- 代码证据：`b7a3bb7..c560d8b`（重点 `f770277`、`e040e78`）已完成永久本地资料库；原始文件在 OS ACL 保护的受管目录中保持明文，所有文件默认同步，断网可导入/预览/本地解析，Asset、Source draft、任务和读取边界按 owner/device 隔离。Local Asset 没有备份、导出、恢复或副本管理能力。
- 删除与恢复边界：只有用户明确删除 Source 且最后一个 Source 引用消失后才物理删除；上传、解析、修复和删除任务在 Source tombstone/reference fence 后才允许收口。启动时 reconcile 本地数据库、文件和 staging，异常文件 quarantine，缺失或校验不符内容标记 `CORRUPT`。
- 自动证据：Task 7 定向 77/77、FilePreview+store 38/38、Rust 30/30，`cargo fmt --check`/`cargo check` 通过；schema v8→v9 断言已由 `c560d8b` 修正。最新本轮 `test:r4-pc` 为 342/342，`type-check` 与 build 通过。
- 人工验收：本轮真机覆盖本地文件仓库主要流程、文件学科归属、Subject 删除生命周期、重启/强杀及异常恢复，基本未发现问题；MinIO 实际同步主链路此前已人工验证。
- 当前结论：Local Asset Store 改造已完成，不再保留当前重构未完成项。双设备、低磁盘、MinIO 故障注入和长期稳定性未明确逐项执行，保留为 release/stability 非阻塞测试项，不写成已验证。

### 2026-09-15 PC Local Asset Store 已批准设计，实施与验收开放（历史快照）

- 优先级：P1。
- 证据（2026-09-15 当日快照，已由 2026-09-17 实施记录更新）：设计已确认本地持久文件、断网导入、最终云端同步、身份映射、统一消费方和最后引用删除语义；当时 `useAssetStore` 仍只有进程内 `Map<string, File>`，PC SQLite schema v7 没有原始文件表。
- 影响：应用重启、跨设备、断网和多消费方场景仍无法获得正式持久的本地原文件语义；不得把已批准设计写成代码能力。
- 处理：按四阶段实施 Local Asset Store、幂等 Asset 同步、Preview/OCR/Parser 统一读取以及删除传播和安全收口，并同步 PC、Server、API、Database、Architecture 与发布文档。
- 关闭条件：schema/API migration、PC/Rust/Server 自动门禁通过，并取得真实 Windows Tauri、MinIO、断网重启、双账号和双设备删除传播证据；自动测试、外部联调、GUI 与业务验收分别记录。

### 2026-09-15 Overview 非 JSON 失败体验已收口，真实第二次全链路成功

- 用户复跑同一真实 Overview 后第二次全链路成功；该运行证据证明当前永久预算链路可完成，但不替代用户对生成内容质量的判断。
- Overview 的 `MODEL_PROVIDER_ERROR` 继续使用现有 HTTP 502/API code，由 PC failure policy 显示“遇到意外情况，请重试”；不新增公开错误码，也不影响普通 AI 聊天/流式错误处理。
- FAILED 记录仍是自动触发终态；刷新、启动、联网、同步和 `JOB_CHANGED` 不会自动补发，手动“重新生成”才绕过终态并继续使用 in-flight coalescing。自动测试、部署状态与真实业务验收仍分别记录，不能合并表述。

### 2026-09-15 Overview 永久预算策略已部署，最终 JSON 解析仍阻塞

- Server 已按阶段发送明确预算：多批 MAP/非最终 REDUCE 为 `max_tokens=4608`，最终调用为 `6144`（原预算的 150%）；规范化 intermediate JSON 上限为 `5200`，self-pair 上限仍为 `12000`。紧凑 prompt、schema、Source fence 与 Reduce no-progress 保留，不做自动压缩重试，不恢复 output token 后置拒绝。
- TDD 已覆盖 5200 接受、5201 拒绝、self-pair 12000/12001、stage request maxTokens、非最终 REDUCE 与 Provider wire body；普通 chat/stream 兼容边界保持。backend 已重建且 healthy。真实 42-chunk 手动请求通过全部 6 个 MAP 和第一轮 2 个 REDUCE；最终 REDUCE 返回 2xx、自然 `stop`、`2992 outputTokens` 和 `6556 responseChars` 后在 `JSON_PARSE` 失败。该结果证明中间预算与收敛边界有效，但完整 DeepSeek 链路和业务内容覆盖尚未验收；下一步需为最终 JSON 非法增加安全的解析失败分类证据，再决定 prompt/schema 或有界修复策略。

### 2026-09-15 DeepSeek MAP JSON 截断假设：真实自然输出已取得，下一收敛边界已定位

- 现场证据：DeepSeek `/chat/completions` 返回 2xx 和非空 `content`，Server 记录 `responseChars=2553` 后在首个 MAP 的 `JSON_PARSE` 失败；旧请求携带 `max_tokens=1024`，但适配器未保留 `finish_reason`，因此尚不能把截断写成最终结论。
- 临时诊断行为：所有 Overview completion 不发送 `max_tokens`，不再以 `outputTokens>1024` 预先拒绝 intermediate；普通聊天/流式不变。日志新增 allowlisted `finishReason`、实际 output token 和响应字符数，未知/超长/换行停止原因统一为 `other`，不记录正文。
- 保留边界：Provider 响应体上限、Overview 120 秒 timeout、JSON/schema、规范化 intermediate 4000 字符、self-pair、Source revision fence、Reduce no-progress 均继续生效。Provider 默认输出上限可能增加单次 token、延迟和费用，因此该行为只能作为获取一轮真实数据的临时实验。
- 自动证据：fresh `clean test-compile` 退出 0；Overview/Controller/Provider contract/Provider resilience/Streaming 聚焦 58/58；`git diff --check` 通过。真实 DeepSeek 新构建已运行：MAP 1–5 分别为 `991/2500`、`1367/2688`、`1731/3669`、`1613/3460`、`2071/4091`（tokens/chars），全部 `stop` 且 JSON/schema 成功；MAP 5 随后以 `OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE` 结束，MAP 6/REDUCE 未执行。
- 当前判断：覆盖率保留的 intermediate prompt 已把同一资料的 MAP 输出压到 1447–3680 字符，六个 MAP 全部通过，但 REDUCE round 1 第二组仍自然生成 4678 字符并单独触发 4000 字符边界；其 self-pair 为 10899/12000。Prompt 控制有效但不是硬保证。永久关闭条件是保留该 prompt，同时选择可覆盖已观测 2612 tokens 的明确 token ceiling，并调整 4000 字符边界或增加有界压缩重试；之后完成同一真实生成到最终成功及内容覆盖人工检查。

### 2026-09-14 Overview retry/convergence：代码修复与自动验证完成，外部验收仍开放

- 已关闭本轮代码问题：当前 revision 的 FILE Overview `FAILED`/部分 `READY` 对自动恢复触发均为终态，只有 `MANUAL_RETRY` 可绕过并继续受 in-flight coalescing 保护；失败或部分结果保留旧内容，界面只有一个可见“重新生成”且生成中 disabled；网络/状态不确定文案与确定性失败分开。原持续自动补发问题已由 PC 自动回归覆盖。
- 已关闭本轮 Server 收敛问题：中间 MAP/非最终 REDUCE 使用 1024 tokens，最终调用使用 4096；中间结果在下一轮前校验 `outputTokens<=1024`、规范化 JSON `<=4000` 字符和 self-pair prompt fit，Reduce no-progress 保持严格单调；`OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE` 与 `OVERVIEW_REDUCE_NO_PROGRESS` 映射 HTTP 502，parse/schema 统一 `MODEL_PROVIDER_ERROR`，不再以 `VALIDATION_FAILED` 表示 Provider 输出问题。
- 已关闭本轮 DeepSeek 代码级适配问题：Overview 请求携带内部 `structuredJson=true`，OpenAI-compatible body 使用 JSON object response format，DeepSeek 同时显式关闭 thinking；普通聊天/流式保持 `structuredJson=false`。适配器继续要求有效 `message.content`，不回退到 `reasoning_content`；无有效 content 的诊断只输出 allowlisted envelope 元数据，模型标识清洗并限制为 64 字符，不输出 prompt、响应体、URL 或凭据。
- 自动证据：PC Overview focused 54/54、最新 `test:r4-pc` 331/331、type-check、`check:r4-pc`（94 个生产文件）、`check:subject-workspace`、build 均退出 0；Server 本轮 fresh `clean test-compile` 退出 0，Overview/Controller/Provider/Streaming 聚焦 56/56；OpenAPI gate green。Server 既有全量证据为 255 项中 252 pass、3 项 Docker/Testcontainers errors，错误为 `MinioAssetStorageIntegrationTests`、`PgVectorIntegrationTests`、`PgVectorMigrationIntegrationTests`；本轮未重跑全量，不得写成全量全绿。
- 仍开放：Server 未实现持久 generation 幂等/状态查询；真实 DeepSeek 是否按该组合稳定返回可解析 content、真实 Provider/Tauri/网络/GUI/设备和业务验收均未执行。自动证据不证明这些边界。

### 2026-09-12 Build/OpenAPI Task 3：fresh 编译与 schema gate 已关闭，全量受 Docker 限制

- 已验证：Server fresh 聚焦命令实际 57/57、0 failures、0 errors、0 skipped，缺失的四参数 `ProviderHttpTransport.post(..., byte[])` 仅在测试 double 中补齐；生产 Provider transport 未改变。全量 `mvnw -B -ntp test` 实际 239 项，0 failures、3 errors，错误精确为 `MinioAssetStorageIntegrationTests`、`PgVectorIntegrationTests`、`PgVectorMigrationIntegrationTests` 的 Docker/Testcontainers 环境不可用。
- 已验证：`check-openapi.ps1` 退出 0（artifact comparison、Server OpenAPI 8/8、PC/Mobile 生成 schema 均通过）；PC/Mobile type-check 退出 0，Mobile protocol test 23/23。两端 schema 字节相同且 `subjectOverview`/`sourceOverview` header 均含可选 `X-Overview-Request-Id`。
- Mobile 为适配生成 `JsonNode` 的结构窄类型，仅增加一行编译期 `SyncMutation['payload']` boundary cast，运行时 JSON 序列化不变；未来应清理生成契约类型风险，当前不声称已关闭。API/Database 契约文件仅核对，未发现本轮新的语义变化且未编辑。
- P1 外部验收仍开放：真实 Provider、Docker 后的 PostgreSQL/pgvector/MinIO、Tauri/GUI/设备、微信/H5/Tablet 和业务验收。上述自动证据不能写成真实依赖或产品验收通过。

### 2026-09-11 Server Test Gates Task 4：聚焦通过，全量受限

- 已验证：`source` 通过 source-owned `ParsedDocumentIngestionPort`/`IngestionJobReference` 使用 `ai.ingestion` 公开契约，架构隔离命令（含 `ArchitectureTests`）7 类合计 20/20，其中 `ArchitectureTests` 1/1；Task 2 的 H2 清理连续两次隔离 24/24；Task 3 的 Server OpenAPI artifact 测试 8/8。
- 本轮当前增量编译产物下标准聚焦命令实际 40/40、0 failures、0 errors。标准全量 `mvnw -B -ntp test` 实际执行 239 项，0 failures、3 errors，三项均为 MinIO/PgVector/Testcontainers 无法连接 Docker；不得写成全量通过。fresh `clean test-compile` 仍在 `AiProviderSecurityTests.java:182` 因匿名 `ProviderHttpTransport` 未实现当前 `post(..., byte[])` 抽象方法而失败，未修改该并行 blocker。
- `check-openapi.ps1` 的 runtime artifact comparison 与 Server 8/8 已通过，但 `Auralis-PC/src/api/generated/schema.ts` stale，未运行 SDK 生成。标准生命周期、隔离测试、契约脚本与外部依赖结果必须继续分开记录。
- P1 处理：补齐并行测试的当前 `ProviderHttpTransport` 实现后，重新运行 fresh Maven 聚焦/全量门禁；关闭 Docker 后复跑三项 Testcontainers；在授权窗口更新 PC generated schema 并复跑 `check-openapi.ps1`。真实 Provider、PostgreSQL/MinIO、Tauri/GUI 和业务验收仍未完成。

### 2026-09-11 Overview Source deletion fence：自动门禁通过，外部边界开放

- 已验证：PC 文件总览要求活动 FILE Source 的精确 `ingestionRevision` 与本地文档任务 `READY`；删除在 tombstone/投影移除后同步阻断 Source、abort 匹配请求、清理文件总览缓存，晚到响应不保存或标记失败，且先于同步/后台文档清理。Server 在每个共享 Map/Reduce Provider 调用前后复核活动 `READY`/精确 revision；进行中的调用可能完成，但结果被拒绝且后续调用不开始。Subject 总览及 API/数据库/同步契约不变。
- 本轮证据：PC `npm.cmd run test:r4-pc` 322/322、`npm.cmd run type-check` 退出 0、`npm.cmd run check:r4-pc` 退出 0（93 个生产文件）；Server `AiOverviewServiceTests` 19/19、退出 0，Overview 失败日志仅记录规范化 UUID `requestId`、allowlisted 关联字段、阶段、稳定 `errorCode`（或 `OVERVIEW_GENERATION_FAILED` 回退）及 exception/cause 类型；非法或含敏感内容的请求 ID 会替换为服务端新 UUID，不含原始 exception/cause 文本或 throwable stack；Task 4 Server 全量 `test` 退出 1，239 项中 0 failures、3 Docker/Testcontainers errors、0 skipped。artifact comparison、Server OpenAPI 8/8 已通过；fresh testCompile 的 `AiProviderSecurityTests.java:182` blocker 与 PC schema stale 仍开放，不得写成全量或契约总门禁通过。根目录 `git diff --check` 退出 0。
- P1 外部验收：Provider 调用中的服务端取消不可由 fence 强制中断；需在真实 Provider/HTTP 环境验证删除或 revision 变化时的断连与不再继续生成。P2 外部验收：真实 Tauri 删除/重传顺序、Axios disconnect、PostgreSQL/MinIO、GUI 和业务结果仍未执行。关闭条件是取得对应现场/端到端证据并复核上述全量门禁既有错误。

### 2026-09-10 Provider Overview response timeout

- 根因：ProviderHttpClient 将 `AURALIS_AI_REQUEST_TIMEOUT_MILLIS=10000` 同时用于连接、读取和请求；DeepSeek completion 在约 10.2 秒触发 `SocketTimeoutException`，OpenAi-compatible provider 又把它按普通 IOException 映射为 `MODEL_UNAVAILABLE`/503。
- 修复与自动证据：Provider connect/read 分离（默认 3000/10000ms），Overview map/reduce 使用默认 120000ms（配置限制 60000–120000ms）；`SocketTimeoutException` 映射为 `MODEL_TIMEOUT`/504，普通 IOException、429/5xx/400 和普通聊天/流式路径保持既有行为。TDD RED 捕获缺少 timeout overload/配置、旧错误码及配置越界未拒绝；最终 Provider、Overview、普通 streaming、embedding、错误映射及 OpenAPI 聚焦回归 60/60 通过。真实 DeepSeek、SiliconFlow、生产反向代理仍未验收。
- P1 外部验收：在受控环境验证 Overview 生成超过 10 秒但小于 120 秒时不再 503，确认普通 chat/stream/embedding 仍按 10 秒 response 窗口运行，并检查日志无 key/prompt 泄露。

### 2026-09-10 PC 学科总览：自动证据已接入，真实边界开放

- 文件/学科总览结果只保存在 owner/device 隔离的本地 schema v7；Server 两个端点无新增表、Conversation、Message 或 Sync 资源。客户端在入缓存前校验 schema/mode/嵌套结构，分项生成失败只更新安全诊断并保留旧内容。
- 页面沿用原 `AI 梳理` 按钮位置与三栏宽度；学科总览默认折叠且用户主动生成，文件大纲直接展开，文件总结复用中栏。前端展示组件样式由 Antigravity 在隔离工作树产出方案后由 Codex 审查并以受限补丁集成。
- 自动证据：Server 聚焦 23/23、PC 完整 R4 306/306、overview/UI 聚焦 18/18、type-check、`check:r4-pc`、SubjectWorkspace 契约、生产构建和 diff-check 通过。Luna 终审发现的“零可用输入未标 stale”“空大纲进入 subject 请求”和“缺少学科 OUTLINE 独立入口”均已用回归关闭。OpenAPI artifact 8/8 且 PC schema 已更新；仓库级 `check-openapi` 仍因既有 `P1-OpenAPI-Mobile-Schema-Lock`（Mobile schema 过期/文件占用）退出 1，不能写成契约总门禁通过。Server 全量 223 项中 0 失败、28 错误，仍由既有 Modulith 边界、共享 H2 外键清理及 Docker 不可用导致，不视为本功能回归通过。
- P2 人工验收：真实 Tauri v6→v7 重启升级、上传完成到自动生成、真实 Provider、Source revision 更新、文件/学科重新生成、locator 回退、双账号隔离及深浅色/窄屏 GUI 尚未执行。关闭条件是取得上述实际运行证据；自动测试和构建不替代业务验收。

### 2026-09-09 PC 时间轴空槽拖动 400 修复

- 根因：`useTaskStore.rescheduleTask` 的空槽分支仍调用只适用于两个已排期任务的 `schedule-swaps`，请求体中传入 `targetTaskId: ''`。Server `ScheduleSwapRequest.targetTaskId` 要求 UUID，因此在业务服务之前返回 `400 VALIDATION_FAILED / Request validation failed`。
- 修复：空槽分支改用 `updateTaskModel(fromModel)` 执行单 Task 本地投影与 outbox 原子写入；目标槽有任务时仍提交四个合法字段的原子 swap。TDD RED 12/13，GREEN 相关 35/35；完整 PC 272/272、type-check 和静态检查通过。P2 人工验收：真实 Tauri GUI 中分别拖到空槽和占用槽，确认本地即时反馈、后台同步和冲突提示。

### 2026-09-09 PC 知识块来源名称修复

- 根因不在文件解析编码：`mapKnowledgeBlockView` 把 `sourceId` 直接写入用于展示的 `source`，因此 UI 将 UUID/资源 ID 当成文件名。现由 Knowledge Store 从本地 Source 投影解析真实 `title`，关联丢失时使用中性文案，不再显示 ID。
- TDD 证据：修复前聚焦用例 9/10，实际值为 `source-1`、期望中文文件名；修复后聚焦 11/11、完整 PC 270/270、type-check 和 `check:r4-pc` 通过。P2 人工验收边界：需在真实 Tauri GUI 中打开含中英文/括号文件名的已有知识块，确认列表、弹窗、图谱的来源名一致刷新。

### 2026-09-09 PC 知识块学科名称映射补充

- 根因同属展示投影边界：`mapKnowledgeBlockView` 将 `subjectId` 直接写入可见 `subject`，导致知识块标签、搜索和弹窗显示资源 UUID。现由 Knowledge Store 从同一用户/设备的 Subject 投影解析 `Subject.name`；缺失关联时显示“未分类学科”，`subjectId` 仍只保留作筛选/写回标识。
- TDD 证据：新增回归修复前实际值为 UUID、期望 `编译原理`；修复后映射聚焦 12/12、完整 PC 271/271、type-check、静态检查、生产构建和 diff-check 通过。P2 人工验收边界：真实 Tauri GUI 中的知识块标签、搜索和弹窗需确认学科名实时刷新。

### 2026-09-09 PC PDF 混合页面状态修复

- 已修复同一 PDF 出现文字页→OCR页→文字页时的本地阶段回退：进入 `OCR_RUNNING` 后，普通文字 block 仍保存 `OCR_RUNNING`，直至 `PACKAGING`；未放宽非法转换、未改变 PDF 分类或 API/schema。
- TDD 证据：修复前严格转换回归因 `DOCUMENT_JOB_ILLEGAL_TRANSITION` 最终为 `FAILED_LOCAL`；修复后 runner 聚焦 12/12。真实 51 页 PDF、Tauri GUI、MinIO/Server 上传和业务结果仍未验收。

2026-09-09 Task 13：自动回归覆盖 trace 顺序、稳定错误码、过期 intent 双 PUT 和隐私 allowlist；日志只在开发控制台可见且不持久化。真实 Tauri、MinIO PUT、Server complete/indexing 和 GUI retry 的最终事件序列仍待观察。

### 2026-09-09 PC stale/current revision preflight correction

- 修正 fix3 过强的“Source GET 前拒绝”口径：Source 当前 revision 只能由一次权威 GET 决定；scheduler 先 GET、再 stale supersede、最后只校验 current revision。stale corrupt job 的 receipt/ID evidence 保留，不会阻塞另一个 valid current job。
- current mismatch 仍在任何 hash/prepare/runner/OCR/upload intent/PUT/complete/cache deletion 前返回；测试更新为恰好一次 Source GET。scheduler 33/33、schema 17/17、upload 16/16、完整 PC 259/259、type-check、diff-check 通过。

### 2026-09-09 PC recoverable server-phase mismatch closure

- 本地 cache corruption 在 `SERVER_VALIDATING`/`SERVER_INDEXING` 不再因非法迁移而抛错，现进入可 retry 的 `FAILED_LOCAL`；READY 与 FAILED_SERVER 仍保持原 phase 并保留 bounded mismatch evidence。`retry()` 重新入队规则已由真实 repository/scheduler 覆盖。
- scheduler 在一次权威 `sourceApi.get` 后只预检选中的 current-revision local job；mismatch 不触发 hash、prepare、runner/OCR、upload/complete 或 delete。schema 17/17、scheduler 32/32、upload 16/16、完整 PC 258/258、type-check、diff-check 通过。真实 Tauri/Server/MinIO/GUI 仍未验收。

### 2026-09-09 PC phase-safe cache mismatch closure

- 修复 scheduler 对 schema-v1 cache mismatch 无条件请求 `FAILED_LOCAL` 的非法迁移：现在统一复用 phase-safe preservation helper。READY、SERVER_VALIDATING、SERVER_INDEXING、FAILED_SERVER 不伪造 Server rejection，合法同阶段保留两侧 cache ID/receipt 与 bounded ownership error；recoverable phases 才进入 FAILED_LOCAL。
- Real repository table regression 覆盖四类 phase，证明 mismatch 返回稳定结果且不发生 upload/OCR/backend/deletion；scheduler 31/31、upload 16/16、schema 16/16、完整 PC 256/256、type-check、diff-check 通过。真实 Tauri/Server/MinIO/GUI 仍未验收。

### 2026-09-09 PC cache-safety review fixes

- 两项 Important findings 已按 TDD 修复：READY 派生 cache cleanup 采用 delete-before-clear，失败保留 cache ID/receipt 和稳定 bounded 错误；后续 READY schedule 会重试清理且不重新上传、解析或请求后端。schema-v1 receipt 与 job column 的 cache ID mismatch 在 scheduler/coordinator 网络边界前拒绝，保留两侧证据。
- 证据：upload 16/16、scheduler 30/30、schema 16/16、完整 `npm.cmd run test:r4-pc` 255/255、`npm.cmd run type-check` 与 `git diff --check` 通过。真实 Tauri/Server/MinIO/GUI 仍未验收。

### 2026-09-09 PC ParsedDocument 状态迁移修复，真实边界仍开放

- 根因已由真实 `DocumentProcessingJobRepository` 回归复现：complete 成功后 coordinator 直接请求 `SERVER_VALIDATING -> READY`，被现行迁移表拒绝为 `DOCUMENT_JOB_ILLEGAL_TRANSITION`。修复为先写入 `SERVER_INDEXING` 再写入 `READY`，未放宽迁移表。
- 本轮 focused 证据：ParsedDocument upload 15/15、processing flow 1/1、job schema 16/16、source scheduler 27/27；完整 `npm.cmd run test:r4-pc` 251/251、`npm.cmd run type-check` 与 `git diff --check` 通过。scheduler 的 READY 返回与 cache cleanup 责任未改变。
- 仍未关闭的 P2 业务验收风险：真实 Tauri/Server/MinIO PUT、complete/indexing 和 GUI retry 未由本轮自动测试证明；关闭条件是取得完整外部服务与 GUI 过程证据。

### 2026-09-08 Task 12：schema-v1 自动验证完成，真实验收仍开放

- Rust packager/cache/upload、Java validator/complete、PC focused/full R4 与 type-check 均取得本轮通过证据；最终 scheduler focused 27/27、完整 PC R4 250/250，`git diff --check` 通过。安全扫描未发现生产上传 JSON 包含 owner/job/device/user 字段、signed URL、Authorization 或 OCR 正文；测试中的敏感字符串仅为脱敏/拒绝断言样本。
- 本轮只证明代码、跨语言 fixture 和自动回归；尚未重建/重启真实 Tauri 并用 `1.pdf` 观察旧 receipt 一次性重解析、MinIO PUT、complete、indexing 和 Source `READY`。该 P2 业务验收风险保持开放，关闭条件是取得完整 GUI/Server/MinIO 过程证据。

### 2026-09-09 Final reviewer closure

- Final review fix 1–3 已关闭全部 Critical/Important findings：scheduler 将 immutable Asset SHA 原样传入 runner；legacy、receipt-only、matching、mismatched 及删除失败的 cache ID 清理均按安全顺序处理，覆盖 discard、stale 和 terminal jobs；coordinator 对缺失、不完整或非法 schema-v1 receipt 在 intent/PUT/complete 前统一拒绝。
- Final evidence：scheduler 27/27、完整 PC R4 250/250、type-check 和 diff-check 通过。Minor reviewer findings未在本轮处理；真实重建 Tauri、Server/MinIO 与 GUI retry 仍未验收。

更新时间：2026-09-09

文档状态：现行风险登记

权威范围：尚未关闭的工程风险、证据、影响、处理动作和关闭条件

事实来源：当前代码、配置、模块/契约文档与本轮验证结果

2026-09-08 ParsedDocument PUT 长度根因已定位并修复：真实 source chain 显示 `user body write aborted -> early end, expected ... more bytes`，对应旧 receipt 将加密 envelope 总字节写入 `payloadBytes`，而 Rust 解密 reader 只发送 gzip payload。新 receipt、intent `sizeBytes`、Rust sized body/Content-Length 与发送后 bytes/hash 校验统一使用解密 payload；历史 receipt 在恢复边界按 owner scope 重算。关闭条件仍是重启真实 Tauri 后点击继续，完成 MinIO PUT/complete/indexing 验收。

2026-09-08 Task 颜色切换风险：V21 与 PC/Mobile 本地迁移只清洗可解析 Task JSON；非法 payload 按要求保留原文并限次告警，需真实旧库升级复核。KnowledgeBlock `colorOverride` 不在清理范围。若本轮类型或回归门禁被主树既有错误阻断，不得写成整体验收通过。

2026-09-07 MinIO 运行态复核：原先 `mc ready` 会在 MinIO 内部 `/data` 周期性 offline 时仍返回 healthy；Compose 已改为随机临时对象 PUT/HEAD/GET/DELETE 探针。安全重启后最终独立对象测试通过，但此前周期性掉盘现象的宿主/Docker Desktop 根因尚未被证明关闭；需持续观察日志并完成真实 Tauri PDF/PPTX/DOCX 重试。

2026-09-08 PC 断网续传状态机已由真实 repository 回归和 focused 复审覆盖：带 payload receipt 的 `PAUSED_NETWORK` 继续经 `QUEUED -> UPLOADING`，无 receipt 的 queued 任务仍解析；`NETWORK_OFFLINE` 保持稳定错误码并只保留 allowlist reason。风险仍开放：需在真实 Tauri 中再次点击继续，确认实际 MinIO PUT/complete/indexing 和 GUI 状态，不得以自动测试替代外部服务验收。

### P1-PC-Authentication-Rehydration

后端重建会使 PC 持久 access/refresh token 对应的 refresh session 失效，已造成 `/api/realtime/ticket` 与 Asset `download-url` 同时 401。当前代码在 refresh 失败时原子清除会话并进入 `reauthentication-required`，禁止受保护请求、sync 和 Source document scheduler 继续启动；登录/注册/refresh/health 保留恢复入口，单飞 refresh 与一次重放保留。24/24 聚焦 Node 回归通过。真实 Tauri 重启、重新登录、后台请求停止和登录后恢复仍需 GUI/服务联调证据，故风险保持开放。

### P1-PC-Browser-Node-Stream-Entry

PPTX parser 已使用 JSZip 浏览器 bundle，Vite 对 File Viewer 及其它根 `jszip` import 增加精确 alias，避免跟随 Node `stream.Readable` 分支且未引入空 polyfill。源级回归通过；本轮未运行新鲜 Vite build，最终产物扫描和真实 Tauri 预览仍是关闭条件。

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

### P1-PC-Document-Real-Processing-Validation

本轮已补齐代码和自动回归：OCR sidecar 使用应用 cache 专属 PyInstaller 临时目录并保留 bounded stderr 诊断；PPTX OOXML 49 页 fixture 直接读取 slide relationships；Tauri invoke 保留 Rust 字符串错误；DOCX parsed-document PUT 的网络失败带稳定分类，服务器校验/索引阶段可恢复到 `PAUSED_NETWORK`，已有 payload receipt 可直接续传。仍未关闭的风险是实际 Tauri GUI 中的 OCR/PPTX/DOCX 全链路和真实 MinIO/Server 联调：Docker Desktop 当前报告 unable to start，不能以本地测试替代外部依赖证据。关闭条件为在 fresh Tauri 进程中完成三类样本处理、断网后续传，并取得 Server/MinIO healthy 与 complete/indexing 证据。

### P1-PC-FilePreview-GUI-Validation

PC 真实 Source 文件预览已收敛为 `FilePreview`：旧 `PdfViewer`、Home PDF 伴读入口和 Asset 的 `filePath`/不可达 Markdown 预览分支已删除，资产库以 Source `id`、`assetId`、`name`、`fileType` 驱动同一组件。`r4-file-preview` 24/24 通过；自动测试仍无法证明 Tauri/浏览器在大文件、多格式与连续快速切换时的资源加载、排版与内存表现，需人工 GUI 验收。

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
| P1-Backend-Docker-Gate | [当前复核受限] Docker、PostgreSQL/pgvector、MinIO 和 Compose/Testcontainers 基础门禁 | 历史 2026-08-20 Docker Desktop Linux engine 下默认 `clean test` 137/0/0 证据仍有效；2026-09-11 Task 4 全量 239 项出现 3 个 Docker/Testcontainers errors，当前 Engine named pipe 不可用；既有 Compose config/build/up/health 证据仍有效 | 本机当前不能重现真实 PostgreSQL/pgvector/MinIO 全量门禁；异常专项和真实 Provider 仍由独立风险跟踪 | 恢复 Docker 后复跑全量及三项容器集成测试；继续完成 R2-03/R2-04 异常专项和 R2-05 真实 Provider smoke | Compose 服务健康、默认容器测试零错误、PostgreSQL/MinIO 主链路集成证据齐全 | Backend/Infra |
| P1-Auth-Guard | PC 登录守卫逻辑已恢复，公共登录页已与认证壳隔离，但浏览器/Tauri 的登录、刷新、退出和过期仍未人工验收 | `Auralis-PC/src/router/index.ts`、`src/auth/authGuard.ts`、`src/App.vue`、`src/components/layout/AppSidebar.vue`；`r4-pc-protocol.test.mjs` 与 runtime 回归已覆盖公开/受保护/登录页决策及白屏回归 | 会话持久化、过期和退出后的实际导航行为仍可能与纯函数决策不一致 | 在浏览器和 Tauri GUI 走查登录、刷新、退出、过期和返回地址，并确认无 token/refresh token 时不出现空白页 | 自动测试与目标 GUI 的登录/刷新/退出/过期证据齐全 | PC/Auth |
| P1-Test-Coverage | 新后端已覆盖主要模块自动测试；多设备和浏览器客户端仍缺业务回归保护，当前宿主无法完成全量 Testcontainers 门禁 | 2026-09-12 Task 3 fresh 聚焦 57/57、0 failures/errors/skipped；全量 239 项、0 failures、3 Docker/Testcontainers errors，错误仅为 Docker 不可用 | 主链路通过不等于 PostgreSQL 全量并发行为、双设备断网恢复和真实 WebSocket 可用；当前环境无法完成容器证据 | 恢复 Docker 后复跑全量及三项容器集成测试；继续增加 PostgreSQL/MinIO 异常与并发、双设备和浏览器 WebSocket 回归 | CI 或本地门禁执行到真实基础设施与目标客户端断言并保留报告 | Backend |
| P1-Asset-Verification | Asset 上传完成的服务端对象实体验证已构建，异常分支仍未闭环 | R2 已补充 sha256 metadata header、失败对象清理、MinIO integration test 和 `scripts/audit-minio-assets.ps1`；2026-08-23 新增离线 GET signer 回归 3/3，Docker 临时账号真实 upload PUT 200、READY、download GET 200/26 bytes | 对象不存在、大小/hash 不符、超时和重复完成仍可能在部署差异下产生未覆盖行为；真实生产凭据与 bucket policy 仍未验收 | 补充真实 MinIO 异常路径、完成回调和生产凭据验证 | 真实 MinIO 主链路与异常路径、凭据、bucket policy 和部署配置测试通过 | Asset/Infrastructure |
| P1-PC-Task-Scheduling-Atomicity | 时间轴拖放已改为本地 outbox 优先，但双任务换位的持久化原子组、到期转换与过去时段保护仍与现行回归契约不一致 | 2026-09-03：Task Store 已用 `serverDeviceId` 读取本地 repository，加载先呈现本地任务、后台刷新云端，日期切换只重建内存槽位；单任务拖放不再等待远端 `PUT`，本地 repository/outbox 成功后立即更新内存，云端 push/pull 在后台执行且失败不回退本地结果。本地写入失败由 Timeline/Dashboard 通知反馈；原生 payload 现含 `taskId` 与 `sourceSlotTime`。时间轴相关 Node 套件 31 项中 26 项通过、5 项失败：负荷标签、排期换位、到期自动转换与过去时段保护；`check:r4-pc`（80 文件）通过，本机 `vue-tsc` 缺失 | 双任务本地写入仍不是持久化原子组；WebView 原生拖放、离线/409、两类转换失败、过去时段错误反馈与真实服务版本仍可能产生半交换或错误状态；无法用历史通过记录覆盖当前失败 | 先为双任务换位补齐本地原子组/服务端 swap 协调和剩余 5 个静态/行为回归，再运行 type-check、完整 PC 回归与 production build；随后在 Tauri 以过去/当前/未来槽位、已排期双向换位、未排期逾期、完成/取消、原槽、拖回待办、断网/冲突和重启后转换走查 | 当前 Node 套件、type-check、完整 PC 回归和生产 build 均通过；Tauri 上述路径可用且失败不留半交换；过去时段操作不产生写入；已过排期任务完成且保留排期，未排期逾期任务清除截止时间进入未排期 | PC/Backend |
| P1-OpenAPI-PC-Schema-Stale | **已关闭（2026-09-12）**：OpenAPI artifact 与 Server runtime 及 PC `schema.ts` 一致 | Task 3 `check-openapi.ps1` 退出 0；PC/Mobile generated schema SHA-256 均为 `2152390C192BCBE34B7618D11B71F28DF72AC9262C39625594B5EF3CC7D219C7`，包含 `subjectOverview`/`sourceOverview` 可选 `X-Overview-Request-Id` header | 无；真实 Provider/客户端联调仍由独立风险跟踪 | 保持生成器驱动并在 API 变化后重跑 artifact/schema gate | `check-openapi.ps1` 持续退出 0 | Contract/PC |

### 2026-09-07 Task 认知负荷切换复核

- Task 字段删除的 Server 定向测试 8/8、PC type-check 与 R4 211/211、Mobile type-check/静态检查/协议测试 21/21 通过；V20 clean/upgrade 覆盖数据库列、约束、Task 同步 JSON 以及非 Task 载荷保留。
- Server 全量测试仍受 Docker/Testcontainers 三项错误限制，不视为全量通过。历史 `P1-OpenAPI-Mobile-Schema-Lock` 的文件占用/漂移阻断已由 Task 3 生成器运行关闭；当前 `check-openapi.ps1` 退出 0，PC/Mobile schema 与 artifact 一致。真实 API/设备联调仍开放。
- 未执行真实 PostgreSQL 升级和 PC/Mobile/Tablet GUI/真机验收；在这些证据补齐前，只能记为代码与自动验证完成。

### 2026-09-04 PC 排期固定补充

- 已完成且已排期的 Task 现已在 Store、Timeline 与 Dashboard 固定，防止拖放替换、移动或取消排期；该行为的两项 Node 回归通过。历史本地 `completed` 展示态记录已按弃用策略移除兼容：加载时忽略、在线刷新后以现行领域 DTO 重建；映射与 Store 定向回归通过。Subject `color` 类型错误已通过全局主题色清理关闭；最新完整 PC 回归为 173/181，剩余 8 项失败继续由本 P1 风险跟踪，真实 Tauri 拖放仍待验收。

### 2026-09-05 PC 孤儿 Source 清理边界补充

- `SourceJobScheduler` 只在 `sourceApi.get(sourceId)` 边界捕获结构化 `ApiProblemError` 的 404 或 `RESOURCE_NOT_FOUND`；复用 `discard(sourceId)` 清理 owner-scoped 文档任务/cache，并返回稳定的 `SKIPPED/SOURCE_NOT_FOUND`。503/`INTERNAL_ERROR` 回归仍拒绝且保留任务；parser、hash、upload 后续异常不误判为 Source 不存在。
- `r4-source-processing-schedule.test.mjs` focused 14/14、相邻文档处理套件 35/35、`check:r4-pc`（87 个生产文件）和 `git diff --check` 通过；`npm run type-check` 退出 1，7 项既有错误位于 `useTaskStore.ts`（3 项）和 `Timeline/index.vue`（4 项），未归因于 scheduler。开发环境在确认并停止仓库 Tauri `app.exe` 及其进程树后，已精确删除 `%APPDATA%\com.auralis.app` 下的数据库、WAL 与 SHM 文件，目录内无其它删除目标。重启后完整表集已重建；远端同步恢复 48 条资源投影和 3 个文档任务，任务当前均因缺少 master key 进入 `FAILED_LOCAL`。本地代际残留已排除，但密钥初始化/恢复与重新上传仍需 Tauri GUI/Server 联调；P2-PC-Document-Processing-Validation 继续开放。

### 2026-09-05 PC 上传、统计与处理状态恢复补充

- `keyring = { version = "3", features = ["windows-native"] }` 已启用，服务/用户标识仍为 `auralis/master_key`；Cargo feature 静态回归、`cargo check` 与 `cargo tree --manifest-path src-tauri/Cargo.toml -e features -i keyring` 均确认 Windows-native feature，未增加明文或环境变量回退。Windows-only Rust 测试已用唯一 service/user 创建新 Entry，写入后用另一个 Entry 读取并在 Drop 中精确清理；本机运行时写入因 Credential Manager `NoStorageAccess(Error(1312))` 失败，因此该测试尚未取得真实持久化证据。
- StatsQueryRepository 在 JDBC repository 边界把 `Instant` 转为 `Timestamp`，测试覆盖六个查询的所有时间参数并断言 UUID/参数顺序保留；`StatsQueryRepositoryTests` 1/1、`StatsServiceTests` 2/2 通过；SQL、API 和 database schema 未变化。
- PC upload accept list 已收敛到 PDF、DOC、DOCX、PPT、PPTX；图片/文本仍由 File Viewer 预览但 upload intent 前被拒绝，`canPreviewFile()` 的真实预览判定不再依赖 upload allowlist，错误消息列出可上传格式，五种解析器支持格式均由 `validateUploadFile` 直接覆盖。`AWAITING_CLIENT` 现在显示等待桌面端开始处理，`VALIDATING/PARSING/INDEXING` 显示明确服务端阶段，映射已抽成纯工具函数并由实际函数断言覆盖；`DocumentProcessingDot` 不再保留 Source 内联映射，未知/undefined phase 使用中性同步提示，`READY` 返回“处理完成”；file-preview 27/27、processing UI 1/1、runtime static 9/9 通过。
- 未关闭边界：Windows Credential Manager 跨 Entry 持久化、真实 PostgreSQL 统计请求、MinIO/Server complete/indexing、真实文件解析和 Tauri GUI 上传/状态走查仍需人工联调；这些自动测试证据不关闭 `P2-PC-Document-Processing-Validation` 或 `P2-PC-File-Viewer-Validation`。最终 `test:r4-pc` 为 202 项中 196 通过、6 项失败，失败仍为既有 Timeline 拖放/本地投影/可见负荷和 `Subject.color` 静态契约；`type-check` 仍有既有 7 项错误，不能写成整体通过。

### 2026-09-06 PC PDF worker 与 Source 调度竞态修复

- 根因已确认并修复：`PdfTextAdapter` 原先动态加载 `pdfjs-dist/legacy/build/pdf.mjs` 却未设置 `GlobalWorkerOptions.workerSrc`；现由 Vite `?url` 绑定同版本 `pdf.worker.min.mjs`，不依赖 CDN。`useSourceStore` 原先在本地 CREATE 尚未获得服务端 `ingestionRevision` 时就自动调度，导致 `sourceApi.get()` 404 后命中永久 `SOURCE_NOT_FOUND` 清理；现自动入口要求 `AWAITING_CLIENT`、非空 Asset ID 和非空 revision，待 sync push/pull 投影包含 revision 后才调度。
- TDD focused 测试覆盖 PDF runtime、Source 注册和相邻文档处理链共 70/70；`npm.cmd exec vite build` 通过并产出 `pdf.worker.min-*.mjs`。`npm.cmd run type-check` 仍为工作树既有 7 项错误（`useTaskStore.ts` 3 项、`Timeline/index.vue` 4 项），未归因于本修复。认证与 MinIO 未改动；真实扫描 PDF OCR、Office 处理、Server complete/indexing 和 Tauri GUI 仍保持开放验收边界。

## P2 风险

| ID | 问题 | 证据 | 影响 | 处理动作 | 关闭条件 | 领域 |
| --- | --- | --- | --- | --- | --- | --- |
| P2-Mobile-BaseUrl | Mobile Auth/WS 使用 localhost/127.0.0.1 | Mobile Store/API | 真机无法访问开发服务 | 使用平台环境配置 | 模拟器、真机、生产地址均验证 | Mobile |
| P2-Mobile-Contract | Mobile 多数页面依赖端侧数据，未接完整 Server API | 页面 API 映射 | 多端功能完成度易被误判 | 标注 local-only，逐步定义契约 | 主流程页面来源与同步一致 | Mobile |
| P2-Tablet-Validation | Tablet 多栏和手写缺真机验证 | 页面、feature flag、脚本 | 触控和长时间使用风险 | 设备走查与专项记录 | 指定设备清单全通过 | Tablet |
| P2-PC-Subject-Icon-Validation | PC 新建学科线条图标与已有 Emoji 的实际显示未做 GUI 验收 | `src/utils/subjectIcon.ts`、`AppSidebar.vue`；2026-07-14 `check:subject-icons` 与生产构建通过 | 线条图标的尺寸、对齐、统一 Sage Green 底色或选择态可能异常，已有 Emoji 可能在个别入口未保持原样 | 在浏览器或 Tauri 中检查既有学科及新建学科，覆盖全局功能侧栏 | 新建线条图标与统一底色、既有 Emoji、空值/未知语义键三类均显示正确且可操作 | PC |
| P2-PC-Workspace-Prototype-Validation | 学科大纲编排仍为静态交互原型；文件预览/删除、知识块总结与 PC AI 伴读尚未完成 GUI 验收 | `SubjectWorkspace/index.vue`、`FilePreview.vue`、`useSourceStore.ts`；2026-09-04 文件删除在 Source tombstone/DELETE outbox 成功后立即移除本地文件投影，parser/job/cache 清理改为后台 best-effort，`r4-file-preview` 20/20 通过；File Viewer 直接预览新增旧签名下载响应抑制 | 刷新后大纲编排丢失；浏览器中的删除确认、删除 OCR 中文件后的列表/计数/Profile 同步、File Viewer 文档兼容性、三栏尺寸、AI 星环/三点动效、窄栏换行和深色主题仍可能有问题 | 在浏览器/Tauri 验收文件选择、删除静态及 OCR 中资料后列表/计数/当前文件/Profile 同步、知识块总结、章节排序、小节边界与 AI 右栏 | 指定交互范围获确认或持久化完成，且 GUI 验收记录通过 | PC |
| P2-PC-Frontend-Refactor-Validation | PC 近期页面重构（Pomodoro、Timeline、Asset、Dashboard 与全局导航）尚未完成跨页面 GUI 验收 | 最近 PC 提交与 `Auralis-PC/src/views/`、`src/components/`；2026-08-12 构建与两个静态契约检查通过，但未做 GUI | 宽屏布局、任务计时、弹窗、删除操作和导航图标可能存在只在浏览器/Tauri 中暴露的回归 | 按正式路由逐页走查主要任务和失败/空状态 | PC Web 构建通过，且 Dashboard、Subject、Asset、Timeline、Pomodoro、Profile 主流程 GUI 记录通过 | PC |
| P2-PC-Modal-Consistency | PC 自定义弹窗仍有多套视觉实现：`modal-container`、Dashboard `block-modal`/详情弹窗和 `ConfirmDialog` 的遮罩、容器、标题栏、圆角、阴影与操作区不一致 | `Auralis-PC/src/views/Home/index.vue`、`Asset/index.vue`、`SubjectWorkspace/index.vue`、`Dashboard/index.vue`、`src/components/ConfirmDialog.vue`；2026-09-27 `ModalShell` 基础组件、`modalManager.ts` 全局管理器与 `modal.css` 令牌已建立，六大业务弹窗已提取，`ConfirmDialog` 与 `SubjectCreateModal` 已接入；滚动锁计数、顶层 Escape 拦截、入场/焦点闭环以及 `aria-label`/`aria-labelledby` 绑定已修复；`test:r4-pc` 433/433、type-check 与生产构建均通过，保留浏览器/Tauri 人工 GUI 走查 | 跨页面打开弹窗时视觉语言不连续，深色模式、窄屏和关闭按钮行为的 GUI 观感可能不一致 | 采用“全局弹窗令牌 + 兼容现有类名”方案，统一遮罩、容器、标题/内容/操作区与 Sage 主按钮，同时保留业务逻辑 | Dashboard、Subject、Asset、Workspace、ConfirmDialog 等弹窗在浏览器/Tauri 的浅色、深色、窄屏走查通过，且无关闭/焦点回归 | PC |
| P2-PC-Bundle-Size | PC 生产构建存在大 chunk 警告 | 2026-08-12 `npm.cmd run build`：`Asset-B7Y2PPYt.js` 约 595 kB，Vite 提示部分 chunk 超过 500 kB | 首屏加载和缓存粒度可能受影响 | 评估 Asset、Element Plus 等依赖的拆包与懒加载策略 | 关键入口 chunk 达到团队阈值，或形成明确的警告接受记录 | PC/Performance |
| P2-PC-File-Viewer-Validation | PC 学科页已接入自托管 File Viewer；真实 DOC/DOCX 排版、跨浏览器资源加载、分页能力和窄栏 GUI 尚未验收 | `src/components/FilePreview.vue`、`src/components/preview/FileViewerRenderer.vue`、`src/views/SubjectWorkspace/index.vue`、`@file-viewer/vite-plugin`；2026-09-01 OCR 完成会释放 PDF.js document，预览采用最新选择请求门禁，阻止旧下载响应回写 renderer；固定版本约束仍为 `pdfjs-dist@5.4.624` | Office 文档可能出现字体、布局、Worker/资源路径或性能差异；不同 renderer 的视图状态可能不提供真实页数；快速切换/删除扫描 PDF 时仍需真实 Tauri 证明不再反复加载；File Viewer preset-all 还增加多个大 chunk | 使用真实 DOC/DOCX/PPT/PDF/图片/文本样本在浏览器与 Tauri 走查；特别覆盖扫描 PDF OCR 与预览并行、快速切换和删除；确认文件名顶栏两组圆角控制、底部页码导航、资源加载和窄栏布局 | 指定样本加载、分页/缩放/旋转、下载、失败重试、快速切换、删除及窄栏布局均有 GUI 证据，或 PDF fallback 已通过 | PC/Preview |
| P2-PC-Tauri-MSI-Bundle | MSI 已生成并通过 bundle/WiX/baseline 门禁，但本机 all-users 安装权限不足 | 2026-08-24：MSI 220,286,976 bytes；verifier 通过 MSI、target-triple sidecar、模型哈希、manifest、notices、SBOM 与 generated WiX references；五组 fixture 离线 baseline 通过；临时安装返回 Error 1925/1603 | 安装、升级、卸载、安装后 sidecar/OCR 和数据保留仍无法在当前宿主验收 | 在有安装权限的 Windows x64 环境完成 install/upgrade/uninstall、断网 OCR 和 GUI evidence | MSI/安装包安装成功且 Windows GUI 完成登录、主流程、离线 OCR 和数据保留验收 | PC/Release |
| P2-PC-Document-Processing-Validation | C5 FILE Source 调度、Tauri runtime 组装、跨设备恢复和上传已具备代码/自动测试，但真实 Tauri 私有临时目录、MinIO/Server 联调与任务中心 GUI 尚未验收 | `SourceJobScheduler`、`DocumentProcessingRuntime`、`DocumentJobRunner`、`useSourceStore`、`useAssetStore`、全局 `BackgroundParserHost`；2026-09-01 已补充“单个恢复失败不阻塞后续 AWAITING_CLIENT Source”、Profile 本机重试、手动重试前的 Source 同步确认、删除 Source 时取消运行 parser、删除同用户/设备 job、cache 和 parser input；Rust `document_package_begin` 还会在新建 cache 时确保 keyring 中存在原生 master key，且只把 `NoEntry` 视作可初始化的缺失状态。`/api/sync/push` 的 JSON payload 已迁移到 Jackson 3 `tools.jackson`，并有真实 HTTP object payload 与全源码 import 守卫回归；OpenAPI artifact 已重新导出；定向 52/52、PC 回归 165/165、type-check 通过 | 实际下载 URL 生命周期、删除同时上传时的远端收尾、原文件临时目录清理、Asset SHA 回填/异常、应用重启和跨设备接手仍可能暴露运行时差异；系统凭据库被清除时，有加密 cache 的历史任务必须走密钥恢复，不能靠生成新密钥恢复；credential manager 拒绝访问必须报告实际 keyring 错误；Office/PDF renderer 在 Tauri 的资源和性能尚未证明 | 在 Windows Tauri +真实 Server/MinIO 验证 FILE create、OCR 中删除、移动端创建后 PC 接手、断网暂停/恢复、revision 替换和 READY 跳过 OCR；同时覆盖首次启动自动建 key、keyring 拒绝访问，以及清除/恢复系统凭据后的历史任务提示，并检查个人中心状态 | 私有临时文件无残留、删除后本地任务/cache/UI 都不复现、签名 URL 不落库、重启续传不重复 OCR、服务端 complete/indexing 和个人中心状态均有 GUI/日志证据；首次新建 package 与密钥恢复提示均经 Tauri GUI 验证 | PC/Tauri/Integration |
| P2-PC-Auth-Validation-UX | 注册页仍只做非空校验；PC 已统一读取后端 RFC Problem Details 的 `fieldErrors[]`，不再依赖旧 `errors` 对象 | 2026-08-20 Docker 后端联调确认注册请求返回 HTTP 400；2026-08-29 `r4-login-validation` 4/4、PC 全量回归 154/154、type-check/build 通过，登录页已将字段错误映射到 username/displayName/password，并在通用提示中优先展示具体校验信息 | 注册时密码长度等约束仍要等待服务端响应，未影响后端鉴权边界或数据一致性 | 在注册前同步 username/password/displayName 约束 | 注册和登录的客户端预校验与服务器 `fieldErrors[]` 均能在对应表单字段展示；保留服务端校验为最终边界 | PC/Auth |
| P2-Migration-Strategy | Flyway V1 已针对干净 H2 schema 验证，但 PostgreSQL 升级/回滚门禁尚未执行 | `V1__identity_schema.sql`、IdentitySchemaTests、2026-08-12 clean test；未运行 PostgreSQL/Testcontainers | 生产升级/回滚和 PostgreSQL 方言行为仍不可预测 | 在容器集成阶段执行 PostgreSQL clean/migrate/validate、备份恢复和迁移演练 | 干净 PostgreSQL 升级、回滚和备份恢复均有证据 | Data/Infra |
| P2-Infra-Readiness | 无 CI、监控、告警、正式备份演练 | 仓库现状 | 发布与恢复门禁不足 | 建流水线、指标、备份恢复 | 发布演练和告警测试 | Infra |
| P2-Mobile-Build-Warning | Mobile H5/微信构建有动态/静态 import 与 Sass legacy API 警告 | 2026-08-12 `build:h5` 与 `build:mp-weixin` 输出 | 未来打包与 Sass 升级可能出现行为或兼容性问题 | 明确 `useSyncStore` 的加载策略，升级/替换 Sass legacy API | 构建无对应警告，或有记录的接受决定 | Mobile |

| P1-Phase5-External-Infra | 阶段 5 的 PostgreSQL/pgvector、MinIO 主链路、默认容器门禁和 SiliconFlow embedding 单次 smoke 已通过，但真实聊天服务与异常路径未验收 | 2026-08-21 `mvn -B -ntp test` 148/0/0：PostgreSQL 17.11 + pgvector V1→V14 clean/upgrade 与 MinIO 主链路均实际运行；真实 Java Provider 链路调用 SiliconFlow `BAAI/bge-m3` 返回 1 条 embedding | 真实聊天响应、限流/断流网络、对象异常和完整部署拓扑仍可能与基线不同 | 增加 chat smoke、MinIO 异常路径和生产 Compose 验证 | migration、JPA validate、embedding 检索、对象链路、异常路径和真实 Provider 在真实依赖上通过 |
| P1-Phase5-Ingestion-Fencing | 2026-09-27 已加入同事务 Source/job 入队、恢复处理中 Source 补 job、revision/job/generation/attempt/锁后 lease 栅栏及同事务完成 | Server clean 聚焦 114/114、PostgreSQL pgvector 2/2，覆盖入队失败回滚、恢复与迟到结果拒绝；未做真实进程崩溃/长耗时 Provider | 代码级提交/入队及恢复缺口已关闭；真实运行稳定性仍待验收 | 受控环境演练进程重启、重复执行和真实 Provider 超时 | 真实部署验证已提交或恢复的处理中 Source 必有匹配 job，stale worker 无法提交旧结果 |
| P1-Phase5-Provider-Security | BYOK/URL 已具备 HTTPS allowlist、IPv4/IPv6 SSRF、DNS 公网地址过滤与固定连接、重定向关闭/复核、超时和响应体上限；除 Overview 失败事件外，既有 AI 失败日志保留脱敏后的异常类名/message/root cause，Overview 现改为 allowlisted errorCode、关联字段、阶段和 exception/cause 类型；真实网络、限流、审计和密钥轮换仍未验收 | `ProviderEndpointPolicy`、`ProviderHttpClient`、`PinnedSslSocketFactory`、`UrlSourceFetcher`、`AiStreamingService`；2026-08-23 原始异常日志/Authorization 脱敏回归与 `AiStreamingTests` 12/12 通过，真实 SiliconFlow embedding smoke 通过；Task 2 Overview 日志/requestId 安全回归 19/19 | 真实 DNS/证书/代理环境仍可能暴露网络策略或 provider 异常映射问题；截断日志不替代完整上游诊断 | 补受控 DNS rebinding、redirect、超时、429/5xx、日志采集/轮转、审计和密钥轮换专项 | 安全专项测试和生产 secret/网络策略、日志采集记录通过 |
| P1-Phase5-Suggestion-Quality | Suggestions 是确定性基线，未接入真实 LLM、RAG citation 或质量评估 | `SuggestionService` owner check 与 controller 测试通过，返回 citations 当前为空 | 产品可能误认为已具备 AI 总结/提问质量 | 接入受控模型与 RetrievalService，增加 schema、引用正确性、提示注入和人工质量验收 | 质量指标、引用回链和人工样例验收记录完成 |
| P2-Phase5-Stream-Granularity | SSE 回调链和 OpenAI-compatible 上游增量解析已构建，但真实 Provider 网络/证书/背压和前端消费仍未验收 | `AiStreamingService`、`AiController`、`OpenAiCompatibleProvider`、`AiProviderSecurityTests`；2026-08-17 受控 SSE/超时/断流/错误测试通过 | 真实网络断线、代理缓冲、Provider 特有 SSE 变体或客户端背压仍可能影响 UI 流式体验 | 在 R2 受控真实 Provider 环境验证首包、增量、取消、断流、429/5xx、超时和前端消费 | 真实 Provider 的增量、断线、取消、超时、错误事件和前端消费契约通过 |

## 审查结论

- 2026-09-27：PC 全局弹窗重构与模态层优化已落地：基础壳组件 `ModalShell.vue` 布局重写为统一的吸顶常驻标题栏、自适应纵向独立滚动卡片内容区和吸底停靠操作栏；统一接入全局管理器 `modalManager.ts`（支持引用计数多层滚动穿透锁、LIFO 顶层 Escape 捕获、自动入场聚焦与焦点闭环陷阱）与 `modal.css` 令牌系统（Sage `#8B9A6E` 主色调、5 档尺寸与统一按钮/表单控件）；已将 `KnowledgeBlockViewDialog`、`WorkspaceKnowledgeBlockDialog`、`TaskCreateDialog`、`FileRegisterDialog`、`SubjectCreateModal`、`ConfirmDialog`、`ChangePasswordDialog`、`SummaryInstructionDialog` 全部对齐到统一结构与样式；自动化套件 433/433、TypeScript 类型检查、学科图标契约检查、工作区契约检查以及生产打包均全绿通过。P2-PC-Modal-Consistency 风险已通过代码与自动化验证闭环，保留浏览器/Tauri 人工 GUI 走查。

- 2026-09-06：PC 文档调度递归、上传阶段本地失败转换和 Office 文本提取时序已通过 focused Node 42/42；OCR 使用受控 1×1 PNG 走现有 sidecar 协议完成模型预热，Rust 有界诊断通过 OCR 单元测试 7/7，Python sidecar 回归 11/11，`cargo check --lib` 通过。真实 Tauri 中图片 PDF、混合/文字 PDF、DOCX、PPTX 首次处理耗时与最终服务端 READY 尚未重新验收，因此 P2-PC-File-Viewer-Validation 与 P2-PC-Document-Processing-Validation 保持开放；纯图片 Office 在 renderer 无可靠页数时当前明确不支持 OCR fallback。

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

## 2026-09-09 Task 14 Server 同步证据边界

- **P1-Server-Task14-External-Validation**：Source ingestion 状态/安全诊断同步链路已由 H2 集成测试覆盖，Server 全量回归仍受既有架构循环、Docker 不可用和 H2 清理外键错误影响；真实 PostgreSQL、MinIO、realtime broker 和端到端客户端观察未完成。处理：在可用 Docker/真实运行环境执行对应验收并记录事件顺序。关闭条件：真实依赖与端到端事件证据完成。

## 2026-09-09 Task 16 部署运行验证

- **P1-Server-Scheduled-Retention-Transaction**：scheduled `SyncRetentionService` 入口已增加实际事务边界；回归测试先复现 `deleteByCreatedAtBefore` 的 `TransactionRequiredException`，修复后 Spring 代理入口真实删除通过，`SyncServiceTests` 11/11 通过。剩余处理：观察至少一次实际 scheduled run 日志无 ERROR。关闭条件：生产形态日志无该异常；自动事务/删除证据已满足，真实运行证据仍待补齐。
- **P1-PC-Task16-External-Validation**：只读 PostgreSQL 显示现有 READY Source/Job，但历史 change-log 无 SOURCE UPDATE；这些记录早于事件修复。处理：认证用户执行一次新的 FILE reingest/upload，再核对 ordered READY events、PC read sync、local projection 与 GUI。关闭条件：取得真实 Tauri/Server/MinIO/PC GUI 端到端证据。

## 2026-09-09 Task 15 PC 验收边界

- **P1-PC-Task15-External-Validation**：complete accepted 后的单次 background `read` sync 请求已由 focused 自动测试覆盖，回调失败隔离且本地状态仍可到 READY；真实 Tauri sync scheduler、Server/MinIO、realtime 合并与 GUI 状态尚未观察。处理：在真实运行环境完成一次 FILE Source 上传并核对 read pull 与最终 UI。关闭条件：取得端到端现场证据。

## 2026-09-08 Task 5 OCR 验收边界

- **P1-PC-OCR-GUI-Validation**：代码已实现逐页进度、跨空页继续、全空文档 `OCR_DOCUMENT_EMPTY` 和安全诊断复制，focused 自动测试覆盖；但 `1.pdf` 尚未在真实 Tauri GUI 中运行，无法证明 File Viewer、任务中心、重试/失败反馈和真实 OCR 质量。处理：使用真实 Tauri 打开 `1.pdf`，观察页级进度、全空失败和后续页继续。关闭条件：GUI 证据与结果记录完成。
- **P1-PC-OCR-Privacy-Observation**：诊断 formatter、持久化边界和 Rust bounded log 有自动测试，未完成真实剪贴板/accessibility 及日志观察。处理：在 Windows Tauri 会话复制诊断并检查剪贴板、应用日志和 sidecar stderr。关闭条件：确认无 OCR 正文、完整图片路径、`Authorization` 或签名 URL 泄漏，并记录现场证据。

## 2026-09-18 OCR 页进度与 Source 收敛 Task 4

- **P1-PC-OCR-GUI-Validation（仍开放）**：本地-only OCR 页进度投影已由 focused 自动测试验证，Source 行复用既有 `正在识别第 X/Y 页` 文案；未新增百分比或新 UI。真实 Tauri/GUI OCR 进度、真实日志和剪贴板/accessibility 观察仍未完成。处理：在 Windows Tauri 中运行真实 `1.pdf` 并记录页级进度与诊断边界；关闭条件仍为现场 GUI/日志证据。
- **P1-PC-Source-Convergence-External-Validation（仍开放）**：自动测试已证明替换 socket `onopen` 只触发一次既有 background `read` sync，且处理 runtime 的生命周期/scope-guarded 共享有界 reconciliation 可收敛遗漏的 `READY`；focused 90/90、PC 全量 352/352、type-check 与 build 通过。测试使用模拟 socket/local projection，未证明真实后端 WebSocket/event delivery、cursor persistence、Tauri 运行时或跨设备收敛。处理：在真实 Server/Tauri 双设备环境观察断线重连、遗漏事件恢复和最终 Source 状态；关闭条件为端到端事件与跨设备现场证据。

## 2026-09-18 OCR 页进度 Task 5

- **P1-PC-OCR-GUI-Validation（仍开放）**：Store 现在以 `attempt + localContentRevision` 区分 OCR run，仅在允许后续事件的 page/total 与最近有效值一致时保留 projection；同 run 倒退 `before-recognize`（含 totalPages 变化）不覆盖，reader pending、detach、Source 消失和失败清理边界均有回归，Store/UI/coordinator/runtime 68/68、type-check 和 diff-check 通过。自动证据仍未覆盖真实 Tauri/GUI 的 OCR 进度、日志、剪贴板/accessibility 或真实 OCR 质量。处理与关闭条件仍为在 Windows Tauri 运行真实 `1.pdf` 并记录现场证据。

## 2026-09-24 PC 关系星图（KnowledgeGraph）中间圆角边框消除与星空动效升级 Review

- **审查范围**：`Auralis-PC/src/components/subject/KnowledgeGraph.vue`、`Auralis-PC/src/views/Asset/index.vue`。
- **改动性质**：UI 视觉与动效体验优化（消除嵌套卡片圆角边框、HUD 图例胶囊化、60fps 动态星空粒子/能量流光/呼吸光晕/悬浮高亮）。
- **正确性与性能审查**：
  1. **物理与动效解耦**：冻结模块 `knowledgeGraphPhysics.ts` 的力导向物理运算未受任何篡改，原有 180 帧收敛上限逻辑完全保留，收敛后物理步进休眠（0 CPU 额外计算）。
  2. **渲染能耗优化**：Canvas 持续微动效仅基于简单的三角函数与粒子计算，挂载 `document.visibilitychange` 监听，在标签页切出/最小化时立即暂停 `requestAnimationFrame`，避免无谓耗电。
  3. **层级与事件穿透**：毛玻璃 HUD 图例胶囊与适配按钮位于右上角，不遮挡主体星图拖拽与缩放交互；节点文字标签升级为胶囊样式且保留原有拖拽阈值判断，防误触。
- **问题分类**：
  - BLOCKER: 0
  - IMPORTANT: 0
  - OPTIONAL: 0
- **自动化验证结论**：`npm.cmd run test:r4-pc`（403/403 全部通过，包含 `r4-knowledge-graph-force.test.mjs`）、`npm.cmd run type-check`（0 error）、`git diff --check`（无空格/换行告警）。

## 2026-09-24 PC 专注时钟（Pomodoro）温润配色全面对齐、时间轴专属排期联动与自由学习模式 Review

- **审查范围**：`Auralis-PC/src/views/Pomodoro/index.vue`、`Auralis-PC/src/components/pomodoro/TimerCore.vue`、`Auralis-PC/src/components/pomodoro/PomodoroRing.vue`。
- **改动性质**：UI 配色温润对齐（燕麦米白容器、禅意鼠尾草绿/茶歇琥珀圆环、胶囊控制组）与任务过滤体验优化（严格仅展示时间轴排期任务、默认提供「自由学习」心流模式）。
- **正确性与性能审查**：
  1. **数据一致性**：任务列表严格从 `useTaskStore.allTasks` 提取具有 `scheduledAt` 且未完成、未取消的排期任务，并按时间先后有序展示，不篡改 Store 原始任务状态与同步链路。
  2. **自由学习兜底**：使用常量 `FREE_STUDY_TASK` 保证在无时间轴任务时用户仍可顺畅开启专注时钟，不抛出空指针或选择器错误。
  3. **视觉设计遵从性**：圆环与按钮严格遵从温润极简规范（去除原有高饱和橙绿），字体继承全局 `--font-family-base`，不存在硬编码禁用字体。
- **问题分类**：
  - BLOCKER: 0
  - IMPORTANT: 0
  - OPTIONAL: 0
- **自动化验证结论**：`npm.cmd run test:r4-pc`（403/403 全部通过，包含 `r4-dashboard-timeline.test.mjs`）、`npm.cmd run type-check`（0 error）、`git diff --check`（无空格/换行告警）。

### P1-PC-Overview-Server-Deduplication（2026-09-10）

- 优先级：P1。
- 证据：PC 通过 `[FILE_OVERVIEW_TRIGGER]` 记录结构化 allowlist 生命周期；服务为进入 `runFile` 的生成尝试创建 request ID，并由 API 复用到 `X-Overview-Request-Id`。2026-09-27 Server 已在单实例内按 `(user, source, revision, mode, instruction)` 合并进行中请求，Overview 聚焦 45/45 通过。
- 影响：跨 Server 副本的相同请求仍可能同时生成，造成重复 Provider 工作或结果竞态。
- 处理动作：设计跨实例持久协调/幂等策略，并补多副本及真实 Provider 并发生成回归。
- 关闭条件：跨实例同键并发只产生一个有效进行中生成/稳定幂等结果，并取得真实 Server/Provider 证据。

### P1-PC-Overview-Timeout-Mismatch（2026-09-10）

- 优先级：P1。
- 证据：当前 PC Axios 总体 timeout 仍短于 Server 可能包含多次 Provider 调用的 Overview 生成窗口；本任务未改变 timeout 行为。自动 Overview focused 16/16、PC R4 310/310 通过，但不覆盖真实长耗时网络。
- 影响：Server 仍在生成时，PC 可能先超时并将一次可完成的请求表现为失败，且服务端工作可能继续。
- 处理动作：在受控真实 Provider/反向代理环境对齐端到端 timeout、取消和失败语义；确认普通 chat/stream/embedding 的既有 timeout 不回归。
- 关闭条件：长耗时 Overview 在 PC、Server、Provider 和代理链路取得一致成功/超时证据，且普通 AI 路径回归通过。

### P1-PC-Overview-Tauri-Provider-Attribution（2026-09-10）

- 优先级：P1。
- 证据：自动测试验证 TypeScript 封闭类型/已知调用点触发值、request ID header 传递和 coalescing；真实 Tauri 日志、Provider 运行和 Server 关联尚未观察，preflight/skip 事件可能没有 `requestId`。
- 影响：无法确认真实桌面启动、联网恢复、任务变化和手动重试是否按预期归因，也无法确认 Provider 日志能否端到端关联而不泄露敏感信息。
- 处理动作：在 fresh Tauri 运行中覆盖 bootstrap/online/sync/job-change/READY/manual retry，采集脱敏 PC、Server 和 Provider 事件并核对 request ID。
- 关闭条件：真实 Tauri 各触发路径均有正确归因，Provider/Server 日志可关联且无敏感字段，并完成业务验收记录。
### 2026-09-15 最小 JSON 诊断待真实重跑

- 已增加两处临时、非改变行为的证据：Provider 发送前从已序列化 body 记录 `AI_JSON_MODE`（只含 structured JSON、`json_object`、maxTokens/stage）；Overview FINAL 在既有 validator 前对原始 `message.content` 直接执行 `readTree`，记录 `FINAL_JSON_CHECK`（valid、字符数、Jackson 行列和异常类型），不做 fence stripping，因此 fenced JSON 会 valid=false。不记录 body、prompt、正文、原始 exception message、URL 或凭据，普通聊天/流式不变。
- 自动聚焦测试已通过；尚未部署或重跑真实 DeepSeek。若重跑仍失败，应结合 `FINAL_JSON_CHECK valid` 与 `JSON_PARSE`/schema 阶段判断是 JSON 文本非法还是 schema 校验失败；在此之前不引入修复性重试或放宽 validator。

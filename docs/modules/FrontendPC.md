# PC 前端模块

### 2026-09-27 PC 全局弹窗与模态层组件化规范与 UI 视觉/布局重构（Modal & Dialog Optimization）

- **统一模态基础设施建设（Modal Architecture & Design Tokens）**：
  - 新增设计系统模态样式规范 `src/components/modal/modal.css`：建立现代极简禅意（Zen Sage `#5B6C47`、宣纸米白 `#FAF8F5`、深色微光 `#1A1F1B`）全局 Token，提供 `sm`(420px)、`md`(520px)、`lg`(680px)、`xl`(840px)、`auto` 五档尺寸规范与统一的 8px 圆角 `.modal-btn`、`.modal-form-group`、`.modal-form-label`、`.modal-form-input`、`.modal-form-textarea`、`.modal-pill`、`.modal-card-inset` 与 `.modal-markdown-body` 控件规范；
  - 彻底消除生硬线条分割与视觉断层：Header 与 Footer 移除 `border-bottom` / `border-top` 硬线条切块，整体卡片形成一体化无缝呼吸画布；弹窗卡片采用 16px 精确工程圆角（对齐 Linear / macOS）、低反差双层环境漫反射阴影（`0 24px 64px -12px rgba(...)`）；关闭按钮采用 28px × 28px 极简微圆角（6px）幽灵按钮与 5px 定制轻薄圆角滚动条；
  - 新增全局模态状态管理器 `src/components/modal/modalManager.ts`：实现基于引用计数的全局多层滚动穿透锁（`lockBodyScroll` / `unlockBodyScroll`）、后进先出栈（LIFO `modalStack`）的顶层 Escape 捕获（`stopImmediatePropagation`）与焦点闭环陷阱（`trapTabKey` / `focusInitialElement`）；
  - 基础模态壳 `src/components/modal/ModalShell.vue` 布局重构：统一卡片容器结构，顶部无缝吸顶标题栏（`#header` / `#title` 与关闭幽灵圆钮）、中间自适应纵向独立平滑滚动内容区（`.modal-shell-body`）、底部无缝吸底停靠操作栏（`#footer`）；集成入场自动聚焦（优先 autofocus/input/primary btn）、焦点返回触发元素、上传防关守卫（`preventClose` / `beforeClose`）与非空可访问性绑定（`aria-label` / `aria-labelledby`）；
- **业务弹窗系统化提取、UI 视觉与排版重塑（Elevated Business Dialog UIs & Typography）**：
  - **通用确认弹窗**：`src/components/ConfirmDialog.vue` 接入统一外壳 `ModalShell`，移除笨重矩形徽章与内部多重边框，标题栏内嵌精致图标与字号微调（15px/600/-0.01em），正文舒展呈现，搭配次要幽灵按钮与危险/主要 8px 圆角确认按键；
  - **修改密码**：提取 `src/components/profile/ChangePasswordDialog.vue`，增加 `IconShieldLock` 顶栏图标、去边框柔和安全建议横幅与带图标的错误提示条；
  - **提炼指令定制**：提取 `src/components/subject/SummaryInstructionDialog.vue`，增加 `IconSparkles` AI 顶栏、6px 轻量无边框提示词胶囊按钮组（一键点击追加/填入）与字数统计；
  - **排期任务创建**：提取 `src/components/task/TaskCreateDialog.vue`，供 `Dashboard`、`Timeline`、`SubjectWorkspace` 统一复用；增加日历图标顶栏、6px 圆角学科微标签（激活态微浮）、现代紧凑时长滑条与圆角手柄；
  - **文件资产登记**：提取 `src/components/asset/FileRegisterDialog.vue`，供 `Asset` 资产库与 `SubjectWorkspace` 学科工作区复用；重构拖拽区域为轻柔虚线框与 8px 方圆图标，上传中启用动态呼吸绿点（`pulse-indicator`）与轻薄进度条，上传失败保留表单；
  - **知识块卡片查看**：提取 `src/components/knowledge/KnowledgeBlockViewDialog.vue`，消除内层多重嵌套滚动条与卡片框中框，内容直接在卡片无缝流转，底部配置优雅复制与确定按钮；
  - **工作区知识块流转**：提取 `src/components/knowledge/WorkspaceKnowledgeBlockDialog.vue`，消除浏览态嵌套滚动条与硬横线，调色盘升级为现代微圆点；
  - **学科空间创建/编辑弹窗升级**：`src/components/subject/SubjectCreateModal.vue` 接入统一外壳 `ModalShell`，顶层预览收敛为现代紧凑微卡片，8 列图标选择网格升级为 8px 圆角轻触按键；
- **测试与契约兼容（Compatibility & Guardrails）**：
  - 严格保持各宿主页面对外 props、emits 与既有测试断言正则完全兼容；
  - 全量自动化测试回归（433/433 测试通过），`npm run type-check` 0 错误，`check:subject-icons` 与 `check:subject-workspace` 全绿，`npm run build` 生产构建成功。

### 2026-09-27 时间轴交换与 Suggestions 入口

- 时间轴双任务交换成功后，本地 SQLite 在同一事务中写入两条服务端返回的 TASK；浏览器存储一次提交完整状态。遇到未解决的本地 mutation 时整批拒写并刷新本地投影；本地事务失败后对两项服务端结果一次更新内存投影，触发增量同步恢复，避免半交换持久化。真实 Tauri GUI 与双设备联调待验收。
- Suggestions 当前未达到真实生成和引用质量要求；PC 界面无入口，`aiClient` 暂不导出调用封装。服务端基线接口仍在 API 契约中。

### 2026-09-26 首次同步与 AI 参考范围等修复

- 新设备没有本地 cursor 时使用完整 snapshot bootstrap，保留未解决 mutation 并刷新五类资源 Store；Tauri SQLite 替换同时保护 `inflight` 投影。已有 cursor 继续增量 pull，reset 继续使用 snapshot。
- 学科工作区当前文件保持 `AUTO`；显式多文件请求包含当前文件与所选 READY Source，最多 100 份；显式全学科才请求学科范围，未引用资料时不启用检索。
- Overview 单次 HTTP 请求超时为 300 秒。FilePreview 显示名变化不重读内容；通用 API 的服务/网络错误进入侧栏连接状态，按请求序号处理并发响应，取消请求不改状态。
- 个人空间 JSON 导出说明限定知识块和任务；密码说明为单向哈希保存；AI 请求说明为经 Server 转发。代码、定向测试及类型检查通过，真实 GUI/双设备/Provider 验收仍待完成。

### 2026-09-25 AI 聊天 Provider 配置

- 个人空间只提交 Provider、公网 HTTPS Base URL、聊天模型和可选 API Key；不再保存或提交用户 Embedding 模型。通用兼容服务须明确填写 Base URL 和聊天模型，DeepSeek 与 SiliconFlow 留空 Base URL 时使用各自默认地址。
- “自动检测”仍是可选的 `/models` 辅助；“测试连接”在保存当前配置后调用服务端聊天测试，并依据返回的 `chatModel` 展示结果，不以模型列表数量判断连通。
- PC 定向测试和类型检查已通过；真实服务商与 GUI 尚待验收。

### 2026-09-25 顶栏头像真实映射与右上角在线状态点移除

- **顶栏真实头像映射与响应式全站同步**：
  - 在 `useAuthStore.ts` 中新增全局响应式 `avatarUrl` 状态、`loadAvatar()` 与 `setAvatarUrl()` 方法；
  - 在用户登录成功（`setSession`）以及顶栏组件挂载（`AppHeader.vue` 的 `onMounted`）时，若已认证则通过 `useAuthApi.getAvatarBlob()` 读取服务端图片 Blob 并转换为安全的 ObjectURL 赋给 `authStore.avatarUrl`；若未设置或 404 则静默降级展示首字母；
  - 退出登录（`clearSession`）时自动调用 `URL.revokeObjectURL` 释放 Blob 内存，防止内存泄漏；
  - 个人中心 `Profile/index.vue` 在头像上传（`uploadAvatar`）、重新拉取（`loadAvatar`）及重置头像（`resetAvatar`）时，同步调用 `authStore.setAvatarUrl`，确保个人中心操作立即全局联动到页面右上角顶栏；同时在组件卸载时避免注销全局共享的 ObjectURL；
- **彻底移除右上角状态圆点**：
  - 在 `AppHeader.vue` 模板中彻底移除 `<span class="avatar-status"></span>` 绿色在线圆点节点，并从 `<style scoped>` 中清除所有 `.avatar-status` 样式规则，保持纯净禅意视觉。

### 2026-09-25 首页已完成任务勾选状态与历史排期校验豁免

- **已完成任务写屏障**：在 `useTaskStore.ts` 的 `persistOffline` 中对已完成任务（`model.status === 'DONE'`）豁免过去的排期校验（`assertScheduledAtIsNotPast`），消除因排期时间处于过去时无论自动恢复还是手动点击勾选均报错“不能排期到过去的时间”的问题；引入 `isSameScheduleTime` 时间戳规整比较；
- **规范完成状态全域收敛**：`taskViewRules.ts` 中的 `isActionableTask` 与 `isSchedulableTask` 统一采用 `!isCompletedTask(task)`，彻底消除服务端或本地规范状态 `'DONE'` 的已完成任务被误当作活动待办或可调度项的漏洞；
- **首页指标与待办呈现**：首页看盘顶部 `completedCount` 与 `totalFocusHours` 采用 `isCompletedTask` 正确统计已完成任务；待办清单 `.todo-item` 移除复选框与点击完成，保持纯净待排期信息展示。


### 2026-09-25 个人空间头像读取媒体类型

- `useAuthApi.getAvatarBlob` 仍按 Blob 读取私有头像，但本请求显式设置 `Accept: image/png, application/problem+json`，覆盖通用 JSON 默认头，匹配后端 PNG 成功响应并允许无头像时返回 Problem Details。

### 2026-09-25 完成任务分组与首页日程恢复检查

- 资产库任务目录的“已完成”判断优先于“未排期”，完成任务即使没有 `dueAt` 和 `scheduledAt` 也进入“已完成”；任务树的完成标记使用相同谓词。Task Store 接收到 TASK 投影刷新时重载本地任务并立即重试到期完成检查，首页日程复选框继续从任务完成状态派生。已结束且已完成的排期任务不能取消完成，首页与资产库控件应显示该限制。规范 `DONE` 与展示 `completed` 的本地/同步路径已做动态测试，GUI 待验收。

### 2026-09-25 Timeline 排期任务结束后自动完成

- `taskViewRules.isScheduledTaskPast` 使用 `scheduledAt + durationMinutes <= now` 判定结束，避免进行中提前完成；Task Store 在本地任务加载后立即恢复，运行中每分钟复查。单项保存失败不阻断其他任务；自动完成与手动编辑/改期共享变更队列，提交前重读本地 TASK 行并由仓储版本及 outbox 状态条件拒绝同步期间的旧快照；增量 pull 落库时再次核对未解决本地写入，保留已完成任务原排期。

### 2026-09-25 PC 个人空间与设置页 10 类前端真实链路打通与闭环

- **账户资料（3 类）真实服务端流转**：
  - **昵称**：`saveNickname()` 接入 `useAuthApi.updateProfile`（`PUT /api/auth/me`），携带当前 `baseVersion` 与 `displayName`，处理 409 `RESOURCE_VERSION_CONFLICT` 并同步更新 store 与本地视图；
  - **头像**：接入 `useAuthApi.getAvatarBlob`（`GET /api/auth/me/avatar`）在挂载时动态读取真实图片 Blob 并转为安全的 ObjectURL；上传接入 `useAuthApi.uploadAvatar`（`POST /api/auth/me/avatar`），客户端校验 PNG/JPEG 且 ≤5MB；重置接入 `useAuthApi.resetAvatar`（`DELETE /api/auth/me/avatar`）；彻底废弃本地 localStorage 存储头像数据；
  - **改密**：客户端密码校验升级为 12~200 位，接入 `useAuthApi.changePassword`（`PUT /api/auth/password`），传递 `baseVersion`、`currentPassword` 与 `newPassword`，密码更新后提示会话撤销边界并刷新版本。
- **AI 设置（3 类）服务端规范化与真实探测测试**：
  - **Provider 归一化**：在 `aiClient.ts` 中提供 `normalizeProvider`，将自由输入与通用兼容端点映射为服务端支持的 `OPENAI_COMPATIBLE`，识别 DeepSeek 和 SiliconFlow，保持界面友好名称展示；
  - **模型自动检测**：`handleDetectModels()` 接入 `listAiModels`（`GET /api/ai/settings/{provider}/models`），从已加密保存的云端 BYOK 获取真实 `/models` 列表并渲染模型托盘；未配置时给出明确引导，彻底消除硬编码 mock；
  - **连通性测试**：`handleTestConnection()` 接入 `testAiConnection`（`POST /api/ai/settings/{provider}/test-connection`），依据服务端聊天请求返回 `{ reachable, chatModel }` 反馈，展示真实上游异常。
- **数据与状态（4 类）完整闭环**：
  - **知识块与任务 JSON 导出**：`handleExportData()` 同时加载 `knowledgeStore.recentBlocks` 与 `taskStore.allTasks`，导出元数据、知识库块与排期任务；不包含原始文件或导入恢复能力；
  - **两级清理分层解耦**：“清理本地缓存”（`handleClearCache`）仅清理本地渲染缓存与临时会话日志；敏感区“清除本地离线数据”升级为独立高危处理器 `handleResetOfflineData()`，高危二次确认后重置离线存储，标记 `syncStore.resetRequired = true` 并触发全量快照拉取；
  - **注销账户**：`handleDeleteAccount()` 接入 `useAuthApi.deleteAccount`（`DELETE /api/auth/me`），提交密码验证，处理 HTTP 202 Accepted 异步受理，清空本地会话并重定向至登录页；
  - 注销确认密码不匹配的 401（Problem Details `code=UNAUTHENTICATED` 且 `detail=Invalid credentials`）保留当前页面与登录会话并显示接口错误，不触发全局 access token 刷新、重放或登录页跳转；Bearer token 无效时仍沿用全局 401 会话恢复；
  - **响应式同步状态**：`sync_status` 动态绑定 `syncStatusText`，自适应呈现“正在与云端同步...”、“已同步 · 状态正常”、“同步异常”与“需重置同步”，并配置异常警告样式。
- **验证与门禁**：新增定向测试 `scripts/r4-profile-live-links.test.mjs`，PC 全量回归 `npm.cmd run test:r4-pc`（406/406 全量通过），`npm.cmd run type-check` 与 `git diff --check` 全部退出 0。真实外部模型与人工 GUI 体验待验收。

### 2026-09-24 PC 个人中心与系统设置（Profile / Settings）全量 Tabler 图标升级与禅意双栏布局重构

- **右侧设置工作台纯粹排版与去图标化（Clean Typography Without Icons）**：
  - 彻底去除右侧分项设置卡片标题前面的图标小胶囊（`.group-icon-pill`），保持「外观与显示」、「同步与备份」、「AI 引擎体验」、「系统通知」、「AI 模型引擎 (BYOK)」、「登录会话管理」、「敏感与危险操作」纯文字标题排版；
  - 移除会话行设备图标，移除退出登录、清除缓存、注销账户按钮内的操作图标，打造纯粹极简文字禅意界面；
  - 左侧看板保留核心指标与连续专注的高雅语义微图标。
- **禅意极简自适应满屏双栏布局重构（Full Viewport Responsive Layout）**：
  - **自适应占满页面与整站标准对齐**：彻底去除原写死的 `max-width: 1240px` 局限居中框，与 `Timeline`、`Asset`、`Dashboard` 保持统一的 `100%` 满屏网格规范（`padding: 10px; gap: 10px;`，页面底色 `#EEEEEE`）；
  - **左右双栏弹性延展与空间比例调优**：左侧数据透视看板由 `360px` 拓宽至 `480px`，右侧分项设置工作台通过 `flex: 1; min-width: 0;` 弹性自适应铺满屏幕剩余空间；右侧设置子项增加 `max-width: 960px; margin: 0 auto;` 黄金视宽约束，在各类超宽屏幕下避免拉伸变形；
  - **左侧数据透视看板精细化**：去除写死的 `SC` 与跑马灯伪旋转光圈、去除无依据的伪等级，真实提取用户名称首字母（头像扩大至 64px），核心指标模块升级为微光包裹图标（`.stat-icon-wrap`）并配备 Hover 微立体悬浮；柱状图扩高至 112px，条柱圆角化与今日高光突显；彻底移除底部冗余的 AI 提示语卡片（`.insight-card`），呈现利落专业看板；
  - **右侧功能模块系统化重整与分段导航**：
    - 顶栏配备分类快速定位条（`全部`、`界面偏好`、`系统通知`、`数据同步`、`AI 引擎`、`账户安全`），支持快速平滑滚动跳转；
    - 系统性重整功能层级：四大业务中枢（界面偏好、数据同步、AI 智能、账户安全），消除原 AI 体验与 BYOK 引擎割裂、文件解析孤立等混乱排版；
    - 消除因 Flex 纵向弹性收缩导致的行高塌陷 Bug：右侧容器改为块级自适应纵向流动（`display: block` 与子元素 `flex-shrink: 0`），设置组、会话卡片与操作行设置 `min-height: 52px` 坚实保底约束，页面超高时由外层容器自适应独立滚动，彻底杜绝内容被挤压成细缝或被溢出裁剪；
    - 所有设置组与 AI BYOK 模块均升级为 `#FAF7F2` 圆角卡片，行间距均匀自然，悬浮态微光反馈；
    - 控件现代化对齐：Toggle 开关全新平滑药丸滑块（开启态呈现 `#8B9A6E`），下拉框与输入框圆角化并配备聚焦柔光，操作按钮升级为温润胶囊药丸；
    - 敏感与危险操作整合在底部浅绯红柔和告警卡片中，兼具清晰醒目与整体美学统一。
- **全量测试与验证**：`npm.cmd run test:r4-pc`（403/403 全量通过）、`npm.cmd run type-check`、`git diff --check` 全部退出 0。

### 2026-09-24 PC 专注时钟（Pomodoro）禅意极简配色重构、时间轴智能感知与版面尺度调优

- **禅意极简配色重构（Zen Minimalist Color Palette）**：
  - 将原高饱和度亮橙与荧光绿替换为温和内敛的鼠尾草绿与暖琥珀茶色：沉浸专注态使用 Zen Sage（`#8B9A6E`），茶歇时刻使用 Warm Amber Tea（`#C89B6D`）；
  - 页面背景维持 `#EEEEEE`（`--color-bg-secondary`），左右核心大底板（`.timer-core` 与右侧卡片）统一为 `#F7F2EB`（`--color-bg-primary`），卡片内部药丸与选择器对齐为 `#FAF7F2`（`--color-bg-tertiary`）；
  - 控制按钮升级为温润立体药丸按钮（圆角 `9999px`，主操作按钮采用高雅渐变与漫反射柔影，次级按钮采用温润纸色微阴影）。
- **时间轴任务智能感知与自由学习集成**：
  - 任务下拉选择器严格过滤出时间轴上已排期（具有有效 `scheduledAt`）且未完成、未取消的任务，按排期时间由近及远升序排列；
  - 补充内置「自由学习」（`free-study`）专属任务项；
  - 默认任务智能感知：初次加载或时间轴变动时，自动探测当前时刻处于时间区间（`[start, end)`）内的进行中任务；若当前未在执行区间则匹配 10 分钟内即将开始的任务；若无正在进行或即将进行的排期任务，则默认选中「自由学习」；
  - 保护用户手动选择：一旦用户主动选择特定任务，锁定选择状态，避免后台任务刷新覆盖用户意图。
- **视觉排版纯净度与空间比例调优**：
  - 移除任务选择区多余的「时间轴联动」标签徽标；
  - 修复当前专注任务横幅（`.active-focus-banner`）布局与折行缺陷：消除长标题挤压导致「已排期」胶囊纵向折行（`已排\n期`）的严重 UI 瑕疵，将任务标题与状态/时间解耦为两行排版（标题独占上层并支持两行平滑换行，下层由 `white-space: nowrap` 的状态胶囊紧随排期时间），兼顾长标题可读性与标签完整性；
  - 移除横幅中所有多余装饰性图标，保持极简纯文字排版；
  - 左侧时钟列比例调大：左侧宽度由 `flex: 1` 拓宽至 `flex: 6.4`（右侧 `flex: 3.6`，间距 `64px`，容器最大宽度 `1240px`）；
  - 时钟圆环与时间字号扩大：圆环尺寸由 `320px` 扩大至 `440px × 440px`，时间数字字号扩大至 `clamp(76px, 8.5vw, 92px)`（字重 700，字间距 `-2px`）；
  - 中间状态小圆点胶囊（`.ring-pill`）位置调高（`bottom: 64px`），使指示药丸处于时间数字下方平衡位置，消除靠贴底部圆弧的下沉感。
- **全量测试与验证**：`npm.cmd run test:r4-pc`（403/403 全量通过）、`npm.cmd run type-check`、`git diff --check` 全部退出 0。

### 2026-09-24 PC 关系星图（KnowledgeGraph）中间圆角边框消除与星空动效升级

- **中间嵌套圆角边框消除与无缝沉浸式画幅（`KnowledgeGraph.vue` & `Asset/index.vue`）**：
  - 彻底移除 `KnowledgeGraph.vue` 内部原写死的 `.knowledge-graph-wrapper` 边框（`border: none`、`border-radius: 0`、`background: transparent`），彻底消除嵌在右侧面板中间多余的圆角边框线，实现图谱与外部容器的无缝融合；
  - 精简悬浮遮罩：移除原本带有生硬边框且与顶栏文字重复的 `.overlay-header` 矩形卡片，升级为极简毛玻璃胶囊 HUD（`.hud-legend`，`border-radius: 9999px`，柔和高斯模糊与微边框），配合右下角轻量胶囊按钮（`.fit-button`），呈现通透纯净星空视野。
- **星空图谱全量动效升级（Canvas Dynamic Animation）**：
  - **星轨流动能量光子（Constellation Photons）**：在所有知识关联连线上引入沿轨迹平滑循环流动的光子脉冲微动效，呈现生生不息的思维流动与知识联结感；
  - **星宿天体呼吸光晕（Node Breathing & Auras）**：所有节点引入有机正弦微呼吸动效（半径微脉动），学科核心天体配备双层径向柔光光晕（Radial Gradient Halo）；
  - **交互聚焦高亮网络（Focus Highlighting）**：鼠标悬浮任意节点时，自动高亮该节点并绽放外延脉动光环，点亮所有直连连线与邻居节点，其他无关节点与连线柔和半透明弱化（`alpha: 0.28`），带来极具科技感与禅意聚焦体验；
  - **微星尘背景与 60fps 高性能平滑渲染**：画布背景散布 28 颗微星尘随视口缩放与平移微光闪烁；采用连续 `requestAnimationFrame` 渲染，物理模拟收敛后物理开销自动归零，页面失焦/隐藏时自动挂起，兼顾绚丽动效与低能耗。
- **全量测试与验证**：`npm.cmd run test:r4-pc`（403/403 全量通过）、`npm.cmd run type-check`、`git diff --check` 全部退出 0。

### 2026-09-24 PC 资产库（Asset Studio）知识块与任务编辑排版重构、标签精简与任务所属学科自选

- **知识块与任务编辑区现代化排版重构（`Asset/index.vue`）**：
  - **顶栏去重与动作归拢**：重构中栏 `.detail-header`，彻底消除原标题与编辑框重叠展示的双重标题 Bug 及双保存按钮冗余；自适应提取为顶部工作条，知识块展示纯净面包屑路径（`知识库 / 学科`）、字数统计与保存按钮，任务展示状态切换胶囊（待处理/已完成）、截止日期/预计用时徽标与保存按钮；
  - **知识块顶部标签精简**：移除纸张卡片顶部多余的 `# {{ tag }}` 标签徽标，保持纯净学科胶囊与沉浸式笔记排版；
  - **任务所属学科与预计用时自选与圆角禅意下拉栏**：在任务属性工坊中，将原本只读的所属学科及原生的预计用时均升级为定制禅意圆角下拉选择器（`<el-select class="zen-select" popper-class="zen-select-popper">`）；触发胶囊采用 `border-radius: 9999px` 胶囊设计与 `#FAF7F2` 温润宣纸底色，下拉浮层采用 `border-radius: 16px`、内含 `10px` 选项圆角与自然微投影；修复暗色选择器在 Vue scoped 样式下祖先选择器剥离导致的浮层底色异常，确保浅色模式下始终呈现纯净米白底色与 `#8B9A6E` 鼠尾草绿悬浮高亮；在 `useTaskStore.ts` 的 `updateTaskDetails` 中支持 `subjectId` 字段流转与离线持久化同步；
  - **统一温润纸张画布（`.editor-paper-card`）**：采用 `#FAF7F2` 米白宣纸底板、20px 圆角与立体微阴影，以 860px 宽度居中呈现，建立清晰的内容视觉承载面，消除原标题漂浮、内容孤立的碎片化排版；
  - **任务属性工坊（Property Panel）**：采用 Notion/Linear 风格结构化属性面板，集成禅意圆角截止日期选择器、禅意圆角预计用时下拉选择与圆角所属学科选择器，并通过导轨与小节标签清晰隔开下方“任务备注与详细说明”编辑框；
  - **沉浸式滚动条全量隐藏**：全面清除资产库中栏滚动区（`.middle-content-scroll`）、左右侧栏容器、笔记/任务备注文本域（`.paper-textarea`、`.task-notes-textarea`）以及下拉面板（`.zen-select-popper` 的虚拟滚动轨道 `.el-scrollbar__bar`）的滚动条视觉露出，保留自然流畅鼠标滚轮与触控滚动，彻底消除突兀滑条。
- **全量测试与验证**：`npm.cmd run test:r4-pc`（403/403 全量通过）、`npm.cmd run type-check`、`git diff --check` 全部退出 0。

### 2026-09-24 PC 资产库（Asset Studio）温润配色全面对齐与关系星图拓宽

- **资产库（`Asset/index.vue`）主内容与卡片背景层级解耦、配色对齐与星图拓宽**：
  - 页面背景维持 `#EEEEEE`（`--color-bg-secondary`）；
  - 三栏容器（`.studio-left`、`.studio-middle`、`.studio-right-context`）统一为 `#F7F2EB`（`--color-bg-primary`），修复 `.middle-content-scroll` 误用 `#EEEEEE` 导致的灰底割裂；
  - 关系星图拓宽：移除 `<aside class="studio-right-context">` 原写死的内联 `style="width: 450px;"` 与标题栏 `style="background: var(--color-bg-secondary);"`，将宽度提升至 `540px`（+90px，拓宽 20%），为力导向节点与知识卡片提供开阔视野；
  - 卡片模块、输入框与模态框底色对齐：`.search-input`、`.editor-content-wrapper`、`.block-row`、`.task-row`、`.inline-block-editor`、`.modal-container`、`.styled-input`、`.styled-textarea`、`.subject-capsule-item` 统一对齐为 `#FAF7F2`，并添加微阴影；聚焦轮廓收敛为 `#8B9A6E` 发光；
  - 全按钮与组件库主题收拢：主按钮 `.btn-primary` 与保存按钮采用 `#8B9A6E` 渐变及阴影，次级按钮采用 `#FAF7F2`；统一 Element Plus 日期选择器与弹出层的 hover/focus/selected 强调色；
  - 修复 `KnowledgeGraph.vue` 中 `down` 交互状态缺失 `pointerId`、`startX`、`startY` 的 TypeScript 检查报错。
- **全量测试与验证**：`npm.cmd run test:r4-pc`（401/401 全量通过）、`npm.cmd run type-check`、`git diff --check` 全部退出 0。

### 2026-09-24 PC 任务编排中心（Timeline）配色三层级对齐、待安排栏加宽与全卡片按钮底影优化

- **任务编排中心（`Timeline/index.vue`）主内容与卡片背景层级解耦、对齐与立体微阴影调优**：
  - 页面背景维持 `#EEEEEE`（`--color-bg-secondary`）；
  - 主内容大底板（`.timeline-header-card`、`.timeline-column`、`.tasks-column`、`.weekly-overview-column`、`.weekly-column`、`.weekly-bottom-dock`、`.kanban-column`）统一为 `#F7F2EB`（`--color-bg-primary`）；
  - 待安排任务栏加宽：`.timeline-body` 列宽定义由 `280px 1fr 340px` 调整为 `280px 1fr 400px`，右侧「待安排任务块」（`.tasks-column`）宽度增加 60px，消除卡片内部信息拥挤；
  - 全卡片与模块底部立体阴影：任务卡片（`.slot-task`、`.weekly-task-card`、`.pending-card`、`.kanban-task-card`）、周视图列卡片（`.weekly-column`）、周概览行（`.weekly-overview-row`）、周底坞任务胶囊（`.pending-pill`）、统计微胶囊（`.stat-pill`）、学科胶囊（`.subject-capsule-item`）及知识关联徽标（`.kb-relation-badge`）全量配置分层微阴影（`0 2~4px ...`），悬浮态抬升伴随扩散投影，使纸张模块自然浮于底板之上；
  - 全交互按钮底部立体阴影：主按钮 `.btn-primary`、次级按钮 `.btn-secondary`、视图切换栏 `.view-toggle` 与切换胶囊 `.toggle-btn`、日期胶囊 `.day-btn`、自动顺延按钮 `.btn-auto-delay`、弹窗确定/取消按钮 `.task-btn-submit`/`.task-btn-cancel`、时长交互条 `.duration-long-bar-btn`、关闭与删除小圆钮均补齐微阴影与高亮悬浮投影，彻底消除死白无边界扁平感。
- **全量测试与验证**：`npm.cmd run test:r4-pc`（401/401 全量通过）、`npm.cmd run type-check`、`npm.cmd run build`、`git diff --check` 全部退出 0。

### 2026-09-24 PC 学科中心与总览视图配色层级修正

- **学科中心（`SubjectHall/index.vue`）与总览（`OverviewSummaryView.vue`）主内容与卡片背景分离**：
  - 页面背景维持 `#EEEEEE`（`--color-bg-secondary`）；
  - 主内容大底板（`.hall-content` 与 `.overview-summary-view` 及其头部）恢复并对齐为 `#F7F2EB`（`--color-bg-primary`）；`FilePreview.vue` 在 bare 模式下容器 body 背景同步对齐为 `#F7F2EB`；
  - 卡片模块、搜索输入框、新建学科卡片、知识块卡片与总结卡片维持温润米白宣纸色 `#FAF7F2`（`--color-bg-tertiary` / `--bg-card`），使卡片在 `#F7F2EB` 大底板上自然显现温和纵深与立体浮起感。
- **全量测试与验证**：`npm.cmd run test:r4-pc`（401/401 全量通过）、`npm.cmd run type-check`、`npm.cmd run check:subject-icons`、`npm.cmd run check:subject-workspace` 全绿无报错。

### 2026-09-24 紧邻任务交换

- 顶部交互栏交换两个首尾紧邻任务时，服务端按交换后的顺序在原共同时间窗口内紧凑重排，保持窗口起止不变。PC 不再用“直接互换开始时间”的本地预检阻断时长不同的紧邻任务；提交版本后采用服务端返回的两项排期时间刷新本地投影。非紧邻任务仍按现有交换规则处理，失败不改本地状态。

### 2026-09-24 Timeline 任务主体放置规则

- 任务卡片主体落点使用目标任务 ID 发起严格放置：被拖任务接在目标结束后的首个半小时槽，目标及其他任务保持原位；若被拖任务完整时长与后续排期冲突，服务端拒绝且 PC 保留原状态。主体提示显示目标结束槽与冲突拒绝规则。普通空白时间槽继续使用原有插入顺延；仅 `.task-header` 交换。
- `r4-task-store-schedule.test.mjs` 定向验证主体落点携带目标任务 ID；服务端负责最终冲突判断。真实 GUI 拖放仍需人工验收。

### 2026-09-24 PC Timeline 日视图固定刻度轴与卡片网格跨越编排

- `Timeline/index.vue` 移除 `.time-slot` 上的 `v-show="!isSlotCovered(slot.time)"`，日视图固定呈现 08:00–22:30 全部 30 个半小时刻度槽位行，彻底消除长任务导致后续刻度断档隐藏的问题。
- 刻度行固定为 `height: 80px; min-height: 80px; flex-shrink: 0;`，配合 4px 垂直间隙与 1px 虚线导轨，刻度行不随任务存在而被压缩或隐藏；`.slot-time` 引入 `font-variant-numeric: tabular-nums` 保证时间数字等宽严整对齐。
- 任务卡片 `.slot-task` 改为自起始槽位的 `.slot-right-container` 绝对定位跨越网格（`top: 0; left: 0; right: 0; z-index: 10`），高度精确匹配 `getTaskHeight(slot.task.duration)`（`slots * 80 + (slots - 1) * 4 - 6`px），在视觉上自然向下跨越对应的网格槽位，且左侧时间标尺的所有半小时刻度完整可见。
- 交互分流：卡片顶部 `.task-header` 作为文字区域独立处理原子交换；主体按本文件最新规则放到目标之后，普通空白槽位保留原有插入顺延。覆盖槽位保留已完成任务守卫。
- 自动化测试与构建门禁：全量回归 `npm.cmd run test:r4-pc` 397/397 通过，`npm.cmd run type-check`、`npm.cmd run build` 及 `git diff --check` 全部退出 0。

### 2026-09-23 PC 排期区间重叠防护

- `taskViewRules.ts` 增加半开时间区间冲突判断，所有未取消的已排期任务（包括已完成且固定的任务）均占用 `[scheduledAt, scheduledAt + durationMinutes)`；相邻任务可首尾相接。
- `domainMappers.ts` 将远端 null/缺失或非整数、负数、超出 Java `Integer` 范围的时长按服务端默认值 30 分钟归一；API 合法的 0 分钟保持原值。这样本地冲突判断与服务端空时长的有效区间长度一致。
- `useTaskStore.ts` 在本地创建/更新持久化边界检查新增或变化的排期区间，覆盖新建任务、改动已排期任务时长、按槽排期、按天排期与空槽改期；这些本端排期相关操作由 Store 队列串行执行，并在 repository 初始化后复核。按天排期按 30 分钟递增寻找无冲突的槽位。
- 未排期任务拖到已占用槽位会被拒绝并提示先将原任务移出日程；不再分两次写入“移出原任务、安排新任务”，避免第二次本地提交失败时原任务丢失排期。
- 双任务换位由服务端原子校验换位后双方区间与其它任务及彼此均无重叠；冲突时服务端拒绝，内存与本地投影保持原样。
- `r4-task-store-schedule.test.mjs` 直接验证半开区间相邻、真实交叠、取消任务忽略和换位排除规则。
- 现有已重叠数据不会被自动重写；后续读取仍保留原投影，用户调整到无冲突区间后即可正常保存。

### 2026-09-23 PC Timeline 插入顺延与头部交换分流

- `Timeline/index.vue` 将日视图任务卡片主体及普通时间槽设为插入落点：待排期和已排期任务都调用 `useTaskApi.scheduleInsertions`，由服务端单事务将落点之后的任务连锁顺延。`.task-header` 单独处理 drop 并停止冒泡，只有从已有排期拖到另一个任务头部才调用 `schedule-swaps`；待排期任务拖到任务头部会明确提示需要已排期任务。
- `useTaskStore.ts` 为插入请求提交源任务 `baseVersion`、目标 `scheduledAt` 与当天本地 08:00–22:30 的 UTC 窗口。发请求前检查源任务和目标日的本地 Repository/outbox；存在未同步、冲突或错误状态时拒绝，以免服务器批量更新覆盖本地未提交任务。过去时段、已完成任务及顺延会移动的已完成固定任务仍被拒绝。
- 成功后将服务端返回的全部变化 Task 以 `synced` 状态安全 upsert 到本地 Repository，再更新内存投影并触发 read sync。若服务端已提交但本地 upsert 失败，仍显示服务端响应、触发 read sync，并提示“排期已在服务端保存，本地刷新中”；API 失败则不改本地状态。
- `r4-task-store-schedule.test.mjs` 覆盖插入和交换入口分离、落点日 pending outbox 防护、服务端响应缓存与 header 独立 drop/冒泡阻断。

### 2026-09-23 PC 学科大纲保存数据保留、大纲草稿生命周期、首页移出日程精准寻址与学科切换文件隔离

- **学科大纲（`SubjectWorkspace/index.vue`）保存数据保留、消除伪轮转覆写与大纲同步清理**：
  - 扩充 `OutlineSection` 包含 `summary?: string | null`、`sourceIds?: string[]` 与 `locator?: OverviewLocator | null`；
  - `initSubjectOutlineFromExisting` 在载入综合大纲或单文件大纲时，完整保留 `sourceIds` 数组，以及小节 `summary` 和 `locator`；
  - `saveCurrentOutline` 保存时优先保留小节原有的 `summary`、`sourceIds`（非空优先）与 `locator`，不再清空置空，并补充非空与保存中防重守卫；
  - 编排模板支持对小节已关联的每一个文件展示文件胶囊标签与独立解除关联按钮，并在关联/解除时同步维护 `sourceIds` 集合与 `fileId` 回退；
  - 彻底移除早期原型遗留的 `syncOutlineFileLinks` 及其在 `onMounted`/`watch(subjectId)` 的调用，严禁按章节顺序对已有大纲小节进行无脑伪轮转重设文件 ID；
  - 在 `watch(subjectId)` 入口第一行**立即同步清空** `subjectOutline.value = []` 及文件大纲草稿，绝不在 `await startFreshChatSession()` 等异步等待期间残留旧大纲，杜绝跨学科异步串写草稿漏洞。
- **学科切换期间 AI 请求旧文件隔离与跨学科校验（`SubjectWorkspace/index.vue`）**：
  - 在 `watch(subjectId)` 入口第一行同步触发 `chatStore.abortStream()`、`chatStore.clearActiveConversation()`、清空 `selectedFileId`、`selectedAiSourceIds`，并调用 `sourceStore.clearActiveSourceFiles()`，阻断旧会话流式与状态残留；
  - 在 `sendChat`、`retryChat`、`sendSelectionQuestion` 以及 `saveKnowledgeBlock` 请求组装时增加严密的归属双重校验：关联的 `sourceId` 必须能在当前 `activeSourceFiles` 中找到且 `subjectId` 与当前学科一致，否则严格过滤置空，彻底杜绝切换等待期将旧文件 ID 携带进新学科请求的竞态问题。
- **首页移出日程（`Dashboard/index.vue` & `useTaskStore.ts`）按任务 ID 精准寻址与异常反馈**：
  - `useTaskStore.ts` 的 `unscheduleTask(idOrSlotTime)` 升级为优先通过 `findTask(idOrSlotTime)` 匹配任务，未命中时回退按 `timeSlots` 槽位查找；
  - `Dashboard/index.vue` 的 `handleRemoveSchedule` 改造为直接传递点击卡片的唯一 `task.id`，彻底解决同时间槽多任务时的串操作风险与首项已完成时点击项无法移出的问题；
  - 发生移出异常时，通过 `ElNotification` 区分弹出“已完成的排期任务已固定”警告或具体持久化失败原因错误提示，不再静默仅写控制台；
  - `Timeline/index.vue` 拖放待办对齐优先使用 `draggedItem.value.taskId`。
- **验证**：PC 端全量 `npm.cmd run test:r4-pc`（386/386）、`npm.cmd run type-check`、`npm.cmd run check:subject-workspace`、`npm.cmd run check:subject-icons` 及 `git diff --check` 全部通过。

### 2026-09-22 PC 学科中心知识块布局优化与卡片/搜索框底部立体微阴影

- **学科中心（`SubjectWorkspace/index.vue`）知识块下移与防遮挡优化**：
  - 将知识库网格（`.blocks-grid`）与顶栏（`center-status-bar` 及 `.blocks-top-bar`）之间增加合理呼吸间距，`.blocks-workspace` 调整为 `padding: 24px 28px 20px`，`.blocks-top-bar` 调整为 `margin-bottom: 24px`；
  - 为 `.blocks-grid` 引入 `padding: 8px 6px 24px 6px` 与 `margin: 0 -6px`，整体视觉向下自然沉降 16px，彻底消除卡片鼠标悬浮态（`transform: translateY(-3px)`）被滚动容器顶边界及上方状态栏/操作条遮挡裁切的问题。
- **知识块卡片（`.block-card`）分层底部立体微阴影**：
  - 常态配置向下沉降的分层底部阴影（`box-shadow: 0 8px 20px -4px rgba(0, 0, 0, 0.06), 0 3px 6px -1px rgba(0, 0, 0, 0.04)`，深色模式自适应 `0 8px 20px -4px rgba(0, 0, 0, 0.35), 0 3px 6px -1px rgba(0, 0, 0, 0.2)`）；
  - 悬浮态（`:hover`）提升至 `z-index: 2`，并增强底部阴影扩散（`box-shadow: 0 14px 28px -4px rgba(0, 0, 0, 0.09), 0 6px 12px -2px rgba(125, 147, 114, 0.15)`，深色模式同步适配），呈现温润立体的悬浮质感。
- **学科空间（`SubjectHall/index.vue`）卡片与搜索框底部微阴影**：
  - 搜索框（`.search-input`）加入常态与聚焦态分层底部微阴影；
  - 学科卡片（`.subject-card`）加入常态分层立体底部微阴影与更饱满的悬浮投影扩散，深色模式同步适配。
- **验证**：`npm.cmd run type-check`、`npm.cmd run test:r4-pc`（382/382）、`npm.cmd run build`、`git diff --check` 全部通过。

### 2026-09-27 PC 弹窗与模态层组件化规范、视觉重构与焦点/无障碍修复

- **模态基础设施与管理器**：
  - `src/components/modal/modalManager.ts`：实现全局活动弹窗管理、引用计数级 `body` 滚动穿透锁定（`lockBodyScroll` / `unlockBodyScroll`）、LIFO 弹窗栈（`modalStack`）、顶层 `Escape` 拦截机制（`stopImmediatePropagation`）与全局焦点循环管理（`trapTabKey`）。
  - `src/components/modal/ModalShell.vue`：统一作为所有 PC 模态弹窗的基础容器，实现标准化 `Teleport`、淡入缩放微动效、`role="dialog"` 可访问性名称计算（`effectiveAriaLabelledBy` 与 `effectiveAriaLabel`）、入场智能聚焦（保持已有聚焦、检测 `[autofocus]`、优先聚焦首个输入控件）、退场焦点归还触发元素（`previousActiveElement`）以及 `preventClose` / `beforeClose` 关闭守卫。
  - `src/components/modal/modal.css`：全面对齐 Auralis 极简禅意温润设计规范与色彩体系：
    - 色彩与质感全面统一：弹窗浅色底板采用宣纸暖米白 `var(--color-bg-tertiary, #FAF7F2)` 搭配浅发丝边框 `var(--border-default, #DDD5C7)` 与暖炭黑毛玻璃遮罩（`rgba(28, 28, 26, 0.42)`），深色模式统一采用暖炭高阶底板 `var(--color-bg-elevated, #3d3b38)`，杜绝偏色；输入框、芯片与内嵌卡片采用燕麦米白 `var(--color-bg-primary, #F7F2EB)`，形成双层宣纸/燕麦纸层次，输入聚焦切换为白底；文字严格对齐 Zen Graphite `var(--text-primary, #1C1C1A)`；
    - 大圆角无缝画布：弹窗主体采用 `24px` 大圆角（`--radius-xl`）与柔和阴影，移除头部与底部硬性 1px 线条切割，构建浑然一体的温润底板；
    - 呼吸感尺寸体系：宽度层级放宽（`sm: 480px`、`md: 580px`、`lg: 760px`、`xl: 920px`）；内边距统一放宽（头部 `30px 36px 14px`、内容 `14px 36px 24px`、底部 `16px 36px 32px`）；
    - 全圆角 Zen 胶囊按钮（`border-radius: 9999px`，高度 40px，统一采用全站 `Primary Gradient` 禅绿渐变 `linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%)` 与陶土红渐变）、32px 纯圆交互关闭按钮、14px 舒适圆角表单控件与 `.modal-markdown-body` 排版规范。
- **5 项核心交互与焦点/无障碍问题修复**：
  1. 上传关闭守卫前置：`ModalShell` 在触发任何状态变更前执行关闭守卫；`FileRegisterDialog` 绑定上传状态守卫，并在上传失败时不重置表单，允许用户保留所选文件与文件名立即重试。
  2. 共享引用计数滚动锁：使用全局引用计数管理 `document.body.style.overflow`，彻底解决多层弹窗以任意顺序关闭时的提早解锁或残留 `overflow: hidden` 问题。
  3. LIFO 弹窗栈单层 Escape：多层弹窗时仅允许最顶层响应 Escape，并配合 `e.stopImmediatePropagation()` 阻止下层弹窗同时被关闭。
  4. 焦点闭环：实现弹窗内 Tab/Shift+Tab 闭环循环，关闭后焦点无损返还给触发按钮，且入场聚焦检测 `[autofocus]`，不覆盖任务名称等组件的原生自动聚焦。
  5. 无障碍名称绑定修复：`ModalShell` 在无 `title` 时移除 `aria-labelledby` 并无缝切换至 `effectiveAriaLabel`，修复知识块查看弹窗与工作区弹窗在未传 `title`时的空 ID 引用缺陷。
- **业务弹窗提取与接入**：
  - 系统化解耦并提取 6 大独立业务弹窗组件（`ChangePasswordDialog.vue`、`SummaryInstructionDialog.vue`、`TaskCreateDialog.vue`、`FileRegisterDialog.vue`、`KnowledgeBlockViewDialog.vue`、`WorkspaceKnowledgeBlockDialog.vue`）；
  - 全面改造 `SubjectCreateModal.vue`（消除双重标题栏冗余，接入 `#footer` 插槽）与 `ConfirmDialog.vue`。
- **门禁与自动化验证**：`npm.cmd run type-check`、`npm.cmd run test:r4-pc`（433/433 pass）、`npm.cmd run check:subject-icons`、`npm.cmd run check:subject-workspace`、`npm.cmd run build` 均全部通过。

### 2026-09-21 PC 端全量界面语义图标迁移至 Tabler Icons（@tabler/icons-vue）

- 全面统一 PC 端所有界面语义图标库为 `@tabler/icons-vue`，清理历史遗留的 `lucide-vue-next` 与散落内联 `<svg>`。
- 核心迁移覆盖：
  - 学科图标映射（`src/utils/subjectIcon.ts`）：重构为专注大学核心科目的 16 个学术语义键（`math: IconMathFunction`, `code: IconTerminal2`, `physics: IconAtom`, `chemistry: IconFlask`, `biology: IconDna`, `computer: IconCpu`, `analysis: IconChartDots`, `language: IconLanguage`, `book: IconBook2`, `economics: IconTrendingUp`, `business: IconBriefcase`, `law: IconScale`, `medicine: IconStethoscope`, `engineering: IconBuilding`, `art: IconPalette`, `school: IconSchool`），约束为纯净类型映射，不保留历史旧 key 兼容回退，并通过契约验证脚本 `scripts/check-subject-icon-rendering.mjs`。
  - 全局导航与框架：`AppSidebar.vue` 侧栏 5 项导航使用 `IconLayoutDashboard`, `IconCompass`, `IconCalendarTime`, `IconDatabase`, `IconHourglass`；`AppHeader.vue` 与 `SearchPalette.vue` 统一使用 `IconSearch`, `IconSun`, `IconMoon`。
  - 核心工作区与视图：
    - `SubjectWorkspace/index.vue`：顶部 Tier-1 导航、中心状态栏、历史撤销重做、左右侧折叠、大纲编辑器（小节删除/文件链接/解除关联）、上传拖拽区、清空对话与消息发送全部替换为 Tabler。
    - `Timeline/index.vue`：统计药丸（`IconListCheck`, `IconCircleCheck`, `IconClock`）、导入任务与新建任务按钮全部对齐 Tabler。
    - `Asset/index.vue`：树状层次（文件夹 `IconFolder`、文件分类 `IconFiles`、知识块 `IconNotes`、任务 `IconChecklist`、汇总分类 `IconArchive`、各学科分类节点图标与学科大厅全面同步，使用 `getSubjectIconComponent(subj.icon)` 动态匹配学科专属图标）、右侧关系星图（`IconNetwork`）及编辑器操作按钮全部统一。
    - `Pomodoro/index.vue`：今日番茄统计勾选图标替换为 `IconCheck`。
    - `Dashboard/index.vue` 与 `Home/index.vue`：内联 SVG 搜索、翻页、加号、日/周视图与时钟全部统一。
  - 专属图形渲染保留：`PomodoroRing.vue` 倒计时环形进度条、`AppSidebar.vue` 应用 Logo 以及 `SubjectWorkspace/index.vue` AI 伴读四芒星粒子动效维持原生实现。
- 门禁验证：`npm.cmd run check:subject-icons`、`npm.cmd run type-check`、`npm.cmd run test:r4-pc`（382/382）均通过。

### 2026-09-21 首页与学科工作区三栏卡片底部阴影微调

- 首页（`Dashboard/index.vue`）与学科工作区（`SubjectWorkspace/index.vue`）三大栏（Tier-1 导航条、Tier-2 大纲抽屉、中心主工作区与右侧 AI 伴读助手）统一采用分层微阴影变量（`--workspace-card-shadow: 0 10px 24px -4px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03)`，暗色模式同步适配），增强卡片在极浅象牙白底板上的底部立体沉降质感。
- 修复时间轴连续任务粘连/重叠问题：在 `Dashboard/index.vue` 与 `Timeline/index.vue` 中为时间轴任务高度计算引入 `TIMELINE_TASK_GAP`（6px）呼吸底隙与边距，消除连续任务 0px 相贴的视觉重叠；在 `Timeline/index.vue` 的槽位上补充 `v-show="!isSlotCovered(slot.time)"`，避免跨槽任务的被覆盖槽位未隐藏造成的错位。
- 首页（`Dashboard/index.vue`）时间轴重置优化：在组件挂载（`onMounted`）、路由切回（`watch $route.path === '/'`）以及从周视图切回日视图时，自动调用 `taskStore.setSelectedDay(getTodayDayCode())` 重置为当前本日，保证切回首页始终展示当天的时间流与待办细节。
- 静态检查、自动化测试 382/382 与生产构建均验证通过。

### 2026-09-21 Issue 3/4 final review fixes

- `useSyncStore` 保留上一次安全同步错误，只有完整的 push/pull/asset cycle 成功后才清除；同步、聊天和 AI SSE 错误统一经过有限 code/用户文案映射，原始诊断只进入有界受控日志，并保留离线分类。
- Overview 的所有 eligibility/not-ready/no-input 分支均返回 `SKIPPED`，不把 skip 写成 `FAILED`；Subject 生成在 Provider 返回后以当前参与 Source 的 fingerprint、generation 和 abort fence 复核，删除/修订/新一代响应不会写入缓存。
- `classifyClientError` 对已经安全化的 `SafeClientError` 保持原有 `code`、用户文案和 `retryable`，避免跨 Store/Controller 边界二次降级；Subject discard 会 abort 使用该 Source 的进行中生成，Provider 返回后再逐个复核 Source existence、FILE/READY、revision 与 eligibility。
- 已补真正运行时回归：同步错误持续到成功 cycle、SSE 安全错误、聊天 retry 保持 `clientRequestId`、Subject `NO_USABLE_INPUT` 及 revision late-result。手动完成的 `STARTED` 反馈显示“已更新”，旧内容提示仅在确有旧内容时出现。
- 最终 focused 回归为 68/68，PC 完整 R4 门禁为 382/382；`npm.cmd run type-check`、`npm.cmd run build`、根目录 `git diff --check` 均通过。真实 WebSocket、Tauri/GUI、Provider 和业务验收仍需单独记录。

### 2026-09-24 PC 专注时钟（Pomodoro）温润配色全面对齐、时间轴专属排期联动与自由学习模式

- 全面温润配色系统对齐：
  1. 页面底色与双栏卡片：大页面底色统一为 `var(--color-bg-secondary, #EEEEEE)`，左右双栏采用温润燕麦米白大容器卡片（`#F7F2EB`）、24px 大圆角与分层微质感阴影，取代原有生硬白灰断层；
  2. 极简禅意圆环与状态着色：圆环轨道由原本刺眼高饱和纯橙色（`#E85D04`）重构为专注态禅意鼠尾草绿（`#8B9A6E`），茶歇阶段升级为温润琥珀茶色（`#C89B6D`），背景底轨采用半透明发丝柔光（`rgba(139, 154, 110, 0.14)`），时间文本继承全局字体规范；
  3. 控制组与微交互：中央开始/暂停大圆钮采用品牌渐变（`linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%)`）配合柔和绿晕投影（茶歇态自适应切为琥珀茶金渐变），重置/跳过次要操作按钮采用全圆角米白宣纸胶囊（`#FAF7F2`）与发丝边框，悬浮微浮起；日期与时间状态呈现精致悬浮胶囊。
- 任务选择器专属过滤与时间轴深度联动：
  1. 纯净时间轴过滤：任务下拉栏不再混入无排期的杂乱待办或未归档知识块，严格仅过滤已在时间轴上拥有明确排期（`Boolean(task.scheduledAt)`）、处于未完成且未取消状态的有效排期任务，并按排期时间由近及远升序排列；
  2. 选项高信息辨识：每个排期任务在下拉列表内清晰展示排期时间徽标（如 `今日 14:00`、`周四 09:30`）与学科指引，一眼看清当前时段应专注的任务；
  3. 自由学习模式：在选择器首位注入开箱即用的「自由学习」虚拟任务（具备灵动星光徽标与专属自由模式横幅），页面加载默认选中「自由学习」，满足无需排期绑定、随时自主开启心流专注的场景需求；
  4. 专注横幅卡片：卡片下方实时动态展现当前专注的迷你横幅，一目了然区分自由模式与时间轴排期模式。
- 自动化与规范验证：`npm.cmd run test:r4-pc`（403/403 pass）、`npm.cmd run type-check`（0 error）、`git diff --check` 全部通过。

### 2026-09-24 PC 关系星图（KnowledgeGraph）中间圆角边框消除与星空动效升级

- 消除双重边框与冗余卡片外壳：彻底移除 `KnowledgeGraph.vue` 根节点 `.knowledge-graph-wrapper` 上的内嵌边框（`border: 1px solid var(--border-subtle)`）、内圆角（`border-radius: 20px`）和独立底色，使画布完全贴合右侧上下文抽屉容器；`Asset/index.vue` 的 `.ctx-graph` 设为 `flex: 1; display: flex; position: relative; overflow: hidden;`，并穿透移除内层包裹边框，实现纯净无界画幅；右侧星图面板宽度进一步拓宽至 `620px`，为多节点力导向星图布局提供宽阔舒适视野。
- 极简 HUD 图例胶囊与自适应适配按钮：废弃原有大矩形半透明顶栏，升级为轻悬浮毛玻璃胶囊（`border-radius: 9999px; backdrop-filter: blur(8px);`），包含“学科空间 / 关联文件 / 知识点”高辨识微胶囊，右侧配备悬浮动效的“适配画幅”圆形胶囊按钮（带微发光与上浮悬停动效）。
- 60fps 动态星空与呼吸光晕体系：
  1. 静态物理收敛与常态微动效解耦：物理布局算法在 180 帧或能量耗散后停止计算（零 CPU 额外负担），而动画渲染循环通过 `requestAnimationFrame` 持续驱动环境光、星芒微粒与脉冲；监听 `visibilitychange` 在标签页隐藏时自动休眠。
  2. 28 颗背景微尘星芒：随机分布于星图视野深处，通过正弦波周期性微弱闪烁（闪烁频率 0.8–2.2s），营造浩瀚深邃的银河景深。
  3. 连线能量流光脉冲（Energy Photons）：在学科与文件、文件与知识块的连线上，粒子沿连线方向平滑流动（每个连接以稳定 hash 派生速度与周期），模拟知识网络中川流不息的思维电讯号。
  4. 天体节点呼吸与柔和双层光晕：核心学科天体具备外层扩散光晕与纯色实体天体（去除中心小白点，保持纯净禅意质感），普通节点呈现有机节奏的呼吸微脉冲。
  5. 交互高亮与弱化：鼠标悬停在特定节点时，与该节点相连的所有连线与邻接节点高亮激活，其余无关节点柔和降淡至 0.28 透明度，视觉焦点极致聚焦。
- 自动化与工程规范守卫：`npm.cmd run test:r4-pc`（403/403 pass）、`npm.cmd run type-check`（0 error）、`git diff --check`（0 whitespace error）全部通过。

### 2026-09-21 Issue 3/4 前端反馈收口（自动证据完成，人工验收开放）

- Issue 3 的 PC 连接状态现在由统一 projection 按错误、离线、Realtime 重连、同步中、已同步的优先级计算；同步错误、服务不可用和问答错误保持为可见错误，不会因浏览器恢复 online 事件直接伪装为已同步。问答失败保留在聊天区域并提供重试入口。
- Issue 4 的手动文件/学科 Overview 重生成返回结构化 `STARTED`、`SKIPPED` 或 `FAILED` 结果；调用方对 Source 未就绪、版本/eligibility 不满足和 Provider/网络失败给出明确反馈。自动触发继续静默记录有界结果，不弹出通知、不递归重试；失败或跳过均保留已有缓存内容，只有手动重试可绕过当前 revision 的终态策略。
- 自动验证：Issue 3/4 focused 命令 `node --experimental-strip-types --test scripts/r4-issues-3-4-frontend.test.mjs scripts/r4-overview-generation.test.mjs scripts/r4-overview-cache.test.mjs scripts/r4-subject-overview-ui.test.mjs scripts/r4-sync.test.mjs scripts/r4-reliability.test.mjs` 为 88/88；`npm.cmd run test:r4-pc` 为 369/369；`npm.cmd run type-check`、`npm.cmd run build` 和根目录 `git diff --check` 均退出 0。
- 构建/测试输出仍包含既有 SQLite experimental、Vite externalized/dynamic-import 和 chunk size 警告；它们未被改写为失败，也不等同于真实验收。真实 WebSocket delivery、浏览器 online/offline 事件、Tauri/GUI 文件预览及真实 AI Provider 输出尚未验收；本轮无 API 或数据库契约变化。

2026-09-17 PC Local Asset Store Task 8 收尾：`b7a3bb7..c560d8b` 已将 PC Tauri 文件导入接入永久本地资料库。原始文件在受管目录中保持明文，由受管路径与 OS ACL 保护；本地 Asset 与 Source draft 以 `userId + serverDeviceId` 隔离，所有文件默认进入同步队列。断网时可完成导入、预览、OCR/Parser 本地解析，联网后以稳定 `clientImportId` 幂等同步对象存储；Preview、OCR、Parser 共享同一 Local Asset descriptor，`localContentRevision` 与服务端 `ingestionRevision` 分离。Local Asset 不提供备份、导出、恢复或副本管理能力。仅用户明确删除 Source 且最后一个 Source 引用消失后才进入受控删除；上传、解析、修复和 Source 删除均有任务 fence。启动同步前执行 owner/device-scoped reconcile：缺失或 hash/size 不一致标记 `CORRUPT`，未知或残留 staging 文件移入 quarantine，不静默删除。

自动证据：`f770277`/`e040e78` 后 Task 7 定向 77/77、FilePreview+store 38/38、Rust Local Asset 30/30；`cargo fmt --check`、`cargo check` 通过。`npm.cmd run test:r4-pc` 当前 333/334，仅剩用户 dirty `task-view` 的 completed scheduled task 断言失败；`npm.cmd run type-check` 仍仅有用户 dirty UI/Store 的 7 项错误。上述代码和自动门禁不等于真实 Tauri GUI、断网重启、真实文件系统或外部对象存储验收通过。

2026-09-15 Overview 失败体验收口：真实第二次 Overview 全链路已成功，证明当前永久预算链路可运行；生成内容质量仍需用户判断。对于 Overview 的 `MODEL_PROVIDER_ERROR`，PC 现在显示“遇到意外情况，请重试”，不新增 Server/API 错误码；既有 FAILED 终态保护保持不变，刷新、启动、联网、同步和 `JOB_CHANGED` 不会自动重试，只有用户点击“重新生成”才发起新请求。该文案映射仅位于 Overview 专用 failure policy，不影响普通 AI 聊天/流式错误。

2026-09-14 Overview retry/convergence：当前 revision 的 FILE Overview 缓存一旦为 `FAILED` 或部分 `READY`，对 `SOURCE_READY`、`RESUME_BOOTSTRAP`、`RESUME_ONLINE`、`RESUME_SYNC`、`JOB_CHANGED` 的自动触发均视为终态，不再自动 POST；只有 `MANUAL_RETRY` 可绕过该限制，并继续使用现有 in-flight coalescing。失败或部分结果区域各自只显示一个可见“重新生成”操作，生成中 disabled；旧大纲/总结保留。`MODEL_TIMEOUT`、`MODEL_UNAVAILABLE`、客户端 timeout/网络失败使用“无法确认生成状态”文案，与确定性失败区分。PC focused 早期证据为 54/54，最新 `npm.cmd run test:r4-pc` 为 331/331；type-check、`check:r4-pc`（94 个生产文件）、`check:subject-workspace` 与 build 均退出 0。上述自动证据不代表 Server 持久幂等、真实 Provider、Tauri、网络、GUI 或业务验收完成。

2026-09-12 Build/OpenAPI Task 3 最终回归：PC `npm.cmd run type-check` 退出 0；`check-openapi.ps1` 退出 0，生成的 `schema.ts` 与固定 OpenAPI artifact 一致，`subjectOverview`/`sourceOverview` 的 header 暴露可选 `X-Overview-Request-Id`。schema 由生成器产出，未手工维护；本轮未改变 API/数据库语义。真实 Server/Provider、Tauri、GUI、设备和业务验收仍待完成。

2026-09-11 Overview Source 删除 fence：文件总览生成在本地先要求当前用户/设备的活动 FILE Source 投影存在与请求完全一致的 `ingestionRevision`，且独立的本地文档任务阶段恰为 `READY`，因此自动恢复与手动重生成在任何 Server 预检前都会跳过不合格输入。Source 删除在本地 tombstone 与可见投影移除后同步阻断该 Source、abort 匹配的文件请求并移除文件总览缓存；晚到的成功或失败响应均不保存、不标记失败。Store-owned 删除顺序把该 fence 放在 `scheduleSync()` 与后台文档清理之前。Server 端的删除/修订保护见 Backend 模块；Subject 总览行为与既有 API/数据库契约未改变。本轮自动证据：PC `test:r4-pc` 322/322、type-check 退出 0、`check:r4-pc` 退出 0（93 个生产文件）；真实 Tauri 删除/重传、Axios 断开传播、Provider、GUI 与业务验收仍待完成。

更新时间：2026-09-12

文档状态：现行

权威范围：`Auralis-PC` 的当前依赖、路由、页面、Store、API 边界、Tauri 集成、构建方式与限制

事实来源：`Auralis-PC/package.json`、`src/`、`src-tauri/` 与 2026-08-24 当前代码

2026-09-09 时间轴拖动边界修复：排期任务拖到空槽时，`useTaskStore` 只通过当前用户/设备的本地 repository/outbox 更新单 Task，不调用需要两个 UUID 的 `schedule-swaps`；拖到已占用槽时仍调用服务端原子 swap。不改变 Task API 契约或数据库结构。

2026-09-09 知识块来源与学科名称映射修复：KnowledgeBlock API/本地投影仍仅保存 `sourceId`/`subjectId`；`useKnowledgeStore` 在读取知识块时同时读取当前用户/设备的 Source 与 Subject 投影，将关联 ID 映射为 `Source.title`/`Subject.name` 供 UI 显示。新建/更新路径保留当前可读名称，关联投影变化会重建知识块显示投影；缺失关联时显示中性占位。该修复不改变 API、数据库或 ParsedDocument 契约。

2026-09-09 PDF 混合页面阶段修复：`DocumentJobRunner` 在同一 PDF 已进入 `OCR_RUNNING` 后，后续普通文字 block 继续以 `OCR_RUNNING` 保存 checkpoint，直到 `PACKAGING`，不放宽 `OCR_RUNNING → EXTRACTING`，也不改变 PDF 分类、API 或 schema。runner 回归 12/12、完整 PC 回归 269/269、type-check 和 diff-check 通过；真实 51 页 PDF/Tauri GUI 仍待验收。

2026-09-08：ParsedDocument Tauri PUT 的失败日志增加安全、长度受限的 reqwest 诊断摘要，并最多保留三层 `Error::source()` cause。摘要先移除 URL，再脱敏预签名 query、Authorization、header value、路径和控制字符；`flags + summary + causes` 总体有界且仅写入 stderr，不改变返回给前端的 `NETWORK_OFFLINE:*` 分类或 SQLite 错误契约。ParsedDocument cache receipt 的 `payloadBytes/payloadSha256` 现在严格对应解密 reader 实际上传的 gzip payload；旧 receipt 若误将 `payloadBytes` 等同于 `encryptedBytes`，恢复上传前会在 owner-scoped native boundary 重新计算 payload size/hash。真实 Tauri/MinIO 复验仍需人工验收。

2026-09-09 schema-v1 final review closure：PC 本地加密 cache/receipt 保存 `parsed-document-v1`、Source Asset SHA 和 parser/normalization/OCR 元数据；gzip 上传内容为单个 Server-compatible schema-v1 JSON envelope，不是 NDJSON，owner/job/device/user 字段只用于本地 cache scope，不进入上传 JSON。兼容 receipt 直接续传，旧/不完整 receipt 在 intent 前只清理派生 cache 并重建一次。最终 scheduler focused 27/27、完整 R4 250/250、type-check 和 diff-check 通过；所有 Critical/Important reviewer findings 已关闭。真实重建 Tauri、Server/MinIO 和 `1.pdf` GUI retry 尚未观察。

## 模块定位

`Auralis-PC` 是桌面与 Web 共用的 Vue 客户端，负责高信息密度的学科工作区、资产、任务时间线、知识关系和设置。浏览器开发与构建由 Vite 提供；桌面能力由 Tauri 2 提供。

截至 2026-08-20，PC 页面与基础视觉重构已基本收敛；R4 在原有 Store、AI SSE、运行时代理和 Tauri 权限边界之上，补齐了 BYOK 浏览器明文清理、离线写入幂等、SSE 401 单次刷新和离线 AI 会话恢复。PC Web 与 Tauri 应用本体构建已通过；MSI bundling、浏览器/Tauri GUI、真实 Provider 和前后端业务联调仍未验收。

PC 全局排版以 `src/styles/index.css` 为唯一入口：普通 UI 文本继承 `--font-family-base`，代码/图表等专用内容使用 `--font-family-mono`；根字号为 `16px`，字号优先使用 `caption`、`body-sm`、`label`、`body`、`body-lg`、`title-sm`、`title`、`title-lg` 与 `display` 语义令牌。页面组件不得新增未纳入令牌的独立字体族；保留旧基础字号变量仅用于兼容已有样式。

2026-09-07 认证边界收口：refresh session 无效时清除本地会话并进入明确的 `reauthentication-required` 状态；受保护 Axios、同步和本地资料调度停止启动，登录/注册/refresh/health 保留恢复入口，refresh 仍由单飞协调器执行且每个请求最多重放一次。PPTX/Office 的 JSZip 根入口通过 Vite alias 固定到自包含浏览器 bundle，不使用 stream polyfill。自动回归已通过，真实 Tauri GUI 与新鲜 Vite bundle 仍待验收。

## 当前技术栈

| 依赖 | 当前声明 |
| --- | --- |
| Vue | `^3.5.32` |
| Vite | `^8.0.10` |
| TypeScript | `~6.0.2` |
| Pinia | `^3.0.4` |
| Vue Router | `^4.6.4` |
| Element Plus | `^2.13.7` |
| Tauri API / CLI | `2.11.1` |
| Rust `tauri` | `2.11.1`，见 `src-tauri/Cargo.toml` |

这是依赖清单事实，不表示所有依赖组合已完成桌面打包验收。

## 目录边界

```text
Auralis-PC/
├── src/
│   ├── api/          # HTTP、AI、同步、资产、鉴权、统计、Tauri 封装
│   ├── components/   # 共享组件和学科组件
│   ├── router/       # 正式路由与守卫
│   ├── store/        # Pinia 状态
│   ├── styles/       # 全局设计令牌和样式
│   └── views/        # 页面
├── src-tauri/        # Rust、权限和桌面配置
├── package.json
└── vite.config.*
```

## 正式路由

| 路由 | 名称 | 页面 | 鉴权意图 |
| --- | --- | --- | --- |
| `/login` | Login | `src/views/Login/index.vue` | 公开 |
| `/` | Dashboard | `src/views/Dashboard/index.vue` | `requiresAuth` |
| `/subjects` | SubjectHall | `src/views/SubjectHall/index.vue` | `requiresAuth` |
| `/subject/:id` | SubjectWorkspace | `src/views/SubjectWorkspace/index.vue` | `requiresAuth` |
| `/asset` | Asset | `src/views/Asset/index.vue` | `requiresAuth` |
| `/timeline` | Timeline | `src/views/Timeline/index.vue` | `requiresAuth` |
| `/profile` | Profile | `src/views/Profile/index.vue` | `requiresAuth` |
| `/pomodoro` | Pomodoro | `src/views/Pomodoro/index.vue` | `requiresAuth` |

`src/views/Home` 和 `src/views/Settings` 等目录不等于正式页面；未注册路由不得作为用户入口。

## 登录守卫现状

`src/router/index.ts` 的 `beforeEach` 使用 `useAuthStore` 完整会话和 `resolveAuthRedirect` 处理公开/受保护路由。`App.vue` 仅在受保护路由且存在完整 user+access token 会话时挂载侧栏、头部和认证壳；`/login` 使用独立公共布局，`AppSidebar` 的学科加载也有认证判断与异常兜底，避免过期/残留会话的 401 刷新异常造成白屏。当前结论：

- 未登录访问受保护页面会重定向到 `/login`，已有会话访问 `/login` 会回到 `/`。
- Server 受保护 API 仍必须验证 access token。
- `r4-pc-protocol.test.mjs` 已覆盖守卫决策；浏览器/Tauri 中的登录、刷新持久化、退出和过期仍需人工验收。

该问题属于 P1，不能因页面能够打开而写成鉴权已验收。

## Store 清单

| Store | 主要职责 |
| --- | --- |
| `useAuthStore.ts` | token、用户与会话 |
| `useBlockStore.ts` | 旧知识块兼容 facade；正式页面使用 `useKnowledgeStore` |
| `useTaskStore.ts` | Task typed API、user/device repository、排期、状态和 mutation |
| `useSubjectStore.ts` | 学科列表和当前学科 |
| `useSourceStore.ts` | Source 分页、资料目录、关联 Asset 元数据、软删除和 Source mutation；`activeSourceFiles` 按当前工作区焦点 `subjectId` 投影，空学科也会在后续本地 hydration 中保持为空 |
| `useKnowledgeStore.ts` | KnowledgeBlock 列表、关联 Source、离线缓存和 mutation |
| `useAssetStore.ts` | Asset upload-intent、对象存储上传、complete、下载 URL 和失败 pending 状态 |
| `useSyncStore.ts` | cursor、resetRequired、pull/push 状态、错误和统一同步入口 |
| `useReviewStore.ts` | Review queue/history/event 的 typed DTO 状态 |
| `useStatsStore.ts` | Stats overview/weekly query 和展示模型 |
| `useChatStore.ts` | 本地稳定会话/消息 ID、会话创建与消息请求幂等键、citation/SSE 状态及 online 顺序恢复；不把旧本地 chat 表当云端事实 |
| `usePomodoroStore.ts` | 用户/设备隔离的番茄钟 UI 与每日完成计数 |
| `useSettingsStore.ts` | 主题和偏好 |

修改 Store 字段前必须搜索页面、组件、持久化、同步和 API 使用方，禁止新增同职责 Store。

## API 边界

| 文件 | 职责 |
| --- | --- |
| `api/request.ts` | base URL、Authorization、401 单飞刷新；不读取或发送浏览器 BYOK key/header |
| `api/aiClient.ts` | AI 设置、会话、带单次 401 刷新且复用同一请求 ID 的 SSE 消息流；Suggestions 暂不在 PC 端暴露 |
| `api/useAuthApi.ts` | 登录、注册、刷新、会话列表与撤销 |
| `api/useAssetApi.ts` | upload-intent、对象存储直传、complete 与 download-url |
| `api/useSourceApi.ts` | Source typed CRUD/reingest，以及 ParsedDocument upload-intent/complete |
| `api/useStatsApi.ts` | 概览与周统计 |

Source FILE 响应携带可选 `assetSizeBytes`；`domainMappers.mapSourceView` 使用该字段填充资料大小，缺失时才回退为 `0`。文件登记的本地优先副本也保留上传完成时的 `asset.sizeBytes`，避免 Source 同步完成前短暂显示 `0.0 MB`。文件预览仍通过 Asset download-url 获取短期签名地址。

2026-09-04 起，Subject、Source、KnowledgeBlock、Task 的常规创建、更新和删除均走 `commitMutation()`：资源投影与 immutable outbox 在同一端侧提交中持久化成功后，才更新 Pinia/UI 并调用 `requestBackgroundSync('write')`。Store 列表只 hydration 本地投影，随后请求 cursor 同步，绝不自行调用领域列表 API 或在 loading 中等待网络。同步器以 `pending → inflight → applied/conflict/error` 结算指定 mutation；同资源有未解决本地写入时，push 回包、pull 和 snapshot 不覆盖其投影。FILE 的 Asset 二进制直传/complete、认证、ReviewEvent、AI/SSE、文件下载仍需要网络；用户点击“立即同步”以及启动 FILE 解析前确认 Source 已同步是仅有的 `flushNow()` 显式等待边界。
| `api/useSyncApi.ts` | push/pull 同步 |
| `api/e2ee.ts` | 端到端加密辅助 |
| `api/tauri.ts` | Tauri 环境和本地能力封装 |
| `api/generated/schema.ts` | 从冻结 OpenAPI 产物生成的 DTO、路径、参数和响应类型（禁止手改） |
| `api/generated/client.ts` | 约束路径、HTTP 方法、path/query/body 与成功响应的轻量请求适配器 |

所有端点契约以 [API 文档](../contracts/API.md) 为准；页面不得自行硬编码新的 Server 地址或 token 逻辑。

生成 SDK 的源文件是 `docs/contracts/openapi/auralis-openapi.json`，生成器固定为
`openapi-typescript@7.13.0`。从仓库根目录执行
`scripts/generate-openapi-sdk.ps1` 可同步 PC 和 Mobile；执行
`scripts/check-openapi.ps1` 可校验运行时 OpenAPI 与两端生成文件。当前生成 SDK
已冻结 Source `ingestionRevision/ingestionStatus` 与 ParsedDocument upload-intent/complete 类型和请求边界；PC 上传协调器与页面业务联调仍需按本计划继续，不能把类型检查通过写成前后端联调完成。

## 本地数据边界

| 文件 | 职责 |
| --- | --- |
| `services/localSchema.ts` | Tauri SQLite v9 schema、旧 key/value 表的可恢复改名、mutation inflight/远端诊断列与 snake_case 行转换；迁移时清洗 TASK 负载颜色键并保留无效 JSON 原文 |
| `services/localRepository.ts` | Tauri `local_resource_records`/`local_mutations` 按用户隔离（浏览器 fallback namespace 另含 device）；Subject 删除后由 `tombstoneSubjectChildren()` 幂等隐藏所属 Source/KnowledgeBlock/Task/Relation 投影并清除子资源 outbox，不生成子 DELETE mutation |
| `services/subjectDeletionCoordinator.ts` | Subject durable DELETE marker 之后的本地级联协调器；以 user/device Local Asset lifecycle lock 串行 draft queue release，启动/hydration 重放子投影、Subject/File Overview、文档任务，并在 APPLIED 后终结 Source draft 与最后引用 Local Asset；pending/rejected 保留可恢复 draft/bytes，按 user/device 作用域访问 drafts/assets/overviews/jobs，并保留其他 Subject 的资源和共享 Asset |
| `services/localDatabaseRuntime.ts` | 单个应用生命周期内的 SQLite 初始化 Promise 与按用户/设备范围缓存的 repository |
| `services/localSqlQueue.ts` | 进程内 SQL 命令串行化 adapter，避免 SQL 插件 pool 中的并发写入竞争 |
| `services/legacyLocalData.ts` | 旧 account-less localStorage 的 `legacy_unassigned` 备份和显式迁移选择记录 |
| `services/localDb.ts` | SQLite 单次初始化、WAL/busy timeout 配置与尚未迁移 Store 的兼容 facade；新 Store 不得新增对旧方法、旧字段或全局业务 key 的依赖 |

时间轴中的已完成排期任务保留其原 `scheduledAt` 槽位，并处于固定状态：Store 拒绝移动、替换和取消排期，Timeline/Dashboard 不提供相应拖放或取消入口；将任务恢复为未完成后才可再次调整。本地加载仅接受 API 领域状态 `TODO`、`IN_PROGRESS`、`DONE`、`CANCELLED`；弃用的展示态缓存（例如 `completed`）不再转换或兼容，而是忽略并由后续在线刷新按现行契约重建。

R4 repository 已覆盖 Web fallback 和 SQLite adapter 的用户隔离、`version/baseVersion` 冲突、`deletedAt` tombstone、v6 outbox 状态与 reset 保留未解决写入。Tauri 路径在应用生命周期只加载、建表和迁移一次，所有 SQL 插件命令经单一队列串行执行；同步 snapshot 通过 Rust `replace_local_resource_snapshot` 在同一 SQLite 连接的显式事务中完成，并启用 WAL 与 5 秒 `busy_timeout`。同步 Store 以共享 cursor cycle 和 500ms 合并调度处理启动、实时、联网、读写请求；push/pull 完成后只发布本地投影变化，领域 Store 重新 hydration 本地库。`DocumentProcessingRuntime` 仅在启动 FILE 处理前 `flushNow()`，确认本地 SOURCE 已为 `synced`。`localDb.ts` 与 `useBlockStore.ts` 仅保留兼容边界。

## C4/C5 文档处理与上传边界

C1/C2/C3 的本地解析任务、加密 cache 与可恢复 runner 已接入 C4 `ParsedDocumentUploadCoordinator`；Rust 通过 `document_upload_put` 对 cache 做解密流式 PUT，PC 只传 phase/receipt，不接触正文或持久化签名 URL。C5 `SourceJobScheduler` 已接入 FILE Source：Source Store 只对服务端 `AWAITING_CLIENT + ingestionRevision` 调度，优先复用当前上传会话的 File，没有本地输入时通过 AssetStore 的 owner-scoped download adapter 获取临时输入；每次处理核对 Asset SHA，旧 revision 的 job 被 supersede，TEXT/URL 不进入该队列。恢复批次隔离每个 Source 的失败，单个读取/调度异常只返回该项 `FAILED_LOCAL`，不会阻断后续 `AWAITING_CLIENT` 文件。Profile 的手动开始入口会先触发同步，并确认本地 `SOURCE` 为 `synced` 后才调用 scheduler；仍在同步、冲突或失败时显示相应提示，避免把服务端不存在的 Source 交给解析器。删除 FILE Source 时 Store 先完成 Source tombstone 与 DELETE outbox，再同步移除当前 `sources/activeSourceFiles` 投影；同步 push/pull 与 scheduler 对运行中 parser、当前用户/设备任务行、内存输入和加密 cache 的清理均转为不阻塞界面的 best-effort 操作。删除竞争只会使调度返回 `SOURCE_DELETED`，不会重建任务。Subject Store 随后重算其本地 Source 投影，因此学科文件计数与 Profile 进度中心同步消失。Tauri `default` capability 显式授予 `sql:allow-execute`，使用户/设备隔离的 SQLite job repository 可以创建与更新可恢复任务，而非退回浏览器 localStorage。PDF 本地适配器与 File Viewer PDF renderer 统一从根级精确 `pdfjs-dist@5.4.624` 解析，lockfile 不保留 renderer 的嵌套 PDF.js 副本，避免同一 Tauri WebView 的 worker API 混用；OCR 结束在 `finally` 释放其 PDF.js document，预览签名 URL 下载以最新请求标记提交，过期请求不能覆盖当前选中文件。scheduler 在本地 job 创建和调度结束后只刷新 `useDocumentProcessingStore`，Source 投影继续由既有同步事件刷新，避免 `loadSources -> schedule -> onJobChanged` 递归。Office bridge 先收集锚点再读取 chunks；纯图片 Office 若 renderer 没有可靠页数会明确返回 `DOCUMENT_FILE_TYPE_UNSUPPORTED`。OCR warmup 通过 sidecar 协议实际初始化模型，Rust 仅在诊断日志记录有界 stderr/进程状态，公开错误码保持不变。前端 runtime 仍提前检查加密状态，但 Rust `document_package_begin` 是新 cache 的最终安全边界：仅在 OS keyring 明确返回 `NoEntry` 时创建 `auralis/master_key`，其他 credential-manager 错误会原样报告为 keyring 访问失败；已有 cache 的读取、上传与清理只读取既有密钥，绝不以新密钥覆盖历史密文。

2026-09-26 Issue 6：`useDocumentProcessingStore.start()` 与 `resumePending()` 也经 `SourceJobScheduler` 按 Source 调度；恢复时只提交 `PAUSED_NETWORK`、`QUEUED`、`EXTRACTING`、`OCR_RUNNING` job 对应的 Source。Store 不再把 UI/重启恢复入口直接交给 `DocumentJobRunner`；runner 继续负责解析执行、列举、暂停和取消，retry 已由 scheduler 处理。

2026-09-07 复核补充：PPTX `runtime.ts` 在 parser 创建阶段直接读取 OOXML 的 `presentation.xml`/relationships，使用真实 slide 数量和文本块，不再依赖 File Viewer 的空 `pageCount`，legacy OLE `.ppt` 不作为 `.pptx` 兼容输入。Tauri invoke wrapper 保留 Rust 返回的字符串及结构化 message/error/code 诊断。Rust sidecar 在应用 cache 下维护专属 PyInstaller TEMP/TMP 目录，启动前只清理确认已停止的受管 sidecar 遗留直属 `_MEI*`；parsed-document PUT 的 `NETWORK_OFFLINE:*` 诊断会被归一化并进入可恢复 `PAUSED_NETWORK`，已完成加密 package 的续传不重新读取原始 Asset。用户从 `PAUSED_NETWORK` 继续时，带 receipt 的任务经 `QUEUED -> UPLOADING` 直接进入上传，不重跑 OCR、download 或 hash；无 receipt 的 queued 任务仍进入解析路径。

2026-09-05 起，`SourceJobScheduler` 只在 `sourceApi.get(sourceId)` 边界识别结构化 `ApiProblemError` 的 HTTP 404 或 `problem.code === 'RESOURCE_NOT_FOUND'`；命中后复用 `discard(sourceId)` 清理当前用户/`serverDeviceId` 范围内的文档任务、准备中的输入和加密 cache，并稳定返回 `{ status: 'SKIPPED', reason: 'SOURCE_NOT_FOUND' }`。其它 Source lookup 异常（包括 503/`INTERNAL_ERROR`）原样拒绝并保留任务；parser、hash、upload 等后续边界的异常不使用该分类。该规则由 `r4-source-processing-schedule.test.mjs` 与相邻文档处理套件覆盖。开发 Tauri SQLite 已在停止运行进程后从当前应用配置目录精确重置；重启后完整表集已建立，远端投影已重新同步。恢复出的文档任务当前暴露 master key 缺失，密钥初始化/恢复和重新上传的 GUI/Server 联调仍需单独验收。

2026-09-06 补充：PDF 本地适配器通过 Vite `?url` 绑定同版本 `pdf.worker.min.mjs` 到 `GlobalWorkerOptions.workerSrc`，不依赖 CDN；Source Store 的自动入口要求 `AWAITING_CLIENT` Source 同时拥有非空 `assetId` 与 `ingestionRevision`，避免本地 CREATE 尚未 push 时触发服务端 404 孤儿清理。该行为由 `sourceSchedulingPolicy.ts` 和 PDF/Source focused 回归覆盖；认证、MinIO 和 API/数据库契约未变化。

2026-09-05 上传与解析入口恢复：`src-tauri/Cargo.toml` 的 keyring 3 显式启用 `windows-native`，保留 `auralis/master_key`；`filePreview.ts` 的 upload accept list 仅为 PDF、DOC、DOCX、PPT、PPTX，图片/文本能力仍可预览但拒绝 upload intent，`canPreviewFile()` 与上传能力解耦，SubjectWorkspace 弹层显示支持格式；Profile `DocumentProcessingCenter` 将 `AWAITING_CLIENT` 详情写成等待桌面端开始处理，服务端 `VALIDATING/PARSING/INDEXING` 分别显示真实阶段，状态映射集中在 `documentProcessingStatus.ts` 并由纯函数直接测试；`DocumentProcessingDot` 复用共享 Source detail 映射，未知/undefined phase 不虚构服务端处理中状态，`READY` 显示“处理完成”。新增 Windows-only Rust keyring 跨新 Entry 写入/读取/清理测试；本机 `cargo test` 的真实 Credential Manager 写入因 `NoStorageAccess(Error(1312))` 失败，不能视为持久化已验收。Stats focused 测试覆盖六个 `Instant` 查询参数及 UUID/order 保留。PC focused file-preview 27/27、processing UI 1/1、runtime static 9/9、Stats 3/3 通过；真实 Tauri Credential Manager、File Viewer/上传、Server complete/indexing 与 GUI 状态仍需验收。

本地 schema v5 的任务行持久化完整 `DocumentCacheReceipt` 元数据，以便应用重启后从 `PACKAGING/UPLOADING/PAUSED_NETWORK` 续传，不重复 OCR 或 package；签名 URL、headers、原始文件路径不进入 SQLite/localStorage。`services/documentProcessing/runtime.ts` 已由 App 在 Tauri 登录后组装并启动：复用全局隐藏 `BackgroundParserHost`，连接 PDF.js/Office bridge、Tauri OCR、Rust package/cache、ParsedDocument upload coordinator、用户/设备 job repository 和 Source scheduler；启动时先 flush 一次本地同步队列，随后加载 Source；sync/online 事件会重新加载 Source 并恢复 pending jobs，登出时解绑。服务端 complete 接受后删除加密 cache，下载 adapter 的临时输入由 scheduler 清理；实际 Tauri 私有目录、MinIO/Server 联调和 GUI 任务中心仍待人工验收。

## 页面职责

- Dashboard：日程任务、待办和快速创建；数据来自 `useTaskStore`、`useKnowledgeStore` 和 `useSubjectStore`，无静态演示数据兜底。右侧采用上下双卡片分区：上半部为「日程任务」（按时间先后顺序纯线性展示，不作时间轴槽位网格展示、不可拖拽调整时间，支持完成勾选与移出日程），下半部为「待办清单」（纯列表展示，移除拖动手柄，支持直接勾选完成）。待办条目在窄宽下优先保留任务名称，过长的学科徽标允许收缩并以省略号显示。复杂时间轴编排与半小时网格拖拽完全交由 `/timeline`（排期副驾）页面负责。Task 卡片外观统一由 Sage/design 语义 CSS 令牌派生，不依赖 Task 数据颜色。
- SubjectHall：学科卡片、搜索、创建、编辑、删除和进入工作区；编辑表单保留服务端 `version` 并以 `baseVersion` 提交，确保名称、描述和图标修改可以保存；Subject 没有持久化颜色字段，Dashboard、Timeline 与 Home 统一使用 `#7D9372` 全局主题色；新用户注册后没有自动学科时展示真实空状态，历史遗留“未分类”学科也可正常删除。
- SubjectWorkspace：文件、知识、任务、图谱与 AI 上下文；学科图标经 `src/utils/subjectIcon.ts` 统一解析，新建学科保存语义键并渲染 Lucide Icons 线条图标，创建弹层不提供主题色选择，默认、左下角和全局功能侧栏图标底色统一为 `#7D9372`，已有 Emoji 值原样显示，空值或未知语义键回退书本线条图标。右侧 AI 伴读以页面内 SVG/CSS 复刻手机端四芒星、星环、消息气泡、输入中状态和纯文本胶囊输入；当前正式路径使用 typed `streamAiMessage` 和 `/api/ai/messages/stream`，不提供附件或麦克风入口；每次进入或切换学科都会开启新的伴读会话，不回溯旧消息。登记文件必须先选择文件、名称和归档学科，上传期间显示当前阶段/百分比并防重复提交；直传或 Source 创建失败会在弹层保留可重试状态并显示通知，成功后立即保存到本地并更新当前学科文件列表，后续同步不阻塞操作。文件选择器与拖拽入口共用 `src/utils/filePreview.ts` 的能力注册表，Excel/未知格式和超过 50 MB 的文件在创建 upload intent 前拦截；文件栏只显示真实 Source 文件，文件行删除操作默认悬停显示、键盘 focus-visible 保持可见，确认后通过 Subject Store 执行 Source 软删除并重算文件计数；本地仍有 `SOURCE/CREATE` outbox 时排队有序删除，知识块作为独立的总结/知识表面；删除取消、未登录、版本冲突、资源不存在和服务端异常均给出明确提示；选中文件后由 `FilePreview` 直接承载签名 URL、下载、加载/失败状态，当前优先使用自托管 File Viewer 渲染 DOC/DOCX、PPT/PPTX、PDF、图片及文本；较早的下载响应不得覆盖新选文件。学科页保持一个统一预览面板：现有文件名顶栏承载缩放与旋转，页码/总页数和前后页在预览底部独立占位；搜索、打印、下载、HTML 导出和主题切换不进入预览工具栏。
- PC 阅读辅助当前已接入 `READING_SESSION` 生命周期、`readingContext` 当前 Source 检索与同学科确定性升级；未 READY 文件的 AI 操作只提示前往 `/profile` 查看解析进度。文件行通过 `DocumentProcessingDot` 显示所有非 READY 状态（失败保留红色静态点）；Profile 的 `DocumentProcessingCenter` 同时展示本地任务阶段和本地任务已经完成、但服务端仍为 `VALIDATING/PARSING/INDEXING` 的 Source 阶段，后者会低频刷新 Source 至 `READY`。未挂载 Tauri runner 时该中心明确说明“仅可在 Auralis 桌面端运行”，不把不可用误显示为暂无任务。Tauri runtime 的前置检查会在无可恢复加密 cache 时初始化原生 `auralis/master_key`；若 job 仍有 cache 或 receipt 而密钥缺失，则停止并报告恢复需要。无论前端生命周期是否已完成，Rust `document_package_begin` 都会在新建 package 时再次确保密钥存在；读取既有 cache 不会生成新密钥。预览原生选中文本最多 4000 字，可执行解释/追问或打开 `KnowledgeBlockEditor`，知识块只有确认后才写入当前 subject/source。
- 左侧原“学科大纲”入口已改为“总览”，现有 header 中 `AI 梳理` 按钮和圆形“+”顺序、位置以及三栏宽度保持不变。“学科总览”默认折叠且只在用户点击后生成；下面按文件直接展开本地大纲，每个文件的“总结”入口把中栏从文件预览切换为本地总结。文件完成 READY 处理后后台请求一次 `ALL` 文件总览，结果按 user/device/source revision 写入本地 schema v7；失败保留旧大纲/总结。学科总览只组合当前学科已有本地文件结果，不上传新的原文，不进入 Sync。File Viewer 仅代表代码与构建已接入，DOC/DOCX 真实样本、浏览器/Tauri GUI 布局和资源加载仍需人工验收；预览顶部/底部栏使用轻微投影和实体按钮，缩放与旋转各自放入同款简单圆角控制组，缩放显示为 `− / 倍率 / ＋`，旋转显示为左旋线条图标、角度、右旋线条图标，文档上下安全留白收窄为约 12–16px。宿主不再叠加会遮挡正文的“正在渲染文档”遮罩，首次宽度适配只持续到用户第一次交互；`FilePreview` 与 renderer 仅在组件 ref 尚未建立时暂存动作，基础 Vue 组件通过 `withFullViewerOptions` 接入 full preset，缩放调用 `zoomIn`/`zoomOut`/`resetZoom`，PDF/图片旋转走 `applyViewState`，图片 renderer 自带旋转栏隐藏，不支持视图旋转的 Office renderer 才使用外层回退。学习文件列表行不显示装饰性文件类型图案，直接从文件名开始布局。若真实文件兼容性不达标，保持 `FilePreview` 合约不变并替换为服务端转 PDF 渲染器。
- File Viewer 交互补充：不以 `load-complete` 作为执行硬门禁；同时避开 `@file-viewer/vue3-full@2.3.2` 包装组件在 Vue 父级 ref 上丢失公开方法的问题，改由 `@file-viewer/vue3@2.3.0` 基础组件承载相同 full 配置。Chrome 合成图片已验证缩放尺寸和 90° 旋转发生实际变化；真实样本、浏览器/Tauri GUI 布局和资源加载仍需人工验收。
- Asset：上传、处理状态和资料组织；首屏并行读取 Subject、Source、KnowledgeBlock 与 Task 的本地 Store 投影，任一项读取失败仍构建其余本地树并关闭 loading。各 Store 随后独立刷新云端结果、通过其 repository cache 写回本地；资产页监听四类投影并重建树，不重新显示 loading。资产树的“全部任务”和各学科任务目录均来自 `useTaskStore` 的当前用户任务，不注入静态演示任务。任务按 `未排期`、`未完成`、`已完成` 三个并列分组，截止时间存在时按截止时间排序；任务完成切换回写 Task API/repository。任务编辑器不再提供认知负荷按钮，改为 30 分钟步进的预计用时，并可保存标题、备注、截止日期和时长。`/asset?focus=unassigned-tasks` 会展开并聚焦“未排期”。真实 Source 文件以 `FilePreview` 为唯一预览实现，TreeNode 透传 Source 的 `id`、`assetId`、`name` 和 `fileType`；旧 `PdfViewer`、首页 PDF 伴读入口和 Asset 的 `filePath`/Markdown 预览分支均不保留。
- Asset 关系星图使用真实 Subject、Source 和 KnowledgeBlock 投影。Source 连接所属 Subject；KnowledgeBlock 的 `sourceFileId` 指向同学科现存 Source 时连接该 Source，否则连接所属 Subject，不补造关系。力导向计算包含对称节点互斥、按关系类型设目标长度的弹簧吸引、弱重力与速度阻尼；节点初始位置由稳定 ID 决定，初始 RAF 在收敛或 180 帧上限后停止。同范围数据刷新保留存活节点坐标与相机，切换全局/学科范围时重新适配视图。画布使用 ResizeObserver 与设备像素比绘制，提供适配视图、指针中心滚轮缩放、平移及任意节点拖动。鼠标、触控和触控笔共用 Pointer Events 与指针捕获；超过移动阈值后暂停初始模拟，被拖节点保持在指针坐标，关联邻居实时通过弹簧力响应并重画连线，每段响应最多 36 帧并在收敛时提前停止，释放后最多运行 30 帧低强度松弛。用户摆放在同范围更新中保留。点击文件节点选择树中 Source 并在中栏显示 `FilePreview`；点击知识块节点在中栏显示对应编辑器，同时保留 Home 的 `open-block-detail` 事件。拖动或 pointercancel 不触发预览。
- Dashboard/Timeline：排期和任务时间管理，排期队列展示无 `scheduledAt` 且未完成/未取消的所有活跃任务，截止时间（`dueAt`）仅作为提醒与排序参考，不再作为进入排期的门禁条件。Task Store 以认证态的 `serverDeviceId` 访问用户隔离的本地 repository；首次加载先渲染本地任务，云端列表刷新在后台写回 Store，失败时保留当前投影。两页切换日期只调用 `setSelectedDay` 在内存中重建槽位，不重读 repository 或清空当前任务。Timeline 页面支持单任务与换位拖拽、半小时网格槽位渲染；Dashboard 首页看盘采用轻量线性卡片列表，无网格槽位，不作为可拖拽调时，按开始时间升序排列。启动 fetch 和运行中分钟级检查会执行到期转换：有 `scheduledAt` 的任务在 `scheduledAt + durationMinutes` 结束时刻到达后更新为完成并保留排期；无 `scheduledAt` 的任务不再因 `dueAt` 到期被清空截止时间，真实 `dueAt` 永久保留，卡片通过 due-badge 展示截止日期并在逾期时显示低饱和暖红醒目标记。转换失败保留原数据并记录错误。首页和独立时间轴统一展示当前/所选日期所在的完整自然周（周日至周六），避免只保存 `dayCode` 时跨周解析到下一周。首页日期格在日数字上方显示 `Sun` 至 `Sat` 英文星期缩写，选中日期使用固定约 `36px × 36px` 圆形绿色背景，顶栏以“时间轴 · X月”显示月份。日视图以半小时槽位承接排期开始时间，已完成或已过去的排期仍保留，其中已过去任务以删除线标记；已排期任务拖动到新槽位时以目标槽位覆盖旧 `scheduledAt`。时间轴“导入任务”进入资产库未排期分组，任务变化通过 `useTaskStore` 写入本地 repository/outbox 并在后台同步。
- Profile：账号、user/device/session 状态、会话撤销、外观和设置；统计通过 `useStatsStore`，知识导出通过 `useKnowledgeStore`。登录会话列表使用服务端每设备一条活动会话视图，当前会话不可在页面中撤销；撤销其它设备会阻止其续期，已签发的 access token 按有效期自然失效。个人空间提供确认后的“退出登录”入口：调用当前会话 logout、始终清理本地会话并跳转 `/login`，服务端失败会给出明确提示。正式入口内嵌 BYOK 卡片：读取服务端脱敏设置，只显示 `hasApiKey`/Base URL，API Key 仅在 `PUT /api/ai/settings` 请求体内提交并在成功后清空，不使用浏览器存储或普通请求 header。
- Pomodoro：宽屏专注计时、任务选择、开始/暂停/重置、休息阶段和今日专注数据；计时 UI 通过 `usePomodoroStore`，任务同步与排期数据由 `useTaskStore` 负责；任务选择器深度联动时间轴，严格仅过滤已排期任务，并提供开箱即用的「自由学习」默认模式；圆环采用禅意鼠尾草绿与茶歇琥珀双态配色。

详细交互与视觉只在 [前端设计](../design/Frontend.md) 维护。

## OCR 页级行为与诊断边界

- 2026-09-18 Task 4 收口：本地 OCR 页级检查点已投影到既有文档处理 Store，Source 行复用原有详情位置显示 `正在识别第 X/Y 页`；不新增百分比、进度组件或其它 UI。重连替换 socket 在 `onopen` 只请求一次既有 background `read` sync；处理 runtime 对处于 processing 的 Source 采用按生命周期与认证 scope 守卫的共享有界 reconciliation，以覆盖遗漏的 `READY`。focused 自动测试、`type-check`、PC 全量回归、Web build 和 diff-check 已通过；真实 Tauri/GUI OCR 进度、真实后端 WebSocket/event delivery 与跨设备收敛仍属人工/发布验收边界。
- 2026-09-18 Task 5 收口：Store 在 Local OCR reader 尚未完成时保留最近有效页级投影；同一 `attempt + localContentRevision` 的 `OCR_RUNNING` Source 进入 `after-recognize`、`after-normalize`、`page-result` 或 `empty-page` 检查点时，且 page/total 与最近有效值一致，继续显示旧页值。相同 run 的倒退 `before-recognize`（包括 totalPages 变化）不覆盖，新 run 必须先有自己的 `before-recognize`；成功读取会原子替换 projection，reader detach、Source 不再出现在 OCR_RUNNING 列表或 reader 失败仍清理失效值。runtime reader 仅补传已有 local record identity；未改变 UI、OCR Coordinator、sync 或 API/数据库契约。Store/UI/coordinator/runtime focused 68/68、`type-check` 与 `git diff --check` 通过；真实 Tauri/GUI OCR 进度仍需人工观察。
- `DocumentParser`/runner 按真实页码逐页推进；OCR 前持久化 `OCR_RUNNING` 检查点，空页只产生页级诊断并继续请求后续页，非空结果按页码和 block ordinal 保持顺序。
- 当所有页归一化后均为空时，runner 以 `OCR_DOCUMENT_EMPTY` 进入 `FAILED_LOCAL`；UI 显示页码、总页数和“未识别到文字”，不伪造成功 block 或页数。
- Profile 处理中心展示 bounded diagnostics，并提供复制入口。复制文本只允许页码、总页数、图片字节数、行数、耗时、结果和安全错误码/说明；不包含 OCR 正文、完整图片路径、`Authorization`、签名 URL 或未知原始字段。复制 API 不可用或失败时仍保留可见诊断。
- Rust sidecar page summary、stderr tail 和 invoke 错误保持有界；OCR 正文仅流经本机 parser/package 加密边界，不写入日志。上述内容有 Node/Rust focused 自动测试，但真实 Tauri `1.pdf`、剪贴板/accessibility 和现场日志仍未验收。
- 断网暂停后的继续操作保持上传边界：存在持久化 payload receipt 时按 `PAUSED_NETWORK -> QUEUED -> UPLOADING` 直接续传，不重新执行 OCR、下载或源文件 hash；没有 receipt 的 `QUEUED` 任务仍执行解析。`NETWORK_OFFLINE` 继续作为稳定错误码，传输原因仅保留 allowlist token。

## Tauri 边界

- JavaScript API、CLI 和 Rust crate 当前统一为 `2.11.1`。
- Local Asset Store 的 native 边界从 Tauri `app_data_dir()` 派生 `assets/` 和 `asset-staging/`；SQLite plugin 仍按其当前实现从 `app_config_dir()` 解析 `auralis.db`，两者不混用。`local_asset_store` 只接受 user/device/local-asset 逻辑身份与受校验的扩展名，不接受调用方目标路径，并沿用 Server 的 52,428,800 字节单文件上限。导入和远端物化均采用 `.part` 写入、flush/fsync、校验 size/SHA-256 后原子 rename；resolve/delete/reconcile 会执行路径 containment、文件类型和 owner scope 校验，并以有界错误码返回缺失、篡改、冲突和 staging 异常。当前未开放宽泛 Tauri asset protocol/CSP；实际 Tauri `app_data_dir()`、SQLite plugin 连接和 GUI 文件 URL 仍需人工验收。
- 原始文件选择器到 Local Asset Store 的最小 native 桥接命令为 `import_local_asset_bytes`。因 Rust 命令参数名为 `command`，Tauri JSON IPC 调用形状为 `{ command: { userScope, deviceId, localAssetId, safeExtension, expectedSize, expectedSha256, content } }`；`content` 对应 Rust `Vec<u8>`，调用方必须传 JSON 数字数组（每项 `0..255`，通常为 `Array.from(new Uint8Array(bytes))`），不能直接把 `Uint8Array` 当作 JSON 数组传入。返回 `LocalAssetDescriptor` 的 `localAssetId`、`safeExtension`、`sizeBytes`、`sha256`、`absolutePath` 均为 camelCase。该命令与文件路径导入共用同一锁、大小/hash 校验、`.part` fsync 和原子发布流程，重复相同内容幂等，已存在不同内容返回 `LOCAL_ASSET_CONFLICT`；自动测试已覆盖超限、hash mismatch 清理、幂等、冲突和成功发布。
- 使用 `@tauri-apps/plugin-sql` 提供 SQL 插件能力。
- 默认 capability 启用 `core:default`、`log:default`、`sql:default` 与持久化 repository 所需的 `sql:allow-execute`；当前未启用 shell/http/fs。Vite 开发代理只接受 `VITE_DEV_API_TARGET` 与 `VITE_DEV_WS_TARGET`，Tauri 运行时 API/WS base 必须显式配置。Vite 显式注入 `vue/compiler-sfc`，并忽略 `public/file-viewer/**` 生成资源的开发监听，避免 File Viewer 首次复制触发 `@vitejs/plugin-vue` 空 compiler HMR 竞态。SQLite 初始化同时识别 Tauri v2 的 `__TAURI_INTERNALS__` 和旧 `__TAURI__` 全局。Debug Tauri 的日志插件只写 stdout，避免已有日志文件阻止窗口启动。
- AI 辅助阅读的 OCR 仅随 PC Tauri 打包：`src-tauri` 通过 bounded commands 管理 target-triple `auralis-ocr` externalBin，固定 RapidOCR/ONNX 模型与 manifest 从 `../ocr-sidecar` 作为 resources 进入安装包；前端不接受可执行文件、模型路径或任意 shell/fs/http 参数。
- G1 protocol、G2 sidecar engine、G3 Rust supervisor 和 G4 MSI bundle 已有自动测试/产物证据；最终 MSI 通过 verifier，五组离线 OCR baseline 已记录。临时 all-users 安装因宿主 Error 1925 未完成，安装后 GUI/OCR 仍属于 R2 验收，不写成已通过。
- G5 已提供固定尺寸、不可 `display:none` 的 `BackgroundParserHost` 与 `FileViewerParserBridge`，复用 File Viewer 的文本块/锚点 API，并在空结构时提供 bitmap fallback/`OFFICE_TEXT_UNAVAILABLE`。DOC/DOCX/PPT/PPTX fixture matrix 3/3 通过，其中旧式 PPT 由 Apache POI 生成真实 OLE 文件；实际 File Viewer/Tauri 运行时的四种文件提取、回退和稳定失败结论仍需验收。G6 `DocumentParser` 已按页分类 text-layer/扫描 PDF，串行调用 OCR，支持 Office direct/fallback，归一化文本并以 sink 背压输出 bounded block；core 7/7 与真实 PDF 2/2 通过。
- 目录从 StudyCore 重命名后，旧绝对路径可能残留在 Rust 构建缓存；仅在确认属于缓存时执行 `cargo clean`。
- 2026-09-05 已停止当前仓库的 Tauri 开发进程并精确删除应用配置目录中的 `auralis.db`、`auralis.db-wal`、`auralis.db-shm`；重启后数据库和完整表集已重新建立。远端同步恢复的 3 个文档任务均因 master key 缺失进入 `FAILED_LOCAL`，该密钥边界仍待修复或人工恢复验证。
- `npm.cmd run tauri -- build --no-bundle` 已验证 Rust/桌面应用本体生成；完整 MSI bundling 曾因宿主 `拒绝访问 (os error 5)` 阻断。Web/Tauri 本体构建通过不能证明桌面权限、窗口、插件、安装包和系统集成可用。

## 开发与验证命令

```powershell
cd Auralis-PC
npm install
npm run dev
npm.cmd run build
npm.cmd run check:subject-icons
npm.cmd run check:subject-workspace
npm run tauri dev
npm.cmd run check:r4-pc
npm.cmd run test:r4-pc
npm.cmd run type-check
npm.cmd run tauri -- build --no-bundle
```

| 命令 | 证明范围 | 不证明 |
| --- | --- | --- |
| `npm run dev` | Vite 开发服务可启动 | 生产构建、桌面能力 |
| `npm.cmd run build` | 类型构建与 Web bundle | Tauri GUI、业务流程 |
| `npm.cmd run check:subject-icons` | 学科语义图标、旧 Emoji 分支与页面接入静态契约 | 浏览器/Tauri 的实际图标显示、键盘和视觉效果 |
| `npm.cmd run check:subject-workspace` | 学科工作区关键 UI 结构契约 | 浏览器拖拽、AI 流式请求与视觉效果 |
| `npm run tauri dev` | 当前机器桌面开发启动 | 安装包和其他系统 |
| `npm.cmd run check:r4-pc` | 生产源码未命中旧 DTO、旧同步字段、旧地址和旧 AI 路径 | 真实 API、GUI、安装包 |
| `npm.cmd run test:r4-pc` | PC 协议、本地 repository、Store mapping、SSE reducer、BYOK 禁止浏览器明文、离线幂等与运行时配置测试 | 浏览器、Tauri GUI、真实后端 |
| `npm.cmd run tauri -- build --no-bundle` | Rust/桌面应用本体和前端 bundle 可生成 | MSI、安装/升级/卸载和 GUI 验收 |

## 当前限制

- 登录守卫逻辑已恢复并有路由决策测试；浏览器/Tauri 登录、刷新、退出和过期仍待人工验收。
- 当前已有 R4 协议、本地 repository、Store mapping、SSE reducer 和运行时配置自动测试，但没有替代真实服务的浏览器 E2E。
- `tsconfig.app.json` 的 TypeScript 6 `baseUrl` 弃用错误（TS5101）已通过移除配置项解决，`AppHeader.vue` 的未使用 `ElMessage` 导入也已清理；2026-08-12 `npm.cmd run build` 通过，但 Vite 提示部分 chunk 超过 500 kB。
- Tauri GUI 和 MSI 打包需本地人工验收；当前 MSI bundling 被宿主权限错误阻断。
- API、同步、资产、AI 和 C4 上传链路需要真实 Server/基础设施联调。
- AI key 的持久化安全、网络中断后的会话恢复和 token 刷新均有自动测试，但仍需要浏览器连接真实 Server/SSE 的人工业务验收。
- 用户当前工作树包含页面、Store、样式和 Tauri 依赖改动；在提交前必须按范围复核。

## 修改后的强制回写

- 路由、页面、Store、API 或 Tauri 变化：更新本文件。
- 视觉或交互变化：更新 `docs/design/Frontend.md`。
- 接口变化：更新 `docs/contracts/API.md`。
- 状态或风险变化：更新 `docs/current/`。
- 可确认变化：更新 `docs/release/Changelog.md`。

## 2026-09-09 Task 15

`ParsedDocumentUploadCoordinator` 在明确收到 `ACCEPTED` complete 且记录 `COMPLETE_ACCEPTED` 后，通过可选 `onCompleteAccepted` 回调请求一次 `useSyncStore().requestBackgroundSync('read')`。回调失败只记录固定诊断，不改变 accepted 返回值或阻止 `SERVER_INDEXING → READY`；rejected、缺失/非法状态、complete 异常均不触发。真实 Tauri、Server/MinIO、sync pull 与 GUI 仍待人工验收。
# PC 当前实现补充（2026-09-09）

ParsedDocument upload coordinator 在服务端 complete 返回 `ACCEPTED` 后，按本地 `DocumentProcessingJobRepository` 合法迁移依次写入 `SERVER_INDEXING` 和 `READY`；scheduler 仍在 READY 之后执行结果返回与派生 cache 清理。真实 transition-validating repository 回归覆盖该边界，真实 Tauri/Server/MinIO/GUI 仍需人工验收。

2026-09-09：scheduler 先读取一次权威 Source backend，再对选中的 current revision 预检本地 cache column/receipt 关系；`SERVER_VALIDATING`/`SERVER_INDEXING` 的本地 mismatch 可安全进入 `FAILED_LOCAL` 并 retry，READY/FAILED_SERVER 保留原 phase。预检失败不执行 hash、runner、upload 或 cache deletion。

2026-09-09 Task 13：ParsedDocument 上传边界增加非持久化 `[Document Upload Trace]` allowlist 事件，覆盖每次 PUT 的开始/校验成功或失败，以及 Server complete 接受或失败；日志不包含 URL、headers、receipt/cache/path、OCR 正文、响应体或异常对象。自动测试 19/19；真实 Tauri/MinIO/Server/GUI 仍待验收。

2026-09-10 PC Overview 触发诊断：文件总览生成现在输出带固定前缀 `[FILE_OVERVIEW_TRIGGER]` 的结构化、allowlist 生命周期日志，触发值来自 TypeScript 封闭类型和已知调用点：`SOURCE_READY`、`RESUME_BOOTSTRAP`、`RESUME_ONLINE`、`RESUME_SYNC`、`JOB_CHANGED`、`MANUAL_RETRY`（不代表运行时动态校验）。仅在实际进入 `runFile` 的生成尝试中由服务创建 request ID，并由 `useOverviewApi` 原样复用到既有 `X-Overview-Request-Id`；preflight/skip 事件可能没有 `requestId`。现有内存 in-flight coalescing 保持不变。本次仅增加诊断与关联，不改变重试、缓存、Provider、Server 或 timeout 行为。Overview 自动化验证通过；真实 Tauri、Provider attribution 与业务验收仍待执行，且 Server 同一 `(user, source, revision, mode)` 的进行中去重/idempotency 与 PC/Server timeout mismatch 仍是开放风险。

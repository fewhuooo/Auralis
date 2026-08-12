# Auralis 变更记录

更新时间：2026-08-12

文档状态：现行历史记录

权威范围：已发生且可确认的产品、代码、文档和验证变化

事实来源：Git 提交、本轮实际验证记录与重构前快照

## Unreleased

### 后端绿地重写阶段 2A：核心领域（2026-08-12）

- 新增 Flyway `V2__core_domain_schema.sql`，创建 `subjects`、`knowledge_blocks`、`tasks`，统一使用 UUID、用户归属、JPA `@Version`、审计时间和软删除墓碑；KnowledgeBlock 的 `source_id` 暂作为阶段 2B Source 接入前的可空字段。
- 实现 Subject、KnowledgeBlock、Task 的 Entity、Repository、显式 DTO、领域服务和 REST Controller，覆盖创建、查询、更新、软删除、恢复、用户隔离和精确 `baseVersion` 冲突。
- 注册用户同事务创建受保护的“未分类”默认 Subject；默认 Subject 不可删除，KnowledgeBlock/Task 不可引用其他用户或已删除 Subject。
- 将认证主体移入 shared security named interface，解除 identity 与业务模块的 Modulith 循环依赖；更新阶段1测试清理夹具以遵守新表 `ON DELETE RESTRICT`。
- 2026-08-12 `Auralis-Server\\mvnw.cmd -B -ntp clean test` 通过，31 个自动测试全部通过；PostgreSQL/pgvector、Docker、MinIO、Source/Asset/Relation 和三端联调仍未执行。

### 后端绿地重写阶段 1：Identity 与认证（2026-08-12）

- 在新 `com.auralis.app` 后端加入 Spring Data JPA、Spring Security、OAuth2 Resource Server、Flyway、PostgreSQL runtime 和 H2 test scope；创建面向干净数据库的 `V1__identity_schema.sql`，包含 `users`、`devices`、`refresh_sessions` 及归属/rotation 索引。
- 实现 User、Device、RefreshSession Entity 和 owner-scoped Repository 查询；refresh token 只保存 SHA-256 hash，access JWT 默认 15 分钟，refresh session 默认 30 天。
- 实现注册、登录、refresh rotation、重放撤销整个 rotation family、登出、当前用户、会话列表和会话撤销；公开错误统一为 Problem Details，凭据失败使用 `UNAUTHENTICATED`，跨用户会话访问不泄漏归属。
- 新增 Auth MockMvc 测试，覆盖用户隔离、密码/JWT、过期/撤销/重放、refresh token 误用、字段校验和安全错误；2026-08-12 `Auralis-Server\\mvnw.cmd -B -ntp clean test` 通过，19 个测试全部通过。
- 使用 H2 test-scope classpath 运行 test profile HTTP smoke：health liveness 和 OpenAPI 返回 200，register 返回 201，login 返回 200 且 token pair 存在。PostgreSQL/pgvector、Docker、MinIO、Testcontainers 和人工三端验收未执行。

### 后端绿地重写阶段 0（2026-08-12）

- 在 `Auralis-backups\\20260812-205737` 创建仓库外可恢复备份：完整归档 152 个文件、210984 bytes，SHA-256 为 `C59AD2AB39F05B114D7B13FAA948C8A8ED29CB0CA1F26DDBCF04794B431C4BEC`；空 Server 工作树补丁为 0 bytes，归档展开复核通过。
- 将旧 `Auralis-Server` 精确移动到备份目录的 `Auralis-Server-source`，在原路径创建新 Server；PC、Mobile、docs 其他范围和 Compose 未因替换命令被递归移动。
- 新 Server 固定为 Java 21、Spring Boot 4.1.0、Spring Modulith 2.1.0、`com.auralis.app`；移除旧 `com.auralis.server`、MyBatis/Redis/Milvus/etcd/JJWT/LangChain4j/MinIO 等依赖和旧统一 `Result`。
- 建立 12 个 Modulith 模块边界、配置绑定、Trace ID、RFC Problem Details、Actuator 健康检查和 `Auralis API` OpenAPI 基础；阶段 0 不开放 Auth、业务对象、同步、AI/RAG、WebSocket 或数据库路由。
- 验证证据：`Auralis-Server\\mvnw.cmd -B -ntp clean test` 退出码 0，5 个测试通过并生成 4 份 Surefire 报告；真实启动 smoke 的 readiness/liveness 为 HTTP 200 + `UP`，OpenAPI 与 Swagger UI 为 HTTP 200。Docker、数据库、MinIO、前端联调、GUI、真机和业务验收未执行。

### 前端重构进度与现行文档同步（2026-08-12）

- 更新 `docs/README.md`、`AGENTS.md`、当前状态、风险登记、PC/Mobile/Tablet 模块和前端设计文档，使正式路由、近期视觉改动、构建证据与人工验收边界保持一致。
- 明确 PC 当前为 8 条正式路由，并登记 Pomodoro、工作区、导航、弹窗和 Mobile/Tablet 热力图等近期代码变化。
- 记录本轮验证：PC 两个静态契约检查通过，TS5101 已通过配置调整解除，但生产构建继续受 TS6133 阻塞；Mobile H5、微信小程序构建和 Tablet 侧栏检查通过，仍需 GUI/真机验收。

### PC TypeScript 6 构建配置修正（2026-08-12）

- 从 `Auralis-PC/tsconfig.app.json` 移除已弃用的 `baseUrl`，保留 `@/*` 的 `paths` 映射；PC 两个静态契约检查继续通过。
- 修正后生产构建已越过 TS5101，但进一步暴露 `Auralis-PC/src/components/layout/AppHeader.vue` 的未使用 `ElMessage` 导入（TS6133），因此仍未形成完整 PC bundle 验证。
- 随后删除未使用的 `ElMessage` 导入，2026-08-12 `npm.cmd run build` 通过（3477 modules）；Vite 仍提示部分 chunk 超过 500 kB，待后续评估拆包。

### 平板与手机端热力图可配置化与自适应布局（2026-08-11）

- 改造了 `HeatmapChart.vue` 组件，使其支持动态传入 `weeks` 属性配置显示的周数（默认 16 周），并根据周数动态调整标题文本（5周及以内显示“近一个月”）。
- **优化热力图视觉**：强制所有热力格子为严格的正方形（`aspect-ratio: 1/1`）。为了解决短期数据（如近一个月，5周）导致中间窄条且两侧留白过多的问题，引入了自适应布局：当 `weeks <= 5` 时，自动从纵向 GitHub 风格切换为更舒展的 7列 x 5行“标准日历”横排布局，在保持禅意留白的同时，使网格能更均匀地分布在宽屏卡片中。
- 在平板端首页 (`Auralis-Mobile/src/pages/tablet/dashboard/index.vue`) 的热力图组件中显式传入 `:weeks="5"`，确保大屏下只展示一个月的数据并触发日历布局。
- 修复了平板端首页横幅（Hero Banner）卡片的渐变背景色，将其从旧的硬编码绿色（包含不合规的 `#687f5d`）统一为前端设计文档 (`Frontend.md`) 中规定的 `Primary Gradient` 品牌线性渐变（`linear-gradient(135deg, #A3B19B 0%, #7D9372 100%)`）。

### 文档体系

- 建立以 `docs/README.md` 为唯一入口的分类文档体系。
- 新增 Agent 强制协议、权威边界、状态词典、回写矩阵和交接模板。
- 完整归档 2026-07-10 重构前 35 份旧文档，并保留当时未提交的文档修改。
- 新增项目、设计、模块、契约、运维、当前状态和计划文档。
- 旧现行路径已切换，现行链接、根目录、元数据和旧路径扫描通过。

### 本轮验证

- PC：2026-07-10 `npm.cmd run build` 通过（`vue-tsc -b && vite build`）。
- Mobile：2026-07-10 `npm.cmd run build:h5` 和 `npm.cmd run build:mp-weixin` 通过。
- Tablet：2026-07-10 `node scripts\check-tablet-sidebar-transition.mjs` 通过，120ms 指示器在 160ms 路由重载前落位。
- Server：2026-07-10 `mvn test` 通过；Maven 日志显示没有测试源码，不能当作业务测试覆盖。
- Mobile H5 构建保留动态/静态 import 和 Sass legacy API 非阻断警告。

### PC 学科图标兼容（2026-07-13）

- 新增 `src/utils/subjectIcon.ts`：学科图标统一兼容 Emoji 与历史名称（如 `book`、`code`），空值或未知名称回退为书本图标；大厅、工作区、首页和时间线使用同一解析逻辑。
- `node scripts\check-subject-icon-rendering.mjs` 与 `npm.cmd run build` 已通过；浏览器/Tauri 显示仍待人工验收。

### PC 新建学科线条图标（2026-07-14）

- 引入了更精致、具有现代细腻设计感的第三方图标库 `lucide-vue-next`。创建学科弹层改用 16 个 Lucide 线条图标（如 BookOpen, Sigma, Sparkles 等），完全符合“极简禅意”设计目标，同时保留原有语义键以向后兼容；大厅、首页和工作区用同一解析器渲染。
- 已有 Emoji 学科不迁移，编辑时未重选图标会原样保存；原生任务学科下拉保留旧 Emoji 前缀但不输出新的语义键。
- 应用入口加载 `element-plus/theme-chalk/el-icon.css`，确保图标容器及 SVG 按指定尺寸渲染。
- 移除创建学科的主题色选择；新建学科默认色及工作区左下角学科图标底色统一为 Sage Green `#7D9372`，图标使用白色。
- 全局功能侧栏学科入口复用同一图标解析器，直接渲染语义线条 SVG；保留既有 Emoji 分支，底色统一为 Sage Green `#7D9372`。
- 2026-08-10：修复 PC 首页 (Dashboard) 左侧栏及任务创建弹窗因未正确调用 `subjectIcon` 解析器而直接输出语义键文本 (如 `math`, `laptop`) 的渲染 Bug，并将 Dashboard 加入静态脚本契约 (`check-subject-icons`) 校验范围。当前该检查及 `npm.cmd run build` 已重新验证通过。
- 2026-08-10：重构 PC 首页 (Dashboard) 左侧栏“全部”选项的展现样式，将其从普通列表项提升为独立的全局视图卡片 (Global View Card)，以清晰区分全局知识流与专属学科空间。
- 2026-08-10：统一 PC 任务编排中心 (Timeline) 的日/周视图切换按钮样式，对齐首页 (Dashboard) 的全圆角胶囊无 Emoji 设计，保持极简禅意视觉语言的一致性。
- 2026-08-10：全局替换了 16 个默认学科语义线条图标 (`src/utils/subjectIcon.ts`)，使用更加柔和、抽象的图形 (如 `Feather`, `Orbit`, `Telescope`, `Infinity`) 替代了此前较为硬核的组件；同时，将全局左侧栏 (`AppSidebar.vue`) 的核心导航图标也由 Element Plus 默认图标替换为了一致的 Lucide 线条图标，并特意采用 `LayoutDashboard` (首页看盘) 和 `Compass` (学科大厅) 以避免视觉上的重复感，全面提升了界面的“极简禅意”美感。
- 2026-08-10：在排期页 (`Timeline/index.vue`) 完整复刻了首页 (`Dashboard/index.vue`) 的现代卡片化新建任务弹窗，包括网格化胶囊学科选择器与可拖拽交互的长条形专注时长配置条，统一了全局核心交互体验与视觉范式。

### PC 学科工作区原型（2026-07-13）

- 文件选择改为中栏 Markdown 总结；文件项移除右侧操作按钮。
- 大纲改为“AI 梳理”与圆形“+”顶栏，支持左栏内联新增、章节排序与限定在章节内的小节排序；当前不持久化。
- 2026-07-14：右侧 AI 伴读完整复刻手机端的渐变四芒星、脉冲星环、消息气泡、三点输入中状态和纯文本胶囊输入；保留现有 `streamFetch`、模型菜单与学科/文件上下文，不提供附件或麦克风入口，清空和发送均有可读标签。
- 2026-07-26：优化知识块阅读弹窗和手动录入界面的排版与样式。阅读界面采用统一的 Markdown 渲染样式 (`.summary-markdown`)，优化了标题字号和时间标签的微标展现；编辑界面的输入框应用了标准 `.styled-textarea`，支持 Focus 光晕和高度自适应。
- 2026-07-26：重构大厅（Home）页面的“手动录入知识块”、“创建学习任务”、“登记本地材料”弹窗，将其样式统一为全局标准的 `.modal-container`，实现与其他核心业务弹窗的视觉及动效一致性。
- 2026-07-26：重构工作区（Workspace）的“手动录入知识块”和“创建学习任务”弹窗，将其样式统一为全局标准的 `.modal-container`。
- 2026-07-26：优化排期布局页（Timeline）顶栏，去掉多余的“认知负荷”数据展示，并将待排期、已完成和专注时长这三个核心指标收纳为紧凑的药丸标签（Pill Tags）放置在标题与操作按钮之间，大幅提升了屏幕空间利用率与信息层级。
- 2026-08-11：在 PC 端完成专注时钟（Pomodoro）功能移植。移除了移动端的 `rpx` 与 `<view>` 标签限制并重写了样式；针对 PC 宽屏引入了大圆角胶囊状的任务选择器；移除了全局顶栏多余的占位图标；在大纲编排模式中新增了章节与小节的删除功能，进一步完善核心流程。

### 已确认的近期工作树变化（待随当前功能分支验证）

- PC 前端继续向 Zen Minimalist 体系对齐，使用禅白、鼠尾草绿和发丝边框。
- PC 首页移除知识流上方统计/热力图卡片及副标题。
- PC 依赖中 Tauri JavaScript API、CLI 与 Rust Tauri 统一为 `2.11.1`。
- Mobile / Tablet 的近期布局、图表、设置与 workspace 改动已在日期快照保留。

这些条目来自当前工作树和历史记录；只有任务 9 中命令实际通过后，才会追加本轮验证结果。

## 2026-07-10

### 已确认

- `d752b62`：项目目录名称从 StudyCore 更新为 Auralis。

## 2026-07-09

### 已确认

- `78c46de`：完成 Tablet workspace 重构、统一头部高度并修复侧栏收起 CSS。

## 2026-07-08

### 已确认

- `2babfbe`：默认隐藏 Tablet 手写笔记入口。
- `e2a09a9`：新增 Tablet 手写笔记本地存储。
- `4db4347`：新增 Tablet 手写专项计划。
- `dcdd5db`：整合 v3 Tablet 工作流。

## 2026-06-10

### 已确认

- `7384215`：重设计复习、统计、设置和个人资料页面为极简线性风格。

## 维护规则

- 只记录已发生并可追溯到提交、命令或人工记录的变化。
- 未来任务进入 `planning/`，未关闭风险进入 `current/IssuesAndReview.md`。
- 历史命令结果必须标明日期，不能写成当前验证。
- 重大发布应记录版本、环境、构建结果、迁移、回滚点和人工验收设备。

# Changelog

本文件从 2026-07-02 起维护可确认的版本变化。不追溯伪造历史版本。

## Unreleased

- 实现 Tablet 手写笔记首版本地能力：
  - 新增 `NoteDocument` / `NoteMode` / `NoteStroke` 模型与 `tablet_notes` 本地仓库，支持 `subject-asset-annotation`、`subject-handwriting-note`、`quick-infinite-canvas` 三类文档模式。
  - `workspace` 文件批注从页面内存态升级为绑定 `subjectId + assetId` 的本地保存；橡皮、撤销、清屏和切换文件后可通过同一文档恢复。
  - `workspace` 的“+ 笔记”会创建学科手写笔记并打开 `tablet/handwriting`；随手记页面升级为无限画布，支持平移、缩放和 viewport 保存。
  - 新增 `scripts/tablet-note-model.test.ts` 与 `scripts/tablet-note-repository-core.test.ts` 覆盖模型和本地仓库核心行为；`npm.cmd run build:h5` 与 `npm.cmd run build:mp-weixin` 通过。
- 新增 Tablet 手写笔记专项计划 `docs/plans/PlanTabletHandwritingNotes.md`，明确学科文件批注、学科独立手写笔记、随手记无限画布三类能力共用本地手写内核与本地存储，并在 Mobile / Tablet 任务表中登记 `MT-11` 到 `MT-15`。
- 根据用户截图与反馈深入重构平板端独立 AI 助手页（`ai-search`）与侧边栏布局：
  - **新增 440rpx 历史会话记录侧栏卡片并内置“开启新对话”按钮**：针对用户“左边新增侧栏历史记录，把新增对话按钮也放侧栏里面”的需求，采用极简禅意圆角浮动双卡片架构：左侧新增 440rpx 宽度的历史记录侧边栏，顶部内置醒目的“+ 开启新对话”按键，下方提供多会话历史列表，支持随时切换历史对话与单条记录删除；
  - **侧栏与 AI 按钮绝对竖直居中对齐重构**：在全局导航组件 `TabletLayout` 中将左侧导航侧栏（`.sidebar`）与底部 136rpx 宽独立悬浮 AI 按钮（`.tablet-ai-float`）统一包裹进入 `.left-nav-column` Flex 垂直列容器中，应用 `align-items: center` 与 `justify-content: space-between`，彻底排除了此前因 AI 按钮 `position: fixed` 独立定位而导致的侧栏与 AI 按钮未竖直居中对齐的问题，确保在各种窗口尺寸与设备下两者中轴线绝对垂直重合；
  - **真正 100% 全屏响应式宽屏适配**：响应用户“扩展到全屏，用响应式布局”的需求，彻底移除 `max-width: 1500rpx` 定宽截断，将主对话容器改为 `width: 100%`；搭配 CSS `clamp()` 与 `@media (min-width: 768px/1100px/1600px)` 分段响应式断点自动调节页面边距与气泡阅读行宽，确保在大屏横屏下舒展美观不空洞；
  - **修复底部操作面板异常悬浮在屏幕正中间遮挡欢迎语的问题**：为多模态附件菜单 `.action-panel` 补充 `bottom: 0;` 绝对锚定，并在默认关闭状态下增加 `opacity: 0; pointer-events: none;`，彻底解决了因缺少底边锚定而导致面板默认在文档流中间高度悬浮、遮挡 Spark 欢迎光环和问候语的问题。
- 修复平板端页面首次切换时侧栏胶囊闪动：将 `TabletLayout` 侧栏指示器动效缩短至 120ms，使其在 160ms 路由重载前至少预留 2 帧完成落位；新页面首帧导航索引改为优先读取当前路由，仅当 store 路径与当前路由一致时复用 store，并更新 `scripts/check-tablet-sidebar-transition.mjs` 回归检查该时序与初始化规则。
- 彻底解决平板端页面首次加载与路由切换时的白屏闪烁问题（Tablet Flickering Fixes）：
  - **消除首屏加载进场动画与透明度锁定**：在 `useLayoutStore` 中增补 `isInitialRender` 首次渲染标识。当用户首次启动应用或冷启动直接打开平板端页面时，`TabletLayout` 首帧即时渲染，不再默认触发 `opacity: 0` 至 `1` 与缩放位移动画，彻底避免图表与 DOM 容器在动画期间异步加载数据和计算布局时引发的 WebKit 白屏闪跃；
  - **消除首屏与路由切换时侧栏的白屏闪烁（Sidebar First-Load & Switching Flicker Fix）**：在 `useLayoutStore` 中增补 `activeNavIndex` 与 `activeNavPath` 全局跨页面路由记忆状态。当在 `TabletLayout` 组件中触发 `navigate(path)` 路由跳转时，在调用 `uni.redirectTo` 销毁前即时同步目标索引至 Pinia 全局内存；新页面组件在 `setup` 实例化阶段直接从全局内存读取目标索引初始化 `displayIndex` 与 `currentPath`，彻底弥补了 Uni-app 路由跳转期间在 `setup()` 调用 `getCurrentPages()` 返回上一级旧页面栈节点的底层缺陷，实现了路由切换新页面挂载时侧栏胶囊与高亮图标首帧零偏差落位；同时彻底废除了原有通过 `setTimeout(..., 50)` 异步延迟 50ms 添加 `animate-capsule` class 和 `transition: transform` 的逻辑，避免了页面初始渲染 50ms 后 WebKit 强制提升 GPU 复合层（Compositing Layer Promotion）引发的侧边栏瞬间白光闪烁；对 `.sidebar`、`.active-capsule-indicator` 及 `.line-icon` 全面配置了 `transform: translateZ(0)` 与 `will-change: transform` 硬件加速，确保在应用冷启动首次加载（First Load）与路由切换时，侧边栏与 SVG Data URI 图标直接在独立 GPU 纹理层渲染，斩断了首次解析 SVG Mask 时的底色闪跃；
  - **消除 CSS transition 与 GPU animation 冲突**：移除 `TabletLayout` 核心容器 `.main-content` 基础样式中对 `transform` 和 `opacity` 的 `transition` 过渡属性，避免 650ms 进场动画收尾移除 class 时引发 WebKit 过渡重置与样式重计算闪烁；同时补齐了离场动画 `@keyframes tabletExit*` 规则；
  - **优化 SVG 元素在 WebKit 下的过渡渲染**：优化 `WeeklyChart` 柱状图，废除对 SVG 元素使用的 `transition: all`，精确限定为 `y`、`height` 与 `fill`；将 `SubjectPieChart` 圆环过渡时间由 1s 调整为 0.5s 柔和缓动；将启动分流页 `launch/index.vue` 底色优化为与平板一致的 `#F9F9F7` 象牙白，实现跨路由无缝平滑衔接。
- 修复 Mobile / Tablet 移动端与平板端在 TypeScript 类型检查及 ESLint/StyleLint 审查中发现的静态检查错误：为 localDb 增补 executeSql 兼容方法与参数绑定处理以修复笔记本存储（notebookStorage）调用；在 useBlockStore 中支持创建知识块时时间字段（time）自动默认填充；为 profile 与 workspace 中相关字号、面板、难度等选项常量增补严格的类型注解；在 subject-hall 中统一采用 v-model 双向绑定并补充标准 line-clamp 属性。
- 清理后端 Java 代码中未使用的 ResponseEntity 导入（AiController）与未使用的 knowledgeBlockService 字段引用（IngestionStreamConsumer）。
- 去掉平板端学科大厅（`subject-hall`）右下角冗余的 AI 悬浮球按钮及抽屉式对话浮窗，精简页面结构，让学科大厅专注于知识体系的创建与检索，AI 功能全量收归至全局侧边栏“AI”专栏与单学科工作区内。
- 重构平板端学科工作区（`workspace`）UI 架构与 AI 助手交互模式：
  - 将单学科内原本挤压并占据固定右侧宽度的静态 AI 边栏及右侧抽屉面板，全面升级为**可按住头部自由拖拽与响应式缩放的全屏自由浮窗**（`.ai-floating-window`）：由右下角通用悬浮球（`.ai-fab-btn`，触发打开后自动隐藏以保持视窗清爽）点击展开，彻底彻底取消了遮罩层，用户可以一边保持 AI 伴读与生成浮窗开启，一边无缝操作底层的知识块、文件文档与总结笔记；支持触控屏与鼠标在全屏可见区域内按住头部拖拽平移，同时**在浮窗底部的左下角与右下角增设了与边缘圆角契合的描边缩放手柄（`.resize-handle.bottom-left` 与 `.bottom-right`）**：采用 `border-radius: 36rpx` 搭配 6rpx 加粗描边完美贴合窗口底层圆角（边缘圆角描边），悬停时平滑过渡亮起鼠尾草绿，右下角支持同步调节宽高，左下角支持反向调节宽度与位置；优化了浮窗内聊天流与欢迎区的布局适配（`box-sizing: border-box` / `margin: auto 0` / `width: 100%`），解决了弹窗打开时页面内容不居中的问题，使 Spark 脉冲光环、问候语与快捷提问胶囊在视窗中完美垂直与水平居中；此外**参照独立 AI 页（`ai-search`）全面套入了标准化交互组件与样式**：头部集成三大模型模式下拉菜单（学霸模式/通用模式/翻译模式）与“开启新对话”按键；对话流支持完整 Markdown 语法渲染、一键复制与“+ 提炼为知识块”核心动作（直接无缝保存至当前学科知识库）；底部升级为胶囊输入栏（`.ai-capsule`）搭配“+”多模态附件操作面板（拍照扫描/图库导入/知识块关联），打造了与全平台高度统一的移动端 AI 伴读交互体系；
  - 将工作区内原本割裂、无缝贴合的“导航栏+列表侧栏+主内容区”多重边框直角拼装布局，升级为极简禅意（Zen Minimalist）圆角浮动卡片双栏体系：在象牙白底色（`#F9F9F7`）上方悬浮“左侧导航列表卡片”与“右侧核心工作区卡片”，均赋予 36rpx 圆角、细发丝边框与柔和阴影；**调大了左侧分栏抽屉宽度并升级为 `380rpx`~`45vw` 弹性伸缩架构，精简了导航与列表内的全部文字描述，同时全面补齐了 `white-space: nowrap; text-overflow: ellipsis; overflow: hidden;` 单行溢出省略样式**；
  - **全面优化侧栏文件选择响应式布局及交互与大屏文件阅读体系**：将左侧 `.tier2-drawer` 抽屉升级为弹性响应式宽度架构；针对 CSS Flexbox 默认 `min-width: auto` 导致侧栏容器被内部横向滚动条或长文本撑破问题，对 `.tier2-drawer`、`.drawer-content`、`.drawer-scroll`、`.file-item` 及 `.summary-file-selector` 增加了严格的 `width: 100%; min-width: 0; max-width: 100%; overflow: hidden; box-sizing: border-box` 约束，彻底解决“文件选择框没有在框内、穿模穿入侧栏框中”的溢出异常；文件列表中的操作按钮与项目项支持 Flex 自适应换行与单行溢出保护，总结与大纲面板顶端新增响应式多文件联动选择横条（水平滚动点选教材药丸）；
  - **将单学科工作区文件阅读页重构为以“照片和 PDF 为呈现主体 + 极简按钮 + 全屏可手写标注”的大屏研读专区（Photo & PDF Handwriting Study Stage）**：根据用户反馈“文件展示主要内容为照片和PDF、按钮简约、主体为可手写页面”，废除了原先挤占视窗的大段文本导读卡片和冗余操作框；点击右侧主工作区文件后，中央区域直接高保真呈现高清照片或 PDF 预览阅读层；同时**在文档顶部无缝叠层了自研手写笔迹引擎与交互画布（`HandwritingEngine` + `<canvas>`）**，并内置了极简禅意手写与浏览工具条（`.hw-mini-bar`）：支持一键切换「✋ 浏览/缩放」模式与「╱ 钢笔」、「═ 荧光笔」、「◌ 橡皮」批注模式，配备禅意四色画笔（墨黑、鼠尾草绿、警示红、海洋蓝）与线宽调节、撤销及清屏功能，让用户可以在拍摄的黑板/试卷照片及 PDF 讲义上自由进行手写圈画、涂鸦与笔记批注，并且手写笔迹会根据对应文件 ID 自动进行内存与页面持久化保留；
  - **精简头部控制栏与操作按键视觉风格**：彻底移除原来文件功能按键上冗余的 Emoji 表情符号（✨、🧩、👁️、🗑️等），将按键转变为符合极简禅意（Zen Minimalist）风格的单色文字/线框胶囊形态（如纯净的 `AI 伴读`、`提炼卡片`、`外部打开` 与 `删除`），并在 hover 时平滑展示象牙白或微淡红色底背景，使整个页面呈现极致清爽、专注且高度专业的大屏生产力体验；
  - 优化了列表项在白色卡片背景中的视觉层次，选中状态统一采用鼠尾草绿（`#7D9372`）高亮与文字对齐，实现了整个单学科工作区的视觉重塑与禅意统一。
- 将平板端首页控制台（`dashboard`）的“添加日程/快建”功能由原本嵌入在左栏中的卡片形态，重构为与手机端完全一致的顶层悬浮弹窗（`quick-add-mask` + `quick-add-container`）：
  - 新增全屏半透明遮罩层，支持点击空白处或 X 按钮平滑收起弹层；
  - 采用绝对定位（`position: absolute`）使快捷输入框与操作选择栏浮动在最顶层（`z-index: 9999`），点击展开不再把下方的周视图与待办任务列表往下推挤，保持界面交互禅意流畅；
  - 同步引入了手机端的竖向排列学科下拉菜单（`subject-dropdown-btn` 与 `subject-vertical-popup`）与 0-2 小时每半小时一档的连滑分段可拖拽时段选择器（`segmented-track`）。
- 优化平板端首页控制台（`dashboard`）右侧 38% 数据洞察栏的垂直空间分配与视觉表现：
  - 将顶部 Hero 综述卡（Card 1）由原本占屏幕四分之一高度调整为 `flex: none / height: auto`，使其精准收缩至仅包裹文字和指标数据，并在右侧指标外增加半透明毛玻璃拟态底框（Glassmorphism Pill Box），彻底消除绿色空洞；
  - 顶部卡片释放的高度空间转交下方本周趋势（Card 2）、学科分布（Card 3）与专注热力图（Card 4）三张图表卡片等分（各分得约1/3剩余空间）；
  - 全面大规格化三张图表的视觉幅面：周趋势图加大柱宽至 28px/圆角 rx=14 并调高星期标数字号；学科分布圆环从 150rpx 增至 200rpx，中间总数字号增至 32px，图例增宽至 380rpx；学习热力图精简为近 16 周（112天），采用 `repeat(16, 1fr) × repeat(7, 1fr)` 100% 弹性拉伸与常驻底部提示栏，消除了 WebKit/Webview 下初次加载时的宽高比死循环崩溃与高度突变异常，同时拉大间距 `gap: 10rpx` 并加粗边框，使格子面积大幅增加且轮廓鲜明，自适应饱满铺满空间。
- 修复登录失效旧路由残留：401 refresh token 失败后按当前端回到手机或平板登录页。
- 新增 `pages/launch/index` 一次性设备分流入口，并移除 `App.vue` 中运行时手机/平板互跳映射；物理分包后置到平板端重构稳定后。
- 调整微信小程序构建口径：`MP-WEIXIN` 下 `pages.json` 只注册 `pages/launch/index` 与 `pages/mobile/*`，平板页不进入小程序包，`launch` 在小程序下固定进入手机首页。
- 登记 `docs/MobilePagesAPIMap.md` 到文档中心索引。
- 记录当前验收口径：Mobile H5 build 通过；`type-check` 仍受当前 `vue-tsc` / Node / TypeScript 组合影响，暂不作为业务通过依据；平板端剩余问题继续单独跟踪。
- 完成手机端极简禅意 UI 深度重构与规范化：
  - 新增通用组件 `AppHeader.vue` 与 `AppTabBar.vue`（彻底替代旧 header 与原生菜单）；
  - 将底栏 4 大功能标签优化为：日程、复习、专注(番茄钟)、洞察；
  - 个人中心入口由底栏转移至顶栏右上角用户信息徽章（头像+用户名）；
  - 首页恢复左右滑动切换日期逻辑 (`day-swiper`)，将中间参数框优化为横向并排全圆角胶囊。
- 新增 `docs/frontend/design.md`，统一细化 PC、Mobile、Tablet 前端页面功能、数据依赖和页面级验收清单。
- 待补：后端 Auth、Asset、Sync 测试。
- 待补：直接 CRUD 删除与同步软删除语义统一。
- 待补：MinIO 对象存在性、大小和 content-type 校验。
- 待补：CI/CD 自动化构建流程。
- 待补：PC 登录守卫恢复。
- 待补：Mobile / Tablet 前端重构页面注册和导航收口。
- 待补：`application-prod.yml` LangChain4j 配置口径统一。

## 2026-07-02 v3.1

### Added

- 新增 `AgentBeforeCoding.md`，作为 Agent 每次写代码前必读文档。
- 新增 `CurrentIssuesAndReview.md`，记录当前问题清单和轻量代码审查结论。
- 新增根目录 `AGENTS.md`，作为后续编码 Agent 的仓库级入口。

### Changed

- 将现行文档从 `Demand/v3/` 迁移到 `docs/`。
- 将旧 PRD 和任务总表归档到 `docs/archive/legacy-demand/`。
- 规范 `docs/` 文档命名和 README 索引。
- 将开发计划拆分到 `docs/plans/`，并细化为带任务编号、优先级、输入、产出、验收标准的领域计划。
- 将构建通过但未人工验收的模块统一标为 `已构建待验收`。
- 补充前端重构状态：PC 路由守卫临时关闭，Mobile / Tablet 页面仍在收口。
- 补充生产配置风险：默认密码、AI 配置口径、CI/CD、Runbook 演练。

## 2026-07-02

### Added

- 新增 `docs/` 中文文档体系。
- 新增项目基础、规范、PRD、架构、前后端模块、API、数据库、部署、Runbook、计划、状态、Changelog、用户手册提纲。

### Changed

- 文档状态口径统一为：已验收、已构建待验收、进行中、计划中、阻塞。
- 原始中文 PRD 和 task 归档为历史来源文档；旧接口清单如需要可从 Git 历史恢复。

### Verified

- 后端 `mvn test` 通过，但当前没有测试源码。
- PC 前端 `npm.cmd run build` 通过。
- Mobile H5 `npm.cmd run build:h5` 通过，但仍有警告。

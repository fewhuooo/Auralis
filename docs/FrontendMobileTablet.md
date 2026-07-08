# Mobile / Tablet 前端模块说明

更新时间：2026-07-08

## 模块定位

`StudyCore-Mobile` 是移动端和平板端入口。手机侧重轻量捕获、复习、查看进度；平板侧重大屏学习、手写、阅读、统计和专注。

页面级功能设计详见 `docs/frontend/design.md`。

## 技术栈

- Vue 3
- Uni-app
- TypeScript
- Pinia
- Vite
- Sass
- marked
- jspdf
- perfect-freehand

## 目录结构

```text
StudyCore-Mobile/
├── src/api/              # 请求、AI、同步、设备信息
├── src/components/       # 通用组件和平板布局组件
├── src/pages/mobile/     # 手机端独立页面
├── src/pages/tablet/     # 平板端独立页面
├── src/services/         # 本地数据库、手写、笔记存储
├── src/store/            # Pinia Store
├── src/pages.json        # 页面和路由配置
└── package.json
```

## 手机端页面

| 页面 | 职责 | 状态 |
| --- | --- | --- |
| home | 今日学习、入口聚合 | 已构建待验收 |
| login | 登录注册 | 已构建待验收 |
| ai-search | AI 搜索或问答入口 | 已构建待验收 |
| asset | 资料与资产入口 | 已构建待验收 |
| handwriting | 手写笔记 | 已构建待验收 |
| pomodoro | 专注计时 | 已构建待验收 |
| profile | 个人空间 | 已构建待验收 |
| review | 复习 | 已构建待验收 |
| settings | 设置 | 已构建待验收 |
| stats | 学习统计 | 已构建待验收 |
| timeline | 时间线 | 已构建待验收 |

## 平板端页面

当前 `pages.json` 在非微信小程序目标中注册平板端页面，并已完成向极简禅意（Zen Minimalist）风格与大屏多列布局的深度迁移。微信小程序目标通过 `MP-WEIXIN` 条件编译只注册手机端页面，不包含 `pages/tablet/*`。

| 页面 | 路径 | 职责 | 状态 |
| --- | --- | --- | --- |
| dashboard | `pages/tablet/dashboard/index` | 平板首页控制台（62% 日程行动与 38% 数据洞察的禅意弹性分栏；左侧添加日程功能改为与手机端一致的顶层悬浮弹窗结构，支持半透明遮罩、学科下拉菜单与 0-2 小时连滑式时段选择，点击不挤压下方视窗；右侧为全宽单列堆叠：顶部Hero卡收缩包裹内容，下方趋势、分布与热力图三卡等分剩余空间；热力图调整为近16周/112天并采用 repeat(16, 1fr) x repeat(7, 1fr) 100% 均分布局、常驻底部提示栏消除初次加载跳动与死循环渲染异常，同时增大间距 gap 至 10rpx 并加粗格子边框边界，大面积饱满铺满空间） | 已完成重构与构建 |
| subject-hall | `pages/tablet/subject-hall/index` | 学科大厅（大图卡片矩阵、毛玻璃搜索框、全圆角渐变掌握度进度条；已移除冗余的右下角 AI 悬浮球，AI 规划功能统一收拢至左侧全局侧边栏 AI 专栏与单学科工作区内） | 已完成重构与构建 |
| workspace | `pages/tablet/workspace/index` | 学科工作区（四大支柱：文件、知识库、总结、复习；支持 AI 章节要点与内嵌卡片记忆复习；升级为极简禅意圆角浮动卡片双栏架构，全面优化侧栏文件选择响应式布局及交互：左侧 `.tier2-drawer` 抽屉升级为 `380rpx`~`45vw` 弹性伸缩架构，针对 CSS Flexbox 默认 `min-width: auto` 导致的侧栏容器宽度被内部横向滚动条或长文本撑破问题，对 `.tier2-drawer`、`.drawer-content`、`.drawer-scroll`、`.file-item` 及 `.summary-file-selector` 增加了严格的 `width: 100%; min-width: 0; max-width: 100%; overflow: hidden; box-sizing: border-box` 约束，彻底解决“文件选择框没有在框内、穿入侧栏框中”的穿模溢出异常；总结与大纲面板顶端新增响应式多文件水平联动药丸选择器；主工作区保留文件阅读层和 AI 伴读；Tablet 手写批注与学科手写笔记代码已保留，但“+ 笔记”、批注工具条和手写 note 文件默认由 `VITE_TABLET_HANDWRITING_NOTES_ENABLED` 隐藏；AI 助手由侧滑抽屉重构为右下角悬浮球触发、支持按住顶部自由拖拽且无遮罩不阻挡底层工作的全屏自由浮窗；浮窗底部的左下角与右下角配置了与边缘圆角契合的描边缩放手柄，支持双向调节窗口宽高与位置，内部集成三大模型模式下拉栏、极简 Spark 欢迎光环、快捷提问胶囊、Markdown 富文本渲染与多模态附件胶囊输入栏） | 已隐藏保留 |
| handwriting | `pages/tablet/handwriting/index` | 随手记草稿本与学科手写笔记编辑页（统一使用 `NoteDocument`；页面文件和路由保留，左侧导航默认不显示；重新启用需设置 `VITE_TABLET_HANDWRITING_NOTES_ENABLED=true`） | 已隐藏保留 |
| pomodoro | `pages/tablet/pomodoro/index` | 专注计时（圆环计时器、自研 SVG 图标控件、每日进度统计） | 已完成重构与构建 |
| review | `pages/tablet/review/index` | 知识复习（大屏卡片记忆堆叠，现已整合收拢至 `workspace` 学科工作区复习面板中） | 已完成整合收拢 |
| stats | `pages/tablet/stats/index` | 数据洞察（双栏大指标、热力图、一周趋势与学科分布图表） | 已完成重构与构建 |
| profile | `pages/tablet/profile/index` | 个人中心与设置（3:7 弹性双栏架构：30% 个人卡片与 70% 账户及 AI 引擎设置项） | 已完成重构与构建 |
| ai-search | `pages/tablet/ai-search/index` | 平板 AI 助手（根据用户需求“把手机端宽屏适配就好了”、“扩展到全屏，用响应式布局”及“左边新增侧栏历史记录，把新增对话按钮也放侧栏里面”，采用极简禅意圆角浮动双卡片架构：左侧为 440rpx 宽的历史会话记录卡片，顶部内置醒目的“+ 开启新对话”按键，下方支持会话切换与单条记录删除；右侧为 100% 宽度真正全屏扩展的主对话卡片，搭配 CSS `clamp()` 与 `@media (min-width: 768px/1100px/1600px)` 分段响应式断点自动调节边距与气泡比例；侧栏底部左下角独立外置了与手机端一致的 136rpx 宽独立悬浮 AI 按钮，上下缩进对齐完美契合；多模态附件菜单已补充 `bottom: 0` 绝对定位与透明度穿透隔离，修复了中间悬浮遮挡问题） | 已完成重构与构建 |
| login | `pages/tablet/login/index` | 平板端登录/注册（极简禅白表单卡片） | 已完成重构与构建 |

当前 git 状态显示已删除或整合的旧平板页面：

- `src/pages/tablet/asset/index.vue`
- `src/pages/tablet/timeline/index.vue`

这些能力已无缝整合至新版 `workspace`（资产编排与知识块处理）与 `dashboard`（动态学习时间线与统计图表）中。

## 重构状态

Mobile / Tablet 当前重构状态：

- **手机端**：已完成极简禅意（Zen Minimalist）风格与底部悬浮 TabBar 移植重构。移除了原有的左上角汉堡菜单侧边栏，引入底部浮动 TabBar 胶囊组件（包含首页、复习、数据洞察、个人空间 4-Tab 切换）与右侧独立悬浮 AI 按钮；首页强调色已全量升级为鼠尾草绿。
- **平板端**：已全面完成向极简禅意（Zen Minimalist）体系与全景大屏生产力架构的深度重构与升级！全面废弃竖向单向列表，采用横向大屏弹性多栏分层布局（首页 62:38 非滑动全屏控制台、设置页 3:7 分栏、工作区四大支柱圆角浮动卡片双栏架构）；针对 AI 助手页根据用户反馈升级为圆角浮动双卡片体系（左侧 440rpx 历史会话卡片顶部内置“+ 开启新对话”按键与会话列表 + 右侧 100% 宽度全量采用 `clamp()` 与分段 `@media` 响应式查询实现真正的全屏自适应扩展）；在全局导航组件 `TabletLayout` 中将左侧导航侧栏与底部 136rpx 宽独立悬浮 AI 按钮统一包裹进入 `.left-nav-column` Flex 垂直列容器中（`align-items: center`），彻底解决了此前因 `position: fixed` 独立定位导致的侧栏与 AI 按钮未竖直居中对齐的问题，保证在所有分辨率和设备下两者的垂直中心轴绝对重合对齐；针对学科工作区侧栏文件选择响应式布局及交互进行了深度优化：将左侧 `.tier2-drawer` 抽屉升级为弹性响应式宽度架构（`380rpx`~`45vw` 弹性伸缩），文件列表操作项与元信息支持 Flex 自适应换行与单行溢出保护，总结与大纲面板顶端新增响应式多文件水平联动药丸选择器，主工作区新增响应式大屏文件详情与智能伴读工作区（File Detail & AI Companion Workspace），点击文件立刻渲染文档智能导读摘要、AI 章节跳转提问、图片缩放与一键知识块转化工具链，彻底解决文件点击无反应与侧栏挤压问题；将单学科内 AI 助手由静态边栏与侧滑抽屉彻底升级为右下角悬浮球触发、支持按住顶部自由拖拽、底部左右下角描边缩放手柄且无遮罩的全屏自由浮窗；首页强调色由黑色全量替换为鼠尾草绿，彻底告别滚动条。构建验证 `npm run build:h5` 顺利通过！
- 平板端与手机端页面目录完全解耦并分类在各自的 `src/pages/tablet/` 与 `src/pages/mobile/` 子文件夹中。

## 本地存储与同步

- Store 层管理业务状态。
- `localDb.ts` 负责本地数据读写。
- `tabletNoteModel.ts`、`tabletNoteRepositoryCore.ts`、`tabletNoteRepository.ts` 和 `notebookStorage.ts` 共同维护 Tablet 手写 `NoteDocument`，覆盖 `subject-asset-annotation`、`subject-handwriting-note` 和 `quick-infinite-canvas` 三种模式。
- 端侧 SQLite 新增 `tablet_notes` 表，本阶段只做本地保存，不新增后端接口和云同步。
- Tablet 手写入口当前默认隐藏：设置 `VITE_TABLET_HANDWRITING_NOTES_ENABLED=true` 后，平板侧栏会重新显示“随手记”，workspace 会显示“+ 笔记”和文件批注工具条。
- `useSyncStore` 负责同步推送、拉取和 WebSocket 协调。
- 移动端需要重点验证弱网、离线、重新登录后的数据恢复。

## 手机端 UI 与导航架构规范

手机端已全面升级为极简禅意（Zen Minimalist）体系：
- **公共顶栏 `AppHeader.vue`**：遵循标题居左规范，右侧集成用户信息徽章（头像+用户名），点击该徽章统一进入个人中心 (`/pages/mobile/profile/index`)。
- **公共底栏 `AppTabBar.vue`**：采用悬浮全圆角胶囊布局，左侧为 4 个主要生产力选项卡（日程 `home`、复习 `review`、专注 `pomodoro`、洞察 `stats`），右侧独立部署 AI 悬浮入口球。
- **首页 `home/index.vue`**：支持 `day-swiper` 左右滑动切换周日期，中间采用并排横向全圆角胶囊呈现专注时长与任务统计，新建日程操作整合至问候语行右侧。

## 构建与验收

安装依赖：

```powershell
cd StudyCore-Mobile
npm install
```

H5 开发：

```powershell
npm run dev:h5
```

H5 构建：

```powershell
npm.cmd run build:h5
```

微信小程序构建：

```powershell
npm.cmd run build:mp-weixin
```

当前状态：H5 构建 `npm run build:h5` 顺利验证通过；微信小程序构建 `npm run build:mp-weixin` 顺利验证通过，产物只包含 `pages/launch/index` 与 `pages/mobile/*`。

平板端侧栏切换回归检查：

```powershell
node scripts\check-tablet-sidebar-transition.mjs
```

该脚本检查 `TabletLayout` 侧栏指示器 120ms 动效必须早于 160ms 路由重载至少 2 帧完成，并确认新页面首帧导航索引采用当前路由优先、store 仅在路径一致时复用，避免首次页面切换时侧栏胶囊从旧索引闪回。

手机端路由收口状态：

- 401 refresh token 失败后的登录跳转按当前端返回：手机端 `/pages/mobile/login/index`，平板端 `/pages/tablet/login/index`。
- 新增 `pages/launch/index` 作为一次性设备分流入口：手机进入 `/pages/mobile/home/index`，平板进入 `/pages/tablet/dashboard/index`。
- `App.vue` 已移除运行时手机/平板互跳映射和窗口尺寸变化自动 `reLaunch`，进入某一端后仅在本端内部导航。
- 微信小程序按产品边界只包含手机端页面：`pages/launch/index` 在 `MP-WEIXIN` 下固定进入 `/pages/mobile/home/index`，不再根据设备尺寸跳转平板页。
- 物理分包暂缓，当前先通过 `pages.json` 条件编译区分微信小程序和非小程序页面清单。

## 待处理事项

- App、Harmony 等目标平台尚未进行真机或多平台运行验证；微信小程序已完成命令行构建验证，但仍需微信开发者工具和真机走查。
- 平板端新页面在真实触控屏下的复杂交互（如手写识别、双指缩放、多任务拖拽等）需结合真机走查。
- 手写识别、图片上传和 AI 转换需要后端联调。
- 同步冲突、断网重试、冷启动恢复需要专项回归测试。

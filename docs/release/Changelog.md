# Auralis 变更记录

更新时间：2026-07-14

文档状态：现行历史记录

权威范围：已发生且可确认的产品、代码、文档和验证变化

事实来源：Git 提交、本轮实际验证记录与重构前快照

## Unreleased

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

- 创建学科弹层改用 16 个可访问的 Element Plus 线条图标，新建学科保存语义键；大厅、首页和工作区用同一解析器渲染。
- 已有 Emoji 学科不迁移，编辑时未重选图标会原样保存；原生任务学科下拉保留旧 Emoji 前缀但不输出新的语义键。
- 应用入口加载 `element-plus/theme-chalk/el-icon.css`，确保图标容器及 SVG 按指定尺寸渲染。
- 移除创建学科的主题色选择；新建学科默认色及工作区左下角学科图标底色统一为 Sage Green `#7D9372`，图标使用白色。
- 2026-07-14：`npm.cmd run check:subject-icons` 与 `npm.cmd run build` 通过；浏览器/Tauri 图标显示仍待人工验收。

### PC 学科工作区原型（2026-07-13）

- 文件选择改为中栏 Markdown 总结；文件项移除右侧操作按钮。
- 大纲改为“AI 梳理”与圆形“+”顶栏，支持左栏内联新增、章节排序与限定在章节内的小节排序；当前不持久化。
- 右侧 AI 伴读采用移动端同源的星环、头像、气泡和胶囊输入视觉，清空改为图标按钮。
- `npm.cmd run check:subject-workspace` 与 `npm.cmd run build` 已通过；浏览器/Tauri 交互仍待人工验收。

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

# StudyCore 全平台生产力系统 - 完整开发任务清单 (PC & Mobile & Tablet)

## 阶段一：基础脚手架与桌面端赋能 (PC) - [已完成]
- [x] 1.1 运行 Vite 初始化工程：`npx create-vite@latest StudyCore-PC --template vue-ts`
- [x] 1.2 安装项目基础 npm 依赖：`npm install`
- [x] 1.3 引入桌面端内核：安装 Tauri CLI 开发依赖 `npm install -D @tauri-apps/cli@latest`
- [x] 1.4 初始化 Tauri 配置：执行 `npx tauri init` 并配置基本的 `tauri.conf.json` 参数

## 阶段二：工程化核心依赖安装与配置 (PC) - [已完成]
- [x] 2.1 安装前端路由：`npm install vue-router@4`
- [x] 2.2 安装状态管理库：`npm install pinia`
- [x] 2.3 安装 UI 组件库：`npm install element-plus`
- [x] 2.4 安装自动导入插件（提升开发效率）：`npm install -D unplugin-vue-components unplugin-auto-import`
- [x] 2.5 编写 `vite.config.ts`：配置组件自动导入、路径别名 (`@/`) 以及 Tauri 的兼容性构建选项

## 阶段三：目录结构与全局设置 (PC) - [已完成]
- [x] 3.1 梳理项目目录结构：在 `src` 下建立 `views`(页面)、`components`(组件)、`store`(状态)、`router`(路由)、`assets`(静态资源)、`styles`(样式)
- [x] 3.2 实例化路由配置：创建 `src/router/index.ts`，定义基础路由结构（如 `/` 为主页，`/timeline` 为时间流排期页）
- [x] 3.3 实例化状态管理：在 `src/main.ts` 中注册 Pinia 和 Router
- [x] 3.4 设立全局样式字典：创建 `src/styles/index.css`，定义品牌色、字体规范、以及暗色模式 (Dark Mode) 基础 CSS 变量

## 阶段四：核心骨架与导航开发 (PC) - [已完成]
- [x] 4.1 开发侧边栏组件：`src/components/layout/AppSidebar.vue`，包含知识库、PDF阅读、任务排期等导航入口
- [x] 4.2 开发顶部栏组件：`src/components/layout/AppHeader.vue`，包含全局搜素唤醒入口与用户状态
- [x] 4.3 组装主应用程序：重构 `src/App.vue`，融合侧边栏、顶部栏与 Vue Router 的内容渲染出口 `<router-view>`

## 阶段五：PC端核心业务页面搭建 (PC) - [已完成]
- [x] 5.1 搭建【知识聚合与问答主页】：创建 `src/views/Home/index.vue`
- [x] 5.2 细化主页 UI：开发类似主流 AI 产品的聊天式输入框与“知识块”的卡片展示列表
- [x] 5.3 搭建【重型资产编排与排期页】：创建 `src/views/Timeline/index.vue`
- [x] 5.4 细化排期页 UI：开发可视化时间轴，并预留拖拽“任务块”的交互区

## 阶段六：全局数据流与状态管理 (PC) - [已完成]
- [x] 6.1 定义“知识块 (Block)”模型与 Store：建立 `src/store/useBlockStore.ts`，管理知识库的检索结果与本地缓存
- [x] 6.2 定义“任务块 (Task)”模型与 Store：建立 `src/store/useTaskStore.ts`，管理时间流中的任务排期数据
- [x] 6.3 实现状态持久化配置：确保 PC 端刷新后，已编排的任务数据不丢失

## 阶段七：交互深度优化 (PC) - [已完成]
- [x] 7.1 实现“排期页”拖拽逻辑：使用 `vuedraggable` 或原生 API 实现任务块从待办区到时间轴的拖拽
- [x] 7.2 开发“全局知识唤醒”弹窗 (Command Palette)：点击搜索框或按下 `Ctrl+K` 时弹出居中的 AI 搜索对话框
- [x] 7.3 实现“资产编排”上传模拟逻辑：模拟文件粉碎过程中的进度条动画与结果反馈

## 阶段八：Mock 数据与后端对接预研 (PC) - [已完成]
- [x] 8.1 编写 Mock 数据脚本：为三个核心页面生成丰富的测试数据
- [x] 8.2 预研 Tauri HTTP/Rust 接口调用：配置前端通过 Tauri Invoke 与后端逻辑通信的基础逻辑
- [x] 8.3 建立 WebSocket/Event 事件管道：用于接收移动端或其他端的实时同步通知

---

## 阶段九：环境初始化与跨端适配 (Mobile) - [已完成]
- [x] 9.1 创建 Uni-app 工程：使用 Vite + Vue3 + TS 模板初始化 `StudyCore-Mobile`
- [x] 9.2 设计系统迁移：将 PC 端的 `index.css` 变量适配至移动端全局样式，支持跟随系统的 Dark Mode
- [x] 9.3 配置基础路由与 TabBar：定义首页(知识)、排期、资产(文件上传)、我的四大页面

## 阶段十：移动端核心视图开发 (Mobile) - [已完成]
- [x] 10.1 搭建【知识 Hub 首页】：实现沉浸式搜索框、语音录入悬浮按钮与知识卡片流
- [x] 10.2 搭建【移动端时间轴】：针对窄屏优化的竖向时间流，支持滑动手势完成任务
- [x] 10.3 搭建【移动端资产页】：实现手机拍照扫描、系统文件选择与上传进度反馈
- [x] 10.4 移动端布局调优：确保在不同尺寸手机（iOS/Android）及平板上的响应式表现

## 阶段十一：逻辑复用与状态同步 (Mobile) - [已完成]
- [x] 11.1 跨端 Store 迁移：复用 `useBlockStore` 和 `useTaskStore` 逻辑，适配 `uni-storage` 持久化
- [x] 11.2 集成移动端专属 API：如调用相机、震动反馈、通知提醒等
- [x] 11.3 联调预研：测试移动端通过网络与 PC 端（Tauri 服务）进行数据握手与同步

---

## 阶段十二：平板端开发与多模态交互 (Tablet & Multimodal) - [已完成]
- [x] 12.1 **响应式架构隔离**：利用 CSS Media Queries 实现手机（时间流优先）与平板（仪表盘优先）的完全解耦
- [x] 12.2 **PDF 智能伴读 UI**：仿 NotebookLM 风格的沉浸式阅读器，支持侧边/悬浮 AI 伴读窗口
- [x] 12.3 **手写笔迹 AI 增强**：集成 GoodNotes 风格工具栏，实现 AI 套索圈选提取核心知识点
- [x] 12.4 **大屏 Studio 模式适配**：
  - [x] `asset/index.vue`：左侧资产树 + 右侧 Studio 预览/编辑双栏布局
  - [x] `profile/index.vue`：左侧个人数据透视 + 右侧分项设置面板
  - [x] `timeline/index.vue`：时间轴超宽屏全尺寸适配调优
- [x] 12.5 **深色模式全页面适配**：针对 Canvas 绘图、PDF 渲染层的暗色对比度动态调优，PC 端增加一键切换能力

---

## 阶段十三：AI 逻辑层与生产力闭环 (AI Engine & Productivity) - [规划中]
- [x] 13.1 **多模态入库引擎**：
  - [x] 实现手写笔迹 -> 结构化 Markdown 转换逻辑
  - [x] 实现 PDF 文档碎分化算法：根据语义自动切分为原子知识块 (Atom Blocks)
  - [x] 语音备忘录实时转文字并自动提取待办任务 (Action Items)
- [ ] 13.2 **智能调度算法 (Smart Scheduler)**：
  - [ ] AI 根据历史专注时长自动预测新任务的 Load（负荷）
  - [ ] 实现“任务自动延后”建议：当今日负荷过载时，AI 自动推荐最优延期方案
- [ ] 13.3 **全局语义搜索 (RAG Support)**：
  - [ ] 集成向量库（如 SQLite-VSS 或本地 Vector DB）
  - [ ] 支持语义匹配：“搜索上个月我拍照上传的关于神经网络的笔记”
- [ ] 13.4 **OpenClaw 本地智能体深度捆绑 (Tauri Sidecar)**：
  - [ ] 配置 Tauri 的 `externalBin` 机制，将 OpenClaw 预编译二进制文件作为 Sidecar 捆绑
  - [ ] 编写 Rust 进程守护代码，随 StudyCore-PC 启动/销毁自动管理 OpenClaw 进程
  - [ ] 动态端口探测：Rust 侧捕获 OpenClaw 分配的可用端口，并传递给前端 Vue
  - [ ] 将前端 `aiClient.ts` 重构为无需用户手动配置，自动连接内部的 OpenClaw 实例

## 阶段十四：数据基座与同步可靠性 (Data & Sync Reliability) - [规划中]
- [ ] 14.1 **跨端数据一致性 (CRDTs)**：
  - [ ] 引入冲突解决算法，确保 PC、手机、平板同时修改同一任务时不会数据丢失
  - [ ] 实现 WebSocket 断线重连与增量同步机制
- [ ] 14.2 **本地持久化优化**：
  - [ ] 使用 SQLite 或 IndexedDB 代替简单的 LocalStorage 以支持万级知识块检索
  - [ ] 资产文件（PDF、图片）的离线缓存与预加载策略
- [ ] 14.3 **端到端加密 (E2EE)**：实现全平台同步数据的本地密钥加密，保护用户隐私

## 阶段十五：高级生态与用户体验 (Ecosystem & Advanced UX) - [规划中]
- [ ] 15.1 **系统级交互增强**：
  - [ ] iOS/Android 灵动岛 (Dynamic Island) 或小组件适配，实时显示专注进度
  - [ ] 支持 Apple Watch / WearOS 任务快速勾选与语音录入同步
- [ ] 15.2 **知识可视化 (Knowledge Graph)**：
  - [ ] 在平板端实现交互式 3D 知识星图，可视化知识块之间的逻辑关联
  - [ ] 自动生成“学习周报”信息图表，支持一键分享至社交媒体
- [ ] 15.3 **生物识别加锁**：针对特定的隐私知识模块，启用 FaceID / 指纹识别访问控制

## 阶段十六：质量保障与发布准备 (QA & Launch) - [规划中]
- [ ] 16.1 **三端压力测试**：模拟千级任务、万级知识块在大尺寸设备上的渲染性能
- [ ] 16.2 **跨平台安装包构建**：
  - [ ] StudyCore-Mobile (iOS IPA / Android APK)
  - [ ] StudyCore-PC (Windows MSI / macOS DMG / Linux AppImage)
- [ ] 16.3 **离线可用性验证**：确保在无网络环境下，核心笔记与调度功能完全不受影响

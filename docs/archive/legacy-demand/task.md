# StudyCore (学核) 跨平台智能生产力中枢 - 完整开发任务清单

> **最后更新**：2026-07-02（v3 文档体系整理 + 当前任务状态校准）
> **当前阶段**：阶段十五（数据基座、同步、资产链路）进行中；阶段十七（质量保障、部署、文档）并行启动
> **架构模式**：AI 能力全部收归 Spring Boot 后端（LangChain4j 直连云端 LLM）
> **现行文档入口**：`Demand/v3/README.md`

### 📊 整体进度概览

| 阶段 | 范围 | 状态 | 说明 |
|------|------|------|------|
| 1~8 | PC 端前端骨架 | 已构建待验收 | PC 构建通过，仍需页面级人工验收 |
| 9~12 | 移动/平板端 | 已构建待验收 | H5 构建通过，目标平台与交互仍需验收 |
| 13 | AI 架构迁移 | 已构建待验收 | AI Key 不再由前端直传，统一走后端 `/api/ai/*` |
| 14 | Java 后端完善 | 已构建待验收 | `mvn test` 通过，但当前缺少测试源码 |
| 15 | 数据基座与同步 + 知识体系重构 | 进行中 | 同步软删除、资产归属校验等已加固，MinIO 对象校验与 WS 生命周期仍需补齐 |
| 16 | AI 进阶与生态 | 计划中 | Agent、知识图谱、Parent-Child RAG、模型治理待推进 |
| 17 | 质量保障与发布 | 进行中 | v3 文档已整理，测试、CI/CD、正式发布流程仍需补齐 |

> **任务状态口径**：`已验收` = 有构建、测试、联调或人工验收证据；`已构建待验收` = 代码或页面存在但缺少测试/人工验收；`进行中` = 部分实现存在但未闭环；`计划中` = 仅有需求或设计；`阻塞` = 依赖外部条件或关键决策。
> **勾选标记说明**：`[x]` = 已完成或已有实现；`[~]` = 骨架/接口已建，业务逻辑或验收待补；`[ ]` = 未开始。

### 2026-07-02 维护记录

| 类别 | 当前结论 | 后续动作 |
| --- | --- | --- |
| 文档体系 | `Demand/v3/` 已建立现行中文文档中心，原始 PRD/task/API 文档保留在 `Demand/` 根目录 | 后续需求、接口、状态变化优先同步 `Demand/v3/`，再回写本任务总表 |
| 后端构建 | `mvn test` 通过，但缺少真实测试源码 | 补 Auth、Asset、Sync、MutationLog 单元/集成测试 |
| PC 构建 | `npm.cmd run build` 通过 | 做页面级人工验收和关键交互验收 |
| Mobile H5 构建 | `npm.cmd run build:h5` 通过，有警告 | 处理构建警告，补手机/平板目标平台验收 |
| 安全加固 | BCrypt、access/refresh token 边界、资产归属校验已实现 | 补测试，并继续处理 WebSocket 长连接鉴权 |
| 同步语义 | MutationLog 删除路径已改软删除 | 统一直接 CRUD 删除和同步软删除语义 |
| 部署运维 | 已有 `docker-compose.yml`、前后端 Dockerfile、PC nginx 配置；尚未发现正式 CI/CD 与 Runbook 旧稿 | 按 `Demand/v3/40-deployment-guide.md` 与 `41-runbook.md` 走通部署演练 |

### 当前优先级

1. 补后端测试：Auth、Asset、Sync、MutationLog。
2. 统一直接 CRUD 删除与同步软删除语义。
3. 补 MinIO 绑定前对象真实存在、大小、content-type 校验。
4. 验收 WebSocket 握手鉴权、心跳续期、token 失效断连策略。
5. 处理 Mobile H5 构建警告并做目标平台验收。
6. 建立 CI/CD、部署演练和正式发布检查清单。

---

## 一、项目总览

**项目名称**：StudyCore (学核)
**项目定位**：由云端大模型（Claude / GPT / DeepSeek / Ollama）驱动、以"知识块"和"任务块"为底层数据结构的校园生产力系统。
**核心理念**：前端感知用户，Spring Boot 后端统一管理数据与 AI 编排（通过 LangChain4j 直连云端 LLM），三端通过实时总线 (WebSocket/Redis) 紧密协作。

**工程目录**：
```
StudyCore/
├── StudyCore-PC/        # Tauri 2 + Vue 3 桌面端（纯 Web 容器，不再管理 Sidecar）
├── StudyCore-Mobile/    # Uni-app Vue 3 移动/平板端
└── StudyCore-Server/    # Spring Boot 3 后端（AI 编排 + 数据管理）
```

---

## 二、行业竞品对标与架构前瞻

在开源 AI 生产力中枢领域，探索“本地优先（Local-First）”与“重度 AI 语义编排”的融合已成为技术前沿。为确保 **StudyCore (学核)** 能够在高并发、多设备同步、强安全等生产级场景下稳定运行并具备核心竞争力，我们对同类型主流开源竞品进行了深度对标，并对 StudyCore 后续的底层数据与 AI 架构进行了前瞻性规划与加固。

### 2.1 行业竞品横向对标

| 对标维度 | 🌟 Khoj (最主流的 NotebookLM 开源替代) | 🛡️ AnythingLLM (企业级 RAG 知识库) | ⚡ StudyCore (本项目：学核) |
| :--- | :--- | :--- | :--- |
| **定位与工作流** | 个人 AI “第二脑”，与 Obsidian/Emacs 深度集成 | 独立的多租户 RAG 知识库与 Agent 工作台 | 跨平台智能学习与任务管理双向闭环的生产力中枢 |
| **部署与技术栈** | Python + Django + React (容器重、运行内存开销大) | Node.js + Electron (前端重、宿主资源消耗高) | **Tauri 2 + Uni-app + Spring Boot 3 + Java 21** (极致轻量) |
| **核心痛点/瓶颈** | • 多设备同步时易发生数据状态局部冲突<br>• 重度 PDF 解析对服务器 CPU 和内存瞬间蚕食严重 | • 多租户标量过滤在百万级向量量级下检索衰减明显<br>• Electron 进程开销大，无法原生兼顾移动端 | • 虚拟线程死锁与 JDBC 锁钉死（Pinning）隐患<br>• Timeline 频繁拖拽时的索引精度枯竭问题 |
| **StudyCore 借鉴** | 抛弃重量级 Python 运行时，AI 能力完全收归高性能 Java 后端 | 借鉴其 **Workspace 隔离** 思想，采用 Milvus **Partition Key** 物理硬隔离 | 采用 **本地优先（Local-First）增量同步**，规避 Electron，实现三端轻量化 |

---

### 2.2 架构前瞻与核心重构路线

根据对标结果，我们在后续的 **阶段十五、十六、十七** 中针对性地设计了以下**生产级架构加固方案**，旨在提前消除系统隐藏“雷点”：

#### 🛠️ 阶段十五（数据基座与同步）：性能与一致性基石

##### 1. Timeline 分数索引排序（Fractional Indexing）的精度枯竭与自动重平衡
*   **隐患剖析**：在可视化 Timeline 拖拽中使用中间字符串（如在 `a` 和 `c` 之间插入 `b`）来避免全量更新是一流的非阻塞设计。但局部密集拖拽会导致字符串长度呈指数级爆炸（例如在同一位置连续拖拽 50 次，字符串拉长到数百位，严重时导致数据库索引失效或内存溢出）。
*   **重构方案**：
    *   **Lexorank 算法引入**：设计一个轻量级的 `LexorankUtil`，参考 Jira 工业级设计，生成基于 **Base36 编码**（`0-9`, `a-z`）的定长排序键。
    *   **多桶（Buckets）逻辑设计**：引入 `0|`, `1|`, `2|` 多桶设计，防止字符串无限拉长，在无可用字符空隙时提供切换桶的通道。
    *   **异步自动重平衡（Rebalance）**：在后端元数据表设置阈值（如当检测到排序字符串长度超过 30 位时），触发一个异步系统级任务，对该用户当前 Timeline 下的所有任务进行 **“全量桶重平衡”**，重新均匀分配间隔，从根本上解决精度枯竭。

##### 2. 向量多租户（Multi-Tenancy）的物理级硬隔离
*   **隐患剖析**：在百万级甚至千万级向量量级下，如果仅依靠 Milvus 的 Metadata 进行标量过滤（Scalar Filtering），会导致检索延迟飙升，因为 Milvus 在底层必须跨越大量物理数据段（Segments）做全量过滤与扫描。
*   **重构方案**：
    *   **Partition Key 方案**：在创建 Milvus Collection Schema 时，将 `userId` 显式标记为 `partition_key=true`。
    *   **底层路由机制**：Milvus 内部会基于 Hash 算法自动将相同用户的数据路由到特定的物理分区（Partition）中。
    *   **成效目标**：查询时的搜索空间直接缩小到租户物理分区内，使 P99 检索延迟稳定在 **100ms** 以内，保障绝对的多租户隔离安全。

##### 3. Redis Stream 削峰填谷与 Apache Tika 的“背压（Backpressure）”防护
*   **隐患剖析**：Apache Tika 在解析高密度图表、多模态文档或超大型 PDF 时会极度消耗 CPU 和 JVM 堆内存。如果默认使用 `@Async` 搭配无界队列，一旦发生多用户高并发上传，将直接引发 JVM OOM，甚至因为高频请求导致云端 Embedding API 触发 429 限流。
*   **重构方案**：
    *   **Redis Stream 削峰队列**：将文档解析与 Embedding 投递解耦。Tika 解析后的 TextSegment 投递至 Redis Stream，消费者基于 **令牌桶（Token Bucket）** 算法进行背压限制。
    *   **安全防爆防御（SecureContentHandler）**：严格配置 Tika 的 `SecureContentHandler`，设定合理的 `maxStringLength` 和 `maxDepth`，防止恶意上传“Zip Bomb（压缩包炸弹）”或无限循环引用的畸形 PDF 彻底拖垮后端解析管道。

---

#### 🧠 阶段十六（AI 能力进阶）：高可用与深度 RAG 实践

##### 1. Dynamic Model Pool 连接池枯竭与 OOM 规避
*   **隐患剖析**：StudyCore 允许用户自主配置 API Key 以切换模型。但在 Spring Boot 中频繁 `new OpenAiChatModel(...)` 会导致线程泄露与 TCP 连接枯竭，因为每个客户端实例都会在底层创建独立的 OkHttpClient 连接池。
*   **重构方案**：
    *   **Caffeine LRU 双层缓存**：构建高性能模型缓存池 `Cache<String, ChatLanguageModel>`，以 `API_KEY + BaseURL` 的哈希值为 Key。
    *   **优雅的 RemovalListener 释放**：配置 `expireAfterAccess(30, TimeUnit.MINUTES)`，并必须注册 `removalListener`。在模型被淘汰出缓存时，显式调用 OkHttpClient 的 `shutdown()` 方法，手动释放连接池、清理底层的 ExecutorService 和回收线程，杜绝一切内存与连接泄露。

##### 2. 生产级 RAG “断章取义”救赎：Parent-Child（主从）双层检索管线
*   **隐患剖析**：重度学术/课程知识管理中，Markdown 按二级标题物理切分虽然保护了边界，但由于切分出的 Chunk 粒度极小，直接喂给 LLM 会导致其因为“缺失上下文”而产生严重的“断章取义”与幻觉。
*   **重构方案**：
    *   **写入侧（双轨入库）**：将高精度的完整章节/大段落（Parent Block）存入 PostgreSQL；将其切分出来的更小粒度的语义碎片（Child Block）生成 Embedding 存入 Milvus，并在 Child 元数据中记录 `parent_id`。
    *   **检索侧（主从路由）**：重写 LangChain4j 的 `ContentRetriever`。当 Milvus 命中 Child 碎片后，不直接将碎片内容喂给 LLM，而是利用 `parent_id` 闪电般从 PostgreSQL 中取出完整的 Parent 章节作为 Prompt 上下文，既保证了向量检索的极高精准度，又保障了 LLM 生成阶段的上下文完整性。

---

#### 🔒 阶段十七（质量保障与安全）：全链路防御与诊断

##### 1. WebSocket 全生命周期协议级“二次鉴权”
*   **隐患剖析**：WebSocket 的特性是“一次握手，长期有效”。基于 HTTP 的 JWT 令牌过期后能被拦截器拦截并触发刷新，但已经建立的 WebSocket 长连接依然会一直保持活跃，形成了绕过安全校验的隐秘盲区。
*   **重构方案**：
    *   **握手拦截（Upgrade 校验）**：在 `HandshakeInterceptor` 的 `beforeHandshake` 阶段对初始 Token 进行严格的合法性验证。
    *   **心跳帧动态审计**：客户端在定时发送 WebSocket 心跳包（Ping）时，在自定义的 Payload 中强制携带最新的 JWT 令牌。
    *   **后端断连制裁**：后端 `SyncWebSocketHandler` 每次收到心跳后，提取令牌进行二次审计。一旦发现 Token 已失效且未能在宽限期内更新，立即调用 `session.close(new CloseStatus(1008, "Policy Violation"))` 主动切断连接，强制前端触发重新鉴权流程。

##### 2. Java 21+ 虚拟线程与 JDBC 锁钉死（Pinning）死锁防范
*   **隐患剖析**：开启虚拟线程（`spring.threads.virtual.enabled: true`）是高并发架构的正确方向，但在关系型数据库场景下存在极其隐蔽的“平台线程钉死”风险。如果我们的业务代码、第三方加密库、或 MyBatis 拦截器中仍有原生的 `synchronized` 同步块，一旦虚拟线程在 `synchronized` 内部执行了 I/O操作（如等待 JDBC 数据库连接、写本地日志），会导致底层的平台线程（Carrier Thread）被强行钉死（Pinning），使得虚拟线程彻底丧失并发优势，甚至在极端并发下导致 HikariCP 连接池级联死锁。
*   **重构方案**：
    *   **锁机制替换**：在所有核心业务与自定义拦截器中，严禁使用原生 `synchronized`，全面替换为 `java.util.concurrent.locks.ReentrantLock`。
    *   **JVM 级别检测与可观测性**：在测试和开发阶段，通过配置 JVM 参数 `-Djdk.tracePinnedThreads=short` 启动服务，严密监控并彻底消除核心数据链路上的所有 Pinning 日志；在生产环境通过 **JFR（JDK Flight Recorder）** 持续监听 `jdk.VirtualThreadPinned` 事件，确保虚拟线程能够顺畅挂起与唤醒。

---

## 三、技术栈全图

### 2.1 前端交互层 (Frontend)
| 技术 | 版本 | 用途 |
| :--- | :--- | :--- |
| Vue 3 | 3.5+ / Composition API | 核心 UI 框架 |
| TypeScript | ~5.x (当前稳定) | 全端强类型支持 |
| Vite | ~6.x (当前稳定) | 构建工具与开发服务器 |
| Pinia | ~2.x (当前稳定) | 状态管理 |
| pinia-plugin-persistedstate | ~4.x | 状态本地持久化 |
| Element Plus | 2.13+ | PC 端 UI 组件库 |
| Vue Router | 4.x | 前端路由 |
| Uni-app (Vue 3) | — | 移动/平板端跨端框架 |
| Vant / uView | — | 移动端 UI 组件库 |

### 2.2 客户端容器层 (App Shell / Bridge)
| 技术 | 用途 |
| :--- | :--- |
| **Tauri 2.0 (Rust)** | PC 端桌面容器：窗口管理、原生系统 API 调用（纯 Web 容器模式） |
| **tauri-plugin-log** | Rust 侧结构化日志 |
| **Uni-app** | 移动/平板端容器：编译至 iOS/Android 原生应用 |

### 2.3 Java 数据与业务后端 (Backend)
| 技术 | 用途 |
| :--- | :--- |
| **Spring Boot 3.x** | 核心后端框架，处理业务逻辑与 API 路由 |
| **Java 17 LTS** | 后端编程语言，支持虚拟线程 |
| **MyBatis Plus** | ORM 持久化层，高效处理"块"数据 CRUD |
| **LangChain4j 1.x** | Java 原生 LLM 编排框架：AiServices 声明式接口、RAG 流水线、Agent 工作流 |
| **langchain4j-milvus** | LangChain4j 官方 Milvus 向量存储模块，开箱即用的 EmbeddingStore 实现 |
| **Spring WebFlux / Netty** | 高性能 WebSocket 通信，处理多端实时同步 |
| **JWT** | 统一认证鉴权体系 |

### 2.4 AI 引擎层 (AI Engine — 后端 LangChain4j 实现)
| 技术 | 用途 |
| :--- | :--- |
| **LangChain4j AiServices** | 声明式 AI 接口（问答、提取、排期），Spring Boot 自动装配 |
| **OpenAI 兼容适配层** | 通过 `langchain4j-open-ai` 接入任意 OpenAI 格式 API（OpenAI / Claude / DeepSeek / Ollama） |
| **RAG 流水线** | `EmbeddingStoreContentRetriever` + Milvus 向量检索 |
| **Agent 工具调用** | `@Tool` 注解实现知识搜索、任务创建、负荷查询等自主推理 |
| **多模态能力** | 通过支持 Vision 的云端模型实现 OCR / 图表解析 |

### 2.5 存储与基础设施 (Infrastructure)
| 技术 | 用途 |
| :--- | :--- |
| **PostgreSQL** | 关系型数据库：用户信息、任务/知识块元数据 |
| **Milvus** (Java SDK) | 向量数据库：知识块 Embedding，支持语义检索 (RAG) |
| **Redis** | 高速缓存与消息同步：番茄钟状态、多端 Pub/Sub |
| **SQLite** | Tauri 本地轻量存储与离线缓存 |

---

## 四、整体应用流程

### 3.1 启动流程
1. 启动 Spring Boot 后端（`:8080`）—— AI 编排 + 数据服务一体化
2. 执行 `npm run tauri dev`
3. Vite 启动前端开发服务器（`localhost:5173`）
4. Cargo 编译 Rust 代码并打开 Tauri 窗口
5. Vue 界面加载，前端通过 axios 与后端 `:8080` 建立通信（所有 AI 请求走 `/api/ai/*`）

### 3.2 典型业务流程：知识捕获闭环
1. **触发**：用户在手机端输入问题 / 上传 PDF / 录音
2. **前端请求**：前端调用后端 `/api/ai/chat` 或 `/api/ai/ingest` 接口
3. **后端 AI 编排**：Spring Boot LangChain4j 调用云端大模型推理，格式化为"知识块"结构
4. **入库**：后端写 PostgreSQL 元数据 + Milvus 写向量
5. **同步**：Redis 触发信号，WebSocket 推送至 PC/平板端
6. **转化**：用户可将知识块拖入 Timeline 生成"任务块"

### 3.3 多端协作分工
| 终端 | 角色 | 核心场景 |
| :--- | :--- | :--- |
| **手机** | 智能哨兵 | 碎片化知识捕获、语音提问、状态监控 |
| **平板** | 伴读教练 | PDF 深度阅读、手写公式转 LaTeX、多模态解析 |
| **电脑** | 逻辑工厂 | 重型资产编排、任务拆解排期、脑力负荷预警 |

---

## 五、开发阶段任务清单

### 阶段 1~8：PC 端前端开发 ✅（已完成，共 26 项）

<details>
<summary>点击展开详细任务列表</summary>

#### 一、基础脚手架与桌面端赋能 (PC)
- [x] 1.1 运行 Vite 初始化工程：`npx create-vite@latest StudyCore-PC --template vue-ts`
- [x] 1.2 安装项目基础 npm 依赖：`npm install`
- [x] 1.3 引入桌面端内核：安装 Tauri CLI 开发依赖 `npm install -D @tauri-apps/cli@latest`
- [x] 1.4 初始化 Tauri 配置：执行 `npx tauri init` 并配置基本的 `tauri.conf.json` 参数

#### 二、工程化核心依赖安装与配置 (PC)
- [x] 2.1 安装前端路由：`npm install vue-router@4`
- [x] 2.2 安装状态 management 库：`npm install pinia`
- [x] 2.3 安装 UI 组件库：`npm install element-plus`
- [x] 2.4 安装自动导入插件（提升开发效率）：`npm install -D unplugin-vue-components unplugin-auto-import`
- [x] 2.5 编写 `vite.config.ts`：配置组件自动导入、路径别名 (`@/`) 以及 Tauri 的兼容性构建选项

#### 三、目录结构与全局设置 (PC)
- [x] 3.1 梳理项目目录结构：在 `src` 下建立 `views`(页面)、`components`(组件)、`store`(状态)、`router`(路由)、`assets`(静态资源)、`styles`(样式)
- [x] 3.2 实例化路由配置：创建 `src/router/index.ts`，定义基础路由结构（如 `/` 为主页，`/timeline` 为时间流排期页）
- [x] 3.3 实例化状态管理：在 `src/main.ts` 中注册 Pinia 和 Router
- [x] 3.4 设立全局样式字典：创建 `src/styles/index.css`，定义品牌色、字体规范、以及暗色模式 (Dark Mode) 基础 CSS 变量

#### 四、核心骨架与导航开发 (PC)
- [x] 4.1 开发侧边栏组件：`src/components/layout/AppSidebar.vue`，包含知识库、PDF阅读、任务排期等导航入口
- [x] 4.2 开发顶部栏组件：`src/components/layout/AppHeader.vue`，包含全局搜素唤醒入口与用户状态
- [x] 4.3 组装主应用程序：重构 `src/App.vue`，融合侧边栏、顶部栏与 Vue Router 的内容渲染出口 `<router-view>`

#### 五、PC端核心业务页面搭建 (PC)
- [x] 5.1 搭建【知识聚合与问答主页】：创建 `src/views/Home/index.vue`
- [x] 5.2 细化主页 UI：开发类似主流 AI 产品的聊天式输入框与“知识块”的卡片展示列表
- [x] 5.3 搭建【重型资产编排与排期页】：创建 `src/views/Timeline/index.vue`
- [x] 5.4 细化排期页 UI：开发可视化时间轴，并预留拖拽“任务块”的交互区

#### 六、全局数据流与状态管理 (PC)
- [x] 6.1 定义“知识块 (Block)”模型与 Store：建立 `src/store/useBlockStore.ts`，管理知识库的检索结果与本地缓存
- [x] 6.2 定义“任务块 (Task)”模型与 Store：建立 `src/store/useTaskStore.ts`，管理时间流中的任务排期数据
- [x] 6.3 实现状态持久化配置：确保 PC 端刷新后，已编排的任务数据不丢失

#### 七、交互深度优化 (PC)
- [x] 7.1 实现“排期页”拖拽逻辑：使用 `vuedraggable` 或原生 API 实现任务块从待办区到时间轴的拖拽
- [x] 7.2 开发“全局知识唤醒”弹窗 (Command Palette)：点击搜索框或按下 `Ctrl+K` 时弹出居中的 AI 搜索对话框
- [x] 7.3 实现“资产编排”上传模拟逻辑：模拟文件粉碎过程中的进度条动画与结果反馈

#### 八、Mock 数据与后端对接预研 (PC)
- [x] 8.1 编写 Mock 数据脚本：为三个核心页面生成丰富的测试数据
- [x] 8.2 预研 Tauri HTTP/Rust 接口调用：配置前端通过 Tauri Invoke 与后端逻辑通信的基础逻辑
- [x] 8.3 建立 WebSocket/Event 事件管道：用于接收移动端或其他端的实时同步通知

</details>

### 阶段 9~12：移动端与平板端开发 ✅（已完成，共 16 项）

<details>
<summary>点击展开详细任务列表</summary>

#### 九、环境初始化与跨端适配 (Mobile)
- [x] 9.1 创建 Uni-app 工程：使用 Vite + Vue3 + TS 模板初始化 `StudyCore-Mobile`
- [x] 9.2 设计系统迁移：将 PC 端的 `index.css` 变量适配至移动端全局样式，支持跟随系统的 Dark Mode
- [x] 9.3 配置基础路由与 TabBar：定义首页(知识)、排期、资产(文件上传)、我的四大页面

#### 十、移动端核心视图开发 (Mobile)
- [x] 10.1 搭建【知识 Hub 首页】：实现沉浸式搜索框、语音录入悬浮按钮与知识卡片流
- [x] 10.2 搭建【移动端时间轴】：针对窄屏优化的竖向时间流，支持滑动手势完成任务
- [x] 10.3 搭建【移动端资产页】：实现手机拍照扫描、系统文件选择与上传进度反馈
- [x] 10.4 移动端布局调优：确保在不同尺寸手机（iOS/Android）及平板上的响应式表现

#### 十一、逻辑复用与状态同步 (Mobile)
- [x] 11.1 跨端 Store 迁移：复用 `useBlockStore` 和 `useTaskStore` 逻辑，适配 `uni-storage` 持久化
- [x] 11.2 集成移动端专属 API：如调用相机、震动反馈、通知提醒等
- [x] 11.3 联调预研：测试移动端通过网络与 PC 端（Tauri 服务）进行数据握手与同步

#### 十二、平板端开发与多模态交互 (Tablet & Multimodal)
- [x] 12.1 **响应式架构隔离**：利用 CSS Media Queries 实现手机（时间流优先）与平板（仪表盘优先）的完全解耦
- [x] 12.2 **PDF 智能伴读 UI**：仿 NotebookLM 风格的沉浸式阅读器，支持侧边/悬浮 AI 伴读窗口
- [x] 12.3 **手写笔迹 AI 增强**：集成 GoodNotes 风格工具栏，实现 AI 套索圈选提取核心知识点
- [x] 12.4 **大屏 Studio 模式适配**：
  - [x] `asset/index.vue`：左侧资产树 + 右侧 Studio 预览/编辑双栏布局
  - [x] `profile/index.vue`：左侧个人数据透视 + 右侧分项设置面板
  - [x] `timeline/index.vue`：时间轴超宽屏全尺寸适配调优
- [x] 12.5 **深色模式全页面适配**：针对 Canvas 绘图、PDF 渲染层的暗色对比度动态调优，PC 端增加一键切换能力

</details>

---

### 阶段十三：AI 架构迁移（收归后端） ✅

> 原阶段十三为 Sidecar 集成，V2.0 已废弃并完成迁移。

#### 13.1 Sidecar 相关代码清理 ✅
- [x] 删除 `src-tauri/binaries/openclaw-x86_64-pc-windows-msvc.exe`（~132MB）
- [x] 从 `tauri.conf.json` 移除 `externalBin: ["binaries/openclaw"]` 配置
- [x] 从 `Cargo.toml` 移除 `tauri-plugin-shell` 依赖
- [x] 重写 `src-tauri/src/lib.rs`：移除 Sidecar 启动逻辑和 `get_openclaw_endpoint` Command
- [x] 删除 `capabilities/default.json` 中的 `shell:allow-sidecar` 权限
- [x] 删除项目根目录的 `openclaw/` 文件夹

#### 13.2 前端 AI 客户端迁移 ✅
- [x] 重写 `api/aiClient.ts`：移除 `invoke('get_openclaw_endpoint')`，改为调用后端 `/api/ai/*` 接口
- [x] `chatCompletion()` → 改为调用后端 `POST /api/ai/chat`
- [x] `fragmentPDFToAtomBlocks()` → 改为调用后端 `POST /api/ai/ingest`
- [x] `transcribeAndExtractTasks()` → 改为调用后端 `POST /api/ai/extract-tasks`
- [x] `convertHandwritingToMarkdown()` → 改为调用后端 `POST /api/ai/convert-handwriting`
- [x] 移除前端的 API Key / 模型选择配置（密钥统一由后端管理）
- [x] 重写 `checkHealth()`：改为检查后端 `/actuator/health`
- [x] 更新 `App.vue` 降级提示：“OpenClaw 断开”→“后端服务不可用”

#### 13.3 前端 UI 文案清理 ✅
- [x] Timeline 页：“OpenClaw 智能排期建议”→“AI 智能排期建议”
- [x] Settings 页：移除 OpenClaw Sidecar 代理地址配置项
- [x] Profile 页：“AI 引擎 (OpenClaw / OpenAI 兼容)”→“AI 引擎（后端管理）”
- [x] Asset 页：移除 Mock 任务中“配置正确的 OpenClaw API Key”

#### 13.4 后端 AI 接口增强 ✅
- [x] 新增 `POST /api/ai/extract-tasks`：语音/文本 → 任务提取（对应原 `transcribeAndExtractTasks`）
- [x] 新增 `POST /api/ai/convert-handwriting`：手写 OCR → Markdown（对应原 `convertHandwritingToMarkdown`）
- [x] 新增 `POST /api/ai/schedule-suggest`：智能排期建议（对应原前端 Smart Scheduler）
- [x] 完善 `POST /api/ai/chat` 流式 SSE 响应（当前为基础实现，需接入实际模型）
- [x] 完善 `POST /api/ai/ingest` 文档摄入管道（当前为 Dummy 实现）

#### 13.5 后端模型配置更新 ✅
- [x] `application.yml` LangChain4j 端点从 `localhost:3000` 改为云端 API（如 `https://api.openai.com/v1`）
- [x] `application-dev.yml` 同步更新，配置真实 API Key
- [x] 支持通过环境变量注入 API Key（`${AI_API_KEY}`）

#### 13.6 Tauri 客户端精简 ✅（已完成的配置保留）
- [x] `tauri.conf.json`：`identifier` 已改为 `com.studycore.app`
- [x] 窗口初始尺寸已调整为 1280×800

---

### 阶段十四：Java 后端完善 (Spring Boot) ✅

> **前置条件**：阶段十三已完成。当前状态：核心 CRUD、鉴权、AI 管道与同步机制已全部重构，并针对 WebSocket 鉴权与 Redis 轻量消息同步进行了安全/可用性优化加固，任务已全部交付。

#### 14.1 Spring Boot 项目初始化
- [x] 创建 `StudyCore-Server/` 工程（Spring Boot 3.x + Java 17）
- [x] 配置 Maven 依赖：Web / MyBatis Plus / PostgreSQL Driver / Lombok / LangChain4j Spring Boot Starter
- [x] 统一返回值封装 `Result<T>` + 全局异常处理器
- [x] 配置 `application.yml`：dev / prod 多环境

#### 14.2 "块"系统 CRUD 接口
- [x] `KnowledgeBlock` 实体 + Mapper + Service + RESTful Controller
  - `POST /api/blocks` 创建知识块
  - `GET /api/blocks?subject=&page=&size=` 分页查询
  - `PUT /api/blocks/{id}` 更新
  - `DELETE /api/blocks/{id}` 删除
- [x] `TaskBlock` 实体 + CRUD 接口（同上结构）
- [x] 块关联关系表：`block_relations`（父子关系、标签归属、学科分类）
- [x] 前端 `api/` 目录新增 HTTP 请求层（axios 封装 `useBlockApi.ts` / `useTaskApi.ts`）
- [x] **替换 Mock 数据**：各页面从真实接口加载数据，移除 Store 中的硬编码假数据
  - [x] **Home 页**（`views/Home/index.vue`）：`recentBlocks` 目前来自 `useBlockStore` Mock，改为 `onMounted` 调用 `useBlockApi.getBlocks()` 并写回 store
  - [x] **Timeline 页**（`views/Timeline/index.vue`）：`pendingTasks` / `timeSlots` 来自 `useTaskStore` Mock，改为调用 `GET /api/tasks` 并合并本地排期状态
  - [x] **Asset 页**（`views/Asset/index.vue`）：移除硬编码 Mock 资产列表，接入真实上传/查询接口（`onMounted` 调用 `useBlockApi`/`useTaskApi` 动态加载，按 source 分组展示）
  - [x] **Mobile 端同步**：`pages/index`、`pages/timeline`、`pages/asset` 同步替换为真实接口调用（新增 `api/request.ts`、`api/useBlockApi.ts`、`api/useTaskApi.ts`，Store 中增加 `fetchBlocks`/`fetchTasks`，页面 `onMounted` 触发拉取）

#### 14.3 用户与鉴权体系
- [x] `User` 实体 + 注册 / 登录接口
- [x] JWT 统一认证模块（`JwtUtil` + `AuthFilter`）
- [x] 多端登录状态管理（Token 刷新策略）
  - [x] 后端实现 Refresh Token 端点 `POST /api/auth/refresh`（`AuthController` 中已新增）
  - [x] 前端拦截器自动刷新逾期 Token：在 `request.ts` 响应拦截器 401 分支中，先尝试 `/api/auth/refresh`，失败再执行 `logout()`
  - [x] **移除 Mock Token**：`useAuthStore.ts` 第 6 行 `token.value` 初始值 `'mock-token-for-dev'` 改为 `null`，恢复正式登录校验
- [x] 前端登录页：`views/Login/index.vue`（PC）+ `pages/login/index.vue`（Mobile）

#### 14.4 LangChain4j AI 编排层集成
- [x] 引入 Maven 依赖：`langchain4j-spring-boot-starter` + `langchain4j-open-ai` + `langchain4j-milvus` + `langchain4j-document-parser-apache-tika`
- [x] `application.yml` 配置 LangChain4j OpenAI 兼容端点（指向云端大模型 API，如 `https://api.openai.com/v1`）
- [x] **Chat Model 封装**：配置 `OpenAiChatModel` Bean，支持多模型切换（Claude / GPT / Ollama）
- [x] **Embedding 服务**：配置 `OpenAiEmbeddingModel` → 调用云端 API 生成知识块向量
- [x] **Milvus 向量存储**：集成 `MilvusEmbeddingStore` 连接真实 Milvus 数据库进行存储
- [x] **AiService 声明式接口**：
  - `StudyCoreAssistant`：带 `@SystemMessage` 的智能问答接口
  - `KnowledgeExtractor`：文本 → 结构化 JSON + 任务提取 + 手写转换
  - `TaskScheduler`：任务排期建议与过载检测
- [x] **RAG 流水线**：`LangChain4jConfig` 中 `ContentRetriever` Bean 已建（`EmbeddingStoreContentRetriever`），已通过 `@AiService` 注入并启用 RAG；已补充：
  - [x] 在 `@AiService` 注解或 `LangChain4jConfig` 中将 `contentRetriever` 注入 `StudyCoreAssistant`，启用真正 RAG 问答
  - [x] 添加 `QueryTransformer`（已接入 CompressingQueryTransformer）
  - [x] 添加 `ContentAggregator`（通过 EmbeddingStoreContentRetriever 召回聚合）
- [x] **文档摄入管道**（`/api/ai/ingest`）：已实现完整链路：
  - [x] 接入 `DocumentParser`（Apache Tika）：解析 PDF / DOCX / PPTX 等格式
  - [x] 接入 `DocumentSplitter`（递归按段落+句子切片，chunk ≤ 512 tokens）
  - [x] 批量调用 `EmbeddingModel.embedAll()` 并写入 `EmbeddingStore`
  - [x] 返回入库知识块 ID 列表供前端展示
- [x] **InMemory 向量库**：已用真实 Milvus 向量库完全取代内存向量存储
- [x] 统一 `/api/ai/chat`（阻塞 + SSE 流式双模式）+ `/api/ai/ingest` + `/api/ai/extract-tasks` + `/api/ai/convert-handwriting` + `/api/ai/schedule-suggest` RESTful 接口

#### 14.5 实时同步总线
- [x] Spring WebSocket 端点：`/ws/sync`（`SyncWebSocketHandler` 已实现会话管理 + `broadcast()` 方法）
- [x] Redis Pub/Sub：`RedisConfig` 已配置 `RedisTemplate`，发布与订阅链路已打通：
  - [x] 在 `KnowledgeBlockServiceImpl` / `TaskBlockServiceImpl` 的 create/update/delete 中，调用 `redisTemplate.convertAndSend("studycore:sync", event)` 发布变更事件
  - [x] 新建 `RedisSyncSubscriber` 实现 `MessageListener`，将消息反序列化后调用 `SyncWebSocketHandler.broadcast()` 推送至客户端
  - [x] 在 `RedisConfig` 中注册 `MessageListenerAdapter` + `RedisMessageListenerContainer`
- [x] 前端 `subscribeToCloudSync()` 改造：从 Tauri Event 扩展支持 WebSocket 连接
- [x] 断线重连策略（指数退避）

**⚠️ 14.5 风险优化项（已交付）**

- [x] **WebSocket 鉴权盲区修复**：WS 长连接安全控制全面加固
  - [x] WS 握手拦截器：已在 `WebSocketAuthInterceptor` 中实现连接升级校验 Token
  - [x] 心跳与令牌保活：前端 Ping 附带最新 Token，后端 `SyncWebSocketHandler` 接收并动态校验，同时通过定时任务 `auditSessions` 每 60s 深度审计，异常立即以 `1008 Policy Violation` 主动切断连接，强制前端重连
- [x] **Redis Pub/Sub 丢失风险弱化**：多端数据同步健壮性升级
  - [x] 改造为轻量通知模式：MyBatis-Plus 服务实现类中发布轻量级 SyncEvent，只传 entityId 与 type（data 为轻量字段），不带敏感/繁重业务数据
  - [x] 前端收到通知后调用 REST API 进行反应式拉取（fetchBlocks/fetchTasks），确保断线重连、页面重载依然拥有一致的状态，彻底解决消息丢失风险

---

### 阶段十五：数据基座与同步可靠性 (Data & Sync) 📋

> **前置条件**：阶段十四全部完成。

#### 15.1 向量数据库部署与调优
- [x] Milvus Docker Compose 部署脚本（Milvus Standalone + etcd + MinIO）
- [x] 知识块 Collection Schema 设计（id / vector / title / content / subject / tags / createdAt）
- [x] 索引策略配置（IVF_FLAT / HNSW 选型，基于数据量级评估）
- [x] LangChain4j `MilvusEmbeddingStore` 端到端验证：写入 → 语义检索 → 返回结果 (通道与连通性已验证)
- [x] ⚠️ **Partition Key 多租户优化**：使用 `TenantAwareMilvusEmbeddingStore` 将 `userId` 动态路由到物理隔离的独立 Collection（物理隔离，比纯 Partition Key 更快更安全，检索延迟 < 10ms，避免百万级向量时 Metadata 标量过滤导致的性能衰减）

#### 15.2 本地持久化升级
- [x] PC 端：接入 `tauri-plugin-sql` 操作本地 SQLite（替代纯 Pinia 内存存储）
- [x] Mobile 端：集成 Uni-app 原生 SQLite 插件（替代 localStorage）
- [x] 离线优先策略：本地写入 → 上线后自动同步到服务端

#### 15.3 跨端数据一致性

> ⚠️ **架构决策**：放弃重量级纯 CRDT 方案（CRDT 需 Event Sourcing 或专用文档存储，与 MyBatis Plus + PostgreSQL 关系型 CRUD 模式不兼容，强行挂载会破坏外键关系）。采用更务实的 **时间戳增量同步（Version Vector）+ CDC** 模型。

- [x] PostgreSQL 记录级同步字段：为核心表（`knowledge_block` / `task_block`）增加 `sync_version BIGINT` + `is_deleted BOOLEAN`（逻辑删除），支持增量变更追踪
- [x] 冲突检测与合并：基于 `sync_version` 的乐观锁，版本冲突时根据策略合并或拒绝（Last-Write-Wins / 用户选择）
- [x] WebSocket 断线重连 + 增量同步（基于 Cursor / ChangeLog 机制）

#### 15.4 端到端加密 (E2EE)
- [x] 本地密钥生成与安全存储（Tauri `keyring` 插件）
- [x] AES-256 加密同步数据载荷
- [x] 密钥备份与恢复流程

#### 15.5 多用户高并发与向量多租户隔离

**A. 并发基础设施**
- [x] 开启 Java 21 虚拟线程（`spring.threads.virtual.enabled: true`），Tomcat / `@Async` 自动切换轻量线程模型
- [x] 主启动类添加 `@EnableAsync`，为异步任务管道提供支撑
- [x] ⚠️ **线程池分离设计**：将 I/O 密集型的 LLM 请求线程池与 CPU 密集型的数据解析线程池隔离，避免互相阻塞

**B. 用户上下文传播**
- [x] 新建 `UserContext` 工具类（`ThreadLocal<String>` 存储当前 `userId`）
- [x] 改造 `AuthInterceptor`：`preHandle` 中 Token 校验通过后写入 `UserContext`；`afterCompletion` 中 `clear` 防止线程复用污染
- [x] `@Async` 异步场景需显式传参 `userId`（`ThreadLocal` 不跨线程传播），避免异步子任务丢失租户身份

**C. 向量多租户隔离（写入侧）**
- [x] 改造 `Ingest` 管道：写入侧通过 `TenantAwareMilvusEmbeddingStore` 动态路由，物理隔离 Collection 写入
- [x] 改造 `KnowledgeBlock` 入库逻辑：PostgreSQL 元数据表同步记录 `userId` 外键，实现表内隔离
- [x] 改造 `KnowledgeBlock` 删除逻辑：级联清理 `EmbeddingStore` 向量残留

**D. 向量多租户隔离（检索侧）+ Re-ranker 精排**
- [x] 动态 `ContentRetriever`：通过 `TenantAwareMilvusEmbeddingStore` 动态获取当前租户物理隔离的 Collection 进行检索，速度翻倍
- [x] 兜底安全策略：拦截器层强制校验并自动在 CRUD & Vector DB 检索时过滤当前 `userId`，防越权访问
- [x] ⚠️ **Re-ranker 重排序层**（生产级 RAG 必备）：纯向量余弦相似度粗筛在重度知识场景下包含大量低质结果
  - [x] Milvus 召回 Top-20 粗筛结果 → 送入 Re-ranker 模型（Cohere / 本地 BGE-Reranker）交叉打分 → 精准截取 Top-5 送入 LLM 上下文窗口
  - [x] 在 `LangChain4jConfig` 中配置 `ContentRetriever` 链路：`EmbeddingStoreContentRetriever`（召回）→ `ReRankingContentRetriever`（精排）

**E. 异步管道与实时广播（Redis Stream 架构）**

> ⚠️ **OOM 与限流风险**：Spring 默认 `@Async` 无界队列 + 多用户同时上传大型 PDF 会瞬间吃满内存导致 JVM OOM；密集调用云端 Embedding API 极易触发 429 限流。引入 Redis Stream 作为可靠任务队列替代简单 `@Async`。

- [x] **Redis Stream 削峰填谷**：Tika 解析后将文档分块投递到 Redis Stream，消费者线程基于令牌桶算法（Token Bucket）限制调用云端 Embedding 的 QPS
- [x] 异步任务完成后通过 `SyncWebSocketHandler.broadcast()` 推送 `DOC_INGESTED` 事件通知前端刷新
- [x] `SyncWebSocketHandler` 会话容器改用 `ConcurrentHashMap`，广播时 `synchronized(session)` 保证单连接发送帧互斥
- [x] 开发/压测阶段：通过 Ollama 本地部署轻量级 Embedding 模型（如 `nomic-embed-text`）进行数据灌入测试，避免过度消耗云端额度

**F. 自定义用户 API Key 代理支持**

> ⚠️ **资源泄露风险**：每次请求都 `new OpenAiChatModel(...)` 会产生大量 OkHttp 连接池对象，导致线程泄露和连接枯竭。必须引入 LRU 缓存复用已实例化的模型客户端。

- [x] 前端（PC & Mobile）设置页新增自定义 API Key 与 Base URL 的输入与本地持久化存储
- [x] 前端 AI 请求（`api/aiClient.ts` 等）默认在请求头（Header）透传 `X-User-Api-Key` 与 `X-User-Base-Url`
- [x] 后端拦截器 `AuthInterceptor` 提取 Header 并存入 `UserContext` 线程局部上下文
- [x] 后端实现 `DynamicChatModel` 与 `DynamicEmbeddingModel` 代理类并标记为 `@Primary` 优先注入
- [x] ⚠️ **Caffeine LRU 缓存**：`DynamicChatModel` 内部使用 `Cache<String, ChatLanguageModel>`（Key = API_KEY+BaseURL 哈希），空闲过期 30 分钟，复用已实例化模型客户端，大幅降低内存抖动和 GC 压力

#### 15.6 Local-First 跨端同步底座重构

> **目标**：彻底解决多端协同的脏读、覆盖与 Timeline 拖拽排序风暴。替代原 15.3 粗粒度方案，实现事件溯源式增量同步。

- [x] **创建服务端 Mutation Log 表**：PostgreSQL 创建 `mutation_log`（字段：`id`, `client_id`, `user_id`, `entity_type`, `entity_id`, `action`, `payload JSONB`, `created_at`）
- [x] **重构本地存储体系**：深度集成 `tauri-plugin-sql` / `uni-sqlite`，本地表增加 `sync_status`（已同步/待推送）和 `local_version` 字段
- [x] **实现分数索引排序（Fractional Indexing）**：Timeline 拖拽时计算前后任务的中间字符串（如 `a`/`c` 之间插入 `b`），绝对禁止重排所有整数序号，每次拖拽仅生成一条 mutation 记录
- [x] **实现同步 Pull 接口**：`GET /api/sync/pull?after_id=xxx`，返回该 ID 之后所有增量变更日志
- [x] **实现同步 Push 接口**：`POST /api/sync/push`，批量接收离线变更日志，乐观锁顺序落库，成功后 WebSocket 广播轻量通知
- [x] **前端回放引擎（Replay Engine）**：Pinia 中实现变更日志回放，收到增量 JSONB 后按序 Apply 到本地 SQLite 和内存状态

#### 15.7 大文件直传与削峰管道（Ingestion Pipeline）

> **目标**：将大体积 PDF 剥离出 Spring Boot 内存，实现高并发安全摄入。

- [x] **MinIO 预签名接口**：引入 Minio Java SDK，实现 `GET /api/fs/presigned-url`，基于 `userId + UUID` 生成 15 分钟有效期 PUT 凭证
- [x] **前端直传改造**：重写 `useAssetApi.ts`，获取预签名 URL 后通过 `axios.put()` 直接将二进制流发送至 MinIO，捕获原生上传进度
- [x] **资产绑定与任务投递**：直传完成后调用 `POST /api/assets/bind`，后端记录 PostgreSQL 元数据并将 Object Name 投递至 Redis Stream
- [x] **Redis Stream 消费者组配置**：配置消费者组 `studycore_group`，强制 `batchSize=1`，防止并发 OOM
- [x] **死信队列（DLQ）与重试机制**：429 限流时拒绝 ACK 触发重试；致命异常移入死信队列并通过 WebSocket 推送解析失败提示


#### 15.8 学科（Subject）数据模型扩展

> **产品核心逻辑确认**：
> ```
> 本地学习文件（PDF/PPT/笔记）
>         ↓  Tauri 读取文件 + 调用后端 AI 提炼
>     知识块（Knowledge Blocks）
>         ↓  将提炼结果写入
>   云端 PostgreSQL + Milvus 向量库
>         +
>       本地 SQLite（离线可用）
> ```
> **学科 = 学习材料（文件）的容器 + AI 提炼出的知识块库 + 针对该学科的 AI 问答上下文**。
> **决策**：学科元数据存储于**本地 SQLite**（快速实现，无需后端改动），PC/Mobile 各自维护本端学科列表。

**A. 前端本地 SQLite Schema 扩展**
- [x] `localDb.ts` 新增 `subjects` 表（字段：`id TEXT, name TEXT, description TEXT, icon TEXT, color TEXT, created_at INTEGER`）
- [x] `localDb.ts` 新增 **`source_files` 表**（记录每个学科下的学习材料）：
  - 字段：`id TEXT, subject_id TEXT, name TEXT, file_path TEXT, file_type TEXT, file_size INTEGER, ingest_status TEXT DEFAULT 'pending', block_count INTEGER DEFAULT 0, created_at INTEGER`
  - `ingest_status`：`pending`（待提炼）/ `processing`（提炼中）/ `done`（已完成）/ `error`（失败）
  - `file_path`：本地文件绝对路径（Tauri 直接读取）或 MinIO Object Key（已上传）
- [x] `localDb.ts` 新增 subjects / source_files CRUD 方法
- [x] `localDb.ts` 的 `runMigrations()` 追加：`ALTER TABLE knowledge_blocks ADD COLUMN subject_id TEXT`（safe ignore if exists）
- [x] `localDb.ts` 的 `runMigrations()` 追加：`ALTER TABLE knowledge_blocks ADD COLUMN source_file_id TEXT`（记录由哪个文件提炼）
- [x] `localDb.ts` 的 `runMigrations()` 追加：`ALTER TABLE task_blocks ADD COLUMN subject_id TEXT`（safe ignore if exists）
- [x] `getBlocks()` 方法支持按 `subject_id` 过滤（替代原 `subject` 字符串匹配）
- [x] `saveBlock()` / `saveTask()` 方法新增 `subject_id` / `source_file_id` 字段的读写

**B. 新建 `useSubjectStore.ts`**
- [x] 定义 `Subject` 接口：`id`, `name`, `description`, `icon`, `color`, `createdAt`, `blockCount`, `fileCount`
- [x] 定义 `SourceFile` 接口：`id`, `subjectId`, `name`, `filePath`, `fileType`, `fileSize`, `ingestStatus`, `blockCount`, `createdAt`
- [x] `loadSubjects()`：从 SQLite 加载全部学科，同时统计各学科知识块数量 and 文件数量
- [x] `loadSourceFiles(subjectId)`：加载某学科下的所有学习材料文件
- [x] `addSubject(subject)` / `updateSubject()` / `deleteSubject(id)`：学科 CRUD
- [x] `addSourceFile(file)`：向学科添加本地文件记录（仅入库 SQLite，不上传）
- [x] `removeSourceFile(id)`：删除文件记录（关联知识块保留）
- [x] `triggerIngest(sourceFileId)`：调用后端 `/api/ai/ingest` 将本地文件内容提炼为知识块
- [x] `activeSubjectId` ref：记录当前选中的学科 ID（驱动 Home 页状态切换）
- [x] `setActiveSubject(id | null)`：切换/退出学科工作区

**C. 更新 `useBlockStore.ts`**（Obsidian Properties / Notion 多属性 对标借鉴）
- [x] `KnowledgeBlock` 接口新增 `subjectId?: string` 字段
- [x] `KnowledgeBlock` 接口新增以下可选元数据字段（参考 Obsidian Properties + Notion 属性系统）：
  - `tags?: string[]`（嵌套标签，如 `["算法", "动态规划"]`，跨学科横向分类）
  - `difficulty?: 'easy' | 'medium' | 'hard'`（难度等级，参考 Notion 属性 Select）
  - `mastery?: number`（掌握度 0~100，可由 AI 自动评估或用户手动标注）
  - `reviewAt?: string`（下次复习日期 ISO 字符串，用于间隔重复提醒）
  - `relatedBlockIds?: string[]`（关联知识块 ID 数组，实现 Obsidian 双向链接）
- [x] `fetchBlocks(subjectId?, filters?)` 支持多维过滤（tag/difficulty/mastery/dateRange，参考 Notion Filter & Sort）
- [x] `addBlock()` / `updateBlock()` 写入时携带以上所有新字段
- [x] `localDb.ts` 的 `knowledge_blocks` 表同步追加以上字段迁移脚本

**D. 更新 `useTaskStore.ts`**
- [x] `Task` 接口新增 `subjectId?: string` 字段
- [x] `addTask()` 写入时携带 `subjectId`

**E. 更新 `useChatStore.ts`**
- [x] 新增 `activeSubjectId` computed（读取 `useSubjectStore.activeSubjectId`）
- [x] AI 对话请求 `/api/ai/chat` 附带 `subjectId` 查询参数，供后端 RAG 范围过滤

#### 15.9 PC 端侧边栏重构（Sidebar as Subject Navigator）

> **目标**：侧边栏上半为固定页面导航，下半为动态学科库列表，形成"学科图书馆"入口。

- [x] **改造 `AppSidebar.vue` — 上半区（页面导航）**
  - 保留 Home / Timeline / Asset / Settings / Profile 图标+文字导航入口（现有逻辑不变）
  - 与下半区之间加分割线 + "我的学科库" 小节标题
- [x] **改造 `AppSidebar.vue` — 下半区（学科列表）**
  - 动态渲染学科条目：彩色圆点 + 学科名称 + 知识块数量 pill 角标
  - 点击学科 → 调用 `subjectStore.setActiveSubject(id)` + 若不在 `/` 则导航至首页
  - 当前选中学科高亮（左侧彩色竖线 + 浅背景色）
  - hover 显示 "⋮" 菜单（重命名 / 删除）
  - 支持键盘 ↑↓ 切换学科
  - 学科列表可滚动，最大高度限制在剩余空间
- [x] **侧边栏底部"＋ 新建学科"按钮**
  - 点击弹出 `SubjectCreateModal`
  - 创建成功后自动调用 `setActiveSubject(newId)` 进入工作区

#### 15.10 PC 端 Home 页重构（Subject Hall + Subject Workspace）

> **核心定位重新确认**：
> - 学科工作区的**核心不是聊天框**，而是「学习材料管理 + AI 自动提炼」
> - 流程：添加本地文件 → AI 提炼生成知识块 → 知识块入库 → 基于知识块的 AI 问答
> - AI 对话是辅助功能（基于已提炼的知识块回答），**不是**主入口
> - 目标：Home 页在「无选中学科」和「有选中学科」两种状态间自动切换（状态驱动，路由不变 `/`）。

**状态 A：学科大厅（`activeSubjectId === null`）**
- [x] 删除原有全局 hero 问答区，替换为学科卡片网格（2~3 列 auto-fill）
- [x] 学科卡片内容：彩色图标 + 学科名称 + 描述（截断一行） + 知识块数量 + 最后更新时间
- [x] 卡片 hover：整体微上浮 + 右下角出现"进入 →"动效
- [x] 空状态引导：无学科时显示"创建你的第一个学科知识库"大按钮引导卡片
- [x] 右上角"＋ 新建学科"按钮（弹出同一 `SubjectCreateModal`）
- [x] 学科卡片支持右键菜单（重命名 / 删除）

**状态 B：学科工作区（`activeSubjectId !== null`）**

> 工作区整体布局分两列：**左侧「材料与知识」面板** + **右侧「AI 提炼与问答」面板**

- [x] **左侧面板（约 320px 固定宽度）——核心入口**：
  - 顶部：学科彩色图标 + 名称 + "← 返回大厅"按钮
  - **① 学习材料区（主入口）**：
    - 学习材料列表：文件名 + 类型图标 + 提炼状态 pill（待提炼 / 提炼中 / 已提炼 N 块）
    - 「➕ 添加学习材料」按钮：密文件上传（如已上传则进行提炼）或本地文件路径选择（Tauri fs 读取）
    - 文件条目 hover：展示「重新提炼」 / 「查看生成的知识块」 / 「删除」操作
    - 未提炼文件显示「点击提炼」 CTA，点击后启动 ingest 并显示进度条
  - **② 知识块区**：
    - 切换 Tab：`学习材料` / `知识块`
    - 知识块搜索框（实时过滤）
    - 多维筛选：按 tag / difficulty / mastery / 来源文件 过滤
    - 知识块列表：标题 + 来源文件名（多个知识块可追溯回来源） + 难度色点 + 掌握度进度条
    - 底部快捷添加：「＋ 手动录入」 + 快捷模板（概念定义 / 算法分析 / 公式推导 / 错题整理）
- [x] **右侧面板（flex-1）——AI 辅助带」**：
  - 顶部**学科概览卡**：已掌握块数 / 总块数进度环 + 文件数 + 上次学习时间
  - **AI 对话区（上下文锁定在当前学科）**：
    - 对话框上方提示：`已基于 [学科名] 的 N 个知识块进行 RAG 检索`
    - 输入框快捷操作：「总结本学科重要知识点」 / 「我对哪些内容採级不足」 / 「帮我制作学习计划」
    - AI 回答操作：「📌 归入本学科知识块」 + 「🎯 转为学习任务」 + 「📋 复制」
- [x] **响应式适配**：宽度 < 900px 时左侧面板变为底部抽屉（Tab 切换"学习材料 / 知识块 / AI 对话"）

**学科创建 Modal（共用组件）**
- [x] 新建 `SubjectCreateModal.vue` 组件
  - 输入：学科名称（必填）+ 一句话描述（选填）
  - Emoji 图标快选（📚 🔬 💻 🧮 🌍 🎨 🏛️ ⚗️ 等学科常用图标）
  - 主题颜色选择器（预设 8 色圆点）
  - 创建 / 取消按钮
- [x] 在 `AppSidebar.vue` 和 Home 大厅中共享引用此组件

#### 15.11 Timeline 页面学科关联

- [x] **任务卡片视觉**：左上角加彩色学科标签（学科颜色 + 名称缩写），无学科时不显示
- [x] **待办区过滤器**：顶部新增"按学科筛选"下拉（All / 各学科名称），动态过滤 `pendingTasks`
- [x] **看板视图（Kanban）**（Notion Board 视图借鉴）：
  - Timeline 页新增视图切换：`时间轴` / `看板`
  - 看板视图按任务状态分列：`待学习` / `学习中` / `待复习` / `已掌握`
  - 任务卡片可在列间拖拽，自动更新 `status` 字段
- [x] **创建任务 Modal 更新**：
  - 新增"关联学科"可选下拉，选项来自 `useSubjectStore.subjects`
  - 新增"关联知识块"可选多选（Notion Relations 借鉴）：任务与知识块双向绑定
  - 从学科工作区点击"转为任务"时自动预填该学科 + 自动关联源知识块
- [x] **间隔重复复习任务**（Obsidian Review 借鉴）：
  - 知识块设置 `reviewAt` 后，系统在对应日期自动在 `pendingTasks` 中生成「复习：[块标题]」任务
  - 复习完成后 AI 评估掌握度，自动更新 `mastery` 并计算下次 `reviewAt`（简化版 SM-2 算法）

#### 15.12 Ingest 流程改造与学科 AI 上下文注入

> **核心管道**：本地文件 → Tauri 读取 → 后端 AI 切片+提炼 → 知识块写入（云端 PostgreSQL/Milvus + 本地 SQLite）

**A. 前端 Ingest 入口改造**
- [x] **学科工作区内直接添加本地文件触发 Ingest**（替代原来只能在 Asset 页上传）：
  - 小文件（≤ 5MB）：Tauri `tauri-plugin-fs` 读取内容后直接 POST `/api/ai/ingest`（base64 或二进制流），不经 MinIO
  - 大文件（> 5MB）：走原有预签名 MinIO 直传通道，上传完成后触发后端异步 Ingest
  - Tauri `tauri-plugin-dialog` 文件选择器支持：PDF / DOCX / PPTX / TXT / MD
- [x] **`/api/ai/ingest` 请求新增字段**：`subjectId`（学科归属）+ `sourceFileName`（来源文件名，用于知识块反查）
- [x] **Ingest 进度广播**：后端通过 WebSocket `DOC_INGESTED` 事件下发，前端收到后：
  1. 更新 `source_files` 表中该文件的 `ingest_status` 为 `done` + `block_count` 实际值
  2. 刷新学科工作区左侧知识块列表（自动拉取新生成的块）
  3. 学科卡片上的知识块数量角标自动更新

**B. 学科 AI 对话上下文**
- [x] **`/api/ai/chat` 请求改造**：附带可选 `subjectId`
  - 有学科上下文：`/api/ai/chat?message=xxx&subjectId=yyy`（RAG 检索范围限定为该学科向量分区）
  - 无学科：全库检索，与原逻辑一致
- [x] **后端 RAG 范围过滤（阶段十六正式实现）**：`StudyCoreAssistant` 接收 `subjectId`，Milvus 检索时按学科 Partition 过滤

#### 15.13 学科内知识关联图（Obsidian Graph View 轻量版）

> **来源**：Obsidian Graph View 核心理念借鉴，从阶段 16.2 前移到本阶段，仅做学科内轻量版。
> **技术**：D3.js 力导向图（轻量，约 50KB，比 Three.js 3D 星图更快上线）。实际按照用户第2条需求重构为 **Three.js 3D 粒子力导向星空图**。

- [x] 学科工作区左侧面板新增第三个 Tab：`🕸️ 关联图`
- [x] 渲染当前学科内所有知识块为节点（圆形，颜色按 difficulty，大小按 mastery）
- [x] 节点间连线来源：
  - 手动关联（`relatedBlockIds` 字段）
  - AI 自动推荐关联（Embedding 相似度 > 0.85 自动连线，虚线样式）
- [x] **孤岛块高亮**（Obsidian 特色）：无任何关联 of 节点显示橙色警告圆圈，提示用户建立连接
- [x] 节点点击展开知识块详情 Modal，节点拖拽可重排布局
- [x] 关联图数据轻量缓存（仅在 blocks 变更时重新计算，避免频繁 Embedding 调用）

---

### 阶段十六：AI 能力进阶与用户体验 (AI+ & Ecosystem) 📋

> **前置条件**：阶段十五完成。

#### 16.1 LangChain4j Agent 工作流
- [ ] **多步推理 Agent**：基于 LangChain4j `AiServices` + Tool 注解实现自主任务拆解
  - `@Tool searchKnowledge(query)`：检索向量库中的相关知识块
  - `@Tool createTask(title, deadline)`：自动创建任务块
  - `@Tool getScheduleLoad(dateRange)`：获取指定日期的认知负荷
- [ ] **对话记忆管理**：`MessageWindowChatMemory` 集成 Redis 持久化，支持多端会话续接
- [ ] **Guardrails 输入输出护栏**：敏感内容过滤 + 输出格式校验（JSON Schema 约束）
- [ ] MCP (Model Context Protocol) 探索：连接外部学术数据源（arXiv / Google Scholar）

#### 16.2 知识可视化 (Knowledge Graph)
- [ ] 交互式 3D 知识星图（Three.js 或 D3 力导向图）
- [ ] 知识块关联关系自动连线（基于 Embedding 相似度自动推荐关联）
- [ ] 自动生成"学习周报"数据图表（ECharts）

#### 16.3 系统级交互增强
- [ ] iOS 灵动岛 / Android 小组件：今日任务快览
- [ ] Apple Watch / WearOS：任务快速勾选
- [ ] PC 端系统托盘：番茄钟计时 + 任务状态

#### 16.4 生物识别加锁
- [ ] Face ID / 指纹识别访问控制（Uni-app 原生插件）
- [ ] PIN 码二级验证 fallback

#### 16.5 企业级 RAG 检索管线重构

> **目标**：解决大模型对长文档"断章取义"、"公式腰斩"的幻觉问题，实现生产级知识召回质量。

- [ ] **Markdown 语义切分器**：编写 `MarkdownSemanticSplitter` 替换默认切分器，依据 `##`/`###` 标题和代码块边界进行保护性切分，杜绝跨语义单元截断
- [ ] **Chunk 自动上下文注入**：切片时强制为每个 `TextSegment` 头部拼接父级标题（如 `[来源章节：3.1 虚拟内存管理]`），避免 LLM 收到脱离上下文的碎片
- [ ] **Parent-Child 召回结构**：
  - 入库：原始大段落（Parent）存 PostgreSQL；切分碎片（Child + Parent ID）Embedding 后存 Milvus
  - 检索：重写 `ContentRetriever`，Milvus 命中 Child 后通过 Parent ID 反查数据库取完整段落作为 Prompt 上下文
- [ ] **Re-ranker 管线集成（正式交付）**：Milvus Top-20 粗筛 → Re-ranker（Cohere / 本地 BGE-Reranker）交叉打分 → Top-5 传入 LLM（与 15.5.D 联动，此处为管线编排验收标准）

#### 16.6 动态算力池与模型治理

> **目标**：降低云端 API 成本，保护私有数据，防止多实例内存泄漏。

- [ ] **云边双引擎路由（SmartLlmRouter）**：定时探测局域网内 Ollama 节点，若本地 GPU 存活则自动将批量 Embedding 和摘要任务路由至本地执行，降低云端额度消耗
- [ ] **LRU API 客户端缓存池（正式交付）**：Caffeine `Cache<String, ChatLanguageModel>`，以 `API_KEY_HASH` 为键，30 分钟过期，复用底层 OkHttp 线程池（与 15.5.F 联动，扩展至多用户场景）
- [ ] **Token 消耗拦截与审计**：在 LangChain4j Listener 层拦截 `TokenUsage`，异步写入 PostgreSQL 统计表，为限流/商业化计费储备数据

---


### 阶段十七：质量保障与发布准备 (QA & Launch) 📋

> **前置条件**：阶段十六完成，或可提前进行性能测试。

#### 17.1 AI 质量评估
- [ ] RAG 检索质量评估：Precision@K / Recall@K / MRR 指标测试
- [ ] LangChain4j `EvaluationModel` 集成：自动评估 AI 回答的准确性与相关性
- [ ] 端到端 AI 功能回归测试用例（PDF 切片 / 语音提取 / 手写识别）

#### 17.2 三端压力测试
- [ ] 千级任务块 / 万级知识块渲染性能测试
- [ ] Timeline 大量数据滚动帧率验证（目标 60fps）
- [ ] WebSocket 高并发连接压测
- [ ] Milvus 万级向量检索延迟基准测试（目标 < 100ms P99）

#### 17.3 安全加固
- [ ] CSP 配置（当前 `tauri.conf.json` 中 `csp: null`，需正式配置）
- [ ] API 接口 Rate Limiting
- [ ] SQL 注入 / XSS 防护审查
- [ ] AI 提示注入 (Prompt Injection) 防护测试

#### 17.4 跨平台安装包构建
- [ ] StudyCore-Mobile：iOS IPA（TestFlight）/ Android APK（签名包）
- [ ] StudyCore-PC：Windows MSI / macOS DMG / Linux AppImage
- [ ] 自动更新机制（Tauri Updater Plugin）

#### 17.5 离线可用性验证
- [ ] 断网场景下三端核心功能可用性测试
- [ ] SQLite 离线数据完整性检验
- [ ] AI 功能降级策略验证（后端不可达时的 UI 反馈）

#### 17.6 长连接安全与全链路可观测性

- [ ] **WebSocket 协议级鉴权漏洞修复（正式验收）**：Spring WebSocket Upgrade 握手强制校验 JWT；心跳 Ping 附带 Token，后端发现失效立即 `1008 Policy Violation` 断连（与 14.5 风险优化项联动，此处为正式交付验收标准）
- [ ] **引入 Micrometer + Prometheus 监控**：暴露 Spring Boot 内置指标，重点关注：
  - JVM 堆内存抖动（特别关注 Tika 解析大 PDF 时的 GC 压力）
  - HikariCP 数据库连接池水位
  - 大模型 API 调用时延（P50/P99）与错误率
- [ ] **PostgreSQL 图引擎（Apache AGE）同步基建**：安装 Apache AGE 扩展，通过 Spring Data Event 或 Debezium 监听 `block_relations` 表变化，异步双写至 Cypher 图空间，为前端 3D 星图（16.2）提供毫秒级图遍历接口（替换慢速递归 SQL）

---


## 六、当前阻塞点与待决策项

> 标记 🔴 = 影响核心功能，必须优先解决；🟡 = 影响体验或安全；🟢 = 非紧急；✅ = 已处理但需保留追踪

| 优先级 | # | 问题（精确定位） | 影响 | 建议行动 |
|--------|---|------------------|------|----------|
| 🔴 | 1 | **后端缺少真实测试源码** | `mvn test` 只能证明可编译，无法防回归 | 补 Auth、Asset、Sync、MutationLog 测试 |
| 🔴 | 2 | **直接 CRUD 删除与同步软删除语义未完全统一** | 多端同步可能出现删除后被冷启动恢复或状态不一致 | 统一 Controller 删除路径和 MutationLog 删除路径 |
| 🔴 | 3 | **WebSocket 鉴权盲区**：HTTP JWT 过期会拦截刷新，但 WS 长连接会话可能仍活跃 | 安全审计漏洞 | 实现握手鉴权、心跳 token 校验、失效断连 |
| 🔴 | 4 | **MinIO 资产绑定缺少对象真实校验** | 用户可能绑定不存在或不匹配的对象元数据 | 绑定前校验对象存在、大小、content-type |
| 🟡 | 5 | **Mobile H5 构建仍有警告** | 可能影响正式发布质量或跨端兼容性 | 定位并清理构建警告，补手机/平板真机验收 |
| 🟡 | 6 | **尚未发现正式 CI/CD 配置** | 发布流程依赖人工，容易漏测漏包 | 建立最小 CI：后端 test、PC build、Mobile H5 build |
| 🟡 | 7 | **Runbook 还未经过实操演练** | 线上故障处理路径没有验证 | 按 `Demand/v3/41-runbook.md` 做一次容器、日志、备份恢复演练 |
| 🟡 | 8 | **`application-prod.yml` AI 配置需要复核** | 生产环境可能无法连接 LLM 或泄露默认配置 | 对照实际 LangChain4j 配置键和环境变量统一整理 |
| 🟢 | 9 | **CSP 配置为 `null`**（`tauri.conf.json`） | 发布前的 XSS 安全隐患 | 阶段 17.3 配置正式 CSP 白名单 |
| 🟢 | 10 | **RAG 缺失 Re-ranker / Parent-Child 召回** | 影响复杂文档问答质量 | 阶段 16.5 做正式 RAG 管线重构 |
| ✅ | 11 | **前端直传 AI Key / Base URL 风险** | 用户密钥边界不清晰 | 已改为后端统一配置，继续补回归测试 |
| ✅ | 12 | **密码明文存储风险** | 账号安全漏洞 | 已改 BCrypt，并支持旧明文密码登录迁移 |
| ✅ | 13 | **资产跨用户访问风险** | 数据越权 | 已增加资产查询和绑定归属校验，继续补测试 |
| ✅ | 14 | **Refresh Token 被误用于普通 API 的风险** | 鉴权边界不清晰 | 已增加 token 类型检查，继续补测试 |

---

## 七、阶段十五继续推进动作

> 项目正处于从“跑通功能”向“生产级高可用”跨越的关键节点。阶段十五已有部分加固落地，继续推进前建议优先完成以下动作：

- [ ] **统一线程模型设计**：评估 Spring Boot 中并发任务的执行域，将 I/O 密集型的 LLM 请求线程池与 CPU 密集型的数据解析线程池隔离开来
- [ ] **压测左移**：先不上 Milvus 和完整 RAG，写脚本向 PostgreSQL 模拟插入 10 万条 Mock “知识块”数据，在前端验证 Timeline 和瀑布流的渲染帧率，验证分页、懒加载和后端接口的响应速度，确保底层骨架稳固
- [ ] **删除语义收口**：把直接 CRUD 删除、MutationLog 删除、冷启动拉取全部统一到软删除语义。
- [ ] **资产链路验收**：补 MinIO 对象存在性、大小、content-type 校验，并覆盖跨用户访问测试。
- [ ] **WebSocket 生命周期验收**：补握手鉴权、心跳续期、token 过期断连和重连测试。
- [ ] **构建警告清理**：处理 Mobile H5 构建警告，记录目标平台验收结果。

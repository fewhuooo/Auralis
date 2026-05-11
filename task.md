# StudyCore (学核) 跨平台智能生产力中枢 - 完整开发任务清单

> **最后更新**：2026-05-11（代码精审版）
> **当前阶段**：阶段十四（Java 后端完善）—— Mock 数据替换、RAG 注入、Redis 同步待完成 🔄
> **架构模式**：AI 能力全部收归 Spring Boot 后端（LangChain4j 直连云端 LLM）

### 📊 整体进度概览

| 阶段 | 范围 | 状态 | 说明 |
|------|------|------|------|
| 1~8 | PC 端前端骨架 | ✅ 完成 | Tauri + Vue 3 全部页面与交互 |
| 9~12 | 移动/平板端 | ✅ 完成 | Uni-app 三端 UI + 手写/PDF 页面 |
| 13 | AI 架构迁移 | ✅ 完成 | 移除 Sidecar，前端对接后端 `/api/ai/*` |
| 14 | Java 后端完善 | 🔶 部分完成 | CRUD/鉴权就绪，AI 管道与同步为骨架 |
| 15 | 数据基座与同步 | 📋 未开始 | Milvus 部署、离线策略、E2EE |
| 16 | AI 进阶与生态 | 📋 未开始 | Agent 工具、知识图谱、系统集成 |
| 17 | 质量保障与发布 | 📋 未开始 | 测试、安全加固、安装包构建 |

> **标记说明**：`[x]` = 功能完整可用　`[~]` = 骨架/接口已建，业务逻辑待填充　`[ ]` = 未开始

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

## 二、技术栈全图

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

## 三、整体应用流程

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

## 四、开发阶段任务清单

### 阶段 1~8：PC 端前端开发 ✅（已完成，共 26 项）

<details>
<summary>点击展开详细任务列表</summary>

- [x] 1.1~1.4 Vite + Tauri 工程初始化
- [x] 2.1~2.5 前端核心依赖（Router / Pinia / Element Plus / 自动导入）
- [x] 3.1~3.4 目录结构、路由、全局样式系统
- [x] 4.1~4.3 AppSidebar + AppHeader + App.vue 主布局
- [x] 5.1~5.6 Home / Timeline / Asset / Profile 四大业务页面
- [x] 6.1~6.3 知识块 Store + 任务块 Store + 持久化
- [x] 7.1~7.3 拖拽排期 + Command Palette + 资产上传 UI
- [x] 8.1~8.3 Mock 数据 + Tauri Invoke 封装 + WebSocket 管道

</details>

### 阶段 9~12：移动端与平板端开发 ✅（已完成，共 16 项）

<details>
<summary>点击展开详细任务列表</summary>

- [x] 9.1~9.3 Uni-app 工程初始化 + TabBar 配置
- [x] 10.1~10.5 移动端四大页面 + 多尺寸响应式适配
- [x] 11.1~11.3 跨端 Store 迁移 + 持久化层 + 远程同步预留
- [x] 12.1~12.5 平板端 PDF 伴读 + 手写增强 + Studio 模式

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

### 阶段十四：Java 后端完善 (Spring Boot) 🔶

> **前置条件**：阶段十三已完成。当前状态：基础 CRUD 和鉴权就绪，AI 管道与同步总线为骨架实现。

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
- [~] **替换 Mock 数据**：各页面从真实接口加载数据，移除 Store 中的硬编码假数据
  - [x] **Home 页**（`views/Home/index.vue`）：`recentBlocks` 目前来自 `useBlockStore` Mock，改为 `onMounted` 调用 `useBlockApi.getBlocks()` 并写回 store
  - [x] **Timeline 页**（`views/Timeline/index.vue`）：`pendingTasks` / `timeSlots` 来自 `useTaskStore` Mock，改为调用 `GET /api/tasks` 并合并本地排期状态
  - [ ] **Asset 页**（`views/Asset/index.vue`）：移除硬编码 Mock 资产列表，接入真实上传/查询接口
  - [ ] **Mobile 端同步**：`pages/index`、`pages/timeline`、`pages/asset` 同步替换为真实接口调用

#### 14.3 用户与鉴权体系
- [x] `User` 实体 + 注册 / 登录接口
- [x] JWT 统一认证模块（`JwtUtil` + `AuthFilter`）
- [~] 多端登录状态管理（Token 刷新策略）
  - [ ] 后端实现 Refresh Token 端点 `POST /api/auth/refresh`（`AuthController` 中待新增）
  - [ ] 前端拦截器自动刷新逾期 Token：在 `request.ts` 响应拦截器 401 分支中，先尝试 `/api/auth/refresh`，失败再执行 `logout()`
  - [x] **移除 Mock Token**：`useAuthStore.ts` 第 6 行 `token.value` 初始值 `'mock-token-for-dev'` 改为 `null`，恢复正式登录校验
- [x] 前端登录页：`views/Login/index.vue`（PC）+ `pages/login/index.vue`（Mobile）

#### 14.4 LangChain4j AI 编排层集成
- [x] 引入 Maven 依赖：`langchain4j-spring-boot-starter` + `langchain4j-open-ai` + `langchain4j-milvus` + `langchain4j-document-parser-apache-tika`
- [x] `application.yml` 配置 LangChain4j OpenAI 兼容端点（指向云端大模型 API，如 `https://api.openai.com/v1`）
- [x] **Chat Model 封装**：配置 `OpenAiChatModel` Bean，支持多模型切换（Claude / GPT / Ollama）
- [x] **Embedding 服务**：配置 `OpenAiEmbeddingModel` → 调用云端 API 生成知识块向量
- [~] **Milvus 向量存储**：当前 fallback 为 `InMemoryEmbeddingStore`，待接入真实 Milvus
- [x] **AiService 声明式接口**：
  - `StudyCoreAssistant`：带 `@SystemMessage` 的智能问答接口
  - `KnowledgeExtractor`：文本 → 结构化 JSON + 任务提取 + 手写转换
  - `TaskScheduler`：任务排期建议与过载检测
- [~] **RAG 流水线**：`LangChain4jConfig` 中 `ContentRetriever` Bean 已建（`EmbeddingStoreContentRetriever`），但 **`StudyCoreAssistant` 接口未注入**，实为零-RAG 直接推理；待补充：
  - [ ] 在 `@AiService` 注解或 `LangChain4jConfig` 中将 `contentRetriever` 注入 `StudyCoreAssistant`，启用真正 RAG 问答
  - [ ] 添加 `QueryTransformer`（HyDE / Step-Back 查询扩展）
  - [ ] 添加 `ContentAggregator`（多路结果融合与去重）
- [~] **文档摄入管道**（`/api/ai/ingest`）：当前直接把原始文本传给 `knowledgeExtractor.extractKnowledgeBlocks()`，无分块/向量写入；待补充完整链路：
  - [ ] 接入 `DocumentParser`（Apache Tika）：解析 PDF / DOCX / PPTX 等格式
  - [ ] 接入 `DocumentSplitter`（递归按段落+句子切片，chunk ≤ 512 tokens）
  - [ ] 批量调用 `EmbeddingModel.embedAll()` 并写入 `EmbeddingStore`
  - [ ] 返回入库知识块 ID 列表供前端展示
- [~] **InMemory 向量库**：`LangChain4jConfig.embeddingStore()` 目前返回 `InMemoryEmbeddingStore`，重启即清空；正式 Milvus 接入见阶段 15.1
- [x] 统一 `/api/ai/chat`（阻塞 + SSE 流式双模式）+ `/api/ai/ingest` + `/api/ai/extract-tasks` + `/api/ai/convert-handwriting` + `/api/ai/schedule-suggest` RESTful 接口

#### 14.5 实时同步总线
- [x] Spring WebSocket 端点：`/ws/sync`（`SyncWebSocketHandler` 已实现会话管理 + `broadcast()` 方法）
- [~] Redis Pub/Sub：`RedisConfig` 已配置 `RedisTemplate`，但事件发布与订阅链路尚未打通：
  - [ ] 在 `KnowledgeBlockServiceImpl` / `TaskBlockServiceImpl` 的 create/update/delete 中，调用 `redisTemplate.convertAndSend("studycore:sync", event)` 发布变更事件
  - [ ] 新建 `RedisSyncSubscriber` 实现 `MessageListener`，将消息反序列化后调用 `SyncWebSocketHandler.broadcast()` 推送至客户端
  - [ ] 在 `RedisConfig` 中注册 `MessageListenerAdapter` + `RedisMessageListenerContainer`
- [x] 前端 `subscribeToCloudSync()` 改造：从 Tauri Event 扩展支持 WebSocket 连接
- [x] 断线重连策略（指数退避）

---

### 阶段十五：数据基座与同步可靠性 (Data & Sync) 📋

> **前置条件**：阶段十四全部完成。

#### 15.1 向量数据库部署与调优
- [ ] Milvus Docker Compose 部署脚本（Milvus Standalone + etcd + MinIO）
- [ ] 知识块 Collection Schema 设计（id / vector / title / content / subject / tags / createdAt）
- [ ] 索引策略配置（IVF_FLAT / HNSW 选型，基于数据量级评估）
- [ ] LangChain4j `MilvusEmbeddingStore` 端到端验证：写入 → 语义检索 → 返回结果

#### 15.2 本地持久化升级
- [ ] PC 端：接入 `tauri-plugin-sql` 操作本地 SQLite（替代纯 Pinia 内存存储）
- [ ] Mobile 端：集成 Uni-app 原生 SQLite 插件（替代 localStorage）
- [ ] 离线优先策略：本地写入 → 上线后自动同步到服务端

#### 15.3 跨端数据一致性
- [ ] 冲突检测：基于 `updatedAt` 时间戳的乐观锁
- [ ] CRDT 结构调研（知识块的并发编辑场景）
- [ ] WebSocket 断线重连 + 增量同步（基于 Cursor / ChangeLog 机制）

#### 15.4 端到端加密 (E2EE)
- [ ] 本地密钥生成与安全存储（Tauri `keyring` 插件）
- [ ] AES-256 加密同步数据载荷
- [ ] 密钥备份与恢复流程

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

---

## 五、当前阻塞点与待决策项

> 标记 🔴 = 影响核心功能，必须优先解决；🟡 = 影响体验或安全；🟢 = 非紧急

| 优先级 | # | 问题（精确定位） | 影响 | 建议行动 |
|--------|---|------------------|------|----------|
| ✅ | 1 | **Mock Token 未移除**：`useAuthStore.ts:6` `token` 初始值为 `'mock-token-for-dev'`，所有请求均绕过登录校验 | 安全漏洞，无法测试真实鉴权 | 已修复，改为 `null` |
| 🔴 | 2 | **前端页面仍读 Store Mock 数据**：Home / Timeline 已修复，Asset 待修复 | 页面无法展示真实后端数据 | 完成 14.2：`onMounted` 中调用 `useBlockApi` / `useTaskApi` |
| 🔴 | 3 | **RAG 未真正启用**：`StudyCoreAssistant` 接口没有注入 `ContentRetriever`，问答是纯 LLM 无知识库检索 | AI 问答不含个人知识库上下文 | 在 `@AiService` 配置中绑定 `contentRetriever` Bean |
| 🔴 | 4 | **Ingest 管道无分块写入**：`/api/ai/ingest` 直接把原文传给 LLM，未经 Tika 解析 → Splitter → Embedding → EmbeddingStore | 文档上传无法入向量库，RAG 无数据 | 补齐 DocumentParser → DocumentSplitter → EmbeddingStore.addAll() |
| 🔴 | 5 | **Redis Pub/Sub 断链**：`RedisConfig` 有 `RedisTemplate`，但 Service 层无事件发布，`SyncWebSocketHandler` 无订阅逻辑 | 多端实时同步完全不工作 | 新建 `RedisSyncSubscriber`，在 Service CRUD 中 `convertAndSend()` |
| 🟡 | 6 | **`request.ts` timeout=5000ms**（`src/api/request.ts:6`） | LLM 推理通常 10~60s，AI 接口必超时 | 拆分实例：普通接口 10s，AI 接口 60s |
| 🟡 | 7 | **无 Refresh Token 机制**：401 响应直接触发 `logout()` 跳转（`request.ts:29`） | Token 过期即强制登出，体验差 | 后端增加 `POST /api/auth/refresh`，前端拦截器先尝试刷新 |
| 🟡 | 8 | **`InMemoryEmbeddingStore` 重启清空**：`LangChain4jConfig.embeddingStore()` 返回内存向量库 | 每次重启向量库清零，RAG 失效 | 阶段 15.1 完成 Milvus 替换前可接受，需文档说明 |
| 🟡 | 9 | **`application-prod.yml` AI 配置格式过时** | 生产环境无法连接 LLM | 同步为 `langchain4j.open-ai.*` 键名格式 |
| 🟢 | 10 | **CSP 配置为 `null`**（`tauri.conf.json`） | XSS 安全隐患 | 发布前（阶段 17.3）配置正式 CSP 白名单 |

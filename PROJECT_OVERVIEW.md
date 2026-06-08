# StudyCore (学核) — 项目全景概览

> **用途**：每次新开 AI 辅助任务时，先阅读本文件以快速理解项目全貌。
>
> **最后更新**：2026-06-03

---

## 1. 项目简介

**StudyCore (学核)** 是一套由云端大模型驱动的、以"知识块"和"任务块"为底层数据结构的**跨平台校园智能生产力系统**。

- **手机端**：碎片化知识检索、RAG 问答、自动补全入库、轻量状态同步
- **平板端**：PDF 智能伴读、手写笔迹 OCR → LaTeX/Markdown 转化
- **PC 端**：全能中枢 — 聚合检索/伴读 + 重型资产编排 + 智能排期 + 知识图谱

**核心架构原则**：前端轻量呈现 → 后端集中智能 → 云端模型驱动。前端不直接调用任何 LLM API，所有 AI 请求统一走后端 `/api/ai/*` 端点。

---

## 2. 仓库根目录结构

```
StudyCore/                          ← 项目根目录 (Monorepo)
├── .env / .env.example             ← 环境变量 (AI API Keys)
├── docker-compose.yml              ← 基础设施编排 (PostgreSQL, Redis, Milvus, MinIO, pgAdmin)
├── StudyCore-PC/                   ← PC 端 (Vue 3 + Vite + Tauri 2)
├── StudyCore-Mobile/               ← 移动端 (Vue 3 + Uni-app)
├── StudyCore-Server/               ← 后端 (Spring Boot 3.2 + Java 21)
├── Demand/                         ← 产品需求文档 (PRD)
├── data/                           ← Docker 持久化数据卷 (postgres, redis, milvus)
└── .claude/                        ← Claude 配置
```

---

## 3. 技术栈一览

### 3.1 PC 端 (`StudyCore-PC/`)

| 分类 | 技术 | 版本 |
|------|------|------|
| 框架 | Vue 3 (Composition API) + TypeScript | Vue 3.5, TS 6.0 |
| 构建 | Vite | 8.x |
| 桌面封装 | Tauri 2 (Rust, 纯 Web 容器) | 2.10 |
| UI 组件库 | Element Plus | 2.13 |
| 状态管理 | Pinia + pinia-plugin-persistedstate | Pinia 3.x |
| 路由 | vue-router | 4.6 |
| HTTP | Axios | 1.16 |
| Markdown 渲染 | marked + DOMPurify | — |
| PDF 渲染 | pdfjs-dist | 6.x |
| 3D 可视化 | Three.js (用于知识图谱) | 0.184 |
| 自动导入 | unplugin-auto-import + unplugin-vue-components | — |

**路径别名**：`@` → `./src`（Vite `resolve.alias`）

**代理配置** (Vite dev server `localhost:5173`)：
- `/api` → `http://localhost:8080`
- `/ws` → `ws://localhost:8080`

### 3.2 移动端 (`StudyCore-Mobile/`)

| 分类 | 技术 | 版本 |
|------|------|------|
| 框架 | Vue 3 + TypeScript | Vue 3.4 |
| 跨平台 | Uni-app (DCloudio) | 3.0 |
| 状态管理 | Pinia | 2.3 |
| 国际化 | vue-i18n | 9.x |
| 样式预处理 | SASS | — |
| 构建 | Vite (通过 @dcloudio/vite-plugin-uni) | 5.2 |

**目标平台**：H5 / 微信小程序 / iOS / Android

### 3.3 后端 (`StudyCore-Server/`)

| 分类 | 技术 | 版本 |
|------|------|------|
| 框架 | Spring Boot | 3.2.5 |
| 语言 | Java (Virtual Threads 启用) | 21 |
| ORM | MyBatis Plus | 3.5.5 |
| 数据库 | PostgreSQL | 15 |
| 向量库 | Milvus (BGE-m3 embedding, 1024 维) | 2.4 |
| 缓存 / 消息 | Redis | 7 |
| 对象存储 | MinIO (复用 Milvus 栈) | — |
| AI 编排 | LangChain4j (OpenAI 兼容层) | 1.0.0-alpha1 |
| 实时通信 | WebSocket + Redis Pub/Sub | — |
| 认证 | JWT (jjwt 0.11.5) | — |
| 本地缓存 | Caffeine | — |
| 文档解析 | Apache Tika (langchain4j-document-parser-apache-tika) | — |
| 代码简化 | Lombok | — |

### 3.4 基础设施 (Docker Compose)

| 服务 | 镜像 | 端口 |
|------|------|------|
| PostgreSQL | postgres:15-alpine | 5432 |
| Redis | redis:7-alpine | 6379 |
| pgAdmin | dpage/pgadmin4 | 5050 |
| Milvus Standalone | milvusdb/milvus:v2.4.0 | 19530, 9091 |
| Milvus etcd | quay.io/coreos/etcd:v3.5.5 | — |
| MinIO | minio/minio | 9000, 9001 |

---

## 4. PC 端详细结构

```
StudyCore-PC/
├── src/
│   ├── main.ts                     ← 应用入口 (挂载 Pinia + Router)
│   ├── App.vue                     ← 根组件 (含 layout)
│   ├── api/                        ← API 层 (HTTP 请求封装)
│   │   ├── request.ts              ← Axios 实例 + 拦截器
│   │   ├── aiClient.ts             ← AI 聊天 API 客户端
│   │   ├── e2ee.ts                 ← 端到端加密工具
│   │   ├── tauri.ts                ← Tauri 桥接 API (本地 SQLite)
│   │   ├── useAssetApi.ts          ← 资产管理 API
│   │   ├── useAuthApi.ts           ← 认证 API
│   │   ├── useBlockApi.ts          ← 知识块 API
│   │   ├── useSyncApi.ts           ← 同步 API
│   │   └── useTaskApi.ts           ← 任务块 API
│   ├── components/                 ← 全局组件
│   │   ├── layout/
│   │   │   ├── AppHeader.vue       ← 顶部导航栏
│   │   │   └── AppSidebar.vue      ← 左侧侧边栏
│   │   ├── schedule/
│   │   │   └── ScheduleWeekView.vue← 周视图日程组件
│   │   ├── subject/
│   │   │   ├── KnowledgeGraph.vue  ← Three.js 3D 知识图谱
│   │   │   ├── PdfViewer.vue       ← PDF 阅读器
│   │   │   └── SubjectCreateModal.vue ← 学科创建弹窗
│   │   ├── ConfirmDialog.vue       ← 确认对话框
│   │   ├── HelloWorld.vue          ← (示例/占位)
│   │   └── SearchPalette.vue       ← 全局搜索面板
│   ├── views/                      ← 页面视图
│   │   ├── Login/index.vue         ← 登录页
│   │   ├── Dashboard/index.vue     ← 仪表盘首页 (路由: /)
│   │   ├── SubjectHall/index.vue   ← 学科大厅 (路由: /subjects)
│   │   ├── SubjectWorkspace/index.vue ← 学科工作区 (路由: /subject/:id)
│   │   ├── Timeline/index.vue      ← 时间线/排期 (路由: /timeline)
│   │   ├── Asset/index.vue         ← 资产管理 (路由: /asset)
│   │   ├── Profile/index.vue       ← 个人中心 (路由: /profile)
│   │   ├── Home/index.vue          ← 首页 (备用)
│   │   └── Settings/               ← 设置页 (目录存在)
│   ├── store/                      ← Pinia 状态管理
│   │   ├── useAuthStore.ts         ← 认证状态 (token, user)
│   │   ├── useBlockStore.ts        ← 知识块状态
│   │   ├── useChatStore.ts         ← AI 对话状态
│   │   ├── useSettingsStore.ts     ← 应用设置
│   │   ├── useSubjectStore.ts      ← 学科状态
│   │   ├── useSyncStore.ts         ← 同步状态
│   │   └── useTaskStore.ts         ← 任务块状态 (最大, 14KB)
│   ├── services/
│   │   └── localDb.ts              ← Tauri SQLite 本地数据库服务 (41KB, 核心)
│   ├── router/
│   │   └── index.ts                ← Vue Router 配置 + 鉴权守卫
│   ├── utils/
│   │   ├── lexorank.ts             ← LexoRank 排序算法
│   │   ├── streamFetch.ts          ← SSE 流式请求工具
│   │   └── uuid.ts                 ← UUID 生成工具
│   ├── styles/
│   │   └── index.css               ← 全局样式 (9KB)
│   └── assets/                     ← 静态资源 (hero.png, svg)
├── src-tauri/                      ← Tauri 桌面端配置
│   ├── tauri.conf.json             ← Tauri 配置 (窗口 1280×800)
│   ├── Cargo.toml                  ← Rust 依赖
│   ├── src/                        ← Rust 源码
│   └── capabilities/               ← Tauri 权限配置
├── vite.config.ts                  ← Vite 构建配置
├── Dockerfile                      ← 前端 Docker 镜像 (Nginx)
├── nginx.conf                      ← Nginx 反向代理配置
└── package.json                    ← Node 依赖清单
```

### 4.1 PC 端路由表

| 路径 | 名称 | 视图组件 | 需要认证 |
|------|------|----------|----------|
| `/login` | Login | Login/index.vue | ✗ |
| `/` | Dashboard | Dashboard/index.vue | ✓ |
| `/subjects` | SubjectHall | SubjectHall/index.vue | ✓ |
| `/subject/:id` | SubjectWorkspace | SubjectWorkspace/index.vue | ✓ |
| `/asset` | Asset | Asset/index.vue | ✓ |
| `/timeline` | Timeline | Timeline/index.vue | ✓ |
| `/profile` | Profile | Profile/index.vue | ✓ |

路由守卫：未登录访问受保护路由 → 重定向到 `/login`；已登录访问 `/login` → 重定向到 `/`。

---

## 5. 移动端详细结构

```
StudyCore-Mobile/
├── src/
│   ├── main.ts                     ← 应用入口
│   ├── App.vue                     ← 根组件
│   ├── pages.json                  ← 页面路由配置 + TabBar
│   ├── manifest.json               ← 应用清单 (App 配置)
│   ├── pages/                      ← 页面目录
│   │   ├── login/index.vue         ← 登录页
│   │   ├── index/index.vue         ← 主页 (知识唤醒)
│   │   ├── timeline/index.vue      ← 状态同步 (时间线)
│   │   ├── asset/index.vue         ← 资产编排
│   │   ├── profile/index.vue       ← 个人空间
│   │   ├── pdf/index.vue           ← 智能伴读
│   │   └── handwriting/index.vue   ← 手写笔记
│   ├── api/                        ← API 层
│   │   ├── request.ts              ← HTTP 请求封装 (uni.request)
│   │   ├── aiClient.ts             ← AI 聊天客户端
│   │   ├── device.ts               ← 设备信息
│   │   ├── e2ee.ts                 ← 端到端加密
│   │   ├── sync.ts                 ← 同步逻辑
│   │   ├── useBlockApi.ts          ← 知识块 API
│   │   ├── useSyncApi.ts           ← 同步 API
│   │   └── useTaskApi.ts           ← 任务块 API
│   ├── store/                      ← Pinia 状态管理
│   │   ├── persist.ts              ← 持久化适配器
│   │   ├── useAuthStore.ts         ← 认证状态
│   │   ├── useBlockStore.ts        ← 知识块状态
│   │   ├── useSubjectStore.ts      ← 学科状态
│   │   ├── useSyncStore.ts         ← 同步状态
│   │   └── useTaskStore.ts         ← 任务块状态
│   ├── services/
│   │   └── localDb.ts              ← 本地数据库服务
│   ├── utils/
│   │   ├── lexorank.ts             ← LexoRank 排序
│   │   └── uuid.ts                 ← UUID 生成
│   ├── styles/
│   │   └── index.css               ← 全局样式
│   └── uni.scss                    ← Uni-app SCSS 变量
└── package.json                    ← Node 依赖清单
```

### 5.1 移动端 TabBar

| Tab | 页面 | 标题 |
|-----|------|------|
| 主页 | pages/index/index | 知识唤醒 |
| 知识 | pages/timeline/index | 状态同步 |
| 编排 | pages/asset/index | 资产编排 |
| 空间 | pages/profile/index | 个人空间 |

---

## 6. 后端详细结构

```
StudyCore-Server/
├── src/main/java/com/studycore/server/
│   ├── StudyCoreApplication.java        ← Spring Boot 启动类
│   ├── common/                          ← 通用工具 & 基础设施
│   │   ├── AuthInterceptor.java         ← JWT 认证拦截器
│   │   ├── GlobalExceptionHandler.java  ← 全局异常处理
│   │   ├── JwtUtil.java                 ← JWT 工具类
│   │   ├── Result.java                  ← 统一返回体
│   │   ├── SyncEvent.java               ← 同步事件模型
│   │   ├── UserContext.java             ← 当前用户上下文 (ThreadLocal)
│   │   └── WebConfig.java               ← Web 拦截器配置
│   ├── config/                          ← 配置类
│   │   ├── DbMigrationConfig.java       ← 数据库迁移 (启动时建表)
│   │   ├── DynamicChatModel.java        ← 动态 Chat 模型切换
│   │   ├── DynamicEmbeddingModel.java   ← 动态 Embedding 模型切换
│   │   ├── LangChain4jConfig.java       ← LangChain4j 配置 (RAG 管道)
│   │   ├── MinioConfig.java             ← MinIO 对象存储配置
│   │   ├── PgJsonbTypeHandler.java      ← PostgreSQL JSONB 类型处理
│   │   ├── RedisConfig.java             ← Redis 配置
│   │   ├── TenantAwareMilvusEmbeddingStore.java ← 多租户向量存储
│   │   ├── ThreadPoolConfig.java        ← 线程池配置
│   │   └── WebSocketConfig.java         ← WebSocket 配置
│   ├── controller/                      ← REST 控制器
│   │   ├── AiController.java            ← AI 接口 (/api/ai/*)
│   │   ├── AssetController.java         ← 资产管理
│   │   ├── AuthController.java          ← 认证 (登录/注册)
│   │   ├── BlockRelationController.java ← 块关联关系
│   │   ├── FileStorageController.java   ← 文件存储 (MinIO presigned URL)
│   │   ├── KnowledgeBlockController.java← 知识块 CRUD
│   │   ├── StatsController.java         ← 统计数据
│   │   ├── SyncController.java          ← 数据同步 (Push/Pull)
│   │   └── TaskBlockController.java     ← 任务块 CRUD
│   ├── entity/                          ← 数据库实体
│   │   ├── Asset.java                   ← 资产 (文件/文档)
│   │   ├── BlockRelation.java           ← 块之间的关联
│   │   ├── KnowledgeBlock.java          ← 知识块
│   │   ├── MutationLog.java             ← 变更日志 (用于同步)
│   │   ├── TaskBlock.java               ← 任务块
│   │   └── User.java                    ← 用户
│   ├── dto/                             ← 数据传输对象
│   │   ├── SyncPullResponse.java        ← 同步拉取响应
│   │   ├── SyncPushRequest.java         ← 同步推送请求
│   │   └── SyncPushResponse.java        ← 同步推送响应
│   ├── mapper/                          ← MyBatis Plus Mapper
│   │   ├── AssetMapper.java
│   │   ├── BlockRelationMapper.java
│   │   ├── KnowledgeBlockMapper.java
│   │   ├── MutationLogMapper.java
│   │   ├── TaskBlockMapper.java
│   │   └── UserMapper.java
│   ├── service/                         ← 业务服务层
│   │   ├── ai/                          ← AI 服务 (LangChain4j AiServices)
│   │   │   ├── StudyCoreAssistant.java  ← RAG 知识问答 (流式 SSE)
│   │   │   ├── KnowledgeExtractor.java  ← 文档语义切片提取
│   │   │   └── AiTaskScheduler.java     ← AI 任务排期
│   │   ├── impl/                        ← 服务实现
│   │   │   ├── AssetServiceImpl.java
│   │   │   ├── BlockRelationServiceImpl.java
│   │   │   ├── KnowledgeBlockServiceImpl.java
│   │   │   ├── MutationLogServiceImpl.java
│   │   │   ├── TaskBlockServiceImpl.java
│   │   │   └── UserServiceImpl.java
│   │   ├── DocumentIngestionService.java← 文档摄取 (上传 → 切片 → 入库)
│   │   ├── IngestionStreamConsumer.java ← 摄取流式消费者 (20KB, 核心)
│   │   ├── StatsService.java            ← 统计服务
│   │   └── ...其他 Service 接口
│   └── websocket/                       ← WebSocket 层
│       ├── SyncWebSocketHandler.java    ← WS 消息处理
│       ├── RedisSyncSubscriber.java     ← Redis Pub/Sub 订阅
│       └── WebSocketAuthInterceptor.java← WS 认证拦截
├── src/main/resources/
│   ├── application.yml              ← 主配置 (profile=dev)
│   ├── application-dev.yml          ← 开发环境配置
│   ├── application-prod.yml         ← 生产环境配置
│   └── db/migration/
│       └── V2__add_encrypted_payload.sql ← 数据库迁移脚本
├── pom.xml                          ← Maven 依赖配置
└── Dockerfile                       ← 后端 Docker 镜像
```

---

## 7. 核心数据模型

### 7.1 数据库实体 (PostgreSQL)

| 实体 | 说明 | 关键字段 |
|------|------|----------|
| `User` | 用户 | id, username, password |
| `KnowledgeBlock` | 知识块 | id, userId, subjectId, title, content, type |
| `TaskBlock` | 任务块 | id, userId, subjectId, title, status, priority, scheduledAt |
| `Asset` | 资产/文件 | id, userId, filename, mimeType, storageKey |
| `BlockRelation` | 块关联 | id, sourceBlockId, targetBlockId, relationType |
| `MutationLog` | 变更日志 (CRDT 同步) | id, userId, tableName, rowId, operation, payload, timestamp |

### 7.2 向量存储 (Milvus)

- **Collection**: `knowledge_blocks` (开发环境)
- **Embedding 模型**: `BAAI/bge-m3` (1024 维, 通过 SiliconFlow API)
- **多租户**: 通过 `TenantAwareMilvusEmbeddingStore` 按用户隔离

### 7.3 对象存储 (MinIO)

- **Bucket**: `studycore-assets`
- **上传方式**: Presigned URL 直传 (前端获取预签名 URL → 直传 MinIO)

---

## 8. 核心 API 端点

### 8.1 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录 (返回 JWT) |

### 8.2 知识块

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/blocks` | 查询知识块列表 |
| POST | `/api/blocks` | 创建知识块 |
| PUT | `/api/blocks/:id` | 更新知识块 |
| DELETE | `/api/blocks/:id` | 删除知识块 |

### 8.3 任务块

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/blocks/task` | 查询任务块列表 |
| POST | `/api/blocks/task` | 创建任务块 |
| PUT | `/api/blocks/task/:id` | 更新任务块 |
| DELETE | `/api/blocks/task/:id` | 删除任务块 |

### 8.4 AI

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/chat` | RAG 知识问答 (SSE 流式) |
| POST | `/api/ai/ingest` | 文档摄取 (上传 → 切片 → Embedding 入库) |
| POST | `/api/ai/ingest/file` | 文件上传摄取 (PDF/DOCX/图片 multipart) |
| POST | `/api/ai/extract-tasks` | 文本 → 任务块提取 |
| POST | `/api/ai/convert-handwriting` | 手写 OCR → Markdown 转化 |
| POST | `/api/ai/schedule-suggest` | AI 智能排期建议 |

### 8.5 同步

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/sync/push` | 推送本地变更 (MutationLog) |
| GET | `/api/sync/pull` | 拉取远端变更 |
| WS | `/ws/sync` | WebSocket 实时同步通道 |

### 8.6 资产 & 文件

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/assets/bind` | 绑定已上传的资产元数据 |
| GET | `/api/assets/{id}` | 查询单个资产处理状态 |
| GET | `/api/fs/presigned-url` | 获取 MinIO 预签名上传 URL |

### 8.7 统计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/stats` | 获取学习统计数据 |

---

## 9. 同步机制

StudyCore 采用 **MutationLog + WebSocket + Redis Pub/Sub** 的三层同步架构：

1. **本地写入**：前端操作产生变更 → 写入本地 SQLite (Tauri) 或 IndexedDB → 记录 MutationLog
2. **推送上行**：前端定时或实时将 MutationLog 推送至后端 `POST /api/sync/push`
3. **广播分发**：后端写入 PostgreSQL → 通过 Redis Pub/Sub 广播 SyncEvent
4. **实时下发**：其他已连接的终端通过 WebSocket `/ws/sync` 接收变更并应用到本地

---

## 10. AI 能力层

通过 LangChain4j 在后端实现，核心 AiService 接口：

| AiService | 文件 | 职责 |
|-----------|------|------|
| `StudyCoreAssistant` | service/ai/StudyCoreAssistant.java | RAG 检索 + 知识问答 (流式 SSE 返回) |
| `KnowledgeExtractor` | service/ai/KnowledgeExtractor.java | 文档语义切片 → 结构化知识块 JSON |
| `AiTaskScheduler` | service/ai/AiTaskScheduler.java | 任务智能排期 + 脑力负荷预估 |

**模型配置** (开发环境)：
- **Chat Model**: DeepSeek V4 Flash (`api.deepseek.com`)
- **Embedding Model**: BAAI/bge-m3 (`api.siliconflow.cn`)
- **支持热切换**：通过 `DynamicChatModel` / `DynamicEmbeddingModel` 运行时切换模型

---

## 11. 开发命令速查

### 11.1 基础设施

```bash
# 启动所有基础设施 (PostgreSQL, Redis, Milvus, MinIO, pgAdmin)
docker compose up -d

# 仅启动数据库
docker compose up -d db redis
```

### 11.2 PC 端

```bash
cd StudyCore-PC

# 安装依赖
npm install

# 启动开发服务器 (localhost:5173)
npm run dev

# 启动 Tauri 桌面应用开发模式
npm run tauri dev

# 生产构建
npm run build

# Tauri 打包
npm run tauri build
```

### 11.3 移动端

```bash
cd StudyCore-Mobile

# 安装依赖
npm install

# H5 开发模式
npm run dev:h5

# 微信小程序
npm run dev:mp-weixin

# 构建 H5
npm run build:h5
```

### 11.4 后端

```bash
cd StudyCore-Server

# Maven 编译运行 (需要 Java 21)
./mvnw spring-boot:run

# 或指定 profile
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev

# 打包
./mvnw clean package -DskipTests
```

---

## 12. 环境变量

```properties
# .env (根目录)
DEEPSEEK_API_KEY=your-deepseek-api-key
SILICONFLOW_API_KEY=your-siliconflow-api-key
```

后端通过 `spring.config.import=optional:file:../.env[.properties]` 自动读取根目录 `.env` 文件。

---

## 13. 关键设计模式与约定

### 13.1 前端约定
- **API 层命名**：`use{Domain}Api.ts` (组合式函数风格)
- **Store 命名**：`use{Domain}Store.ts`
- **页面结构**：`views/{PageName}/index.vue` (每个页面一个目录)
- **组件组织**：按业务域分子目录 (`layout/`, `subject/`, `schedule/`)
- **样式**：全局 CSS 变量定义在 `styles/index.css`，支持 Dark Mode
- **Element Plus 按需导入**：通过 unplugin-auto-import + unplugin-vue-components 自动注册

### 13.2 后端约定
- **包结构**：标准分层 `controller → service → mapper → entity`
- **统一返回体**：`Result<T>` 包装所有 API 响应
- **认证**：`AuthInterceptor` + `UserContext` (ThreadLocal) 注入当前用户
- **AI 服务**：LangChain4j `@AiService` 注解声明式接口
- **数据库迁移**：`DbMigrationConfig.java` 启动时自动建表 + SQL 迁移脚本

### 13.3 同步约定
- **乐观并发**：基于 MutationLog 时间戳的 Last-Write-Wins 策略
- **排序算法**：LexoRank 算法用于块的拖拽排序 (无需重排全部记录)
- **ID 生成**：前端生成 UUID (离线支持)

---

## 14. 需求文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 详细 PRD | `Demand/StudyCore_Detailed_PRD.md` | 完整产品需求 + 技术架构 + 阶段规划 |
| 精简 PRD | `Demand/ReadNeed.md` | 浓缩版需求文档 |
| 竞品分析 | `Demand/obsidian_notion_analysis.md` | Obsidian / Notion 功能对比 |
| 任务追踪 | `Demand/task.md` | 开发任务清单 (60KB) |

---

## 15. 项目演进阶段

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 1 | 基础设施搭建 (数据库、块系统 CRUD、WebSocket 同步、认证) | ✅ 已完成 |
| Phase 2 | 后端 AI 集成 (LangChain4j + RAG 检索 + 知识补全入库) | ✅ 已完成 |
| Phase 3 | PC 端重型编排 (文档切片、任务拆解、Timeline、排期副驾) | 🔄 进行中 |
| Phase 4 | 平板端多模态 (PDF 伴读、手写 OCR、LaTeX 转化) | ⏳ 待开始 |

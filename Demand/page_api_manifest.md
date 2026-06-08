# StudyCore (学核) — 页面功能与前后端接口清单 (Page & API Manifest)

本文件整理了 **StudyCore (学核)** 校园智能生产力系统在 PC 端 (Tauri + Vue 3) 与移动端/平板端 (Uni-app + Vue 3) 的所有页面、前后端功能映射、本地化存储以及云端大模型 REST/WebSocket 接口的详细清单。

---

## 1. 系统架构与同步图景

StudyCore 采用 **Local-First (本地优先) + 集中式后端 AI 推理** 架构。

* **数据本位**：客户端通过本地 SQLite (PC) 或 IndexedDB (Mobile) 优先读写数据，确保离线可用与毫秒级无延迟交互。
* **增量自愈**：通过 `MutationLog` + WebSocket 实时管道，实现多终端数据的双向并发冲突化解 (Last-Write-Wins)。
* **集中智能**：所有 AI 服务 (RAG 检索、语义切片、手写公式转换、排期负荷测算) 均由 Spring Boot 后端通过 LangChain4j 编排直连云端大模型 API，客户端不暴露任何 API Key。

```mermaid
graph TD
    subgraph 客户端 (Local-First)
        PC[PC端 Tauri 壳] <-->|Tauri IPC| SQLite[本地 SQLite]
        MB[移动/平板端 Uni-app] <-->|Local Storage| IDB[本地缓存]
    end

    subgraph 实时同步层
        PC <-->|WebSocket /ws/sync| WS[WebSocket 服务端]
        MB <-->|WebSocket /ws/sync| WS
        SQLite -.->|增量 Push /api/sync/push| SyncCtrl[SyncController]
        IDB -.->|增量 Push /api/sync/push| SyncCtrl
    end

    subgraph 后端中枢 (Spring Boot)
        WS <-->|Redis PubSub| Redis[(Redis 缓存/队列)]
        SyncCtrl <--> DB[(PostgreSQL 元数据)]
        AI[AiController] <-->|LangChain4j| LC[AI 编排服务]
        LC <-->|向量检索| Milvus[(Milvus 向量库)]
        LC <-->|MinIO SDK| MinIO[(MinIO 对象存储)]
    end

    subgraph 云端大模型 API
        LC <-->|HTTPS| CloudLLM[DeepSeek / SiliconFlow / OpenAI]
    end
```

---

## 2. PC 端页面清单 (StudyCore-PC)

PC 端定位为系统的**全能编排中枢与逻辑工厂**，支持除手写画布外的所有重型资产处理与排期副驾。

### 2.1 登录注册页 (Login)
* **对应组件**：[views/Login/index.vue](file:///d:/CodeBase/Active/StudyCore/StudyCore-PC/src/views/Login/index.vue)
* **前端功能**：
  * 提供极简奢华的登录/注册卡片式界面，支持表单字段验证。
  * 用户登录成功后，将 JWT 令牌写入 [useAuthStore.ts](file:///d:/CodeBase/Active/StudyCore/StudyCore-PC/src/store/useAuthStore.ts) 并进行路由重定向。
* **关联后端接口**：
  * 注册：`POST /api/auth/register`
  * 登录：`POST /api/auth/login` (获取双 Token)
  * 令牌刷新：`POST /api/auth/refresh` (由拦截器无感刷新)

### 2.2 仪表盘主页 (Dashboard)
* **对应组件**：[views/Dashboard/index.vue](file:///d:/CodeBase/Active/StudyCore/StudyCore-PC/src/views/Dashboard/index.vue)
* **前端功能**：
  * **左栏 (学科索引树)**：列出所有学科名称、图标、色彩主题及对应的知识块总数，支持单学科筛选与进入管理页。
  * **中栏 (近期知识流)**：按倒序滚动加载近期的“知识块”卡片，点击可打开弹窗阅读概念详情。
  * **右栏 (日历排期与待办)**：
    * 提供“日视图/周视图”切换，显示当前时间指针与已排日程。
    * 提供“待办清单”卡片，支持**拖拽操作**：
      * 将待办任务拖入日历空闲时间段完成排期。
      * 调整日历中任务的时段进行重新排期。
      * 将已排期任务拖回待办清单以取消排期。
* **关联后端接口**：
  * 获取全部知识块/任务：读取本地 SQLite。
  * 同步自愈：通过 WebSocket 触发 `useSyncStore.ts` 下的云端双向拉取/推送。

### 2.3 学科空间大厅 (SubjectHall)
* **对应组件**：[views/SubjectHall/index.vue](file:///d:/CodeBase/Active/StudyCore/StudyCore-PC/src/views/SubjectHall/index.vue)
* **前端功能**：
  * 网格化列出用户创建的所有学科卡片 (如“计算机网络”、“高等数学”)，展示每个学科内的材料总数及知识块总数。
  * 支持点击弹出卡片快速新建、修改学科的属性 (名称、描述、图标、代表色)。
  * 提供卡片悬浮操作按钮，支持删除学科空间 (联级删除关联的文件与元数据)。
* **关联后端接口**：
  * 增删改查学科信息：由本地 SQLite 处理并通过增量机制同步至服务端 `POST /api/sync/push`。

### 2.4 学科智能工作区 (SubjectWorkspace)
* **对应组件**：[views/SubjectWorkspace/index.vue](file:///d:/CodeBase/Active/StudyCore/StudyCore-PC/src/views/SubjectWorkspace/index.vue)
* **前端功能**：
  * **三栏自适应编排**：左栏控制材料/大纲，中栏进行 PDF 伴读或知识卡片格栅展示，右栏固定为智能 AI 对话助手。
  * **材料登记与大纲解析**：
    * 提供“登记本地材料”弹窗 (名称、本地路径、类型、大小)，一键登记到左侧材料库。
    * 若选择的材料尚未解析大纲，支持直接粘贴文本或使用 **AI 解析目录大纲**。
  * **AI 提炼与任务转化**：
    * 浏览章节时，点击 ✨ 按钮触发 **AI 核心概念提炼**，系统使用 SSE (Server-Sent Events) 流式请求后端，生成 Markdown 格式的概念卡片并自动填入“手动录入”表单，用户确认后一键存为“知识块”。
    * 点击 🎯 按钮，可将该章节一键转化为“待办任务块”放入排期池。
  * **PDF 伴读**：内置 [PdfViewer.vue](file:///d:/CodeBase/Active/StudyCore/StudyCore-PC/src/components/subject/PdfViewer.vue) 读取本地文件，并在状态栏显示阅读进度 (页码)。
  * **AI 伴读助手**：提供预设常见提问快捷键，支持自由提问，请求后端 `/api/ai/chat` 接口，结合当前打开的材料文档作为 RAG (检索增强生成) 的上下文进行流式回答。
* **关联后端接口**：
  * 目录解析：`GET /api/ai/chat` (传入 prompt 请求 AI 整理结构化大纲)
  * 流式对话/概念提炼：`GET /api/ai/chat` (SSE，提供 `subjectId` 与 `sourceFileName` 进行向量库多租户精准匹配检索)
  * 任务添加与卡片写入：写入 SQLite 后增量同步。

### 2.5 任务排期中心 (Timeline)
* **对应组件**：[views/Timeline/index.vue](file:///d:/CodeBase/Active/StudyCore/StudyCore-PC/src/views/Timeline/index.vue)
* **前端功能**：
  * **三列重型编排布局**：左栏显示本周每日排期负荷缩略图，中栏展示每日 24 小时时间流，右栏展示待安排任务列表。
  * **艾宾浩斯记忆曲线智能推荐**：
    * 页面加载时自动扫描本地知识块，检查其 `reviewAt` 遗忘复习日期。
    * 对过期的知识块，自动在待办任务池中生成一个“复习: [知识块标题]”的低脑力负荷任务，并将该卡片的 `reviewAt` 滚动推后 3 天，触发桌面通知提醒。
  * **双向关系穿透**：
    * 解析任务描述中附带的 `[KB_ID:xxxx]` 标签，显示“💡 关联知识点”徽章，点击可直接弹窗预览其 Markdown 内容，完成“任务 ⟷ 知识”的双向追溯。
  * **AI 智能排期建议**：
    * 分析今日任务的预计时间与脑力负荷。
    * 在头部气泡展示排期预警 (如“今日负荷过大，建议将低优先级延后”)。
    * 提供“自动延后减负”按钮，一键对今日过载任务重新规划。
* **关联后端接口**：
  * 智能排期建议：`POST /api/ai/schedule-suggest` (分析当天任务文本，返回评估结论)

### 2.6 资产管理中心 (Asset)
* **对应组件**：[views/Asset/index.vue](file:///d:/CodeBase/Active/StudyCore/StudyCore-PC/src/views/Asset/index.vue)
* **前端功能**：
  * **资产上传管线**：提供全屏拖拽/点击上传面板。
    1. 客户端先验证文件大小 (上限 50MB)。
    2. 请求后端获取 MinIO 预签名上传凭证。
    3. 前端使用原生 Axios 直传 MinIO (不占用 JVM 后端内存)，捕获上传进度条。
    4. 直传完成后，调用后端 `bind` 接口绑定资产元数据，并向 Redis Stream 推送解析任务。
  * **资产状态监控**：左侧树状结构展示资产库状态 (解析中/正常/失败)，接收 WebSocket 同步事件 `DOC_INGESTED` 后自动刷新并通知用户“已生成 X 个知识分子块”。
  * **多维度编排预览**：选中资产后，可在中栏查看自动摄取的**分子块列表** (支持就地二次编辑)、提取的**任务清单**、原始**结构化 Markdown**。
  * **Obsidian 式关系星图**：右栏搭载 [KnowledgeGraph.vue](file:///d:/CodeBase/Active/StudyCore/StudyCore-PC/src/components/subject/KnowledgeGraph.vue)，使用 Three.js 绘制 3D 拓扑节点图，展示知识块与学科、文件之间的分布式连线关系。
* **关联后端接口**：
  * 预签名申请：`GET /api/fs/presigned-url`
  * 资产绑定：`POST /api/assets/bind`
  * 状态查询：`GET /api/assets/{id}`
  * 知识块保存/删除：本地 SQLite CRUD + 增量同步。

### 2.7 个人中心与设置 (Profile)
* **对应组件**：[views/Profile/index.vue](file:///d:/CodeBase/Active/StudyCore/StudyCore-PC/src/views/Profile/index.vue)
* **前端功能**：
  * **学习数据透视**：展示连续学习天数、累计知识块/完成任务总数、本周专注时长图表、学科分布占比。
  * **应用首选项配置**：切换深色模式、紧凑布局模式、字号大小、多语言。
  * **数据备份与维护**：支持导出全量 JSON 备份，提供“手动同步”、“清除本地缓存”、“注销账户”等操作。
* **关联后端接口**：
  * 核心统计概览：`GET /api/stats/overview`
  * 周专注图表数据：`GET /api/stats/weekly`
  * 同步触发：触发 `useSyncStore.ts` 的 push/pull 周期。

---

## 3. 移动端与平板端页面清单 (StudyCore-Mobile)

移动端与平板端定位为系统的**知识猎人与多模态捕获哨兵**，深入适配摄像头与手写笔硬件特性。

### 3.1 登录页 (Login)
* **对应组件**：[pages/login/index.vue](file:///d:/CodeBase/Active/StudyCore/StudyCore-Mobile/src/pages/login/index.vue)
* **前端功能**：支持移动端布局的账号密码认证表单，登录成功后存储 Token 并跳转至 TabBar 首页。
* **关联后端接口**：`POST /api/auth/login` 与 `POST /api/auth/register`。

### 3.2 知识唤醒主页 (Index)
* **对应组件**：[pages/index/index.vue](file:///d:/CodeBase/Active/StudyCore/StudyCore-Mobile/src/pages/index/index.vue)
* **前端功能**：
  * 顶部显示日期水平滑动条，提供今日轻量化时间流，支持一键点击“完成”或“延后”日程。
  * 提供四个快捷卡片入口：**智能伴读**、**手写笔记**、**扫描文档** (调用 `uni.chooseImage` 相机拍摄)、**学习报告**。
  * **FAB 悬浮语音备忘按钮**：
    * 按下触发震动，提示“正在聆听”，录音完成后上传至后端大模型进行语音意图提取。
    * 后端解析为结构化 JSON (包含待办任务与一句话总结)，客户端展示弹窗提示“AI 自动提取了 X 个任务，是否排入日程？”，确认后在本地生成对应的知识卡片与待办任务。
* **关联后端接口**：
  * 语音/文本任务提取：`POST /api/ai/extract-tasks` (在 `aiClient.ts` 中调用)

### 3.3 状态同步时间线 (Timeline)
* **对应组件**：[pages/timeline/index.vue](file:///d:/CodeBase/Active/StudyCore/StudyCore-Mobile/src/pages/timeline/index.vue)
* **前端功能**：
  * 顶端包含快速模糊搜索框，支持在本地缓存数据库中实时检索知识卡片。
  * 分栏列出今日待同步的任务块列表与近期生成的知识块卡片，直观呈现离线堆积的变更数。
  * 平板端 (Tablet) 自动开启分屏：左侧显示数据统计与待排期，右侧显示完整的日历时间轴。
* **关联后端接口**：
  * 获取数据：查询本地数据库 (Tauri Fallback LocalStorage) 并等待 WebSocket `/ws/sync` 自愈。

### 3.4 资产编排页 (Asset)
* **对应组件**：[pages/asset/index.vue](file:///d:/CodeBase/Active/StudyCore/StudyCore-Mobile/src/pages/asset/index.vue)
* **前端功能**：
  * 提供拍照与文件选择入口，支持将手写草稿照片上传至后端。
  * 后端多模态视觉模型将手写杂乱文字和图表结构化整理，返回 Markdown，前端展示进度条并在完成后追加到编排历史列表。
* **关联后端接口**：
  * 手写识别转换：`POST /api/ai/convert-handwriting`

### 3.5 智能伴读 (Pdf)
* **对应组件**：[pages/pdf/index.vue](file:///d:/CodeBase/Active/StudyCore/StudyCore-Mobile/src/pages/pdf/index.vue)
* **前端功能**：
  * 渲染课件 PDF (横屏适配良好)，当用户手指/手写笔点选、圈选高亮文本时，侧边浮现 **AI伴读气泡按钮**。
  * 点击气泡唤出右侧 AI Notebook 面板，将选中的文本公式送入大模型，进行详细释义与公式 LaTeX 代码推导，支持展示引用文献来源 (Citation)。
  * 面板支持收起，并提供预设的“音频概览 (5分钟对谈生成)”快捷音频收听入口。
* **关联后端接口**：
  * RAG 伴读问答：`POST /api/ai/chat` (获取圈选内容相关的解释与多模态解析)

### 3.6 手写笔记画布 (Handwriting)
* **对应组件**：[pages/handwriting/index.vue](file:///d:/CodeBase/Active/StudyCore/StudyCore-Mobile/src/pages/handwriting/index.vue)
* **前端功能**：
  * 提供无界草稿纸画布，捕获触控轨迹绘制线条，支持钢笔、铅笔、橡皮擦、套索圈选。
  * 使用**套索工具 (Lasso)** 圈选推导的公式或架构图后，在圈选位置弹出快捷菜单：“提取为知识”或“转换为文本”。
  * 确认后展示“AI Vision”轨道环绕加载动画，将套索截屏上传至后端，结构化提取为 LaTeX/Markdown 代码块，弹窗询问是否正式写入知识库。
* **关联后端接口**：
  * 多模态 OCR 视觉解析：`POST /api/ai/convert-handwriting`

### 3.7 个人空间 (Profile)
* **对应组件**：[pages/profile/index.vue](file:///d:/CodeBase/Active/StudyCore/StudyCore-Mobile/src/pages/profile/index.vue)
* **前端功能**：
  * 统计面板显示知识库卡片数量。
  * 菜单列表包含“手动触发同步” (调用 Pinia 的 syncStore 立即推送堆积的 Mutation 变更)。
  * 提供“AI 引擎设置”选项，允许用户手动填入备用的个人 API Key 存储在本地以绕过默认后端限流。
* **关联后端接口**：
  * 增量同步：`POST /api/sync/push` 与 `GET /api/sync/pull`

---

## 4. 后端 API 接口目录 (StudyCore-Server)

所有后端接口控制器定义于 [StudyCore-Server/src/main/java/com/studycore/server/controller/](file:///d:/CodeBase/Active/StudyCore/StudyCore-Server/src/main/java/com/studycore/server/controller/) 目录下。

### 4.1 认证与令牌 (AuthController)
* **API类**：[AuthController.java](file:///d:/CodeBase/Active/StudyCore/StudyCore-Server/src/main/java/com/studycore/server/controller/AuthController.java)
* **端点定义**：

| 请求方法 | 请求路径 | 请求参数 (JSON Body 或 Query) | 返回数据 (Result 包装) | 接口描述 |
| :--- | :--- | :--- | :--- | :--- |
| **POST** | `/api/auth/register` | `{ "username": "xxx", "password": "yyy" }` | `Boolean` | 用户注册 |
| **POST** | `/api/auth/login` | `{ "username": "xxx", "password": "yyy" }` | `{ "accessToken": "...", "refreshToken": "..." }` | 用户登录 |
| **POST** | `/api/auth/refresh` | `{ "refreshToken": "..." }` | `{ "accessToken": "...", "refreshToken": "..." }` | 刷新 Access Token |

---

### 4.2 AI 能力层 (AiController)
* **API类**：[AiController.java](file:///d:/CodeBase/Active/StudyCore/StudyCore-Server/src/main/java/com/studycore/server/controller/AiController.java)
* **端点定义**：

| 请求方法 | 请求路径 | 请求参数 | 返回数据 (Result 包装) | 接口描述 |
| :--- | :--- | :--- | :--- | :--- |
| **POST** | `/api/ai/chat` | `{ "systemPrompt": "...", "message": "...", "requireJson": false, "subjectId": "...", "sourceFileName": "..." }` | `String` (大模型完整文本回复) | 同步阻塞式 RAG 知识问答 |
| **GET** | `/api/ai/chat` | **Query Params**:<br>`message` (必须)<br>`subjectId` (可选)<br>`sourceFileName` (可选) | **SSE 流 (text/event-stream)**<br>Token 字符流 + 结束标识 `event: complete` | SSE 流式 RAG 问答与提炼 |
| **POST** | `/api/ai/ingest` | `{ "content": "长文本内容...", "source": "来源名", "subject": "学科分类" }` | `{ "llmExtraction": "...", "ingestedBlockIds": [...], "totalChunks": 3 }` | 手动大段长文本的切片、Embedding 入库与结构化提取管道 |
| **POST** | `/api/ai/ingest/file` | **Multipart Form**:<br>`file` (字节流文件)<br>`subject` (可选，默认"文档导入") | `{ "fileName": "...", "ingestedBlockIds": [...], "totalChunks": 12 }` | 文件上传直接同步解析管道 |
| **POST** | `/api/ai/extract-tasks` | `{ "text": "备忘录文本内容..." }` | `String` (包含推导的 JSON 格式任务列表) | 从口语化备忘录中提取待办任务块与摘要 |
| **POST** | `/api/ai/convert-handwriting` | `{ "text": "扫描出来的乱序 OCR 文本..." }` | `String` (排版规范的 Markdown 或 LaTeX 文本) | 手写文字/公式智能排版与结构化重组 |
| **POST** | `/api/ai/schedule-suggest` | `{ "text": "今日待排期任务与负荷明细..." }` | `String` (排期副驾的诊断分析意见与建议) | 脑力负荷测算与排期自动调整建议 |

---

### 4.3 资产与文件存储 (AssetController & FileStorageController)
* **API类**：[AssetController.java](file:///d:/CodeBase/Active/StudyCore/StudyCore-Server/src/main/java/com/studycore/server/controller/AssetController.java) & [FileStorageController.java](file:///d:/CodeBase/Active/StudyCore/StudyCore-Server/src/main/java/com/studycore/server/controller/FileStorageController.java)
* **端点定义**：

| 请求方法 | 请求路径 | 请求参数 | 返回数据 (Result 包装) | 接口描述 |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/fs/presigned-url` | **Query Params**:<br>`fileName` (必须)<br>`contentType` (可选) | `{ "presignedUrl": "PUT链接", "objectName": "路径", "bucket": "...", "expiresInMinutes": 15 }` | 获取 15 分钟失效的 MinIO 直传预签名上传 URL |
| **POST** | `/api/assets/bind` | `{ "objectName": "存储键", "fileName": "文件名", "fileSize": 12345, "contentType": "...", "subject": "学科" }` | `Asset` 实体 (包含 ID、状态为 `PROCESSING`) | 将上传完的文件绑定为用户资产，并投递到后台异步戏水切片任务 |
| **GET** | `/api/assets/{id}` | **Path Variable**:<br>`id` (资产ID) | `Asset` 实体 (可用于轮询查看是否完毕) | 获取资产入库状态与块生成指标 |

---

### 4.4 数据双向同步 (SyncController & WebSocket)
* **API类**：[SyncController.java](file:///d:/CodeBase/Active/StudyCore/StudyCore-Server/src/main/java/com/studycore/server/controller/SyncController.java) & [SyncWebSocketHandler.java](file:///d:/CodeBase/Active/StudyCore/StudyCore-Server/src/main/java/com/studycore/server/websocket/SyncWebSocketHandler.java)
* **端点定义**：

| 请求方法 | 请求路径 | 请求参数 | 返回数据 | 接口描述 |
| :--- | :--- | :--- | :--- | :--- |
| **POST** | `/api/sync/push` | `List<MutationLog>` (增量变更日志列表) | `Result<List<Long>>` (成功落库的本地变更 ID 列表) | 上行数据推送：客户端推送本地离线生成的变更事件 |
| **GET** | `/api/sync/pull` | **Query Params**:<br>`afterId` (游标ID，默认0) | `Result<SyncPullResponse>` (包含 `truncated` 状态及增量 `MutationLog` 或全量冷启动覆盖数据) | 下行数据拉取：客户端增量同步或重试补偿冷启动数据 |
| **WS** | `/ws/sync` | **Headers/Query**:<br>`token` (JWT校验) | **长连接广播**<br>PING/PONG 心跳格式<br>SyncEvent 同步事件 | 双向长连接：实时监听其他终端广播的同步动作 |

#### WebSocket 通信包规范
1. **心跳 PING 包 (客户端发送)**:
   ```json
   { "type": "PING", "token": "JWT_ACCESS_TOKEN" }
   ```
2. **心跳 PONG 包 (服务端响应)**:
   ```json
   { "type": "PONG", "timestamp": 1717387291000 }
   ```
3. **数据变更广播事件 SyncEvent (服务端推送)**:
   ```json
   {
     "type": "block_created", 
     "entity": "blocks", 
     "entityId": "uuid-xxx-yyy", 
     "data": "{\"id\":\"...\",\"title\":\"...\",\"subject\":\"...\"}", 
     "timestamp": 1717387291200
   }
   ```

---

### 4.5 仪表盘统计 (StatsController)
* **API类**：[StatsController.java](file:///d:/CodeBase/Active/StudyCore/StudyCore-Server/src/main/java/com/studycore/server/controller/StatsController.java)
* **端点定义**：

| 请求方法 | 请求路径 | 请求参数 | 返回数据 (Result 包装) | 接口描述 |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/stats/overview` | 无 | `{ "continuousStudyDays": 5, "totalBlocks": 120, "totalTasks": 45, "totalFocusMinutes": 2700, "weeklyNewBlocks": 12, "subjectDistribution": [{ "subject": "数学", "pct": 40 }] }` | 统计概览：获取用户核心指标与学习数据分布 |
| **GET** | `/api/stats/weekly` | 无 | `{ "weekBars": [{ "day": "Mon", "focusMinutes": 60 }] }` | 柱状图数据：获取本周每日专注分钟数列表 |

---

## 5. 本地化存储与事件溯源同步机制

客户端使用增量日志方式离线暂存数据，再利用同步接口向云端对齐。

### 5.1 核心数据库表结构 (SQLite)
客户端主要维护以下几张表以支撑离线运行：

```sql
-- 1. 知识块表
CREATE TABLE IF NOT EXISTS knowledge_blocks (
  id TEXT PRIMARY KEY,               -- 前端生成的 UUID
  subject TEXT,                      -- 分类名称
  title TEXT,                        -- 知识卡标题
  preview TEXT,                      -- 正文 (Markdown 文本)
  time TEXT,                         -- 记录时间
  source TEXT,                       -- 来源标识
  color TEXT,                        -- 标签色彩
  sync_status TEXT DEFAULT 'synced', -- 同步状态: synced, pending_create, pending_update, pending_delete
  is_deleted INTEGER DEFAULT 0,      -- 逻辑删除标志
  sync_version INTEGER DEFAULT 0,    -- 乐观锁版本号 (来自云端)
  subject_id TEXT,                   -- 关联学科 ID
  source_file_id TEXT,               -- 关联文件材料 ID
  tags TEXT,                         -- JSONString 标签数组
  difficulty TEXT,                   -- 难易度
  mastery INTEGER DEFAULT 0,         -- 掌握程度 (0-100)
  review_at TEXT,                    -- 艾宾浩斯复习到期日期
  related_block_ids TEXT             -- 双向关联卡片 ID 数组
);

-- 2. 任务块表
CREATE TABLE IF NOT EXISTS task_blocks (
  id TEXT PRIMARY KEY,
  name TEXT,
  subject TEXT,
  desc TEXT,
  color TEXT,
  duration INTEGER,                  -- 预计专注分钟数
  load TEXT,                         -- 脑力负荷 (low, medium, high)
  loadText TEXT,                     -- 负荷图标 (1.0 🧠)
  status TEXT,                       -- 状态 (pending, scheduled, completed)
  startTime TEXT,                    -- 安排时间 (如 'Mon 09:00')
  sync_status TEXT DEFAULT 'synced',
  is_deleted INTEGER DEFAULT 0,
  sync_version INTEGER DEFAULT 0,
  position TEXT DEFAULT '0',          -- LexoRank 排序算法权重
  subject_id TEXT
);

-- 3. 本地增量操作变更日志表
CREATE TABLE IF NOT EXISTS local_mutations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT,                    -- 终端唯一标识 (如 'pc_x8f1e')
  entity_type TEXT,                  -- 实体类型 ('block' / 'task')
  entity_id TEXT,                    -- 实体 UUID
  action TEXT,                       -- 操作行为 ('create' / 'update' / 'delete')
  payload TEXT,                      -- 整个实体的最新 JSON 串
  created_at INTEGER,                -- 时间戳
  sync_status TEXT DEFAULT 'pending' -- 同步状态
);
```

### 5.2 冲突化解与乐观同步算法
当客户端检测到网络上线或从 WebSocket 接收到同步事件广播时，按以下逻辑运作：

1. **推送上行 (PUSH)**：
   * 读取本地 `local_mutations` 中 `sync_status = 'pending'` 的日志。
   * 序列化打包发送至 `POST /api/sync/push`。
   * 服务端逐条解析并写入 `MutationLog` (自增序列号，分配 `id`)。如果服务端行版本大于推送的版本，依 **Last-Write-Wins** 策略合并。
   * 客户端收到成功列表后，将本地相应 `local_mutations` 置为 `synced` 或清空。
2. **拉取下行 (PULL)**：
   * 获取本地记录的 `last_mutation_id`，向 `GET /api/sync/pull?afterId=...` 发起增量拉取。
   * **冷启动检测 (Sliding Window Truncation)**：若本地游标为 0，或服务端最老的变更 ID 大于客户端游标，说明存在数据缺失 gap，拉取回复将标志 `truncated = true`，并附带云端当前所有活跃实体的全量快照，客户端执行本地覆盖重构。
   * **增量重放 (Incremental Replay)**：若 `truncated = false`，客户端顺次重放拉取回的远程 `MutationLog`：
     * 若日志的 `clientId` 等于自身标识，直接忽略 (本地已经做过乐观修改)。
     * 比较远程的版本戳与本地，若远程版本新，则写入本地实体表，覆盖本地缓存，并将本地更新标记清空为 `synced`。
     * 本地更新 metadata 表中的 `last_mutation_id` 游标。

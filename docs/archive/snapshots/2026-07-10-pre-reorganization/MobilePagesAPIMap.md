> [!WARNING]
> 本文档为历史归档，仅用于追溯需求、设计与项目演进。它不是 Auralis 当前实现、状态、接口或任务的依据。开发者与 AI Agent 禁止依据本文恢复旧实现、判断当前完成度或创建当前任务；请从 `docs/README.md` 进入现行文档体系。

# 手机端各页面 API 接口映射与数据结构文档

本文档详细映射了 `Auralis-Mobile` 手机端各个页面所需的后端 API 接口、参数结构、响应负载以及本地存储逻辑，为后续进行移动端与平板端代码解耦提供重要参考。

---

## 1. 全局网络与鉴权约定

- **接口基准路径 (Base URL)**: 
  - H5 端: `http://127.0.0.1:8080`
  - 移动设备端 (非 H5): `http://10.0.2.2:8080` (模拟器默认地址，真机调试需更换为局域网 IP)
- **请求头鉴权**:
  - 除 `/api/auth/**` 接口外，所有请求需携带：`Authorization: Bearer <accessToken>`
- **Token 刷新机制**:
  - 请求拦截器检测到 `401 Unauthorized` 响应时，使用本地存储的 `refreshToken` 发起 `/api/auth/refresh` 自动刷新，无感替换 Token 并重试失败请求。

---

## 2. 页面接口详细映射

### 2.1 登录/注册页 (`pages/mobile/login/index`)

- **功能职责**: 用户认证与本地登录状态初始化。
- **关联 API 接口**:
  1. **用户注册**
     - **Method / URL**: `POST /api/auth/register`
     - **Request Body**:
       ```json
       {
         "username": "UserTest",
         "password": "Password123"
       }
       ```
     - **Response Payload**:
       ```json
       {
         "code": 200,
         "message": "success",
         "data": true
       }
       ```
  2. **用户登录**
     - **Method / URL**: `POST /api/auth/login`
     - **Request Body**:
       ```json
       {
         "username": "UserTest",
         "password": "Password123"
       }
       ```
     - **Response Payload**:
       ```json
       {
         "code": 200,
         "message": "success",
         "data": {
           "accessToken": "ey...",
           "refreshToken": "ey..."
         }
       }
       ```
- **本地存储与 Store 流向**:
  - 写入 `uni.setStorageSync('token', accessToken)`
  - 写入 `uni.setStorageSync('refreshToken', refreshToken)`
  - 写入 `uni.setStorageSync('username', username)`
  - 初始化 Pinia 中的 `useAuthStore`。
  - 手机端重定向至 `/pages/mobile/home/index`，平板端重定向至 `/pages/tablet/dashboard/index`。

---

### 2.2 首页/日程页 (`pages/mobile/home/index`)

- **功能职责**: 呈现今日学习状况、展示每日计划时间轴（TimeSlots）与未分配的待办任务（Pending Tasks），并支持手势操作（滑动完成、撤销分配）。
- **数据流向机制**:
  - 该页面不直接与服务器拉取单条任务，而是通过 **Pinia 离线优先同步机制** (`useTaskStore` -> `useSyncStore`) 触发全量双向增量同步，再通过 SQLite 本地库加载日程。
- **相关同步 API (由 Sync Engine 统一调度)**:
  1. **增量拉取同步记录**
     - **Method / URL**: `GET /api/sync/pull`
     - **Query Parameters**: `?afterId={lastMutationId}`
     - **Response Payload (`Result<SyncPullResponse>`)**:
       ```json
       {
         "code": 200,
         "data": {
           "mutations": [],
           "truncated": false,
           "blocks": [],
           "tasks": [
             {
               "id": "uuid-v7-string",
               "name": "高等数学第三章复习",
               "subject": "数学",
               "desc": "课后习题精选",
               "color": "#7D9372",
               "duration": 2,
               "load": "high",
               "loadText": "高负荷",
               "status": "scheduled",
               "startTime": "09:00",
               "position": "v01"
             }
           ],
           "lastMutationId": 142
         }
       }
       ```
  2. **推送本地离线修改**
     - **Method / URL**: `POST /api/sync/push`
     - **Request Body**: `List<Mutation>` (客户端记录的所有新建、修改或删除操作日志)
       ```json
       [
         {
           "clientId": "uuid-string",
           "entityType": "task",
           "entityId": "uuid-v7-string",
           "action": "update",
           "payload": {
             "id": "uuid-v7-string",
             "status": "completed"
           },
           "createdAt": 1719876543000
         }
       ]
       ```
     - **Response Payload**: `Result<List<Long>>` (返回同步成功的本地 mutation ID 列表)
- **本地存储**:
  - 本地 SQLite 的 `tasks` 表，用于离线展示和变更追踪。

---

### 2.3 知识复习页 (`pages/mobile/review/index`)

- **功能职责**: 抽认卡（Flashcard）滑动复习，更新知识掌握程度（Mastery）与难度。
- **数据流向机制**:
  - 同样通过离线优先机制拉取、修改和推送。
- **关联数据结构**:
  - 本地修改通过 `recordMutation('block', id, 'update', updatedBlock)` 生成变更日志，并在断网恢复或提交时推送至服务器。
  - 知识块对象结构 (Payload):
    ```json
    {
      "id": "uuid-v7-string",
      "subject": "专业课",
      "title": "计算机组成原理",
      "preview": "冯诺依曼结构的核心特点包括...",
      "time": "2026-07-04T14:50:00Z",
      "source": "课堂手写 OCR",
      "color": "#7D9372",
      "difficulty": "medium",
      "mastery": 60,
      "reviewAt": "2026-07-05T08:00:00Z"
    }
    ```

---

### 2.4 专注计时页 (`pages/mobile/pomodoro/index`)

- **功能职责**: 番茄钟倒计时专注，支持挂靠关联任务并记录完成的番茄钟数量。
- **本地接口与配置**:
  - 专注时长从 `useSettingsStore` 中读取配置：
    - `pomodoroFocusMinutes` (默认 25 分钟)
    - `pomodoroBreakMinutes` (默认 5 分钟)
- **关联数据操作**:
  - 完成一个番茄钟后，触发 `taskStore.incrementPomodoro()`。
- **本地存储**:
  - `uni.setStorageSync('pomodoro_counts', JSON.stringify({ '2026-07-04': 3 }))`

---

### 2.5 AI 助手页 (`pages/mobile/ai-search/index`)

- **功能职责**: 多模型路由问答探索、流式 SSE 回复、一键提炼并存为本地知识块。
- **关联 API 接口**:
  1. **AI 文本流式问答 (SSE - Server Sent Events)**
     - **Method / URL**: `GET /api/ai/chat` (或 H5 端使用带 enableChunked 的 POST 请求)
     - **Query/Body Parameters**:
       - `message`: 用户提问的文本
       - `history`: 数组形式的对话历史上下文
       - `systemPrompt`: AI 系统预置指令 (由模式选择决定)
     - **Response Payload**: 持续下发的字符块，直至下发 `[DONE]` 标识。
  2. **AI 单次非流式响应**
     - **Method / URL**: `POST /api/ai/chat`
     - **Request Body**:
       ```json
       {
         "message": "提问内容",
         "systemPrompt": "学霸模式提示词...",
         "requireJson": false
       }
       ```
     - **Response Payload**:
       ```json
       {
         "code": 200,
         "data": "AI 完整答复文本"
       }
       ```
  3. **存为知识块**
     - 调用 `blockStore.addBlock()`，将生成的精彩答复包装为 `KnowledgeBlock`，自动写入本地 SQLite 并进入待推送同步队列。

---

### 2.6 数据统计页 (`pages/mobile/stats/index`)

- **功能职责**: 显示整体学习数据分析图表，包含当前月的学习活跃度热力图（Heatmap）、每日专注时长折线图与学科分布饼图。
- **关联 API 接口**:
  1. **统计概览**
     - **Method / URL**: `GET /api/stats/overview`
     - **Response Payload**:
       ```json
       {
         "code": 200,
         "data": {
           "totalStudyTime": 28800, // 累计学习秒数
           "completedTasksCount": 12,
           "pomodoroCount": 9
         }
       }
       ```
  2. **周/日分布详情**
     - **Method / URL**: `GET /api/stats/weekly`
     - **Response Payload**:
       ```json
       {
         "code": 200,
         "data": {
           "studyTimeDaily": {
             "2026-07-01": 7200,
             "2026-07-02": 10800,
             "2026-07-04": 10800
           },
           "subjectDistribution": {
             "高等数学": 40,
             "英语": 20,
             "专业课": 40
           }
         }
       }
       ```

---

### 2.7 资料与资产编排页 (`pages/mobile/asset/index`)

- **功能职责**: 上传教材、笔记及 PPT 课件，调用 AI 解析目录并提取结构化知识块。
- **关联 API 接口**:
  1. **获取 MinIO 预签名上传直传链接**
     - **Method / URL**: `GET /api/fs/presigned-url`
     - **Query Parameters**:
       - `fileName`: `lecture_notes.pdf`
       - `contentType`: `application/pdf`
     - **Response Payload**:
       ```json
       {
         "code": 200,
         "data": {
           "presignedUrl": "https://minio-server.example/bucket/notes/...",
           "objectName": "notes/user123-lecture_notes.pdf",
           "bucket": "assets",
           "maxFileSizeMb": 50,
           "expiresInMinutes": 15
         }
       }
       ```
  2. **绑定已上传的云端资料**
     - **Method / URL**: `POST /api/assets/bind`
     - **Request Body**:
       ```json
       {
         "objectName": "notes/user123-lecture_notes.pdf",
         "fileName": "lecture_notes.pdf",
         "fileSize": 124500,
         "contentType": "application/pdf",
         "subject": "计算机网络"
       }
       ```
     - **Response Payload**:
       ```json
       {
         "code": 200,
         "data": {
           "id": "asset-uuid",
           "name": "lecture_notes.pdf",
           "filePath": "notes/user123-lecture_notes.pdf"
         }
       }
       ```
  3. **AI 智能资料消化提取 (Ingestion)**
     - **Method / URL**: `POST /api/ai/ingest`
     - **Request Body**:
       ```json
       {
         "content": "资料提取出的纯文本内容...",
         "source": "lecture_notes.pdf",
         "subject": "计算机网络"
       }
       ```
     - **Response Payload**:
       ```json
       {
         "code": 200,
         "data": {
           "llmExtraction": "提取纲要总结",
           "ingestedBlockIds": ["block-id-1", "block-id-2"],
           "totalChunks": 8
         }
       }
       ```

---

### 2.8 状态同步与联调监控页 (`pages/mobile/timeline/index`)

- **功能职责**: 离线修改队列与同步日志查看，并作为 WebSocket 通道承载体。
- **关联 WebSocket 通道**:
  - **地址 (URL)**: `ws://localhost:8080/ws/sync?token=<accessToken>`
  - **心跳机制**: 客户端每 30 秒发送一条 Ping 包保持存活：
    ```json
    { "type": "PING", "token": "Bearer ey..." }
    ```
  - **事件下发**: 接收 Redis 频道广播下发的同步自愈信号：
    ```json
    {
      "type": "block_created",
      "entity": "blocks",
      "entityId": "new-block-uuid-v7",
      "data": "{}",
      "timestamp": 1719876543000
    }
    ```
    收到任何更新通知后，触发本地 `triggerSync()` 自动对齐服务端最新状态。

# Spring Boot 后端模块

更新时间：2026-08-12

文档状态：旧 Server 代码确认；绿地重写阶段 0 契约已设计，骨架尚未替换

权威范围：Auralis-Server 当前实现、绿地目标模块边界、运行配置、验证命令和阶段状态。

## 当前旧 Server 事实

旧 Server 位于 Auralis-Server，基础包为 com.auralis.server，技术栈为 Spring Boot 3.2.5、Java 21、MyBatis Plus、PostgreSQL、Redis、JJWT、LangChain4j、Milvus、Apache Tika、MinIO、Caffeine 和 WebSocket。

当前旧包结构包含 common、config、controller、dto、entity、mapper、service 和 websocket。旧 Controller 包含 Auth、KnowledgeBlock、TaskBlock、BlockRelation、Sync、FileStorage、Asset、AI 和 Stats。旧配置仍存在程序化 DDL、Redis、Milvus、旧 LangChain4j 配置和开发默认值。

这些内容只用于替换前盘点；阶段 0 不从旧代码复制实现，也不承诺旧 API、Result、WebSocket 或数据库行为兼容。

## 绿地目标模块

新 Server 基础包固定为 com.auralis.app，使用模块化单体：

| 模块 | 责任 | 阶段 0 状态 |
| --- | --- | --- |
| identity | User、Password、JWT、RefreshSession、Device | 仅边界 |
| subject | Subject 和默认未分类学科 | 仅边界 |
| source | Source、Asset、MinIO、解析任务 | 仅边界 |
| knowledge | KnowledgeBlock | 仅边界 |
| task | Task | 仅边界 |
| relation | 通用跨对象关系 | 仅边界 |
| review | ReviewState、ReviewEvent、FSRS | 仅边界 |
| sync | Device、mutation、change log、snapshot、墓碑 | 仅边界 |
| ai | 模型配置、BYOK、Conversation、RAG | 仅边界 |
| stats | 强类型统计读取模型 | 仅边界 |
| realtime | WebSocket ticket 和用户级事件 | 仅边界 |
| shared | 错误模型、时钟、ID、分页、最小公共设施 | 配置/错误/OpenAPI 基础 |

阶段 0 使用 Spring Modulith 验证模块边界，不创建业务 Entity、Repository 或 Controller。业务模块只能通过模块根公开 API、显式 DTO 或领域事件协作；实现类、Entity 和 Repository 后续放在内部包。

## 阶段 0 实际 HTTP 表面

阶段 0 不实现业务 Controller。目标可访问路径为：

- /actuator/health
- /actuator/health/liveness
- /actuator/health/readiness
- /v3/api-docs
- /swagger-ui/index.html

业务目标路由、Problem Details 字段和版本/cursor 规则以 docs/contracts/API.md 为准；数据库目标以 docs/contracts/Database.md 为准；对象差异以 docs/contracts/ObjectModelMatrix.md 为准。

## 目标技术基线

- Java 21。
- Spring Boot 4.1。
- Spring Modulith 2.1。
- Maven Wrapper + Maven。
- Spring MVC、Bean Validation、Actuator、springdoc OpenAPI。
- 后续持久化使用 Spring Data JPA + Flyway。
- 后续数据库使用 PostgreSQL 17 + pgvector。
- 后续对象存储使用 MinIO。
- 新工程移除 MyBatis Plus、运行时 DDL、Redis、Milvus、etcd、旧 JJWT 配置、统一 Result 和 encryptedPayload。

## 配置与安全边界

阶段 0 只绑定无秘密的环境、公开地址和上传大小配置。提交文件不得包含真实密码、JWT secret、BYOK key、AI key 或 refresh token。

后续生产配置必须从环境变量读取数据库、MinIO、JWT、BYOK、DeepSeek、SiliconFlow 和 CORS 值；生产 profile 对缺失的关键配置执行 fail-fast。所有业务 Repository 必须在查询中带当前 userId；日志过滤 Authorization、Cookie、refresh token、BYOK key、完整 prompt 和模型回复。

## 验证边界

阶段 0 必须有：

- Maven Wrapper 完整构建和真实测试。
- Spring context test。
- Spring Modulith ApplicationModules.verify。
- Problem Details 和 traceId MockMvc 测试。
- 健康检查和 OpenAPI smoke test。
- 旧包、旧依赖和生成目录静态检查。

阶段 0 不证明：

- Flyway 数据库迁移。
- PostgreSQL/pgvector/MinIO 容器联调。
- Auth、核心对象、Sync、Review、Stats、AI/RAG 或 WebSocket 业务可用。
- PC、Mobile、Tablet 与新契约联调。
- GUI、真机、外部服务或产品验收。

## 构建命令

阶段 0 新工程使用：

    cd Auralis-Server
    .\mvnw.cmd -B -ntp clean test

旧 Server 的历史 mvn test 结果不作为新 Server 证据。

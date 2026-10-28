# Auralis 部署指南

### 2026-10-27 香港23:05 重试候选已部署

按用户授权，以现有基础Compose及overview-trace overlay构建并recreate backend/frontend，均exit0。启动时Flyway验证41个迁移，数据库已为V41，本次无需重复执行迁移。backend healthy、readiness HTTP200，frontend HTTP200；db/MinIO容器ID及挂载前后相同。backend镜像abe74be55083…，frontend2321333dfca5…。未清缓存、未调用真实模型，重试业务效果待用户使用验收。日志：D:/Temp/auralis-overview-retry-deploy-20261027/。

### 2026-10-26 香港22:42 动态容量本机部署完成

用户已明确授权本次部署。实际执行 `docker compose --env-file .env -f docker-compose.yml -f docker-compose.overview-trace.yml build --progress plain backend frontend` 与同配置 `up -d --no-deps --force-recreate backend frontend`，均exit0。backend镜像 `sha256:6256eee92138f0cf197733a4a871266b78315b8dbab5fa68a54b2f0e687044aa`，frontend `sha256:28f9ff68c11547a9228baaa193ea7f5da500102a573542afd090915fbeb71c8c`。Docker引擎启动后仅恢复原db/MinIO，未recreate其容器或卷。旧两应用镜像已加rollback-dynamic-capacity-20261026标签。

部署前pg_dump完整备份V39数据库并导出目标缓存，随后按用户选择清理六条FAILED的私有生成缓存/父行；SERIALIZABLE事务内检查状态/费用/关联及保留行hash，COMMIT成功。V40在新backend启动时应用。readiness、前端页面和entry bundle均HTTP200，运行JAR六关键class与候选一致；26项MAX全0，calls0，财务taskToken524288保持。22SUCCESS/22正式结果/25receipts/675账本及原资料等12组hash前后相同。部署后无新派发，不等于真实Provider或GUI验收。

命令、退出码、镜像/卷身份、全库及定向备份hash、清理SQL和最终验证在D:/Temp/auralis-overview-deploy-20261026/。备份已生成并校验hash，未执行恢复演练。以下候选说明保留配置设计和部署前状态。

### 2026-10-26 Overview 动态容量配置（候选未部署）

26 项 `AURALIS_AI_OVERVIEW_MAX_*` 已由主 Compose 透传，完整清单见根 `.env.example`。0 表示不加静态帽，正数额外限幅；模型能力、实际请求输出预留及统一额度继续约束派发。Overview calls 默认 0，财务额度保持。单次响应超时仍默认 120000ms、最低 60000ms，已移除旧最大 120000ms 校验；任务期限默认值和 0 语义保持。新源码需重新构建后才生效，仅编辑 `.env` 不会改变旧镜像。

精确官方 profile 可直接使用；其它模型需配置完整能力身份。直接 Java/backend 进程可用根 `.env.example` 所示五个 `AURALIS_AI_OVERVIEWMODELCAPACITIES_0_*` 环境变量。Compose 用户可在专用 override 文件中显式透传以下字段，再将该 override 加入自己的构建/启动命令；不向默认空列表注入空 slot：

```yaml
services:
  backend:
    environment:
      AURALIS_AI_OVERVIEWMODELCAPACITIES_0_PROVIDER: ${AURALIS_AI_OVERVIEWMODELCAPACITIES_0_PROVIDER:?set provider}
      AURALIS_AI_OVERVIEWMODELCAPACITIES_0_ENDPOINT: ${AURALIS_AI_OVERVIEWMODELCAPACITIES_0_ENDPOINT:?set exact endpoint}
      AURALIS_AI_OVERVIEWMODELCAPACITIES_0_MODEL: ${AURALIS_AI_OVERVIEWMODELCAPACITIES_0_MODEL:?set exact model}
      AURALIS_AI_OVERVIEWMODELCAPACITIES_0_CONTEXTWINDOWTOKENS: ${AURALIS_AI_OVERVIEWMODELCAPACITIES_0_CONTEXTWINDOWTOKENS:?set context window}
      AURALIS_AI_OVERVIEWMODELCAPACITIES_0_MAXOUTPUTTOKENS: ${AURALIS_AI_OVERVIEWMODELCAPACITIES_0_MAXOUTPUTTOKENS:?set max output}
```

Provider 取 DEEPSEEK、OPENAI_COMPATIBLE 或 SILICONFLOW 的精确名称，endpoint/model 精确匹配；显式配置优先于内置能力，未知能力拒绝。能力配置为运营声明，不能视为实测 tokenizer 校准。package、Compose config、OpenAPI/SDK、PC 类型与接收检查已完成；唯一 full 失败及定向闭合情况见[本轮计划](../plans/2026-10-26-overview-dynamic-capacity-and-simplification.md)。V40 将在后续新后端启动时迁移，当前业务库未应用；本轮未部署。

### 2026-10-24 Overview 直接请求整任务期限配置（实现候选；未部署）

`AURALIS_AI_OVERVIEW_TASK_TIMEOUT_MILLIS=0` 关闭 direct JSON/SSE 请求的整任务期限，单次 Provider response timeout 不变；Compose 已透传该变量。缺省仍 240000ms，后台持久 jobs 在 Worker claim 时仍使用 240000ms durable deadline。配置源码需先构建新 backend 镜像并由用户决定是否 recreate；仅改 `.env` 不会加载新代码。本轮未部署。

更新时间：2026-10-24
文档状态：现行，生产方案待加固
权威范围：本地准备、各应用构建、Compose 部署、配置、冒烟、回滚与发布门禁
事实来源：三个项目的构建清单、Server profiles、`docker-compose.yml` 与基础设施模块文档

### 2026-10-24 AI Provider 思考开关（源码与本机 `.env` 已更新；未部署）

`AURALIS_AI_THINKING_ENABLED=false` 是新的默认值，Compose 透传至 backend。DeepSeek 与精确 `api.xiaomimimo.com` MiMo completion/stream 请求会显式发送 enabled/disabled；其它 OpenAI-compatible host 不发送该字段。应用新值时需要用新源码 build backend 镜像，再 recreate backend；单独 recreate 旧镜像不会加载此代码。本机 `.env` 已写入 `false`，本轮没有部署、调用真实 Provider 或读取/变更其它凭据。

### 2026-10-24 Overview 输入估算本机部署

仅使用 `docker-compose.yml` 与 `docker-compose.overview-trace.yml` 构建并 recreate backend；两条命令退出 0，镜像 `sha256:72f6a41df02f8497fe32d2d0c3cbb18580ed2671b1c233ec9b41a95f658cc49d`，Docker healthy、readiness UP。本机有效模式为 `calibrated-category`，adaptive/trace/content capture 保持 true，Overview maxCalls 保持 0；未修改 Token/窗口上限或旧用量。db、MinIO、frontend 的容器与镜像身份逐项核对未变，无新 schema/migration。

运行 JAR SHA-256 为 `6f6057149daa459fdca39c780534d32bab0b349a0bf8b22c158e735a347bb228`；旧镜像保留为 `auralis-backend:rollback-input-estimator-20261024-1234`。Docker 构建中的重新打包产物与本机 Maven JAR 分别记录，不能将两者 hash 混用。build/up 日志、运行设置、readiness 和前后容器身份见 `D:/Temp/auralis-budget-step3-20261024/deployment/`。

相关 43 项、replay gate 与 package 已通过，唯一 review B0/I0/O0；不将曾有 harness error 且未完整重跑的 full suite 写成全绿，原始 full stdout 留存缺口见同目录上级 `final-handoff.md`。本次未主动调用真实 Provider；用户从原界面重试资料生成，再核对正文 usage/质量。

### 2026-10-23 Overview 本机调用次数观测

本机仅 backend 使用 `docker-compose.yml` + `docker-compose.overview-trace.yml` 重建并 recreate，镜像 sha256:1158fd2458a59bc8630f956ba8d91a48f0926f2414ef24df6d2e5460ec4f9665。容器环境 `AURALIS_AI_LIMITS_OVERVIEW_MAX_CALLS=0`，Docker healthy、`/actuator/health/readiness` HTTP 200。基础 Compose 默认24、Token预算及数据库/MinIO/前端容器未调整；追踪继续落在 D:/Temp/auralis-overview-traces。定向测试54/54、package成功；后端 full 829项 1F/46E/5S，详见 `D:/Temp/auralis-overview-unlimited-calls-20261023/full.log`，不能称完整门禁通过。尚未触发真实 Provider 或完成 GUI/资料内容验收。

### 2026-10-12 学科总览分批修复本机部署

香港 13:57:23 仅 backend 更新为 `sha256:a5a50bb7ae02cb1cc93a3e17a46b2515552f4e434b50b9a5764cf8bfabf541f2`。实际执行 `docker compose --env-file .env build --progress plain backend` 和 `docker compose --env-file .env up -d --no-deps --force-recreate backend`，均退出 0；容器 healthy，readiness HTTP 200。旧镜像 `31f7dec…` 保留于 `auralis-backend:rollback-subject-overview-prompt-batching-20261012`。

构建前后 474 份输入 hash 保持，替换前有效 TASK / RESERVED / PARSING 或 INDEXING 为 0；db / MinIO 容器与数据卷保持，Flyway V31，无新迁移。运行 Service class 与 73 项 clean 回归版本精确匹配，Guard 保留 embedding 排除，现有额度 / prompt / deadline 保持。本次验证仅涵盖构建、部署与健康；真实 Provider / GUI 生成另行验收，详见 [完整证据](../plans/2026-10-12-subject-overview-prompt-batching.md)。

### 2026-10-12 embedding 额度策略与本机测试配置

单人默认 1000000 token / 小时、2000000 / 日；系统日 2000000、并发 4 / 2 保持。`application.yml`、Compose fallback 与 `.env.example` 需一致；本机 `.env` 相关键未设置，已有其他环境若设置旧值则仍按显式覆盖生效。embedding 的新旧记录排除由新服务端聚合实现，单改 env 不会替换运行中 JAR。

本轮只更新本机 backend，不重建 db / minio 或数据卷；部署前核对现有成功 migration，当前只读观察 V31 已应用，本次策略无新迁移。构建、运行态健康 / 有效额度、已部署类中的统计过滤和真实 Provider / GUI 分别验收，证据见 [策略计划](../plans/2026-10-12-embedding-quota-exemption-and-test-limits.md)。

实际部署：香港 12:57:12 仅 backend 更新为 `sha256:31f7dec47c568c5c3de3c7dfe1727228c245c90c6b81d6fb0931843b5227a11c`，healthy / readiness 200。`docker compose --env-file .env build backend`、`docker compose --env-file .env up -d --no-deps --force-recreate backend` 均退出码 0；更新前有效 TASK / RESERVED / 活动 ingestion 为 0，db / MinIO 身份及卷保持，Flyway V31 / 失败 0。旧镜像保留于 `auralis-backend:rollback-embedding-quota-20261012-precandidate`。已核对运行额度与 Guard 字节码，未用实际 Provider / GUI 代替用户业务测试。

### 2026-10-08 前端镜像构建验证

用户组合构建的前端步骤在 `npm install` 报 `ECONNRESET`。原 Buildx 历史日志确认下载连接被重置；同一 Dockerfile 隔离重试 `docker buildx build --progress plain --file Auralis-PC/Dockerfile Auralis-PC` 退出 0，依赖安装、前端编译和镜像导出均完成。完整日志与时间见 [基础设施记录](../modules/Infrastructure.md)。

本次只验证前端镜像构建，没有部署该无仓库标签的镜像或替换现有服务。后端新增的复习状态与学科统计接口需要重新构建并重启 backend 后才能在当前运行环境使用；前端镜像构建通过不能代替此步骤。再次遇到安装错误时先保留完整 npm 输出，若仍为 ECONNRESET 则排查构建环境到 registry 的网络/代理；不得把它推断为依赖冲突或删除锁文件来规避。

### 2026-09-24 紧邻任务交换本机部署记录

执行 `docker compose --env-file .env config --quiet`、`build backend`、`up -d --no-deps --force-recreate backend`，均退出 0。最终仅 backend 被替换为容器 `72be6c8240a8…`、镜像 `sha256:bf8e7bb72f0c…`；health/readiness HTTP 200 且 status UP。db/minio 容器与镜像均保持原样、数据卷未重建；Flyway 当前版本 23，无新迁移。GUI 拖放及认证业务请求尚未验收。

### 2026-09-24 本机 backend 部署记录

执行 `docker compose --env-file .env config --quiet`、`build backend` 与 `up -d --no-deps --force-recreate backend`，均退出 0；只替换 backend 容器，db/minio 容器和数据卷未重建。新容器 `ee3d733c00c8…` healthy，health/readiness UP；Flyway V23 成功且当前 schema 版本为 23。此证据只证明本机运行和迁移，尚无认证后的排期操作或 GUI 拖放验收。





测试账号：登录信息：
- 用户名：pc-ai-test-20260821-180412@example.com
- 密码：AuralisPcTest#2026
- 显示名：PC AI 测试账号

需要重建本机数据库、清空 MinIO 并重新注入账号和时间轴测试数据时，使用[测试账号与测试数据重置/注入流程](TestAccountDataResetAndSeed.md)，不要手工拼接数据库 hash 或直接绕过 API 写入业务数据。

## 部署模式

| 模式 | 用途 | 组成 |
| --- | --- | --- |
| 本地开发 | 日常开发与联调 | 本地 Node/Java + Compose 基础设施 |
| PC Web | 浏览器部署 | Vite 静态产物 + Server |
| PC Tauri | 桌面开发/打包 | Web 前端 + Rust/Tauri + Server |
| Mobile H5 | 移动 Web | Uni-app H5 产物 + Server |
| 微信小程序 | 微信运行 | mp-weixin 产物 + Server 公网 HTTPS/WSS |
| Compose 组合 | 本地/受控环境 | PostgreSQL/pgvector、MinIO、Server、PC Web |

当前 Compose 含开发默认凭据，禁止未经加固直接作为公网生产方案。

### 2026-09-10 Provider Overview timeout 修复

Provider 连接窗口与响应窗口已分离：Compose 默认透传 `AURALIS_AI_PROVIDER_CONNECT_TIMEOUT_MILLIS=3000`、普通请求 `AURALIS_AI_REQUEST_TIMEOUT_MILLIS=10000` 和 Overview 非流式生成 `AURALIS_AI_OVERVIEW_RESPONSE_TIMEOUT_MILLIS=120000`。Overview 变量由服务端限制在 60000–120000ms；部署后若上游生成较慢，只调高该变量，不要用普通请求变量放大聊天/embedding/stream 窗口；`MODEL_TIMEOUT` 对外为 HTTP 504。

### 2026-09-09 Task 16 运行验证

本轮仅执行 backend 镜像重建和 `up -d --no-deps --force-recreate backend`；PostgreSQL/MinIO 容器及 volume 未重建、删除或写入。Compose config 退出码 0，backend healthy，liveness/readiness 为 HTTP 200，worker flag 为 `true`。启动日志确认 PostgreSQL 17.11、Flyway 21 migrations 已验证且无需迁移。只读数据库摘要与定时任务异常见 `.superpowers/sdd/task-16-report.md`。现有 READY Source 早于事件修复，需新的认证 reingest/upload 才能取得完整 READY change-log 与 PC GUI/sync 证据。

## 前置条件

- Git 工作树和目标提交已确认。
- Node.js/npm 能安装两个前端 lockfile。
- Java 21 与 Maven 可用。
- Docker Engine 与 Compose 可用；Testcontainers 使用同一 Docker Engine。
- Tauri 需要 Rust、Cargo 和目标系统构建依赖。
- 微信发布需要开发者工具、AppID、合法域名、HTTPS/WSS 和平台审核配置。
- 生产 secret、域名、证书、备份位置和回滚负责人已确定。

## 配置准备

### 开发

1. 复制 `.env.example` 为 `.env`。
2. 替换所有 `replace-*` 值，至少设置数据库密码、MinIO 密码、JWT、AI 加密 key 和 CORS 白名单；Tauri 客户端访问 Compose 时将 `AURALIS_MINIO_PUBLIC_ENDPOINT` 设为客户端可达的 MinIO API 地址（本机默认 `http://127.0.0.1:9000`），并按实际访问地址加入 `http://tauri.localhost` 以及开发调试用的 `http://localhost` 或 `http://127.0.0.1` origin。
3. 先运行 `docker compose --env-file .env config --quiet`；缺少必填值时应 fail-fast。

### 生产

至少准备：

```text
AURALIS_DB_USER / AURALIS_DB_PASSWORD / AURALIS_DB_NAME
AURALIS_JWT_SECRET / AURALIS_AI_ENCRYPTION_KEY
AURALIS_MINIO_ROOT_USER / AURALIS_MINIO_ROOT_PASSWORD / AURALIS_MINIO_BUCKET
AURALIS_CORS_ALLOWED_ORIGINS
AURALIS_AI_ALLOWED_PROVIDER_HOSTS / AURALIS_AI_*_TIMEOUT_MILLIS
DEEPSEEK_API_KEY / OPENAI_API_KEY / SILICONFLOW_API_KEY（可选默认 Provider）
```

实际变量名必须与最终配置绑定一致。Provider 默认 key 由 Compose 注入后端运行时；用户 BYOK 仍通过 API 加密存储，任何 key 都不写入日志。

## 本地基础设施

### 2026-10-11 Overview 取消发布要求（代码与相关自动验证通过；未部署）

本轮 PC 使用现行 `/api/ai/source-overviews` 与 `/api/ai/subject-overviews` 的可选 SSE 响应。发布时先确认后端支持 `Accept: text/event-stream`、心跳及最终 `result/error`，再启用新 PC；默认 JSON 消费者继续使用原响应。没有新数据库迁移或取消路由。

`Auralis-PC/nginx.conf` 的 `/api/` 已设置 `proxy_buffering off` 与 `proxy_cache off`。部署链上的其他代理须实际透传/刷新心跳，并让空闲超时覆盖心跳间隔；PC 外层期限、任务期限及收尾须留余量。本地 socket/Servlet 测试不能替代真实代理、Tauri/GUI 和 Provider 验收，检查结果单独记录在 [本轮计划](../plans/2026-10-11-overview-hard-timeout-cancellation.md)。

### 2026-10-10 AI Usage Guard B 发布准备（代码与相关自动验证通过；尚未部署）

发布本轮代码时需安装 V30 持久账本与 ingestion 延期字段，并在所有 backend 实例统一 `AURALIS_AI_LIMITS_*` 策略。变量及默认值见 [基础设施配置](../modules/Infrastructure.md)。不能让旧实例继续直接调用 Provider 而绕过账本；发布前需确认当前实例版本和相关迁移验证证据，并备份数据库。

前端个人中心依赖 `GET /api/ai/usage`。先确认新后端已提供本人额度和稳定错误码，再验收 PC、手机与 Tablet 的加载、失败重试、账号切换和额度重置时间。Provider usage 缺失时会保守结算，不能把个人中心数值当作服务商金额账单。

本轮 `.env.example` Compose config、任务独占临时 PostgreSQL V1→V30 clean 与 V29→V30 历史数据保留升级已通过；临时 PG 已停止。未重建、切换或启动业务容器，未修改业务数据库。真实 Provider、代理/SSE 断流、GUI 和设备验收与命令测试分别记录在 [B 实施计划](../plans/2026-10-10-ai-usage-guard-b.md)。

### 启动核心依赖

```powershell
docker compose --env-file .env up -d db minio minio-init
docker compose ps
```

成功判据：

- PostgreSQL `5432` 可连接。
- MinIO API `9000`、Console `9001` 可访问。
- `minio-init` 成功退出且 `auralis-assets` bucket 存在。

### 查看日志

```powershell
docker compose logs db
docker compose logs minio
docker compose logs minio-init
```

禁止只因容器状态为 Running 就认定服务已就绪。

## Server 构建与运行

```powershell
cd Auralis-Server
mvn test
mvn package
mvn spring-boot:run
```

Windows 环境优先验证 Wrapper：

```powershell
.\mvnw.cmd -B -ntp clean test
```

当前 Wrapper 已覆盖普通 Maven 仓库目录；生产 profile 关闭 springdoc API docs/Swagger UI，local profile 仍可用于 OpenAPI smoke。两者均不替代真实 PostgreSQL、MinIO、Provider 和生产 secret 验收。

成功判据：

- Maven 命令退出码 0。
- Server 监听 `8080`。
- 日志显示 PostgreSQL、MinIO 配置按目标 profile 加载。
- 公开 Auth 端点可响应。
- 受保护端点在无 token 时被拒绝。

普通 `mvn -B -ntp clean test` 同时执行 H2、PostgreSQL/pgvector 和 MinIO Testcontainers；Docker Engine 不可用时应直接失败，不允许静默跳过真实依赖测试。`postgres-it`/`minio-it` profiles 仍可用于兼容旧命令和独立定向执行。

## PC Web（仅内部开发）

```powershell
cd Auralis-PC
npm install
npm.cmd run build
```

产物由 Vite 生成到项目构建目录。部署静态产物时需要：

- SPA 路由回退到 `index.html`。
- `/api` 反向代理到 Server。
- `/ws` 支持 WebSocket Upgrade。
- HTTPS 页面使用 WSS，避免 mixed content。

冒烟：打开 `/login`、`/`、`/subjects`；检查静态资源、路由刷新、API 和 WebSocket 网络请求。

## PC Tauri（正式桌面目标）

```powershell
cd Auralis-PC
$env:VITE_API_BASE_URL = 'http://localhost:8080'
$env:VITE_WS_BASE_URL = 'ws://localhost:8080'
npm run tauri dev
```

Tauri 运行时必须显式提供 `VITE_API_BASE_URL` 与 `VITE_WS_BASE_URL`；PC Web 仅用于内部开发，不作为发布目标。发布打包命令必须以 Tauri CLI 当前能力为准。人工检查：窗口、权限、SQL 插件、文件访问、更新策略、安装/卸载、签名和系统兼容性。

Web 构建通过不代表 Tauri 通过。目录改名后若错误明确指向旧 StudyCore 绝对缓存，可在 `Auralis-PC/src-tauri` 执行 `cargo clean`，但不得把它作为通用修复。

## Mobile H5

```powershell
cd Auralis-Mobile
npm install
npm.cmd run build:h5
```

部署要求与 PC Web 类似，同时检查：安全区、触控、输入法、移动网络、刷新路由和 API 地址。`127.0.0.1` 硬编码必须在真机部署前解决。

## 微信小程序

```powershell
cd Auralis-Mobile
npm.cmd run build:mp-weixin
```

命令行成功后仍必须：

1. 用微信开发者工具导入产物。
2. 检查页面清单只包含 launch 与 mobile 页面。
3. 配置合法 HTTPS/WSS 域名。
4. 验证登录、刷新、AI、同步、网络错误和真机安全区。
5. 记录基础库版本、设备和平台审核限制。

## Compose 组合部署

Server 镜像构建会在 Linux build stage 中把 Maven wrapper 统一为 LF，兼容 Windows checkout 的 CRLF。backend 更新后可单独运行 `docker compose --env-file .env build backend` 与 `docker compose --env-file .env up -d --no-deps backend`；该操作不会重建 db 或 MinIO。Compose 默认使用 `prod` profile，`/v3/api-docs` 与 Swagger UI 按配置关闭；契约检查使用仓库内生成的 OpenAPI artifact。

```powershell
docker compose build backend frontend
docker compose --env-file .env up -d
docker compose ps
docker compose logs backend
docker compose logs frontend
```

部署前必须确认：

- 所有默认密码已替换。
- volume 指向持久化且有备份的位置。
- 管理端口不对公网开放。
- CORS 仅允许目标前端域名。
- `AURALIS_MINIO_ENDPOINT` 只用于容器内访问，`AURALIS_MINIO_PUBLIC_ENDPOINT` 必须是浏览器可达地址；MinIO API CORS 白名单与 `AURALIS_CORS_ALLOWED_ORIGINS` 保持一致。
- AI 与存储配置使用 secret 注入。
- MinIO 用户资产使用独立 bucket/凭据；当前 Compose 不启动 Milvus/etcd。

## 冒烟检查

| 领域 | 检查 | 成功判据 |
| --- | --- | --- |
| Auth | 注册/登录/刷新 | token 类型正确，错误凭据被拒绝 |
| 权限 | 无 token、跨用户访问 | 被拒绝，无数据泄漏 |
| 数据 | 块/任务 CRUD | 当前用户可见，删除不复活 |
| 同步 | push/pull/冷启动 | cursor 推进，多端一致 |
| 资产 | 预签名、上传、bind、query | objectName 归属和对象元数据正确 |
| AI | chat/ingest | 成功、超时和失败有明确反馈 |
| WS | 握手、PING、过期 | 无效 token 关闭，合法连接 PONG |
| 前端 | 目标页面 | 无关键白屏、404、资源或路由错误 |

## 发布门禁

- 所有 P1 风险关闭。
- 自动测试覆盖 Auth、隔离、Sync、Asset 和 WebSocket。
- 数据库迁移、备份和回滚演练通过。
- 生产 secret 和默认密码检查通过。
- PC Web、Server、H5、微信命令实际通过。
- Tauri、微信工具、手机和平板目标设备人工验收通过。
- 监控、日志、告警和发布负责人就绪。
- `docs/current/Status.md` 与 Changelog 记录同一提交的真实证据。

## 回滚

1. 停止继续发布和写入扩散。
2. 保存失败版本日志、配置和数据库状态。
3. 应用回退到最近已验收镜像或静态产物。
4. 数据库只按已验证迁移回滚方案处理；禁止盲目反向执行 SQL。
5. 若涉及对象/向量，按同一时间点恢复 PostgreSQL、MinIO、Milvus 和 etcd。
6. 执行冒烟并记录数据丢失窗口。

## 部署记录模板

```text
版本/提交：
环境：
负责人：
配置来源：
备份时间与位置：
构建命令与结果：
部署命令与结果：
冒烟结果：
人工验收设备：
已知风险：
回滚版本：
```
- 本批后端已部署：sha256:84c96a9c04c9e879a5f294b73cbedb156581931b1f0b5cd278992a66dcea8a8d，Docker healthy、readiness HTTP 200。仅backend更新，未触发真实Provider。

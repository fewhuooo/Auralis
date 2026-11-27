# Auralis 部署指南

更新时间：2026-11-27

文档状态：现行操作指南，生产演练边界见 current

权威范围：配置准备、构建、部署、冒烟、发布门禁与回滚

事实来源：当前 Compose、应用配置、Dockerfile、前端脚本及模块文档

## 使用范围

本文维护可复用步骤；运行故障和数据恢复见 [Runbook](Runbook.md)，服务拓扑与配置职责见[基础设施模块](../modules/Infrastructure.md)。过去的镜像、实验参数和部署流水已完整保存在[整理前记录](../archive/snapshots/maintenance-2026-11-15/Deployment.md)，不作为本次执行结果。当前运行观察和未验收项见 [Status](../current/Status.md) / [IssuesAndReview](../current/IssuesAndReview.md)。

| 模式 | 组成与用途 |
| --- | --- |
| 本地开发 | 本地 Node/Java 与 Compose 数据服务 |
| PC Web | Vite 静态产物、反向代理与 Server |
| PC Tauri | Web 前端、Rust/Tauri、OCR 资源与 Server |
| Mobile / Tablet (Android) | Tauri 2 双目标 Android APK（`Auralis` / `Auralis HD`）与可达的 HTTPS/WSS Server |
| Compose 组合 | PostgreSQL/pgvector、MinIO、backend 与 PC Web frontend |

下文命令是操作说明，不表示已经执行；启动、部署、重启、迁移和凭据变更须在已授权的目标环境进行。已有开发服务和应用进程不得擅自重启。

## 前置条件

- 确认目标提交、工作树、环境、负责人和回滚版本，保留未提交改动。
- Node/npm 与前端 lockfile 匹配；后端 Java 21 与 Maven Wrapper 可用。
- Docker Engine/Compose 可用；真实容器测试还需 Testcontainers 前置条件。
- PC Tauri 具备 Rust/Cargo、目标系统依赖与 OCR 打包资源；Mobile/Tablet Android 构建另需 Android SDK/NDK（`NDK_HOME`）、Java 21、`aarch64-linux-android` Rust target 及发布密钥。
- 明确域名、TLS、生产 secret、数据与密钥备份位置；迁移前确认恢复方案。

## 配置准备

首次配置时将 `.env.example` 复制为 `.env`；已有 `.env` 不覆盖。按目标环境填写数据库、MinIO、JWT、AI 加密密钥、公开地址和 CORS。基础 Compose 的数据库与对象数据分别使用 `auralis-postgres-data`、`auralis-minio-data` 命名卷；根 `data/` 不是这两个卷的替代目录。

```powershell
docker compose --env-file .env config --quiet
```

只检查解析结果，不输出包含凭据的完整配置。必填值缺失应失败；解析通过不证明服务可达或凭据正确。配置变化不会自动进入已运行进程，须按发布步骤更新目标服务。

### 地址、存储与身份

- `AURALIS_DB_*`、`AURALIS_MINIO_*` 配置对应环境。Compose 中 backend 使用容器内 MinIO endpoint；`AURALIS_MINIO_PUBLIC_ENDPOINT` 必须是客户端可达 API 地址。
- `AURALIS_CORS_ALLOWED_ORIGINS` 只包含实际客户端来源；MinIO PUT CORS 与 API 来源保持一致。Tauri 的 origin 按目标运行环境核对。
- `AURALIS_JWT_SECRET` 与 `AURALIS_AI_ENCRYPTION_KEY` 使用安全注入；轮换必须考虑现有会话和已加密 BYOK 数据。
- 生产环境限制数据库、MinIO Console 和管理端口暴露。配置默认值及端口以 Compose / `.env.example` 为准。

<a id="2026-11-15-验证码邮件配置"></a>

### 验证码邮件配置

后端配置 `AURALIS_MAIL_HOST`、`AURALIS_MAIL_PORT`（默认 587）、`AURALIS_MAIL_USERNAME`、`AURALIS_MAIL_PASSWORD` 和 `AURALIS_MAIL_FROM`。默认 `AURALIS_MAIL_STARTTLS=true`；`AURALIS_MAIL_MAX_SENDS_PER_MINUTE` 默认 60。发件地址须允许当前 SMTP 账号代发。根 `.env` 由 Compose 的 backend `env_file` 注入。

用隔离测试邮箱分别验证注册和找回密码。发送接口 204 只表示受理，收到验证码并完成流程才构成投递与业务验证；缺少 SMTP 主机或发件地址时返回 503。验证码和凭据不写入记录。故障处理见 [Runbook](Runbook.md#验证码邮件)。

### 平台生成与 Embedding

分别成套填写 `AURALIS_AI_GENERATION_BASE_URL/MODEL/API_KEY` 与 `AURALIS_AI_EMBEDDING_BASE_URL/MODEL/API_KEY`。生成使用 OpenAI 兼容端点，账号 BYOK 按现行选择规则生效；向量入库和检索使用平台 Embedding，模型须返回 1024 维有限数值。更换模型还需核对已有向量空间，连通不等于召回质量通过。

平台 Overview 同时需要 `AURALIS_AI_GENERATION_CONTEXT_TOKENS` 与 `AURALIS_AI_GENERATION_MAX_OUTPUT_TOKENS` 的真实模型能力。未配置有效容量时可能在派发前返回 `MODEL_UNAVAILABLE`。只记录 endpoint host、模型和 Key 是否存在，不打印 Key。

### BYOK Overview 模型容量

服务端 `overview-model-capacities` 必须精确匹配 Provider、endpoint 和 model。直接进程可用下列环境变量，Compose 的 `.env` 可经 backend `env_file` 传入；如使用额外 override，构建与启动时须使用同一组合。

```text
AURALIS_AI_OVERVIEWMODELCAPACITIES_0_PROVIDER
AURALIS_AI_OVERVIEWMODELCAPACITIES_0_ENDPOINT
AURALIS_AI_OVERVIEWMODELCAPACITIES_0_MODEL
AURALIS_AI_OVERVIEWMODELCAPACITIES_0_CONTEXTWINDOWTOKENS
AURALIS_AI_OVERVIEWMODELCAPACITIES_0_MAXOUTPUTTOKENS
```

Provider 使用 `DEEPSEEK`、`OPENAI_COMPATIBLE` 或 `SILICONFLOW` 的精确名称。声明容量不能超过实际端点能力。

### 期限、容量与用量

| 入口 | 用途 |
| --- | --- |
| `AURALIS_AI_PROVIDER_CONNECT_TIMEOUT_MILLIS` | Provider 连接窗口，默认 3000ms |
| `AURALIS_AI_REQUEST_TIMEOUT_MILLIS` | 普通请求响应窗口，默认 10000ms |
| `AURALIS_AI_OVERVIEW_RESPONSE_TIMEOUT_MILLIS` | Overview Provider 响应窗口，默认 120000ms |
| `AURALIS_AI_OVERVIEW_TASK_TIMEOUT_MILLIS` | Overview 直接请求整任务期限，默认 240000ms；0 关闭该额外期限，其他保护保留 |
| `AURALIS_AI_OVERVIEW_MAX_*` | 额外输入/输出/载荷等上限，0 不施加对应上限；模型容量与额度仍生效 |
| `AURALIS_AI_CHAT_AGENT_*` | 迭代、工具、独立调用帽、请求容量与 attempt deadline |
| `AURALIS_AI_LIMITS_*` | 并发、窗口额度、任务预算、预留与租约 |
| `VITE_OVERVIEW_SSE_DEADLINE_MS` | PC 构建时外层期限，改变后须重建前端 |

Overview 当前走清理、大纲和 Markdown 总结，超出单请求容量时尝试自动分批；不能从旧部署记录恢复 adaptive、Writer、旧估算模式或自动重试配置。Overview 持久后台作业入口和 worker 已退役，手动及 PC 自动生成使用现行直接请求路径。

所有 backend 实例须使用一致计量策略，不能保留绕过账本的旧实例。未知派发和缺失 usage 按保守规则结算，不以提高本机额度或删除旧记录证明问题关闭。

## 构建与目标平台

按任务范围执行模块规定的检查；完整验证要求见[编码前协议](../agent/BeforeCoding.md)。

| 目录 | 典型命令 | 结果边界 |
| --- | --- | --- |
| `Auralis-Server` | `.\mvnw.cmd -B -ntp test`；`.\mvnw.cmd -B -ntp -DskipTests package` | package 跳过测试时不能记为测试通过 |
| `Auralis-PC` | `npm.cmd ci`；`npm.cmd run type-check`；`npm.cmd run build` | Web 产物不证明 Tauri/安装包验收 |
| `Auralis-PC` | `npm.cmd run tauri dev`；按目标执行 Tauri build | 需系统 GUI、权限、SQL/文件/OCR 与安装升级验证 |
| `Auralis-Mobile` | `npm.cmd ci`；`npm.cmd run build:phone`；`npm.cmd run build:tablet`；`..\scripts\build-mobile-release.ps1` | Debug / unsigned 包不证明物理真机与签名发行版验收 |

Server 本地启动使用 Maven Wrapper 的 `spring-boot:run`，先配置实际 profile 与依赖服务。测试可能需要 PostgreSQL/MinIO 容器或 TLS fixture，缺少前置条件要记录实际失败/跳过范围，不能推断全量通过。

PC Web 需要 SPA 回退、`/api` 代理、WebSocket Upgrade 和 SSE 透传。HTTPS 页面使用 WSS；检查部署链各层路由，不能仅凭示例 nginx 文件存在判断 `/ws/events` 已可达。Tauri 依据 PC 环境示例配置可达 API/WS 地址。Android 手机/平板在真机与模拟器上不能把 `localhost` 当宿主 Server，调试明文测试 IP 须受 `network_security_config.xml` 约束，正式发行版须切换 HTTPS/WSS 并确认服务端 CORS 含 `http://tauri.localhost`。

### Android 移动端打包与签名

仓库根目录提供 `scripts/build-mobile-release.ps1`，统一构建竖屏手机（`com.auralis.mobile`）与横屏平板（`com.auralis.hd`）两个独立 APK，并在脚本执行前后自动备份并恢复 `Auralis-Mobile/.env.local`：

- **本地调试 / 模拟器验证包（Debug + 可选明文 HTTP）**：传入 `-DebugBuild -AllowHttp` 指向局域网/测试服务端；不得作为对外发布产物。
- **正式发行包（Release）**：必须使用 `https://` 与 `wss://` 地址并配置 Android 签名，通过环境变量 `AURALIS_ANDROID_KEYSTORE_PATH`、`AURALIS_ANDROID_KEYSTORE_PASSWORD`、`AURALIS_ANDROID_KEY_ALIAS`、`AURALIS_ANDROID_KEY_PASSWORD` 或未入库的 `Auralis-Mobile/src-tauri/gen/android/keystore.properties` 提供密钥（严禁将 keystore 或口令提交进 Git）；仅校验本地 Release 构建链时可显式附加 `-AllowUnsigned` 输出未签名 APK。

## 启动与更新 Compose

仅在已授权的目标环境执行，先确认已存在容器与卷：

```powershell
docker compose --env-file .env up -d db minio minio-init
docker compose ps
```

成功判据：db 健康、MinIO API/对象读写正常，minio-init 成功退出且配置的 bucket 存在。仅 Running 不是就绪。

部署应用：

```powershell
docker compose --env-file .env build backend frontend
docker compose --env-file .env up -d backend frontend
docker compose ps
```

只更新 backend 时，限定 `build backend` 与 `up -d --no-deps backend`；需强制重新注入配置时明确使用 recreate。禁止把 `down -v` 或清空数据当作更新步骤。Server Dockerfile 处理 Wrapper 的 LF；Compose 默认 prod profile，API docs/Swagger UI 关闭，契约核对使用冻结 OpenAPI 与仓库检查工具。

部署前检查持久卷备份、端口暴露、TLS、CORS、公开存储地址和 secret；部署后保存镜像/提交、健康状态及业务冒烟结果。不得把其它日期镜像 ID 当作当前运行版本。

## SSE 与实时通知验收

Overview SSE 的最终 `result/error` 才是业务结果，心跳只维持连接，HTTP 200 不证明生成成功。代理须关闭缓冲并实际透传心跳；空闲超时、客户端期限和服务端收尾留出余量。Chat 也需验证长时间无 chunk、断线和取消，不以普通 HTTP 冒烟替代。

Realtime 先用 access token 获取一次性 `POST /api/realtime/ticket`，再按返回地址连接 `/ws/events?ticket=...`。验证无效/过期/重复 ticket 拒绝、提交后通知和退出断开；不使用旧 PING/PONG 作为应用层成功判据。

## 冒烟与发布门禁

| 领域 | 必须观察 |
| --- | --- |
| 身份与权限 | 注册邮件、登录/刷新/找回密码、无凭据及跨用户拒绝 |
| 数据与同步 | 当前用户 CRUD、墓碑、push/pull/cursor、冷启动与多端收敛 |
| 资产与处理 | intent/PUT/complete、对象元数据、解析进度与 READY |
| AI | 普通 Chat、SSE、摄入、Overview 的成功/失败/取消及计量 |
| 实时通知 | ticket 握手、变更通知、客户端刷新 |
| 各端 | 路由、资源、窗口/权限、目标平台交互 |

发布前关闭阻断及 P1 风险，完成相应自动门禁、迁移与恢复演练、目标设备验收，并确认监控告警和负责人就绪。验证记录绑定同一提交和环境，写入 current 与 Changelog；构建、运行健康和业务验收分别记录。

## 回滚与记录

停止发布扩散并保存日志、配置和数据现场；应用回到已验收产物。数据库只按已验证的迁移/恢复方案处理，不盲目反向 SQL。PostgreSQL、MinIO 对象和解密所需配置须按一致恢复点处理，详见 [Runbook](Runbook.md#恢复)。

每次记录：版本/提交、镜像、环境、负责人、配置来源、备份位置与时间、实际构建/部署命令和退出码、冒烟结果、人工验收设备、未关闭风险、回滚版本和数据影响。历史记录进入任务报告，不再次堆入本文。

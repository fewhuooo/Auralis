> [!WARNING]
> 本文为 2026-11-15 整理前工作树原文，仅供追溯，不是当前配置、操作或验收依据。现行入口见 docs/README.md。

<!-- ORIGINAL WORKTREE CONTENT -->
# Auralis 部署指南

### 2026-11-15 验证码邮件配置

在后端运行环境配置 `AURALIS_MAIL_HOST`、`AURALIS_MAIL_PORT`（默认 587）、`AURALIS_MAIL_USERNAME`、`AURALIS_MAIL_PASSWORD` 和 `AURALIS_MAIL_FROM`。默认要求 STARTTLS，`AURALIS_MAIL_MAX_SENDS_PER_MINUTE` 限制每种用途的每分钟全局发送量，默认 60。Docker Compose 会将根 `.env` 传入 backend。发件地址须允许当前 SMTP 账号代发。

实际启用前，用测试邮箱分别走一次注册和找回密码。发送接口 204 表示请求已受理，收件箱收到验证码后再验证完整流程。缺少 SMTP 主机或发件地址时，发码接口返回 503。

### 2026-11-13 Overview 单次输入上限

本机根 `.env` 设置 `AURALIS_AI_OVERVIEW_MAX_INPUT_TOKENS=32768`。正数限制每次 Overview 模型请求的估算输入 Token，超过时尝试分批。设为 `0` 可取消这项额外限制。以后修改此值，使用当前镜像重新创建 backend 容器即可生效。

### 2026-11-13 学科总览直接生成修复部署

香港 01:21:22 本机仅重建 backend。镜像 `sha256:92f14d854c8d8db0d5618be8f1dc81ead96fdbb5dd731ab38eb7330c5e92170d`，Docker healthy，宿主 liveness/readiness HTTP 200 / UP。新旧可执行差异限于 OverviewGenerationService 的直接生成门禁。Flyway V45 无迁移，32,768 Token 临时输入上限仍生效。证据见 `D:/Temp/auralis-subject-direct-deploy-20261113/report.md`。

### 2026-11-13 Overview 超长输入分批本机部署

香港 00:59:34 完成 backend 单独构建、重建与健康验证。运行镜像为 `sha256:1011c85cc18dc34f04298d69ac4a6154c02ed6db9debb95e23e598e195ecf034`，宿主 liveness/readiness HTTP 200 / UP。JAR 差异限于本轮 Overview 五个源码的产物。Flyway 保持 V45，其他服务容器身份与后端环境逐项一致。平台上下文为 1,048,576 Token，模型输出上限 393,216 Token，单任务额度 1,048,576 Token。证据见 `D:/Temp/auralis-overview-multibatch-deploy-20261113/report.md`。

### 2026-11-12 平台 AI 配置入口

根 `.env` 前部各有一组平台生成与 Embedding 配置，按 `.env.example` 填写各自的 Base URL、模型 ID 和 Key。升级时将原来实际使用的生成三项与 Embedding 三项分别填入新变量。Base URL 填供应商的公网 HTTPS API 根地址，例如 `https://gateway.example/v1`。后端生成请求使用 `/chat/completions`，向量请求使用 `/embeddings`。账号已保存的 `OPENAI_COMPATIBLE` 个人配置优先用于新生成请求。入库与检索统一使用平台 Embedding，所选模型或网关须返回 1024 维向量。

平台 Overview 还需要 `AURALIS_AI_GENERATION_CONTEXT_TOKENS` 和 `AURALIS_AI_GENERATION_MAX_OUTPUT_TOKENS`。按当前端点和模型的能力同时填写两项，更换模型时一并核对。两项均为 `0` 时，平台 Overview 在调用模型前返回 `MODEL_UNAVAILABLE`。使用 BYOK 生成 Overview 时，按下方示例给服务端传入精确匹配其 Provider、端点和模型的 `overview-model-capacities` 条目。

Overview 通用输入与动态输出预算由新后端镜像提供，基础 Compose 和 trace overlay 已移除旧输入估算模式变量。香港 15:59:24 已完成本机单独重建 backend 的健康验证。构建和重建均退出 0，Flyway V45 无需迁移。证据见 `docs/archive/overview-experiments/20261112-unified-budget-deploy/data/report.md`。

香港 17:07:33 完成 D 版 Overview 总结后端部署。仅重建 backend，新旧 JAR 的应用条目仅总结所在类发生变化，宿主 liveness/readiness 均 HTTP 200 / UP。证据见 `D:/Temp/auralis-overview-summary-d-deploy-20261112/report.md`。

香港 18:45:14 完成归并版 Overview 大纲的后端健康验证。只重建 backend，归并版 OUTLINE 和 D 版 SUMMARY 均已在新镜像中核对。证据见 `D:/Temp/auralis-overview-outline-grouped-deploy-20261112/report.md`。

修改后端运行环境后须重新创建 backend 容器。首次启用新配置时须使用包含新绑定的后端镜像。更换实际 Embedding 模型时，先确认旧向量与新模型处于同一向量空间，否则须为受影响的资料重新入库，以保持检索结果可比。`VITE_OVERVIEW_SSE_DEADLINE_MS` 属前端构建参数，修改它还须重新构建前端。

香港 14:29:58 使用原项目 `auralis`、根 `.env` 与基础 `docker-compose.yml` 构建并单独重建 backend。build、recreate 均 exit 0，Docker healthy，宿主 liveness/readiness 均 HTTP 200 / UP，Flyway V45 无需迁移。容器六项新环境变量与 `.env` 一致。依赖和 frontend 容器保持原身份。命令与镜像证据见 `D:/Temp/auralis-platform-ai-20261112/deploy-report.md`。

香港 14:50:16，为原 PDF 复测仅在本机 `.env` 设置 `AURALIS_AI_LIMITS_OVERVIEW_TASK_TOKENS=1048576`，沿用容量版镜像单独重建 backend。运行额度已核对，宿主健康检查均为 HTTP 200 / UP。证据见 `docs/archive/overview-experiments/20261112-task-quota/data/report.md`。

### 2026-11-12 本机 AI 生成额度调整

香港 15:24:50，在真实 `.env` 显式设置 `AURALIS_AI_LIMITS_PER_USER_HOURLY_TOKENS=5000000`、`AURALIS_AI_LIMITS_PER_USER_DAILY_TOKENS=20000000`、`AURALIS_AI_LIMITS_GLOBAL_DAILY_TOKENS=20000000`。沿用原镜像单独重建 backend，运行三项额度及宿主 HTTP 健康检查通过。示例配置的原默认值保持。证据见 `docs/archive/overview-experiments/20261112-quota-increase/data/report.md`。

### 2026-11-12 Overview 提示词本机部署

香港 15:15:16 沿用项目 `auralis`、根 `.env` 与基础 Compose 构建并单独重建 backend。Docker healthy，宿主 liveness/readiness 均 HTTP 200 / UP。所有容器环境项及本机环境文件字节一致。既有正式结果保留，新提示词待用户重新生成验收。证据见 `docs/archive/overview-experiments/20261112-prompts/data/report.md`。

### 2026-11-12 本机部署完成

按用户授权使用当前 `.env` 和基础 Compose 构建、recreate backend/frontend。backend readiness UP，frontend HTTP 200；数据库按授权无新增备份重建至 V45，双账号注入及 MinIO 清空验证见 TestAccountDataResetAndSeed。Docker 前端上下文新增排除 `src-tauri/target-*`；仅过滤历史编译产物，不改变页面。PC 本地目录由用户手动清空，自动启动被工具审批拒绝，用户可在 Auralis-PC 运行 `npm run tauri dev`。证据位于 `D:/Temp/auralis-redeploy-reset-20261112/`。

### 2026-11-12 Overview 旧接口与配置清理（未部署）

旧作业 preview/publication 与正式 PUT 的 candidateInput 已退役，现行调用方应使用 Markdown 结果契约。旧检查点与 Writer 的 MAX_CHECKPOINT_CHARS、MAX_PLAN_CHARS、MAX_NODE_DESCRIPTOR_CHARS、MAX_WRITER_NODES_PER_PLAN 四项 Overview 环境绑定移除，旧 publication poll 调度同步删除；实际 `.env` 中历史键不会启用旧流程。本次仅修改源码与生成契约，不清库、不改历史迁移、不重启服务；已运行实例尚未应用本次清理。

### 2026-11-12 Overview Markdown 重写（未部署）

新生成链删除旧自动内容修复/重试配置 `AURALIS_AI_OVERVIEW_MAX_RETRIES`、`AURALIS_AI_OVERVIEW_OUTPUT_RECOVERY_ENABLED`。下方对旧配置的记录仅代表对应历史版本。实际 `.env` 未修改，服务未重启；新契约需后端与 PC 一起更新，不能把旧章/节客户端视作 v2 可用客户端。旧正式内容不会自动转换，重新生成完整结果后才产生新内容。


### Chat 调用次数配置（源码候选，未部署）

Compose backend 透传 `AURALIS_AI_CHAT_AGENT_MAX_MODEL_CALLS`、`AURALIS_AI_CHAT_AGENT_MAX_EMBEDDING_CALLS` 与 `AURALIS_AI_CHAT_AGENT_MAX_TOOL_CALLS`。模型和 embedding 分别默认 0（不设次数帽），正数为独立上限，负数会阻止启动；工具默认及上限20并沿用 attempt 级限制，`AURALIS_AI_CHAT_AGENT_MAX_ITERATIONS` 默认及上限12，最后一轮只收尾。显式环境覆盖值仍优先。Token 预算、deadline、并发和小时/日额度仍生效。需用新源码构建并 recreate backend 才会进入运行态；本轮未修改本机 `.env`、未部署或调用真实 Provider。

### 2026-10-28 Overview 自动重试配置（源码候选，未部署）

AURALIS_AI_OVERVIEW_MAX_RETRIES=3，含义为首发失败后最多额外重试3次；0关闭，负数启动校验拒绝。Spring属性auralis.ai.overview-max-retries与Compose透传同步；实际.env未修改，重建后端后方生效，无新数据库迁移或前端要求。仅重试已返回且结算的模型内容校验失败，网络未知派发、预算/额度和取消等直接停止；次数不影响既有检查点身份，每次重发仍计费。重试日志phase=ADAPTIVE_MODEL_RETRY；阶段INVALID/校验失败日志后可能继续重试，最终结果以RUN_FINISHED/最终任务状态确认。配置与定向/affected检查已完成，完整验证边界见D:/Temp/auralis-overview-auto-retry-20261028/final-report.md；未部署或调用真实模型。

### 2026-10-27 香港23:05 重试候选已部署

按用户授权，以现有基础Compose及overview-trace overlay构建并recreate backend/frontend，均exit0。启动时Flyway验证41个迁移，数据库已为V41，本次无需重复执行迁移。backend healthy、readiness HTTP200，frontend HTTP200；db/MinIO容器ID及挂载前后相同。backend镜像abe74be55083…，frontend2321333dfca5…。未清缓存、未调用真实模型，重试业务效果待用户使用验收。日志：D:/Temp/auralis-overview-retry-deploy-20261027/。

### 2026-10-26 香港22:42 动态容量本机部署完成

用户已明确授权本次部署。实际执行 `docker compose --env-file .env -f docker-compose.yml -f docker-compose.overview-trace.yml build --progress plain backend frontend` 与同配置 `up -d --no-deps --force-recreate backend frontend`，均exit0。backend镜像 `sha256:6256eee92138f0cf197733a4a871266b78315b8dbab5fa68a54b2f0e687044aa`，frontend `sha256:28f9ff68c11547a9228baaa193ea7f5da500102a573542afd090915fbeb71c8c`。Docker引擎启动后仅恢复原db/MinIO，未recreate其容器或卷。旧两应用镜像已加rollback-dynamic-capacity-20261026标签。

部署前pg_dump完整备份V39数据库并导出目标缓存，随后按用户选择清理六条FAILED的私有生成缓存/父行；SERIALIZABLE事务内检查状态/费用/关联及保留行hash，COMMIT成功。V40在新backend启动时应用。readiness、前端页面和entry bundle均HTTP200，运行JAR六关键class与候选一致；26项MAX全0，calls0，财务taskToken524288保持。22SUCCESS/22正式结果/25receipts/675账本及原资料等12组hash前后相同。部署后无新派发，不等于真实Provider或GUI验收。

命令、退出码、镜像/卷身份、全库及定向备份hash、清理SQL和最终验证在D:/Temp/auralis-overview-deploy-20261026/。备份已生成并校验hash，未执行恢复演练。以下候选说明保留配置设计和部署前状态。

### 2026-10-26 Overview 动态容量配置（候选未部署）

26 项 `AURALIS_AI_OVERVIEW_MAX_*` 已由主 Compose 透传，完整清单见根 `.env.example`。0 表示不加静态帽，正数额外限幅；模型能力、实际请求输出预留及统一额度继续约束派发。Overview calls 默认 0，财务额度保持。单次响应超时仍默认 120000ms、最低 60000ms，已移除旧最大 120000ms 校验；任务期限默认值和 0 语义保持。新源码需重新构建后才生效，仅编辑 `.env` 不会改变旧镜像。

当时的候选通过 package、Compose config、OpenAPI/SDK、PC 类型与接收检查。全量失败及定向验证见[实施计划](../plans/2026-10-26-overview-dynamic-capacity-and-simplification.md)。V40 当时尚未应用到业务库。

### BYOK Overview 模型容量

BYOK 的容量条目可在直接运行的 backend 进程中通过以下五个 `AURALIS_AI_OVERVIEWMODELCAPACITIES_0_*` 环境变量配置。Compose 可通过 override 显式透传完整条目，再将 override 加入构建和启动命令。

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

Provider 取 `DEEPSEEK`、`OPENAI_COMPATIBLE` 或 `SILICONFLOW` 的精确名称，endpoint/model 精确匹配。能力配置声明的是端点可用容量。

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
AURALIS_AI_GENERATION_BASE_URL / AURALIS_AI_GENERATION_MODEL / AURALIS_AI_GENERATION_API_KEY
AURALIS_AI_GENERATION_CONTEXT_TOKENS / AURALIS_AI_GENERATION_MAX_OUTPUT_TOKENS
AURALIS_AI_EMBEDDING_BASE_URL / AURALIS_AI_EMBEDDING_MODEL / AURALIS_AI_EMBEDDING_API_KEY
```

每个 AI 端点的 Base URL、模型与 Key 成套填写。平台 Overview 还需同时填写两项模型容量。平台 Key 由 Compose 注入后端运行时，用户 BYOK 通过 API 加密存储。排查配置时只记录端点 host、模型及 Key 是否配置。

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

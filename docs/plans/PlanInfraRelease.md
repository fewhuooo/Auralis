# 基础设施与发布计划

更新时间：2026-07-02

## 目标

把本地可运行的 Docker Compose 和构建命令，推进到可重复部署、可检查、可回滚的发布准备状态。

## 当前事实

当前已有：

- `docker-compose.yml`
- `Auralis-Server/Dockerfile`
- `Auralis-PC/Dockerfile`
- `Auralis-PC/nginx.conf`
- `.env.example`

当前风险：

- Docker Compose 中仍有默认密码。
- `.env.example` 覆盖变量不完整。
- `application-prod.yml` 配置口径未完全统一。
- 未发现 CI/CD 配置。
- 未做 Runbook 实操演练。

## 任务清单

| ID | 优先级 | 任务 | 状态 | 输入 | 产出 | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| IR-01 | P1 | 环境变量清单补齐 | 进行中 | `.env.example`、配置文件 | DB、Redis、MinIO、Milvus、JWT、AI、CORS 变量完整 | 新环境按清单可配置 |
| IR-02 | P1 | 默认密码风险标记 | 进行中 | `docker-compose.yml` | 开发默认值和生产替换要求明确 | 文档和配置不误导生产使用 |
| IR-03 | P1 | prod 配置统一 | 进行中 | `application-prod.yml` | LangChain4j 配置键统一 | prod 启动读取正确配置 |
| IR-04 | P1 | 本地 Docker 演练 | 已构建待验收 | Docker Compose | 基础设施和前后端启动记录 | `docker compose ps` 服务健康 |
| IR-05 | P2 | 数据备份演练 | 计划中 | PostgreSQL、MinIO、Milvus 数据目录 | 备份和恢复步骤记录 | 测试环境可恢复 |
| IR-06 | P2 | 最小 CI/CD | 计划中 | 构建命令 | 自动跑 backend test、PC build、Mobile H5 build | PR 或 push 能触发检查 |
| IR-07 | P2 | 发布检查清单 | 计划中 | 风险文档、构建结果 | 发布前 checklist | 无 P1 阻断项才能发布 |
| IR-08 | P2 | 日志和监控计划 | 计划中 | Docker logs、Spring logs | 日志路径和关键指标说明 | Runbook 可定位常见问题 |
| IR-09 | P3 | 生产部署拓扑 | 计划中 | 服务器资源、域名、对象存储 | prod/test/dev 拓扑草案 | 明确哪些服务共用或拆分 |

## 建议执行顺序

1. `IR-01` 到 `IR-03`：先把配置风险收掉。
2. `IR-04` 和 `IR-05`：做部署、备份、恢复演练。
3. `IR-06` 和 `IR-07`：建立自动检查和发布门禁。
4. `IR-08` 和 `IR-09`：补生产运维能力。

## 完成定义

- `.env.example` 和部署文档变量一致。
- 默认密码不会被当作生产配置。
- 至少有一条自动化构建/测试流水线。
- Runbook 至少演练过一次重启、日志查看和数据库备份。

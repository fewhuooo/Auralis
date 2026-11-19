> [!WARNING]
> 本文保存 2026-11-15 整理前的工作树原文，仅供历史追溯，不作为当前实现、状态、接口或任务的依据。现行文档从 docs/README.md 进入。

<!-- ORIGINAL WORKTREE CONTENT -->
# 基础设施与发布计划

更新时间：2026-07-10

文档状态：现行计划

权威范围：生产配置、Compose 加固、CI/CD、监控、备份恢复与发布演练

事实来源：`modules/Infrastructure.md`、`operations/Deployment.md`、`operations/Runbook.md`

## 目标

把本地 Compose 基础转为可审计、可恢复、可发布的受控环境。

## 当前事实

- Compose 提供 DB、Redis、pgAdmin、etcd、MinIO、Milvus、backend、frontend。
- 默认密码和共享 MinIO 仅适合本地。
- CI/CD、监控、告警、正式备份和恢复演练尚未进入仓库。

## 有序任务

1. 完整定义 `.env.example` 与 Server 配置绑定，移除生产默认 secret。
2. 拆分或隔离用户资产与 Milvus MinIO bucket/凭据。
3. 建立 PostgreSQL、MinIO、Milvus/etcd 一致性备份与恢复脚本。
4. 进行至少一次恢复演练并记录 RPO/RTO。
5. 增加健康检查、结构化日志、指标和告警。
6. 建立 CI：格式、PC build、Mobile build、Server test、依赖/secret 扫描。
7. 建立镜像版本、部署、迁移、冒烟和回滚流水线。
8. 限制 CORS、管理端口、网络和权限。

## 验证

- 干净环境从 secret 启动成功。
- 不使用默认密码。
- 模拟单服务故障后告警可见。
- 从备份恢复并通过 Auth/Data/Asset/Sync 冒烟。
- 发布与回滚均有执行日志。

## 阻塞

- 部署平台、域名、secret manager、监控栈、备份存储和发布负责人未确定。

## 完成定义

- 生产配置可重复部署，secret 不进入 Git。
- 备份恢复演练成功。
- CI/监控/告警和回滚流程可用。

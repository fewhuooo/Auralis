# 基础设施与发布计划

更新时间：2026-11-15

文档状态：现行计划

权威范围：生产配置、Compose 加固、CI/CD、监控、备份恢复与发布演练

事实来源：`modules/Infrastructure.md`、`operations/Deployment.md`、`operations/Runbook.md`

## 目标

把本地 Compose 基础转为可审计、可恢复、可发布的受控环境。

## 当前事实

- 基础 Compose 提供 db（PostgreSQL/pgvector）、minio、minio-init、backend、frontend；实际配置与卷见[基础设施模块](../modules/Infrastructure.md)。
- `.env.example` 为配置样例，不能据本机可启动推断生产凭据和网络边界合格。
- 已有 OpenAPI workflow、健康检查和部分指标；完整发布流水线、监控告警及备份恢复演练仍按[问题登记](../current/IssuesAndReview.md)收口。

## 有序任务

1. 核对 `.env.example`、Compose 与 Server 的现行配置绑定，验证生产必需 secret 与 fail-fast 行为。
2. 验证 MinIO 用户资源隔离、bucket policy、凭据和预签名 URL 外部可达性。
3. 验证 PostgreSQL、MinIO 与解密密钥的一致性备份恢复步骤。
4. 进行至少一次恢复演练并记录 RPO/RTO。
5. 验证已有健康检查与指标，补齐所需结构化日志、告警和实际送达演练。
6. 在已有 OpenAPI CI 上收口所需格式、PC/Mobile/Tauri 构建、Server/真实依赖测试及供应链扫描。
7. 建立镜像版本、部署、迁移、冒烟和回滚流水线。
8. 限制 CORS、管理端口、网络和权限。

## 验证

- 干净环境从 secret 启动成功。
- 不使用默认密码。
- 模拟单服务故障后告警可见。
- 从备份恢复并通过 Auth/Data/Asset/Sync 冒烟。
- 发布与回滚均有执行日志。

## 阻塞

- 部署前须确认目标平台、域名、secret manager、监控栈、备份存储和发布负责人；本计划不推定这些外部条件已具备。

## 完成定义

- 生产配置可重复部署，secret 不进入 Git。
- 备份恢复演练成功。
- CI/监控/告警和回滚流程可用。

整理前记录见[历史快照](../archive/maintenance-2026-11-15/planning/InfraRelease.md)，仅供追溯。

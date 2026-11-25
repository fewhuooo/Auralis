# Auralis

面向学习场景的多端知识与任务工作台，包含 PC 桌面/Web、手机/平板与后端服务。

**[文档中心](docs/README.md)** · [当前状态](docs/current/Status.md) · [已知问题](docs/current/IssuesAndReview.md)

## 仓库结构

| 目录 | 用途 |
| --- | --- |
| Auralis-PC | Vue、TypeScript 与 Tauri 客户端 |
| Auralis-Mobile | Uni-app 手机与平板客户端 |
| Auralis-Server | Java / Spring Boot 后端 |
| scripts | 跨端契约检查、数据准备及诊断工具 |
| docs | 开发、契约、运维与历史记录 |

## 开始开发

先阅读 [AGENTS.md](AGENTS.md) 和[编码前协议](docs/agent/BeforeCoding.md)，再按目标进入 [PC](docs/modules/FrontendPC.md)、[Mobile / Tablet](docs/modules/FrontendMobileTablet.md)或[后端](docs/modules/Backend.md)。

环境配置与启动步骤见[部署指南](docs/operations/Deployment.md)，常见故障见[排障手册](docs/operations/Runbook.md)。目录用途与本机数据边界见[项目总览](docs/project/Overview.md)，客户端使用说明见[用户手册](docs/project/UserManual.md)。

本页是仓库导航，现行文档统一由 docs/README.md 索引。验证结果和待验收范围以当前状态、问题登记为准。

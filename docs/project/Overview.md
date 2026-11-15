# Auralis 项目总览

更新时间：2026-11-15

文档状态：现行

权威范围：项目定位、仓库目录职责与开发导航

事实来源：当前仓库目录、三个应用的依赖清单、Maven 配置与 Docker Compose

## 项目定位

Auralis 是面向学习场景的多端知识与任务工作台。PC、手机和平板共享账号与服务端业务，各端按设备特性承担不同交互职责：

- PC：信息组织、学科工作区、文件阅读、知识关系和重型编排。
- Mobile：快速捕获、日程、专注、复习、统计和随身 AI。
- Tablet：横向多栏学习工作区、文件批注、手写与大屏交互。
- Server：鉴权、业务数据、同步、资产、AI/RAG、对象存储和实时通知。

功能存在、自动验证与真实设备验收分别判断，当前完成度以[状态](../current/Status.md)和[开放问题](../current/IssuesAndReview.md)为准。

## 仓库目录

```text
Auralis/
├── Auralis-PC/                       # PC Web / Tauri 应用
│   ├── src/                          # 页面、组件、Store、API、本地仓储与服务
│   ├── src-tauri/                    # Rust、桌面权限、资源与打包配置
│   ├── ocr-sidecar/                  # OCR sidecar 源码与打包输入
│   ├── public/                       # Web 静态资源
│   └── scripts/                      # PC 检查、回归、OCR 与打包工具
├── Auralis-Mobile/                   # Uni-app 手机 / 平板应用
│   ├── src/                          # 共享组件、Store、API、端侧服务与资源
│   │   └── pages/                    # mobile、tablet 与启动分流页面
│   └── scripts/                      # Mobile 协议与构建相关检查
├── Auralis-Server/                   # Spring Boot 后端
│   ├── src/main/java/                # com.auralis.app 领域模块
│   ├── src/main/resources/           # 应用配置、数据库迁移与资源
│   ├── src/test/                     # 测试源码与测试资源
│   ├── scripts/                      # 后端专项工具
│   └── .mvn/                         # Maven Wrapper 配置
├── scripts/                         # 跨端 OpenAPI、数据准备、对账与诊断工具
│   └── fixtures/                     # 工具使用的版本化测试材料
├── docs/                            # 唯一文档入口为 docs/README.md
├── .github/                         # GitHub workflow
├── docker-compose.yml               # 基础服务编排
├── docker-compose.overview-trace.yml # 显式开启的本机追踪 overlay
├── .env.example                     # 环境变量示例
└── AGENTS.md                        # 仓库 Agent 规则
```

各应用的 `package.json`、lockfile、`pom.xml`、Vite/TypeScript/Tauri 配置和 Dockerfile 保留在工具所需的位置。根 `scripts/` 服务跨模块任务，应用专属脚本放在对应应用的 `scripts/`；新脚本按调用范围归属，避免复制成多个入口。

模块内部完整目录和行为边界见 [PC](../modules/FrontendPC.md)、[Mobile / Tablet](../modules/FrontendMobileTablet.md)、[Server](../modules/Backend.md)。

## 本机生成目录与数据

以下路径可能随安装、开发或构建生成，通常由 Git 忽略；忽略规则不表示可以随意删除。

| 路径 | 用途与整理边界 |
| --- | --- |
| 应用 `node_modules/`、根 `.pnpm-store/` | 已安装依赖及包缓存；移动或清空可能破坏本机命令和依赖解析 |
| 根 `.ocr-runtime/` | OCR 打包使用的 Python 运行环境与依赖 |
| 根或应用 `build/`、应用 `dist/`、Server `target/`、Tauri `target/target-*` | 构建中间物和产物；先确认没有构建或运行进程使用，再按所属工具清理 |
| PC `public/file-viewer/`、Tauri `binaries/` 中的生成内容 | 文件预览与 OCR 桌面运行/打包资源，遵循生成脚本与资源清单管理 |
| 根 `data/` | 本机数据目录，先确认实际来源和恢复要求，不能作为普通缓存清理 |
| `.env`、各端 `.env.local` | 本机配置，保留原值，不提交真实凭据 |
| `.idea/`、`.vscode/` | 本机 IDE 配置，保留用户设置 |

基础 Compose 的 PostgreSQL 与 MinIO 实际使用 `auralis-postgres-data`、`auralis-minio-data` 命名卷，不依赖根 `data/` 作为统一持久化目录。数据和密钥备份、恢复方式见[基础设施](../modules/Infrastructure.md)与[Runbook](../operations/Runbook.md)。

Git worktree 位置以 `git worktree list` 为准。已登记 worktree 使用 Git 管理；未登记的旧副本先核对内容和引用，再按用户授权归置。临时实验材料与恢复副本应放在仓库外的任务目录，避免混入应用源码。

## 技术与开发入口

| 领域 | 当前技术 | 权威入口 |
| --- | --- | --- |
| PC | Vue 3、Vite、TypeScript、Pinia、Element Plus、Tauri 2 | [PC 模块](../modules/FrontendPC.md)及 `Auralis-PC/package.json` / Cargo 配置 |
| Mobile / Tablet | Uni-app、Vue、Pinia、TypeScript | [Mobile / Tablet 模块](../modules/FrontendMobileTablet.md)及 `Auralis-Mobile/package.json` |
| Server | Java 21、Spring Boot 4.1、Spring Modulith、Spring Data JPA、Flyway | [后端模块](../modules/Backend.md)及 `Auralis-Server/pom.xml` |
| 数据与资产 | PostgreSQL / pgvector、MinIO、端侧 SQLite / Storage | [基础设施](../modules/Infrastructure.md)、[数据库契约](../contracts/Database.md) |
| 交付 | Docker Compose、PC Web / Tauri、H5、微信小程序 | [部署指南](../operations/Deployment.md) |

开发和验证命令由各模块文档维护。前端使用各自 lockfile，后端使用仓库 Maven Wrapper；配置与基础服务启动步骤遵循部署指南。基础 Compose 服务为 `db`、`minio`、`minio-init`、`backend`、`frontend`。

本页不重复列出易漂移的版本、环境变量默认值和启动命令。Node/Rust/Java、目标平台与系统依赖要求以对应应用和部署文档为准；运行或重启已有服务前遵守仓库进程保护规则。

## 开发导航

- 文档与修改规则：[文档中心](../README.md)、[Agent 编码前协议](../agent/BeforeCoding.md)
- 当前进展与风险：[项目状态](../current/Status.md)、[问题和审查](../current/IssuesAndReview.md)
- 系统与产品：[系统架构](Architecture.md)、[产品需求](ProductRequirements.md)
- 接口与数据：[API](../contracts/API.md)、[数据库](../contracts/Database.md)
- 运行与排障：[部署指南](../operations/Deployment.md)、[Runbook](../operations/Runbook.md)

PC 登录守卫、后端测试源码和 OpenAPI workflow 已有实现；不能据源码存在推断业务验收通过。真实 Tauri、Mobile/Tablet 真机、外部 Provider、生产监控和备份恢复等边界统一在 current 文档维护。

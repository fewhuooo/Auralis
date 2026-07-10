# Auralis 项目总览

更新时间：2026-07-10

文档状态：现行

权威范围：项目定位、仓库结构、技术栈、运行入口与开发导航

事实来源：当前仓库目录、三个应用的依赖清单、Maven 配置与 Docker Compose

## 项目定位

Auralis 是面向学习场景的多端知识与任务工作台。PC、手机和平板共享账号、知识块、任务块、资产、同步和 AI 能力，但各端按设备特性承担不同交互职责：

- PC：信息组织、学科工作区、文件阅读、知识关系和重型编排。
- Mobile：快速捕获、日程、专注、复习、统计和随身 AI。
- Tablet：横向多栏学习工作区、文件批注、手写与大屏交互。
- Server：鉴权、业务数据、同步、资产、AI/RAG、对象存储和 WebSocket。

## 仓库结构

```text
Auralis/
├── Auralis-PC/       # Vue 3 + Vite + Tauri PC 客户端
├── Auralis-Mobile/   # Uni-app Mobile / Tablet 客户端
├── Auralis-Server/   # Spring Boot 后端
├── data/             # 本地容器持久化目录，不提交业务数据
├── docs/             # 现行文档与历史归档
├── docker-compose.yml
├── .env.example
└── AGENTS.md
```

## 技术栈

| 领域 | 当前技术 | 代码证据 |
| --- | --- | --- |
| PC | Vue 3.5、Vite 8、TypeScript 6、Pinia 3、Element Plus、Tauri 2.11.1 | `Auralis-PC/package.json`、`src-tauri/Cargo.toml` |
| Mobile / Tablet | Uni-app、Vue 3.4、Vite 5、Pinia 2、TypeScript 5 | `Auralis-Mobile/package.json` |
| Server | Spring Boot 3.2.5、Java 21、MyBatis Plus、JWT、LangChain4j | `Auralis-Server/pom.xml` |
| 数据 | PostgreSQL、Redis、本地 SQLite/Storage | Compose、Server 配置、Mobile services |
| AI 与资产 | Milvus、MinIO、LangChain4j、Apache Tika | Compose、Server config/service |
| 交付 | Docker Compose、PC Web/Tauri、H5、微信小程序 | 构建脚本与配置 |

依赖版本表只说明当前清单，不表示全部组合已经通过生产验收。

## 环境要求

| 工具 | 用途 | 要求 |
| --- | --- | --- |
| Node.js / npm | PC 与 Mobile 构建 | 使用能兼容各自 lockfile 和 Vite 的版本；变更版本前先验证构建 |
| Java 21 | 后端编译与运行 | `pom.xml` 的 `java.version=21` |
| Maven | 后端构建 | 可使用系统 `mvn` |
| Docker / Compose | 本地基础设施与容器部署 | 需能运行 PostgreSQL、Redis、MinIO、Milvus |
| Rust / Cargo | Tauri 开发与打包 | 仅 PC 桌面流程需要 |
| 微信开发者工具 | 微信小程序人工验收 | 命令行构建不能替代 |

## 快速启动

### 基础设施

```powershell
docker compose up -d db redis etcd minio milvus
```

### 后端

```powershell
cd Auralis-Server
mvn spring-boot:run
```

默认开发端口为 `8080`。开发 profile 默认连接本地 PostgreSQL、Redis、MinIO 和 Milvus。

### PC Web

```powershell
cd Auralis-PC
npm install
npm run dev
```

默认 Vite 开发地址通常为 `http://localhost:5173`。Tauri 使用 `npm run tauri dev`，需要 Rust 环境和系统 GUI。

### Mobile H5 / 微信小程序

```powershell
cd Auralis-Mobile
npm install
npm run dev:h5
npm run dev:mp-weixin
```

H5 和微信页面清单不同：微信构建通过条件编译排除 Tablet 页面。

## 配置入口

| 配置 | 路径 | 说明 |
| --- | --- | --- |
| Server 公共配置 | `Auralis-Server/src/main/resources/application.yml` | profile、上传限制、AI/Milvus 公共设置 |
| Server 开发配置 | `application-dev.yml` | 本地数据库、Redis、MinIO、AI 开发默认值 |
| Server 生产配置 | `application-prod.yml` | 环境变量注入；当前 AI 配置键仍需统一 |
| 容器编排 | `docker-compose.yml` | 服务、端口、volume 和本地默认凭据 |
| 环境变量示例 | `.env.example` | 当前主要列出 AI key，尚未覆盖全部生产变量 |
| Mobile 页面 | `Auralis-Mobile/src/pages.json` | 页面注册与微信条件编译 |
| Mobile feature flag | `Auralis-Mobile/src/config/features.ts` | Tablet 手写笔记等开关 |

## 开发导航

- 修改前：[Agent 编码前协议](../agent/BeforeCoding.md)
- 当前事实：[项目状态](../current/Status.md)
- 当前风险：[问题和审查](../current/IssuesAndReview.md)
- 系统边界：[系统架构](Architecture.md)
- 产品范围：[产品需求](ProductRequirements.md)
- 开发契约：[API](../contracts/API.md)、[数据库](../contracts/Database.md)
- 构建部署：[部署指南](../operations/Deployment.md)

## 当前边界

- PC 登录守卫在代码中临时关闭，不能按正式鉴权状态验收。
- Server 没有实际测试源码，`mvn test` 的成功不能代表业务覆盖。
- Mobile/Tablet 的命令行构建不能替代开发者工具、真机和触控验收。
- 生产密钥、默认密码、监控、备份与 CI/CD 仍需加固。
- Tablet 手写实现保留但默认受 feature flag 控制。

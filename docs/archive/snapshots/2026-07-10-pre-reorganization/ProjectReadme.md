> [!WARNING]
> 本文档为历史归档，仅用于追溯需求、设计与项目演进。它不是 Auralis 当前实现、状态、接口或任务的依据。开发者与 AI Agent 禁止依据本文恢复旧实现、判断当前完成度或创建当前任务；请从 `docs/README.md` 进入现行文档体系。

# Auralis 项目说明

更新时间：2026-07-02

## 项目简介

Auralis（Auralis）是一个面向学习与校园生产力场景的跨平台系统。系统以“知识块”和“任务块”为核心数据结构，结合 PC、移动端、平板端和 Spring Boot 后端，实现知识捕获、文档解析、任务排期、多端同步和 AI 辅助学习。

## 技术栈

| 子项目 | 技术栈 | 说明 |
| --- | --- | --- |
| `Auralis-PC` | Vue 3、Vite、TypeScript、Tauri、Pinia、Element Plus | PC 桌面端和 Web 前端 |
| `Auralis-Mobile` | Vue 3、Uni-app、TypeScript、Pinia | 手机端和平板端 |
| `Auralis-Server` | Spring Boot 3.2、Java 21、MyBatis Plus、LangChain4j | 后端业务、AI 编排、同步服务 |
| 基础设施 | PostgreSQL、Redis、Milvus、MinIO、pgAdmin | 元数据、缓存、向量库、对象存储 |

## 环境依赖

- JDK 21
- Maven 3.9+
- Node.js 18+ 或 20+
- npm
- Docker Desktop / Docker Compose
- 可选：Rust 与 Tauri 环境，用于 PC 桌面壳开发

## 快速启动

启动基础设施：

```powershell
docker compose up -d db redis etcd minio milvus pgadmin
```

启动后端：

```powershell
cd Auralis-Server
mvn spring-boot:run
```

启动 PC 前端：

```powershell
cd Auralis-PC
npm install
npm run dev
```

构建 PC 前端：

```powershell
cd Auralis-PC
npm.cmd run build
```

启动 Mobile H5：

```powershell
cd Auralis-Mobile
npm install
npm run dev:h5
```

构建 Mobile H5：

```powershell
cd Auralis-Mobile
npm.cmd run build:h5
```

后端验证：

```powershell
cd Auralis-Server
mvn test
```

## 目录结构

```text
Auralis/
├── docs/                # 当前推荐维护的文档体系
│   └── archive/         # 历史文档归档
├── Auralis-PC/        # PC 前端 / Tauri 桌面端
├── Auralis-Mobile/    # Uni-app 移动端和平板端
├── Auralis-Server/    # Spring Boot 后端
├── data/                # 本地 Docker 数据卷
├── docker-compose.yml   # 本地基础设施和前后端容器编排
├── .env.example         # 环境变量示例
└── AGENTS.md            # Agent 编码前入口说明
```

历史项目概览已归档到 `docs/archive/PROJECT_OVERVIEW.md`。

## 当前构建状态

| 模块 | 状态 | 证据 | 备注 |
| --- | --- | --- | --- |
| 后端 | 已构建待验收 | `mvn test` 通过 | 当前没有测试源码，只能证明编译和测试阶段通过 |
| PC 前端 | 已构建待验收 | `npm.cmd run build` 通过 | 页面仍在重构，登录守卫临时关闭 |
| Mobile H5 | 已构建待验收 | `npm.cmd run build:h5` 通过 | 仍有动态导入和 Sass legacy API 警告，平板页面在重构 |

## 已知风险

- PC 登录守卫临时关闭，正式验收前必须恢复。
- Mobile / Tablet 页面正在重构，页面目录和 `pages.json` 需要收口。
- 后端缺少 Auth、Asset、Sync 等关键路径测试。
- 直接 CRUD 删除和同步软删除语义仍需统一。
- MinIO 绑定还需要校验对象真实存在、大小和 content-type。
- CI/CD 配置尚未进入仓库。
- WebSocket 二次鉴权和 AI/RAG 质量仍需联调验收。
- `application-prod.yml` 需要统一 LangChain4j 配置口径。

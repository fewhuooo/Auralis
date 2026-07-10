> [!WARNING]
> 本文档为历史归档，仅用于追溯需求、设计与项目演进。它不是 Auralis 当前实现、状态、接口或任务的依据。开发者与 AI Agent 禁止依据本文恢复旧实现、判断当前完成度或创建当前任务；请从 `docs/README.md` 进入现行文档体系。

# 开发与提交规范

更新时间：2026-07-02

## 代码风格

## Agent 编码前置要求

任何 Agent 在写代码前必须先阅读：

1. `docs/AgentBeforeCoding.md`
2. `docs/StatusIndex.md`
3. `docs/CurrentIssuesAndReview.md`
4. 本次改动对应模块文档。

实现完成后，必须按影响范围回写需求、接口、数据库、状态或 Changelog 文档。

### 前端

- 使用 Vue 3 Composition API 和 TypeScript。
- 页面放在 `views/` 或 `pages/`，通用组件放在 `components/`。
- API 请求封装在 `src/api/`，状态管理放在 `src/store/`。
- Store 负责业务状态和本地缓存协调，页面组件尽量只负责交互与展示。
- 避免在组件中硬编码后端地址，统一使用请求封装或 Vite 代理。
- 复杂交互应优先拆成组件或 composable，避免单文件无限膨胀。
- 前端重构期间，新增/删除页面必须同步核对路由、导航、Store 和 API 调用。
- PC 端正式验收前必须恢复登录路由守卫。
- Mobile / Tablet 页面目录和 `pages.json` 必须保持一致。

### 后端

- Controller 只处理请求参数、鉴权上下文和响应包装。
- Service 负责业务逻辑和事务边界。
- Mapper 只负责数据访问。
- Entity 对应数据库表结构，跨接口输入输出建议使用 DTO。
- 所有用户数据访问必须显式按 `userId` 隔离。
- 新增受保护接口必须经过 `AuthInterceptor`，除非明确属于 `/api/auth/**`。

## Git 分支规范

建议分支：

- `main`：稳定主干。
- `develop`：日常集成分支。
- `feature/<name>`：新功能。
- `fix/<name>`：缺陷修复。
- `docs/<name>`：文档整理。
- `chore/<name>`：依赖、构建、配置等维护工作。

## Commit Message 规范

建议格式：

```text
<type>(<scope>): <summary>
```

常用类型：

- `feat`：新增功能。
- `fix`：修复问题。
- `docs`：文档变更。
- `refactor`：重构。
- `test`：测试。
- `chore`：构建、依赖、配置等维护。

示例：

```text
docs(demand): add v3 documentation index
fix(auth): reject refresh token on protected api
feat(asset): validate asset ownership before binding
```

## 提交流程

- 提交前确认没有误改用户未提交内容。
- 前端改动至少运行对应构建命令。
- 后端改动至少运行 `mvn test`。
- 接口变更必须同步更新 `APIManifest.md`。
- 数据库表结构变更必须同步更新 `DatabaseDesign.md`。
- 部署配置变更必须同步更新 `DeploymentGuide.md`。
- 发现新问题或修复关键问题时，必须同步更新 `CurrentIssuesAndReview.md` 和 `Changelog.md`。

## 待补自动化

仓库当前未发现统一 CI/CD 配置。建议后续补充：

- PC 前端构建检查。
- Mobile H5 构建检查。
- 后端 Maven 测试。
- Markdown 链接检查。
- 后端关键路径集成测试。

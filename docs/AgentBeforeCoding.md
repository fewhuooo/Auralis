# Agent 写代码前必读

更新时间：2026-07-02
适用对象：所有参与 Auralis 代码修改、审查、文档维护的 Agent。

## 必读顺序

每次写代码前必须先读：

1. `docs/README.md`
2. `docs/StatusIndex.md`
3. `docs/CurrentIssuesAndReview.md`
4. 本次任务对应模块文档：
   - PC 前端：`docs/FrontendPC.md`
   - Mobile / Tablet：`docs/FrontendMobileTablet.md`
   - 后端：`docs/Backend.md`
   - 基础设施：`docs/InfrastructureAndData.md`
5. 涉及接口或数据库时，再读：
   - `docs/APIManifest.md`
   - `docs/DatabaseDesign.md`

如果需求与文档冲突，先以用户最新消息为准，同时在改动后回写相关文档。

## 当前项目判断

- 这是 Spring Boot + Vue 的前后端项目。
- PC 端是 `Auralis-PC`，使用 Vue 3、Vite、Pinia、Element Plus、Tauri。
- Mobile 端是 `Auralis-Mobile`，使用 Uni-app，手机端和平板端页面正在重构。
- 后端是 `Auralis-Server`，使用 Spring Boot、MyBatis Plus、JWT、LangChain4j、PostgreSQL、Redis、Milvus、MinIO。
- 当前前端页面仍在重构中，看到页面删除、新增、路由调整时，先判断是否属于重构范围，不要直接恢复旧页面。

## 写代码前检查清单

- 明确本次修改属于 PC、Mobile、Backend、Infra、Docs 中哪一类。
- 先查现有实现，不凭空新增平行结构。
- 不移动或删除原始需求文档，除非用户明确要求。
- 保护用户已有改动，不做 `git reset`、`git checkout --` 等破坏性操作。
- 前端重构期间，优先保持路由、页面、Store、API 调用的一致性。
- 后端接口修改必须同步 `APIManifest.md`。
- 数据结构修改必须同步 `DatabaseDesign.md`。
- 状态变化必须同步 `StatusIndex.md` 和 `DevelopmentPlan.md`。

## 简单代码审查清单

每次实现后至少检查：

- 构建是否能跑通，或说明未运行原因。
- 鉴权是否被绕过，尤其是 PC 路由守卫、后端 access / refresh token、WebSocket。
- 用户数据是否按 userId 隔离，尤其是资产、同步、知识块、任务块。
- 前端页面是否仍引用已删除路由、已删除页面或旧 Store 字段。
- API 请求参数是否和后端 Controller 一致。
- 错误状态是否给用户可理解反馈。
- 新增文档是否在 `docs/README.md` 中登记。

## 当前高风险提醒

- `Auralis-PC/src/router/index.ts` 中登录守卫目前临时放开，不能按正式安全状态验收。
- `Auralis-Mobile/src/pages/tablet` 正在重构，旧 `asset`、`timeline` 平板页已删除，新 `pomodoro`、`review`、`stats` 等页面出现或计划接入。
- `Auralis-Server/src/main/resources/application-prod.yml` 仍有 `spring.ai.openai` 旧配置口径，需和 LangChain4j 配置统一。
- 后端 `mvn test` 曾通过，但当前缺少真实测试源码，不能代表业务逻辑已验收。
- 旧 `page_api_manifest.md` 等历史文件已从工作区移除；如确需参考，应从 Git 历史恢复到归档目录。

## 完成后必须回写

如果本次改动涉及代码，按影响范围更新：

- 需求或验收变化：`ProductRequirementsDocument.md`
- 架构或模块边界变化：`ArchitectureDesign.md`
- PC 页面变化：`FrontendPC.md`
- Mobile / Tablet 页面变化：`FrontendMobileTablet.md`
- 后端模块变化：`Backend.md`
- 接口变化：`APIManifest.md`
- 数据库变化：`DatabaseDesign.md`
- 状态和风险变化：`StatusIndex.md`、`CurrentIssuesAndReview.md`
- 发布变化：`Changelog.md`

# Agent 编码前协议

更新时间：2026-07-10

文档状态：现行

权威范围：所有开发者与编码 Agent 的指令优先级、必读流程、禁止事项、强制回写、证据与交接格式

事实来源：`AGENTS.md`、`docs/design/DocumentationArchitecture.md` 与当前仓库结构

## 规范用语

- **必须**：不可跳过；未满足时禁止声明任务完成。
- **禁止**：任何开发者或 Agent 都不得执行。
- **应当**：默认执行；偏离时必须说明冲突和理由。
- **可以**：可选行为，不影响完成判定。

## 指令优先级

1. 用户在当前任务中的最新明确要求。
2. 根目录 `AGENTS.md`。
3. 本文件。
4. 对应模块、契约和设计权威文档。
5. `docs/plans/` 中已批准的详细实施计划。
6. `docs/planning/` 中的任务总览和领域计划。
7. `docs/showcase/` 和 `docs/archive/`。

展示和归档不能覆盖当前代码或现行文档。代码与现行文档冲突时，必须核实代码、指出差异并同步修正文档。

## 任务分类与必读矩阵

所有修改任务都必须先读：

1. [当前状态](../current/Status.md)
2. [问题和审查](../current/IssuesAndReview.md)
3. 下表对应文档

| 任务领域 | 额外必读 |
| --- | --- |
| PC | `modules/FrontendPC.md`、`design/Frontend.md` |
| Mobile / Tablet | `modules/FrontendMobileTablet.md`、`design/Frontend.md`、`contracts/MobilePagesAPIMap.md` |
| 后端 | `modules/Backend.md`、`contracts/API.md` |
| 数据与同步 | `contracts/Database.md`、`modules/Backend.md` |
| 基础设施与发布 | `modules/Infrastructure.md`、`operations/Deployment.md`、`operations/Runbook.md` |
| 产品或架构 | `project/ProductRequirements.md`、`project/Architecture.md` |
| 仅文档 | `README.md` 与所有受影响权威文档 |

## 开始前必须完成

- 明确任务领域、目标、范围和完成定义。
- 运行 `git status --short`，识别并保护用户已有修改。
- 检查当前实现，确认应修改的既有文件、接口和数据流。
- 检查现行文档，确认该事实的唯一权威位置。
- 若工作树较脏或改动范围较大，说明隔离策略；禁止通过还原工作树制造“干净环境”。
- 若任务依赖 GUI、设备、外部服务、密钥或权限，提前标记人工验收边界。

## 修改中必须遵守

- 优先修改现有实现，禁止无依据创建平行目录、Store、API、模型或重复文档。
- 只改任务范围内文件；遇到无关问题应记录，不得顺手扩大范围。
- 接口、数据、路由、配置和状态变化应当在同一任务中同步权威文档。
- 失败时记录真实错误；禁止为让报告显示通过而隐藏、跳过或伪造验证。
- 用户新增要求覆盖旧计划时，必须更新计划和受影响设计，不能只改代码。
- 当前工程决策：对于用户明确弃用的版本、字段、缓存格式或代码路径，直接删除兼容分支，只接受现行契约；不得保留隐式回退、格式转换或双写。必须在模块/契约与状态文档说明旧数据的处理（例如忽略并在联网后重建），若会实际删除用户数据则仍须先取得该删除操作的明确授权。

## 完成前必须回写

| 变化 | 必须回写 |
| --- | --- |
| 产品范围、验收条件 | `project/ProductRequirements.md` |
| 系统边界、关键数据流 | `project/Architecture.md` |
| 页面、交互、视觉 | `design/Frontend.md` |
| PC 实现 | `modules/FrontendPC.md` |
| Mobile / Tablet 实现 | `modules/FrontendMobileTablet.md` |
| 后端实现 | `modules/Backend.md` |
| 基础设施 | `modules/Infrastructure.md` |
| API | `contracts/API.md` |
| 数据结构、同步字段 | `contracts/Database.md` |
| Mobile 页面调用 | `contracts/MobilePagesAPIMap.md` |
| 状态或风险 | `current/Status.md`、`current/IssuesAndReview.md` |
| 部署与排障 | `operations/Deployment.md`、`operations/Runbook.md` |
| 已批准的跨模块实施方案 | `plans/` 对应详细计划 |
| 未来任务和领域待办 | `planning/` 对应计划 |
| 已发生变化 | `release/Changelog.md` |

## 禁止事项

- 禁止依据 `archive/` 恢复旧页面、旧路由、旧配置、旧任务或 StudyCore 命名。
- 禁止把 `showcase/` 的宣传表述写成工程事实。
- 禁止执行 `git reset --hard`、`git checkout --` 等覆盖用户修改的命令，除非用户明确要求该具体操作。
- 禁止把 refresh token 当作普通 access token 使用或绕过现有鉴权边界。
- 禁止忽略 `userId` 数据隔离、软删除语义和同步版本字段。
- 禁止把“代码存在”“编译通过”“测试通过”“人工验收”统称为“完成”。
- 禁止声称运行过未实际执行的命令。
- 禁止新增未登记到 `docs/README.md` 的现行文档。

## 证据格式

### 代码确认

```text
结论：代码中已存在该能力
证据：相对路径 + 类/函数/路由/配置项
限制：未运行的测试、GUI、设备或外部服务
```

### 命令验证

```text
日期：YYYY-MM-DD
命令：完整命令
结果：退出码与关键输出
范围：该命令实际证明的内容
不证明：不能由该命令推断的人工验收
```

### 风险

```text
优先级：P0 / P1 / P2
证据：当前代码或配置路径
影响：具体失败模式
处理：下一项可执行动作
关闭条件：证明风险已关闭所需证据
```

## 最终交接模板

```text
完成内容：本轮实际完成的结果
修改文件：按领域列出文件
验证命令：只列实际执行的命令
验证结果：通过、失败或受限，并给出关键输出
文档回写：列出已同步的权威文档
剩余风险：仍未关闭的问题和关闭条件
人工验收：GUI、真机、外部服务或产品确认事项
工作树保护：确认用户既有改动是否保持未覆盖
```

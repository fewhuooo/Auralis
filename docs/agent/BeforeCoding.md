# Agent 编码前协议与检查清单

更新时间：2026-11-16

文档状态：现行

权威范围：指令优先级、任务必读矩阵、验证节奏矩阵、文档回写矩阵、Git 提交检查清单与标准证据/交接模板

事实来源：`AGENTS.md`、`docs/README.md` 与当前仓库结构

> 工程红线、分支与分步原子提交纪律、根因与影响闭包门禁及代码规范统一维护在根目录 [AGENTS.md](../../AGENTS.md)，本文件仅保留执行速查表、矩阵与交接模板。

## 规范用语与指令优先级

- **必须**：不可跳过；未满足时禁止声明任务完成。
- **禁止**：任何开发者或 Agent 都不得执行。
- **应当**：默认执行；偏离时必须说明冲突和理由。
- **可以**：可选行为，不影响完成判定。

冲突裁决顺序（由高到低）：

1. 用户在当前任务中的最新明确要求。
2. 根目录 `AGENTS.md`。
3. 本文件。
4. `modules/`、`contracts/`、`project/` 中的对应权威文档。
5. `current/RoadmapAndGates.md` 中的工作优先级、领域收口清单与门禁要求。
6. `docs/archive/`（含历史设计、实施方案、快照、实验与展示材料，仅作追溯，不作当前依据）。

## 任务分类与必读矩阵

所有修改任务都必须先读：

1. [当前状态](../current/Status.md)
2. [问题和审查](../current/IssuesAndReview.md)
3. 下表对应领域的额外文档

| 任务领域 | 额外必读 |
| --- | --- |
| PC | `modules/FrontendPC.md`、`project/FrontendDesign.md` |
| Mobile / Tablet | `modules/FrontendMobileTablet.md`、`project/FrontendDesign.md` |
| 后端 | `modules/Backend.md`、`contracts/API.md`（涉 Chat 流式/工具协议时读 `contracts/chat-runtime-api.md`） |
| 数据与同步 | `contracts/Database.md`、`modules/Backend.md` |
| 基础设施与发布 | `modules/Infrastructure.md`、`operations/Deployment.md`、`operations/Runbook.md` |
| 产品或架构 | `project/ProductRequirements.md`、`project/Architecture.md` |
| 仅文档 | `README.md` 与所有受影响权威文档 |

### 小改动的读法

同时满足以下条件的改动视为小改动：

- 只在单一模块内；
- 不涉及接口、数据结构、同步字段、路由、Store、模块边界或鉴权；
- 不改变 `Status.md`、`IssuesAndReview.md` 中记录的状态或风险。

小改动必须读本文件和对应模块文档。`Status.md` 与 `IssuesAndReview.md` 可以按任务关键词检索相关条目，不必通读，但必须确认没有与改动冲突的 frozen 区域或已知问题。不满足上述任一条件的改动按完整矩阵阅读。

## 验证节奏

每个任务按阶段或闭环在编辑完成后统一做一轮验证，不在编辑中间反复跑全套检查；**验证后只要补充修改了任何源码或测试，前次结果立即作废，必须对最终落盘代码重跑对应验证**。

- **执行顺序（由快到慢）**：类型检查 / 静态检查 → 与影响闭包对应的行为测试 → OpenAPI / SDK 一致性（如涉接口）→ 构建。前一步失败，先完整归因修复再进入下一步。
- **范围选择矩阵**：

| 改动类型 | 必须运行的检查 |
| --- | --- |
| 纯文档、注释、文案 | 不跑应用测试；检查文档目录登记、相对链接/锚点与 `git diff --check` |
| 前端局部（单组件、样式、单个 Store） | 对应端 `type-check` / 静态检查 + 对应行为回归测试 |
| 后端单模块 | 静态检查 + 对应单元测试 / 集成测试 |
| API / DTO / OpenAPI 契约变更 | `scripts/generate-openapi-sdk.ps1` 或 `scripts/check-openapi.ps1` + 双端 `type-check` + 对应后端与前端消费者测试 |
| 公共模块、依赖、配置、数据库契约、鉴权、同步字段 | 对应定向回归 + 全量测试（逐项核对基线差量）+ 构建 |

- **高风险例外**：涉及架构、并发、鉴权、加密、迁移、敏感数据的变化须扩大验证范围，并在交接中说明原因。
- **失败处理**：先完整阅读失败输出并区分「本轮回归」与「`IssuesAndReview.md` 既有基线」，一次性修复同类问题后再重跑；同一失败最多重试 3 次，之后停止并汇报。子代理同样遵守本节。
- **用户另有要求时**：用户在当前任务中明确指定验证范围时按用户要求执行，并在交接中写明“未运行：原因”。

## 完成前必须回写

回写在每步改动验证通过后统一进行；仅当下表对应变化实际发生时才回写，不为“核对”而重读或重写没有变化的文档。除 `docs/README.md` 外，新增现行文档必须落入 6 个分类目录（`agent/`、`project/`、`current/`、`modules/`、`contracts/`、`operations/`），附带四项元数据并登记到 `docs/README.md`。

| 变化 | 必须回写 |
| --- | --- |
| 产品范围、验收条件 | `project/ProductRequirements.md` |
| 系统边界、关键数据流 | `project/Architecture.md` |
| 页面、交互、视觉 | `project/FrontendDesign.md` |
| 用户操作说明 | `project/UserManual.md` |
| PC 实现 | `modules/FrontendPC.md` |
| Mobile / Tablet 实现与页面调用 | `modules/FrontendMobileTablet.md` |
| 后端实现 | `modules/Backend.md` |
| 基础设施 | `modules/Infrastructure.md` |
| API / Chat 协议 | `contracts/API.md`、`contracts/chat-runtime-api.md` |
| 数据结构、同步字段 | `contracts/Database.md` |
| 状态、风险或路线门禁 | `current/Status.md`、`current/IssuesAndReview.md`、`current/RoadmapAndGates.md` |
| 部署与排障 | `operations/Deployment.md`、`operations/Runbook.md` |
| 发布相关变化 | `operations/Changelog.md` |

## Git 分支、Commit 格式与提交前检查表

- **分支命名**：功能开发与修复分支使用 `<type>/<topic>`（常用 `feat/<topic>`、`fix/<topic>`、`refactor/<topic>`、`docs/<topic>`，小写短语与连字符，如 `fix/pc-encryption-recovery`）；未获明确许可不直接在 `main` 上连续堆叠多步实现。
- **Commit 格式**：`<type>(<scope>): <summary>`（常用 type：`feat`、`fix`、`docs`、`refactor`、`test`、`build`、`chore`），summary 使用祈使语义，一个提交只表达一个可独立验证和回退的结果。
- **本地提交前 6 项检查表**：
  1. 本步对应类型/静态检查与行为测试已基于最终落盘代码通过（基线失败须确认非本步引入）。
  2. 仅通过 `git add -- <paths>` 暂存本步明确路径，严禁 `git add -A` / `git add .`。
  3. 检查 `git diff --cached --name-status`，确认只包含本步职责文件，未夹带用户无关改动或死代码。
  4. `git diff --cached --check` 无新增空白错误。
  5. 受影响的契约、SDK 与权威文档已同步（可与代码同提交或按职责拆为紧邻提交）。
  6. 仅执行本地 `git commit`，未获明确指令禁止 `git push`。

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

- 证据记录针对最终落盘代码的最后一次运行；同一任务内已修复的中间失败在交接中一句话带过。
- 最终仍未解决的失败，必须完整记录真实错误与基线差异。

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
完成内容：本轮实际完成的结果（含需求未写明时所做的假设）
修改文件：按领域列出文件
提交基线：本轮分支名与分步本地 commit 哈希/消息（未提交时写明隔离边界与原因）
验证命令：只列基于最终落盘代码实际执行的命令
验证结果：通过、失败或受限，并给出关键输出与基线差量说明
未运行的检查：检查项 + 原因（按验证节奏无需运行的写“未运行：原因”）
文档回写：列出已同步的权威文档
剩余风险：仍未关闭的问题和关闭条件
人工验收：GUI、真机、外部服务或产品确认事项
工作树保护：确认用户既有改动是否保持未覆盖
```

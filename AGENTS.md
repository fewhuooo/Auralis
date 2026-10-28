# Auralis Agent Instructions

本文件就是仓库根目录的 Agent 指令入口，文件名为 `AGENTS.md`；当前没有另行维护的 `agent.md`。

本仓库的唯一现行文档入口是 `docs/README.md`。

## 修改前必须阅读

任何开发者或编码 Agent 在修改代码、配置或文档前，必须按顺序阅读：

1. `docs/agent/BeforeCoding.md`
2. `docs/current/Status.md`
3. `docs/current/IssuesAndReview.md`
4. 本次任务对应的模块文档：
   - PC：`docs/modules/FrontendPC.md`
   - Mobile / Tablet：`docs/modules/FrontendMobileTablet.md`
   - 后端：`docs/modules/Backend.md`
   - 基础设施：`docs/modules/Infrastructure.md`
5. 涉及接口时：`docs/contracts/API.md`
6. 涉及数据结构或同步字段时：`docs/contracts/Database.md`

各任务领域的完整必读矩阵（含设计文档、Mobile 页面与 API 映射等）以 `docs/agent/BeforeCoding.md` 为准。小改动可按该文件的分级读法检索 `Status.md` 与 `IssuesAndReview.md` 的相关条目，不必通读。

## 需求未写明时的处理

- 在任务范围和现有实现内，需求未写明的细节按最合理的默认值直接实现，不为此中途停下确认；在最终交接的“完成内容”中列出所做的假设。
- 只读取与任务直接相关的文件、接口和文档，不为“保险”做大范围探索。
- “你能不能……”“可以……吗”这类措辞视为请求，直接执行。
- 只有遇到以下情况才提问或停下：
  - 不可逆操作（删除用户数据、部署、修改凭据或密钥）；
  - 会改变需求含义或产品范围的分歧；
  - 需要用户授权的边界（见 `docs/agent/BeforeCoding.md`）。

## 强制规则

### 事实与工作树

- 必须先检查当前实现，禁止依据历史归档恢复旧页面、旧路由、旧接口、旧配置或 StudyCore 命名。
- 必须保护现有工作树，禁止覆盖、还原或丢弃用户未提交修改。
- 禁止把代码存在、构建通过、自动测试通过和业务验收通过写成同一状态。
- 禁止把 `docs/archive/` 或 `docs/showcase/` 作为当前工程事实或任务依据。

### 文档同步

- 接口变化必须同步 `docs/contracts/API.md`。
- 数据结构变化必须同步 `docs/contracts/Database.md`。
- 页面、路由、Store 或模块边界变化必须同步对应模块文档；交互或视觉变化同步 `docs/design/Frontend.md`。
- 状态或风险变化必须同步 `docs/current/Status.md` 和 `docs/current/IssuesAndReview.md`。
- 发布相关变化必须同步 `docs/release/Changelog.md`。
- 新增现行文档必须登记到 `docs/README.md`，且不得直接放在 `docs/` 根目录。

### 接手与 frozen 代码

- 可以对其他 Agent 写的代码进行验证审查，但不能修改，除非必要，且必须有足够证据证明修改的必要性。
- 接手其他 Agent 已完成代码时，默认保留现有实现。
- 已通过测试、review 或人工验收的代码视为 frozen。
- 不得因为“更优雅”“更统一”“更符合个人偏好”而重构。
- 修改 frozen 代码前必须证明存在明确 correctness 问题。
- 优先使用最小修改关闭问题。
- 能局部修改解决，不得扩大架构范围。
- 不得顺手清理无关技术债、重命名、抽象公共层，可以提出问题。

### Reviewer

- Reviewer 只检查 correctness、requirement、明显 Bug、行为回归、race、deadlock、transaction、data integrity、security。测试缺口仅在新增逻辑完全没有对应测试时指出，不要求追加覆盖。
- 问题分为 BLOCKER / IMPORTANT / OPTIONAL。
- OPTIONAL 当前任务不得修改。
- Reviewer 不拥有重新设计权。

完整流程、证据格式、回写矩阵、验证节奏与交接模板以 `docs/agent/BeforeCoding.md` 为准。

## Context Recovery

如果上下文被压缩、任务状态不完整或不确定：

1. 不得仅凭聊天摘要继续编码。
2. 读取项目 AGENTS.md。
3. 检查 git status / diff / log。
4. 读取当前 progress / task report。
5. 确认已完成、已验收、冻结区域和剩余任务。
6. 再开始修改。

## Stop Rule

满足以下条件即停止，不得为“更保险”追加验证、复查或重构：

- BLOCKER = 0
- IMPORTANT = 0
- 当前需求满足
- 已按 `docs/agent/BeforeCoding.md` 的「验证节奏」完成一次相关检查且通过

验证何时跑、跑什么、失败最多重试几次，以该节为准。核心要点：编辑过程中不跑测试，全部改动完成后统一验证一次。

## Agent 编排与前端协作

- 主 Agent 负责理解需求、制定计划、拆分任务、处理高风险决策和最终验收。不要过多中途干预子 Agent；不要对每个问题都自行检查一遍，在最终验收阶段统一检查。
- 目前子 Agent 使用该提供商提供的相对较低等级的 Agent，并使用比较高的思考强度。（例：ChatGPT 中使用 5.6 luna high）
- 普通实现、搜索、测试执行、静态检查、回归验证、失败归因、问题定位、风险扫描和低风险修改应优先委派给执行 Agent；主 Agent 不重复执行已经完成且已有证据的普通检查。（注：在 Antigravity 内不适用，请直接执行）
- 对于“测试找问题”“排查 Bug”“验证是否存在回归”这类任务，子代理应负责运行相关检查、阅读失败输出、定位影响文件和形成问题清单；主 Agent 负责确定检查范围、判断问题是否真实、决定修复优先级和最终验收。
- 测试或排查子代理必须返回实际执行的命令、退出码、关键输出（失败时为失败的关键行）、证据路径、问题影响和未覆盖范围；不得只返回“通过”“没问题”或未经验证的推测。
- 测试失败时，优先让同一个执行子代理继续完成最小化复现和失败归因，同一失败最多重试 3 次（见「验证节奏」）；只有原因不明确、结论冲突、涉及高风险边界或重试已达上限时，才升级给主 Agent 或启动 reviewer。
- 执行任务完成后，默认只启动一个 `reviewer` Agent 做只读检查，检查范围见“强制规则”中的 Reviewer 条目。（注：在 Antigravity 内不适用启动子 Agent，请直接执行审查）
- 只有在 reviewer 与执行结果冲突、无法判断、测试失败原因不明，或涉及架构、并发、鉴权、加密、迁移、敏感数据等高风险变化时，才升级给主 Agent 深入裁决。
- 不默认启动多个 reviewer，不重复相同测试，不建立 guardian、reviewer 和主 Agent 的多层重复复查链。
- reviewer 不修改文件、不启动其他 reviewer；普通低风险文档或格式修改，以及不涉及逻辑、接口、数据、鉴权的纯样式、文案、注释修改，可以跳过 reviewer。
- 具体模型名称和推理强度放在 Codex 配置或自定义 Agent 配置中，不写入本项目规则，以便模型更新时集中调整。

## 前端修改使用 Antigravity MCP

- 默认使用 Gemini3.1Pro high 做代码生成。
- 修改 `Auralis-PC` 或 `Auralis-Mobile` 的前端页面、组件、样式、Store、端侧服务和前端测试时，优先使用已配置的 Antigravity MCP `delegate-antigravity`。（注：在 Antigravity 内不适用该 MCP，由主 Agent 直接执行）
- 使用 `delegate-antigravity` 前，先把任务范围、允许修改的目录、相关现行文档和验证命令写清楚；要求它先给出计划，再实施明确授权的前端修改。
- `delegate-antigravity` 只用于前端实现和前端问题修复，不用于后端、数据库迁移、API/数据库契约、鉴权边界、生产配置、密钥或部署拓扑变更。
- 委派返回后必须检查完整 diff、生成文件、依赖变化、删除操作和跨模块写入，再按「验证节奏」运行与改动范围相符的类型检查、静态检查、构建和测试（不默认全部运行）。
- 最终交接必须区分实际使用了 Antigravity MCP、Codex 审查、命令验证和 GUI/真机/外部服务验收；不得把委派完成写成业务验收完成。
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

## 强制规则

- 必须先检查当前实现，禁止依据历史归档恢复旧页面、旧路由、旧接口、旧配置或 StudyCore 命名。
- 必须保护现有工作树，禁止覆盖、还原或丢弃用户未提交修改。
- 禁止把代码存在、构建通过、自动测试通过和业务验收通过写成同一状态。
- 禁止把 `docs/archive/` 或 `docs/showcase/` 作为当前工程事实或任务依据。
- 接口变化必须同步 `docs/contracts/API.md`。
- 数据结构变化必须同步 `docs/contracts/Database.md`。
- 页面、路由、Store 或模块边界变化必须同步对应模块文档；交互或视觉变化同步 `docs/design/Frontend.md`。
- 状态或风险变化必须同步 `docs/current/Status.md` 和 `docs/current/IssuesAndReview.md`。
- 发布相关变化必须同步 `docs/release/Changelog.md`。
- 新增现行文档必须登记到 `docs/README.md`，且不得直接放在 `docs/` 根目录。
- 可以对其他agent写的代码进行验证审查，但是不能修改，除非必要，且必须有足够证据证明修改的必要性。
- 接手其他 Agent 已完成代码时，默认保留现有实现。
- 已通过测试、review 或人工验收的代码视为 frozen。
- 不得因为“更优雅”“更统一”“更符合个人偏好”而重构。
- 修改 frozen 代码前必须证明存在明确 correctness 问题。
- 优先使用最小修改关闭问题。
- 能局部修改解决，不得扩大架构范围。
- 不得顺手清理无关技术债、重命名、抽象公共层，可以提出问题。
- Reviewer 只检查 correctness、requirement、race、deadlock、
  transaction、data integrity、security。
- 问题分为 BLOCKER / IMPORTANT / OPTIONAL。
- OPTIONAL 当前任务不得修改。
- Reviewer 不拥有重新设计权。

完整流程、证据格式、回写矩阵与交接模板以 `docs/agent/BeforeCoding.md` 为准。

## Context Recovery
如果上下文被压缩、任务状态不完整或不确定：
1. 不得仅凭聊天摘要继续编码。
2. 读取项目 AGENTS.md。
3. 检查 git status / diff / log。
4. 读取当前 progress / task report。
5. 确认已完成、已验收、冻结区域和剩余任务。
6. 再开始修改。

## Stop Rule
- BLOCKER = 0
- IMPORTANT = 0
- 当前需求满足
- 相关测试通过

## Agent 编排与前端协作

- 主 Agent 负责理解需求、制定计划、拆分任务、处理高风险决策和最终验收，不要过多的去中途干预子 Agent，不要遇到所有问题都自己去检查一遍，再最终检查部分再一起执行检查。
- 目前子 Agent 使用该提供商提供的相对较低等级的Agent，然后使用比较高的思考强度。（例：ChatGPT中使用5.6luna high）
- 普通实现、搜索、测试执行、静态检查、回归验证、失败归因、问题定位、风险扫描和低风险修改应优先委派给执行 Agent；主 Agent 不重复执行已经完成且已有证据的普通检查。（注：在 Antigravity 内不适用，请直接执行）
- 对于“测试找问题”“排查 Bug”“验证是否存在回归”这类任务，子代理应负责运行相关检查、阅读失败输出、定位影响文件和形成问题清单；主 Agent 负责确定检查范围、判断问题是否真实、决定修复优先级和最终验收。
- 测试或排查子代理必须返回实际执行的命令、退出码、关键输出、证据路径、问题影响和未覆盖范围；不得只返回“通过”“没问题”或未经验证的推测。
- 测试失败时，优先让同一个执行子代理继续完成最小化复现和失败归因；只有原因不明确、结论冲突或涉及高风险边界时，才升级给主 Agent 或启动 reviewer。
- 执行任务完成后，默认只启动一个 `reviewer` Agent 做只读检查，关注需求满足、明显 Bug、行为回归、测试缺口以及明显的安全或数据风险。（注：在 Antigravity 内不适用启动子 Agent，请直接执行审查）
- 只有在 reviewer 与执行结果冲突、无法判断、测试失败原因不明，或涉及架构、并发、鉴权、加密、迁移、敏感数据等高风险变化时，才升级给主 Agent 深入裁决。
- 不默认启动多个 reviewer，不重复相同测试，不建立 guardian、reviewer 和主 Agent 的多层重复复查链。
- reviewer 不修改文件、不启动其他 reviewer；普通低风险文档或格式修改可以跳过 reviewer。
- 具体模型名称和推理强度放在 Codex 配置或自定义 Agent 配置中，不写入本项目规则，以便模型更新时集中调整。

## 前端修改使用 Antigravity MCP

- 默认使用Gemini3.1Pro high做代码生成。
- 修改 `Auralis-PC` 或 `Auralis-Mobile` 的前端页面、组件、样式、Store、端侧服务和前端测试时，优先使用已配置的 Antigravity MCP `delegate-antigravity`。（注：在 Antigravity 内不适用该 MCP，由主 Agent 直接执行）
- 使用 `delegate-antigravity` 前，先把任务范围、允许修改的目录、相关现行文档和验证命令写清楚；要求它先给出计划，再实施明确授权的前端修改。
- `delegate-antigravity` 只用于前端实现和前端问题修复，不用于后端、数据库迁移、API/数据库契约、鉴权边界、生产配置、密钥或部署拓扑变更。
- 委派返回后必须检查完整 diff、生成文件、依赖变化、删除操作和跨模块写入，再运行与改动相关的类型检查、静态检查、构建和测试。
- 最终交接必须区分实际使用了 Antigravity MCP、Codex 审查、命令验证和 GUI/真机/外部服务验收；不得把委派完成写成业务验收完成。

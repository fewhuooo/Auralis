# Auralis 文档体系整理与 Agent 约束设计

更新时间：2026-07-10

文档状态：已确认设计

权威范围：新文档体系的目录结构、权威边界、Agent 约束、迁移规则与验收标准

事实来源：用户在 2026-07-10 的确认、仓库 `AGENTS.md`、`docs/` 现状及当前工作树

## 1. 背景

Auralis 当前已有覆盖产品、架构、前端、后端、基础设施、接口、数据库、计划、状态、运维和历史材料的中文文档体系，但仍存在以下维护问题：

- 当前状态、页面细节、风险和未来计划在多份文档中重复出现，容易产生冲突。
- 部分文档的更新时间停留在 2026-07-02，与当前代码和 2026-07-10 的重构进度不一致。
- `StatusIndex.md` 等状态文档混入大量页面设计细节，降低了可扫描性。
- “代码已存在”“构建通过”“业务已验收”等状态缺少统一、严格的证据口径。
- 历史 StudyCore 文档与现行 Auralis 文档并存，其他 AI Agent 可能误把归档内容当作当前事实。
- 当前约束对不同 AI Agent 仍不够机械、明确，容易出现遗漏必读文档、漏回写、恢复旧实现或覆盖用户改动等行为。

本轮整理以开发者和编码 Agent 的持续维护为首要目标。当前全部旧文档将先按工作树现状保存为带日期的只读快照，再在分类目录中重新编写现行文档，从结构上隔离旧事实与新事实。

## 2. 目标

本轮必须达到以下目标：

1. 为每类事实指定唯一权威文档，其他文档只保留摘要和链接。
2. 对照当前代码、配置和可执行命令校正文档事实。
3. 使用一致的文档元数据、状态词典、证据格式和交叉链接。
4. 细化适用于 Codex、Claude、Trae 及其他编码 Agent 的强制工作协议。
5. 保留并正确合并当前工作树中的用户文档修改。
6. 明确区分现行工程文档、计划文档、展示材料和历史归档。
7. 对全部现行文档执行链接、路径、术语、状态和内部一致性检查。
8. 将整理前的全部旧文档完整保存到 `docs/archive/snapshots/2026-07-10-pre-reorganization/`。
9. 在新的分类目录中重新编写现行文档，不让新旧同名文件混杂在 `docs/` 根目录。

## 3. 非目标

本轮不执行以下工作：

- 不修改 PC、Mobile、Tablet、Server 或基础设施业务代码。
- 不新增 CI、文档站点生成器或独立文档校验程序。
- 不重写历史归档正文，也不把旧 StudyCore 内容改造成 Auralis 现状。
- 不把 Tauri 图形界面、微信开发者工具、移动端真机或平板触控验收声明为本轮已完成。
- 不销毁任何旧文档；旧文档从现行位置迁入带日期的归档快照。
- 不覆盖、还原或丢弃当前工作树中已有的未提交修改。

## 4. 目标目录结构

除统一入口 `docs/README.md` 外，所有新文档必须进入职责明确的分类目录：

```text
docs/
├── README.md
├── agent/
│   ├── BeforeCoding.md
│   └── CodingAndGitStandards.md
├── project/
│   ├── Overview.md
│   ├── ProductRequirements.md
│   └── Architecture.md
├── current/
│   ├── Status.md
│   └── IssuesAndReview.md
├── modules/
│   ├── FrontendPC.md
│   ├── FrontendMobileTablet.md
│   ├── Backend.md
│   └── Infrastructure.md
├── contracts/
│   ├── API.md
│   ├── Database.md
│   └── MobilePagesAPIMap.md
├── design/
│   ├── DocumentationArchitecture.md
│   └── Frontend.md
├── operations/
│   ├── Deployment.md
│   └── Runbook.md
├── planning/
│   ├── README.md
│   ├── Overview.md
│   ├── AIRag.md
│   ├── BackendCore.md
│   ├── DocsAcceptance.md
│   ├── FrontendMobileTablet.md
│   ├── FrontendPC.md
│   ├── InfraRelease.md
│   └── TabletHandwritingNotes.md
├── plans/
│   └── backend-greenfield-rewrite-plan.md
├── release/
│   └── Changelog.md
├── user/
│   └── UserManual.md
├── showcase/
│   └── TraeCompetitionApplication.md
└── archive/
    ├── README.md
    ├── snapshots/
    │   └── 2026-07-10-pre-reorganization/
    │       ├── README.md
    │       ├── SNAPSHOT.md
    │       ├── archive/
    │       ├── frontend/
    │       ├── plans/
    │       └── 整理前 `docs/` 的完整目录镜像
    ├── legacy-project/
    │   └── PROJECT_OVERVIEW.md
    └── legacy-demand/
        └── StudyCore 阶段的更早历史材料
```

目录名使用小写英文，常规文档文件名使用 PascalCase。`docs/plans/backend-greenfield-rewrite-plan.md` 是经用户明确指定路径的已批准详细实施计划例外。`docs/README.md` 是唯一允许保留在 `docs/` 根目录的 Markdown 文档。

`planning/` 继续承载按领域维护的任务总览、依赖和未来事项；`plans/` 只承载已经批准、能够直接交给工程人员逐阶段执行的跨模块详细计划。不得为同一计划在两个目录维护可编辑副本，其他文档必须链接到唯一计划文件。

### 4.1 旧路径到新路径的迁移

| 旧路径 | 新路径 |
| --- | --- |
| `docs/AgentBeforeCoding.md` | `docs/agent/BeforeCoding.md` |
| `docs/CodingAndGitStandards.md` | `docs/agent/CodingAndGitStandards.md` |
| `docs/ProjectReadme.md` | `docs/project/Overview.md` |
| `docs/ProductRequirementsDocument.md` | `docs/project/ProductRequirements.md` |
| `docs/ArchitectureDesign.md` | `docs/project/Architecture.md` |
| `docs/StatusIndex.md` | `docs/current/Status.md` |
| `docs/CurrentIssuesAndReview.md` | `docs/current/IssuesAndReview.md` |
| `docs/FrontendPC.md` | `docs/modules/FrontendPC.md` |
| `docs/FrontendMobileTablet.md` | `docs/modules/FrontendMobileTablet.md` |
| `docs/Backend.md` | `docs/modules/Backend.md` |
| `docs/InfrastructureAndData.md` | `docs/modules/Infrastructure.md` |
| `docs/APIManifest.md` | `docs/contracts/API.md` |
| `docs/DatabaseDesign.md` | `docs/contracts/Database.md` |
| `docs/MobilePagesAPIMap.md` | `docs/contracts/MobilePagesAPIMap.md` |
| `docs/frontend/design.md` | `docs/design/Frontend.md` |
| `docs/DeploymentGuide.md` | `docs/operations/Deployment.md` |
| `docs/Runbook.md` | `docs/operations/Runbook.md` |
| `docs/DevelopmentPlan.md` | 由 `docs/planning/README.md` 取代 |
| 整理前历史 `docs/plans/*` | `docs/planning/*`，去除冗余 `Plan` 前缀；2026-08-12 后明确批准的跨模块详细计划可重新进入 `docs/plans/`，但必须登记到入口 |
| `docs/Changelog.md` | `docs/release/Changelog.md` |
| `docs/UserManualOutline.md` | `docs/user/UserManual.md` |
| `docs/TraeCompetitionApplicationAuralis.md` | `docs/showcase/TraeCompetitionApplication.md` |

旧路径不得保留兼容副本，因为副本会重新形成两个可编辑事实来源。所有仓库内现行引用必须一次性更新到新路径。

## 5. 文档分类与权威边界

### 5.1 入口与 Agent 规则

| 文档 | 权威职责 | 不应承载的内容 |
| --- | --- | --- |
| `AGENTS.md` | 仓库级最小强制入口、必读文档和强制回写规则 | 详细模块事实、长篇操作说明 |
| `docs/README.md` | 文档导航、分类、阅读顺序、状态词典和维护规则 | 具体实现细节、完整任务清单 |
| `docs/agent/BeforeCoding.md` | Agent 的开始前、修改中、完成后协议和检查清单 | 产品宣传、页面设计细节 |
| `docs/agent/CodingAndGitStandards.md` | 编码、测试、Git、提交和工作树保护规范 | 当前项目状态、未来里程碑 |

### 5.2 产品、架构与设计

| 文档 | 权威职责 |
| --- | --- |
| `docs/project/ProductRequirements.md` | 产品定位、目标用户、功能范围、非功能需求和产品验收条件 |
| `docs/project/Architecture.md` | 系统边界、模块关系、关键数据流、架构决策和已知架构风险 |
| `docs/design/Frontend.md` | 页面地图、交互行为、视觉令牌、跨页面流程和页面级验收条件 |
| `docs/user/UserManual.md` | 面向最终用户的操作说明结构，不作为实现状态依据 |

### 5.3 当前实现与开发契约

| 文档 | 权威职责 |
| --- | --- |
| `docs/modules/FrontendPC.md` | PC 当前目录、路由、页面、Store、API 边界、构建方式和已知限制 |
| `docs/modules/FrontendMobileTablet.md` | Mobile、Tablet 当前页面、路由、端侧数据、条件编译、构建方式和已知限制 |
| `docs/modules/Backend.md` | 后端包结构、控制器、服务、安全基线、配置和测试边界 |
| `docs/modules/Infrastructure.md` | 服务拓扑、容器、端口、存储、环境变量和基础设施风险 |
| `docs/contracts/API.md` | Controller 级接口契约、鉴权、请求响应、错误与验收状态 |
| `docs/contracts/MobilePagesAPIMap.md` | Mobile 页面到 API、本地存储和数据流的映射 |
| `docs/contracts/Database.md` | 服务端与端侧数据结构、约束、索引、关系和同步语义 |

### 5.4 状态、计划、运维与历史

| 文档 | 权威职责 |
| --- | --- |
| `docs/current/Status.md` | 简短的当前状态快照、最近验证证据、下一步和阻塞项 |
| `docs/current/IssuesAndReview.md` | 尚未关闭的风险、优先级、证据、影响、处置建议和关闭条件 |
| `docs/planning/README.md` | 计划体系入口和阅读方式 |
| `docs/planning/` 中其他文件 | 按领域维护未来任务、依赖、验收方式和完成定义 |
| `docs/plans/` | 已批准、决策完整、可直接执行的跨模块详细实施计划；每项只能有一个权威文件 |
| `docs/release/Changelog.md` | 已发生且可确认的历史变化，不承载未来计划 |
| `docs/operations/Deployment.md` | 从构建到部署的标准流程和生产门禁 |
| `docs/operations/Runbook.md` | 运行期诊断、备份、恢复和应急处理 |
| `docs/showcase/TraeCompetitionApplication.md` | 独立展示材料，不作为工程事实来源 |
| `docs/archive/` | 原样保留的历史材料，不作为现状、任务或恢复实现的依据 |

## 6. Agent 强制协议设计

### 6.1 规范用语

Agent 约束统一使用以下词语：

- **必须**：不可跳过；未满足时不得声称任务完成。
- **禁止**：任何 Agent 均不得执行。
- **应当**：默认执行；只有存在明确任务冲突时才可偏离，并必须说明原因。
- **可以**：可选行为，不影响完成判定。

不得用“尽量”“建议考虑”“视情况”等无法验证是否履行的措辞表达强制要求。

### 6.2 指令优先级

发生冲突时，Agent 必须按以下顺序处理：

1. 用户在当前任务中的最新明确要求。
2. 仓库根目录 `AGENTS.md`。
3. `docs/agent/BeforeCoding.md`。
4. 本次任务对应的权威模块文档和开发契约。
5. `docs/plans/` 中的计划文档。
6. 展示材料和历史归档。

历史归档不得覆盖任何现行文档或当前代码事实。若当前代码与现行文档冲突，Agent 必须核实代码、指出差异，并在任务范围内同步修正文档；不得静默选择其中一方。

### 6.3 任务到必读文档映射

所有代码或文档修改任务都必须先读：

1. `docs/agent/BeforeCoding.md`
2. `docs/current/Status.md`
3. `docs/current/IssuesAndReview.md`
4. 本次任务对应的模块文档

附加映射如下：

| 任务类型 | 额外必读文档 | 发生变化时必须回写 |
| --- | --- | --- |
| PC 页面、路由、Store | `modules/FrontendPC.md`、`design/Frontend.md` | 两份文档及状态/日志文档 |
| Mobile / Tablet 页面、路由、端侧数据 | `modules/FrontendMobileTablet.md`、`design/Frontend.md`、`contracts/MobilePagesAPIMap.md` | 受影响的三份文档及状态/日志文档 |
| 后端接口、鉴权、服务 | `modules/Backend.md`、`contracts/API.md` | 两份文档及状态/风险/日志文档 |
| 数据实体、表、同步字段 | `contracts/Database.md`、`modules/Backend.md` | 两份文档；接口变化时同步 `contracts/API.md` |
| Docker、环境变量、部署 | `modules/Infrastructure.md`、`operations/Deployment.md`、`operations/Runbook.md` | 所有受影响文档及风险/日志文档 |
| 产品范围或验收条件 | `project/ProductRequirements.md`、`project/Architecture.md` | 产品、架构、计划、状态文档 |
| 仅文档整理 | `docs/README.md` 和所有受影响权威文档 | 文档索引、更新时间、必要的 Changelog |

### 6.4 行为约束

Agent 必须：

- 先检查当前实现，再决定修改位置；不得凭空创建平行目录、平行 Store、平行 API 或重复文档。
- 修改前检查 Git 工作树，并把已有修改视为用户成果。
- 对每个“已实现”事实给出代码或配置路径。
- 对每个“已验证”事实给出实际执行命令、日期和结果。
- 把未执行的 GUI、真机、外部服务和人工验收明确写为未验证。
- 在完成时列出已改文件、验证命令、验证结果、剩余风险和人工验收项。

Agent 禁止：

- 使用历史归档恢复已删除页面、旧路由、旧配置或旧命名。
- 使用 `git reset --hard`、`git checkout --` 等方式覆盖用户工作树。
- 把代码存在、编译通过、测试通过和业务验收通过混为同一状态。
- 把计划任务、建议或设计稿描述成已经实现。
- 在未核实 Controller、实体或配置前修改 API、数据库或部署文档。
- 仅更新一份重复描述而放任其他现行权威文档继续冲突。

### 6.5 Agent 交接格式

任何完成代码或文档修改的 Agent，最终交接至少必须包含：

```text
完成内容：本轮实际完成的结果
修改文件：逐项列出受影响文件
验证命令：实际执行的命令；未执行项写明原因
验证结果：通过、失败或受限，不得模糊描述
文档回写：列出已同步的权威文档
剩余风险：仍未关闭的问题
人工验收：GUI、真机、外部服务或产品确认事项
```

## 7. 统一文档结构

每份现行文档的标题后应包含以下轻量元数据：

```text
更新时间：YYYY-MM-DD
文档状态：现行 / 计划 / 展示 / 历史归档
权威范围：本文件负责维护的唯一事实范围
事实来源：对应代码、配置、验证命令或上级文档
```

不同类型文档的正文结构如下：

- 模块文档：定位 → 当前结构 → 关键行为 → 边界与依赖 → 构建/测试 → 已知限制 → 回写规则。
- API 文档：全局约定 → 鉴权 → 接口表 → 请求/响应示例 → 错误语义 → 验证状态。
- 数据文档：数据源 → 关系 → 字段 → 约束/索引 → 生命周期 → 同步/迁移 → 已知风险。
- 状态文档：模块 → 状态 → 证据 → 最近验证 → 下一步；不得展开页面设计长文。
- 问题文档：优先级 → 问题 → 证据 → 影响 → 处置 → 关闭条件。
- 计划文档：目标 → 当前事实 → 依赖 → 可执行任务 → 验收 → 完成定义。
- 运维文档：触发条件 → 前置检查 → 操作步骤 → 成功判据 → 回滚/恢复 → 升级条件。

## 8. 状态与证据口径

所有现行文档统一使用以下状态：

| 状态 | 判定标准 |
| --- | --- |
| 已验收 | 有构建、测试、联调或人工验收证据，且满足该条目的完成定义 |
| 已构建待验收 | 代码或页面存在，但缺少足够测试、联调或人工验收证据 |
| 进行中 | 部分实现存在，主流程、测试或文档尚未闭环 |
| 计划中 | 仅有需求、设计或任务，尚未开始实现 |
| 已隐藏保留 | 实现仍在仓库，但入口由 feature flag 或路由配置关闭 |
| 阻塞 | 依赖外部配置、资源、设备、权限或产品决策，当前无法继续验证 |

证据必须分为三类：

- **代码确认**：给出文件、类、函数、路由或配置路径。
- **命令验证**：给出命令、执行日期和通过/失败结果。
- **待人工验证**：明确设备、GUI、外部服务或操作流程。

只有本轮实际执行的命令才能作为“本轮验证”证据。历史命令结果可以保留在 Changelog，但不得伪装为本轮结果。

## 9. 旧版快照、历史归档与展示材料

### 9.1 整理前快照

实施前必须把当前工作树中的旧文档保存到 `docs/archive/snapshots/2026-07-10-pre-reorganization/`。快照必须满足：

- 包含整理前整个 `docs/` 目录的 Markdown 镜像，包括原有 `archive/`；仅排除为本次重构新写的 `docs/design/DocumentationArchitecture.md` 和快照目标目录自身。
- 保存工作树当前内容，包括 `Changelog.md`、`FrontendPC.md`、`StatusIndex.md` 和 `frontend/design.md` 中尚未提交的用户修改。
- 保持原有相对目录结构；每份文件只允许在顶部增加统一历史警告，警告之后的原始正文必须逐字保留，不得做事实修正。
- 快照目录新增独立 `SNAPSHOT.md`，记录生成日期、来源提交、工作树存在未提交修改以及不可作为现状依据的警告。快照根目录的 `README.md` 保留为旧文档中心原文，禁止覆盖。
- 新文档不得链接到快照内容作为当前事实来源。
- 原 `docs/archive/PROJECT_OVERVIEW.md` 在新结构中归入 `docs/archive/legacy-project/PROJECT_OVERVIEW.md`；原归档入口也保存在日期快照中。

### 9.2 更早历史归档

`docs/archive/README.md`、快照入口和每份归档 Markdown 顶部必须增加统一警告。统一警告是归档正文之外的元数据，不改变原文历史含义：

> 本文档为 StudyCore 阶段的历史归档，仅用于追溯需求与项目演进。它不是 Auralis 当前实现、状态、接口或任务的依据。任何开发者或 AI Agent 均不得依据本文恢复旧实现、判断当前完成度或创建当前任务；请从 `docs/README.md` 进入现行文档体系。

归档正文保留原项目名称、历史路径和历史判断，不做现代化改写。

`docs/showcase/TraeCompetitionApplication.md` 必须标记为“展示”，并声明技术事实应以工程权威文档和代码为准。

## 10. 实施批次

### 批次 1：冻结旧版快照

- 记录当前工作树中的用户文档改动和来源提交。
- 把全部非归档旧文档按原目录结构移入带日期的快照。
- 验证快照文件数、文件路径和正文内容完整。

### 批次 2：建立新目录与 Agent 入口

- 创建新的分类目录和 `docs/README.md`。
- 更新 `AGENTS.md` 到新路径。
- 重新编写 `docs/agent/BeforeCoding.md` 和 `docs/agent/CodingAndGitStandards.md`。
- 建立权威边界、状态词典、回写矩阵和 Agent 交接格式。

### 批次 3：产品、架构与设计

- 整理 PRD、架构设计、前端设计和用户手册提纲。
- 把需求、设计、当前实现和未来计划分离。
- 保留当前 PC 和 Mobile/Tablet 的有效设计更新，将状态细节归位到模块文档。

### 批次 4：模块与开发契约

- 对照代码整理 PC、Mobile/Tablet、Backend 和 Infrastructure 文档。
- 核对路由、页面、Store、Controller、实体、配置、端口和环境变量。
- 同步整理 API Manifest、Mobile 页面 API 映射和数据库设计。

### 批次 5：状态、计划、运维与交付

- 压缩状态索引，清理已关闭问题并补充关闭条件。
- 细化计划入口和各领域计划的依赖、任务、验收与完成定义。
- 校正部署、Runbook、Changelog 和展示文档。

### 批次 6：归档声明与全量验收

- 给归档入口和所有归档 Markdown 添加历史警告。
- 校验链接、路径、术语、状态、时间、重复信息和 Git 差异。
- 运行可执行的 PC Web、Mobile H5、微信小程序和后端验证命令。
- 汇总无法在本轮完成的 Tauri GUI、开发者工具、真机、触控和外部服务验收。

## 11. 验证设计

### 11.1 快照完整性核验

- 整理前的每个 Markdown 都能在日期快照中找到对应文件；本设计文档和快照目录自身属于明确排除项。
- 去除顶部统一历史警告后，旧文件移入快照前后的原始正文哈希一致。
- 原有未提交文档修改出现在快照版本中，并在新文档中按事实重新吸收。
- `docs/` 根目录除新 `README.md` 外不存在其他 Markdown。

### 11.2 静态核验

- 所有现行 Markdown 都能从 `docs/README.md` 或其分类入口访问。
- 所有相对链接目标存在；归档内历史失效路径不作为现行链接错误。
- 所有现行代码路径、目录名和项目名使用 Auralis；StudyCore 只允许出现在归档正文、旧名说明或历史变更记录中。
- API Manifest 中的方法与 URL 能追溯到当前 Controller。
- Database Design 中的字段能追溯到当前实体、迁移或端侧数据库代码。
- 页面地图与当前路由和页面目录一致。
- Docker 服务、端口、环境变量和启动命令与当前配置一致。
- 现行文档中不存在互相矛盾的状态或重复的权威定义。

### 11.3 命令验证

在不修改业务代码的前提下，计划执行：

```powershell
cd Auralis-PC
npm.cmd run build

cd ..\Auralis-Mobile
npm.cmd run build:h5
npm.cmd run build:mp-weixin

cd ..\Auralis-Server
mvn test
```

若依赖、环境、沙箱或现有业务代码导致命令失败，文档必须记录实际失败结果和限制，不得为获得“通过”而修改业务代码。

### 11.4 人工验收边界

以下项目只列为待人工验收：

- PC Tauri GUI、系统权限和桌面打包行为。
- 微信开发者工具与微信真机。
- Mobile App、Harmony 等其他目标平台。
- Tablet 真实触控、手写、双指缩放和长时间书写。
- 需要真实 PostgreSQL、Redis、MinIO、Milvus 或外部 AI 服务的端到端流程。

## 12. 完成标准

本轮文档整理只有在以下条件全部满足后才可声明完成：

1. 全部旧文档已完整进入带日期快照，且用户未提交修改未丢失。
2. `docs/` 根目录只保留新 `README.md`，其他现行文档全部位于分类目录。
3. 每份现行文档都有明确状态、更新时间、权威范围和事实来源。
4. 每类当前事实都有唯一权威维护位置，其他文档使用摘要与链接。
5. Agent 规则覆盖指令优先级、必读文档、工作树保护、事实证据、强制回写和完成交接。
6. API、数据模型、页面路由和部署配置已对照当前代码核验。
7. 当前未提交文档修改已在快照中保留，并按当前代码事实吸收到新文档。
8. 归档正文保持原样，并带有不可作为现状依据的明确警告。
9. 展示文档与工程权威文档已清晰隔离。
10. 链接、路径、术语、状态和重复内容检查完成。
11. 可执行验证命令的实际结果已记录，未执行或失败项已说明原因。
12. 最终交接列出全部修改文件、验证结果、剩余风险和人工验收事项。

## 13. 风险与控制

| 风险 | 控制方式 |
| --- | --- |
| 覆盖用户当前修改 | 快照保存当前工作树内容；迁移前后核对正文；禁止还原工作树 |
| 新旧文档继续混用 | 旧路径只存在于归档快照；根入口和 `AGENTS.md` 只链接新路径 |
| 文档大规模改写引入事实错误 | 先核对代码和配置，再改权威文档；完成后做交叉检查 |
| 多份文档继续重复漂移 | 为每类事实指定唯一权威文件，其他位置只写摘要和链接 |
| Agent 误读历史资料 | 所有归档文件顶部加禁止性警告；入口文档明确指令优先级 |
| 构建失败诱发业务代码修改 | 本轮只记录失败和限制，不为文档任务修改业务代码 |
| 状态描述过度乐观 | 强制区分代码确认、命令验证与人工验收 |

## 14. 预期交付物

- 更新后的根目录 `AGENTS.md`、新 `docs/README.md` 和分类目录中的全部现行文档。
- 完整保存整理前工作树内容的日期快照。
- 带历史警告但正文保持原样的其他 `docs/archive/` 文档。
- 与当前代码事实对应的 API、数据库、页面、基础设施和状态说明。
- 明确的 Agent 必读、禁止、回写和交接协议。
- 最终静态校验、构建/测试结果和待人工验收清单。

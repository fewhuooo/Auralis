> [!WARNING]
> 本文是 2026-07-10 文档体系迁移的历史执行计划，2026-10-28 从 `docs/planning/DocumentationReorganizationImplementation.md` 归档。下方正文保留归档前工作树内容；任务号、路径和命令只供追溯，不作为当前工程事实或待办。现行入口见 [文档中心](../../README.md)。

# Auralis 文档体系重构实施计划

更新时间：2026-07-10
文档状态：计划
权威范围：`docs/design/DocumentationArchitecture.md` 的逐任务实施步骤、验证命令和提交边界
事实来源：已批准的文档架构设计、当前工作树以及路由、页面、Controller、实体和配置盘点结果

> **供编码 Agent 使用：** 实施本计划时必须按任务逐项执行并使用复选框跟踪。若用户明确授权子代理，可使用 `subagent-driven-development`；否则使用 `executing-plans` 内联执行。

**目标：** 完整归档重构前的文档树，建立以当前代码为依据的分类文档体系，并把仓库约束写到任何编码 Agent 都能机械执行的程度。

**实施结构：** 先把当前工作树中的旧文档完整保存为带日期的快照，再按 `agent`、`project`、`current`、`modules`、`contracts`、`design`、`operations`、`planning`、`release`、`user` 和 `showcase` 分类重写。只有全部新权威文档就绪后，才删除旧的现行路径。代码和配置只能证明“实现存在”，本轮实际命令才能证明“已验证”，GUI、真机和外部服务验证必须单列。

**技术栈：** Markdown、Git、PowerShell、Vue 3/Vite/Tauri、Uni-app、Spring Boot/Maven、Docker Compose。





## 全局约束

- 禁止修改 `Auralis-PC`、`Auralis-Mobile`、`Auralis-Server`、`data` 或 `docker-compose.yml` 中的业务代码和配置。
- 必须保留全部既有工作树修改；当前已修改的旧文档必须先进入日期快照，之后才能删除旧路径。
- `docs/design/DocumentationArchitecture.md` 是已批准的新设计，不进入旧文档快照。
- 切换完成后，`docs/README.md` 必须是 `docs/` 根目录唯一的 Markdown 文件。
- 每份现行文档必须声明 `更新时间`、`文档状态`、`权威范围` 和 `事实来源`。
- Agent 约束使用“必须、禁止、应当、可以”，禁止用模糊措辞表达强制要求。
- 禁止把历史归档、展示文案、未来计划、代码存在、构建通过和业务验收混为同一类证据。
- Task 9 未实际执行的命令，禁止写成“本轮已通过”。
- 若构建因现有代码或环境失败，只记录真实结果；禁止为让文档好看而修改业务代码。
- 本轮禁止新增 CI、文档站生成器或永久校验程序。
- 只能暂存 `AGENTS.md` 与 `docs/`；禁止暂存用户的应用代码改动。

---

### 任务 1：冻结重构前完整文档快照

**文件：**

- 新建：`docs/archive/snapshots/2026-07-10-pre-reorganization/SNAPSHOT.md`
- 新建：`docs/archive/snapshots/2026-07-10-pre-reorganization/**`，镜像旧文档树
- 重写：`docs/archive/README.md`
- 移动：`docs/archive/PROJECT_OVERVIEW.md` → `docs/archive/legacy-project/PROJECT_OVERVIEW.md`
- 修改：所有归档 Markdown，在原正文前添加统一历史警告

**接口：**

- 输入：当前工作树中的旧 `docs/*.md`、`docs/frontend/*.md`、`docs/plans/*.md` 和既有 `docs/archive/**`。
- 输出：不可作为现状依据、但能完整追溯旧内容的日期快照。

- [ ] **Step 1：核对绝对路径安全边界**

```powershell
$workspace = (Resolve-Path '.').Path
$docs = (Resolve-Path 'docs').Path
$snapshot = [System.IO.Path]::GetFullPath((Join-Path $docs 'archive\snapshots\2026-07-10-pre-reorganization'))
if (-not $snapshot.StartsWith($docs + [System.IO.Path]::DirectorySeparatorChar)) {
  throw "Snapshot target escaped docs: $snapshot"
}
"workspace=$workspace"
"docs=$docs"
"snapshot=$snapshot"
```

预期：三条路径都位于 `D:\CodeBase\Active\Auralis`，且 `snapshot` 位于 `docs\archive\snapshots` 内。

- [ ] **Step 2：复制前清点旧文档**

```powershell
$oldRoot = Get-ChildItem -LiteralPath 'docs' -File -Filter '*.md'
$oldFrontend = Get-ChildItem -LiteralPath 'docs\frontend' -Recurse -File -Filter '*.md'
$oldPlans = Get-ChildItem -LiteralPath 'docs\plans' -Recurse -File -Filter '*.md'
$oldArchive = Get-ChildItem -LiteralPath 'docs\archive' -Recurse -File -Filter '*.md' |
  Where-Object { $_.FullName -notmatch '\\snapshots\\' }
$old = @($oldRoot + $oldFrontend + $oldPlans + $oldArchive)
$old | Sort-Object FullName | ForEach-Object { $_.FullName.Substring((Resolve-Path 'docs').Path.Length + 1) }
"count=$($old.Count)"
```

预期：清单包含当前已修改的 `Changelog.md`、`FrontendPC.md`、`StatusIndex.md`、`frontend\design.md` 和全部既有归档；不包含 `design\DocumentationArchitecture.md` 与本实施计划。

- [ ] **Step 3：复制旧树并在添加警告前校验 SHA-256**

```powershell
$docs = (Resolve-Path 'docs').Path
$snapshot = [System.IO.Path]::GetFullPath((Join-Path $docs 'archive\snapshots\2026-07-10-pre-reorganization'))
New-Item -ItemType Directory -Force -Path $snapshot | Out-Null
$sources = @(
  Get-ChildItem -LiteralPath 'docs' -File -Filter '*.md'
  Get-ChildItem -LiteralPath 'docs\frontend' -Recurse -File -Filter '*.md'
  Get-ChildItem -LiteralPath 'docs\plans' -Recurse -File -Filter '*.md'
  Get-ChildItem -LiteralPath 'docs\archive' -Recurse -File -Filter '*.md' |
    Where-Object { $_.FullName -notmatch '\\snapshots\\' }
) | Where-Object {
  $_.FullName -ne (Join-Path $docs 'design\DocumentationArchitecture.md') -and
  $_.FullName -ne (Join-Path $docs 'planning\DocumentationReorganizationImplementation.md')
}
foreach ($source in $sources) {
  $relative = $source.FullName.Substring($docs.Length + 1)
  $target = Join-Path $snapshot $relative
  New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
  Copy-Item -LiteralPath $source.FullName -Destination $target -Force
  $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $source.FullName).Hash
  $targetHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash
  if ($sourceHash -ne $targetHash) { throw "Hash mismatch: $relative" }
}
"copied=$($sources.Count)"
```

预期：命令成功退出，`copied` 大于 0，没有 `Hash mismatch`。

- [ ] **Step 4：给归档添加统一警告，原正文保持不变**

使用 `apply_patch` 在每份快照和保留的 legacy 文档顶部添加：

```markdown
> [!WARNING]
> 本文档为历史归档，仅用于追溯需求、设计与项目演进。它不是 Auralis 当前实现、状态、接口或任务的依据。开发者与 AI Agent 禁止依据本文恢复旧实现、判断当前完成度或创建当前任务；请从 `docs/README.md` 进入现行文档体系。
```

禁止修改警告块之后的原始正文。

- [ ] **Step 5：重写归档入口并整理旧项目概览**

`docs/archive/README.md` 必须包含：归档用途、禁止作为现状依据、快照清单、`legacy-project/`、`legacy-demand/` 和返回现行入口的链接。

快照 `SNAPSHOT.md` 必须记录日期 `2026-07-10`、来源提交 `5cbee8d`、来源工作树存在未提交文档修改、排除文件、完整性校验方式和禁止性说明。快照根目录的 `README.md` 是旧文档中心原文，禁止覆盖。

确认快照副本存在后，将 `PROJECT_OVERVIEW.md` 移入 `legacy-project/`。

- [ ] **Step 6：验证覆盖率和警告**

```powershell
$snapshot = 'docs\archive\snapshots\2026-07-10-pre-reorganization'
$snapshotFiles = Get-ChildItem -LiteralPath $snapshot -Recurse -File -Filter '*.md'
$missingWarning = $snapshotFiles | Where-Object {
  -not (Select-String -LiteralPath $_.FullName -Pattern '本文档为历史归档' -Quiet)
}
"snapshotMarkdown=$($snapshotFiles.Count)"
"missingWarning=$($missingWarning.Count)"
$missingWarning.FullName
```

预期：快照文件数覆盖旧清单，`missingWarning=0`。

- [ ] **Step 7：只提交归档快照**

```powershell
git add -- docs/archive
git diff --cached --check
git commit -m "docs: archive pre-reorganization documentation"
```

预期：提交只包含 `docs/archive/**`，应用代码和旧现行文档修改仍未暂存。

---

### 任务 2：建立新的 Agent 入口与文档中心

**文件：**

- 修改：`AGENTS.md`
- 重写：`docs/README.md`
- 新建：`docs/agent/BeforeCoding.md`
- 新建：`docs/agent/CodingAndGitStandards.md`

**接口：** 输入为已批准的权威边界和 Agent 协议；输出为所有后续文档与外部 Agent 的强制入口。

- [ ] **Step 1：重写 `AGENTS.md` 最小强制门禁**

必须写清：唯一入口、三份通用必读文档、模块映射、API/数据库/状态/风险/发布强制回写、归档和展示非权威、保护现有工作树。

- [ ] **Step 2：重写 `docs/README.md`**

固定章节：`定位`、`30 秒开始`、`按任务选择文档`、`文档权威边界`、`状态词典`、`事实与验证口径`、`目录索引`、`维护与冲突处理`、`归档说明`。

- [ ] **Step 3：编写三阶段 Agent 协议**

`docs/agent/BeforeCoding.md` 固定包含：指令优先级、任务必读矩阵、开始前、修改中、完成前、禁止事项、证据格式、最终交接模板。

- [ ] **Step 4：编写编码与 Git 规范**

覆盖工作树保护、优先复用现有结构、前后端约束、文档规则、测试证据、分支和提交命名、暂存范围、禁止破坏性 Git、提交检查表。

- [ ] **Step 5：验证入口只引用新路径**

```powershell
Select-String -LiteralPath 'AGENTS.md' -Pattern 'docs/' | ForEach-Object { $_.Line }
Select-String -Path 'AGENTS.md','docs\README.md','docs\agent\*.md' -Pattern 'docs/(AgentBeforeCoding|StatusIndex|CurrentIssuesAndReview|FrontendPC|APIManifest|DatabaseDesign)\.md'
```

预期：第二条命令无结果。

- [ ] **Step 6：提交入口层**

```powershell
git add -- AGENTS.md docs/README.md docs/agent
git diff --cached --check
git commit -m "docs: establish agent documentation protocol"
```

---

### 任务 3：重写项目、架构、设计、用户和展示文档

**文件：**

- 新建：`docs/project/Overview.md`
- 新建：`docs/project/ProductRequirements.md`
- 新建：`docs/project/Architecture.md`
- 新建：`docs/design/Frontend.md`
- 新建：`docs/user/UserManual.md`
- 新建：`docs/showcase/TraeCompetitionApplication.md`

**接口：** 输入为当前目录、路由、页面、已批准设计和旧快照；输出为不冒充实现状态的产品意图与体验设计。

- [ ] **Step 1：编写项目总览**

记录三个应用目录、基础设施入口、运行要求、已确认依赖版本、启动命令、配置入口和模块/状态链接；禁止复制完整路由表和 API 表。

- [ ] **Step 2：编写产品需求**

分离产品目标、目标用户、核心场景、功能范围、跨端职责、非功能要求、当前里程碑、非目标和验收条件。未实现能力只能写为需求。

- [ ] **Step 3：编写系统架构**

覆盖三端、后端、PostgreSQL、Redis、MinIO、Milvus、外部 AI 的边界，以及鉴权、本地优先同步、上传摄入、RAG、WebSocket 数据流与当前风险。

- [ ] **Step 4：重写前端设计**

从快照吸收用户现有 Zen Minimalist 修改，按共享令牌、PC/Mobile/Tablet 页面地图、跨页流程、响应式、可访问性、动效、空/加载/错误状态和页面验收组织；禁止混入实现状态。

- [ ] **Step 5：编写用户手册**

按登录、首页、学科、文件资产、知识块、任务排期、AI、专注复习统计、设置、跨设备、故障排查组织；功能开关关闭或尚未验收必须明确标注。

- [ ] **Step 6：隔离展示材料**

将比赛材料重写到 `showcase`，标为“展示”，声明技术事实和状态必须回查工程权威文档。

- [ ] **Step 7：核对页面名称**

```powershell
Select-String -LiteralPath 'Auralis-PC\src\router\index.ts' -Pattern 'path:'
Select-String -LiteralPath 'Auralis-Mobile\src\pages.json' -Pattern '"path"'
```

预期：PC 只覆盖 7 条当前路由，Mobile/Tablet 只覆盖当前注册页面。

- [ ] **Step 8：提交产品与体验文档**

```powershell
git add -- docs/project docs/design/Frontend.md docs/user docs/showcase
git diff --cached --check
git commit -m "docs: rewrite product architecture and experience guides"
```

---

### 任务 4：依据代码重写模块文档

**文件：** `docs/modules/FrontendPC.md`、`FrontendMobileTablet.md`、`Backend.md`、`Infrastructure.md`

**接口：** 输入为依赖清单、路由页面、Store、Controller、配置、Compose 和 feature flag；输出为实现事实的唯一模块清单。

- [ ] **Step 1：编写 PC 模块文档**

依据 `package.json`、`router/index.ts`、`store/*.ts`、`api/*.ts`、`views/**`、`src-tauri/Cargo.toml`。列明路由、Store、API 客户端、构建命令、登录守卫风险、Tauri `2.11.1` 对齐和 GUI 验收边界。

- [ ] **Step 2：编写 Mobile/Tablet 模块文档**

依据 `package.json`、`pages.json`、`store/*.ts`、`api/**`、`services/**`、`config/features.ts`、`scripts/**`。列明条件编译、启动分流、页面、端侧存储、手写 feature flag、构建脚本和真机边界。

- [ ] **Step 3：编写后端模块文档**

依据 `pom.xml`、controller/service/entity/config、`application*.yml` 和空 `src/test`。记录 Spring Boot `3.2.5`、Java `21`、9 个 Controller、鉴权、同步、存储、AI、WebSocket 代码存在、无测试源码和配置口径风险。

- [ ] **Step 4：编写基础设施模块文档**

依据 `docker-compose.yml`、`.env.example`、`.gitignore`、`application*.yml`、`data/`。记录服务、镜像、端口、持久化、开发默认密码、生产变量、备份范围和缺失的 CI/监控。

- [ ] **Step 5：核对实现清单**

```powershell
Get-ChildItem -LiteralPath 'Auralis-PC\src\store' -File | Select-Object -ExpandProperty Name
Get-ChildItem -LiteralPath 'Auralis-Mobile\src\store' -File | Select-Object -ExpandProperty Name
Get-ChildItem -LiteralPath 'Auralis-Server\src\main\java\com\auralis\server\controller' -File | Select-Object -ExpandProperty Name
Get-ChildItem -LiteralPath 'Auralis-Server\src\main\java\com\auralis\server\entity' -File | Select-Object -ExpandProperty Name
```

预期：每个文件在模块清单中出现一次，或明确标为内部辅助文件。

- [ ] **Step 6：提交模块文档**

```powershell
git add -- docs/modules
git diff --cached --check
git commit -m "docs: document current module implementations"
```

---

### 任务 5：重建 API 与数据契约

**文件：** `docs/contracts/API.md`、`Database.md`、`MobilePagesAPIMap.md`

**接口：** 输入为 Controller、实体、建表逻辑、客户端 API 和端侧服务；输出为可被模块与计划引用的唯一契约。

- [ ] **Step 1：从注解清点 API**

```powershell
Get-ChildItem -LiteralPath 'Auralis-Server\src\main\java\com\auralis\server\controller' -File |
  Select-String -Pattern '@RequestMapping|@GetMapping|@PostMapping|@PutMapping|@DeleteMapping' |
  ForEach-Object { '{0}:{1}: {2}' -f $_.Filename,$_.LineNumber,$_.Line.Trim() }
```

预期：Auth 3、KnowledgeBlock 4、TaskBlock 4、BlockRelation 3、Sync 2、FileStorage 1、Asset 2、AI 7、Stats 2。

- [ ] **Step 2：编写 API 契约**

每个端点记录 method、path、鉴权、参数/body、响应、代码可见错误、Controller、调用状态和验证状态。单列 `/ws/sync`：query token 握手、PING token、PONG、60 秒审计均写为“代码确认，未自动测试”。

- [ ] **Step 3：编写数据库契约**

依据 `DbMigrationConfig.java`、`V2__add_encrypted_payload.sql`、实体和 Mobile 本地库，覆盖 7 张核心表。必须指出 `task_block.position` 存在于 DDL、但不存在于 `TaskBlock.java`，属于 schema/entity 漂移风险。

- [ ] **Step 4：编写 Mobile 页面 API 映射**

逐页记录远程端点、Store/服务、本地键、数据归属、加载/错误和 mock/local-only 数据；Tablet 无远程调用时明确链接模块文档。

- [ ] **Step 5：交叉检查客户端调用**

检查 `Auralis-PC/src/api/*.ts`、`Auralis-Mobile/src/api/*.ts`、`Auralis-Mobile/src/services/*.ts`。每个 `/api/` 或 `/ws/` 字面路径必须进入 `contracts/API.md`，否则登记为不一致。

- [ ] **Step 6：提交契约文档**

```powershell
git add -- docs/contracts
git diff --cached --check
git commit -m "docs: rebuild api and data contracts"
```

---

### 任务 6：重写部署与运维文档

**文件：** `docs/operations/Deployment.md`、`Runbook.md`

**接口：** 输入为构建脚本、Maven、Compose、配置 profile 和环境变量；输出为有成功判据与升级边界的操作流程。

- [ ] **Step 1：编写部署指南**

覆盖前置条件、本地依赖、后端、PC Web、Tauri 边界、Mobile H5、微信构建、Compose、环境变量、生产加固、冒烟、回滚和发布检查表。

- [ ] **Step 2：编写 Runbook**

针对后端启动、数据库、Redis、MinIO、Milvus/RAG、AI、401/403、PC 守卫、同步、WebSocket、Mobile 构建、备份恢复，逐项提供触发条件、检查、命令、成功判据、恢复和升级条件。

- [ ] **Step 3：核对命令确实存在**

所有命令必须能追溯到 `package.json`、Maven 或 Compose；禁止虚构 `npm test`、测试类、备份脚本或 CI 命令。

- [ ] **Step 4：提交运维文档**

```powershell
git add -- docs/operations
git diff --cached --check
git commit -m "docs: rewrite deployment and operations guides"
```

---

### 任务 7：重建当前状态、计划和变更记录

**文件：**

- 新建：`docs/current/Status.md`、`IssuesAndReview.md`
- 新建：`docs/planning/README.md`、`Overview.md`、`AIRag.md`、`BackendCore.md`、`DocsAcceptance.md`、`FrontendMobileTablet.md`、`FrontendPC.md`、`InfraRelease.md`、`TabletHandwritingNotes.md`
- 新建：`docs/release/Changelog.md`

**接口：** 输入为所有新权威文档和旧快照中的用户修改；输出为一个状态快照、一个风险登记表、可执行计划和一个历史日志。

- [ ] **Step 1：编写精简状态索引**

表格固定为模块、状态、代码证据、最近命令证据、人工验收、下一步。Task 9 前命令状态统一写“本轮尚未执行”。

- [ ] **Step 2：编写未关闭风险登记**

至少覆盖：PC 守卫关闭、后端无测试、删除语义、MinIO 对象校验、生产 LangChain4j 配置键、`position` 漂移、CI/监控/备份缺失、GUI/真机/外部服务验收。每项写优先级、证据、影响、动作、领域、关闭条件。

- [ ] **Step 3：重建计划入口与总览**

定义任务状态、依赖、优先级、验收证据和完成规则；已完成历史工作只能进入 Changelog。

- [ ] **Step 4：重写领域计划**

每份计划包含当前事实、目标、前置条件、有序任务、精确验证、阻塞和完成定义。Tablet 手写继续 feature-flagged，禁止抢在多端主流程之前。

- [ ] **Step 5：重建 Changelog**

保留快照中可确认的历史记录和用户当前 PC 设计/依赖修改。本轮文档迁移在 Task 9 前只写 Unreleased。

- [ ] **Step 6：检查职责分离**

状态文档禁止出现多段页面实现长文；计划禁止把未来任务写成已验收。发现后改为简短事实加权威链接。

- [ ] **Step 7：提交状态、计划和发布文档**

```powershell
git add -- docs/current docs/planning docs/release
git diff --cached --check
git commit -m "docs: rebuild status plans and release history"
```

---

### 任务 8：切换旧路径并修复全部引用

**文件：**

- 删除：除 `README.md` 外所有旧 `docs/*.md`
- 删除：`docs/frontend/design.md` 和旧 `docs/plans/*.md`
- 修改：仍引用旧路径的仓库 Markdown 或 Agent 配置

**接口：** 输入为完整新文档和已验证快照；输出为不存在重复权威来源的单一现行文档树。

- [ ] **Step 1：再次确认每个旧文件都有快照副本**

逐个断言迁移表中的旧路径在快照下存在；任何缺失都必须停止删除。

- [ ] **Step 2：删除旧现行文档**

只删除迁移表中的旧根文档、`frontend/design.md` 和旧 `plans/*.md`。禁止删除新 `README.md`、设计、实施计划或任何归档。

- [ ] **Step 3：搜索旧引用**

```powershell
$patterns = @(
  'docs/AgentBeforeCoding.md','docs/StatusIndex.md','docs/CurrentIssuesAndReview.md',
  'docs/FrontendPC.md','docs/FrontendMobileTablet.md','docs/Backend.md',
  'docs/InfrastructureAndData.md','docs/APIManifest.md','docs/DatabaseDesign.md',
  'docs/frontend/design.md','docs/plans/'
)
Get-ChildItem -LiteralPath . -Recurse -File -Include '*.md','*.txt','*.yml','*.yaml','*.json' |
  Where-Object { $_.FullName -notmatch '\\.git\\|\\node_modules\\|\\dist\\|docs\\archive\\' } |
  Select-String -SimpleMatch -Pattern $patterns
```

预期：`docs/archive/` 外无结果。

- [ ] **Step 4：验证根目录和元数据**

```powershell
Get-ChildItem -LiteralPath 'docs' -File -Filter '*.md' | Select-Object -ExpandProperty Name
$liveDocs = Get-ChildItem -LiteralPath 'docs' -Recurse -File -Filter '*.md' |
  Where-Object { $_.FullName -notmatch '\\archive\\' }
foreach ($file in $liveDocs) {
  $content = Get-Content -Raw -LiteralPath $file.FullName
  foreach ($field in @('更新时间：','文档状态：','权威范围：','事实来源：')) {
    if (-not $content.Contains($field)) { "MISSING $field $($file.FullName)" }
  }
}
```

预期：根目录只显示 `README.md`，无 `MISSING`。

- [ ] **Step 5：提交路径切换**

```powershell
git add -- AGENTS.md docs
git diff --cached --check
git commit -m "docs: cut over to categorized documentation"
```

---

### 任务 9：执行全量文档、构建与测试验证

**文件：** 根据实际结果修改 `docs/current/Status.md`、`IssuesAndReview.md`、`docs/release/Changelog.md` 和发现错误的权威文档。

**接口：** 输入为完成切换的文档树和当前应用代码；输出为带日期的验证证据和明确的人工验收清单。

- [ ] **Step 1：检查现行 Markdown 相对链接**

```powershell
$liveDocs = Get-ChildItem -LiteralPath 'docs' -Recurse -File -Filter '*.md' |
  Where-Object { $_.FullName -notmatch '\\archive\\' }
$missing = @()
$linkPattern = '!?' + '\[[^\]]*\]\((?<target><[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)'
foreach ($file in $liveDocs) {
  $content = Get-Content -Raw -LiteralPath $file.FullName
  foreach ($match in [regex]::Matches($content, $linkPattern)) {
    $target = $match.Groups['target'].Value.Trim('<','>')
    if ($target -match '^(https?://|mailto:|#|data:)') { continue }
    $pathOnly = [System.Uri]::UnescapeDataString(($target -split '#', 2)[0])
    if ([string]::IsNullOrWhiteSpace($pathOnly)) { continue }
    $resolved = [System.IO.Path]::GetFullPath((Join-Path $file.DirectoryName $pathOnly))
    if (-not (Test-Path -LiteralPath $resolved)) {
      $missing += [pscustomobject]@{ File = $file.FullName; Target = $target; Resolved = $resolved }
    }
  }
}
$missing | Format-Table -AutoSize
"missingLinks=$($missing.Count)"
```

预期：`missingLinks=0`。

- [ ] **Step 2：检查路径和旧名称**

```powershell
$liveDocs = Get-ChildItem -LiteralPath 'docs' -Recurse -File -Filter '*.md' |
  Where-Object { $_.FullName -notmatch '\\archive\\' }
$pathPattern = '`(?<path>(?:Auralis-PC|Auralis-Mobile|Auralis-Server|docs|data)[^`\r\n]*)`'
foreach ($file in $liveDocs) {
  $content = Get-Content -Raw -LiteralPath $file.FullName
  foreach ($match in [regex]::Matches($content, $pathPattern)) {
    '{0}`t{1}' -f $file.FullName,$match.Groups['path'].Value
  }
}
$liveDocs | Select-String -Pattern 'StudyCore' -CaseSensitive:$false
```

逐条确认路径存在或明确标为历史、计划、产物、环境变量、通配符或示例。`StudyCore` 只能出现在改名历史或明确的旧名说明中。

- [ ] **Step 3：重新核对 API、实体、路由和基础设施清单**

重复 Tasks 3–6 中的注解、实体、PC 路由、Mobile 页面、脚本、配置和 Compose 扫描，只修正文档不一致。

- [ ] **Step 4：运行 PC Web 构建**

```powershell
cd Auralis-PC
npm.cmd run build
```

预期：记录退出码；失败时记录首个可操作错误，禁止修改 PC 代码。

- [ ] **Step 5：运行 Mobile H5、微信和侧栏检查**

```powershell
cd Auralis-Mobile
npm.cmd run build:h5
npm.cmd run build:mp-weixin
node scripts\check-tablet-sidebar-transition.mjs
```

预期：三项独立记录；禁止据此推断 App、Harmony、开发者工具或真机验收。

- [ ] **Step 6：运行后端测试**

```powershell
cd Auralis-Server
mvn test
```

预期：记录 Maven 结果；若 `src/test` 仍为空，必须同时声明没有测试源码。

- [ ] **Step 7：用实际结果更新证据文档**

把“本轮尚未执行”替换为日期、命令和真实结果；失败项留在风险登记；Changelog 只记录实际通过项。

- [ ] **Step 8：最终 Git 与格式检查**

```powershell
git diff --check -- AGENTS.md docs
git status --short
git diff --name-status -- AGENTS.md docs
```

预期：文档范围无空白错误；用户的应用代码修改仍存在且未暂存。

- [ ] **Step 9：提交最终验证证据**

```powershell
git add -- docs
git diff --cached --check
git commit -m "docs: record documentation verification evidence"
```

- [ ] **Step 10：按强制模板交接**

最终回复必须列出完成结果、现行入口、归档快照、修改分类、全部命令与结果、剩余风险、Tauri/微信/真机/外部服务人工验收，以及无关业务代码改动保持未暂存的确认。

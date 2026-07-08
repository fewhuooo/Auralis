# StudyCore 任务计划目录

更新时间：2026-07-02

本目录用于维护 StudyCore 当前可执行的任务计划。和旧版按阶段堆叠的大总表不同，这里按领域拆开，方便逐项推进、逐项验收。

## 阅读顺序

1. `PlanOverview.md`
2. 对应领域计划
3. `../StatusIndex.md`
4. `../CurrentIssuesAndReview.md`

## 计划文件

| 文件 | 领域 | 用途 |
| --- | --- | --- |
| `PlanOverview.md` | 总览 | 当前阶段、优先级、依赖关系、推进顺序 |
| `PlanFrontendPC.md` | PC 前端 | PC 路由、页面、交互、验收 |
| `PlanFrontendMobileTablet.md` | Mobile / Tablet | 手机端、平板端重构与验收 |
| `PlanTabletHandwritingNotes.md` | Tablet 手写笔记 | 学科文件批注、学科独立手写笔记、随手记无限画布 |
| `PlanBackendCore.md` | 后端核心 | Auth、Asset、Sync、Stats、WebSocket、测试 |
| `PlanAIRag.md` | AI / RAG | AI 接口、文档解析、向量检索、后续 RAG 能力 |
| `PlanInfraRelease.md` | 基础设施与发布 | Docker、环境变量、CI/CD、部署和运维 |
| `PlanDocsAcceptance.md` | 文档与验收 | 文档维护、人工验收、交付口径 |

## 任务字段说明

| 字段 | 含义 |
| --- | --- |
| ID | 领域缩写 + 序号，例如 `PC-01`、`BE-03` |
| 优先级 | `P1` 必须优先，`P2` 重要但可排后，`P3` 增强项 |
| 任务 | 可被单独领取和验收的一项工作 |
| 状态 | 使用统一状态口径 |
| 输入 | 开始任务前要看的代码、文档或配置 |
| 产出 | 完成后应该产生的代码、文档、测试或记录 |
| 验收 | 判断任务完成的具体标准 |

## 状态口径

- `已验收`：有构建、测试、联调或人工验收证据。
- `已构建待验收`：代码或页面已存在，但缺少测试或人工验收。
- `进行中`：部分实现存在，尚未闭环。
- `计划中`：仅有需求或设计。
- `阻塞`：依赖外部条件或关键决策。

## 更新规则

- 任务完成后，把对应状态更新为 `已验收` 或 `已构建待验收`。
- 新发现问题时，先更新对应计划，再同步 `../CurrentIssuesAndReview.md`。
- 涉及发布范围变化时，同步 `../Changelog.md`。
- 不把“构建通过”直接写成“已验收”，除非有测试、联调或人工验收依据。

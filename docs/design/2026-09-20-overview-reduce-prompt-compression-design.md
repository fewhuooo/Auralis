# Overview Reduce Prompt 均衡压缩设计

更新时间：2026-09-20

文档状态：已批准设计，待实施

## 目标

增强 Overview Map/Reduce 流程中 Reduce 阶段的实际归并能力。Reduce 应把多个已压缩 JSON 重新组织成更少、更密集的主题结构，而不是按输入文档逐项复述；序列化输出目标为约 2500–3000 字符。

## 已确认问题

`OverviewGenerationService` 当前只区分 `INTERMEDIATE` 与 `FINAL` 输出阶段，没有区分 MAP 与 REDUCE 调用类型：

- 多批 MAP 与非最终 Reduce 共用 intermediate prompt。
- 最终 Reduce 使用通用 final prompt；该 prompt 只有 schema、安全和 `Compact JSON` 约束，没有明确的跨文档合并、去重和信息取舍规则。
- 真实样本中 MAP 已能收敛到 1447–3680 字符，但 Reduce 曾产生 4678 字符的 intermediate JSON；另一次最终 Reduce 返回 6556 字符并进入 JSON 解析失败。

问题重点是 Reduce 缺少专用语义，不是公开 schema、Provider 配额或分组算法缺失。

## 设计

### Prompt 分类

在服务内部同时表达两个维度：

- 调用类型：`MAP`、`REDUCE`。
- 输出阶段：`INTERMEDIATE`、`FINAL`。

MAP 继续使用现有 prompt 行为。REDUCE 无论处于 intermediate 还是 final，都在现有 SYSTEM schema、安全、mode、alias 和 locator 规则之后追加 Reduce 专用指令。该分类只决定 system prompt，不改变请求 DTO、Provider 请求结构或响应验证。

### Reduce 专用指令

Reduce prompt 必须明确以下约束：

1. 输入是多个已经压缩的 Overview JSON，任务是重新归并，而不是逐个复述输入。
2. 合并重复、重叠、相邻和同义主题；不得为每个输入文档机械创建独立 chapter 或 section。
3. 同一事实只保留一次，并放在 outline、summary.overview、keyPoints 或 learningPath 中最合适的位置；避免跨字段重复表达。
4. 优先保留定义、概念关系、因果链、关键结论和理解结论所必需的证据。
5. 优先删除例子、修辞、过程性描述、重复限定语、重复结论和低价值细节。
6. 使用更少、更密集的 chapter 与 section；标题短，section summary、overview、keyPoints 和 learningPath 使用短句。
7. 不复制输入原句，不增加输入中不存在的事实，不改变 alias、mode、schema 或 `locator=null` 规则。
8. 序列化 JSON 目标约为 2500–3000 字符；这是模型生成目标，不替代现有硬校验。

### 保留边界

以下行为保持不变：

- intermediate `max_tokens=4608`、final `max_tokens=6144`；
- intermediate 规范化 JSON `<=5200` 字符；
- self-pair prompt `<=12000`；
- Reduce no-progress 检查；
- Map/Reduce 分组、批次和调用次数；
- JSON/schema/alias/locator/mode 校验；
- Provider、timeout、错误码、API、OpenAPI、数据库和 PC 缓存契约；
- 不增加自动压缩重试。

## 测试策略

先以失败测试固定以下行为，再修改生产 prompt：

1. 非最终 Reduce 的 system prompt 包含 Reduce 专用归并、跨输入去重和 2500–3000 字符目标。
2. 最终 Reduce 同样包含 Reduce 专用 prompt。
3. 最终单批 MAP 不包含 Reduce 专用语义，保持当前 MAP 行为。
4. intermediate MAP 继续包含当前 distinct-topic 与 compact JSON 约束。
5. 现有 intermediate 5200 字符、self-pair、no-progress、schema、mode、alias 和 Source fence 测试保持通过。

自动测试只验证 prompt 路由、文本约束和既有服务行为，不证明真实 DeepSeek 的压缩率、内容覆盖、延迟或费用。

## 文档与验收

实现完成后同步：

- `docs/modules/Backend.md`
- `docs/current/Status.md`
- `docs/current/IssuesAndReview.md`
- `docs/release/Changelog.md`

关闭代码任务需要 focused Server 测试、相关 Provider/Overview 回归和 `git diff --check` 通过。真实 DeepSeek 样本仍需记录 Reduce 输出字符数、token、JSON/schema 成功和内容覆盖人工检查，不能由自动测试替代。

## 完成条件

- MAP 与 REDUCE prompt 路由明确分离。
- intermediate 与 final Reduce 都收到专用均衡压缩指令。
- MAP 行为、预算、硬校验和公开契约不变。
- BLOCKER 与 IMPORTANT 为 0，相关自动测试通过。
- 真实 Provider 验收边界在现行文档中保持开放。

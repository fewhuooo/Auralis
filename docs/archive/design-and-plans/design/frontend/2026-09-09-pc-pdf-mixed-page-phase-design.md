# PC PDF 混合页面处理阶段修复设计

更新时间：2026-09-09

文档状态：已批准，待实施

权威范围：PC Tauri 文档处理 runner 在同一 PDF 内交替处理文字页与 OCR 页时的本地任务阶段语义

## 问题

`DocumentJobRunner` 根据每个输出 block 的类型选择阶段：普通文字 block 写入 `EXTRACTING`，OCR block 写入 `OCR_RUNNING`。当 PDF 顺序为“文字页 → OCR 页 → 文字页”时，第三页会请求 `OCR_RUNNING → EXTRACTING`；现行持久化状态机禁止该回退并抛出 `DOCUMENT_JOB_ILLEGAL_TRANSITION`。

页面是否进入 OCR 由其文字层决定。视觉上属于文字版的 PDF 仍可能有个别页缺少可用文字层，因此单页 OCR 不等于整份文档误判。

## 决策

解析阶段保持单调推进：任务一旦进入 `OCR_RUNNING`，后续解析期间的普通文字 block 继续以 `OCR_RUNNING` 原子保存 checkpoint，直到进入 `PACKAGING`。不新增或放宽 `OCR_RUNNING → EXTRACTING`，不改变服务端 API、数据库 schema、上传协议或 OCR 页面分类阈值。

该语义把 `OCR_RUNNING` 解释为“本任务已经进入需要 OCR 的混合解析阶段”，而不是仅表示当前 block 的来源。它保持现有恢复边界，并避免进度阶段在同一文档中反复回退。

## 修改范围

- 在 `Auralis-PC/scripts/r4-document-job-runner.test.mjs` 增加真实状态转换约束下的“文字 → OCR → 文字”回归，先证明当前实现抛出非法转换。
- 在 `Auralis-PC/src/services/documentProcessing/DocumentJobRunner.ts` 仅调整 block 持久化阶段选择：当前持久化阶段已经是 `OCR_RUNNING` 时，不因普通文字 block 回退到 `EXTRACTING`。
- 同步 `docs/modules/FrontendPC.md`、`docs/current/Status.md`、`docs/current/IssuesAndReview.md` 和 `docs/release/Changelog.md` 的实现、验证与 GUI 验收边界。

## 验证

1. 新增回归必须在生产代码修改前以预期的 `DOCUMENT_JOB_ILLEGAL_TRANSITION` 失败。
2. 修改后运行聚焦 runner 测试并确认混合页面任务进入 `PACKAGING`，checkpoint 保留最后一页和连续 block ordinal。
3. 运行完整 PC 回归、TypeScript 类型检查和 `git diff --check`。
4. 自动测试不替代真实 Tauri GUI：仍需使用用户的 51 页 PDF 重试，确认第 14 页 OCR 后能继续处理后续文字页并完成上传。

## 非目标

- 不处理旧式 `.ppt` 的解析兼容性。
- 不改变 PDF 页面文字/OCR 分类算法。
- 不重构整个文档任务状态机。
- 不声称 Server、MinIO 或 GUI 已因自动测试通过而完成验收。

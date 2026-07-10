> [!WARNING]
> 本快照仅用于追溯 2026-07-10 文档重构前的工作树。它不是 Auralis 当前实现、状态、接口或任务的依据。

# 2026-07-10 重构前文档快照说明

快照日期：2026-07-10

来源分支：`codex/tablet-handwriting-notes`

来源提交：`5cbee8d`

文档状态：历史快照说明

权威范围：说明本快照的来源、覆盖范围、排除项和完整性检查

事实来源：复制时的当前工作树与逐文件 SHA-256 校验结果

## 覆盖范围

本目录镜像了重构前的 35 份旧 Markdown，包括：

- `docs/` 根目录旧文档；
- `docs/frontend/`；
- `docs/plans/`；
- 当时已有的 `docs/archive/`。

复制时工作树中以下文档存在未提交修改，快照保存的是修改后的工作树版本：

- `docs/Changelog.md`
- `docs/FrontendPC.md`
- `docs/StatusIndex.md`
- `docs/frontend/design.md`

## 排除项

以下文件属于本次新文档体系，不是旧档，因此没有进入快照：

- `docs/design/DocumentationArchitecture.md`
- `docs/planning/DocumentationReorganizationImplementation.md`
- 本文件 `SNAPSHOT.md`

## 完整性

复制完成后逐文件比较源文件与快照文件的 SHA-256，35 份文件全部一致。随后在每份快照顶部添加统一历史警告；剥离该警告后再次比较正文 SHA-256，差异数为 0。

旧 `MobilePagesAPIMap.md` 正文原有一处行尾空格。`git diff --check` 会报告该历史格式问题；为保持正文哈希一致，快照中不修复此处空格。现行新文档不得继承该问题。

快照根目录的 `README.md` 是旧文档中心本身，必须保留为历史正文；因此本快照使用独立的 `SNAPSHOT.md` 保存快照说明。

## 使用限制

- 禁止根据本快照判断当前完成度。
- 禁止根据本快照恢复旧实现或旧命名。
- 禁止把本快照中的计划直接转为当前任务。
- 当前事实请从 [`docs/README.md`](../../../README.md) 进入现行文档体系。

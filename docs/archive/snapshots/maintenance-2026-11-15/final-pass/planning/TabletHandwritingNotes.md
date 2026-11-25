# 历史原文快照

仅用于追溯，不是现行工程依据。原路径：`docs/planning/TabletHandwritingNotes.md`。
原文字节 SHA-256：`9014c54c7a41884f998c045dfa23540ae167595162e8331b1cc112d3c21da822`。分界后的内容保留归档时工作树原文字节，原文相对链接按原路径解释。

<!-- ORIGINAL WORKTREE CONTENT -->
# Tablet 手写笔记计划

更新时间：2026-07-10

文档状态：计划，入口已隐藏保留

权威范围：Tablet 手写笔记、文件批注、端侧存储、feature flag、备份与真机验收

事实来源：`modules/FrontendMobileTablet.md`、`contracts/Database.md`、前端设计与 feature flag

## 目标

在不破坏核心同步主流程的前提下，安全恢复 Tablet 手写笔记、文件批注和随手记能力。

## 当前事实

- `tablet_notes`、NoteDocument、repository、handwritingEngine 和相关页面代码存在。
- `VITE_TABLET_HANDWRITING_NOTES_ENABLED` 默认关闭入口。
- 当前不进入 Server 同步，没有正式导入导出/云备份验收。

## 架构原则

- 端侧笔记是独立数据域，不能伪装成已同步知识块。
- 文件批注通过 `subject_id`、`asset_id` 和 mode 绑定上下文。
- 笔迹原始数据优先保存，AI 转换是可选派生结果。
- 入口开关与数据迁移分开，关闭入口不能删除用户数据。

## 有序任务

1. 为 note model 与 repository core 运行/补齐单元测试。
2. 定义笔记版本、序列化、迁移、损坏恢复和容量策略。
3. 实现导出/导入和加密/备份方案。
4. 在真实平板验证文件切换恢复、画布平移缩放、笔刷、橡皮、撤销、清屏。
5. 验证长时间书写、低内存、后台恢复和大文档。
6. 明确是否进入 Server 同步；若进入，先定义冲突、加密、对象存储和数据量策略。
7. 通过专项验收后再打开 feature flag。

## 验证

```powershell
cd Auralis-Mobile
node scripts\tablet-feature-flags.test.ts
node scripts\tablet-note-model.test.ts
node scripts\tablet-note-repository-core.test.ts
```

以上命令是否可直接由 Node 执行需在实际环境确认；若需要 TypeScript runner，先建立明确脚本，不得伪报通过。

## 阻塞

- 真机、笔输入设备、备份位置、导出格式、隐私策略与同步产品决策。

## 完成定义

- 数据不因开关、崩溃或文件切换丢失。
- 导出/导入和损坏恢复可验证。
- 指定真实平板完成专项走查。
- 启用 feature flag 前状态、用户手册和 Changelog 已同步。

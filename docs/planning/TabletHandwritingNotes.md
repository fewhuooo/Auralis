# Tablet 手写笔记计划

更新时间：2026-11-15

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

1. 运行现有 `test:tablet` 中的 feature flags、note model 与 repository core 测试，按实际行为缺口补齐验证。
2. 定义笔记版本、序列化、迁移、损坏恢复和容量策略。
3. 实现导出/导入和加密/备份方案。
4. 在真实平板验证文件切换恢复、画布平移缩放、笔刷、橡皮、撤销、清屏。
5. 验证长时间书写、低内存、后台恢复和大文档。
6. 明确是否进入 Server 同步；若进入，先定义冲突、加密、对象存储和数据量策略。
7. 通过专项验收后再打开 feature flag。

## 验证

```powershell
cd Auralis-Mobile
npm.cmd run test:tablet
```

现有 `test:tablet` 脚本通过 Node 的 `--experimental-strip-types` 执行三组测试。运行结果需单独记录，不替代下述真机与备份验收。

## 阻塞

- 真机、笔输入设备、备份位置、导出格式、隐私策略与同步产品决策。

## 完成定义

- 数据不因开关、崩溃或文件切换丢失。
- 导出/导入和损坏恢复可验证。
- 指定真实平板完成专项走查。
- 启用 feature flag 前状态、用户手册和 Changelog 已同步。

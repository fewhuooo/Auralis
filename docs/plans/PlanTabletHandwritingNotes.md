# Tablet 手写笔记专项计划

更新时间：2026-07-08

## 目标

在 `StudyCore-Mobile` 的平板端建立统一的本地手写笔记与批注能力，覆盖三类场景：

- 学科内文件批注：绑定 `subjectId + assetId`，用于 PDF、图片、扫描件等资料上方的手写圈画和标注。
- 学科内独立手写笔记：绑定 `subjectId`，不绑定具体文件，用于课堂推导、错题整理、章节笔记。
- 随手记无限画布：不绑定学科和文件，用于临时草稿、灵感整理和自由推演。

本专项只覆盖 Tablet 端。本阶段不新增后端接口，不做云同步，不改变 PC 和手机端核心流程。

## 当前事实

- 平板端已有 `pages/tablet/workspace/index.vue`，其中集成了文件阅读与手写批注画布。
- 平板端已有 `pages/tablet/handwriting/index.vue`，当前定位为随手记草稿本。
- `StudyCore-Mobile/src/services/handwritingEngine.ts` 已基于 `perfect-freehand` 提供笔迹渲染、橡皮、撤销和 PNG 导出能力。
- `StudyCore-Mobile/src/services/notebookStorage.ts` 已通过 `localDb.ts` 保存基础 notebook 数据，但当前模型偏单一草稿本。
- workspace 内文件批注目前仍偏页面内存态，尚未形成 `subjectId + assetId` 级别的稳定本地持久化。

## 架构决策

采用“统一手写内核 + 三种文档模式”的分层方式，参考 Rnote 的文档、内容、工具和视口拆分思路，但不引入 Rust/GTK 架构。

核心类型口径：

```ts
type NoteMode =
  | 'subject-asset-annotation'
  | 'subject-handwriting-note'
  | 'quick-infinite-canvas'

type CanvasLayout =
  | 'paged'
  | 'continuous'
  | 'infinite'

interface NotePage {
  id: string
  index: number
  width: number
  height: number
  backgroundAssetId?: string
}

interface NoteStrokePoint {
  x: number
  y: number
  pressure: number
  tiltX: number
  tiltY: number
  timestamp: number
}

interface NoteStroke {
  id: string
  pageId?: string
  points: NoteStrokePoint[]
  tool: 'pen' | 'pencil' | 'highlighter' | 'eraser'
  color: string
  size: number
  createdAt: string
}

interface NoteDocument {
  id: string
  mode: NoteMode
  subjectId?: string
  assetId?: string
  title: string
  layout: CanvasLayout
  pages: NotePage[]
  strokes: NoteStroke[]
  viewport: { x: number; y: number; scale: number }
  background: 'blank' | 'grid' | 'lined' | 'dotted' | 'asset'
  createdAt: string
  updatedAt: string
}
```

模块边界：

- `HandwritingEngine`：保留现有能力，继续负责笔迹渲染、撤销、橡皮和导出。
- `StrokeStore`：从页面状态中抽出笔迹集合、历史记录和选择状态，供三类文档共用。
- `ToolController`：统一钢笔、铅笔、荧光笔、橡皮、浏览/平移等工具状态。
- `ViewportCamera`：统一缩放、平移和屏幕坐标到文档坐标的转换；随手记启用 `infinite`。
- `LocalNoteRepository`：基于 `localDb.ts` 管理三类 `NoteDocument` 的本地保存、加载、导入和导出。

## 任务清单

| ID | 优先级 | 任务 | 状态 | 输入 | 产出 | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| TH-01 | P1 | 统一手写文档模型 | 计划中 | `handwritingEngine.ts`、`notebookStorage.ts`、`tablet/handwriting/index.vue`、`tablet/workspace/index.vue` | `NoteDocument`、`NoteMode`、`CanvasLayout`、`NoteStroke` 类型口径 | 三类笔记可用同一份数据结构表达 |
| TH-02 | P1 | 本地笔记存储升级 | 计划中 | `localDb.ts`、`notebookStorage.ts` | 按 `noteId` 保存文档元数据、笔迹、背景和 viewport | 刷新或重新进入后可恢复笔记内容 |
| TH-03 | P1 | 学科文件批注持久化 | 计划中 | `workspace` 文件批注画布、当前 `fileStrokesMap` | 批注绑定 `subjectId + assetId` 并本地持久化 | 切换文件、退出工作区、重新进入后批注仍存在 |
| TH-04 | P1 | 学科独立手写笔记入口 | 计划中 | `workspace` 的“+ 笔记”入口、`tablet/handwriting` | 创建并打开 `subject-handwriting-note` | 学科内可新建、打开、保存独立手写笔记 |
| TH-05 | P2 | 随手记无限画布 | 计划中 | `tablet/handwriting/index.vue`、`HandwritingEngine` | `quick-infinite-canvas` 模式、平移缩放、viewport 保存 | 随手记可无限画布书写，退出重进后恢复视口和笔迹 |
| TH-06 | P2 | 导入导出与验收记录 | 计划中 | `NotebookStorage`、现有 PNG/PDF 导出 | `.studycore-note.json` 导出/导入，保留 PNG 导出 | 三类模式可导出备份，导入后内容一致 |

## 执行顺序

1. `TH-01` 和 `TH-02`：先稳定数据模型和本地保存边界。
2. `TH-03` 和 `TH-04`：再把学科内文件批注、独立手写笔记接入同一模型。
3. `TH-05`：最后把随手记从固定单页升级为无限画布。
4. `TH-06`：补齐导入导出和验收记录。

## 验收方式

- `cd StudyCore-Mobile && npm.cmd run build:h5` 通过。
- `cd StudyCore-Mobile && npm.cmd run build:mp-weixin` 通过，且微信小程序仍不包含 Tablet 页面。
- 人工验证 Tablet H5：
  - 学科文件 A 写批注，切换到文件 B，再切回文件 A，批注仍在。
  - 新建学科独立手写笔记，返回 workspace 后重新打开，笔迹仍在。
  - 打开随手记，拖动和缩放无限画布，退出重进后 viewport 与笔迹恢复。
  - 撤销、橡皮、清空、导出 PNG 在三类模式下行为一致。

## 暂不纳入

- 不新增后端接口。
- 不做账号级云同步和跨设备冲突合并。
- 不做完整 PDF 矢量回写，只做资料预览层上方的本地笔迹叠加。
- 不引入新的绘图库，继续使用当前 `perfect-freehand`。

# Mobile / Tablet 前端计划

更新时间：2026-07-02

## 目标

把 `Auralis-Mobile` 从“页面重构中”推进到“手机端和平板端入口清晰、H5 可验收”。本计划不默认覆盖 App、小程序、Harmony 的正式验收。

## 当前事实

手机端当前页面：

- `home`
- `pomodoro`
- `ai-search`
- `stats`
- `settings`
- `login`
- `timeline`
- `review`
- `asset`
- `profile`
- `handwriting`

平板端当前已注册页面：

- `dashboard`
- `subject-hall`
- `workspace`
- `handwriting`
- `pomodoro`
- `review`
- `profile`

平板端目录存在但未注册：

- `stats`

已删除旧平板页面：

- `asset`
- `timeline`

平板端侧栏首次页面切换闪动已用 `TabletLayout` 的 120ms 指示器动效、160ms 路由重载和 `scripts/check-tablet-sidebar-transition.mjs` 两帧余量检查收口；新页面首帧导航索引优先取当前路由，避免 store 默认值造成胶囊闪回。

## 任务清单

| ID | 优先级 | 任务 | 状态 | 输入 | 产出 | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| MT-01 | P1 | 平板页面注册收口 | 进行中 | `pages.json`、`src/pages/tablet` | 页面目录与注册表一致 | 不存在未解释的目录或死链 |
| MT-02 | P1 | 平板 `stats` 去向决策 | 进行中 | `src/pages/tablet/stats` | 注册为正式页或合并删除 | `pages.json` 与导航同步 |
| MT-03 | P1 | 旧 `asset` 能力迁移 | 进行中 | 旧删除状态、workspace 页面 | 资产能力在新页面有入口 | 平板端可进入资产相关流程 |
| MT-04 | P1 | 旧 `timeline` 能力迁移 | 进行中 | 旧删除状态、dashboard/workspace/review | 时间线或任务能力有承接 | 平板端可查看或处理任务状态 |
| MT-05 | P1 | 平板导航统一 | 进行中 | TabletLayout、pages.json | dashboard、subject-hall、workspace 等入口一致 | 点击导航无 404 或空白 |
| MT-06 | P1 | 手机端主流程检查 | 已构建待验收 | 手机页面、Store、API | home、review、asset、timeline 主链路可走 | H5 人工走通一次 |
| MT-07 | P2 | 手写页联调 | 已构建待验收 | handwriting、AI convert API | 手写内容可保存或转换 | 错误时有反馈 |
| MT-08 | P2 | 本地存储和离线恢复 | 进行中 | `localDb.ts`、Store | 冷启动和断网行为清楚 | 断网后不破坏本地数据 |
| MT-09 | P2 | H5 构建警告清理 | 进行中 | `npm.cmd run build:h5` 输出 | 警告清单或修复记录 | 无关键构建警告或有解释 |
| MT-10 | P3 | 目标平台验收计划 | 计划中 | Uni-app 目标平台 | App/小程序/Harmony 验收范围 | 明确不在当前里程碑的目标 |
| MT-11 | P1 | Tablet 手写文档模型统一 | 代码保留，入口默认隐藏 | `PlanTabletHandwritingNotes.md`、`handwritingEngine.ts`、`notebookStorage.ts` | 三类手写文档共享 `NoteDocument` 模型 | 后续打开 `VITE_TABLET_HANDWRITING_NOTES_ENABLED` 后再验收 |
| MT-12 | P1 | Tablet 手写本地持久化升级 | 代码保留，入口默认隐藏 | `localDb.ts`、`notebookStorage.ts` | 按 `noteId` 保存元数据、笔迹、背景、viewport | 后续打开 feature flag 后再验收重进恢复 |
| MT-13 | P1 | 学科文件批注持久化 | 代码保留，入口默认隐藏 | `workspace` 文件批注画布 | 批注绑定 `subjectId + assetId` 本地保存 | 后续打开 feature flag 后再验收文件切换恢复 |
| MT-14 | P1 | 学科独立手写笔记入口 | 代码保留，入口默认隐藏 | `workspace` 的“+ 笔记”、`tablet/handwriting` | 创建 `subject-handwriting-note` 并复用手写页 | 后续打开 feature flag 后再验收 |
| MT-15 | P2 | 随手记无限画布 | 代码保留，入口默认隐藏 | `tablet/handwriting/index.vue`、`HandwritingEngine` | `quick-infinite-canvas`、平移缩放、viewport 保存 | 后续打开 feature flag 后再验收 |

## 建议执行顺序

1. `MT-01` 和 `MT-02`：先让页面注册表干净。
2. `MT-03` 到 `MT-05`：确认平板新旧页面迁移。
3. `MT-06` 到 `MT-09`：验证手机端、手写、本地存储和构建。
4. `MT-10`：单独规划多平台验收。
5. `MT-11` 到 `MT-15`：代码保留但入口默认隐藏；待前后端主流程完成后按 `PlanTabletHandwritingNotes.md` 继续。

## 完成定义

- `pages.json` 与页面目录一致。
- 平板端旧资产、时间线能力去向明确。
- Mobile H5 构建通过并记录警告处理结果。
- 手机和平板核心入口人工验收通过。
- Tablet 手写笔记专项按本地存储口径完成文件批注、学科手写笔记和随手记无限画布验收。
- 文档同步到 `FrontendMobileTablet.md`、`StatusIndex.md`、`CurrentIssuesAndReview.md`。

# PC 学科工作区重建实施计划

> 执行说明：本计划只重建 PC 视觉与本地交互原型。学科大纲和文件总结暂不新增持久化字段或 API；刷新后回到静态初始状态。

## 1. 建立可验证的页面交互契约

**文件：**
- 新增：`Auralis-PC/scripts/check-subject-workspace-reconstruction.mjs`
- 修改：`Auralis-PC/package.json`

1. 新增静态检查脚本，先断言当前页面仍含 PDF 中栏、文件操作按钮与旧目录入口，使脚本在实现前失败。
2. 为脚本增加 `check:subject-workspace` 命令。
3. 执行脚本，确认失败输出对应缺失的新交互契约。

## 2. 改造材料总结与学科大纲编排页

**文件：**
- 修改：`Auralis-PC/src/views/SubjectWorkspace/index.vue`

1. 移除中栏 PDF 默认打开路径和左栏文件操作按钮；文件点击改为打开文件总结。
2. 在中栏添加 Markdown 总结视图：没有可用总结时展示明确的待生成状态和已关联知识块，保留既有 AI 上下文。
3. 以页面本地响应式数据提供学科大纲，移除旧的文件目录选择/解析界面和分段入口。
4. 大纲顶栏保留“AI 梳理”和可访问的圆形加号；加号切换到左栏编排视图。
5. 在编排视图中用内联输入新增章节、小节；实现章节跨列表排序与小节仅在所属章节内排序的原生拖拽处理。
6. 从大纲关联文件时复用文件总结打开行为。

## 3. 复刻移动端风格的 PC AI 伴读栏

**文件：**
- 修改：`Auralis-PC/src/views/SubjectWorkspace/index.vue`

1. 参考 `Auralis-Mobile/src/pages/mobile/ai-search/index.vue` 重组右栏的模型模式入口、星环欢迎态、星形头像、气泡和胶囊输入布局。
2. 保留 PC 的消息流、SSE、当前文件上下文、折叠和尺寸调整；不向既有 API 添加未声明的模型参数。
3. 将“清空”文字按钮替换为带 `aria-label`/`title` 的图标按钮。

## 4. 验证并回写现行文档

**文件：**
- 修改：`docs/modules/FrontendPC.md`
- 修改：`docs/design/Frontend.md`
- 修改：`docs/current/Status.md`
- 修改：`docs/current/IssuesAndReview.md`
- 修改：`docs/release/Changelog.md`
- 修改：`docs/README.md`

1. 执行页面交互契约脚本和 `npm run build`。
2. 更新 PC 模块/设计文档，明确新交互和“静态原型、未持久化”的范围。
3. 将命令验证与尚需 GUI 验收分开记录到状态、风险和变更记录。


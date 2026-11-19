# PC 学科总览与文件 AI 总结设计

更新时间：2026-09-09

文档状态：已批准实施

## 目标

把 PC 学科工作区现有静态“学科大纲”升级为“总览”：保留现有 `AI 梳理` 按钮的位置和顶栏布局；文件上传处理完成后自动生成文件大纲与总结；学科总览只在用户主动点击时生成。所有生成结果只保存在当前 PC 的用户/设备隔离本地存储中，服务端仅执行无状态生成。

## 页面结构

- 二级入口和抽屉标题使用“总览”。
- 顶部为默认折叠的“学科总览”；已有结果时显示来源文件数、生成时间和资料更新状态。
- 下方按当前学科文件顺序直接展示每个文件名及其展开的大纲，不增加“大纲/总结”页签。
- 每个文件名右侧提供“总结”按钮；点击后复用中间主预览区显示该文件总结。
- 点击文件名进入原文件预览；点击带定位信息的大纲节点进入原文件并定位到页码或知识块。缺少定位信息时只打开文件。
- 学科总结从学科总览区域进入，同样显示在中间主预览区。
- 中间总结视图提供返回文件、重新生成和生成时间；不使用模态框或新路由。

## 生成行为

FILE Source 完成 ParsedDocument 接收并达到 READY 后，PC 继续请求文件总览。服务端读取当前用户和 Source 的活动文档分块，分批归纳后再合并，一次返回文件大纲与总结。成功结果按 `userId + serverDeviceId + sourceId + ingestionRevision` 保存到本地。失败不改变 Source READY，也不把上传标记为失败。

点击现有 `AI 梳理` 后，PC 读取当前学科所有可用的本地文件总览并提交给无状态学科总览接口。服务端合并、去重并返回学科大纲与总结；PC 按 `userId + serverDeviceId + subjectId` 保存。新增、删除或重新生成文件结果后，旧学科总览标为“资料已更新”，但不自动调用 AI。

## 重新生成

- 文件总结视图提供“重新生成”，支持默认规则或一段可选补充要求。
- 文件行的更多菜单提供“重新生成大纲”和“重新生成全部”。
- 学科总结、学科大纲和全部结果使用相同语义。
- 请求模式为 `ALL`、`OUTLINE` 或 `SUMMARY`。分项成功只替换对应部分；失败保留旧结果。

## 数据契约

```json
{
  "schemaVersion": 1,
  "title": "高等数学",
  "outline": [{
    "title": "函数与极限",
    "sections": [{
      "title": "数列极限",
      "summary": "数列趋近确定值的性质与判定",
      "sourceIds": ["source-uuid"],
      "locator": { "page": 3, "blockId": null }
    }]
  }],
  "summary": {
    "overview": "课程整体概述",
    "keyPoints": ["极限是微积分的基础"],
    "learningPath": ["极限", "导数", "积分"]
  }
}
```

服务端把模型输出视为不可信输入，执行 JSON、节点数量、长度、Source 归属和 locator 校验。模型只接收服务端生成的别名，返回后再映射真实 ID。

## 存储与接口

- 本地新增专用派生缓存，不写入 `local_resource_records`、`local_mutations` 或同步 change log。Tauri 使用 SQLite，浏览器 fallback 使用 owner-scoped 独立 namespace。
- 文件记录包含 Source revision、outline、summary、各部分生成时间、输入指纹、状态和安全错误；学科记录包含 Subject、来源文件指纹及同类字段。
- `POST /api/ai/source-overviews` 接收 `sourceId`、`mode` 和可选 `instruction`，从 owner-scoped active chunks 生成。
- `POST /api/ai/subject-overviews` 接收 `subjectId`、`mode`、可选 `instruction` 和文件总览数组，验证 Source 归属后生成。
- 两个接口均同步、无状态，不创建 Conversation/Message，不新增服务端数据库表或迁移。

## 验收

- 服务端覆盖 owner scope、READY/active chunk 过滤、分批归纳、结构校验、模式隔离、补充要求、超限和 Provider 失败。
- PC 覆盖 owner-scoped 缓存、上传完成触发、失败不影响 READY、资料指纹过期、分项原子替换和页面交互。
- 自动测试和构建不能替代真实 Provider、Tauri SQLite、上传完成回调、文件定位与 GUI 视觉验收。


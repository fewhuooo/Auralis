# PC 文件上传后处理与统计接口恢复设计

日期：2026-09-05

## 目标

修复文件已经上传且 Source 已创建、但 PC 无法提交 ParsedDocument 的问题；同时消除统计接口的时间参数 500，并让上传能力与本地解析能力、界面状态提示保持一致。

## 已确认根因

1. Tauri 的 `keyring` 依赖只启用了默认特性，Windows 构建没有使用 Credential Manager 原生后端。写入和读取发生在不同 `Entry` 实例时，回退 mock 后端无法持久保存 master key，导致文档打包报 `Master key not found. Please initialize encryption first.`。
2. Stats JDBC 查询把 `java.time.Instant` 直接作为 `JdbcTemplate` 可变参数传给 PostgreSQL 驱动，驱动无法推断 SQL 类型。
3. 上传白名单包含图片与文本，但客户端 ParsedDocument parser 只支持 PDF 和 Office，导致“可上传”与“可处理”不一致。
4. 无本地任务的 `AWAITING_CLIENT` Source 使用了服务端处理中通用文案，掩盖了实际停留阶段。

## 设计决策

- Windows 继续使用现有 `auralis/master_key` 标识，只为 `keyring` 启用 `windows-native`；不增加文件密钥、环境变量密钥或明文回退。
- Stats 查询在 repository 边界把 `Instant` 统一转换为 JDBC 可明确绑定的时间对象，不改接口和数据库结构。
- 当前上传入口只接受 ParsedDocument runtime 已支持的 PDF、DOC、DOCX、PPT、PPTX。图片和文本仍可作为预览能力类型保留，但不再宣称可上传；图片 OCR 的输入仍通过图片版 PDF 支持。
- 处理中心分别显示：等待桌面端开始、桌面端处理中/失败、服务端校验、服务端索引、完成。只有 `VALIDATING/PARSING/INDEXING` 可描述为服务端处理。

## 测试与验收

- 增加依赖特性回归检查，确认 Windows 原生 keyring 后端已启用，并运行 Rust 编译检查。
- 增加 Stats repository 参数转换测试，并运行 Stats 定向后端测试。
- 更新文件能力测试，确认图片/文本在创建 upload intent 前被拒绝，PDF/Office 保持允许。
- 更新处理中心静态/组件测试，确认 `AWAITING_CLIENT` 不再显示服务端处理中。
- 最后运行 PC R4 检查、相关 Node 测试、Rust check 和后端定向测试。GUI 真机上传仍单独记录为人工验收。

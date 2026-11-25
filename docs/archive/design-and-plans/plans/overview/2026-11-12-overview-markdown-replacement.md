# Overview 清理、大纲与总结替换

日期：2026-11-12。状态：源码替换、定向验证与构建完成，尚未部署。

## 本轮范围

用户确认以已完成真实模型实验的流程直接替换旧生成实现，并授权 Antigravity 接入 PC。旧实现仅备份在仓库外，不保留运行时兼容分支。备份清单：`D:/Temp/auralis-overview-replacement-backup-20261112/manifest.json`。无用户数据删除、服务重启或部署授权。

新流程为：读取当前授权输入 → 标记原文行号 → 模型返回排除范围 → 程序生成清理副本 → 重点大纲 → 根据清理原文和大纲生成总结。大纲和总结均为 Markdown，不再生成分节教材正文。

清理固定允许封面版权、前言修订、目录、课程行政和纯章节预告五种用途；禁止按 OCR 质量、截图形式、重复或短行自行删除。正文标题、摘要、操作规则及例外、承诺条款和混合内容受保护。程序只验证协议与范围，不能承诺语义分类必然正确。原文保持，清理副本保留 UTF-16 范围映射。

`OUTLINE` 执行清理和大纲；`ALL` 继续生成总结；独立 `SUMMARY` 也从当前输入清理并生成内部大纲，响应仅交付总结。保留此前已支持的生成入口，不以重构为由禁用已支持的 SUMMARY。此前不可用的详细生成范围不在本轮扩展。所有请求继续使用现有凭据、预算、取消、期限与来源修订检查。

本轮不引入未经实验的长文分窗算法。每个阶段在派发前执行真实容量检查；无法容纳时明确失败，不截断原文，不回退旧 INDEX/MAP/REDUCE。实测总结偏长的问题单独记录，不在本次移植中擅自改变写作目标。

## 内容契约

生成结果：

```json
{
  "schemaVersion": 2,
  "title": "资料标题",
  "outlineMarkdown": "## 主题\n- 重点",
  "summaryMarkdown": "总结正文"
}
```

未请求分项为 null，请求分项必须非空。正式结果保存继续使用既有 baseVersion、clientWriteId、来源修订、来源集合和 inputDescriptor；删除重写范围的章/节 identity、provenance 输入和专用读接口，不伪造章节或来源证据。最终字段以 API 契约和 OpenAPI 为准。

旧 schemaVersion=1 正式记录保留，不自动转换、不作为新内容读取。替换旧记录仍需正确 CAS 版本，不能因内容不可用就把已有行当作 version=0。PC 不双读旧结构，也不自动重放旧格式待写记录。

## 验证与事实边界

实验材料在 `D:/Temp/auralis-overview-exclusion-constrained-repeat-20261112` 和 `D:/Temp/auralis-overview-cleaned-outline-summary-20261112`。四份实验大纲主线可用，手册关键清理保护较一致；教材提要与预告存在残留，混合行规则并非始终遵循。总结仍偏长，并不保证细节完全保留。

实现验收应分别记录清理协议和原文保真、正式入口阶段选择、保存/读取/CAS、PC Markdown 展示和编辑保存、自动测试和实际部署。实验成功不能替代新生产代码验收。具体命令和结果完成后回写 Status、IssuesAndReview 与交接记录。

后端已完成替换、OpenAPI 导出和打包。生成/清理/保存/CAS/Chat/API/SSE 定向 139 项及 TLS deadline 3 项通过。非 PG 全量 847 项中的范围内失败已修复复验，剩余两个范围外断言、两个 Docker 环境错误和两项跳过；这不是再次全量通过。详细证据见 `D:/Temp/auralis-overview-markdown-v2-implementation-20261112/report.md`。

PC 由 Antigravity 接入，主 Agent 接手必要修复和验证：定向 138/138，缓存 15/15、草稿保护 1/1、删除级联 10/10、资产流程 30/30，最终构建通过。一轮全量的相关失败已复验关闭，范围外断言和复习 worker 未退出问题保留，未再次全量运行。详见 `D:/Temp/auralis-overview-pc-markdown-20261112/report.md`。PG、部署和真实客户端验收未执行。

随后对当前 Java pipeline 核心做真实模型实测，四份未清理原文全部完成三阶段，12 调用正常 stop，无重试；报告与成稿位于 `D:/Temp/auralis-overview-production-pipeline-live-20261112/`。主线可用，但总结偏长、DOCX 混合行误删与手册例外条件遗漏未解决。此实测未经过运行态 HTTP/SSE、账本与正式保存，未替代端到端验收，也未修改生产代码。

## 旧残留清理

用户随后明确授权清理退役路径，并要求保留已跑通的新流程、运行相关测试。本轮删除旧 Writer 计划写入及检查点装配、无调用的内容预算规划、旧预览与候选发布链、候选采纳专用字段和四个旧检查点/Writer 容量配置。PC 删除旧成功响应适配、分项版本补值和历史 JSON 列投影。

当前后台作业和正式结果保存仍有调用，保留其租约、用量安全判断、来源围栏、CAS 与回执。历史数据和迁移不删除，旧内容不转换；本次未清库、重新注入数据、部署或重启。清理前备份及验证证据统一位于 `D:/Temp/auralis-overview-remnant-cleanup-20261112/`。当前内容质量问题不在本轮修复范围，清理不改变模型提示词或三阶段算法。

本轮清理验证：后端相关 250/250、OpenAPI 20/20 与 package 通过；PC 165/165、type-check 和 build 通过。只读审查最终无 BLOCKER/IMPORTANT。未运行 PostgreSQL、无关全量、真实模型和 GUI，未修改用户数据。详细命令见上述目录的 backend-report.md 与 PC 报告。

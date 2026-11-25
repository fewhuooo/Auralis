# RAG 默认开启实施计划与证据

日期：2026-10-12

状态：跨端代码、定向测试、PC/H5 构建与唯一只读审查完成（BLOCKER / IMPORTANT / OPTIONAL 均 0）；两项既有门禁失败已复现；真实 Provider 和 GUI/真机验收未运行

## 目标与批准范围

用户要求聊天默认使用资料检索，不再提供关闭检索的选项。各端使用现有可见资料范围；客户端请求体不再包含 `retrievalEnabled` 字段，服务端请求 DTO 删除该字段，新聊天按现有检索链执行。当前 Spring mapper 忽略未知请求字段，因此历史 JSON 额外带有 `retrievalEnabled:false` 不会关闭检索，也不会仅因此返回 400；不增加兼容分支。

- Backend：删除请求 DTO 中的 `retrievalEnabled` 字段；`AiStreamingService` 对新聊天始终执行现有检索路径。`ReadingContext` 仍控制 scope。无 `ReadingContext` 时 PostgreSQL 检索按 owner、active chunks、embedding 非空和 Source 未软删除筛选；fallback 按 owner 与活动 Source 筛选，不额外要求 `READY`。显式 `SUBJECT` / `SELECTED_SOURCES` 保留 owner、活动状态和 `READY` 校验；`AUTO` 当前文件保留现有 `READY` 规则。没有检索命中时允许空 citations 并继续生成；embedding 配置缺失或 Provider 失败仍按现有错误返回，不切换为无检索回答。
- PC：移除关闭检索模式和 Profile 中不生效的 RAG 语义搜索偏好。打开文件时默认 `AUTO` 当前 Source，未就绪时保留处理门槛，READY 后可以发送；没有当前文件且没有明确文件范围时使用当前学科 `SUBJECT`。显式选择 Source 后只检索选择范围；手动移除末项后，有当前文件回到 `AUTO`（未就绪仍等待），否则回到 `SUBJECT`。全学科高亮和计数仅包含同学科 READY 资料。选择中的 Source 被删除或移出学科时移除失效 ID，集合为空后回当前文件 `AUTO`（未就绪仍等待）或 `SUBJECT`；仍存在的未就绪选择保留。标签须准确反映请求范围。
- Mobile：聊天请求删除 `retrievalEnabled` 字段，普通聊天继续沿用后端当前用户 owner 范围。
- Tablet：Profile 移除 `ragEnabled` 关闭控件；聊天请求不发送 `retrievalEnabled`。
- 契约：同步 API、Mobile 页面 API 映射、产品需求、跨端模块与前端设计。Backend agent 负责运行时 OpenAPI artifact 和 PC/Mobile 生成 SDK；本文档执行者不改这些生成产物。

## 边界

- 不修改或重定 AI 限额，当前额度策略保持。
- 不实施旧报告中的 token 估算、RAG 专属预算、Provider 失败重试或 Overview 后台处理。
- 保留既有 `AUTO` 的单 Source 检索、用户明确选择的跨文件/学科范围，以及服务端现有 global SQL / fallback 过滤和显式 scope 的 `READY` 校验；没有明确范围时不默认扩大到其他学科。
- 不修改数据库结构或本地数据库字段；PC 已保存的 `sc_setting_rag` 偏好不再读取，Tablet 局部 `ragEnabled` 控件删除，不做数据清理或迁移。缓存待发请求仅接受现行三个检索模式，未知模式按该请求的 Source/Subject 生成上下文，不重写历史消息、引用或缓存格式。
- 保护用户与其他 Agent 已有修改。接手未通过验收的本任务代码时，仅按失败测试或 correctness 审查证据做必要最小修正。

## 执行者与完成定义

- Luna 执行 Agent 管理 Antigravity MCP，实际使用 Gemini 3.1 Pro High：先计划，再实施。任务 `81ce61737e15` 仅返回部分前端补丁；同一隔离工作树的任务 `baf2de0fe618` 达到 10 分钟 print timeout。确认进程退出后，Luna 补齐剩余前端；其触及用量限制后主 Agent 接手，完成未知待发模式、未就绪 AUTO 门槛与 reviewer 指出的范围显示修正。未将 MCP 退出码 0 作为完整实现或业务验收证据。
- Backend 与 API 契约由 backend Agent 实施；runtime OpenAPI artifact 和生成 SDK 由 backend Agent 按标准流程生成。
- 主 Agent 检查完整 diff、生成文件、依赖变化、删除和跨模块写入后，将八份前端补丁集成主树；无依赖新增、文件删除或无关模块修改。backend/SDK 产物保留标准生成结果。
- 后端 47/47 与 OpenAPI/SDK 门禁、PC 最终 57/57 / type-check / build、Mobile 24/24 / static / H5 build 已通过。PC static 与 Mobile type-check 的失败均在干净 HEAD 副本复现；不把这些门禁写成通过。
- 唯一 Codex readonly reviewer 已复核需求、正确性、范围、owner/replay 和数据边界，最终 BLOCKER=0、IMPORTANT=0、OPTIONAL=0。三项审查发现均由实际 RED→最小修复→GREEN 关闭；最终报告与源码 SHA-256 已保存。
- 真实 Provider、PC GUI、Mobile/Tablet 真机及外部服务验收单独记录；目前为 NOT_RUN，不由自动验证替代。

## 验收清单

- [x] 后端请求 DTO 不再包含 `retrievalEnabled`；Spring mapper 对旧 JSON 的额外字段按当前配置忽略，`retrievalEnabled:false` 不关闭检索、不触发 400。
- [x] 运行时 OpenAPI artifact 导出、PC/Mobile SDK 标准生成流程已执行。
- [x] OpenAPI artifact 与 PC/Mobile SDK 的最终一致性检查通过。
- [x] 后端新聊天沿现有检索与 embedding 路径；global SQL / fallback 过滤、AUTO 当前 Source `READY` 与显式 scope 的 owner / 活动状态 / `READY` 校验保持。
- [x] 后端无命中时可以继续生成并返回空 citations。
- [x] 后端 embedding 配置缺失或 Provider 错误仍返回既有明确错误，不回退为无检索生成。
- [x] PC 无关闭检索控件；文件 AUTO、无文件范围 SUBJECT、显式 Source 范围及移除末项后的范围标签符合请求。
- [x] Mobile/Tablet 请求不包含 `retrievalEnabled`；Tablet Profile 不提供 `ragEnabled` 关闭控件。
- [x] 运行时 OpenAPI artifact、PC/Mobile SDK 与契约一致。
- [x] 相关自动检查及构建按实际输出记录，包含既有失败；真实 Provider、GUI 和真机验收保持独立状态。
- [x] 唯一只读 reviewer 最终复核，BLOCKER=0、IMPORTANT=0、OPTIONAL=0。

## 验证证据

| 日期 | 命令/验收 | 结果 | 范围与限制 |
| --- | --- | --- | --- |
| 2026-10-12 | 文档预读、`git status --short` / diff / log | 任务初始 HEAD `83f3e9211f027079d86dd33afb72859b19c015ec`，主树 clean；文档 Agent 接入时看到的测试改动属于本轮 backend 执行 Agent | 未覆盖或还原用户修改；保留各阶段快照 |
| 2026-10-12 | `mvnw -B -ntp clean test -Dtest=AiStreamingTests,AiStreamingControllerTests,AiMessageCommandValidationTests,AiRetrievalTests,OpenApiArtifactTests` | 退出码 0；47/47 | 后端最终 clean 定向集合通过，覆盖新聊天检索、请求 DTO、检索行为及 OpenAPI artifact；真实 Provider 仍未验收 |
| 2026-10-12 | `scripts/check-openapi.ps1` | 退出码 0；包括 `OpenApiArtifactTests` 12/12 与两端 SDK 标准生成对比 | OpenAPI artifact 与 PC/Mobile SDK 一致；12/12 已包含于上方 47/47，不重复累加 |
| 2026-10-12 | PC `node --experimental-strip-types --test scripts/r4-ai-stream.test.mjs scripts/r4-reading-selection.test.mjs scripts/r4-reading-session.test.mjs scripts/r4-profile-live-links.test.mjs scripts/r4-profile-logout.test.mjs scripts/r4-pc-protocol.test.mjs` | 最终退出码 0，57/57 | 主树最终版本；覆盖实际 Store/fetch、末项回退、未就绪 AUTO、全学科 READY 标记、失效选择与引用。早期 55/55、隔离 11/11 和 review scope 7/7 与该集合重叠，不累加 |
| 2026-10-12 | PC `npm.cmd run type-check`、`npm.cmd run build` | 最终均退出码 0 | 构建有既有 import/chunk/plugin warnings，不代表 Tauri GUI 验收 |
| 2026-10-12 | PC `npm.cmd run check:r4-pc` | 最终退出码 1，仅 `src-tauri/src/local_asset_store.rs: fixed local address` | 同 HEAD 的临时 archive 中 `node scripts/check-r4-pc.mjs` 同样退出 1、同一规则；未修改 Rust |
| 2026-10-12 | Mobile `npm.cmd run test:r4-mobile`、`npm.cmd run check:r4-mobile`、`npm.cmd run build:h5` | 退出码均 0；协议 24/24，静态扫描 62 production files | H5 构建有既有 Sass/import warnings；微信与真机未验收 |
| 2026-10-12 | Mobile `npm.cmd run type-check` | 退出码 2，仅 `reviewApi.ts` 的 `EventRequest` / `EventResponse` 两个 TS2339 | 干净 HEAD archive 使用同 node_modules 运行同命令，同样两错误、退出 2；Review API 未迁移为既有问题，本轮不扩改 |
| 2026-10-12 | reviewer scope RED / GREEN | `r4-reading-selection.test.mjs`：新增 READY 标记、失效选择与手动取消末项时 PENDING 当前文件回退的 RED 均退出 1，最小修复后 7/7 退出 0 | Windows 换行曾导致 watcher 提取测试失败，归一化测试输入后通过；最终 57/57 已包含该集合 |
| 2026-10-12 | 唯一只读审查、`git diff --check` | BLOCKER / IMPORTANT / OPTIONAL 均 0；diff check 退出码 0 | `review/review-report.md` 与最终源码 hash；未重复全套测试，也不替代真实业务验收 |
| 2026-10-12 | 真实 Provider、PC GUI、Mobile/Tablet 真机 | NOT_RUN | 需在对应运行环境单独验收 |

## 文档回写

已更新 ProductRequirements、Frontend design、FrontendPC、FrontendMobileTablet、Backend、API、MobilePagesAPIMap、Status、IssuesAndReview、Changelog 与本计划，并登记 README。Database 契约不变，不更新 Database.md。未提交、推送或部署本轮修改；真实 Provider、GUI 与真机为 NOT_RUN。

完整命令、退出码、阶段快照与日志保存于 `D:/Temp/auralis-rag-always-on-20261012/backend/validation-record.md`、`D:/Temp/auralis-rag-always-on-20261012/frontend/` 和 `D:/Temp/auralis-rag-always-on-20261012/review/`。HEAD archive 仅用于既有失败复现，没有修改工作树、数据库、账本、额度或运行容器。

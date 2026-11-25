# 提问选中文本传递与后端处理

日期：2026-10-01

状态：代码、自动验证与单个只读审查通过；真实 Provider/GUI 待验收。前端 UI 已由用户完成。

## 目标与范围

将当前“已引用选中文本”传入模型请求，包括不启用资料检索的提问。保留用户 UI、当前检索范围、权限、会话持久化及请求幂等行为。无需新接口、数据库迁移或额外模型调用。

完整脏树基线：`abfbbd0b801312e7d33df080f2ca4fcbe6bb8521`。保护所有既有修改；不按 HEAD 覆盖当前文件。

## 当前证据

- Workspace 将 selectionText 交给 ChatStore；Store 仅在非 NONE 模式构造 readingContext，NONE 请求丢失引用。普通提问与引用提问均走 `/api/ai/messages/stream`。
- AiMessageCommand 只接受 readingContext.selectionText；StreamingService 已将嵌套文本传给 PromptAssembler。
- PromptAssembler 先填完整历史对，再填引用，历史可挤掉引用；引用使用 SYSTEM 角色。

## 实现设计

1. AiMessageCommand 新增可选顶层 `@Size(max = 4000) String selectionText`。顶层非 null 时优先（空白明确无引用）；否则读取现行 readingContext.selectionText。保留现行构造器调用，不改变检索开关、资料范围或权限。
2. AiStreamingService 将有效引用交给共用 assembler。不带 readingContext 且 retrievalEnabled=false 时不触发检索/embedding。引用只用于当前模型请求，不写入 Message 内容或增加 citation/locator。
3. PromptAssembler 为完整固定 SYSTEM、安全说明、当前问题及引用预留预算，然后按现有规则保留最新完整历史对、分配剩余检索文本。引用是 USER 资料消息；固定 SYSTEM 说明资料里的命令不可执行。非空引用与当前问题连同固定说明无法容纳时返回 VALIDATION_FAILED（400），不静默丢弃或截断引用。无引用路径保留原预算行为。
   - AiController 在返回 SSE/启动异步发送前调用 service 的同一预算预检；真实 HTTP RED 已证明只在异步线程校验会先返回 200，无法满足明确 HTTP 400 的契约。
4. PC 仅在 useChatStore 请求对象增加 `selectionText: options.selectionText?.slice(0, 4000)`；沿用现行嵌套字段，不改 UI、引用卡片或用户消息内容。
5. 导出 OpenAPI 及双端 SDK，使可选字段与现行接口一致。Mobile 仅生成类型，不新增行为。

## 执行任务

- [x] 后端执行代理先添加能失败的引用预算/角色测试，记录 RED 命令与真实输出，再实施最小补丁。
- [x] AiStreamingTests 捕获真实 AiProviderRequest：无检索时引用到达、无 embedding；顶层优先/空白、嵌套读取及已有请求回放不重复调用。
- [x] PromptAssemblerTests 验证大量历史下引用/问题保留、USER 角色、安全说明、总预算及过量输入明确拒绝；保留无引用回归。
- [x] Controller/Bean validation 验证 4000 字上限与超量拒绝；OpenApiArtifactTests 检查顶层字段。
- [x] 执行 Server clean focused 测试（AiStreamingTests、PromptAssemblerTests、AiRetrievalTests、ArchitectureTests 及实际必要的 Controller 测试），记录实际命令/退出码/计数，不把 stub Provider 写成真实服务验收。
- [x] Antigravity 隔离委派仅 PC 传递层与一项实际请求回归；先计划、再实施授权范围，禁止 UI 和生成 schema 改动。
- [x] 后端导出 OpenAPI/SDK：`scripts/export-openapi.ps1`、`scripts/generate-openapi-sdk.ps1`；执行 `scripts/check-openapi.ps1` 并检查全 diff。
- [x] 前端执行代理运行 PC type-check、test:r4-pc、build 及 Mobile type-check（只验证生成类型），返回日志，不重复通过检查。
- [x] 单个只读 reviewer 检查要求、预算、角色、检索权限和幂等回归；有明确问题交原执行代理最小修复。
- [x] 主 Agent 回写 API、Database 的 transient 边界、Backend、FrontendPC、Status、IssuesAndReview、Changelog 及本记录；真实 GUI/Provider 留作独立验收。

## 边界与交接

前端生成只委派给 Antigravity；后端/API 与生成契约由 Codex 执行代理实现，主 Agent 审查。不得修改生产配置、凭据、数据库或启动部署。所有命令和业务验收状态分别记录；不提交用户工作树。

## 实施与实际验证记录

Antigravity 实际任务 `e614a4f42224`（Gemini 3.1 Pro High）隔离生成 Store 单行和 AI stream 脚本回归，完整 diff 只有两文件，无 UI/依赖/删除/跨模块变化；主树先只应用测试复现 RED，再应用单行得到 GREEN。唯一尾部空行在 diff-check 证据后移除；临时 node_modules 链接由委派移除，工作树已 collect cleanup。后端四个 AI 类、五个测试由 Codex 执行代理完成，OpenAPI 与双端 SDK 由仓库脚本生成。生成产物语义仅新增可选 selectionText，JsonNode 属性顺序由导出器调整。

以下命令于 2026-10-01 执行，执行代理返回退出码，主 Agent 核对日志与完整脏树差分；未重复已通过的普通门禁。日志根目录为 `C:\Users\Gnasche\AppData\Local\Temp`。

| 工作目录 | 实际命令 | 退出码 / 结果 | 日志 |
| --- | --- | --- | --- |
| Auralis-Server | `mvnw.cmd -B -ntp -Dtest=PromptAssemblerTests test` | 1，4 项中 2 项失败（真实角色/预算 RED） | `auralis-selected-text-red-prompt.log` |
| Auralis-PC | `node --experimental-strip-types --test scripts/r4-ai-stream.test.mjs` | RED 1，4/5；NONE 引用 undefined | `auralis-pc-chatstore-ai-stream-red-2a1b2e2f953a447897561608d8dfe7d1.log` |
| Auralis-PC | 同上，应用传递补丁后 | 0，5/5 | `auralis-pc-chatstore-ai-stream-green-9db56a72cda54faab7bb217fda9f45f2.log` |
| Auralis-Server | `mvnw.cmd clean -B -ntp "-Dtest=AiStreamingTests,PromptAssemblerTests,AiRetrievalTests,ArchitectureTests,AiStreamingControllerTests,AiMessageCommandValidationTests,OpenApiArtifactTests" test` | 0，47/47，0 failures/errors/skipped | `auralis-selected-text-final-clean-focused.log` |
| 仓库根目录 | `scripts/export-openapi.ps1` | 0，OpenApiArtifactTests 8/8 | `auralis-selected-text-openapi-export.log` |
| 仓库根目录 | `scripts/generate-openapi-sdk.ps1 -SkipExport` | 0，双端 schema 生成 | `auralis-selected-text-sdk-generate.log` |
| 仓库根目录 | `scripts/check-openapi.ps1` | 0，runtime/artifact/SDK 一致 | `auralis-selected-text-openapi-check.log` |
| Auralis-PC | `npm.cmd run type-check` | 0 | `auralis-pc-sdk-final-type-check-4ab6505821f542bb8579affcc4fc6d02.log` |
| Auralis-PC | `npm.cmd run test:r4-pc` | 0，478/478，fail/cancelled/skipped/todo 均 0 | `auralis-pc-sdk-final-test-r4-pc-278eae49bab54f5c9969f3040f21bdc1.log` |
| Auralis-PC | `npm.cmd run build` | 0，18.99s，renderer assets 47/47 | `auralis-pc-sdk-final-build-c7ad07a882dc4465b8a25ac45d76e7c1.log` |
| Auralis-Mobile | `npm.cmd run type-check` | 0，仅生成契约验证 | `auralis-mobile-sdk-final-type-check-1258c19efbed4e269f66f59f7f2b08fd.log` |

Server core 21/21 与 Controller 5/5 已包含在最终 47/47；导出 8/8 也与该套件重叠，不另加计数。PC 5/5 包含在最终 478/478。构建沿用既有 Node externalization、`:deep`、chunk、dynamic import/plugin timing 提示，本轮没有扩展构建清理。

单个只读 reviewer 最终 BLOCKER=0、IMPORTANT=0、OPTIONAL=0。自动证据确认请求对象、Provider adapter 序列化、预算/角色、HTTP 拒绝、检索权限及回放；捕获型假 Provider 不代表真实模型效果。用户 UI 未改、既有未提交改动保留；真实 Provider 网络、GUI 和运行服务部署未验收，未提交/部署/执行生产迁移。

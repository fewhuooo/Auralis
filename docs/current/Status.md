# Auralis 当前状态

### 2026-11-14 PC 个人中心

左栏「账号与安全凭证」集中个人资料、登录设备管理、退出登录、重置本地离线数据和注销账户。右栏「AI 设置」集中自动生成概览偏好、使用额度和模型服务配置。PC 应用和 Vite 配置类型检查通过，37 项定向回归通过。扩展套件 7/8，唯一侧栏断言失败在改动前的版本复现。Tauri 窗口待验收。

### 2026-11-14 PC 时间线排期重构（分支待试测）

`codex/timeline-scheduling-refactor` 保留五种拖放规则。预览和本地提交共用排期计算，周列跨天仅移动源任务，排期回执在本地结算后立即刷新投影。PC 类型检查、Vite 构建和相关回归通过。全量 PC 回归 856/860，四项失败已在分支基线复现。Server 定向 80/80、打包及 OpenAPI 和生成类型检查通过。回环 H2 后端实测通过认证 Sync push，覆盖目标已占用时拒绝、只移动源任务和重放。分支待真实 Tauri 试测，详见 [PC 试测步骤](../modules/FrontendPC.md#分支试测)。

桌面试测发现连续换位可能将回执里的同一时刻误判为改期。分支已改为按实际时刻核对源排期，待桌面复测。

快速换位时若上一笔回执先于本地事务更新版本，事务会在核对排期计算基线后采用当前版本，保留最新任务资料。实际改期仍要求重试。PC 类型检查与 232 项定向回归通过，全量 858/862，四项失败与已核对基线一致。当前试测窗口可复测快速换位。

### 2026-11-13 PC 资料管理文件选择

资料管理刷新时更新当前文件的信息，保留原学科或全局星图范围。文件从活动资料列表移除后，关闭预览并回到资料阅览区的空态。PC 应用类型检查和定向回归 48/48 通过。真实 Tauri 双设备同步待验收。命令证据见 `D:/Temp/auralis-asset-graph-fix-20261113/`。

### 2026-11-13 学科复习提交与历史一致性

复习失败恢复入口已接入当前轮次。旧知识块版本的请求会在本地写入前被拒绝，服务端复习历史以同一快照返回状态与结果。PC 应用类型检查通过，四个复习套件 109/110，唯一失败为既有统计用例的固定日期，使用夹具对应时钟复测通过。最终学科复习套件 55/55。服务端 H2 定向 19/19，覆盖并发核对期间返回一致历史。真实 Tauri、PostgreSQL 并发及双设备待验收。 命令证据见 `D:/Temp/auralis-review-round-fix-20261113/`。

### 2026-11-13 本机 Overview 输入上限

本机根 `.env` 持久设置 `AURALIS_AI_OVERVIEW_MAX_INPUT_TOKENS=32768`，与运行中的 backend 一致。桌面学科总览于香港 12:02:15 生成成功并保存为版本 2，大纲与总结均回读一致。三次模型调用均适配整篇，单次最高估算 22,795 Token。

### 2026-11-13 学科总览直接生成修复（本机后端已部署）

学科总览的直接入口开放 ALL 和 OUTLINE，原先两种模式在生成前被旧实现的模式限制拒绝。当前三种模式均复用 Markdown 生成和自动分批流程。定向回归 58 项通过，覆盖三种模式的预检与生成、SSE 和文件总览。

香港 01:21:22 本机后端重建和健康检查完成，Overview 临时单次输入上限仍为 32,768 Token。桌面学科总览生成待复验。文件侧实测 1.pdf 分批成功，派发 8 次，其余三份输入适配整篇流程，分别派发 3 次。证据见 `D:/Temp/auralis-overview-cap32k-20261113/manual-test-diagnostic.md`。

### 2026-11-13 Overview 超长输入自动分批（本机后端已部署）

整篇请求可装入模型时走现有三阶段。超过容量时，服务端通过核心行归属执行分批清理，归并局部大纲，再按议题回读原文提炼要点并统一写总结。只在总结超限时复用已生成大纲。回归覆盖正常入口、16K 测试窗口的多批文件生成、单独总结超限和长行拆分。首轮定向 196 项通过，长行修正后相关 34 项通过。香港 00:59:34 本机后端健康验证通过，桌面生成待用户验收。

使用编译后的 Pipeline 和 Planner 隔离调用真实模型。原 PPT 在 1,048,576 token 窗口使用 3 次调用，返回大纲与总结。原 PDF 在测试窗口 32,768 token 下自动切换为 4 次清理、3 次大纲生成及归并、3 次总结提炼及成文，10 次响应均正常结束，合计 92,909 tokens。测试探针中断后逐请求验证并复用已完成响应。PDF 大纲和总结各 6 个议题，DBTG 限定保留。证据位于 `D:/Temp/auralis-overview-multibatch-implementation-20261113/`。

### 2026-11-13 PC 学科编辑重名校验（源码与定向验证完成）

学科大厅改名时按本地活动学科检查重名，忽略首尾空白和大小写并排除自身。发现重名即保留表单并提示，保留原名时可以修改其他字段。PC 应用类型检查、学科编辑定向测试 10/10 和 `git diff --check` 通过，证据见 `D:/Temp/auralis-subject-rename-20261113/`。真实桌面交互待验收。

### 2026-11-13 PC 删除当前文件后切换（源码与定向验证完成）

学科工作区在本地删除保存后立即切换到同学科的剩余文件，后台清理和总览缓存刷新不再阻塞。列表为空时回到总览，删除期间的手动改选优先。PC 应用类型检查、文件与本地资产相关回归 109/109、Overview 回归 155/155 和 `git diff --check` 通过。真实桌面交互待验收，命令和日志位于 `D:/Temp/auralis-file-delete-selection-20261113/`。

### 2026-11-13 PC 大纲编辑与总览同步（源码与定向验证完成）

文件大纲按解析修订读取和保存。文件与学科大纲保存期间的新输入仍待保存。总览同步分批处理所有有效文件。PC 应用类型检查通过，首轮 Overview 相关测试 220/220，最终同步套件 38/38，覆盖第 501 个文件和批次间修订切换。真实桌面交互和服务同步待验收。

### 2026-11-13 Chat 断流恢复与入队拒绝

PC 在断流后核对原 run，UNKNOWN 恢复保留原轮次的重试身份和新输入。题卡按现行字段读取，旧会话仅供查看。Server 对入队拒绝结算未启动尝试。PC 类型检查和 95 项定向测试通过，Server 分两批通过 61 项。真实桌面、代理与 PostgreSQL 联调待验收。

### 2026-11-13 PC 知识块编辑与同步

学科工作区的知识块详情跟随本地投影，编辑可保留草稿并核对云端版本。两个创建入口防止重复提交，删除在版本检查和拒绝回执后收敛。PC 应用类型检查和 Vite 构建通过。知识块、仓储与同步共 86/86，六个相关套件共 148/149，唯一失败已在基线复现。首次扩展套件 853/859，其中一条知识块契约断言已修正并通过复测，其余五条在基线复现。

### 2026-11-12 大纲 Markdown 极简排版重构与构建闭环（源码与生产打包完成）

根据用户反馈与实机截图，重构了文件大纲（`FileOutlineList.vue`）与学科总览大纲（`SubjectOverviewSection.vue`）中 Markdown 内容的排版展现体系，彻底解决 H1 默认字号过大突兀、议题 H2 缺乏视觉间隔、列表项缺乏引导圆点等粗糙问题：
- **层级视觉节奏**：H1 规范为 13.5px 伴随 5px Zen Sage 圆点与下发丝线；H2 规范为 12px 议题胶囊条（`3px × 11px` 微晶），段前 13px 建立模块节奏；列表条目统一设置 14px 缩进并搭配 4.5px 浅草绿微晶小圆点与悬浮轻微放大；
- **契约对齐与语法修复**：清理历史合并残留的未闭合重复标签与重复属性，`SubjectOverviewSection.vue` 完整对齐 `outlineMarkdown`/`summaryMarkdown` v2 契约；
- **全量验证**：PC 端类型检查 `npm run type-check` exit 0；全量生产打包 `npm run build` exit 0；定向自动化测试套件 `r4-subject-overview-ui.test.mjs`、`r4-overview-generation.test.mjs`、`r4-overview-sync.test.mjs`、`r4-overview-cache.test.mjs` 154/154 项全部通过。桌面客户端真实 GUI 视觉走查待用户验收。

### 2026-11-12 Overview 大纲按主线归并（本机后端已部署）

OUTLINE 采用归并版提示词，以二级标题承载主要议题，各条目用主题短语指示讨论范围。定向 9 项通过。两份隔离模型成稿已审阅。香港 18:45:14 完成本机后端健康验证，正式生成待验收。证据见 `D:/Temp/auralis-overview-outline-grouped-deploy-20261112/report.md`。

### 2026-11-12 Overview 总结保留核心解释（本机后端已部署）

SUMMARY 采用 D 轮提示词，保留核心机制、区别和权衡，使用二级标题、短段落和必要列表。按清理后 Unicode 字符数给出参考篇幅，10000 字符及以下约 1200～1600 字符，超过约 3000～4000 字符。定向 9 项通过，阶段输出预算沿用原基准。两份隔离真实模型成稿已审阅。香港 17:07:33 完成本机后端健康验证，正式生成待验收。证据见 `D:/Temp/auralis-overview-summary-d-deploy-20261112/report.md`。

### 2026-11-12 Overview 通用输入预算与动态输出预算（本机后端已部署）

Overview 规划和 Gateway 准入按同一套通用输入规则计量完整请求，包括 CLEAN 的结构化响应声明。三阶段同时使用动态输出预算。定向 116 项通过，打包通过，16 条历史请求与两份冻结材料的 6 个阶段已离线复算。隔离环境使用生产 Pipeline/Planner 完成 PDF、PPT 各三阶段真实生成，6 次模型调用均正常结束。香港 15:59:24 完成后端单独重建的验证，镜像 `c339336761e5`，Docker healthy，宿主 liveness/readiness 均 HTTP 200 / UP。证据见 `docs/archive/overview-experiments/20261112-unified-budget-deploy/data/report.md`。

香港 16:04 用部署版本串行跑通 PDF、PPT 各一次正式 ALL，SSE 分别耗时 16.485 秒和 9.375 秒。两份正式 PUT、GET 均 HTTP 200，版本各从 3 升至 4，回读与生成成稿相同。Gateway 六阶段实际派发并完成，结算合计 82074 tokens，无残留预留。桌面 GUI 尚未走查。逐阶段预留、实际用量和成稿核对见 `docs/archive/overview-experiments/20261112-unified-budget-formal/data/report.md`。

香港 16:09，用户生成的学生操作手册 PDF 与星校园计划书 DOCX 均保存为正式版本 3。只读核对确认两份成稿与对应成功 generation 一致，六阶段已结算，分别用量 38544 和 36330 tokens，无残留预留。两份总结均在篇幅软目标内。手册遗漏产业赛道教师团队成员的学籍校验例外；计划书的测试、运营数字、团队人数与下一步验证均完成原文核对。证据见 `docs/archive/overview-experiments/20261112-docx-manual-review/data/report.md`。

### 2026-11-12 Overview 动态输出预算（源码与定向验证完成）

CLEAN、OUTLINE 和 SUMMARY 分别估算正常输出需要的最低 token，预留目标为最低值加 50% 裕量。Provider 的 `max_tokens` 与账本预留一致。九个定向套件 66 项及打包通过。两份冻结资料离线复算已完成。联合预算的隔离实测与部署见上节。证据见 `docs/archive/overview-experiments/20261112-output-budget/data/report.md`。

### 2026-11-12 本机 AI 生成额度

香港 15:24:50 使用原镜像单独重建 backend。真实 `.env` 的个人小时额度为 500 万 token，个人日与全局日额度各 2000 万，Overview 单任务额度仍为 1048576。运行变量核对及宿主 liveness/readiness HTTP 200 / UP 已验证。证据见 `docs/archive/overview-experiments/20261112-quota-increase/data/report.md`。

### 2026-11-12 Overview 大纲与总结提示词

已部署本机后端。大纲沿用试验通过的主题标题和短条目格式，总结保留原文限定的对象、场景和关系。按清理后正文的 Unicode 字符数选篇幅软目标，10000 字符及以下为约 1200～1800 字符，超过为约 3000～5000 字符。四个定向套件 41 项、打包和宿主健康检查通过。已有正式结果保留，新提示词的正式成稿待用户重新生成。证据见 `docs/archive/overview-experiments/20261112-prompts/data/report.md`。

### 2026-11-12 Overview 平台生成模型容量

平台 Overview 从 `AURALIS_AI_GENERATION_CONTEXT_TOKENS` 和 `AURALIS_AI_GENERATION_MAX_OUTPUT_TOKENS` 读取当前模型容量。BYOK 按 Provider、端点和模型匹配服务端容量条目。13 个后端套件 113 项通过，package exit 0。香港 14:45:50 单独重建 backend，宿主 liveness/readiness 均 HTTP 200 / UP。运行容器已加载两个容量值，原端点、模型和密钥逐项保持。证据见 `docs/archive/overview-experiments/20261112-env-capacity/data/report.md`。

香港 14:50:16，为复测原 PDF，新增本机 `AURALIS_AI_LIMITS_OVERVIEW_TASK_TOKENS=1048576`。同一容量版镜像单独重建 backend，宿主 liveness/readiness 均 HTTP 200 / UP，运行额度从 524288 提高到 1048576。证据见 `docs/archive/overview-experiments/20261112-task-quota/data/report.md`。

使用平台 `deepseek-flash` 从正式接口验证 PPT 和 PDF 的 CLEAN → OUTLINE → SUMMARY。PPT 在容量修复后生成成功，SSE 耗时 19.078 秒，账本 18957 tokens。PDF 在本机单任务额度提高后生成成功，SSE 耗时 66.578 秒，账本 86090 tokens。两份正式 PUT、GET 均 HTTP 200，版本均从 1 升至 2，回读大纲与总结和生成响应一致。桌面 GUI 尚未走查。证据见 `docs/archive/overview-experiments/20261112-pdf-ppt-capacity-retest/data/report.md` 与 `docs/archive/overview-experiments/20261112-pdf-budget-retest/data/report.md`。

### 2026-11-12 平台 AI 生成与 Embedding 配置

平台配置收敛为 `AURALIS_AI_GENERATION_*` 与 `AURALIS_AI_EMBEDDING_*`。本机 `.env` 将当前生成与向量端点、模型和 Key 原值映射到新键，Compose 对实际配置和 `.env.example` 的 `config --quiet` 均 exit 0。香港 14:29:58 本机 backend 已重建，容器 healthy，宿主 liveness/readiness 均 HTTP 200 / UP。容器中的六项新变量与本机配置一致，真实生成、向量化及检索尚待验证。部署证据见 `D:/Temp/auralis-platform-ai-20261112/deploy-report.md`。启用方式见[部署指南](../operations/Deployment.md)。

隔离 PostgreSQL 与 TLS fixture 下，相关 21 个后端套件共 199 项全部通过，后端打包 exit 0。全量 911 项、3 个既有断言失败、0 错误、2 跳过，exit 1。证据见 `D:/Temp/auralis-platform-ai-20261112/report.md`。

### 2026-11-12 环境文件整理

`.env` 与 `.env.example` 按供应商、思考、超时、额度、基础服务与诊断重排。保留真实文件 43 项及示例 79 项原有有效赋值，仅移除无消费者的旧 adaptive 开关；DeepSeek/OpenAI 缺省地址和模型补为注释示例，不新增有效覆盖。前后 Compose 解析均通过，唯一差异是 backend 不再收到退役项，两份 `config --quiet` 均 exit 0。未切换供应商、改密钥或重启部署；证据见 `D:/Temp/auralis-env-organize-20261112/report.md`。

### 2026-11-12 个人中心文件解析进度卡片截断与溢出修复（源码与定向验证完成）

排查并修复了个人中心（`Profile/index.vue`）文件解析进度中心（`DocumentProcessingCenter.vue`）中长文件名或长状态文本挤破父级网格轨道与 Flex 布局、导致右侧状态药丸徽标和操作按钮被裁剪移出屏幕的问题：
- **网格轨道与容器边界收窄**：`.processing-list` 补齐 `grid-template-columns: minmax(0, 1fr)` 与 `width: 100%; min-width: 0;`，`.processing-item` 设定 `box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%;`，杜绝 CSS Grid 默认 auto 轨道按子项 max-content 撑大父级卡片的问题；
- **全文本截断保护与原生 Tooltip**：对 `.processing-item-meta > span` 与 `.processing-error` 统一补齐 `flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`；为 `<strong>` 文件名补充 `:title` 原生 Tooltip 提示，超长文本优雅省略同时保证完整文件名随时可查；
- **侧栏面板横向防溢出**：在 `Profile/index.vue` 的 `.studio-left` 与 `.studio-right` 补齐 `overflow-x: hidden;`，并对 `.studio-left > *` 设定 `max-width: 100%; box-sizing: border-box;`，确保在任何视口或窄屏断点（320px–480px）下右侧操作按钮和状态药丸徽标完整可见，绝不横向截断。
- **验证**：PC 类型检查 `npm run type-check` exit 0；全量生产构建 `npm run build` exit 0；定向测试套件 `scripts/r4-document-processing-ui.test.mjs` 16/16 全部通过（含新增网格轨道与侧栏横向溢出守卫）；`r4-profile-live-links.test.mjs` 与 `r4-profile-logout.test.mjs` 15/15 全部通过。未执行真实桌面端 GUI 人工走查。

### 2026-11-10 PC 学科总览与文件大纲重新生成状态反馈与交互修复（源码完成，定向验证通过）

针对用户反馈的“重新生成总览和大纲时页面无变化、按下去没反应但后端在运行”的问题进行根因定位与修复：
1. **即时同步响应与异步门禁解耦**：在 `SubjectWorkspace/index.vue` 的 `handleOutlineAi`、`handleSubjectOutlineRegenerate`、`regenerateFileOverview` 与 `regenerateSelectedSummary` 中，在点击触发瞬间同步置位对应生成状态标志（`subjectOverviewGenerating.value = true` 或 `setFileGenerating(fileId, true)`），彻底消除由于 `ensureOverviewRuntime()` 异步前检（IndexedDB 缓存读取）导致的数百毫秒视觉死区；异常与中断退出时通过 try-finally 安全复位；
2. **操作菜单自闭合与防并发**：在 `FileOutlineList.vue` 与 `SubjectOverviewSection.vue` 的操作菜单 Popover（`el-popover`）上绑定可见性受控状态，用户点击“重新生成大纲”或“重新生成全部”后立即自动关闭 Popover，避免菜单驻留遮挡卡片；菜单项与操作按钮在生成中严格禁用（`:disabled`）；
3. **文件大纲生成状态与停止操作闭环**：
   - 补齐 `FileOutlineList.vue` 更多操作按钮在生成中的旋转图标（`IconRefresh is-spinning`）；
   - 在卡片头部操作区补齐“停止”胶囊按钮（`retry-capsule__btn`），并打通与 `SubjectWorkspace` 既有 `@stop-regeneration` 监听的事件发射；
   - 在已有大纲内容存在时补齐生成中微晶提示条（`file-outline__pending--regenerating`：“正在重新生成文件大纲…”），并对下方既有章节列表应用 60% 半透明弱化与指针穿透防护，直观指示生成进行中；
4. **学科总览与总结卡片生成态呈现优化**：
   - 在 `SubjectOverviewSection.vue` 已有内容展开态下补齐微晶生成提示条（`subject-overview__regenerating-banner`）与章节列表弱化过渡；
   - 在 `OverviewSummaryView.vue` 已有总结内容存在时补齐“正在重新生成总结，当前内容仍可查看…”微晶提示条与内容区弱化过渡；
5. **验证与审查**：
   - PC 类型检查 `npm run type-check` exit 0；全量生产打包 `npm run build` exit 0；
   - 定向自动化测试套件 `r4-overview-generation.test.mjs` 84/84 全部通过；
   - 总览同步套件 `r4-overview-sync.test.mjs` 38/38 全部通过；
   - UI 规范套件 `r4-subject-overview-ui.test.mjs` 保持 18/20（2 项为既有未关联历史断言）。

### 2026-11-05 Chat 已保存来源总览 native tool（运行态故障已定位，源码修复与定向验证完成；未部署）

后端以 `read_source_overview(sourceId,offset?,limit?,overviewVersion?)` 取代 `read_outline`，并在 `list_sources` 页内按正式结果有效性返回模型可见 `hasOverview`。读取仅使用当前 attempt 授权 source 的正式、当前 SOURCE 结果；完整结果及 source input descriptor 沿用 `OverviewResultService` 当前有效性谓词。总览以 Markdown 形式按 Unicode code point 分页，页大小不超过 8192，并动态适配既有 tool result UTF-8 上限；continuation 通过 `overviewVersion` 防止混版。无可用总览返回普通 `UNAVAILABLE`，版本改变返回 `STALE`，两者都不生成数据，模型可继续检索或读取摘录。保留历史 `read_outline` 不做别名/转换，由现行未知工具历史边界处理。PC generic tool event/name fallback 已只读核对，本轮未改前端。

五个核心 suite 定向测试 43/43 通过；另行补跑 `DisplayToolOrchestratorTests` 10/10，合计 53/53（分两批）。新增 H2 正式写入结果测试覆盖当前正式结果读取、批量 owner 限制和 revision 改变。`mvnw -B -ntp -DskipTests package` exit 0。唯一只读 reviewer 结论 BLOCKER=0、IMPORTANT=0、OPTIONAL=0。每页最多检查 20 个 formal SOURCE result；`SOURCE_CONTENT` descriptor 为复用精确有效性判断会在这些条目上分别重建 raw input descriptor，具有界定页数但可能随来源数增加 chunk inventory 查询。未调用真实 Provider、部署、重启服务或进行 UI/业务验收。

2026-11-05 17:36 HKT 本机最新两次失败是同一 run 的 attempt 1 与 retry attempt 2：均在 `read_source_overview` 开始后由 PostgreSQL 报 `cannot execute SELECT FOR NO KEY UPDATE in a read-only transaction`。`readCurrentSource` 因复用 Subject mutation lock boundary 已改为普通 `@Transactional`；锁顺序、owner/revision fence 和 Overview 有效性谓词未改变。`currentSourceOverviewIds` 保持 read-only。新增真实 PostgreSQL 17 Testcontainers 回归，fixture 事务独立提交且测试本身无外层事务，覆盖 SOURCE_CONTENT 当前性判定、正式结果读取、缺失结果、owner 隔离及 revision 检查：定向 PG + H2 共 9/9，package exit 0。此前 53/53 是 H2/backend focused suites，不能证明 PostgreSQL read-only transaction 与行锁兼容；本轮 PG 用例补上该边界。源码修复未部署，当前运行容器仍需后续部署才会包含此修复。

### 2026-11-05 PC Chat 会话级资料读取范围绑定与生命周期治理（PC 接入与定向验证完成）

根据 [Frontend Scope Handoff](D:/Temp/auralis-chat-screenshot-failure-20261105/frontend-scope-handoff.md) 与 [Implementation](D:/Temp/auralis-chat-screenshot-failure-20261105/implementation.md) 完成 PC 端对会话资料读取范围（Chat Reading Scope）的完整接入与生命周期治理：
1. **Scope 状态感知与契约扩展**：基于 OpenAPI 同步契约，在 `useChatStore.ts` 与 `chatProtocol.ts` 中建立会话读取范围状态体系，包含 `chatScopeState: 'LEGACY' | 'UNBOUND' | 'BOUND'` 与 `chatScope: ChatConversationScope | null`；
2. **首轮绑定与普通后续轮次省略继承**：
   - 新建会话初始为 `UNBOUND`，首轮提问前允许自由选择范围（当前学科 `SUBJECT`、当前文档 `AUTO` 或自选文档 `SELECTED_SOURCES`）；首轮携带完整 `readingContext` 发送；
   - 首轮成功准入后端侧原子转为 `BOUND` 并锁定 committed scope；后续普通提问（ordinary later turns）在范围匹配时**显式省略 `readingContext`（传 `undefined`）**，由服务端依据数据库中已锁定的会话 scope 自动继承并在每 attempt 独立捕获资料 READY/revision 状态；
3. **范围冲突（409 `CHAT_SCOPE_CONFLICT`）与转换治理**：
   - 对已 `BOUND` 会话若用户显式请求不同资料范围，服务端准入事务返回 HTTP 409 `code: "CHAT_SCOPE_CONFLICT"`；
   - 前端捕获后将其视为范围转换请求（scope transition），**从 `messages` 列表中剔除本地乐观追加的 USER 消息**，提示用户并提供【开启新会话】操作按钮，**严禁**作为传输故障重发回当前会话；
4. **历史旧会话（`LEGACY`）只读封存**：
   - 服务端 V44 迁移前历史会话标记为 `chatScopeState: 'LEGACY'`，严禁从旧消息推断范围；
   - 前端彻底禁用新提问与重试：`isLegacySession` 守卫拦截发送、输入框禁用加提示文案、`pendingMessage` 计算属性直接返回 `null` 禁用重试，并在错误条提供开启新会话入口；
5. **工作区联动与恢复（SubjectWorkspace/index.vue）**：
   - 监听切换会话事件，自动依据活跃会话的 `chatScope` 还原 committed scope 选项目标；
   - 范围切换拦截与弹窗提示：已绑定或历史会话锁定文档切换按钮（`isScopeLocked`），保持自然极简视觉（不显示生硬锁图标），点击时拦截菜单展开并在右上角弹出通知提示，引导用户点击右上角刷新按钮开启新对话重选；
   - **工作区文件预览与已锁定范围完全解耦**：引入 `boundScope` 单一事实来源，已绑定会话下 `aiChatReferenceOptions()`、`aiSourceSummaryText`、`aiSourceSummaryTitle`、`isAllAiSourcesSelected`、`isAiSourceSelected`、`showProcessingRequired` 严格依据 `boundScope` 计算，用户在工作区预览切换其他文件时不会篡改已锁定的资料选项或胶囊文案，后续轮次继续继承已绑定资料，彻底避免误发 409 `CHAT_SCOPE_CONFLICT`；
6. **验证与审查**：
   - 定向自动化测试套件 `scripts/r4-chat-recovery-handoff.test.mjs` 8/8 全部通过（覆盖 `isScopeMatching` 乱序判定、UNBOUND 首轮绑定、BOUND 次轮省略 readingContext 继承、409 拦截并清除乐观消息、LEGACY 禁用提问与重试、已锁定会话工作区切文件不篡改范围选项与继承）；
   - 关联套件 `r4-chat-content.test.mjs`、`r4-ai-stream.test.mjs` 与 `r4-chat-session-guard.test.mjs` 28/28 全部通过（全量 36/36）；
   - PC 类型检查 `npm run type-check` exit 0；全量生产打包 `npm run build` exit 0。未部署，尚未执行桌面端跨端走查。

### 2026-11-05 Chat conversation scope binding（源码、定向验证、全量与 package 完成；PC 接入已完成）

当前后端实现为新 conversation 建立 `UNBOUND`，首次 turn 在 USER/run admission 事务中校验并固定规范化策略与 ID；同会话后续省略上下文时继承，显式不同范围返回 `409 CHAT_SCOPE_CONFLICT`，不写入该轮 USER/run。每 attempt 继续捕获与校验当前 owner/subject/READY/revision，selectionText 不固定。V44 将已有 conversation 标为 `LEGACY` 并保留只读历史，不从混合旧 run 推断范围。活动提交要求来源 run 与 conversation scope 相同；retry 使用原 run scope。PC 端接入已于 2026-11-05 完成：接入 UNBOUND 首轮范围绑定、普通后续轮次 readingContext 省略继承、HTTP 409 CHAT_SCOPE_CONFLICT 乐观消息清理与开启新会话引导、LEGACY 历史会话只读禁用提问与重试、UI 选项目标还原与范围切换拦截；定向回归套件 scripts/r4-chat-recovery-handoff.test.mjs 7/7 全部通过。

定向目标套件通过；OpenAPI 导出及 artifact 测试 19/19 通过，nullable `chatScope` 已反映为可空对象。正确测试环境下 backend full 为 1096 tests / 3 failures / 0 errors / 2 skipped，package exit 0。三项全量失败是现有断言漂移：`AiFeaturePolicyParityTests` 的 stage 数为 0、`TaskColorRemovalMigrationTests` 期待 V42 而当前为 V44、`OverviewIdentityPostgresIntegrationTests` fixture 期待 V41 而当前为 V44；本轮未修改这些无关断言。唯一只读 reviewer B0/I0/O0。命令、逐批结果及范围见 `D:/Temp/auralis-chat-screenshot-failure-20261105/implementation.md` 与 `review.md`。未部署、未重启服务、未调用真实 Provider、未改 PC/Mobile、未做 GUI 或业务验收；前端交接与生成类型仅存于 D 盘 Temp。

### 2026-11-05 PC Chat 全学科自主选资料请求契约与 UNKNOWN 显式恢复接入（源码完成，定向验证通过）

根据 [Step 4 Frontend Handoff](D:/Temp/auralis-chat-agent-loop-evolution-20261104/step4-frontend-handoff.md) 与 [Step 7 PC Handoff](D:/Temp/auralis-chat-agent-loop-evolution-20261104/step7-frontend-handoff.md) 完成 PC 端对全学科资料发现请求映射契约及 UNKNOWN 异常状态显式恢复的闭环接入：
1. **ReadingContext 强契约与模式映射**：在 `useChatStore.ts` 中实现统一规范化构造函数 `buildReadingContext`，`SUBJECT` 模式严格输出 `currentSourceId: null` 与 `sourceIds: []`（彻底消除服务端因字段不规范返回的 `VALIDATION_FAILED` 拒绝）；`AUTO` 模式输出当前文档 ID 与 `sourceIds: []`；`SELECTED_SOURCES` 模式输出 `currentSourceId: null` 与选中文档 ID 列表；在 `useChatStore.sendMessage` 与 `retryPendingMessage` 中统一接入；
2. **UNKNOWN 恢复路由与 Ticket Guard 状态门禁**：通过官方生成脚本同步 PC/Mobile 的 `schema.ts`；在 `aiClient.ts` 中接入 `POST /api/ai/conversations/{cId}/runs/{rId}/attempts/{aId}/recover`；在 `useChatStore.ts` 的 `recoverUnknownAttempt` 中建立四重门禁校验（`targetUserId`、`targetSessionId`、`runId`、`attemptId`），防止迟到网络响应覆写更新状态；
3. **消除无效轮询与 409 防自循环重发**：`pollRunStatusUntilSettled` 与 `loadMessages` 检测到 `UNKNOWN` 状态时立即停止 60 次自动轮询，置 `isStreaming = false` 并记录待恢复目标；遇到 HTTP 409（`CHAT_RECOVERY_NOT_ALLOWED`）时仅静默刷新当前会话与 run 状态，严禁自动重复发起 recover 或 retry；未提交 activity 恢复后转为 `FAILED`（错误码 `CHAT_UNKNOWN_ABANDONED`）并释放会话槽，平滑接续既有重试按钮发起新 attempt；
4. **UI 显式呈现与防并发**：在 `SubjectWorkspace/index.vue` 中为 UNKNOWN 状态增加微晶卡片提示条（`.chat-recover-banner`）与气泡内联恢复按钮，恢复中禁用按钮防并发；发送按钮在槽位锁定期间禁用并给出引导提示；统一使用“恢复状态”文案，绝不呈现为取消 Provider；
5. **验证与审查**：PC 类型检查 `npm run type-check` exit 0；全量生产构建 `npm run build` exit 0；定向测试套件 `scripts/r4-chat-recovery-handoff.test.mjs` 3/3 全部通过；关联套件 `r4-chat-content.test.mjs` 与 `r4-ai-stream.test.mjs` 28/28 全部通过；Reviewer 子代理只读审查通过（BLOCKER=0、IMPORTANT=0、OPTIONAL=2）。未部署，尚未执行真实环境跨端联调。

### 2026-11-04 Chat UNKNOWN 显式恢复（源码、定向验证和只读审查完成；全量有3项已知失败）

新增按 attempt 定位的 `POST /api/ai/conversations/{conversationId}/runs/{runId}/attempts/{attemptId}/recover`，只显式终结当前 active run 的 current UNKNOWN attempt，不自动重新派发。无 READY/SUBMITTED activity 时 fence 后以 `FAILED/CHAT_UNKNOWN_ABANDONED` 结束，保留公开正文、已验证行和 private tool evidence，只将 GENERATING block 标成 INVALID；READY/SUBMITTED 已提交时结为 COMPLETED 并保留 activity/private reference。usage task、reservation、charged ledger 不清零、不退款。重复或旧 attempt 请求不影响新 attempt/其他 run，conversation fence 拒绝迟到 worker。`CHAT_RECOVERY_NOT_ALLOWED` 按 HTTP 409 返回。无 DB schema/migration 变化。定向 controller/persistence/error/OpenAPI 46/46、PostgreSQL 4/4、OpenAPI export 18/18；只读 reviewer B0/I0/O0。最终 full 1090 tests / 3 failures / 0 errors / 2 skipped，失败为已知 OverviewIdentity migration、TaskColor migration、AiFeaturePolicyParity 三项；`-DskipTests package` 通过。首次 full 的第四项 Source 删除版本冲突在隔离3/3及最终 full 未复现，发生时当前记录显示 `INDEXING` 和旧 baseVersion，直接原因未确认。报告在 `D:/Temp/auralis-chat-agent-loop-evolution-20261104/step7.md`；未部署、未调用真实 Provider/AGY、未操作业务数据库，PC/Mobile handoff 由用户处理。自动测试不代替生产并发、Provider 停止状态或 GUI/业务验收。

### 2026-11-04 Chat 真正空回复保护（源码、定向验证与唯一只读审查完成）

合法 provider `STOP` 若本轮尚无非空白公开正文或 `READY` 非题卡展示组件，且现有迭代上限仍有机会，Orchestrator 在同一 attempt 内追加一次受控 continuation 指令。reasoning、空白正文和无效/生成中展示预览均不算有效回答。有效纯展示组件可独立结束；`READY` 题卡仍按既有原子语义立即提交并停止，不泄漏 reference 或要求正文。若没有迭代余量或 continuation 再次为空，公开短说明并以正常完成收尾；真实 Provider、Gateway 预算、权限、版本、取消、deadline 和 owner 异常维持原失败/取消路径。没有扩展 caps、attempt、API/SSE、DB 或客户端 schema。

`mvnw.cmd -B -ntp "-Dtest=ChatDisplayToolArgumentRepairTests,DisplayToolOrchestratorTests,ChatAgentProtocolPublicationTests" clean test` exit 0，22/22、0 failures/errors/skips，包含空 STOP 后 read tool call/result 配对、继续仍空、无迭代余量、READY 纯组件、continuation Provider 失败/取消，以及既有 READY 题卡原子结束。主 Agent 唯一只读 reviewer：BLOCKER=0、IMPORTANT=0、OPTIONAL=0。不代表真实 Provider、部署、GUI 或业务验收。完整命令与范围见 `D:/Temp/auralis-chat-agent-loop-evolution-20261104/step6.md`。

### 2026-11-04 Chat Catalog 文档定向搜索（源码、定向验证与review完成）

`search` 新增可选 native-tool 参数 `sourceIds`，允许模型使用 Catalog sourceId 只检索 attempt 已冻结的授权子集；省略参数保持现有搜索路径。显式 null/空数组/重复/非法 UUID/未知参数返回可纠正的 `CHAT_TOOL_ARGUMENT_INVALID`，快照外 ID 返回 `SOURCE_SCOPE_DENIED`。检索前后继续校验 owner、active/READY、subject 与 ingestion revision；单次 query 只执行一次现有 embedding 预算调用。`RetrievalService.retrieveWithinSources` 独立验证来源 owner/active/READY/数量，并在有 subject 时守住 subject 边界；global/null scope 子集可跨 subject，但不超出 ReadScope。SUBJECT 的 HTTP `ReadingContext.sourceIds` 仍必须为空，native tool 参数与客户端授权字段分层。

没有排序/真实语料漏召回证据，本步未引入 BM25/RRF/reranker，未调整 topK/限额。受控向量验证只证明所选集合隔离与返回真实 chunk ID，真实中文检索质量仍待安全标注语料对照。检索、Chat tool、Provider request publication 定向验证 30/30；最后加强 Catalog→search 用例后受影响类再次 8/8；目标 `git diff --check` 通过。唯一只读 reviewer BLOCKER=0、IMPORTANT=0、OPTIONAL=0。命令及未覆盖范围见 `D:/Temp/auralis-chat-agent-loop-evolution-20261104/step5.md`。

### 2026-11-04 Chat 学科资料自主发现与有界 Catalog（源码、定向验证与 review 完成）

后端按 attempt 捕获的 owner/subject/READY/revision 范围提供分页只读 `list_sources`，每页最多 20，返回真实 sourceId/title/revision 及 total/hasMore/nextOffset。仅 `SUBJECT` 可看到当前学科全部 READY 文档；此 mode 下 `currentSourceId` 必须为空且 `sourceIds` 必须为空数组，否则返回 `VALIDATION_FAILED`；`AUTO.currentSourceId` 与 `SELECTED_SOURCES` 保持现有范围。系统提示规定完整覆盖声明必须读完分页；目录标题视为不可信数据，excerpt chunkId 必须取自真实工具结果。Catalog 不进入受保护上下文，目录读取无 per-row 查询、摘要生成、Overview 或 DB/API schema 改动。Catalog/发布/allowlist 定向测试 22/22 通过，唯一只读 reviewer 复核 BLOCKER=0、IMPORTANT=0、OPTIONAL=0；PC/Mobile 接入由用户完成，具体 request mapping 见 `D:/Temp/auralis-chat-agent-loop-evolution-20261104/step4-frontend-handoff.md`。本步不调用真实 Provider、不部署或操作业务数据库。

### 2026-11-04 Chat 当前轮工具证据分层压缩（源码、定向验证与只读审查完成）

容量投影已纳入当前轮成功资料工具结果，并以真实 mapped request evaluator 判断。边界显式保护 system、当前原问题、已选上下文、题卡提交及授权 scope。仅对 read/search/outline 成功证据投影副本做完全相同 evidence 行去重、既有旧历史折叠、较早当前结果摘录缩短和必要 metadata 投影；保留 source/chunk/revision 标识与去重省略计数。native tool-call/result 保持 iteration 内完整配对，无法明确配对的结果不压缩；私有账本不被覆盖。

最终 no-fit 复用既有错误码并在 reservation/Provider 之前失败，单条 warning 提供实际历史/保护上下文/当前工具结果等边界数值，不记录完整 prompt。工具额度结束时使用已有最终迭代收尾，不执行新工具；收尾指令优先于旧工具错误修复，不增加预算或调用。未新增摘要模型、限额、公开 API/SSE、Database 字段或自动跨资料 scope。clean 定向测试 48/48，0 failures/errors/skips；目标差量空白检查通过；唯一只读 reviewer 差量复核 BLOCKER=0、IMPORTANT=0、OPTIONAL=0。报告：`D:/Temp/auralis-chat-agent-loop-evolution-20261104/step3.md`。未调用真实 Provider、部署或重启进程，未做 GUI/业务验收。

### 2026-11-04 Chat 容量拒绝诊断（源码、定向验证与只读审查完成）

Chat Gateway 在现有容量 evaluator 最终拒绝映射请求时记录结构化维度、actual/limit 与安全字节统计。正文按 `SYSTEM`/`USER`/`ASSISTANT`/`TOOL` role 计量，另计 reasoning、tool-call 参数、tool definitions 与完整序列化请求，不声称分项可加总为序列化字节；日志不含内容或秘密。Gateway mapped request 不保留可靠的历史/当前轮边界，不从 USER role 推断问题或当前证据。projector 试裁剪和成功请求不记录。拒绝判定、限额、错误码、预算和 Provider 边界没有改变；没有公开 API、数据库或客户端契约变化。`AiChatRequestCapacityTests` 与 `AiInvocationGatewayTests` 合计 28/28 通过；目标 tracked 差量 `git diff --check` exit 0，开工时已 untracked 的两个 Java 文件单独检查无尾随空格。唯一只读 reviewer BLOCKER=0、IMPORTANT=0、OPTIONAL=0；未调用真实 Provider、部署或 GUI/业务验收。

### 2026-11-04 Chat 资料读取容错与回答收敛（源码完成，定向验证通过）

对当前授权 scope 内可识别的 read-tool 参数错误，以及已授权 source 下缺失摘录，后端仅在错误后再次确认 source scope 与 revision 后返回安全 native tool result。每个 attempt 最多允许一次纠正；第二次同类错误关闭工具调用并要求一轮按既有预算完成收尾，模型若仍请求工具则不执行并补充固定资料不足说明。权限、scope/revision、取消、预算、Provider 和系统错误继续沿用原失败路径。空/无关搜索允许一次定向改写，仍不足时收敛为资料不足；用户要求只依资料时不补一般知识。`tool.error` SSE 只标记该工具状态，run 可继续正常结束，未增加公开协议或数据库字段。目标后端测试 22/22 通过；追加 projector 历史收尾用例后 affected class 8/8 通过；目标差量 `git diff --check` exit 0。唯一只读 reviewer BLOCKER=0、IMPORTANT=0、OPTIONAL=0。真实 Provider、部署和 GUI 行为未验收。

### 2026-11-04 PC 用户资料头像存在提示（hasAvatar）接入与自动验证（源码完成，定向验证通过）

根据 2026-11-04 用户资料头像存在提示（hasAvatar）契约，完成 PC 端对 `hasAvatar` 字段的完整接入与行为闭环：
1. OpenAPI 生成契约同步：运行 `scripts/generate-openapi-sdk.ps1 -SkipExport` 自动同步 PC/Mobile 的 `schema.ts`，`UserView` 强类型补齐必填布尔字段 `hasAvatar: boolean;`；
2. 缓存与网络按需拉取守卫：在 `useAuthStore.ts` 的 `loadAvatar()` 中严格基于 `user.hasAvatar` 进行守卫，为 `false` 时直接跳过 `GET /api/auth/me/avatar` 网络请求，清理当前头像显示与 IndexedDB 缓存；仅当为 `true` 时才发起远端头像拉取；
3. 跨设备删除 404 平滑回退：远端拉取遭遇 404（跨设备删除或并发变更）时，将本地 `user.hasAvatar` 置为 `false` 并清理本地缓存与 ObjectURL，视图层平滑 fallback 至默认首字母头像；网络或 5xx 故障时按离线优先策略保留已有离线头像显示；
4. 本地状态即时维护：在 `useAuthStore.ts`（`setAvatarFromBlob` 与 `clearAvatar`）及 `Profile/index.vue`（`handleAvatarFileSelected` 上传成功、`resetAvatar` 重置成功、`saveNickname` 资料更新成功）中，即时维护 `authStore.user.hasAvatar` 标志位，`fetchMe()` 亦同步按 `hasAvatar` 调度展示与清理；
5. 验证与审查：PC 类型检查 `npm run type-check` exit 0；定向测试套件 `scripts/r4-profile-live-links.test.mjs`（8/8 全部通过，含新增的 `hasAvatar` 契约跳过、404 回退、标志维护等断言）；Session 逻辑回归套件 `scripts/r4-auth-session.test.mjs`（3/3 全部通过）；只读 Reviewer 差量复审通过（BLOCKER=0、IMPORTANT=0、OPTIONAL=0）。未部署，尚未执行真实环境跨端走查。

### 2026-11-04 后端用户资料 hasAvatar 字段（源码、定向验证、artifact 和 package 完成；全量保留既有断言失败）

统一 UserView 增加 `hasAvatar`，读取当前用户头像表行是否存在；注册/登录/刷新、GET/PUT `/api/auth/me` 均使用同一值。上传/删除继续 HTTP 204，不改变用户 version；头像无记录时 GET 仍 404。客户端接入语义为 false 时跳过 GET 并清当前用户旧头像显示/缓存，true 时再 GET，跨设备删除或竞态仍可能 404 并使用默认头像 fallback；上传/删除成功可本地更新或刷新 `/me`。没有数据库字段或迁移。`AuthControllerTests` 16/16、`OpenApiArtifactTests` 17/17（含 hasAvatar required）通过；临时目录 TS 预览显示必填 `hasAvatar: boolean`，未改 PC/Mobile schema。隔离 loopback trust-auth/tmpfs PG + test-only TLS 全量 1063 tests / 3 failures / 0 errors / 2 skipped，失败仅为既有 AiFeaturePolicyParity stage count、TaskColorRemovalMigration V42/实际V43、OverviewIdentity V41/实际V43；此次新增的 Auth 和 OpenAPI 测试通过。`mvnw -B -ntp -DskipTests package` exit 0，唯一只读 Reviewer B0/I0/O0。报告和命令日志：`D:/Temp/auralis-avatar-presence-20261104/implementation.md`。未部署、未操作业务DB、无 GUI/真实账号验收。

### 2026-11-04 PC 学科总览批量状态查询接入与 404 循环抑制（源码完成，定向验证通过）

根据 [学科总览批量状态交接计划](../plans/2026-11-04-overview-batch-status-handoff.md) 完成 PC 端对 `POST /api/overview-results/subjects/statuses` 接口的完整接入，彻底消除无总览学科逐个 GET 探测产生的 404 网络噪声：
1. 类型定义与契约：在 `Auralis-PC/src/types/overview.ts` 中定义并导出 `OverviewSubjectStatusKind`（`AVAILABLE | MISSING | UNAVAILABLE`）、`OverviewSubjectStatusItem` 与 `OverviewSubjectStatusesResponse`；通过 `scripts/generate-openapi-sdk.ps1 -SkipExport` 自动同步 PC/Mobile 权威 OpenAPI 客户端生成契约；
2. API 边界与响应校验：在 `useOverviewResultsApi.ts` 中实现 `getSubjectStatuses`，入参严格限制 1–100 个非空 UUID/ID；在 `asOverviewSubjectStatusesResponse` 中对响应进行严格校验：`AVAILABLE` 项要求非空版本与更新时间（支持 `version = 0`），缺失元数据视为协议错误抛错；`MISSING`/`UNAVAILABLE` 项四个元数据字段统一规范化为 `null`；状态接口自身 404 或网络/鉴权异常直接中断抛错，禁止降级掩盖；
3. 总同步服务调度重构：在 `overviewResultsSyncService.ts` 的 `reconcileInternal` 中对学科 ID 集合去重，并以 `BATCH_SIZE = 100` 切片发起状态批量查询（空集合不发请求）；在 `syncSubject` 中严格遵循既有 outbox 写入优先级；无待上传 intent 时，`MISSING` 直接短路避免 GET 请求且安全保护本地有效记录（触发 `enqueueLegacySeed` 并上传），`UNAVAILABLE` 保持现状跳过，`AVAILABLE` 在本地版本与更新时间完全吻合时跳过拉取、仅在不匹配或缺失时发起单 GET；并发 404 正常收敛为空结果；
4. 验证与审查：PC 类型检查 `npm run type-check` exit 0；`scripts/r4-overview-sync.test.mjs` 定向套件（含 10 组批量状态、分批、去重、404 阻断、本地种子上传等新增断言）38/38 全部通过；关联套件 `r4-overview-cache.test.mjs`（17/17）、`r4-overview-generation.test.mjs`（84/84）、`r4-sync.test.mjs`（36/36）全部通过；只读 Reviewer 差量复审通过（BLOCKER=0、IMPORTANT=0、OPTIONAL=0）。未部署，尚未执行真实环境跨设备联调。

### 2026-11-04 PC 学科复习仪表盘暗色模式（Dark Mode）渲染异常修复（源码完成，定向验证通过）

针对暗色模式下学科复习卡片亮白底色失配与文字对比度失效问题完成闭环修复：
1. 全局暗色变量闭环：在 `Auralis-PC/src/styles/index.css` 的 `html.dark` 中补齐 `--color-bg-card: #252422;`、`--color-bg-page: #191816;` 与 `--bg-card: var(--color-bg-card);`，消除全应用依赖卡片全局变量在暗色下残留米白底色的隐患；
2. 整合计划卡片与组件暗色层级重构：在 `SubjectReviewPane.vue` 中为核心计划卡片 `.subject-review__plan-card`、单轮复习卡片 `.subject-review__card`、提示条 `.subject-review__notice`、进度标签 `.subject-review__round-progress-tag` 与轮次总结 `.subject-review__round-summary` 补齐统一的 Zen 暗色体系（深灰底色 `#252422`、高质感发丝边框与立体深邃阴影）；优化 `.subject-review__plan-badge`（淡 Sage 背景与高对比文本色）、`.subject-review__pomodoro-track`（柔和低对比圆环背景轨道）及 `.subject-review__panel:hover` 微光边框；
3. 验证与审查：PC 类型检查 `npm run type-check` exit 0；全量生产构建 `npm run build` exit 0；定向测试套件 `scripts/r4-subject-review.test.mjs` 50/50 全部通过；唯一 Reviewer 子代理差量审查待执行。未执行真实客户端 GUI 走查。

### 2026-11-04 PC 窗口最小尺寸与窄窗响应式布局验证（源码完成，定向验证通过）

针对桌面窗口最小物理边界缺失及窄窗布局未覆盖问题完成闭环实现与验证：
1. 窗口物理边界契约补齐：在 `Auralis-PC/src-tauri/tauri.conf.json` 中为主窗口添加 `"minHeight": 600`，与原 `"minWidth": 960` 对齐，符合 Tauri 2 规范并杜绝极低高度窗口下的元素重叠；
2. 外壳与工作台窄窗自适应：在 `App.vue` 的 `.app-shell` 上增加 `min-width: 960px; min-height: 600px;` 兜底守卫；在 `SubjectWorkspace/index.vue` 中新增 `@media (max-width: 960px)` 媒体查询，将中间主工作区由 320px 收敛至 280px，Tier-2 抽屉最大宽度收敛为 200px，AI 助手收敛为 260px，确保三栏同时展开时总宽度严格小于 960px，杜绝横向滚动条或布局被挤爆；
3. 验证与审查：PC 类型检查 `npm run type-check` exit 0；全量生产构建 `npm run build` exit 0；新增定向套件 `scripts/r4-window-boundary.test.mjs` 4/4 全部通过；Reviewer 子代理差量复审 BLOCKER=0、IMPORTANT=0、OPTIONAL=0。未执行桌面端 Tauri 拖拽 GUI 验收。

### 2026-11-03 PC 文件解析处理中心渲染与状态流转修复（源码完成，定向验证通过）

排查并修复了文件解析处理中心（DocumentProcessingCenter.vue）的四项渲染与生命周期异常：
1. 任务完成回跳闪烁消除：服务端未完成资料列表 `serverProcessingSources` 排除条件改以包含所有本地 Job 的 `store.jobs` 为基准，彻底消除本地任务完成变为 `READY` 从活跃 `jobs.value` 离开时、服务端短时未拉取而短暂将该文件作为“未处理/服务端处理中”回跳展示的闪烁问题；
2. 动态页码进度恢复优先呈现：调整状态文案优先级，只要存在本地实时 OCR 页码进度（`store.localOcrProgressBySource[source.id]`），优先展示动态页码进度，防止静态操作反馈（`sourceActionResults`）长期遮蔽识别进展；
3. Flexbox 布局撑破防御：给 `.processing-item-main`、`.processing-item-meta`、`strong` 与 `.processing-error` 引入 `min-width: 0` 和 `flex: 1` 守卫，状态徽标与操作按钮设置 `flex-shrink: 0`，长文件名与长错误信息优雅 ellipsis 省略，杜绝挤爆卡片或将右侧按钮挤出可视区域；
4. 全面适配暗色模式（Dark Mode）与微晶质感：补充完整的 `html.dark` 高对比配色规范，状态徽标药丸化，按钮全圆角微晶药丸化并支持交互动效，诊断详情增加最大高度与滚动条防止面板纵向异常拉伸；
5. 验证：PC 类型检查 `npm.cmd --prefix Auralis-PC run type-check` exit 0；定向测试套件 `scripts/r4-document-processing-ui.test.mjs` 15/15 全部通过；Reviewer 子代理只读审查 BLOCKER=0、IMPORTANT=0、OPTIONAL=0。未执行桌面端 GUI 验收。

### 2026-11-03 PC Chat 重试助手气泡重复堆叠修复（源码完成，定向验证通过）

排查并修复了 Chat 生成失败或中断后点击重试导致气泡重复堆叠的渲染异常：
1. 根因：服务端对重试 attempt 下发独立的新 `replyMessageId`，而 `useChatStore.retryPendingMessage` 原先仅将上一轮 USER 消息重置为 PENDING，未清理该轮提问紧随的旧 FAILED/INTERRUPTED 助手消息，导致新 attempt 完成后向 `messages.value` 追加新助手实体，视图中同一个提问下并存旧失败气泡与新成功气泡；
2. 修复：在 `retryPendingMessage` 发起新流式前，向前/向后精确定位当前提问轮次，从 `messages.value` 中清除当前轮次下所有未完成（`status !== 'COMPLETED'`）的旧助手消息，前序已成功的其他轮次消息严格保留；
3. 验证：PC 类型检查 `npm.cmd --prefix Auralis-PC run type-check` exit 0；定向测试套件 `scripts/r4-chat-content.test.mjs` 与 `scripts/r4-ai-stream.test.mjs` 合计 28/28 全部通过（含新增的重试旧消息清理回归断言）；Reviewer 子代理只读审查 BLOCKER=0、IMPORTANT=0、OPTIONAL=0。未执行桌面端 GUI 验收。

### 2026-11-03 PC 验收后端修复与 PC 交接（源码候选，未部署）

后端已实现两项修复：同用户 SOURCE_OVERVIEW/SUBJECT_OVERVIEW 的有效调用占用合并限制为 `max(1, perUserConcurrent-1)`，总用户/全局上限保持；Overview 在创建 reservation 前仅对明确标记的容量不足有界等候（120 秒、每实例最多 4 等待者），不重试 owner/fence 等同码错误或已派发 Provider 调用。等待事务外执行，绑定生成在尝试和派发前重核 source/owner/deadline，并重算响应超时。Review 在状态 flush 后 refresh 数据库表示，再冻结新回执，保留旧精确回放和请求指纹，无数据库迁移。

验证分批记录：主代理 `mvnw.cmd -B -ntp -DskipTests test-compile` exit 0；Luna 合并定向 164/164，其中 Overview 89/89、ReviewLifecycle 15/15、隔离 Testcontainers PostgreSQL 2/2（独立事务复习 state/history/replay，以及锁门闩观察两个 Overview actor 等待后唯一准入并允许 Chat）；后续容量错误标记修正的受影响集合 53/53，exit 0；最终 `mvnw.cmd -B -ntp -DskipTests package` exit 0。唯一 Luna reviewer 初审的一项 IMPORTANT 已由相同 reviewer 差量关闭，当前 BLOCKER/IMPORTANT 均为 0。完整批次和命令见 `D:/Temp/auralis-pc-three-fixes-20261103/luna-validation.md`，只读审查见同目录 `reviewer.md`。

后端全量首轮 exit 1：1062 tests / 2 failures / 48 errors / 7 skipped。48 errors 主要因现有集成类要求显式 task-owned loopback PostgreSQL URL；随后在随机 loopback 端口、无持久卷的 tmpfs PostgreSQL 补跑相关 9 类，43 tests / 42 passed / 1 failure / 0 errors。剩余失败为 AiFeaturePolicyParityTests 的阶段数断言，以及 TaskColorRemovalMigrationTests、OverviewIdentityPostgresIntegrationTests 的目标版本 42/41 与当前 43 不符；本轮未修改这些范围外断言，不能声明全量全绿。IngestionBudgetCalibrationTests 本轮实际完成（约 36.54 秒），未排除；SlowDrip 在任务专用 TLS fixture 下 3/3 通过。独立测试 PostgreSQL 已清理，未操作业务数据库。

用户指定 PC 代码自行实施：复习旧锚点精度等价与 prepared=false 误冲突定向恢复、取消排期进入持久 FIFO 队列尚未在本轮实施，详见 [PC 修复交接](../plans/2026-11-03-pc-review-unschedule-handoff.md)。本轮未修改 PC 源码、未合入 Antigravity 代码、未部署或调用真实 Provider，GUI/实际账号复习恢复和拖回待办仍待 PC 实施及联调。命令与审查证据：`D:/Temp/auralis-pc-three-fixes-20261103/`。

### 2026-11-03 Chat admission PostgreSQL 并发验证（定向通过）

新增 opt-in `ChatRuntimeConcurrencyPostgresIntegrationTests`，覆盖同会话 turn/turn 与 turn/READY activity_submission 两类竞争。每个场景由 barrier 同时启动两个 admission actor；专用 JDBC 事务持有目标 conversation 行锁，只有 `pg_stat_activity` 显示两个 actor 都在执行 conversation `FOR ... UPDATE` 且经 `pg_blocking_pids` 直接或传递阻塞于 gate 后才释放。最终两场景均严格得到 1 个 Admission 和 1 个 `CHAT_RUN_ACTIVE`；每个 conversation 只新增 1 个 PENDING run、attempt、USER message。题卡若胜出则恰好一条 SUBMITTED 且关联新 run/user message；turn 胜出则保持 READY 且无 submission。种子事务已提交，测试方法没有外层事务。

验证命令 `mvnw.cmd -B -ntp -Dauralis.postgres.it=true -Dtest=ChatRuntimeConcurrencyPostgresIntegrationTests clean test`，exit 0，2/2，0 failures/errors/skips。专用无持久卷 Testcontainers 使用 `pgvector/pgvector:0.8.6-pg17-bookworm`（PG 17.11，动态 JDBC `jdbc:postgresql://localhost:60853/test`）；测试断言真实 DataSource 指向该容器、映射端口不是 5432，并确认 `auralis.ai.enabled=false`。只直接调用真实 persistence admission，不执行 Orchestrator 或 Provider。日志 `D:/Temp/auralis-chat-concurrency-check-20261103/postgres-concurrency-tests-final.log`。不覆盖多实例部署、真实 Provider、UI 或业务验收。

### 2026-11-03 Chat 提示、自然组件选择与参数修正反馈（源码候选，定向验证通过）

SYSTEM prompt 与九个工具 description 使用中文，默认中文回答并偏好以简明中文呈现 Provider 原生可见 `reasoning_content`。提示保留资料授权/相关性判断、真实 provider `tool_calls`、Schema、活动边界；明确用户点名结构化视觉内容时调用对应工具，并补充自然意图映射；“带我走一遍过程/追踪状态变化”“对比概念/怎么选/代价差异”“规划学习路径/先学什么/拆解主题”分别优先 `render_steps`、`render_compare`、`render_roadmap`，同时保留普通并列清单、非对等比较、短答澄清等条件。调用 `render_steps`、`render_compare`、`render_roadmap`、`render_chart` 前，单次请求迭代最多只写一句简短过渡并立即发送原生 `tool_calls`；服务端 TOOL 结果返回并进入下一次模型调用后，继续完整 Markdown 背景说明与深入讲解，无需逐项复述组件内容。Activity READY 终止整个业务回合。考查、检验理解、练习、巩固或复述检查即使未点名卡片，也按选择题 `render_quiz` 或开放回答 `render_question` 触发。展示工具与资料工具 description 的修改不改变工具名或 Schema。

完整正常 `tool_calls` 批次触发一次 schema 修正时，同批更高 index calls 的安全 `not_executed/PREVIOUS_DISPLAY_ARGUMENT_INVALID` TOOL result 带固定重试提示，指出该工具尚未执行、修正先前参数后仍需要时可重新调用，并避免重复已成功工具。当前修正轮和后续历史投影均保留该固定提示；历史投影仅对白名单状态/code/reason 重建提示，不接纳历史任意 hint。attempt 整体的一次修正预算、取消/source/fence/预算/正常 finish 门禁及原生 call-result 配对不变；Activity READY 仍是终端边界。无新增公共 API 字段、Schema、DB 字段或 Provider 逻辑。

本轮仅进一步限定结构化展示提示段：`render_steps`、`render_compare`、`render_roadmap`、`render_chart` 工具前最多一句过渡；待服务端 TOOL 结果进入下一次模型调用后继续完整 Markdown 讲解。`ChatAgentProtocolPublicationTests` clean 重编译定向运行5/5通过，0 failures/errors/skips，BUILD SUCCESS，exit 0。最终 SYSTEM 快照：`D:/Temp/auralis-visual-transition-wording-20261103/SYSTEM_PROMPT.zh-CN.txt`。未调用真实 Provider、未部署。

定向验证最终命令 `mvnw.cmd -B -ntp '-Dtest=ChatAgentProtocolPublicationTests,ChatDisplayToolArgumentRepairTests,ChatEvidenceHistoryProjectorTests,DisplayToolPayloadValidatorTests' test`（在 `Auralis-Server` 目录）exit 0：25 tests、0 failures/errors/skips、BUILD SUCCESS；四类分别 5/5、2/2、7/7、11/11。中间执行发现旧 SYSTEM 断言与当前提示表述不一致；主 Agent 批准一次 `clean` 以清理 stale class 并完整重编译，修正剩余过时断言后同范围重跑通过。`git diff --check` exit 0。只验证合成请求映射、修正结果和历史安全投影，不保证真实 Provider 遵循；未调用真实 Provider或部署。证据：`D:/Temp/auralis-four-prompt-repairs-20261103/verification.md`，SYSTEM 快照：`SYSTEM_PROMPT.zh-CN.txt`。

### 2026-11-02 PC Chat 流式输出健壮性与多片段无缝过渡修复（源码完成，待真实客户端验收）

针对流式输出审查中定位到的体验与正确性问题完成定向修复：
1. `useChatStore` 的 `retryPendingMessage` 重试循环对无 `replyMessageId` 的事件增加回退提取与空保护，杜绝向消息列表追加未定义 ID 消息；
2. `ChatContentRenderer` 支持多文本与块组件交错生成：记录当前活跃文本段 ID，切换至结构化块或新文本段前先平滑 `flush`，消除蓄洪池被强制 reset 导致的前段文本瞬间跳字；
3. `useChatStore` 导出响应式 `streamingParts` 与 `streamingTools`，消除 `SubjectWorkspace` 在每个 SSE 事件上执行全历史消息 `reverse().find()` 的高频 O(N) 扫描，显著降低长会话流式 CPU 消耗；
4. `SubjectWorkspace` 解除正文到达时对思考链计时器的等待竞争，只要正文或块内容到达即刻放行正文呈现；
5. `markdown.ts` 中 `autoCloseMarkdown` 排除已闭合代码块内部字符，杜绝代码块内 `**` 或 `$$` 干扰外部粗体与数学公式的乐观补全。

类型检查 `npm.cmd --prefix Auralis-PC run type-check` exit 0；定向测试 `scripts/r4-chat-content.test.mjs` 与 `scripts/r4-ai-stream.test.mjs` 合计 25/25 全部通过。未运行全量与真实桌面端 GUI 验收。

### 2026-11-01 PC 复习读取与同步等待修复（源码候选，现场待复验）

用户控制台出现 72 次 `ReviewSyncService` 的 `this.db.select is not a function`。同步调用点误将 `localDb` 管理对象强转后传给复习同步服务；现先完成初始化并重核同步 scope，再传入 `getLocalSqlDatabase()` 返回的连接，移除该处 `as any`。本地复习投影复用原子事务内读取或更新的记录，删除每个有正文 hash 知识块的一次事务后重复查询；仍保留内容失效与学科移动的原子校验。不同知识块的复习同步限制为最多 3 个并发 worker，同一知识块命令仍按序，账号变化后等待在途 worker 结束再退出。

最终 PC `npm.cmd run type-check` exit 0；本地读取计数、数据库注入与迟到结果隔离、同步并发/失败继续、scope 变化、单 KB 命令顺序的定向检查分批共 5 项通过。唯一只读审查 BLOCKER/IMPORTANT/OPTIONAL 均为 0。较大三文件定向集合未全绿：Node 测试缺少 Web Locks，失败详情见执行报告，未以 HEAD 对照证明全部为既有失败。Overview 404 与触发日志的只读调查未证明独立自旋，本轮不调整 Overview。证据：`D:/Temp/auralis-review-load-performance-20261101/`。尚未完成修复后的真实客户端同步与加载耗时验收，不据源码或替身测试声明现场卡顿已消失。

### 2026-11-01 Chat 展示组件选择与题卡触发提示（源码候选，未部署）

SYSTEM prompt 与 `render_*` 描述已细化：卡片作为高密度结构骨架，短标题和简短结论；完整原理、类比、原因、推导与边界可放普通 Markdown 正文，组件前只限制过渡句，组件后可继续讲解而不逐项复述。steps 只表示有序执行/状态/因果链；compare 只比较至少两个对等对象的共同维度；roadmap 只表达有依赖的阶段。用户请求考考、检验理解、练习、巩固或通过复述检查时，必须按题型使用真实 `render_quiz`/`render_question`；主动学习完成核心知识点后可选一个有价值的 checkpoint。局部澄清、尚未消化误解的补讲、纯导航概览轮不机械追加，正常澄清问句不自动制成卡片。问题依赖指定资料且上下文不足时先查相关资料；不依据尚未返回的搜索结果声称生成组件，使用有效选中文本/近期原文，找不到时说明且不强凑。仍明确要求 provider 原生 `tool_calls`，禁止正文/代码块伪装工具调用，也不以 literal marker、JSON、Mermaid 替代明确请求的视觉组件；协议/代码说明仍可展示示例。

只改 SYSTEM 与 provider tool description 文案及其 mapped-request 断言，没有修改 schema 字段/校验、工具调度、检索策略、运行逻辑、调用预算或自动题卡生成。命令 `Auralis-Server\\mvnw.cmd -B -ntp -Dtest=ChatAgentProtocolPublicationTests test`（在 `Auralis-Server` 目录执行）最终 exit 0：5 tests、0 failures/errors/skips，`BUILD SUCCESS`；报告位于 `Auralis-Server/target/surefire-reports/TEST-com.auralis.app.ai.internal.chat.ChatAgentProtocolPublicationTests.xml`。此前两次运行暴露并修正了断言中残留的旧提示字面措辞；未放宽工具历史/assistant-call 与 result 配对断言。提示不保证真实模型遵循；未调用真实 Provider 或部署。观测报告：`D:/Temp/auralis-literal-render-steps-20261101/findings.md`。

### 2026-10-31 Timeline 正常拖动被基线校验拒绝（回归已修复，现场待复验）

用户反馈任意拖动均提示“排期已在其他窗口更新”。已确认合法 CANCELLED 任务经展示 `cancelled` 往返时误变 TODO，可使整个任务集合基线恒不一致；现补齐状态映射，保留并发围栏。另修正状态修改时展示 HH:mm 覆盖完整排期日期的问题。类型检查 exit 0，相关两套测试 138/138，唯一只读审查 B0/I0/O0。原有 Chat 等并行修改保留；本轮未跑全量/构建或 GUI，不能据此更新此前全量失败状态。证据 `D:/Temp/auralis-timeline-baseline-fix-20261031/`；用户实际页面拖动仍需复验。

### 2026-10-31 Chat 展示工具单次参数修正（源码候选，定向验证有限）

完整正常 tool call 中，已注册 render_* 的首次 schema/语义拒绝现在以安全字段路径/缺少必填字段组成 ToolExecutionResult，和原 assistant call 配对后允许一轮模型修正；attempt 级最多一次，复错保留原失败处理。JSON 语法、preview/identity/provider、预算、取消、source/fence 错误不适用。坏 block 保留 INVALID；同批更高 index calls 收到固定未执行结果并跳过，预览 Activity 不提交 READY；此前成功的批内内容保留。修正轮继续使用现有 iteration/model/tool/token/deadline 上限，没有补造参数或强制生成组件。四类定向 Maven 共25 tests、0 failures/errors/skips：`ChatDisplayToolArgumentRepairTests` 2/2、`DisplayToolPayloadValidatorTests` 11/11、`ChatEvidenceHistoryProjectorTests` 7/7、`ChatAgentProtocolPublicationTests` 5/5。历史工具 evidence fixture 明确 stub 执行 owner 与未取消状态，避免250ms owner poll取消测试执行。未使用真实 Provider/部署/GUI。

### 2026-10-31 Chat 工具历史与组件调用提示（代码候选，聚焦验证待执行）

历史工具 evidence 现在不依赖 reasoningContent：每个 iteration 投影为原生 assistant tool_calls 与一一配对的 ToolExecutionResult；reasoning 仍只在 provider 明确返回时按原映射 passback，不构造 reasoning。容量折叠保留调用与结果配对，必要时再按现有策略移除完整旧 evidence。历史 assistant 正文 Markdown 保持原样，因此仍可能与结构化工具上下文并存；本轮不清洗或重写已存消息。SYSTEM prompt 仅在用户明确请求结构化视觉表达（步骤图、比较表/列表、路线、图表或题卡）时要求使用对应工具；普通解释性 Markdown 列表仍可直接书写。展示组件前只写简短引子，不先重复完整组件正文。`ChatEvidenceHistoryProjectorTests` 与 `ChatAgentProtocolPublicationTests` 定向共11/11，0F/0E/0S，exit 0。提示词不能保证真实模型遵循；未调用真实 Provider、未部署。

### 2026-10-31 Chat 展示工具后端重写（源码与 focused 验证完成，full suite 有限）

新后端用六个严格 provider tools 生成 steps/compare/roadmap/chart/quiz/question，普通模型 content 全部按 Markdown 保序输出。Data tools 保持领域数据读操作；Visual tools 本地生成 parts 与 Markdown，并以小型 tool result 继续模型循环；Activity tools 将完整合法题卡、可选私有 reference、公开快照与私有证据原子落库后结束当前生成。arguments 增量预览只含完整合法字段/子项；只有正常 `tool_calls` 终态和最终 root schema 验证通过才完成卡片。EOF、异常 finish、取消、参数/owner/source fence 失败会将已开始卡片置 INVALID 并保留已校验行；Activity 后续 provider-index 的预览卡也在 READY 事务中保存为 INVALID。旧 `ChatStreamParser` 和正文 marker/NDJSON 路径已移除，历史数据保留且不自动转换。

clean focused 后端 suite 126/126、0F/0E/0S，exit 0（完整命令见 evidence log）；唯一只读 reviewer B0/I0。完整隔离 PostgreSQL 测试因 `IngestionBudgetCalibrationTests` 在 `TextChunker.boundaries` 纯 CPU 循环中持续占用主线程而排除该类；其余 1036 tests 为 3F/2E/2S、exit 1。三项既有失败为 `AiFeaturePolicyParityTests` Chat stage 次数断言、`OverviewIdentityPostgresIntegrationTests` 迁移版本 41/43 断言及 `TaskColorRemovalMigrationTests` 版本 42/43 断言；两项错误是 `OverviewDeadlineSlowDripTests` 缺 TLS keystore JVM 参数，补充 `auralis.test.tls.keystore` 后该类 3/3 通过。`mvnw.cmd -B -ntp -DskipTests package` exit 0。详细输出见 `D:/Temp/auralis-display-tools-validation-20261031/`。未调用真实 LLM、未部署、未操作业务数据库；PC consumer 仍由用户修改并验收。字段/event/schema 见 [Chat Runtime API](../contracts/chat-runtime-api.md)；前端实施契约见[handoff](../plans/2026-10-29-chat-frontend-handoff.md)。以下 10-30/10-31 旧 parser 项仅是历史记录，现行协议以 10-31 display-tools 重写为准。

### 2026-10-31 Chat 请求容量预检与 Gateway 对齐（源码候选，未部署）

Orchestrator 历史投影和 Gateway reservation 前使用同一个无副作用容量 evaluator，覆盖最终 provider request 的完整序列化、legacy message 正文与单条 tool result UTF-8 字节。投影折叠/移除可裁旧历史后，必需/current 内容仍超限则沿用 `AI_REQUEST_BUDGET_EXCEEDED` 并在 reservation/dispatch 前拒绝。输出 maxTokens 校验仍由 Gateway 独立先行，任务 token 余额和调用次数不驱动历史裁剪；非 Chat 与 Overview 门槛保持原样。5 个后端定向测试类 39/39、`-DskipTests package` BUILD SUCCESS。未改 token 额度或容量环境设置，未部署或进行真实 Provider 验收。

### 2026-10-31 PC Timeline 连续本地拖动（源码完成，真实客户端待验收）

排期命令 pending/inflight 时可继续本地拖动，后台串行结算、衔接未发送命令版本并保护最新乐观位置。补齐跨窗口同版本日程基线、重启/PROCESSING 队首重试及墓碑与排期回执冲突的恢复；原有落点规则保持。Antigravity 委派启动 exit 1、无生成改动，实际由 Codex 实现并做唯一只读审查 B0/I0/O0。类型检查和构建 exit 0，四套定向 176/176；PC 全量 784 项中 752 通过、32 失败，未全绿。证据 `D:/Temp/auralis-timeline-continuous-drag-20261031/`。未部署，真实浏览器/Tauri 连续拖动、弱网、重启与 Server 联调仍待验收。

### 2026-10-30 Chat 可视化教学组件选择提示（源码候选，未部署）

Chat SYSTEM prompt 已增加按教学内容选择结构化表达的指导：明确可视化请求优先；流程、同维度比较、阶段依赖分别适合 steps、compare、roadmap；chart 使用用户给定或已收到相关证据支持的数值，假设示例须明确标注；quiz/question 仅在有助于理解检查时置于末尾。复杂解释通常选择一至两种有用组件，不对简短事实、澄清或闲聊硬插，正文与组件避免重复。该提示不保证真实模型一定遵循。合成 Orchestrator mapped-request 断言确认规则及 compare.entries/可选 quiz reference schema 同时进入初始及工具继续轮请求；定向 parser/projection/request-capture 共24/24，`-DskipTests package`成功。完整 `ChatAgentProtocolPublicationTests` 本轮未运行。未改变生成 schema、控制流、检索策略或调用预算；未调用真实模型、未部署。

### 2026-10-30 Chat quiz 渐进题卡与有限 JSON 修复（源码候选，未部署）

Server 已按 `block.started` 创建外框并逐条发布完整 stem/option 行；quiz 仅需有效题干、至少两条唯一选项及正常 `:::` 闭合即可 READY。private reference 可缺省；有合法 reference 仍保留私有，submission 下一轮将题目和用户答案交给 LLM，程序不判分。可解析的 `type=reference` 行若字段语义错误会丢弃私有部分并记录 safe enum，公开题卡仍可 READY；JSON 本身无法解析、字段 schema 无效、重复 option key 或缺失闭合仍不可 READY。


标准 JSON 解析失败后只对完整 NDJSON 行尝试局部 trailing-comma reader，随后重复相同 schema/allowlist 检查；不补造内容，不做泛化 JSON repair。完整单个 JSON object 也可跨物理行收集，嵌套对象/数组、字符串与转义按流式状态跟踪；仍按每物理行与单 row 的 `maxLineChars`、整块 `maxBlockChars` 限额限制。每个对象闭合后立即作为一项校验发布，不等待整个组件；协议仍优先一行一项，同一物理行多个对象不接受。未闭合对象遇 `:::` 或 EOF 都不能 READY；SSE event shape 与前端 handoff 不变。

### 2026-10-31 Chat 组件 pretty JSON 行容错（源码候选，未部署）

Parser 现可接收有界的多行对象并只在完整对象闭合后走现有 strict JSON、trailing-comma-only retry、schema 与 allowlist 路径。无效/截断对象不会补括号、引号或字段；已接受的公开行保留在 INVALID block。该复现局限说明用户反馈的一种可能解析失败已修复，但缺少历史原始模型输出，不能确认过往空卡运行就是此原因。未改变 SSE event、前端行为、API 或 DB schema；没有真实 LLM、部署或业务库验证。定向验证 `ChatStreamParserTests` 24/24、`ChatPublicProjectionTests` 3/3、两个 Orchestrator publication 方法 2/2（合计29/29）；`mvn -B -ntp -DskipTests package` 成功。完整 `ChatAgentProtocolPublicationTests` 类未运行；未运行真实 Provider、部署、数据库或 GUI 验收。

### 2026-10-30 Chat 检索收敛与 compare 列表协议（后端源码候选，未部署）

模型 SYSTEM prompt 已加入按具体问题决定是否检索、按内容相关性判断证据的规则；来源检索仅返回无关结果时要求停止同义词搜索并说明已检索来源没有支持内容。若用户明确要求仅以资料作答，不用通识知识填补；如存在可信相关线索，可继续定向搜索或读取片段。没有新增固定 search 次数帽，原工具、iteration、task 预算不变。Compare item 现为 `{title,entries:[{label,text},...]}`，至少两条非空 entry；每维度一行 NDJSON，公开 part 与 Markdown 纵向投影。旧 description-only compare 不兼容、不自动迁移；steps、API 外层结构及 DB schema 不变。新前端 renderer 尚待用户按 [Chat Runtime API handoff](../contracts/chat-runtime-api.md) 实现；旧历史 compare shape 不由新 renderer 支持。

本轮 compare parser/projection 定向测试20/20通过，Server `-DskipTests package` 成功。合并运行的 `ChatAgentProtocolPublicationTests` 为3/4；唯一失败是既有 `successfulToolEvidenceIsPrivateAndRestoredIntoTheNextTurnProviderRequest` 在检查 compare prompt 前断言 `privateToolEvidenceJson` 含工具结果，但实际仍为 `[]`。失败报告未包含本次执行的 run.failed 安全诊断或 SSE events；未修改此 compare 范围外问题。故该运行未证明实际 provider request capture 对 compare 样例的断言。只读 reviewer 对 compare 源码差量 B0/I0/O0。真实 Provider、GUI、前端接入与部署未验收。

本轮命令：`mvn -B -ntp clean '-Dtest=ChatStreamParserTests,ChatPublicProjectionTests,ChatAgentProtocolPublicationTests' test`（exit 1：parser17/17、projection3/3、protocol3/4）；`mvn -B -ntp '-Dtest=ChatStreamParserTests,ChatPublicProjectionTests' test`（exit 0，20/20）；`mvn -B -ntp -DskipTests package`（exit 0）。测试报告位于 `Auralis-Server/target/surefire-reports/`。未跑完整测试套件、OpenAPI/SDK、部署、真实模型或GUI验收。

### 2026-10-30 Chat SSE MVC async timeout（源码候选，未部署）

最新 Chat run 在约31秒后与请求同一时刻触发 Spring `AsyncRequestTimeoutException`，导致已提交的 SSE 响应不可继续写入；Chat attempt deadline 实际为300秒。普通 turn 与 retry SSE 现在在 admission 成功后，将各自 MVC async request timeout 设为0（禁用 MVC 自身定时器），继续由原 Chat attempt deadline、取消与断流清理控制生命周期，不影响其它 MVC async/Overview 路径。真实 MockMvc 测试核验 async request 实际 timeout=0，使用25ms默认值和受控流证明请求跨过默认期限后仍可完成；旧 admission 前置失败语义不变。定向验证/package 见 `D:/Temp/auralis-chat-reasoning-live-20261030/mvc-timeout-fix.md`。源码未部署，长时间空窗仍受反向代理默认约60秒 read timeout影响，真实环境长流/断流验收待做。

### 2026-10-30 Chat generic failure 安全诊断（后端源码候选，未部署）

新运行事件定位到具体限额：run `37bd6765-a220-4e16-bacd-105311b00835` 第3 attempt 在 `AiUsageGuard.reserve` 第168行的 `TASK_CALLS` 分支失败。运行配置上限为 8 次模型与 embedding 调用；同一 logical run 的 owner-scoped ledger 已有 8 条（Chat completion 4、retrieval embedding 4），charged 14,792 tokens、无 RESERVED/active dispatched、1 条已 dispatch usage 未知但已按保守值计费。下一次 retrieval embedding 未获 reservation。原异常 `AiUsageLimitException.code()` 是 `AI_TASK_BUDGET_EXCEEDED`，但 Orchestrator 只识别 `DomainException` 而把真实预算拒绝对外写成 `CHAT_RUN_FAILED`；现仅为该异常类型安全保留经格式校验的业务码，不放宽任何额度或结算规则。合成真实 Orchestrator/tool-loop 回归会在工具成功后注入实际 `AiUsageLimitException`，验证run.failed及持久终态保留预算码。运行态旧 run 仍失败且账本不重置；该 run 已达调用上限，应创建新 Chat turn，不要在同一 run 上继续 retry。定向验证与 package 见 `D:/Temp/auralis-chat-reasoning-live-20261030/orchestrator-failure-observability.md`；源码未部署。

### 2026-10-30 Chat 调用限额拆分（源码候选，统一验证待执行）

新配置 `AURALIS_AI_CHAT_AGENT_MAX_MODEL_CALLS=0` 与 `AURALIS_AI_CHAT_AGENT_MAX_EMBEDDING_CALLS=0` 分别关闭 Chat completion 与 retrieval embedding 的次数帽；正数各自独立，负数启动校验拒绝。关闭 task 聚合调用帽，保留跨 retry 的同一 run ledger 计数、平台 Token/task 预算、Token 结算、并发/小时/日限额。`AURALIS_AI_CHAT_AGENT_MAX_TOOL_CALLS=12` 仍独立按当前 attempt 计数；`maxIterations=8` 仍限制单 attempt 的模型循环次数，解除 model calls 次数帽不代表无限轮运行。Run status 的通用 `accountingSummary` 增加 `modelCalls`、`embeddingCalls`（run 跨 retry）和 `currentAttemptToolCalls`（distinct trace id，仅当前 attempt）。后端与文档修改尚未统一验证，未改本机 `.env`、未部署或触发真实 Provider。

### 2026-10-30 Chat reasoning 流与 operation thinking（后端源码候选，未部署）

Chat 仅转发 provider 明确返回的 `delta.reasoning_content` 为独立 `reasoning.delta` SSE，与工具事件共同属于过程区；answer content/parts/parser 不接收 reasoning。Chat/Overview thinking 使用独立请求级配置：`.env` 中 `AURALIS_AI_CHAT_THINKING_ENABLED=true`、`AURALIS_AI_OVERVIEW_THINKING_ENABLED=false`；Docker backend 未重建，运行态新键仍未核实。DeepSeek 和 host 为 `api.xiaomimimo.com` 时发送 thinking 控制字段，其它 host 不发送。

显式 reasoning 与同 iteration tool calls 配对，跨 run 存入现有 `private_tool_evidence_json` 以满足 provider tool protocol；不新增 DB 列、不进入公开消息/状态/工具 trace/日志。历史容量候选按真实 mapped provider request bytes（含 reasoning、工具定义）进行折叠；超额旧 iteration 整组移除，不截断 reasoning。clean 定向 Server 测试 40/40 通过，`-DskipTests package` 通过，review B0/I0/O0。未调用真实模型、未部署、未验证真实 Docker 配置或业务库；GUI/业务验收待用户运行。

### 2026-10-30 Provider SSE 错误阶段诊断（后端源码候选，未部署）

`AI_PROVIDER_HTTP_FAILED kind=stream` 增加安全阶段/错误分类：HTTP status、Provider JSON/protocol frame、consumer callback 与 transport 分开记录；DomainException code 和 cause class 可用于区分本地错误，不记录消息或任何流内容。内部 SSE diagnostic failure 在 Provider 边界仍返回原有 `MODEL_PROVIDER_ERROR` 契约。合成测试与 Server package 验证结果见 `D:/Temp/auralis-chat-reasoning-live-20261030/diagnostic-fix.md`。真实 Provider 根因仍未知；新日志源码未部署，未重发请求。

### 2026-10-30 Chat 工具分片 callback 过早（后端源码候选，未部署）

运行日志的新 `consumer_callback` phase 指向本地 consumer `IllegalArgumentException`，终态 `MODEL_PROVIDER_ERROR`；run 无工具 trace/evidence。对照 langchain4j-core 1.22.0 验证发现 `PartialToolCall` 构造要求 name 非空，而 `ChatAgentModelAdapter` 曾在每个 SSE tool delta 后直接构造 SDK partial，即使 name/arguments 尚未到达。合成测试在 id-only、arguments-first/name-later、并行 index 形态下先复现 `name cannot be null or blank`；现将 partial SDK callback 延迟到 name 与 arguments 均非空，完整工具仍只在合法 `tool_calls` terminal 后提交。最终定向验证与 package 见 `D:/Temp/auralis-chat-reasoning-live-20261030/adapter-fix.md`。真实请求未重发；修复源码未部署，生产问题是否关闭待用户后续使用确认。

### 2026-10-30 Chat quiz 空卡诊断（后端诊断源码候选，未部署）

只读对照本机运行态：Flyway 最高为 V43 成功；最近 30 分钟 4 个 turn 均 COMPLETED、无 `chat_activities`。最新 attempt 的公开 snapshot 只有 text，无 quiz block；另一个快照含 READY steps 且 7 项。无法把截图唯一关联到某个 run，也没有证据确认模型当时缺 stem、缺 reference 或输出被截断。SYSTEM quiz schema 与 parser 要求一致；合成 17 字符分片经真实 `ChatAgentOrchestrator` 验证：异常 quiz（stem 前 option）产生 `UNEXPECTED_ROW`、0 valid rows，随后完整 quiz 正确持久化为 READY，private answer/reference 未进入 public parts。

`ChatAgentOrchestrator` 新增安全 WARN 诊断，仅记录 run/attempt/block UUID、component、parser error enum 与 validRows；不记录模型原文、题干、选项、答案、explanation 或工具参数，现有 SSE 仍返回 `CHAT_BLOCK_INVALID`。定向 `ChatStreamParserTests,ChatAgentProtocolPublicationTests` 为 17/17、0 failures/errors/skips；`-DskipTests package` exit 0。报告见 `Auralis-Server/target/surefire-reports/`。这是解析错误可观测性改进，不证明截图中的具体模型输出原因已定位或修复；新日志源码未部署，未调用真实模型、重发请求或写业务数据库。

### 2026-10-29 Chat protocol 1 首次全量门禁记录（未全绿）

### 2026-10-29 Chat Agent 六项后端修复（focused 完成，外部验收待做）

针对自查 6 项 IMPORTANT 的后端修复已完成：retry 原子 fence advance/claim/settle；实际模型 SYSTEM 完整冻结协议提示；parts 仅合并相邻 text；过期 foreign attempt 以有界、deadline/id 有序扫描且保留 fresh 与 UNKNOWN 语义；partial block 错误时保留有效已解析行并标 INVALID；V43 私有工具证据持久化与历史上下文投影。第5项的真实第二轮 provider request 测试验证 tool call/result、assistant 最终回复顺序，且 status/detail/trace 不含私有结果。

最终 focused clean/test 覆盖 6 suites、21 tests，0 failures/errors/skips，exit 0；随后 `mvn -B -ntp -DskipTests package` exit 0。首次 focused 失败的 partial 用例追到 target 缺少 Javac synthetic `ChatPublicProjection$1.class`；clean 重建后同一行为测试通过。首次全量 Server 仍为 940 tests / 2 failures / 58 errors / 7 skipped、exit 1，未把全量结果写成通过。未运行 PostgreSQL integration、真实 Provider、部署、SDK 生成或 GUI/业务验收；源码验证不代表运行环境已迁移到 V43。证据 `D:/Temp/auralis-chat-six-fixes-20261029/`。

首次 Server 全量 Maven 运行实际为 940 tests / 2 failures / 58 errors / 7 skipped，exit 1。多数错误来自 PostgreSQL integration 测试未配置 task-owned loopback PostgreSQL URL；Testcontainers 测试明确报告 Docker 环境不可用，均未作为业务实现失败，也未改成 skip。独立非环境问题已定位并修复：Chat 旧并发 fixture 未标记 protocol 1、token-shadow fixture 构造非法 null role、迁移测试仍固定期待 V41、运行时 OpenAPI artifact 落后。相应 fixture 回归 18/18 通过，官方 OpenAPI 导出/比较 15/15 通过。只读 review 的来源失效时 chunk 先公开问题已修复；source revision 与 owner/fence 失效的行为回归及 persistence/recovery/profile/controller/source 受影响集合18/18通过，review最终B0/I0/O0。最终 `-DskipTests package` exit 0。不是全量测试通过。未执行 PostgreSQL/Docker integration、真实 Provider、部署、前端 SDK 生成或 GUI/业务验收。证据 `D:/Temp/auralis-chat-p2-validation-20261029/`；review `D:/Temp/auralis-chat-p2-final-review-20261029/review.md`。

### 2026-10-29 工作树提交前检查

PC type-check 与文档处理定向测试 51/51 本轮通过；check:r4-pc 唯一命中未改动 Rust cfg(test) 模块的 localhost，属于既有扫描误报，该命令仍为失败。后端原 11 个改动文件与既有最终证据 SHA-256 完全一致，复用定向146/146、隔离PG受影响43/43及TLS3/3；本轮打包发现 Recovery fixture 漏传新增 overviewMaxRetries，已补 currentAi.overviewMaxRetries() 保持配置。最终 -DskipTests package 退出0，151个测试源码编译成功。Recovery测试因Docker daemon不可用在Testcontainers初始化失败，主体未执行；未重跑全量，不称全量通过。唯一只读审查最终B0/I0/O0。Chat仍处于计划阶段；未部署、访问业务库或验收真实Provider/GUI。证据D:/Temp/auralis-precommit-20261029/。

### 2026-10-29 Chat Agent 与流式可视化教学（后端代码候选，统一验证待执行）

已整理用户确认的轻量 Chat 方向与[重写计划](../plans/2026-10-29-chat-agent-visual-teaching.md)：正文逐字/组件逐项、题卡提交后由 LLM 接续，不判分。`codex/chat-agent-rewrite` 基线为 `6de8d3a`，main 仍为已 push 的 `20b5c87`。Server 当前源码候选包含 protocol-1 controller/DTO/SSE、显式 Agent loop、持久化三表与 V42、attempt deadline/fence/recovery、source 工具和 one-shot endpoint。新 run 锁存 provider/model/规范化 endpoint hash；request replay 先比较仅由规范化 body 形成的 hash，retry 先按原 profile 校验，worker 派发前再核对；凭据轮换不改变 profile identity。UNKNOWN 恢复会写 FAILED reply 和最后公开 snapshot，同时保留 UNKNOWN 与会话 slot。`docs/contracts/chat-runtime-api.md` 是当前字段级候选契约。已补 adapter/provider、profile admission、controller、persistence、recovery 相关测试源码；尚未运行 Maven、V42 migration、OpenAPI artifact 或共享构建验证，不能把源码存在写成构建/测试通过。P1 PC 内容基础已提交，用户接手所有前端实现；当前未验证的前端草稿不代表完成。未调用真实 Provider、未部署或操作业务库。证据目录 `D:/Temp/auralis-chat-p2-runtime-20261029/` 将记录本轮源码交接。

### 2026-10-28 桌面资料处理入口反馈与手动重验（源码修复，队列READY已只读确认）

处理中心“开始本机处理”增加“正在同步资料…”/“正在启动本机处理…”两阶段反馈与重复点击保护。调度器SKIPPED/WAITING/FAILED结果不再静默丢弃，已知原因映射为安全中文；未知异常不回显原始详情。manualSourceResume无状态helper保留flush与synced检查，固定用户/设备/session/仓库及scheduler，在等待后重核上下文；界面迟到结果也按操作代次和scope隔离。

手动操作可重验曾404的临时NOT_FOUND缓存，普通自动调度仍节流；显式删除、并发删除及迟到处理fence保持。该资料本地/后端元数据齐备但无job的现场已只读确认；本次是否实际命中过404缓存尚未证实，不能将该候选路径当作唯一根因。无需重传资料或数据库迁移；未改变后端生成/额度。

type-check exit0、相关scheduler/UI测试最终51/51通过；首轮旧静态断言/泛型推断问题及唯一审查发现已修正，同一reviewer差量关闭后B0/I0。未操作GUI、手动触发真实解析或部署。后续23:39:56香港时间的只读本地快照确认该job与source均READY、无错误，证据post-fix-state.txt；这仅确认队列运行结果，未验收GUI或解析内容质量，也不能证明本次历史404候选根因。基线、逐轮验证与审查见D:/Temp/auralis-desktop-queue-feedback-20261028/；只读现场见D:/Temp/auralis-pre-generation-stall-20261028/。

### 2026-10-28 Overview 模型响应自动重试（源码候选，未部署）

新增AURALIS_AI_OVERVIEW_MAX_RETRIES，默认3表示首次之外最多再试3次（最多4次尝试），0关闭，非负且没有额外固定小上限。.env.example、Spring与Compose已贯通，未改实际.env。覆盖adaptive INDEX/ROUTE/Writer单节与合批/EDIT在模型已返回且网关已结算后的空内容、JSON、字段、Schema、漏节及编辑校验错误；直接重发原stage输入，不重跑已完成检查点，不保存半批。adaptive JSON_REPAIR不另叠加模型调用；普通响应截断沿现有容量拆分。重试次数不进入内容/profile/checkpoint指纹。

网络/连接超时或未知派发不自动重发；预算/额度/限流、取消/中断、总期限、来源变化、租约失效与本地bug不重试。每次真实重发仍走独立invocation/reservation并受现有费用额度约束。阶段重试日志为ADAPTIVE_MODEL_RETRY，带purpose/retryIndex/maxRetries/safeCode，耗尽返回最后具体错误，用户仍可手动断点续跑。

定向146/146（含先前104，不重复计数）、受影响PG十类43/43及TLS3/3通过。唯一full964项0F/90E/2S，90E由PG/TLS参数设置及四个测试文件中的构造器调用导致，分别修正后affected闭合，未重跑full或声称一次全绿。唯一只读审查B0/I0；未部署、未调用真实模型或做GUI验收，未操作业务库/清缓存。证据D:/Temp/auralis-overview-auto-retry-20261028/。

### 2026-10-28 Overview 相邻小节合批写作（源码候选，未部署）

路由提示明确相关主题可合成教学小节，并保留主题唯一分配提醒。Writer可将同源、同章、按目录连续且共享精确原文范围的待写小节合为一次请求；共享原文去重，各节题目、主题与来源独立绑定，成稿按原目录回填。批次大小由完整请求和多节输出预留动态判断，没有固定节数帽。已验证单节保留并跳过，容量拆分parts不跨节合批；合批一个执行节点，完整响应验证成功才保存整批检查点，重试恢复整批，不保存半批。

单节现行操作保持；多节私有操作为write_adjacent_sections_v1，模型仅回sectionIndex与detailedContent，来源/主题由程序回填。未改PC、公开API、数据库结构、额度或执行fence。定向169项在修正构建产物/注解错误后通过；随后审查及新增恢复用例暴露的顶层operation识别和单节manifest误入问题已最小修正，最终受影响Adaptive83/83通过，同一只读reviewer差量关闭后B0/I0。不是一次全绿；未跑全量、部署或真实模型生成，实际输出质量/用量节省未验收。证据D:/Temp/auralis-coalesced-writer-20261028/。

### 2026-10-28 模板与历史文档继续整理

已移除 Vite 示例组件及专用素材、空壳规范入口；2026-08-16 综合审计和两份文档明确标注的阶段历史区已归档。当前接续快照、范围基线、风险表和验收边界保持原文；旧审计的现行引用已更新。备份、变更清单和验证记录见 `D:/Temp/auralis-project-cleanup-20261028-round2/`。

### 2026-10-28 项目残留与文档整理

已备份后移出 31 个未跟踪的 PC JavaScript 编译输出、1 个临时路径文件，并移除空的 `Server/` 目录树；对应 TypeScript/Vue 源码保留。2026-07-10 文档重构执行计划按工作树原文归档到 `docs/archive/maintenance/`，同步文档入口、文档验收清单与 PC README。备份、逐文件 hash 清单与本轮验证记录位于 `D:/Temp/auralis-project-cleanup-20261028/`；本次未操作业务数据、配置、部署或真实 Provider，既有业务验收边界保持。

### 2026-10-28 Overview 按来源路由与遗漏补回（源码候选）

针对8份无关资料的174主题路由只引用89个ID、在Writer前终止的问题，改为按最早BODY原文来源分域路由，源内沿原章顺序聚合；整源能放下则一次请求，超容量才按现有动态规则拆分。跨源主题只归一个域但保留所有原始引用。ROUTE解析接受非空合法子集，未知/重复ID仍拒收；程序将连续遗漏按原章、原序及完整Writer请求容量成组补入，最后校验完整唯一覆盖。无需额外模型修复，也不新增固定主题数或节数上限。背景/导航过滤、Writer证据及重试/费用语义保持。

集中定向首轮Adaptive77项5F/4E，旧跨源fixture与prompt断言更新后的首次受影响复验77项仍有1F，最终含补回原序回归的Adaptive78/78通过；DynamicBudget17/17、Recovery23/23通过。未运行全量测试、部署、业务库/缓存操作或真实模型生成。唯一只读审查的顺序问题已修正，同一reviewer差量关闭后最终B0/I0/O0，审查结论见D:/Temp/auralis-local-route-20261028/review.md；本轮命令与证据位于同目录。实际生成质量与耗时待部署后验收。

### 2026-10-27 香港23:05 重试候选已部署

按用户授权，以现有基础Compose及overview-trace overlay构建并recreate backend/frontend，均exit0。启动时Flyway验证41个迁移，数据库已为V41，本次无需重复执行迁移。backend healthy、readiness HTTP200，frontend HTTP200；db/MinIO容器ID及挂载前后相同。backend镜像abe74be55083…，frontend2321333dfca5…。未清缓存、未调用真实模型，重试业务效果待用户使用验收。日志：D:/Temp/auralis-overview-retry-deploy-20261027/。

- 2026-10-27 PC Timeline 拖放排期不再等待远端 push：插入、顺延和换位完成本地原子提交与投影刷新后即释放 Store 写队列，后台调度同步；本地提交错误仍即时提示，后台服务拒绝继续由排期同步通知反馈。拖到任务自身主体时也会清理拖拽状态。两个定向 PC 套件 92/92、`npm.cmd run type-check` 通过；真实 Tauri/浏览器拖放与弱网 GUI 尚未验收。

- 2026-10-27 Overview独立执行重试源码及门禁完成，未部署：direct失败重放终态、新request对FAILED/过期建新代新budget、显式retryOfRequestId父围栏与单后继、祖先已验证INDEX/目录/Writer复用、旧费用保留；durable job原路径与PC编辑保护保持。V41和API/两端schema已同步，PC索引限当前service会话。定向162/162及最终donor差量复验通过；OpenAPI15/15、PC84/84/type/build、skipTests package通过；唯一review B0/I0/O0。唯一full950为1F/55E/2S，53项PG setup错误、2项快照资源错误及旧latest版本断言经修正后affected51项50通过/1旧版本断言失败，再该方法1/1闭合；未重跑或声称full一次全绿。仅任务测试PG已移除，无业务DB/缓存/Provider/GUI操作。PC精确开工baseline缺失，已按10/26验过的候选做限定历史diff及当前逻辑审查。证据D:/Temp/auralis-overview-retry-impl-20261027/，见[实施计划](../plans/2026-10-27-overview-explicit-retry.md)。

- 2026-10-27 ALL导读提示已补充各字段内容职责：概览覆盖范围/章间联系、核心要点按章解释、学习路径使用实际标题及承接目标。只补现有EDIT导读段并更新既有测试，schema/no-op/流程/预算/前端保持；不设固定篇幅或新增模型调用。prompt-contract1/1通过，未部署或真实生成验证，已有总结未改写。证据 `D:/Temp/auralis-guide-prompt-enrich-20261027/`。

- 2026-10-27 INDEX空summary规范化源码修复：索引严格读树后仅将缺失根summary补为null，使角色解析和通用投影口径一致；显式值及其它结构/角色/授权校验保持，主响应与现有格式修复共用入口。隔离编译及Adaptive76/76通过，两个目标文件核对基线后回写并与候选hash一致；未部署、未操作业务缓存/数据库或真实模型。证据 `D:/Temp/auralis-index-summary-normalize-20261027/`。

- 2026-10-27 Writer JSON清理已替换短尾缀白名单：正常stop的完整首根对象可去外围杂字符后严格校验，保留JSON内部文本、结构/重复字段/截断拒收，连续第二根不静默丢弃。Adaptive74项73通过及旧断言单项1/1；review发现的连续第二根漏检修正后Writer单项1/1，未部署或真实重试。证据 `D:/Temp/auralis-writer-json-clean-20261027/`。

- 2026-10-27 按用户授权且不备份，已事务清理阻塞Subject新请求的FAILED generation `7685daa5-a125-4ff5-a175-b21bd4116edb`及177检查点、3请求映射、1计划、126节点、58执行调用关联、62私有invocation。COMMIT exit0；22正式结果、25回执、7份Subject源资料、771用量记录及其它24个generation完整行hash保持。297243已计Token未删除或归零。旧7个DB/缓存备份删除操作被自动策略拒绝，未删除；未部署或触发模型。证据 `D:/Temp/auralis-failed-cache-clean-20261027/`。

- 2026-10-27 主题聚合提示词已精简：INDEX核心议题内聚，ROUTE明确多主题组成教学小节，Writer专注本批原文；COMMON/字段说明精简重复防御表述，保留材料边界和输出契约。仅ROUTE省略Advisory输出Token建议，实际容量和费用计算保持。未增加固定小节数、合并算法、并发或修复调用。隔离首轮合计91项85P/5F/1E（Adaptive74项68P/5F/1E，Boundary17/17），旧断言/夹具修正后受影响6项5P/1F，再单项1/1闭合；未重跑full。此前合计91误记为Adaptive91，已依据原日志纠正。未部署/清缓存/调用模型，不改变既有运行任务。证据 `D:/Temp/auralis-cohesive-prompts-20261027/`。

- 2026-10-27 EDIT空补丁源码修复：合法身份/hash的无编辑条目按no-op处理，原文保持并正常接收Guide；未知/重复/stale及实际编辑校验保留。提示词明确无修改分段省略、无编辑返回两个空数组。隔离定向18/18通过（BoundaryEditor17、prompt1），未跑full、未部署/清缓存/调用模型。本机10:39真实失败为14个Writer完成后EDIT返回空补丁触发拒收；容器镜像已不同于10月26记录，当前运行算法版本未核实，不沿用历史镜像判断。诊断证据 `D:/Temp/auralis-log-check-20261027/run-01/report.md`，修复证据 `D:/Temp/auralis-empty-edit-fix-20261027/`。

- 2026-10-27 原章顺序候选实现：算法overview-adaptive-v11-source-chapter-order，INDEX可选显式章头随私有checkpoint v3保存/恢复；程序以(unit位置,topic输出序)双键跨批顺延、跨Source重置，前置BODY进入导论。固定章容器、章内自由整理，跨章混装自动拆回，未识别原章则按首次BODY位置排章。仅Service和Adaptive测试两处源码差量，无公开API/DB schema/前端变更。编译通过；首轮119项6失败后分批affected闭合，同unit新增实际逻辑问题修正并定向通过；Recovery30/30、Budget17/17及跨JVM首轮通过，未重跑full。唯一只读审查B0/I0/O0，两项IMPORTANT修正后4/4通过并由同一reviewer差量关闭；未部署、未调用真实模型/业务库或清缓存，当前Docker仍为10月26日已部署动态容量版本。实际章识别准确性及章内重复仍待材料验收。计划[原章顺序](../plans/2026-10-27-overview-original-chapter-order.md)，证据D:/Temp/auralis-overview-chapter-order-20261026/。

- 2026-10-26 香港22:42 Overview动态容量已按用户授权部署到本机Docker，并按用户选择清理全部6条FAILED生成缓存。backend镜像6256eee9…、frontend镜像28f9ff68…；readiness/前端入口与bundle HTTP200，运行JAR六个关键class与已验候选6/6一致，Flyway39→40成功。26项MAX配置均0、calls0，taskToken524288及既有窗口额度保持。清理6代、257检查点、19请求映射、134私有invocation、36执行调用关联、75节点及1计划；22SUCCESS、22正式结果、25receipts、原资料与675费用记录，12组计数/hash均保持。db/MinIO恢复启动且原容器/镜像/卷身份不变。D盘全库及定向缓存备份已留存；启动后无新增Provider派发记录。部署/HTTP/版本核对完成，真实生成、GUI和内容质量未验收。证据D:/Temp/auralis-overview-deploy-20261026/deploy-verification.md；此前“未部署”为实现阶段历史。

- 2026-10-26 Overview 动态容量与链路简化：当前候选算法 `overview-adaptive-v10-dynamic-capacity-writer-body`。26 项 Overview MAX 环境配置默认 0，正数额外限幅；按完整请求、模型 context/output 与预留动态判断，调用次数默认 0，财务额度不改。删多层 Metadata 与 Writer 回声成功条件，程序绑定来源；中间 topic/unit aliases 与最终真实来源数量分开校验。V40 放宽存储容量、标题改 TEXT，PC 接收不复刻固定帽。编译、隔离 PG 43/43、受影响检查 44/44、OpenAPI 15/15/SDK compare、package、Compose config、PC type-check 与接收 80/80 通过。唯一 full 933 项为 4F/54E/7S，归因后定向闭合，未重跑/未声称 full 全绿；七项条件性跳过见 handoff。唯一只读审查 B0/I0/O0。未部署、未读写或迁移业务库、未调用真实模型；内容遗漏、成本和 GUI 待验收。既有 dirty 改动保留；较早条目为各阶段历史，当前以[本轮计划](../plans/2026-10-26-overview-dynamic-capacity-and-simplification.md)为准，证据 D:/Temp/auralis-overview-dynamic-capacity-20261026/。

- 2026-10-26 Overview阅读区与EDIT输入收敛：算法overview-adaptive-v10-body-reading-boundary-view。NAV不再直接装配原文阅读小节，仅保留轻量主题供结构与Guide参考；空章级联清理，provenance依最终章节重排；无BODY写作组明确失败，不进EDIT。EDIT使用实际标题/小标题和去重首尾块的promptView，完整Snapshot及patch/cache校验留在程序侧，字面术语替换仍按完整正文原规则应用。Writer单批/多批统一仅依本批原文展开；INDEX提示尽量覆盖实质主题，Java合法子集校验保持。fresh compile通过；首轮124项122通过/2文案或fixture失败，仅2项复验2/2，不能称一次全绿；BoundaryEditor15/15、隔离PG Recovery30/30、AiSchema3/3首轮通过。唯一只读审查B0/I0/O0。未跑package/full、未部署/真实模型或质量验收。证据D:/Temp/auralis-overview-reading-edit-20261026/，范围见[实施计划](../plans/2026-10-25-overview-boundary-edit-quality.md)。

- 2026-10-26 Overview索引契约与提示词减量：当前算法overview-adaptive-v10-selected-index-local-writer-ranges。INDEX接受授权单元的非空合法子集，删除原文单元覆盖补齐调用；总览不承诺原文无损替代，原资料保留。主响应与既有JSON修复共同严格检查结构、summary=null、角色与授权引用，不再通用解析假成功。结构阶段instruction为空，Writer/EDIT保留受阶段约束的用户偏好；Writer范围元数据移出prompt并由既有批次对象/manifest在程序侧绑定和恢复。Service最终净减少73行。编译通过；初轮108项103通过/5断言失败，随后4个Adaptive和1个Recovery方法分别复验通过，不合称一次全绿；审查差量8/8，同一reviewer关闭IMPORTANT后最终B0/I0。Recovery使用隔离PostgreSQL，本轮未跑package/full、未部署或调用真实模型。准确命令、最终hash与唯一审查见D:/Temp/auralis-overview-contract-trim-20261026/，范围见[实施计划](../plans/2026-10-25-overview-boundary-edit-quality.md)。

- 2026-10-26 Overview 内容质量工程候选已实现：独立分批索引/写作、逐主题来源BODY/NAVIGATION/BACKGROUND用途、章节预告排除教学覆盖、导航去重直接装配、背景默认过滤，以及一次ADAPTIVE_EDIT边界补丁＋ALL导读。公开响应、PC接收保存入口与原资料保持；原Writer checkpoint保留。新增MiMo显式候选估算profile，默认legacy-bytes不变。干净javac编译、审查前Adaptive/Schema 79/79、Java trace 1/1通过；受限后端821项为0F/2E/2S，两处TLS参数错误随后affected-only 3/3关闭，不称全量全绿。唯一审查的两项IMPORTANT最小修复后，Adaptive/BoundaryEditor/Schema 91/91及package通过，同一reviewer差量确认最终B0/I0。Docker引擎未运行，17个PG/MinIO类未验证；未部署、未调用真实Provider、未做GUI/内容质量验收。计划：[独立分段与边界编辑](../plans/2026-10-25-overview-boundary-edit-quality.md)；证据 `D:/Temp/auralis-overview-boundary-edit-20261025/gate/summary.md`、`review.md`。

- 2026-10-25 Overview 生成响应与正式结果 provenance 已在 PC 类型边界分开：SSE 原始输入 refs 可经现有本地 `outlineProvenanceInput` 保存并进入正式 PUT；formal GET/PUT 仍要求 canonical view。补齐 Java UUID nil 值接受，并将 canonical per-section refs 上限对齐后端 500；PC `vue-tsc -b` 通过，`r4-overview-generation.test.mjs` 79/79 通过，覆盖 nil UUID、无效 UUID、101 接受及 501 拒绝。此前对真实成功数据库 payload 的 owner/generation scoped read-only 验证接受 23 章/87 节/111 refs，canonical validator 拒绝同一 provenance；后续限值与 UUID 修正均为扩展接受范围。payload SHA-256 `1aee4757e1e7873858c389eb92c85477c8b326c60460f0adf4075175f6338249`，无正文输出。命令与摘要、私有 payload 和源码 hash 见 `D:/Temp/auralis-overview-contract-alignment-20261025/`。唯一 Luna 只读审查最终 BLOCKER 0 / IMPORTANT 0，两项契约边界发现已关闭；报告 D:/Temp/auralis-overview-contract-alignment-20261025/review.md。未做 GUI/正式结果业务写入验收或部署；Tauri HMR/重启后仍需用户重试接收。

- 2026-10-25 Adaptive GUIDE 动态输入容量（源码候选；定向验证通过，未部署）：完整与 excerptless 紧凑 GUIDE 使用 Gateway 相同 profile 对序列化 system/user 消息估算输入，并按现有 FINAL 输出 reserve、已知模型 context 与平台任务剩余 charged+reserved 选择候选。有效 GUIDE checkpoint 先于新调用 quota 筛选复用；只允许 `ADAPTIVE_GUIDE` 越过通用 12,000 字符 prompt 门限，其余 purpose 不变。任务余额不足仍为 `AI_TASK_BUDGET_EXCEEDED`，不会转为 prompt-capacity error；BYOK 不走平台配额门禁。新增 GUIDE focused cases 3/3 通过，唯一只读 review BLOCKER 0 / IMPORTANT 0（主代理报告）；证据 `D:/Temp/auralis-guide-dynamic-capacity-20261025/candidate/guide-focused-final.log` 与 `candidate-source-hashes.csv`。未部署、未连接业务数据库或真实 Provider，真实 GUIDE 业务验收未完成。

- 2026-10-25 Overview prompt 嵌套对象稳定序列化（源码候选；定向验证通过，未部署）：Service 中 5 个会进入提示词 JSON 的嵌套对象改用显式 `LinkedHashMap` 顺序，字段和值不变；没有修改 checkpoint 哈希公式或 API/数据库结构。离线 trace 显示旧 INDEX 首批 key order 为 `sourceTitle,text`，最新重跑为相反顺序；旧运行的 `materials`、`priorIndexContext` 次序七批一致。Writer trace 有 67 次请求、66 次验证输出；probe 对象顺序与本次固定序一致，trace 中 sibling bounds 均为空。自动验证分批报告：首轮 Adaptive 类中原有的 66 项通过；另一次仅运行新的跨 JVM 方法，1/1 通过，两个独立子 JVM 对固定输入产生相同的 INDEX/Writer/Guide 提示词 hash 与 checkpoint step，并检查非空及空的 INDEX context 与非空 sibling 对象。中间出现的子进程输出过滤和 fixture 问题均已修正；没有把这两批合并为一次 67/67。最终证据 `D:/Temp/auralis-cache-order-fix-20261025/main-cross-jvm-final.log` 与 `main-final-candidate-hashes.csv`。唯一只读 review BLOCKER 0 / IMPORTANT 0（主代理报告）。当前数据库 cache replay 未执行；未连接业务 DB、调用真实 Provider、清理缓存或部署。

- 2026-10-25 Overview `ADAPTIVE_WRITE` 正常 `finishReason=stop` 下的尾随 ASCII identifier 窄恢复已完成定向验证：fresh D 盘候选强制 clean 编译 379 个 production sources；`OverviewAdaptiveGenerationTests` 66/66、`AiProviderResilienceTests` 10/10，Maven exit 0。回归覆盖 CJK/emoji、转义引号与括号内容、重复键、截断、额外 token、schema/alias 失败及非 writer 范围；Provider wire 测试检查 4608/4675/6144 三种 max_tokens 的实际序列化 `response_format=json_object`。证据 `D:/Temp/auralis-writer-tail-fix-20261025/candidate-run2/`，源码/测试 SHA-256 对照 `candidate-run2-hashes.csv`。仅 Provider 替身，未连接业务 DB、未调用真实 Provider/缓存或部署；唯一 Luna 只读审查已完成，BLOCKER 0 / IMPORTANT 0；报告 D:/Temp/auralis-writer-tail-fix-20261025/review.md。
- 2026-10-25 Overview adaptive writer trim/hash mismatch 修复已完成源码与定向验证：新 writer/composite output 在持久化前规范化；restore 先核验原始 payload/hash 与 provenance，再保留存储表示。匹配当前源 hash 的完整 Adaptive 类为 64/65；唯一失败是初始合成旧 payload 加空白后超过既有 4,000 字符上限。修正 fixture 后，affected-only 用例 1/1 通过，验证旧 raw payload、章节拆分、proof hash、code whitespace、tamper rejection，以及 restore 阶段只发出预期的 guide 请求而不重跑 writer。无 API/DB schema 变化；D 盘隔离候选编译 379 production/147 test sources。未触碰真实缓存、业务 DB、真实 Provider 或部署；主 Agent只读审查待完成。

- 2026-10-25 香港12:53，按用户明确要求备份后清理当前 Source 失败任务 b2915c48-e400-4f24-8b0d-44517c3ad03f 的恢复缓存：事务删除1个FAILED generation、63 checkpoints、4 request mappings、31 private invocations及1个执行计划/92节点/14调用关联。无在途reservation、关联job或publication；31条用量账本、charged142333、Source与正式结果行哈希保持。证据 D:/Temp/auralis-overview-cache-reset-20261025-125325/。后续重试从头生成；此次清理不修复重启后writer请求/计划指纹不匹配的疑点，不声称Map.of顺序为已证实根因。未改代码/配置/前端、未部署或调用Provider。

更新时间：2026-10-25
文档状态：现行状态快照
权威范围：当前代码存在情况、本轮命令证据、人工验收边界与下一步
事实来源：模块/契约文档、当前代码盘点、部署测试前主任务清单与本轮验证命令

## 当前接续快照（2026-10-25）
- 2026-10-25 Overview direct Source/Subject adaptive retry 已增加窄恢复例外：唯一精确 writer 关联、已结算 FAILED、已派发且缺 actual usage，并且 charged 覆盖完整输入估算与输出预留时，允许下一次用户请求重试该节点；旧未知 reservation 保留，旧 verified checkpoints、generation 与 budget root 复用，新调用经原 Guard 单独计量。非 writer、RESERVED/EXPIRED、账务不足/身份错配、无效 checkpoint 与第二个未知 writer 调用仍 hold；durable-job gate 不变。D 盘候选 `OverviewGenerationServiceRecoveryTests` 30/30、journal PG 8/8、invocation journal 2/2，共40/40、Maven exit 0。仅 Provider 替身和隔离 PostgreSQL，未改业务 DB、未部署、未调用真实 Provider/GUI；候选与测试证据 `D:/Temp/auralis-resume-unknown-20261025/`。
- 2026-10-25 源码候选修复 Overview metadata 的 91→91 低效分层：metadata prompt 要求相关条目归并到更少 sections；每层先允许 route 在条目数未减少时成功，若 route 仍不适配且 section 数未下降则立即进入既有 bucket fallback。Chat retrieval excerpt 使用转义后的闭合 untrusted wrapper，system 指令声明 excerpt 是数据且 source/chunk UUID 属内部 metadata；Provider connection probe 使用 32 output tokens。Focused batch 88 tests 中 87 passed/1 stale assertion failure；修正旧 large fixture 的路由断言后该 affected method 1/1 通过，累计定向证据 88/88，分批完成而非一次全绿。未部署、未调用真实 Provider，真实注入行为与业务验收未完成。
- 2026-10-25 follow-up 修正 selected-text prompt preflight 的预算边界：检索发生前只计必要的 base/selection instructions、完整 selected text 与当前问题；取得 citations 后，只有在安全指令、selection 和当前问题均可完整保留时才加入检索上下文，紧预算则略去该上下文。`PromptAssemblerTests` 7/7、`AiStreamingTests` 17/17 通过，Maven exit 0；未部署、未调用真实 Provider。
- 2026-10-25 香港11:48，按用户再次明确授权，确认重启前generation `6fc0f27d-1d3a-4aba-a408-b035b98b5e07` 已在旧租约11:45:58到期后转FAILED并因未知派发触发恢复保护；备份后锁定事务清除1个FAILED generation、36 checkpoints、3 request mappings及30 private invocations。30条ledger（包括1条lease已过期但尚未结算的RESERVED记录）、charged132004、Source及正式结果哈希均保持；只将state=RESERVED且lease仍有效视为在途，未删除/修改账本。证据 `D:/Temp/auralis-overview-cache-reset-20261025-114809/`。从实际运行镜像提取Service.class并用javap确认元数据归并上限4层/64次；当前91→91的低效归并提前退出逻辑尚未修正，清缓存不解决该性能问题。未改代码/配置/前端，未部署或触发Provider。
- 2026-10-25 后续运行态已确认：用户构建的 backend 镜像 `sha256:cf9bc6a9d34722811c0d2ee324546a80fa92ee4826ef00368a6a216a5502263a` 于香港11:14启动并成功应用V39，容器健康。后续任务在约302秒时发生SocketException/客户端Broken pipe；当前PC通过tauri dev启动，PC本地.env.local未设置时限项会回到300秒（根Compose.env不自动传入Vite）。该失败任务留下1次未知派发，11:30两次重试均在派发前报OVERVIEW_RECOVERY_EXHAUSTED，未增加Provider调用。沿用户已授权缓存清理范围，备份并事务删除对应FAILED generation `dddb2dd5-a9b1-47cf-8d39-a9e3c4fd3ac6`、21 checkpoints、3 request mappings、15 private invocations；15条ledger及charged102216、Source与正式结果哈希保持。证据 `D:/Temp/auralis-overview-cache-reset-20261025-113145/`。未修改前端/.env/后端代码、未部署或触发Provider；客户端实际0配置与完整长流程仍待用户重试验收。
- 2026-10-25 本机运行态确认：backend 容器创建于香港时间11:08:54，但仍使用旧镜像 `sha256:5bfca368887e96fe0d3cc64150e616ed6f8b007761049d3faaa194922c293f01`；环境 task timeout=0，旧镜像校验要求>=1000，因而启动失败并持续重启。尚未构建/部署最新0值支持代码。用户授权清理对应失败 generation `946a1d3c-fa12-4849-af72-5ae988f9afac` 的恢复状态：先备份，再在加锁事务内删除1个FAILED generation、23 checkpoints、4 request mappings和17 private invocations；无关联job/publication或在途reservation。17条用量账本、charged 112047、Source及正式结果行哈希均保持。证据 `D:/Temp/auralis-overview-cache-reset-20261025-1111/`。本次未部署、未修改.env/前端、未调用Provider；后续需用户构建新版backend镜像后重试。
- Overview 整任务期限源码与本机配置已完成：`AURALIS_AI_OVERVIEW_TASK_TIMEOUT_MILLIS=0` 关闭 direct JSON/SSE 与新 claim durable job 总期限，`VITE_OVERVIEW_SSE_DEADLINE_MS=0` 关闭 PC 独立 300 秒等待器；本机 `.env` 两项均为 0。V39 允许 RUNNING job 的 `deadline_at=null`，已有正数期限保持不变；单次 Provider response 默认 120000ms、取消/lease/Guard/计量/预算不变。后端定向 195 项和全量 881 项均 0F/0E，全量仅 1 个私有 replay 跳过，package 成功；PC 类型检查、83 项定向测试、生产构建与 Compose quiet 校验通过。PC full R4 为 747 项/719 通过/28 失败，失败均在既有非本任务范围，不记为 full 通过。未部署、未调用真实 Provider，未做超过 300 秒的运行态验收。

- Overview 全链路提示词细化由主 Agent 直接实现，未派子代理：精确键/嵌套/类型与结构示例，按 unit/plan/topic 区分引用授权，writer 的批次/证据职责，独立结构修复及中间/最终恢复契约均已整理；expectedSummary 使用真实 null，writer 去掉无关摘要提示。无 validator 宽松化、字段兼容映射或额外 Provider 调用。D 盘隔离候选相关170项最终通过（Adaptive62、Recovery28、AiOverview78+受影响2项复跑），无失败/错误/跳过遗留；不是一次全绿或full suite。静态检查exit 0，主 Agent 审查B0/I0。未跑full/package，未部署/未做真实 Provider 验收；证据 `D:/Temp/auralis-overview-prompts-refined-20261024/`。上一阶段隔离版已由用户部署（香港时间23:09:49，镜像 e074fa…），实测前两批索引通过，第三批因五个 chapter 使用 chapterTitle 而缺少 title 失败。

- Overview 自适应 system prompt 已按阶段隔离源码候选：索引/coverage、metadata、route、metadata-route 均显式要求 outline 且 root `summary=null`；post-writing guide 要求 outline=null，并把 `learningPath` 放在必需的 summary 中；writer 私有 `detailedContent` 合约与非自适应 MAP/REDUCE/SUMMARY 旧模式不变。自适应 JSON repair 使用阶段结构与 alias 白名单，不继承公共 ALL 或主请求材料指令；索引专用 repair 保留。新提示的 system-text hash 参与原 checkpoint step 计算，旧 prompt checkpoint 会自然 miss；未清缓存、不升级全局算法版本。D 盘 fresh candidate 首轮编译 379 个生产与 145 个测试源码；最终 `OverviewAdaptiveGenerationTests` 59/59、`AiOverviewServiceTests` 80/80、`OverviewGenerationServiceRecoveryTests` 28/28 通过。首轮新增用例中两处 fixture/断言问题已修正，只重跑受影响 Adaptive 类。Recovery 类执行时启动 Testcontainers 临时 PostgreSQL fixture，未连接业务库；未运行 full suite/package。本机 22:46:29 已部署含 thinking 配置的后端镜像 `sha256:5f65ebbd89c097092109fde92067a6c4975deb808e5f6d904c9d4a92204d487c`，`THINKING_ENABLED=false`；该镜像不含本轮阶段提示词候选。本轮 prompt 候选未部署、未调用真实 Provider，模型实际输出结构仍待验收。日志：`D:/Temp/auralis-stage-prompts-20261024/`。

- 全局 Provider thinking 配置 `AURALIS_AI_THINKING_ENABLED` 默认关闭，DeepSeek 和精确官方 MiMo endpoint 的 complete/stream 请求按配置显式发送 thinking 类型；其余兼容 endpoint 不注入专有字段。本机 `.env` 为 `false`，本机后端含该配置的镜像已于 22:46 部署。D 盘候选 full backend 144 suites / 868 tests，0 failure / 0 error / 1 个 private trace replay assumption skip；package 成功，均 exit 0。唯一 skip 因未提供私有 replay 目录。候选源码 hash 与工作树匹配。该开关不能承诺关闭未知代理或模型内部 reasoner。日志、候选与哈希见 `D:/Temp/auralis-thinking-env-20261024/`。

- ADAPTIVE_INDEX 首根重复字段检测问题已最小修复：局部严格 reader 同时创建并读取 parser，避免向外部 parser 传递 reader 配置不生效而静默覆盖重复 outline/嵌套字段；全局 Mapper、其它 purpose、提示词和 checkpoint 身份不变。新增服务级回归检查根对象和嵌套 section 的重复字段均拒绝、只派发一次且不写 checkpoint。D 盘全新候选 javac 编译 379 个生产源码与 144 个测试源码，`OverviewAdaptiveGenerationTests` 58/58、0 failure/error/skip、exit 0；工作树与候选两项源码 SHA-256 一致。本轮由主 Agent 直接修复与验证，未追加子代理审查、未运行全量/PostgreSQL/package、未部署或调用真实 Provider。证据：`D:/Temp/auralis-index-json-strict-parser-fix-20261024/`。

- ADAPTIVE_INDEX 根外 summary 窄修复源码与合成定向用例已完成。独立 reviewer 首轮发现 Validator 重复四参数签名的 BLOCKER，此前增量编译及 165/165 不作为当前源码证据；最小重命名私有 alias-policy helper 后，`./mvnw.cmd -B -ntp -DskipTests clean compile` 强制编译 379 个源码文件、exit 0，指定三类测试实际编译 144 个测试源码并最终 165/165（Adaptive 57、AiOverview 80、Recovery 28），0 failure/error/skip、exit 0，follow-up review 为 B0/I0/O0。执行阶段较早失败还包括首根 trailing-token 边界和双 checkpoint 测试夹具计数，均已归因修正。仅首次正常 `readTree` 失败后，独立显式开关才允许把无 summary 的首个 object 与严格单字段 summary 后缀合并；局部严格重复字段/尾部检查后仍重走 schema、summary shape、alias、coverage/mode/shape 和规范化。Service 仅对 ADAPTIVE_INDEX 主响应与 JSON repair 开启；其它 purpose 不变，`overviewOutputRecoveryEnabled` 的 Provider recovery 语义不变。专用 repair 不再拼接公共 ALL/materials 指令，主索引 prompt、请求数据、算法与 checkpoint key 不变；结构成功保存 primary checkpoint且不新增调用，trace 原响应/validated output 保持分离。历史失败 trace 不作为 checkpoint。无 API/DB 变化；未运行全量/PostgreSQL，未部署、未调用真实 Provider，旧失败批部署后通常需重新发主请求，真实业务验收未完成。

- Overview 阶段 3–7 源码已完成：stage1/2 保持冻结；v9 topic catalog、目录容量估算/分桶、私有 writer DTO、结构分段、bounded recovery、post-writing guide 与 preview fragments 已接线。隔离候选用 javac 编译；Adaptive 48/48、Recovery 28/28、Preview PostgreSQL 10/10、Formatter 9/9 通过，末次两个受影响 Adaptive 方法 2/2、package、OpenAPI artifact 与 PC type-check 通过。Mobile type-check 仍因 `reviewApi.ts` 引用 OpenAPI 明确不提供的 `EventRequest/EventResponse` 失败；未改 Mobile service。原工作树 full 是失败批次（855 tests, 6 failures, 29 errors, 1 skipped），其中 `java.lang.Error: Unresolved compilation problem: Unreachable code` 来自旧 IDE 生成产物；隔离候选未重跑 full。未部署或调用真实 Provider。唯一只读 review 为 B0/I0/O0，三项行为发现已修复并复核关闭。详见 [阶段 3–7 计划](../plans/2026-10-24-overview-routing-writing-completion.md) 与 D 盘证据 `D:/Temp/auralis-overview-stages3-7-20261024/`。

- Overview 阶段二轻量索引候选已完成源码：索引提示强化主要/次生概念、条件例外和粒度约束；第二批起携带最近 6 个 section 的有界只读术语/层级元数据，不含 alias，实际容量不足时省略旧条目；无占位上下文缓存预检，每批按真实请求查询 checkpoint 并在派发前检查预算。未知、重复、空引用或漏绑 alias 可在 recovery 开关下每批触发一次独立 `ADAPTIVE_INDEX_COVERAGE` 纠偏，纠偏经现有计量/checkpoint 链路且结果必须重新通过完整 coverage 与内部 shape 校验；主索引/batch checkpoint 只保存纠偏后结果。算法版本升为 `overview-adaptive-v8-index-coverage-continuity`。公开 API/schema/DB 与阶段 3–7 未改。定向 192/192、Maven exit 0，修复复审 B0/I0/O1；O1 为动作格式缺少直接回归断言，随后已用 test-only 断言验证生产生成方法的固定前缀、47 字符和 coordinator 字符集，`OverviewAdaptiveGenerationTests` 48/48、Maven exit 0。未运行全量/PostgreSQL、未部署、未调用真实 Provider，真实知识覆盖、粒度与术语质量仍未验收。

- Overview 阶段一原文准备候选已完成源码：ingestion 与自适应索引二次拆分保护容量内 Markdown 结构、段落/句子边界和 Unicode，writer 分组拆分保持原实现；相邻 overlap 经区间及文本双重校验后裁剪并修正 `charStart`；仅整段明确页码不进入 unit 编号；同 Source/revision 的索引批边界增加每侧最多 240 字符的无 alias 只读上下文。算法版本已升级以隔离旧 checkpoint，公开 API/DB 和阶段 2–7 未改。`AiIngestionTests,AiSourceChunkTests,SourceChunkProvenanceTests,OverviewAdaptiveGenerationTests,AiQualityFixtureContractTests` 定向 61/61、Maven exit 0，唯一只读审查 B0/I0/O0；未运行全量/PostgreSQL，未部署、未调用真实 Provider，语义连续性及正文质量仍未验收。

- 第三步当前本机状态：离线 gate PASS，相关测试 43/43、package 成功，唯一 reviewer B0/I0/O0；backend 镜像 `sha256:72f6a41df02f8497fe32d2d0c3cbb18580ed2671b1c233ec9b41a95f658cc49d` 已部署且 healthy/readiness UP，有效模式 `calibrated-category`。基础默认仍 legacy，db/MinIO/frontend 身份未变；未主动调用真实 Provider，正文实际 usage 与内容质量等待用户从原 UI 实测。部署证据见 `D:/Temp/auralis-budget-step3-20261024/deployment/`。完整 full stdout 曾被覆盖，当前保留日志不能冒充当次 836/837 原始记录；相关专项、replay、package 记录仍可复核，详见 `final-handoff.md`。

- Overview 预算第四步在现有 `AI_TASK_BUDGET_EXCEEDED` 路径内保留 generation、budgetTaskId、已验证 checkpoint 和 charged ledger；同一预算根可在额度恢复后继续。预算日志现关联 generation/budgetTaskId，并区分 task charged（实际或保守估算）、在途 reserved、配置余额、verified/remaining writer、单次 reserve 与 aggregate upper forecast。BYOK 保留实际计量和 forecast，不按平台 token 余额拒绝。第三步统一输入 estimator 已接入 Overview context fit/preflight 与 Gateway reservation，默认仍为 `legacy-bytes`。离线 Java replay：6 runs / 40 calls / 34 unique system-user pairs；目标 run 11 calls / 11 distinct，25个支持形态 complete-usage unique pair 零低估，最低 coverage 322.86%，旧 bytes reservation 总量减少16.77%，gate PASS 仅代表当前trace形态。trace run outcomes均FAILED且没有writer样本。Maven full 为837 tests / 836 pass / 1 replay-test harness error；null-safe 修复和 usage parser 门禁后相关定向批次43/43通过，opt-in replay 写出脱敏 JSON 且断言 gate PASS，`-DskipTests package`通过。 sole review B0/I0/O0 已完成，本机候选已部署；真实 Provider/业务验收待用户进行；不宣称通用校准。报告与日志见 `D:/Temp/auralis-budget-step3-20261024/`。
- service-level PostgreSQL adaptive writer stop / adjusted-budget resume / checkpoint reuse 用例通过：拒绝发生于 Guard reserve，未增加 Provider 派发；提高测试配置后沿用同一 generation/budgetTaskId，只派发剩余 writer，并保留已结算 charged。集中批次为 137/138（唯一失败为该新增用例的 fixture 断言，未将整批记为全绿）；修正后 affected-only PostgreSQL 用例 1/1、Maven exit 0。完整命令与日志见 `D:/Temp/auralis-budget-step4-20261024/`。fixture 将模拟账本和 service/Guard 配置同步调整；实际环境需以统一的新配置重启后续跑。未部署、未调用真实 Provider、未做前端或 GUI 验收。
- sole review 后将 writer-progress、全 checkpoint 命中预算快照和 RESUME 附加 usage 查询/记录改为局部 fail-open 诊断；业务 preflight、Provider 派发前预算评估与 STOP/COMPLETE 持久化所需 ledger 读取保持原语义。故障注入验证：stop/resume 方法在组合 affected-only 运行中通过；writer-progress 诊断异常后生成终态为 `SUCCESS`，重复 request-id replay 且无新增 Provider 调用，affected-only 1/1、Maven exit 0。组合运行另一个测试在夹具终态字符串断言处失败，纠正后新方法单独通过；没有重跑 137 项批次。命令和原始日志见 `D:/Temp/auralis-budget-step4-20261024/`；同一 reviewer 修复复审已完成，BLOCKER=0 / IMPORTANT=0，原 OPTIONAL 1 保留；证据 D:/Temp/auralis-budget-step4-20261024/review-final.md。

- 香港 23:27 的真实重试完成索引、元数据与目录路由后，写入预检报告还需54次调用、任务只余35次（64次配置，历史及本轮合计已记29次），因 `AI_TASK_BUDGET_EXCEEDED` 失败，正文未开始。用户要求本机观测期间取消 Overview 次数预算并记录实际用量；源码支持 `overviewMaxCalls=0`，trace overlay 设0，默认24和 Token/窗口额度不变。定向 54/54、package exit 0；full 829 项为 1F/46E/5S（任务专用 PG 测试 URL 缺失、TLS SlowDrip fixture 错误及既有 STAGE_CALLS/TASK_CALLS 断言不符），未记为全绿。仅 backend 已更新至 sha256:1158fd2458a59bc8630f956ba8d91a48f0926f2414ef24df6d2e5460ec4f9665；容器 healthy，运行环境次数值0，readiness HTTP 200。未触发真实 Provider；尚无成功生成或内容质量验收。验证记录在 D:/Temp/auralis-overview-unlimited-calls-20261023/。

- 前一轮后端更新后 readiness UP / Docker healthy；当时 Overview maxCalls=64、追踪开启。镜像 sha256:387a22242bbd1c05240d08940c17fbdf071cf23f66a7643b1d751914437cb7a5。只重建 backend，未触发模型。

- ADAPTIVE_INDEX 冗余 summary 规范化已部署；后端 readiness 返回 HTTP 200。该运行态检查不等于真实 Provider 或内容质量验收。
- ADAPTIVE_INDEX 批次别名修正已部署；Docker backend healthy、readiness HTTP 200，追踪开关与 D 盘 bind mount 已确认。focused 37/37、唯一 runtime review B0/I0。未触发真实 Provider；用户资料生成及内容质量验收仍待进行。
- ADAPTIVE_METADATA summary 规范化已部署；backend healthy、readiness HTTP 200，trace/adaptive flags 与 D 盘 bind 已确认。focused 40/40、sole review B0/I0/O1（O1 为历史登记待 review 字样，保留历史）。未触发 Provider，真实业务验收待用户完成。
- Overview 平台调用策略现将配置的 `overviewMaxCalls` 同时用于总任务与每个 MAP/REDUCE 阶段；默认仍为24次，任务 token 仍为524288。trace overlay 的本机64次配置已准备，定向策略测试见 `D:/Temp/auralis-overview-budget-relax-20261023/validation/`；尚未部署，未调用 Provider 或重置账本。
- Overview tracing 已捕获两次真实生成尝试，两个 run 均为 `FAILED`，采集完整且 `droppedEvents=0`；因此没有成功生成的真实业务证据，M6 尚未验收。
- M5 工程闭环已记录于总计划；M6 真实 Provider/usage 校准、真实资料生成、内容质量及业务验收未完成。详细批次历史保留在下方和链接计划中。

## 阶段历史记录（以下状态为各阶段当时快照，以顶部接续快照为当前事实）

较早阶段记录已移至[历史证据](../archive/stages/2026-10-28-status-stage-records.md)。本页保留当前接续快照、范围基线、风险或验收边界；历史中的命令结果与“未部署”只代表发生时点。

历史记录中尚未取得关闭证据的验收项不因归档而关闭，仍须按[当前问题登记](IssuesAndReview.md)及各模块的验收条件逐项核对；不从归档恢复旧任务或实现。

## 证据规则

- **代码确认**仅说明实现存在。
- **本轮命令**只记录本任务实际执行结果。
- **历史命令**可在 Changelog 追溯，不能当作本轮结果。
- **人工验收**必须单列设备、GUI 或外部服务边界。

## 首个候选版本范围基线（R0-01）

目标端已冻结为 Windows x64 PC Tauri、Mobile H5、微信小程序和 Tablet 主工作区；PC Web 只保留 Tauri 内部开发用途，不作为发布目标。候选主流程为注册登录、资料上传、学习工作区、同步、复习、统计和 AI 对话；Tablet 手写笔记云同步、微信之外的其它小程序平台、旧 Server 数据自动迁移、跨实例事件 Broker、AI 自动执行领域写操作不进入本候选版本。

验收责任按角色分工：产品/业务验收负责范围和用户结果，后端/基础设施负责 API、数据、安全与真实依赖证据，PC/Tauri 与 Mobile/Tablet 负责人负责端侧主流程，QA/发布负责证据汇总和门禁判断。当前仅完成范围基线写入，未因此把任何模块或风险状态改写为“已验收”。详细验收结果见[产品需求](../project/ProductRequirements.md)和[部署测试前主任务清单](../planning/PreDeploymentReadinessTasks.md)。

## 状态总览

2026-09-07 PC 文档处理复核：OCR sidecar 的 PyInstaller 临时目录统一位于应用 cache 下，启动前创建；仅在受管 sidecar 已确认停止时清理该目录直属 `_MEI*` 子目录，并将 TEMP/TMP 注入 sidecar 环境。bounded stderr 继续保留，PyInstaller extraction failure 对外保留稳定 `OCR_SIDECAR_UNAVAILABLE:pyinstaller-extraction-failed` 后缀。PPTX 已使用 OOXML presentation relationships 读取实际 slide 顺序、页数和文本；49 页真实 fixture 与 legacy OLE `.ppt` 拒绝测试通过。Tauri invoke 归一化保留字符串、Error 和结构化 `{message/error/code}` 诊断；Rust PUT 的网络分类补充 client 诊断，`SERVER_VALIDATING/SERVER_INDEXING` 网络失败可进入 `PAUSED_NETWORK`，已有加密 receipt 时恢复不会重新下载/哈希源文件。Docker Desktop 当前 unable to start，真实 Server/MinIO 复验仍阻塞；本轮自动证据与既有失败分开记录。

2026-09-06 PC 文档处理稳定性修复：任务变化通知只刷新本地处理 Store，不再调用 `sourceStore.loadSources()` 形成 `loadSources -> schedule -> onJobChanged` 递归；`UPLOADING -> FAILED_LOCAL` 与 stale `PACKAGING -> FAILED_LOCAL` 已按实际本地失败语义补齐，避免 `DOCUMENT_JOB_ILLEGAL_TRANSITION` 掩盖原始错误。Office bridge 改为先收集锚点再读取 chunks，带文本的 DOCX/PPTX 不再因首次 chunks 为空误入位图 OCR；无可靠 renderer 页数的纯图片 Office 文件明确返回 `DOCUMENT_FILE_TYPE_UNSUPPORTED`，不伪造页数。OCR warmup 使用受控 1×1 PNG 走现有 sidecar 协议，实际初始化模型后才返回 ready；Rust 保留公开 `OCR_SIDECAR_UNAVAILABLE`，并记录受限的启动路径、进程状态及最多 20 行 stderr 诊断。focused Node 42/42、Python sidecar 11/11、Rust OCR 7/7 与 `cargo check --lib` 通过；真实 Tauri + 文件样本 + Server/MinIO GUI 仍待重启验收。

2026-09-06 PC 文档处理竞态修复：PDF.js 本地适配器已通过 Vite `?url` 配置同版本 `pdf.worker.min.mjs`，扫描 PDF 不再因缺少 `GlobalWorkerOptions.workerSrc` 在解析入口失败；`useSourceStore` 自动调度仅接受带非空 `assetId` 和 `ingestionRevision` 的 `AWAITING_CLIENT` Source，避免本地 Source 尚未 push 时请求服务端并被 404 孤儿清理。PDF runtime、Source 注册及相邻文档处理 focused 测试共 70/70 通过；`npm.cmd exec vite build` 通过并实际产出本地 worker。`npm.cmd run type-check` 仍有工作树既有 7 项错误（`useTaskStore.ts` 3 项、`Timeline/index.vue` 4 项），未归因于本轮修复。认证、MinIO 和 API/数据库契约未修改；真实 Tauri/Server/MinIO 处理与 GUI 仍待验收。

 2026-09-05 PC 上传与处理恢复：Tauri `keyring` 3 已显式启用 `windows-native`，继续使用 `auralis/master_key`，不引入明文或环境变量回退；Stats JDBC repository 在参数边界将所有 `Instant` 转为 `java.sql.Timestamp`，不改 SQL/API/schema；PC 上传白名单收敛为 PDF、DOC、DOCX、PPT、PPTX，图片和文本仍保留 File Viewer 预览但 `allowedForUpload=false`，`canPreviewFile()` 与上传能力解耦，并在 upload intent 前给出支持格式提示；Profile 文档处理中心将无本地 job 的 `AWAITING_CLIENT` 显示为等待桌面端开始处理，并分别标注服务端 `VALIDATING/PARSING/INDEXING`，状态映射由纯工具函数承载；`DocumentProcessingDot` 的 Source 文案复用共享映射，未知/undefined phase 使用“等待状态同步”和“处理状态尚未同步，请稍后刷新”，`READY` 显示“处理完成”。新增 Windows-only Rust keyring 跨新 Entry 写入/读取/清理测试；本机 `cargo test` 的真实 Credential Manager 写入因 `NoStorageAccess(Error(1312))` 失败，不能视为持久化已验收。Stats focused 测试覆盖六个查询的全部 `Instant` 参数、UUID 与顺序保留；file-preview 27/27、processing UI 1/1、runtime static 9/9、Stats 3/3、`check:r4-pc`（87 个生产文件）、Cargo check、keyring feature tree 通过。完整 `test:r4-pc` 为 202 项中 196 通过、6 项失败，仍为既有 Timeline 拖放/本地投影/可见负荷和 `Subject.color` 静态契约；`npm.cmd run type-check` 仍为既有 7 项错误。真实 Server/GUI 仍需联调。

2026-09-05 PC 孤儿 Source 调度清理：`SourceJobScheduler` 仅在 `sourceApi.get(sourceId)` 边界识别结构化 `ApiProblemError` 的 HTTP 404 或 `RESOURCE_NOT_FOUND`，命中后复用 owner-scoped `discard(sourceId)` 清理文档任务/加密 cache，并返回稳定的 `SKIPPED/SOURCE_NOT_FOUND`；503/`INTERNAL_ERROR` 等非 404 异常仍原样拒绝并保留任务，后续 parser/upload 异常不使用该分类。TDD focused scheduler 14/14、相邻文档处理套件 35/35 通过，`check:r4-pc` 扫描 87 个生产文件通过，`git diff --check` 通过；`npm run type-check` 退出 1，7 项错误仍位于既有 `useTaskStore.ts`（3 项）和 `Timeline/index.vue`（4 项），未归因于本次 scheduler 改动。开发环境已确认运行进程为仓库 `src-tauri/target/debug/app.exe`，停止对应 Tauri 进程树后，精确删除 `%APPDATA%\com.auralis.app` 下的 `auralis.db`、`auralis.db-wal`、`auralis.db-shm`；未删除目录内其他内容。重启后数据库及完整表集已重新建立，远端同步恢复 48 条资源投影且旧 Source ID 可再次由服务端返回；3 个本地文档任务均因 `Master key not found. Please initialize encryption first.` 进入 `FAILED_LOCAL`。这证明本地数据代际已重建，但重新上传与密钥恢复仍需 GUI/Server 联调。

2026-09-05 PC 文档处理状态机修复：解析器连续产出同一阶段的多个 block/page 时，允许同阶段 transition 用于原子推进 checkpoint；原先第二个 `EXTRACTING`/`OCR_RUNNING` block 会触发 `DOCUMENT_JOB_ILLEGAL_TRANSITION`。新增本地 repository 回归覆盖同阶段 checkpoint 更新。统计接口在当前工作树尚未取得运行中服务的异常堆栈，真实数据库迁移状态仍待核对。

2026-09-04 PC 本地优先同步核心完成代码收口：本地 schema 升至 v6；Subject、Source、KnowledgeBlock、Task 的普通写入先在一个本地提交中保存资源投影和 immutable outbox，随后才更新 UI，并由 500ms 合并的后台 cursor cycle 批量同步。普通 Store 不再调用领域列表 API；服务端响应只结算相同 mutation，同资源存在未解决写入时不会覆盖本地投影，cursor page 只应用每个资源最后一条 change。`r4-local-repository`、`r4-sync`、`r4-register-file` 定向 Node 套件合计 28/28 通过；新增 cursor 合并/墓碑保护回归通过。完整 `test:r4-pc` 为 181/191，10 项失败均在既有 Timeline/排期或 Subject 主题色静态断言；`npm run type-check` 与 build 均被 Timeline 的 3 个 `Subject.color` 类型残留与未使用 `Sparkles` 阻断，未将其写成同步改造错误或通过。Tauri GUI、双设备弱网和冲突可见性尚未验收。

2026-09-04 学科文件删除投影修复：`useSourceStore.deleteSourceFile()` 先持久化 Source tombstone 与 DELETE outbox，再立即从 `sources/activeSourceFiles` 移除；后台同步与 parser/job/cache 清理不再阻塞列表、计数或选中项回退。`r4-file-preview` 删除顺序回归 20/20 通过。真实 Tauri 中 OCR 运行时删除、缓存清理和重新打开学科后的同步仍待 GUI/Server 联调验收；组合运行的 `r4-register-file` 另有两项既有 Task/Subject 静态断言失败，未归因于本次 Source 删除修复。

2026-09-04 PC 单一文件预览收敛：删除旧 `PdfViewer.vue`、首页 PDF 伴读标签及入口、组件声明和专用回归；资产库真实 Source 文件改由 `FilePreview` 统一预览，并从 TreeNode 保留 `id`、`assetId`、`name` 与 `fileType`。资产库不可达的 `selected.markdown` 与 `filePath` 预览分支已删除，知识块与任务编辑保持不变。新增预览回归先失败后通过，`r4-file-preview` 24/24 通过，生产路径的 `PdfViewer`/`convertFileSrc` 扫描为空且 `git diff --check` 通过。`npm.cmd run type-check` 与 `npm.cmd run build` 均被既有 `useTaskStore.ts`（3 项）和 Timeline（4 项 `Subject.color`/未使用 `Sparkles`）错误在 `vue-tsc` 阶段阻断，未归因于本次预览迁移；真实 Tauri/浏览器中的大 PDF 与多格式连续切换仍待 GUI 验收。

2026-09-04 PC 已完成排期任务固定：Task 完成后保留原 `scheduledAt` 与时间轴位置，并同时在 Store、Timeline、Dashboard 拦截拖动、替换与取消排期；恢复为未完成后才重新允许调整。新增两项 Node 回归已先失败后通过。后续发现历史本地缓存可能保存展示态 `completed`：按当前工程弃用策略，加载时仅接受 `TODO`、`IN_PROGRESS`、`DONE`、`CANCELLED` 领域 DTO，旧展示态记录不再转换或兼容、会在本地加载时忽略，并由在线刷新按现行契约重建；对应映射与 Store 定向回归通过。`npm run test:r4-pc` 最新结果为 173/181，8 项失败仍是可见负荷、旧拖放/本地优先、到期转换及过去时段契约；本轮已清除 Subject `color` 页面残留，`r4-store-mapping` 10/10 与 `npm run type-check` 通过。真实 Tauri 拖放 GUI 仍待人工验收。

2026-09-03 PC 时间轴任务投影与拖放性能修复：Task Store 的本地 repository scope 已从废弃的 `deviceId` 改为认证态 `serverDeviceId`，避免本地读取抛错后清空 `allTasks`，并把列表远端刷新改为本地快照后的后台操作。Timeline 与 Dashboard 切换日期只在内存中更新选中日和槽位；旧本地 `Sun 09:00` 式排期会归一为 UTC ISO instant 后再参与时间轴过滤和 API 更新。单任务拖放不再等待远端 `PUT`，而是先写本地 repository/outbox 并更新内存槽位，后台 push/pull 失败不回退本地结果；拖拽 payload 同时携带 `taskId` 与 `sourceSlotTime`，本地写入失败显示通知。新增定向回归已先失败后通过，`check:r4-pc` 仍扫描 80 个生产文件通过。当前宿主缺少 `vue-tsc`，`npm run type-check` 返回命令未找到；时间轴相关定向套件当前为 31 项中 26 项通过、5 项失败，未完成项是可见负荷标签、排期换位、到期自动转换与过去时段保护。双任务换位尚无持久化原子组，不能把本轮修复写为完整排期或 GUI 验收通过。

2026-09-03 PC SQLite 并发写入修复：Tauri SQLite 现由单个初始化 Promise 管理，建表/迁移仅在首次加载运行；用户/服务端设备隔离的 repository 复用实例，SQL 插件调用经单一队列串行化。初始连接启用 WAL 与 5 秒 `busy_timeout`；同步 reset 改由 Rust `replace_local_resource_snapshot` 在同一连接的事务内替换非 pending 行，保留未解决 mutation 的本地资源，非法项使整批回滚。`node --experimental-strip-types --test scripts/r4-local-repository.test.mjs` 为 11/11，`cargo test --lib` 为 13/13。SQLite 修复时的完整 PC 回归为 168/176，8 个失败集中在本工作树既有的时间轴/本地优先调度变更；后续 Subject 全局主题色清理已消除 Dashboard/Home/Timeline 的 `Subject.color` 类型错误，最新 `npm run test:r4-pc` 为 173/181，`npm run type-check` 通过。真实 Tauri GUI、已有数据库升级及弱网/多写入压力验收仍待执行。

2026-09-03 Subject 专属颜色已从服务端 Subject API/Entity、Flyway V19 数据库 schema、PC/Mobile 前端和当前契约中移除；V19 仅删除 `subjects.color`，保留 Subject 行及 KnowledgeBlock/Task 的 `color_override`。本地 Docker PostgreSQL 已完成 V19 升级并确认 Subject 行仍保留；该变化会丢弃现有 Subject 颜色值，不影响其他资源颜色覆盖。两端 type-check、回归测试、静态检查和 PC/Mobile H5 production build 均通过；真实三端 GUI/业务联调仍需人工验收。

 2026-09-03 PC 本地优先修复：Subject、Source、KnowledgeBlock 的常规写入与 Task 的创建/更新先保存用户/服务端设备隔离的资源副本与 outbox，再更新当前 UI 并后台执行 push/pull；列表加载也先展示本地快照，远端列表刷新转后台，首次无缓存时先呈现空态再自动更新。资产库首屏并行读取四类本地投影，任一项失败仍展示其余本地树并关闭 loading；云端结果由 Store cache 写回本地后，资产树自动重建而不重新转圈。outbox 会将同一资源连续的 CREATE→UPDATE、UPDATE→UPDATE 与 UPDATE→DELETE 合并为保留初始 `baseVersion` 的单一 mutation。学科文件登记仍等待实际 Asset 二进制直传和 complete，但现在显示阶段/进度，Source 随后立即本地登记，不再等待同步或重复的远端资料刷新。双任务排期交换的持久化原子组仍属于 P1，不得由本地优先单任务写入替代；认证、ReviewEvent、AI/SSE、签名下载与文档处理手动启动确认仍按其服务端权威需求等待。PC 回归 169/169、`check:r4-pc`（80 个生产文件）与 production build 已通过；构建仍有既有浏览器兼容外部化、大分包和无效动态 import 警告，真实浏览器/Tauri 弱网 GUI 验收待补。

2026-09-01 PC 扫描 PDF runtime 与处理状态可观测性修复：根 `pdfjs-dist` 与 File Viewer renderer 已统一精确锁定为 `5.4.624`，npm lockfile 不再保留 renderer 的嵌套副本；本地 PDF 适配器移除无效 `disableWorker` 选项。FILE scheduler 在创建和调度结束时刷新处理 Store 和 Source 列表，恢复批次隔离单个 Source 失败，避免历史失败文件阻塞后续 `AWAITING_CLIENT` 文件；Profile 同时呈现本地处理与服务端 `VALIDATING/PARSING/INDEXING` 阶段，并允许在有桌面 runner 时手动开始无本地 job 的等待文件。该入口会先触发同步并确认本地 Source 为 `synced`，未确认时显示同步中的、冲突或失败提示而不调用服务端 scheduler；Source `READY` 前明确不可提问。未挂载 Tauri runner 时显示桌面端限制而非空任务。Tauri SQL capability 已补齐 `sql:allow-execute`，避免任务 repository 因只读权限退回 localStorage；后端未预期 API 失败现在记录 `UNEXPECTED_API_ERROR` 诊断日志。`/api/sync/push` 的 JSON 边界已确认并修复为 Jackson 3 converter 与 `tools.jackson.databind.JsonNode` 全链路一致，生产/测试源码守卫禁止 Jackson 2 导入；HTTP Sync object payload、ParsedDocument 有界解压与 OpenAPI artifact 回归均通过。`useSourceStore` 已接入 Pinia HMR 更新，避免开发页新增 action 时组件更新而旧 Store 实例缺少方法。Document runtime 保留创建前的密钥检查，而 Rust `document_package_begin` 也会在新建 package/cache 的最终边界确保 `auralis/master_key` 存在：只有 keyring 的 `NoEntry` 才会创建密钥，credential-manager 的其他错误返回实际 keyring 访问失败；已有 cache/receipt 的读取、上传和清理始终只读取既有密钥，丢失时报告恢复需要而不覆盖旧密文。`/ws/events` 已移除抢占 WebSocket upgrade 的 MVC `GET` 回退，ticket 只在 WebSocket handshake 中消费，未认证 HTTP GET 不再触发空 principal 的 500。针对性 runtime 回归 7/7、Rust 12/12、PC 完整回归 161/161、type-check、静态检查和 production build 已通过；Realtime service/controller/真实 HTTP upgrade 定向测试 5/5 通过。`docs/test/1.pdf` 以同一版本实际加载为 50 页、首屏 0 个 text item 并成功渲染 105,139-byte PNG，证明扫描 PDF 进入位图/OCR 前置路径；真实 Tauri + OCR sidecar + Server/MinIO 上传、索引到可提问仍需人工联调，不能由 mock 自动测试替代。

2026-09-01 学科文件删除与预览稳定性补充：删除 FILE Source 后，PC 先取消运行中的本地 parser，再按当前用户/设备删除该 Source 的所有 `document_processing_jobs`、删除关联加密 cache 和内存 parser input，随后刷新 Profile；进行中的 scheduler 观察到 `SOURCE_DELETED` 后只会退出，不会重建任务或继续上传。Subject Store 删除后重算本地 Source 投影，学科文件计数立即递减。可视预览与 OCR 仍使用固定的同一 PDF.js 版本，OCR 的 PDF.js document 在解析结束时释放；FilePreview 的签名 URL 下载只允许最新选中文件提交结果，旧响应不能覆盖 renderer，避免表现为预览反复加载。定向回归 52/52、PC 全量回归 165/165、type-check、`check:r4-pc`（80 个生产文件）和 production build 均通过；构建保留既有 File Viewer 大 chunk、Node 浏览器外置与无效动态 import 警告。真实 Tauri 的删除/扫描 PDF GUI 走查仍待人工记录。

2026-08-29 设备标识契约切换：客户端注册标识统一命名为 `clientDeviceKey`，服务端 canonical 设备标识统一命名为 `serverDeviceId`；Auth、Sync、Realtime、PC/Mobile 本地 scope、Tauri 文档缓存和 JWT claim 已同步切换。Realtime ticket 改为无请求体并从 Bearer JWT 解析服务端设备，旧 `deviceId` 字段不保留，也未新增兼容测试。PC `test:r4-pc` 150/150、Mobile `test:r4-mobile` 21/21、两端 type-check 通过；后端 clean test 与真实 Mobile/Tablet/Tauri GUI 联调仍需单独验收。

2026-08-31 PC 任务到期转换修订：`useTaskStore.fetchTasks()` 与软件运行中的分钟级检查会把 `scheduledAt` 已过、仍未完成/取消的任务更新为 `DONE`，同时保留排期；无 `scheduledAt` 且 `dueAt` 已过的任务显式提交 `dueAt: null`，回到资产库的未排期分组。全局页面不显示提醒，失败时保留原任务数据并记录 Store 错误。PC 定向测试 26/26、`test:r4-pc` 152/152、`type-check`、`check:r4-pc`（80 个生产文件）和生产 build 已通过；Tauri GUI 与真实服务仍需人工复测。

2026-08-31 PC 时间轴过去时段保护：`isScheduledAtInPast` 以可注入时钟判定有效目标时间是否严格早于当前时刻；`scheduleTask`、`scheduleTaskToDay` 和 `rescheduleTask` 均在 API、离线 mutation 或原子换位前校验。换位会校验两个任务的目标时段，拒绝时抛出“不能排期到过去的时间”并保留原位置。PC 定向测试 28/28、`test:r4-pc` 154/154、`type-check`、`check:r4-pc`（80 个生产文件）和生产 build 已通过；Tauri GUI 拖放与真实服务仍需人工复测。

2026-08-27 任务排期修复：PC API 边界将历史展示时间归一化为 UTC ISO instant；后端把无法反序列化的时间字段映射为 `400 VALIDATION_FAILED + fieldErrors`，并新增带稳定锁顺序的 `POST /api/tasks/schedule-swaps` 原子交换。Dashboard、Timeline 与 Home 拖拽均改为传递任务 ID 和已排期任务的原槽位，原槽为 no-op，拖回待办只以任务 ID 取消排期；任务到期后的状态转换以本页 2026-08-31 规则为准。`CoreDomainControllerTests` 5/5、PC `test:r4-pc` 144/144、type-check、生产 build 和 `git diff --check` 通过。自动证据不替代 Tauri 原生拖放、真实 409/断网和任务到期转换人工验收。OpenAPI artifact 与 PC schema 已一致；Mobile `schema.ts` 被外部进程锁定，生成/契约校验暂以 `EPERM` 失败，已登记为 P1，未强制终止用户进程。

2026-08-27 全量后端验证边界：本机 `Auralis-Server\\mvnw.cmd clean test` 实际执行到 189 个测试、28 个错误后失败；三个 Testcontainers 用例因 Docker 环境不可用失败，随后共享 H2 数据中的 `assets → users` 清理外键错误连带影响多个既有测试类。该失败不能当作本轮 Task 换位回归：同一清洁进程下的 `CoreDomainControllerTests` 5/5 通过，并覆盖非法时间字段、原子交换及失败不留半交换。Docker/共享清理问题保持为 P1-Test-Coverage 的开放项。

2026-08-24：PC Tauri AI 辅助阅读已开始执行。G1 OCR 协议/fixture、G2 RapidOCR sidecar、G3 Rust supervisor 和 G4 MSI externalBin/resources 硬门已有代码及证据；最终 MSI 已生成，verifier 已核验 WiX 对 sidecar、三个模型、manifest、license 和 SBOM 的引用，五组离线 OCR baseline 已写入 budgets。用户已在 `docs/test` 提供真实 DOC、DOCX、PPTX 及两份 PDF，并由 Apache POI 生成了一个真实 OLE 旧式 PPT fixture；数据库 PDF 无 text layer，可作为扫描 PDF OCR 样本，学生手册 PDF 有 text layer。G5 已实现固定尺寸 BackgroundParserHost 与 FileViewerParserBridge，type-check、host/bridge 静态契约 2/2、Office fixture matrix 3/3 和现有 PC 回归 102/102 通过；G6 已实现 PDF text-layer/扫描分类、逐页 OCR、Office direct/fallback、Unicode 归一化与 sink 背压，core 7/7、真实 PDF 2/2 通过；C1 已新增 v3 `document_processing_jobs` schema、用户/设备隔离、合法状态迁移和原子 checkpoint repository，定向测试 3/3、现有 local repository 6/6、type-check 通过；C2 已新增 4 MiB 分块 gzip/AES-GCM cache、AAD scope、nonce/tamper/atomic replace 校验、内部解密 reader 和 package commands，Rust 全量 10/10、JS contract 2/2、type-check 通过；C3 已新增单设备串行可恢复 runner、自动重试/网络暂停/人工 retry/cancel 与 Pinia store，runner 5/5、type-check 通过；S1 已追加 V15 ParsedDocument schema，S2 已完成 FILE/TEXT/URL ingestion 分流，S3 已完成 owner-scoped ParsedDocument upload-intent 与私有 `UPLOADING` 元数据落库，S4 已完成有界 payload validator 与 legacy Asset SHA 条件回填，S5 已完成 complete 首胜、同 payload 幂等、冲突/过期拒绝和唯一 revision indexing job，S6 已完成 accepted blocks indexing、generation/revision 旧任务隔离、兼容 reingest 复用和过期 payload 清理；H2 clean/upgrade schema 4/4、Source/Ai ingestion 11/11、ParsedDocument upload-intent 3/3、validator 4/4、SHA backfill 2/2、complete 3/3、S6 定向 21/21 通过，并覆盖 READY FILE/活动 chunk 保留、非 READY FILE→AWAITING_CLIENT、并发 SHA 回填、complete 并发仲裁、worker block 索引和 cleanup。PostgreSQL upgrade 定向测试已补充但本机 Docker 不可用。实际 File Viewer/Tauri 环境的四种文件提取/回退结论仍待验证。临时 all-users MSI 安装 smoke 受宿主 Error 1925 权限限制，留给 R2；不能把安装/升级/卸载 GUI 或 Office 格式支持写成已验收。
2026-08-24 C4 复核：本地文档任务已升级 v4，服务端 UUID revision 与 Rust cache/package header 对齐；Rust `document_upload_put` 从加密 cache 流式 PUT 并校验实际大小/hash，PC coordinator 覆盖 intent/过期重取/网络暂停/幂等 complete/stale revision。Rust 12/12、C4 JS 6/6、PC 回归 108/108、PC type-check 通过。C4 代码门禁完成，但真实 Tauri/MinIO/Server 上传联调、C5 Source 调度和 GUI/安装验收仍未完成。
2026-08-24 C5 复核：本地文档任务升级 v5，`payload_receipt_json` 持久化非敏感 cache receipt；`DocumentJobRunner` 不再重复执行 `PACKAGING` job，`SourceJobScheduler` 接入 FILE immediate job、移动端/重启 owner-scoped download adapter、Asset SHA mismatch、revision supersede、READY/TEXT/URL 分流和完成后 cache/临时输入清理。C5 定向 21/21、完整 PC 回归 128/128、type-check、R4 静态检查通过。真实 Tauri 私有临时目录、MinIO/Server 上传联调、跨设备实际恢复和 GUI/安装验收仍未完成。
2026-08-26 C5 runtime 接线：新增 `DocumentProcessingRuntime`，Tauri App 登录后组装并启动 SQLite job repository、全局 `BackgroundParserHost`、PDF.js/Office parser、Tauri OCR、Rust package/cache、ParsedDocument upload coordinator 和 Source scheduler；sync/online 自动重载 Source 并恢复 pending jobs，登出时解绑；带 durable receipt 的暂停上传可从 `UPLOADING` 边界恢复；SQLite 兼容识别 Tauri v2 `__TAURI_INTERNALS__`。新增 runtime 静态契约与暂停恢复测试后，`test:r4-pc` 135/135、type-check、Web build、`check:r4-pc`（79 个生产文件）和 `git diff --check` 通过。真实 Tauri/MinIO/Server、扫描 PDF OCR、四类 Office、重启/跨设备和 GUI 仍待人工测试。
2026-08-26 AI 辅助阅读链路：V16 阅读会话增加 `GENERAL/READING_SESSION` purpose 与 Source 绑定，普通会话列表排除阅读会话，24 小时清理服务和 owner/source 约束已接入；PromptAssembler 只纳入已完成成对历史并保证当前用户消息预算，`readingContext` 先限定当前 READY Source，确定性规则仅在同学科内按显式跨文件意图、标题命中或当前命中不足升级，citation 按 source/chunk 去重。PC 已接入 OpenAPI/PC-Mobile schema、当前文件临时会话生命周期、未 READY 弹窗、非 READY 文件状态点（失败保留红色静态点，READY 后消失）、Profile 解析中心、原生选中文本解释/追问/知识块编辑；新增前端回归后 `test:r4-pc` 135/135、服务端定向 AI/OpenAPI 31/31、PC type-check、Web build 和 Tauri `--no-bundle` 通过。真实 Server/MinIO、扫描 PDF/Office/Tauri GUI、断网重启及安装验收仍未执行。

2026-08-26 上传/解析联调修复：确认上传后的 SOURCE CREATE 已写入客户端 user/device 隔离 outbox，但因运行时只加载 Source、未在启动前 flush 同步，服务端没有 Source/ingestion job；`DocumentProcessingRuntime` 现会在 Source bootstrap 前主动执行一次 `triggerSync`。为保护既有 localStorage fallback 中尚未迁移的 outbox，本轮不切换 SQLite capability。Docker 本地 MinIO 预签名 public endpoint 固定为 `http://127.0.0.1:9000`，规避 Windows `localhost→::1` 不可达导致的 `Failed to fetch`；真实 Tauri 重新上传、解析任务中心和扫描 PDF 预览仍待人工复测。

2026-08-26 Tauri debug 启动修复：复现 `cargo run`/`tauri dev` 在窗口创建前因 `tauri-plugin-log` 默认文件目标返回 Windows `os error 183`；debug 日志现仅输出 stdout，避免已有日志文件/目录阻止前端窗口启动。回归测试与 debug `cargo run` 已通过；真实 Tauri GUI 仍需人工确认。
2026-08-26 PC 白屏运行时修复：独立 WebView2 证据显示页面资源加载成功，但未登录/残留半截会话时 `AppSidebar` 仍请求 `/api/subjects`，401 刷新失败抛出 `No refresh token` 未处理异常。公共登录路由现使用独立布局，认证壳仅在完整 user+token 会话下挂载，侧栏请求增加认证判断与异常兜底，路由/登录页统一完整会话判定。`test:r4-pc` 137/137、type-check、Tauri `--no-bundle` 通过；真实 Tauri GUI 仍需重启后人工确认。
2026-08-27 Vite 开发 HMR 修复：`@vitejs/plugin-vue` 在 File Viewer 开发期复制资源触发的早期 HMR 中可能读取空 `compiler`，报 `invalidateTypeCache`。Vite 现显式注入 `vue/compiler-sfc`，并忽略 `public/file-viewer/**` 生成资源监听；新增回归后 `test:r4-pc` 138/138、type-check、静态检查、Tauri `--no-bundle` 通过。真实 Tauri dev 热更新仍需人工重启验证。

截至 2026-08-20，PC 的 R4 客户端迁移已推进到联调前门禁：正式 PC Store/页面已切换到当前 typed API 和用户/设备隔离 repository，AI SSE、Vite 代理和 Tauri 最小权限边界已有代码与自动检查证据。这里的“联调前门禁”只表示客户端代码和本地检查达到当前阶段，不等同于生产构建、GUI、真机、后端联调或业务验收全部完成。

后端方向已确定为在 `Auralis-Server` 原路径进行绿地重写，完整方案见[后端绿地重写计划](../plans/backend-greenfield-rewrite-plan.md)。阶段 0 已完成仓库外备份、旧 Server 可恢复替换、Boot 4.1 / Modulith 骨架、基础错误协议、健康检查、OpenAPI 和模块边界测试；阶段 1 已实现 Identity V1，阶段 2A 已实现 Subject、KnowledgeBlock、Task 核心领域闭环，阶段 2B 已构建 Source、Asset、Relation 闭环，阶段 3/4 已构建 Sync、Review、Stats、Realtime，阶段 5/R1 已完成 pgvector、AI 请求并发保留、会话恢复键和回调式流式基线，R2 已执行真实依赖 Testcontainers，R3 已固定 OpenAPI artifact 和 PC/Mobile SDK 类型边界。当前仍为“已构建待验收”，因为真实 Provider、MinIO 异常路径、双设备、浏览器 WebSocket、前端联调和人工验收未完成。

2026-08-20 本轮修复完成后，PC 不再持久化或附加 BYOK 明文，核心资源离线 CREATE 使用稳定 outbox 身份，Chat 保留本地会话/消息请求 ID 并在上线后顺序恢复；SSE 401 使用共享的单次刷新且复用原请求 ID。服务端 V14 增加会话恢复键与 assistant→USER 精确关联，并将 Provider I/O 移出事务。`test:r4-pc` 58/58、type-check、`check:r4-pc` 59 文件、Web build、OpenAPI artifact/PC+Mobile 类型比对、服务端专项 12/12 和含 PostgreSQL/pgvector/MinIO 容器的 `clean test` 137/137 均通过；这仍不等同于真实 Provider 或浏览器业务验收。

2026-08-20：正式 `/profile` 已内嵌 BYOK 配置卡片，支持读取脱敏状态、按 Provider 切换、更新 Base URL 与一次性提交 API Key；保存成功立即清空输入框。该页面的静态安全回归、type-check 与 Web build 已通过，但浏览器连接真实 Server 的读取、保存和错误态仍待人工联调。

2026-08-20：Identity 会话列表已改为每用户/设备一条活动 refresh session 视图；重复登录同一设备会撤销旧 refresh session，避免 Profile 出现重复设备和误撤销旧记录。定向 AuthControllerTests 7/7 与 Docker Testcontainers 全量 `mvn -B -ntp test` 138/138 通过。撤销仍不会令已签发 access JWT 瞬时失效，当前 15 分钟有效期结束前的远端请求阻断属于后续鉴权架构取舍，不写成已完成的即时踢下线。

2026-08-21：Mobile/微信共享主路径已切到当前 Auth、Sync/Realtime、Asset、Review、Stats 与 AI 契约；Mobile Home/Profile 移除演示日程和固定统计，手写页移除伪 OCR/知识抽取，Tablet Workspace 总结改用真实 AI SSE，Dashboard/Review/Stats 也已使用 Stats/Review 服务端契约并移除随机统计和本地结果伪写。本地数据使用 userId/deviceId 独立 namespace，Pomodoro 计数同样按 namespace 隔离，旧全局库按用户授权一次性清除。`check:r4-mobile` 扫描 62 个生产文件、协议测试 20/20、Tablet 逻辑测试、type-check、H5 与微信构建通过；真实服务、微信合法域名、开发者工具、双设备和真机仍未验收。

2026-08-21：AI 运行时配置改为服务端 env 默认 Provider + 用户 BYOK 覆盖：`AURALIS_AI_DEFAULT_PROVIDER` 决定未指定 Provider 的聊天请求，`DEEPSEEK_API_KEY`/`OPENAI_API_KEY`/`SILICONFLOW_API_KEY` 仅在服务端运行时作为 fallback，不写入用户表或 API 响应；BYOK 仍按 userId/provider 加密保存。Compose 显式透传 SiliconFlow Base URL、聊天模型和 `BAAI/bge-m3` embedding 模型；Provider DNS 混合解析只固定公网地址。已修复 Java 21 `HttpsURLConnection` 调用固定地址 TLS Socket 无参 `createSocket()` 时在连接前失败的问题；真实 Java Provider 链路调用 SiliconFlow `BAAI/bge-m3` 返回 1 条 embedding，全量后端测试 148/148 通过，重建后的 Compose backend 健康。PC 浏览器完整对话仍待人工验收。

2026-08-21：补强 AI 后端运行日志：请求开始/校验/Provider 选择、env/BYOK 来源、Embedding/检索、Chat 流式、上游 HTTP JSON/SSE、成功/中断/失败均输出安全事件名、模型/host、状态、数量和耗时；不输出 API Key、Authorization、完整 prompt、模型回复或响应体。新增日志脱敏与失败阶段回归，AI 定向 26/26 通过。

2026-08-23：按 `VALIDATION_FAILED` 排障反馈，AI 失败事件新增 `exceptionType`、单行截断并脱敏后的 `exceptionMessage`、`rootCauseType` 与 `rootCauseMessage`，覆盖聊天、Provider 选择、请求校验和 embedding 失败；前端 Problem Details 错误码/安全 detail 契约不变。新增原始异常日志与 Authorization 脱敏回归，`AiStreamingTests` 12/12 通过。

2026-08-22：PC 资产库任务编辑移除认知负荷按钮，改为 30 分钟步进的预计用时控件；保存时通过 Task Store 写回标题、备注、截止日期和 `durationMinutes`。`test:r4-pc` 73/73、type-check 与 Web build 通过；浏览器实际编辑、刷新后持久化仍待人工验收。

2026-08-22：修复 PC 时间轴日视图排期匹配：Task Store 使用半小时槽位承接 `scheduledAt`，时间轴保留已过去排期并对任务名称/详情应用删除线。`test:r4-pc` 74/74、type-check、静态检查和 Web build 通过；浏览器实际跨日、半点排期和拖拽走查仍待人工验收。

2026-08-22：PC 首页与独立时间轴统一为以当日为中心的 7 日滚动窗口，展示前后三天的真实日期并将当日置于中间；共享日期计算同时驱动日视图选择器、周视图列和任务分组。新增日期窗口/边界回归后 `test:r4-pc` 75/75、type-check 通过；浏览器跨月/跨周日期、拖拽和刷新后的真实服务状态仍待人工验收。

2026-08-22：修复 PC 时间轴拖拽与 30 分钟槽位错位：原生拖拽补齐 `dataTransfer` payload，Dashboard/Timeline 的任务高度按半小时槽位和间距计算，首页覆盖判断改为分钟精度，drop 操作等待排期写回并在 finally 清理拖拽状态；首页日期格改为只显示紧凑日期，顶栏显示完整星期/月日信息。`test:r4-pc` 77/77、type-check、静态检查和 Web build 通过；浏览器拖拽交换、跨槽位显示和窄栏视觉仍待人工验收。

2026-08-22：根据边界反馈，PC Dashboard/Timeline 日期窗口从“当日居中、前后三天”恢复为从当天开始的连续 7 日单周窗口；首页日期格改为只显示日数字，选中态使用固定圆形绿色背景，顶栏改为“时间轴 · X月”。单周窗口与 `dayCode` 排期语义一致，避免拖拽到窗口前几日后任务被写入下一周而不可见。`test:r4-pc`、type-check、静态检查和 Web build 仍需以本轮命令结果为准；浏览器拖拽和视觉走查仍待人工验收。

2026-08-22：按最新日期语义，PC Dashboard/Timeline 改为展示当前/所选日期所在的完整自然周（周日至周六），`isToday` 按真实日期匹配；首页日期数字上方增加 `Sun` 至 `Sat` 英文星期缩写，选中日期徽标保持约 36px 圆形绿色背景。自然周边界、日期标签和首页视觉回归需以本轮命令结果为准，浏览器跨周拖拽仍待人工验收。

2026-08-22：统一 PC 全局排版：根字号恢复为 16px，新增 caption/body-sm/label/body/body-lg/title-sm/title/title-lg/display 语义字号令牌并保留旧变量别名；普通控件与 Pomodoro 使用 `--font-family-base`，代码/知识图谱等宽内容使用 `--font-family-mono`，移除页面级 Inter、Outfit、Plus Jakarta Sans、JetBrains Mono 覆盖。`test:r4-pc` 79/79、type-check、`check:r4-pc` 60 个生产文件和 Web build 均通过；构建保留既有 Asset 大 chunk 与无效动态 import 警告，浏览器窄栏和深色主题视觉仍待人工验收。

2026-08-23：修复 Docker MinIO 下载地址生成：后端不再用 `AURALIS_MINIO_PUBLIC_ENDPOINT` 初始化会主动连接的 SDK，而是使用离线 SigV4 signer 生成 GET URL；`AURALIS_MINIO_ENDPOINT` 继续只负责容器内对象校验和读取。新增 `MinioAssetStorageIntegrationTests` 回归（3/3）和脱敏 `ASSET_DOWNLOAD_URL_FAILED` 日志；Compose 重建后 backend healthy。临时隔离账号真实链路验证 upload PUT 200、Asset READY、download GET 200/26 bytes。Source 响应新增可选 `assetSizeBytes`，PC 映射器不再无条件显示 `0.0MB`；SourceAssetRelationServiceTests 5/5、PC mapper tests 8/8 通过。浏览器 GUI 仍需人工刷新页面验证。

2026-08-23：修复 PC 学科文件登记后的大小丢失：上传完成返回的 `asset.sizeBytes` 现在写入本地优先 Source 副本，并从同步 mutation payload 中排除展示字段；文件在同步完成前也会显示真实大小。新增登记链路回归；`test:r4-pc` 94/94、type-check 和 Web build 通过。浏览器刷新后对既有文件及新登记文件的 GUI 验收仍待执行。

2026-08-23：PC 学科文件栏已由 Antigravity Gemini 3.1 Pro 参与改造：移除独立 `· 总结.md` 虚拟项，文件栏只显示真实 Source，知识块入口作为总结/知识表面；选中文件后由 `FilePreview` 直接承载文档预览，并新增确认后的 Source 软删除按钮。后端新增 `AssetRetentionCleanupService`，默认保留 30 天后按小时物理删除 MinIO 对象并将 Asset 标记为 `ORPHANED`，数据库审计行保留。`test:r4-pc` 95/95、type-check、静态检查、Web build、后端 `mvn -B -ntp test` 155/155 和 Compose config 均通过；Docker 重建后 backend healthy、frontend HTTP 200、readiness `UP`。浏览器文件预览、删除确认、知识块和实际定时清理仍待人工验收。
2026-08-23：修复 PC 学科文件删除竞态：本地 outbox 中仍有 `SOURCE/CREATE` 时，删除改为写入有序 `DELETE` mutation，不再提前直接请求不存在的远端 Source；已同步文件继续走 Source 软删除。删除入口恢复为悬停显示并保留键盘 focus-visible，404/版本冲突等反馈明确化。同步实时信号改为完整 push→pull，活动同步周期收到新 mutation 会自动再跑一轮，避免 pending Source 停在本地。`test:r4-pc` 98/98；type-check、静态检查、Web build 和浏览器实际删除/刷新验收仍待执行。
2026-08-23：按预览工具栏反馈，PC File Viewer 关闭通用搜索、下载、打印、HTML 导出、主题、重复缩放和内部 PDF 工具栏；学科页的现有文件名顶栏承载缩放/旋转，页码/总页数和前后页在 bare 预览主体底部以同级布局占位，去除 renderer 内层边框/圆角。补充 renderer 就绪前后的控制时序队列，顶部/底部栏使用轻微投影和实体按钮，中间文档上下保留 24–32px 安全留白。`test:r4-pc` 101/101、type-check、`check:r4-pc`（60 个生产文件）和 Web build 通过；真实 DOC/DOCX/PDF 样本的浏览器/Tauri GUI 位置、分页和交互仍待人工验收。

2026-08-23：继续收敛 PC File Viewer 控件：移除顶栏控件外层容器，缩放改为 `− / 实际倍率 / ＋`，旋转改为线条左旋图标、当前角度、线条右旋图标；DOC/DOCX 旋转由 renderer 外层状态驱动，倍率由 File Viewer `zoom-change` 实际事件回传。预览上下留白收窄为 12–16px；顶部控件不再因 `previewControlsReady=false` 直接禁用，动作仅在组件 ref 尚未建立时暂存，不再依赖 `load-complete` 作为执行硬门禁。`test:r4-pc` 101/101、type-check、`check:r4-pc`（60 个生产文件）和 Web build 通过；真实样本浏览器/Tauri GUI 仍需确认缩放、左右旋转后的页面可视区域、分页和窄栏布局。
2026-08-23：根据真实 PDF 截图反馈，移除宿主“正在渲染文档”遮罩，避免正文已出现时持续发白；缩放改由 File Viewer 视图状态 API 写入目标倍率，首次宽度适配在用户交互后停止，缩放与旋转分别放入同款圆角控制组。定向预览回归 16/16、完整 `test:r4-pc` 101/101、type-check、静态检查和 Web build 已通过；Docker 重建和真实 GUI 点击验收仍待本轮后续步骤。
2026-08-23：继续排查 PDF/图片缩放、旋转无响应，Chrome 真实运行复现 `viewer.getZoomState is not a function`：`@file-viewer/vue3-full@2.3.2` 的包装组件通过空 `Proxy` 暴露 API，Vue 父级 ref 实际取不到声明中的方法。renderer 已改用 `@file-viewer/vue3@2.3.0` 基础组件并通过 `withFullViewerOptions` 保留 full preset；缩放直接调用 `zoomIn`/`zoomOut`/`resetZoom`，旋转继续调用 `applyViewState`。浏览器组件验证中图片宽度由 800px 增至 896px、旋转角由 0° 变为 90°；定向预览回归 16/16、`test:r4-pc` 101/101、type-check、静态检查和 Web build 通过。Docker 已无缓存重建并重建 frontend 容器，运行容器镜像与新镜像 ID 一致，首页 HTTP 200；真实业务样本的浏览器/Tauri GUI 仍待人工复验。
2026-08-23：按 PC 文件栏截图移除学习文件行左侧的文件类型图案；文件行现在从文件名开始布局，删除操作、大小和选中态保持不变。新增静态回归断言，定向预览回归 17/17；真实浏览器窄栏与长文件名仍待人工复验。

2026-08-21：修复 PC 注册后的默认学科问题：注册不再自动创建“未分类” Subject，Subject 列表允许为空；历史 `defaultSubject=true` 记录可通过普通删除接口软删除。核心领域与资源归属回归 7/7 通过，PC SubjectHall 空状态和删除路径仍需浏览器人工验收。

2026-08-21：修复 PC 学科工作区 AI 回溯：进入或切换学科时清空当前消息并创建新的伴读会话，不再加载全局会话列表或恢复旧 `activeSessionId`；PC 回归测试 59/59、type-check 和 SubjectWorkspace 静态契约通过，浏览器真实 SSE 仍需人工验收。

2026-08-21：补齐 PC 个人空间登出入口：个人空间提供确认后的“退出登录”，Auth Store 在本地会话清理后将服务端异常交给 UI，失败仍跳转 `/login`；PC 回归测试 62/62、type-check 和 Web build 通过，浏览器手工点击验收仍待执行。

2026-08-21：修复 PC 学科大厅编辑无法保存：编辑弹层现在保留 Subject `version`，更新请求正确携带 `baseVersion`；新增版本契约回归，PC 回归测试 63/63、静态检查、图标契约、type-check 和 Web build 通过，浏览器真实编辑/刷新验收仍待执行。

2026-08-22：修复 PC 资产库任务来源：移除“全部任务”中的固定 Vue/Tauri 演示任务，改用 `useTaskStore.fetchTasks()` 加载当前用户任务，并填充全部任务及各学科任务目录；PC 回归测试 64/64、静态检查、图标/工作区契约、type-check 和 Web build 通过，浏览器资产库任务展示与状态切换仍待人工验收。
2026-08-22：完成 PC 任务视图逻辑收敛：排期队列仅保留有截止时间且未排期的未完成任务；时间轴限定今天起 7 个日历日并保留已完成排期；资产库任务按未分布/未完成/已完成分组并按截止时间排序；时间轴“导入任务”聚焦 `/asset?focus=unassigned-tasks`。`test:r4-pc` 73/73、type-check、`check:r4-pc`、学科图标/工作区契约和 Web build 通过；浏览器拖拽、宽屏布局和真实服务状态切换仍待人工验收。

2026-08-22：PC 学科文件预览先接入自托管 File Viewer：`FilePreview` 统一管理签名 URL、下载、加载/失败态，DOC/DOCX、PPT/PPTX、PDF、图片和文本走 File Viewer；Excel、未知格式及超过 50 MB 文件在 upload intent 前拦截。依赖资源复制、`test:r4-pc` 92/92、`check:r4-pc`、SubjectWorkspace 契约、type-check 和 Web build 已通过；真实 DOC/DOCX 样本、浏览器/Tauri GUI 和窄栏布局仍待人工验收，若兼容性不足再切换组件内部 PDF renderer。

低优先级待办：PC 注册页仍需补齐与服务端一致的客户端约束提示；RFC Problem Details 的 `fieldErrors[]` 已映射到登录/注册输入框，不再依赖旧 `errors` 对象；登录页通用提示会优先展示字段级校验消息。PC 自定义弹窗还需按 P2-PC-Modal-Consistency 统一视觉令牌；后端 HTTP 400 校验仍是最终安全边界，详见 P2-PC-Auth-Validation-UX。

| 模块 | 当前状态 | 代码证据 | 命令证据 | 人工验收 | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 文档体系 | 已构建待验收 | 新分类体系、Agent 规则、归档快照、旧路径切换已完成 | 2026-08-12：`docs/README.md` 相对链接检查 33 项通过；2026-07-10 的元数据、根目录、旧路径扫描仍保留为历史证据 | 无 | 随后续代码变化持续回写 |
| PC Web | 已构建待验收 | 8 条正式路由、typed API Store、用户/设备隔离本地 repository、无明文 BYOK 的 AI SSE 控制器和离线会话恢复存在；正式页面已移除静态演示数据主路径，个人空间已有确认登出入口，学科编辑保留版本并提交 `baseVersion`，资产库任务来自 Task Store，学科页使用统一 FilePreview 和文件名顶栏/底部页码布局 | 2026-08-23：`check:r4-pc` 扫描 60 个生产文件通过，`test:r4-pc` 101/101、type-check、Web build、Subject icon、Subject workspace 和文件预览契约通过；File Viewer 资源 47/47 已复制，预览控件队列、倍率和左右旋转状态已接入，保留大 chunk 与无效动态 import 警告 | 浏览器主流程、真实 DOC/DOCX/PPT/PDF/图片/文本预览、资产库真实任务展示/状态切换、真实 API/SSE、学科编辑保存/刷新、登出成功/失败提示、会话撤销、AI 失败态、窄栏/深色主题和 GUI | 完成真实前后端联调、样本文件 GUI 验收，若 File Viewer 兼容性不足则切换 PDF renderer，评估 bundle 拆分 |
| PC Tauri | K1/C4/C5/A1–A4/K2/U1–U3 代码与自动门禁已完成，真实联调待验收 | Tauri 2.11.1、SQL 插件配置、OCR sidecar supervisor、固定模型资源、bundle verifier、license/SBOM、BackgroundParserHost、FileViewerParserBridge、bounded document parser、`document_processing_jobs` v5 repository（服务端 UUID revision）、encrypted cache package commands、DocumentJobRunner/Pinia store、Rust `document_upload_put` 与 PC `ParsedDocumentUploadCoordinator`；登录后 runtime 组装 parser/OCR/package/cache/upload/scheduler，启动前执行一次同步以恢复 SOURCE outbox，在线与同步事件可恢复任务；服务端 V15/V16 ParsedDocument 与阅读会话 schema、Source FILE/TEXT/URL 分流、owner-scoped upload intent、complete 首胜、revision indexing、accepted block indexing、cleanup、当前 Source 检索和同学科确定性升级；PC 已接入 reading session、未 READY 弹窗、状态点/Profile 进度中心和选中文本知识块操作 | `test:r4-pc` 135/135、服务端定向 AI/OpenAPI 31/31、PC type-check、Web build、`check:r4-pc`（79 个生产文件）、Tauri `--no-bundle` 生成 `src-tauri/target/release/app.exe`；完整 MSI bundling 仍受宿主 WiX 文件/权限错误阻断，PostgreSQL upgrade 因本机 Docker 不可用未执行 | 四种 Office 在实际 File Viewer/Tauri 中的提取/bitmap fallback、扫描 PDF OCR 真实渲染、C2/C3 Tauri 真机 cache/上传/恢复、S1 PostgreSQL upgrade、C4/C5 真实 Server/MinIO 联调、阅读会话与当前文件/同学科升级真实 SSE、选中文本/知识块、Windows GUI、宿主权限、MSI 安装/升级/卸载、安装后 OCR、真实性能回归 | 启动 Tauri 接入真实 Server/MinIO，完成样本文件、重启/断网恢复、阅读/选择操作和 GUI 业务验收；随后在具备安装权限的 Windows x64 环境完成安装验收 |
| Mobile H5 | 已构建待验收 | Auth/Sync/Realtime/Asset/Review/Stats/AI 新契约、用户/设备隔离本地库与手机页面存在 | 2026-08-21：`check:r4-mobile` 62 文件、协议测试 20/20、type-check、H5 build 通过；保留 import 与 Sass 警告 | 真实服务、手机浏览器、弱网、输入法 | H5 联调与真机走查 |
| 微信小程序 | 已构建待验收 | `MP-WEIXIN` 排除 Tablet；环境强制 HTTPS/WSS；手机主路径共享新契约 | 2026-08-20：微信 build 通过 | AppID、开发者工具、真机、合法请求/WSS/upload/download 域名 | 配置平台域名并完成微信走查 |
| Tablet | 已构建待验收 | 9 个注册页、TabletLayout、多栏 workspace、共享 Auth/Sync/Asset/AI 边界；Dashboard/Review/Stats 已接 Stats/Review API；手写仍默认关闭 | 2026-08-21：`check:r4-mobile`、`test:tablet`、type-check、H5 build 通过 | 真实服务、横屏触控、键盘、缩放、前后台 | 完成 R4-07 平板真实服务与真机走查 |
| Tablet 手写笔记 | 已隐藏保留 | `tablet_notes`、NoteDocument、仓库与 feature flag 存在 | 本轮未执行专项脚本 | 笔迹、导入导出、长时间书写 | 核心链路后再开启 |
| 后端绿地重写 | 已构建待验收 | `Auralis-Server` 已替换为 `com.auralis.app` 的 Java 21 / Boot 4.1 / Modulith 2.1；Identity V1、Subject/KnowledgeBlock/Task V2、Source/Asset/Relation V3、Sync V4/V6、Review/Stats/Realtime V5、Task V7、AI/RAG V8–V14 与 PC Tauri ParsedDocument V15、版本/墓碑/恢复、Auth 与核心 API 存在；S3 upload intent、S4 payload validator、legacy Asset SHA 条件回填、S5 complete 首胜、S6 block indexing/cleanup 和 K1 OpenAPI/SDK 冻结已实现 | 2026-08-24：`ParsedDocumentSchemaTests` H2 clean/upgrade 4/4、`ParsedDocumentControllerTests` 3/3、`ParsedDocumentValidatorTests` 4/4、`AssetShaBackfillTests` 2/2、`ParsedDocumentCompleteTests` 3/3、S6 定向 21/21、K1 `OpenApiArtifactTests` 4/4 和 PC type-check 通过，覆盖 V15 字段/索引/非同步边界、READY FILE/活动 chunk 保留、非 READY FILE→AWAITING_CLIENT、owner/revision/hash/size/schema、gzip/UTF-8/ordinal、并发 SHA 回填、complete 首胜/冲突/过期、worker block indexing/revision fencing、兼容 reingest、object cleanup 和生成契约；PgVector upgrade 断言已补充但本机 Docker 不可用，未取得 PostgreSQL 执行证据；既有默认后端测试证据仍保持此前结果 | 真实 Provider chat、MinIO 异常路径、Source 文件链路、双设备、浏览器 WebSocket、GUI/真机和外部 AI 完整业务 | 完成 C4/C5 和目标客户端业务联调；自动门禁和单次 Provider smoke 不等于人工验收 |
| Auth | 已构建待验收 | 新 `com.auralis.app` 已有 BCrypt、15 分钟 access JWT、30 天 refresh rotation、会话撤销、owner-scoped sessions 和 Problem Details 安全错误 | 2026-08-12：IdentityService 5 个测试、AuthController 6 个 MockMvc 测试；test profile HTTP smoke 注册 201、登录 200、token pair 存在 | 三端登录/刷新/退出、人工业务验收和生产 JWT/数据库环境 | 接入后续业务模块并完成 PostgreSQL/前端联调 |
| 块与任务 | 已构建待验收 | CRUD、实体、端侧副本与同步路径存在 | 2026-07-10：`mvn test` 生命周期通过，无业务断言 | 跨用户、删除、多端一致性 | 统一删除并测试 |
| Asset | 已构建待验收 | V3 Asset 元数据、上传 intent、完成时对象 HEAD/stat 校验、READY 下载 URL、用户归属和失败状态持久化存在；MinIO 适配器按配置启用 | 2026-08-17：真实 MinIO presigned PUT/HEAD/GET/open/delete 集成 1/1 通过；测试 profile 仍使用可控存储端口 | MinIO 异常路径、上传回调和部署凭据验证 | 完成对象不存在、大小/hash 不符、超时、重复完成和生产凭据验收 |
| Source | 已构建待验收 | V3 Source FILE/TEXT/URL CRUD、版本/墓碑/恢复、reingest PENDING、Subject/Asset 归属校验和 KnowledgeBlock Source 关联存在 | 2026-08-13：阶段 2B Repository/Service/Controller 与全量 42 测试通过 | ingestion worker、Tika/文本解析、真实文件链路和三端业务验收 | 先完成真实对象/解析边界，再进入同步接入 |
| Relation | 已构建待验收 | V3 Relation 端点类型/用户/活动状态校验、RELATED_TO 无向去重、版本/墓碑/恢复和 shared 删除事件级联存在 | 2026-08-13：阶段 2B Repository/Service/Controller 与全量 42 测试通过 | PostgreSQL 约束、跨模块人工业务链路和同步一致性 | 与删除/同步阶段一起完成外部验收 |
| Sync | 已构建待验收 | V4/V6 change log/inbound mutation、高水位 cursor、原子 push/pull/snapshot、包含墓碑的快照、设备校验、幂等、版本冲突、30天自动清理与指标存在 | 2026-08-17：R1-05 定向套件 16/16 通过，覆盖清理后 cursor reset、高水位延续、清理指标、并发 cursor/并发重放；全量 126 通过、1 个 opt-in PostgreSQL 测试跳过 | 双设备、断网重连、过期 cursor 的真实调度、PostgreSQL 并发游标 | 完成真实数据库/双设备验收 |
| Review | 已构建待验收 | V5 ReviewState/ReviewEvent/参数集、FSRS-lite、due/event/history、完整状态快照、SKIP 与事件幂等存在 | 2026-08-14：Review 定向 6/6 通过，全量回归通过，覆盖后续复习后重放原始状态 | 多端复习主流程和调度业务验收 | 接入前端并进行真实用户流程验收 |
| Stats | 已构建待验收 | V5/V7 强类型 overview/weekly 查询，所有统计按 userId 过滤，任务按 completed_at 统计 | 2026-08-14：Stats/迁移定向 4/4 通过，全量回归通过，覆盖后续编辑不改变完成日统计 | 真实数据量、跨用户和前端展示验收 | PostgreSQL 查询计划和前端联调 |
| Realtime | 已构建待验收 | V5 一次性 hash-only ticket、设备绑定、WebSocket handler 和提交后用户级事件桥存在；`/ws/events` 仅由 WebSocket handler 承接，没有 MVC GET 回退 | 2026-09-01：Realtime service/controller/真实 HTTP upgrade 定向 5/5 通过，已验证签发 ticket 可以不带 Bearer header 完成 WebSocket 握手，并覆盖已提交领域写入产生 SYNC_CHANGED | 浏览器/目标端 WebSocket、跨实例、断线重连和前端消费 | 加入真实目标客户端与部署拓扑验收 |
| AI / RAG | 已构建待验收 | chat、回调式 SSE、会话/消息 `clientRequestId` 幂等、精确 assistant reply、citation、ingest、PostgreSQL pgvector/HNSW、generation 原子切换和 MinIO 端口存在 | 2026-08-20：R1 专项 12/12；`clean test` 137/137，实际覆盖 PostgreSQL 17/pgvector V1→V14 clean/upgrade 与 MinIO 主链路；PC 离线恢复/SSE 测试 58/58 | 真实模型/网络、MinIO 异常路径、前端 SSE 消费、引用质量 | 完成 Provider/MinIO 异常路径/前端联调和 AI 业务验收 |
| 基础设施 | 已构建待验收 | Compose 已切换 PostgreSQL/pgvector、MinIO、bucket init、backend healthcheck，固定镜像并移除 Redis/Milvus/etcd 主依赖 | 2026-08-17：`docker compose --env-file .env.example config --quiet`、backend/frontend build、db/MinIO/backend/frontend up 通过；db/MinIO/backend 为 healthy，MinIO init 退出 0，frontend HTTP 首页 200，backend readiness `UP` | 真实 volume、备份/恢复、监控、生产 secret、MinIO 异常路径和真实 Provider | 完成备份/恢复、监控、生产 secret、异常路径与 Provider smoke，再进入部署演练 |

块与任务、Sync/WebSocket、AI/RAG 和基础设施行描述的是替换前能力盘点或后续目标；Auth、Asset、Source、Relation 行已由新实现和测试证据更新。旧 Server 实现已移出工作树并保留在仓库外备份中，其余新后端能力必须按绿地计划重新实现并产生新的测试和验收证据。

## 当前里程碑判断

当前优先级不是继续扩展页面数量或修补旧 Server，而是在已完成阶段 0 骨架上按已批准计划闭环以下主线：

```text
保护工作树并备份旧 Server（阶段 0 已完成）
→ 新工程骨架与 Identity（阶段 0 骨架、阶段 1 Identity 已构建待验收）
→ Subject / Source / Knowledge / Task / Relation
→ 离线同步、墓碑与冲突（阶段 3 已构建待验收）
→ Review / Stats / Realtime（阶段 4 已构建待验收）
→ AI / RAG
→ 综合测试与 OpenAPI/SDK 交付（R3 已完成本地契约门禁）
→ 三端另行迁移新契约（R4）
```

Tablet 手写、更多 AI 体验和更多平台构建在主线稳定后推进。

## 既有验证证据

2026-07-10 已实际完成：

- `Auralis-PC`: `npm.cmd run build` 通过。
- `Auralis-Mobile`: `npm.cmd run build:h5` 通过，保留非阻断动态/静态 import 与 Sass legacy API 警告。
- `Auralis-Mobile`: `npm.cmd run build:mp-weixin` 通过，产物可由微信开发者工具导入。
- `Auralis-Mobile`: `node scripts\check-tablet-sidebar-transition.mjs` 通过。
- 旧 `Auralis-Server`: 2026-07-10 `mvn test` 通过；日志明确为 `No sources to compile`，该结果仅是替换前历史证据。
- 文档相对链接、元数据、根目录和旧路径扫描通过。

2026-08-20 R4 Task 5 已实际完成：

- `Auralis-PC` 新增 Subject、KnowledgeBlock、Task、Source、Relation、Review、Stats typed API wrapper 和 SSE 解析器；Asset 已迁移到 upload-intent → 对象存储 PUT → complete → download-url，AI 客户端已移除旧 chat/ingest 路径并接入 `/api/ai/messages/stream`。
- `Auralis-PC`：`npm.cmd run test:r4-pc` 29/29 通过；`npm.cmd run type-check` 通过；`npm.cmd run build` 通过，保留既有大 chunk 非阻断警告。
- `npm.cmd run check:r4-pc` 仍因后续 Task 6–8 尚未迁移的 `useSyncApi`、`useSubjectStore`、`useSyncStore`、Home 和 SubjectWorkspace 旧实现而失败；本任务 wrapper/API 文件未命中旧 asset/AI 路径。真实后端、对象存储、Provider、GUI 和前后端业务联调未验证。

这些结果不替代 GUI、真机、真实基础设施或外部 AI 服务验收。

2026-08-20 R4 Task 6 已完成代码与定向自动测试：

- `Auralis-PC/src/services/localSchema.ts`、`localRepository.ts` 和 `legacyLocalData.ts` 建立了用户/设备隔离的 SQLite v2 schema、浏览器 namespace fallback、tombstone、版本冲突、pending mutation、cursor、snapshot reset 和旧 SQLite 行备份边界；`localDb.ts` 仅保留未迁移 Store 的兼容 facade。
- `npm.cmd run test:r4-pc` 35/35 通过，其中包含临时内存 SQLite 和独立 localStorage namespace 测试；`npm.cmd run type-check` 通过。
- Task 7/8 尚未将正式 Sync/Subject/Task/Workspace Store 全部切换到 repository，`npm.cmd run check:r4-pc` 的既有旧 cursor/response/AI endpoint 命中仍保持开放；真实 Tauri plugin、旧数据库升级、GUI 迁移选择、后端/对象存储/Provider 和前后端业务联调仍未验证。

2026-08-20 R4 Task 7 已完成代码与定向自动测试：

- `Auralis-PC/src/api/useSyncApi.ts` 已切换到 OpenAPI 的 `pullChanges`、`pushChanges`、`getSnapshot`；生产源码不再使用 `afterId`、`lastMutationId`、`truncated` 或旧 block/task merge。
- `useSyncStore` 已维护 `cursor`、`resetRequired`、`isPulling`、`isPushing`、`lastSyncError`；realtime、启动恢复、网络恢复和主动同步统一调用 cursor pull，reset 会先 snapshot、保留 unresolved mutation，再重放 pending。
- `npm.cmd run test:r4-pc` 39/39 通过；`npm.cmd run type-check` 通过。`npm.cmd run check:r4-pc` 仍只命中 Task 8/10 的 Subject/页面/AI 旧实现；真实后端、多设备、浏览器 WebSocket、Tauri、GUI 和前后端联调仍未验证。

2026-08-20 R4 Task 8 已完成 PC Subject/KnowledgeBlock/Source/Asset 主流程代码迁移与自动验证：

- `useSubjectStore`、`useSourceStore`、`useKnowledgeStore`、`useAssetStore` 已使用 typed API、user/device-scoped local repository、`version/deletedAt/baseVersion` 和 pending mutation；SubjectWorkspace、Asset、Home 的资料上传改为 upload-intent → object storage PUT → complete → Source create，目录更新使用当前 Source DTO，AI 流改用 `/api/ai/messages/stream`。
- 新增 `domainMappers.ts` 和固定 DTO mapping/cursor/optimistic mutation 测试；旧 PC snake_case 资料字段、旧 `/api/ai/chat`、旧 Asset 兼容调用已从本轮正式页面路径移除。`npm.cmd run check:r4-pc` 扫描 52 个生产文件通过。
- `npm.cmd run test:r4-pc` 44/44、`npm.cmd run type-check`、`npm.cmd run build` 和 `git diff --check` 通过；Vite 仍提示 Asset chunk 约 594 kB 超过 500 kB 阈值。
- R4-08 不等于真实前后端联调或人工验收：真实 Auth/Subject/Source/Asset/AI SSE、MinIO 异常路径、Tauri SQLite 升级、浏览器/Tauri GUI、离线双设备和业务验收仍未执行；`useBlockStore`、`useTaskStore` 等剩余 Store 仍待后续 R4 任务迁移。

2026-08-20 R4 Task 9–11 已完成 PC 联调前代码迁移与自动验证：

- `useTaskStore`、`useReviewStore`、`useStatsStore`、`useChatStore`、`usePomodoroStore` 已建立 typed DTO 到页面模型的边界；Dashboard、Timeline、Profile、Home、SearchPalette、SubjectWorkspace 和 Pomodoro 不再直接把 `localDb` 或旧 block Store 当作云端事实。Profile 展示当前 user/device/session，并支持撤销其它会话；Dashboard 的静态演示知识、任务和学科数据已移除。
- AI 已由 `AiStreamController` 管理取消、增量合并、citation 去重、失败和中断状态；Vite `/api`、`/ws` 开发代理只读取 `VITE_DEV_API_TARGET` / `VITE_DEV_WS_TARGET`，Tauri capability 保持 `core:default`、`log:default`、`sql:default`，未授予 shell/http/fs。
- `npm.cmd run check:r4-pc` 扫描 57 个生产文件通过；`npm.cmd run test:r4-pc` 53/53、`npm.cmd run type-check`、`npm.cmd run build` 通过。`npm.cmd run tauri -- build --no-bundle` 通过并生成 `Auralis-PC/src-tauri/target/release/app.exe`；完整 `tauri build` 在 MSI bundling 阶段被宿主权限错误 `拒绝访问 (os error 5)` 阻断，不能写成安装包验收通过。
- 本条只证明 PC 代码、类型、自动测试、Web 构建和桌面应用本体构建；真实 Server/MinIO/Provider、浏览器或 Tauri GUI、安装升级卸载、双设备同步、真实 AI SSE 和前后端业务联调仍未执行。构建保留 Asset 大 chunk 与 `useSyncStore` 无效动态 import 警告。

## 本轮验证结论（2026-08-13）

- PC：`npm.cmd run check:subject-icons` 与 `npm.cmd run check:subject-workspace` 通过。
- PC：移除弃用 `baseUrl` 并删除 `AppHeader.vue` 未使用的 `ElMessage` 导入后，`npm.cmd run build` 通过；Vite 提示部分 chunk 超过 500 kB。
- Mobile：`npm.cmd run build:h5` 通过，仍有动态/静态 import 与 Sass legacy API 非阻断警告。
- 微信小程序：`npm.cmd run build:mp-weixin` 通过，仍有 Sass legacy API 非阻断警告。
- Tablet：`node scripts\check-tablet-sidebar-transition.mjs` 通过，120ms 指示器在 160ms 路由重载前落位。
- 后端阶段 0：仓库外备份可读取，`Auralis-Server` 目标路径审计通过；新 Server `mvnw.cmd -B -ntp clean test` 退出码 0，Surefire 报告 4 份、测试 5 个全通过。
- 后端阶段 0：真实进程启动后 readiness/liveness 返回 HTTP 200 和 `UP`，`/v3/api-docs` 返回 HTTP 200、标题 `Auralis API`，Swagger UI 返回 HTTP 200；smoke 进程已停止且 8080 已释放。
- 后端阶段 1：`Auralis-Server\\mvnw.cmd -B -ntp clean test` 退出码 0，19 个测试全部通过；覆盖 V1 schema、Repository owner isolation、IdentityService、AuthController、Problem Details 和 Modulith 边界。
- 后端阶段 1：使用 test profile + H2 test-scope classpath 的临时 HTTP smoke 中，health liveness/OpenAPI 返回 200，register 返回 201、login 返回 200、token pair 存在；临时 Java PID 已停止且 18080 已释放。
- 后端阶段 2A：`Auralis-Server\\mvnw.cmd -B -ntp clean test` 退出码 0，31 个测试全部通过；覆盖 V2 schema、Subject/KnowledgeBlock/Task Repository owner isolation、默认 Subject、版本冲突、软删除/恢复、核心 MockMvc 和 Modulith named interface。
- 后端阶段 2B：`Auralis-Server\\mvnw.cmd -B -ntp clean test` 退出码 0，42 个测试全部通过；覆盖 V3 schema、Asset/Source/Relation Repository owner isolation、Source/Asset/Relation 服务规则、对象 HEAD 校验、核心 MockMvc 和 Modulith named interface。
- 后端阶段 3/4 审核修复：`Auralis-Server\\mvnw.cmd -B -ntp clean test` 退出码 0，27 个测试类、69 个测试用例全部通过；覆盖 V4/V5/V6/V7 schema、Sync 原子幂等/高水位/push/pull/并发重放/墓碑 snapshot、Review 完整状态回放、Stats completed_at、Realtime 提交后事件和架构测试。
- 后端 R1-05：`Auralis-Server\\mvnw.cmd -B -ntp clean test` 退出码 0，126 个测试通过、0 失败/错误，1 个 opt-in PostgreSQL 测试跳过；定向 `R1ConcurrencyTests`、`R1PaginationTests`、`SyncServiceTests`、`AiSchemaTests` 共 16/16 通过，ArchitectureTests 通过。覆盖 V13、Conversation baseVersion、消息写锁序号、五类核心列表 keyset cursor、Sync 定时清理配置/指标和过期 cursor reset。
- 后端阶段 3/4/R1-05 仍未证明全量 PostgreSQL/pgvector 并发、Docker、真实 MinIO、Source ingestion worker、双设备断网恢复、生产定时清理、浏览器 WebSocket/跨实例 broker、前端联调、Tauri GUI、微信开发者工具或真机验收。

## 阶段 5 AI/RAG 当前状态（2026-08-17）

- 代码实现：已完成 V8–V13、AI 配置、BYOK AES-GCM、Provider/embedding 端口、DeepSeek/OpenAI-compatible/SiliconFlow 适配器、HTTPS Provider allowlist、DNS 公网地址过滤与固定连接、来源 URL 重定向复核/固定连接、Source ingestion job 的 claim-next/lease/自动轮询/有限重试、解析/切块/embedding、PostgreSQL pgvector/HNSW 用户隔离 retrieval、H2 JSON fallback、generation 原子切换、Conversation/Message clientRequestId 幂等回放、会话版本/消息并发序号、citation、回调式 SSE 生命周期和 Suggestions 基线。
- 自动测试：R1-03 定向测试 11/11、R1-04 定向 AI 流式/Provider/Controller 测试 16/16、R1-05 定向套件 16/16 通过；`PgVectorIntegrationTests` 使用 PostgreSQL 17.11 + pgvector 容器通过 1/1，覆盖 Flyway V1→V11、HNSW、vector 写入、用户隔离、失败回滚和 Source 删除过滤；`mvn -B -ntp clean test` 通过 126 个测试，失败/错误 0，默认跳过 1 个需显式 PostgreSQL 参数启用的集成测试。
- 已修复问题：默认 local profile 缺少 `auralis.ai.encryption-key` 会使 AI 未启用的上下文也启动失败；已加入仅 local profile 使用的 32 字节开发占位值，生产仍要求 `AURALIS_AI_ENCRYPTION_KEY`，并保留空值拒绝。
- 未完成验收：全量 PostgreSQL/Compose、MinIO、外部 DeepSeek/SiliconFlow/BYOK Provider 网络/证书/限流、真实 token 流式、生产网络策略与 secret rotation、性能、前端联调和人工业务验收。受控安全测试和隔离 pgvector 容器不替代完整生产网络专项。
- 实现边界：chunk generation 原子切换、Source 删除过滤和 2026-09-27 的 ingestion 同事务入队及 revision/lease/attempt fencing 已完成代码与聚焦验证；Suggestions 真实 LLM/citations、文件解析边界（当前仅文本型 MIME）和端到端 AI 质量仍登记为未关闭风险。

以上结果只证明对应命令的执行范围，不替代 GUI、真机、真实基础设施或外部 AI 服务验收。

- 后端 R1-06/G1：默认 Surefire 自动启用 PostgreSQL/MinIO Testcontainers；系统 Maven 与 Wrapper `clean test` 均为 135 个测试通过、0 失败/错误/跳过。覆盖普通 Maven 仓库路径、全局 `open-in-view=false`、prod springdoc 关闭、local OpenAPI 保留、H2 2.2.224 和 Mockito Java agent。
- 后端 R2：已新增 Compose 固定镜像/健康检查/secret fail-fast、Java 21 非 root Dockerfile、PostgreSQL Testcontainers clean/upgrade 输入、MinIO presigned 链路、Provider stub 错误矩阵和对象孤儿核对脚本；Compose config/build/up/health、真实 PostgreSQL/MinIO 主链路均通过，异常专项和真实 Provider smoke 仍开放。
- 后端 R3/G3：`OpenApiArtifactTests` 导出并比较 `docs/contracts/openapi/auralis-openapi.json`；`scripts/check-openapi.ps1` 运行时比较通过（3/3），使用 `openapi-typescript@7.13.0` 对 PC/Mobile schema 重生成比对通过；PC `npm run build`、Mobile `npm run type-check` 和 H5 `npm run build:h5` 均通过。Mobile 通过将 TypeScript 固定为 5.3.3 与现有 `vue-tsc@1.8.27` 对齐；G3 契约迁移前置门禁已通过，但该结果不等于真实 Provider smoke 或前后端业务联调。

## 本轮验证结论（2026-08-22）

- 修复 PC 学科工作区文件登记的两个断点：前端不再对缺少文件/学科/名称静默 return，确认按钮会反映前置条件与上传中状态，失败通知保留弹层以便重试并刷新当前资料列表；Docker MinIO 将容器内 endpoint 与浏览器 public endpoint 分离，并按 CORS 白名单允许直传。
- 验证：`Auralis-PC` `npm.cmd run test:r4-pc` 82/82、`type-check`、`check:r4-pc`（60 个生产文件）通过；`Auralis-Server` `mvnw.cmd -B -ntp clean test` 149/149 通过，含 MinIO public endpoint 集成测试 2/2；Compose config 校验通过。push 后 Docker backend/frontend 已重建并健康，frontend HTTP 200、backend readiness HTTP 200/UP，MinIO CORS 预检对 `localhost:5173` 返回 204 和允许源；浏览器真实点击验收仍未自动化，不能以容器健康替代 GUI 验收。

- 修复 PC Dashboard 已排期任务拖拽后时间不变化的问题：`toTaskModel` 在显式提供 legacy `startTime` 时优先按新槽位生成 `scheduledAt`，未提供时继续保留现有 `scheduledAt`。回归测试覆盖原槽位到目标槽位的写回语义。
- `Auralis-PC`：`npm.cmd run test:r4-pc` 81/81、`npm.cmd run type-check`、`npm.cmd run check:r4-pc`（60 个生产文件）和 `npm.cmd run build` 均通过；新建任务、复习任务和 Store 缺省时长均收敛到 30 分钟倍数。构建仍保留既有 Asset 大 chunk 与无效动态 import 非阻断警告。浏览器/Tauri 拖拽实际走查仍待验收。
- Docker 测试账号 `pc-ai-test-20260821-180412@example.com` 的 17 个任务已限定范围校正：预计时长统一到 30 分钟倍数，已有排期统一到整点或半点；校验结果为 `17|0|0`（总数|非半小时用时|非半小时排期）。其他用户数据未修改。
- Docker backend 已补充安全的资产/登记生命周期日志：`ASSET_UPLOAD_INTENT_*`、`ASSET_UPLOAD_COMPLETE_*`、`ASSET_UPLOAD_READY`、`ASSET_UPLOAD_REJECTED`、`SOURCE_CREATED`；不记录文件内容、Authorization、API Key 或响应体。该日志只证明请求阶段可见，浏览器实际选择文件和业务成功仍需人工验收。
- 2026-08-22 运行态补充：用户从 `http://127.0.0.1` 访问时，upload-intent 已返回 201 但 MinIO PUT 因 CORS origin 未列入白名单而被浏览器包装为 network error；`.env` 与 `.env.example` 已加入 localhost/127.0.0.1 两组 origin。重启后 127.0.0.1 预检返回 204、frontend/readiness 均为 200；浏览器需刷新后重试。

## 人工验收边界

- Tauri 权限、GUI、插件与安装包。
- 微信开发者工具、真机、域名和平台限制。
- H5/原生 App/Harmony 等目标设备。
- Tablet 触控、手写、双指缩放、文件批注和长时间书写。
- 真实 PostgreSQL、Redis、MinIO、Milvus 和外部 AI 提供商全链路。

## 2026-09-08 Task 5 OCR 文档同步

- OCR parser、页级 continuation、全空文档 `OCR_DOCUMENT_EMPTY`、bounded/copyable diagnostics 与隐私边界已在代码实现，并有 focused Node/Rust 自动测试覆盖；本条不等同于业务验收。
- 本轮计划的 focused Node suite、PC `type-check`、`test:r4-pc` 与 OCR Rust 单元测试/`cargo check` 将分别记录实际命令结果；`cargo check` 若受本机依赖或网络环境阻断，保留精确错误，不改写为通过。
- `1.pdf` 尚未在真实 Tauri GUI 中完成打开、OCR、任务中心状态和失败态验收；真实剪贴板写入、Windows accessibility/窗口可见性以及 sidecar/日志现场观察仍待人工执行。
- 当前实现和自动化证据不能证明真实文件质量、GUI 交互或生产日志脱敏已验收；这些边界继续列为开放项。

## 本轮验证结论（2026-08-23）

- PC SubjectWorkspace 已将总结从原文件预览容器拆为独立 `· 总结.md` 虚拟文件项；原文件仍由 `FilePreview` 单独渲染，点击总结项显示独立 Markdown 文档并可下载。总结只由当前知识块实时生成，未新增后端 Source/Asset 持久化。
- `Auralis-PC` `npm.cmd run test:r4-pc` 93/93、`npm.cmd run type-check` 和 `npm.cmd run build` 通过；构建保留既有 File Viewer/Asset 大 chunk 与无效动态 import 非阻断警告。浏览器文件切换、Markdown 下载、深色和窄栏布局仍需人工验收。
- PC Dashboard 待办列表已修复窄宽布局：长学科徽标可收缩并省略，任务名称不再被挤到不可见。`npm.cmd run test:r4-pc` 94/94、`npm.cmd run type-check`、`npm.cmd run check:r4-pc`（60 个生产文件）通过；浏览器缩放和真实长名称仍需人工走查。

## 阅读与回写

- 风险、优先级、关闭条件：[问题和审查](IssuesAndReview.md)
- 未来任务：[计划入口](../planning/README.md)
- 构建/部署：[部署指南](../operations/Deployment.md)
- 已发生变化：[Changelog](../release/Changelog.md)
2026-09-15 Overview 最小 JSON 诊断已加入但尚未部署：Provider 从最终序列化 request body 记录 structured JSON 的 `responseFormat=json_object`、预算和阶段；FINAL validator 前对原始 `message.content` 直接执行 `readTree`，记录 `FINAL_JSON_CHECK` 的 valid/chars/line/column/exceptionType，不做 fence stripping，因此 fenced JSON 会 valid=false。日志不含 body、prompt、正文、原始异常 message、URL 或 key，普通聊天/流式不变。聚焦自动测试已通过，真实 DeepSeek 链路需用户重跑确认；不能将该诊断视为业务验收完成。



### 2026-10-23 Overview M5.5：严格 descriptor 相等的正文节点复用（源码、分批定向验证与唯一审查完成；未部署）

- 实现新增私有 `ExecutionNodeDescriptor.globalRoutingFingerprint`，绑定有序章节/小节职责、(alias/sourceAlias/sourceId) 分组路由、mode/instruction/system policy，同时排除其它组的 text/revision/chunk。跨 input donor 仍要求完整 descriptor JSON 与 SHA 完全相等，且完整 unit refs 与 exact prompt step 相同；global route/写作策略变化全局失配，组内变化影响相应候选。
- 保留当前 checkpoint 优先、unknown-dispatch hold、M5.4 完整 input donor 优先，再查 strict descriptor donor；命中沿现有事务物化本代 node checkpoint，不伪造 usage/reservation。Donor 继续受 owner/scope/profile/algorithm/step、SUCCESS、ASSEMBLED/VERIFIED、input 身份一致、hash/schema/14天/result expiry、source/coverage/shape 及真实 dispatched reservation 限制。
- 为新私有 descriptor 格式提升 adaptive algorithm identity，隔离旧缓存；无 DB column/migration/public API/frontend 变更。
- 定向验证：`targeted-tests.log` 中 Coordinator 26/26 + Adaptive 30/30（56/56，exit 0）；之后新增 Service 验收 2/2（exit 0），验证组 B revision/chunk/hash 变化而 global route 不变时 A 命中、B 派发；只改变 B goal 而 input 相同仍因 global fingerprint 变化使 A/B 均派发。两批不是合并的 58 case 全绿批次。唯一只读 reviewer B0/I0/O0。M5 及更广的生命周期/依赖失效目标仍未完成。



### 2026-10-23 Overview M5.6：有界安全回收 terminal generation payload（源码、定向验证与唯一审查完成；未部署）

- OverviewGenerationCoordinator cleanup 每批按确定性顺序锁定至多 100 个 terminal generation 父行，使用 FOR UPDATE SKIP LOCKED，并重读锁定后的 generation；ACTIVE（即使 lease 已过期）不会入选。仅清 SUCCESS result 当其自身 result_expires_at 已过期，且仅删除其 checkpoint.created_at 至少 14 天的 checkpoint。
- 保留 metadata、request mapping、budget、plan/node/call/reservation 与 unknown-dispatch hold；不会修改 usage reservation。14 天读取端 checkpoint 校验不变，后台物理回收分批发生，不承诺到期时立即全部清除。无 schema/API/config/frontend 变化。
- 验证分批：Coordinator+Adaptive 统一批次 61/62 通过、1 个 race fixture error（exit 1；Adaptive 32/32、Coordinator 29/30）；修正 fixture 后 affected-only 1/1（exit 0），未重跑完整 62 项。H2 双事务覆盖 SKIP LOCKED/takeover；无 PostgreSQL integration 证据。
- sole reviewer B0/I0/O0。容量上限、权限撤销、来源/账号删除生命周期仍待整合，完整 M5 未完成。未执行 full suite、package、Docker、部署或真实业务验收。
### 2026-10-23 Overview 测试追踪工具准备完成（自动验证与唯一审查通过；人工实测待进行）

- 后端追踪默认关闭；opt-in overlay 仅配置 backend 的完整内容追踪、自适应链路与 D: 本地 bind。输出为 owner/run 下的 `events.ndjson`、`summary.json`、`report.md`。报告可检查 `captureComplete`、`droppedEvents` 和事件时间线；只有用户开启 content capture 时才捕获模型正文。
- Maven focused 87/87、全量 813/813（0 failures/errors/skips）、skipTests package exit 0；Docker Compose 合成配置检查 exit 0；唯一 review B0/I0/O0。全量结果来自本任务一次完整运行，不合并历史 M5 批次。证据、最终哈希和命令见[追踪计划](../plans/2026-10-23-overview-test-tracing.md)。
- 本地追踪文件按采集器 root-preparation 时的 24 小时过期检查处理；采集器关闭后不继续自动清理。数据库 Source/账号删除不会级联清理本地导出。尚未部署、调用真实 Provider、完成 GUI/资料质量验收；本工具准备不等于 M6 整体验收。

### 2026-10-23 Overview ADAPTIVE_METADATA 冗余 summary 修复

- trace 显示在 6 次 ADAPTIVE_INDEX 后，ADAPTIVE_METADATA 返回非 null 顶层 summary；通用 schema 接受后，被 metadata shape 检查拒绝。全局 system 要求 ALL 响应带 summary，与 metadata 专用 null 要求存在冲突；metadata 输入是独立调用的轻量条目，不继承前级 response 对象。
- 已加入 metadata 专属 system 优先级说明与 Provider/checkpoint 双路径 summary=null 归一化；outline、alias coverage 和 shape 检查仍执行，writer/final 和 ADAPTIVE_METADATA_ROUTE 的 ALL summary 保留。旧 metadata checkpoint 只在读取结果中规范化，新写 checkpoint 保存规范化结果。集中 focused 验证：OverviewAdaptiveGenerationTests 40/40，0 failure/error/skip，Maven exit 0。未部署、未重跑真实 Provider/GUI。


### 2026-10-23 总览阶段校验与本机预算收尾

- 主 Agent 直接修复：索引、元数据、目录和正文的阶段覆盖/形状校验在通用调用保存检查点前执行，恢复读取执行相同校验；正文内部顶层冗余 summary 规范化为空，最终目录摘要保留。目录请求校验别名收窄到实际 unit aliases。
- 预算拒绝日志增加阶段、资源、required/remaining；Overview MAP/REDUCE 与总任务共用 overviewMaxCalls，本机 trace overlay 临时设为64，默认24、Token预算524288及历史账本不变。
- 主 Agent 定向验证 OverviewAdaptiveGenerationTests + AiOperationPolicyTests：44/44，0失败/错误/跳过。此前两轮分别发现目录别名集合过宽、异常包装改变既有错误消息，均修复。证据 D:/Temp/auralis-pipeline-fix-20261023/tests-final.log。未调用真实 Provider；完整业务验收待重试。
- 既有不合格检查点会被拒绝，不自动删除；本轮没有增加全新任务预算入口，也未重置用量。当前仅修复新结果写入前的校验边界及恢复校验。

### 2026-10-23 Overview 预算路径第一批修正

- 修复证据：两个实际 run 的索引原文相同，但 Map.of 材料字段顺序在进程重启后不同，使精确提示词 checkpoint 指纹变化。索引及正文材料改为 TreeMap 固定字段顺序；旧不同文本指纹不作兼容匹配，新请求稳定后可按原规则复用。
- Writer preflight 不再将全部最大预留的总和作为硬拒绝条件；总和以 aggregateUpperBound 记录，先检查最大单请求预留能否装入当前余额，逐次派发仍由 Guard 原子预留并按实际 usage 结算。余额不足仍会中途停止，已有 verified checkpoint 保留，不保证整篇一定完成。
- Adaptive 单次预算评估改读持久化 task charged + reserved，包含历史尝试，避免日志把本轮余额当累计余额。新增日志包含 uncachedWriters、aggregateUpperBound、largestRequestReserve、charged、reserved、remaining。
- 定向 OverviewAdaptiveGenerationTests、OverviewBudgetIntegrationTests 共50/50通过（exit0），证据 D:/Temp/auralis-budget-path-20261023/tests.log；未运行全量、真实Provider或GUI。输入估算校准、动态输出预算、明确的预算暂停/恢复状态与用户可读预计成本仍待实现，本条不表示完整优化路线交付。
- 本批后端已部署：sha256:84c96a9c04c9e879a5f294b73cbedb156581931b1f0b5cd278992a66dcea8a8d，Docker healthy、readiness HTTP 200。仅backend更新，未触发真实Provider。

### 2026-10-24 Overview 正文预算路径续接（源码与定向验证完成；未部署）

- 本小阶段唯一 Luna 只读审查完成：BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0，证据 `D:/Temp/auralis-budget-path-20261024/review.md`。审查不替代下列尚未执行的服务级 PostgreSQL 恢复测试或真实正文验收。

- ADAPTIVE_WRITE 使用完整 writer 输入/结构材料推导 4608–6144 的单次输出预留；4608 为没有真实 writer 样本时的保守工程下限，不是质量结论。长材料保留 6144 上限及原拆分，预算余额不改变输入或内容输出目标。
- 同一 cap 贯穿 packing/context fit、writer preflight、Provider 请求、Gateway/Guard reservation、truncation detection 与 writer checkpoint/journal descriptor step；截断诊断使用实际出站 cap。逐次 Guard 仍以持久 charged + reserved 为准，forecast aggregate 只记录不拒绝整篇任务。
- 预算拒绝继续复用原 generation 与 budgetTaskId，保持已验证 checkpoint 和既有 charged ledger；通过原 `AI_TASK_BUDGET_EXCEEDED` 错误路径返回，不引入 PAUSED 命名、schema 或 API 字段。Coordinator 定向测试验证失败重试保留 generation/budgetTaskId 与 charged 状态；新增的 service/PostgreSQL 预算耗尽恢复用例未能运行，因此本轮不把服务级“不重复消费 checkpoint”标记为已验证。真实 TCP/SSE 定向用例只证明 422 error event 映射。
- 集中批次最终命令 `mvnw.cmd -B -ntp "-Dtest=OverviewAdaptiveGenerationTests,OverviewDynamicBudgetComponentTests,OverviewBudgetIntegrationTests,OverviewGenerationCoordinatorTests,OverviewSseSocketIntegrationTests" test`，exit 0；111/111（43+16+35+8+9），证据 `D:/Temp/auralis-budget-path-20261024/tests-retry-2.log` 与 `.exit`。首次批次 exit 1：新增 SSE 用例在 response 提交前同步抛错导致 HTTP 422 时序断言失败，且 RecoveryTests 的 Testcontainers 无可用 Docker；修正 SSE fixture 时序后重跑相关批次，排除 RecoveryTests。RecoveryTests 的服务级预算停止/恢复用例已写入但未执行；`docker version` 显示 daemon pipe 不存在。未调用真实 Provider、未部署、未运行前端或 GUI；真实 writer 样本和正文质量仍待评估。
- 2026-10-28：目录路由提示词增加 topic ID 单一 section 归属提醒，用于防止 topic000175 跨节重复；源码候选尚未部署，未验收模型效果。

### 2026-10-31 Chat 原始 assistant content 本机诊断捕获（源码候选，未部署）

新增临时本机捕获开关，默认关闭；本机 `.env` 当前仅将 `AURALIS_AI_CHAT_DIAGNOSTIC_RAW_CONTENT_ENABLED=true` 用于用户要求的后续复现。文件按 run/attempt/iteration 分开保存 Provider 已解码的 assistant `delta.content`，UTF-8 重编码、保持文本顺序/空白/围栏；不等于 wire 原始 SSE JSON，不捕获 reasoning、prompt、工具、headers 或凭据。每 attempt 跨 iteration 累计字节受 `AURALIS_AI_PROVIDER_MAX_RESPONSE_BYTES` 限制（默认 1 MiB）；日志仅元数据。I/O 失败不影响 Chat。部署/重建后才生效，未触发真实模型调用。捕获文件保留至用户手动处理，复现后需关闭开关。

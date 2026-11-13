# PC 前端模块

### 2026-11-12 文件与学科大纲 Markdown 排版与层级样式重构（源码与生产构建通过）

针对学科工作区二级大纲抽屉中文件大纲（`FileOutlineList.vue`）和学科总览大纲（`SubjectOverviewSection.vue`）Markdown 结构缺乏视觉节奏、H1 字体过大粗暴、章节议题（H2）无段落间隔与标记、列表条目无圆点引导等排版丑陋问题，完成符合 Auralis Zen Minimalist 审美体系的排版样式重构：
- **容器与呼吸空间**：`.file-outline__markdown` 与 `.subject-outline-markdown` 内边距统一调整为 `10px 12px 14px`，行高设为 `1.6`，补齐 `word-break: break-word;`；
- **文档主题标题 (`h1`)**：规范字号为 `13.5px`，字重 `700`，行高 `1.45`，搭配底部中性发丝边框 `border-bottom: 1px solid var(--border-subtle)` 与前置 5px Zen Sage 柔和圆点徽标；
- **主要议题模块 (`h2`)**：规范字号为 `12px`，字重 `650`，顶部赋予 `13px` 明确外边距建立视觉分段；左侧内嵌 `3px × 11px` 的 Zen Sage 垂直药丸胶囊微晶指示条（`::before`），第一项或紧随 H1 的首个议题自动收窄为 `margin-top: 4px`；
- **小节与次要层级 (`h3`, `h4`)**：H3 设为 `11.5px`，搭配方形微晶点；H4-H6 紧凑微型排版；
- **要点列表与列表项 (`ul`, `ol`, `li`)**：去除原生粗糙点阵，外层 `display: flex; flex-direction: column; gap: 5px;`；列表项 `li` 设为 `11.5px`，左侧预留 `14px` 缩进并内嵌 `4.5px` 浅草绿柔和微圆点（`opacity: 0.65`），悬浮时轻微微动（`transform: scale(1.15)`）；支持嵌套列表与嵌套空心环；有序列表自动绑定 CSS counter 优雅编号；
- **排版细节与暗色模式**：对行内 `code`、`blockquote`、`hr` 补充 Zen Minimalist 规范，暗色模式（`html.dark`）下自动映射柔和灰阶与微光底色；
- **冲突预览与构建闭环**：清除历史残留的重复属性与旧未闭合标签，`SubjectOverviewSection.vue` 完整对齐 `outlineMarkdown`/`summaryMarkdown` v2 契约；`npm run type-check` exit 0，`npm run build` exit 0，定向测试 154/154 全部通过。

### 2026-11-12 个人中心文件解析进度卡片截断与溢出修复

修复了个人中心左侧数据透视面板中文件解析进度卡片（`DocumentProcessingCenter.vue`）横向溢出问题：
- 在 `DocumentProcessingCenter.vue` 中为 `.processing-list` 约束网格单列轨道 `grid-template-columns: minmax(0, 1fr); width: 100%; min-width: 0;`；
- `.processing-item` 显式设置 `box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%;`；
- `.processing-item-meta > span` 与 `.processing-error` 统一收窄并支持省略截断 `flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`；为 `<strong>` 增加 `:title` 原生 Tooltip；
- 在 `Profile/index.vue` 的 `.studio-left` 与 `.studio-right` 补齐 `overflow-x: hidden;`，并对 `.studio-left > *` 设定 `max-width: 100%; box-sizing: border-box;`，确保在任何视口或窄屏断点（320px–480px）下右侧操作按钮和状态药丸徽标完整可见。

### 2026-11-12 Overview 旧协议残留清理

正式结果响应仅接受 v2 Markdown 契约，`outlineVersion/summaryVersion` 必须分别提供非负整数，不再从总版本补值或将旧 v1 成功响应适配为缺失。HTTP 404 仍表示缺失；409 中的旧行真实版本元数据继续用于显式替换，不能当作内容显示。

缓存查询仅投影现行 Markdown 列，历史 JSON 列和旧行保留。旧格式拒读、旧 outbox 停用、当前 v2 本地结果补传、编辑及删除围栏保持。移除无运行调用的 `CandidateInput` 类型与请求字段；新生成、渲染及同步行为保持。

### 2026-11-12 Overview Markdown 接入（源码、定向验证与构建完成）

Overview 内容采用 `schemaVersion=2` 的 `outlineMarkdown`、`summaryMarkdown`。生成分项允许另一项 null；正式完整结果两项均为非空文本。两项复用现有 Markdown 渲染，大纲编排入口改为直接编辑 Markdown；移除旧章/节结构及 provenance 调用，不自动把旧结构转成新内容。Antigravity 完成主要接入，主 Agent 接手验证收尾。

生成/保存保留取消、加载缓存、编辑保护、来源修订和冲突流程。旧服务器 v1 内容 GET 缺失，重新生成 ALL 后可能收到仅含 `{version,schemaVersion}` 的冲突元数据；保存真实版本，保留草稿，由用户明确重试本地内容，不渲染元数据或无限以 baseVersion=0 重试。分项 PUT 只携带更新分项的生成时间；持久化前拒绝空白 Markdown。

SQLite schema 升至 14，为缓存追加 Markdown 列并保留旧行；旧格式内容与 outbox 不转成新结果。只读审查发现的三项已修复关闭，最终测试/构建状态见当前状态；未进行真实 Tauri、双账号或端到端同步验收。

### 2026-11-13 PC 大纲编辑与总览同步

文件大纲的读写按当前解析修订查找，修订未知时仅展示已有结果。文件和学科大纲保存均确认提交时的文本，后续输入留在编辑器中。

总览同步用完整的有效文件清单校验待写记录，以每批最多 500 个文件处理全部清单，再按每批最多 100 个学科查询状态。文件处理结束后才组装学科来源清单。来源已更新时重新核对修订后再判定待写记录是否过期。单个学科超过 100 份文件时，仍会跳过该学科的总览同步。

### 2026-11-11 解析上传 receipt 类型收窄

`ParsedDocumentUploadCoordinator.validateReceipt` 在既有 v1 receipt 校验成功后，以类型断言保证 `sourceAssetSha256` 为字符串，随后构造符合现行必填 SHA-256 契约的上传申请。

### 2026-11-13 学科工作区文件删除与选中项回退

已登记文件在本地原子写入 Source 墓碑和 DELETE outbox 后从列表移除。仅本机的文件还需写入草稿的 `DELETED` 状态，防止恢复流程重新登记。工作区随后从同学科剩余文件中选取列表首项，列表为空时回到总览。期间用户已改选的文件或已切换的学科优先。

总览、解析和资产清理沿用既有后台恢复路径。后台移除活动学科的派生总览后，以账号和设备范围通知工作区刷新。旧学科、旧列表或旧登录会话的读取不能覆盖当前视图，删除通知也不会结束新一轮生成。

### 2026-11-11 文件预览失败的手动重试

学科工作区和资料库使用的 bare 文件预览，在带资产 ID 的文件加载失败时，于错误区域提供现有风格的「重试」按钮，复用 `loadPreview` 及原有请求隔离。加载期间不重复发起重试；不主动轮询或自动重试。错误文案仅在实际提供下载入口时建议下载。现有阅读器、分页和正常预览样式保持，错误区提示文字的样式选择器限定直接子元素，避免影响按钮内部文字。

### 2026-11-11 全局搜索与知识详情复制

- `SearchPalette` 的关键词变化立即使上一轮搜索失效，防抖及本地读取期间不接受旧结果的回车或点击。清空、关闭及后续查询取消旧请求的提交资格，迟到读取不覆盖当前结果；输入法组合期间的回车不触发导航。
- `KnowledgeBlockViewDialog` 自行完成复制：优先调用 Clipboard API，不可用或拒绝时尝试临时文本框复制，结束后恢复焦点及正文选区。只有实际成功才显示成功反馈；两条路径均失败时使用现有消息提示手动复制。父页面无需处理复制事件，本轮未修改 Timeline 的既有绑定。
- 两个组件模板和 CSS 保持；本轮无 API、数据结构或同步字段变化。

### 2026-11-13 学科工作区知识块编辑与同步

学科工作区的知识块详情按 ID 跟随本地投影。编辑时保留草稿和原版本，确认使用新版本继续编辑时只合并未改字段。同步冲突显示本机内容与当前云端状态，用户可采用云端版本，或以最新版本重试本机修改。两处创建入口共用提交锁，失败保留草稿。删除校验确认时的版本，收到明确的云端拒绝回执后按服务器记录恢复有效知识块或保留墓碑。

### 2026-11-11 学科创建与资料编辑、加载修复

- 学科新建和改名均在当前账号的本地仓储中检查活动学科名称。比较时去掉首尾空白并忽略大小写，改名排除自身，保存时去掉首尾空白并保留输入的大小写。保留原名时可照常编辑其他字段。重名在写入投影和 outbox 前被拒绝，学科大厅保留表单并提示换名。校验范围是本机已知学科。
- 资料库知识块详情使用独立编辑副本，后台刷新保留已编辑标题、正文及原版本，未编辑字段跟随投影。远端版本变化后保存旧草稿提示冲突，显式重新打开条目读取最新内容；删除投影关闭详情。`updateBlock` 使用仓储现有活动资源与版本原子检查，避免旧详情覆盖墓碑或较新版本。
- 学科工作区进入和切换时，Chat 初始化与本地资料读取同时启动，缓存文件、知识块无需等待 Chat 返回。初始化期间点击文件复用该请求，后续会话处理重新核对页面、学科及切换代次；当前学科初始化返回的会话 ID 与活动会话一致后才允许发送、快问、重试和活动提交。初始化失败保留输入，可通过现有新会话操作恢复；成功初始化不重复启动。布局与样式保持，发送按钮仅补充就绪禁用条件。

### 2026-11-11 任务编辑、删除与连续排期

- 资料管理的任务详情使用独立编辑副本。同步和资料列表刷新时合并未编辑字段，保留当前任务未保存的改动。显式保存写回 Task Store，切换条目或任务被删除时清理旧编辑副本。详情顶部的“删除任务”使用现有确认弹框及 Task Store 软删除流程，适用于未排期和已完成任务。
- 取消排期尚未结算时，拖回周视图日列仍从当天首个符合时长、冲突和截止条件的槽位开始，使用现有 `SCHEDULE_INSERTION` 排在取消命令之后。其他周列拖放沿用单 Task 更新。
- 取消排期对应的 `TASK/UPDATE` 收到与源任务匹配的 `REJECTED / RESOURCE_NOT_FOUND` 空 `current` 时，从快照恢复受影响任务（含软删除记录），结算队首及撤回未发送的后继排期，再继续增量下拉。快照不可用或缺少受影响任务时，按原 mutation ID 重试。

### 2026-11-11 未核对复习从计划入口继续

`SubjectReviewPane` 的计划复习候选包含普通到期卡片及现有 Store 可恢复的未核对初选，按知识块去重计数，继续沿用 Store 中待核对优先、普通到期互斥的队列规则。结束本轮或重新读取持久化状态后，未核对卡片仍能从原复习入口进入 REVIEW_CHECK，沿用原 reviewId，不重复提交初选。确认或纠正后退出待核对集合，既有到期计算、每组题量和自测抽样保持。页面仅调整候选筛选、计数和对应说明，CSS 保持。

### 2026-11-11 资料导入、处理状态与手动恢复

- 复查补充：原生文件选择器读取 File 后清空 input 值，选择器与拖放混用时再次选择同一文件仍触发更新，提交最后一次选择并保留自定义标题。已登记任务在 Runner 自动重试期间复用原文件；Runner 返回后、上传前移除解析输入映射，临时文件清理仍沿用既有调度生命周期；runtime 停止或切换 scope 时清理并替换输入集合，旧调度不能回填当前集合。
- `FileRegisterDialog` 换选文件时更新默认标题，用户自定义标题保留；Asset 页拖放的首个文件直接传入登记弹窗。上传始终使用原始 File，Source 单独保存标题。`useAssetStore` 和 `FilePreview` 使用本地资产记录或 download-url 响应的 `originalName/mimeType` 取得实际输入；预览请求以资产身份隔离，修改标题不改变格式。非草稿解析 runtime 也从 Asset 取得输入。历史已错误保存的原文件名不会自动重写。
- `LocalParsedDocumentCoordinator` 的解析重试与仓储状态机对齐。网络暂停由持久化状态识别，scheduler、启动、同步与联网恢复均不自动继续；草稿与已登记任务由处理中心的明确继续操作恢复，已有 receipt 保留上传进度。解析超时等非网络可重试错误沿用既有策略。
- `DocumentProcessingCenter` 在本地 READY 后展示仍未 READY 的服务端 Source，保留索引状态、失败重试入口和轮询。草稿的网络暂停沿用现有行与按钮样式提供继续操作。此次未更改样式。
- 自动验证、审查和真实客户端验收边界见 [当前状态](../current/Status.md)。

### 2026-11-11 Chat 会话隔离与断流状态恢复

`useChatStore` 的加载/创建、学科会话前置查询及映射写回、流回调、轮询与取消响应提交均核对本地操作世代、登录世代和用户/会话身份。新会话或重新加载使旧操作失效，迟到错误和 finally 不清理新状态。

新会话创建失败且原操作仍有效时，Store 为原活动 run 恢复状态轮询，UNKNOWN 保留显式恢复。工作区恢复同一登录、同一学科且仍选中的原会话就绪标记并提示失败；保留输入，迟到失败不能恢复其他学科或账号的会话。

断流后只查询原 run：RUNNING 保持占槽并继续轮询，UNKNOWN 停止轮询并暴露显式恢复，终态重新读取历史并按服务端 userMessageId/currentReplyMessageId 恢复 run/attempt 关联，保留失败后的重试能力。最多 220 次查询、1.5 秒间隔覆盖正常 300 秒 attempt；到限保留真实 active/停止状态并提示尚未确认，不伪造终态，不自动调用 Provider。原始命令快照重发保持。

类型检查通过；首批 53/53，审查修正后的受影响套件 13/13，其余 41 项未重复运行。源码、真实 Store 的受控传输/虚拟时钟回归及唯一只读审查完成；浏览器/Tauri 与真实服务时序待验收。

### 2026-11-13 PC Chat 断流与恢复

有 run ID 时，SSE 提前结束或断开都查询原 run。状态仍在执行或暂时查不到时保留停止入口，并在现有上限内继续查询。首帧前结束时保留原命令，供用户显式重试。UNKNOWN 恢复按服务端消息 ID 关联原 run 和 attempt，核对会话和操作世代后再更新消息。规范题卡按协议 1 的现行字段显示，旧会话的题卡与回复仅供查看。非规范历史题卡不可作答。

### 2026-11-11 Chat 首帧前断线的原命令重发

`useChatStore.runCommand` 首次派发时在消息内保存实际命令的独立内存快照。没有 `runId` 的重试复用该快照，保留相同 request ID、readingContext 的省略或存在、引用文本和活动 submission ID/答案，不再根据当前会话或 requestOptions 重建命令。已有 run ID 仍调用现有 attempt 重试接口。既无 run ID 又无快照时，在改变消息状态或清理回复前明确拒绝重发；快照不新增持久化格式。

类型检查与定向 41/41 通过，含真实 Store/Controller 与受控 fetch 的连续重发、元数据变化、首次范围、活动提交及既有 run 重试验证。未做真实服务端首帧丢失联调，具体证据见当前状态。

### 2026-11-11 PC 受保护请求的登录隔离

- 普通和 AI Axios 客户端在调用时记录 Auth Store 的本地登录世代，在附加凭据、交给传输 adapter、处理响应和 401 重放前复核。退出后重新登录同一账号也会使旧世代失效。旧请求以 `SYNC_SCOPE_CHANGED` 结束，迟到结果不会作为当前会话的业务响应返回。
- 普通请求、同步请求和 SSE 刷新调用共享当前登录世代的一次在途刷新。Auth Store 的 `sessionId` 是本次登录稳定的本地票据标识，`serverSessionId` 随 token pair 原子轮换。持久化的 `auralis_auth_session.sessionId` 保存当前服务端 sid，应用重启时以此初始化本地标识。
- Chat 发送与重试的原生 SSE 在调用时绑定登录世代，派发、401 刷新与事件投递前均复核。业务请求最多重放一次。刷新失败时，当前失败世代的普通/同步 Axios 与 Chat SSE 共用一次登录导航。
- 登录、注册、显式刷新和健康检查保留公开入口。登出使用发起世代的 access token，沿用单次发送。个人空间将确认、清理、结果通知和登录页导航绑定到发起登出的登录世代。

### 2026-11-05 Chat 会话级资料读取范围绑定与生命周期治理（PC Handoff 完成，定向验证通过，待部署）

- **会话资料读取范围状态感知与生命周期（Reading Scope Lifecycle）**：
  - 基于 OpenAPI 同步的必填契约，在 `src/types/chatProtocol.ts` 与 `src/store/useChatStore.ts` 中建立会话范围状态体系：
    - `chatScopeState: 'LEGACY' | 'UNBOUND' | 'BOUND'`；
    - `chatScope: ChatConversationScope | null`（包含 `retrievalMode`, `subjectId`, `currentSourceId`, `sourceIds`）；
  - **首轮绑定与后续轮次省略继承（Turn Request & Scope Inheritance）**：
    - 新会话初始处于 `UNBOUND` 状态，首轮提问前允许用户自由选择范围（当前学科 `SUBJECT`、当前文件 `AUTO` 或勾选文档 `SELECTED_SOURCES`）；
    - 首轮发送携带完整规范化的 `readingContext`（通过 `buildReadingContext(options)`）；首轮成功准入（admitted turn）后，端侧原子将会话状态转为 `BOUND` 并持久化 committed scope；
    - 恢复会话（Resume）或后续普通提问（ordinary later turns）：对已 `BOUND` 会话在 scope 匹配时，**前端显式省略 `readingContext`（传 `undefined`，JSON 序列化中剔除）**，由服务端依据数据库中已锁定的会话 scope 自动继承并在每 attempt 独立捕获资料 READY/revision 状态；
  - **范围冲突（409 `CHAT_SCOPE_CONFLICT`）与转换治理**：
    - 对已 `BOUND` 会话若用户显式请求不同资料范围，服务端准入事务返回 HTTP 409 `code: "CHAT_SCOPE_CONFLICT"`；
    - 前端捕获后将其视为范围转换请求（scope transition），**从 `messages` 列表中剔除本地乐观追加的 USER 消息**，提示用户并提供【开启新会话】操作按钮，**严禁**作为传输故障重发回当前会话；
  - **历史旧会话（`LEGACY`）只读封存**：
    - 服务端 V44 迁移前历史会话标记为 `chatScopeState: 'LEGACY'`，严禁从旧消息推断范围；
    - 前端彻底禁用新提问与重试：`isLegacySession` 守卫拦截发送、输入框禁用加提示文案、`pendingMessage` 计算属性直接返回 `null` 禁用重试，并在错误条提供开启新会话入口；
  - **工作区联动与恢复（SubjectWorkspace/index.vue）**：
    - 监听切换会话事件，自动依据活跃会话的 `chatScope` 还原 committed scope 选项目标；
    - 范围切换拦截与极简视觉：已绑定或历史会话锁定文档切换按钮（`isScopeLocked`），保持自然极简视觉（不显示生硬锁图标），点击时拦截下拉展开并在右上角弹出轻量通知，引导用户点击右上角刷新按钮开启新对话重选；
    - **工作区文件预览与已锁定范围完全解耦**：引入 `boundScope` 单一事实来源，已绑定会话下 `aiChatReferenceOptions()`、`aiSourceSummaryText`、`aiSourceSummaryTitle`、`isAllAiSourcesSelected`、`isAiSourceSelected`、`showProcessingRequired` 严格依据 `boundScope` 计算，用户在工作区预览切换其他文件时不会篡改已锁定的资料选项或胶囊文案，后续轮次继续继承已绑定资料，彻底避免误发 409 `CHAT_SCOPE_CONFLICT`。
- **验证与审查**：
  - 定向自动化测试套件 `scripts/r4-chat-recovery-handoff.test.mjs` 8/8 全部通过（含 `isScopeMatching` 乱序 sourceIds 判定、UNBOUND 首轮绑定、BOUND 次轮省略 readingContext 继承、409 拦截并清除乐观消息、LEGACY 禁用提问与重试、已锁定会话工作区切文件不篡改范围选项与继承）；
  - 关联套件 `r4-chat-content.test.mjs`、`r4-ai-stream.test.mjs` 与 `r4-chat-session-guard.test.mjs` 28/28 全部通过（全量 36/36）；
  - PC 类型检查 `npm run type-check` exit 0；生产构建 `npm run build` exit 0。

### 2026-11-05 Chat 全学科资料读取请求契约与 UNKNOWN 显式恢复接入（源码完成，定向验证通过，待部署）

- **全学科自主选资料请求映射契约（Step 4 Frontend Handoff）**：
  - 在 `src/api/aiClient.ts` 中更新强类型定义 `ReadingContextDto`（`subjectId: string; retrievalMode: 'AUTO' | 'SELECTED_SOURCES' | 'SUBJECT'; currentSourceId?: string | null; sourceIds?: string[]`）；
  - 在 `src/store/useChatStore.ts` 中实现统一规范化构造器 `buildReadingContext(options)`：
    - `retrievalMode === 'SUBJECT'`：严格输出 `currentSourceId: null` 与 `sourceIds: []`（杜绝遗漏或传错导致服务端 `VALIDATION_FAILED` 拒绝）；
    - `retrievalMode === 'AUTO'`：输出 `currentSourceId: options.sourceId || null` 与 `sourceIds: []`；
    - `retrievalMode === 'SELECTED_SOURCES'`：输出 `currentSourceId: null` 与 `sourceIds: options.sourceIds`；
    - `selectionText` 截断至前 4000 字符，在命令顶层发送。会话范围继承时仍可独立携带本轮引用。
  - `useChatStore.sendMessage` 使用 `buildReadingContext` 构造首发范围；无 run ID 的 `retryPendingMessage` 复用首次命令快照。`SubjectWorkspace` 默认提问直接以 `SUBJECT` 模式发送，保留显式选择资料时的窄范围模式。
- **Chat UNKNOWN 显式恢复与状态机门禁（Chat UNKNOWN Recovery PC Handoff）**：
  - 在 `src/api/aiClient.ts` 中接入 `recoverChatRunAttempt(conversationId, runId, attemptId)`，对应 `POST /api/ai/conversations/{conversationId}/runs/{runId}/attempts/{attemptId}/recover`；
  - **显式用户操作与反自循环守卫**：
    - 严禁将恢复作为自动轮询、超时清理或自动重试执行；
    - 在 `pollRunStatusUntilSettled` 中，当服务端返回 `status === 'UNKNOWN'` 时立即终止 60 次轮询并置 `isStreaming = false`，记录当前 UNKNOWN 目标，消除无谓网络消耗；
    - 在 `loadMessages` 中，对处于 `UNKNOWN` 状态的活跃 run 保持 `isStreaming = false`，不发起自动轮询，暴露显式恢复入口；
  - **请求与响应 Ticket Guards**：在 `recoverUnknownAttempt` 中记录 `targetUserId`、`targetSessionId`、`targetRunId`、`targetAttemptId`，仅在网络返回时四者仍完全吻合才应用变更，杜绝迟到恢复响应覆盖新 attempt 或会话；
  - **HTTP 409（`CHAT_RECOVERY_NOT_ALLOWED`）处理**：捕获 409 异常后仅主动刷新当前 run 状态（`getChatRunStatus` 与必要时 `getConversation`），**严禁**自动重复 recover 或发起 retry；
  - **终端状态流转与重试闭环**：未解决 attempt 恢复后服务端终结为 `FAILED`（错误码 `CHAT_UNKNOWN_ABANDONED`），释放会话槽位；刷新后消息列表原位更新为 `FAILED`，用户可通过既有重试按钮发起新 attempt；若已提交 activity 则保留为 `COMPLETED`；
  - **UI 交互与呈现**：在 `SubjectWorkspace/index.vue` 中为 UNKNOWN 状态增加专属微晶提示条（`.chat-recover-banner`）与气泡内联操作按钮；输入框发送按钮感知 `recoverableTarget` 并禁用加提示，防范锁槽期间重复敲回车；统一使用“恢复状态”文案，绝不呈现为“取消 Provider”。
- **验证与审查**：
  - 定向自动化测试套件 `scripts/r4-chat-recovery-handoff.test.mjs` 3/3 全部通过（覆盖三种检索模式契约、UNKNOWN 识别与 Ticket Guard、409 刷新防重发）；
  - 关联套件 `r4-chat-content.test.mjs` 与 `r4-ai-stream.test.mjs` 28/28 全部通过（全量 31/31）；
  - PC 类型检查 `npm run type-check` exit 0；全量生产打包 `npm run build` exit 0；
  - 独立 Reviewer 子代理只读审查通过（BLOCKER=0、IMPORTANT=0、OPTIONAL=2）。未部署，尚未执行真实桌面环境联调走查。

### 2026-11-04 用户资料头像存在提示（hasAvatar）契约接入与 404 抑制（源码与自动验证完成，未部署）

- **UserView 强类型与按需拉取守卫（Avatar Presence Contract）**：
  - 同步 OpenAPI 生成契约，`UserView` 包含必填布尔字段 `hasAvatar: boolean;`；
  - `src/store/useAuthStore.ts` 的 `loadAvatar()`：
    - `hasAvatar === false` 时彻底跳过 `GET /api/auth/me/avatar` 网络请求，清理本地显示并删除 IndexedDB 离线缓存，直接返回空字符串；
    - `hasAvatar === true` 时才读取离线缓存并向远端发起 GET；
  - **404 平滑回退**：若远端返回 404（跨设备删除或并发变更），将本地 `user.hasAvatar` 置为 `false`，清理缓存并平滑回退至首字母占位默认头像；
  - **状态即时同步**：在 `uploadAvatar`（上传成功）、`resetAvatar`（重置成功）及 `updateProfile`（资料更新成功）后，即时同步 `authStore.user.hasAvatar`；`fetchMe()` 亦同步按 `hasAvatar` 调度展示与清理。
- **验证与审查**：
  - 定向测试套件 `scripts/r4-profile-live-links.test.mjs` 8/8 通过，`scripts/r4-auth-session.test.mjs` 3/3 通过；
  - PC 类型检查 `npm run type-check` exit 0；只读 Reviewer 差量复审通过（BLOCKER=0、IMPORTANT=0、OPTIONAL=0）。

### 2026-11-04 学科总览批量状态查询与 404 循环抑制（源码与自动验证完成，未部署）

- **总览批量状态协议与接入（Overview Batch Status Query）**：
  - 在 `src/api/useOverviewResultsApi.ts` 中实现 `getSubjectStatuses(subjectIds: string[])`，对应 `POST /api/overview-results/subjects/statuses`；
  - 响应校验拦截器 `asOverviewSubjectStatusesResponse`：严格校验 `AVAILABLE` 项的 `version`（允许 `version >= 0`）、`outlineVersion`、`summaryVersion` 与 `updatedAt`（非空字符串）；缺失元数据抛出协议错误；`MISSING`/`UNAVAILABLE` 项四个元数据字段统一规范化为 `null`；
  - 状态接口 404、网络或鉴权错误直接上抛中断，禁止降级掩盖或退回逐学科 GET。
- **总同步调度与草稿/种子保护（Overview Results Sync Service）**：
  - 在 `src/services/overviewResultsSyncService.ts` 的 `reconcileInternal` 中：对学科 ID 列表去重，按每批最多 100 个 ID 进行切片批量查询；空学科列表不发出 HTTP 请求；
  - `syncSubject` 调度逻辑：优先保障本地 outbox 写入队列；无 intent 时：
    - `MISSING`：直接返回跳过单 GET，同时检查本地若有完整记录 `validCompleteRecord(local)`，则安全排队 `enqueueLegacySeed(local)` 执行首传并 flush；
    - `UNAVAILABLE`：跳过，不发 GET，不直接删除本地草稿或资源；
    - `AVAILABLE`：检查本地完整副本匹配性（`state && validCompleteRecord(local) && state.version === status.version && state.outlineVersion === status.outlineVersion && state.summaryVersion === status.summaryVersion && state.updatedAt === status.updatedAt`），完全吻合时跳过 GET；缺失或不匹配时发起单 GET，并发 404 正常收敛为空结果。
- **验证与审查**：
  - 定向测试套件 `scripts/r4-overview-sync.test.mjs`（38/38 通过，含 10 组批量状态、分批、去重、404 阻断、本地种子上传等新增断言）；
  - PC 类型检查 `npm run type-check` exit 0；关联测试 `r4-overview-cache.test.mjs`、`r4-overview-generation.test.mjs`、`r4-sync.test.mjs` 均通过；只读 Reviewer 差量复审通过（BLOCKER=0、IMPORTANT=0、OPTIONAL=0）。

### 2026-10-31 Chat Display Tool 协议接入与有序时间线状态机（源码与自动验证完成，真实客户端待验收）

- **有序多片段时间线状态机（Ordered Timeline State Machine）**：重写 `src/services/aiStreamReducer.ts` 与 `src/store/useChatStore.ts`。彻底废除原本单一字符串聚合模式，一条回复内部按到达顺序维护 `ChatContentPart[]`：过程区（`reasoning_content` 与工具胶囊）与内容区（Markdown 文本片段和结构化卡片）按时间线严格交叉保序，收到 `text.delta` 逐字追加，收到 `block.*` 原位渲染/更新，绝不把前后文字合并推到末尾。每个事件校验 `runId`、`attemptId` 与严格单调递增的 `sequence`，丢弃乱序与迟到事件，杜绝跨会话串台。
- **三段式组件渐进渲染**：`src/components/chat/ChatContentBlock.vue` 与 `ChatActivityCard.vue` 消费标准事件：
  - 收到 `block.started` 率先渲染外框壳体与类型徽标（GENERATING 态）；
  - 收到 `block.item` 校验后推入数组，以 140ms 节奏逐项弹出；
  - `steps` 顺次展示步骤；`compare` 严格保持每个维度的垂直列表和源顺序（不跨维度误横向配对）；`roadmap` 呈现节点与标签/当前位置；`chart` 仅渲染 `bar` 或 `proportion`；
  - 收到 `block.completed` 原位全量替换为最终 part；若遇到 `block.error` 或异常断流，保留已渲染有效项并将卡片置为 `INVALID`，隔离异常不影响其他正文。
- **题卡交互、草稿保护与重试闭环**：
  - `quiz` 与 `question` 收到 `block.started` 时展示生成态骨架，服务端提交 READY 事务并通过 `block.completed` 发布规范题卡后解锁作答；
  - 纯粹输入收集体验：提交后变为 `SUBMITTED`，仅展示已作答项，不渲染红绿对错与分数，不重复生成原题冗长气泡；未提交的输入在端侧本地受保护；
  - 提交携带幂等 `submissionId`、`questionId` 与答案发起请求，服务端持久化后自动接续下一轮助手流式点评；
  - 若点评中断或失败，提供内联“重试回复”按钮，复用同 `submissionId` 发起新 attempt 重试，无需用户重新做题；READY 状态下不锁死底部聊天框。
- **并发控制与端侧互斥**：流式生成中时底部发送按钮变为“停止”，未提交题卡的提交按钮处于禁用；停止操作等待服务端状态确认，不自动将草稿变成二次扣费请求。

- **真实时间戳驱动的弹簧阻尼蓄洪池（Fluid Reservoir Stream Buffer）**：重写 `src/services/smoothStreamBuffer.ts`。彻底废弃原本按帧率固定累加（导致高刷屏吐字极快、几帧内抽干缓冲后陷入 300ms 死等停顿的“一顿一顿”现象），升级为基于 `performance.now()` 的 Delta-Time 真实物理时间戳驱动机制：
  - **低水位保底拉伸（Low-Water Stretching）**：当蓄洪池余量偏低（<= 4 字）时，自动转为平稳拉伸速度（18 字/秒，每字约 55ms），用平滑打字时间跨越下一个 SSE 网络包到达前的 200~300ms 空窗期，杜绝池子见底造成的硬停滞；
  - **高水位平滑消峰（High-Water Damped Absorption）**：当网络集中到达大批字符时，以指数平滑滤波（IIR Damping）逐步匀速过渡至最佳巡航速度（28 字/秒）或适度追赶速度，峰值严格封顶于 70~75 字/秒，杜绝文字瞬闪倾泻；
  - **收尾自然连贯**：修复了此前流结束时直接根据 `props.streaming === false` 瞬间爆显剩余文本的问题，改由 `isTextStreamingActive` 守护，直到蓄洪池真正平滑排空才切换终态，打字手感如行云流水。
- **先外框后内部逐个渲染与极简无干扰设计**：`ChatContentBlock.vue` 挂载或生成时优先渲染极简卡片最外层框架（去除点阵网格底纹与 [R]/[S]/[V]/[D] 图标徽章，保留 Zen Sage 纤细边框与纯净底色）；移除“学习脉络”、“步骤拆解”等预设类型标签与无标题保底 fallback，仅当下发显式 title 时渲染标题，无标题时不占位；内部条目首项即时呈现并按 75ms 节奏逐项顺畅涌现，配合 `@keyframes node-mount` 弹性淡入；在 `GENERATING` 状态下且等待后续条目到达期间，卡片底部动态展示柔和的生成中占位符（呼吸闪烁节点与骨架虚线），彻底消除条目生成间隔期间界面卡死假象；移除卡片冗余的“追问”按钮，保持结构纯粹、轻量与极致极简。
- **后端可视化失败重试的原位替换与生成期静默防御（Visualization Retry In-Place Replacement）**：在 `src/services/aiStreamReducer.ts` 的 `setPart` 中加入重试感知：当流式正在进行（`executionActive`）且推入新块级组件时，自动检查是否存在同类型或未生成有效条目的 `INVALID` 前序失败块，并在原位执行替换，杜绝在聊天流中堆叠两张卡片（一张失败一张成功）；在 `ChatContentBlock.vue` 与 `ChatActivityCard.vue` 中建立生成期防御，当会话处于活跃生成/重试期（`busy` 或 `streaming` 为 true）时，若块组件遇到 `block.error` 或 `INVALID`，保持优雅骨架屏，绝不提前端出“内容生成未完成或格式异常”等失败页面，直至重试块平滑就位。
- **AI 对话最外层框架与滚动槽位锁定（Layout Shift & Frame Stability）**：在 `SubjectWorkspace/index.vue` 的 `.ai-messages` 容器上启用 `scrollbar-gutter: stable`，永久预留垂直滚动条槽位，彻底消除长消息输出触发滚动条显隐时整个对话气泡与卡片发生 15px 横向突跳移位的问题；彻底移除流式期间动态注入并在结束时突兀销毁的 `chat-viewport-spacer`（避免 700px 视口高度骤缩引起的严重跳动）；在分栏拖拽调整尺寸期间引入 `isResizing` 状态切断 CSS `transition: width 0.3s`，杜绝拖动手柄时 AI 面板滞后跳动，并规范 `.workspace-right` 边界（`min-width: 300px; max-width: 650px`）；统一流式与历史助手的 DOM 层级包裹结构并增加 `align-items: flex-start`，彻底锁定头像与最外层框架的物理定位。
- **流式 Markdown 暂扣与镜像补全**：在 `src/utils/markdown.ts` 中增强前瞻暂扣缓冲（`hold-back` 标签/容器前缀与未断行代码围栏）；补全未闭合数学公式（`$$`、`\(`、`\[`）、粗体、行内代码与链接语法；完善末尾 Token 水墨淡入动画包裹。
- **字段完整性守卫 (Field Completeness Guard)**：在 `src/services/aiStreamReducer.ts` 的 `streamingBlock` 中增加实质性校验，过滤打字过程中的残缺空节点，避免未封口节点导致结构重排抖动。
- **正文输出后思考链即刻完成与静默冻结（Reasoning Flush on Content Arrival）**：在 `src/services/smoothStreamBuffer.ts` 中为控制器扩展 `flush()` 方法（瞬间取消 RAF 调度、将游标推进至末尾并触发完成回调）。在 `src/components/chat/ChatProcessArea.vue` 中明确思考生命周期：
  - 仅在真正的思考流式期（`streaming && !hasContent`）启用平滑蓄水池缓冲；
  - 一旦正文到达（`hasContent` 为 true）或整条回复完成流式（`!streaming`），思考阶段彻底结束，立即调用 `reasoningBuffer.flush()` 瞬间全量呈现思考文本与字数统计，并关闭思考光标与 Shimmer 流光；
  - 杜绝正文输出完毕后、历史消息回放或重新展开折叠面板时思考链仍在后台以 55 字/秒低速“假性逐字打字”的卡顿体验。
- **思考链默认展开、按钮原位常驻与正文输出完阻尼折叠动效（Auto-Expand & Smooth Retract Animation）**：
  - **默认自动展开**：在流式生成期间，`ChatProcessArea` 默认将思考链明细展开（`isOpen = true`），用户无需手动点击即可实时观察模型的思考步骤与工具调用；
  - **硬件加速折叠动效（CSS Grid Accordion）**：彻底废弃原本 `v-if` 的生硬骤显骤隐，改用 `grid-template-rows: 0fr <-> 1fr` 配合 `cubic-bezier(0.16, 1, 0.3, 1)`（iOS 风格弹簧缓动曲线），实现纯硬件加速的平滑折叠/展开；小箭头伴随 0.34s 平滑旋转 90 度；
  - **思考链展开按钮原位常驻与正文回复完自动折叠**：
    - 修复了 `aiStreamReducer.ts` 与 `useChatStore.ts` 中服务端 `run.completed` 终端包导致 `replyMessageId` 被置为 undefined、助手消息停留在 `PENDING` 态而在流结束后被列表过滤消失的深层缺陷；
    - 确保「深度思考」状态胶囊按钮（如 `已深度思考 · 398 字 ›`）无论在流式生成前、流式生成中、正文生成中、正文生成完毕后或历史重载后，均**绝对原位常驻于 AI 回复气泡顶部**，绝不突兀消失或跳位；
    - 思考链在流式生成阶段保持展开，在正文全部输出完毕（`isAiStreaming` 结束）时触发优雅收起动效，以 0.38s 自然折叠回原位胶囊按钮；生成完毕后用户可随时点击胶囊自由再次展开或收起；
  - **正文输出完无缝交接**：在 `SubjectWorkspace/index.vue` 中引入 `isStreamSettling`（450ms 优雅缓冲期），保证收起动效在原气泡内流畅播放完毕后再无缝切换为历史消息状态，彻底杜绝切流时 DOM 突兀重排。
- **正文、代码块与提问气泡/输入框白底原色统一**：
  - 将 AI 回复内 Markdown 代码块与 ASCII 关系图（`pre / code`）由深色 `#1e1e2e` 改回应用统一的纸质温润白底（`var(--color-bg-card, #ffffff)`），配以细微圆角边框与主文本色；
  - 将用户提问气泡（`.chat-msg-row.user .chat-bubble`）由原本深黑色 `#2b302c` 调整为干净通透的纸质白底（`var(--color-bg-card, #ffffff)`），文字使用主色（`var(--text-primary)`），配以 `1px solid var(--border-subtle)` 纤细微边框与柔和阴影，引用片段自适应更新为微绿浅底；
  - 将底部提问输入胶囊框（`.ai-chat-capsule` / `.ai-input-wrapper`）背景由偏黄米色 `#FAF7F2` 统一调整为纯净白底（`var(--color-bg-card, #ffffff)`），全屏色彩调性归一，暗色模式下自适应切换为深炭灰卡片色。
- **AI 头像移除与思考触发器去框极简设计**：移除对话列表与流式气泡最左侧的圆形助手星火头像，AI 回复与思考触发器靠左直接自然对齐；彻底移除「深度思考」触发器外层的生硬圆角框（去除 capsule 外边框与底色，保持透明无框），星火图标、流光状态字（12px 严格不变）与旋转小箭头自然呈现于页面，hover 时提供柔和微光底衬，下方时间线轴距精准对齐图标中轴，通透开阔且轻盈无干扰。
- **验证**：PC `npm.cmd run type-check` exit 0；`node --experimental-strip-types --test scripts/r4-chat-content.test.mjs scripts/r4-ai-stream.test.mjs` 25/25 全部通过。未执行真实桌面 GUI 人工验收。
- **流式输出健壮性与多片段无缝过渡优化 (2026-11-02 修复)**：
  - **重试消息 ID 安全守护**：修复 `retryPendingMessage` 中重试流部分中间事件缺少 `replyMessageId` 导致向 Store 堆叠未定义 ID 幽灵消息的问题，严格统一回退与空保护；
  - **文本与块组件交织流式平滑过渡**：在 `ChatContentRenderer.vue` 中引入 `currentStreamingTextId` 追踪；当文本片段之后插入结构化块组件或新文本段时，先行平滑 `flush` 结清前序文本，彻底杜绝文本被块截断时蓄洪池强行 reset 造成的瞬间跳字；
  - **流式 Parts / Tools 响应式直通与 O(N) 扫描清零**：在 `useChatStore.ts` 中直接维护并导出响应式 `streamingParts` 与 `streamingTools`，彻底替换 `SubjectWorkspace` 在每个 SSE 事件上全量 `.reverse().find()` 历史消息的深层高开销，长会话流式吐字 CPU 占用大幅下降；
  - **思考链向正文无缝即时放行**：解除正文内容到达时对思考链计时器的等待竞争，只要正文内容或结构化块产生，正文立刻顺畅挂载；
  - **代码块内字符隔离**：在 `markdown.ts` 的 `autoCloseMarkdown` 中排除已闭合代码块内部文本（如 Python 乘方 `2 ** 8` 或注释中的 `$`），杜绝代码块内符号干扰外部粗体与数学公式的未闭合乐观补全。
- **Chat 重试旧失败气泡残留并存修复 (2026-11-03 修复)**：
  - **重试清理同轮未完成消息**：在 `useChatStore.ts` 的 `retryPendingMessage` 中，无论通过用户问题还是失败助手消息触发重试，均向前/后定位当前提问轮次，在发起新请求前严格收集并从 `messages.value` 中清除当前轮次下所有未完成（`status !== 'COMPLETED'`）的旧助手消息；
  - **杜绝多助手气泡堆叠**：服务端为重试 attempt 下发全新 `replyMessageId` 后，新助手消息独立追加并完成，彻底消除“旧生成失败气泡 + 新回复气泡”并存残留或重复重试无限累加的问题；
  - **严格边界保护**：前序已成功的其他回合助手消息完整保留，非活动会话或未关联用户提问的安全退出。
  - **验证**：PC `npm.cmd run type-check` exit 0；定向测试 `scripts/r4-chat-content.test.mjs` 与 `scripts/r4-ai-stream.test.mjs` 合计 28/28 全部通过；唯一只读 Reviewer 审查 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0。未执行桌面端 GUI 验收。
- **文件解析处理中心渲染与状态流转修复 (2026-11-03 修复)**：
  - **任务完成回跳闪烁消除**：在 `DocumentProcessingCenter.vue` 中将 `serverProcessingSources` 的本地任务排除条件调整为基于全部 `store.jobs`，杜绝本地任务完成变为 `READY` 且从活跃 `jobs.value` 离开时、服务端短时未同步而短暂将该文件作为“未处理/服务端处理中”回跳展示的闪烁问题；
  - **动态识别页码进度优先呈现**：调整 `processing-item-meta` 状态文案优先级，只要存在实时识别页码进度（`store.localOcrProgressBySource[source.id]`），优先展示动态页码进度，防止静态操作反馈（`sourceActionResults`）长期覆盖识别进展；
  - **长文件名与错误截断保护**：对 `.processing-item-main`、`.processing-item-meta` 及 `strong`、`.processing-error` 引入 `min-width: 0` 和 `flex: 1` 守卫，杜绝超长文件名或错误将右侧状态微标与操作按钮挤爆或挤出屏幕；
  - **暗色模式（Dark Mode）与微晶质感全覆盖**：为处理中心补充完整 `html.dark` 高对比度配色方案，状态徽标升级为微晶圆角药丸胶囊，按钮全圆角药丸化并支持优雅弹簧微交互；诊断展开区域设置最大高度与内嵌微滚动条，防止长文本拉伸面板。
  - **验证**：PC `npm.cmd run type-check` exit 0；定向测试 `scripts/r4-document-processing-ui.test.mjs` 15/15 全部通过；Reviewer 子代理只读审查 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0。未执行桌面端 GUI 验收。
- **桌面窗口最小尺寸契约与窄窗响应式布局验证 (2026-11-04 完成)**：
  - **窗口物理最小尺寸补齐**：在 `Auralis-PC/src-tauri/tauri.conf.json` 的主窗口配置中补齐 `"minHeight": 600`，与既有 `"minWidth": 960`、`"width": 1280`、`"height": 800` 形成完整桌面窗口边界契约；
  - **应用外壳双层兜底**：在 `Auralis-PC/src/App.vue` 的 `.app-shell` 上增加 `min-width: 960px; min-height: 600px;` 兜底守卫，杜绝未受约束的浏览器视口崩塌；
  - **SubjectWorkspace 960px 窄窗断点适配**：在 `SubjectWorkspace/index.vue` 中新增 `@media (max-width: 960px)` 媒体查询，将中间主工作区最小宽度由 320px 弹性收敛至 280px，Tier-2 抽屉最大宽度收敛为 200px，右侧 AI 助手面板最小宽度收敛为 260px，确保三栏同时展开时总宽度严格收敛在 868px <= 960px，杜绝水平挤爆或横向滚动条；
  - **自动化边界与窄窗布局套件**：新增 `scripts/r4-window-boundary.test.mjs`，覆盖 Tauri 窗口边界配置、外壳尺寸守卫、工作台 960px 窄窗断点与核心主视图（SubjectStatsPane、Asset、Pomodoro、SubjectHall）响应式断点；
  - **验证**：类型检查 `npm run type-check` exit 0；全量构建 `npm run build` exit 0；定向套件 `scripts/r4-window-boundary.test.mjs` 4/4 全部通过；Reviewer 子代理差量复审 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0。未执行桌面端 GUI / Tauri 拖动人工走查。
- **学科复习仪表盘暗色模式（Dark Mode）渲染异常修复 (2026-11-04 完成)**：
  - **根因定位**：全局设计系统（`src/styles/index.css`）在 `:root` 中定义了卡片底色 `--color-bg-card: #FAF7F2;`，但在 `html.dark` 块中遗漏了 `--color-bg-card`、`--color-bg-page` 与 `--bg-card` 覆盖，导致暗色模式下依赖 `--color-bg-card` 的卡片依然继承亮色米白底色；且 `SubjectReviewPane.vue` 中的整合计划大卡片（`.subject-review__plan-card`）缺少 `html.dark` 样式规则，内部字体在暗色模式下被继承为高亮淡色，引发严重的“亮白底 + 浅色字”对比度失效与底部嵌套面板反差割裂；
  - **全局暗色卡片变量闭环**：在 `src/styles/index.css` 的 `html.dark` 覆盖块中补齐 `--color-bg-card: #252422;`、`--color-bg-page: #191816;` 以及语义别名 `--bg-card: var(--color-bg-card);`；
  - **复习面板暗色层级与对比度对齐**：在 `SubjectReviewPane.vue` 中为 `.subject-review__plan-card` 增加 `html.dark` 规则（采用 Zen 深色基底 `background: var(--color-bg-secondary, #252422);`、深色微光边框 `border-color: rgba(255, 255, 255, 0.08);` 与立体深邃阴影）；为 `.subject-review__plan-badge` 补齐暗色淡 Sage 衬底与对比文本色（`#A3B19B`）；为仪表盘圆环背景轨道 `.subject-review__pomodoro-track` 补充低对比度柔和线条；同步为单轮复习卡片 `.subject-review__card`、提示条 `.subject-review__notice`、进度标签 `.subject-review__round-progress-tag` 与轮次总结 `.subject-review__round-summary` 补齐暗色规则；为 `.subject-review__panel` 的悬浮态提供暗色微光边框提升可交互感；
  - **验证**：类型检查 `npm run type-check` exit 0；全量构建 `npm run build` exit 0；定向测试套件 `scripts/r4-subject-review.test.mjs` 50/50 全部通过。未执行真实客户端 GUI 走查。


### 2026-10-31 Timeline 连续本地拖动（源码与定向验证完成，真实客户端待验收）

- 保留空槽插入顺延、卡片主体后接、标题交换规则。未结算的排期命令允许继续追加本地排期；普通 CRUD 未解决写入仍受原有保护。每次原子保存任务投影与排期命令后释放操作队列，后台按持久顺序只发送队首。
- 成功回执保留后继命令的最新乐观位置，并衔接尚未发送命令的源/交换目标版本。首发后的命令保持同一 ID 和 wire 载荷；进程重启或 PROCESSING 后的下一次同步可重发队首，单轮不因 PROCESSING 自旋。成功结算后自动继续处理剩余排期。
- Store 计算前捕获当前用户活动 Task 的排期基线，仓储在写事务/浏览器锁内原子核对；跨窗口陈旧计算先重读本地数据并拒绝保存。业务拒绝、预测偏差或回执与较新墓碑/普通写入冲突时，先取得完整恢复数据，再终止未发送后继并恢复权威排期，保留受保护写入并通知用户。
- `type-check` exit 0；四套定向测试 176/176；`build` exit 0。PC 全量 784 项中 752 通过、32 失败，未全绿；失败集中在 Web Locks 测试条件以及范围外 Chat/工作区/侧栏/Profile，明细见 `D:/Temp/auralis-timeline-continuous-drag-20261031/execution-report.md`。唯一只读审查 B0/I0/O0。未做真实浏览器/Tauri/Server 联调或部署。

### 2026-10-29 Chat P1 内容投影与组件渲染基础（未接入现有 Chat 页面）

- 新增 `src/services/chatContentProjection.ts` 与 `src/types/chatContent.ts`，以及 `src/components/chat/ChatContentRenderer.vue`、`ChatContentBlock.vue`、`ChatActivityCard.vue`。投影只输出各支持片段的公开字段；文本片段保留正文，结构化块映射到有限组件类型。Activity card 支持 READY/提交状态、答案草稿和结构校验，不做程序判分。
- 新增 `scripts/r4-chat-content.test.mjs`，Node 6/6；PC `npm.cmd run type-check` exit 0。证据 `D:/Temp/auralis-chat-p1-components-20261029/`。
- 当前仍是隔离的显示与纯逻辑基础，未连接 Workspace、`useChatStore`、SSE API/controller 或 reducer；尚无真实流挂载、浏览器/GUI验收。Server parser 及生产 Chat 主链接线仍待完成。

### 2026-10-28 桌面资料处理入口反馈与手动重验（源码修复，队列READY已只读确认）

处理中心“开始本机处理”增加“正在同步资料…”/“正在启动本机处理…”两阶段反馈与重复点击保护。调度器SKIPPED/WAITING/FAILED结果不再静默丢弃，已知原因映射为安全中文；未知异常不回显原始详情。manualSourceResume无状态helper保留flush与synced检查，固定用户/设备/session/仓库及scheduler，在等待后重核上下文；界面迟到结果也按操作代次和scope隔离。

手动操作可重验曾404的临时NOT_FOUND缓存，普通自动调度仍节流；显式删除、并发删除及迟到处理fence保持。该资料本地/后端元数据齐备但无job的现场已只读确认；本次是否实际命中过404缓存尚未证实，不能将该候选路径当作唯一根因。无需重传资料或数据库迁移；未改变后端生成/额度。

type-check exit0、相关scheduler/UI测试最终51/51通过；首轮旧静态断言/泛型推断问题及唯一审查发现已修正，同一reviewer差量关闭后B0/I0。未操作GUI、手动触发真实解析或部署。后续23:39:56香港时间的只读本地快照确认该job与source均READY、无错误，证据post-fix-state.txt；这仅确认队列运行结果，未验收GUI或解析内容质量，也不能证明本次历史404候选根因。基线、逐轮验证与审查见D:/Temp/auralis-desktop-queue-feedback-20261028/；只读现场见D:/Temp/auralis-pre-generation-stall-20261028/。

### 2026-10-28 示例模板清理

已移除无业务引用的 `HelloWorld.vue`、专用 `hero.png` / `vite.svg` / `vue.svg` / `public/icons.svg`，并清理本地生成声明中的对应组件项。路由、应用入口、业务组件、favicon 与 File Viewer 资源保持原实现。文档与素材备份见 `D:/Temp/auralis-project-cleanup-20261028-round2/`；本轮不涉及交互或视觉变化。

### 2026-10-27 Overview 重新生成请求身份（自动检查及审查完成，未部署）

现有重新生成入口使用新X-Overview-Request-Id，并可携带同输入的上次已派发retryOfRequestId；网络/401重送保持本次ID。索引限当前service实例，按user/device/scope删除代次/revision/mode/输入隔离，取消全部或删除scope清理；PC刷新后不保留该索引，由普通新请求的服务端规则处理FAILED/过期任务。SSE仅当前执行可更新状态/落结果，已有编辑冲突保护保持。没有新增页面、按钮或端侧schema。type-check、Overview84/84及build通过，SDK与OpenAPI同步，唯一review B0/I0/O0；精确PC开工快照未保存，审查以当前逻辑及10/26已验候选的限定历史差量进行，未声称全树审查。当前未验证GUI。详见[实施计划](../plans/2026-10-27-overview-explicit-retry.md)。

### 2026-10-26 Web前端动态容量接收版本已部署

本机frontend容器已重建至镜像28f9ff68…；页面与实际entry bundle均HTTP200，后端同步部署。entry `/assets/index-CugPHA9J.js` 的身份记录在D:/Temp/auralis-overview-deploy-20261026/deploy-verification.md。此项证明Web容器提供新bundle，不等于浏览器已刷新、桌面安装包更新或GUI生成/保存流程验收；没有浏览器自动化或清理用户本机编辑缓存。

### 2026-10-26 Overview 大结果接收（自动检查通过，未部署）

`overviewResponseValidator` 保留对象形状、类型、非空、UUID、路径、唯一性和来源/provenance 对应校验，容量由服务端 `OverviewLimits` 正数配置决定；PC 不再重复固定章节、正文或引用数量帽。生成 raw input 与正式 canonical view 仍分开，不改变页面、Store 或本地 schema。较早条目中的固定数量是当时记录，当前以本条与 API 契约为准。

D 盘候选 type-check、Overview generation/接收测试 80/80、OpenAPI/生成 schema 比较通过。未做 GUI/Tauri、真实 Provider 或业务保存验收；后端单独变更不能证明 PC 业务验收，部署状态见[动态容量计划](../plans/2026-10-26-overview-dynamic-capacity-and-simplification.md)。

### 2026-10-25 Overview 生成结果 provenance 接收

生成 SSE 使用独立 `GeneratedOverviewResponse`，其中 `outlineProvenance` 按原始输入契约校验（Java UUID 字符串语法包含 nil UUID）；保存时拆开正文与 provenance 输入，保存在现有 `outlineProvenanceInput` 字段并沿正式 PUT outbox 发送。正式 Overview results 响应继续严格校验 canonical provenance view，按后端限制允许每节最多 500 refs，不把输入 refs 冒充为 canonical locators。没有改变页面交互或本地 schema。

### 2026-10-25 Overview SSE 等待期限可配置（源码与自动验证完成；GUI 未验收）

`VITE_OVERVIEW_SSE_DEADLINE_MS` 缺省为 300000ms；`0` 不创建 PC 自动等待计时器，正数仍覆盖响应头、401 refresh 和 body reading。调用方 AbortSignal、手动停止和 reader 取消不变。Docker Compose 构建 frontend 时从根 `.env` 注入该 build arg；本机根 `.env` 已设 0。直接用 `npm run dev` 或 Tauri 调试时不读取根 `.env`，需要在 shell 或 PC 本地 Vite env 文件中设置同一变量，否则仍使用默认 300000ms。类型检查、83 项 runtime/Overview 定向测试和生产构建通过；完整 R4 为 747 项中 719 通过、28 失败，失败位于既有 Review/Web Locks、Sidebar/Profile 静态断言和 Task 测试范围，不记为 full 通过。未做 GUI、Tauri 或真实 Provider 长请求验收。

更新时间：2026-10-25
文档状态：现行
权威范围：`Auralis-PC` 的当前依赖、路由、页面、Store、API 边界、Tauri 集成、构建方式与限制
事实来源：`Auralis-PC/package.json`、`src/`、`src-tauri/` 与 2026-08-24 当前代码

### 2026-10-23 Overview 与 asset sync 回归测试收尾（只改测试；唯一审查完成）

- `r4-overview-generation.test.mjs` 只断言当前 Subject/summary 的 Stop 控件及现有文件列表 regenerate 行为；不再要求已撤回的文件 Stop aria-label，不恢复 job selector、preview/publish/adopt 或 section reader。
- `r4-store-local-asset-flow.test.mjs` 使用真实 Axios adapter 检查 dispatch 时的 scope、bearer token、device ID、payload/mutation ID。A 仍为 active scope 时 fire-and-forget wakeup 可以先派发；切换到 B 后，A 旧 ticket 不进入 adapter，B 凭据/请求不携带 A 资源。Delayed A 401 即时安装 settlement observer，验证 `SYNC_SCOPE_CHANGED` 且不会用 B 凭据 refresh/retry。完成路径等待 `completeUpload` adapter 事件及持久 completed job，并核对 same-scope retry idempotency/token 行为。
- 生产 UI、Store 与 API 未变。两脚本首轮106项104 passed/2 failed、exit 1；最终 affected-only 2/2、exit 0；未重跑整批。唯一只读 reviewer B0/I0/O0。没有 GUI/真实服务验收。
### 2026-10-22 Overview 当前流程（M4 新交互撤回；保留本机编辑冲突保护）

- 当时 PC 已撤回 M4 新增的 job selector、preview/publish/adopt、formal section reader 和 candidateInput 接线。2026-11-12 后端进一步移除 candidateInput、publication、preview/section 旧接口；现行 Markdown 入口见本文件顶部。
- 只保留生成期间本机编辑保护：对比目标 part 内容与 identity/provenance 输入签名；若生成中发生编辑，保留本机 cache 与冻结 mutation，将 AI 结果留在现有 outbox 为 `OVERVIEW_GENERATION_EDIT_CONFLICT`，不发送 PUT。原冲突位置提供显式保留本机/采用 AI 操作，后者沿原 save/CAS/outbox。跨 tab browser fallback 共用 owner/device Web Lock；不可用时拒绝写入，SQLite 路径不变。唯一 reviewer delta B0/I0；回退后 noEmit、cache/sync/deletion、generation 检查分批通过或保留失败，详见当前状态和 D 盘结案报告。

### 2026-10-22 Overview M4 native jobs 与显式候选采纳（回退前实现与验收历史；未部署）

- Subject Workspace 消费 Source/Subject ALL、OUTLINE durable jobs，选择有序 READY FILE/TEXT/URL 子集（1–100），可重连、观察/停止观察、控制 job，并预览 VERIFIED 节点。完成仍是候选；显式采纳以 `candidateInput {jobId,jobVersion}` 走正式 PUT、服务端当前输入校验、CAS/receipt/outbox。OUTLINE 保留 summary 的内容、版本、时间与 descriptor；SUMMARY 继续现有 FILE-derived 路径。SQLite schema v13，无 M4 migration。
- FILE/TEXT/URL 的本地变更通过既有 outbox 持久化，并在来源仍 READY 且 owner/device/scope、ID/type/revision 围栏匹配时 PUT；Store/sync 回归 30/30。自动 FILE/ALL recovery 使用 namespace + source UUID + ingestion revision + mode 的 SHA-256 request ID；Crypto 不可用时不 POST。手动身份保持随机；profile/raw currentness 在 candidate GET/publication 校验，须用户明确重新生成。定位只承诺已支持的 FILE positive-page seek；block-only 打开资料，TEXT/URL 不提供精确定位。
- 隔离浏览器实际覆盖 Subject/URL 生成、verified preview、正式发布和分节读取、OUTLINE pause/resume 并保留 summary、TEXT cancel、URL CAS conflict 后 Keep Local 保存与候选采纳；最终 Source/section v4 可读。related GEN 72/72、lifecycle 10/10（分批）、noEmit/Vite 通过；唯一 source-type-fence delta review B0/I0/O0 new，原 O1 保留。前端源码变更与后端改动分别报告；未验收 native Tauri/SQLite、真实 Provider、FILE/PDF/OCR、部署或内容质量。

### 2026-10-19 Overview M2 身份与来源 metadata（PC 数据往返已验证；GUI待验）

- Overview cache 与独立 write outbox 保存并往返 `outlineIdentity`、`outlineProvenance` 输入/视图和 `identityReady`，PC 本地 SQLite schema 升至 v13。Server nodeId 与 UI 树临时标识分离；节点排序时 metadata 随 path/节点序列化，SUMMARY 只更新摘要并保留现存大纲身份。
- HTTP request 首次发送后保留冻结 body 与 clientWriteId；旧结果未初始化身份时必须显式保存初始化，不能按标题/位置猜测继承。生成来源位置来自 Server 实际 writer/chunk lineage，PC 不把页码或 block 位置当作可编辑事实。
- PC M2 同步/metadata focused 回归 27/27；PC type-check 与 Web build 退出码 0，最终 OpenAPI 生成后 PC type-check 再次退出 0。完整 R4 首轮 737 tests/709 pass/28 fail/0 skip，其中 2 项 M2 问题由后续定向回归修复，另 26 项既有非 M2 失败未修且未重跑全量。Mobile type-check 仍有既有 `EventRequest`/`EventResponse` 两个 TS2339；真实 Tauri 与 GUI 验收未完成。

### 2026-10-15 Subject Overview 离线冲突刷新重入保护（定向验证通过；GUI 待验收）

- `SubjectWorkspace` 仅对静默 Subject/LOCAL 自动解析，在 `ensureOverviewRuntime()` 可能刷新缓存前按当前用户、server device、Subject id 与 revision key 合并同一解析。FILE scope 与显式 LOCAL/REMOTE choice 直接执行原解析体；没有给 FILE 并发 choice 添加队列或互斥。
- 解析在异步边界校验登录身份、挂载状态、当前学科和文件 revision；网络失败保留本地候选及冲突状态，后续显式或既有触发可重试。现有 API 将 404 作为无远端结果，其他错误沿原同步服务处理。生产解析仅在成功 resolve 后刷新尾部缓存；失败尾部刷新是受控回归回调模拟，不代表生产失败分支会执行该刷新。没有改 Source/FILE 生成 trigger、同步冲突策略、API、SQLite 或后端。
- `r4-overview-sync.test.mjs` 与 `r4-subject-overview-ui.test.mjs` 定向共 43/43，`vue-tsc` app 检查退出码 0；RED 因 guard 导出缺失失败，GREEN 覆盖 Subject 自动路径接线、受控 cache refresh 重入、离线保留、后续 retry、同 scope coalescing 和不同 scope 隔离。真实离线恢复、Tauri/桌面 GUI 未验收。

### 2026-10-12 聊天资料检索默认开启（代码与定向测试通过；GUI 待验收）

- PC 不提供关闭资料检索的模式或个人中心 RAG 语义搜索开关。打开文件时请求范围为 `AUTO` 当前 Source；没有当前文件且没有明确文件范围时为当前学科 `SUBJECT`。显式 Source 选择保持限定范围；手动撤销最后一项后，有当前文件回到 `AUTO`（未就绪仍等待），否则回到 `SUBJECT`，标签与实际范围一致。
- 打开尚未就绪文件仍保持 `AUTO` 和原处理门槛，READY 后可发送。全学科高亮与计数仅包含同学科 READY Source；资料列表变化时移除已不存在或已移到其他学科的选择，保留仍存在但未就绪的选择及门槛。
- 旧本地 `sc_setting_rag` 偏好不再读取；缓存待发请求中的未知检索模式按该请求的 Source/Subject 生成现行上下文，不修改历史正文、引用或本地表。没有删除本地数据或执行数据库迁移。
- 最终 PC 定向测试 57/57、type-check / build 退出码 0；静态门禁退出码 1，仍仅为 `src-tauri/src/local_asset_store.rs` 固定本地地址，干净 HEAD 同样复现。GUI/Provider 未运行，详见[计划](../plans/2026-10-12-rag-always-on.md)。

### 2026-10-12 上传队列与核心同步等待解除（最小修复与定向验证通过；GUI 待验收）

- `useSyncStore` 仍等待资产队列初始化与本机 reconcile，随后有异常捕获地后台调用 `wakeUp()`，普通 push/pull 按原 `runSyncCycle` 执行。迟到上传异常仅在原 scope 仍有效时用现有 classify/log 安全日志处理，不污染新会话。
- 文件 draft 在 Asset 完成前不进入 Source CREATE outbox；完成后释放 draft，仍仅在释放条目非空时通过原 `onWakeup` 请求下一周期。未更改队列、同步字段、页面或公共 API。
- 实际 store 受控 RED/GREEN 证明上传未返回时核心同步已启动；最终四项回归覆盖 pending upload、后续 Source release、当前会话拒绝捕获和旧会话错误隔离，type-check/build 通过。早期完整相关套件 51/51 后，仅对最后涉及行为的四项重跑，不相加；静态门禁仍因既有 Rust 固定地址规则失败。
- Luna 优先管理 Antigravity Gemini 3.1 Pro High 委派，但工具多次无产出，最后由 Luna 直接实现，Codex 只读审查；没有 Antigravity 生成代码。真实桌面上传期间其他实体及跨设备同步待验收；不能将独立复现的客户端缺陷归为该 PDF 小时延期的历史原因。详见 [本轮计划](../plans/2026-10-12-pdf-ingestion-quota-and-sync.md)。

### 2026-10-12 头像 IndexedDB 本地缓存与断网回退

- `services/avatarCache.ts` 以 IndexedDB 按 `user.id` 保存头像 Blob；不把 Blob 或临时 ObjectURL 写入 Pinia 持久化状态。
- `useAuthStore.loadAvatar()` 先加载并显示本地头像，再尝试 `GET /api/auth/me/avatar` 刷新。网络/服务端错误保留本地副本；明确 404 清除缓存并展示首字母。顶栏和个人中心共享同一个响应式 ObjectURL。
- 上传成功后把所选图片同步存入 IndexedDB 并立即显示；云端读取随后刷新本地副本。重置头像与退出登录清理当前用户缓存；账号切换、重新认证、重置操作会使旧加载请求失效，避免旧账号或迟到响应覆盖当前头像。
- 类型检查通过；Tauri 重启断网 GUI 验收待完成。既有用户的本地副本在升级后首次在线读取或上传成功时建立。

### 2026-10-12 设置与个人中心（Profile Studio）Awwwards 获奖级视觉设计、立体投影与微交互全面重构（代码与自动验证通过；GUI 待验收）

- `src/views/Profile/index.vue`（设置与个人中心）：
  - **建筑级立体投影与分层质感（Architectural Elevations）**：
    - 全面重构左右双栏容器（左侧数据透视 `.studio-left`、右侧分项设置 `.studio-right`）与内部卡片网格；
    - 引入高定近远场双层阴影系统：
      - 两大面板：`0 10px 30px -4px rgba(35, 45, 30, 0.08), 0 2px 8px -1px rgba(0, 0, 0, 0.04)`（暗色 `0 14px 36px rgba(0, 0, 0, 0.48), 0 2px 10px rgba(0, 0, 0, 0.35)`），搭配 `20px` 现代圆角；
      - 内部分组与卡片（用户资料卡、学习指标网格、学科分布、账号安全卡、设置组、BYOK 配置组）：统一采用 `18px~20px` 现代圆角、Tier 3 控件白 `var(--color-bg-tertiary, #FAF7F2)` 与细腻微晶 Sage 边框；
    - 彻底解决贴平、缺乏分层、边缘紧迫拥挤（padding 从 10px 优化为 `14px 18px 18px`，gap `16px`）的问题；
  - **瑞士现代平面排版 (Swiss Editorial Typography)**：
    - 右侧标头新增透光微晶微标 `.settings-header-badge`（`SYSTEM PREFERENCES`），大标题强化字重与紧凑字距；
    - 学习指标四宫格升级为等宽数表对齐 `tabular-nums`、微透 Sage 渐变图标底座与悬停立体浮起；
    - 废弃 AI 使用额度粗糙行内样式，重构为微晶网格卡片 `.usage-card`、清晰标签与重置时间微药丸；
  - **精雕细琢的微交互与触控反馈**：
    - 切换开关（`.toggle-btn`）：物理弹簧曲线 `cubic-bezier(0.34, 1.56, 0.64, 1)`，开启时散发翠羽 Sage 柔光；
    - 下拉选择框与文本输入框：高定微晶材质，聚焦态扩散 3px Sage 呼吸光晕；
    - 按钮全圆角药丸化，悬停上浮 1.5px，点击 `scale(0.97)` 弹性回弹；
    - 用户头像在线状态升级为翡翠晶体与 `breathe-glow` 慢呼吸动效；
    - 候选模型标签升级为触控药丸微芯片 `.model-chip`，激活态 Sage 渐变微光；
  - **深色模式（Dark Mode System）极致适配**：
    - 建立全覆盖的深色墨玉与冷翠调色板，确保暗黑模式下所有文字对比度出色，高光透亮克制，彻底杜绝发灰糊成一片；
- **门禁验证**：`vue-tsc -b` 0 报错；`scripts/r4-profile-live-links.test.mjs`、`scripts/r4-profile-logout.test.mjs`（9/9 项测试）全量通过；`npm run build` 生产构建成功。真实桌面端 GUI 待人工走查。

### 2026-11-03 PC 复习同步微秒等价性与取消排期（Unschedule）排期队列对齐

- **复习同步微秒等价性与误报冲突确定性 CAS 恢复**：
  - 复习同步（`reviewSyncService.ts`）引入针对 PostgreSQL 审计时间戳 round-trip 微秒截断与四舍五入（第 7 位纳秒数 >= 5 向上进位跨秒溢出）的微秒精度等价比对（`parseAuditTimestampMicros`、`sameAuditInstant`、`sameCanonicalReviewState`）。
  - 范围明确收敛：仅对审计字段（`createdAt` / `updatedAt`）进行微秒截断/四舍五入等价性比对，业务时间戳（`dueAt`、`lastPracticeAt`、`selectedAt`）严格保持精确全值匹配。
  - 在复习意向处理（`processBlock`）FIFO 队列头增加对存量误报冲突（`status === 'conflict' && prepared === false`）的确定性 CAS 恢复检测（`tryRecoverFalseConflict`）。通过校验 protocolVersion 2、知识块与学科活跃状态、内容哈希、严格锚点失败但规范微秒锚点一致性，执行原子 CAS（`recoverConflictIntentToPending`）重置为 pending，解除积压。
- **取消排期（Unschedule Task）原子事务与排期队列对齐**：
  - `useTaskStore.ts` 中的 `unscheduleTask` 重构为复用排期原子事务（`commitOfflineSchedule`），生成 `SCHEDULE_UNSCHEDULE` 本地 mutation，本地 Task 立即投影为未排期状态（`scheduledAt: undefined`，移入待分配队列），避免产生 schedule fence 冲突。
  - `localRepository.ts` 将 `SCHEDULE_UNSCHEDULE` 纳入排期命令（`isScheduleCommand`）统一管控，对齐受影响任务提取（`localScheduleAffectedIds`）、基线核对、FIFO 认领、前序版本号自动串联更新（`baseVersion`）、重复回执幂等结算与崩溃重启队列恢复。
  - `useSyncApi.ts` 在推送到服务端时将 `SCHEDULE_UNSCHEDULE` 转换为线协议 `TASK` / `UPDATE` 变更（设置 `scheduledAt: null`，仅保留白名单任务字段，剥离 `_local*` 私有字段）。
  - `syncCycle.ts` 识别 `SCHEDULE_UNSCHEDULE` 单任务回执，在 `settleSchedulePushResult` 中将单记录结果包装为数组进入排期结算通道，正确将任务标记为 `synced` 并将 mutation 标记为 `applied`。
- **门禁验证**：
  - 类型检查：`npm run type-check`（`vue-tsc -b`）0 错误。
  - 核心定向测试：`r4-review-local-first.test.mjs`（47/47）、`r4-review-sync-concurrency.test.mjs`（10/10）、`r4-task-store-schedule.test.mjs`（92/92）、`r4-local-repository.test.mjs`（49/49）、`r4-sync.test.mjs`（36/36），合计 234 项定向测试全部一次性通过。
  - 全量构建：`npm run build` 顺利打包成功（dist 产物生成正常）。

### 2026-10-12 Timeline 离线排期命令

- Timeline 的插入、顺延和任务换位先在本机计算，并由 LocalRepository 在一个事务中保存全部受影响 Task 乐观投影及一条稳定 ID 的 Sync 排期命令。在线和断网写入共用该流程；传输错误保留本地结果，Sync 恢复后幂等推送。
- Sync pull/snapshot 会保护未结算排期命令关联的 Task；SQLite 将 fence 读取与快照替换放在同一事务中，浏览器 LocalRepository 状态改写要求 Web Locks API 并通过同源锁串行化。浏览器不提供该 API 时，本地存储写入以 `LOCAL_STORAGE_LOCK_UNAVAILABLE` 失败，避免跨标签页覆盖整份状态；Tauri SQLite 不受此限制。服务器回执用 Task 数组原子结算；拒绝或版本冲突后恢复当前服务端排期，多个拒绝逐条通知。排期命令的本地成员 fence 不会发送到服务端；服务端 change log 仍是普通 Task UPDATE。
- 若排期回执未包含所有本地受影响 Task，客户端先取得并校验完整快照，再结束命令；快照暂时不可用或缺少成员时命令留在待同步队列，沿用原 mutation ID 重试，避免保留未恢复的乐观排期。
- Timeline 展示本地已保存、等待网络同步的状态，并在后台业务拒绝后显示错误。排期继续校验完整任务时长、窗口、冲突及精确 dueAt。
- 按槽插入/顺延与任务换位的 Store mutation queue 只覆盖本地校验和原子 repository 提交；提交及本地投影刷新完成后即释放队列，并请求后台同步，不等待远端 push。离线仍保留 outbox，后台服务拒绝继续由排期同步错误通知反馈。本地提交失败仍由当前 drop 错误提示处理。
- 四个 PC 定向套件合计 173/173（包括缺少换位目标 ID 且首轮快照失败后重试恢复），LocalRepository 单套 35/35，`npm run type-check` 退出码 0。Server Sync/Schema/Task controller 定向 Maven 测试 34/34；独立 `OpenApiArtifactTests` 12/12。只读复审 BLOCKER=0、IMPORTANT=0。`check:r4-pc` 命中未修改 Rust 文件中的固定本地地址扫描；`check-openapi.ps1` 的运行时 artifact 检查在 JUnit discovery 失败，报 `NoClassDefFoundError: JsonNode`。真实 Tauri 断网恢复仍待完成。当前实现与当时验证记录见[本节](#2026-10-12-timeline-离线排期命令)。

### 2026-10-11 资产库界面（Asset Studio）Awwwards 获奖级视觉设计与微交互全面重构（代码与自动验证通过；GUI 待验收）

- `src/views/Asset/index.vue`（资产库中心）：
  - **建筑级立体投影与分层质感（Architectural Elevations）**：
    - 针对用户反馈的卡片分层与辨识度痛点，全面重构三栏容器（左侧资产树 `.studio-left`、中间阅览区 `.studio-middle`、右侧星图 `.studio-right-context`）与核心纸张卡片（`.editor-paper-card`）的立体深度；
    - 引入高定近远场双层阴影系统：
      - 三大面板：`0 10px 30px -4px rgba(35, 45, 30, 0.08), 0 2px 8px -1px rgba(0, 0, 0, 0.04)`（暗色 `0 14px 36px rgba(0, 0, 0, 0.48), 0 2px 10px rgba(0, 0, 0, 0.35)`），搭配 `20px` 现代圆角；
      - 沉浸宣纸卡片：`0 16px 44px -6px rgba(35, 45, 30, 0.09), 0 4px 16px -2px rgba(0, 0, 0, 0.03)`（暗色 `0 20px 50px rgba(0, 0, 0, 0.5)`），搭配 `24px` 舒展圆角，形成仿佛手作宣纸浮于桌案之上的真实空间层次；
    - 统一继承 Auralis 禅意底座 `var(--color-bg-secondary, #F4EFEB)`（暗色 `#111411`），面板内部采用温润宣纸白 `var(--color-bg-primary, #FAF7F2)`；
  - **左侧资产树 (Tree Hierarchy) 与微交互**：
    - 搜索栏升级为集成胶囊容器（`border-radius: 9999px`），内置矢量搜索小图标 `<IconSearch>` 与快捷清空微按钮，获取焦点具备 3px Sage 呼吸扩散光晕；
    - 文件/知识块/任务树项目（`.tree-item`）优化为圆角微条，悬停向右轻盈平移 2px，激活项配备渐变柔光底座与左侧专属立体鼠尾草绿指示竖条（`::before`）；
    - 状态灯（`.status-dot`）升级为微晶呼吸灯：已就绪为翡翠绿微晶、构建/处理中为琥珀金呼吸光晕动效（`breathe-glow` 柔和缩放与漫射）、失败为红宝石微晶；
    - 底部上传热区（`.drop-zone`）升级为磁吸质感触控卡片，内嵌 32px Sage 微光图标底座与双行排版提示，拖拽悬停弹性缩放。
  - **中间沉浸阅览与编辑画布 (Dynamic Viewer & Editor Canvas)**：
    - 空状态（`.empty-state`）升级为禅意艺术构图，配双层同心柔光光环微浮动效（`float-soft`）、瑞士排版大标题与「导入新资产」快捷入口；
    - 阅览顶部 Header 升级为 `16px 28px` 毛玻璃吸顶面板（`backdrop-filter: blur(16px)`），状态胶囊（`.status-badge`）晶莹微透化；
    - 知识块编辑：标题输入框升级为 22px 沉浸无边框融入纸面，编写/实时预览按钮组升级为精密级 Segmented Control 胶囊滑块；
    - 任务编辑：Notion 风格属性网格（`.paper-property-panel`）与日期选择器全圆角微晶化，状态大胶囊支持弹性回弹。
  - **右侧关系星图 (Knowledge Star Graph)**：
    - 深度整合图谱画布，空状态升级为空灵星轨微光光环；
    - 彻底清理历史遗留的重复与废弃样式代码，精简优化 CSS 达数百行。
- **门禁验证**：`vue-tsc -b` 0 报错；`scripts/r4-asset-tasks.test.mjs`、`scripts/r4-register-file.test.mjs`、`scripts/r4-document-processing-ui.test.mjs`（20/20 项测试）全量通过；`npm run build` 生产构建成功。真实桌面端 GUI 待人工走查。

### 2026-10-11 排期页（Timeline）Awwwards 获奖级视觉设计与微交互全面重构（代码与自动验证通过；GUI 待验收）

- `src/views/Timeline/index.vue`（任务排期中心）：
  - **增强卡片投影与分层质感（Card Layering Elevation）**：
    - 为所有卡片（时间槽任务卡片 `.slot-task`、待安排卡片 `.pending-card`、周概览行 `.weekly-overview-row`、周视图卡片 `.weekly-task-card`、待排胶囊 `.pending-pill`）注入纯白高对比底座（暗色 `#1F241F`）与层次分明的近远场双层阴影系统（`0 4px 16px -2px rgba(35, 45, 30, 0.12), 0 2px 6px -1px rgba(0, 0, 0, 0.05)`），悬停态抬升并扩大漫射光晕；
    - 强化微晶边框对比度（`1px solid rgba(139, 154, 110, 0.22)`），使卡片在米色宣纸底座与网格槽上形成清晰立体凸起，彻底解决缺乏分层难以辨识的问题；
    - 严格遵循时间轴物理放置逻辑契约：维持 `TIMELINE_SLOT_HEIGHT = 80px` 与 `TIMELINE_SLOT_GAP = 4px` 严格对齐，内联高度算法零偏差；
  - **一体化禅意宣纸与水墨材质体系**：
    - 彻底移除原有生硬灰色 `#EEEEEE` 页面底色，全面融入 Auralis 经典宣纸底色 `var(--color-bg-primary, #F7F2EB)`（深色 `#111411`）；
    - 页面内边距调整为舒朗通透的 `16px 20px 20px`，间隙扩展为 `14px`；
    - 四大容器（`.timeline-header-card`、`.weekly-overview-column`、`.timeline-column`、`.tasks-column`、`.weekly-bottom-dock`）统一采用 `18px` 现代圆角、纯白透光面板、极细微晶 Sage 边框与清晰立体阴影；
  - **瑞士现代平面排版 (Swiss Editorial Typography)**：
    - 页面标题 `.page-headline`：`21px / 850`，`-0.025em` 紧凑沉稳；
    - 统计微晶胶囊 `.stat-pill`：升级为 32px 高度微晶药丸，背景 `rgba(139, 154, 110, 0.05)`，数值与标签层级清晰，悬停上浮 1.5px 激发 Sage 柔光；
    - 视图切换 `.view-toggle`：升级为高定弹性胶囊分段控制器，激活态纯白柔和微晶软阴影；
    - 「新建任务」主按钮内置加号悬停顺时针 90° 旋转，点击 `scale(0.96)` 弹簧回弹；「导入任务」次级按钮拥有宣纸微晶质感；
  - **左侧周排期概览 (`weekly-overview-column`)**：
    - 每日卡片 `.weekly-overview-row`：`13px` 细腻圆角，`is-today` 配置 Sage 呼吸光晕微圆点与透绿温润底，`is-active` 升级为左侧立体圆角高光微条；
    - 任务微轨道强化为透光微晶宝石感圆点，空闲时呈现内敛小印章；
  - **中间时间流细节 (`timeline-column` & `.time-slots`)**：
    - `.slot-time`：采用等宽数表对齐 `tabular-nums`，字重 650；
    - 当前时间指示针 `.current-indicator`：翠羽 Sage 呼吸扩散微动效（`sage-pulse`），时间指示线采用线性渐变自然消隐；
    - 任务卡片 `.slot-task`：`13px` 圆角，双层漫散阴影，悬停浮起 1.5px；学科标签升级为草木色立体微胶囊，关联知识块升级为温润琥珀微胶囊，删除圆钮升级为毛玻璃微圆纽；
    - 拖拽吸附状态高辨识度且柔和内敛；
  - **右侧待安排任务池 (`tasks-column` & `.pending-card`)**：
    - `.pending-card`：`14px` 圆角，左侧精致圆角高光色条，拖拽柄 `⠿` 悬停平滑显现，悬停实体抓取感（`translateY(-2px)`），逾期与截止时间胶囊采用瑞士网格精细对齐；
  - **周视图与底座坞 (`weekly-view-body` & `.weekly-bottom-dock`)**：
    - 7 泳道列精致立体圆角，今日列专属聚焦；底部坞升级为 Apple Dock 质感悬浮微晶面板，`.pending-pill` 悬停弹性微缩放。
- **门禁验证**：`vue-tsc -b` 0 报错；`r4-dashboard-timeline.test.mjs`、`r4-task-store-schedule.test.mjs`、`r4-task-view-rules.test.mjs`（109/109 项测试）100% 全绿；`npm run build` 构建成功。真实桌面端 GUI 待人工走查。

### 2026-10-11 学科大厅掌握度性能提升、三态掌握度轴色彩顺序完全对齐与学习复习切卡即时可用（代码与自动验证通过；GUI 待验收）

- `src/views/SubjectHall/index.vue`（学科中心/学科大厅）：
  - **掌握度加载极速秒开（批量聚合）**：彻底替换原有针对每个学科分别触发重度计算（`LocalSubjectStats.compute` 包含 7 天趋势生成和重复全表扫描）的设计，重构为单次批量提取所有有效知识块与评审记录（单次 `repo.list`），并在前端内存以 O(N) 极速归组统计，将数十个学科的加载耗时从数秒级压缩至毫秒级；
  - **加载状态互斥防抖**：建立 `isLoadingMastery` 与 `masteryPending` 互斥防抖机制，杜绝 mounted 与 watch 并发触发引发的 SQLite 读锁与重复开销；
  - **三态细轨色彩完全统一**：轨道颜色为待学习 `#88929E`、待复习 `#C49A6C`、已掌握 `var(--color-primary-accent, #8B9A6E)`，顺序保持 待学习 -> 待复习 -> 已掌握。
- `src/components/subject/SubjectReviewPane.vue`（学科复习页）：
  - **彻底移除复习过程中的所有瞬态报错弹条与通知框**：
    - 将页面顶部所有异常状态提示条（包括 `stateError`、`unsyncedBlocks`、`reviewSyncError`、`conflictedBlocks`、`localActionError` 等）严格限定在未进入轮次（`v-if="!round"`）的规划总览页展示，进入复习轮次后页面顶部 100% 纯净，绝不突然弹出红框挤压卡片；
    - 彻底移除复习卡片内部所有在操作或网络波动时瞬现的提示条与报错框（包括 `round.pendingError`、`round.pendingCommand` 操作提示条 `pendingOperationLabel`、以及 `currentLocalBlocksLoadError`），保持卡片内部仅聚焦核心内容与操作按钮，消除瞬时报错闪现及卡片高度颠簸；
    - 维持契约方法 `retryPending` 与 `reconfirmPending` 并通过 `defineExpose` 暴露；
  - **修复切卡按钮短暂无法点击问题**：
    - 将组件内部的全局哈希互斥状态 `hashingAction: ref(boolean)` 重构为卡片作用域的 `hashingBlockId: ref<string | null>(null)`；切到下一张卡时，新卡 ID 立即与该锁脱钩，不再受上一张卡异步微任务锁的滞留影响；
    - 优化 `canSubmitCurrentBlock` 判定条件：放宽为 `!statesLoaded.value && !states.value.length`，只要本地已有各知识块的持久化复习状态，即使后台发起静默重新同步，也绝不触发虚假禁用，实现卡片切换与操作按钮的零延迟即时交互；
  - **掌握度分布轨道色彩与顺序完全对齐**：
    - 将顶部「知识块掌握分布」细轨与图例完全对齐统计页（`SubjectStatsPane`）标准：
      - 待学习（`pending-learning`）：`#88929E`
      - 待复习（`reviewing`）：`#C49A6C`
      - 已掌握（`mastered`）：`var(--color-zen-sage, #8B9A6E)`
    - 顺序统一为从左至右：待学习 -> 待复习 -> 已掌握。
- **门禁验证**：`vue-tsc -b` 0 报错；`scripts/r4-subject-review.test.mjs`、`scripts/r4-subject-edit.test.mjs`、`scripts/r4-subject-stats.test.mjs`（68/68）测试全量通过。真实桌面端 GUI 待人工走查。

### 2026-10-11 学科大厅与学科工作台获奖级视觉升级与真实掌握度接口对接（代码与自动验证通过；GUI 待验收）

- `src/views/SubjectHall/index.vue`（学科空间大厅）：
  - **真实掌握度统计对接与三态细轨对齐**：彻底移除原来基于 `blocks / (files * 3)` 的临时估算逻辑；全面对接 `useStatsStore` 的 `loadSubjectStats(subjectId, { days: 7, timeZone })`，严格按照权威算法以 `overview.masteredCount / overview.activeKnowledgeBlockCount * 100` 渲染掌握度百分比；卡片底部进度条全面对齐学科内（`SubjectStatsPane`）的三态细轨比例展示（待学习 `#88929E`、待复习 `#C49A6C`、已掌握 `var(--color-zen-sage, #8B9A6E)`），保持极简无额外文字干扰的纯净细轨并支持交互 tooltip 详细提示，在 `local-review-updated` 事件与学科列表变更时自动联动刷新；
  - **瑞士现代平面设计风格标头**：页面大标题（24px，`-0.025em`）、透绿微晶空间计数胶囊、新建学科按钮悬停顺时针旋转 90°；
  - **沉浸式搜索微胶囊**：内嵌精致搜索图标、一键清空按钮、获取焦点具备 3.5px Sage 扩散光晕；
  - **学科卡片高定材质网格**：采用 `18px` 现代圆角、微晶边框与双层漫散光影（`0 16px 36px -6px rgba(0, 0, 0, 0.04)`），悬浮上浮 3.5px 并散射微光，44px 图标底座悬浮微放大加 3° 微转动，毛玻璃浮雕微操作圆钮；
  - **新建学科磁吸虚线卡片**：高阶微晶虚线外框，圆钮悬停 90° 旋转放大；空状态配置柔光双层光环。
- `src/views/SubjectWorkspace/index.vue`（具体学科工作台）：
  - **Tier 1 纵向导航条（`.tier1-strip`）**：`18px` 圆角，激活项重构为微晶内嵌立体胶囊（消除生硬左边框），触击提供 `scale(0.94)` 弹簧反馈，底部学科 Mini 徽标采用 40px 双层柔光渐变；
  - **Tier 2 抽屉（`.tier2-drawer`）**：平滑流畅阻尼展开，材料项悬停平移 2px，激活项增加呼吸高光指示条，添加材料按钮悬停旋转 90°；
  - **知识库子页面（`centerView === 'blocks'`）**：
    - 顶部搜索框升级为极简椭圆微胶囊，聚焦扩散 3.5px Sage 柔光；计数微徽标升级为 Sage 透绿立体微晶胶囊；「录入知识块」主按钮配置加号顺时针 90° 旋转与 1.08 倍放大微动效及触击回弹；
    - 知识块卡片底色遵循禅意宣纸三层底色体系回归经典温润底色 `var(--color-bg-tertiary, #FAF7F2)`（暗色 `var(--color-bg-secondary, #252422)`），外层保持 `--color-bg-primary, #F7F2EB`；配备 16px 精致圆角、微晶边框与自然双层漫散阴影；悬停上浮 3px 并散射 Sage 柔光；标头增加微笔记图标联动，右上角复制按钮增加绿色打勾成功反馈，删除按钮升级为毛玻璃微浮雕圆钮；正文行高放宽至 1.62，增强 Markdown 加粗与行内代码渲染；底部资料来源保持纯净文本与微图标设计（无冗余药丸底色）；
    - 空状态引入双层发光光环与引导卡片微动效；
  - **学科欢迎引导页（`onboarding-workspace`）**：瑞士平面大标题（24px，`-0.025em`），拖拽上传区域升级为透绿微晶虚线磁吸胶囊，引导卡片配备 `18px` 圆角、透绿微晶边框与图标底座 3° 微转动微动效；
  - **材料预览控制器与划词气泡（`preview-status-controls` & `floating-selection-bubble`）**：
    - 顶部缩放与旋转按钮组升级为一体化全圆角磨砂微晶胶囊控制器；底部分页器按钮升级为纯净胶囊；
  - **总览大纲组件（`FileOutlineList.vue`）**：按用户指令调回原版紧凑设计，维持既有轻量样式与交互。
- 门禁验证：`vue-tsc -b` 0 报错；`r4-subject-edit.test.mjs`（7/7）、`r4-subject-stats.test.mjs`（11/11）、`r4-subject-overview-ui.test.mjs`（16/16）、`r4-subject-review.test.mjs`（50/50）全量学科测试套件通过。真实桌面端 GUI 待人工走查。

### 2026-10-11 首页 (Dashboard) 获奖级视觉与微交互全面升级（代码与自动验证通过；GUI 待验收）

- `src/views/Dashboard/index.vue`：
  - **一体化禅意宣纸画布与通透材质**：重构三大栏（学科空间、知识流、日程与待办）外层容器与卡片质感，建立纯净呼吸底色（`#F5F1EB`，深色 `#111411`），圆角提升至 `18px`，采用晶莹微透边框（`1px solid rgba(139, 154, 110, 0.2)`）与双层自然漫散光影，彻底消除生硬灰边与割裂感；
  - **瑞士平面排版优化**：欢迎标头字重提升至 850 并微调字符间距（`-0.015em`），完成任务与专注时长升级为精致温润胶囊微徽标；知识流标题与副标题采用高雅字阶，知识块卡片（`stream-row`）内边距扩展至 `18px 22px`，Markdown 预览行高提升至 `1.65`，正文、代码与加粗样式全面对齐极简美学；
  - **触感微交互与跳转动效体系**：
    - 全局「全部知识」卡片与学科列表项增加弹性按压与悬浮微浮雕反馈；
    - 「管理学科」按钮内置 `<IconArrowRight>`，悬停时箭头向右弹性平推 3px，按压反馈 `scale(0.97)`；
    - 知识流顶栏在选中学科时平滑呈现「进入工作区」直达胶囊，悬停时右上箭头平移位移 2px；
    - 「前往排期」跳转按钮内置 `<IconChevronRight>`，悬停时图标平滑向右推进 3px 并带浮雕微阴影；
    - 「新建任务」FAB 按钮内置 `<IconPlus>`，悬停时顺时针旋转 90 度并放大 1.08 倍，触击挤压回弹 `scale(0.92)`；
    - 空流「创建学科空间」按钮配微图标与光泽漫反射，周视图甘特行悬停向右微移 2px 强化日视图切入感；
    - 7 日选择器激活日期圆圈接入 `day-circle-pop` 弹性放大微动效，今日指示器增设微光环绕；日程任务卡片左侧装饰圆角 Sage 高光竖条，移出日程按钮升级为极简矢量图标 `<IconX>` 柔和悬浮渐显；待办条目全面升级为圆润高定胶囊（`border-radius: 9999px`），截止时间徽标具备鲜明的逾期与常规色彩层级；
  - **门禁验证**：`scripts/r4-dashboard-timeline.test.mjs` 与 `scripts/r4-dashboard-search-navigation.test.mjs` 专项回归 19/19 项测试全部通过；`vue-tsc` 0 报错退出码 0。真实桌面端 GUI 待人工走查。

### 2026-10-11 总结预览视图精简（代码与自动验证通过；GUI 待验收）

- `OverviewSummaryView.vue`：
  - 移除顶部操作栏中的「调整要求」按钮及关联的 `SummaryInstructionDialog` 弹窗与状态；
  - 移除重新生成时的黄色通知条「正在生成新版本，当前总结继续保留。」，去除冗余视觉噪音，由按钮自身的旋转与禁用态承担生成反馈；
  - 自动化验证：`scripts/r4-subject-overview-ui.test.mjs` 更新断言，总览专项回归 138/138 项测试通过；`vue-tsc` 0 报错。真实 GUI 体验待走查验收。

### 2026-10-11 学科复习规划总览每组题量切换统一提取（代码与自动验证通过；GUI 待验收）

- `SubjectReviewPane.vue`：
  - 彻底消除所有重复及独立的题量控制：移除嵌入在「待学习」与「待复习」卡片右上角重复出现的 `每组 [5 个] [10 个]`，同时彻底移除「自测复习」入口内独立的 `[5] [10]` 题量分段按钮；
  - 在卡片网格上方建立横向统一微操作栏（`.subject-review__panels-toolbar`）：
    - 左侧配置全页唯一的全局 `每组 [5 个] [10 个]` 题量切换胶囊（高度 28px、圆角 8px、精致边框与微阴影），同时驱动常规「进入学习」、「进入复习」与「自测复习」的题量（统一为 `groupSize`，抽样数量严格为 `min(groupSize, candidateCount)`）；
    - 右侧配置统一的纯粹「自测复习」触发胶囊（高度 28px、圆角 8px、与左侧完全对齐），悬浮 tooltip 动态提示抽查数量；
  - 下方「待学习」与「待复习」卡片 actions 区域纯化为专注核心的「进入学习」与「进入复习」主操作按钮，大幅释放卡片行宽与呼吸感；
  - 自动化验证：`scripts/r4-subject-review.test.mjs` 50/50 项测试全量通过；`vue-tsc` 0 报错。真实 GUI 体验待走查验收。

### 2026-10-11 Overview 手动停止与生命周期取消（代码、相关自动验证与只读审查通过；真实环境待验收）

- `useOverviewApi` 使用现行两个 POST 的可选 SSE；终端结果仍由现行 Overview validator 检查，EOF 不视为成功，300 秒绝对期限覆盖响应等待。启动时捕获账户/会话 scope，旧请求不得在新账户下 refresh/retry。
- 学科总览和文件行手动生成提供“停止”；切换学科或卸载页面只停止该页面拥有的消费者，后台自动生成继续。同键兴趣合并时，一个消费者停止不影响其他消费者；runtime/account 停止和资料删除、修订失效取消对应旧调用。
- 明确取消不标记 FAILED，不移除已有成功 cache/outbox；现行 generation、revision、owner 和写队列围栏继续拒绝迟到响应。已有缓存更新广播及 B 个人中心额度保留。401 共享刷新等待期间，停止或期限可及时结束本 Overview，而不取消全局共享 refresh；终端事件后主动取消 reader。
- 最终主树 Overview 72/72、cache 14/14、sync 22/22、runtime 20/20 通过；保留并行总结视图精简后的同 hash 联合候选 Subject UI 16/16、应用类型检查及 Vite 构建（6.93s）通过。初期 110 文件静态检查、工具类型检查和 `vue-tsc -b` 已通过。Mobile 同步 SDK 后类型检查仍有旧 Review `EventRequest/EventResponse` 两处错误，属于另行登记的调用方迁移，不代表两端类型检查均通过。
- Antigravity MCP 实际提供 API/helper/types 与初始测试；service、runtime、Source 修订取消、三处停止控件及 SQL 提交 guard 由 Luna 补齐，未把委派 exit 0 当作需求验收。逐文件守卫最终应用 15 个任务文件，未应用依赖、生成声明或构建产物。命令、完整差分和未覆盖 GUI 边界见 [实施计划](../plans/2026-10-11-overview-hard-timeout-cancellation.md)。
- 审查补修新增 repository 的可选同步操作 guard，仅在实际写队列/事务提交前核对取消、代际和修订。SQL 取消回滚本操作 cache/outbox，browser 单键写前同步检查；不在事务中发 Source 网络请求，不再取消后删除整个 Subject 缓存。最终同步 guard 通过并进入 COMMIT 为提交边界，之后 Stop 不撤销已提交成果。真实 SQLite 屏障 RED 2/2，最终 Overview 72/72、cache 14/14、sync 22/22、runtime 20/20 通过；该补修使任务源/测试共 15 个，当前类型与 Vite 构建另有新鲜通过证据。

### 2026-11-11 PC 复习补传与待核对恢复

- 本地确认、纠正及服务端 ACK 的命令审计分别使用初选评分与 `AGAIN`。ACK 同时更新正式历史和独立云端锚点，后继继续沿真实回执补传。
- 同学科、同正文的标题等元信息更新后，重新加载的复习状态显示当前 KB 修订。未固化的请求在核对完整云端状态及历史后绑定当前修订。已固化的请求保持原 ID 与载荷，按服务端原回执和当前完整历史结算，旧请求遭拒绝或历史另有变化时进入显式冲突。进行中的临时轮次继续检查开始时捕获的 KB 版本。
- 移科保留调度、学习和掌握状态。原学科未确认的选择保留审计并失效，旧待同步意图保留给显式冲突处理。新学科在当前 KB 修订上产生的首次学习仍可凭完整空历史补传。
- 常规组优先恢复可核对的初选。恢复项只占一个队列位置，核对后继续下一卡或结束本组。

### 2026-10-11 复习迁移到生命周期接口

- PC 复习页只从本地正式状态和 `/api/reviews/lifecycle/history` 恢复复习，不再请求 `/api/reviews/due`、`/api/reviews/events` 或旧 `/api/reviews/history`；新提交仅走生命周期命令。
- 本轮删除 PC 旧 API wrapper、旧历史合并及旧事件存储兼容分支；生命周期 outbox、回执/冲突处理和正式本地记录保留。复习与自测的卡片池/天数逻辑继续以现行 lifecycle 状态为准。

### 2026-10-15 文件登记上传弹窗进度生命周期与状态卡死修复（代码、测试与类型检查通过；GUI 待验收）

- 现象与根因：
  - 用户反馈“有时候会出现上传完然后弹窗卡住了，就是上传没成功也显示成功了”；
  - 根因分析：
    1. 时序颠倒与提前虚假完成：`assetStore.upload` 仅代表本地资产缓存写入（前序阶段），原代码在本地保存完成后即向 UI 回报 100% 进度，而真正的学科资料源创建 `createFileSource` 与列表加载尚未完成；`FileRegisterDialog` 仅根据 `displayPercent >= 100` 或内部擅自将上限写死为 86% 即提前将文本与按钮显示为“导入完成”，造成未真正成功已显示成功的假象；
    2. 失败后弹窗卡死停留在 100%：当后续阶段（如 `createFileSource`、`loadLocalSourceFiles` 或 `loadAssetsFromBackend`）出现异常进入 catch 时，未重置 `uploadProgress` 为 0，也未关闭弹窗，导致弹窗继续挂在屏幕上并呈现 100%“导入完成”的错误假象；
    3. 异步定时器悬挂：`Asset/index.vue` 使用脱离主调用链的 `setTimeout` 控制关闭，存在异常时无法可靠关闭弹窗的风险。
- 调整与修复：
  - `FileRegisterDialog.vue`：
    - 移除未经授权的虚假进度上限（`ceiling = Math.max(rawTarget, 86)`），进度引擎平滑跟随各阶段真实目标值；
    - 严格引入 `isCompleted` 校验（要求底层 `props.uploadProgress >= 100 && displayPercent >= 100`），未真正全部完成前禁止提前显示“导入完成”；
    - 弹窗关闭时自动重置进度（`displayProgress.value = 0`）并终止动画，防止下次打开残余旧状态。
  - `SubjectWorkspace/index.vue` 与 `Asset/index.vue`：
    - 合理划分全生命周期进度阶梯：本地资产持久化（10%~70%）、学科资料源关联（75%）、列表加载（90%），全流程确认成功后方置为 100% / 导入完成；
    - catch 块统一显式清理 `uploadProgress.value = 0` 并重置状态文本，杜绝失败时遗留 100% 成功假象；
    - 成功时使用可靠的微延迟 `await new Promise` 顺序关闭弹窗，移除脆弱的无保护 `setTimeout`。
- 验证：`scripts/r4-register-file.test.mjs` 增补进度守卫与失败重置断言，全量 6/6 通过；`vue-tsc -b` 0 报错。真实 GUI 视觉与真机交互待人工验收。

### 2026-10-15 学科大纲编排独立性保证（未生成综合总览时不预填单文件大纲）

- 现象与用户需求：在未生成涵盖全文件的学科总览时，用户进入大纲编排/编辑界面时，系统曾自动将单一文件的大纲内容填充进学科大纲编辑区（表现为拼接/混合单文件内容）；用户明确不需要此行为。
- 调整与边界：
  - `SubjectWorkspace/index.vue` 的 `initSubjectOutlineFromExisting` 在学科总览尚未生成时，保持学科大纲独立，直接初始化独立的新建章节（`第一章 · 新建章节`）供用户自主编写，不再自动拷贝单文件或部分文件的大纲；
  - 移除 `watch(fileOverviewItems)` 中对未生成学科大纲的自动覆盖逻辑；
  - 编排态下方各文件的独立大纲编辑卡片保持不变，依然支持单文件大纲独立编辑与保存。
- 验证：`scripts/r4-subject-overview-ui.test.mjs` 增补独立性回归测试，17/17 测试全绿；`vue-tsc -b` 0 报错。真实 GUI / 编排交互待人工验收。

### 2026-10-11 学科总览后台返回后响应式自动刷新（代码与自动验证通过；GUI 待验收）

- 现象与根因：文件总览与学科总览在后台由 `OverviewGenerationService` 或外部请求完成生成并写入 SQLite `ai_overview_cache` 后，仓储层未向 UI 广播更新通知；`SubjectWorkspace` 仅在初次加载和切科时读取缓存，未 watch `activeSourceFiles` 状态与版本跃迁，导致页面卡在“等待文件解析并生成大纲”或旧大纲，需手动刷新整页（F5）才读取显示。
- 事件层与仓储联动：
  - `src/services/overviewSyncWakeup.ts` 新增导出 `OVERVIEW_CACHE_UPDATED_EVENT`（`auralis-overview-cache-updated`）、广播函数 `notifyOverviewCacheUpdated` 与订阅函数 `subscribeOverviewCacheUpdated`。
  - `src/services/overviewRepository.ts` 在 `saveFileOverviewPart`、`saveSubjectOverviewPart`、`installRemoteOverview`、`useRemoteOverview`、`markFailed` 持久化操作后统一派发更新事件；新增 `getLatestFileOverview(sourceId)` 在内存 revision 尚未同步时兜底回查本地最新缓存。
- 视图层响应式响应：
  - `SubjectWorkspace/index.vue` 在 mounted 中通过 `subscribeOverviewCacheUpdated` 注册监听；收到当前 `subjectId` 或关联 `activeSourceFiles` 的更新广播后，自动重置加载态、拉取最新缓存；卸载时清理订阅。
  - 增加对 `activeSourceFiles` 的 deep watch，原材料进入 READY 或 revision 变更时自动调用 `refreshOverviewCache()`。
  - watch `fileOverviewItems`，在文件大纲更新后同步刷新各文件对应草稿。
- 验证：`scripts/r4-subject-overview-ui.test.mjs` 增补订阅广播、注销生命周期及兜底回查测试，全量测试通过；`vue-tsc` 0 报错。真实 GUI / Provider 待验收。

### 2026-10-11 个人中心 AI 额度与预算提示（代码、相关自动验证与只读审查通过；GUI 待验收）

- 现有 `Profile` 的 AI 区域使用 `getAiUsage` 读取本人 `GET /api/ai/usage`，显示小时/今日总额、已结算、在途预留、剩余和本地重置时间。`aiUsageGuardHelper` 验证窗口字段，并以请求代次和账号身份拒绝旧响应；加载、失败与显式刷新各自可见。
- `clientErrorPolicy`/`overviewFailurePolicy`、SSE 解析及 `aiStreamController` 保留六种 AI 预算/额度错误的安全 retry/reset 字段，使用端侧提示，不将 Provider 原始详情当额度文案；现行显式重试与已成功内容保留。
- Luna 管理 Antigravity Gemini 3.1 Pro High 生成候选，再根据实际语法、类型与行为失败作最小补修，按 hash 守卫应用。主树行为 8/8、AI stream 5/5、Overview 错误文案 3/3，联合候选构建及最终生成 SDK 下类型检查通过；两端 schema 同 hash，唯一只读审查通过。GUI/Tauri/真实 Provider 未验收，证据及既有范围外失败见 [B 计划](../plans/2026-10-10-ai-usage-guard-b.md)。没有新增路由、依赖或持久化额度 Store。

### 2026-10-10 AI 伴读来源文件名

- `SubjectWorkspace` 在历史和流式 assistant 回答下显示实际 citation 的去重文件名；`aiCitationFileNames` 只读取有效字符串 title，去空并 trim，保持首次出现顺序。没有有效 citation 时隐藏来源列表，不以所选检索范围替代引用。
- 文件名使用 Vue 文本插值；Markdown/KaTeX 正文、Store、SSE、显式范围选择与重试生命周期保留当前实现。没有新增 excerpt、相似度、页码、内部 ID 或点击导航。
- 前端由 Luna 管理 Antigravity 的 Gemini 3.1 Pro (High) 实施，Luna 补强纯文本回归并守卫应用三个路径。相关测试 27/27、工作区静态检查、隔离 type-check/build 退出 0；完整 R4 679/680 的剩余 CRLF 测试失败和已有 Rust 扫描失败见 [实施记录](../plans/2026-10-10-ai-important-fixes.md)。真实 GUI/Tauri/Provider 未验收。

### 2026-10-10 自测轮次启动校验与开发更新

- 现行自测从当前学科全部活动知识块打乱取样，使用独立 `voluntarySize` 5/10；实际抽取数量为所选值与候选数量的较小值。常规复习仍只取到期块。
- `useReviewStore.startLifecycleRound` 在发布轮次前拒绝空 queue；`SubjectReviewPane.startVoluntaryReview` 核对 returned round、queue/firstGroupCount/current ID 与所选候选，错误仅清除对应临时轮次。既存空轮次或当前卡片不可显示时呈现错误卡片。
- `useReviewStore` 开发模块更新注册 HMR accept 并执行整页 reload，清除旧 setup Store 动作；正式本地记录/outbox 由现行仓储重载，临时轮次只切页恢复、刷新不恢复。没有新接口、数据字段或依赖。
- 主树三脚本回归 107/107、force type-check 退出 0，源 hash 相同的隔离 Vite build 退出 0。真实 Tauri/SQLite GUI 待验收；命令与源 hash 在 `D:/Temp/auralis-voluntary-review-zero-fix-20261010/`。下方三个入口只读记录是当时的候选范围。

- Pane 的 `localBlocksLoadedScope` 与读取失败状态绑定 subject/account；未成功加载当前 scope 时不判定空轮次、不 reconcile 暂时空活动列表。恢复有效轮次的失败读取保留进度并提供重试，更新/error 受原 request version/subject/account 围栏保护。三条 SFC 延迟读回归及唯一只读复核通过，最终 BLOCKER/IMPORTANT/OPTIONAL 均为 0。

### 2026-10-10 复习页三个入口只读核对

- 学习：新知识块和 `needsLearning` 内容进入阅读→隐藏回忆→核对；首次学习完成安排 3 天，有状态的重学完成安排 10 分钟。
- 复习：当前学科未掌握且到期的知识块按 dueAt 进入轮次；认识/模糊/忘记初选接正式日期处理，核对记错按同 reviewId 修正为 AGAIN 并进入学习，模糊有组末巩固。
- 主动复习：当时检查未到期及已掌握集合抽查，Store `VOLUNTARY` 模式接同一本地生命周期；成功提前练习不增加稳定次数、成功掌握抽查保留掌握，失败仍按 AGAIN 转学习。记录与 outbox 使用现行原子保存、后续补传机制，不建立独立云端依赖。
- 最新三脚本专项 98/98 与 type-check 退出 0；临时动态探针实际点击主动入口并确认两类块的真实本地记录/outbox。只读代理因额度未运行，主 Agent 接手；核对期间外部页面更新保留，本轮没有修改复习源码。证据 `D:/Temp/auralis-review-three-entries-audit-20261010/`；GUI/Tauri/HTTP/双设备独立验收。

### 2026-10-10 任务截止日期输入与排期 instant 一致性（代码与自动验证通过；GUI 待验收）

- `taskViewRules.localDateEndOfDay` 只在明确的用户日期输入边界转换有效纯日期；`parseDueTimestamp` 只接受带时区时间戳并保留真实 instant，读取时不兼容解释存储的纯日期；非空无效/无时区截止值会阻止新排期。`TaskCreateDialog`、`useTaskStore.normalizeDueAtForUserInput` 和资产库日期编辑仅在明确的用户输入时按当地日末生成 UTC ISO；读取或排期旧任务时保留原截止值，不自动兼容或修正。现有完整区间截止、放置/插入/交换及自动完成规则沿用同一解析。
- 资产库任务日期按本地时区显示，临时 `dueDateTouched` 区分未编辑日期与 clear→reselect；未编辑日期保存保留原精确截止，显式清空仍转为现行 UPDATE 的 null。标记在任务树重建后清除，不新增持久化或接口字段。
- 源码仅四文件，测试仅三文件；实际主树 HK95/95、UTC/LA各7/7、R4 669/669、type-check/build退出0。Luna 实施、根差分审查及一名只读 reviewer通过；Antigravity因地区失败未生成。GUI/Tauri/HTTP及C临时副本清理未完成，范围外静态扫描失败保留，证据见 [实施记录](../plans/2026-10-09-task-deadline-date-consistency.md)。

### 2026-10-11 学科空间大厅 (/subjects) 与具体学科工作区 (/subject/:id) 体验全面升级（已通过自动化测试与类型检查）

- `SubjectHall/index.vue`（学科空间大厅）：
  - 头部重构：引入现代瑞士大标题（24px，`-0.025em`），搭配「共 N 个空间」统计微胶囊与加号悬停 90° 旋转的主操作胶囊按钮；
  - 搜索栏：升级为圆角全封搜索胶囊，左侧常驻搜索图标，右侧配备一键清空按钮，聚焦时产生 3.5px Sage 扩散光晕；
  - 学科卡片（`.subject-card`）：升级为 18px 现代圆角、透绿微晶边框与双层自然散光阴影；悬停轻柔抬升 3.5px 并漫射透绿微光，触击具备 0.985 阻尼微缩；
  - 卡片头部与图标：44px 独立图标容器，悬停触发微放大与 3° 微转动动效；编辑与删除微按钮升级为毛玻璃浮雕圆钮；
  - 掌握度仪表：卡片底部增加「知识掌握度」微型标签与动态百分比数字，搭配平滑渐变进度槽；
  - 新建学科空间卡片（`.add-card`）：升级为高阶微晶虚线磁吸卡片，中央加号圆钮悬停顺时针旋转 90° 并平滑放大；
  - 空状态优化：引入双层发光光环与清空搜索引导操作。
- `SubjectWorkspace/index.vue`（具体学科空间工作台）：
  - Tier 1 纵向导航条（`.tier1-strip`）：外壳圆角升级为 18px，移除激活态生硬的左边框，重构为微晶内嵌立体胶囊，触击提供 `scale(0.94)` 弹簧阻尼反馈；
  - 底部学科 Mini 图标徽标：升级为 40px 双层阴影渐变胶囊，悬停微旋转放大；
  - Tier 2 抽屉侧栏（`.tier2-drawer`）：过渡优化为 0.32s 弹性流畅阻尼展开，材料项（`.drawer-item`）悬停向右平移 2px，激活态配备呼吸高光指示条；
  - 添加材料按钮（`.drawer-action`）：悬停顺时针旋转 90° 放大，触击微缩；
  - 中央工作台（`.workspace-center`）：升级为 18px 圆角与双层柔光扩散阴影，顶部状态栏控制组强化触觉反馈。
- `SubjectOverviewSection.vue`（学科总览大纲）：
  - 大纲节条目（`.subject-outline__section`）悬停平滑向右微移 2px，右侧箭头图标同步微滑动，强化触觉指引。
- 自动化门槛：`vue-tsc -b` 0 报错；`scripts/r4-subject-edit.test.mjs`、`scripts/r4-subject-workspace.test.mjs`、`scripts/r4-subject-stats.test.mjs`、`scripts/r4-subject-review.test.mjs`、`scripts/r4-subject-overview-ui.test.mjs` 等 91 项学科测试全绿。

### 2026-10-11 全局模态弹窗系统与首页弹窗交互深度优化（已通过自动化测试与类型检查）

- `ModalShell.vue` 与 `modal.css`：
  - 遮罩升级为 `backdrop-filter: blur(14px) saturate(180%)` 深层环境漫散，弹窗卡片内置发丝级内高光（`inset 0 1px 0 rgba(255, 255, 255, 0.7)` / 暗色 `inset 0 1px 0 rgba(255, 255, 255, 0.08)`）配合双层立体微晶柔光扩散阴影；
  - 进出场搭载阻尼弹簧动效（`scale(0.96) translateY(12px) -> scale(1) translateY(0)`，曲线 `cubic-bezier(0.16, 1, 0.3, 1)`）；
  - 关闭按钮引入 Tabler 矢量 `<IconX>`，悬停支持 90° 旋转与 0.92 触击回弹；
  - 表单输入框聚焦搭载 `3.5px` 扩散式 Sage 柔光外环；
  - 主按钮（`.modal-btn-primary`）升级为渐变光润立体微胶囊，次按钮配备半透明微晶底板与发丝边框。
- `KnowledgeBlockViewDialog.vue`（知识块详情弹窗）：
  - 头部将笔记本微图标直接融合至标题插槽，搭配大标题杂志级排版（19px、`-0.02em`）；
  - 来源资料与记录时间微标采用圆角全封胶囊与微边框；
  - 正文卡片内衬米白宣纸质感并放宽阅读留白与行高（1.76），空状态微图标柔化；
  - 底部「复制内容」点击弹出翠绿打勾动画与轻触反馈，「前往知识块界面」悬停支持箭头右上穿透位移。
- `TaskCreateDialog.vue`（新建任务弹窗）：
  - 学科选择网格升级为立体微质感胶囊（`.subject-chip`），激活态增加高雅 Sage 柔光双层外环与触击缩放；
  - 整半小时磁吸滑轨（`.duration-segmented-track`）增加内阴影，活动手柄（`.active-thumb-pill`）增强渐变质感与拖动微光圈；
  - 严格保持已有契约（`zen-date-picker`、`zen-date-popper`、`dueAtFromInput` 等）。
- 自动化门槛：`vue-tsc -b` 0 报错；`r4-task-create-dialog-deadline.test.mjs`、`r4-dashboard-timeline.test.mjs` 等 37 项测试全绿。

### 2026-10-09 学科复习与统计本地读取、持久操作和独立补传（代码与自动验证通过；真实环境待验收）

- 复用 `SubjectReviewPane`、`SubjectStatsPane` 及现行 Store。主树增加 `reviewRepository`、`reviewLifecycleEngine`、`localReviewService`、`localSubjectStats`、`reviewSyncService`，由当前 localDb v12 保存正式投影、历史和待同步意图；页面读取/反馈不等待 Review/Stats HTTP。
- `useStatsStore` 仅学科路径改本地，个人页统计及 Focus 归属保持现行实现。学科本地聚合活动资源概况、适用墓碑历史、独立学习完成和按 reviewId 的有效复习，按 IANA 自然日补齐近7/30天。未知云端状态不计入确定的新学习数，导入完整度另行显示。
- `LocalReviewService.getSubjectStates` 保留逐块原子事务/浏览器锁，复用锁内读取或更新后的 `ReviewRecord`，为每个有正文 hash 的知识块减少一次事务后重复查询；正文变化失效仍在同一事务中完成。
- `useSyncStore.runCycle` 初始化本地数据库、重核账号 scope 后，将 `getLocalSqlDatabase()` 返回的连接传给 `ReviewSyncService`。不同知识块最多由三个 worker 并发处理，同学科共享一次在途状态投影；同一知识块的命令保持顺序执行。scope 变化或 401 后停止分配新任务，等在途 worker 结束再退出同步周期。
- `useSyncStore` 在 core Sync 后唤醒独立 Review Sync，逐 KB FIFO，core mutation 未收敛先 defer。网络失败原载荷重试，409保留本地冲突；显式采用云端进度归档未采用意图。既有五类 core mutation 不增加 Review 类型。
- 临时轮次仅 Pinia 内存切页恢复；刷新/重启清轮次，正式数据/outbox保留。结束本轮返回规划页只清临时轮次。账号/设备/session 代际、活动父/KB、实际正文 hash、版本与存在性约束贯穿提交/派发/结算。
- 本地冲突按标准409识别；重新确认仅读取严格完整的本地历史，未知或资格变化安全结束卡片，正式记录/outbox保留。浏览器资源只读当前账号的现行 LocalRepository，忽略未隔离的旧缓存，不做隐式兼容或数据删除。
- 本地排程对齐当前 Service：提前/短期 GOOD 不加稳定次数，最终到期且距上次练习满30天的确认才毕业；已有状态重学一律10分钟，手动重开清除旧核对ID。正式初选及后继保留相同 reviewId，只有实际 ACK 前缀能推进后继。
- 最终主树 `test:r4-pc` 664/664、type-check、两项学科静态检查与 build 均exit0。Antigravity两次生成未完整通过，Luna按实际失败补修；唯一 reviewer完成初审后因额度中止，主Agent接手最终代码审查与必要修复。保留期间外部UI及时间轴修改。真实Tauri/GUI/HTTP与双设备未验收；命令、差分与范围见 [本地实施](../plans/2026-10-09-review-stats-local-first.md)。下方2026-10-08在线范围仅为当时记录。

### 2026-10-09 学科统计布局与极简禅意 UI 重构（已通过自动化测试与类型检查）

- `SubjectStatsPane.vue`：
  - 彻底去除臃肿堆叠的灰框、沉重阴影与冗余辅助文本，建立空间感充裕（`1160px` 居中、`36px 48px 72px` 内边距、`32px` 模块间距）的三层极简仪表板（Hero 看板、近 7 天走势、资产与任务底座）；
  - 核心 Hero 呈现清晰的大字掌握率（`52px` Zen Sage）与极简三态细轨（`8px`），右侧平铺三个层级分明的「当前行动」卡片（`待复习` 今日到期琥珀色高光突出、`待学习`、`已掌握`），行动意图明确；
  - 走势面板将每日柱状图（`16px` 极简细柱与圆角平滑底槽）与今日/累计复习和完成学习指标并置，视觉节奏平稳克制；
  - 底部双栏工整收纳资源沉淀与任务协同状态，消除过往 12 块分散卡片的杂乱视觉负担；
  - 模板避免深层静态节点堆叠，消除 Vue compiler 触发 `createStaticVNode` 对自定义渲染器的潜在兼容影响；
  - 同步清理 `SubjectReviewPane.vue` 顶层冗余的 `historyImportIncomplete`（「本机尚未导入完整的历史复习状态」）通知栏与未读计算属性，净化视觉噪音；
  - 自动化门槛：`r4-subject-stats.test.mjs`（11/11）、`r4-subject-review.test.mjs`（48/48）、`npm run test:r4-pc`（659/659）、`npm run type-check` 全量通过。

### 2026-10-09 学科复习与统计交互美学与布局深度重构（已通过自动化测试与类型检查）

- `SubjectReviewPane.vue`：
  - 复习最外层（规划仪表盘）彻底移除多余返回键，模块切换统一使用 Tier 1 侧边栏；
  - 答题卡片毛玻璃拉长延展，卡片占页面 70%~80%；
  - 彻底去除骨架屏灰条，正文与底端按钮间增设柔和严谨的提示词（「请在脑海中主动回忆该知识块的核心概念与要点，并依据提取的清晰度与完整性进行客观评估：」）；
  - 底端平铺自适应三按钮（认识、模糊、忘记了），配备高质感立体阴影与悬停微光。
- `SubjectStatsPane.vue`：
  - 彻底移除顶层多余的返回键，保持学科内 Tier 1 侧边导航的层级一致性；
  - 替换 Emoji 占位图标为专业 Tabler 矢量图标（`IconBook`、`IconBrain`、`IconClock`、`IconCircleCheck`、`IconFlame` 等）；
  - 全量统一色板为 Auralis 禅意极简调色系统（Zen Sage、暖琥珀、灰岩），去除刺眼蓝橙与生硬顶部彩色边框；
  - 重构散乱内容为四层规整布局：① 学科掌握度与三态入口卡片、② 学习记录与打卡日历（2x2 指标 + 连续打卡）、③ 近期学习走势与结构化活动沉淀面板（取代 9 颗杂乱药丸标签）、④ 任务协同状态网格；
  - 容器尺寸自适应收敛（最大 1320px 居中），配备柔和悬浮卡片投影。
- 自动化门槛：`r4-subject-stats.test.mjs`（16/16）、`r4-subject-review.test.mjs`（48/48）、`npm.cmd run test:r4-pc`（618/618 全量通过）、`npm.cmd run type-check` 全部通过 0 报错。

### 2026-10-08 学习、复习纠正与掌握退出（代码、相关自动验证及只读审查通过）

- 保留学科侧栏与`/subject/:id?view=review|stats`，ReviewPane调用现有Review Store内新增生命周期流程：标题回忆→认识/模糊/忘记初选即提交→正文核对确认或纠正；学习为阅读/隐藏回忆/核对，独立完成命令；HARD组末仅一次巩固。
- Store以当前账号/设备/会话/学科隔离临时轮次、阶段、巩固标记与原命令，切页恢复且不写持久outbox；删除或移出KB清队列、未知提交原样重试、旧冻结state不能回退已读取的更高版本。按实际正文计算内容hash，未同步正文受正式操作校验。
- 今日队列保留学习项原序、到期复习按dueAt升序；未来待复习项由独立“提前练习”入口选择，不进入自动今日队列。手动正向结果不推进有效跨天稳定次数，日期与进度使用服务端回执。
- API接真实OpenAPI三值生命周期类型，只读取lifecycle审计；旧事件历史合并已移除。统计接pendingLearning/reviewing/mastered互斥三态与实际掌握率，学习完成与有效复习分别计数。保留当前7天趋势/日历/任务布局，专注仅个人页。
- Antigravity实际完成并经完整差分审核的两Pane配色已应用：Sage主操作/掌握/日历、warning模糊、danger失败、info待学习；仅替scoped style body，保留所有最新业务前后文与用户布局。无依赖、全局变量或跨模块写入。
- 最终新机制专项63/63，type-check、subject-icons、subject-workspace与最终build均exit0；跨设备不同/相同reviewId推进、正文资格变化和legacy清空ID后的过期命令可清除并结束重开。history读取后复核最新状态/内容/当前ID，保留真正未提交的原commandID重试，避免覆盖另一设备新初选。唯一只读reviewer BLOCKER=0、IMPORTANT=0、OPTIONAL=0。GUI/Tauri/真实HTTP与双设备验收独立记录，完整命令、实际哈希和范围证明见 [本轮实施](../plans/2026-10-08-review-learning-mastery-implementation.md)。

### 2026-10-08 复习卡片两项反馈

- 先回忆标题，点击“展开内容”核对正文，再选择“下一个”（GOOD）或“记错了”（AGAIN）。展开不评分；首次反馈成功后推进，记错项回到本轮队尾，后续巩固只更新轮次内存。
- 本次源码仅修改 ReviewPane 与现有复习专项，复用现行 Store/事件接口。历史值与待确认请求按原事件处理；当前计划卡片、遮罩和统计日历已按本轮基线保留。
- 最终复习/统计专项 41/41，较早全量 R4 595/595，类型、两项学科静态与构建退出 0；唯一只读 reviewer BLOCKER=0、IMPORTANT=0、OPTIONAL=0。最终测试增强由随后专项覆盖；GUI/Tauri/真实 HTTP 待验收。完整命令、时序及当前快照见 [实施补充](../plans/2026-10-08-subject-review-stats-implementation.md)。

### 2026-10-08 学科复习与统计体验重构（防剧透自测与计划打卡日历）

- `SubjectReviewPane.vue` 重构为防剧透学习仪表盘：未开始轮次时默认不摊开各具体知识块标题与正文摘要，提供沉浸式“今日复习计划”卡片，展示学科名称、待复习总量、橙色进度条与“开始本轮”按钮；“新学习/待复习/已安排”列表收拢在折叠抽屉中，默认收起以防止记忆提取前提前剧透泄题。
- 卡片未揭晓（`!round.revealed`）时采用骨架遮蔽线与温和微脉冲，先按标题回忆，再用单一“展开内容”操作核对正文；揭晓后仅提供“下一个”（GOOD）与“记错了”（AGAIN）两项反馈，沿用当前胶囊样式和 Store 提交路径。
- `SubjectStatsPane.vue` 升级为现代学习 App 计划与统计布局：新增学科封面书本卡片、总进度条、三段掌握度图谱与状态跳转卡片；新增“签到日历”组件，计算连续打卡天数，以周一到周日（MON~SUN）矩阵展示本周每日打卡圆圈标记（今日标记为“今”）；保留近期走势圆角柱状图与四档评分分布。
- 自动化门槛：`node --experimental-strip-types --test scripts/r4-subject-review.test.mjs scripts/r4-subject-stats.test.mjs` 40/40 通过；`npm.cmd run test:r4-pc` 594/594 通过；`type-check`、`check:subject-icons`、`check:subject-workspace` 与 `build` 均退出 0。

### 2026-10-08 学科复习与统计基础框架

- `SubjectWorkspace` 学科侧栏新增复习、统计；同一路由 `/subject/:id` 以 `view=review` / `view=stats` 切换中栏，统计状态入口可转到复习对应列表。原材料、总览、知识库及 AI 保留。
- 新组件 `SubjectReviewPane.vue` / `SubjectStatsPane.vue` 仅使用基础控件和列表/表格，界面细节由用户后续调整；本轮由 Codex 执行 Agent 直接实现，未调用 Antigravity。build 自动生成 `components.d.ts` 中两项组件注册，未加依赖。
- `useReviewApi` 增加 typed 学科 states 分页与作用域参数，`useReviewStore` 完整分页成功后分类，按账号/设备/会话及学科缓存轮次。5 / 10 分组、标题回忆、Markdown/math 展开与四档评分复用现行事件；首次非 SKIP 正式评分调度，后续弱反馈队尾巩固只改内存。
- Review 保留原事件全载荷处理不确定结果重试，冲突先重读再明确确认。切页、换学科或卸载不清除有效轮次/pending；明确结束、删除/移出或会话变化失效，刷新/重启不恢复，不写持久 Review outbox。
- `useSubjectStore.deleteSubject` 成功提交本地墓碑后，用发起时 Review 作用域票据调用 `clearDeletedSubject`；复习页已卸载也会清除该学科缓存并失效迟到评分/状态/历史写回。删除失败保留进度，失效旧会话不清新会话轮次。该最小钩子由最终审查的具体需求缺口授权，不重构原删除流程。
- 本地知识读取捕获 owner/device 后直接读现行 LocalRepository，不经会无条件更新共享投影的旧读取调用写回其他账号。新调用复用现行 request scope ticket，Auth、Sync、Knowledge 核心保持既有实现。
- `useStatsApi` / `useStatsStore` 增加学科统计模型、完整响应校验与作用域/请求序号围栏；StatsPane 展示资料、KB、任务和近 7 / 30 个本地自然日的正式复习指标，加载错误与真实零值区分。学科不显示专注字段，个人专注统计不变。
- 正式评分及冲突重新确认成功都会失效同学科统计；停留统计页期间，同会话 Sync 从进行中转为完成时重新读取。单卡历史展示耗时，换卡关闭旧历史；组结果用基础列表显示首次评分分布、下次日期及仍需巩固项。
- Timeline 仅退役旧 `checkSpacedRepetition` 调用和函数，历史普通任务与 `[KB_ID:...]` 跳转保留。完整功能、门槛与最终只读审查/真实环境边界见 [实施记录](../plans/2026-10-08-subject-review-stats-implementation.md)。

### 2026-10-07 同步与文件导入会话隔离

- `useSyncStore` 将周期固定到发起时的 userId、serverDeviceId、sessionId 和同步代际；身份变化同步失效旧票据。新会话可以独立 flush，旧周期的返回、错误和 finally 不能覆盖当前游标、同步状态或投影事件。
- `useSyncApi` 把内部票据传到 Axios；`request` 在附加凭据、响应处理、401 刷新和重试前核验票据。普通 Axios/SSE 与核心同步按同一会话合并刷新，不同会话分开；刷新提交和失败处理也核验会话，避免迟到 A 结果更新或清除 B 的凭据。代际覆盖 A→B→A；正常同会话 token rotation 可继续使用。
- `syncCycle` 在 push/pull/snapshot 和持久化边界检查票据；失效时普通未确认命令保持 `inflight`，排期仍按原释放流程保留载荷及幂等 ID。Repository 始终绑定发起时的 owner/device。
- `useAssetStore.upload` 固定发起账号的 AssetRepository 与 LocalRepository。切换期间完成的文件和 PENDING 同步任务仍归 A，可在 A 后续同步；不能进入 B 的 ASSET 投影、assets、pendingUploads、错误或进度回调。
- 上传队列通过既有 `options.api` 注入捕获会话的 `createUploadIntent` / `completeUpload` wrapper，后台首次创建队列同样固定票据；请求派发前或返回 401 后切换账号，旧请求不能使用新凭据或触发新会话刷新。
- 当前会话刷新失败（包括缺失 refresh token）会进入重新认证并导航登录；导航资格在清理前捕获、执行前再核验失败会话，只执行一次。清理 A 后、错误返回前登录 B，不会清除 B 或将 B 导航登录。
- Profile 徽标改为“本周专注天数”，数值仍是 weekly 中 focusSeconds>0 的日数，含隔日专注；布局与统计取数路径沿用现行实现。
- 本轮最终自动验证：专项 107/107、`test:r4-pc` 554/554，类型、两项学科静态检查与构建退出 0。Profile 单行由 Antigravity Gemini 3.1 Pro High 生成；账号边界及实际回归由 Luna 执行。真实 Tauri/HTTP、GUI 和双设备需另行验收，审查与最终证据见 [实施记录](../plans/2026-10-07-priority-function-fixes.md)。

### 2026-10-06 知识块 Markdown 渲染与 LaTeX 公式适配（代码、自动验证通过，真实 GUI 待验收）

- **统一 Markdown + LaTeX 渲染器（`src/utils/markdown.ts`）**：
  - 基于 `marked`、`katex`（v0.16.47）和 `dompurify` 统一全站 Markdown 与数学公式渲染逻辑；
  - 支持块级数学公式 `$$...$$` 与 `\[...\]`（渲染为带横向平滑滚动的 `.katex-display-wrapper`），支持行内数学公式 `$...$` 与 `\(...\)`（渲染为 `.katex`）；
  - 智能防误伤货币符号（如 `$100`, `$50.00`）及代码块变量（如 `$var`）；公式语法错误优雅容错降级（`throwOnError: false`），不白屏；
  - DOMPurify 开启 MathML（`math`, `semantics`, `mrow`, `mfrac`, `msqrt` 等）及 SVG 路径与 `style` 属性放行，确保公式渲染结构完整；
  - 提供 `extractMarkdownPreview` 工具函数，用于知识块列表卡片在纯文本截取时平滑剥离公式与 Markdown 标记。
- **全局 Markdown 样式排版修复与升级（`src/components/modal/modal.css`）**：
  - 根治全局 CSS 中误用 `:deep(...)` 导致标题、段落、代码块样式完全失效的缺陷，转用标准 CSS 选择器；
  - 补全 h1~h6 层次排版、列表（ul, ol, li，抹茶绿标记点）、引用块（blockquote，3px 抹茶绿边框与浅底）、代码块（pre code，深炭黑背景与等宽字体）、表格（table，细线折叠与浅灰表头）、分割线与链接等系统化排版；
  - 全面适配浅色宣纸风与深色模式（`html.dark`）。
- **组件落地与实时编辑渲染**：
  - `KnowledgeBlockViewDialog.vue`、`WorkspaceKnowledgeBlockDialog.vue`、`Dashboard/index.vue`、`SubjectWorkspace/index.vue`、`Asset/index.vue` 均收敛接入统一 `renderMarkdown`；
  - 在 `WorkspaceKnowledgeBlockDialog.vue`、`KnowledgeBlockEditor.vue` 和 `Asset/index.vue` 中为正文输入区域增加「编写 / 实时效果（预览）」胶囊切换控件，解决录入 LaTeX 时的盲写体验问题。
- **全局顶栏（`AppHeader.vue`）番茄钟同步时间胶囊**：
  - 顶栏深色模式切换按钮左侧接入番茄钟时间展示胶囊（`.header-pomodoro-pill`，88px × 36px，高度与右侧模式切换按钮齐平），在番茄钟开启运行或暂停未重置状态下平滑显示；
  - 采用与主界面 `PomodoroRing.vue` 一致的跑道形宽边框进度条缩减动画（`3.8px` 粗体边框从顶部中心顺时针随时间 `1s linear` 逐渐缩减，底轨半透明）、主界面同款温润宣纸米白底（`#FAF7F2`，深色 `#212621`）、去除非时间文字仅保留居中等宽粗体跳秒数字（14px, 字重 800，`tabular-nums` 杜绝跳动抖动），底部增加双层立体柔和悬浮阴影（`box-shadow`）；点击可直接快捷跳转至 `/pomodoro` 专注时钟页面；
  - 专项契约测试 `scripts/r4-header-pomodoro-pill.test.mjs` 通过。
- **知识块弹窗顶栏规范统一（`WorkspaceKnowledgeBlockDialog.vue`）**：
  - 浏览模式下顶栏对齐全局知识块详情弹窗（`KnowledgeBlockViewDialog.vue`），统一呈现「知识块详情」大标题与当前学科胶囊药丸，彻底消除旧版在顶栏渲染具体块标题导致与卡片大标题上下重复两次的问题。
- **新建任务截止时间选择（复用资产页日期选择框规范）**：
  - `TaskCreateDialog.vue`：在专注时长后增加可选「截止时间」表单项，复用资产页（`Asset/index.vue`）的 `.zen-date-picker` 与 `:global(.zen-date-popper)` 规范；
  - 采用温润宣纸米白底色（`var(--color-bg-tertiary, #FAF7F2)`）、墨黑字（`#1C1C1A`）、抹茶绿边框与图标（`#8B9A6E`），彻底根除输入框或弹窗发黑问题，支持快捷一键清除；
  - 提交时自动将日期格式化为 ISO 截止时间（`${due}T23:59:59.999Z`）；
  - `Dashboard/index.vue`（首页）、`Timeline/index.vue`（排期页）与 `SubjectWorkspace/index.vue`（学科工作区）统一接收 `dueAt` 并转发至 `taskStore.addTask`，待办清单与排期面板实时展示截止标签；
  - 新增专项测试 `scripts/r4-task-create-dialog-deadline.test.mjs`。
- **依赖与门禁验证**：
  - `package.json` 正式声明 `"katex": "^0.16.47"`，`main.ts` 引入 `katex/dist/katex.min.css`，构建自动打包 KaTeX 字体资产；
  - 新增专项测试 `scripts/r4-knowledge-markdown-formula.test.mjs` 与 `scripts/r4-task-create-dialog-deadline.test.mjs`；
  - `npm.cmd run test:r4-pc`（517/517 项全部通过）、`npm.cmd run type-check`（0 错误）、`npm.cmd run check:subject-workspace` 与 `npm.cmd run check:subject-icons` 通过。真实 GUI 待人工走查。

### 2026-10-01 提问引用文本传递

- Workspace 引用卡片、发送动作与布局沿用用户实现。`useChatStore` 将已有 selectionText（最多 4000 字符）独立写入 `/api/ai/messages/stream` 顶层；引用为空时不发送旧文本。
- Antigravity 仅生成 Store 单行传递与既有 AI stream 脚本的真实请求回归。主树专项先 RED（4/5），应用补丁后 GREEN（5/5）；最终类型/构建与 SDK 验证以 [实施记录](../plans/2026-10-01-chat-selected-text.md) 为准。

### 2026-10-01 学科编辑保存修复

- `SubjectCreateModal` 只发出保存事件；`SubjectHall` 等待本地资源与 mutation 提交成功后关闭弹窗。保存失败显示通知并保留输入，可直接重试；目标学科已不在当前 Store 列表时显示错误且不提交 UPDATE。
- 编辑表单优先读取 `iconKey`；保存时由当前完整 Subject 合并名称、描述和图标键，保留 `sortKey`、`createdAt` 与表单原版本。沿用既有 Store、同步和数据契约。
- `isSavingSubject` 在首个 await 前阻止重复提交和切换表单，传给 Modal 的 `saving` 禁用保存/取消并接入 `ModalShell.preventClose`。失败在 finally 释放守卫；成功释放后关闭，避免旧保存关闭另一个学科弹窗。
- `scripts/r4-subject-edit.test.mjs` 使用实际 SFC 回调及真实 Pinia/LocalRepository，覆盖等待提交、字段完整性、失败重试、目标缺失与创建成功跳转；自动验证与真实 GUI 状态见 [当前状态](../current/Status.md)。

### 2026-10-01 当前功能调整（代码和自动验证通过，真实 GUI 待验收）

- 删除 SearchPalette AI 快捷项及无入口 Home/Settings；正式八条路由保留，搜索跳转行为保留，详情事件由 Dashboard 接收。
- KnowledgeBlock 只读写正文 content、标题、归属和颜色；摘要/标签输入与领域字段移除，短文本从正文计算。Task.description 与 Overview.summary 保留。
- 专注统计采用实际秒数，暂停/休息不计，中断保存，自然结束才增加完成轮次。活动状态和事件在本机按账号/设备持久化；专注事件上传绑定 user/device/session 作用域，切换作用域后旧请求在 401 刷新或重试前失效，未确认事件保留在原 outbox；Profile 读取服务器历史专注聚合。
- 完整成功 Overview 经独立持久化接口跨 PC 设备读取；失败/半成品保留本机。版本冲突保留候选结果并展示处理入口，不静默覆盖远端。服务端 API 可供其他端接入，Mobile/Tablet 本轮没有新增成果展示入口。
- `overviewRepository` 保存缓存/写入意图，`overviewResultsSyncService` 对账及重放，`overviewSyncWakeup` 在成功提交新意图后唤醒当前账号后台同步。远端成功但本机 ACK 失败继续原 ID/body 重试；普通新候选保留已有 CONFLICT，用户显式选择后才上传。FILE/SUBJECT 删除用 owner/device 生命周期 ticket 与写边界 token 阻止迟到结果；现有拒绝删除恢复流程在确认活动投影且无未决 DELETE 后解封仓库和生成服务，旧 aborted generation 不能保存。
- 文件处理状态入口仍在学科页，登录注册留待后续。自动化与真实环境验收状态以 [当前状态](../current/Status.md) 为准。
- `localDb.init` 在 `Database.load` 后调用内部 Tauri 命令 `initialize_local_database_pool`，完成固定单连接、关闭旧池后才暴露数据库及执行 SQL；既有 JS 队列和 native snapshot 保留。实际 Rust 池事务测试 1/1、cargo fmt/check 退出 0，真实 Tauri 重启验收另行记录。
- 最终 PC type-check、check:subject-icons、check:subject-workspace 与 build 均退出 0，test:r4-pc 470/470；失败恢复 focused 67/67。Source 清理在 resetRequired/snapshot 修复窗口保留本地草稿，清理边界重读当前墓碑；单个 reviewer 本任务 BLOCKER/IMPORTANT 均 0。

#### 当前未接通业务效果的偏好（用户要求汇总，保留设置）

| 类别 | 项目 | 实现情况 |
| --- | --- | --- |
| 显示 | 紧凑布局、基础字号、界面语言 | 有值保存或局部 class/style 设置，未形成全局布局、字号和语言切换效果 |
| 提醒 | 任务提醒、专注结束提醒 | 保存选择；没有接通任务通知、声音或桌面通知 |
| 自动化 | 自动生成概览、AI 自动标签、AI 自动总结 | 保存选择；现有业务没有消费这些开关 |
| 同步 | 自动同步、仅 Wi-Fi 同步 | 保存选择；后台同步没有依这些设置启停或限制网络 |
| AI/诊断 | 诊断日志 | 保存选择；诊断日志输出没有消费此设置 |

共 11 项。RAG 语义搜索关闭项已从个人中心移除。深色模式与“立即同步”已有实际执行路径，不计入此表。

已保存的旧本地 `sc_setting_rag` 偏好不再参与聊天行为；客户端忽略该值，不清理本地数据或执行数据库迁移。

### 2026-10-10 PC 功能边界盘点补充（静态代码核对）

- **搜索**：SearchPalette 搜索本地知识块标题、学科和正文内容，最多展示 6 项；点击结果通过 `openBlock` 路由参数交给 Dashboard 打开详情。AI 快捷项当前没有入口。
- **资产中心**：全局与学科文件树暂时都把 Source 状态固定显示为“正常”，未反映实际解析状态；该项按 IMPORTANT 登记在 [问题和审查](../current/IssuesAndReview.md)。
- **登录与账户**：忘记密码、隐私与条款入口目前是占位提示。Profile 提交异步注销请求后退出登录，页面没有注销作业进度查询。文档处理主密钥只用于本机加密 cache/package，产品已决定不增加通用密钥备份/恢复入口；密钥确认丢失后的自动新建、废弃旧续传状态并从原文件重处理尚未实现，当前仍报告 `DOCUMENT_ENCRYPTION_KEY_RECOVERY_REQUIRED`，详见[密钥恢复设计](../design/2026-09-04-pc-document-encryption-recovery-design.md)。
- **时间轴与通知**：时间轴能展示任务完成状态及从任务描述解析出的知识块关联，但没有手动完成操作或独立知识块选择器。应用只有临时操作通知，没有持久收件箱。
- **数据边界**：Profile JSON 导出包含基本用户信息、本地知识块和任务，不含原始文件，也不是完整本地数据库备份；Local Asset 无备份/导出/恢复能力。一般偏好仍按上方 12 项清单保存在端侧，尚无通用服务端偏好同步。
- **范围与验收**：上述登录恢复、注销进度、时间轴补充操作和通知收件箱仍为 OPTIONAL/待产品范围确认；文档处理密钥丢失后的自动重新处理策略已确认，待代码实现与验收。状态、证据与关闭条件见 [当前问题](../current/IssuesAndReview.md)。本节静态盘点不代表 GUI 或真实服务已验收。

### 2026-10-01 首页与学科工作区知识块内容展示全面重构与正文/摘要解耦（Knowledge Blocks Redesign & Content Decoupling）

- **首页与学科知识块展示缺陷根治（Home & Subject Workspace Presentation Polish）**：
  - **弹窗体系与大画布升级**：彻底弃用首页 `Home/index.vue` 原先写死的 520px 窄弹窗，重构接入系统级 `ModalShell size="lg"`（760px 大画布），与学科工作区弹窗 `WorkspaceKnowledgeBlockDialog.vue` 及全局弹窗 `KnowledgeBlockViewDialog.vue` 视觉统一；
  - **杂志级排版（Article Layout）**：阅读模式构建 `.kb-article-container`，上设 `.kb-meta-card`（大标题、来源文件、友好的相对时间、学科微胶囊），下设内凹宣纸米白 `#FAF7F2` 底板的正文卡片 `.kb-content-card`，Markdown 渲染支持段落、代码块、引用及平滑滚动条，并配精致空状态；
  - **交互与快捷操作增强**：弹窗底部左侧集成带成功对勾反馈的“复制内容”按钮，并新增“前往知识块界面”直达按钮（携带 `?view=blocks` 路由参数直接穿透跳转至对应学科的知识块工作区界面）；
  - **卡片展示体验优化**：首页卡片与学科工作区（`SubjectWorkspace/index.vue`）知识块卡片正文预览统一使用 `block.preview || block.content || '暂无详细内容'`，配合 3 行平滑截断，杜绝空文本现象；
- **全链路正文与摘要解耦（Content Decoupling）**：
  - `useKnowledgeStore.ts`、`Home/index.vue`、`WorkspaceKnowledgeBlockDialog.vue`、`Asset/index.vue` 与 `KnowledgeBlockEditor.vue` 全链路将核心输入文本域与真正的正文内容 `content` 深度绑定，彻底解决此前误绑 `preview/summary` 导致的正文修改不生效、长文截断至 180 字符的缺陷；保存时自动派生 `preview`；
- **学科关联与转移修复（Subject Reassignment）**：
  - 首页知识块弹窗与资产页知识块工作台全面升级所属学科为 `<el-select>` 选项器，支持转移归属学科并正确同步目标 `subjectId` 与学科名称；
- **移除摘要说明与标签展示（Form & Meta Streamlining）**：
  - 遵循用户指令，全面移除表单中的“摘要说明 (Summary)”与“知识标签 (Tags)”输入框，正文编辑区（“知识内容”）自适应拓宽为主编辑视口；同时彻底移除查看态中的标签列表展示，界面更极简纯粹；
- **门禁验证**：`npm.cmd run type-check`（0 error）、`npm.cmd run test:r4-pc`（433/433 全绿）与 `npm.cmd run build` 生产构建全部通过。

### 2026-10-01 PC 页面切换与弹窗动效全面补齐（Page Transitions & Modal Motion Polish）

- **顶层页面切换动效（Page Transitions）**：
  - `src/App.vue` 顶层 `<router-view>` 与登录态/公共外壳转场均包裹 `<Transition mode="out-in">`；
  - 采用阻尼弹簧曲线 `cubic-bezier(0.16, 1, 0.3, 1)` 与微位移 `transform: translateY(6px)` 组合，绑定 `will-change: opacity, transform`，消除切页闪烁；
  - 二级工作区视图平滑过渡：`src/views/SubjectWorkspace/index.vue`（中心区概要/文件预览/知识块/空状态）与 `src/views/Asset/index.vue`（资产阅览中栏与右栏星图切换）统一接入 `workspace-view-fade` / `asset-view-fade` 缓动，杜绝视图生硬硬切。
- **全局弹窗动效闭环（Modal & Overlay Motion）**：
  - `src/components/modal/modal.css`：统一 `.modal-fade` 进退场遮罩与卡片时长为完全同步的 `0.24s`，消除遮罩提前销毁子卡片动画的截断缺陷，引入弹簧微缩放 `scale(0.96) translateY(12px) -> scale(1) translateY(0)`；
  - `src/components/SearchPalette.vue`：解耦背景遮罩与容器卡片的 transform，避免遮罩撕裂并优化顶部微落效果；
  - `src/components/documentProcessing/DocumentNotReadyDialog.vue`：包裹 `<Transition name="not-ready-fade">` 补齐进出场平滑缩放；
  - `src/views/Home/index.vue`（Dashboard）：4 个内联弹窗（AI 提炼加载、文件登记、任务创建、知识块详情）统一收敛为标准 `modal-overlay` 结构并接入 `<Transition name="modal-fade">`；
  - `src/components/modal/ModalShell.vue`：包裹 `<Transition name="modal-fade" appear>` 增强初始入场挂载弹簧动效；
  - `src/components/subject/SubjectCreateModal.vue`：全面重构为标准 `v-model` 双向绑定模式，彻底消除原先外层 `v-if` 硬拔除导致的无退场过渡与内容跳动；
  - `src/views/SubjectHall/index.vue` 与 `src/views/Home/index.vue`：改用 `v-model="showSubjectModal"`，关闭时平滑延迟清空编辑态，实现创建学科与编辑学科弹窗在进场和退场时的完整柔和缓动。
- **验证与门禁**：`npm.cmd run type-check`（0 error）、`npm.cmd run test:r4-pc`（433/433 全绿）与 `npm.cmd run build` 生产构建通过。

### 2026-10-01 全局弹窗配色对调与立体层次增强（Modal Color Scheme Inversion & Elevation）

- **弹窗整体背景与框内底色全局对调（Background & Inset Color Inversion）**：
  - `src/components/modal/modal.css`：弹窗大卡片容器 `--modal-bg` 对调为主内容底色 `var(--color-bg-primary, #F7F2EB)`（深色模式：`var(--color-bg-primary, #1f1e1c)`）；
  - 新增统一框内令牌 `--modal-inset-bg`，将所有表单控件（`.modal-form-input, .modal-form-textarea, .modal-form-select`）、嵌套卡片（`.modal-card-inset`）、代码块（`pre`）对调为浅宣纸米白 `var(--color-bg-tertiary, #FAF7F2)`（深色模式：`var(--color-bg-tertiary, #2e2c29)`）；
  - 业务弹窗组件全面对齐：
    - `KnowledgeBlockViewDialog.vue`：元信息卡片 `.kb-meta-card` 与正文阅读卡片 `.kb-content-card` 统一使用 `--modal-inset-bg`；
    - `TaskCreateDialog.vue`：专注时长分段滑轨 `.duration-segmented-track` 与学科胶囊 `.subject-chip` 对调为 `--modal-inset-bg`；
    - `SummaryInstructionDialog.vue`：预设提示词胶囊 `.preset-chip` 对调为 `--modal-inset-bg`；
    - `SubjectCreateModal.vue`：实时预览行 `.preview-row` 与图标按键网格 `.icon-btn` 对调为 `--modal-inset-bg`；
    - `FileRegisterDialog.vue`：拖拽上传区域 `.drop-zone`、上传进度卡片 `.upload-progress` 与学科胶囊 `.subject-chip` 对调为 `--modal-inset-bg`；
    - `WorkspaceKnowledgeBlockDialog.vue`：颜色圆点选择环自动对齐新的 `--modal-bg`。
- **按钮与输入框底部立体阴影（Bottom Drop Shadows）**：
  - 表单控件（输入框、多行文本域、下拉选择框）底部追加轻柔立体微阴影 `0 1.5px 4px rgba(0, 0, 0, 0.05), 0 0.5px 1.5px rgba(0, 0, 0, 0.03)`（深色模式：`0 2px 6px rgba(0, 0, 0, 0.35)`），聚焦态保持柔和 Sage 光晕并叠加底阴影；
  - 次级按钮（`.modal-btn-secondary`）追加 `0 1.5px 4px rgba(0, 0, 0, 0.06)` 底阴影（悬浮强化至 `0 3px 8px`）；
  - 主操作按钮（`.modal-btn-primary`）与危险按钮（`.modal-btn-danger`）加深立体漫反射底阴影，点击与上浮反馈更具按压触感；
  - 弹窗内各学科/提示词芯片（`.subject-chip`、`.preset-chip`、`.icon-btn`）统一增加 `0 1.5px 4px rgba(0, 0, 0, 0.05)` 底阴影与悬浮微升，增强层次与微交互感。
- **验证与门禁**：`npm.cmd run type-check`（0 error）、`npm.cmd run test:r4-pc`（433/433 全绿）与 `npm.cmd run build` 生产打包全部通过。

### 2026-10-01 知识块卡片弹窗杂志级阅读体验重构（KnowledgeBlockViewDialog Redesign）

- **结构与规范对齐（ModalShell Alignment）**：
  - 彻底规范 Header 插槽：使用 `#header-icon` 展示 28px 圆角鼠尾草渐变图标（`IconNotes`），`#title` 展示紧凑单行主标题与学科胶囊微标签（`kb-dialog-subject-pill`），消除原先将大号标题与长串时间挤在插槽导致 Header 膨胀至 120px+ 与关闭按钮悬浮脱节的缺陷；
  - 正文排版与元信息重塑：在 Body 内构建独立的卡片阅读容器 `.kb-article-container`，上部展示大标题（18px/700/-0.015em）、来源资料（带有文件图标）、人性化相对时间（如“10分钟前”，悬停展示精确到秒的时间戳），根据用户要求彻底去除了标签展示以保持极简温润视觉；下部嵌入内凹宣纸白底正文卡片 `.kb-content-card`，Markdown 渲染支持代码、段落、引用及细滚动条，并配精致空状态；
- **交互与快捷操作增强**：
  - 底部左侧支持一键“复制内容”（成功带绿色对勾状态反馈）；
  - 新增“前往知识块界面”直达按钮（若有 `block.subjectId`，点击携带 `?view=blocks` 路由参数直接穿透跳转至对应学科的知识块工作区界面，`SubjectWorkspace` 挂载及监听路由 query 自动切换 `centerView = 'blocks'` 与 `tier2Open = false`）；
  - 底部右侧配置统一的“完成阅读”胶囊药丸操作按钮；
- **门禁与测试**：`npm.cmd run type-check`（0 error）、`npm.cmd run test:r4-pc`（433/433 全绿）与 `npm.cmd run build` 全部通过。

### 2026-10-01 文件解析失败重试与就地处理机制（Document Processing Ingestion Retry）

- **数据流与 Store 扩展**：
  - `src/store/useSourceStore.ts` 新增并导出 `retrySourceProcessing(sourceId: string)`；
  - 读取当前本地或内存 Source 的 `baseVersion`，调用后端现成的 `POST /api/sources/{id}/reingest` 接口重新发起服务端向量化（如 Embedding provider 恢复后重建索引）或重置为客户端处理；
  - 接口返回更新后的 `SourceView` 后，使用 `repo.upsertFromSync` 同步写入本地持久层，更新响应式 `sources` 与 `activeSourceFiles` 投影，并在需要客户端重跑时自动调度 `documentScheduler.schedule`；
- **UI 交互与重试入口**：
  - `src/components/documentProcessing/DocumentProcessingCenter.vue`：在 `serverProcessingSources` 列表中，当 `source.ingestionStatus === 'FAILED'` 时展示“重试”按钮，引入 `retryingSourceIds` 响应式集合管理重试状态与“正在重试...”禁用反馈；
  - `src/views/SubjectWorkspace/index.vue`：当选中的文件处于 `FAILED` 状态时，在主预览区顶部呈现 `.file-processing-alert-banner` 警示条，直接展示失败原因（如 `Embedding provider is unavailable`）与一键“重试解析”操作，无需用户切出工作区；
- **门禁与测试**：更新 `scripts/r4-document-processing-ui.test.mjs`，`npm.cmd run type-check`（0 error）、`npm.cmd run test:r4-pc`（433/433 全绿）与 `npm.cmd run build` 生产打包全部通过。

### 2026-09-30 弹窗温暖禅意大圆角重构

- `src/components/modal/modal.css` 全面对齐页面级设计令牌：卡片采用 `--radius-xl (20px)` 大圆角与 `--color-bg-tertiary (#FAF7F2)` 宣纸米白底色（深色模式 `--color-bg-elevated (#33312e)`），阴影使用柔和漫反射 `0 12px 48px -8px rgba(0,0,0,0.10)`，遮罩 `rgba(28,28,26,0.38)` + `blur(8px)` + `saturate(160%)`，入场弹簧动画 `scale(0.96) + translateY(10px)` 持续 `0.25s`。
- 按钮改为 `9999px` 胶囊药丸圆角，主操作 `#8B9A6E` 纯色 + 微阴影 + hover 上浮，次操作透明底 + 细微边框。表单输入 `--radius-md (10px)` 圆角 + `--color-bg-primary (#F7F2EB)` 燕麦底色 + sage 聚焦环。选择芯片、预设标签全部采用 `9999px` 胶囊形态与 `#F7F2EB` 底色。
- 标题 `16px/700`、Header/Body/Footer 内边距 `24-28-10 / 8-28-18 / 10-28-24`，关闭按钮 `30px` `--radius-md (10px)` 圆角。
- 8 个业务弹窗统一对齐新令牌：
  - `TaskCreateDialog.vue` 重构为严格整半小时（30m、1h、1.5h、2h、2.5h、3h、4h 7档位）一体化磁吸分段滑轨，增加默认时长归一化，支持点选与拖拽吸附；学科网格放宽自适应高度至 240px 并配 5px 细滚动条；
  - `FileRegisterDialog.vue` 限制文件选择范围与系统能力（`SUPPORTED_UPLOAD_EXTENSIONS`：PDF/Office）一致，资产页上传流程改为完成/失败后才关闭弹窗并透传进度，支持上传失败重试；
  - `TaskCreateDialog`、`ChangePasswordDialog`、`SummaryInstructionDialog` 显式补齐无障碍名称绑定（`title` 与 `aria-label`），`ModalShell` 增强对自定义标题插槽的无障碍名称兜底；
  - `KnowledgeBlockEditor.vue` 接入统一 `ModalShell`，补齐打开聚焦、Tab 循环、Escape 关闭与焦点恢复；
  - PC `type-check` 退出 0、`test:r4-pc` 433/433、`check:subject-icons` 与 `check:subject-workspace` 退出 0、生产构建退出 0。浅色/深色/窄屏 GUI 视觉仍需验收。

### 2026-09-27 PC 全局弹窗与模态层组件化规范与 UI 视觉/布局重构（历史阶段）

- **统一模态基础设施建设（Modal Architecture & Design Tokens）**：
  - 新增设计系统模态样式规范 `src/components/modal/modal.css`：建立现代极简禅意（Zen Sage `#5B6C47`、宣纸米白 `#FAF8F5`、深色微光 `#1A1F1B`）全局 Token，提供 `sm`(420px)、`md`(520px)、`lg`(680px)、`xl`(840px)、`auto` 五档尺寸规范与统一的 8px 圆角 `.modal-btn`、`.modal-form-group`、`.modal-form-label`、`.modal-form-input`、`.modal-form-textarea`、`.modal-pill`、`.modal-card-inset` 与 `.modal-markdown-body` 控件规范；
  - 彻底消除生硬线条分割与视觉断层：Header 与 Footer 移除 `border-bottom` / `border-top` 硬线条切块，整体卡片形成一体化无缝呼吸画布；弹窗卡片采用 16px 精确工程圆角（对齐 Linear / macOS）、低反差双层环境漫反射阴影（`0 24px 64px -12px rgba(...)`）；关闭按钮采用 28px × 28px 极简微圆角（6px）幽灵按钮与 5px 定制轻薄圆角滚动条；
  - 新增全局模态状态管理器 `src/components/modal/modalManager.ts`：实现基于引用计数的全局多层滚动穿透锁（`lockBodyScroll` / `unlockBodyScroll`）、后进先出栈（LIFO `modalStack`）的顶层 Escape 捕获（`stopImmediatePropagation`）与焦点闭环陷阱（`trapTabKey` / `focusInitialElement`）；
  - 基础模态壳 `src/components/modal/ModalShell.vue` 布局重构：统一卡片容器结构，顶部无缝吸顶标题栏（`#header` / `#title` 与关闭幽灵圆钮）、中间自适应纵向独立平滑滚动内容区（`.modal-shell-body`）、底部无缝吸底停靠操作栏（`#footer`）；集成入场自动聚焦（优先 autofocus/input/primary btn）、焦点返回触发元素、上传防关守卫（`preventClose` / `beforeClose`）与非空可访问性绑定（`aria-label` / `aria-labelledby`）；
- **业务弹窗系统化提取、UI 视觉与排版重塑（Elevated Business Dialog UIs & Typography）**：
  - **通用确认弹窗**：`src/components/ConfirmDialog.vue` 接入统一外壳 `ModalShell`，移除笨重矩形徽章与内部多重边框，标题栏内嵌精致图标与字号微调（15px/600/-0.01em），正文舒展呈现，搭配次要幽灵按钮与危险/主要 8px 圆角确认按键；
  - **修改密码**：提取 `src/components/profile/ChangePasswordDialog.vue`，增加 `IconShieldLock` 顶栏图标、去边框柔和安全建议横幅与带图标的错误提示条；
  - **提炼指令定制**：提取 `src/components/subject/SummaryInstructionDialog.vue`，增加 `IconSparkles` AI 顶栏、6px 轻量无边框提示词胶囊按钮组（一键点击追加/填入）与字数统计；
  - **排期任务创建**：提取 `src/components/task/TaskCreateDialog.vue`，供 `Dashboard`、`Timeline`、`SubjectWorkspace` 统一复用；增加日历图标顶栏、6px 圆角学科微标签（激活态微浮）、现代紧凑时长滑条与圆角手柄；
  - **文件资产登记**：提取 `src/components/asset/FileRegisterDialog.vue`，供 `Asset` 资产库与 `SubjectWorkspace` 学科工作区复用；重构拖拽区域为轻柔虚线框与 8px 方圆图标，上传中启用动态呼吸绿点（`pulse-indicator`）与轻薄进度条，上传失败保留表单；
  - **知识块卡片查看**：提取 `src/components/knowledge/KnowledgeBlockViewDialog.vue`，消除内层多重嵌套滚动条与卡片框中框，内容直接在卡片无缝流转，底部配置优雅复制与确定按钮；
  - **工作区知识块流转**：提取 `src/components/knowledge/WorkspaceKnowledgeBlockDialog.vue`，消除浏览态嵌套滚动条与硬横线，调色盘升级为现代微圆点；
  - **学科空间创建/编辑弹窗升级**：`src/components/subject/SubjectCreateModal.vue` 接入统一外壳 `ModalShell`，顶层预览收敛为现代紧凑微卡片，8 列图标选择网格升级为 8px 圆角轻触按键；
- **测试与契约兼容（Compatibility & Guardrails）**：
  - 严格保持各宿主页面对外 props、emits 与既有测试断言正则完全兼容；
  - 全量自动化测试回归（433/433 测试通过），`npm run type-check` 0 错误，`check:subject-icons` 与 `check:subject-workspace` 全绿，`npm run build` 生产构建成功。

### 2026-09-27 时间轴交换与 Suggestions 入口

- 时间轴双任务交换成功后，本地 SQLite 在同一事务中写入两条服务端返回的 TASK；浏览器存储一次提交完整状态。遇到未解决的本地 mutation 时整批拒写并刷新本地投影；本地事务失败后对两项服务端结果一次更新内存投影，触发增量同步恢复，避免半交换持久化。真实 Tauri GUI 与双设备联调待验收。
- Suggestions 当前未达到真实生成和引用质量要求；PC 界面无入口，`aiClient` 暂不导出调用封装。服务端基线接口仍在 API 契约中。

### 2026-09-26 首次同步与 AI 参考范围等修复

- 新设备没有本地 cursor 时使用完整 snapshot bootstrap，保留未解决 mutation 并刷新五类资源 Store；Tauri SQLite 替换同时保护 `inflight` 投影。已有 cursor 继续增量 pull，reset 继续使用 snapshot。
- 学科工作区当前文件使用 `AUTO`；显式 Source 范围最多 100 份；无当前文件且无显式文件范围时使用当前学科 `SUBJECT`。聊天资料检索默认开启。
- Overview 单次 HTTP 请求超时为 300 秒。FilePreview 显示名变化不重读内容；通用 API 的服务/网络错误进入侧栏连接状态，按请求序号处理并发响应，取消请求不改状态。
- 个人空间 JSON 导出说明限定知识块和任务；密码说明为单向哈希保存；AI 请求说明为经 Server 转发。代码、定向测试及类型检查通过，真实 GUI/双设备/Provider 验收仍待完成。

### 2026-09-25 AI 聊天 Provider 配置

- 个人空间只提交 Provider、公网 HTTPS Base URL、聊天模型和可选 API Key；不再保存或提交用户 Embedding 模型。通用兼容服务须明确填写 Base URL 和聊天模型，DeepSeek 与 SiliconFlow 留空 Base URL 时使用各自默认地址。
- 首次读取设置时允许录入地址、模型和密钥，保留用户已编辑的草稿。服务商选择、保存及探测在读取结束后可用。
- 切换 Provider 时清空 API Key 输入，加载目标已保存的 Base URL 与聊天模型。目标尚未配置时，快捷预设填入对应默认值。
- 仅点击“保存 AI 配置”提交设置。自动检测读取已保存的 Provider、Base URL 与密钥，允许继续编辑聊天模型。测试连接使用已保存的聊天模型，并依据服务端返回的 `chatModel` 展示结果。用于探测的配置有未保存修改时提示先保存。
- Provider、Base URL、密钥输入或当前已保存配置变化时清空模型候选。先前请求的响应不会恢复候选或填入聊天模型。
- 最新验证和验收情况见[当前状态](../current/Status.md)。

### 2026-09-25 顶栏头像真实映射与右上角在线状态点移除

- **顶栏真实头像映射与响应式全站同步**：
  - 在 `useAuthStore.ts` 中新增全局响应式 `avatarUrl` 状态、`loadAvatar()` 与 `setAvatarUrl()` 方法；
  - 在用户登录成功（`setSession`）以及顶栏组件挂载（`AppHeader.vue` 的 `onMounted`）时，若已认证则通过 `useAuthApi.getAvatarBlob()` 读取服务端图片 Blob 并转换为安全的 ObjectURL 赋给 `authStore.avatarUrl`；若未设置或 404 则静默降级展示首字母；
  - 退出登录（`clearSession`）时自动调用 `URL.revokeObjectURL` 释放 Blob 内存，防止内存泄漏；
  - 个人中心 `Profile/index.vue` 在头像上传（`uploadAvatar`）、重新拉取（`loadAvatar`）及重置头像（`resetAvatar`）时，同步调用 `authStore.setAvatarUrl`，确保个人中心操作立即全局联动到页面右上角顶栏；同时在组件卸载时避免注销全局共享的 ObjectURL；
- **彻底移除右上角状态圆点**：
  - 在 `AppHeader.vue` 模板中彻底移除 `<span class="avatar-status"></span>` 绿色在线圆点节点，并从 `<style scoped>` 中清除所有 `.avatar-status` 样式规则，保持纯净禅意视觉。

### 2026-09-25 首页已完成任务勾选状态与历史排期校验豁免

- **已完成任务写屏障**：在 `useTaskStore.ts` 的 `persistOffline` 中对已完成任务（`model.status === 'DONE'`）豁免过去的排期校验（`assertScheduledAtIsNotPast`），消除因排期时间处于过去时无论自动恢复还是手动点击勾选均报错“不能排期到过去的时间”的问题；引入 `isSameScheduleTime` 时间戳规整比较；
- **规范完成状态全域收敛**：`taskViewRules.ts` 中的 `isActionableTask` 与 `isSchedulableTask` 统一采用 `!isCompletedTask(task)`，彻底消除服务端或本地规范状态 `'DONE'` 的已完成任务被误当作活动待办或可调度项的漏洞；
- **首页指标与待办呈现**：首页看盘顶部 `completedCount` 与 `totalFocusHours` 采用 `isCompletedTask` 正确统计已完成任务；待办清单 `.todo-item` 移除复选框与点击完成，保持纯净待排期信息展示。


### 2026-09-25 个人空间头像读取媒体类型

- `useAuthApi.getAvatarBlob` 仍按 Blob 读取私有头像，但本请求显式设置 `Accept: image/png, application/problem+json`，覆盖通用 JSON 默认头，匹配后端 PNG 成功响应并允许无头像时返回 Problem Details。

### 2026-09-25 完成任务分组与首页日程恢复检查

- 资产库任务目录的“已完成”判断优先于“未排期”，完成任务即使没有 `dueAt` 和 `scheduledAt` 也进入“已完成”；任务树的完成标记使用相同谓词。Task Store 接收到 TASK 投影刷新时重载本地任务并立即重试到期完成检查，首页日程复选框继续从任务完成状态派生。已结束且已完成的排期任务不能取消完成，首页与资产库控件应显示该限制。规范 `DONE` 与展示 `completed` 的本地/同步路径已做动态测试，GUI 待验收。

### 2026-09-25 Timeline 排期任务结束后自动完成

- `taskViewRules.isScheduledTaskPast` 使用 `scheduledAt + durationMinutes <= now` 判定结束，避免进行中提前完成；Task Store 在本地任务加载后立即恢复，运行中每分钟复查。单项保存失败不阻断其他任务；自动完成与手动编辑/改期共享变更队列，提交前重读本地 TASK 行并由仓储版本及 outbox 状态条件拒绝同步期间的旧快照；增量 pull 落库时再次核对未解决本地写入，保留已完成任务原排期。

- 2026-10-06：同一恢复队列也处理无排期且有效 `dueAt <= now` 的待办/进行中任务。自动完成预读拒绝行墓碑，并独立设置可选 `requireActiveResource`；LocalRepository 在原 SQL 提交事务或 browser 同步读写段原子确认当前行存在且未删除，防止 Subject cascade 的同版本墓碑被旧 payload 清除。拒绝沿用 LocalConflictError 和本地重载。该选项只用于自动完成，其他调用、schema 和同步字段不扩展。

### 2026-09-25 PC 个人空间与设置页 10 类前端真实链路打通与闭环

- **账户资料（3 类）真实服务端流转**：
  - **昵称**：`saveNickname()` 接入 `useAuthApi.updateProfile`（`PUT /api/auth/me`），携带当前 `baseVersion` 与 `displayName`，处理 409 `RESOURCE_VERSION_CONFLICT` 并同步更新 store 与本地视图；
  - **头像**：接入 `useAuthApi.getAvatarBlob`（`GET /api/auth/me/avatar`）在挂载时动态读取真实图片 Blob 并转为安全的 ObjectURL；上传接入 `useAuthApi.uploadAvatar`（`POST /api/auth/me/avatar`），客户端校验 PNG/JPEG 且 ≤5MB；重置接入 `useAuthApi.resetAvatar`（`DELETE /api/auth/me/avatar`）；彻底废弃本地 localStorage 存储头像数据；
  - **改密**：新密码至少 12 个 UTF-16 代码单元、最多 72 个 UTF-8 字节。`useAuthApi.changePassword`（`PUT /api/auth/password`）传递 `baseVersion`、`currentPassword` 与 `newPassword`；原密码不匹配在表单内提示，Bearer 失效仍走刷新。密码更新后提示会话撤销边界并刷新版本。
- **AI 设置（3 类）服务端规范化与真实探测测试**：
  - **Provider 归一化**：在 `aiClient.ts` 中提供 `normalizeProvider`，将自由输入与通用兼容端点映射为服务端支持的 `OPENAI_COMPATIBLE`，识别 DeepSeek 和 SiliconFlow，保持界面友好名称展示；
  - **模型自动检测**：`handleDetectModels()` 接入 `listAiModels`（`GET /api/ai/settings/{provider}/models`），从已加密保存的云端 BYOK 获取真实 `/models` 列表并渲染模型托盘；未配置时给出明确引导，彻底消除硬编码 mock；
  - **连通性测试**：`handleTestConnection()` 接入 `testAiConnection`（`POST /api/ai/settings/{provider}/test-connection`），依据服务端聊天请求返回 `{ reachable, chatModel }` 反馈，展示真实上游异常。
- **数据与状态（4 类）完整闭环**：
  - **知识块与任务 JSON 导出**：`handleExportData()` 同时加载 `knowledgeStore.recentBlocks` 与 `taskStore.allTasks`，导出元数据、知识库块与排期任务；不包含原始文件或导入恢复能力；
  - **两级清理分层解耦**：“清理本地缓存”（`handleClearCache`）仅清理本地渲染缓存与临时会话日志；敏感区“清除本地离线数据”升级为独立高危处理器 `handleResetOfflineData()`，高危二次确认后重置离线存储，标记 `syncStore.resetRequired = true` 并触发全量快照拉取；
  - **注销账户**：`handleDeleteAccount()` 接入 `useAuthApi.deleteAccount`（`DELETE /api/auth/me`），提交密码验证，处理 HTTP 202 Accepted 异步受理，清空本地会话并重定向至登录页；
  - 注销确认密码不匹配的 401（Problem Details `code=UNAUTHENTICATED` 且 `detail=Invalid credentials`）保留当前页面与登录会话并显示接口错误，不触发全局 access token 刷新、重放或登录页跳转；Bearer token 无效时仍沿用全局 401 会话恢复；
  - **响应式同步状态**：`sync_status` 动态绑定 `syncStatusText`，自适应呈现“正在与云端同步...”、“已同步 · 状态正常”、“同步异常”与“需重置同步”，并配置异常警告样式。
- **验证与门禁**：新增定向测试 `scripts/r4-profile-live-links.test.mjs`，PC 全量回归 `npm.cmd run test:r4-pc`（406/406 全量通过），`npm.cmd run type-check` 与 `git diff --check` 全部退出 0。真实外部模型与人工 GUI 体验待验收。

### 2026-09-24 PC 个人中心与系统设置（Profile / Settings）全量 Tabler 图标升级与禅意双栏布局重构

- **右侧设置工作台纯粹排版与去图标化（Clean Typography Without Icons）**：
  - 彻底去除右侧分项设置卡片标题前面的图标小胶囊（`.group-icon-pill`），保持「外观与显示」、「同步与备份」、「AI 引擎体验」、「系统通知」、「AI 模型引擎 (BYOK)」、「登录会话管理」、「敏感与危险操作」纯文字标题排版；
  - 移除会话行设备图标，移除退出登录、清除缓存、注销账户按钮内的操作图标，打造纯粹极简文字禅意界面；
  - 左侧看板保留核心指标与连续专注的高雅语义微图标。
- **禅意极简自适应满屏双栏布局重构（Full Viewport Responsive Layout）**：
  - **自适应占满页面与整站标准对齐**：彻底去除原写死的 `max-width: 1240px` 局限居中框，与 `Timeline`、`Asset`、`Dashboard` 保持统一的 `100%` 满屏网格规范（`padding: 10px; gap: 10px;`，页面底色 `#EEEEEE`）；
  - **左右双栏弹性延展与空间比例调优**：左侧数据透视看板由 `360px` 拓宽至 `480px`，右侧分项设置工作台通过 `flex: 1; min-width: 0;` 弹性自适应铺满屏幕剩余空间；右侧设置子项增加 `max-width: 960px; margin: 0 auto;` 黄金视宽约束，在各类超宽屏幕下避免拉伸变形；
  - **左侧数据透视看板精细化**：去除写死的 `SC` 与跑马灯伪旋转光圈、去除无依据的伪等级，真实提取用户名称首字母（头像扩大至 64px），核心指标模块升级为微光包裹图标（`.stat-icon-wrap`）并配备 Hover 微立体悬浮；柱状图扩高至 112px，条柱圆角化与今日高光突显；彻底移除底部冗余的 AI 提示语卡片（`.insight-card`），呈现利落专业看板；
  - **右侧功能模块系统化重整与分段导航**：
    - 顶栏配备分类快速定位条（`全部`、`界面偏好`、`系统通知`、`数据同步`、`AI 引擎`、`账户安全`），支持快速平滑滚动跳转；
    - 系统性重整功能层级：四大业务中枢（界面偏好、数据同步、AI 智能、账户安全），消除原 AI 体验与 BYOK 引擎割裂、文件解析孤立等混乱排版；
    - 消除因 Flex 纵向弹性收缩导致的行高塌陷 Bug：右侧容器改为块级自适应纵向流动（`display: block` 与子元素 `flex-shrink: 0`），设置组、会话卡片与操作行设置 `min-height: 52px` 坚实保底约束，页面超高时由外层容器自适应独立滚动，彻底杜绝内容被挤压成细缝或被溢出裁剪；
    - 所有设置组与 AI BYOK 模块均升级为 `#FAF7F2` 圆角卡片，行间距均匀自然，悬浮态微光反馈；
    - 控件现代化对齐：Toggle 开关全新平滑药丸滑块（开启态呈现 `#8B9A6E`），下拉框与输入框圆角化并配备聚焦柔光，操作按钮升级为温润胶囊药丸；
    - 敏感与危险操作整合在底部浅绯红柔和告警卡片中，兼具清晰醒目与整体美学统一。
- **全量测试与验证**：`npm.cmd run test:r4-pc`（403/403 全量通过）、`npm.cmd run type-check`、`git diff --check` 全部退出 0。

### 2026-09-24 PC 专注时钟（Pomodoro）禅意极简配色重构、时间轴智能感知与版面尺度调优

- **禅意极简配色重构（Zen Minimalist Color Palette）**：
  - 将原高饱和度亮橙与荧光绿替换为温和内敛的鼠尾草绿与暖琥珀茶色：沉浸专注态使用 Zen Sage（`#8B9A6E`），茶歇时刻使用 Warm Amber Tea（`#C89B6D`）；
  - 页面背景维持 `#EEEEEE`（`--color-bg-secondary`），左右核心大底板（`.timer-core` 与右侧卡片）统一为 `#F7F2EB`（`--color-bg-primary`），卡片内部药丸与选择器对齐为 `#FAF7F2`（`--color-bg-tertiary`）；
  - 控制按钮升级为温润立体药丸按钮（圆角 `9999px`，主操作按钮采用高雅渐变与漫反射柔影，次级按钮采用温润纸色微阴影）。
- **时间轴任务智能感知与自由学习集成**：
  - 任务下拉选择器严格过滤出时间轴上已排期（具有有效 `scheduledAt`）且未完成、未取消的任务，按排期时间由近及远升序排列；
  - 补充内置「自由学习」（`free-study`）专属任务项；
  - 默认任务智能感知：初次加载或时间轴变动时，自动探测当前时刻处于时间区间（`[start, end)`）内的进行中任务；若当前未在执行区间则匹配 10 分钟内即将开始的任务；若无正在进行或即将进行的排期任务，则默认选中「自由学习」；
  - 保护用户手动选择：一旦用户主动选择特定任务，锁定选择状态，避免后台任务刷新覆盖用户意图。
- **视觉排版纯净度与空间比例调优**：
  - 移除任务选择区多余的「时间轴联动」标签徽标；
  - 修复当前专注任务横幅（`.active-focus-banner`）布局与折行缺陷：消除长标题挤压导致「已排期」胶囊纵向折行（`已排\n期`）的严重 UI 瑕疵，将任务标题与状态/时间解耦为两行排版（标题独占上层并支持两行平滑换行，下层由 `white-space: nowrap` 的状态胶囊紧随排期时间），兼顾长标题可读性与标签完整性；
  - 移除横幅中所有多余装饰性图标，保持极简纯文字排版；
  - 左侧时钟列比例调大：左侧宽度由 `flex: 1` 拓宽至 `flex: 6.4`（右侧 `flex: 3.6`，间距 `64px`，容器最大宽度 `1240px`）；
  - 时钟圆环与时间字号扩大：圆环尺寸由 `320px` 扩大至 `440px × 440px`，时间数字字号扩大至 `clamp(76px, 8.5vw, 92px)`（字重 700，字间距 `-2px`）；
  - 中间状态小圆点胶囊（`.ring-pill`）位置调高（`bottom: 64px`），使指示药丸处于时间数字下方平衡位置，消除靠贴底部圆弧的下沉感。
- **全量测试与验证**：`npm.cmd run test:r4-pc`（403/403 全量通过）、`npm.cmd run type-check`、`git diff --check` 全部退出 0。

### 2026-09-24 PC 关系星图（KnowledgeGraph）中间圆角边框消除与星空动效升级

- **中间嵌套圆角边框消除与无缝沉浸式画幅（`KnowledgeGraph.vue` & `Asset/index.vue`）**：
  - 彻底移除 `KnowledgeGraph.vue` 内部原写死的 `.knowledge-graph-wrapper` 边框（`border: none`、`border-radius: 0`、`background: transparent`），彻底消除嵌在右侧面板中间多余的圆角边框线，实现图谱与外部容器的无缝融合；
  - 精简悬浮遮罩：移除原本带有生硬边框且与顶栏文字重复的 `.overlay-header` 矩形卡片，升级为极简毛玻璃胶囊 HUD（`.hud-legend`，`border-radius: 9999px`，柔和高斯模糊与微边框），配合右下角轻量胶囊按钮（`.fit-button`），呈现通透纯净星空视野。
- **星空图谱全量动效升级（Canvas Dynamic Animation）**：
  - **星轨流动能量光子（Constellation Photons）**：在所有知识关联连线上引入沿轨迹平滑循环流动的光子脉冲微动效，呈现生生不息的思维流动与知识联结感；
  - **星宿天体呼吸光晕（Node Breathing & Auras）**：所有节点引入有机正弦微呼吸动效（半径微脉动），学科核心天体配备双层径向柔光光晕（Radial Gradient Halo）；
  - **交互聚焦高亮网络（Focus Highlighting）**：鼠标悬浮任意节点时，自动高亮该节点并绽放外延脉动光环，点亮所有直连连线与邻居节点，其他无关节点与连线柔和半透明弱化（`alpha: 0.28`），带来极具科技感与禅意聚焦体验；
  - **微星尘背景与 60fps 高性能平滑渲染**：画布背景散布 28 颗微星尘随视口缩放与平移微光闪烁；采用连续 `requestAnimationFrame` 渲染，物理模拟收敛后物理开销自动归零，页面失焦/隐藏时自动挂起，兼顾绚丽动效与低能耗。
- **全量测试与验证**：`npm.cmd run test:r4-pc`（403/403 全量通过）、`npm.cmd run type-check`、`git diff --check` 全部退出 0。

### 2026-09-24 PC 资产库（Asset Studio）知识块与任务编辑排版重构、标签精简与任务所属学科自选

- **知识块与任务编辑区现代化排版重构（`Asset/index.vue`）**：
  - **顶栏去重与动作归拢**：重构中栏 `.detail-header`，彻底消除原标题与编辑框重叠展示的双重标题 Bug 及双保存按钮冗余；自适应提取为顶部工作条，知识块展示纯净面包屑路径（`知识库 / 学科`）、字数统计与保存按钮，任务展示状态切换胶囊（待处理/已完成）、截止日期/预计用时徽标与保存按钮；
  - **知识块顶部标签精简**：移除纸张卡片顶部多余的 `# {{ tag }}` 标签徽标，保持纯净学科胶囊与沉浸式笔记排版；
  - **任务所属学科与预计用时自选与圆角禅意下拉栏**：在任务属性工坊中，将原本只读的所属学科及原生的预计用时均升级为定制禅意圆角下拉选择器（`<el-select class="zen-select" popper-class="zen-select-popper">`）；触发胶囊采用 `border-radius: 9999px` 胶囊设计与 `#FAF7F2` 温润宣纸底色，下拉浮层采用 `border-radius: 16px`、内含 `10px` 选项圆角与自然微投影；修复暗色选择器在 Vue scoped 样式下祖先选择器剥离导致的浮层底色异常，确保浅色模式下始终呈现纯净米白底色与 `#8B9A6E` 鼠尾草绿悬浮高亮；在 `useTaskStore.ts` 的 `updateTaskDetails` 中支持 `subjectId` 字段流转与离线持久化同步；
  - **统一温润纸张画布（`.editor-paper-card`）**：采用 `#FAF7F2` 米白宣纸底板、20px 圆角与立体微阴影，以 860px 宽度居中呈现，建立清晰的内容视觉承载面，消除原标题漂浮、内容孤立的碎片化排版；
  - **任务属性工坊（Property Panel）**：采用 Notion/Linear 风格结构化属性面板，集成禅意圆角截止日期选择器、禅意圆角预计用时下拉选择与圆角所属学科选择器，并通过导轨与小节标签清晰隔开下方“任务备注与详细说明”编辑框；
  - **沉浸式滚动条全量隐藏**：全面清除资产库中栏滚动区（`.middle-content-scroll`）、左右侧栏容器、笔记/任务备注文本域（`.paper-textarea`、`.task-notes-textarea`）以及下拉面板（`.zen-select-popper` 的虚拟滚动轨道 `.el-scrollbar__bar`）的滚动条视觉露出，保留自然流畅鼠标滚轮与触控滚动，彻底消除突兀滑条。
- **全量测试与验证**：`npm.cmd run test:r4-pc`（403/403 全量通过）、`npm.cmd run type-check`、`git diff --check` 全部退出 0。

### 2026-09-24 PC 资产库（Asset Studio）温润配色全面对齐与关系星图拓宽

- **资产库（`Asset/index.vue`）主内容与卡片背景层级解耦、配色对齐与星图拓宽**：
  - 页面背景维持 `#EEEEEE`（`--color-bg-secondary`）；
  - 三栏容器（`.studio-left`、`.studio-middle`、`.studio-right-context`）统一为 `#F7F2EB`（`--color-bg-primary`），修复 `.middle-content-scroll` 误用 `#EEEEEE` 导致的灰底割裂；
  - 关系星图拓宽：移除 `<aside class="studio-right-context">` 原写死的内联 `style="width: 450px;"` 与标题栏 `style="background: var(--color-bg-secondary);"`，将宽度提升至 `540px`（+90px，拓宽 20%），为力导向节点与知识卡片提供开阔视野；
  - 卡片模块、输入框与模态框底色对齐：`.search-input`、`.editor-content-wrapper`、`.block-row`、`.task-row`、`.inline-block-editor`、`.modal-container`、`.styled-input`、`.styled-textarea`、`.subject-capsule-item` 统一对齐为 `#FAF7F2`，并添加微阴影；聚焦轮廓收敛为 `#8B9A6E` 发光；
  - 全按钮与组件库主题收拢：主按钮 `.btn-primary` 与保存按钮采用 `#8B9A6E` 渐变及阴影，次级按钮采用 `#FAF7F2`；统一 Element Plus 日期选择器与弹出层的 hover/focus/selected 强调色；
  - 修复 `KnowledgeGraph.vue` 中 `down` 交互状态缺失 `pointerId`、`startX`、`startY` 的 TypeScript 检查报错。
- **全量测试与验证**：`npm.cmd run test:r4-pc`（401/401 全量通过）、`npm.cmd run type-check`、`git diff --check` 全部退出 0。

### 2026-09-24 PC 任务编排中心（Timeline）配色三层级对齐、待安排栏加宽与全卡片按钮底影优化

- **任务编排中心（`Timeline/index.vue`）主内容与卡片背景层级解耦、对齐与立体微阴影调优**：
  - 页面背景维持 `#EEEEEE`（`--color-bg-secondary`）；
  - 主内容大底板（`.timeline-header-card`、`.timeline-column`、`.tasks-column`、`.weekly-overview-column`、`.weekly-column`、`.weekly-bottom-dock`、`.kanban-column`）统一为 `#F7F2EB`（`--color-bg-primary`）；
  - 待安排任务栏加宽：`.timeline-body` 列宽定义由 `280px 1fr 340px` 调整为 `280px 1fr 400px`，右侧「待安排任务块」（`.tasks-column`）宽度增加 60px，消除卡片内部信息拥挤；
  - 全卡片与模块底部立体阴影：任务卡片（`.slot-task`、`.weekly-task-card`、`.pending-card`、`.kanban-task-card`）、周视图列卡片（`.weekly-column`）、周概览行（`.weekly-overview-row`）、周底坞任务胶囊（`.pending-pill`）、统计微胶囊（`.stat-pill`）、学科胶囊（`.subject-capsule-item`）及知识关联徽标（`.kb-relation-badge`）全量配置分层微阴影（`0 2~4px ...`），悬浮态抬升伴随扩散投影，使纸张模块自然浮于底板之上；
  - 全交互按钮底部立体阴影：主按钮 `.btn-primary`、次级按钮 `.btn-secondary`、视图切换栏 `.view-toggle` 与切换胶囊 `.toggle-btn`、日期胶囊 `.day-btn`、自动顺延按钮 `.btn-auto-delay`、弹窗确定/取消按钮 `.task-btn-submit`/`.task-btn-cancel`、时长交互条 `.duration-long-bar-btn`、关闭与删除小圆钮均补齐微阴影与高亮悬浮投影，彻底消除死白无边界扁平感。
- **全量测试与验证**：`npm.cmd run test:r4-pc`（401/401 全量通过）、`npm.cmd run type-check`、`npm.cmd run build`、`git diff --check` 全部退出 0。

### 2026-09-24 PC 学科中心与总览视图配色层级修正

- **学科中心（`SubjectHall/index.vue`）与总览（`OverviewSummaryView.vue`）主内容与卡片背景分离**：
  - 页面背景维持 `#EEEEEE`（`--color-bg-secondary`）；
  - 主内容大底板（`.hall-content` 与 `.overview-summary-view` 及其头部）恢复并对齐为 `#F7F2EB`（`--color-bg-primary`）；`FilePreview.vue` 在 bare 模式下容器 body 背景同步对齐为 `#F7F2EB`；
  - 卡片模块、搜索输入框、新建学科卡片、知识块卡片与总结卡片维持温润米白宣纸色 `#FAF7F2`（`--color-bg-tertiary` / `--bg-card`），使卡片在 `#F7F2EB` 大底板上自然显现温和纵深与立体浮起感。
- **全量测试与验证**：`npm.cmd run test:r4-pc`（401/401 全量通过）、`npm.cmd run type-check`、`npm.cmd run check:subject-icons`、`npm.cmd run check:subject-workspace` 全绿无报错。

### 2026-09-24 紧邻任务交换

- 顶部交互栏交换两个首尾紧邻任务时，服务端按交换后的顺序在原共同时间窗口内紧凑重排，保持窗口起止不变。PC 不再用“直接互换开始时间”的本地预检阻断时长不同的紧邻任务；提交版本后采用服务端返回的两项排期时间刷新本地投影。非紧邻任务仍按现有交换规则处理，失败不改本地状态。

### 2026-09-24 Timeline 任务主体放置规则

- 任务卡片主体落点使用目标任务 ID 发起严格放置：被拖任务接在目标结束后的首个半小时槽，目标及其他任务保持原位；若被拖任务完整时长与后续排期冲突，服务端拒绝且 PC 保留原状态。主体提示显示目标结束槽与冲突拒绝规则。普通空白时间槽继续使用原有插入顺延；仅 `.task-header` 交换。
- `r4-task-store-schedule.test.mjs` 定向验证主体落点携带目标任务 ID；服务端负责最终冲突判断。真实 GUI 拖放仍需人工验收。

### 2026-09-24 PC Timeline 日视图固定刻度轴与卡片网格跨越编排

- `Timeline/index.vue` 移除 `.time-slot` 上的 `v-show="!isSlotCovered(slot.time)"`，日视图固定呈现 08:00–22:30 全部 30 个半小时刻度槽位行，彻底消除长任务导致后续刻度断档隐藏的问题。
- 刻度行固定为 `height: 80px; min-height: 80px; flex-shrink: 0;`，配合 4px 垂直间隙与 1px 虚线导轨，刻度行不随任务存在而被压缩或隐藏；`.slot-time` 引入 `font-variant-numeric: tabular-nums` 保证时间数字等宽严整对齐。
- 任务卡片 `.slot-task` 改为自起始槽位的 `.slot-right-container` 绝对定位跨越网格（`top: 0; left: 0; right: 0; z-index: 10`），高度精确匹配 `getTaskHeight(slot.task.duration)`（`slots * 80 + (slots - 1) * 4 - 6`px），在视觉上自然向下跨越对应的网格槽位，且左侧时间标尺的所有半小时刻度完整可见。
- 交互分流：卡片顶部 `.task-header` 作为文字区域独立处理原子交换；主体按本文件最新规则放到目标之后，普通空白槽位保留原有插入顺延。覆盖槽位保留已完成任务守卫。
- 自动化测试与构建门禁：全量回归 `npm.cmd run test:r4-pc` 397/397 通过，`npm.cmd run type-check`、`npm.cmd run build` 及 `git diff --check` 全部退出 0。

### 2026-09-23 PC 排期区间重叠防护

- `taskViewRules.ts` 增加半开时间区间冲突判断，所有未取消的已排期任务（包括已完成且固定的任务）均占用 `[scheduledAt, scheduledAt + durationMinutes)`；相邻任务可首尾相接。
- `domainMappers.ts` 将远端 null/缺失或非整数、负数、超出 Java `Integer` 范围的时长按服务端默认值 30 分钟归一；API 合法的 0 分钟保持原值。这样本地冲突判断与服务端空时长的有效区间长度一致。
- `useTaskStore.ts` 在本地创建/更新持久化边界检查新增或变化的排期区间，覆盖新建任务、改动已排期任务时长、按槽排期、按天排期与空槽改期；这些本端排期相关操作由 Store 队列串行执行，并在 repository 初始化后复核。按天排期按 30 分钟递增寻找无冲突的槽位。
- 未排期任务拖到已占用槽位会被拒绝并提示先将原任务移出日程；不再分两次写入“移出原任务、安排新任务”，避免第二次本地提交失败时原任务丢失排期。
- 双任务换位由服务端原子校验换位后双方区间与其它任务及彼此均无重叠；冲突时服务端拒绝，内存与本地投影保持原样。
- `r4-task-store-schedule.test.mjs` 直接验证半开区间相邻、真实交叠、取消任务忽略和换位排除规则。
- 现有已重叠数据不会被自动重写；后续读取仍保留原投影，用户调整到无冲突区间后即可正常保存。

### 2026-10-06 任务完整排期截止上限

- 有排期和截止时间时，新建、改期、调整有效时长/截止日期必须满足 `scheduledAt + effectiveDurationMinutes <= dueAt`，恰好结束允许，空时长按 30 分钟，无截止不限制。按天排期选择同时满足冲突和截止约束的槽位。
- Task Store 在本地持久化和 outbox 写入前校验时间变更；插入顺延预检全部实际改期任务，头部换位预检双方新区间，失败沿用 Timeline 的错误反馈并保留原投影。服务端在事务内再次校验以处理远端变化。
- 既存越界任务不批量改写；有效时间值未变化的标题、备注、状态和自动完成仍可保存，取消后重新进入活动排期必须校验。已验证的自动 DONE、版本/outbox 围栏及 Subject cascade 墓碑保护继续保留。
- 代码、自动验证与业务验收分别记录于 [实施记录](../plans/2026-10-06-task-schedule-deadline-guard.md)。

### 2026-09-23 PC Timeline 插入顺延与头部交换分流

- `Timeline/index.vue` 将日视图任务卡片主体及普通时间槽设为插入落点：待排期和已排期任务都调用 `useTaskApi.scheduleInsertions`，由服务端单事务将落点之后的任务连锁顺延。`.task-header` 单独处理 drop 并停止冒泡，只有从已有排期拖到另一个任务头部才调用 `schedule-swaps`；待排期任务拖到任务头部会明确提示需要已排期任务。
- `useTaskStore.ts` 为插入请求提交源任务 `baseVersion`、目标 `scheduledAt` 与当天本地 08:00–22:30 的 UTC 窗口。发请求前检查源任务和目标日的本地 Repository/outbox；存在未同步、冲突或错误状态时拒绝，以免服务器批量更新覆盖本地未提交任务。过去时段、已完成任务及顺延会移动的已完成固定任务仍被拒绝。
- 服务端成功后，返回的变化 Task 通过 `upsertSyncedBatch` 在同一 SQL 事务或 browser 状态提交中合并：保留未解决 mutation 的整批围栏，逐项跳过低于当前版本的响应及试图清除当前墓碑的活动响应。其他有效成员仍原子写入；版本 0 保留原值，不能用本地版本替换。Store 在合并成功、围栏拒绝和缓存异常后均重读当前 Repository 投影，再触发 read sync；缓存异常时保留可读取的本地数据并提示刷新，不直接安装响应模型。API 失败不改本地状态。
- `r4-task-store-schedule.test.mjs` 覆盖插入和交换入口分离、落点日 pending outbox 防护、服务端响应缓存与 header 独立 drop/冒泡阻断。

### 2026-09-23 PC 学科大纲保存数据保留、大纲草稿生命周期、首页移出日程精准寻址与学科切换文件隔离

- **学科大纲（`SubjectWorkspace/index.vue`）保存数据保留、消除伪轮转覆写与大纲同步清理**：
  - 扩充 `OutlineSection` 包含 `summary?: string | null`、`sourceIds?: string[]` 与 `locator?: OverviewLocator | null`；
  - `initSubjectOutlineFromExisting` 在载入综合大纲或单文件大纲时，完整保留 `sourceIds` 数组，以及小节 `summary` 和 `locator`；
  - `saveCurrentOutline` 保存时优先保留小节原有的 `summary`、`sourceIds`（非空优先）与 `locator`，不再清空置空，并补充非空与保存中防重守卫；
  - 编排模板支持对小节已关联的每一个文件展示文件胶囊标签与独立解除关联按钮，并在关联/解除时同步维护 `sourceIds` 集合与 `fileId` 回退；
  - 彻底移除早期原型遗留的 `syncOutlineFileLinks` 及其在 `onMounted`/`watch(subjectId)` 的调用，严禁按章节顺序对已有大纲小节进行无脑伪轮转重设文件 ID；
  - 在 `watch(subjectId)` 入口第一行**立即同步清空** `subjectOutline.value = []` 及文件大纲草稿，绝不在 `await startFreshChatSession()` 等异步等待期间残留旧大纲，杜绝跨学科异步串写草稿漏洞。
- **学科切换期间 AI 请求旧文件隔离与跨学科校验（`SubjectWorkspace/index.vue`）**：
  - 在 `watch(subjectId)` 入口第一行同步触发 `chatStore.abortStream()`、`chatStore.clearActiveConversation()`、清空 `selectedFileId`、`selectedAiSourceIds`，并调用 `sourceStore.clearActiveSourceFiles()`，阻断旧会话流式与状态残留；
  - 在 `sendChat`、`retryChat`、`sendSelectionQuestion` 以及 `saveKnowledgeBlock` 请求组装时增加严密的归属双重校验：关联的 `sourceId` 必须能在当前 `activeSourceFiles` 中找到且 `subjectId` 与当前学科一致，否则严格过滤置空，彻底杜绝切换等待期将旧文件 ID 携带进新学科请求的竞态问题。
- **首页移出日程（`Dashboard/index.vue` & `useTaskStore.ts`）按任务 ID 精准寻址与异常反馈**：
  - `useTaskStore.ts` 的 `unscheduleTask(idOrSlotTime)` 升级为优先通过 `findTask(idOrSlotTime)` 匹配任务，未命中时回退按 `timeSlots` 槽位查找；
  - `Dashboard/index.vue` 的 `handleRemoveSchedule` 改造为直接传递点击卡片的唯一 `task.id`，彻底解决同时间槽多任务时的串操作风险与首项已完成时点击项无法移出的问题；
  - 发生移出异常时，通过 `ElNotification` 区分弹出“已完成的排期任务已固定”警告或具体持久化失败原因错误提示，不再静默仅写控制台；
  - `Timeline/index.vue` 拖放待办对齐优先使用 `draggedItem.value.taskId`。
- **验证**：PC 端全量 `npm.cmd run test:r4-pc`（386/386）、`npm.cmd run type-check`、`npm.cmd run check:subject-workspace`、`npm.cmd run check:subject-icons` 及 `git diff --check` 全部通过。

### 2026-09-22 PC 学科中心知识块布局优化与卡片/搜索框底部立体微阴影

- **学科中心（`SubjectWorkspace/index.vue`）知识块下移与防遮挡优化**：
  - 将知识库网格（`.blocks-grid`）与顶栏（`center-status-bar` 及 `.blocks-top-bar`）之间增加合理呼吸间距，`.blocks-workspace` 调整为 `padding: 24px 28px 20px`，`.blocks-top-bar` 调整为 `margin-bottom: 24px`；
  - 为 `.blocks-grid` 引入 `padding: 8px 6px 24px 6px` 与 `margin: 0 -6px`，整体视觉向下自然沉降 16px，彻底消除卡片鼠标悬浮态（`transform: translateY(-3px)`）被滚动容器顶边界及上方状态栏/操作条遮挡裁切的问题。
- **知识块卡片（`.block-card`）分层底部立体微阴影**：
  - 常态配置向下沉降的分层底部阴影（`box-shadow: 0 8px 20px -4px rgba(0, 0, 0, 0.06), 0 3px 6px -1px rgba(0, 0, 0, 0.04)`，深色模式自适应 `0 8px 20px -4px rgba(0, 0, 0, 0.35), 0 3px 6px -1px rgba(0, 0, 0, 0.2)`）；
  - 悬浮态（`:hover`）提升至 `z-index: 2`，并增强底部阴影扩散（`box-shadow: 0 14px 28px -4px rgba(0, 0, 0, 0.09), 0 6px 12px -2px rgba(125, 147, 114, 0.15)`，深色模式同步适配），呈现温润立体的悬浮质感。
- **学科空间（`SubjectHall/index.vue`）卡片与搜索框底部微阴影**：
  - 搜索框（`.search-input`）加入常态与聚焦态分层底部微阴影；
  - 学科卡片（`.subject-card`）加入常态分层立体底部微阴影与更饱满的悬浮投影扩散，深色模式同步适配。
- **验证**：`npm.cmd run type-check`、`npm.cmd run test:r4-pc`（382/382）、`npm.cmd run build`、`git diff --check` 全部通过。

### 2026-09-27 PC 弹窗与模态层组件化规范、视觉重构与焦点/无障碍修复

- **模态基础设施与管理器**：
  - `src/components/modal/modalManager.ts`：实现全局活动弹窗管理、引用计数级 `body` 滚动穿透锁定（`lockBodyScroll` / `unlockBodyScroll`）、LIFO 弹窗栈（`modalStack`）、顶层 `Escape` 拦截机制（`stopImmediatePropagation`）与全局焦点循环管理（`trapTabKey`）。
  - `src/components/modal/ModalShell.vue`：统一作为所有 PC 模态弹窗的基础容器，实现标准化 `Teleport`、淡入缩放微动效、`role="dialog"` 可访问性名称计算（`effectiveAriaLabelledBy` 与 `effectiveAriaLabel`）、入场智能聚焦（保持已有聚焦、检测 `[autofocus]`、优先聚焦首个输入控件）、退场焦点归还触发元素（`previousActiveElement`）以及 `preventClose` / `beforeClose` 关闭守卫。
  - `src/components/modal/modal.css`：全面对齐 Auralis 极简禅意温润设计规范与色彩体系：
    - 色彩与质感全面统一：弹窗浅色底板采用宣纸暖米白 `var(--color-bg-tertiary, #FAF7F2)` 搭配浅发丝边框 `var(--border-default, #DDD5C7)` 与暖炭黑毛玻璃遮罩（`rgba(28, 28, 26, 0.42)`），深色模式统一采用暖炭高阶底板 `var(--color-bg-elevated, #3d3b38)`，杜绝偏色；输入框、芯片与内嵌卡片采用燕麦米白 `var(--color-bg-primary, #F7F2EB)`，形成双层宣纸/燕麦纸层次，输入聚焦切换为白底；文字严格对齐 Zen Graphite `var(--text-primary, #1C1C1A)`；
    - 大圆角无缝画布：弹窗主体采用 `24px` 大圆角（`--radius-xl`）与柔和阴影，移除头部与底部硬性 1px 线条切割，构建浑然一体的温润底板；
    - 呼吸感尺寸体系：宽度层级放宽（`sm: 480px`、`md: 580px`、`lg: 760px`、`xl: 920px`）；内边距统一放宽（头部 `30px 36px 14px`、内容 `14px 36px 24px`、底部 `16px 36px 32px`）；
    - 全圆角 Zen 胶囊按钮（`border-radius: 9999px`，高度 40px，统一采用全站 `Primary Gradient` 禅绿渐变 `linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%)` 与陶土红渐变）、32px 纯圆交互关闭按钮、14px 舒适圆角表单控件与 `.modal-markdown-body` 排版规范。
- **5 项核心交互与焦点/无障碍问题修复**：
  1. 上传关闭守卫前置：`ModalShell` 在触发任何状态变更前执行关闭守卫；`FileRegisterDialog` 绑定上传状态守卫，并在上传失败时不重置表单，允许用户保留所选文件与文件名立即重试。
  2. 共享引用计数滚动锁：使用全局引用计数管理 `document.body.style.overflow`，彻底解决多层弹窗以任意顺序关闭时的提早解锁或残留 `overflow: hidden` 问题。
  3. LIFO 弹窗栈单层 Escape：多层弹窗时仅允许最顶层响应 Escape，并配合 `e.stopImmediatePropagation()` 阻止下层弹窗同时被关闭。
  4. 焦点闭环：实现弹窗内 Tab/Shift+Tab 闭环循环，关闭后焦点无损返还给触发按钮，且入场聚焦检测 `[autofocus]`，不覆盖任务名称等组件的原生自动聚焦。
  5. 无障碍名称绑定修复：`ModalShell` 在无 `title` 时移除 `aria-labelledby` 并无缝切换至 `effectiveAriaLabel`，修复知识块查看弹窗与工作区弹窗在未传 `title`时的空 ID 引用缺陷。
- **业务弹窗提取与接入**：
  - 系统化解耦并提取 6 大独立业务弹窗组件（`ChangePasswordDialog.vue`、`SummaryInstructionDialog.vue`、`TaskCreateDialog.vue`、`FileRegisterDialog.vue`、`KnowledgeBlockViewDialog.vue`、`WorkspaceKnowledgeBlockDialog.vue`）；
  - 全面改造 `SubjectCreateModal.vue`（消除双重标题栏冗余，接入 `#footer` 插槽）与 `ConfirmDialog.vue`。
- **门禁与自动化验证**：`npm.cmd run type-check`、`npm.cmd run test:r4-pc`（433/433 pass）、`npm.cmd run check:subject-icons`、`npm.cmd run check:subject-workspace`、`npm.cmd run build` 均全部通过。

### 2026-09-21 PC 端全量界面语义图标迁移至 Tabler Icons（@tabler/icons-vue）

- 全面统一 PC 端所有界面语义图标库为 `@tabler/icons-vue`，清理历史遗留的 `lucide-vue-next` 与散落内联 `<svg>`。
- 核心迁移覆盖：
  - 学科图标映射（`src/utils/subjectIcon.ts`）：重构为专注大学核心科目的 16 个学术语义键（`math: IconMathFunction`, `code: IconTerminal2`, `physics: IconAtom`, `chemistry: IconFlask`, `biology: IconDna`, `computer: IconCpu`, `analysis: IconChartDots`, `language: IconLanguage`, `book: IconBook2`, `economics: IconTrendingUp`, `business: IconBriefcase`, `law: IconScale`, `medicine: IconStethoscope`, `engineering: IconBuilding`, `art: IconPalette`, `school: IconSchool`），约束为纯净类型映射，不保留历史旧 key 兼容回退，并通过契约验证脚本 `scripts/check-subject-icon-rendering.mjs`。
  - 全局导航与框架：`AppSidebar.vue` 侧栏 5 项导航使用 `IconLayoutDashboard`, `IconCompass`, `IconCalendarTime`, `IconDatabase`, `IconHourglass`；`AppHeader.vue` 与 `SearchPalette.vue` 统一使用 `IconSearch`, `IconSun`, `IconMoon`。
  - 核心工作区与视图：
    - `SubjectWorkspace/index.vue`：顶部 Tier-1 导航、中心状态栏、历史撤销重做、左右侧折叠、大纲编辑器（小节删除/文件链接/解除关联）、上传拖拽区、清空对话与消息发送全部替换为 Tabler。
    - `Timeline/index.vue`：统计药丸（`IconListCheck`, `IconCircleCheck`, `IconClock`）、导入任务与新建任务按钮全部对齐 Tabler。
    - `Asset/index.vue`：树状层次（文件夹 `IconFolder`、文件分类 `IconFiles`、知识块 `IconNotes`、任务 `IconChecklist`、汇总分类 `IconArchive`、各学科分类节点图标与学科大厅全面同步，使用 `getSubjectIconComponent(subj.icon)` 动态匹配学科专属图标）、右侧关系星图（`IconNetwork`）及编辑器操作按钮全部统一。
    - `Pomodoro/index.vue`：今日番茄统计勾选图标替换为 `IconCheck`。
    - `Dashboard/index.vue` 与 `Home/index.vue`：内联 SVG 搜索、翻页、加号、日/周视图与时钟全部统一。
  - 专属图形渲染保留：`PomodoroRing.vue` 倒计时环形进度条、`AppSidebar.vue` 应用 Logo 以及 `SubjectWorkspace/index.vue` AI 伴读四芒星粒子动效维持原生实现。
- 门禁验证：`npm.cmd run check:subject-icons`、`npm.cmd run type-check`、`npm.cmd run test:r4-pc`（382/382）均通过。

### 2026-09-21 首页与学科工作区三栏卡片底部阴影微调

- 首页（`Dashboard/index.vue`）与学科工作区（`SubjectWorkspace/index.vue`）三大栏（Tier-1 导航条、Tier-2 大纲抽屉、中心主工作区与右侧 AI 伴读助手）统一采用分层微阴影变量（`--workspace-card-shadow: 0 10px 24px -4px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03)`，暗色模式同步适配），增强卡片在极浅象牙白底板上的底部立体沉降质感。
- 修复时间轴连续任务粘连/重叠问题：在 `Dashboard/index.vue` 与 `Timeline/index.vue` 中为时间轴任务高度计算引入 `TIMELINE_TASK_GAP`（6px）呼吸底隙与边距，消除连续任务 0px 相贴的视觉重叠；在 `Timeline/index.vue` 的槽位上补充 `v-show="!isSlotCovered(slot.time)"`，避免跨槽任务的被覆盖槽位未隐藏造成的错位。
- 首页（`Dashboard/index.vue`）时间轴重置优化：在组件挂载（`onMounted`）、路由切回（`watch $route.path === '/'`）以及从周视图切回日视图时，自动调用 `taskStore.setSelectedDay(getTodayDayCode())` 重置为当前本日，保证切回首页始终展示当天的时间流与待办细节。
- 静态检查、自动化测试 382/382 与生产构建均验证通过。

### 2026-09-21 Issue 3/4 final review fixes

- `useSyncStore` 保留上一次安全同步错误，只有完整的 push/pull/asset cycle 成功后才清除；同步、聊天和 AI SSE 错误统一经过有限 code/用户文案映射，原始诊断只进入有界受控日志，并保留离线分类。
- Overview 的所有 eligibility/not-ready/no-input 分支均返回 `SKIPPED`，不把 skip 写成 `FAILED`；Subject 生成在 Provider 返回后以当前参与 Source 的 fingerprint、generation 和 abort fence 复核，删除/修订/新一代响应不会写入缓存。
- `classifyClientError` 对已经安全化的 `SafeClientError` 保持原有 `code`、用户文案和 `retryable`，避免跨 Store/Controller 边界二次降级；Subject discard 会 abort 使用该 Source 的进行中生成，Provider 返回后再逐个复核 Source existence、FILE/READY、revision 与 eligibility。
- 已补真正运行时回归：同步错误持续到成功 cycle、SSE 安全错误、聊天 retry 保持 `clientRequestId`、Subject `NO_USABLE_INPUT` 及 revision late-result。手动完成的 `STARTED` 反馈显示“已更新”，旧内容提示仅在确有旧内容时出现。
- 最终 focused 回归为 68/68，PC 完整 R4 门禁为 382/382；`npm.cmd run type-check`、`npm.cmd run build`、根目录 `git diff --check` 均通过。真实 WebSocket、Tauri/GUI、Provider 和业务验收仍需单独记录。

### 2026-09-24 PC 专注时钟（Pomodoro）温润配色全面对齐、时间轴专属排期联动与自由学习模式

- 全面温润配色系统对齐：
  1. 页面底色与双栏卡片：大页面底色统一为 `var(--color-bg-secondary, #EEEEEE)`，左右双栏采用温润燕麦米白大容器卡片（`#F7F2EB`）、24px 大圆角与分层微质感阴影，取代原有生硬白灰断层；
  2. 极简禅意圆环与状态着色：圆环轨道由原本刺眼高饱和纯橙色（`#E85D04`）重构为专注态禅意鼠尾草绿（`#8B9A6E`），茶歇阶段升级为温润琥珀茶色（`#C89B6D`），背景底轨采用半透明发丝柔光（`rgba(139, 154, 110, 0.14)`），时间文本继承全局字体规范；
  3. 控制组与微交互：中央开始/暂停大圆钮采用品牌渐变（`linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%)`）配合柔和绿晕投影（茶歇态自适应切为琥珀茶金渐变），重置/跳过次要操作按钮采用全圆角米白宣纸胶囊（`#FAF7F2`）与发丝边框，悬浮微浮起；日期与时间状态呈现精致悬浮胶囊。
- 任务选择器专属过滤与时间轴深度联动：
  1. 纯净时间轴过滤：任务下拉栏不再混入无排期的杂乱待办或未归档知识块，严格仅过滤已在时间轴上拥有明确排期（`Boolean(task.scheduledAt)`）、处于未完成且未取消状态的有效排期任务，并按排期时间由近及远升序排列；
  2. 选项高信息辨识：每个排期任务在下拉列表内清晰展示排期时间徽标（如 `今日 14:00`、`周四 09:30`）与学科指引，一眼看清当前时段应专注的任务；
  3. 自由学习模式：在选择器首位注入开箱即用的「自由学习」虚拟任务（具备灵动星光徽标与专属自由模式横幅），页面加载默认选中「自由学习」，满足无需排期绑定、随时自主开启心流专注的场景需求；
  4. 专注横幅卡片：卡片下方实时动态展现当前专注的迷你横幅，一目了然区分自由模式与时间轴排期模式。
- 自动化与规范验证：`npm.cmd run test:r4-pc`（403/403 pass）、`npm.cmd run type-check`（0 error）、`git diff --check` 全部通过。

### 2026-09-24 PC 关系星图（KnowledgeGraph）中间圆角边框消除与星空动效升级

- 消除双重边框与冗余卡片外壳：彻底移除 `KnowledgeGraph.vue` 根节点 `.knowledge-graph-wrapper` 上的内嵌边框（`border: 1px solid var(--border-subtle)`）、内圆角（`border-radius: 20px`）和独立底色，使画布完全贴合右侧上下文抽屉容器；`Asset/index.vue` 的 `.ctx-graph` 设为 `flex: 1; display: flex; position: relative; overflow: hidden;`，并穿透移除内层包裹边框，实现纯净无界画幅；右侧星图面板宽度进一步拓宽至 `620px`，为多节点力导向星图布局提供宽阔舒适视野。
- 极简 HUD 图例胶囊与自适应适配按钮：废弃原有大矩形半透明顶栏，升级为轻悬浮毛玻璃胶囊（`border-radius: 9999px; backdrop-filter: blur(8px);`），包含“学科空间 / 关联文件 / 知识点”高辨识微胶囊，右侧配备悬浮动效的“适配画幅”圆形胶囊按钮（带微发光与上浮悬停动效）。
- 60fps 动态星空与呼吸光晕体系：
  1. 静态物理收敛与常态微动效解耦：物理布局算法在 180 帧或能量耗散后停止计算（零 CPU 额外负担），而动画渲染循环通过 `requestAnimationFrame` 持续驱动环境光、星芒微粒与脉冲；监听 `visibilitychange` 在标签页隐藏时自动休眠。
  2. 28 颗背景微尘星芒：随机分布于星图视野深处，通过正弦波周期性微弱闪烁（闪烁频率 0.8–2.2s），营造浩瀚深邃的银河景深。
  3. 连线能量流光脉冲（Energy Photons）：在学科与文件、文件与知识块的连线上，粒子沿连线方向平滑流动（每个连接以稳定 hash 派生速度与周期），模拟知识网络中川流不息的思维电讯号。
  4. 天体节点呼吸与柔和双层光晕：核心学科天体具备外层扩散光晕与纯色实体天体（去除中心小白点，保持纯净禅意质感），普通节点呈现有机节奏的呼吸微脉冲。
  5. 交互高亮与弱化：鼠标悬停在特定节点时，与该节点相连的所有连线与邻接节点高亮激活，其余无关节点柔和降淡至 0.28 透明度，视觉焦点极致聚焦。
- 自动化与工程规范守卫：`npm.cmd run test:r4-pc`（403/403 pass）、`npm.cmd run type-check`（0 error）、`git diff --check`（0 whitespace error）全部通过。

### 2026-09-21 Issue 3/4 前端反馈收口（自动证据完成，人工验收开放）

- Issue 3 的 PC 连接状态现在由统一 projection 按错误、离线、Realtime 重连、同步中、已同步的优先级计算；同步错误、服务不可用和问答错误保持为可见错误，不会因浏览器恢复 online 事件直接伪装为已同步。问答失败保留在聊天区域并提供重试入口。
- Issue 4 的手动文件/学科 Overview 重生成返回结构化 `STARTED`、`SKIPPED` 或 `FAILED` 结果；调用方对 Source 未就绪、版本/eligibility 不满足和 Provider/网络失败给出明确反馈。自动触发继续静默记录有界结果，不弹出通知、不递归重试；失败或跳过均保留已有缓存内容，只有手动重试可绕过当前 revision 的终态策略。
- 自动验证：Issue 3/4 focused 命令 `node --experimental-strip-types --test scripts/r4-issues-3-4-frontend.test.mjs scripts/r4-overview-generation.test.mjs scripts/r4-overview-cache.test.mjs scripts/r4-subject-overview-ui.test.mjs scripts/r4-sync.test.mjs scripts/r4-reliability.test.mjs` 为 88/88；`npm.cmd run test:r4-pc` 为 369/369；`npm.cmd run type-check`、`npm.cmd run build` 和根目录 `git diff --check` 均退出 0。
- 构建/测试输出仍包含既有 SQLite experimental、Vite externalized/dynamic-import 和 chunk size 警告；它们未被改写为失败，也不等同于真实验收。真实 WebSocket delivery、浏览器 online/offline 事件、Tauri/GUI 文件预览及真实 AI Provider 输出尚未验收；本轮无 API 或数据库契约变化。

2026-09-17 PC Local Asset Store Task 8 收尾：`b7a3bb7..c560d8b` 已将 PC Tauri 文件导入接入永久本地资料库。原始文件在受管目录中保持明文，由受管路径与 OS ACL 保护；本地 Asset 与 Source draft 以 `userId + serverDeviceId` 隔离，所有文件默认进入同步队列。断网时可完成导入、预览、OCR/Parser 本地解析，联网后以稳定 `clientImportId` 幂等同步对象存储；Preview、OCR、Parser 共享同一 Local Asset descriptor，`localContentRevision` 与服务端 `ingestionRevision` 分离。Local Asset 不提供备份、导出、恢复或副本管理能力。仅用户明确删除 Source 且最后一个 Source 引用消失后才进入受控删除；上传、解析、修复和 Source 删除均有任务 fence。启动同步前执行 owner/device-scoped reconcile：缺失或 hash/size 不一致标记 `CORRUPT`，未知或残留 staging 文件移入 quarantine，不静默删除。

自动证据：`f770277`/`e040e78` 后 Task 7 定向 77/77、FilePreview+store 38/38、Rust Local Asset 30/30；`cargo fmt --check`、`cargo check` 通过。`npm.cmd run test:r4-pc` 当前 333/334，仅剩用户 dirty `task-view` 的 completed scheduled task 断言失败；`npm.cmd run type-check` 仍仅有用户 dirty UI/Store 的 7 项错误。上述代码和自动门禁不等于真实 Tauri GUI、断网重启、真实文件系统或外部对象存储验收通过。

2026-09-15 Overview 失败体验收口：真实第二次 Overview 全链路已成功，证明当前永久预算链路可运行；生成内容质量仍需用户判断。对于 Overview 的 `MODEL_PROVIDER_ERROR`，PC 现在显示“遇到意外情况，请重试”，不新增 Server/API 错误码；既有 FAILED 终态保护保持不变，刷新、启动、联网、同步和 `JOB_CHANGED` 不会自动重试，只有用户点击“重新生成”才发起新请求。该文案映射仅位于 Overview 专用 failure policy，不影响普通 AI 聊天/流式错误。

2026-09-14 Overview retry/convergence：当前 revision 的 FILE Overview 缓存一旦为 `FAILED` 或部分 `READY`，对 `SOURCE_READY`、`RESUME_BOOTSTRAP`、`RESUME_ONLINE`、`RESUME_SYNC`、`JOB_CHANGED` 的自动触发均视为终态，不再自动 POST；只有 `MANUAL_RETRY` 可绕过该限制，并继续使用现有 in-flight coalescing。失败或部分结果区域各自只显示一个可见“重新生成”操作，生成中 disabled；旧大纲/总结保留。`MODEL_TIMEOUT`、`MODEL_UNAVAILABLE`、客户端 timeout/网络失败使用“无法确认生成状态”文案，与确定性失败区分。PC focused 早期证据为 54/54，最新 `npm.cmd run test:r4-pc` 为 331/331；type-check、`check:r4-pc`（94 个生产文件）、`check:subject-workspace` 与 build 均退出 0。上述自动证据不代表 Server 持久幂等、真实 Provider、Tauri、网络、GUI 或业务验收完成。

2026-09-12 Build/OpenAPI Task 3 最终回归：PC `npm.cmd run type-check` 退出 0；`check-openapi.ps1` 退出 0，生成的 `schema.ts` 与固定 OpenAPI artifact 一致，`subjectOverview`/`sourceOverview` 的 header 暴露可选 `X-Overview-Request-Id`。schema 由生成器产出，未手工维护；本轮未改变 API/数据库语义。真实 Server/Provider、Tauri、GUI、设备和业务验收仍待完成。

2026-09-11 Overview Source 删除 fence：文件总览生成在本地先要求当前用户/设备的活动 FILE Source 投影存在与请求完全一致的 `ingestionRevision`，且独立的本地文档任务阶段恰为 `READY`，因此自动恢复与手动重生成在任何 Server 预检前都会跳过不合格输入。Source 删除在本地 tombstone 与可见投影移除后同步阻断该 Source、abort 匹配的文件请求并移除文件总览缓存；晚到的成功或失败响应均不保存、不标记失败。Store-owned 删除顺序把该 fence 放在 `scheduleSync()` 与后台文档清理之前。Server 端的删除/修订保护见 Backend 模块；Subject 总览行为与既有 API/数据库契约未改变。本轮自动证据：PC `test:r4-pc` 322/322、type-check 退出 0、`check:r4-pc` 退出 0（93 个生产文件）；真实 Tauri 删除/重传、Axios 断开传播、Provider、GUI 与业务验收仍待完成。





2026-09-09 时间轴拖动边界修复：排期任务拖到空槽时，`useTaskStore` 只通过当前用户/设备的本地 repository/outbox 更新单 Task，不调用需要两个 UUID 的 `schedule-swaps`；拖到已占用槽时仍调用服务端原子 swap。不改变 Task API 契约或数据库结构。

2026-09-09 知识块来源与学科名称映射修复：KnowledgeBlock API/本地投影仍仅保存 `sourceId`/`subjectId`；`useKnowledgeStore` 在读取知识块时同时读取当前用户/设备的 Source 与 Subject 投影，将关联 ID 映射为 `Source.title`/`Subject.name` 供 UI 显示。新建/更新路径保留当前可读名称，关联投影变化会重建知识块显示投影；缺失关联时显示中性占位。该修复不改变 API、数据库或 ParsedDocument 契约。

2026-09-09 PDF 混合页面阶段修复：`DocumentJobRunner` 在同一 PDF 已进入 `OCR_RUNNING` 后，后续普通文字 block 继续以 `OCR_RUNNING` 保存 checkpoint，直到 `PACKAGING`，不放宽 `OCR_RUNNING → EXTRACTING`，也不改变 PDF 分类、API 或 schema。runner 回归 12/12、完整 PC 回归 269/269、type-check 和 diff-check 通过；真实 51 页 PDF/Tauri GUI 仍待验收。

2026-09-08：ParsedDocument Tauri PUT 的失败日志增加安全、长度受限的 reqwest 诊断摘要，并最多保留三层 `Error::source()` cause。摘要先移除 URL，再脱敏预签名 query、Authorization、header value、路径和控制字符；`flags + summary + causes` 总体有界且仅写入 stderr，不改变返回给前端的 `NETWORK_OFFLINE:*` 分类或 SQLite 错误契约。ParsedDocument cache receipt 的 `payloadBytes/payloadSha256` 现在严格对应解密 reader 实际上传的 gzip payload；旧 receipt 若误将 `payloadBytes` 等同于 `encryptedBytes`，恢复上传前会在 owner-scoped native boundary 重新计算 payload size/hash。真实 Tauri/MinIO 复验仍需人工验收。

2026-09-09 schema-v1 final review closure：PC 本地加密 cache/receipt 保存 `parsed-document-v1`、Source Asset SHA 和 parser/normalization/OCR 元数据；gzip 上传内容为单个 Server-compatible schema-v1 JSON envelope，不是 NDJSON，owner/job/device/user 字段只用于本地 cache scope，不进入上传 JSON。兼容 receipt 直接续传，旧/不完整 receipt 在 intent 前只清理派生 cache 并重建一次。最终 scheduler focused 27/27、完整 R4 250/250、type-check 和 diff-check 通过；所有 Critical/Important reviewer findings 已关闭。真实重建 Tauri、Server/MinIO 和 `1.pdf` GUI retry 尚未观察。

## 模块定位

`Auralis-PC` 是桌面与 Web 共用的 Vue 客户端，负责高信息密度的学科工作区、资产、任务时间线、知识关系和设置。浏览器开发与构建由 Vite 提供；桌面能力由 Tauri 2 提供。

截至 2026-08-20，PC 页面与基础视觉重构已基本收敛；R4 在原有 Store、AI SSE、运行时代理和 Tauri 权限边界之上，补齐了 BYOK 浏览器明文清理、离线写入幂等、SSE 401 单次刷新和离线 AI 会话恢复。PC Web 与 Tauri 应用本体构建已通过；MSI bundling、浏览器/Tauri GUI、真实 Provider 和前后端业务联调仍未验收。

PC 全局排版以 `src/styles/index.css` 为唯一入口：普通 UI 文本继承 `--font-family-base`，代码/图表等专用内容使用 `--font-family-mono`；根字号为 `16px`，字号优先使用 `caption`、`body-sm`、`label`、`body`、`body-lg`、`title-sm`、`title`、`title-lg` 与 `display` 语义令牌。页面组件不得新增未纳入令牌的独立字体族；保留旧基础字号变量仅用于兼容已有样式。

2026-09-07 认证边界收口：refresh session 无效时清除本地会话并进入明确的 `reauthentication-required` 状态；受保护 Axios、同步和本地资料调度停止启动，登录/注册/refresh/health 保留恢复入口，refresh 仍由单飞协调器执行且每个请求最多重放一次。PPTX/Office 的 JSZip 根入口通过 Vite alias 固定到自包含浏览器 bundle，不使用 stream polyfill。自动回归已通过，真实 Tauri GUI 与新鲜 Vite bundle 仍待验收。

## 当前技术栈

| 依赖 | 当前声明 |
| --- | --- |
| Vue | `^3.5.32` |
| Vite | `^8.0.10` |
| TypeScript | `~6.0.2` |
| Pinia | `^3.0.4` |
| Vue Router | `^4.6.4` |
| Element Plus | `^2.13.7` |
| Tauri API / CLI | `2.11.1` |
| Rust `tauri` | `2.11.1`，见 `src-tauri/Cargo.toml` |

这是依赖清单事实，不表示所有依赖组合已完成桌面打包验收。

## 目录边界

```text
Auralis-PC/
├── src/
│   ├── api/          # HTTP、AI、同步、资产、鉴权、统计、Tauri 封装
│   ├── components/   # 共享组件和学科组件
│   ├── router/       # 正式路由与守卫
│   ├── store/        # Pinia 状态
│   ├── styles/       # 全局设计令牌和样式
│   └── views/        # 页面
├── src-tauri/        # Rust、权限和桌面配置
├── package.json
└── vite.config.*
```

## 正式路由

| 路由 | 名称 | 页面 | 鉴权意图 |
| --- | --- | --- | --- |
| `/login` | Login | `src/views/Login/index.vue` | 公开 |
| `/` | Dashboard | `src/views/Dashboard/index.vue` | `requiresAuth` |
| `/subjects` | SubjectHall | `src/views/SubjectHall/index.vue` | `requiresAuth` |
| `/subject/:id` | SubjectWorkspace | `src/views/SubjectWorkspace/index.vue` | `requiresAuth` |
| `/asset` | Asset | `src/views/Asset/index.vue` | `requiresAuth` |
| `/timeline` | Timeline | `src/views/Timeline/index.vue` | `requiresAuth` |
| `/profile` | Profile | `src/views/Profile/index.vue` | `requiresAuth` |
| `/pomodoro` | Pomodoro | `src/views/Pomodoro/index.vue` | `requiresAuth` |

2026-10-01 已删除无正式路由与运行引用的 `src/views/Home`、`src/views/Settings`。Dashboard 继续使用 `/`；个人设置仍在 Profile。搜索结果以一次性 `openBlock` query 携带知识块 ID，Dashboard 挂载/参数变化时加载本地正文并打开详情，再移除该参数，避免 out-in 动画期间事件丢失。原 `open-block-detail` 仍由 Dashboard 详情弹窗接收；SearchPalette 的 AI 快捷项已删除。

## 登录守卫现状

`src/router/index.ts` 的 `beforeEach` 使用 `useAuthStore` 完整会话和 `resolveAuthRedirect` 处理公开/受保护路由。`App.vue` 仅在受保护路由且存在完整 user+access token 会话时挂载侧栏、头部和认证壳；`/login` 使用独立公共布局，`AppSidebar` 的学科加载也有认证判断与异常兜底，避免过期/残留会话的 401 刷新异常造成白屏。当前结论：

- 未登录访问受保护页面会重定向到 `/login`，已有会话访问 `/login` 会回到 `/`。
- Server 受保护 API 仍必须验证 access token。
- `r4-pc-protocol.test.mjs` 已覆盖守卫决策；浏览器/Tauri 中的登录、刷新持久化、退出和过期仍需人工验收。

该问题属于 P1，不能因页面能够打开而写成鉴权已验收。

## Store 清单

| Store | 主要职责 |
| --- | --- |
| `useAuthStore.ts` | token、用户与会话 |
| `useTaskStore.ts` | Task typed API、user/device repository、排期、状态和 mutation |
| `useSubjectStore.ts` | 学科列表和当前学科 |
| `useSourceStore.ts` | Source 分页、资料目录、关联 Asset 元数据、软删除和 Source mutation；`activeSourceFiles` 按当前工作区焦点 `subjectId` 投影，空学科也会在后续本地 hydration 中保持为空 |
| `useKnowledgeStore.ts` | KnowledgeBlock 列表、关联 Source、离线缓存和 mutation |
| `useAssetStore.ts` | Asset upload-intent、对象存储上传、complete、下载 URL 和失败 pending 状态 |
| `useSyncStore.ts` | cursor、resetRequired、pull/push 状态、错误和统一同步入口 |
| `useReviewStore.ts` | Review queue/history/event 的 typed DTO 状态 |
| `useStatsStore.ts` | Stats overview/weekly query 和展示模型 |
| `useChatStore.ts` | 本地稳定会话/消息 ID、会话创建与消息请求幂等键、citation/SSE 状态及 online 顺序恢复；不把旧本地 chat 表当云端事实 |
| `usePomodoroStore.ts` | 用户/设备隔离的持久计时状态、实际秒数、自然完成轮次与离线专注事件重试；计时生命周期不依赖 TimerCore 挂载 |
| `useSettingsStore.ts` | 主题和偏好 |

修改 Store 字段前必须搜索页面、组件、持久化、同步和 API 使用方，禁止新增同职责 Store。

## API 边界

| 文件 | 职责 |
| --- | --- |
| `api/request.ts` | base URL、Authorization、401 单飞刷新；不读取或发送浏览器 BYOK key/header |
| `api/aiClient.ts` | AI 设置、会话、带单次 401 刷新且复用同一请求 ID 的 SSE 消息流；Suggestions 暂不在 PC 端暴露 |
| `api/useAuthApi.ts` | 登录、注册、刷新、会话列表与撤销 |
| `api/useAssetApi.ts` | upload-intent、对象存储直传、complete 与 download-url。`uploadAsset` 接收 options 对象 |
| `api/useSourceApi.ts` | Source typed CRUD/reingest，以及 ParsedDocument upload-intent/complete |
| `api/useStatsApi.ts` | 用户概览/周统计与独立个人专注字段；学科聚合及 7 / 30 天本地日趋势 |
| `api/useReviewApi.ts` | 到期队列、完整学科 states 分页、不可变评分与单块历史；新调用支持会话票据 |
| `api/useFocusSessionApi.ts` | 稳定 clientSessionId 的最终专注事件上传 |
| `api/useOverviewResultsApi.ts` | 完整 Overview 独立 GET/PUT，与核心资源 Sync 分离 |

Source FILE 响应携带可选 `assetSizeBytes`；`domainMappers.mapSourceView` 使用该字段填充资料大小，缺失时才回退为 `0`。文件登记的本地优先副本也保留上传完成时的 `asset.sizeBytes`，避免 Source 同步完成前短暂显示 `0.0 MB`。文件预览仍通过 Asset download-url 获取短期签名地址。

2026-09-04 起，Subject、Source、KnowledgeBlock、Task 的常规创建、更新和删除均走 `commitMutation()`：资源投影与 immutable outbox 在同一端侧提交中持久化成功后，才更新 Pinia/UI 并调用 `requestBackgroundSync('write')`。Store 列表只 hydration 本地投影，随后请求 cursor 同步，绝不自行调用领域列表 API 或在 loading 中等待网络。同步器以 `pending → inflight → applied/conflict/error` 结算指定 mutation；同资源有未解决本地写入时，push 回包、pull 和 snapshot 不覆盖其投影。FILE 的 Asset 二进制直传/complete、认证、ReviewEvent、AI/SSE、文件下载仍需要网络；用户点击“立即同步”以及启动 FILE 解析前确认 Source 已同步是仅有的 `flushNow()` 显式等待边界。

普通命令首次领取后固定 ID、版本及业务载荷，应用重启和响应丢失均可原样重放。资源队首在端侧事务内结算，重复回执不会再次写投影。若用户在上传期间继续编辑，本机保留新内容，未领取的后继凭本机前驱回执承接版本。下一批由现有 Store 单次同步循环派发，远端实际版本分歧仍按现行冲突处理。[本地队列与历史行边界](../contracts/Database.md#pc-本地优先同步本地-schema-v62026-09-04)
| `api/useSyncApi.ts` | push/pull 同步 |
| `api/e2ee.ts` | 端到端加密辅助 |
| `api/tauri.ts` | Tauri 环境和本地能力封装 |
| `api/generated/schema.ts` | 从冻结 OpenAPI 产物生成的 DTO、路径、参数和响应类型（禁止手改） |
| `api/generated/client.ts` | 约束路径、HTTP 方法、path/query/body 与成功响应的轻量请求适配器 |

所有端点契约以 [API 文档](../contracts/API.md) 为准；页面不得自行硬编码新的 Server 地址或 token 逻辑。

生成 SDK 的源文件是 `docs/contracts/openapi/auralis-openapi.json`，生成器固定为
`openapi-typescript@7.13.0`。从仓库根目录执行
`scripts/generate-openapi-sdk.ps1` 可同步 PC 和 Mobile；执行
`scripts/check-openapi.ps1` 可校验运行时 OpenAPI 与两端生成文件。当前生成 SDK
已冻结 Source `ingestionRevision/ingestionStatus` 与 ParsedDocument upload-intent/complete 类型和请求边界；PC 上传协调器与页面业务联调仍需按本计划继续，不能把类型检查通过写成前后端联调完成。

## 本地数据边界

| 文件 | 职责 |
| --- | --- |
| `services/localSchema.ts` | 以 v9 为本轮起点，追加 v10 专注状态/事件和 v11 Overview 同步元数据/outbox；保留旧 key/value 备份、资源与不可变 mutation；迁移时清洗 TASK 负载颜色键并保留无效 JSON 原文 |
| `services/focusSessionRepository.ts` / `pomodoroSessionRuntime.ts` | 活动阶段状态及最终专注事件原子保存，按用户/设备隔离；ACK 后保留本机历史供今日统计 |
| `services/localRepository.ts` | Tauri `local_resource_records`/`local_mutations` 按用户隔离（浏览器 fallback namespace 另含 device）；Subject 删除后由 `tombstoneSubjectChildren()` 幂等隐藏所属 Source/KnowledgeBlock/Task/Relation 投影并清除子资源 outbox，不生成子 DELETE mutation |
| `services/subjectDeletionCoordinator.ts` | Subject durable DELETE marker 之后的本地级联协调器；以 user/device Local Asset lifecycle lock 串行 draft queue release，启动/hydration 重放子投影、Subject/File Overview、文档任务，并在 APPLIED 后终结 Source draft 与最后引用 Local Asset；pending/rejected 保留可恢复 draft/bytes，按 user/device 作用域访问 drafts/assets/overviews/jobs，并保留其他 Subject 的资源和共享 Asset |
| `services/localDatabaseRuntime.ts` | 单个应用生命周期内的 SQLite 初始化 Promise 与按用户/设备范围缓存的 repository |
| `services/localSqlQueue.ts` | 进程内 SQL 命令串行化 adapter，避免 SQL 插件 pool 中的并发写入竞争 |
| `services/legacyLocalData.ts` | 旧 account-less localStorage 的 `legacy_unassigned` 备份和显式迁移选择记录 |
| `services/localDb.ts` | SQLite 单次初始化、WAL 和 busy timeout、串行访问，以及当前账号/设备仓储的入口 |
| `main.ts` / `DesktopDatabaseStartup.vue` | 桌面端先初始化共享 SQLite，成功后才加载路由并挂载应用，失败时显示启动错误与重试入口 |

桌面端在打开 `auralis.db`、初始化连接池及完成 schema 检查后才加载登录或业务页面。SQLite 初始化异常传回启动页，初始化失败期间同步、文档处理和原生资产整理均不会启动。点击重试重新初始化同一个数据库，成功后原生资产整理继续读取当前用户和设备的 SQLite 索引。PC Web 继续使用自身的 localStorage 存储。

时间轴中的已完成排期任务保留其原 `scheduledAt` 槽位，并处于固定状态：Store 拒绝移动、替换和取消排期，Timeline/Dashboard 不提供相应拖放或取消入口；将任务恢复为未完成后才可再次调整。本地加载仅接受 API 领域状态 `TODO`、`IN_PROGRESS`、`DONE`、`CANCELLED`；弃用的展示态缓存（例如 `completed`）不再转换或兼容，而是忽略并由后续在线刷新按现行契约重建。

R4 repository 已覆盖 Web fallback 和 SQLite adapter 的用户隔离、`version/baseVersion` 冲突、`deletedAt` tombstone、v6 outbox 状态与 reset 保留未解决写入。Tauri 路径在应用生命周期只加载、建表和迁移一次，所有 SQL 插件命令经单一队列串行执行；同步 snapshot 通过 Rust `replace_local_resource_snapshot` 在同一 SQLite 连接的显式事务中完成，并启用 WAL 与 5 秒 `busy_timeout`。同步 Store 以共享 cursor cycle 和 500ms 合并调度处理启动、实时、联网、读写请求；push/pull 完成后只发布本地投影变化，领域 Store 重新 hydration 本地库。`DocumentProcessingRuntime` 仅在启动 FILE 处理前 `flushNow()`，确认本地 SOURCE 已为 `synced`。`localDb.ts` 初始化只建立和升级现行 v13 schema。已存在的旧表、列和值原样保留，旧 CRUD 和旧建表路径已移除。浏览器原全局业务键及 `legacy_unassigned` 备份保留。Profile 的缓存清理只删除 `auralis_view_cache` 和 `auralis_temp_index` 两个临时界面键，离线重置通过 Sync Store 使用当前账号的现行仓储。知识块读写与导出使用 `useKnowledgeStore`。

## C4/C5 文档处理与上传边界

C1/C2/C3 的本地解析任务、加密 cache 与可恢复 runner 已接入 C4 `ParsedDocumentUploadCoordinator`；Rust 通过 `document_upload_put` 对 cache 做解密流式 PUT，PC 只传 phase/receipt，不接触正文或持久化签名 URL。C5 `SourceJobScheduler` 已接入 FILE Source：Source Store 只对服务端 `AWAITING_CLIENT + ingestionRevision` 调度，优先复用当前上传会话的 File，没有本地输入时通过 AssetStore 的 owner-scoped download adapter 获取临时输入；每次处理核对 Asset SHA，旧 revision 的 job 被 supersede，TEXT/URL 不进入该队列。恢复批次隔离每个 Source 的失败，单个读取/调度异常只返回该项 `FAILED_LOCAL`，不会阻断后续 `AWAITING_CLIENT` 文件。Profile 的手动开始入口会先触发同步，并确认本地 `SOURCE` 为 `synced` 后才调用 scheduler；仍在同步、冲突或失败时显示相应提示，避免把服务端不存在的 Source 交给解析器。删除 FILE Source 时 Store 先完成 Source tombstone 与 DELETE outbox，再同步移除当前 `sources/activeSourceFiles` 投影；同步 push/pull 与 scheduler 对运行中 parser、当前用户/设备任务行、内存输入和加密 cache 的清理均转为不阻塞界面的 best-effort 操作。删除竞争只会使调度返回 `SOURCE_DELETED`，不会重建任务。Subject Store 随后重算其本地 Source 投影，因此学科文件计数与 Profile 进度中心同步消失。Tauri `default` capability 显式授予 `sql:allow-execute`，使用户/设备隔离的 SQLite job repository 可以创建与更新可恢复任务，而非退回浏览器 localStorage。PDF 本地适配器与 File Viewer PDF renderer 统一从根级精确 `pdfjs-dist@5.4.624` 解析，lockfile 不保留 renderer 的嵌套 PDF.js 副本，避免同一 Tauri WebView 的 worker API 混用；OCR 结束在 `finally` 释放其 PDF.js document，预览签名 URL 下载以最新请求标记提交，过期请求不能覆盖当前选中文件。scheduler 在本地 job 创建和调度结束后只刷新 `useDocumentProcessingStore`，Source 投影继续由既有同步事件刷新，避免 `loadSources -> schedule -> onJobChanged` 递归。Office bridge 先收集锚点再读取 chunks；纯图片 Office 若 renderer 没有可靠页数会明确返回 `DOCUMENT_FILE_TYPE_UNSUPPORTED`。OCR warmup 通过 sidecar 协议实际初始化模型，Rust 仅在诊断日志记录有界 stderr/进程状态，公开错误码保持不变。前端 runtime 仍提前检查加密状态，但 Rust `document_package_begin` 是新 cache 的最终安全边界：仅在 OS keyring 明确返回 `NoEntry` 时创建 `auralis/master_key`，其他 credential-manager 错误会原样报告为 keyring 访问失败；已有 cache 的读取、上传与清理只读取既有密钥，绝不以新密钥覆盖历史密文。

2026-09-26 Issue 6：`useDocumentProcessingStore.start()` 与 `resumePending()` 也经 `SourceJobScheduler` 按 Source 调度；自动恢复只提交 `QUEUED`、`EXTRACTING`、`OCR_RUNNING` job 对应的 Source；`PAUSED_NETWORK` 只由用户点击继续恢复。Store 不再把 UI/重启恢复入口直接交给 `DocumentJobRunner`；runner 继续负责解析执行、列举、暂停和取消，retry 已由 scheduler 处理。

2026-09-07 复核补充：PPTX `runtime.ts` 在 parser 创建阶段直接读取 OOXML 的 `presentation.xml`/relationships，使用真实 slide 数量和文本块，不再依赖 File Viewer 的空 `pageCount`，legacy OLE `.ppt` 不作为 `.pptx` 兼容输入。Tauri invoke wrapper 保留 Rust 返回的字符串及结构化 message/error/code 诊断。Rust sidecar 在应用 cache 下维护专属 PyInstaller TEMP/TMP 目录，启动前只清理确认已停止的受管 sidecar 遗留直属 `_MEI*`；parsed-document PUT 的 `NETWORK_OFFLINE:*` 诊断会被归一化并进入可恢复 `PAUSED_NETWORK`，已完成加密 package 的续传不重新读取原始 Asset。用户从 `PAUSED_NETWORK` 继续时，带 receipt 的任务经 `QUEUED -> UPLOADING` 直接进入上传，不重跑 OCR、download 或 hash；无 receipt 的 queued 任务仍进入解析路径。

2026-09-05 起，`SourceJobScheduler` 只在 `sourceApi.get(sourceId)` 边界识别结构化 `ApiProblemError` 的 HTTP 404 或 `problem.code === 'RESOURCE_NOT_FOUND'`；命中后复用 `discard(sourceId)` 清理当前用户/`serverDeviceId` 范围内的文档任务、准备中的输入和加密 cache，并稳定返回 `{ status: 'SKIPPED', reason: 'SOURCE_NOT_FOUND' }`。其它 Source lookup 异常（包括 503/`INTERNAL_ERROR`）原样拒绝并保留任务；parser、hash、upload 等后续边界的异常不使用该分类。该规则由 `r4-source-processing-schedule.test.mjs` 与相邻文档处理套件覆盖。开发 Tauri SQLite 已在停止运行进程后从当前应用配置目录精确重置；重启后完整表集已建立，远端投影已重新同步。恢复出的文档任务当前暴露 master key 缺失，密钥初始化/恢复和重新上传的 GUI/Server 联调仍需单独验收。

2026-09-06 补充：PDF 本地适配器通过 Vite `?url` 绑定同版本 `pdf.worker.min.mjs` 到 `GlobalWorkerOptions.workerSrc`，不依赖 CDN；Source Store 的自动入口要求 `AWAITING_CLIENT` Source 同时拥有非空 `assetId` 与 `ingestionRevision`，避免本地 CREATE 尚未 push 时触发服务端 404 孤儿清理。该行为由 `sourceSchedulingPolicy.ts` 和 PDF/Source focused 回归覆盖；认证、MinIO 和 API/数据库契约未变化。

2026-09-05 上传与解析入口恢复：`src-tauri/Cargo.toml` 的 keyring 3 显式启用 `windows-native`，保留 `auralis/master_key`；`filePreview.ts` 的 upload accept list 仅为 PDF、DOC、DOCX、PPT、PPTX，图片/文本能力仍可预览但拒绝 upload intent，`canPreviewFile()` 与上传能力解耦，SubjectWorkspace 弹层显示支持格式；Profile `DocumentProcessingCenter` 将 `AWAITING_CLIENT` 详情写成等待桌面端开始处理，服务端 `VALIDATING/PARSING/INDEXING` 分别显示真实阶段，状态映射集中在 `documentProcessingStatus.ts` 并由纯函数直接测试；`DocumentProcessingDot` 复用共享 Source detail 映射，未知/undefined phase 不虚构服务端处理中状态，`READY` 显示“处理完成”。新增 Windows-only Rust keyring 跨新 Entry 写入/读取/清理测试；本机 `cargo test` 的真实 Credential Manager 写入因 `NoStorageAccess(Error(1312))` 失败，不能视为持久化已验收。Stats focused 测试覆盖六个 `Instant` 查询参数及 UUID/order 保留。PC focused file-preview 27/27、processing UI 1/1、runtime static 9/9、Stats 3/3 通过；真实 Tauri Credential Manager、File Viewer/上传、Server complete/indexing 与 GUI 状态仍需验收。

本地 schema v5 的任务行持久化完整 `DocumentCacheReceipt` 元数据，以便应用重启后从 `PACKAGING/UPLOADING/PAUSED_NETWORK` 续传，不重复 OCR 或 package；签名 URL、headers、原始文件路径不进入 SQLite/localStorage。`services/documentProcessing/runtime.ts` 已由 App 在 Tauri 登录后组装并启动：复用全局隐藏 `BackgroundParserHost`，连接 PDF.js/Office bridge、Tauri OCR、Rust package/cache、ParsedDocument upload coordinator、用户/设备 job repository 和 Source scheduler；启动时先 flush 一次本地同步队列，随后加载 Source；sync/online 事件会重新加载 Source 并恢复未暂停的 pending jobs；网络暂停等待用户点击继续，登出时解绑。服务端 complete 接受后删除加密 cache，下载 adapter 的临时输入由 scheduler 清理；实际 Tauri 私有目录、MinIO/Server 联调和 GUI 任务中心仍待人工验收。

## 页面职责

- Dashboard：日程任务、待办和快速创建；数据来自 `useTaskStore`、`useKnowledgeStore` 和 `useSubjectStore`，无静态演示数据兜底。右侧采用上下双卡片分区：上半部为「日程任务」（按时间先后顺序纯线性展示，不作时间轴槽位网格展示、不可拖拽调整时间，支持完成勾选与移出日程），下半部为「待办清单」（纯列表展示，移除拖动手柄，支持直接勾选完成）。待办条目在窄宽下优先保留任务名称，过长的学科徽标允许收缩并以省略号显示。复杂时间轴编排与半小时网格拖拽完全交由 `/timeline`（排期副驾）页面负责。Task 卡片外观统一由 Sage/design 语义 CSS 令牌派生，不依赖 Task 数据颜色。
- SubjectHall：学科卡片、搜索、创建、编辑、删除和进入工作区；编辑表单保留服务端 `version` 并以 `baseVersion` 提交，确保名称、描述和图标修改可以保存；Subject 没有持久化颜色字段，Dashboard 与 Timeline 统一使用 `#7D9372` 全局主题色；新用户注册后没有自动学科时展示真实空状态，历史遗留“未分类”学科也可正常删除。
- SubjectWorkspace：文件、知识、任务、图谱与 AI 上下文；学科图标经 `src/utils/subjectIcon.ts` 统一解析，新建学科保存语义键并渲染 Lucide Icons 线条图标，创建弹层不提供主题色选择，默认、左下角和全局功能侧栏图标底色统一为 `#7D9372`，已有 Emoji 值原样显示，空值或未知语义键回退书本线条图标。右侧 AI 伴读以页面内 SVG/CSS 复刻手机端四芒星、星环、消息气泡、输入中状态和纯文本胶囊输入；当前正式路径使用 typed `streamAiMessage` 和 `/api/ai/messages/stream`，不提供附件或麦克风入口；每次进入或切换学科都会开启新的伴读会话，不回溯旧消息。登记文件必须先选择文件、名称和归档学科，上传期间显示包含文件名、文件大小、三步指示节点和流光渐变的高级进度卡片并防重复提交；直传或 Source 创建失败会在弹层保留可重试状态并显示通知，成功后立即保存到本地并更新当前学科文件列表，后续同步不阻塞操作；抽屉顶部显示内嵌导入进度条，并在文件列表行显示解析状态徽标。文件选择器与拖拽入口共用 `src/utils/filePreview.ts` 的能力注册表，Excel/未知格式和超过 50 MB 的文件在创建 upload intent 前拦截；文件栏只显示真实 Source 文件，文件行删除操作默认悬停显示、键盘 focus-visible 保持可见，确认后通过 Subject Store 执行 Source 软删除并重算文件计数；本地仍有 `SOURCE/CREATE` outbox 时排队有序删除，知识块作为独立的总结/知识表面；删除取消、未登录、版本冲突、资源不存在和服务端异常均给出明确提示；选中文件后由 `FilePreview` 直接承载签名 URL、下载、加载/失败状态，当前优先使用自托管 File Viewer 渲染 DOC/DOCX、PPT/PPTX、PDF、图片及文本；较早的下载响应不得覆盖新选文件。学科页保持一个统一预览面板：现有文件名顶栏承载缩放与旋转，页码/总页数和前后页在预览底部独立占位；搜索、打印、下载、HTML 导出和主题切换不进入预览工具栏。
- PC 阅读辅助使用协议 1 会话。学科工作区在首条成功准入时绑定当前学科、当前文件或手选资料，后续提问继承范围。更换资料范围需开启新会话。未 READY 文件的 AI 操作提示前往 `/profile` 查看解析进度。文件行通过 `DocumentProcessingDot` 与轻量状态微标签显示所有非 READY 状态（失败保留红色静态点与解析失败标签）；Profile 的 `DocumentProcessingCenter` 同时展示本地任务阶段和本地任务已经完成、但服务端仍为 `VALIDATING/PARSING/INDEXING` 的 Source 阶段，后者会低频刷新 Source 至 `READY`。未挂载 Tauri runner 时该中心明确说明“仅可在 Auralis 桌面端运行”，不把不可用误显示为暂无任务。Tauri runtime 的前置检查会在无可恢复加密 cache 时初始化原生 `auralis/master_key`；若 job 仍有 cache 或 receipt 而密钥缺失，则停止并报告恢复需要。无论前端生命周期是否已完成，Rust `document_package_begin` 都会在新建 package 时再次确保密钥存在；读取既有 cache 不会生成新密钥。预览原生选中文本最多 4000 字，可执行解释/追问或打开 `KnowledgeBlockEditor`，知识块只有确认后才写入当前 subject/source。
- 左侧原“学科大纲”入口已改为“总览”，现有 header 中 `AI 梳理` 按钮和圆形“+”顺序、位置以及三栏宽度保持不变。“学科总览”默认折叠且只在用户点击后生成；下面按文件直接展开本地大纲，每个文件的“总结”入口把中栏从文件预览切换为本地总结。文件完成 READY 处理后后台请求一次 `ALL` 文件总览，结果按 user/device/source revision 写入本地 schema v7；失败保留旧大纲/总结；知识总览不再展示侵入性的“本机总览尚未同步”技术性提示条，大纲等待态带有旋转指示。学科总览只组合当前学科已有本地文件结果，不上传新的原文，不进入 Sync。File Viewer 仅代表代码与构建已接入，DOC/DOCX 真实样本、浏览器/Tauri GUI 布局和资源加载仍需人工验收；预览顶部/底部栏使用轻微投影和实体按钮，缩放与旋转各自放入同款简单圆角控制组，缩放显示为 `− / 倍率 / ＋`，旋转显示为左旋线条图标、角度、右旋线条图标，文档上下安全留白收窄为约 12–16px。宿主不再叠加会遮挡正文的“正在渲染文档”遮罩，首次宽度适配只持续到用户第一次交互；`FilePreview` 与 renderer 仅在组件 ref 尚未建立时暂存动作，基础 Vue 组件通过 `withFullViewerOptions` 接入 full preset，缩放调用 `zoomIn`/`zoomOut`/`resetZoom`，PDF/图片旋转走 `applyViewState`，图片 renderer 自带旋转栏隐藏，不支持视图旋转的 Office renderer 才使用外层回退。学习文件列表行不显示装饰性文件类型图案，直接从文件名开始布局。若真实文件兼容性不达标，保持 `FilePreview` 合约不变并替换为服务端转 PDF 渲染器。
- File Viewer 交互补充：不以 `load-complete` 作为执行硬门禁；同时避开 `@file-viewer/vue3-full@2.3.2` 包装组件在 Vue 父级 ref 上丢失公开方法的问题，改由 `@file-viewer/vue3@2.3.0` 基础组件承载相同 full 配置。Chrome 合成图片已验证缩放尺寸和 90° 旋转发生实际变化；真实样本、浏览器/Tauri GUI 布局和资源加载仍需人工验收。
- Asset：上传、处理状态和资料组织；首屏并行读取 Subject、Source、KnowledgeBlock 与 Task 的本地 Store 投影，任一项读取失败仍构建其余本地树并关闭 loading。各 Store 随后独立刷新云端结果、通过其 repository cache 写回本地；资产页监听四类投影及文档处理任务并重建树，不重新显示 loading。文件树节点（全部文件与各学科文件）由 Source 的实际 `ingestionStatus` 与 `useDocumentProcessingStore` 本地任务真实驱动，按已就绪（READY）、解析失败（FAILED）、待本机处理（AWAITING_CLIENT）及处理中（PARSING/INDEXING/VALIDATING/PENDING 等）渲染对应的状态圆点、详情徽标及悬浮说明，不再硬编码固定为“正常”。资产树的“全部任务”和各学科任务目录均来自 `useTaskStore` 的当前用户任务，不注入静态演示任务。任务按 `未排期`、`未完成`、`已完成` 三个并列分组，截止时间存在时按截止时间排序；任务完成切换回写 Task API/repository。任务编辑器不再提供认知负荷按钮，改为 30 分钟步进的预计用时，并可保存标题、备注、截止日期和时长。`/asset?focus=unassigned-tasks` 会展开并聚焦“未排期”。真实 Source 文件以 `FilePreview` 为唯一预览实现，TreeNode 透传 Source 的 `id`、`assetId`、`name` 和 `fileType`；旧 `PdfViewer`、首页 PDF 伴读入口和 Asset 的 `filePath`/Markdown 预览分支均不保留。
- Asset 关系星图使用真实 Subject、Source 和 KnowledgeBlock 投影。Source 连接所属 Subject；KnowledgeBlock 的 `sourceFileId` 指向同学科现存 Source 时连接该 Source，否则连接所属 Subject，不补造关系。力导向计算包含对称节点互斥、按关系类型设目标长度的弹簧吸引、弱重力与速度阻尼；节点初始位置由稳定 ID 决定，初始 RAF 在收敛或 180 帧上限后停止。同范围数据刷新保留存活节点坐标与相机，切换全局/学科范围时重新适配视图。画布使用 ResizeObserver 与设备像素比绘制，提供适配视图、指针中心滚轮缩放、平移及任意节点拖动。鼠标、触控和触控笔共用 Pointer Events 与指针捕获；超过移动阈值后暂停初始模拟，被拖节点保持在指针坐标，关联邻居实时通过弹簧力响应并重画连线，每段响应最多 36 帧并在收敛时提前停止，释放后最多运行 30 帧低强度松弛。用户摆放在同范围更新中保留。点击文件节点选择树中 Source 并在中栏显示 `FilePreview`；点击知识块节点在中栏显示对应编辑器，通过 Dashboard 的 `open-block-detail` 事件打开详情。拖动或 pointercancel 不触发预览。
- Dashboard/Timeline：排期和任务时间管理，排期队列展示无 `scheduledAt` 且未完成/未取消的所有活跃任务，截止时间（`dueAt`）用于提醒、排序及新排期完整结束上限；拖放、按天排期、换位与顺延必须保证每个新安排完整结束于各自截止时刻或之前，无截止不限制。Task Store 以认证态的 `serverDeviceId` 访问用户隔离的本地 repository；首次加载先渲染本地任务，后台 Sync read 更新 Store，读取失败时保留当前投影。Dashboard 切日调用 `setSelectedDay` 重建内存槽位；Timeline 切日保留现有 `await taskStore.loadLocalTasks()` 本地重读，不能清空已有任务。按槽排期和同日改期在进入写队列前捕获具体本地日期，提交窗口与来源校验使用该日期，等待期间切日不会改变已发起落点。周视图日期列传入完整 `dateKey`，按天入口支持活动的已有排期任务改日，沿用完整冲突、过去时间与截止校验。Timeline 重挂载从 Store 的完整选中日期初始化标题与日期栏，和任务槽位保持一致。Timeline 页面支持单任务与换位拖拽、半小时网格槽位渲染；Dashboard 首页看盘采用轻量线性卡片列表，无网格槽位，不作为可拖拽调时，按开始时间升序排列。启动 fetch 和运行中分钟级检查会执行到期转换：有 `scheduledAt` 的任务在 `scheduledAt + durationMinutes` 结束时刻到达后更新为完成并保留排期；无 `scheduledAt` 的 TODO/IN_PROGRESS 活动任务在有效 `dueAt <= now` 时自动完成并保留真实截止时间，DONE/CANCELLED、空或无效截止时间不产生完成写入；卡片继续通过 due-badge 展示截止日期。自动检查在 TASK 投影刷新时也会执行，应用关闭期间到期的任务在下次启动补处理。转换失败保留原数据并记录错误。首页和独立时间轴统一展示当前/所选日期所在的完整自然周（周日至周六），避免只保存 `dayCode` 时跨周解析到下一周。首页日期格在日数字上方显示 `Sun` 至 `Sat` 英文星期缩写，选中日期使用固定约 `36px × 36px` 圆形绿色背景，顶栏以“时间轴 · X月”显示月份。日视图以半小时槽位承接排期开始时间，已完成或已过去的排期仍保留，其中已过去任务以删除线标记；已排期任务拖动到新槽位时以目标槽位覆盖旧 `scheduledAt`。时间轴“导入任务”进入资产库未排期分组。普通任务更新、按天排期和取消排期通过 `useTaskStore` 写入本地 repository/outbox 并在后台同步；按槽插入与标题交换由 `useTaskStore` 在本地计算后一次保存所有受影响 Task 和单条稳定 ID 排期命令，在线与离线使用同一条 Sync 路径；断网时保留本地投影等待重放，服务端拒绝或版本冲突时按返回的 Task 数组恢复投影并提示用户。2026-10-07 放置与交换修复：按天择槽覆盖 22:30；交换发 API 前校验双方实际新起点位于 08:00–22:30，紧邻 compact 以原共同窗口的本地日期为边界；越界保留整组数据。在线响应原子合并保护较新版本与墓碑，投影重读当前 Repository；专项 127/127、PC 542/542，类型/静态/构建和唯一只读审查通过；真实环境验收及完整证据见现行实施记录。
- Profile：账号、user/device/session 状态、会话撤销、外观和设置；统计通过 `useStatsStore`，知识导出通过 `useKnowledgeStore`。登录会话列表使用服务端每设备一条活动会话视图，当前会话不可在页面中撤销；撤销其它设备会阻止其续期，已签发的 access token 按有效期自然失效。个人空间提供确认后的“退出登录”入口：调用当前会话 logout、始终清理本地会话并跳转 `/login`，服务端失败会给出明确提示。正式入口内嵌 BYOK 卡片：读取服务端脱敏设置，只显示 `hasApiKey`/Base URL，API Key 仅在 `PUT /api/ai/settings` 请求体内提交并在成功后清空，不使用浏览器存储或普通请求 header。
- Pomodoro：宽屏专注计时、任务选择、开始/暂停/重置、休息阶段和本机今日专注数据；实际秒数排除暂停与休息，中断保存耗时但不增加完成轮次，自然结束才增加一次。使用时间戳与持久状态恢复，路由切换不重置。新会话使用稳定 UUID，普通局域网 HTTP 下使用现有 UUIDv7 工具。任务选择器与时间轴联动，提供已排期任务和「自由学习」；运行与暂停时显示本轮已绑定的任务或自由学习。
- 专注记录完成时尝试上传，后台核心同步结束后补传待发事件。进入 Profile 时若有待发事件则请求后台同步；「立即同步」等待核心同步后补传专注，再刷新服务端全设备聚合。单条业务拒绝保留原事件并继续处理其他记录；服务暂不可用或连接中断时停止本次尝试，等待现有同步触发重试。未 ACK 的本机事件只计入本机历史，Profile 显示待上传状态。

详细交互与视觉只在 [前端设计](../design/Frontend.md) 维护。

## OCR 页级行为与诊断边界

- 2026-09-18 Task 4 收口：本地 OCR 页级检查点已投影到既有文档处理 Store，Source 行复用原有详情位置显示 `正在识别第 X/Y 页`；不新增百分比、进度组件或其它 UI。重连替换 socket 在 `onopen` 只请求一次既有 background `read` sync；处理 runtime 对处于 processing 的 Source 采用按生命周期与认证 scope 守卫的共享有界 reconciliation，以覆盖遗漏的 `READY`。focused 自动测试、`type-check`、PC 全量回归、Web build 和 diff-check 已通过；真实 Tauri/GUI OCR 进度、真实后端 WebSocket/event delivery 与跨设备收敛仍属人工/发布验收边界。
- 2026-09-18 Task 5 收口：Store 在 Local OCR reader 尚未完成时保留最近有效页级投影；同一 `attempt + localContentRevision` 的 `OCR_RUNNING` Source 进入 `after-recognize`、`after-normalize`、`page-result` 或 `empty-page` 检查点时，且 page/total 与最近有效值一致，继续显示旧页值。相同 run 的倒退 `before-recognize`（包括 totalPages 变化）不覆盖，新 run 必须先有自己的 `before-recognize`；成功读取会原子替换 projection，reader detach、Source 不再出现在 OCR_RUNNING 列表或 reader 失败仍清理失效值。runtime reader 仅补传已有 local record identity；未改变 UI、OCR Coordinator、sync 或 API/数据库契约。Store/UI/coordinator/runtime focused 68/68、`type-check` 与 `git diff --check` 通过；真实 Tauri/GUI OCR 进度仍需人工观察。
- `DocumentParser`/runner 按真实页码逐页推进；OCR 前持久化 `OCR_RUNNING` 检查点，空页只产生页级诊断并继续请求后续页，非空结果按页码和 block ordinal 保持顺序。
- 当所有页归一化后均为空时，runner 以 `OCR_DOCUMENT_EMPTY` 进入 `FAILED_LOCAL`；UI 显示页码、总页数和“未识别到文字”，不伪造成功 block 或页数。
- Profile 处理中心展示 bounded diagnostics，并提供复制入口。复制文本只允许页码、总页数、图片字节数、行数、耗时、结果和安全错误码/说明；不包含 OCR 正文、完整图片路径、`Authorization`、签名 URL 或未知原始字段。复制 API 不可用或失败时仍保留可见诊断。
- Rust sidecar page summary、stderr tail 和 invoke 错误保持有界；OCR 正文仅流经本机 parser/package 加密边界，不写入日志。上述内容有 Node/Rust focused 自动测试，但真实 Tauri `1.pdf`、剪贴板/accessibility 和现场日志仍未验收。
- 断网暂停后的继续操作保持上传边界：存在持久化 payload receipt 时按 `PAUSED_NETWORK -> QUEUED -> UPLOADING` 直接续传，不重新执行 OCR、下载或源文件 hash；没有 receipt 的 `QUEUED` 任务仍执行解析。`NETWORK_OFFLINE` 继续作为稳定错误码，传输原因仅保留 allowlist token。

## Tauri 边界

- JavaScript API、CLI 和 Rust crate 当前统一为 `2.11.1`。
- Local Asset Store 的 native 边界从 Tauri `app_data_dir()` 派生 `assets/` 和 `asset-staging/`；SQLite plugin 仍按其当前实现从 `app_config_dir()` 解析 `auralis.db`，两者不混用。`local_asset_store` 只接受 user/device/local-asset 逻辑身份与受校验的扩展名，不接受调用方目标路径，并沿用 Server 的 52,428,800 字节单文件上限。导入和远端物化均采用 `.part` 写入、flush/fsync、校验 size/SHA-256 后原子 rename；resolve/delete/reconcile 会执行路径 containment、文件类型和 owner scope 校验，并以有界错误码返回缺失、篡改、冲突和 staging 异常。当前未开放宽泛 Tauri asset protocol/CSP；实际 Tauri `app_data_dir()`、SQLite plugin 连接和 GUI 文件 URL 仍需人工验收。
- 原始文件选择器到 Local Asset Store 的最小 native 桥接命令为 `import_local_asset_bytes`。因 Rust 命令参数名为 `command`，Tauri JSON IPC 调用形状为 `{ command: { userScope, deviceId, localAssetId, safeExtension, expectedSize, expectedSha256, content } }`；`content` 对应 Rust `Vec<u8>`，调用方必须传 JSON 数字数组（每项 `0..255`，通常为 `Array.from(new Uint8Array(bytes))`），不能直接把 `Uint8Array` 当作 JSON 数组传入。返回 `LocalAssetDescriptor` 的 `localAssetId`、`safeExtension`、`sizeBytes`、`sha256`、`absolutePath` 均为 camelCase。该命令与文件路径导入共用同一锁、大小/hash 校验、`.part` fsync 和原子发布流程，重复相同内容幂等，已存在不同内容返回 `LOCAL_ASSET_CONFLICT`；自动测试已覆盖超限、hash mismatch 清理、幂等、冲突和成功发布。
- 使用 `@tauri-apps/plugin-sql` 提供 SQL 插件能力。
- 默认 capability 启用 `core:default`、`log:default`、`sql:default` 与持久化 repository 所需的 `sql:allow-execute`；当前未启用 shell/http/fs。Vite 开发代理只接受 `VITE_DEV_API_TARGET` 与 `VITE_DEV_WS_TARGET`，Tauri 运行时 API/WS base 必须显式配置。Vite 显式注入 `vue/compiler-sfc`，并忽略 `public/file-viewer/**` 生成资源的开发监听，避免 File Viewer 首次复制触发 `@vitejs/plugin-vue` 空 compiler HMR 竞态。SQLite 初始化同时识别 Tauri v2 的 `__TAURI_INTERNALS__` 和旧 `__TAURI__` 全局。Debug Tauri 的日志插件只写 stdout，避免已有日志文件阻止窗口启动。
- AI 辅助阅读的 OCR 仅随 PC Tauri 打包：`src-tauri` 通过 bounded commands 管理 target-triple `auralis-ocr` externalBin，固定 RapidOCR/ONNX 模型与 manifest 从 `../ocr-sidecar` 作为 resources 进入安装包；前端不接受可执行文件、模型路径或任意 shell/fs/http 参数。
- G1 protocol、G2 sidecar engine、G3 Rust supervisor 和 G4 MSI bundle 已有自动测试/产物证据；最终 MSI 通过 verifier，五组离线 OCR baseline 已记录。临时 all-users 安装因宿主 Error 1925 未完成，安装后 GUI/OCR 仍属于 R2 验收，不写成已通过。
- G5 已提供固定尺寸、不可 `display:none` 的 `BackgroundParserHost` 与 `FileViewerParserBridge`，复用 File Viewer 的文本块/锚点 API，并在空结构时提供 bitmap fallback/`OFFICE_TEXT_UNAVAILABLE`。DOC/DOCX/PPT/PPTX fixture matrix 3/3 通过，其中旧式 PPT 由 Apache POI 生成真实 OLE 文件；实际 File Viewer/Tauri 运行时的四种文件提取、回退和稳定失败结论仍需验收。G6 `DocumentParser` 已按页分类 text-layer/扫描 PDF，串行调用 OCR，支持 Office direct/fallback，归一化文本并以 sink 背压输出 bounded block；core 7/7 与真实 PDF 2/2 通过。
- 目录从 StudyCore 重命名后，旧绝对路径可能残留在 Rust 构建缓存；仅在确认属于缓存时执行 `cargo clean`。
- 2026-09-05 已停止当前仓库的 Tauri 开发进程并精确删除应用配置目录中的 `auralis.db`、`auralis.db-wal`、`auralis.db-shm`；重启后数据库和完整表集已重新建立。远端同步恢复的 3 个文档任务均因 master key 缺失进入 `FAILED_LOCAL`，该密钥边界仍待修复或人工恢复验证。
- `npm.cmd run tauri -- build --no-bundle` 已验证 Rust/桌面应用本体生成；完整 MSI bundling 曾因宿主 `拒绝访问 (os error 5)` 阻断。Web/Tauri 本体构建通过不能证明桌面权限、窗口、插件、安装包和系统集成可用。

## 开发与验证命令

```powershell
cd Auralis-PC
npm install
npm run dev
npm.cmd run build
npm.cmd run check:subject-icons
npm.cmd run check:subject-workspace
npm run tauri dev
npm.cmd run check:r4-pc
npm.cmd run test:r4-pc
npm.cmd run type-check
npm.cmd run tauri -- build --no-bundle
```

| 命令 | 证明范围 | 不证明 |
| --- | --- | --- |
| `npm run dev` | Vite 开发服务可启动 | 生产构建、桌面能力 |
| `npm.cmd run build` | 类型构建与 Web bundle | Tauri GUI、业务流程 |
| `npm.cmd run check:subject-icons` | 学科语义图标、旧 Emoji 分支与页面接入静态契约 | 浏览器/Tauri 的实际图标显示、键盘和视觉效果 |
| `npm.cmd run check:subject-workspace` | 学科工作区关键 UI 结构契约 | 浏览器拖拽、AI 流式请求与视觉效果 |
| `npm run tauri dev` | 当前机器桌面开发启动 | 安装包和其他系统 |
| `npm.cmd run check:r4-pc` | 生产源码未命中旧 DTO、旧同步字段、旧地址和旧 AI 路径 | 真实 API、GUI、安装包 |
| `npm.cmd run test:r4-pc` | PC 协议、本地 repository、Store mapping、SSE reducer、BYOK 禁止浏览器明文、离线幂等与运行时配置测试 | 浏览器、Tauri GUI、真实后端 |
| `npm.cmd run tauri -- build --no-bundle` | Rust/桌面应用本体和前端 bundle 可生成 | MSI、安装/升级/卸载和 GUI 验收 |

## 当前限制

- 登录守卫逻辑已恢复并有路由决策测试；浏览器/Tauri 登录、刷新、退出和过期仍待人工验收。
- 当前已有 R4 协议、本地 repository、Store mapping、SSE reducer 和运行时配置自动测试，但没有替代真实服务的浏览器 E2E。
- `tsconfig.app.json` 的 TypeScript 6 `baseUrl` 弃用错误（TS5101）已通过移除配置项解决，`AppHeader.vue` 的未使用 `ElMessage` 导入也已清理；2026-08-12 `npm.cmd run build` 通过，但 Vite 提示部分 chunk 超过 500 kB。
- Tauri GUI 和 MSI 打包需本地人工验收；当前 MSI bundling 被宿主权限错误阻断。
- API、同步、资产、AI 和 C4 上传链路需要真实 Server/基础设施联调。
- AI key 的持久化安全、网络中断后的会话恢复和 token 刷新均有自动测试，但仍需要浏览器连接真实 Server/SSE 的人工业务验收。
- 用户当前工作树包含页面、Store、样式和 Tauri 依赖改动；在提交前必须按范围复核。

## 修改后的强制回写

- 路由、页面、Store、API 或 Tauri 变化：更新本文件。
- 视觉或交互变化：更新 `docs/design/Frontend.md`。
- 接口变化：更新 `docs/contracts/API.md`。
- 状态或风险变化：更新 `docs/current/`。
- 可确认变化：更新 `docs/release/Changelog.md`。

## 2026-09-09 Task 15

`ParsedDocumentUploadCoordinator` 在明确收到 `ACCEPTED` complete 且记录 `COMPLETE_ACCEPTED` 后，通过可选 `onCompleteAccepted` 回调请求一次 `useSyncStore().requestBackgroundSync('read')`。回调失败只记录固定诊断，不改变 accepted 返回值或阻止 `SERVER_INDEXING → READY`；rejected、缺失/非法状态、complete 异常均不触发。真实 Tauri、Server/MinIO、sync pull 与 GUI 仍待人工验收。
# PC 当前实现补充（2026-09-09）

ParsedDocument upload coordinator 在服务端 complete 返回 `ACCEPTED` 后，按本地 `DocumentProcessingJobRepository` 合法迁移依次写入 `SERVER_INDEXING` 和 `READY`；scheduler 仍在 READY 之后执行结果返回与派生 cache 清理。真实 transition-validating repository 回归覆盖该边界，真实 Tauri/Server/MinIO/GUI 仍需人工验收。

2026-09-09：scheduler 先读取一次权威 Source backend，再对选中的 current revision 预检本地 cache column/receipt 关系；`SERVER_VALIDATING`/`SERVER_INDEXING` 的本地 mismatch 可安全进入 `FAILED_LOCAL` 并 retry，READY/FAILED_SERVER 保留原 phase。预检失败不执行 hash、runner、upload 或 cache deletion。

2026-09-09 Task 13：ParsedDocument 上传边界增加非持久化 `[Document Upload Trace]` allowlist 事件，覆盖每次 PUT 的开始/校验成功或失败，以及 Server complete 接受或失败；日志不包含 URL、headers、receipt/cache/path、OCR 正文、响应体或异常对象。自动测试 19/19；真实 Tauri/MinIO/Server/GUI 仍待验收。

2026-09-10 PC Overview 触发诊断：文件总览生成现在输出带固定前缀 `[FILE_OVERVIEW_TRIGGER]` 的结构化、allowlist 生命周期日志，触发值来自 TypeScript 封闭类型和已知调用点：`SOURCE_READY`、`RESUME_BOOTSTRAP`、`RESUME_ONLINE`、`RESUME_SYNC`、`JOB_CHANGED`、`MANUAL_RETRY`（不代表运行时动态校验）。仅在实际进入 `runFile` 的生成尝试中由服务创建 request ID，并由 `useOverviewApi` 原样复用到既有 `X-Overview-Request-Id`；preflight/skip 事件可能没有 `requestId`。现有内存 in-flight coalescing 保持不变。本次仅增加诊断与关联，不改变重试、缓存、Provider、Server 或 timeout 行为。Overview 自动化验证通过；真实 Tauri、Provider attribution 与业务验收仍待执行，该条为当时诊断基线；2026-09-27 已有同实例 Source flight 合并，2026-10-11 本轮已有本地硬期限/取消验证，现行事实见上方实施条目。跨实例去重、真实 Tauri/Provider 与代理验收仍开放。

## 2026-10-12 PC Profile Studio 比例优化、文字去黑话与 SVG 图标瘦身
- **设置页布局比例调大**：`Profile/index.vue` 左侧透视与身份面板（`.studio-left`）由原本 30%（`flex: 3; min-width: 330px; max-width: 400px`）调升至约 38% 比例（`flex: 3.8; min-width: 380px; max-width: 480px`），右侧设置控制台（`.studio-right`）对齐调整为 `flex: 6.2`，彻底解决宽屏下左栏被固定 400px 宽度卡死而右栏过度留白的问题，使 2 列指标网格、7 天走势图与账号信息呈现更加从容开阔。
- **全站文案人文化重构（去除工程师技术黑话）**：
  - 侧边栏/顶栏：去除“首页看盘”、“排期副驾”、“重型资产编排”、“知识检索与入库”等早期原型黑话，统一为“首页”、“学科空间”、“任务排期”、“资料管理”、“专注时钟”。
  - 资产与工作区：去除了“彻底从本地数据库移除”、“拉取最新快照”、“服务端校验”、“登录续期已撤销”等后端技术自白，平滑转译为用户级通俗用语。
- **SVG 图标克制精简**：移除 Profile 页面账号单元格与各个分组表头多余堆砌的装饰性 SVG 小图标，依赖清晰的字阶字重与微晶留白维持 Auralis 极简禅意。
- **验证**：PC 专项/全量回归测试 68/68 全部通过，`vue-tsc -b` 0 报错，`npm run build` 成功。


# PC / Service 功能完整度检查（2026-10-07）

文档状态：现行功能审计记录，包含后续优先修复状态。下方审计正文保留审计时快照、源码位置、复现与命令证据，当前修复以本节及 [实施记录](../plans/2026-10-07-priority-function-fixes.md) 为准。

## 后续优先修复状态（2026-10-07）

- 用户批准的 F1、F2、F4 已在代码、相关自动验证和唯一修复 reviewer 层关闭，最终 BLOCKER=0、IMPORTANT=0。F1 覆盖同步、导入、实际上传队列与刷新失败；F2 使用共用 Asset 锁及 durable ORPHANED 先于对象删除；F4 使用准确的“本周专注天数”标签。
- 最终 PC 专项 107/107、R4 554/554，类型/两项学科静态/构建均退出 0；Service 并发 5/5、相关 56/56。全量 clean test 392 项仍有既有迁移版本断言 1 failure；AccountDeletion 时间精度项本次未复现，未修改也未宣称修复。
- GUI、Tauri/Keyring、真实 HTTP、生产对象存储与双设备仍待验收。其余 10 组缺口及 12 项偏好按用户要求逐项讨论，当前不实施。

## 修复前审计结论

审计时结论：1 项 BLOCKER、2 项 IMPORTANT、10 组 OPTIONAL（含既有项及范围相关项）；另有 2 项 Service 测试门槛失败。范围为 PC / Service，未审计 Mobile / Tablet 实现。以下描述及行号均对应修复前快照。

## 范围与口径

- 只检查当前工作树中的 PC 与 Service，不修改业务代码。以实际路由、Store、Service、现行需求和契约为依据。
- 用户已决定暂缓登录/注册最终逻辑，隐藏 Suggestions，移除 Home/Settings/快捷入口及知识块摘要/标签。这些不作为必须补回的缺口。
- 实际复现、代码确认、测试失败、人工验收缺失分别记录。API 桩/adapter 的请求构造不是服务端数据写入证据。

## 优先处理项

| ID | 等级 | 未完善项 | 当前证据与影响 |
| --- | --- | --- | --- |
| F1 | BLOCKER | 账号切换时旧异步操作仍读取新会话 | 真实 SubjectStore 创建 A 未同步学科，真实 AuthStore logout/login 切到 B，旧同步等待后读取 B device，真实 Axios interceptor 附 B token，adapter 观察到 A SUBJECT CREATE。独立导入复现把 A 的文件名写入 B 本地 ASSET 投影。真实 HTTP/服务端写入未执行 |
| F2 | IMPORTANT | 文件恢复与保留清理未共用锁 | Cleanup 检查无活动引用后，restore 可在 Asset 仍 READY 时成功，再被 cleanup 删除 blob/标 ORPHANED，可能留下活动 Source 对应丢失文件；代码确认交错，未动态执行 |
| F4 | IMPORTANT | 个人空间“连续专注天数”实际上是本周专注日数 | 对本周 focusSeconds>0 的天数计数，无相邻日期判断，间断专注也显示连续；代码确认 |
| G1 | 工程门禁未通过 | Service 全量测试存在两项失败 | 干净编译后 387 项有 2 项失败：最新迁移仍断言 V21，实际 V28；PostgreSQL 时间戳舍入与测试截断差 1µs。不能写全量测试通过，也不能由此断言注销或迁移业务故障 |

### F1 账号隔离的精确边界

- PC 同步：`src/store/useSyncStore.ts` 的 runCycle 保存旧 Repository，然后等待 assetQueue，再读当前 serverDeviceId；`src/api/request.ts` 在发送时读当前 token。App 登出只停 realtime/document runtime，不停止该同步周期。
- PC 导入：`src/store/useAssetStore.ts` 上传先捕获 A LocalAssetRepository，等待 import 完成后另取当前账号 LocalRepository，造成 A 文件元数据进入 B 投影。字节仍在 A 本地资料库，不把它说成字节已经上传给 B。
- Service：SyncController 用 JWT 当前 userId 和请求 device，校验设备属于当前用户且 active；mutation 不含来源账号。合法的自包含 SUBJECT CREATE 可按 B owner 创建（代码推断，未实际写入服务）。Task 缺 Subject 或引用 A Subject 会被拒绝；已有 A 资源的 owner 查询也会拒绝。不能把这个 PC 错发问题报告成已有 A 服务端记录的越权读取/修改。
- 最小处理方向：在上述已经证明的异步边界固定 owner/device/session 代际，切换后禁止旧操作发送和写新账号投影，并保留 A 待同步数据；不扩展到无证据的全 Store 重写。
- 关闭条件：可控等待中走真实退出/登录 B 后，旧同步/导入不能携 B 凭据，也不能写 B 投影；A 数据仍可重试，B 正常操作通过。分别记录 browser、Tauri、真实 HTTP 与双设备证据。

### F2、F4 与 G1 关闭条件

- F2：建立清理与 restore 共享的锁/状态协议，并在锁内重新校验引用；确定性交错证明 restore 赢则文件保留，cleanup 赢则 restore 拒绝。
- F4：采用准确的本周专注日数标签，或在需求批准后计算真实连续天数；用间断日期验证。
- G1：保持 clean/upgrade 与时间绑定的业务断言，修正迁移版本和精度预期后跑原失败用例及必要门禁，不能直接删测试。

### 审计时源码定位

| 项目 | 当前文件 / 关键位置 |
| --- | --- |
| F1 同步 | `Auralis-PC/src/store/useSyncStore.ts:239–270`（runCycle），`src/api/request.ts:56`（当前token）；`src/App.vue:113–130`（退出仅停realtime/document） |
| F1 导入 | `Auralis-PC/src/store/useAssetStore.ts:55–130`（旧LocalAssetRepository导入后取当前LocalRepository） |
| F1 后端边界 | `Auralis-Server/src/main/java/com/auralis/app/sync/SyncController.java:28–35`、`SyncService.java:47–50`、`SyncMutationProcessor.java:65–73`、`subject/SubjectService.java:41–51` |
| F2 | `Auralis-Server/src/main/java/com/auralis/app/source/AssetRetentionCleanupService.java:59–101`，`SourceService.java:240–257,434–439` |
| F3 | `Auralis-PC/src/views/Timeline/index.vue:468–475,735–770`，`src/services/domainMappers.ts:273–293,333–346`，`src/store/useReviewStore.ts:18–47` |
| F4 | `Auralis-PC/src/views/Profile/index.vue:21,1099–1106` |
| G1 | `Auralis-Server/src/test/java/com/auralis/app/TaskColorRemovalMigrationTests.java:62`，`AccountDeletionCleanupPostgresIntegrationTests.java:95` |

源码位置为本轮工作树读取时行号；相对路径均从仓库根目录开始。完整低优先级定位见执行报告和审查记录。

## 较低优先级项及已知项

| ID | 范围 | 问题 | 证据等级 / 处理方向 |
| --- | --- | --- | --- |
| O1 | Profile | 统计请求失败只写控制台，页面仍显示默认 0 或旧值，无错误/重试 | 代码确认；绑定 loading/error，区分未知数据与真实 0 |
| O2 | SearchPalette | 加载失败显示“未匹配”，没有错误与重试 | 代码确认；区分失败与空结果 |
| O3 | SearchPalette | 已启动搜索使用旧 q，后返回可能覆盖新查询/清空后的结果 | reviewer接受静态交错候选，尚未动态复现；不写成GUI已复现 |
| O4 | Dashboard / SubjectHall / Workspace | 任务创建、学科删除、知识块保存/删除等部分失败只有日志或抛出，无可见恢复提示 | 代码确认；逐入口显示失败、保留输入并能重试；学科创建/编辑已有反馈，不混为同一问题 |
| O5 | Profile | 今日柱图以 UTC 日期标记，本地凌晨可能标到前一天 | 代码确认；使用本地日期并覆盖时区边界 |
| O6 | Timeline | 当前时刻标记及跨午夜判断混用星期与完整日期 | 既有 OPTIONAL，当前仍保留；此前真实 Store 复现标记消失，午夜仅代码确认 |
| O7 | Timeline | 同日交换守卫只比较星期，不区分不同周 | 既有 OPTIONAL；Store 可复现，当前 GUI 无直接跨周拖放，不声称 GUI/真实 HTTP 已复现 |
| O8 | Service Subject | 同用户同名学科的并发创建仅查后存，无数据库唯一约束/共用锁 | reviewer接受代码交错候选；可能并发落重复名称，未动态复现 |
| O9 | Profile 偏好 | 12 项有控件和保存值，但未接通业务效果 | 既有 OPTIONAL，详见下表；按用户当前要求保留，不能顺手实现已取消功能 |
| F3 | PC 复习 / OPTIONAL，交付范围相关 | 时间轴旧自动复习生成器没接现行 ReviewState；PC页面也未消费due/history | 真实mapper harness为0，断链事实成立；现行候选版本评分/SKIP责任在Mobile/Tablet，不据此要求新增PC评分界面 |

F3 处理边界：PC“查看和管理”的展示范围需要明确后使用现行 ReviewState，或退役失效生成器；不恢复 KB.reviewAt，不把普通 Task 完成自动当成复习评分。该项因 PC 本期执行范围未明确，主 Agent接受 reviewer 的 OPTIONAL / 范围相关定级；这不代表现有自动生成器有效。

### 12 项无业务效果的设置

| 分类 | 项目 | 当前情况 |
| --- | --- | --- |
| 显示 | 紧凑布局、界面语言、基础字号 | 保存值/局部 class 或变量，未形成全局效果 |
| 提醒 | 任务提醒、专注完成通知 | 未接通对应通知 |
| 自动化 | 自动生成概览、AI 自动标签、AI 自动总结 | 业务不消费这些开关；后两项不要求恢复已移除的知识块字段 |
| 同步 | 自动同步、仅 Wi-Fi 同步 | 后台同步不按这些值启停/限制网络 |
| AI / 诊断 | RAG 语义检索、诊断日志 | 未接入对应策略/日志行为 |

深色模式与“立即同步”有效，不计入上述 12 项。

## PC 页面功能矩阵

以下“实现存在”不代表 GUI/真实服务业务验收通过。

| 页面 | 已存在的主功能 | 当前主要缺口 / 边界 |
| --- | --- | --- |
| 登录 `/login` | 登录/注册表单、Auth Store/API | 用户要求最后完善；找回密码/条款尚未开放 |
| 首页 `/` | 日期及日周视图、学科切换、知识块查看、任务创建/完成/取消排期 | 部分任务写失败无可见反馈 |
| 学科大厅 `/subjects` | 搜索、新建、编辑、删除学科 | 删除失败反馈；编辑保存已修，不重开 |
| 学科工作区 `/subject/:id` | 文件/大纲/预览、知识块编辑、任务、AI伴读与选中文本引用、文件和学科 Overview | 普通知识块/任务写失败反馈；文件链路和外部 Provider 待真实验收 |
| 资产库 `/asset` | 本地资料树、搜索、上传、预览、知识块/任务编辑、关系图 | F1 导入账号隔离；真实原生文件/大文件/快速切换待验收 |
| 时间轴 `/timeline` | 日周排期、待办导入、拖放插入/交换、自动完成 | F3 复习生成器断链且范围相关；O6/O7 为既有显示/守卫项；最近三项放置交换修复仍保留 |
| 专注 `/pomodoro` | 任务/自由专注、开始/暂停/继续/中断、实际秒累计、自然完成轮次、今日记录 | 本地和服务实现存在，真实关闭重启、账号切换、同步重放待验收 |
| 个人空间 `/profile` | 资料头像、密码、会话、统计、设置、导出、缓存与同步操作 | F4 统计口径；O1/O5/O9；部分操作仍待 GUI/服务验收 |
| 公共搜索与后台运行 | 本地知识块搜索、Dashboard详情跳转、解析与同步宿主 | O2/O3；F1 账号边界 |

## Service 能力矩阵

| 模块 | 当前实现 | 未完善 / 验收边界 |
| --- | --- | --- |
| Identity / Profile / Session | 注册登录、refresh/撤销、资料头像/密码、会话、异步删除账户 | G1 时间精度测试失败；PC 最终登录业务有意暂缓 |
| Subject / Knowledge / Task / Relation | owner隔离、CRUD/软删除/恢复、版本、级联；排期插入/交换/完整截止 | O8 并发同名；当前完整流程仍需 PC 真环境验收 |
| Source / Asset | 上传凭证/完成/下载、Source软删恢复/reingest、保留期清理 | F2 restore/cleanup 并发；真实故障恢复待验收 |
| ParsedDocument / Indexing | 接收/校验解析载荷、revision/lease/attempt围栏、重试、向量索引 | 真文件/Tauri/MinIO/Embedding联合验收未完成 |
| Sync | 独立mutation事务、幂等、push/pull/snapshot、cursor/tombstone与设备归属 | PC F1错误凭据组合；Service已有资源owner隔离正确，真实双设备/弱网待验收 |
| AI / RAG / BYOK | 模型设置/连接检查、conversation、SSE、范围检索、选中文本 | 外部 Provider、内容质量、UI故障恢复待验收；Suggestions按要求隐藏 |
| Overview results | 完整成功结果独立持久化、版本/幂等、源revision/manifest保护 | PC消费与同步实现存在，真实两设备成果一致待验收；其他端UI不属于本轮审计 |
| Review / Stats / Focus | due/评分/SKIP/history、专注幂等记录、服务端统计 | PC F3未接due查看/管理；不要求新增PC评分页；F4为PC显示口径 |
| Realtime | 一次性ticket、WebSocket、提交后通知 | 当前单进程事件；跨实例broker在候选版本范围外，PC真实网络/重连待验收 |

## 实际命令验证

日期均为 2026-10-07。PC执行目录 `D:/CodeBase/Active/Auralis/Auralis-PC`，Service执行目录 `D:/CodeBase/Active/Auralis/Auralis-Server`。

| 命令 | 退出码 / 结果 | 证明范围 |
| --- | --- | --- |
| `npm.cmd run type-check` | 0 | 当前 Vue/TS 类型检查 |
| `npm.cmd run check:subject-icons` | 0 | 当前学科图标契约 |
| `npm.cmd run check:subject-workspace` | 0 | 当前学科工作区静态契约 |
| `npm.cmd run test:r4-pc` | 0，542/542 | 现有PC自动回归；没有覆盖所有新发现 |
| `./mvnw.cmd -B -ntp clean test` | 1，387项 / 385通过 / 2失败 / 0 error / 0 skip | 当前fresh compile；PostgreSQL/pgvector和MinIO容器集成实际运行；不是全量通过 |

数据链路专项：Assets 93/93、Documents 108/108、native parsed 6/6、Focus 7/7、Overview 94/94、Sync/Repository 37/37，退出均0。它们与542项全量有重叠，不能相加。完整选择器与日志见执行报告。账号/Review harness 退出0表示复现缺陷成立，不表示修复通过。

本轮不重跑PC构建；此前末版源码构建通过，本轮源码未修改。没有 Antigravity 实现、提交、部署或真实业务验收。

## 执行报告和限制

- 页面与普通操作：`C:/Users/Gnasche/AppData/Local/Temp/auralis-pc-function-audit-20261007/pc-function-audit.md`。
- 数据链路：`C:/Users/Gnasche/AppData/Local/Temp/auralis-pc-dataflow-audit-20261007/pc-dataflow-audit.md`，日志/复现在同目录。
- Service：`C:/Users/Gnasche/AppData/Local/Temp/auralis-service-function-audit-20261007/service-audit-report.md`。
- 唯一 reviewer：`C:/Users/Gnasche/AppData/Local/Temp/auralis-function-audit-reviewer-20261007.md`。Luna 极高思考，只读、不修改仓库、不重复PC/Maven全量门禁；本轮1 BLOCKER、2 IMPORTANT，其他依上述范围分组。

三项执行审计使用 Luna 极高思考：PC页面/用户操作，PC文件/解析/同步/Focus/Overview，Service功能/全量测试/失败归因。主 Agent核对报告、实际日志和高风险边界，不重复普通门禁。只读检查没有使用 Antigravity 代码生成。

增强账号复现实际命令：`node --experimental-strip-types C:/Users/Gnasche/AppData/Local/Temp/auralis-pc-dataflow-audit-20261007/logout-login-subject-sync-repro.mjs`，cwd仓库根，退出0；stdout/meta同名。其余复现及常规PC命令的完整元数据、Maven输出分别在以上目录。本报告保留结论与关键定位，TEMP文件用于追溯实际命令。

未覆盖：真实Tauri GUI/SQLite插件/Keyring与跨重启持久化，PDF/PPT/DOC扫描与OCR全过程，真实断网续传/401重登/WebSocket消费，生产MinIO保留清理，真实Provider，双设备离线冲突/删除/reset恢复。现有代码与自动测试不能替代这些验收。

现有登记的具体目标端验收还包括 Auth rehydration/登录守卫停启、Vite产物与Tauri预览、关系图手势/选择，以及近期截止/拖放/知识块/计时胶囊/LaTeX交互。历史 `P1-PC-Task-Scheduling-Atomicity` 的2026-09-03失败描述与最新2026-10-07关闭记录冲突；本报告按最新实际实现/验证判断，不将旧失败当成现存缺陷。

## 工作树保护与回写

- 本轮只追加本报告及 `docs/README.md`、`docs/current/Status.md`、`docs/current/IssuesAndReview.md` 的审计登记；没有源码、测试、配置、契约、依赖或发布操作。
- 对照本轮开始快照，160 个范围外既有修改/未跟踪文件 SHA-256 一致；原 Home/Settings 删除仍保留。三份更新文档的既有正文完整保留，新增状态项只有本报告；HEAD `ed08697c195aefe593e456c5f58802f8f5b39a85` 未变，index 为空。
- 实际保护核对及文档 `git diff --check` 退出0；证据 `C:/Users/Gnasche/AppData/Local/Temp/auralis-function-audit-protection-20261007.json`，基线目录 `auralis-function-audit-baseline-20261007`。使用 `git status --short --untracked-files=all` 对齐基线格式，避免把未跟踪目录折叠误判为文件增删。

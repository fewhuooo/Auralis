# Auralis 当前状态

更新时间：2026-09-04

文档状态：现行状态快照

权威范围：当前代码存在情况、本轮命令证据、人工验收边界与下一步

事实来源：模块/契约文档、当前代码盘点、部署测试前主任务清单与本轮验证命令

## 证据规则

- **代码确认**仅说明实现存在。
- **本轮命令**只记录本任务实际执行结果。
- **历史命令**可在 Changelog 追溯，不能当作本轮结果。
- **人工验收**必须单列设备、GUI 或外部服务边界。

## 首个候选版本范围基线（R0-01）

目标端已冻结为 Windows x64 PC Tauri、Mobile H5、微信小程序和 Tablet 主工作区；PC Web 只保留 Tauri 内部开发用途，不作为发布目标。候选主流程为注册登录、资料上传、学习工作区、同步、复习、统计和 AI 对话；Tablet 手写笔记云同步、微信之外的其它小程序平台、旧 Server 数据自动迁移、跨实例事件 Broker、AI 自动执行领域写操作不进入本候选版本。

验收责任按角色分工：产品/业务验收负责范围和用户结果，后端/基础设施负责 API、数据、安全与真实依赖证据，PC/Tauri 与 Mobile/Tablet 负责人负责端侧主流程，QA/发布负责证据汇总和门禁判断。当前仅完成范围基线写入，未因此把任何模块或风险状态改写为“已验收”。详细验收结果见[产品需求](../project/ProductRequirements.md)和[部署测试前主任务清单](../planning/PreDeploymentReadinessTasks.md)。

## 状态总览

2026-09-04 学科文件删除投影修复：`useSourceStore.deleteSourceFile()` 先持久化 Source tombstone 与 DELETE outbox，再立即从 `sources/activeSourceFiles` 移除；后台同步与 parser/job/cache 清理不再阻塞列表、计数或选中项回退。`r4-file-preview` 删除顺序回归 20/20 通过。真实 Tauri 中 OCR 运行时删除、缓存清理和重新打开学科后的同步仍待 GUI/Server 联调验收；组合运行的 `r4-register-file` 另有两项既有 Task/Subject 静态断言失败，未归因于本次 Source 删除修复。

2026-09-04 文件预览切换性能补充：实际学科页走 `FilePreview`，而非旧 `PdfViewer`；此前每次选择均完整下载 Blob，旧请求只忽略结果而继续占用下载与内存。本轮以 80ms 选择合并和 `AbortController` 中断被替代的 fetch，确保只有最后一次选择进入 Blob/File Viewer 解析。`r4-file-preview` 19/19 通过；真实 Tauri 大 PDF 的首开解析仍需 GUI 验收。

2026-09-04 PDF 快速切换稳定性修复：`PdfViewer` 保持 `convertFileSrc` URL 加载，不经 Tauri command IPC 传递整份二进制；每次切换递增加载代际、取消旧 loading/render 任务、销毁旧 PDF.js document 并将旧 Canvas 清零。旧异步结果不会覆盖当前文件，首屏仅按适配宽度渲染一次。`r4-pdf-viewer-switch` 3/3 通过。`npm run type-check` 本轮被当前工作树 Timeline 残留的 `Subject.color`（3 处）及未使用 `Sparkles` 导入阻断，未将其记为 PDF 修复失败；真实 Tauri 大 PDF 连续切换 GUI 仍待人工验收。

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
- 实现边界：chunk generation 原子切换和 Source 删除过滤已完成；ingestion lease fencing、Suggestions 真实 LLM/citations、文件解析边界（当前仅文本型 MIME）和端到端 AI 质量仍未完成并继续登记为未关闭风险。

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

## 本轮验证结论（2026-08-23）

- PC SubjectWorkspace 已将总结从原文件预览容器拆为独立 `· 总结.md` 虚拟文件项；原文件仍由 `FilePreview` 单独渲染，点击总结项显示独立 Markdown 文档并可下载。总结只由当前知识块实时生成，未新增后端 Source/Asset 持久化。
- `Auralis-PC` `npm.cmd run test:r4-pc` 93/93、`npm.cmd run type-check` 和 `npm.cmd run build` 通过；构建保留既有 File Viewer/Asset 大 chunk 与无效动态 import 非阻断警告。浏览器文件切换、Markdown 下载、深色和窄栏布局仍需人工验收。
- PC Dashboard 待办列表已修复窄宽布局：长学科徽标可收缩并省略，任务名称不再被挤到不可见。`npm.cmd run test:r4-pc` 94/94、`npm.cmd run type-check`、`npm.cmd run check:r4-pc`（60 个生产文件）通过；浏览器缩放和真实长名称仍需人工走查。

## 阅读与回写

- 风险、优先级、关闭条件：[问题和审查](IssuesAndReview.md)
- 未来任务：[计划入口](../planning/README.md)
- 构建/部署：[部署指南](../operations/Deployment.md)
- 已发生变化：[Changelog](../release/Changelog.md)

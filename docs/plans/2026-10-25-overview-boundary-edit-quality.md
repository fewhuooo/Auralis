# Overview 独立分段与边界编辑实施计划

日期：2026-10-25（香港时间）

状态：2026-10-26阅读区与EDIT输入收敛已实现，干净编译、分批定向验证及唯一只读审查完成，B0/I0/O0。本轮未部署、未完成真实内容质量验收；先前轮次证据保留。

## 目标

以完整原文为输入，经独立分批索引选取主题、材料用途分类和主题路由后独立写作；全部分段完成后，一次读取成稿标题/小标题、首尾块轻量视图和导航结构参考，返回边界补丁与ALL导读。完整正文保留在程序快照中校验和应用。总览尽量减少遗漏，不承诺替代原文；未选材料保留在原资料中，不要求索引逐单元点名覆盖。中间核心教学内容不由模型重新输出。NAVIGATION仅用于路由和导读参考、不装配阅读小节；空章清理，整份没有BODY写作组则明确失败且不进入EDIT。背景默认不进入生成总览，原始资料保留。

## 2026-10-26 追加：阅读区与EDIT轻量视图

- 移除导航原文阅读小节，导航主题chapterTitle/title/summary作为navigationContext参考；混合BODY/NAV来源关系保留。过滤后空章跳过，provenance路径依最终章节重排。全NAV在Writer计划前返回既有MUTATION_REJECTED，说明没有可生成正文，不调用EDIT或返回空章节。
- 完整Snapshot与apply/缓存校验保持。模型输入改用promptView，包含分段身份和hash、真实标题/小标题及去重首尾块；不序列化中间正文及其中间块metadata。单段首尾合并，两段各一项，原kind限制保持；模型可见范围不等于完整Snapshot。受限术语替换继续在完整Snapshot应用，不要求模型报告词项出现次数。
- Writer一套规则适用于单批和拆分：父级plannedChapter/plannedSection/writingGoal仅定位，originalTextUnits决定范围与深度，不补写本批没有证据的概念，不为凑父目标补宏观开场总结。INDEX提示尽量提取全部实质主要/次要主题和重要区别，Java合法子集宽校验不变。
- Guide仅根据实际成稿可见证据介绍内容和顺序，导航、INDEX摘要和writingGoal不能证明某知识已被讲授。没有新增模型摘要、固定压缩比、full/compact回退、EDIT修复、API字段或存储；OUTLINE和SUMMARY产品定位不改。
- 算法overview-adaptive-v10-body-reading-boundary-view隔离旧中间计划，原资料与既有成功/正式结果不删除。源码范围是Service、BoundaryEditor及两类紧邻测试；Recovery测试未改。
- 验证：fresh candidate 578/578文件hash一致，test-compile通过；首轮124项中Adaptive76有2项文案/fixture失败，BoundaryEditor15、Recovery30、AiSchema3全部通过，无error/skip；修正后仅这2方法复验2/2。不称124项一次全绿。唯一reviewer B0/I0/O0，未重复跑检查。
- 证据D:/Temp/auralis-overview-reading-edit-20261026/：baseline、gate/handoff.md、gate/final-hash-manifest.tsv、review.md。未跑package/full，未部署、未调用真实模型或写业务库，真实质量与Token变化仍待验收。

## 2026-10-26 追加：索引契约与提示词减量

- 已实施：INDEX严格结构、summary=null、角色配对和引用授权为共同成功判据；主响应/既有JSON修复均不可绕过。索引允许非空合法子集，删除专用INDEX_COVERAGE调用及其提示词/payload，不再为补齐原文编号重调模型。
- 已实施：INDEX、metadata、route及其恢复/分桶输入的instruction为空；Writer/EDIT保留受阶段规则约束的顶层用户偏好。资料内嵌指令不作命令。JSON修复使用自适应公共规则与allowedUnitAliases，不添加原始materials。
- 已实施：Writer提示词移除writerInputRanges；既有批次对象、manifest和step身份继续精确绑定来源范围。新算法overview-adaptive-v10-selected-index-local-writer-ranges隔离不匹配的旧中间计划，不新增存储或旧版本兼容，不清缓存。
- 边界：EDIT、Advisory、分片编号、预算和metadata/bucket架构保持；未调用真实模型、部署或写业务库。原资料、SUCCESS及正式结果保留。
- 验证：干净编译380生产/149测试源码；初轮108项为103通过/5断言失败，随后4个Adaptive方法和1个Recovery方法分别复验通过，不称108项一次全绿。唯一审查指出的INDEX非null summary接受问题最小修复后，8个受影响方法8/8。Recovery使用隔离PostgreSQL；本轮未跑package或全量后端。
- 证据：D:/Temp/auralis-overview-contract-trim-20261026/，含baseline、gate/final-evidence-summary.md、gate/review-summary-null-delta.md、差量hash和review.md。同一reviewer最终B0/I0；Service最终净减少73行。下方旧轮次记录保留其当时的验证与环境限制，不覆盖本轮事实。

依据：本次实际1.pdf及生成结果质量证据 `D:/Temp/auralis-generation-quality-20261025/`，确认原PDF50页、正文止于书内第24页；SUCCESS与正式结果已有记录保留。授权设计见同目录 `内容质量方案草案.md`。

## 交付步骤

1. 保存工作树基线及相关文件原始后像，保护272项既有改动。实施仅涉及后端Overview、紧邻估算器及测试与现行文档；无前端、生产配置、密钥、迁移或业务库写入。
2. 在现有索引调用内引入可校验的主题来源用途。明确具体定义/解释/例子与章节预告边界；删除索引和Writer的跨批原文、摘要及已生成内容提示。正文主题主归属、导航结构参考、背景过滤沿现有索引/metadata/路由保存来源与处理去向，不把导航原文加入阅读小节。
3. 实现纯程序边界补丁引擎：不可变分段/块身份及hash、严格JSON、标题和获准首尾编辑、受控字面术语替换、保护代码/公式/表格/引用、快照上的一次性非级联替换、全量校验后原子应用。已有正文和来源不得被越界修改。
4. 将独立patch+guide purpose接入现有Gateway/Guard、预算根、Source/revision围栏与checkpoint。ALL一次返回导读，OUTLINE无导读，SUMMARY原语义保留。使用真实完整序列化消息评估容量，复用已有有限输出与私有payload保护，不临时新增固定最大兜底值，不重写全文、不新增逐节模型审查。
5. 按现有精确provider/endpoint/model profile机制实现ASCII/非ASCII候选估算及离线trace校准证据。系数0.35/0.45仅是候选；规划与Gateway一致。未知身份或不支持输入不误用校准profile，不以经验公式宣称绝对安全。记录字符门槛等独立容量限制的影响。
6. 全部编辑完成后，单一执行者在D盘隔离候选逐文件校对hash，集中执行静态检查、相关测试；估算公共配置/Guard行为有实际变化时按BeforeCoding矩阵执行后端full与package。所有测试使用替身或隔离测试资源，不接业务服务。失败统一归因，同根因最多重试3次，只复验受影响范围。
7. 一位Luna high reviewer对本任务基线差量只读审查；只处理BLOCKER/IMPORTANT。完成文档回写和最终交接，真实Provider、GUI、部署及内容质量留待用户验收。

## 执行分工与文件所有权

- 主模型：计划、任务边界、补丁与来源/缓存高风险裁决、最终验收及文档同步。
- pipeline执行者（Luna high）：OverviewGenerationService/Pipeline/Formatter接线及其紧邻集成测试；最终统一验证。不得覆盖其他执行者的文件。
- patch执行者（Luna high）：独立OverviewBoundaryEditor及其纯单元测试。与pipeline执行者先确定接口，不修改Service或估算器。
- estimator执行者（Luna high）：AiInputTokenEstimator、必要profile配置与专属测试及离线校准报告。不修改OverviewGenerationService或patch引擎。
- 唯一reviewer（Luna high）：所有实现完成及集中验证之后再启动，不写文件、不另派reviewer。

## 验收点

- 章节预告不能建立独立教学主题；主题来源用途可校验且经过metadata归并不丢失；背景不强制生成，导航不调用Writer或形成原文阅读块；无BODY写作组明确失败，空章和provenance路径正确清理重排。
- 各批输入不包含相邻批原文/摘要/生成正文；核心知识的重复由路由职责解决。
- 补丁严格绑定snapshot/segment/block；未知ID、hash错配、重复键、越界或重叠编辑拒绝；失败无部分结果，恢复不重复叠加。
- 首尾含实质知识时保留；受保护Markdown块不能术语替换或被删除；正文变化能归因到获准补丁/字面替换位置；来源保持绑定。
- final调用只输出patch/guide；完整正文保留程序侧，模型读取成稿标题/小标题和首尾轻量视图。短小节首尾覆盖全部内容时去重，不任意截断段落或按固定比例压缩。输入过大或输出截断仍明确失败并保留已完成分段，不能强压缩为成功。
- 同一profile用于规划/Guard；trace校准无真实Provider调用；既有JSON窄恢复、hash、cache顺序与预算围栏保留。
- 程序统一最终片段编号，标题与首段共同入片；公开Overview及PC保存入口维持现有契约，若有必要连带变化须明确回写。

## 证据与当前进度

证据根：`D:/Temp/auralis-overview-boundary-edit-20261025/`。基线status、diff-stat、相关原文件副本和SHA-256已保存。

- [x] 用户批准设计与执行。
- [x] 恢复指令、检查现行文档并保存基线。
- [x] 独立索引/用途/路由/patch调用接线。
- [x] 补丁引擎、专属单测及受影响复验。
- [x] 分类估算profile及Java实际trace离线验证。
- [x] D盘候选hash一致、可运行范围的分批验证及打包。
- [x] 唯一只读审查与同reviewer差量关闭B0/I0。
- [x] 现行文档、验证范围及剩余人工验收回写。
- [ ] Docker依赖的17个PG/MinIO集成类（引擎管道不存在，未自动启动引擎）。
- [ ] 部署、真实Provider、GUI及内容质量验收（本轮未授权执行）。

未执行：真实模型、部署、业务库写入、清缓存、Antigravity、浏览器自动化。各模块固定最大兜底限值仍由用户最后统一设定。

估算实施约定：新增显式选择的 `mimo-byte-category-candidate`，只绑定官方MiMo endpoint与 `mimo-v2.6-flash`；默认仍为 `legacy-bytes`，不改本机 `.env`。含风险字符/结构或不支持的身份按既有保守路径处理。以Java实际trace replay为准：86个用量配对、1个失败不可用，24个留出调用中16个启用候选且无低估；估算166080、actual input 54684、legacy estimate 207108。该证据限于当前资料与模型样本。Python镜像支持数17属于初步分析，未完整实现Java的字符形态回退，不能替代Java结果。

## 验证与审查结果（2026-10-26）

最终候选Auralis-Server 578个文件与工作树hash一致。初始干净javac编译380个生产/149个测试源码；实现/测试契约错误按失败归因处理后，Adaptive/Schema 79/79、MiMo trace replay 1/1分别通过。

受限后端批次：821项，0 failures / 2 errors / 2 skipped，exit1。两错误仅因测试未传合成TLS证书路径；配置现有测试证书后只跑affected-only慢连接类，3/3通过。跳过的两项为未传私有trace参数的DeepSeek和MiMo重放，其中MiMo已单独1/1通过。不能把该分批结果写成一次full或821项全绿。一轮已启动的广泛重跑收到停止指令后中断，其partial log不是验证证据。

唯一reviewer首审0B/2I：混合路由漏显示导航，边界前缀启发式可误开放事实段落。原执行者最小修复后，Adaptive 76/76、BoundaryEditor 12/12、AiSchema 3/3共91/91，exit0；最新package skiptests exit0。同一reviewer仅检查修复差量和hash，最终B0/I0。没有第二位reviewer或重复全量验证。

Docker CLI存在但Linux engine pipe缺失，因此17个PG/MinIO类未运行；具体类名、命令、日志、跳过原因与TLS证书hash见 `D:/Temp/auralis-overview-boundary-edit-20261025/gate/summary.md`。最新修复命令见同目录 `candidate-review-delta-affected-tests.log`、`candidate-review-delta-package.log`；审查见上级 `review.md`；最终源码hash见 `gate/final-task-owned-hashes.tsv`。

现行回写：本计划及docs/README、plans/README、Backend、API、Database、Status、IssuesAndReview和现有自适应设计。公开API shape、数据库schema、PC/Mobile入口未改；未运行OpenAPI/SDK生成、前端检查或GUI，因为本轮未改变相应代码/shape。没有部署、真实模型调用、业务库写入或缓存删除。

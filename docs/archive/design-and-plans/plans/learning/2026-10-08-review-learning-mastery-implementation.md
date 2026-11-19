# 学科复习、学习与掌握退出实施记录

状态：代码、相关自动验证与唯一只读审查通过；GUI/Tauri、真实HTTP、多设备联机与生产迁移待验收。主仓库未提交、暂存或部署。

设计入口：[已批准整体设计](2026-10-08-review-learning-mastery-design.md)。本记录承接新机制；此前学科页与两按钮实现证据仍保留原证明范围。

## 1. 工作树与职责

- 分支 `codex/subject-review-stats`，起始 HEAD `ed08697c195aefe593e456c5f58802f8f5b39a85`；主仓库不提交、暂存、部署或操作业务数据。
- 完整基线 `C:/Users/Gnasche/AppData/Local/Temp/auralis-review-learning-mastery-implementation-20261008/manifest.json`，1050文件原文及哈希；既有 Home/Settings 两项删除与空索引保留。
- Service 执行 Agent：Review 生命周期、最小正文失效钩子、统计、V29迁移、专项测试、OpenAPI与两端生成schema。
- PC 执行 Agent：现有 API/Review Store/Stats Store、两Pane必要流程、作用域恢复与专项测试。保留用户布局与范围外代码。
- Antigravity Gemini 3.1 Pro High：业务完成并冻结后，仅两个Pane scoped CSS的配色。先计划，再在当前前端TEMP镜像的隔离工作树实施；主仓库不用于隔离提交。
- 主 Agent：接口裁决、文档、完整差分/范围核对及最终验收。仅一个只读 reviewer，必要问题回同一执行 Agent 最小修复。

## 2. 已确定的命令协议

以下为双方执行交接协议，完成后以 [API](../../contracts/API.md)、[Database](../../contracts/Database.md) 与运行时 OpenAPI 为契约事实。

| POST路径 | 额外字段 | 作用 |
| --- | --- | --- |
| `/api/reviews/lifecycle/learning-completions` | `reviewId?` | 独立学习完成，首次3天、重新学习10分钟 |
| `/api/reviews/lifecycle/attempts` | `reviewId`、`rating`、`durationSeconds?` | 初选立即调度 |
| `/api/reviews/lifecycle/attempts/{reviewId}/confirmations` | 无 | 核对通过，确认原反馈 |
| `/api/reviews/lifecycle/attempts/{reviewId}/corrections` | 无 | 同次反馈纠正为AGAIN |
| `/api/reviews/lifecycle/learning-reopens` | `reviewId?` | 明确重学或同链再次失败 |

请求共同字段为 `clientCommandId`、`knowledgeBlockId`、`knowledgeBlockVersion`、`contentHash`、`baseVersion`；日期由服务端Clock决定。contentHash是实际回忆正文原字符串UTF-8的SHA-256小写64位hex，不做trim、Unicode或换行归一化，服务端在KB锁后核对。成功返回完整非空state及冻结回执。原states/due返回扩展状态。

新历史 `/api/reviews/lifecycle/history?knowledgeBlockId=...` 返回 `{knowledgeBlockId,knowledgeBlockVersion,state,commands,effectiveReviews}`，state无记录可空。commands按occurredAt/commandId升序保存每个不可变操作；effectiveReviews按selectedAt/reviewId升序保存初选和最终有效反馈，尚未核对的GOOD/HARD有效反馈可空。该接口仅新协议审计；PC与原 `/history` 事件合并显示，不将每条命令都计作正式复习。

扩展状态包括 `knowledgeBlockVersion`、`needsLearning`、`mastered`、`stableSuccessCount`、`nextReviewStage`、`lastPracticeAt`、`lastReviewId`、`pendingReviewId`、nullable `contentHash`。状态version保留JPA乐观版本；缺状态的首次创建使用0，但0不作为“无状态”的唯一判据。命令响应effectiveReview与history共用 `selectedRating/effectiveRating` 字段；history的未确认失效结果为SUPERSEDED，不计完成。

同命令ID、同载荷精确重放；改变载荷拒绝 `MUTATION_REJECTED`。资源版本或内容资格变化拒绝 `RESOURCE_VERSION_CONFLICT`。重放也必须验证当前活动资源与内容资格，不能把已删除或已改正文的旧成功重新安装到PC。

## 3. 已关闭的代码与自动验证边界

下列勾选表示代码及相关自动验证/审查闭环；真实环境边界见第7节，不代表已完成人工业务验收。

- [x] 初选、确认、纠正审计关联同一reviewId，最终统计计一次；GOOD/HARD未确认不计已完成。
- [x] 初选快照作为纠正调度基准；确认不移动初选锚点，纠正与学习完成各使用实际发生时间。
- [x] 首次学习、重新学习、正式复习分开；10分钟回忆不推进跨天次数，3/7/14/30天与最终核对毕业真实落库。
- [x] HARD组末标记仅一次；确认HARD后可纠正，AGAIN学习后再次失败可重新打开学习且不重复失败计数。
- [x] 同账号知识块父行锁后状态锁，序列化缺状态创建、复习命令与正文失效；保留JPA版本。
- [x] 正文实质变化解除掌握/清零稳定进度；元信息修改保留；PC未同步正文不得按旧服务端版本正式评分。
- [x] 新legacy评分失效旧因果链并维护新标记；旧事件精确重放保留原after_state，不增加新练习。
- [x] 三态互斥且和为活动KB；dueReviewCount为reviewing到期子集。趋势组合旧事件和新有效结果，学习完成独立计数。
- [x] 本机切页面与切学科保留轮次；账号/会话变化、删除、移学科、旧响应及未知提交结果受当前票据保护。

## 4. 实施与证据进度

| 阶段 | 当前状态 | 证据位置 |
| --- | --- | --- |
| 现有代码/工作树基线 | 已保存；PC旧功能专项41/41 | 基线manifest；`pc-evidence/baseline-review-stats-focused.*` |
| Service RED与实现 | 需求端点404及专属三档schema RED成立；首批相关25/25、OpenAPI导出9/9；必要修复后当前V29 Lifecycle/legacy/schema H2 14/14。Service最终冻结；诊断失败日志保留 | `service-evidence/service-review-lifecycle-final-focused-20261008.log`、`service-lifecycle-openapi-green2-export-20261008.log`、`service-parameter-set-h2-migration-regression-20261008.log` |
| PostgreSQL迁移与竞争 | 首批PG17迁移29/29、同KB首学及原锁2/2；末期移动栅栏、跨Subject参数初始化、V28已有参数升级三个定向各1/1，当前V29空库与升级均验证。各版本证明范围分别记录 | `service-evidence/service-postgres-first-learning-race-20261008.log`及下方新增案例日志 |
| 两端生成契约 | PC调用既有脚本-SkipExport生成；完整check-openapi退出0，运行时9/9及两端schema一致。默认export与Service clean重叠失败保留为共享target竞态，随后独立export成功 | PC/Mobile schema SHA256 `B54E2E8893156EF3CB567E7A284D3E034ECB93BA4F46F6C3DB36EC210B7644D7`；`pc-evidence/` |
| PC RED与实现 | API/Pinia/实际Pane RED→GREEN；移除KB、FUZZY直接失败与旧冻结回放保护通过。队列顺序、手动未来入口、不同/相同reviewId、正文失效、legacy/history交错必要修复后最终联合专项63/63 | `pc-evidence/lifecycle-core-red.*`、`lifecycle-core-green1.*`、`lifecycle-pc-final-gates.txt` |
| Antigravity计划 | 实际plan调用已返回；实际当前CSS存在warning与danger令牌 | `antigravity-evidence/` |
| Antigravity配色实施 | 实际delegate及同模型两次有界补修完成；完整差分和范围验证exit0。已仅替主仓库两个style body，业务前后文/批准样式哈希均匹配；依赖/全局变量/删除/跨模块保持 | `antigravity-evidence/final-collected.json`、`palette-final-normalized.diff`、`approved-palette.json`、`applied-palette.json`；delegate `2969b6843098`，补修 `e628390ec92b` / `66055e525039` |
| 最终相关门槛 | PC63/63、type/两项静态/最后build exit0；Service/PG/OpenAPI结果见上方及下方实际命令。未重复全量Server | 执行Agent日志、最后哈希；范围审计`final-scope-verification.json` |
| 单一只读审查 | 六项IMPORTANT经最小修复关闭；最终BLOCKER=0、IMPORTANT=0、OPTIONAL=0。没有重复已充分证明的门槛，也未派生reviewer | `baseline/reviewer-report.md`及执行Agent实际日志 |
| 真实验收 | 待验收 | GUI/Tauri、真实HTTP、双设备与生产迁移单列 |

执行 Agent 必须保留完整cwd、命令、退出码、关键输出和实际范围。原全量迁移断言V21/V28失败不在本次范围，不能隐藏或擅自改旧迁移测试。相关门槛及风险关闭后停止可选扩大测试。

### Service实际命令

以下均在 `D:/CodeBase/Active/Auralis/Auralis-Server`，日期2026-10-08：

| 命令 | 结果 | 证明范围 |
| --- | --- | --- |
| `.\mvnw.cmd -B -ntp clean '-Dtest=ReviewLifecycleServiceTests,ReviewServiceTests,SubjectReviewQueryTests,SubjectStatsTests,OpenApiArtifactTests' test` | exit0；25/25，0failure/error | 新生命周期9、legacy Review3、学科查询2、统计2、OpenAPI9；不是全量Server门槛 |
| `.\mvnw.cmd -B -ntp clean '-Dtest=OpenApiArtifactTests' '-Dauralis.openapi.export=true' test` | exit0；9/9 | 实际运行时OpenAPI导出与三值enum/nullability字段断言 |
| `.\mvnw.cmd -B -ntp clean '-Dtest=SubjectLockCoordinatorPostgresIntegrationTests' '-Dauralis.postgres.it=true' test` | exit0；2/2 | PG17临时空库V1→V29及真实Service锁序竞争；未触碰业务数据库 |

新竞争案例沿Subject→KB→state锁序，两笔不同clientCommandId首次completion；等待点为首个Subject父行，首事务同时保有真实KB父行锁。`pg_blocking_pids`确认数据库等待关系后释放，最终仅1个state与1条LEARNING_COMPLETED命令。没有另跑正文编辑与复习并发案例；正文失效由H2行为测试和当前事务代码证明，真实多设备与HTTP仍单列验收。

### 审查反馈与最小修复

- 自动队列原先沿本地资源ID顺序，未按dueAt排序。真实Store RED后保留学习项原序、到期复习升序；未来项通过独立“提前练习”选择入口进入手动队列，未同步、待学习和已掌握项不混入。Store与真实Pane/API用例RED→GREEN；上述59项门槛覆盖此两项。
- 移动学科与复习写入交错：一参KB helper先读旧Subject再加锁，若中间移动提交而请求携带移动后版本/hash，旧实现可能在未持有新Subject锁的情况下写入state。临时PG受控RED观察state=1；最小修复复用现有expectedSubjectId重载，锁后重读不匹配即RESOURCE_VERSION_CONFLICT，GREEN观察state/command均0。legacy Review共用同一helper。
- 该PG新增方法命令为 `.\mvnw.cmd -B -ntp clean '-Dtest=SubjectLockCoordinatorPostgresIntegrationTests#lifecycleRejectsKnowledgeBlockMovedAfterInitialSubjectRead' '-Dauralis.postgres.it=true' test`：RED exit1（香港16:35:50–16:36:13），GREEN exit0、1/1（16:36:58–16:37:21）；日志 `service-subject-move-lock-red-clean-20261008.log` 与 `service-subject-move-lock-green-clean-20261008.log`。随后 `.\mvnw.cmd -B -ntp '-Dtest=ReviewLifecycleServiceTests,ReviewServiceTests' test` exit0、12/12（16:37:34–16:37:49）。cwd仍为上方Server目录。未重复完整PG或Server；此前2/2为修复前版本证据，本次修复后PG仅新增方法1/1。
- clean前增量RED出现stale target的PostgreSQLContainer缺类，增量GREEN出现JDT生成的JpaRepository未解析类；诊断日志保留，不用作行为RED/GREEN证据。接口、SDK与POM无新增变化，helper/test diff-check通过，同一只读reviewer已复核该修复。
- 跨Subject首次学习初始化全局参数：两个真实PG事务都查空后释放屏障，旧实现其中一个发生SQLSTATE23505固定参数主键冲突。尚未发布的V29预置FSRS_LITE/1，沿用现有默认UUID `d9926433-88cf-3779-bf8f-f57bf578276c` 和JSON；两个首学请求均成功且共用1参数行。V28已有随机ID/自定义JSON的同scheduler/version行升级后原样保留。没有覆盖现有参数或修改legacy调度。

### 最后参数初始化修复门槛

均在上方Server cwd执行，日期2026-10-08，时间为Asia/Hong_Kong。开始时刻由日志Finished at减Maven Total time推算，不能视为外部计时的精确开始。

| 命令 | 实际结果 / 约起止 | 日志（均在service-evidence） |
| --- | --- | --- |
| `.\mvnw.cmd -B -ntp clean '-Dtest=SubjectLockCoordinatorPostgresIntegrationTests#independentFirstLearningCommandsSharePreseededParameterSetOnPostgres' '-Dauralis.postgres.it=true' test`，修复前 | exit1，1项预期RED；16:45:26.899–16:45:50，两lookup均miss且固定PK23505 | `service-parameter-set-race-red-clean3-20261008.log` |
| 同上，V29预置后 | exit0，1/1；16:46:52.052–16:47:15，PG17迁移29/29，两Subject首学成功 | `service-parameter-set-race-green-pg-20261008.log` |
| `.\mvnw.cmd -B -ntp clean '-Dtest=SubjectLockCoordinatorPostgresIntegrationTests#reviewLifecycleMigrationPreservesExistingSchedulerParameters' '-Dauralis.postgres.it=true' test` | exit0，1/1；16:47:49.897–16:48:13，隔离schema V28→已有同版本行→V29保留ID/JSON | `service-parameter-set-migration-upgrade-pg-20261008.log` |
| `.\mvnw.cmd -B -ntp '-Dtest=ReviewLifecycleServiceTests,ReviewServiceTests,ReviewStatsRealtimeSchemaTests' test` | exit0，14/14（9+3+2）；16:48:24.584–16:48:39，H2当前V29及生命周期/legacy/schema | `service-parameter-set-h2-migration-regression-20261008.log` |

更早的red-clean/red-clean2为Mockito抽象方法callRealMethod及屏障测试harness错误，不是有效产品RED，日志保留。clean3使用事务内真实JdbcTemplate查询构造交错。最后V29 SHA256 `858AAC161F426A54AC6875ECF1AF579DEA79BF955290EA4B40AC67D0F911728F`，PG测试 `1ABE28AC1E714926E61907301BFCF2901504F1459BB68328676B3A46511E9CEA`；OpenAPI/SDK/POM无变化。同一只读reviewer已复核这项修复，不重复完整Server或PG套件。

### Antigravity配色范围

- 实际模型为Gemini 3.1 Pro (High)，先计划，再delegate隔离实施，随后在同一隔离工作树完成两次明确范围的配色补修。不是仅返回建议。主仓库没有为委派创建提交。
- 最终完整逻辑差分仅两个Pane scoped CSS中的颜色值：Sage用于主操作、掌握进度与日历；HARD/模糊使用warning，失败danger，待学习info。背景、正文、边框与透明阴影沿用当前主题变量；固定Sage面使用现有graphite深色文字。script/template、布局、字号、阴影尺寸、依赖、生成文件、全局变量和删除保持。
- 首稿将文件换行为CRLF，原始git diff显示整文件变化；审查比较逻辑内容并单独核对样式。批准应用脚本仅替当前主仓库style body字节范围，保留之后业务修复的所有前后文与主仓库换行形式。最终样式SHA256：Review `174bd103682e9d667f28815ce86755f289a754213184a1833f126891d066494a`；Stats `efc9502ef7e85a8f489b511de24a8a7f873da62f75359989f9a704c30e879de8`。
- 范围验证实际命令为 `python C:/Users/Gnasche/AppData/Local/Temp/auralis-review-learning-mastery-implementation-20261008/verify-palette.py`，cwd `C:/Users/Gnasche/.agy-mcp/delegations/wt-adc19526`，exit0。全镜像非允许文件哈希、脚本/模板和非颜色声明保持；完整逻辑差分见上表。该检查证明修改范围，未执行GUI视觉验收。

## 5. 完成前回写

- [x] API、Database、OpenAPI与生成类型一致。
- [x] FrontendPC、Backend、Frontend设计与产品要求按实际代码回写。
- [x] Status、IssuesAndReview、Changelog登记真实证据与人工边界。
- [x] 完整快照差分核对范围外文件、依赖、删除、生成产物、HEAD及索引。
- [x] 本记录补全实际命令、审查结果、未覆盖范围及交付状态。

## 6. PC最后命令与交付哈希

以下在 `D:/CodeBase/Active/Auralis/Auralis-PC` 执行，2026-10-08，时间UTC；原始工具输出与部分RED仅保留摘录，未伪造完整stdout，详情见 `pc-evidence/lifecycle-pc-final-gates.txt`。

| 命令 | 实际结果 / 起止 |
| --- | --- |
| `node --experimental-strip-types --test scripts/r4-subject-review.test.mjs scripts/r4-subject-stats.test.mjs` | exit0，63/63；09:00:18.944–09:00:20.642 |
| `npm run type-check` | exit0，vue-tsc；09:00:18.949–09:00:24.119 |
| `npm run check:subject-icons` | exit0；08:50:05.919–08:50:06.297 |
| `npm run check:subject-workspace` | exit0；08:50:11.049–08:50:11.419 |
| `npm run build` | exit0，Vite8.0.10，renderer47/47；09:01:03.033–09:01:45.160 |
| `node --experimental-strip-types --test --test-name-pattern="reconfirmation checks lifecycle history after legacy review state clears review ids" scripts/r4-subject-review.test.mjs` | exit0，1/1；09:02:11.389–09:02:12.260 |

最后专项在真实Pinia/组件调用与API adapter中验证：已选R1被legacy替代后旧confirm清除、尚未提交的R1保持原clientCommandId重试，以及history等待期间B新选R2不会被A覆盖。mock顺序按真实Service先幂等回放再核状态版本，早期反序mock不用于产品RED证据。其前不同reviewId替代、同ID已确认或AGAIN后完成学习、正文version/hash变化均有受控RED→GREEN；旧冻结回执不倒退缓存的用例保留。

最后Store/test补修后只重复专项、type与build；两Pane template/style无新变动，两项静态沿用实际已跑记录。build输出有既有dependency外置、chunk大小和无效dynamic import警告，部分stdout被工具截断，结束成功与47/47资产明确。components.d.ts前后SHA256均 `2F80353BBE54BB912CCFE9461E657E01EE53FD27B1C2AA3B895C61B10C303106`，未增加生成差分；其此前两Pane声明属于原基线。dist未新增工作树条目。

| 最后文件 | SHA256 |
| --- | --- |
| PC useReviewStore.ts | `88437FEF3E14D35ED35FA132809EEE8809E1CA1CBA87941DC1A7454F2EDAC7AD` |
| PC r4-subject-review.test.mjs | `CB179EAC2ADB5733CCF1B7698AC94DD494E8F21B22A0C125E8C12FA10B77B1BD` |
| PC SubjectReviewPane.vue | `C97DC301EE01C3BFA1B78D7836616D8DE6997E46ACF37980458E6DDF9CEA8C1A` |
| PC SubjectStatsPane.vue | `74675870A2CFE8E0E658F65974400C2AB3C1D28A9E2A59C2B14AF24C3ACFEB87` |
| Server KnowledgeBlockService.java | `76FEC2067E2A21753685B2B7EBCE59EFC3FDC3C903091EFF2B7DD11ADA64AB9D` |
| Server V29 migration | `858AAC161F426A54AC6875ECF1AF579DEA79BF955290EA4B40AC67D0F911728F` |
| Server PG lock tests | `1ABE28AC1E714926E61907301BFCF2901504F1459BB68328676B3A46511E9CEA` |

## 7. 审查、工作树与人工边界

- 唯一只读reviewer完整核对当前Lifecycle命令/调度/幂等/内容事件/legacy桥接、父锁/迁移/FK/参数初始化、SQL统计、PC作用域/阶段/队列/冲突恢复及实际palette差分；最终0/0/0。完整报告为基线目录下 `baseline/reviewer-report.md`，本轮六项必要问题见上方修复记录及 [IssuesAndReview](../../current/IssuesAndReview.md)。
- 根代理实际 `python check-task-scope.py` 与1050文件快照比较，exit0：36修改文件、12新增文件均在批准范围，额外缺失0；依赖、全局样式、范围外用户修改、原Home/Settings删除、HEAD/分支/空索引保持。两端生成schema一致；当前两Pane style与应用前business哈希匹配。脚本、全量差分与JSON证据均保留TEMP基线，不在主仓库新增审计程序。
- 主仓库代码与文档未提交、暂存、发布或部署。新服务需要按现行部署流程重新构建并应用V29；临时PG验证不代表业务库已经迁移。
- GUI/Tauri、真实HTTP、多端联机、生产迁移演练仍未验收；正文编辑与复习同时写的PG专用竞态用例未单独执行，内容行为测试/端侧资格测试与事务代码审查已覆盖该边界。未重跑全量Server或将原TaskColor迁移门槛标为修复。
- 相关自动门槛与审查已闭环，不以构建通过替代用户业务验收，不继续可选扩大测试。

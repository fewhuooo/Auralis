# Overview M3.2：持久正文执行计划、节点状态与安全恢复

日期：2026-10-19（香港）
主模型决策；gpt-6-luna high执行/验证/唯一审查。
范围：M3.1后的可交付后端小阶段。集成当前adaptive正文执行，不新增后台claim loop、公有job/control/progress API、PC UI、发布intent或跨任务缓存。后台调度/所有阶段自动恢复为M3.3；正式发布另交付。不得把M3.2叫完整后台job能力。

## 事实及改动必要性

V32已有generation/request mapping/fence/lease/预算task/checkpoint；没有持久计划或节点状态。FAILED takeover可换profile/algorithm且保留generation/budget task，不能只按generation复用计划。当前writer通用checkpoint早于其单节/精确引用专用校验；checkpoint存在不等于节点已验证。Gateway持有真实reservation UUID但不向节点公开，任务usage聚合不能作节点重试证明。以上来自Droot/code-location-report.md；M3.1与M2代码维持冻结，只加新功能必要的局部接线，不重构。

## 执行计划与节点

1. 在adaptive最终writeGroups确定后、正文派发前保存有序计划与节点。公开SUMMARY/legacy flag path不扩展，ALL/OUTLINE启用此journal。真实Spring路径必须有journal，不增加缺表/缺服务/旧schema隐式fallback。纯算法fixture可显式mock新依赖。
2. 新增当前空闲迁移号（预计V35，先核对），私有plan/node/call关联三表，FK到generation，账号清理随generation级联。Provider I/O不进事务。
3. plan身份至少含generation、input/profile/algorithm指纹、当前mode/指令、完整有序writer descriptors及原文source/revision/chunk/generation/ordinal/hash/UTF16范围。节点descriptor包含确定性checkpoint key和实际writer prompt hash。UUID由应用生成，模型不供ID。存绑定与写作metadata，不复制原文正文/凭据。plan payload沿1Mi字符安全顶，最多500节点；generation最多8个不同plan版本，同版本幂等，不同profile/计划明确新版本并使旧版SUPERSEDED，预算仍同task。超限明确拒绝，不删除或静默替换。
4. Plan状态READY/WRITING/ASSEMBLED/SUPERSEDED（必要时FAILED/RECOVERY_REQUIRED只记录安全原因）；node状态PENDING/RUNNING/VERIFIED/FAILED/RECOVERY_REQUIRED。每次执行有递增attempt编号、当前owner/fence、当前checkpoint身份/hash、时间和安全错误标识。每节点最多8个执行attempt，每generation最多500条正文call关联（含repair），均为有限执行保护，不放宽平台财务限额。MAX500 raw、60章/500节、100 refs、1Mi结果与正文限制保持。
5. writer完整通用JSON+单节shape/精确原unit覆盖/正文验证、owner及输入复核通过后，才在fenced短事务中将node置VERIFIED，并核对该checkpoint确实同身份/同payload hash。通用未过专用检查的checkpoint不能显示为verified。完整装配与最终校验后标plan ASSEMBLED；这是私有候选，不是正式Overview result，也不写正式KB/Review。

## reservation到节点的精确关联

6. 增加用途很窄的内部invocation binding hook：Gateway reserve成功后、markDispatched及Provider I/O前，用真实reservation UUID回调绑定到当前node+attempt。回调在try范围内，失败按现有settlement释放未派发reservation并禁止Provider。先reserve事务结束，再journal短事务；不得让Gateway/usage依赖journal业务类，不加ThreadLocal/全局可变上下文，不改变Chat/Embedding/其它调用行为。
7. 正文的主调用及其JSON repair均必须经过同一绑定。可在AiTaskScope增加fail-closed的observed complete重载；Service最小传参或当前task的受限view传播到invoke递归repair，不开child task、不重置deadline/预算。现有非正文调用仍原路径。绑定幂等且校验reservation实际属于当前owner+budget task+合法Overview operation；不同node/attempt不得抢同reservation。
8. 提供窄的owner/task/reservation级只读状态查询（优先由usage公开内部查询接口承载），不从任务汇总推断节点。返回状态、requestDispatched、usage是否完整及必要安全字段，不暴露凭据/正文，不改charged或settlement。避免在generation锁内拿GLOBAL/USER账本锁造成反向锁序；binding在reserve提交后才发生，状态查询不持有用量写锁跨journal写。

## 恢复准入

9. 当前owner/fence+完整输入/profile/algorithm/plan身份才可改计划/节点；旧owner迟到写一律失败，不覆盖新状态。Source/owner输入复核沿原服务边界，journal VERIFIED仅表示对捕获修订的完整单元验证通过，不代表当前正式成果；最终来源/manifest/发布围栏仍必经原服务。
10. 恢复优先加载且完整验证匹配checkpoint，成功即复用正文/更新节点，绝不重复Provider；需要恢复checkpoint的路径必须cache-only，缺失/校验失败不得偷偷回落新调用。有效节点不因新request清空。
11. 无可信完整checkpoint时按该node过去attempt的全部精确reservation判断：从未关联reservation（hook保证dispatch前必绑定）、未派发/RELEASED、已正常COMPLETED，或可证响应已结束且actual完整的terminal失败，才可在同父预算下开启新attempt。已知COMPLETED但正文因crash未保存可以重新生成，旧真实消耗保留。若任何相关reservation仍在派发中、派发后FAILED且usage/结果未知、关联记录缺失/归属不符，则node进入RECOVERY_REQUIRED并明确失败，不自动发起新调用；不能用全task未知数永久封死无关节点。缺失已验证checkpoint若需要重建，同样需这份精确call审计准入，不能把旧VERIFIED直接冒充有正文。
12. 对仍未知的具体调用，本阶段明确停留恢复待处理；后续M3.3提供控制/对账处理，本阶段不伪装其已自动恢复。不新增“自动忽略unknown/新task/凭据切换”逃逸。上游index/metadata仍使用现有checkpoint，全部阶段的自动后台接管尚未交付。
13. 失败只记安全code/状态，不存原始错误或prompt；已验证其它节点与正式旧结果保留。每条call/节点/计划元数据与预算lineage不因14天正文checkpoint/result清理而重置。新表不复制正文；随generation/账户删除级联，旧plan保留为不可复用历史。版本不兼容直接拒绝/新计划，不新增旧版双读/回退；总路线最终unused兼容清理继续保留。

## 实施及文档范围

优先ai包新增一个小型JDBC journal、必要内部record/DTO；最小修改OverviewGenerationService/Coordinator接线、AiTaskScope/UsageGateway/UsageQueryService/Guard的精确binding与查询。迁移+相关测试。禁止重构不相关冻结逻辑、改Provider协议/财务数值/公有响应shape/SDK/前端/依赖/部署配置。algorithm推进当前唯一版本隔离旧checkpoint，不读旧算法回退。若上述设计与实际锁序/调用链冲突须回报主模型，不自行改核心安全含义。

新增现行M3.2计划登记docs/README；同步Database、Backend、API内部边界说明、Architecture、Status、Issues、总计划/设计及Changelog。ProductRequirements只在实际产品范围变化时最小同步，不扩大当前阶段范围。编辑前每文件保存当前dirty精确字节快照及hash到Droot，所有差量对该基线，不归因全HEAD dirty。

## 本阶段验收与唯一集中验证

完整计划/节点与call关联实际接入当前adaptive Source/Subject，重试保留预算与已验证正文；plan/profile变化不能混用；正常终态可安全重试，未知具体调用明确hold；绑定失败Provider不触发；主调用/repair均关联；旧fence不能写；generic非法writer checkpoint不置VERIFIED；无重复正式发布。合成Provider验证，不调用真实模型。

全部代码/测试/文档草稿完成后才统一验证。静态/范围/docs检查→一次backend full test（含新增H2/真实任务PostgreSQL migration/并发fence/恢复回归）→package。不先跑focused再full重复；不跑未变前端/SDK。真实PG仅任务独占DB/schema，容器/缓存/D日志在D。测试fixture一次性检查前缀、分批与实际容量契约，避免M3.1的过严断言。失败先归因，同一失败最多3次后主模型裁决，仅重跑必要失败组。最终仅一个gpt-6-luna只读reviewer，B/I修最小必要项，OPTIONAL不改。通过即停，只做最终状态回写。

全程不研究C盘、不调用真实Provider/业务库、不部署、不改密钥/env/代理、不commit/push/reset/restore。代码/自动验证/部署/GUI与真实内容质量分开报告。

## 主模型追加的原子checkpoint要求（实施前裁决）

已定位的generic checkpoint先于writer专用校验会使结构上可解析但不合格的小节形成poison缓存，known failure也只能永远重放失败。故当前唯一新算法中，ADAPTIVE_WRITE的主step checkpoint延迟到caller完整单节/精确引用/正文校验后，与node VERIFIED在同一fenced短事务原子保存；JSON repair不得提前固化主writer step。其它index/metadata/legacy的已有checkpoint流程不改。旧算法隔离，无需兼容读取。不得持有generation锁再调用REQUIRES_NEW造成自锁。相应测试确认不合格writer不写可信主checkpoint、不置VERIFIED，明确已终态调用可在同父预算下安全再试。


## Implementation tracking

2026-10-19：M3.2 源码、相关验证及唯一审查完成，未部署。Full backend attempt 2 为 737 tests / 731 passed / 2 failed / 4 errors / 0 skipped；修复后仅对应六个用例定向 6/6。reviewer-fix PostgreSQL class 首次 3/4（唯一错误是夹具在绑定前标记派发），修正后新增方法单独 1/1；full suite 未在修复后重跑。Replacement `-DskipTests package` 成功，JAR 93,303,380 bytes，SHA-256 `D6EA3279DD60D47BF7B8F8068162A2A828A6B1801063FD1C864848D296A046C4`。唯一 reviewer 最终 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0，原 RESERVED recovery finding 已关闭。未知派发仍明确 hold；M3.3 worker/control/reconciliation 与正式发布未交付。没有真实 Provider、生产业务数据库或 GUI/内容质量验收。完整命令与原始证据见 `D:/Temp/auralis-overview-m3-jobs-20261019/`。

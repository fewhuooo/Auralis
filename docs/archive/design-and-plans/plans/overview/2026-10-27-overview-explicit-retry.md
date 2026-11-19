# Overview 独立执行重试实施计划

日期：2026-10-27。

状态：源码、契约生成、分批集中验证及唯一只读审查完成；2026-10-27香港23:05已部署，数据库V41验证通过，应用健康。未调用真实模型或验收实际重试。

## 目标与范围

Source/Subject直接JSON/SSE生成的主动重试创建新generation与budgetTaskId，复用可信进度，保留旧调用和费用。不再因旧任务的未知INDEX调用而永久阻止新执行。已有durable jobs的claim/resume和原预算规则不变，不恢复PC任务管理界面。

## 已批准规则

- 相同requestId读取同一次尝试；失败终态不因重放重新执行。普通新请求遇有效ACTIVE仍合流，遇FAILED或过期ACTIVE创建新尝试。
- 请求增加可选retryOfRequestId。显式重新生成可原子接替旧执行；同父同输入的并发重试返回同一直接后继，不通过随机化内容指纹绕过去重。
- 父ACTIVE失去执行权并增加fence，清除owner/lease；原FAILED保留失败原因。被替代的旧generation不再被接管，晚到旧业务结果不能发布新结果。
- 新代保留retry父关联；现有request映射记录重试意图以校验幂等。旧reservation不删除、不归零，过期已派发调用沿用Guard保守计费，新调用仍受额度和并发控制。EXPIRED费用不使用迟到rawUsage改写。
- 允许复用失败父及其重试祖先的已验证INDEX/ROUTE/单Writer检查点，不要求donor整轮SUCCESS或整计划ASSEMBLED。当前来源、revision、prompt、profile、算法/schema、输入与payload hash仍精确匹配；不复用无返回或未通过校验的产物。
- 正式保存及用户编辑冲突保护保持，不直接覆盖旧成功结果或用户修改。

## 实施细节裁决

- Coordinator独立direct获取策略，已有job路径维持原acquire行为；显式retry不被本机普通single-flight合流吞掉。
- retryOf不进入内容/模型/阶段提示词指纹，仅作为执行控制及request幂等意图。
- 当前用户下未找到retry请求映射时，按普通direct请求处理，不建立父关联、不读取或接替他人任务，避免请求尚未到达服务端就断线导致后续永久拒绝。已解析到的同用户跨scope指针仍拒绝。
- 父已有后继且本次身份匹配时复用后继；配置/revision变化导致不匹配时按普通direct新生成/合流，不返回旧配置内容、不突破单后继约束。
- 显式重试父尚无后继但另有有效同身份ACTIVE时，先返回明确冲突，不修改父或终止无关任务；过期direct占用可按围栏收尾，任何job-owned被替代目标均由原job通道处理，direct不得接管。
- V41在现有request映射增加可空retry_of_request_id以绑定重试意图；未解析指针或配置变化不建立父关联时，也能校验同requestId意图不可变。
- 后继唯一性用nullable列的普通UNIQUE index实现，默认NULL DISTINCT允许多个普通根代；不需要部分索引WHERE或H2专用兼容分支，PostgreSQL非NULL父代单后继语义保持。
- PC仅使用当前service实例内的已派发请求索引，按owner/device/scope/revision/mode/输入及scope删除代次隔离，不新增端侧schema。服务端重启不清PC索引；PC刷新后无旧指针时按普通请求规则处理。
- self-FK不级联删除后继；祖先已有可信进度不能因中间重试未复制完成而丢失。沿用既有精确检查点校验，不新增donor表或固定链深帽。
- 本轮新增失败祖先复用限定adaptive INDEX/ROUTE/VERIFIED Writer/EDIT；legacy MAP/REDUCE新尝试可重新执行，未扩展其跨代失败检查点协议。对应旧同ID/同预算恢复长用例按新执行合同重写，不增加兼容路径。

## 实施分工

- 后端：DTO/Coordinator/direct调用、迁移、检查点复用及对应测试。
- PC：现有API/service/SSE请求控制、请求隔离及对应测试；不新增组件页面。
- 主Agent：需求/并发/计费裁决、契约与文档、集中验证编排及最终验收。
- 集中验证Agent：统一SDK生成、隔离数据库与命令门禁。
- 唯一只读reviewer：全部编辑完成后的必要问题检查，不重设计。

## 验证计划

全部改动完成后集中验证：相关静态/类型检查及定向测试；隔离PG迁移、并发和费用保留场景；OpenAPI导出与PC/Mobile schema同步；一次后端full与package；PC相关测试和build。所有测试数据库使用任务独占实例，三种URL显式覆盖；不使用业务库。可选私有trace replay本轮不纳入，按实际记录skip。

核心场景：INDEX/repair中断后新代可执行；部分Writer完成及A→B→C连续重试仍复用；同request及同父双击不重复派发；旧fence晚到不能写新结果；旧费用保留且新额度不足正确拒绝；输入/账号/scope变化不误复用；durable job原语义和本机编辑保护不回归。

失败同源最多3次affected复验，不重复full或已通过检查。

## 实际验证与审查

- 相关后端162/162通过；最后forecast/donor源差量Coordinator2及Recovery3通过，phase-aware安全方法1/1通过，未重跑162整组。
- runtime OpenAPI导出15/15，两端schema生成/字节比对通过。PC type-check、Overview84/84及build通过，backend `-DskipTests package`通过。
- backend full仅一次：950项1F/55E/2S。53项PG错误包含class setup记录，修正认证后对应10类48个真实case运行；与两个公开资源方法及TaskColor方法组成affected51项，50通过/1迁移latest断言失败，再Identity单项1/1通过。full不重跑，不声明一次全绿。两个trace replay按计划未opt-in。
- 验证时修正隔离PG认证first-match与快照缺公开资源，业务容器/数据未动。仅两份旧latest迁移断言40→41为test-only修正。测试PG已停止移除，D盘证据保留。
- 唯一reviewer最终B0/I0/O0，含direct/job边界、并发/账务/只读forecast与执行门禁、PC当前逻辑及生成契约。PC精确开工快照未保存；以10/26已验候选和manifest5/5验证的历史差量辅助，不声称覆盖整个dirty工作树。
- legacy MAP/REDUCE跨代失败checkpoint复用不在本轮新增范围；PC内存索引不跨刷新持久化。真实重启重试、模型与GUI验收仍未执行。

命令、退出码、日志、最终575文件与生成物hash见 `D:/Temp/auralis-overview-retry-impl-20261027/validation/final-validation-report.md`，审查见同目录上层`review.md`。

## 证据与验收边界

证据目录：`D:/Temp/auralis-overview-retry-impl-20261027/`；前期设计与只读契约核对：`D:/Temp/auralis-overview-retry-design-20261027/`。

本轮不部署、不修改业务数据库/缓存/费用账本、不调用真实Provider，不做浏览器或GUI自动化。源码、自动检查、部署和真实业务验收分开报告。

# Overview 动态容量与链路简化实施计划

日期：2026-10-26（香港时间）

状态：源码、分批自动检查与唯一只读审查完成（B0/I0/O0）；用户追加授权后已本机部署并清理全部6条FAILED缓存，真实模型与内容质量未验收。

## 目标和用户决策

以模型实际容量和完整请求决定单次处理量，统一额度决定总体投入，不再用聊天小门槛或Overview私有低总量帽代替额度治理。请求大小、输出、持久结果等最大值集中到Overview专属环境配置：默认0表示没有额外静态帽、依真实模型能力/请求/额度动态判断；正值为显式人工上限，不能超模型物理能力。Chat、Embedding、Provider Setup原有限制不变。

主链路：读取资料→动态分批INDEX→全局ROUTE（真超容量才现有bucket）→多主题、原文去重Writer→程序装配→轻量EDIT及ALL导读→现有保存。移除多层Metadata及Writer回声声明，不新增修复状态机、模型摘要、固定压缩比或多小节Writer协议。

## 事实依据

真实42单元样本形成118索引主题；28次Metadata仅将117条目减到110，最后6个bucket又输出117路由，75条带BODY。实际36次Writer只处理18个unique原文单元，累计原文字符是去重后的2倍多。最后响应仅有schemaVersion和detailedContent，因缺回声字段而失败。完整trace为D:/Temp/auralis-overview-traces/d34f634f-6ad3-45e4-9aed-292b13f9ddbf/e9d63a65-70b1-4cc4-8d35-eddde201f8f0/。

旧容量链含Service12k字符、Gateway共享字节/6144和4608输出、逐topic输出预测、原文/section/node/call总量、存储1Mi字符及PC重复限制；不是单一开关。

## 实施内容

1. 共用OverviewModelBudget能力解析：精确官方profile或服务器显式provider/endpoint/model配置；未知能力明确要求配置，不套小fallback。MiMo官方规格[模型页](https://mimo.mi.com/models/en-US/mimo-v2.6-flash)为1M上下文/128K输出，采用保守1000000/128000，不能推断其他模型/代理同能力。
2. Service、Planner、Gateway、Provider按同一模型能力/估算profile与实际requested maxTokens对齐。Overview不受Chat共享小字符/字节/固定输出帽；非Overview保持。Provider响应字节按Overview专属配置而非共享1Mi；deadline、取消、身份/来源、Guard reserve/dispatch/settle仍保留。
3. typed overviewLimits集中ENV，默认0动态、正数人工上限；请求字符/字节/input/output tokens/响应bytes，结果/checkpoint/plan/descriptor、章节/小节/正文/标题/来源/identity等尺寸同步。调用次数仅用原overviewMaxCalls，默认0，可配置正数；财务taskToken和小时/日额度不擅自提高。原文单元/索引topic不能误用最终section数量上限。
4. 删除Metadata多层purpose、prompt、循环和只服务其的caps。直接路由按实际输入和输出需求判断，不按每topic一小节预测；相关topic可共处一个学习节，组内原文去重。同源不直接等于同语义，不强制主题数/聚合比例。
5. Writer私有输出仅schemaVersion/detailedContent；Java绑定来源和任务关联，不要求模型重复抄sourceIds/coveredTopicIds，不用声明冒充语义覆盖。既有成功组/子组完成状态、ranges、descriptor、manifest/proof、未知费用hold和恢复围栏保持；新算法隔离旧计划，无旧格式回填。
6. 保存与接收联动：移除SQL旧固定长度检查，用应用ENV约束；沿用TEXT/既有section读取，不新大文档存储层。Overview result title改TEXT以免应用取消300后DB仍拒绝。PC仅必要接收校验/生成契约同步，不改页面/Store。新增迁移只在隔离DB验证，业务库不执行。

## 最终实现与配置

当前算法 `overview-adaptive-v10-dynamic-capacity-writer-body`。26 项 ENV 的完整名称和默认值在根 `.env.example`，由 `application.yml` 与 Compose backend 对齐。0 表示无额外静态帽，正值为对应人工上限；单次 output 仍不能越过模型 max output 或扣除完整输入与余量后的 context。跨批最终结果与存储不按单次模型窗口截断。

输出需求估算为饱和 `serializedInputBytes + 256 + 32*itemCount + 64*sectionCount`，是预留策略而非强制输出长度、摘要比率或 tokenizer 保证；不足额度直接返回预算错误。调用次数仅用现有 Overview maxCalls（默认 0），财务 Token/窗口/并发设置不改。INDEX/ROUTE/Writer 私有 alias 数不等于最终不同来源 UUID 数，私有解析不套最终文档 volume 帽，但仍执行严格结构和授权校验；最终装配/保存执行配置值。

显式 capacity profile 优先于内置官方 profile。provider 在公共配置中使用有合法值约束的名称字符串，避免 shared 反向依赖 AI 业务模块；实际身份精确匹配。自定义环境列表前缀为 `AURALIS_AI_OVERVIEWMODELCAPACITIES_0_*`，Compose 需按部署指南显式传五字段。没有旧格式兼容/回填；过时固定调用序列测试已移除，当前 SUMMARY 语义与身份/额度/恢复安全保留。

## 分批验证结果

- D 盘候选编译成功；代码最终与候选清单 287 路径无缺失/哈希差异，该清单在最终现行文档回写前生成。后续文档单独留差量。
- 唯一后端 full：933 项、4 failures/54 errors/7 skipped，exit 1。保留失败记录，不重跑 full。按根因修正配置 fixture/依赖环并补齐隔离环境后，九个 direct PG 类 43/43、受影响检查 44/44 分别通过，不能合称一次 full 全绿。
- 隔离 pgvector/PostgreSQL 17 的随机 loopback 测试库迁移到 V40，测试容器已停止移除，D 盘证据保留；未访问业务库。
- OpenAPI 15/15及 PC/Mobile 生成类型比较、package -DskipTests、Compose config --quiet、PC type-check、PC Overview 接收 80/80 通过。
- 七个 full skip：两个未配置 trace 目录的 replay，五个未配置专属 URL 的 UsageGuard PG lock 测试；未额外启用。真实 Provider、估算泛化、实际成本/质量和 GUI 未验收；未部署或迁移业务库。
- 唯一只读 reviewer B0/I0/O0，报告见证据根 review.md；代码已冻结。准确命令、分批失败归因、哈希与未覆盖范围见 `D:/Temp/auralis-overview-dynamic-capacity-20261026/final-handoff.md`。

## 分工、验证和验收边界

### 用户追加授权后的部署记录（2026-10-26 香港22:42）

实现阶段以下“不部署/不写业务库”边界在用户明确要求部署和清缓存后，仅对本次已审定操作放行。用户选择全部6条FAILED，主Agent备份全库与528行目标缓存后执行精确ID事务；删6父行、257检查点及相关私有执行缓存，保留SUCCESS22、正式结果22、receipts25、费用675及原资料。保留数据12组hash在清理及部署后均相同。

基础Compose+trace overlay仅build/up backend/frontend，exit0；原db/MinIO恢复启动而容器/卷身份保持。新backend6256eee9…、frontend28f9ff68…，V40应用成功，HTTP/运行JAR六class身份核对通过，26MAX全0/calls0/财务额度保持。没有启动生成或新Provider调用，真实质量、GUI和备份恢复演练未做。备份、SQL与完整验收见D:/Temp/auralis-overview-deploy-20261026/deploy-verification.md。部署未改源码或重复测试。

主Agent裁决跨层契约和文档；estimator执行者拥有ModelBudget/Gateway/config/Provider，pipeline执行者拥有Service/Planner/Formatter并统一验证，boundary执行者拥有Validator/持久层/迁移/接收校验和生成契约。各自留前像，不写他人文件，不在编辑中运行检查。

全部编辑结束后，D盘fresh候选hash核对、编译和相关检查；共享配置/契约按矩阵执行一次后端full及package、必要PC类型/接收和OpenAPI一致性。Provider替身和隔离PG/MinIO，不用业务服务。失败完整归因，同根最多3次，只复验affected、不反复full。一位reviewer只读任务前像差量，处理B/I后停止。

证据根D:/Temp/auralis-overview-dynamic-capacity-20261026/，baseline已保存当前dirty前像。禁止真实模型、部署、业务库读写/迁移、清缓存、Antigravity、前端UI扩展；原资料、SUCCESS、正式结果保留。代码、自动检查、真实模型成本/内容质量、GUI和部署分别报告，不预先承诺节省固定Token或节点比例。

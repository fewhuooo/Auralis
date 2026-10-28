# Overview 原章顺序与柔性路由实施计划

日期：2026-10-27（Asia/Hong_Kong；讨论和D盘基线于10月26日开始）

状态：源码、分批定向检查与唯一只读审查完成（B0/I0/O0）；未部署、未验收真实材料质量。

## 目标与范围

只固定原书章序，允许章内合并主题、重划小节及调整小节顺序。沿用已部署的动态容量、合法索引子集、Writer两字段程序绑定、NAV阅读过滤与轻量EDIT；不重做这些已验实现。主Agent负责规则与裁决，Luna high执行实现和验证，完成后一次只读审查。无新增模型轮次、旧中间格式兼容、前端/公开API/数据库schema变更。

当前源码仅保持输入和装配稳定顺序，INDEX分组与ROUTE可自由重排，没有原章绑定。现行private index metadata只保存逐section的sourceRoles，适合在同一条私有保存/恢复链路增加可选章起点，而不是把公共OverviewChapter.title改为null或引入新的公开字段。

## 已确定规则

1. INDEX按原文先后输出主题。仅实际看到正文中的章级标题时，在相应私有section提供可选 `sourceChapterStart:{unitAlias,title}`；省略/null表示没有新起点。alias取自现有已授权引用，不让模型抄ordinal/hash或创建chapterId。分组chapter.title、sourceTitle、目录条目和后续章节预告不是正文章头。
2. 显式章头和材料用途分开：真实正文章头自身可能只有标题、作为NAV引用；普通NAV引用不会改变活动章。模型必须区分实际章头与目录条目；程序依据明确章头声明与来源定位处理，不宣称此语义识别百分之百正确。不因为无法使用的章元信息中断任务，原文引用/角色授权、严格JSON及非空等检查保持。
3. 按实际输入单元顺序（来源顺序、ordinal与已有切片顺序）及主题输出序扫描，同Source内跨批顺延、跨Source重置。同单元A无章声明沿用旧章，B含新声明切换新章；不新增字符偏移量回传或原文硬切分。
4. 第一显式章前的BODY保留为最前独立“导论”。有可靠正文章起点时，即使只识别一章也固定骨架；没有可靠起点时保留自由路由，最终按逻辑章最早BODY位置排章。章节数量不固定，不以平均主题数门槛判定碎章。
5. 目录仅做章号、空白、标点等确定性名称对齐；不能推进章指针，不激进模糊合并或跨Source归并章身份。章身份、顺序由程序绑定。
6. ROUTE默认一轮全局按章容器输入，章内多主题聚合，只有真实容量不足才现有分桶。主题不同时重复平铺和嵌套；容量估算包含实际完整新payload。
7. 跨章混装自动按原章分拆、归位，保留全部合法主题，不报错/重试。主部分保留建议小节标题/目标；单主题拆出部分用该主题title/summary，多主题拆出部分只描述本子集。拆回小节按最早BODY位置插入，保留该章原有小节的相对顺序，不将全部章内小节按原文强制排序。
8. Writer仍只依本批原文，程序按固定章序装配。NAV不产生阅读小节、无BODY空章移除，EDIT不移动章，只作既有边界编辑与导读。真实语义完整性仍待用户材料验收。
9. 新private算法身份隔离本轮索引/目录元信息，primary、现有JSON repair、checkpoint保存及恢复一致；不增加专用修复链或旧格式回填。

## 实施和验证

执行文件限OverviewGenerationService、必要的OverviewDocumentValidator私有投影、OverviewAdaptivePipeline及对应Adaptive/Recovery/序列化测试。允许自然复用现有纯函数或必要小型测试，不借机重构大类。过时用例按当前契约改写，不迁就旧固定调用序列。

全部编辑完成后在D盘候选统一编译、相关Adaptive/章序纯逻辑/Recovery与必要序列化测试。仅后端私有模块变更，不重复前轮full、API或PC门禁；Recovery只能隔离Testcontainers，不接业务库。失败先读XML定位同类，单根最多三次、仅affected复验；不反复全树复制或clean。一次只读review，只修B/I，B0/I0即停止。

基线及证据：`D:/Temp/auralis-overview-chapter-order-20261026/`。基线保存完整server/src、pom和相关现行文档及git status。用户现有dirty树保持；当前已部署Docker/V40和正式资料/成功结果/账本不操作。本轮不部署、不清缓存、不调用真实Provider或浏览器；真正产品取舍发用户确认。

## 实施与分批验证记录

仅修改OverviewGenerationService及OverviewAdaptiveGenerationTests。新算法为overview-adaptive-v11-source-chapter-order，私有INDEX checkpoint v3；元信息正文定位采用NFKC、大小写、空白/Unicode标点确定性规范化。无效可选元信息忽略，不放宽原sourceRoles/引用/JSON授权检查。全部代码基于本轮D基线增量，未修改public DTO、共享配置、DB schema、Writer/EDIT或前端。

编译380 production/151 test sources通过。首轮119项：Adaptive72中6失败，Recovery30/30、Budget17/17通过；fixture含未出现原文的标题、旧prompt短语和固定批次数断言，改成当前语义后分方法复验闭合。新增同unit案例另外发现真实双键边界问题，修正后四项章序方法通过，最后更新的同unit payload断言单独1/1通过。跨JVM原测试首轮通过。不同批次不相加冒充一次全量全绿，未跑full、API、PC或package。

测试文件编辑曾误匹配较大区段；恢复过程中未保存完整三段hash链，之后主Agent对照任务baseline的差量和方法清单确认无原void测试方法丢失。记录与恢复快照在main-recovery-audit，最终源码/测试与D候选hash一致。准确命令、初轮/affected数量、失败归因及最终hash见implementation-validation-report.md。

唯一只读reviewer最终B0/I0/O0。审查提出的两项IMPORTANT最小修正后4/4通过，同一reviewer只查差量关闭：ROUTE不得主动许可跨容器混组；主片段保留原小节标题/目标。主片段默认取BODY主题数最多的组，平局取最早BODY位置；其它片段只用自身主题元信息。报告review.md，修正与命令review-fix.md。限制：章识别仍依赖INDEX语义及规范化标题匹配，同unit内部顺序依赖模型按原文输出；程序只在已识别绑定上固定章，不承诺原书结构识别完全正确。当前已部署运行态不变。

# Overview 阶段 3–7 修复实施计划

日期：2026-10-24

状态：源码与定向验证收尾；主 Agent 设计，Luna 实现并由唯一 Luna reviewer 最终确认 B0/I0/O0。全量测试与 Mobile 类型门禁受限，未部署、未做真实 Provider/业务验收。

## 1. 范围与基线

本次处理路由容量、元数据无进展、主题职责、正文分组/容量/截断恢复和最终装配。阶段 1、2 已完成的原文准备及索引纠偏保持，不顺手重构。现有工作树包含大量并行改动，以任务开始快照和精确 delta 保护，禁止还原、清空资料或账本。

已证实的阻断是旧部署 run `729d6835-8dfd-4122-bd02-c8d4620d867c`：metadata depth 3 的 77 项由 10790 字符变为 10790，检查先于路由容量判断，返回大小错误。另确认 writer prompt 的 part 使用全局编号，与 route-local descriptor/标题不一致。语义遗漏、跨节复读及模型偏好属于待真实资料验证的质量风险，不把它们全部写成已发生的故障。

本次不增加前端页面、流程、Store、模型切换或线上语义评审调用。正式 OverviewResponse 及每个公开 section.summary 的 4000 字符限制保留；私有模型契约、分段装配及必要 preview 契约按下文调整。不做已弃用私有格式的兼容路径。

## 2. 路由与元数据

1. 从已验证 index sections 建立不可变 topic catalog，应用分配稳定 topic ID，保存原始标题、短描述和原文 unit refs。后续分层组织只改变分组，不覆盖这些原始探针。
2. 每轮归并前及取得结果后，先按真实目录请求检查输入容量，并估计紧凑路由契约的输出需求；不是仅检查 contextWindow 减固定输出额度，也不把估计称为精确 tokenizer 计数。
3. 能进入路由时立即使用。仍不适合单次路由或规划无进展时，从原 topic catalog 做确定性、有界的分桶路由，带共同章节/术语提示，避免继续要求同一批独立主题反复压缩。不能截断知识描述或以固定 10% 减少率强行合并。
4. 路由只返回结构与授权 entry/topic IDs；模型不重写每个完整知识点。各桶及合并后严格校验 topic 主归属、原文覆盖、未知/遗漏/重复 ID、章节/节点/结果容量。已知输出的编号错误最多一次受 Guard 的纠偏；不按 Jaccard 猜挂，不静默过滤成成功。
5. metadata 携带服务端计算的原文 unit 数、字符负载等提示。超级节点需要时展开回 catalog，writer 按实际输入容量分组，保留总调用、层级、节点和 payload 上限。

## 3. 写作职责与私有正文契约

- 每个 index topic 有唯一主要负责的小节；一个 raw unit 可因包含不同 topic 而供多个小节使用。writer 接收本节原始 topic 探针、同源兄弟小节的有限职责信息与本组真实原文，writingGoal 不再是唯一细节来源。
- 先按 topic/实际原文容量形成组；单个 topic 原文过大时可分为局部证据组。明确只讲当前批次出现的证据，不脑补其他批次内容；第几组/共几组统一按 route-local 编号，prompt、descriptor、标题和 checkpoint step 一致。
- 为保持不可变执行计划，前组信息使用可预先计算的 planned topics，而非在派发时偷偷追加前组生成正文，避免 descriptor 与实际请求指纹不一致。
- writer 使用独立 detailedContent 私有响应，而不是让模型把详细正文写进 summary。返回合法 sourceIds 与本批实际处理的 coveredTopicIds；局部证据组可声明分配候选的合法子集，不能为满足逐组全覆盖而脑补未见材料。topic 声明覆盖在全部父/route 片段聚合后核对，原文 unit/range 的程序覆盖始终严格。这只是分配与声明覆盖检查，不是事实级完整性证明。
- 完整 Markdown 经结构感知分段，每个公共 section 仍不超过 4000 字符。不裁掉超长尾部；长 code/table 可按完整行续段并重复必要结构外壳，不可安全拆分的原子明确失败。检测工程标识时不能盲删原文已有的 U12、公式或代码标记。

## 4. 有界恢复与持久性

仅已确认的输出截断/容量问题进入 writer 拆分恢复；预算拒绝、取消、deadline、网络异常和未知派发保持原错误/hold，不自动重派。

使用现有 generation checkpoints 持久化带 kind/version 的私有 recovery PLAN 与 RESULT：绑定 parent step、确定性 child path、原文范围/内容指纹和完成 payload hash。不同阶段记录使用不同 step，不覆盖不可变 checkpoint。子结果先校验保存，父结果仅在全部 fragments、topic/unit 覆盖和 provenance 验证后与 node VERIFIED 原子提交。

现有 RUNNING node attempt 可绑定多个 reservation；父/子全部 Provider 调用沿原 Gateway、Guard、预算根及 deadline 记账。恢复先读取已持久化拆分计划及已验证子结果，不重新派发已知截断父调用或已完成子调用。拆分深度、最小材料和额外调用数均有界；未知派发核验先于恢复派发。

父 checkpoint 可包含多个公共 sections；跨 generation donor 没有完整的复合结果依据时不得使用。预览、发布和清理读取须保持相同验证围栏。新内容算法版本与私有 payload discriminator 隔离旧生成格式，历史正式内容与账本不删除；同一新版本内的失败续跑仍须复用。

## 5. 装配、导读与必要接口变化

`OverviewBodyFormatter` 仅做结构感知分段、非代码 ATX 标题归一及有界导航数据提取，不做语义删减或整篇 LLM 重写。最终 ALL 导读在正文全部完成后进行一次有界 `ADAPTIVE_GUIDE` completion，输入实际完成目录和有限的正文标题/首段，不把原导读降成章节计数或机械目录列表。该调用沿同一预算根、Guard、账本与 deadline，独立保存绑定完成内容指纹的 checkpoint；失败不重写已完成正文，未知派发仍 hold。大目录可缩减导读 seed 中的重复字段、每节摘录预算和标题显示长度，不能改写/截掉已保存正文；不承诺语义完全吻合或知识完整。导读额外调用明确记录和计量，配置额度不放宽；已存在合法导读 checkpoint 时先复用，不按一个假定新增调用阻断恢复。

组装后验证每段大小、总 chapters/sections/payload、原文映射及 topic 声明覆盖。最终正式来源引用和 provenance 保留，暂不引入新的 inline 引用语法或前端渲染。

必要 preview 连带变更：NodeView 从单 section/provenance 改为 `fragments: [{section,provenance}]`，返回全部已验证片段；移除旧单片字段，不保留旧版本兼容。逐片验证正文、来源范围与 recovery 证据，避免只返回首段或把 parent 的全范围冒充每个 child 的精确范围。正式 OverviewResponse 和原 PC 交互不变。同步 API、OpenAPI、双 SDK 生成和对应契约检查；无需新增数据库 migration，私有 checkpoint payload 的新用途写入 Database 文档。

## 6. 编排与一次集中验证

- 主执行者负责 Service/Pipeline、私有 writer/路由 DTO、恢复、预览与紧邻测试；formatter 子任务只新增独立 helper 与其测试；环境子任务只准备 D 盘隔离 PG/TLS。
- 编辑过程中不跑测试。全部源码完成并记录快照后，单一执行者统一进行 scoped 静态检查、相关回归、隔离 PostgreSQL 恢复/preview/unknown-hold/预算根验证、API artifacts 与双 SDK 必要检查、full suite 和 package。日志逐轮唯一命名，不覆盖原始 full 输出。
- 相关用例包括等长但可路由、无进展分桶、输出预算分桶、topic partition、route-local part、完整分段、截断后子结果恢复、未知派发不重试、来源范围和多片预览。阶段 1、2 的相关冻结回归一并纳入最终批次，不逐项反复验证。
- 同一失败先完整归因、一次处理同类问题，同根因最多三次；已通过且未变化的无关范围不重复。必要修复仅跑 affected checks，不把多批结果伪装成一次 full 全绿。
- 最后只派一个 Luna reviewer 做只读审查。若有真实 BLOCKER/IMPORTANT，由同一执行者最小修复，只有同一 reviewer 确认关闭；OPTIONAL 不实施。不建立多层重复检查链。

源码、自动验证、部署、真实 Provider/GUI/内容验收分别报告。证据目录为 `D:/Temp/auralis-overview-stages3-7-20261024/`；真实业务接受仍需原资料生成结果证明。

## 7. 本轮交付与验证结果

阶段 3–7 的本轮源码修复已完成。最终审查关闭了重复 Part 标题、已缓存目录桶仍占新调用预算，以及长私有正文在分段前被旧 strict-shrink 门槛误拒绝三项问题。最终服务源与 D 盘隔离候选 SHA-256 一致：`4BA5F9C54FB158DF5693D3BAB9F999B3154D0F90379518172790C0DD05C92383`。阶段 1/2 的现行实现及并发工作树修改保留。

分批证据：Adaptive 48/48；Recovery 28/28、Preview PostgreSQL 10/10 在同一失败组合批次中各自通过，不能将该组合批次写成 exit 0；Formatter 9/9；最终两项受影响回归 2/2、隔离 package exit 0。OpenAPI artifact/export、双 SDK 生成及 PC type-check 通过。仅在相关失败或最终审查修复后执行受影响检查，未重跑全量。

原共享 target 全量结果为 855 项、6 failures / 29 errors / 1 skipped，保留原日志，不宣称全量通过；后续改用全新隔离 target 的 javac 编译以排除旧产物。范围外 `SubjectDeletionCascadeTests.cleanData` 乐观锁错误未修改或复测。Mobile type-check 仍因既有 `reviewApi.ts` 引用未提供的 `EventRequest/EventResponse` 失败，未扩改 Mobile 业务逻辑。实际命令、失败关闭映射及未覆盖范围见 `D:/Temp/auralis-overview-stages3-7-20261024/final-handoff.md`；唯一审查见同目录 `review-final.md`。

剩余人工边界：后端重建部署、同份真实资料生成、正文完整性与主题分配质量、真实 usage 和 GUI 业务验收。模型声明与程序 coverage 检查不等于事实级完整性证明。

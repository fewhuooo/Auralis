# M2 主模型实施定案：稳定大纲身份与可信原文关联

日期：2026-10-19 Asia/Hong_Kong
状态：M2 实现、相关数据库/API/SDK/PC 验证与唯一复审完成；全量 backend/PC 首轮结果保留失败记录，不宣称全绿。未部署或进行 Provider、业务库、GUI 验收。M1 frozen，按本功能必要触点扩展，禁止顺手重构。
分支：codex/overview-adaptive-generation。证据：D:/Temp/auralis-overview-m2-20261019。

## 目标与范围

交付现有文件/学科 Overview 的稳定章节与小节身份、内容版本，以及从 accepted ParsedDocument / SourceChunk 到生成与已保存结果的真实原文关联。包含后端、V34、PC 数据往返、契约/OpenAPI/两端 SDK。无 Learning 会话/进度实现、无后台 job/preview、无 viewer 跳转界面、无部署、真实 Provider 或业务数据库操作。全部普通实现/测试/审查按用户指定使用 6-luna high；主模型负责本定案。前端仅数据/编辑序列化，遵从用户指定模型。

## 1. 复用既有身份设计

复用 Learning 计划 Task1 的 OutlineIdentity/OutlineIdentityService，不创建第二套学习节点模型。OverviewResultCommand/View 新增独立 outlineIdentity；Provider 的 JSON 仍只有 schemaVersion/title/outline/summary，不从模型获取节点 ID。

身份 schemaVersion=1；nodes 每项含 path（chapter=[i]，section=[i,j]）、nodeId、contentVersion、contentHash，以及该节点的 canonical sourceRefs。路径只表示本版本位置，不能作为身份。身份最多当前60章+500节，完整覆盖所有节点且path/非空nodeId不重复。

请求中的新节点 nodeId=null，由服务端在现有 PUT/CAS/receipt 事务分配UUID；已存在节点必须携带当前结果中的nodeId。未知/跨结果/已删除节点ID拒绝，不允许客户端借新UUID创建任意持久身份，因此无需新建全局节点注册表。章节/小节类型不得复用同一身份互换。新生成或跨结果复制的节点均将nodeId重置null；不按标题、下标、文本相似度迁移旧身份。

服务端重新计算hash/version，不信任客户端自报值。section hash包含title、summary、有序规范化sourceIds、现行locator及canonical sourceRefs；chapter hash包含title与按nodeId排序的子节点ID/hash，排除显示顺序。新ID version=1；相同ID且hash相同保留版本，hash改变+1。改名保留ID；纯重排不增版本。移除节点从当前身份集合退出，后续不得用旧ID冒充新增节点。

GET不隐式写入/初始化旧结果；旧行outlineIdentity=null、identityReady=false，内容保留。新契约 OUTLINE/ALL PUT 需完整身份请求（全部新节点可nodeId=null）；首次显式保存/初始化后才identityReady=true。SUMMARY保留整份既有身份，不创建、重置或修改节点。此契约需Server+PC协调更新，旧无身份的写入不能覆盖已经绑定身份的结果，不能静默降级剥离身份。读旧成果仍可用。身份ready不代替同步确认，未来Learning必须同时检查result版本和同步状态。

## 2. 来源关联（程序生成位置，不能模型猜测）

现状：M1 AdaptiveRawUnit已含source/revision/chunk/generation/hash/char span，按writer group构造每section的准确输入范围。它表示关联/写作输入范围，不证明逐句事实支持。Legacy路径与旧成果只能资料级，禁止从sourceIds猜具体chunk。

采用独立应用侧 outlineProvenance sidecar：按section path列出source refs。OverviewResponse可增加可空 app-only sidecar（保留4参数constructor，字段NON_NULL），Provider prompt与validator canonical四字段保持不变；模型给的sidecar必须被丢弃，只有应用可在模型校验后附加。Provider的schemaVersion不升级。Sidecar不进入后续模型prompt和结构修复prompt。

SourceRef使用sourceId、ingestionRevision、可空chunkId/generation/contentHash/charStart/charEnd；精确span是flatten后normalized UTF-16 [start,end)，必须在对应真实chunk范围内。来源级没有chunk及坐标。服务端从真实owner/source/active/revision/generation/hash以及persisted provenance推导canonical ParsedDocument/block/page/anchor/line信息，不接纳客户端或模型自报页码/坐标为事实。保存时只能关联当前授权范围内、节点sourceIds中的资料，跨用户/跨学科/过期修订/错误chunk/generation/span拒绝；chapter来源由子节点去重聚合。

公开请求的refs只需标识source/revision/chunk/generation/span，response可有canonical定位信息；可单独定义input/view DTO，避免readonly位置被客户端写回当成事实。精确ref与来源级精度明确区分。用户可编辑关联原文，但引用ID/位置不构成语义支持证明。现行OverviewLocator仍非可信生成定位，不能复制进canonical refs。

Provenance必须穿过aliases映射、最终结果校验、持久协调完成/重放和result PUT/GET/write receipt；不能在任一canonical重建时丢失。适配算法fingerprint升级隔离M1 checkpoint；不改旧generation/预算lineage，cache复用不得把旧无provenance结果冒充新精确产物。Source/Subject均覆盖。SUMMARY不影响outline provenance/identity。

## 3. 保留解析/分片位置

ParsedDocumentValidator继续沿现行schema、哈希、字节、压缩与owner/revision检查，ValidatedBlock增加保留可空pageNumber/anchorIndex/startLine（保留旧3参constructor）。PDF pageNumber为1-based页；PPTX pageNumber为1-based slide；Office anchorIndex/startLine保持其原始桥接意义，不能把anchorIndex一概当slide。

IngestionWorker当前以单个LF join blocks，TextChunker对整个字符串执行Java trim后按UTF-16切分。构建block-to-normalized-text映射必须匹配这一确切逻辑，处理前后trim偏移、空block、分隔LF、重叠chunk及跨block chunk。新代码不重写既有TextChunker，只在产生chunk时交集出真实block范围。没有覆盖的分隔符不猜页码。chunk的page/slide可跨多个block，保存列表而非单页覆盖。

V34在SourceChunk中新增可空provenance_json（版本1，包含Source revision、accepted ParsedDocument ID、parser、block ordinal与原始位置/交集范围）；文本不复制。TEXT/URL或历史chunk无此列时保留chunk/资料级精度。写入沿现有job+revision+generation+attempt fencing，在同一generation成功切换后生效；失败保留原有active代。读取旧chunk不补造page/block。metadata大小/数量有限，超出界限明确失败，不静默丢映射。对已有无意义位置值只按现行schema允许范围和真实可用性处理，不凭空推断。

来源读取与保存须核对Source和结果现有revision/manifest；新generation使旧精确chunk失效时不能悄悄换成新chunk。软删除沿现有成果隐藏/清理；硬删除/账号删除清除新增JSON（同既有行，不另建正文副本），不保留失去授权的摘录。

## 4. 数据与事务

当前源码迁移最大V33，使用V34__overview_identity_and_chunk_provenance.sql，追加overview_results.outline_identity_json与source_chunks.provenance_json两个可空TEXT列及必要非侵入约束。旧数据不删不重写，已有V1-V33不可改。按实际文件序列再次确认V34未被占用后创建。

身份/来源与outline/summary版本、baseVersion CAS、write receipt在既有OverviewResultService短事务内原子提交。重复clientWriteId精确回放原node IDs/versions/refs，异载荷拒绝；权限/删除/修订屏障不被回执绕过。SUMMARY-only不重建身份。发布事件使用同次结果版本。

## 5. PC边界

PC types/repository/cache/outbox/sync/API wrapper与SubjectWorkspace编辑树读写保留sidecar。UI临时id与server nodeId分开：加载按path挂接persistent ID，拖拽/重排随节点移动ID；新节点/AI重生成/跨结果复制nodeId=null。保存生成当前path与ID请求，不将临时Date.now/UUID当server ID。缓存/固化HTTP request/receipt response保留metadata，原clientWriteId按固化body重试，不能在重试时重新生成身份。

旧缓存缺身份可读取，明确unready；显式新保存/初始化得到服务端metadata并同步确认后才ready。不在后台GET按标题/下标补ID或绑定学习记录。Source/Subject两类结果与OUTLINE/ALL/SUMMARY、冲突/远端采纳/旧响应隔离都要保留现行行为。仅数据与现有编辑保存接线，不增加学习按钮/进度UI或原文跳转UI。

## 6. 验证与交付

编辑前逐文件baseline/hash，包括现有dirty文件和所有新增文件。Implementation与PC可分工但不共享写同一文件；全部源码编辑完成才freeze/统一验证一次。优先有意义focused：身份初始化/保存重读/rename-reorder/hash-version/增删/跨结果ID/summary/CAS/receipt，chunk跨block/trim/overlap位置，adaptive真实group+model假sidecar被忽略+durable replay+保存，来源越权/过期/删除，PC roundtrip/edit/regenerate/outbox。

API/DB变化需要真实PG V33->V34保留旧行+clean migration、并发幂等/CAS与rollback；随后一次full backend clean test、package、runtimeOpenAPI artifact导出与两端SDK生成/check、相关PC测试/typecheck（必要Mobile只因生成schema变动跑相应类型检查，不扩大UI工作）。全部D盘/隔离PG，使用已修正M1 harness经验，不能引用M1 tests作为新源码通过证据。无真实Provider/业务DB/GUI/部署。相同失败至多3次，原代理归因修复；唯一6-luna只读reviewer，B/I关闭即停止，OPTIONAL不改。

实际门禁结果：PG V34 clean/V33 upgrade/旧行保留/保存读取/receipt/CAS/rollback 4/4，TaskColor migration 6/6；PC M2 sync 27/27；OpenAPI attempt13 13/13，artifact SHA-256 `660b28e4a0e527d8779b9b7009ad31801b4e0e9c501489f40b7192f4e802c1b0`；PC/Mobile SDK 7.13.0 byte-identical，SHA-256 `9ae585615f8062cdb8d9a8b0b43a19a173701c9acd878df4d760d040cebd0002`；PC type-check/Web build 与 package exit 0；JAR 93,256,441 bytes，SHA-256 `702d3258ecb2b6eab5851f3bde31ebbb7c51445720cf288e0f8b5bb18789c5d9`；唯一 reviewer B0/I0/O0。Backend clean full 首轮 125 XML/723 tests/1F/4E/0S（718 pass），失败组定向通过但未重跑 full；PC R4 首轮 737/709 pass/28 fail，2 项 M2 问题修复后对应文件 27/27，26 项基线失败未修；Mobile 仍有两个既有 EventRequest/EventResponse TS2339。详见 `D:/Temp/auralis-overview-m2-20261019/final-validation-report-attempt13.md` 与 `reviewer-final-report.md`。以上不代表真实 Provider、业务数据库、GUI/部署验收。

同步现行Backend/API/Database/FrontendPC/Frontend(仅涉及交互边界时)/Architecture/ProductRequirements/Status/Issues/Changelog、主设计/总计划及Learning Task1依赖，注册本详细计划到docs/README。最终分别报告代码、自动门禁、部署和真实验收；M2完成不等于Learning已实现或M3-M6已交付。

## Wire 定案补充（覆盖上文同名简述）

- PUT outlineIdentity: `{schemaVersion:1,nodes:[{path:[i]|[i,j],nodeId:UUID|null}]}`。入站不依赖contentHash/version，完整覆盖。
- Result view外层含 `outlineIdentity:null|{schemaVersion:1,nodes:[{path,nodeId,contentVersion,contentHash,sourceRefs}]}` 与readonly `identityReady:boolean`，不在identity内重复该boolean。
- PUT outlineProvenance: `{schemaVersion:1,sections:[{path:[i,j],sourceRefs:[{sourceId,ingestionRevision,chunkId?,generation?,charStart?,charEnd?}]}]}`。chunk与generation为UUID；chunk后的精确定位组须完整，全部空表示source-level。SUMMARY builder省略两个metadata字段，服务端原样保留outline metadata。
- generation OverviewResponse app-only字段、Result Command/View均名为outlineProvenance，Provider JSON约定/canonical仍四字段。公开生成响应仅在应用可信派生sidecar非空时序列化额外字段。
- Canonical sourceRef具有上述6字段及contentHash、precision(SOURCE/CHUNK/BLOCK)、nullable parsedDocumentId/parserId、locations数组。每location `{blockOrdinal,pageNumber?,anchorIndex?,startLine?,charStart,charEnd,blockCharStart,blockCharEnd}`。所有范围UTF-16半开，flat坐标clip至当前reference请求span，block坐标指原ValidatedBlock.text。一个chunk可跨多个block/页，不以单页覆盖。
- Canonical位置仅来自persisted chunk映射；客户端只能提交关联标识/range，不能提交页码为事实。章节sourceRefs由子节点聚合。具体有限计数/大小常量按现行有界输入合理选择并记录，超限失败，不能slice映射。

## 必须保持的回放与来源边界

已有成功的无identity旧请求仍按原owner/READY/revision/manifest围栏与原payloadHash精确回放。新增metadata字段的NON_NULL只能局部应用于新字段，不能改变旧Command既有字段的空值/顺序序列化。新写入（无matching receipt）才要求完整identity。GET/旧receipt不初始化ID；异载荷依旧拒绝。

Provider parse在convertValue之前只投影原四字段（或等价专用解析），同名伪造/错误类型app-only outlineProvenance必须丢弃，不能先按新增DTO类型反序列化再触发repair。程序自己的sidecar仅在模型校验之后附加；private replay单独校验。用有效四字段+伪造侧车覆盖，不新增调用。

sourceRefs是保存/生成时的不可变lineage快照，不宣称chunk永远active。GET不重绑新activechunk、不写DB；同revision重新分片后保留旧generation/hash/range。新写入/生成仍核验current active/revision/owner/scope，旧回执不得绕过当前输入失效屏障。无需动态isCurrent字段，不将availability纳入contentHash。Source删除/修订变化走既有结果隐藏/拒绝规则。

PC PUT result只序列化原四字段，app-only generation sidecar提取到Command顶层并投影成六字段ProvenanceInput。固化旧outbox body不可在原writeId下重写以补identity；已完成旧请求可回放，新未完成且缺identity的写入按新契约可见失败/显式重新保存，不丢intent。SUMMARY-only保留已有metadata，AI OUTLINE/ALL重生成清server IDs，编辑保留，ACK不得覆盖更新候选。

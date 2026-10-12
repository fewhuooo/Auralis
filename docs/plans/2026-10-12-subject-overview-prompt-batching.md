# 学科总览合法输入超出单次 prompt 上限

日期：2026-10-12（Asia/Hong_Kong）

状态：最小修复、全新编译定向回归、唯一只读审查与本机 backend 更新完成；真实 Provider / GUI 待验收。现场请求体未记录，不能把重建候选当作原始请求。

## 触发与证据

用户请求 `137ac5ef-1d64-458e-b8bc-45bb11de2c32` 于 UTC 05:09:03.130 开始，约 13ms 后报 `VALIDATION_FAILED` / `DomainException` / `cause=null`。日志只有 `REQUEST_VALIDATE_SUCCESS`，没有 `PROVIDER_REQUEST`；`phase=FINAL` 是外层失败回退标签，不能据此判断模型已经生成。

已部署版本 `31f7dec…` 与现行实现中，Subject 总览将所有文件的 outline / summary 合成一个 `SUBJECT_DIRECT` 请求；`invoke()` 在出站前按 SYSTEM + 序列化 USER 的实际字符数检查 12000 上限。独立字段通过校验并不保证合并 prompt 能装下。

受控复现：单个合法 ALL Source 的 title / chapter / section title 各 300，四个 prose 各 4000 字符；preflight 成功，生成路径抛 `VALIDATION_FAILED`，详情为 `Overview prompt exceeds the configured limit`，cause 为 null，Provider 0 次，日志顺序与用户相同。较小输入对照成功并调用受控 Provider 一次。两项隔离测试退出 0，原实现 hash 不变；详见本轮证据目录的 `backend/subject-repro-report.md`。

现场只读观察：同用户仅一个现存 Subject 有 Source，三个 READY Source 及三个文件总览结果；outline JSON 合计 8983、summary JSON 合计 3442 字符。用部署 JAR 同版本 Jackson 3.1.4 在内存按 alias 化后的结构重建，空 instruction 的三个 ALL 输入均可用，独立 prompt 为 4840 / 6945 / 7240 字符，合并为 16631，超限 4631。完整 SYSTEM 1099 字符、USER 固定前缀 55 字符；SQL 与 Java 命令退出 0，正文不显示或落盘，记录仅数量。这是当前缓存的重建候选，客户端缓存、instruction 和本次 Subject ID 未直接关联，不能冒称原始请求。证据 `runtime/prompt-length-results.txt`。

PC 发出每份可用文件的总览，不发送 PDF 原文。SSE 解析保留 error code/detail，但现行错误分类与 UI 映射将详情改为通用失败提示。该事实用于解释可见性，本轮不扩大到前端交互修改。

## 最小修复设计

- 仅修改 `OverviewGenerationService.java` 与相关 `AiOverviewServiceTests.java`，不重构已验证的 Source 生成、Usage Guard、HTTP 取消或线程调度。
- 能装下的 Subject 请求保留原直接生成路径；较大输入按章节、section、overview / key point / learning path 等语义片段分包，单个超大片段再按 code point 拆分，保留完整所选资料。
- 分包使用实际 JSON 转义后的完整 SYSTEM + USER 长度，不提高 12000 限额、不截断资料。三个 mode 保留各自选择的输入和最终 nullability。
- 大请求沿同一个 task scope 与 deadline 做有界 MAP 和既有分层 REDUCE，保持 intermediate 5200 字符、自配对 fit、reduce 严格进展及全部用量 / 调用次数约束。
- 包内 alias 白名单必须包括片段所属 Source 与明确合法的跨 Source 引用；最终映射才返回真实 UUID，不引入原文 / 凭据日志。
- 不改公开 DTO、数据库或配置；API 文档更新内部处理语义。

## 执行与验收

实施中审查发现摘要列表在递归拆分时复制其余字段的风险；唯一 reviewer 的静态 IMPORTANT 记录保留为 `reviewer_interim_92f043.md`。随后执行代理发现 copy 保留旧时间戳导致 scratch 的增量 Maven 使用先前编译产物：此前归于 `92F043…` 的 6 / 58 项 GREEN 及 51-fragment RED 不能作为该版本运行证据，原输出保留并作失效说明。最终验收必须使用清理后的全新编译、对应 source / class hash 和修复后的有界分片回归；不能以源文件 hash 相同替代实际编译证明。

- [x] 保存当前 HEAD `7beb3e66669b6e9f86a87ca74689930ed02d6897` 和 222 条 dirty / untracked 路径 hash，保护既有及并行修改。
- [x] Luna 执行代理分别排查 backend、运行态与 PC，提供真实命令与退出码；受控合法大输入复现已完成。
- [x] 主树修改前的受控回归 RED、最小实现及相关隔离 GREEN，保存完整日志 / Surefire / source hash / task delta。
- [x] 唯一只读 reviewer 检查正确性、alias、分片完整性、mode、预算 / 取消和回归边界；最终 0 BLOCKER / IMPORTANT / OPTIONAL。
- [x] 回写 Backend、API、Status、Issues、Changelog 与本入口；确认无新增格式错误、文档链接可解析及工作树保护。
- [x] 本机 backend 更新前核对活动任务 / reservation / ingestion 安全门禁，仅替换 backend 并验证健康和部署产物；数据库及 MinIO 保持。
- [ ] 用户真实 Provider / GUI 重新生成验收。受控模型测试、健康和部署字节码不能替代业务验收。

证据目录：`D:/Temp/auralis-subject-overview-validation-20261012/`。上一轮 [额度排除与放宽](2026-10-12-embedding-quota-exemption-and-test-limits.md) 保持现行策略；本轮 prompt 拒绝与窗口额度不同。

## 最终实现与命令证据

最终实现按 section 及 summary 的 overview / keyPoint / learningPath 分配独立语义片段，仅重复必要标题上下文；大单字段按 code point 与实际 JSON fit 拆分。每个 source / 字段 / 二分 probe / 批次规划检查同一个绝对期限，出站仍经现行 `invoke()`、task scope、Gateway 和 reducer。Subject MAP 仅在 INTERMEDIATE 附加既有 compact `<=3600` 指令，FINAL 使用最终输出策略；两种阶段由受控 RED 验证后修复。

隔离工作目录 `D:/Temp/auralis-subject-overview-validation-20261012/backend/subject-repro-scratch` 执行 `D:/CodeBase/Active/Auralis/Auralis-Server/mvnw.cmd -B -ntp clean test '-Dtest=AiOverviewServiceTests,AiInvocationGatewayTests,OverviewBudgetIntegrationTests'`。日志确认删除 scratch target 并全新编译 330 main / 107 test 源文件，Maven `BUILD SUCCESS`；Surefire 61 + 10 + 2 = 73，失败 / 错误 / 跳过均 0。最后包装器未保留 shell session / exit_code，所以 shell 退出码不可独立确认，不推定为 0。测试结果由完整 Maven 和 Surefire 输出支持，详见 `backend/final-fresh-report.md`。

主树与 clean-tested scratch 的两份源文件精确一致：Service `D31243C096FCA95AD9D9FF6B8DA77B8290542EC7E05C5C5BC3B6D1DCA0D49758`，测试 `851405F8221A7AD98869C929EA5BD25583CF79044A6ECEC3B5B50100B00A01A3`。fresh class 分别为 `1AC2FBB4F76B6CAAE22893605B2DF18230470742425F529C1EC435C7B11B5416` 与 `E185CD2A68B9D58E2B42A9E1E05AD08E4EDC6D9429E7A54630EBE40EED474CE7`。同一 reviewer 的最终报告 `reviewer_report.md`（SHA-256 `3C2BFF84FBECCAF6CF89FD729D8099BE6A33D199F9B5E4BBA3ABC860CAF9F1B7`）结论 0 B / I / O；前两项 IMPORTANT 及元数据更正保留独立 interim / v1。

有界新编译 RED 在 `92F043…` 版本中第 65 次序列化主动停止，累计处理 711124 UTF-16 字符，约 1.4 万字符的合法摘要未触 Provider；退出码 1，耗时 1.587s。最终回归检查分配后的 overview 与各 key point 恰好一次、规划工作量受控，以及规划期限、三个 mode、转义、跨 Source alias、请求取消与用量。此前 `112B…` 72 项验证材料保留于 `backend/interim-112b-45830-72/`，与最终 73 重叠且源码不同，不相加。

## 本机部署与最终核对

香港 2026-10-12 13:57:23，仅 backend 更新为容器 `e3e0eb194296512f1d426ca68201361e4f39e4e7de4c434dd38eeed7828a56cc`、镜像 `sha256:a5a50bb7ae02cb1cc93a3e17a46b2515552f4e434b50b9a5764cf8bfabf541f2`。`docker compose --env-file .env build --progress plain backend` 与 `docker compose --env-file .env up -d --no-deps --force-recreate backend` 均有实际退出码 0；13:57:57 运行快照 healthy / readiness HTTP 200。旧 `31f7dec…` 镜像保留于 `auralis-backend:rollback-subject-overview-prompt-batching-20261012`。

替换紧邻门禁为有效 TASK lease / live RESERVED / PARSING 或 INDEXING 均 0；短只读事务使用 2000ms statement timeout。db / MinIO 容器与卷身份未变且 healthy，Flyway 仍 V31，无新迁移或历史记录回写。构建前后 474 份 Server / Docker 输入 hash 零漂移，真实 `.env` hash 与 HEAD 保持。运行额度为个人 1000000 / 小时、2000000 / 日，系统日 2000000、并发个人 2 / 全局 4，prompt 默认 12000、总览期限 240000ms。

从部署 JAR 提取的 `OverviewGenerationService.class` 与上述 fresh scratch hash 精确匹配；`AiUsageGuard.class` 仍为 `70FE84563ACA60E0BB6B135B828266DC29D54CA164F0822201652B7E947A9B30`，现行 embedding 排除策略保留。完整部署命令、退出码、门禁和快照见证据目录 `deploy/deployment-report.md`。本轮没有调用真实 Provider / AI API，也未完成桌面端生成验收。

最终主树核对见 `root-final-audit.json`：两份代码 / 测试与已测 hash 一致；本次文档与代码增量没有新增格式错误、文档本地链接可解析，既有任务范围外修改保持。整体 scoped `git diff --check` 的既有 Issues 文末空行单独留证，不写成全树检查通过。

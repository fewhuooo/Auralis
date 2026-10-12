# PC 任务截止日期与排期一致性修复

日期：2026-10-09

状态：2026-10-10 主树代码、相关自动验证与只读审查通过；真实环境验收和 C 盘临时副本清理仍未完成。

## 已确认问题与范围

1. IMPORTANT：`parseDueTimestamp` 将带时区的午夜和日末时间戳重新解释为字段日期的本地日末。前端放置校验可能通过，Server 却按任务已保存的真实 instant 拒绝。
2. IMPORTANT：创建弹窗、Store 纯日期归一化及资产库编辑将选中日期拼成 UTC 日末。香港时区比用户选中的本地日末多八小时；资产库直接截取 UTC 日期也不能正确显示其他时区的本地日期。

审查证据：`%TEMP%/auralis-timeline-due-day-audit-20261009/report.md`、`store-api-harness.mjs` 及 HK/Shanghai 日志。实际 Store/Repository 和 API adapter 复现不等于真实 Server HTTP 验收。`schedule-insertions` 请求不含 dueAt，Server 从既存 Task 读取截止时间。

## 用户确认的处理

- 日期选择器的 `YYYY-MM-DD` 仅在输入边界转换为本地当天 `23:59:59.999` 对应的 UTC ISO instant。
- 已有带时间及偏移的截止值按真实 instant 读取、比较和保存，不从午夜或 UTC 日末推断全天语义。
- 完整任务区间必须结束于截止时刻或之前，恰好结束允许；越过截止拒绝。
- 资产库编辑按本地日期显示截止；未改日期的非时间编辑保留原始精确截止 instant，实际修改日期才生成新的本地日末。
- 既有带时区数据不批量改写。旧日期输入产生的错误值可在资产库先清空截止日期、再重选日期并保存纠正；直接点击相同日期是否发出 change 未作 GUI 验收。

### 2026-10-11 用户追加要求：移除存储纯日期的兼容解释

- 截止值持久化契约仅接受带时区真实 instant；`parseDueTimestamp` 不再把读取到的 `YYYY-MM-DD` 当作当地日末，也不接受无时区值作为真实 instant。非空无效/无时区截止值会阻止新排期，不作为“无截止”放行。
- `localDateEndOfDay` 仍仅服务于 TaskCreateDialog、Store 与资产库明确的用户日期输入边界；这不是对旧数据的回填或兼容读取。
- 测试数据注入说明新增提醒：注入时提交带时区的精确截止值；若表达当天截止，按目标用户时区先转换为当地日末；排期完整结束不得晚于该 instant。按槽插入使用既有截止值校验，不自动修复旧任务。
- 不批量修正旧任务，不更改 Server/API/数据库字段与迁移。本次改动未修改用户任务数据。
- Store 按天排期、读取和自动完成保留旧截止值；资产库未触碰截止日期时即使保存请求携带原值也不归一化。定向 Store/截止规则测试 92/92、`npm run type-check` 退出码 0；只读审查 BLOCKER/IMPORTANT/OPTIONAL 均为 0。构建和 GUI 未执行。

## 执行与工作树保护

- Luna 执行代理管理 Antigravity MCP，先计划再实施。隔离工作树必须包含主工作树当前 PC 和现行文档快照，不能仅从 HEAD 恢复旧实现。
- PC 源码允许范围：`taskViewRules.ts`、`useTaskStore.ts`、`TaskCreateDialog.vue`、`Asset/index.vue` 的截止相关函数、导入和保存调用。
- 测试允许范围：现有任务规则、Store 排期、创建弹窗测试；必要时增加一个任务截止集成测试。
- 主 Agent 审查完整产物与差分，确认无依赖、生成文件、删除或跨模块写入后，按原文件 hash 守卫应用。
- 保留当前 Asset 界面、其他用户未提交改动、已有删除、分支、HEAD 和索引；不提交或部署。

## 验证与关闭条件

1. 修改代码前实际运行失败回归，覆盖原本不一致的时间语义。
2. 在 HK、UTC 与一个负偏移时区验证创建/编辑/Store/Repository/outbox 保存本地日末、精确午夜与偏移保留、截止相等通过、晚于截止拒绝及拒绝无副作用。
3. 执行相关测试、PC 全量 R4、type-check、相关静态检查与生产构建。已有范围外门槛失败单独登记，不修改无关代码。
4. 一名独立只读 reviewer 检查 correctness、requirement、race 与 data integrity；必要问题关闭后回写现行文档。
5. 真实 GUI、Tauri、HTTP 与运行服务未作为本轮自动验证的一部分；不将命令通过写成业务验收。

## 完成记录

- Antigravity MCP 计划委派实际已调用，首个请求返回 `FAILED_PRECONDITION: User location is not supported for the API use`（exit 3），没有生成改动；保留失败证据，不绕过地区限制。Luna 按已授权范围继续在隔离工作树直接实施。
- 初始快照目录：`%TEMP%/auralis-deadline-fix-20261009`。复制隔离树期间 C 盘空间耗尽，主树源码未修改；停止该副本并转至 `D:/Temp/auralis-deadline-fix-20261009/repo` 独立 detached clone（HEAD 保持 `ed08697c`），按非忽略文件清单物化，共享已有依赖。后续证据保存于 D 盘对应任务目录。
- 本轮 C 盘副本 `C:/Users/Gnasche/.agy-mcp/delegations/wt-0112066a` 已注销 worktree 注册，但删除遇到 `Filename too long`（exit 255）；后续 PowerShell 对已核实单一目录的删除被 command runner 以 `blocked by policy` 拒绝，未执行。没有绕过该拒绝，目录仍残留、C 空闲仍为零，需单独清理；不是修复/验收已完成事项。原始错误见 D 盘 `report.md`。
- 独立只读 Luna reviewer 校验最终七文件与 patch `A398624E189C050B02090B510FA23A89762B2E867FF264FFCD285035A518A877`，BLOCKER=0、IMPORTANT=0。一个 OPTIONAL 是 UI 测试提取函数并注入转换 stub、未挂载 Element Plus；共享真实 helper 和 Store/Repository/outbox 有回归，真实 GUI 独立待验收。

### 主树应用与验证（2026-10-10）

执行代理在每文件写入前后核对原始/目标 hash，仅应用已审查七路径。主 Agent 审阅完整差分、实际日志与最终守卫。主树 HEAD `ed08697c195aefe593e456c5f58802f8f5b39a85`、分支 `codex/subject-review-stats`、空索引树 `2c554747cf40761a851be13cc6771e66097b41ac` 保持。316 条非忽略 PC 基线路径扣除七项授权替换后，意外漂移/缺失/新增均为零；Home/Settings 仍为用户已有删除。未提交、暂存或部署。

以下命令工作目录为 `D:/CodeBase/Active/Auralis/Auralis-PC`；日志与完整报告在 `D:/Temp/auralis-deadline-fix-20261009/`。首次未指定 D cache 的 type-check 因 C 盘 ENOSPC 失败；后续 npm 命令设置如下，日期子集使用实际执行的 pattern：

```powershell
$env:npm_config_cache='D:\Temp\auralis-deadline-fix-20261009\npm-cache'
$pattern='date-only|timestamp deadlines|Store rejects exact|TaskCreateDialog|Asset task deadline'
```

| 实际命令 | 结果 | 日志 |
| --- | --- | --- |
| `$env:TZ='Asia/Hong_Kong'; node --experimental-strip-types --test scripts/r4-task-view-rules.test.mjs scripts/r4-task-store-schedule.test.mjs scripts/r4-task-create-dialog-deadline.test.mjs` | exit0，95/95 | `main-green-focused-hk.log` |
| `$env:TZ='UTC'; node --experimental-strip-types --test --test-name-pattern=$pattern scripts/r4-task-view-rules.test.mjs scripts/r4-task-store-schedule.test.mjs scripts/r4-task-create-dialog-deadline.test.mjs` | exit0，7/7 | `main-green-deadline-utc.log` |
| `$env:TZ='America/Los_Angeles'; node --experimental-strip-types --test --test-name-pattern=$pattern scripts/r4-task-view-rules.test.mjs scripts/r4-task-store-schedule.test.mjs scripts/r4-task-create-dialog-deadline.test.mjs` | exit0，7/7 | `main-green-deadline-negative.log` |
| `npm.cmd run type-check` | exit0 | `main-type-check.log` |
| `$env:TZ='Asia/Hong_Kong'; npm.cmd run test:r4-pc` | exit0，669/669 | `main-test-r4-pc.log` |
| `npm.cmd run build -- --outDir 'D:\Temp\auralis-deadline-fix-20261009\main-build-dist'` | exit0，renderer资产47/47；既有构建warning保留 | `main-build.log` |

隔离树另运行 `npm run check:r4-pc`，exit1，唯一失败为未修改 Rust `local_asset_store.rs` 固定本地地址扫描；既有问题没有改动或绕过，主树不重复该失败门槛。PC 无 lint script。构建输出位于 D TEMP，原 PC dist 保持；tsbuildinfo 前后相同，没有依赖、生成文件或额外删除变更。完整红/绿日志在上述目录的 `repo/`，主树命令日志在目录根；保护证据为 `main-final-guard.json` / `applied-file-hashes.csv`。

实际动态 Store 测试导入现行 Store/Repository/outbox；API adapter 仅模拟 TaskService 严格比较，不证明真实 HTTP。三种时区覆盖本次截止子集，未把 UTC/LA 结果写成全部旧时间轴用例通过。业务验收仍需真实 GUI/Tauri/运行服务；没有部署变化。

### 后续用户要求的复习入口只读核对

用户随后要求确认学习/复习/主动复习入口。核对期间复习 Pane、Store 和测试发生外部更新；保留其改动，截止七路径最终 hash 仍与已应用产物一致，分支/HEAD/空索引保持。新 guard `D:/Temp/auralis-deadline-fix-20261009/root-final-guard.json` 将这三个路径明确列为外部漂移，不能再把先前 316 路径零漂移推广为最新全树状态。复习最新相关 98/98、type-check 退出 0，主动入口真实本地反馈探针通过；该只读检查没有修改复习源码，其证据在独立 `D:/Temp/auralis-review-three-entries-audit-20261010/`。

收尾环境复核：上述 C 盘零空闲为失败发生时记录；最终 `Get-PSDrive C` 为 188,252,160 bytes 空闲，`Test-Path` 确认本轮 C 临时副本仍残留。清理尚未完成，不将其他进程释放的空间记成本轮删除成功。

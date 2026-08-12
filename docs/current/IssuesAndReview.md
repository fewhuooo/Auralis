# Auralis 当前问题与审查登记

更新时间：2026-08-12

文档状态：现行风险登记

权威范围：尚未关闭的工程风险、证据、影响、处理动作和关闭条件

事实来源：当前代码、配置、模块/契约文档与本轮验证结果

## 使用规则

- 只登记未关闭问题；已确认完成的变化进入 Changelog。
- 每项必须可追溯到代码、配置、命令或人工观察。
- 关闭问题必须写出新证据，禁止仅因代码存在而关闭。
- 优先级：P0 为安全/数据不可逆，P1 为主流程或发布阻断，P2 为重要体验或维护风险。

## P1 风险

| ID | 问题 | 证据 | 影响 | 处理动作 | 关闭条件 | 领域 |
| --- | --- | --- | --- | --- | --- | --- |
| P1-Backend-Contract-Cutover | 新后端保留 `/api` 前缀但不兼容旧 DTO、状态码和行为，三端仍依赖旧契约 | `docs/contracts/API.md`、`docs/contracts/ObjectModelMatrix.md`；阶段 0 仅开放健康和文档路径 | 新后端启动后，旧前端不能直接完成登录、同步、资产、AI 等主流程 | 先稳定业务 OpenAPI 和对象矩阵，再独立生成 SDK、迁移本地模型并逐端联调 | PC、Mobile、Tablet 目标流程全部使用新生成契约且联调证据齐全 | Frontend/Backend |
| P1-Backend-Docker-Gate | 阶段 0 未执行 Docker、PostgreSQL/pgvector、MinIO 和 Testcontainers 验收 | `docs/plans/backend-greenfield-phase-0-plan.md` 阶段 0 完成定义；本轮仅验证 JVM HTTP 服务 | 单元测试和启动 smoke 不能证明迁移、对象存储、向量检索和 Compose 可用 | 完成业务代码阶段后启动 Docker Desktop，运行 Testcontainers 与最小 Compose 验证 | PostgreSQL/pgvector、MinIO、Server 的集成与健康检查均有退出码 0 证据 | Backend/Infra |
| P1-Backend-Phase1-Identity | 阶段 0 没有 User、Device、RefreshSession、认证或用户隔离实现 | `docs/contracts/ObjectModelMatrix.md`、`docs/contracts/Database.md`；新 Server 当前无业务 Controller | 后续业务接口若先于身份边界实现，可能造成跨用户读取、写入或 token 风险 | 阶段 1 先落 Flyway V1、User、RefreshSession、Device、认证和 Repository userId 约束 | 注册、登录、刷新 rotation、退出、账户切换和跨用户拒绝均有自动测试 | Backend/Security |
| P1-Auth-Guard | PC 登录守卫临时直接 `next()` | `Auralis-PC/src/router/index.ts` | 未登录可打开受保护页面 | 恢复 `useAuthStore` 守卫并测试所有跳转 | 未登录、登录、刷新、退出自动测试/人工证据齐全 | PC/Auth |
| P1-Test-Coverage | 当前只有阶段 0 基础协议测试，业务安全、同步、删除和资产尚无回归保护 | `Auralis-Server/src/test` 的 4 个测试类覆盖 5 个断言组；无业务 Controller | 业务实现若缺少隔离、冲突、上传和同步测试，仍可能回归 | 阶段 1 起建立 Auth、隔离、Sync、Asset、WS 和领域服务测试 | CI 或本地测试执行到真实业务断言并保留报告 | Backend |
| P1-Delete-Semantics | 目标 DELETE 与 mutation 软删除尚未实现和验证 | `docs/contracts/Database.md` 同步不变量；阶段 0 无业务写入路径 | 已删除数据可能在冷启动/多端重现 | 按墓碑、change_log、inbound mutation 设计实现删除状态机 | CRUD、push/pull、冷启动、多端 delete 一致 | Sync/Data |
| P1-Asset-Verification | 目标 Asset 上传完成和对象实体验证尚未实现 | `docs/contracts/API.md`、`docs/contracts/Database.md`；阶段 0 无 MinIO 接入 | 后续实现若只信任客户端元数据，可绑定不存在或伪造对象 | 服务端 HEAD/stat 并校验对象归属、大小和 MIME | 跨用户、伪造 object、大小/MIME 测试通过 | Asset |

## P2 风险

| ID | 问题 | 证据 | 影响 | 处理动作 | 关闭条件 | 领域 |
| --- | --- | --- | --- | --- | --- | --- |
| P2-Task-Model-Cutover | Task 的 status、sortKey、durationMinutes 和时间字段尚未从端侧模型落地到新实体 | `docs/contracts/ObjectModelMatrix.md`、`docs/contracts/Database.md` | 排序、排期和同步字段可能在迁移时漂移 | 阶段 1 固化 Entity、DTO、API 和端侧映射 | 字段往返、排序和同步测试通过 | Data/Sync |
| P2-Relation-Isolation | Relation 的端点类型、同用户校验和端点删除语义尚未实现 | `docs/contracts/Database.md` Relation 与同步不变量 | 关系可能跨用户或在端点删除后残留 | 在领域命令与 Repository 层同时校验 userId 和墓碑 | 跨用户关系访问被拒绝，删除/恢复行为符合契约 | Backend/Data |
| P2-Mobile-BaseUrl | Mobile Auth/WS 使用 localhost/127.0.0.1 | Mobile Store/API | 真机无法访问开发服务 | 使用平台环境配置 | 模拟器、真机、生产地址均验证 | Mobile |
| P2-Mobile-Contract | Mobile 多数页面依赖端侧数据，未接完整 Server API | 页面 API 映射 | 多端功能完成度易被误判 | 标注 local-only，逐步定义契约 | 主流程页面来源与同步一致 | Mobile |
| P2-Tablet-Validation | Tablet 多栏和手写缺真机验证 | 页面、feature flag、脚本 | 触控和长时间使用风险 | 设备走查与专项记录 | 指定设备清单全通过 | Tablet |
| P2-PC-Subject-Icon-Validation | PC 新建学科线条图标与已有 Emoji 的实际显示未做 GUI 验收 | `src/utils/subjectIcon.ts`、`AppSidebar.vue`；2026-07-14 `check:subject-icons` 与生产构建通过 | 线条图标的尺寸、对齐、统一 Sage Green 底色或选择态可能异常，已有 Emoji 可能在个别入口未保持原样 | 在浏览器或 Tauri 中检查既有学科及新建学科，覆盖全局功能侧栏 | 新建线条图标与统一底色、既有 Emoji、空值/未知语义键三类均显示正确且可操作 | PC |
| P2-PC-Workspace-Prototype-Validation | 学科大纲编排与文件总结目前仅为静态交互原型，且 PC AI 伴读尚未进行 GUI 验收 | `SubjectWorkspace/index.vue`；2026-07-14 `check:subject-workspace` 与生产构建通过 | 刷新后编排丢失；浏览器中的拖拽手势、三栏尺寸、AI 星环/三点动效、窄栏换行和深色主题仍可能有问题 | 确认持久化模型后接入 Store；在浏览器/Tauri 验收文件选择、章节排序、小节边界与 AI 右栏 | 指定原型范围获确认或持久化完成，且 GUI 验收记录通过 | PC |
| P2-PC-Frontend-Refactor-Validation | PC 近期页面重构（Pomodoro、Timeline、Asset、Dashboard 与全局导航）尚未完成跨页面 GUI 验收 | 最近 PC 提交与 `Auralis-PC/src/views/`、`src/components/`；2026-08-12 构建与两个静态契约检查通过，但未做 GUI | 宽屏布局、任务计时、弹窗、删除操作和导航图标可能存在只在浏览器/Tauri 中暴露的回归 | 按正式路由逐页走查主要任务和失败/空状态 | PC Web 构建通过，且 Dashboard、Subject、Asset、Timeline、Pomodoro、Profile 主流程 GUI 记录通过 | PC |
| P2-PC-Bundle-Size | PC 生产构建存在大 chunk 警告 | 2026-08-12 `npm.cmd run build`：`Asset-B7Y2PPYt.js` 约 595 kB，Vite 提示部分 chunk 超过 500 kB | 首屏加载和缓存粒度可能受影响 | 评估 Asset、Element Plus 等依赖的拆包与懒加载策略 | 关键入口 chunk 达到团队阈值，或形成明确的警告接受记录 | PC/Performance |
| P2-Migration-Strategy | 新后端尚未创建 Flyway V1，数据库升级/回滚门禁尚未执行 | `docs/contracts/Database.md`；阶段 0 明确不引入 datasource/Flyway | 生产升级/回滚仍不可预测 | 阶段 1 只针对干净新库引入单一版本迁移方案并演练 | 干净库升级、回滚和备份恢复均有证据 | Data/Infra |
| P2-Infra-Readiness | 无 CI、监控、告警、正式备份演练 | 仓库现状 | 发布与恢复门禁不足 | 建流水线、指标、备份恢复 | 发布演练和告警测试 | Infra |
| P2-Mobile-Build-Warning | Mobile H5/微信构建有动态/静态 import 与 Sass legacy API 警告 | 2026-08-12 `build:h5` 与 `build:mp-weixin` 输出 | 未来打包与 Sass 升级可能出现行为或兼容性问题 | 明确 `useSyncStore` 的加载策略，升级/替换 Sass legacy API | 构建无对应警告，或有记录的接受决定 | Mobile |

## 审查结论

- 2026-08-12：后端阶段 0 已完成仓库外备份、精确路径替换、Boot 4.1 / Modulith 骨架、12 个模块边界、Problem Details、健康检查、OpenAPI 和 5 个自动化测试；业务模块、数据库和基础设施仍未开始实施。
- 新后端继续使用 `/api` 只代表保留总前缀，不代表旧客户端兼容。OpenAPI 和对象差异矩阵完成前，禁止声明前后端已可直接联调。
- 旧 Server 的 AuthInterceptor、WebSocket 握手/心跳审计、资产用户前缀校验只属于替换前盘点，已移至仓库外备份；新实现不得将其视为已迁移能力。
- PC、Mobile/Tablet 近期视觉与布局改动属于用户工作树成果，文档已在归档快照保留；最终构建结果须与当前代码一起记录。
- 不应依据 StudyCore 归档恢复旧目录、旧路由或旧任务。
- 2026-07-10：PC Web、Mobile H5、微信小程序、Tablet 侧栏检查和旧 Server Maven 生命周期均通过；该旧 Server 结果已被阶段 0 替换，新后端另有独立测试证据。
- 2026-07-14：PC 新建学科改为语义线条图标，已有 Emoji 不迁移；`npm.cmd run check:subject-icons` 与 `npm.cmd run build` 通过，仍需 P2-PC-Subject-Icon-Validation 所列 GUI 验收。
- 2026-07-14：PC 学科工作区右侧 AI 伴读已复刻手机端四芒星、星环、气泡、三点输入中状态和纯文本胶囊输入；`npm.cmd run check:subject-workspace` 与 `npm.cmd run build` 通过，仍需 P2-PC-Workspace-Prototype-Validation 所列 GUI 验收。
- 2026-08-11：PC 已加入 Pomodoro 页面并继续收敛 Dashboard、Timeline、Asset、全局导航和工作区交互；Mobile/Tablet 已更新平板热力图自适应布局与品牌渐变，代码变化已记录在 Changelog，仍需当前构建与 GUI/真机验收。
- 2026-08-12：PC 学科图标、工作区静态契约检查和生产构建均通过；移除弃用 `baseUrl`、删除未使用 `ElMessage` 导入后，Vite 仍提示大 chunk。Mobile H5、微信小程序构建与 Tablet 侧栏检查通过，保留既有非阻断警告，未进行 GUI/真机验收。

## 推荐关闭顺序

1. 建立新后端 Identity、User/Device/RefreshSession 和用户隔离测试。
2. 创建 Flyway V1 与核心领域对象，实现新 OpenAPI 业务路由。
3. 完成删除、冲突、墓碑和同步回归。
4. 完成资产对象实体验证及 pgvector/AI 安全测试。
5. 生成客户端后再进行 WebSocket 与多端联调。
6. 完成 Docker/基础设施集成、PC GUI、CI、备份、监控和发布演练。

## 更新方式

新增风险时必须提供 ID、优先级、证据、影响、动作和关闭条件。关闭后移除该表并在 Changelog 记录可确认变化；历史讨论不留在本文件。

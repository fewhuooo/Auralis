# Auralis 当前问题与审查登记

更新时间：2026-07-14

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
| P1-Auth-Guard | PC 登录守卫临时直接 `next()` | `Auralis-PC/src/router/index.ts` | 未登录可打开受保护页面 | 恢复 `useAuthStore` 守卫并测试所有跳转 | 未登录、登录、刷新、退出自动测试/人工证据齐全 | PC/Auth |
| P1-Test-Coverage | 后端无实际测试源码 | `Auralis-Server/src/test` 为空 | 安全、同步、删除和资产无回归保护 | 建立 Auth、隔离、Sync、Asset、WS 测试 | CI 或本地测试执行到真实断言 | Backend |
| P1-Delete-Semantics | 直接 DELETE 与 mutation 软删除未形成已验证统一语义 | Controller、Sync、localDb 删除路径 | 已删除数据可能在冷启动/多端重现 | 定义删除状态机并实现/测试 | CRUD、push/pull、冷启动、多端 delete 一致 | Sync/Data |
| P1-Asset-Verification | 资产 bind 未验证 MinIO 对象存在、真实大小、MIME | FileStorage/Asset 实现 | 可绑定不存在或伪造元数据对象 | 服务端 HEAD/stat 并校验元数据 | 跨用户、伪造 object、大小/MIME 测试通过 | Asset |
| P1-AI-Prod-Config | 生产 profile AI 配置口径与主配置不一致 | `application-prod.yml` 使用 `spring.ai.openai` | 生产模型配置可能不加载 | 统一 LangChain4j 键和环境变量 | production-like profile 实测加载模型 | Backend/Infra |

## P2 风险

| ID | 问题 | 证据 | 影响 | 处理动作 | 关闭条件 | 领域 |
| --- | --- | --- | --- | --- | --- | --- |
| P2-Task-Position | `task_block.position` DDL/Entity 漂移 | DbMigrationConfig 与 `TaskBlock.java` | 排序 API/同步可能丢失 | 同步 Entity、Mapper、DTO、API 和端侧 | 字段往返、排序和同步测试通过 | Data/Sync |
| P2-Relation-Tenant | BlockRelation 无直接 userId | `BlockRelation.java` | 关系跨用户隔离依赖间接校验 | 明确通过两端 block 校验或补 userId | 跨用户关系访问被拒绝 | Backend/Data |
| P2-Mobile-BaseUrl | Mobile Auth/WS 使用 localhost/127.0.0.1 | Mobile Store/API | 真机无法访问开发服务 | 使用平台环境配置 | 模拟器、真机、生产地址均验证 | Mobile |
| P2-Mobile-Contract | Mobile 多数页面依赖端侧数据，未接完整 Server API | 页面 API 映射 | 多端功能完成度易被误判 | 标注 local-only，逐步定义契约 | 主流程页面来源与同步一致 | Mobile |
| P2-Tablet-Validation | Tablet 多栏和手写缺真机验证 | 页面、feature flag、脚本 | 触控和长时间使用风险 | 设备走查与专项记录 | 指定设备清单全通过 | Tablet |
| P2-PC-Subject-Icon-Validation | PC 新建学科线条图标与已有 Emoji 的实际显示未做 GUI 验收 | `src/utils/subjectIcon.ts`；2026-07-14 `check:subject-icons` 与生产构建通过 | 线条图标的尺寸、对齐或选择态可能异常，已有 Emoji 可能在个别入口未保持原样 | 在浏览器或 Tauri 中检查既有学科及新建学科 | 新建线条图标、既有 Emoji、空值/未知语义键三类均显示正确且可操作 | PC |
| P2-PC-Workspace-Prototype-Validation | 学科大纲编排与文件总结目前仅为静态交互原型，且未进行 GUI 拖拽验收 | `SubjectWorkspace/index.vue`；2026-07-13 静态契约与构建通过 | 刷新后编排丢失，浏览器中的拖拽手势和三栏尺寸下的展示仍可能有问题 | 确认持久化模型后接入 Store；在浏览器/Tauri 验收文件选择、章节排序、小节边界与 AI 右栏 | 指定原型范围获确认或持久化完成，且 GUI 验收记录通过 | PC |
| P2-Migration-Strategy | 程序化 DDL 与单个 SQL 混用 | config + `V2__...sql` | 生产升级/回滚不可预测 | 引入单一版本迁移方案 | 干净库升级、回滚演练 | Data/Infra |
| P2-Infra-Readiness | 无 CI、监控、告警、正式备份演练 | 仓库现状 | 发布与恢复门禁不足 | 建流水线、指标、备份恢复 | 发布演练和告警测试 | Infra |
| P2-Mobile-Build-Warning | Mobile H5 构建有动态/静态 import 与 Sass legacy API 警告 | 2026-07-10 `build:h5` 输出 | 未来打包与 Sass 升级可能出现行为或兼容性问题 | 明确 `useSyncStore` 的加载策略，升级/替换 Sass legacy API | 构建无对应警告，或有记录的接受决定 | Mobile |

## 审查结论

- Server 的 AuthInterceptor、WebSocket 握手/心跳审计、资产用户前缀校验已在代码中存在；它们没有因缺测试而自动升级为“已验收”。
- PC、Mobile/Tablet 近期视觉与布局改动属于用户工作树成果，文档已在归档快照保留；最终构建结果须与当前代码一起记录。
- 不应依据 StudyCore 归档恢复旧目录、旧路由或旧任务。
- 2026-07-10：PC Web、Mobile H5、微信小程序、Tablet 侧栏检查和 Maven 生命周期均通过；后端仍无测试源码，GUI/真机/外部服务仍未验收。
- 2026-07-14：PC 新建学科改为语义线条图标，已有 Emoji 不迁移；`npm.cmd run check:subject-icons` 与 `npm.cmd run build` 通过，仍需 P2-PC-Subject-Icon-Validation 所列 GUI 验收。

## 推荐关闭顺序

1. Auth 守卫与后端 Auth/隔离测试。
2. 删除语义和同步回归。
3. 资产对象实体验证。
4. 生产 AI 配置统一。
5. WebSocket 与多端人工联调。
6. CI、备份、监控和发布演练。

## 更新方式

新增风险时必须提供 ID、优先级、证据、影响、动作和关闭条件。关闭后移除该表并在 Changelog 记录可确认变化；历史讨论不留在本文件。

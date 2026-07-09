# 当前问题清单与轻量代码审查

更新时间：2026-07-08

## 审查范围

本轮仅做轻量审查，不修改业务代码。依据：

- `docs/ProductRequirementsDocument.md`
- `docs/DevelopmentPlan.md`
- `docs/StatusIndex.md`
- 当前 PC 路由、Mobile 页面配置、后端配置、Docker Compose。

## 总体判断

项目已经具备 Spring Boot + Vue 前后端主干、Docker Compose 基础设施和 v3 中文文档体系。当前最大事实是：前端页面仍在重构中，所以 PC / Mobile 的构建通过不能等同于用户流程已验收。

## P0 / P1 问题

| 优先级 | 问题 | 证据 | 影响 | 建议 |
| --- | --- | --- | --- | --- |
| P1 | PC 登录守卫临时关闭 | `StudyCore-PC/src/router/index.ts:50-59` 直接 `next()` | 未登录也可访问 `requiresAuth` 页面 | 重构完成后恢复 `useAuthStore` 守卫，并验证登录/刷新/退出 |
| P1 | 后端缺少真实测试源码 | 当前状态为 `mvn test` 通过但无测试源码 | 安全和同步修复缺少回归保护 | 先补 Auth、Asset、Sync、MutationLog 测试 |
| P1 | 直接 CRUD 删除与同步软删除语义需统一 | 任务总表和状态索引均列为当前风险 | 多端可能出现删除状态不一致 | Controller 删除、MutationLog 删除、冷启动拉取统一软删除口径 |
| P1 | WebSocket 生命周期鉴权未验收 | `/ws/sync` 存在，但握手、心跳、token 过期断连仍待验证 | 长连接可能绕过 HTTP token 生命周期 | 增加握手鉴权和心跳 token 校验 |
| P1 | 生产 AI 配置口径不一致 | `application-prod.yml:10-13` 使用 `spring.ai.openai`，主配置使用 `langchain4j.open-ai` | 生产环境可能读不到预期模型配置 | 统一为 LangChain4j 配置键，并从环境变量注入 |

## P2 问题

| 优先级 | 问题 | 证据 | 影响 | 建议 |
| --- | --- | --- | --- | --- |
| P2 | Mobile 平板端需开展多平台真机走查 | `pages.json` 已完整注册平板端全部 9 个页面，与手机端完成极简禅意风格统一；首屏进场动画白屏闪烁与首次页面切换侧栏胶囊闪动已修复，侧栏动效已有 120ms / 160ms 两帧余量和路由优先初始化脚本检查；**平板学科工作区横向多栏顶部头栏高度已完全对齐统一为 120rpx；进入默认展示 `文件` 面板并呈现首个资料；总结由抽屉内彻底重构移入顶部开关 (`总结`)，通过纯 CSS `.drawer-collapsed` (`width: 0 !important`) 顺滑折叠左侧栏，消除 `v-if` 销毁重建与点击卡顿；去除了冗余 AI 伴读按键，将提炼卡片更新为提炼知识**；**AI 伴读悬浮窗已移入 `TabletLayout` 的 `<template #modal>` 插槽彻底跳出 transform 定位陷阱并优化了初始安全边距**；**平板与手机设置页的开关图标及图表等元素已全面统一至鼠尾草绿主题色 (`#7D9372`)**；`npm run build:h5` 通过 | 页面可达性、视觉风格与多栏联动缩放动效已稳定对齐，仍需真机触控验收 | 开展在微信小程序、App 等目标平台的真机运行与交互测试 |
| P2 | 平板旧页面废弃与整合已完成收口 | git 状态显示 `asset`、`timeline`、独立 `review` 已废弃或收归 | 导航与路由链路非常清晰 | 已在文档和侧边栏导航明确：`workspace` 承接了资产编排、正式笔记与全套卡片复习能力；`dashboard` 55:45 控制台承接了动态时间线与图表统计能力 |
| P2 | Tablet 手写首版已隐藏保留 | `workspace` 文件批注、学科独立手写笔记入口和 `tablet/handwriting` 随手记已统一到本地 `NoteDocument` / `tablet_notes`，但入口默认由 `VITE_TABLET_HANDWRITING_NOTES_ENABLED` 关闭 | 该能力暂不进入当前前后端主流程验收；后续重新启用时，真实触控屏下长笔迹、橡皮、撤销、平移缩放和文件切换恢复仍需验证 | 前后端主流程完成后再打开 feature flag，并按 `docs/plans/PlanTabletHandwritingNotes.md` 验收 |
| P2 | Docker Compose 使用默认密码 | `docker-compose.yml` 中 PostgreSQL、pgAdmin、MinIO 存在默认账号密码 | 不能直接用于生产 | 生产部署必须通过 `.env` 替换，部署文档已标风险 |
| P2 | CI/CD 尚未配置 | 未发现现成 CI/CD 配置 | 发布依赖人工 | 建立最小流水线：后端 test、PC build、Mobile H5 build |
| P2 | 历史 API 文档已移除 | 旧 `page_api_manifest.md` 当前不在工作区 | 历史接口来源不完整 | 如需参考可从 Git 历史恢复，现行接口以 `APIManifest.md` 为准 |

## 前端重构专项提醒

PC 当前路由：

- `/login`
- `/`
- `/subjects`
- `/subject/:id`
- `/asset`
- `/timeline`
- `/profile`

Mobile 当前注册页面：

- 手机端：home、pomodoro、ai-search、stats、settings、login、timeline、review、asset、profile、handwriting（共 12 个页面）。
- 平板端：dashboard（62:38全屏非滑动控制台）、subject-hall（大图卡片矩阵、已去除AI悬浮球）、workspace（四大支柱、调大左侧卡片并升级为 380rpx~45vw 弹性响应式抽屉架构、针对 CSS Flexbox 默认 min-width: auto 导致侧栏被内部横向滚动条或长文本撑破的问题增加 width/min-width/max-width/overflow 严格约束彻底解决文件选择框没有在框内和穿模穿入侧栏框的异常、精简标签与单行溢出保护防折行、文件操作项支持 Flex 自适应换行、总结大纲新增横向联动药丸选择器、主工作区新增响应式大屏文件详情与可手写标注专区（Photo/PDF Handwriting Stage）以照片和PDF为呈现主体、去除冗余卡片、精简头部按键为极简无表情符号样式、集成自研手写引擎和画布直接圈画批注、彻底解决文件点击无反应的问题、AI全屏自由浮窗支持顶部拖拽/左右下角描边手柄调大小且内部居中适配）、profile（3:7分栏）、ai-search（极简禅意圆角浮动双卡片架构：左侧 440rpx 宽历史记录侧栏且顶部内置“+ 开启新对话”按钮，支持会话列表切换与删除；右侧主对话区采用全屏响应式布局，彻底废弃 max-width: 1500rpx 定宽截断，全量采用 width: 100% 搭配 clamp 与分段 @media 响应式查询自动缩放边距与气泡比例，确保真正扩展到全屏且美观舒展；在 TabletLayout 中将左侧导航侧栏与底部独立悬浮 AI 按钮统一包裹进入 .left-nav-column Flex 垂直列容器中，彻底解决此前 position: fixed 独立定位导致侧栏与 AI 按钮未竖直居中对齐的问题，保证垂直中心轴绝对重合；多模态菜单已补充 bottom: 0 绝对锚定与透明度隔离修复悬浮遮挡）、pomodoro、handwriting、login（共 9 个专栏页面，全套大屏多栏架构重构与页面收归已完毕）。页面初次切换白屏闪跃（Tablet Flickering Fixes）、侧边栏首屏及路由切换白光闪动与图标底色闪烁问题已全量修复，并新增两帧余量与路由优先初始化回归检查。
- 平板端与手机端设计风格已完全同步为极简禅意（Zen Minimalist）体系。
- Mobile / Tablet 路由生命周期已解耦：`pages/launch/index` 仅在启动时做一次设备分流，运行中不再根据窗口尺寸跨端互跳。

重构验收时需要检查：

- 导航是否能到达所有新页面。
- 删除的旧页面是否仍被引用。
- Store 字段是否和新页面一致。
- API 调用是否仍指向现有后端接口。
- 页面状态是否覆盖 loading、empty、error、unauthorized。

## 当前建议执行顺序

1. 开展前端新页面的多平台真机交互与走查验收。
2. 暂缓 Tablet 手写笔记验收；前后端主流程完成后再打开开关继续。
3. 恢复 PC 登录守卫。
4. 补后端核心测试。
5. 统一删除语义。
6. 加固 MinIO 对象校验。
7. 验收 WebSocket 鉴权生命周期。
8. 清理生产配置和默认密码。
9. 建立最小 CI/CD。

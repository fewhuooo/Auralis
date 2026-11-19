# 历史原文快照

仅用于追溯，不是现行工程依据。原路径：`docs/planning/FrontendMobileTablet.md`。
原文字节 SHA-256：`05dacff4ab6d57a36980332aee6a8825ad0404b6ce609de71a28808fd5d3837b`。分界后的内容保留归档时工作树原文字节，原文相对链接按原路径解释。

<!-- ORIGINAL WORKTREE CONTENT -->
# Mobile / Tablet 前端计划

更新时间：2026-08-29

文档状态：现行计划

权威范围：手机/平板主流程、条件编译、端侧数据、真机和交互验收

事实来源：`modules/FrontendMobileTablet.md`、页面 API 映射、前端设计与当前风险

## 目标

让手机和 Tablet 在不跨端跳转、数据来源清楚、登录正确和触控可用的前提下完成主流程验收。

## 当前事实

- 手机 12 个启动/业务页面、Tablet 9 个业务页面已注册。
- 微信条件编译排除 Tablet。
- 2026-08-12：H5、微信构建和侧栏检查通过；仍有 Sass legacy API 等非阻断警告，开发者工具和真机尚待执行。
- Tablet 首页热力图已支持按周数自适应布局，当前使用 5 周日历网格；Hero Banner 已统一为 `Primary Gradient`。
- Mobile 多数页面以本地 Store 为主，真机 base URL 仍有风险。

## 有序任务

1. 验证 launch 分流、手机/Tablet 内部导航和 401 登录回退。
2. 把 Mobile base URL 改为环境化并在模拟器/真机验证。
3. 逐页标注和收口 local-only、Sync、AI、Asset、Stats 数据来源。
4. 验收 Home 新建日程、Timeline 排期、Pomodoro、Review、Stats。
5. 验收 Mobile AI 输入、流式/失败状态和上下文。
6. 验收 TabletLayout 导航、AI modal、Dashboard 多栏和 workspace 总结栏。
7. 运行并维护侧栏切换脚本；必要时为 feature flags/note core 接入可执行测试。
8. 在微信开发者工具、手机和横屏平板完成真实交互记录。

## 验证前置备注（2026-08-29）

本轮设备标识采用破坏性字段重命名：不保留旧 `deviceId` 字段，也不执行兼容测试。登录/注册请求使用 `clientDeviceKey`；服务端返回、Sync、本地数据 scope 和 Realtime 关联使用 `serverDeviceId`。Realtime ticket 不带请求体，测试必须使用有效 Bearer access token。

## 验证

```powershell
cd Auralis-Mobile
npm.cmd run build:h5
npm.cmd run build:mp-weixin
node scripts\check-tablet-sidebar-transition.mjs
```

再分别记录开发者工具、手机浏览器、目标平板触控结果。

2026-08-12 的命令行构建与侧栏检查已通过，不替代上述平台人工验收。

## 阻塞

- 后端同步、资产、AI 服务和真机网络配置。
- Tablet 手写入口关闭且尚无完整备份/恢复验证。

## 完成定义

- 手机与 Tablet 只在本端导航。
- 微信产物不含 Tablet 页面。
- 主流程页面的远程/本地数据来源明确。
- H5、微信、平板真实设备均有独立证据。

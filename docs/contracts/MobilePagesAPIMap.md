# Mobile / Tablet 页面 API 与数据映射

更新时间：2026-08-20

文档状态：现行，按代码确认

权威范围：手机和平板页面使用的远程 API、Store、端侧服务、本地 namespace 和未验收边界

事实来源：`Auralis-Mobile/src/pages.json`、页面 import、`src/api/`、`src/store/` 与 `src/services/`

## 全局网络、会话与本地数据

- `VITE_API_BASE_URL` 与 `VITE_WS_BASE_URL` 是必填运行时配置；微信只接受 HTTPS/WSS。生产代码不提供 localhost fallback。
- `requestCore.ts` 发送 Bearer token、接收直接 DTO/RFC Problem Details，并对并发 401 共享一次 refresh；refresh 请求本身禁止递归刷新。
- Auth 会话保存在 `auralis:auth:v2`，稳定设备 ID 保存在 `auralis:device:id:v2`；注册成功直接建立会话并进入对应端首页。
- H5 表键和原生 SQLite 文件按 userId/deviceId 使用独立 scope；reset 切换到新的 generation scope 后重建。用户已授权一次性删除旧全局 `h5_db_*`/`_doc/auralis.db` 业务表。
- Sync 使用 `/api/sync/push`、`/api/sync/pull?cursor=<opaque>`、`/api/sync/snapshot`；Realtime 先请求 `/api/realtime/ticket`，再连接 `/ws/events`，URL 和心跳不携带 access token。

## 手机页面

| 页面 | 远程 API / 数据入口 | 当前边界 |
| --- | --- | --- |
| Login | `POST /api/auth/register`、`login`、`refresh`，`GET /api/auth/me` | 注册密码前置校验至少 12 字符；服务端 fieldErrors 仍只显示通用 toast，尚未逐输入框映射 |
| Home | Task/Subject/Block Store → Sync push/pull/snapshot | 离线副本优先；服务端统计不由首页本地派生值冒充 |
| Pomodoro | Task Store → Sync | 后台、锁屏、跨日时间语义仍需真机 |
| AI Search | `POST /api/ai/conversations`、`POST /api/ai/messages/stream` | SSE 支持 chunk 边界、401 单次重试和稳定 clientRequestId；真实 Provider/断流未验收 |
| Stats | `GET /api/stats/overview`、`GET /api/stats/weekly` | 已移除随机演示数据；学科分布无对应统计契约时保持空，不伪造 |
| Timeline | Task Store → Sync | 拖拽保留 sortKey/startTime 映射；真实冲突 UI 待联调 |
| Review | `GET /api/reviews/due`、`POST /api/reviews/events` | 已移除示例知识块注入；服务端事件不可撤销，右滑不再伪造回滚 |
| Asset | `POST /api/assets/upload-intents` → 预签名 PUT → `POST /api/assets/{id}/complete` | 已移除模拟上传/失败伪成功；微信 upload 合法域名、MinIO 和大文件仍待验证 |
| Settings/Profile | Auth/Settings Store | 无独立 profile API；只显示当前会话用户数据 |
| Handwriting | 手写引擎与本地输入 | 不自动伪造 OCR；AI 转换失败不得丢失输入 |

## Tablet 页面

Tablet 页面由 `#ifndef MP-WEIXIN` 排除在微信产物外。Login、AI Search、Workspace AI、Profile BYOK、Task/Block/Subject Store 与全局 Sync 共享上述新请求边界；BYOK key 只通过 `PUT /api/ai/settings` 请求体提交，响应和本地缓存不保存明文。

| 页面组 | 当前数据边界 | 剩余缺口 |
| --- | --- | --- |
| Dashboard / Subject Hall / Workspace | Subject、Block、Task、Asset 与 Sync Store；Dashboard 使用 `GET /api/stats/overview`、`GET /api/stats/weekly`；AI 使用当前 Conversation/SSE | 真实服务、横屏触控与错误态仍需验证 |
| Pomodoro / Review | Task/Block Store；Review 使用 `GET /api/reviews/due`、`POST /api/reviews/events`，服务端事件成功后才推进卡片 | 前后台计时、弱网重试与真机手势仍需验证；右滑不撤销不可变事件 |
| Profile / AI Search | Auth、脱敏 AI settings、Conversation/SSE | 会话历史 UI 与服务端列表/删除尚未完整收口 |
| Handwriting | `tablet_notes`、NoteDocument、repository、handwriting engine | feature flag 默认关闭；不纳入云同步或当前发布阻断条件 |

## 启动与生命周期

`App.vue` 在已认证会话恢复后初始化当前 scope 数据库，先执行 snapshot/增量 Sync，再连接 Realtime；登录后启动，退出或隐藏时断开，重新显示时重连。网络恢复和 Realtime 的 `SYNC_CHANGED`/`REVIEW_UPDATED` 触发幂等同步。

## 自动证据与人工边界

- `npm run check:r4-mobile`：扫描生产路径并禁止旧 Result、固定本机地址、旧 `/ws/sync`、access token socket URL、旧数值游标和旧 AI 路由。
- `npm run test:r4-mobile`：runtime、Problem Details、refresh、device、Auth/Sync/Realtime route、scope、SSE 与 request core 协议测试。
- `npm run test:tablet`：三个 Tablet 逻辑脚本。
- `npm run type-check`、`build:h5`、`build:mp-weixin` 已通过。
- 上述证据不替代真实 Server/MinIO/Provider、微信 AppID/合法域名、开发者工具、浏览器、双设备、弱网和真机验收。

## 修改规则

页面新增或删除 API 调用、Store、Storage 键、端侧表或数据来源时必须更新本文件；接口变化同步 `API.md`，数据边界变化同步 `Database.md`。

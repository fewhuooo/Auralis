# Auralis 运维与应急 Runbook

更新时间：2026-07-10

文档状态：现行，部分流程待生产演练

权威范围：运行期诊断、恢复、备份与升级条件

事实来源：当前 Compose 服务、Server 配置、客户端请求/同步实现与已知风险

## 使用原则

1. 先识别影响范围，再修改状态。
2. 先保留日志、配置和数据证据，再重启或恢复。
3. 生产环境禁止尝试开发默认密码或把 secret 打到终端记录。
4. 数据操作必须先备份，递归删除必须验证绝对路径。
5. 无法证明安全时停止写入并升级处理，不做猜测性修复。

## 快速状态检查

```powershell
docker compose ps
docker compose logs backend
docker compose logs db
docker compose logs redis
docker compose logs minio
docker compose logs milvus
```

应用侧同时记录：时间、用户（脱敏）、端、页面、请求路径、HTTP/code、WebSocket 状态和最近同步 cursor。

## Server 启动失败

### 触发

Server 退出、`8080` 不监听或健康检查失败。

### 检查

- Java 21 与 Maven。
- 激活 profile。
- PostgreSQL、Redis、MinIO、Milvus 地址和凭据。
- 端口冲突。
- 数据库建表/ALTER 错误。
- LangChain4j 配置解析。

```powershell
cd Auralis-Server
mvn spring-boot:run
docker compose logs backend
```

### 恢复与成功判据

修正目标环境配置或依赖服务；Server 稳定监听 `8080`，Auth 可响应，受保护 API 无 token 时被拒绝。

### 升级条件

迁移失败、数据损坏、生产 secret 不明或需修改 schema 时，停止自动重启并升级给后端/DB 负责人。

## PostgreSQL 异常

### 检查

```powershell
docker compose ps db
docker compose logs db
```

检查磁盘、volume 权限、连接数、数据库名、用户和迁移日志。

### 恢复

- 连接错误先修复网络/凭据，不重建 volume。
- 迁移错误先备份并确认失败 SQL。
- 数据损坏按最近演练过的备份恢复。

成功判据：Server 能查询用户、块和任务，数据量与恢复点一致。

## Redis 异常

### 影响

缓存、同步辅助或 Stream 能力可能退化。

```powershell
docker compose ps redis
docker compose logs redis
```

确认哪些数据可重建，哪些承担事件传递。禁止在未知业务语义下直接清空 Redis。

## MinIO 上传失败

### 检查顺序

1. `9000` API 与 bucket 是否可用。
2. Server endpoint、access key、secret key、bucket。
3. 预签名 URL 是否过期。
4. objectName 用户前缀。
5. 文件大小、content-type 和网络错误。

```powershell
docker compose ps minio
docker compose logs minio
docker compose logs backend
```

成功判据：重新获取的预签名 URL 可上传，bind 后查询资产属于当前用户，且对象实际存在。

## Milvus / RAG 异常

### 检查

- etcd、MinIO、Milvus 三个服务状态。
- collection 名称与 dimension。
- embedding 模型输出维度。
- Server 日志中的连接、索引和查询错误。

```powershell
docker compose ps etcd minio milvus
docker compose logs milvus
docker compose logs backend
```

禁止只恢复 Milvus 单个 volume 后立即开放写入；etcd、MinIO 和 Milvus 必须保持一致恢复点。

## AI 接口失败

### 触发

chat/ingest 超时、401、模型不存在、无效 JSON 或空结果。

### 检查

- 激活 profile 和配置键。
- API key、base URL、model。
- 网络和提供商状态。
- 请求是否超过文件/上下文限制。
- `application-prod.yml` 是否仍使用错误的 `spring.ai.openai` 口径。

恢复后分别验证普通 chat、SSE、文本摄入和文件摄入。不得用一次 chat 成功推断全部 AI 路径可用。

## HTTP 401 / 403

### 检查

- Authorization 是否为 `Bearer <access-token>`。
- 是否错误使用 refresh token。
- token 是否过期、签名 secret 是否一致。
- 刷新请求 body 是否包含 refreshToken。
- PC 页面是否因守卫关闭而在未登录时仍可见。

### 恢复

先尝试一次合法 refresh；失败则清理本地 token 并返回当前端登录页。禁止通过关闭 Server 鉴权解决。

## PC 登录守卫异常

当前守卫代码临时直接 `next()`。若出现未登录可访问页面，这是已知客户端问题，不应误判 Server 鉴权失效。

恢复守卫时检查：

- `/login` 公开。
- `requiresAuth` 未登录重定向。
- 已登录访问 `/login` 的目标行为。
- 刷新后 Store 恢复。
- 退出后不能返回受保护页面。

## 同步不一致

### 收集证据

- 用户、设备/客户端 id。
- 实体 id、类型和操作。
- 本地 `sync_status`、`sync_version`。
- last cursor。
- push/pull 响应。
- WebSocket 连接和 token。

### 诊断顺序

1. 确认同一用户和正确 token。
2. 检查待 push mutation。
3. 检查 Server mutation_log 是否有当前用户记录。
4. 检查 pull afterId 是否前进。
5. 检查 delete 是否在客户端和 Server 采用同一语义。
6. 检查重复或乱序应用。

禁止直接 hard delete Server 数据作为同步修复。若涉及多个端，先暂停写入并导出诊断信息。

## WebSocket 异常

### 检查

- URL 是否为 `/ws/sync?token=...`。
- 反向代理是否允许 Upgrade。
- HTTPS 页面是否使用 WSS。
- PING 是否携带有效 token。
- Server 是否因 60 秒审计关闭连接。

成功判据：合法 token 握手成功、PING 得到 PONG、无效/过期 token 被关闭、退出后连接断开。

## Mobile 构建或运行异常

```powershell
cd Auralis-Mobile
npm.cmd run build:h5
npm.cmd run build:mp-weixin
node scripts\check-tablet-sidebar-transition.mjs
```

- 命令行失败先记录首个错误和 Node/npm 版本。
- 微信运行问题进入开发者工具检查合法域名、权限和条件编译产物。
- 真机 API 失败优先检查 `127.0.0.1` / `localhost`。
- Tablet 手写入口缺失可能是 feature flag 预期行为。

## 备份

必须协调备份：

- PostgreSQL 业务数据。
- MinIO 用户资产和 Milvus 对象。
- Milvus 与 etcd。
- 部署配置与 secret 的安全备份。
- 必要的客户端端侧笔记导出。

每次备份记录：时间、环境、提交、数据版本、工具、校验值、加密、保存位置、保留期和恢复负责人。

## 恢复

1. 明确恢复点和允许的数据丢失窗口。
2. 停止应用写入。
3. 保存故障现场。
4. 按依赖顺序恢复数据库、对象/向量服务和配置。
5. 启动 Server，再启动客户端入口。
6. 执行 Auth、数据、同步、资产和 AI 冒烟。
7. 对比数据量、cursor 和关键对象。
8. 记录实际 RPO/RTO。

当前仓库没有正式备份脚本和恢复演练记录，因此生产恢复仍是未关闭风险。

## 数据目录清理门禁

清理 `data/` 前必须：

- 输出并人工确认解析后的绝对路径。
- 确认路径位于仓库 `data/` 内。
- 确认备份可读取。
- 停止相关容器。
- 使用同一 PowerShell 会话和 `-LiteralPath`，禁止把路径传给另一 shell 拼接删除。

## 事件记录模板

```text
事件时间：
环境/版本：
发现方式：
影响用户与功能：
首个错误：
已保存证据：
处置步骤：
恢复时间：
数据影响：
根因：
后续任务与关闭条件：
```

## 升级原则

- 涉及凭据泄露、跨用户访问、数据丢失或不可逆迁移：立即 P0 升级。
- 涉及主流程不可用但数据安全：P1 升级。
- 单平台体验退化且有替代路径：P2 记录并排期。
- 无证据时不得把问题标为已恢复。

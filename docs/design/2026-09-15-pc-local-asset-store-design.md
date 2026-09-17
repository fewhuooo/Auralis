# PC Local Asset Store 本地优先文件资料库设计

更新时间：2026-09-15

文档状态：已批准设计，尚未实施

权威范围：PC Tauri 原始文件的本地持久化、离线导入、云端最终同步、统一读取、删除传播、完整性修复与安全边界

## 1. 背景

当前 PC 文件链路以 Server Asset 和 MinIO 为中心。刚上传的 `File` 只保存在
`useAssetStore` 的进程内 Map；应用重启、跨设备同步或内存记录消失后，预览和文档处理分别
通过 signed URL 下载并重新构造 `Blob/File`。SQLite 已保存业务投影、文档处理任务和 AI
总览派生缓存，但没有持久保存完整原始文件。

本设计把 PC 文件能力升级为本地优先资料库：文件一经导入即成为当前设备上的正式本地资料，
可以立即预览和解析；网络恢复后再幂等同步到 Server/MinIO。同步失败只影响云端状态，不撤销
已经成功的本地导入。

## 2. 产品语义

- Local Asset Store 是正式资料库，不是可自动淘汰的缓存。
- 所有导入文件最终同步到 MinIO，不提供仅本机文件模式。
- 断网时允许导入，导入成功后立即可预览和本地解析。
- 云端同步失败时保留本地文件和本地能力，并展示可恢复的同步状态。
- 应用升级、重启、登出和同步失败不得删除已经导入的原始文件。
- 用户删除 Source 后，各设备在确认对应 Asset 已无其他有效 Source 引用时删除本地副本。
- 磁盘不足时阻止新导入并提示用户处理，不自动删除既有资料。
- 首期只覆盖 PC Tauri；浏览器 fallback 不模拟持久文件仓库。

## 3. 身份模型

原始文件、业务资料和解析代次使用不同身份：

| 对象 | 身份 | 语义 |
| --- | --- | --- |
| 本地原始文件 | `userId + deviceId + localAssetId` | 当前 PC 导入并持有的完整二进制 |
| Server Asset | `userId + serverAssetId` | MinIO 中不可变的用户 Asset |
| Source | `sourceId` | 学科内的业务资料记录 |
| 本地内容代次 | `localSourceId + localContentRevision` | Server Source 建立前的离线解析代次 |
| Server 解析代次 | `serverSourceId + ingestionRevision` | ParsedDocument、索引和 Overview 的服务端仲裁边界 |

现行 `Asset` 是不可变对象；替换文件产生新 Asset。`Source.ingestionRevision` 可以在原始
Asset 不变时因重新解析而轮换，因此禁止把它用作原始文件版本或磁盘目录名。

离线导入生成稳定的 `localAssetId`、`localSourceId` 和 `localContentRevision`。联网后：

- `localAssetId` 显式映射到 upload-intent 返回的 `serverAssetId`；
- 若现有 Source 同步契约允许客户端资源 ID 直接成为 Server ID，保持
  `localSourceId == serverSourceId`；否则保存显式映射；
- Server 建立 Source 后返回权威 `ingestionRevision`，再将已有本地解析结果重新封装为
  ParsedDocument；不得为绑定 revision 重做 OCR。

## 4. 组件边界

### 4.1 LocalAssetRepository

只管理 SQLite 元数据、状态和映射，不读写文件。负责 owner/device-scoped 查询、状态转换、
引用检查和同步任务领取。

### 4.2 LocalAssetNativeStore

由 Rust 实现受控文件操作：staging、流式复制、流式下载、SHA-256、大小校验、flush/fsync、
原子 rename、文件存在性检查、删除和启动 reconciliation。路径完全由受控 ID 推导，前端不能
提交任意目标路径。

### 4.3 LocalAssetService

协调 SQLite 与 Rust，向业务层暴露：

```ts
importAsset(fileHandle, sourceDraft): Promise<LocalAssetHandle>
resolveLocalAsset(identity): Promise<LocalAssetHandle>
repairLocalAsset(localAssetId): Promise<LocalAssetHandle>
deleteUnreferencedAsset(localAssetId): Promise<void>
```

Preview、OCR、Parser 和重新解析只使用该服务，不自行获取 signed URL 或建立长期副本。

### 4.4 AssetSyncQueue

持久化离线 Asset 上传的阶段、尝试次数、下次重试时间、稳定远端 ID 和安全失败摘要。每个远端
步骤必须可以幂等重放，signed URL 与请求头只存在于当前内存调用。

### 4.5 LocalSourceDraftService

管理离线 Source、Asset 依赖以及本地/服务端身份和 revision 绑定。只有 Server Asset READY
后才允许提交引用该 Asset 的 Source mutation。

## 5. 本地目录

```text
Auralis AppData/
├── auralis.db
├── assets/
│   └── {userScope}/
│       └── {localAssetId}/
│           └── content.{safeExtension}
├── asset-staging/
└── document-cache/
```

- SQLite 只保存相对路径。
- `userScope` 由稳定用户身份安全派生，不使用显示名称。
- 扩展名只用于 renderer/操作系统兼容，必须从允许格式规范化，不能直接拼接用户输入。
- 原始文件与 ParsedDocument 派生缓存保持不同目录和生命周期。

## 6. SQLite schema v8

### 6.1 `local_asset_files`

```text
user_id                    TEXT NOT NULL
device_id                  TEXT NOT NULL
local_asset_id             TEXT NOT NULL
server_asset_id            TEXT
relative_path              TEXT NOT NULL
original_name              TEXT NOT NULL
mime_type                  TEXT NOT NULL
size_bytes                 INTEGER NOT NULL
sha256                     TEXT NOT NULL
state                      TEXT NOT NULL
created_at                 TEXT NOT NULL
verified_at                TEXT NOT NULL
last_accessed_at           TEXT NOT NULL
deleted_at                 TEXT

PRIMARY KEY (user_id, device_id, local_asset_id)
UNIQUE (user_id, device_id, server_asset_id)
```

状态为：

```text
STAGING -> READY_LOCAL -> SYNCING -> SYNCED
                      -> SYNC_FAILED -> SYNCING

READY_LOCAL / SYNCING / SYNCED / SYNC_FAILED -> CORRUPT
任一可删除状态 -> DELETING -> 删除记录
```

`READY_LOCAL` 已代表成功导入，可以完整使用本地功能。`SYNC_FAILED` 不降低本地可用性。

### 6.2 `local_asset_sync_jobs`

```text
job_id
user_id
device_id
local_asset_id
phase
attempt
next_retry_at
server_asset_id
safe_error_code
safe_error_detail
created_at
updated_at
```

阶段为：

```text
PENDING
-> CREATING_REMOTE_ASSET
-> UPLOADING
-> COMPLETING_REMOTE_ASSET
-> BINDING_SOURCE
-> SYNCED
```

同一个 owner/device/local Asset 只能有一个未终结同步任务。领取、状态转换和重试调度必须经过
现有 SQLite 串行写入边界。

### 6.3 `local_source_drafts`

```text
user_id
device_id
local_source_id
server_source_id
local_asset_id
subject_id
title
local_content_revision
server_ingestion_revision
state
created_at
updated_at
```

该表只承载离线 Source 建立与映射，不替代现有 Source 本地投影和 outbox。实施时应优先复用
现有 Source CREATE mutation，避免形成第二套长期业务仓库。

## 7. 原子文件语义

SQLite 与文件系统不能共享一个事务，因此使用“先发布文件，后登记 READY，并在启动时对账”的
可恢复协议。

### 7.1 本地导入

```text
校验格式、大小和可用空间
-> Rust 复制到唯一 .part
-> 流式计算 SHA-256 和字节数
-> flush/fsync
-> 原子 rename 到最终路径
-> SQLite 写入 READY_LOCAL
-> 创建本地 Source 投影、draft 与 Asset 同步任务
```

现有 PC 文件入口使用标准 HTML `File`，无法取得可信绝对路径。因此 native 同时提供两种受控入口：
原生路径入口用于可取得路径的 Tauri drag/drop 或 dialog；`import_local_asset_bytes` 用于 HTML File，调用方传入
最多 52,428,800 字节的 JSON 数字数组。两种入口共用相同的 owner scope、Asset 锁、`.part`、大小/SHA-256
校验、fsync、原子发布和幂等冲突语义。

SQLite 写入失败时保留可识别的孤儿文件供 reconciliation 归因，不能直接覆盖或删除用户文件。
在 `serverAssetId` 可用前，不创建或放行包含远端 Asset 引用的 Source mutation。

### 7.2 远端取得

```text
Local MISS
-> 获取 owner-scoped download URL
-> Rust 流式下载到唯一 .part
-> 校验大小并计算 SHA-256
-> flush/fsync + 原子 rename
-> SQLite 写入 SYNCED
-> 返回本地句柄
```

同一 Asset 的并发 resolve 使用进程内 single-flight 与 native 文件锁合并。signed URL 过期后重新
申请，不能持久化旧 URL。

### 7.3 启动 reconciliation

- 清理或安全恢复确定属于未完成操作的 `.part`；
- READY 记录缺文件时标记 `CORRUPT`；
- SHA 不匹配时标记 `CORRUPT` 并停止消费；
- 有文件无记录时移入 owner-scoped 孤儿隔离区；
- 不跨账号归因，不根据文件名猜测所有权。

## 8. 离线导入与最终同步

导入成功后，Source 立即进入本地投影并显示明确同步状态。Preview 和本地解析不等待 Server。

联网后同步任务执行：

```text
幂等创建远端 Asset
-> 从受管原文件流式 PUT 到 MinIO
-> complete Asset
-> 保存 localAssetId -> serverAssetId
-> 放行 Source CREATE/UPDATE
-> 保存 Source 与 ingestionRevision 映射
-> 用已有离线解析结果重新封装 ParsedDocument
-> 上传并 complete ParsedDocument
-> 标记 Asset/Source 同步完成
```

Server upload-intent 增加用户范围内的稳定 `clientImportId`。唯一约束为
`(user_id, client_import_id)`；同键重放返回同一 Asset 和当前状态，防止网络断开后生成重复
Asset。该变化需要追加 Server migration、API/OpenAPI 更新和安全并发测试。

同步队列采用有界指数退避并允许用户手动立即重试。认证失效、离线、签名过期、对象存储失败、
complete 失败和 Source 冲突必须映射为稳定阶段与安全错误，不能回滚本地文件。

## 9. Preview、OCR 与 Parser

`FilePreview` 只依赖稳定文件身份和 `resolveLocalAsset`。`previewKey` 不包含展示名称、MIME hydration
等不改变二进制的字段，避免重复 abort/reload。

底层 File Viewer 已支持 URL source；PC adapter 应支持受管本地 URL、文件名、MIME 和大小，
并保留 `File` 输入用于当前导入会话的渐进迁移。真实 PDF/Office 样本必须测量 URL 路径是否仍将
完整文件载入 WebView 内存，类型支持不能替代性能证据。

OCR、Parser 和重新解析通过同一 Local Asset handle 读取原始文件。离线解析输出先绑定
`localContentRevision`；取得 Server `ingestionRevision` 后只重新封装元数据和派生 payload，
复用已经完成的 OCR/解析 blocks。

完成迁移后删除：

- `useAssetStore` 的进程内长期 `Map<string, File>`；
- `FilePreview` 的 signed URL 下载职责；
- SourceJobScheduler 独立下载 Asset 的路径；
- 各消费方建立的重复原文件副本。

## 10. 删除传播

```text
用户删除 Source
-> 本地提交 tombstone 并立即移除 UI 投影
-> 设置 deletion fence，停止匹配的预览、解析、下载和上传
-> 检查本地活动 Source/outbox 是否仍引用 Asset
-> 最后引用消失时删除本地原文件和本地 Asset 记录
-> 同步 Source 删除
-> 其他设备 pull tombstone 后重复同一引用检查和删除
```

存在未解决 CREATE/UPDATE mutation、引用状态不确定或另一个活动 Source 时，禁止删除原文件。
晚到的下载、上传或解析结果必须被 deletion fence 丢弃，不能重建已删除文件。

## 11. 安全边界

- 原始文件在应用数据目录中使用明文，由 Windows 用户目录 ACL 保护。
- Rust 只接受逻辑 ID 和操作参数，最终路径由 native 层构造并做 containment 检查。
- 禁止路径遍历、符号链接和 junction 越界。
- WebView 只能访问受管 Asset 目录；不授予通用用户文件系统权限。
- 退出登录后停止向 WebView 暴露前一账号文件，磁盘文件保持不变。
- 日志不得包含绝对路径、signed URL、上传 headers、文件正文或未清洗异常文本。
- Tauri asset protocol 如被采用，必须只开放受管目录，并配置匹配的 CSP；不得保留当前无限制
  CSP 作为发布状态。
- 后端幂等键、Asset 查询、download URL 和 complete 继续执行 owner-scoped 鉴权。

## 12. 完整性修复

- SQLite 记录存在但文件缺失：标记 `CORRUPT`；远端 READY 时允许重新下载。
- 本地 SHA 不匹配：禁止预览、解析和上传；远端 READY 时允许替换损坏副本。
- Server 对象缺失但本地文件完整：重新执行幂等上传修复远端映射。
- 修复操作写入新的临时文件并原子替换，不能直接覆盖正在使用的文件。
- 磁盘空间不足时保留既有文件和任务证据，停止新导入/下载并给出可操作提示。

## 13. 实施阶段

### 阶段 1：Local Asset Store 基础

- schema v8 与 v7→v8 migration；
- Rust staging、哈希、原子发布、删除和 reconciliation；
- Repository、NativeStore 与 Service；
- owner/device 隔离和定向自动测试；
- 不切换现有业务入口。

### 阶段 2：离线导入与同步队列

- 本地 Asset/Source draft 和持久同步任务；
- Server `clientImportId` 幂等 Asset 创建；
- Asset READY 后放行 Source outbox；
- 重启恢复、网络恢复、退避与手动重试；
- 离线解析结果与 Server revision 绑定。

### 阶段 3：统一消费方

- Preview 接入本地 URL；
- OCR、Parser、重新解析接入 Local Asset Service；
- 稳定 preview key；
- 删除重复下载、进程内长期 File Map 和平行原文件副本。

### 阶段 4：删除与安全收口

- 引用检查、跨设备 tombstone 和 deletion fence；
- 损坏检测与双向修复；
- 磁盘不足处理；
- asset scope、CSP、路径和日志审查；
- 真实 Tauri/MinIO/多设备验收。

阶段按顺序实施，但每阶段必须保持仓库可构建、迁移可升级且旧在线上传流程不被提前破坏。

## 14. 自动测试

### PC TypeScript/SQLite

- schema v7→v8、重复初始化和 migration 中断恢复；
- owner/device 隔离、状态转换、任务领取和 single-flight；
- 离线导入、重启、联网、上传中断和幂等恢复；
- Asset 多 Source 引用、最后引用删除和待同步 mutation 保护；
- stable preview key 与 late-result fence；
- OCR/Parser 复用同一 Asset，revision 绑定不重复 OCR。

### Rust

- 路径 containment、扩展名规范化和跨账号拒绝；
- staging、SHA/size、fsync/rename 与崩溃残留；
- 并发复制/下载、签名过期、取消和低磁盘；
- 文件缺失、篡改、孤儿隔离和原子修复；
- 受管文件流式上传不经过 Vue/JSON IPC 正文。

### Server

- `clientImportId` 用户隔离、唯一约束、并发创建和重放；
- upload intent、PUT、complete、Source 绑定和删除回归；
- Asset/Source owner scope、错误映射和日志脱敏；
- migration clean/upgrade、OpenAPI artifact 与 PC/Mobile schema gate。

## 15. 人工验收

- Windows Tauri 断网导入 29.6 MB PDF，立即预览和解析；
- 应用重启后资料仍存在，联网后自动续传；
- PDF、DOC、DOCX、PPT、PPTX 的真实本地 URL 加载；
- 第二台 PC 同步 Source 后按需下载并离线重开；
- 同一 Asset 被多个 Source 引用时删除其中一个不删文件；
- 删除最后引用后其他设备同步删除本地副本；
- 文件损坏、本地缺失、MinIO 对象缺失和磁盘不足提示；
- 双账号切换不能观察或使用另一账号文件；
- 自动测试、真实依赖联调、GUI 表现和业务验收分别记录。

## 16. 文档回写矩阵

实施过程中按实际变化同步：

- 产品范围与验收：`docs/project/ProductRequirements.md`；
- 系统边界和数据流：`docs/project/Architecture.md`；
- PC/Tauri 实现：`docs/modules/FrontendPC.md`；
- 预览与交互：`docs/design/Frontend.md`；
- API/OpenAPI：`docs/contracts/API.md`；
- SQLite/Server schema：`docs/contracts/Database.md`；
- Server 实现：`docs/modules/Backend.md`；
- 状态和风险：`docs/current/Status.md`、`docs/current/IssuesAndReview.md`；
- 已发生的行为变化：`docs/release/Changelog.md`。

任何阶段都必须区分代码存在、自动测试、真实 Tauri/MinIO 联调和业务验收。

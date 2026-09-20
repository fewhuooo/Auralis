# 测试账号与测试数据重置/注入流程

更新时间：2026-09-18

文档状态：现行，仅适用于本机开发环境

## 用途与边界

这份流程用于把本机 Auralis 重置为一套可重复验收的测试环境：

- 清空本机 PostgreSQL `public` schema，让 Server 启动时重新执行全部 Flyway migration。
- 清空本机 MinIO `auralis-assets` bucket 中的对象，但保留 bucket。
- 注册或登录一个测试账号。
- 创建 12 个测试学科和 240 个类真实任务，其中 192 个为未来时间轴任务，且时间槽唯一。
- 可选注入 7 个不可解析的假文件，并为每个文件创建 FILE Source 和关联 KnowledgeBlock；这条路径只用于验证 Asset、Source、列表展示和关联关系，不替代真实文件解析验收。

该流程会破坏本机数据库和对象存储数据。禁止在生产环境、共享环境或未确认目标容器时执行。流程默认不备份；需要保留数据时应先按 [运维手册](Runbook.md) 备份。

## 前置检查

在仓库根目录执行：

```powershell
docker compose --env-file .env config --quiet
docker compose --env-file .env ps
```

必须确认目标容器名称为 `auralis-db`、`auralis-minio`、`auralis-backend`，并确认 `.env` 指向本机开发数据库。不要只根据容器名执行删除操作。

## 1. 停止会写入数据库的应用

```powershell
docker compose --env-file .env stop frontend backend
docker compose --env-file .env up -d db minio minio-init
docker compose --env-file .env ps db minio minio-init
```

确认 PostgreSQL 和 MinIO 为 `healthy`，且 `minio-init` 成功退出后再继续。

## 2. 清空 PostgreSQL schema

当前流程不是逐表删除，而是重建 `public` schema。这样可以确保现有数据库对象全部清除，再由当前 Server 镜像执行 V1 到当前版本的迁移。

本机默认 `.env` 使用数据库名和用户 `auralis`；若配置不同，应将命令中的值替换为 `.env` 的实际值：

```powershell
docker compose --env-file .env exec -T db psql -v ON_ERROR_STOP=1 -U auralis -d auralis -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO auralis;"
```

然后重建/启动后端，让 Flyway 建立当前 schema：

```powershell
docker compose --env-file .env build backend
docker compose --env-file .env up -d backend
docker compose --env-file .env logs --tail=120 backend
```

日志应同时出现：

- `Successfully validated <当前 migration 数量> migrations`
- `Current version of schema "public": <当前版本>`
- `Schema "public" is up to date` 或从空库逐版本迁移到当前版本
- `Started AuralisApplication`

## 3. 清空 MinIO 测试对象

保留 bucket，只删除其中对象：

```powershell
docker compose --env-file .env exec -T minio sh -lc 'mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" && mc rm --recursive --force "local/$MINIO_HEALTHCHECK_BUCKET"'
```

验证对象数量：

```powershell
docker compose --env-file .env exec -T minio sh -lc 'mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; mc ls --recursive "local/$MINIO_HEALTHCHECK_BUCKET" 2>/dev/null | wc -l'
```

预期结果为 `0`。本步骤不删除 PC 本地受管文件；本地文件目录为 `%APPDATA%\com.auralis.app\assets\`，需要另行检查和处理。

## 4. 创建或登录测试账号

推荐通过公开 Auth API 创建账号，不要直接向 `users.password_hash` 写入明文或自制 hash。

```powershell
$baseUrl = 'http://127.0.0.1:8080'
$testUsername = 'pc-ai-test-20260918@example.com'
$testPassword = 'AuralisPcTest#2026'
$deviceKey = 'codex-test-seed-20260918'

$registerBody = @{
  username = $testUsername
  password = $testPassword
  displayName = 'Auralis 时间轴测试账号'
  clientDeviceKey = $deviceKey
  deviceName = 'Codex 测试设备'
  platform = 'WINDOWS'
} | ConvertTo-Json

$auth = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/auth/register" `
  -ContentType 'application/json' -Body $registerBody

$headers = @{ Authorization = "Bearer $($auth.tokens.accessToken)" }
$userId = $auth.user.id
```

如果账号已存在，则改用登录：

```powershell
$loginBody = @{
  username = $testUsername
  password = $testPassword
  clientDeviceKey = $deviceKey
  deviceName = 'Codex 测试设备'
  platform = 'WINDOWS'
} | ConvertTo-Json

$auth = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/auth/login" `
  -ContentType 'application/json' -Body $loginBody
$headers = @{ Authorization = "Bearer $($auth.tokens.accessToken)" }
$userId = $auth.user.id
```

注册请求字段和 AuthResult 以 [API 契约](../contracts/API.md) 为准。测试密码只能用于本机开发环境，不得复用到生产环境。

## 5. 注入测试学科和任务

下面的 PowerShell 片段通过正式 API 注入 12 个学科、每个学科 20 个任务：16 个未来时间轴任务、2 个已完成任务、2 个取消任务。每个未来任务占用唯一时间槽，避免时间轴按槽展示时互相覆盖。

```powershell
$subjects = @(
  @{ name = '高等数学'; description = '极限、微积分、线性代数与概率基础' }
  @{ name = '数据结构与算法'; description = '复杂度、树、图、查找与排序' }
  @{ name = '计算机网络'; description = 'TCP/IP、HTTP、路由与网络安全' }
  @{ name = '英语阅读'; description = '学术阅读、词汇、长难句与写作素材' }
  @{ name = '数据库系统'; description = '关系模型、SQL、索引、事务与并发' }
  @{ name = '操作系统'; description = '进程、线程、内存、文件系统与并发控制' }
  @{ name = '编译原理'; description = '词法分析、语法分析、语义检查与代码生成' }
  @{ name = '软件工程'; description = '需求、设计、测试、版本控制与交付' }
  @{ name = '概率统计'; description = '概率模型、随机变量、估计与假设检验' }
  @{ name = '机器学习基础'; description = '特征、回归、分类、评估与过拟合' }
  @{ name = '信息安全'; description = '身份认证、密码学、Web 安全与风险分析' }
  @{ name = '项目管理'; description = '范围、进度、风险、协作与复盘' }
)

$subjectIds = @{}
for ($i = 0; $i -lt $subjects.Count; $i++) {
  $item = $subjects[$i]
  $body = @{
    baseVersion = 0
    name = $item.name
    description = $item.description
    iconKey = 'book-open'
    sortKey = ('{0:D3}' -f $i)
  } | ConvertTo-Json
  $created = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/subjects" `
    -Headers $headers -ContentType 'application/json' -Body $body
  $subjectIds[$item.name] = $created.id
}

$taskTemplates = @(
  '整理本章核心概念并写出一页复习提纲'
  '完成一组基础练习并记录错误原因'
  '阅读资料，提取三个关键定义'
  '用自己的话解释一个容易混淆的知识点'
  '完成一次限时训练并复盘耗时'
  '整理公式、命令或 API 的使用边界'
  '对比两个相近概念并制作判断清单'
  '完成本周资料的阶段性总结'
  '回顾已完成内容并标记待复习部分'
  '整理取消任务的后续补做计划'
  '把本节内容改写成五道自测题'
  '找出一个反例并解释它为什么成立'
  '完成一次错题归因并提出改进动作'
  '整理本主题与前置知识的依赖关系'
  '用表格比较三种方案的优缺点'
  '完成一页术语卡片并标注易错点'
  '阅读一份补充资料并写出摘要'
  '对本周学习结果做一次自评'
  '准备一次三分钟口头讲解'
  '把知识点应用到一个小型案例'
)

$subjectNames = @($subjects | ForEach-Object { $_.name })
$taskCount = 0
$scheduleSlotIndex = 0
for ($subjectIndex = 0; $subjectIndex -lt $subjectNames.Count; $subjectIndex++) {
  $subjectName = $subjectNames[$subjectIndex]
  for ($taskIndex = 0; $taskIndex -lt 20; $taskIndex++) {
    $status = if ($taskIndex -ge 16 -and $taskIndex -lt 18) { 'DONE' } elseif ($taskIndex -ge 18) { 'CANCELLED' } elseif (($taskIndex + $subjectIndex) % 7 -eq 0) { 'IN_PROGRESS' } else { 'TODO' }
    $scheduledAt = $null
    if ($taskIndex -lt 16) {
      # 最大任务时长为 90 分钟，使用 2 小时起始间隔，确保时间轴任务块不重叠。
      $slot = (Get-Date).ToUniversalTime().Date.AddDays(1).AddHours(7).AddHours($scheduleSlotIndex * 2)
      $scheduledAt = $slot.ToUniversalTime().ToString('o')
      $scheduleSlotIndex++
    }
    $body = @{
      baseVersion = 0
      subjectId = $subjectIds[$subjectName]
      title = "$($subjectName)：$($taskTemplates[$taskIndex])"
      description = "测试数据：$subjectName 第 $($taskIndex + 1) 项学习任务，用于验证时间轴、状态筛选和任务详情。"
      status = $status
      scheduledAt = $scheduledAt
      dueAt = $null
      durationMinutes = @(30, 45, 60, 90)[($taskCount % 4)]
      sortKey = ('{0:D3}' -f $taskCount)
    } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri "$baseUrl/api/tasks" `
      -Headers $headers -ContentType 'application/json' -Body $body | Out-Null
    $taskCount++
  }
}
```

如果需要更多数据，优先扩展这段注入逻辑并保持以下约束：任务 `subjectId` 必须属于测试账号；时间轴任务的 `scheduledAt` 必须是未来时间且不重复；相邻排期的间隔必须大于等于最大 `durationMinutes`；不要直接绕过 API 写入业务表。

## 6. 注入不可解析假文件并链接 KnowledgeBlock

可以放假文件，而且本轮允许它们故意不能解析。它们适合验证：

- 文件列表、文件名、大小、MIME 和上传完成状态；
- FILE Source 是否正确绑定到 Asset 和测试学科；
- KnowledgeBlock 是否使用正确的 `sourceId` 链接到 Source；
- 预览或解析失败时，前端是否展示明确的失败状态。

它们不适合验证 PDF/DOCX/PPTX 解析、OCR、ParsedDocument、切块、向量检索或 AI 引用。那些场景继续使用你之后准备的真实文件。即使是假文件，也必须通过正式 Asset 接口上传，不能只在数据库插入一条 Asset 记录；服务端仍会校验上传对象的大小、MIME 和声明的 SHA-256，但不会替你把不可解析内容变成有效文档。

推荐生成一组明确标记为 fixture 的不可解析文件，例如：

```powershell
$fixtureRoot = Join-Path $PWD 'tmp\auralis-invalid-fixtures'
New-Item -ItemType Directory -Force -Path $fixtureRoot | Out-Null

$fixtureNames = @(
  'invalid-fixture-数学-章节摘要.pdf'
  'invalid-fixture-算法-错题整理.docx'
  'invalid-fixture-网络-协议对比.pptx'
  'invalid-fixture-数据库-索引复习.doc'
  'invalid-fixture-操作系统-进程模型.pdf'
  'invalid-fixture-软件工程-测试清单.docx'
  'invalid-fixture-信息安全-风险记录.pptx'
)

foreach ($name in $fixtureNames) {
  $path = Join-Path $fixtureRoot $name
  [System.IO.File]::WriteAllText($path, "Auralis invalid fixture: $name`nThis file is intentionally not a valid office document.", [System.Text.Encoding]::UTF8)
}
```

这些文件的扩展名和请求 MIME 可以按目标格式填写，但内容故意不是对应格式。若 Asset `complete` 因对象校验拒绝某种伪造 MIME，就不要绕过校验；改用服务端接受的 fixture MIME 或直接用真实测试文件。不要把假文件命名为用户可能误认为真实资料的名称，建议保留 `invalid-fixture` 标识。

关联链路必须是：

```text
invalid fixture file
  -> POST /api/assets/upload-intents
  -> PUT uploadUrl
  -> POST /api/assets/{assetId}/complete
  -> POST /api/sources (type=FILE, assetId, subjectId)
  -> POST /api/knowledge-blocks (sourceId=返回的 Source UUID, subjectId=同一学科)
```

KnowledgeBlock 请求体示例：

```json
{
  "baseVersion": 0,
  "subjectId": "<测试学科 UUID>",
  "sourceId": "<刚创建的 FILE Source UUID>",
  "title": "假文件测试知识块",
  "summary": "用于验证文件来源关联的合成摘要。",
  "content": "这是合成正文，不代表文件已经解析成功。",
  "tags": ["seed", "invalid-fixture", "file-linked"],
  "colorOverride": null
}
```

`sourceId` 只能填 Source UUID，不能填本地路径、文件名或 `assetId`。FILE Source 创建后正常处于 `AWAITING_CLIENT`；因此这批假文件可以验证关联和展示，但不会进入可检索的 `READY` 状态。你拿真实文件测试时，还要让 PC/Tauri 提交 ParsedDocument 并完成 indexing，再验证 AI 检索和引用。

## 7. 验证结果

检查后端健康和 migration 版本：

```powershell
docker compose --env-file .env ps backend db minio
docker compose --env-file .env exec -T db psql -U auralis -d auralis -c "SELECT installed_rank, version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1;"
```

检查账号和测试数据数量：

```powershell
docker compose --env-file .env exec -T db psql -U auralis -d auralis -c "SELECT count(*) AS users FROM users WHERE username = 'pc-ai-test-20260918@example.com'; SELECT count(*) AS subjects FROM subjects WHERE user_id = (SELECT id FROM users WHERE username = 'pc-ai-test-20260918@example.com'); SELECT count(*) AS tasks FROM tasks WHERE user_id = (SELECT id FROM users WHERE username = 'pc-ai-test-20260918@example.com'); SELECT count(*) AS assets FROM assets WHERE user_id = (SELECT id FROM users WHERE username = 'pc-ai-test-20260918@example.com');"
```

预期结果：仅执行学科/任务注入时为 `users=1`、`subjects=12`、`tasks=240`、`assets=0`；执行 7 个假文件夹具注入后为 `assets=7`，并应有 7 个对应 FILE Source 和至少 7 个 `source_id` 非空的 KnowledgeBlock。可用下面的查询确认文件关联链：

```powershell
docker compose --env-file .env exec -T db psql -U auralis -d auralis -c "SELECT count(*) AS sources FROM sources s JOIN users u ON u.id=s.user_id WHERE u.username = 'pc-ai-test-20260918@example.com' AND s.deleted_at IS NULL AND s.type = 'FILE'; SELECT count(*) AS linked_knowledge_blocks FROM knowledge_blocks k JOIN users u ON u.id=k.user_id WHERE u.username = 'pc-ai-test-20260918@example.com' AND k.deleted_at IS NULL AND k.source_id IS NOT NULL;"
```

时间轴候选和重复时间检查：

```powershell
docker compose --env-file .env exec -T db psql -U auralis -d auralis -c "SELECT count(*) AS active_scheduled FROM tasks t JOIN users u ON u.id=t.user_id WHERE u.username = 'pc-ai-test-20260918@example.com' AND t.deleted_at IS NULL AND t.status IN ('TODO','IN_PROGRESS') AND t.scheduled_at IS NOT NULL; SELECT scheduled_at, count(*) FROM tasks t JOIN users u ON u.id=t.user_id WHERE u.username = 'pc-ai-test-20260918@example.com' AND t.deleted_at IS NULL AND t.status IN ('TODO','IN_PROGRESS') AND t.scheduled_at IS NOT NULL GROUP BY scheduled_at HAVING count(*) > 1;"
```

预期结果为 `active_scheduled=192`，重复时间查询无行。最后在 PC/Tauri 中登录测试账号，等待本地 projection/sync 完成，再人工检查 Dashboard、Timeline、SubjectHall 和任务状态。

## 8. 文件由用户手动导入

如果没有执行第 6 节的假文件注入，仍可由用户手动导入真实文件。真实文件用于解析/OCR/ParsedDocument/AI 检索验收：

1. 使用测试账号登录 PC/Tauri。
2. 在目标学科工作区手动选择 PDF、DOCX、PPTX 等文件。
3. 观察本地受管文件、Source、ParsedDocument/DocumentProcessingJob、MinIO 和前端实时状态。
4. 记录文件真实验收结果；自动注入的任务数据不能替代文件处理验收。

PC 本地受管文件默认位于：

```text
%APPDATA%\com.auralis.app\assets\<user-scope>\<local-asset-id>\content.<ext>
```

清空 PostgreSQL 或 MinIO 不会自动删除该目录中的本地文件。删除本地文件前必须先确认用户明确授权、Source 引用数量和当前应用是否已退出。

## 常见误判

- `flyway_schema_history` 的 `version` 是字符串，不能直接用 `MAX(version)` 判断最新版本；应按 `installed_rank DESC` 检查。
- 数据库里有 Subject/Task 不代表 PC 已显示；PC 还需要登录正确账号并完成本地 projection/sync。
- MinIO bucket 为空不代表 PC 本地文件为空；两者是不同存储边界。
- 构建通过、后端 healthy、SQL 计数正确不等于文件解析、时间轴 GUI、实时状态或真实 MinIO 上传已验收。

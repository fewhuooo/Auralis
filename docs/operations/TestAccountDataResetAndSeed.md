# 测试账号数据库重建与数据注入流程

更新时间：2026-10-10

文档状态：现行，仅适用于本机开发环境

## 目标数据与当前执行结果

此流程在本机 PostgreSQL 重建当前 schema，再通过正式 API 创建测试账号、学科、任务和知识块。当前目标如下：

| 数据 | 重建后目标 | 注入方式 |
| --- | ---: | --- |
| 测试账号 | 1 | `scripts/seed-test-account.mjs` |
| 学科 | 12 | `scripts/seed-test-account.mjs` |
| 任务 | 240 | `scripts/seed-test-account.mjs` |
| 知识块 | 每科 30 个，共 360 个 | `scripts/seed-knowledge-blocks.mjs` |
| Source / Asset | 0 | 本流程不注入文件或来源 |

12 个学科为：高等数学、数据结构与算法、计算机网络、英语阅读、数据库系统、操作系统、编译原理、软件工程、概率统计、机器学习基础、信息安全、项目管理。空数据库执行两份注入脚本后，每科应有 30 个活动知识块，共 360 个。

**本次执行基线（2026-10-10）：**本机 PostgreSQL 已重建并迁移到当前 V29；测试账号有 12 个学科、240 个任务和 360 个知识块，每科 30 个。知识块脚本保留原有 31 个并补入 329 个，最终通过 API 分页回读得到 360 个。Sources 和 Assets 为 0。随后清空 `auralis-assets` bucket 中的 12 个对象；版本控制为 Disabled，删除后回查为 0，bucket 和 MinIO 服务保留。PC/Tauri 本地数据目录没有改动。

本次数据库重建前的备份为 `%TEMP%\auralis-pre-reset-20261010-124547.dump`，SHA-256：`2b9846ad8f5f73b9cbfd6ad1be8aa5c80a28be25ea42a400c5594b45853bc749`。备份目录项检查已通过。需要恢复时先确认目标实例，再依据 [运维手册](Runbook.md) 执行恢复。

## 影响范围

- 重建命令只删除当前 `.env` 指向的 PostgreSQL 数据库 `public` schema 对象和行；其中包括用户/会话、学科、任务、知识块、来源/文件元数据、复习和 AI 等数据库数据。Flyway 迁移记录也会删除并由后端重新建立。
- 本流程会清空 `.env` 中 `AURALIS_MINIO_BUCKET` 指向的 bucket 全部对象，但保留 bucket、MinIO 服务和命名卷；不会清空其他 bucket。当前目标是 `auralis-assets`，本次确认其版本控制未启用。
- PC/Tauri 本机离线数据库及本地受管文件不由 PostgreSQL schema 操作清理。服务器用户重建后可能得到新的用户 UUID；客户端应重新登录并确认当前账号后再验收。
- 清空数据库与 MinIO bucket 后，服务端 Asset/Source 元数据和 bucket 对象均为空；PC/Tauri 本地文件仍保留。
- 知识块脚本只创建 KnowledgeBlock，不创建 Source、Asset、ParsedDocument、document chunk、向量或索引任务。360 个知识块的数量不代表文件解析或 RAG 检索已验收。

仅限本机开发环境。执行前确认 Compose 项目、`.env` 数据库名、用户、端口和容器均属于本机目标；禁止在生产或共享环境照抄执行。不要把 `.env` 内容或密码复制到日志、工单或终端输出。

## 前置检查

在仓库根目录用 PowerShell 检查 Compose 配置和容器：

```powershell
docker compose --env-file .env config --quiet
docker compose --env-file .env ps -a
docker compose --env-file .env exec -T db sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT current_database(), current_user, current_schema();"'
```

确认输出的数据库名和当前用户与本机 `.env` 及预期开发环境一致。若容器名、Compose project、端口或数据库目标有疑问，停止流程并先确认，不要执行后续 schema 删除。

## 1. 停止写入并备份数据库

停止前端和后端写入，保持数据库容器运行：

```powershell
docker compose --env-file .env stop frontend backend
docker compose --env-file .env up -d db minio minio-init
docker compose --env-file .env ps -a db minio minio-init
```

继续前确认 PostgreSQL 和 MinIO 健康，`minio-init` 已成功完成。备份用 PostgreSQL custom 格式写入容器临时文件，再用 `docker cp` 复制到本机；不要通过 PowerShell 文本重定向传输二进制 dump：

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $env:TEMP "auralis-pre-reset-$stamp.dump"
docker compose --env-file .env exec -T db sh -lc 'pg_dump --format=custom --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /tmp/auralis-pre-reset.dump'
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed; stop before resetting the schema.' }
docker compose --env-file .env exec -T db pg_restore --list /tmp/auralis-pre-reset.dump
if ($LASTEXITCODE -ne 0) { throw 'pg_restore could not read the dump; stop before resetting the schema.' }
docker cp auralis-db:/tmp/auralis-pre-reset.dump $backup
if ($LASTEXITCODE -ne 0) { throw 'Could not copy the database backup to the host.' }
Get-Item $backup | Select-Object FullName, Length
Get-FileHash -Algorithm SHA256 $backup
```

确认本机文件存在、长度非零，并记录路径和 SHA-256。备份校验失败时不得继续。备份文件包含数据库数据，应留在本机受控位置。

### 清空本机 MinIO 应用 bucket

当前配置的目标 bucket 为 `auralis-assets`。下面命令只清除该 bucket 的对象并保留 bucket；执行前核对实际 `.env` 的 `AURALIS_MINIO_BUCKET`：

```powershell
docker compose --env-file .env run --rm --entrypoint /bin/sh minio-init -lc 'set -eu; mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"; echo "Objects before cleanup:"; mc ls --recursive "local/$MINIO_BUCKET"; mc rm --recursive --force "local/$MINIO_BUCKET"; echo "Objects after cleanup (expected empty):"; mc ls --recursive "local/$MINIO_BUCKET"'
```

确认最后一次 `mc ls --recursive` 无对象输出且命令退出码为 0。不要对 `local` 根路径或其他 bucket 执行递归删除。当前 `auralis-assets` 版本控制为 Disabled；若环境启用了版本控制，必须先盘点历史版本和删除标记，并确保清理后版本列表也为空。

## 2. 重建 PostgreSQL schema 并运行迁移

以下命令会删除该数据库 `public` schema 中的全部对象和数据。执行前再次确认前置检查中的数据库目标；不要用 `down -v` 替代此步骤，因为命名卷还承载 MinIO 数据。

```powershell
docker compose --env-file .env exec -T db sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION \"$POSTGRES_USER\"; GRANT ALL ON SCHEMA public TO \"$POSTGRES_USER\";"'
if ($LASTEXITCODE -ne 0) { throw 'Schema reset failed.' }
docker compose --env-file .env build backend
docker compose --env-file .env up -d backend
docker compose --env-file .env logs --tail=150 backend
```

后端应完成当前仓库内的 Flyway 迁移并达到 readiness。当前仓库版本为 V29；未来若新增迁移，以当前代码中的最新 migration 为目标。不要只凭容器启动或 HTTP 端口开放判断迁移成功。

```powershell
docker compose --env-file .env exec -T db sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT installed_rank, version, description, success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1;"'
Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:8080/actuator/health/readiness'
```

## 3. 注入测试账号、学科和任务

确认后端已就绪后，只执行一次：

```powershell
node scripts/seed-test-account.mjs
```

此脚本使用正式 Auth、Subject 和 Task API。账号用户名为 `pc-ai-test-20260918@example.com`；凭据由脚本维护，不在本文重复记录。脚本会先注册，若注册失败则尝试用脚本配置的账号登录，然后创建 12 个学科和 240 个任务。

**此脚本不是可重复注入脚本。** 重置数据库后首次执行；不要为了补知识块再次运行它，否则会重复创建学科和任务。需要增加知识块时只运行下一节脚本。

任务分布和数据约束：

- 每科 20 个任务，共 240 个。
- 每科 4 个未来排期任务，共 48 个；开始时间使用每天 08:30、10:30、14:00、16:00、19:00、21:00 槽位，跨 8 天分配，不重复且无时间区间重叠。
- 每科 12 个未排期活动任务，共 144 个；其中 72 个有未来截止时间、72 个无截止时间。
- 每科 2 个 DONE 和 2 个 CANCELLED，共各 24 个。
- 活动任务状态为 TODO 或 IN_PROGRESS；时长取 30、60、90、120 分钟，不注入 45 分钟任务。

**截止时间注入提醒：**Task `dueAt` 必须写成带时区的 RFC 3339 时间戳（真实 instant），不可将 `YYYY-MM-DD` 纯日期直接存入或按当天日末兼容解释。若注入的是“当天截止”，应先按目标用户时区把日期转换成当地日末，再提交对应 UTC instant；任何当天排期的完整结束时刻都必须不晚于该 instant。`schedule-insertions` 会按数据库中已有 `dueAt` 精确校验，不会替注入数据或旧任务修正截止值；PC 对非空纯日期/无时区的无效截止值会拒绝新排期。当前 `seed-test-account.mjs` 写入的截止均为带时区的具体时刻；新增或修改注入数据时保持这一约束。

如果注册、登录或 API 请求失败，先检查后端 readiness、测试账号脚本配置和 API 错误；不要直接向数据库业务表写入账号或任务。

## 4. 每科注入 30 个知识块

执行：

```powershell
node scripts/seed-knowledge-blocks.mjs
```

脚本从知识目录为 12 个测试学科补充 KnowledgeBlock，每科以 30 个为目标，总量为 360。写入前会校验每科目录恰有 30 个不重复标题；注入使用 `POST /api/knowledge-blocks`，请求字段符合当前 API 契约：`baseVersion`、`subjectId`、`sourceId`、`title`、`content`、`colorOverride`。知识块没有文件来源时 `sourceId` 为 `null`；不再发送已移除的 `summary` 或 `tags` 字段。

脚本按学科读取已有活动知识块，保留已有内容和标题，跳过重复标题，只补足缺口；不会删块或把超出 30 的既有数据减到 30。空库首次注入结果应为每科恰好 30 个、总计 360 个。重复运行是安全的：已达到目标的学科不会继续增加；若某科已超过 30，则保留超出数量，最终以回读计数为准。

脚本完成时应输出 12 科逐科计数、创建数量和回读总量；缺科或回读不足会以非零退出码结束。脚本使用 API 分页读取，页面大小为 200。

## 5. 数据验收

### Migration 和总体计数

```powershell
docker compose --env-file .env exec -T db sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT installed_rank, version, description, success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1;"'
docker compose --env-file .env exec -T db sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT (SELECT count(*) FROM users WHERE username = ''pc-ai-test-20260918@example.com'') AS users, (SELECT count(*) FROM subjects s JOIN users u ON u.id=s.user_id WHERE u.username = ''pc-ai-test-20260918@example.com'' AND s.deleted_at IS NULL) AS subjects, (SELECT count(*) FROM tasks t JOIN users u ON u.id=t.user_id WHERE u.username = ''pc-ai-test-20260918@example.com'' AND t.deleted_at IS NULL) AS tasks, (SELECT count(*) FROM knowledge_blocks k JOIN users u ON u.id=k.user_id WHERE u.username = ''pc-ai-test-20260918@example.com'' AND k.deleted_at IS NULL) AS knowledge_blocks, (SELECT count(*) FROM sources s JOIN users u ON u.id=s.user_id WHERE u.username = ''pc-ai-test-20260918@example.com'' AND s.deleted_at IS NULL) AS sources, (SELECT count(*) FROM assets a JOIN users u ON u.id=a.user_id) AS assets;"'
```

空库完整注入的预期总体计数为 `users=1, subjects=12, tasks=240, knowledge_blocks=360, sources=0, assets=0`。

### 逐科确认 KnowledgeBlock 数量

```powershell
docker compose --env-file .env exec -T db sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT s.name, count(k.id) AS knowledge_blocks FROM subjects s JOIN users u ON u.id=s.user_id LEFT JOIN knowledge_blocks k ON k.user_id=u.id AND k.subject_id=s.id AND k.deleted_at IS NULL WHERE u.username = ''pc-ai-test-20260918@example.com'' AND s.deleted_at IS NULL GROUP BY s.id, s.name, s.sort_key ORDER BY s.sort_key, s.name;"'
```

应返回 12 行，每行 `knowledge_blocks=30`。若重复运行前数据库内已有超过 30 个活动块，该科会显示实际较大数量；脚本不会删除已有数据。

### 任务状态、截止日期和时长

```powershell
docker compose --env-file .env exec -T db sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT status, count(*) AS tasks FROM tasks t JOIN users u ON u.id=t.user_id WHERE u.username = ''pc-ai-test-20260918@example.com'' AND t.deleted_at IS NULL GROUP BY status ORDER BY status; SELECT count(*) FILTER (WHERE status IN (''TODO'',''IN_PROGRESS'') AND scheduled_at IS NOT NULL) AS active_scheduled, count(*) FILTER (WHERE status IN (''TODO'',''IN_PROGRESS'') AND scheduled_at IS NULL) AS active_unscheduled, count(*) FILTER (WHERE status IN (''TODO'',''IN_PROGRESS'') AND scheduled_at IS NULL AND due_at IS NOT NULL) AS unscheduled_with_due, count(*) FILTER (WHERE status IN (''TODO'',''IN_PROGRESS'') AND scheduled_at IS NULL AND due_at IS NULL) AS unscheduled_without_due, count(*) FILTER (WHERE duration_minutes IS NULL OR duration_minutes % 30 <> 0) AS invalid_durations FROM tasks t JOIN users u ON u.id=t.user_id WHERE u.username = ''pc-ai-test-20260918@example.com'' AND t.deleted_at IS NULL;"'
```

预期状态总数为 TODO/IN_PROGRESS 合计 192、DONE 24、CANCELLED 24；活动排期 48、活动未排期 144，其中有截止日期 72、无截止日期 72；`invalid_durations=0`。

### 排期唯一性和区间重叠

```powershell
docker compose --env-file .env exec -T db sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT t.scheduled_at, count(*) FROM tasks t JOIN users u ON u.id=t.user_id WHERE u.username = ''pc-ai-test-20260918@example.com'' AND t.deleted_at IS NULL AND t.status IN (''TODO'',''IN_PROGRESS'') AND t.scheduled_at IS NOT NULL GROUP BY t.scheduled_at HAVING count(*) > 1; SELECT count(*) AS overlapping_pairs FROM tasks a JOIN tasks b ON a.id < b.id AND a.user_id=b.user_id AND a.deleted_at IS NULL AND b.deleted_at IS NULL AND a.status IN (''TODO'',''IN_PROGRESS'') AND b.status IN (''TODO'',''IN_PROGRESS'') AND a.scheduled_at IS NOT NULL AND b.scheduled_at IS NOT NULL AND a.scheduled_at < b.scheduled_at + b.duration_minutes * interval ''1 minute'' AND b.scheduled_at < a.scheduled_at + a.duration_minutes * interval ''1 minute'' JOIN users u ON u.id=a.user_id WHERE u.username = ''pc-ai-test-20260918@example.com'';"'
```

第一条查询应无行，第二条 `overlapping_pairs=0`。查询只证明数据库中的排期值满足唯一开始时间及任务区间不重叠，不证明 GUI 展示或人工排期体验。

## 6. 手动验收边界

在 PC/Tauri 中使用测试账号重新登录并等待首次同步完成，确认：

1. 学科列表显示 12 科。
2. 每科知识列表显示 30 个活动知识块，内容可打开。
3. 任务列表、待办和 Timeline 能读到对应任务；排期、截止日期、完成和取消状态符合上面的分布。
4. PostgreSQL 重建后账号可能是新用户 UUID；若客户端保留旧会话，应先退出并重新登录，不清理本机数据库或文件来“修复”服务端数据。

以上检查需要 GUI/人工执行，本轮命令和 API 回读不能代替它们。真实文件解析、Source/Asset 上传、ParsedDocument、分块、向量检索和 AI 引用也都不在这批种子数据的验收范围内。

## 常见误判与排障

- `flyway_schema_history.version` 是字符串；用 `installed_rank DESC` 查看最后成功应用的版本，不用 `MAX(version)`。
- `seed-test-account.mjs` 仅用于空库首次建账号/学科/任务；不要把它当作幂等脚本重复运行。
- `seed-knowledge-blocks.mjs` 对已有活动知识块只补不删。出现多于 30 个时先检查现有数据来源，不要通过删除来凑数。
- KnowledgeBlock API 当前不接受 `summary/tags`；以 [API 契约](../contracts/API.md) 和实际脚本请求字段为准。
- 数据库里的 Subject/Task/KnowledgeBlock 不代表 PC 已显示；客户端还需登录正确用户并完成同步/本地投影。
- 本机 MinIO 对象、PostgreSQL 元数据、PC 本地文件是不同存储边界。本流程清空配置 bucket 中的对象，但保留 PC/Tauri 本机文件。
- 后端 healthy、migration 完成、API 计数正确不等于 GUI/真机、文件解析或 AI/RAG 业务验收完成。

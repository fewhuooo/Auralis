# AI / RAG 计划

更新时间：2026-07-02

## 目标

先把现有 AI 能力稳定验收，再推进 RAG 质量和 Agent 能力。本计划覆盖 `AiController`、文档摄入、向量检索、模型配置和后续智能能力。

## 当前事实

当前接口：

- `POST /api/ai/chat`
- `GET /api/ai/chat`
- `POST /api/ai/ingest`
- `POST /api/ai/ingest/file`
- `POST /api/ai/extract-tasks`
- `POST /api/ai/convert-handwriting`
- `POST /api/ai/schedule-suggest`

当前风险：

- AI 主流程缺少系统性联调记录。
- RAG 检索质量未验收。
- prod 配置口径需要和 LangChain4j 统一。
- 文档解析失败、超时、限流的用户反馈仍需确认。

## 任务清单

| ID | 优先级 | 任务 | 状态 | 输入 | 产出 | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| AI-01 | P1 | AI chat 联调 | 已构建待验收 | `/api/ai/chat` | 普通问答和 SSE 问答可用 | 成功、失败、超时都有稳定响应 |
| AI-02 | P1 | ingest 文本联调 | 已构建待验收 | `/api/ai/ingest` | 文本生成知识块流程可用 | 返回 block id 和切片信息 |
| AI-03 | P1 | ingest 文件联调 | 已构建待验收 | `/api/ai/ingest/file`、Tika | 文件解析任务状态可追踪 | 成功和失败都能被前端感知 |
| AI-04 | P1 | 手写转换联调 | 已构建待验收 | `/api/ai/convert-handwriting` | 手写文本转 Markdown / LaTeX | 空输入和错误输入有反馈 |
| AI-05 | P1 | 任务提取联调 | 已构建待验收 | `/api/ai/extract-tasks` | 文本提取任务结构 | 前端可转入 Task 流程 |
| AI-06 | P1 | 排期建议联调 | 已构建待验收 | `/api/ai/schedule-suggest` | 返回可解释排期建议 | 输出结构稳定 |
| AI-07 | P1 | AI 配置统一 | 进行中 | dev/prod 配置 | LangChain4j 配置口径一致 | prod 不使用旧键 |
| AI-08 | P2 | RAG 学科范围验收 | 计划中 | subjectId、Milvus 检索 | 学科上下文检索可控 | 不串学科、不串用户 |
| AI-09 | P2 | 文档解析安全限制 | 计划中 | Tika、文件大小限制 | 大文件和异常文件有保护 | 不因异常文件拖垮服务 |
| AI-10 | P3 | Parent-Child RAG | 计划中 | PostgreSQL、Milvus | 子块命中后回补父上下文 | 回答上下文更完整 |
| AI-11 | P3 | Re-ranker 管线 | 计划中 | Milvus TopK、reranker | 粗筛后重排 | 有质量对比样例 |
| AI-12 | P3 | Agent Tool 能力 | 计划中 | LangChain4j Tools | searchKnowledge/createTask/getScheduleLoad | 工具调用可审计 |

## 建议执行顺序

1. `AI-01` 到 `AI-07`：先让现有接口稳定。
2. `AI-08` 和 `AI-09`：补 RAG 范围和文档安全。
3. `AI-10` 到 `AI-12`：主流程稳定后再推进增强。

## 完成定义

- 现有 `/api/ai/*` 主流程有联调记录。
- AI 配置在 dev/prod 中口径一致。
- RAG 不串用户、不串学科。
- 非当前里程碑能力明确标为计划中，不误标已验收。

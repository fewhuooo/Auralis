# AI / RAG 计划

更新时间：2026-07-10

文档状态：现行计划

权威范围：模型配置、聊天、摄入、检索、错误处理、来源与质量验收

事实来源：`modules/Backend.md`、`contracts/API.md`、`project/Architecture.md`

## 目标

在不泄露密钥、不伪造结构化结果和不丢失来源的前提下，让 AI 聊天与资料摄入可质量验收。

## 当前事实

- Chat、SSE、文本/文件 ingest、任务抽取、手写转换和排期建议端点存在。
- LangChain4j、Milvus、Tika、MinIO 配置存在。
- 生产 AI 配置键不一致；端点缺测试和质量基准。

## 有序任务

1. 统一 dev/prod 的 LangChain4j 配置和环境变量。
2. 明确模型、embedding、collection、dimension 和来源元数据契约。
3. 为 chat、SSE、ingest、file ingest、JSON 期望、超时和 provider 错误写测试。
4. 对文件类型、大小、解析失败和恶意输入建立限制与提示。
5. 为每种 AI 输出定义用户可见来源、置信限制、编辑与重试入口。
6. 建立小型匿名评测集，覆盖学科问答、任务抽取、手写文本和排期。
7. 记录成本、延迟、失败率和向量检索质量指标。

## 验证

- 测试 profile 使用 mock/可控 provider。
- 真实 provider 验证记录模型、日期、输入类型和脱敏结果。
- 文件摄入必须同时检查资产、块、向量和错误回滚。

## 阻塞

- 生产 secret、模型选择、成本预算、评测标准和真实文件样本需要明确。

## 完成定义

- 配置键统一且 production-like 环境可加载。
- 关键 AI 错误有稳定反馈和测试。
- 输出来源可追溯，用户可编辑。
- 质量/成本基准达到产品确认门槛。

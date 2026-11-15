# AI / RAG 计划

更新时间：2026-11-15

文档状态：现行计划

权威范围：模型配置、聊天、摄入、检索、错误处理、来源与质量验收

事实来源：`modules/Backend.md`、`contracts/API.md`、`project/Architecture.md`

## 目标

在不泄露密钥、不伪造结构化结果和不丢失来源的前提下，让 AI 聊天与资料摄入可质量验收。

## 当前事实

- 当前 Chat 使用原生工具与 run/attempt 协议，Overview 使用 Markdown v2 和分批 Pipeline；摄入/检索与配置见[后端模块](../modules/Backend.md)和[API](../contracts/API.md)。
- 平台生成与 Embedding 配置已分组，向量检索使用 PostgreSQL/pgvector，资产使用 MinIO。
- 已有定向和受控网络测试；真实模型质量、跨端恢复与外部异常边界按[问题登记](../current/IssuesAndReview.md)验收，Suggestions 仍需独立质量交付。

## 有序任务

1. 核对现行生成/Embedding/BYOK 配置在目标环境的完整性与安全边界。
2. 验证当前 embedding 维度、已有向量空间和来源 revision/owner 契约；换模型须评估旧向量。
3. 核对已有 Chat/Overview/摄入/网络错误测试，补足明确缺口及真实取消、断流、UNKNOWN 恢复和用量结算验收。
4. 对文件类型、大小、解析失败和恶意输入建立限制与提示。
5. 为每种 AI 输出定义用户可见来源、置信限制、编辑与重试入口。
6. 建立经授权脱敏的评测集，覆盖学科问答、Overview 和检索来源；任务抽取、手写文本和排期建议只按已确认产品范围独立评估，不预设当前端点已实现。
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

整理前记录见[历史快照](../archive/maintenance-2026-11-15/planning/AIRag.md)，仅供追溯。

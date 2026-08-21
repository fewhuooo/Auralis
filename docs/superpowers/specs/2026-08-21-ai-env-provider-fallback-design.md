# AI env 默认 Provider 与 BYOK 覆盖设计

日期：2026-08-21

状态：已批准，进入实现

## 背景

当前 AI 运行时只从 `ai_credentials` 读取当前用户的 BYOK 配置。仓库根目录 `.env` 中的 `DEEPSEEK_API_KEY` 与 `SILICONFLOW_API_KEY` 没有进入 Spring 配置，也没有参与 Provider 解析，导致没有 BYOK 的用户无法使用服务端默认模型。

## 目标

- 使用 `AURALIS_AI_DEFAULT_PROVIDER` 指定默认聊天 Provider。
- 默认聊天与 embedding 凭据从服务端 env 运行时配置读取。
- 当前用户存在 BYOK 配置时，按 Provider 覆盖 env 的 API Key、Base URL 和模型。
- env API Key 不写入数据库、不返回 API、不进入前端。
- 未显式指定聊天 Provider 时使用配置的默认 Provider，而不是硬编码 `DEEPSEEK`。
- 保持现有用户/Provider 隔离和加密 BYOK 存储语义。

## 方案

在后端配置层增加按 Provider 的默认运行时凭据，并由 `AiSettingsService` 统一解析：

1. 先读取当前用户的 `ai_credentials` 行；存在有效 BYOK 密钥时使用用户配置。
2. 不存在用户配置时，按 Provider 读取 env 默认凭据。
3. 聊天请求未指定 Provider 时使用 `auralis.ai.default-provider`。
4. 检索仍使用独立的 embedding Provider；用户 BYOK 优先，否则使用其 env 默认凭据。

Compose 只把环境变量注入后端进程，Spring 配置绑定只持有服务端运行时值。`AiSettingsView` 继续只暴露 `hasApiKey`，不暴露任何密钥。

## 错误与兼容性

- 默认 Provider 缺少 env Key 时，继续返回 `MODEL_UNAVAILABLE` 与安全错误详情。
- 用户 BYOK 的 Provider 行为保持兼容；更新时仍允许省略 API Key 以保留现有密钥。
- 不新增数据库表或字段，不迁移既有 BYOK 数据。

## 验证

- 后端单元测试覆盖 env 默认聊天、env 默认 embedding、BYOK 覆盖和缺失凭据错误。
- PC 协议测试覆盖未指定 Provider 时的请求兼容性。
- 运行后端测试、PC type-check、R4 协议测试和 Web 构建。
- 真实外部 Provider 联调仍需人工验收，不由本地自动测试替代。

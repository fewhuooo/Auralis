# R1-01 BYOK 与出站网络安全设计

日期：2026-08-16

状态：已批准，进入实现

## 目标

为 AI Provider 和 URL 资料摄取建立统一、可测试的出站安全边界，满足部署测试前清单 R1-01：阻断 SSRF、限制重定向，固定连接超时和响应大小，确保 BYOK 只以密文持久化且不会进入日志、异常或对象字符串表示。

## 已确认约束

- Provider `baseUrl` 必须使用 HTTPS。
- Provider host 必须命中 `auralis.ai.allowed-provider-hosts` 白名单；自定义 Provider 只有在显式加入白名单后才可使用。
- Provider 不允许 userinfo、回环、私网、链路本地、组播、未指定地址或危险端口；无端口按 HTTPS 443 处理，显式端口只允许 443。
- Provider DNS 在请求前解析并校验全部地址；实际 HTTP 客户端使用同一组已校验地址，避免请求阶段重新解析到另一地址。
- Provider 禁止自动重定向；资料 URL 保留经过公网地址校验的 HTTP/HTTPS，但每次手动重定向都重新校验并受最大跳转数限制。
- Provider 请求使用配置的连接/读取总超时和最大响应体；资料 URL继续使用独立的连接、读取和摄取大小限制。
- API key 只写入 AES-GCM 密文；`AiCredential` 的字符串表示、异常和外部响应不包含明文或密文 key。

## 方案

### Provider 白名单与解析

新增 `ProviderEndpointPolicy` 作为 Provider URL 的唯一入口。它负责 URI 规范化、HTTPS/端口/userinfo 校验、host 白名单匹配和 DNS 地址校验，并返回包含原始 host、端口和已校验地址集合的不可变解析结果。白名单从 `AuralisProperties.Ai.allowedProviderHosts` 读取，默认只包含已支持公共 Provider 的官方 host；部署环境可通过环境变量增加明确允许的自托管 host。

新增的固定地址解析器被注入 JDK `HttpClient`。它只为已经校验的目标 host 返回同一组地址，HttpClient 关闭自动重定向，从而让“校验的地址”和“实际连接的地址”一致。请求仍使用原始 hostname，保留 HTTPS 的 Host/SNI/证书校验。

### Provider 请求与响应

新增 `ProviderHttpClient`，集中创建 JDK HttpClient、设置连接和请求超时、Authorization header、POST JSON，并以受限 InputStream 读取响应。响应状态映射保持现有 `RATE_LIMITED`、`MODEL_UNAVAILABLE` 和 `MODEL_PROVIDER_ERROR` 语义；异常只返回固定安全文案。聊天和 embedding 适配器只负责请求体/响应 DTO 解析，不再各自创建未配置的 RestClient。

### 资料 URL 摄取

保留资料 URL 的 HTTP/HTTPS 产品能力，但让 `UrlSecurityPolicy` 暴露已校验地址集合，`UrlSourceFetcher` 使用固定地址解析器发起 GET。重定向继续由 fetcher 手动处理，每一跳重新执行 scheme、host、地址和跳数校验；响应继续受 `ingestionMaxBytes` 限制，空响应和非 2xx 使用安全错误。

### 密钥脱敏

保留 `AiKeyCipher` 的 AES-GCM 存储实现；为 `AiCredential` 覆盖 `toString()`，仅显示 base URL、model 和 `[REDACTED]`。Provider 客户端不记录 Authorization 或请求体，所有 DomainException 使用固定消息。测试覆盖持久化密文、字符串脱敏和错误文案不泄露 key。

## 配置

新增：

- `auralis.ai.allowed-provider-hosts` / `AURALIS_AI_ALLOWED_PROVIDER_HOSTS`
- `auralis.ai.provider-max-response-bytes` / `AURALIS_AI_PROVIDER_MAX_RESPONSE_BYTES`

现有 `request-timeout-millis` 作为 Provider 的连接与请求超时上限；现有 URL 摄取超时和 `url-max-redirects` 保持独立。

## 错误处理

| 情况 | 对外错误 |
| --- | --- |
| 非 HTTPS、userinfo、白名单外 host、危险端口 | `MODEL_UNAVAILABLE`（Provider 请求）或 `VALIDATION_FAILED`（保存设置） |
| 任一 DNS 地址为本地/私网/链路本地/组播 | `MODEL_UNAVAILABLE` 或 `INGESTION_FAILED` |
| 超时、连接失败、响应过大 | `MODEL_UNAVAILABLE` 或 `INGESTION_FAILED` |
| 429 | `RATE_LIMITED` |
| 5xx、断流、无效 JSON/响应结构 | `MODEL_UNAVAILABLE` 或 `MODEL_PROVIDER_ERROR` |

错误 detail 不包含 URL 中的敏感 query、Authorization、API key、完整响应体或底层异常。

## 验收与边界

自动测试覆盖 HTTPS、allowlist、危险端口、地址分类、固定解析器、重定向、超时、最大响应体、429/5xx、密钥脱敏和 Provider 适配器回归。该实现不宣称真实 DNS rebinding、生产网络策略或真实 Provider smoke 已完成；这些仍由 R2/R5 的真实依赖和人工门禁负责。


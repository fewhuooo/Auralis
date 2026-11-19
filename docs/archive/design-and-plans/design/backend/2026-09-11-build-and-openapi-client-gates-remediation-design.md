# Build 与 OpenAPI 客户端门禁修复设计

更新时间：2026-09-11

文档状态：已批准设计，待实施

权威范围：Server fresh testCompile、PC/Mobile OpenAPI generated schema 一致性

## 背景

Server 前三类全量测试失败修复完成后，仍有两个代码库内可关闭的门禁：

1. `AiProviderSecurityTests` 中一个匿名 `ProviderHttpTransport` 只覆盖 timeout-aware overload，没有实现接口保持 `@FunctionalInterface` 所需的基础 `post(..., byte[])` 抽象方法，导致 fresh `clean test-compile` 失败。
2. `docs/contracts/openapi/auralis-openapi.json` 已与 Server runtime 一致，但 PC generated schema 尚未包含两个 Overview operation 的 `X-Overview-Request-Id` header；生成器同时管理 PC 与 Mobile 两端，因此需要按当前 artifact 重新生成并逐端审查，而不是只手工修 PC。

Docker/Testcontainers 的 3 个 errors 仍属于外部运行环境，不在本设计范围内。

## 目标与非目标

### 目标

- 恢复 Server fresh `clean test-compile`。
- 保持 timeout-aware transport 测试仍能证明 embedding 使用 3000ms connect timeout 和 10000ms response timeout。
- 使用仓库固定的 `openapi-typescript@7.13.0` 同步 PC 与 Mobile schema。
- 让 `scripts/check-openapi.ps1` 的 artifact 与两端 generated schema 检查全部通过。

### 非目标

- 不修改 `ProviderHttpTransport` 接口、生产 HTTP transport 或 Provider 超时语义。
- 不手工维护 generated schema。
- 不改变 API endpoint、请求/响应 DTO 或 OpenAPI artifact 语义。
- 不跳过 Docker/Testcontainers 测试，不改变其默认启用策略。

## 设计

### 1. 测试 transport 编译适配

只修改 `AiProviderSecurityTests` 中 `passesCompatibilityDefaultTimeoutsToSiliconFlowEmbeddingTransport` 的匿名 transport，在既有 timeout-aware overload 旁增加基础方法：

```java
@Override
public byte[] post(
        ResolvedProviderEndpoint resolved,
        String path,
        String apiKey,
        byte[] body) {
    throw new AssertionError("timeout-aware transport overload was not used");
}
```

这样满足 `ProviderHttpTransport` 的抽象契约，同时保留测试的核心断言：若生产代码错误调用基础 overload，测试会明确失败；只有调用 timeout-aware overload 才会记录并断言两个 timeout 值。

不把基础方法改为 interface default，也不调整生产 transport，因为编译错误来自测试 double 与当前接口契约不同步。

### 2. PC/Mobile schema 原子同步

从当前已通过 `OpenApiArtifactTests` 的 `docs/contracts/openapi/auralis-openapi.json` 生成两端 schema：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\generate-openapi-sdk.ps1 -SkipExport
```

`-SkipExport` 保证本步骤只消费已审核的 artifact，不再次改写它。脚本固定使用 `openapi-typescript@7.13.0`，并统一生成：

- `Auralis-PC/src/api/generated/schema.ts`
- `Auralis-Mobile/src/api/generated/schema.ts`

执行前保存 artifact 与两端 schema 的哈希和 diff；执行后要求 artifact 哈希不变。generated 文件以同一 artifact、同一生成器版本的结果为权威，不在生成结果上追加手工补丁。

差异审查重点为两个 Overview operation 的可选 header：

```typescript
header?: {
  "X-Overview-Request-Id"?: string
}
```

以及两端之前尚未同步的现行 Overview endpoint/schema。若生成结果包含 artifact 中不存在的路径、DTO 或手写逻辑，则视为异常并停止；正常的声明排序变化按固定生成器输出接受。

## 验证策略

### Server

1. 修复前运行 `mvnw -B -ntp clean test-compile`，确认失败点为匿名 transport 缺少基础 `post(...)`。
2. 补齐测试 double 后再次运行 fresh `clean test-compile`，要求 exit 0。
3. 运行 `AiProviderSecurityTests` 与 `ProviderHttpClientTests`，确认 timeout-aware 调用和错误映射保持通过。
4. 运行 Server 全量测试；Docker 不可用时仍只允许 3 个既有 Testcontainers errors，其他 failures/errors 必须为 0。

### OpenAPI 与客户端

1. 修复前运行 `scripts/check-openapi.ps1`，记录 generated schema stale。
2. 使用固定生成器同步两端 schema。
3. 运行 `scripts/check-openapi.ps1`，要求 artifact、PC schema 与 Mobile schema 全部一致。
4. 运行 PC 与 Mobile 的类型检查，确认生成类型没有破坏现有调用方。
5. 运行 `git diff --check` 并核对只修改目标测试、两端 generated schema 和要求同步的现行文档。

## 文档回写

实施完成后按实际证据同步：

- `docs/modules/Backend.md`：fresh testCompile 与 Provider 聚焦结果。
- `docs/modules/FrontendPC.md`、`docs/modules/FrontendMobileTablet.md`：generated schema 已与当前 artifact 同步。
- `docs/current/Status.md`、`docs/current/IssuesAndReview.md`：关闭测试编译和 generated schema stale 风险，保留 Docker 与外部验收边界。
- `docs/release/Changelog.md`：记录修复与验证。

API 和数据库语义均不变化，因此 `docs/contracts/API.md` 与 `docs/contracts/Database.md` 只核对，不改写。

## 验收标准

- fresh `clean test-compile` 退出 0。
- `AiProviderSecurityTests` 与 `ProviderHttpClientTests` 全部通过，兼容默认 timeout 仍为 3000ms/10000ms。
- 两端 generated schema 均由当前 artifact 和 `openapi-typescript@7.13.0` 生成。
- `scripts/check-openapi.ps1` 退出 0。
- PC、Mobile 类型检查通过。
- Server 全量测试除当前 Docker 环境导致的 3 个 Testcontainers errors 外无其他失败。
- 未修改生产 Provider transport、API/数据库语义或 Docker 测试策略。

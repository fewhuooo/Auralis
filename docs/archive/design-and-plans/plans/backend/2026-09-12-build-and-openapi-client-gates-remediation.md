# Build and OpenAPI Client Gates Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 恢复 Server fresh 测试编译，并让 PC/Mobile generated OpenAPI schema 与当前 runtime artifact 完全一致。

**Architecture:** 只在失败的测试 double 中实现 `ProviderHttpTransport` 必需的四参数方法，生产 transport 保持不变。两端 schema 由已审核 artifact 和固定 `openapi-typescript@7.13.0` 统一生成，不接受手工维护或单端漂移。

**Tech Stack:** Java 21、Spring Boot 4、JUnit 5、Maven Wrapper、TypeScript、Vue、Uni-app、openapi-typescript 7.13.0、PowerShell。

## Global Constraints

- 不修改 `ProviderHttpTransport` 接口、生产 HTTP transport 或 Provider timeout 语义。
- 不手工修改 generated schema；必须由 `scripts/generate-openapi-sdk.ps1 -SkipExport` 生成。
- 不改变 API endpoint、请求/响应 DTO、OpenAPI artifact 或数据库语义。
- 不跳过 Docker/Testcontainers 测试，不改变默认启用策略。
- 保护共享 dirty worktree，不覆盖或提交用户已有修改；实现文件不在共享 checkout 中提交。
- 所有实现和审查子代理使用 `gpt-5.6-luna`。

---

### Task 1: 修复 Provider 测试 double 的 fresh 编译

**Files:**
- Modify: `Auralis-Server/src/test/java/com/auralis/app/AiProviderSecurityTests.java:182-192`
- Test: `Auralis-Server/src/test/java/com/auralis/app/ProviderHttpClientTests.java`

**Interfaces:**
- Consumes: `ProviderHttpTransport.post(ResolvedProviderEndpoint, String, String, byte[]): byte[]`。
- Preserves: timeout-aware six-argument overload and 3000ms/10000ms assertions。

- [ ] **Step 1: Verify the fresh compilation RED**

Run from `Auralis-Server`:

```powershell
.\mvnw.cmd -B -ntp clean test-compile
```

Expected: exit 1 at `AiProviderSecurityTests.java:182`; the anonymous transport does not implement four-argument `post(...)`.

- [ ] **Step 2: Add the required fail-fast base overload**

Add beside the existing timeout-aware overload:

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

Do not change the interface or production implementation.

- [ ] **Step 3: Verify fresh compilation and Provider behavior GREEN**

Run:

```powershell
.\mvnw.cmd -B -ntp clean test-compile
.\mvnw.cmd -B -ntp "-Dtest=AiProviderSecurityTests,ProviderHttpClientTests" test
```

Expected: both commands exit 0; the Provider tests pass and the timeout-aware test still asserts 3000ms connect and 10000ms response timeout.

---

### Task 2: Regenerate PC and Mobile OpenAPI schemas

**Files:**
- Modify (generated): `Auralis-PC/src/api/generated/schema.ts`
- Modify (generated): `Auralis-Mobile/src/api/generated/schema.ts`
- Verify only: `docs/contracts/openapi/auralis-openapi.json`

**Interfaces:**
- Consumes: current checked-in OpenAPI artifact and `openapi-typescript@7.13.0`.
- Produces: identical generated type surface for the same artifact on PC and Mobile.

- [ ] **Step 1: Capture hashes and verify schema RED**

Run from repository root:

```powershell
Get-FileHash docs\contracts\openapi\auralis-openapi.json
Get-FileHash Auralis-PC\src\api\generated\schema.ts
Get-FileHash Auralis-Mobile\src\api\generated\schema.ts
powershell -ExecutionPolicy Bypass -File .\scripts\check-openapi.ps1
```

Expected: artifact test passes after Task 1, then the script exits 1 because a generated client schema is stale.

- [ ] **Step 2: Regenerate both schemas from the approved artifact**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\generate-openapi-sdk.ps1 -SkipExport
```

Expected: exit 0; only PC and Mobile generated schema files change. The artifact hash remains identical to Step 1.

- [ ] **Step 3: Inspect the generated surface**

Verify both files contain:

```typescript
header?: {
    "X-Overview-Request-Id"?: string;
};
```

for both `subjectOverview` and `sourceOverview`. Review `git diff` to confirm changes are generator output backed by artifact paths/schemas; do not add hand-written edits.

- [ ] **Step 4: Verify contract and client compilation GREEN**

Run from repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-openapi.ps1
```

Then run:

```powershell
cd Auralis-PC
npm.cmd run type-check
cd ..\Auralis-Mobile
npm.cmd run type-check
```

Expected: all three commands exit 0.

---

### Task 3: Full regression and authoritative documentation

**Files:**
- Modify: `docs/modules/Backend.md`
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/modules/FrontendMobileTablet.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`
- Verify only: `docs/contracts/API.md`
- Verify only: `docs/contracts/Database.md`

**Interfaces:**
- Consumes: Task 1 fresh compilation and Task 2 generated contract results.
- Produces: current test evidence with Docker and external acceptance boundaries kept explicit.

- [ ] **Step 1: Run Server fresh focused and full gates**

Run from `Auralis-Server`:

```powershell
.\mvnw.cmd -B -ntp clean "-Dtest=ArchitectureTests,OpenApiArtifactTests,AiProviderSecurityTests,ProviderHttpClientTests,AuthControllerTests,CoreDomainControllerTests,CoreDomainServiceTests,IdentityRepositoryTests,IdentityServiceTests,ParsedDocumentCompleteTests,AiIngestionJobTests" test
.\mvnw.cmd -B -ntp test
```

Expected: focused command exits 0. Full test may exit 1 only for the three known Docker/Testcontainers errors; it must report 0 failures and no compilation, Modulith, OpenAPI, or H2 FK errors.

- [ ] **Step 2: Run final contract and client gates**

Run from repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-openapi.ps1
cd Auralis-PC
npm.cmd run type-check
cd ..\Auralis-Mobile
npm.cmd run type-check
```

Expected: all commands exit 0.

- [ ] **Step 3: Update current documentation**

Record exact command results. Mark the testCompile blocker and generated-schema stale issue closed only if fresh commands pass. Preserve the Docker/Testcontainers and real Provider/PostgreSQL/MinIO/Tauri/GUI/business acceptance boundaries. State that schema files changed by generation while API and database semantics did not.

- [ ] **Step 4: Verify scope and formatting**

Run from repository root:

```powershell
git diff --check
git status --short
```

Confirm no production Provider transport, migration, OpenAPI artifact, Docker strategy, or unrelated source file changed.

- [ ] **Step 5: Independent Luna review**

Reviewer checks test-double behavior, generated-file provenance, PC/Mobile parity, fresh versus incremental test evidence, documentation accuracy, and dirty-worktree protection. Critical and Important findings must be fixed and re-reviewed.

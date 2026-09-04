# Default Container Tests Implementation Plan

**Goal:** Make ordinary `mvn -B -ntp clean test` execute the PostgreSQL/pgvector and MinIO Testcontainers instead of silently skipping them.

**Architecture:** Keep the existing `@EnabledIfSystemProperty` guards and profile names for backward compatibility, but set both guard properties in the base Surefire configuration. Docker availability therefore becomes a required prerequisite for the ordinary test command, and a missing Docker engine fails the build instead of producing skipped integration tests.

**Tech Stack:** Maven Surefire, JUnit Jupiter, Testcontainers 2.0.5, PostgreSQL/pgvector, MinIO, PowerShell.

## Global Constraints

- Ordinary `mvn -B -ntp clean test` must report zero failures, zero errors, and zero skipped tests when Docker Desktop is running.
- Preserve the existing `postgres-it` and `minio-it` profiles and their test classes.
- Do not change production behavior or commit/push changes.
- Update current task/status/release documentation with the command and its actual result.

---

### Task 1: Enable container tests in the default Surefire lifecycle

**Files:**
- Modify: `Auralis-Server/pom.xml:154-158`

**Interfaces:**
- Consumes: the existing `auralis.postgres.it` and `auralis.minio.it` system-property guards in the three Testcontainers test classes.
- Produces: default Surefire properties that enable both guards for every ordinary Maven test run.

- [x] **Step 1: Add both default system properties**

Add this block inside the base `maven-surefire-plugin` configuration, alongside the existing `argLine`:

```xml
<systemPropertyVariables>
    <auralis.postgres.it>true</auralis.postgres.it>
    <auralis.minio.it>true</auralis.minio.it>
</systemPropertyVariables>
```

- [x] **Step 2: Run the ordinary test lifecycle**

Run from `Auralis-Server` with Docker Desktop's Linux engine selected:

```powershell
$env:DOCKER_HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine'
mvn -B -ntp clean test
```

Result: exit code 0, 135 tests, 0 failures, 0 errors, and 0 skipped; the PostgreSQL/pgvector and MinIO integration classes executed successfully.

- [x] **Step 3: Update current evidence**

Update `docs/planning/PreDeploymentReadinessTasks.md`, `docs/current/Status.md`, `docs/current/IssuesAndReview.md`, and `docs/release/Changelog.md` so G1 records the ordinary command as passing with zero skipped tests, while retaining real Provider and later frontend acceptance as separate open work.

- [x] **Step 4: Run final consistency checks**

Run:

```powershell
git diff --check
$env:DOCKER_HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine'
docker compose --env-file .env.example ps -a
```

Result: `git diff --check` reported no whitespace errors; Compose db and MinIO are healthy, backend is healthy, frontend is running, and `minio-init` exited 0.

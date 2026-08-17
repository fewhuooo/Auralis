# R1-06 后端工具链和运行配置设计

日期：2026-08-17
状态：已获用户确认，待实施

## 目标

收敛后端 Windows Maven Wrapper、生产运行配置和测试启动警告，使 R1-06 的工具链/配置门禁可以在本地重复验证，同时不改变业务 API、数据库结构或本地 OpenAPI smoke 行为。

## 当前证据

- `Auralis-Server/mvnw.cmd` 对 `$MAVEN_M2_PATH` 直接访问 `.Target[0]`；普通目录的 `Target` 为空时会报 `Cannot index into a null array`。
- `application.yml` 未显式设置 `spring.jpa.open-in-view`，默认值仍可能开启；测试 profile 已单独关闭。
- `application-prod.yml` 未显式关闭 springdoc API docs 和 Swagger UI。
- `pom.xml` 未显式锁定 H2，当前由 Boot BOM 解析到 2.4.240；当前 Flyway 12.x 组合会产生 H2 兼容性提示。
- 测试启动时 Mockito 使用动态 agent，Java 运行时输出动态 agent 警告。

## 设计决策

### 1. Maven Wrapper 路径判定

仅修改 `Auralis-Server/mvnw.cmd` 中 Maven 本地仓库路径解析：

- 创建目录后用 `Get-Item -LiteralPath` 读取目录对象。
- 普通目录直接使用 `$MAVEN_M2_PATH/wrapper/dists`。
- 只有对象存在链接类型/重解析点且有非空目标时，才使用链接目标的 `wrapper/dists`。
- 不改变 Wrapper 版本、下载地址、校验流程或环境变量接口。

这样可以覆盖普通目录、符号链接和目录 junction，且不再对空数组做索引。

### 2. 运行 profile

- 在 `application.yml` 全局设置 `spring.jpa.open-in-view: false`，让 local、test、prod 都采用明确的事务边界；保留 `application-test.yml` 中现有显式设置作为测试配置自描述。
- 在 `application-prod.yml` 设置：

  ```yaml
  springdoc:
    api-docs:
      enabled: false
    swagger-ui:
      enabled: false
  ```

- 不修改 local profile 的文档能力，保留现有 `/v3/api-docs` smoke 测试；不删除依赖或公共 OpenAPI 配置，避免影响开发和契约生成。

### 3. 测试依赖和 Mockito agent

- 在 `pom.xml` 增加 `h2.version` 属性并把 H2 test dependency 固定为 `2.2.224`，避免随 Boot BOM 漂移到当前 Flyway 组合未验证的版本。
- 为 Maven Surefire 增加 Mockito core Java agent，使用项目实际解析的本地仓库和 Boot 管理的 Mockito 版本：

  ```xml
  <argLine>-javaagent:${settings.localRepository}/org/mockito/mockito-core/${mockito.version}/mockito-core-${mockito.version}.jar</argLine>
  ```

- 将项目 `mockito.version` 固定为当前 Spring Boot 4.1.0 BOM 的 5.23.0，agent 与实际 test classpath 保持一致。

## 测试设计

- 扩展 `ConfigurationTests`，断言 `spring.jpa.open-in-view=false` 的最终环境属性。
- 新增生产 profile 配置测试，使用 `test` 数据源和 `prod` 配置组合，断言 `springdoc.api-docs.enabled=false`、`springdoc.swagger-ui.enabled=false`，并验证 `/v3/api-docs` 不再提供文档响应。
- 保留并运行现有 local `ApiSmokeTests`，证明关闭仅作用于 prod profile。
- 运行 `Auralis-Server\mvnw.cmd -v`，证明普通 Maven 仓库路径不再触发空数组异常。
- 运行定向配置测试、`ArchitectureTests` 和全量 `mvn -B -ntp clean test`；检查 H2/Flyway 警告和 Mockito 动态 agent 警告不再出现。

## 非目标与验收边界

- 不修改业务 Controller、API 契约、数据库迁移、Docker Compose 或真实 PostgreSQL/MinIO/Provider 验收。
- `mvnw.cmd -v` 和自动化测试只能证明本地 Wrapper、配置绑定和测试进程行为，不能证明干净机器上的网络下载、生产 secret、真实数据库或 GUI 验收。
- 生产关闭文档端点不等于完成 OpenAPI 产物冻结；契约生成和三端联调仍按后续任务执行。

## 完成条件

1. Wrapper 在当前普通 Maven 仓库路径下 `-v` 返回版本且退出码为 0。
2. local OpenAPI smoke 仍通过，prod profile 文档端点关闭。
3. 所有 profile 的 JPA `open-in-view` 最终值为 false。
4. H2 解析到 2.2.224，Flyway/H2 兼容性警告消失。
5. Mockito agent 警告消失，全量测试退出码为 0。
6. `docs/current/Status.md`、`docs/current/IssuesAndReview.md`、`docs/modules/Backend.md`、`docs/modules/Infrastructure.md`、`docs/planning/PreDeploymentReadinessTasks.md` 和 `docs/release/Changelog.md` 同步本轮证据与剩余限制。

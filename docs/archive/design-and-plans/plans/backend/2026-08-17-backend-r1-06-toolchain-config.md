# R1-06 后端工具链和运行配置实施计划

> 面向当前会话执行；不提交或覆盖工作树中已有用户改动。

**目标：** 修复 Windows Maven Wrapper 普通仓库路径异常，明确关闭生产文档端点和 JPA Open-in-View，并锁定 H2/Mockito 测试工具链，使 R1-06 可重复验证。

**架构：** 保持现有 Spring Boot 配置分层和 Maven Wrapper 结构。业务代码、API、数据库迁移和 Compose 拓扑不变；只调整 Wrapper 的路径判定、profile 属性和测试依赖/启动参数，并以 Spring context/MockMvc 回归测试证明 profile 行为。

**技术栈：** Java 21、Spring Boot 4.1、Maven Wrapper 3.3.4、Springdoc、Flyway 12.x、H2 2.2.224、Mockito Java agent、JUnit 6/Spring Boot Test。

## 全局约束

- 保留现有未提交改动和 .claude/，不得使用 reset、checkout 或覆盖式清理。
- 不修改业务 API、数据库迁移、Docker Compose、真实凭据或 Provider 网络行为。
- local profile 的 /v3/api-docs smoke 必须继续可用；prod profile 必须关闭 OpenAPI 和 Swagger UI。
- 所有 profile 的 spring.jpa.open-in-view 最终值必须为 false。
- H2 固定为 2.2.224；Mockito agent 从实际 mockito-core 测试依赖解析。
- 完成后同步 Backend、Infrastructure、Status、IssuesAndReview、任务清单和 Changelog。

---

### 任务 1：补充配置回归测试

**文件：**

- 修改：Auralis-Server/src/test/java/com/auralis/app/ConfigurationTests.java
- 新建：Auralis-Server/src/test/java/com/auralis/app/ProductionConfigurationTests.java

**接口与断言：**

- ConfigurationTests 继续以默认 local profile 启动，读取 Spring Environment，断言 spring.jpa.open-in-view 为 false。
- ProductionConfigurationTests 使用 @ActiveProfiles({"test", "prod"}) 和 MockMvc，断言两个 springdoc enabled 属性为 false，并断言 /v3/api-docs 返回非成功状态。

- [ ] 步骤 1：先写 local/test 配置断言

  在 ConfigurationTests 注入 org.springframework.core.env.Environment，增加只断言最终属性值的测试：

      @Test
      void disablesOpenInViewByDefault() {
          assertThat(environment.getProperty("spring.jpa.open-in-view", Boolean.class)).isFalse();
      }

- [ ] 步骤 2：运行配置测试确认失败

  运行：mvn -B -ntp "-Dtest=ConfigurationTests" test

  预期：新增断言因默认配置尚未关闭而失败，或明确显示实际值为 true。

- [ ] 步骤 3：写生产 profile 回归测试

  新测试使用 @SpringBootTest(classes = AuralisApplication.class)、@AutoConfigureMockMvc、@ActiveProfiles({"test", "prod"})，并在类级别提供 @TestPropertySource(properties = "AURALIS_PUBLIC_BASE_URL=http://localhost")。注入 Environment 和 MockMvc，测试两个属性为 false，随后请求 /v3/api-docs 并断言 status().isNotFound()。

- [ ] 步骤 4：运行新增测试确认生产断言失败

  运行：mvn -B -ntp "-Dtest=ConfigurationTests,ProductionConfigurationTests" test

  预期：local open-in-view 断言或生产 springdoc 断言失败，失败原因来自缺少目标配置而非测试类错误。

### 任务 2：实现 profile 和依赖配置

**文件：**

- 修改：Auralis-Server/src/main/resources/application.yml
- 修改：Auralis-Server/src/main/resources/application-prod.yml
- 修改：Auralis-Server/pom.xml

- [ ] 步骤 1：关闭 JPA Open-in-View

  在 spring 节点增加：

      jpa:
        open-in-view: false

- [ ] 步骤 2：关闭生产文档端点

  在 application-prod.yml 增加：

      springdoc:
        api-docs:
          enabled: false
        swagger-ui:
          enabled: false

- [ ] 步骤 3：固定 H2 版本

  在 POM properties 增加 h2.version=2.2.224，并将 H2 test dependency 增加 version=\${h2.version}。

- [ ] 步骤 4：配置 Mockito agent

  在现有 build plugins 中增加 maven-surefire-plugin 配置，使用项目实际 Maven 仓库和 Mockito 5.23.0：

      -javaagent:${settings.localRepository}/org/mockito/mockito-core/${mockito.version}/mockito-core-${mockito.version}.jar

### 任务 3：修复 Maven Wrapper 普通目录判定

**文件：**

- 修改：Auralis-Server/mvnw.cmd

- [ ] 步骤 1：替换空数组风险代码

  将 $MAVEN_M2_PATH 的 Target[0] 直接访问改为先读取对象的 LinkType/Target，普通目录直接使用 $MAVEN_M2_PATH，只有存在有效链接目标时才拼接目标目录；其余下载、解压、校验和命令转发逻辑保持不变。

- [ ] 步骤 2：验证 Wrapper

  运行：.\mvnw.cmd -v

  预期：退出码 0，打印 Maven 版本；不再出现 Cannot index into a null array。

### 任务 4：绿色验证和文档回写

**文件：**

- 修改：docs/modules/Backend.md
- 修改：docs/modules/Infrastructure.md
- 修改：docs/current/Status.md
- 修改：docs/current/IssuesAndReview.md
- 修改：docs/planning/PreDeploymentReadinessTasks.md
- 修改：docs/release/Changelog.md

- [ ] 步骤 1：运行定向测试

  运行：mvn -B -ntp "-Dtest=ConfigurationTests,ProductionConfigurationTests,ApiSmokeTests,ArchitectureTests" test

  预期：local OpenAPI smoke、生产关闭断言、open-in-view 断言和架构测试全部通过。

- [ ] 步骤 2：运行全量测试

  运行：mvn -B -ntp clean test

  预期：退出码 0；记录测试通过/失败/跳过数量，并检查输出中不再出现 H2/Flyway 兼容性警告和 Mockito dynamic-agent 警告。

- [ ] 步骤 3：检查差异

  运行：git diff --check

  预期：无 whitespace error；允许记录既有换行格式提示。

- [ ] 步骤 4：回写证据

  将实际命令、日期、结果和限制写回上述六份文档：代码/自动测试不等于干净 Windows、生产 secret、真实 PostgreSQL/MinIO/Provider 或 GUI 验收。

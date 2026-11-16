package com.auralis.app.ai;

import com.auralis.app.support.AuthTestAccounts;
import com.auralis.app.AuralisApplication;
import com.auralis.app.ai.OverviewDtos.OverviewResponse;
import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.internal.persistence.SourceEntity;
import com.auralis.app.source.internal.persistence.SourceRepository;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.ObjectMapper;

import com.auralis.app.support.AuthTestAccounts;
import java.sql.Connection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.auralis.app.support.AuthTestAccounts;
import javax.sql.DataSource;

import com.auralis.app.support.AuthTestAccounts;
import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.PortBinding;
import com.github.dockerjava.api.model.Ports;

import com.auralis.app.support.AuthTestAccounts;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Real PostgreSQL transaction evidence for Chat's saved source-overview read path. */
@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("postgres-it")
@EnabledIfSystemProperty(named = "auralis.postgres.it", matches = "true")
@Testcontainers
class OverviewResultReadPathPostgresIntegrationTests {
    private static final String POSTGRES_IMAGE = "pgvector/pgvector:0.8.6-pg17-bookworm";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse(POSTGRES_IMAGE).asCompatibleSubstituteFor("postgres"))
            .withLabel("codex.task", "auralis-chat-two-failures-fix-20261105")
            .withCreateContainerCmdModifier(command -> command.getHostConfig().withPortBindings(
                    new PortBinding(Ports.Binding.bindIp("127.0.0.1"), new ExposedPort(5432))));

    static {
        POSTGRES.withTmpFs(Map.of("/var/lib/postgresql/data", "rw"));
    }

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired private DataSource dataSource;
    @Autowired private Environment environment;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private IdentityService identity;
    @Autowired private SubjectService subjects;
    @Autowired private SourceRepository sources;
    @Autowired private SourceChunkRepository chunks;
    @Autowired private OverviewResultService overviews;

    @BeforeEach
    void databaseIsTaskOwnedAndProviderIsDisabled() throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            assertThat(connection.getMetaData().getURL()).isEqualTo(POSTGRES.getJdbcUrl());
        }
        assertThat(POSTGRES.getMappedPort(5432)).isNotEqualTo(5432);
        assertThat(environment.getProperty("auralis.ai.enabled", Boolean.class)).isFalse();
    }

    @Test
    void chatSourceReadsRunInWritableServiceTransactionsAndKeepOwnerRevisionAndMissingChecks() throws Exception {
        assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
        UUID userId = user();
        UUID subjectId = subjects.create(userId, new SubjectCommand("Overview read scope", null, null, "001")).id();
        SourceEntity source = source(userId, subjectId, "Source with current raw content");
        addChunk(userId, source);
        saveFormalSourceOverview(userId, source);

        assertThat(overviews.currentSourceOverviewIds(userId,
                Map.of(source.getId(), source.getIngestionRevision()))).containsExactly(source.getId());
        assertThat(overviews.currentSourceOverviewIds(UUID.randomUUID(),
                Map.of(source.getId(), source.getIngestionRevision()))).isEmpty();
        assertThat(overviews.readCurrentSource(userId, source.getId(), source.getIngestionRevision()))
                .get().extracting(OverviewResultView::title).isEqualTo("Saved source overview");

        SourceEntity missing = source(userId, subjectId, "Source without saved overview");
        assertThat(overviews.readCurrentSource(userId, missing.getId(), missing.getIngestionRevision())).isEmpty();
        assertThatThrownBy(() -> overviews.readCurrentSource(UUID.randomUUID(), source.getId(),
                source.getIngestionRevision())).isInstanceOf(DomainException.class)
                .satisfies(failure -> assertThat(((DomainException) failure).code()).isEqualTo("RESOURCE_NOT_FOUND"));
        assertThatThrownBy(() -> overviews.readCurrentSource(userId, source.getId(), UUID.randomUUID()))
                .isInstanceOf(DomainException.class)
                .satisfies(failure -> assertThat(((DomainException) failure).code()).isEqualTo("SOURCE_SCOPE_CHANGED"));
        assertThat(overviews.currentSourceOverviewIds(userId,
                Map.of(source.getId(), UUID.randomUUID()))).isEmpty();
    }

    private UUID user() {
        return AuthTestAccounts.register(identity, "overview-read-" + UUID.randomUUID() + "@example.test", "Test-only-password-2026!", new DeviceCommand("overview-read-device-" + UUID.randomUUID(),
                        "Overview read test", DevicePlatform.WEB)).user().id();
    }

    private SourceEntity source(UUID userId, UUID subjectId, String title) {
        return sources.saveAndFlush(new SourceEntity(UUID.randomUUID(), userId, SourceType.TEXT, subjectId,
                title, null, null, "Source content for a current raw input descriptor.", null,
                SourceIngestionStatus.READY));
    }

    private void addChunk(UUID userId, SourceEntity source) {
        String content = "A real active chunk for the SOURCE_CONTENT overview predicate.";
        chunks.saveAndFlush(new SourceChunkEntity(UUID.randomUUID(), userId, source.getId(), 0, content,
                "a".repeat(64), 0, content.length(), "[]", UUID.randomUUID(), true));
    }

    private void saveFormalSourceOverview(UUID userId, SourceEntity source) {
        var result = new OverviewResponse(2, "Saved source overview",
                "## Chapter\n\n### Section\n\nSection summary", "Summary");
        overviews.putSource(userId, source.getId(), new OverviewResultCommand(0L, UUID.randomUUID(),
                OverviewMode.ALL, source.getIngestionRevision(), null, null, null, null, result));
    }

}

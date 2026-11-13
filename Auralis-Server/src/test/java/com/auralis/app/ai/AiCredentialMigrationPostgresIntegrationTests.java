package com.auralis.app.ai;

import com.auralis.app.AuralisApplication;
import com.auralis.app.ai.internal.security.AiKeyCipher;
import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.PortBinding;
import com.github.dockerjava.api.model.Ports;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("postgres-it")
@EnabledIfSystemProperty(named = "auralis.postgres.it", matches = "true")
@Testcontainers
class AiCredentialMigrationPostgresIntegrationTests {
    private static final String TEST_SECRET = "0123456789abcdef0123456789abcdef";
    private static final UUID USER_ID = UUID.randomUUID();
    private static final UUID EXISTING_ID = UUID.randomUUID();
    private static final String EXISTING_ENDPOINT = "https://api.deepseek.com";
    private static final String EXISTING_KEY = "example-existing-key";
    private static final String EXISTING_CIPHERTEXT = new AiKeyCipher(TEST_SECRET).encrypt(EXISTING_KEY);

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("pgvector/pgvector:0.8.6-pg17-bookworm").asCompatibleSubstituteFor("postgres"))
            .withTmpFs(Map.of("/var/lib/postgresql/data", "rw"))
            .withCreateContainerCmdModifier(command -> command.getHostConfig().withPortBindings(
                    new PortBinding(Ports.Binding.bindIp("127.0.0.1"), new ExposedPort(5432))));

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure().dataSource(dataSource).target("44").load().migrate();
        JdbcTemplate preMigration = new JdbcTemplate(dataSource);
        preMigration.update("""
                INSERT INTO users (id, username, normalized_username, password_hash, status)
                VALUES (?, 'credential-fixture', 'credential-fixture', 'unused', 'ACTIVE')
                """, USER_ID);
        preMigration.update("""
                INSERT INTO ai_credentials (id, user_id, provider, base_url, chat_model, embedding_model, api_key_ciphertext)
                VALUES (?, ?, 'DEEPSEEK', ?, 'old-chat-model', 'historical-embedding-model', ?)
                """, EXISTING_ID, USER_ID, EXISTING_ENDPOINT, EXISTING_CIPHERTEXT);

        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("auralis.identity.jwt-secret", () -> TEST_SECRET);
        registry.add("auralis.ai.encryption-key", () -> TEST_SECRET);
        registry.add("auralis.ai.allowed-provider-hosts", () -> "api.deepseek.com");
    }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private AiSettingsService settings;

    @Test
    void updatesExistingCredentialsAndCreatesNewCredentialsAfterMigrating() {
        assertThat(jdbc.queryForObject("SELECT version FROM flyway_schema_history WHERE version = '45' AND success",
                String.class)).isEqualTo("45");
        assertThat(settings.requireSavedByok(USER_ID, AiProviderType.DEEPSEEK).chatModel()).isEqualTo("old-chat-model");

        AiSettingsView updated = settings.upsert(USER_ID, new AiSettingsCommand(
                AiProviderType.DEEPSEEK, EXISTING_ENDPOINT, "new-chat-model", null));
        assertThat(updated.id()).isEqualTo(EXISTING_ID);
        assertThat(updated.chatModel()).isEqualTo("new-chat-model");
        assertThat(settings.requireSavedByok(USER_ID, AiProviderType.DEEPSEEK).credential().apiKey())
                .isEqualTo(EXISTING_KEY);
        assertThat(jdbc.queryForObject("SELECT embedding_model FROM ai_credentials WHERE id = ?",
                String.class, EXISTING_ID)).isEqualTo("historical-embedding-model");
        assertThat(jdbc.queryForObject("SELECT api_key_ciphertext FROM ai_credentials WHERE id = ?",
                String.class, EXISTING_ID)).isEqualTo(EXISTING_CIPHERTEXT);

        AiSettingsView created = settings.upsert(USER_ID, new AiSettingsCommand(
                AiProviderType.OPENAI_COMPATIBLE, "https://provider.test/v1", "new-provider-model", "example-new-key"));
        assertThat(created.hasApiKey()).isTrue();
        assertThat(jdbc.queryForObject("SELECT embedding_model FROM ai_credentials WHERE id = ?",
                String.class, created.id())).isNull();
        assertThat(settings.requireSavedByok(USER_ID, AiProviderType.OPENAI_COMPATIBLE).credential().apiKey())
                .isEqualTo("example-new-key");
    }
}

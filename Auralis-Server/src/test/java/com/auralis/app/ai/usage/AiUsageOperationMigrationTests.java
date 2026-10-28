package com.auralis.app.ai.usage;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class AiUsageOperationMigrationTests {
    @Test
    void v33AddsNullableSourceAndKindWithoutRewritingHistory() throws Exception {
        String migration;
        try (var input = new ClassPathResource("db/migration/V33__ai_usage_operation_kind_and_source.sql").getInputStream()) {
            migration = new String(input.readAllBytes(), StandardCharsets.UTF_8).toLowerCase(java.util.Locale.ROOT);
        }
        assertThat(migration).contains("add column operation_kind varchar(32)",
                "add column credential_source varchar(32)", "create index idx_ai_usage_reservations_source_created");
        assertThat(migration).doesNotContain("update ai_usage_reservations", "not null", "delete from ai_usage_reservations");
    }
}

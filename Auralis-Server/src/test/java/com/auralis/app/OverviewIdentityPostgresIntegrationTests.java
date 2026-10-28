package com.auralis.app;

import com.auralis.app.ai.OverviewDtos;
import com.auralis.app.ai.OverviewIdentityDtos;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineIdentityInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineIdentityNodeInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceSectionInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceSourceRefInput;
import com.auralis.app.ai.OverviewMode;
import com.auralis.app.ai.OverviewResultCommand;
import com.auralis.app.ai.OverviewResultService;
import com.auralis.app.ai.OverviewResultView;
import com.auralis.app.ai.SourceChunkProvenance;
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
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.util.List;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("postgres-it")
@EnabledIfSystemProperty(named = "auralis.postgres.it", matches = "true")
class OverviewIdentityPostgresIntegrationTests {

    private static final String POSTGRES_URL = requirePostgresUrl();
    private static final String APP_SCHEMA = "overview_identity_it_"
            + UUID.randomUUID().toString().replace("-", "");
    private static final DriverManagerDataSource ADMIN_DATA_SOURCE =
            new DriverManagerDataSource(POSTGRES_URL, "postgres", "");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private IdentityService identityService;
    @Autowired private SubjectService subjectService;
    @Autowired private SourceRepository sourceRepository;
    @Autowired private SourceChunkRepository sourceChunkRepository;
    @Autowired private OverviewResultService overviewResultService;
    @Autowired private ObjectMapper objectMapper;

    @DynamicPropertySource
    static void taskOwnedPostgres(DynamicPropertyRegistry registry) {
        new JdbcTemplate(ADMIN_DATA_SOURCE).execute("create schema " + APP_SCHEMA);
        registry.add("spring.datasource.url", () -> scopedUrl(APP_SCHEMA, vectorExtensionSchema()));
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.flyway.schemas", () -> APP_SCHEMA);
        registry.add("spring.flyway.default-schema", () -> APP_SCHEMA);
        registry.add("auralis.identity.jwt-secret", () -> "0123456789abcdef0123456789abcdef");
        registry.add("auralis.ai.encryption-key", () -> "0123456789abcdef0123456789abcdef");
        registry.add("auralis.ai.ingestion-worker-enabled", () -> "false");
    }

    @AfterAll
    static void dropApplicationSchema() {
        new JdbcTemplate(ADMIN_DATA_SOURCE).execute("drop schema if exists " + APP_SCHEMA + " cascade");
    }

    @Test
    void cleanPostgresSchemaAppliesV34WithNullableMetadataColumns() {
        assertThat(jdbc.queryForObject("select count(*) from " + APP_SCHEMA
                + ".flyway_schema_history where version='34' and success", Integer.class)).isEqualTo(1);
        assertNullableColumn("overview_results", "outline_identity_json");
        assertNullableColumn("source_chunks", "provenance_json");
    }

    @Test
    void v33UpgradePreservesLegacyOverviewAndChunkRowsWithNullMetadata() {
        String schema = "overview_identity_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        JdbcTemplate admin = new JdbcTemplate(ADMIN_DATA_SOURCE);
        admin.execute("create schema " + schema);
        try {
            DriverManagerDataSource dataSource = new DriverManagerDataSource(
                    scopedUrl(schema, APP_SCHEMA, vectorExtensionSchema()), "postgres", "");
            Flyway.configure().dataSource(dataSource).locations("classpath:db/migration")
                    .schemas(schema).defaultSchema(schema).target("33").load().migrate();
            JdbcTemplate legacy = new JdbcTemplate(dataSource);

            UUID userId = UUID.randomUUID();
            UUID subjectId = UUID.randomUUID();
            UUID sourceId = UUID.randomUUID();
            UUID revision = UUID.randomUUID();
            UUID resultId = UUID.randomUUID();
            UUID chunkId = UUID.randomUUID();
            legacy.update("insert into users(id,username,normalized_username,password_hash,status) "
                            + "values(?,?,?,'legacy-hash','ACTIVE')",
                    userId, "m2-upgrade-" + userId, ("m2-upgrade-" + userId).toLowerCase());
            legacy.update("insert into subjects(id,user_id,name,sort_key,is_default) values(?,?,?,'',false)",
                    subjectId, userId, "Legacy subject");
            legacy.update("insert into sources(id,user_id,type,subject_id,title,raw_text,ingestion_status,ingestion_revision) "
                            + "values(?,?,'TEXT',?,?,'legacy text','READY',?)",
                    sourceId, userId, subjectId, "Legacy source", revision);
            legacy.update("insert into overview_results(id,user_id,scope_type,scope_id,subject_id,source_id,"
                            + "ingestion_revision,version,outline_version,summary_version,title,schema_version,outline,summary) "
                            + "values(?,?,'SOURCE',?,?,?,?,1,1,1,'Legacy overview',1,'[]','{}')",
                    resultId, userId, sourceId, subjectId, sourceId, revision);
            legacy.update("insert into source_chunks(id,user_id,source_id,ordinal,content,content_hash,char_start,char_end,"
                            + "embedding_json,generation,active) values(?,?,?,0,'legacy chunk',?,0,12,'[]',?,true)",
                    chunkId, userId, sourceId, "a".repeat(64), UUID.randomUUID());

            assertThat(legacy.queryForObject("select version from " + schema
                    + ".flyway_schema_history where success order by installed_rank desc limit 1",
                    String.class)).isEqualTo("33");
            Flyway.configure().dataSource(dataSource).locations("classpath:db/migration")
                    .schemas(schema).defaultSchema(schema).load().migrate();

            assertThat(legacy.queryForObject("select version from " + schema
                    + ".flyway_schema_history where success order by installed_rank desc limit 1",
                    String.class)).isEqualTo("41");
            assertThat(legacy.queryForObject("select id from overview_results where id=?", UUID.class, resultId))
                    .isEqualTo(resultId);
            assertThat(legacy.queryForObject("select outline from overview_results where id=?", String.class, resultId))
                    .isEqualTo("[]");
            assertThat(legacy.queryForObject("select outline_identity_json from overview_results where id=?",
                    String.class, resultId)).isNull();
            assertThat(legacy.queryForObject("select content from source_chunks where id=?", String.class, chunkId))
                    .isEqualTo("legacy chunk");
            assertThat(legacy.queryForObject("select provenance_json from source_chunks where id=?",
                    String.class, chunkId)).isNull();
        } finally {
            admin.execute("drop schema if exists " + schema + " cascade");
        }
    }

    @Test
    void postgresPersistsIdentityAndChunkRefsAndReplaysReceiptAcrossRead() throws Exception {
        Fixture fixture = fixture("stable");
        OverviewResultCommand command = command(fixture, UUID.randomUUID(), "Stable content");

        var saved = overviewResultService.putSource(fixture.userId(), fixture.sourceId(), command);
        var replay = overviewResultService.putSource(fixture.userId(), fixture.sourceId(), command);
        var read = overviewResultService.getSource(fixture.userId(), fixture.sourceId(), fixture.revision());

        assertThat(replay).isEqualTo(saved);
        assertDatabaseReadMatches(saved, read);
        assertThat(jdbc.queryForObject("select outline_identity_json from overview_results where user_id=? and scope_id=?",
                String.class, fixture.userId(), fixture.sourceId())).contains(saved.outlineIdentity().nodes().get(0).nodeId().toString());
        assertThat(jdbc.queryForObject("select provenance_json from source_chunks where id=?", String.class,
                fixture.chunkId())).contains(fixture.parsedDocumentId().toString());
        assertThat(saved.outlineIdentity().nodes()).hasSize(2);
        assertThat(saved.outlineIdentity().nodes().get(1).sourceRefs()).singleElement().satisfies(ref -> {
            assertThat(ref.chunkId()).isEqualTo(fixture.chunkId());
            assertThat(ref.precision()).isEqualTo(OverviewIdentityDtos.ProvenancePrecision.BLOCK);
            assertThat(ref.locations()).singleElement().satisfies(location -> {
                assertThat(location.charStart()).isEqualTo(2);
                assertThat(location.charEnd()).isEqualTo(8);
                assertThat(location.blockCharStart()).isEqualTo(2);
                assertThat(location.blockCharEnd()).isEqualTo(8);
            });
        });
        assertThat(jdbc.queryForObject("select count(*) from overview_write_receipts where user_id=? and client_write_id=?",
                Integer.class, fixture.userId(), command.clientWriteId())).isEqualTo(1);

        OverviewResultCommand changedReplay = command(fixture, command.clientWriteId(), "Changed payload");
        assertThatThrownBy(() -> overviewResultService.putSource(fixture.userId(), fixture.sourceId(), changedReplay))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("RESOURCE_VERSION_CONFLICT");
        OverviewResultCommand staleWrite = command(fixture, UUID.randomUUID(), "Stale content");
        assertThatThrownBy(() -> overviewResultService.putSource(fixture.userId(), fixture.sourceId(), staleWrite))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("RESOURCE_VERSION_CONFLICT");
        assertDatabaseReadMatches(saved,
                overviewResultService.getSource(fixture.userId(), fixture.sourceId(), fixture.revision()));
        assertThat(jdbc.queryForObject("select count(*) from overview_write_receipts where user_id=?",
                Integer.class, fixture.userId())).isEqualTo(1);
    }

    @Test
    void postgresReceiptFailureRollsBackOverviewIdentityAndReceiptTogether() {
        Fixture fixture = fixture("rollback");
        jdbc.execute("create function fail_overview_receipt_insert() returns trigger language plpgsql as $$ "
                + "begin raise exception 'forced overview receipt failure'; end; $$");
        jdbc.execute("create trigger fail_overview_receipt before insert on overview_write_receipts "
                + "for each row execute function fail_overview_receipt_insert()");
        try {
            OverviewResultCommand command = command(fixture, UUID.randomUUID(), "Must rollback");
            assertThatThrownBy(() -> overviewResultService.putSource(fixture.userId(), fixture.sourceId(), command))
                    .isInstanceOf(RuntimeException.class);
            assertThat(jdbc.queryForObject("select count(*) from overview_results where user_id=? and scope_id=?",
                    Integer.class, fixture.userId(), fixture.sourceId())).isZero();
            assertThat(jdbc.queryForObject("select count(*) from overview_write_receipts where user_id=? and client_write_id=?",
                    Integer.class, fixture.userId(), command.clientWriteId())).isZero();
        } finally {
            jdbc.execute("drop trigger if exists fail_overview_receipt on overview_write_receipts");
            jdbc.execute("drop function if exists fail_overview_receipt_insert()");
        }
    }

    private void assertNullableColumn(String table, String column) {
        assertThat(jdbc.queryForObject("select is_nullable from information_schema.columns "
                        + "where table_schema=? and table_name=? and column_name=?",
                String.class, APP_SCHEMA, table, column)).isEqualTo("YES");
    }

    private Fixture fixture(String label) {
        String suffix = UUID.randomUUID().toString();
        var owner = identityService.register("m2-" + label + "-" + suffix,
                "correct horse battery staple", "overview-m2-" + label,
                new DeviceCommand("overview-m2-device-" + suffix, "Test", DevicePlatform.WEB));
        UUID userId = owner.user().id();
        UUID subjectId = subjectService.create(userId,
                new SubjectCommand("Overview M2 " + label, null, null, "001")).id();
        SourceEntity source = sourceRepository.saveAndFlush(new SourceEntity(UUID.randomUUID(), userId, SourceType.TEXT,
                subjectId, "Overview source " + label, null, null, "Original source text", null,
                SourceIngestionStatus.READY));
        UUID parsedDocumentId = UUID.randomUUID();
        UUID generation = UUID.randomUUID();
        UUID chunkId = UUID.randomUUID();
        SourceChunkProvenance provenance = new SourceChunkProvenance(1, source.getIngestionRevision(),
                parsedDocumentId, "pdf-test-parser", List.of(new SourceChunkProvenance.Location(
                7, "paragraph", 3L, null, 40L, 0, 13, 0, 13)));
        try {
            sourceChunkRepository.saveAndFlush(new SourceChunkEntity(chunkId, userId, source.getId(), 0,
                    "Evidence text", "a".repeat(64), 0, 13, "[]", generation, true,
                    objectMapper.writeValueAsString(provenance)));
        } catch (Exception exception) {
            throw new IllegalStateException("Could not create PostgreSQL provenance fixture", exception);
        }
        return new Fixture(userId, source.getId(), source.getSubjectId(), source.getIngestionRevision(),
                chunkId, generation, parsedDocumentId);
    }

    private OverviewResultCommand command(Fixture fixture, UUID writeId, String text) {
        var result = new OverviewDtos.OverviewResponse(1, "M2 outline " + text,
                List.of(new OverviewDtos.OverviewChapter("Chapter " + text,
                        List.of(new OverviewDtos.OverviewSection("Section " + text, "Persisted summary",
                                List.of(fixture.sourceId().toString()), null)))),
                new OverviewDtos.OverviewSummary("Summary " + text, List.of("Key point"), List.of("Next step")));
        OutlineIdentityInput identity = new OutlineIdentityInput(1, List.of(
                new OutlineIdentityNodeInput(List.of(0), null),
                new OutlineIdentityNodeInput(List.of(0, 0), null)));
        OutlineProvenanceInput provenance = new OutlineProvenanceInput(1, List.of(
                new OutlineProvenanceSectionInput(List.of(0, 0), List.of(
                        new OutlineProvenanceSourceRefInput(fixture.sourceId(), fixture.revision(),
                                fixture.chunkId(), fixture.generation(), 2, 8)))));
        return new OverviewResultCommand(0L, writeId, OverviewMode.ALL, fixture.revision(), null, null,
                null, null, result, identity, provenance);
    }

    private static String requirePostgresUrl() {
        String url = System.getProperty("auralis.usage.postgres.url");
        if (url == null || !url.startsWith("jdbc:postgresql://127.0.0.1:")) {
            throw new IllegalStateException("A task-owned loopback PostgreSQL URL is required");
        }
        return url;
    }

    private static String vectorExtensionSchema() {
        List<String> schemas = new JdbcTemplate(ADMIN_DATA_SOURCE).query(
                "select pg_catalog.quote_ident(namespace.nspname) "
                        + "from pg_catalog.pg_extension extension "
                        + "join pg_catalog.pg_namespace namespace on namespace.oid=extension.extnamespace "
                        + "where extension.extname='vector'",
                (resultSet, rowNumber) -> resultSet.getString(1));
        return schemas.isEmpty() ? null : schemas.get(0);
    }

    private static void assertDatabaseReadMatches(OverviewResultView expected, OverviewResultView actual) {
        assertThat(actual).usingRecursiveComparison()
                .ignoringFields("outlineGeneratedAt", "summaryGeneratedAt", "updatedAt")
                .isEqualTo(expected);
        assertDatabaseTimestampPrecision(expected.outlineGeneratedAt(), actual.outlineGeneratedAt());
        assertDatabaseTimestampPrecision(expected.summaryGeneratedAt(), actual.summaryGeneratedAt());
        assertDatabaseTimestampPrecision(expected.updatedAt(), actual.updatedAt());
    }

    private static void assertDatabaseTimestampPrecision(java.time.Instant expected, java.time.Instant actual) {
        assertThat(Duration.between(expected, actual).abs()).isLessThanOrEqualTo(Duration.ofNanos(1_000));
    }

    private static String scopedUrl(String schema, String... additionalSchemas) {
        Set<String> searchPath = new LinkedHashSet<>();
        searchPath.add(schema);
        for (String additionalSchema : additionalSchemas) {
            if (additionalSchema != null && !additionalSchema.isBlank()) {
                searchPath.add(additionalSchema);
            }
        }
        return POSTGRES_URL + (POSTGRES_URL.contains("?") ? "&" : "?")
                + "currentSchema=" + String.join(",", searchPath);
    }

    private record Fixture(UUID userId, UUID sourceId, UUID subjectId, UUID revision, UUID chunkId,
                           UUID generation, UUID parsedDocumentId) {
    }
}

package com.auralis.app;

import com.auralis.app.subject.SubjectLockCoordinator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;

/**
 * PostgreSQL/Hibernate evidence for the Subject-first canonical lock protocol.
 * This is opt-in because it requires Docker and a real row-locking database.
 */
@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("postgres-it")
@EnabledIfSystemProperty(named = "auralis.postgres.it", matches = "true")
@Testcontainers
class SubjectLockCoordinatorPostgresIntegrationTests {

    private static final String POSTGRES_IMAGE = "pgvector/pgvector:0.8.6-pg17-bookworm";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse(POSTGRES_IMAGE).asCompatibleSubstituteFor("postgres"));

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private PlatformTransactionManager transactionManager;
    @MockitoSpyBean private SubjectLockCoordinator coordinator;

    @Test
    void oppositeRequestDirectionsSerializeAfterCanonicalSubjectRowLocks() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID firstSubjectId = UUID.fromString("00000000-0000-0000-0000-000000000001");
        UUID secondSubjectId = UUID.fromString("00000000-0000-0000-0000-000000000002");
        insertUser(userId);
        insertSubject(userId, firstSubjectId, "First");
        insertSubject(userId, secondSubjectId, "Second");

        CountDownLatch secondLockAttempted = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        AtomicInteger calls = new AtomicInteger();
        doAnswer(invocation -> {
            if (calls.incrementAndGet() == 2) {
                secondLockAttempted.countDown();
            }
            return invocation.callRealMethod();
        }).when(coordinator).lockSubjects(eq(userId), anyList());

        TransactionTemplate template = new TransactionTemplate(transactionManager);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> first = executor.submit(() -> template.executeWithoutResult(status -> {
                coordinator.lockSubjects(userId, List.of(secondSubjectId, firstSubjectId));
                await(releaseFirst);
            }));
            Future<?> second = executor.submit(() -> template.executeWithoutResult(status ->
                    coordinator.lockSubjects(userId, List.of(firstSubjectId, secondSubjectId))));

            assertThat(secondLockAttempted.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(second.isDone()).as("opposite direction must wait on canonical first Subject").isFalse();
            releaseFirst.countDown();
            first.get(5, TimeUnit.SECONDS);
            second.get(5, TimeUnit.SECONDS);
        } finally {
            releaseFirst.countDown();
            executor.shutdownNow();
        }
    }

    private void insertUser(UUID userId) {
        jdbcTemplate.update(
                "insert into users (id, username, normalized_username, password_hash, status) "
                        + "values (?, ?, ?, ?, 'ACTIVE')",
                userId, "lock-it-" + userId, ("lock-it-" + userId).toUpperCase(), "integration-test");
    }

    private void insertSubject(UUID userId, UUID subjectId, String name) {
        jdbcTemplate.update(
                "insert into subjects (id, user_id, name, sort_key, is_default) values (?, ?, ?, '', false)",
                subjectId, userId, name);
    }

    private void await(CountDownLatch latch) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) {
                throw new AssertionError("first transaction did not receive release signal");
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new AssertionError(interrupted);
        }
    }
}

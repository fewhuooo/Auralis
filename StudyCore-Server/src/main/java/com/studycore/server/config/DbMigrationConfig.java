package com.studycore.server.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;

/**
 * 15.5 Automatic Database Migration Configuration
 * Ensures the database schema matches the required entity structure at runtime.
 */
@Configuration
@Slf4j
public class DbMigrationConfig {

    @Bean
    public CommandLineRunner migrateDatabase(DataSource dataSource) {
        return args -> {
            log.info("[DbMigration] Starting schema check and migration...");
            try (Connection conn = dataSource.getConnection();
                 Statement stmt = conn.createStatement()) {
                
                // 1. Create main tables if they do not exist
                log.info("[DbMigration] Creating knowledge_block table if not exists...");
                stmt.execute("CREATE TABLE IF NOT EXISTS knowledge_block (" +
                        "id VARCHAR(64) PRIMARY KEY, " +
                        "subject VARCHAR(256), " +
                        "title VARCHAR(512), " +
                        "preview TEXT, " +
                        "time VARCHAR(128), " +
                        "source VARCHAR(128), " +
                        "color VARCHAR(64), " +
                        "user_id VARCHAR(64), " +
                        "sync_version BIGINT DEFAULT 0, " +
                        "is_deleted BOOLEAN DEFAULT FALSE, " +
                        "encrypted_payload TEXT" +
                        ")");

                log.info("[DbMigration] Creating task_block table if not exists...");
                stmt.execute("CREATE TABLE IF NOT EXISTS task_block (" +
                        "id VARCHAR(64) PRIMARY KEY, " +
                        "name VARCHAR(256), " +
                        "subject VARCHAR(256), " +
                        "\"desc\" TEXT, " +
                        "color VARCHAR(64), " +
                        "duration INTEGER, " +
                        "load VARCHAR(64), " +
                        "load_text VARCHAR(256), " +
                        "status VARCHAR(64), " +
                        "start_time VARCHAR(128), " +
                        "user_id VARCHAR(64), " +
                        "sync_version BIGINT DEFAULT 0, " +
                        "is_deleted BOOLEAN DEFAULT FALSE, " +
                        "encrypted_payload TEXT, " +
                        "position VARCHAR(256) DEFAULT '0'" +
                        ")");

                log.info("[DbMigration] Creating users table if not exists...");
                stmt.execute("CREATE TABLE IF NOT EXISTS users (" +
                        "id VARCHAR(64) PRIMARY KEY, " +
                        "username VARCHAR(128) UNIQUE NOT NULL, " +
                        "password VARCHAR(256) NOT NULL" +
                        ")");

                log.info("[DbMigration] Creating block_relations table if not exists...");
                stmt.execute("CREATE TABLE IF NOT EXISTS block_relations (" +
                        "id VARCHAR(64) PRIMARY KEY, " +
                        "source_id VARCHAR(64) NOT NULL, " +
                        "target_id VARCHAR(64) NOT NULL, " +
                        "relation_type VARCHAR(64) NOT NULL" +
                        ")");

                // 2. Perform safe incremental schema alterations for backward compatibility
                log.info("[DbMigration] Checking incremental alterations for knowledge_block...");
                stmt.execute("ALTER TABLE knowledge_block ADD COLUMN IF NOT EXISTS user_id VARCHAR(64)");
                stmt.execute("ALTER TABLE knowledge_block ADD COLUMN IF NOT EXISTS sync_version BIGINT DEFAULT 0");
                stmt.execute("ALTER TABLE knowledge_block ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE");
                stmt.execute("ALTER TABLE knowledge_block ADD COLUMN IF NOT EXISTS encrypted_payload TEXT");

                log.info("[DbMigration] Checking incremental alterations for task_block...");
                stmt.execute("ALTER TABLE task_block ADD COLUMN IF NOT EXISTS user_id VARCHAR(64)");
                stmt.execute("ALTER TABLE task_block ADD COLUMN IF NOT EXISTS sync_version BIGINT DEFAULT 0");
                stmt.execute("ALTER TABLE task_block ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE");
                stmt.execute("ALTER TABLE task_block ADD COLUMN IF NOT EXISTS encrypted_payload TEXT");
                stmt.execute("ALTER TABLE task_block ADD COLUMN IF NOT EXISTS position VARCHAR(256) DEFAULT '0'");

                // 3. Create helper system tables
                log.info("[DbMigration] Creating mutation_log table if not exists...");
                stmt.execute("CREATE TABLE IF NOT EXISTS mutation_log (" +
                        "id BIGSERIAL PRIMARY KEY, " +
                        "client_id VARCHAR(64) NOT NULL, " +
                        "user_id VARCHAR(64) NOT NULL, " +
                        "entity_type VARCHAR(64) NOT NULL, " +
                        "entity_id VARCHAR(64) NOT NULL, " +
                        "action VARCHAR(64) NOT NULL, " +
                        "payload JSONB NOT NULL, " +
                        "created_at BIGINT NOT NULL" +
                        ")");

                log.info("[DbMigration] Creating index on mutation_log for user_id and id...");
                stmt.execute("CREATE INDEX IF NOT EXISTS idx_mutation_user_id ON mutation_log(user_id, id)");

                log.info("[DbMigration] Creating asset table if not exists...");
                stmt.execute("CREATE TABLE IF NOT EXISTS asset (" +
                        "id VARCHAR(64) PRIMARY KEY, " +
                        "user_id VARCHAR(64) NOT NULL, " +
                        "file_name VARCHAR(512) NOT NULL, " +
                        "object_name VARCHAR(1024) NOT NULL, " +
                        "file_size BIGINT, " +
                        "content_type VARCHAR(128), " +
                        "status VARCHAR(32) DEFAULT 'PENDING', " +
                        "subject VARCHAR(256) DEFAULT '文档导入', " +
                        "created_at BIGINT NOT NULL" +
                        ")");
                stmt.execute("CREATE INDEX IF NOT EXISTS idx_asset_user_id ON asset(user_id)");
                stmt.execute("CREATE INDEX IF NOT EXISTS idx_asset_status ON asset(status)");

                log.info("[DbMigration] Schema migration completed successfully.");
            } catch (Exception e) {
                log.error("[DbMigration] Schema migration failed: {}", e.getMessage(), e);
            }
        };
    }
}

package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Statement;

public class V9__postgres_vector_support extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        String product = context.getConnection().getMetaData().getDatabaseProductName();
        if (!"PostgreSQL".equalsIgnoreCase(product)) {
            return;
        }

        try (Statement statement = context.getConnection().createStatement()) {
            statement.execute("CREATE EXTENSION IF NOT EXISTS vector");
            statement.execute(
                    "ALTER TABLE source_chunks ADD COLUMN IF NOT EXISTS embedding vector(1024)");
            statement.execute(
                    "CREATE INDEX IF NOT EXISTS ix_source_chunks_embedding_user "
                            + "ON source_chunks USING hnsw (embedding vector_cosine_ops)");
        }
    }
}

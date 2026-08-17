package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Statement;

public class V11__backfill_postgres_vectors extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        String product = context.getConnection().getMetaData().getDatabaseProductName();
        if (!"PostgreSQL".equalsIgnoreCase(product)) {
            return;
        }

        try (Statement statement = context.getConnection().createStatement()) {
            statement.executeUpdate("""
                    update source_chunks
                       set embedding = cast(embedding_json as vector)
                     where embedding is null
                       and embedding_json is not null
                    """);
        }
    }
}

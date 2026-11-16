use sqlx::sqlite::SqlitePoolOptions;
use sqlx::{Pool, Sqlite};
use tauri::{AppHandle, Manager};
use tauri_plugin_sql::{DbInstances, DbPool};

const LOCAL_SQLITE_DATABASE_URL: &str = "sqlite:auralis.db";

pub fn canonical_app_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| "LOCAL_APP_DATA_PATH_FAILED".to_string())
}

async fn build_single_connection_pool(
    original: &Pool<Sqlite>,
) -> Result<Pool<Sqlite>, sqlx::Error> {
    let connect_options = original.connect_options();
    SqlitePoolOptions::new()
        .max_connections(1)
        .min_connections(1)
        .idle_timeout(None)
        .max_lifetime(None)
        .connect_with(connect_options.as_ref().clone())
        .await
}

#[tauri::command]
pub async fn initialize_local_database_pool(app: AppHandle) -> Result<(), String> {
    let original_pool = {
        let instances = app.state::<DbInstances>();
        let pools = instances.0.read().await;
        match pools.get(LOCAL_SQLITE_DATABASE_URL) {
            Some(DbPool::Sqlite(pool)) => pool.clone(),
            None => return Err("LOCAL_DATABASE_POOL_NOT_LOADED".to_string()),
        }
    };

    let replacement = build_single_connection_pool(&original_pool)
        .await
        .map_err(|error| format!("LOCAL_DATABASE_POOL_RECONFIGURE_FAILED:{error}"))?;

    let previous = {
        let instances = app.state::<DbInstances>();
        let mut pools = instances.0.write().await;
        match pools.get_mut(LOCAL_SQLITE_DATABASE_URL) {
            Some(DbPool::Sqlite(pool)) => std::mem::replace(pool, replacement),
            None => return Err("LOCAL_DATABASE_POOL_NOT_LOADED".to_string()),
        }
    };
    previous.close().await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::build_single_connection_pool;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

    #[test]
    fn rebuilt_plugin_pool_uses_one_stable_connection_for_raw_transactions() {
        tauri::async_runtime::block_on(async {
            let original = SqlitePoolOptions::new()
                .max_connections(10)
                .connect_with(
                    SqliteConnectOptions::new()
                        .filename(":memory:")
                        .create_if_missing(true),
                )
                .await
                .unwrap();
            let pool = build_single_connection_pool(&original).await.unwrap();

            assert_eq!(pool.options().get_max_connections(), 1);
            assert_eq!(pool.options().get_min_connections(), 1);
            assert_eq!(pool.options().get_idle_timeout(), None);
            assert_eq!(pool.options().get_max_lifetime(), None);

            sqlx::query("CREATE TABLE transaction_probe (value TEXT NOT NULL)")
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("BEGIN IMMEDIATE").execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO transaction_probe (value) VALUES ('rolled back')")
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("ROLLBACK").execute(&pool).await.unwrap();
            let rolled_back: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM transaction_probe")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(rolled_back, 0);

            sqlx::query("BEGIN IMMEDIATE").execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO transaction_probe (value) VALUES ('committed')")
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("COMMIT").execute(&pool).await.unwrap();
            let committed: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM transaction_probe")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(committed, 1);
            pool.close().await;
            original.close().await;
        });
    }
}

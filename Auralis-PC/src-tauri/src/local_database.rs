use serde::Deserialize;
use serde_json::Value;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::{Connection, Pool, Sqlite, SqliteConnection};
use std::{collections::HashSet, fs::create_dir_all, path::Path, time::Duration};
use tauri::{AppHandle, Manager};
use tauri_plugin_sql::{DbInstances, DbPool};

const LOCAL_SQLITE_DATABASE_URL: &str = "sqlite:auralis.db";

pub fn canonical_app_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| "LOCAL_APP_DATA_PATH_FAILED".to_string())
}

pub fn canonical_local_database_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("auralis.db"))
        .map_err(|_| "LOCAL_DATABASE_PATH_FAILED".to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalResourceSnapshotCommand {
    pub user_id: String,
    pub items: Vec<LocalResourceSnapshotItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalResourceSnapshotItem {
    pub resource_type: String,
    pub resource_id: String,
    pub version: i64,
    pub deleted_at: Option<String>,
    pub value: Value,
}

async fn connect_local_database(database_path: &Path) -> Result<SqliteConnection, String> {
    let parent = database_path
        .parent()
        .ok_or_else(|| "LOCAL_DATABASE_PATH_INVALID".to_string())?;
    create_dir_all(parent).map_err(|error| format!("LOCAL_DATABASE_DIRECTORY_FAILED:{error}"))?;
    let options = SqliteConnectOptions::new()
        .filename(database_path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_secs(5));
    SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| format!("LOCAL_DATABASE_CONNECT_FAILED:{error}"))
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

async fn replace_snapshot_on_connection(
    connection: &mut SqliteConnection,
    user_id: &str,
    items: Vec<(String, String, i64, Option<String>, Value)>,
) -> Result<(), String> {
    if user_id.trim().is_empty() {
        return Err("LOCAL_SNAPSHOT_INVALID".to_string());
    }
    let mut transaction = Connection::begin(connection)
        .await
        .map_err(|error| format!("LOCAL_SNAPSHOT_BEGIN_FAILED:{error}"))?;
    let unresolved: HashSet<(String, String)> = sqlx::query_as(
        "SELECT resource_type, resource_id FROM local_mutations
         WHERE user_id = ? AND status IN ('pending', 'inflight', 'conflict', 'error')",
    )
    .bind(user_id)
    .fetch_all(&mut *transaction)
    .await
    .map_err(|error| format!("LOCAL_SNAPSHOT_READ_FAILED:{error}"))?
    .into_iter()
    .collect();

    sqlx::query(
        "DELETE FROM local_resource_records
         WHERE user_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM local_mutations
              WHERE local_mutations.user_id = local_resource_records.user_id
                AND local_mutations.resource_type = local_resource_records.resource_type
                AND local_mutations.resource_id = local_resource_records.resource_id
                AND local_mutations.status IN ('pending', 'inflight', 'conflict', 'error')
           )",
    )
    .bind(user_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("LOCAL_SNAPSHOT_DELETE_FAILED:{error}"))?;

    for (resource_type, resource_id, version, deleted_at, value) in items {
        if resource_type.trim().is_empty() || resource_id.trim().is_empty() || version < 0 {
            return Err("LOCAL_SNAPSHOT_INVALID".to_string());
        }
        if unresolved.contains(&(resource_type.clone(), resource_id.clone())) {
            continue;
        }
        let payload = serde_json::to_string(&value)
            .map_err(|error| format!("LOCAL_SNAPSHOT_PAYLOAD_INVALID:{error}"))?;
        sqlx::query(
            "INSERT INTO local_resource_records
                (user_id, resource_type, resource_id, version, deleted_at, sync_status, payload)
             VALUES (?, ?, ?, ?, ?, 'synced', ?)
             ON CONFLICT (user_id, resource_type, resource_id) DO UPDATE SET
                version = excluded.version,
                deleted_at = excluded.deleted_at,
                sync_status = excluded.sync_status,
                payload = excluded.payload",
        )
        .bind(user_id)
        .bind(resource_type)
        .bind(resource_id)
        .bind(version)
        .bind(deleted_at)
        .bind(payload)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("LOCAL_SNAPSHOT_UPSERT_FAILED:{error}"))?;
    }
    transaction
        .commit()
        .await
        .map_err(|error| format!("LOCAL_SNAPSHOT_COMMIT_FAILED:{error}"))
}

#[tauri::command]
pub async fn replace_local_resource_snapshot(
    command: LocalResourceSnapshotCommand,
    app: AppHandle,
) -> Result<(), String> {
    let database_path = canonical_local_database_path(&app)?;
    let mut connection = connect_local_database(&database_path).await?;
    let items = command
        .items
        .into_iter()
        .map(|item| {
            (
                item.resource_type,
                item.resource_id,
                item.version,
                item.deleted_at,
                item.value,
            )
        })
        .collect();
    replace_snapshot_on_connection(&mut connection, &command.user_id, items).await
}

#[cfg(test)]
mod tests {
    use super::{build_single_connection_pool, replace_snapshot_on_connection};
    use serde_json::json;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use sqlx::{Connection, SqliteConnection};

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

    #[test]
    fn snapshot_replacement_preserves_unresolved_rows_and_rolls_back_invalid_input() {
        tauri::async_runtime::block_on(async {
            let mut connection = SqliteConnection::connect("sqlite::memory:").await.unwrap();
            sqlx::query(
                "CREATE TABLE local_resource_records (
                    user_id TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL,
                    version INTEGER NOT NULL, deleted_at TEXT, sync_status TEXT NOT NULL, payload TEXT NOT NULL,
                    PRIMARY KEY (user_id, resource_type, resource_id)
                 )",
            ).execute(&mut connection).await.unwrap();
            sqlx::query(
                "CREATE TABLE local_mutations (
                    client_mutation_id TEXT NOT NULL, user_id TEXT NOT NULL, resource_type TEXT NOT NULL,
                    resource_id TEXT NOT NULL, status TEXT NOT NULL,
                    PRIMARY KEY (user_id, client_mutation_id)
                 )",
            ).execute(&mut connection).await.unwrap();
            sqlx::query(
                "INSERT INTO local_resource_records
                    (user_id, resource_type, resource_id, version, deleted_at, sync_status, payload)
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .bind("user-a")
            .bind("TASK")
            .bind("pending-task")
            .bind(3_i64)
            .bind(Option::<String>::None)
            .bind("pending")
            .bind(r#"{\"title\":\"Local\"}"#)
            .execute(&mut connection)
            .await
            .unwrap();
            let inflight_local_payload = json!({ "title": "Local inflight" }).to_string();
            sqlx::query(
                "INSERT INTO local_resource_records
                    (user_id, resource_type, resource_id, version, deleted_at, sync_status, payload)
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .bind("user-a")
            .bind("TASK")
            .bind("inflight-task")
            .bind(5_i64)
            .bind(Option::<String>::None)
            .bind("pending")
            .bind(inflight_local_payload.clone())
            .execute(&mut connection)
            .await
            .unwrap();
            sqlx::query(
                "INSERT INTO local_mutations
                    (client_mutation_id, user_id, resource_type, resource_id, status)
                 VALUES (?, ?, ?, ?, ?)",
            )
            .bind("mutation-1")
            .bind("user-a")
            .bind("TASK")
            .bind("pending-task")
            .bind("pending")
            .execute(&mut connection)
            .await
            .unwrap();
            sqlx::query(
                "INSERT INTO local_mutations
                    (client_mutation_id, user_id, resource_type, resource_id, status)
                 VALUES (?, ?, ?, ?, ?)",
            )
            .bind("mutation-2")
            .bind("user-a")
            .bind("TASK")
            .bind("inflight-task")
            .bind("inflight")
            .execute(&mut connection)
            .await
            .unwrap();

            replace_snapshot_on_connection(
                &mut connection,
                "user-a",
                vec![
                    (
                        "TASK".into(),
                        "pending-task".into(),
                        4,
                        None,
                        json!({ "title": "Remote" }),
                    ),
                    (
                        "TASK".into(),
                        "inflight-task".into(),
                        6,
                        None,
                        json!({ "title": "Remote inflight" }),
                    ),
                    (
                        "SUBJECT".into(),
                        "subject-1".into(),
                        2,
                        None,
                        json!({ "name": "Physics" }),
                    ),
                ],
            )
            .await
            .unwrap();

            let pending_payload: String = sqlx::query_scalar(
                "SELECT payload FROM local_resource_records WHERE user_id = ? AND resource_type = ? AND resource_id = ?",
            )
            .bind("user-a").bind("TASK").bind("pending-task")
            .fetch_one(&mut connection).await.unwrap();
            assert_eq!(pending_payload, r#"{\"title\":\"Local\"}"#);

            let inflight_payload: String = sqlx::query_scalar(
                "SELECT payload FROM local_resource_records WHERE user_id = ? AND resource_type = ? AND resource_id = ?",
            )
            .bind("user-a").bind("TASK").bind("inflight-task")
            .fetch_one(&mut connection).await.unwrap();
            assert_eq!(inflight_payload, inflight_local_payload);

            let result = replace_snapshot_on_connection(
                &mut connection,
                "user-a",
                vec![(
                    "TASK".into(),
                    "replacement".into(),
                    -1,
                    None,
                    json!({ "title": "Invalid" }),
                )],
            )
            .await;
            assert_eq!(result, Err("LOCAL_SNAPSHOT_INVALID".to_string()));

            let subject_payload: String = sqlx::query_scalar(
                "SELECT payload FROM local_resource_records WHERE user_id = ? AND resource_type = ? AND resource_id = ?",
            )
            .bind("user-a").bind("SUBJECT").bind("subject-1")
            .fetch_one(&mut connection).await.unwrap();
            assert_eq!(subject_payload, r#"{"name":"Physics"}"#);
        });
    }
}

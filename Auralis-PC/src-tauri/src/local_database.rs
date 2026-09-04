use serde::Deserialize;
use serde_json::Value;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};
use sqlx::{Connection, SqliteConnection};
use std::{collections::HashSet, fs::create_dir_all, path::Path, time::Duration};
use tauri::{AppHandle, Manager};

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
         WHERE user_id = ? AND status IN ('pending', 'conflict', 'error')",
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
                AND local_mutations.status IN ('pending', 'conflict', 'error')
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
    let database_path = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("LOCAL_DATABASE_PATH_FAILED:{error}"))?
        .join("auralis.db");
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
    use super::replace_snapshot_on_connection;
    use serde_json::json;
    use sqlx::{Connection, SqliteConnection};

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

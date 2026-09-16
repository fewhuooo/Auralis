use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::AppHandle;

const ASSETS_DIR: &str = "assets";
const STAGING_DIR: &str = "asset-staging";
pub const MAX_LOCAL_ASSET_BYTES: u64 = 52_428_800;
static NONCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAssetDescriptor {
    pub local_asset_id: String,
    pub safe_extension: String,
    pub size_bytes: u64,
    pub sha256: String,
    pub absolute_path: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileReport {
    pub removed_staging_files: u64,
    pub files: Vec<LocalAssetDescriptor>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLocalAssetCommand {
    pub user_scope: String,
    pub device_id: String,
    pub local_asset_id: String,
    pub source_path: PathBuf,
    pub safe_extension: String,
    pub expected_size: u64,
    pub expected_sha256: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveLocalAssetCommand {
    pub user_scope: String,
    pub device_id: String,
    pub local_asset_id: String,
    pub expected_size: Option<u64>,
    pub expected_sha256: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadLocalAssetCommand {
    pub user_scope: String,
    pub device_id: String,
    pub local_asset_id: String,
    pub remote_url: String,
    pub expected_size: u64,
    pub expected_sha256: String,
    pub safe_extension: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteLocalAssetCommand {
    pub user_scope: String,
    pub device_id: String,
    pub local_asset_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileLocalAssetsCommand {
    pub user_scope: String,
    pub device_id: String,
}

pub fn validate_logical_segment(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 128
        || value == "."
        || value == ".."
        || value
            .chars()
            .any(|c| c.is_control() || matches!(c, '/' | '\\' | ':'))
    {
        return Err("LOCAL_ASSET_ID_INVALID".to_string());
    }
    Ok(())
}

pub fn normalize_extension(value: &str) -> Result<String, String> {
    let value = value.trim();
    let extension = value.strip_prefix('.').unwrap_or(value);
    if extension.is_empty()
        || extension.len() > 16
        || extension.chars().any(|c| !c.is_ascii_alphanumeric())
    {
        return Err("LOCAL_ASSET_EXTENSION_INVALID".to_string());
    }
    Ok(extension.to_ascii_lowercase())
}

fn ensure_contained(root: &Path, candidate: &Path) -> Result<(), String> {
    let root = fs::canonicalize(root).map_err(|_| "LOCAL_ASSET_ROOT_INVALID".to_string())?;
    let mut existing = candidate.to_path_buf();
    while !existing.exists() {
        existing = existing
            .parent()
            .ok_or_else(|| "LOCAL_ASSET_PATH_INVALID".to_string())?
            .to_path_buf();
    }
    let candidate =
        fs::canonicalize(existing).map_err(|_| "LOCAL_ASSET_PATH_INVALID".to_string())?;
    if !candidate.starts_with(&root) {
        return Err("LOCAL_ASSET_PATH_OUTSIDE_ROOT".to_string());
    }
    Ok(())
}

fn managed_asset_dir(
    root: &Path,
    user_scope: &str,
    local_asset_id: &str,
) -> Result<PathBuf, String> {
    validate_logical_segment(user_scope)?;
    validate_logical_segment(local_asset_id)?;
    let assets = root.join(ASSETS_DIR);
    fs::create_dir_all(&assets).map_err(|_| "LOCAL_ASSET_DIRECTORY_FAILED".to_string())?;
    ensure_contained(root, &assets)?;
    let scope = assets.join(user_scope);
    fs::create_dir_all(&scope).map_err(|_| "LOCAL_ASSET_DIRECTORY_FAILED".to_string())?;
    ensure_contained(root, &scope)?;
    let asset = scope.join(local_asset_id);
    fs::create_dir_all(&asset).map_err(|_| "LOCAL_ASSET_DIRECTORY_FAILED".to_string())?;
    ensure_contained(root, &asset)?;
    Ok(asset)
}

fn existing_asset_dir(
    root: &Path,
    user_scope: &str,
    local_asset_id: &str,
) -> Result<Option<PathBuf>, String> {
    validate_logical_segment(user_scope)?;
    validate_logical_segment(local_asset_id)?;
    let Some(scope) = existing_asset_scope(root, user_scope)? else {
        return Ok(None);
    };
    let asset = scope.join(local_asset_id);
    if !asset.exists() {
        return Ok(None);
    }
    ensure_contained(root, &asset)?;
    Ok(Some(asset))
}

fn existing_asset_scope(root: &Path, user_scope: &str) -> Result<Option<PathBuf>, String> {
    validate_logical_segment(user_scope)?;
    let assets = root.join(ASSETS_DIR);
    if !assets.exists() {
        return Ok(None);
    }
    ensure_contained(root, &assets)?;
    let scope = assets.join(user_scope);
    if !scope.exists() {
        return Ok(None);
    }
    ensure_contained(root, &scope)?;
    Ok(Some(scope))
}

pub fn managed_asset_path(
    root: &Path,
    user_scope: &str,
    device_id: &str,
    local_asset_id: &str,
    safe_extension: &str,
) -> Result<PathBuf, String> {
    validate_logical_segment(device_id)?;
    let extension = normalize_extension(safe_extension)?;
    Ok(managed_asset_dir(root, user_scope, local_asset_id)?.join(format!("content.{extension}")))
}

fn readonly_asset_path(
    root: &Path,
    user_scope: &str,
    device_id: &str,
    local_asset_id: &str,
    safe_extension: &str,
) -> Result<PathBuf, String> {
    validate_logical_segment(user_scope)?;
    validate_logical_segment(device_id)?;
    validate_logical_segment(local_asset_id)?;
    let extension = normalize_extension(safe_extension)?;
    let path = root
        .join(ASSETS_DIR)
        .join(user_scope)
        .join(local_asset_id)
        .join(format!("content.{extension}"));
    ensure_contained(root, &path)?;
    Ok(path)
}

fn staging_dir(root: &Path, user_scope: &str) -> Result<PathBuf, String> {
    validate_logical_segment(user_scope)?;
    let staging = root.join(STAGING_DIR);
    fs::create_dir_all(&staging).map_err(|_| "LOCAL_ASSET_STAGING_FAILED".to_string())?;
    ensure_contained(root, &staging)?;
    let scope = staging.join(user_scope);
    fs::create_dir_all(&scope).map_err(|_| "LOCAL_ASSET_STAGING_FAILED".to_string())?;
    ensure_contained(root, &scope)?;
    Ok(scope)
}

fn sha256_reader<R: Read>(reader: &mut R) -> Result<(u64, String), String> {
    let mut hasher = Sha256::new();
    let mut size = 0_u64;
    let mut buffer = [0_u8; 128 * 1024];
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|_| "LOCAL_ASSET_READ_FAILED".to_string())?;
        if read == 0 {
            break;
        }
        size = size.saturating_add(read as u64);
        hasher.update(&buffer[..read]);
    }
    Ok((size, hex::encode(hasher.finalize())))
}

fn sha256_file(path: &Path) -> Result<(u64, String), String> {
    let file = File::open(path).map_err(|_| "LOCAL_ASSET_FILE_MISSING".to_string())?;
    sha256_reader(&mut BufReader::new(file))
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn sha256_bytes(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn validate_expected(
    size: u64,
    hash: &str,
    expected_size: u64,
    expected_hash: &str,
) -> Result<(), String> {
    if expected_size > MAX_LOCAL_ASSET_BYTES || size > MAX_LOCAL_ASSET_BYTES {
        return Err("LOCAL_ASSET_SIZE_LIMIT".to_string());
    }
    if size != expected_size {
        return Err("LOCAL_ASSET_SIZE_MISMATCH".to_string());
    }
    if !hash.eq_ignore_ascii_case(expected_hash) {
        return Err("LOCAL_ASSET_HASH_MISMATCH".to_string());
    }
    Ok(())
}

fn descriptor_for(
    path: PathBuf,
    local_asset_id: &str,
    extension: String,
) -> Result<LocalAssetDescriptor, String> {
    let metadata =
        fs::symlink_metadata(&path).map_err(|_| "LOCAL_ASSET_FILE_MISSING".to_string())?;
    if !metadata.file_type().is_file() {
        return Err("LOCAL_ASSET_FILE_INVALID".to_string());
    }
    let (size_bytes, sha256) = sha256_file(&path)?;
    Ok(LocalAssetDescriptor {
        local_asset_id: local_asset_id.to_string(),
        safe_extension: extension,
        size_bytes,
        sha256,
        absolute_path: path,
    })
}

fn asset_lock_path(root: &Path, user_scope: &str, local_asset_id: &str) -> Result<PathBuf, String> {
    validate_logical_segment(user_scope)?;
    validate_logical_segment(local_asset_id)?;
    let scope = root.join(ASSETS_DIR).join(user_scope);
    ensure_contained(root, &scope)?;
    Ok(scope.join(format!(".{local_asset_id}.lock")))
}

#[allow(dead_code)]
#[derive(Debug)]
struct AssetLock(File);

fn acquire_asset_lock(path: &Path) -> Result<AssetLock, String> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(path)
        .map_err(|_| "LOCAL_ASSET_LOCK_FAILED".to_string())?;
    match file.try_lock() {
        Ok(()) => Ok(AssetLock(file)),
        Err(std::fs::TryLockError::WouldBlock) => Err("LOCAL_ASSET_BUSY".to_string()),
        Err(std::fs::TryLockError::Error(_)) => Err("LOCAL_ASSET_LOCK_FAILED".to_string()),
    }
}

struct PartGuard(Option<PathBuf>);

impl PartGuard {
    fn new(path: PathBuf) -> Self {
        Self(Some(path))
    }

    fn disarm(mut self) {
        self.0 = None;
    }
}

impl Drop for PartGuard {
    fn drop(&mut self) {
        if let Some(path) = self.0.take() {
            let _ = fs::remove_file(path);
        }
    }
}

fn sync_directory(path: &Path) {
    #[cfg(unix)]
    if let Ok(file) = File::open(path) {
        let _ = file.sync_all();
    }
    #[cfg(not(unix))]
    let _ = path;
}

pub fn import_file(
    root: &Path,
    user_scope: &str,
    device_id: &str,
    local_asset_id: &str,
    source_path: &Path,
    safe_extension: &str,
    expected_size: u64,
    expected_sha256: &str,
) -> Result<LocalAssetDescriptor, String> {
    let destination =
        managed_asset_path(root, user_scope, device_id, local_asset_id, safe_extension)?;
    let extension = normalize_extension(safe_extension)?;
    let lock_path = asset_lock_path(root, user_scope, local_asset_id)?;
    let _lock = acquire_asset_lock(&lock_path)?;
    if destination.exists() {
        let existing = descriptor_for(destination, local_asset_id, extension)?;
        validate_expected(
            existing.size_bytes,
            &existing.sha256,
            expected_size,
            expected_sha256,
        )
        .map(|_| existing)
        .map_err(|_| "LOCAL_ASSET_CONFLICT".to_string())
    } else {
        let source =
            File::open(source_path).map_err(|_| "LOCAL_ASSET_SOURCE_MISSING".to_string())?;
        let source_size = source
            .metadata()
            .map_err(|_| "LOCAL_ASSET_SOURCE_MISSING".to_string())?
            .len();
        if source_size > MAX_LOCAL_ASSET_BYTES || expected_size > MAX_LOCAL_ASSET_BYTES {
            return Err("LOCAL_ASSET_SIZE_LIMIT".to_string());
        }
        let staging = staging_dir(root, user_scope)?;
        let part = staging.join(format!(
            "{local_asset_id}.{}.content.{extension}.part",
            NONCE.fetch_add(1, Ordering::Relaxed)
        ));
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&part)
            .map_err(|_| "LOCAL_ASSET_STAGING_FAILED".to_string())?;
        let part_guard = PartGuard::new(part.clone());
        let mut reader = BufReader::new(source);
        let mut hasher = Sha256::new();
        let mut size = 0_u64;
        let mut buffer = [0_u8; 128 * 1024];
        let copy_result: Result<(), String> = loop {
            let read = reader
                .read(&mut buffer)
                .map_err(|_| "LOCAL_ASSET_SOURCE_READ_FAILED".to_string())?;
            if read == 0 {
                break Ok(());
            }
            output
                .write_all(&buffer[..read])
                .map_err(|_| "LOCAL_ASSET_WRITE_FAILED".to_string())?;
            size = size.saturating_add(read as u64);
            if size > MAX_LOCAL_ASSET_BYTES {
                return Err("LOCAL_ASSET_SIZE_LIMIT".to_string());
            }
            hasher.update(&buffer[..read]);
        };
        copy_result?;
        output
            .flush()
            .map_err(|_| "LOCAL_ASSET_WRITE_FAILED".to_string())?;
        output
            .sync_all()
            .map_err(|_| "LOCAL_ASSET_FSYNC_FAILED".to_string())?;
        let hash = hex::encode(hasher.finalize());
        validate_expected(size, &hash, expected_size, expected_sha256)?;
        if let Err(error) = fs::rename(&part, &destination) {
            return Err(if error.kind() == io::ErrorKind::AlreadyExists {
                "LOCAL_ASSET_CONFLICT".to_string()
            } else {
                "LOCAL_ASSET_RENAME_FAILED".to_string()
            });
        }
        part_guard.disarm();
        sync_directory(destination.parent().unwrap());
        descriptor_for(destination, local_asset_id, extension)
    }
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn resolve_file(
    root: &Path,
    user_scope: &str,
    device_id: &str,
    local_asset_id: &str,
    safe_extension: &str,
    expected_size: u64,
    expected_sha256: &str,
) -> Result<LocalAssetDescriptor, String> {
    let path = readonly_asset_path(root, user_scope, device_id, local_asset_id, safe_extension)?;
    let descriptor = descriptor_for(path, local_asset_id, normalize_extension(safe_extension)?)?;
    validate_expected(
        descriptor.size_bytes,
        &descriptor.sha256,
        expected_size,
        expected_sha256,
    )?;
    Ok(descriptor)
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn delete_file(
    root: &Path,
    user_scope: &str,
    device_id: &str,
    local_asset_id: &str,
    safe_extension: &str,
) -> Result<(), String> {
    validate_logical_segment(device_id)?;
    validate_logical_segment(local_asset_id)?;
    let Some(scope) = existing_asset_scope(root, user_scope)? else {
        return Ok(());
    };
    let _lock = acquire_asset_lock(&scope.join(format!(".{local_asset_id}.lock")))?;
    let Some(asset) = existing_asset_dir(root, user_scope, local_asset_id)? else {
        return Ok(());
    };
    let path = asset.join(format!("content.{}", normalize_extension(safe_extension)?));
    ensure_contained(root, &path)?;
    if !path.exists() {
        return Ok(());
    }
    fs::remove_file(&path).map_err(|_| "LOCAL_ASSET_DELETE_FAILED".to_string())?;
    if let Some(parent) = path.parent() {
        let _ = fs::remove_dir(parent);
        sync_directory(parent.parent().unwrap_or(parent));
    }
    Ok(())
}

pub fn reconcile_files(
    root: &Path,
    user_scope: &str,
    device_id: &str,
) -> Result<ReconcileReport, String> {
    validate_logical_segment(device_id)?;
    let staging = staging_dir(root, user_scope)?;
    let mut removed = 0_u64;
    for entry in fs::read_dir(&staging).map_err(|_| "LOCAL_ASSET_RECONCILE_FAILED".to_string())? {
        let entry = entry.map_err(|_| "LOCAL_ASSET_RECONCILE_FAILED".to_string())?;
        let path = entry.path();
        if path.is_file() && path.extension().is_some_and(|value| value == "part") {
            fs::remove_file(path).map_err(|_| "LOCAL_ASSET_RECONCILE_FAILED".to_string())?;
            removed += 1;
        }
    }
    let scope = root.join(ASSETS_DIR).join(user_scope);
    if !scope.exists() {
        return Ok(ReconcileReport {
            removed_staging_files: removed,
            files: Vec::new(),
        });
    }
    ensure_contained(root, &scope)?;
    let mut files = Vec::new();
    for asset in fs::read_dir(scope).map_err(|_| "LOCAL_ASSET_RECONCILE_FAILED".to_string())? {
        let asset = asset.map_err(|_| "LOCAL_ASSET_RECONCILE_FAILED".to_string())?;
        if !asset
            .file_type()
            .map_err(|_| "LOCAL_ASSET_RECONCILE_FAILED".to_string())?
            .is_dir()
        {
            continue;
        }
        let id = asset.file_name().to_string_lossy().to_string();
        validate_logical_segment(&id)?;
        for content in
            fs::read_dir(asset.path()).map_err(|_| "LOCAL_ASSET_RECONCILE_FAILED".to_string())?
        {
            let content = content.map_err(|_| "LOCAL_ASSET_RECONCILE_FAILED".to_string())?;
            let name = content.file_name().to_string_lossy().to_string();
            if let Some(extension) = name.strip_prefix("content.") {
                let extension = normalize_extension(extension)?;
                ensure_contained(root, &content.path())?;
                files.push(descriptor_for(content.path(), &id, extension)?);
            }
        }
    }
    Ok(ReconcileReport {
        removed_staging_files: removed,
        files,
    })
}

#[tauri::command]
pub fn import_local_asset(
    command: ImportLocalAssetCommand,
    app: AppHandle,
) -> Result<LocalAssetDescriptor, String> {
    let root = crate::local_database::canonical_app_data_dir(&app)?;
    import_file(
        &root,
        &command.user_scope,
        &command.device_id,
        &command.local_asset_id,
        &command.source_path,
        &command.safe_extension,
        command.expected_size,
        &command.expected_sha256,
    )
}

#[tauri::command]
pub fn resolve_local_asset(
    command: ResolveLocalAssetCommand,
    app: AppHandle,
) -> Result<LocalAssetDescriptor, String> {
    let root = crate::local_database::canonical_app_data_dir(&app)?;
    let Some(asset) = existing_asset_dir(&root, &command.user_scope, &command.local_asset_id)?
    else {
        return Err("LOCAL_ASSET_FILE_MISSING".to_string());
    };
    validate_logical_segment(&command.device_id)?;
    let mut entries = fs::read_dir(asset)
        .map_err(|_| "LOCAL_ASSET_FILE_MISSING".to_string())?
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().starts_with("content."));
    let entry = entries
        .next()
        .ok_or_else(|| "LOCAL_ASSET_FILE_MISSING".to_string())?;
    if entries.next().is_some() {
        return Err("LOCAL_ASSET_FILE_AMBIGUOUS".to_string());
    }
    let name = entry.file_name().to_string_lossy().to_string();
    let extension = normalize_extension(name.strip_prefix("content.").unwrap_or_default())?;
    ensure_contained(&root, &entry.path())?;
    let descriptor = descriptor_for(entry.path(), &command.local_asset_id, extension)?;
    if command
        .expected_size
        .is_some_and(|value| value != descriptor.size_bytes)
    {
        return Err("LOCAL_ASSET_SIZE_MISMATCH".to_string());
    }
    if command
        .expected_sha256
        .is_some_and(|value| !value.eq_ignore_ascii_case(&descriptor.sha256))
    {
        return Err("LOCAL_ASSET_HASH_MISMATCH".to_string());
    }
    Ok(descriptor)
}

#[tauri::command]
pub async fn download_local_asset(
    command: DownloadLocalAssetCommand,
    app: AppHandle,
) -> Result<LocalAssetDescriptor, String> {
    let url = reqwest::Url::parse(&command.remote_url)
        .map_err(|_| "LOCAL_ASSET_URL_INVALID".to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("LOCAL_ASSET_URL_INVALID".to_string());
    }
    let root = crate::local_database::canonical_app_data_dir(&app)?;
    let destination = managed_asset_path(
        &root,
        &command.user_scope,
        &command.device_id,
        &command.local_asset_id,
        &command.safe_extension,
    )?;
    let extension = normalize_extension(&command.safe_extension)?;
    let size_limit = command.expected_size.min(MAX_LOCAL_ASSET_BYTES);
    if command.expected_size > MAX_LOCAL_ASSET_BYTES {
        return Err("LOCAL_ASSET_SIZE_LIMIT".to_string());
    }
    let _lock = acquire_asset_lock(&asset_lock_path(
        &root,
        &command.user_scope,
        &command.local_asset_id,
    )?)?;
    let response = reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map_err(|_| "LOCAL_ASSET_DOWNLOAD_FAILED".to_string())?
        .error_for_status()
        .map_err(|_| "LOCAL_ASSET_DOWNLOAD_FAILED".to_string())?;
    if response
        .content_length()
        .is_some_and(|length| length > size_limit)
    {
        return Err("LOCAL_ASSET_SIZE_MISMATCH".to_string());
    }
    let staging = staging_dir(&root, &command.user_scope)?;
    let part = staging.join(format!(
        "{}.{}.content.{extension}.part",
        command.local_asset_id,
        NONCE.fetch_add(1, Ordering::Relaxed)
    ));
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&part)
        .map_err(|_| "LOCAL_ASSET_STAGING_FAILED".to_string())?;
    let part_guard = PartGuard::new(part.clone());
    let mut response = response;
    let mut hasher = Sha256::new();
    let mut size = 0_u64;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "LOCAL_ASSET_DOWNLOAD_FAILED".to_string())?
    {
        size = size.saturating_add(chunk.len() as u64);
        if size > size_limit {
            return Err("LOCAL_ASSET_SIZE_MISMATCH".to_string());
        }
        output
            .write_all(&chunk)
            .map_err(|_| "LOCAL_ASSET_WRITE_FAILED".to_string())?;
        hasher.update(&chunk);
    }
    output
        .flush()
        .map_err(|_| "LOCAL_ASSET_WRITE_FAILED".to_string())?;
    output
        .sync_all()
        .map_err(|_| "LOCAL_ASSET_FSYNC_FAILED".to_string())?;
    let hash = hex::encode(hasher.finalize());
    validate_expected(size, &hash, command.expected_size, &command.expected_sha256)?;
    if destination.exists() {
        return resolve_local_asset(
            ResolveLocalAssetCommand {
                user_scope: command.user_scope,
                device_id: command.device_id,
                local_asset_id: command.local_asset_id,
                expected_size: Some(command.expected_size),
                expected_sha256: Some(command.expected_sha256),
            },
            app,
        );
    }
    fs::rename(&part, &destination).map_err(|_| "LOCAL_ASSET_RENAME_FAILED".to_string())?;
    part_guard.disarm();
    sync_directory(destination.parent().unwrap());
    descriptor_for(destination, &command.local_asset_id, extension)
}

#[tauri::command]
pub fn delete_local_asset(command: DeleteLocalAssetCommand, app: AppHandle) -> Result<(), String> {
    let root = crate::local_database::canonical_app_data_dir(&app)?;
    validate_logical_segment(&command.device_id)?;
    validate_logical_segment(&command.local_asset_id)?;
    let Some(scope) = existing_asset_scope(&root, &command.user_scope)? else {
        return Ok(());
    };
    let _lock = acquire_asset_lock(&scope.join(format!(".{}.lock", command.local_asset_id)))?;
    let Some(asset) = existing_asset_dir(&root, &command.user_scope, &command.local_asset_id)?
    else {
        return Ok(());
    };
    let mut entries = fs::read_dir(&asset)
        .map_err(|_| "LOCAL_ASSET_FILE_MISSING".to_string())?
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().starts_with("content."));
    let Some(entry) = entries.next() else {
        return Ok(());
    };
    if entries.next().is_some() {
        return Err("LOCAL_ASSET_FILE_AMBIGUOUS".to_string());
    }
    ensure_contained(&root, &entry.path())?;
    fs::remove_file(entry.path()).map_err(|_| "LOCAL_ASSET_DELETE_FAILED".to_string())?;
    let _ = fs::remove_dir(asset);
    Ok(())
}

#[tauri::command]
pub fn reconcile_local_assets(
    command: ReconcileLocalAssetsCommand,
    app: AppHandle,
) -> Result<ReconcileReport, String> {
    let root = crate::local_database::canonical_app_data_dir(&app)?;
    reconcile_files(&root, &command.user_scope, &command.device_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use std::path::Path;
    use std::sync::Arc;
    use std::thread;
    struct TempRoot(PathBuf);
    impl TempRoot {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "auralis-local-asset-{}-{}",
                std::process::id(),
                NONCE.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
        fn path(&self) -> &Path {
            &self.0
        }
    }
    impl Drop for TempRoot {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn source_file(dir: &Path, name: &str, contents: &[u8]) -> PathBuf {
        let path = dir.join(name);
        let mut file = fs::File::create(&path).unwrap();
        file.write_all(contents).unwrap();
        path
    }
    #[test]
    fn rejects_untrusted_logical_segments_and_normalizes_extension() {
        assert_eq!(normalize_extension(".PDF").unwrap(), "pdf");
        assert!(normalize_extension("../pdf").is_err());
        assert!(normalize_extension("pdf\\tmp").is_err());
        assert!(validate_logical_segment("../user").is_err());
        assert!(validate_logical_segment("C:\\user").is_err());
        assert!(validate_logical_segment("/user").is_err());
        assert!(validate_logical_segment("user/name").is_err());
    }
    #[test]
    fn managed_paths_stay_contained_even_when_scope_is_a_symlink() {
        let root = TempRoot::new();
        let outside = TempRoot::new();
        let scope = root.path().join("assets").join("user-a");
        fs::create_dir_all(scope.parent().unwrap()).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(outside.path(), &scope).unwrap();
        #[cfg(windows)]
        if std::os::windows::fs::symlink_dir(outside.path(), &scope).is_err() {
            return;
        }
        assert!(managed_asset_path(root.path(), "user-a", "device-a", "asset-a", "pdf").is_err());
    }
    #[test]
    fn import_is_atomic_and_rejects_size_or_hash_mismatch() {
        let root = TempRoot::new();
        let input = source_file(root.path(), "source.pdf", b"hello");
        let descriptor = import_file(
            root.path(),
            "user-a",
            "device-a",
            "asset-a",
            &input,
            "pdf",
            5,
            &sha256_bytes(b"hello"),
        )
        .unwrap();
        assert!(descriptor.absolute_path.exists());
        assert_eq!(fs::read(&descriptor.absolute_path).unwrap(), b"hello");
        assert!(import_file(
            root.path(),
            "user-a",
            "device-a",
            "asset-b",
            &input,
            "pdf",
            4,
            &sha256_bytes(b"hello")
        )
        .is_err());
        assert!(import_file(
            root.path(),
            "user-a",
            "device-a",
            "asset-c",
            &input,
            "pdf",
            5,
            &sha256_bytes(b"world")
        )
        .is_err());
        assert!(!root
            .path()
            .join("assets/user-a/asset-b/content.pdf")
            .exists());
        let staging = root.path().join("asset-staging/user-a");
        assert!(!staging.exists() || fs::read_dir(staging).unwrap().next().is_none());
    }
    #[test]
    fn import_enforces_the_server_upload_limit_before_copying() {
        let root = TempRoot::new();
        let input = source_file(root.path(), "source.pdf", b"small");
        assert_eq!(MAX_LOCAL_ASSET_BYTES, 52_428_800);
        assert_eq!(
            import_file(
                root.path(),
                "user-a",
                "device-a",
                "too-large",
                &input,
                "pdf",
                MAX_LOCAL_ASSET_BYTES + 1,
                &sha256_bytes(b"small"),
            )
            .unwrap_err(),
            "LOCAL_ASSET_SIZE_LIMIT"
        );
        let oversized = root.path().join("oversized.pdf");
        let file = File::create(&oversized).unwrap();
        file.set_len(MAX_LOCAL_ASSET_BYTES + 1).unwrap();
        assert_eq!(
            import_file(
                root.path(),
                "user-a",
                "device-a",
                "too-large-source",
                &oversized,
                "pdf",
                MAX_LOCAL_ASSET_BYTES + 1,
                &sha256_bytes(b"unused"),
            )
            .unwrap_err(),
            "LOCAL_ASSET_SIZE_LIMIT"
        );
    }
    #[test]
    fn interrupted_staging_is_reconciled_without_touching_ready_assets() {
        let root = TempRoot::new();
        let staging = root.path().join("asset-staging/user-a");
        fs::create_dir_all(&staging).unwrap();
        fs::write(staging.join("asset-a.content.pdf.part"), b"partial").unwrap();
        let input = source_file(root.path(), "source.pdf", b"ready");
        let ready = import_file(
            root.path(),
            "user-a",
            "device-a",
            "asset-ready",
            &input,
            "pdf",
            5,
            &sha256_bytes(b"ready"),
        )
        .unwrap();
        let report = reconcile_files(root.path(), "user-a", "device-a").unwrap();
        assert!(report.removed_staging_files >= 1);
        assert!(ready.absolute_path.exists());
    }
    #[test]
    fn part_guard_removes_unpublished_file_on_failure_path() {
        let root = TempRoot::new();
        let part = root.path().join("asset-staging.part");
        fs::write(&part, b"partial").unwrap();
        {
            let _guard = PartGuard::new(part.clone());
        }
        assert!(!part.exists());
    }
    #[test]
    fn advisory_asset_lock_is_released_when_the_handle_is_dropped() {
        let root = TempRoot::new();
        let assets = root.path().join("assets/user-a");
        fs::create_dir_all(&assets).unwrap();
        let lock_path = assets.join(".asset-a.lock");
        {
            let _lock = acquire_asset_lock(&lock_path).unwrap();
            assert_eq!(
                acquire_asset_lock(&lock_path).unwrap_err(),
                "LOCAL_ASSET_BUSY"
            );
        }
        let _lock = acquire_asset_lock(&lock_path).unwrap();
    }
    #[test]
    fn concurrent_imports_never_publish_partial_content() {
        let root = Arc::new(TempRoot::new());
        let input = source_file(root.path(), "source.pdf", b"concurrent");
        let expected = sha256_bytes(b"concurrent");
        let mut handles = Vec::new();
        for _ in 0..4 {
            let root = Arc::clone(&root);
            let input = input.clone();
            let expected = expected.clone();
            handles.push(thread::spawn(move || {
                import_file(
                    root.path(),
                    "user-a",
                    "device-a",
                    "asset-a",
                    &input,
                    "pdf",
                    10,
                    &expected,
                )
            }));
        }
        let results: Vec<_> = handles
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .collect();
        assert!(results.iter().any(Result::is_ok));
        assert_eq!(
            fs::read(root.path().join("assets/user-a/asset-a/content.pdf")).unwrap(),
            b"concurrent"
        );
    }
    #[test]
    fn resolve_and_delete_are_scope_isolated_and_detect_tampering() {
        let root = TempRoot::new();
        let input = source_file(root.path(), "source.pdf", b"private");
        let descriptor = import_file(
            root.path(),
            "user-a",
            "device-a",
            "asset-a",
            &input,
            "pdf",
            7,
            &sha256_bytes(b"private"),
        )
        .unwrap();
        assert!(resolve_file(
            root.path(),
            "user-b",
            "device-a",
            "asset-a",
            "pdf",
            7,
            &sha256_bytes(b"private")
        )
        .is_err());
        fs::write(&descriptor.absolute_path, b"tampered").unwrap();
        assert!(resolve_file(
            root.path(),
            "user-a",
            "device-a",
            "asset-a",
            "pdf",
            7,
            &sha256_bytes(b"private")
        )
        .is_err());
        delete_file(root.path(), "user-b", "device-a", "asset-a", "pdf").unwrap();
        delete_file(root.path(), "user-a", "device-a", "asset-a", "pdf").unwrap();
        assert!(!descriptor.absolute_path.exists());
        delete_file(root.path(), "user-a", "device-a", "asset-a", "pdf").unwrap();
        delete_file(
            root.path(),
            "user-a",
            "device-a",
            "asset-never-created",
            "pdf",
        )
        .unwrap();
    }
    #[test]
    fn resolving_unknown_asset_does_not_create_scope_or_asset_directories() {
        let root = TempRoot::new();
        assert!(resolve_file(
            root.path(),
            "user-a",
            "device-a",
            "never-created",
            "pdf",
            0,
            &sha256_bytes(b"")
        )
        .is_err());
        assert!(!root.path().join("assets").exists());
    }
}

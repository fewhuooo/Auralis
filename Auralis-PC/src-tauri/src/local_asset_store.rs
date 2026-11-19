use reqwest::blocking::{Body, Client};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_LENGTH, HOST};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufReader, Cursor, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{ipc::Response, AppHandle};

const ASSETS_DIR: &str = "assets";
const STAGING_DIR: &str = "asset-staging";
const QUARANTINE_DIR: &str = "asset-quarantine";
pub const MAX_LOCAL_ASSET_BYTES: u64 = 52_428_800;
const MAX_UPLOAD_HEADERS: usize = 32;
const MAX_UPLOAD_HEADER_NAME_BYTES: usize = 128;
const MAX_UPLOAD_HEADER_VALUE_BYTES: usize = 8 * 1024;
const MAX_UPLOAD_HEADER_BYTES: usize = 32 * 1024;
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
    pub quarantined_files: Vec<String>,
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
pub struct ImportLocalAssetBytesCommand {
    pub user_scope: String,
    pub device_id: String,
    pub local_asset_id: String,
    pub safe_extension: String,
    pub expected_size: u64,
    pub expected_sha256: String,
    pub content: Vec<u8>,
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
    pub known_local_asset_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAssetUploadPutCommand {
    pub user_scope: String,
    pub device_id: String,
    pub local_asset_id: String,
    pub upload_url: String,
    pub headers: HashMap<String, String>,
    pub expected_size: u64,
    pub expected_sha256: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAssetUploadPutReceipt {
    pub status: u16,
    pub bytes_sent: u64,
    pub payload_sha256: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct ReadLocalAssetCommand {
    pub user_scope: String,
    pub device_id: String,
    pub local_asset_id: String,
    pub expected_size: u64,
    pub expected_sha256: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAssetReadReceipt {
    pub local_asset_id: String,
    pub safe_extension: String,
    pub size_bytes: u64,
    pub sha256: String,
}

#[derive(Debug, Clone)]
struct LocalAssetReadResult {
    frame: Vec<u8>,
}

#[derive(Default)]
struct UploadMetrics {
    bytes: u64,
    hash: Sha256,
    read_failed: bool,
}

struct HashingReader<R> {
    inner: R,
    metrics: Arc<Mutex<UploadMetrics>>,
}

impl<R: Read> Read for HashingReader<R> {
    fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
        let count = match self.inner.read(output) {
            Ok(count) => count,
            Err(error) => {
                if let Ok(mut metrics) = self.metrics.lock() {
                    metrics.read_failed = true;
                }
                return Err(error);
            }
        };
        if count > 0 {
            let mut metrics = self
                .metrics
                .lock()
                .map_err(|_| io::Error::other("LOCAL_ASSET_UPLOAD_METRICS_FAILED"))?;
            metrics.bytes = metrics.bytes.saturating_add(count as u64);
            metrics.hash.update(&output[..count]);
        }
        Ok(count)
    }
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

/// Validate the directory containing an entry without canonicalizing the
/// entry itself.  This is required when quarantining a symlink/junction: the
/// link target may intentionally be outside the managed root, but renaming
/// the link itself is safe and must not abort the global reconciliation.
fn ensure_entry_parent_contained(root: &Path, entry: &Path) -> Result<(), String> {
    let root = fs::canonicalize(root).map_err(|_| "LOCAL_ASSET_ROOT_INVALID".to_string())?;
    let parent = entry
        .parent()
        .ok_or_else(|| "LOCAL_ASSET_PATH_INVALID".to_string())?;
    let parent = fs::canonicalize(parent).map_err(|_| "LOCAL_ASSET_PATH_INVALID".to_string())?;
    if !parent.starts_with(&root) {
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

fn quarantine_dir(root: &Path, user_scope: &str) -> Result<PathBuf, String> {
    validate_logical_segment(user_scope)?;
    let quarantine = root.join(QUARANTINE_DIR);
    fs::create_dir_all(&quarantine).map_err(|_| "LOCAL_ASSET_QUARANTINE_FAILED".to_string())?;
    ensure_contained(root, &quarantine)?;
    let scope = quarantine.join(user_scope);
    fs::create_dir_all(&scope).map_err(|_| "LOCAL_ASSET_QUARANTINE_FAILED".to_string())?;
    ensure_contained(root, &scope)?;
    Ok(scope)
}

fn quarantine_entry(
    root: &Path,
    user_scope: &str,
    entry: &Path,
    label: &str,
) -> Result<(), String> {
    ensure_entry_parent_contained(root, entry)?;
    let destination_dir = quarantine_dir(root, user_scope)?;
    let basename = entry
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let destination = destination_dir.join(format!(
        "{label}-{}-{basename}",
        NONCE.fetch_add(1, Ordering::Relaxed)
    ));
    ensure_contained(root, &destination)?;
    fs::rename(entry, destination).map_err(|_| "LOCAL_ASSET_QUARANTINE_FAILED".to_string())
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

fn sha256_reader_bounded<R: Read>(reader: &mut R) -> Result<(u64, String), String> {
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
        if size > MAX_LOCAL_ASSET_BYTES {
            return Err("LOCAL_ASSET_SIZE_LIMIT".to_string());
        }
        hasher.update(&buffer[..read]);
    }
    Ok((size, hex::encode(hasher.finalize())))
}

fn sha256_file_bounded(path: &Path) -> Result<(u64, String), String> {
    let file = File::open(path).map_err(|_| "LOCAL_ASSET_FILE_MISSING".to_string())?;
    sha256_reader_bounded(&mut BufReader::new(file))
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

fn validate_upload_command(command: &LocalAssetUploadPutCommand) -> Result<reqwest::Url, String> {
    validate_logical_segment(&command.user_scope)?;
    validate_logical_segment(&command.device_id)?;
    validate_logical_segment(&command.local_asset_id)?;
    if command.expected_size > MAX_LOCAL_ASSET_BYTES
        || command.expected_sha256.len() != 64
        || !command
            .expected_sha256
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
        || command.headers.len() > MAX_UPLOAD_HEADERS
    {
        return Err("LOCAL_ASSET_UPLOAD_REQUEST_INVALID".to_string());
    }
    let url = reqwest::Url::parse(&command.upload_url)
        .map_err(|_| "LOCAL_ASSET_UPLOAD_URL_INVALID".to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("LOCAL_ASSET_UPLOAD_URL_INVALID".to_string());
    }
    Ok(url)
}

fn build_upload_headers(command: &LocalAssetUploadPutCommand) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    let mut total_bytes = 0_usize;
    for (name, value) in &command.headers {
        let name = HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| "LOCAL_ASSET_UPLOAD_HEADER_INVALID".to_string())?;
        if name.as_str().len() > MAX_UPLOAD_HEADER_NAME_BYTES
            || value.len() > MAX_UPLOAD_HEADER_VALUE_BYTES
        {
            return Err("LOCAL_ASSET_UPLOAD_HEADER_INVALID".to_string());
        }
        if name == CONTENT_LENGTH {
            continue;
        }
        total_bytes = total_bytes
            .saturating_add(name.as_str().len())
            .saturating_add(value.len());
        if total_bytes > MAX_UPLOAD_HEADER_BYTES {
            return Err("LOCAL_ASSET_UPLOAD_HEADER_INVALID".to_string());
        }
        if name == HOST
            || matches!(
                name.as_str(),
                "connection"
                    | "proxy-connection"
                    | "keep-alive"
                    | "transfer-encoding"
                    | "te"
                    | "trailer"
                    | "upgrade"
            )
        {
            return Err("LOCAL_ASSET_UPLOAD_HEADER_FORBIDDEN".to_string());
        }
        let value = HeaderValue::from_str(value)
            .map_err(|_| "LOCAL_ASSET_UPLOAD_HEADER_INVALID".to_string())?;
        headers.insert(name, value);
    }
    headers.insert(
        CONTENT_LENGTH,
        HeaderValue::from_str(&command.expected_size.to_string())
            .map_err(|_| "LOCAL_ASSET_UPLOAD_REQUEST_INVALID".to_string())?,
    );
    Ok(headers)
}

fn unique_managed_content_path(
    root: &Path,
    user_scope: &str,
    local_asset_id: &str,
) -> Result<PathBuf, String> {
    let asset = existing_asset_dir(root, user_scope, local_asset_id)?
        .ok_or_else(|| "LOCAL_ASSET_FILE_MISSING".to_string())?;
    let mut entries = fs::read_dir(&asset)
        .map_err(|_| "LOCAL_ASSET_FILE_MISSING".to_string())?
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().starts_with("content."));
    let entry = entries
        .next()
        .ok_or_else(|| "LOCAL_ASSET_FILE_MISSING".to_string())?;
    if entries.next().is_some() {
        return Err("LOCAL_ASSET_FILE_AMBIGUOUS".to_string());
    }
    let path = entry.path();
    ensure_contained(root, &path)?;
    let metadata =
        fs::symlink_metadata(&path).map_err(|_| "LOCAL_ASSET_FILE_MISSING".to_string())?;
    if !metadata.file_type().is_file() {
        return Err("LOCAL_ASSET_FILE_INVALID".to_string());
    }
    Ok(path)
}

fn upload_managed_asset(
    root: &Path,
    command: &LocalAssetUploadPutCommand,
) -> Result<LocalAssetUploadPutReceipt, String> {
    let url = validate_upload_command(command)?;
    let headers = build_upload_headers(command)?;
    let scope = existing_asset_scope(root, &command.user_scope)?
        .ok_or_else(|| "LOCAL_ASSET_FILE_MISSING".to_string())?;
    let _lock = acquire_asset_lock(&scope.join(format!(".{}.lock", command.local_asset_id)))?;
    let path = unique_managed_content_path(root, &command.user_scope, &command.local_asset_id)?;
    let file = File::open(&path).map_err(|_| "LOCAL_ASSET_FILE_MISSING".to_string())?;
    let metadata = file
        .metadata()
        .map_err(|_| "LOCAL_ASSET_FILE_MISSING".to_string())?;
    if !metadata.file_type().is_file() {
        return Err("LOCAL_ASSET_FILE_INVALID".to_string());
    }
    if metadata.len() > MAX_LOCAL_ASSET_BYTES {
        return Err("LOCAL_ASSET_SIZE_LIMIT".to_string());
    }
    let mut reader = BufReader::new(file);
    let (size, hash) = sha256_reader(&mut reader)?;
    validate_expected(size, &hash, command.expected_size, &command.expected_sha256)?;
    reader
        .seek(SeekFrom::Start(0))
        .map_err(|_| "LOCAL_ASSET_READ_FAILED".to_string())?;

    let metrics = Arc::new(Mutex::new(UploadMetrics::default()));
    let body = Body::sized(
        HashingReader {
            inner: reader,
            metrics: metrics.clone(),
        },
        command.expected_size,
    );
    let response = Client::builder()
        .timeout(Duration::from_secs(300))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "LOCAL_ASSET_UPLOAD_CLIENT_FAILED".to_string())?
        .put(url)
        .headers(headers)
        .body(body)
        .send()
        .map_err(|error| {
            let read_failed = metrics
                .lock()
                .map(|metrics| metrics.read_failed)
                .unwrap_or(true);
            if read_failed {
                "LOCAL_ASSET_READ_FAILED".to_string()
            } else if error.is_timeout() || error.is_connect() || error.is_body() {
                "LOCAL_ASSET_UPLOAD_RETRYABLE".to_string()
            } else {
                "LOCAL_ASSET_UPLOAD_FAILED".to_string()
            }
        })?;
    let status = response.status().as_u16();
    if response.status().is_redirection() {
        return Err("LOCAL_ASSET_UPLOAD_REDIRECT_REJECTED".to_string());
    }
    if status == 401 || status == 403 {
        return Err("LOCAL_ASSET_UPLOAD_INTENT_EXPIRED".to_string());
    }
    if status == 408 || status == 425 || status == 429 || status >= 500 {
        return Err("LOCAL_ASSET_UPLOAD_RETRYABLE".to_string());
    }
    if !response.status().is_success() {
        return Err(format!("LOCAL_ASSET_UPLOAD_FAILED:{status}"));
    }
    let metrics = metrics
        .lock()
        .map_err(|_| "LOCAL_ASSET_UPLOAD_METRICS_FAILED".to_string())?;
    let payload_sha256 = hex::encode(metrics.hash.clone().finalize());
    if metrics.bytes != command.expected_size
        || !payload_sha256.eq_ignore_ascii_case(&command.expected_sha256)
    {
        return Err("LOCAL_ASSET_UPLOAD_PAYLOAD_MISMATCH".to_string());
    }
    Ok(LocalAssetUploadPutReceipt {
        status,
        bytes_sent: metrics.bytes,
        payload_sha256,
    })
}

fn read_managed_asset(
    root: &Path,
    user_scope: &str,
    device_id: &str,
    local_asset_id: &str,
    expected_size: u64,
    expected_sha256: &str,
) -> Result<LocalAssetReadResult, String> {
    validate_logical_segment(device_id)?;
    validate_logical_segment(local_asset_id)?;
    if expected_size > MAX_LOCAL_ASSET_BYTES {
        return Err("LOCAL_ASSET_SIZE_LIMIT".to_string());
    }
    let scope = existing_asset_scope(root, user_scope)?
        .ok_or_else(|| "LOCAL_ASSET_FILE_MISSING".to_string())?;
    let lock_path = scope.join(format!(".{local_asset_id}.lock"));
    let _lock = acquire_asset_lock(&lock_path)?;
    let path = unique_managed_content_path(root, user_scope, local_asset_id).map_err(|error| {
        if matches!(
            error.as_str(),
            "LOCAL_ASSET_PATH_OUTSIDE_ROOT" | "LOCAL_ASSET_PATH_INVALID"
        ) {
            "LOCAL_ASSET_FILE_INVALID".to_string()
        } else {
            error
        }
    })?;
    let extension = path
        .file_name()
        .and_then(|name| name.to_str())
        .and_then(|name| name.strip_prefix("content."))
        .ok_or_else(|| "LOCAL_ASSET_FILE_INVALID".to_string())?;
    let extension = normalize_extension(extension)?;

    let metadata =
        fs::symlink_metadata(&path).map_err(|_| "LOCAL_ASSET_FILE_MISSING".to_string())?;
    if !metadata.file_type().is_file() {
        return Err("LOCAL_ASSET_FILE_INVALID".to_string());
    }
    if metadata.len() > MAX_LOCAL_ASSET_BYTES {
        return Err("LOCAL_ASSET_SIZE_LIMIT".to_string());
    }
    if metadata.len() != expected_size {
        return Err("LOCAL_ASSET_SIZE_MISMATCH".to_string());
    }
    let (before_size, before_hash) = sha256_file_bounded(&path)?;
    validate_expected(before_size, &before_hash, expected_size, expected_sha256)?;

    let mut file = File::open(&path).map_err(|_| "LOCAL_ASSET_FILE_MISSING".to_string())?;
    if !file
        .metadata()
        .map_err(|_| "LOCAL_ASSET_FILE_MISSING".to_string())?
        .file_type()
        .is_file()
    {
        return Err("LOCAL_ASSET_FILE_INVALID".to_string());
    }
    let reopened_size = file
        .metadata()
        .map_err(|_| "LOCAL_ASSET_READ_FAILED".to_string())?
        .len();
    if reopened_size > MAX_LOCAL_ASSET_BYTES {
        return Err("LOCAL_ASSET_SIZE_LIMIT".to_string());
    }
    if reopened_size != expected_size {
        return Err("LOCAL_ASSET_SIZE_MISMATCH".to_string());
    }
    let receipt = LocalAssetReadReceipt {
        local_asset_id: local_asset_id.to_string(),
        safe_extension: extension,
        size_bytes: expected_size,
        sha256: before_hash.clone(),
    };
    let header =
        serde_json::to_vec(&receipt).map_err(|_| "LOCAL_ASSET_READ_RESPONSE_FAILED".to_string())?;
    let header_len =
        u32::try_from(header.len()).map_err(|_| "LOCAL_ASSET_READ_RESPONSE_FAILED".to_string())?;
    let payload_start = 4_usize
        .checked_add(header.len())
        .ok_or_else(|| "LOCAL_ASSET_READ_RESPONSE_FAILED".to_string())?;
    let payload_len = usize::try_from(expected_size)
        .map_err(|_| "LOCAL_ASSET_READ_RESPONSE_FAILED".to_string())?;
    let frame_len = payload_start
        .checked_add(payload_len)
        .ok_or_else(|| "LOCAL_ASSET_READ_RESPONSE_FAILED".to_string())?;
    let mut frame = vec![0_u8; frame_len];
    frame[..4].copy_from_slice(&header_len.to_be_bytes());
    frame[4..payload_start].copy_from_slice(&header);
    let payload = &mut frame[payload_start..];
    let mut hasher = Sha256::new();
    let mut bytes_read = 0_usize;
    while bytes_read < payload.len() {
        let read = file
            .read(&mut payload[bytes_read..])
            .map_err(|_| "LOCAL_ASSET_READ_FAILED".to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&payload[bytes_read..bytes_read + read]);
        bytes_read += read;
    }
    if bytes_read != payload.len() {
        return Err("LOCAL_ASSET_SIZE_MISMATCH".to_string());
    }
    let mut extra = [0_u8; 1];
    let extra_read = file
        .read(&mut extra)
        .map_err(|_| "LOCAL_ASSET_READ_FAILED".to_string())?;
    if extra_read > 0 {
        return Err(if expected_size == MAX_LOCAL_ASSET_BYTES {
            "LOCAL_ASSET_SIZE_LIMIT".to_string()
        } else {
            "LOCAL_ASSET_SIZE_MISMATCH".to_string()
        });
    }
    let after_size = file
        .metadata()
        .map_err(|_| "LOCAL_ASSET_READ_FAILED".to_string())?
        .len();
    if after_size > MAX_LOCAL_ASSET_BYTES {
        return Err("LOCAL_ASSET_SIZE_LIMIT".to_string());
    }
    let after_hash = hex::encode(hasher.finalize());
    if after_size != bytes_read as u64 {
        return Err("LOCAL_ASSET_SIZE_MISMATCH".to_string());
    }
    validate_expected(after_size, &after_hash, expected_size, expected_sha256)?;
    if before_size != after_size || !before_hash.eq_ignore_ascii_case(&after_hash) {
        return Err("LOCAL_ASSET_CHANGED_DURING_READ".to_string());
    }
    Ok(LocalAssetReadResult { frame })
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

fn import_reader<R: Read>(
    root: &Path,
    user_scope: &str,
    device_id: &str,
    local_asset_id: &str,
    safe_extension: &str,
    expected_size: u64,
    expected_sha256: &str,
    mut reader: R,
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
        if expected_size > MAX_LOCAL_ASSET_BYTES {
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
    let source = File::open(source_path).map_err(|_| "LOCAL_ASSET_SOURCE_MISSING".to_string())?;
    let source_size = source
        .metadata()
        .map_err(|_| "LOCAL_ASSET_SOURCE_MISSING".to_string())?
        .len();
    if source_size > MAX_LOCAL_ASSET_BYTES || expected_size > MAX_LOCAL_ASSET_BYTES {
        return Err("LOCAL_ASSET_SIZE_LIMIT".to_string());
    }
    import_reader(
        root,
        user_scope,
        device_id,
        local_asset_id,
        safe_extension,
        expected_size,
        expected_sha256,
        BufReader::new(source),
    )
}

pub fn import_bytes(
    root: &Path,
    user_scope: &str,
    device_id: &str,
    local_asset_id: &str,
    safe_extension: &str,
    expected_size: u64,
    expected_sha256: &str,
    content: &[u8],
) -> Result<LocalAssetDescriptor, String> {
    if content.len() as u64 > MAX_LOCAL_ASSET_BYTES || expected_size > MAX_LOCAL_ASSET_BYTES {
        return Err("LOCAL_ASSET_SIZE_LIMIT".to_string());
    }
    import_reader(
        root,
        user_scope,
        device_id,
        local_asset_id,
        safe_extension,
        expected_size,
        expected_sha256,
        Cursor::new(content),
    )
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

#[cfg_attr(not(test), allow(dead_code))]
pub fn reconcile_files(
    root: &Path,
    user_scope: &str,
    device_id: &str,
) -> Result<ReconcileReport, String> {
    reconcile_files_with_known(root, user_scope, device_id, None)
}

fn reconcile_files_with_known(
    root: &Path,
    user_scope: &str,
    device_id: &str,
    known_local_asset_ids: Option<&[String]>,
) -> Result<ReconcileReport, String> {
    validate_logical_segment(device_id)?;
    let mut removed = 0_u64;
    let staging_root = root.join(STAGING_DIR);
    let staging_scope_path = staging_root.join(user_scope);
    let staging_scope = match fs::symlink_metadata(&staging_root) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            quarantine_entry(root, user_scope, &staging_root, "staging-root")?;
            removed += 1;
            None
        }
        Ok(_) => match fs::symlink_metadata(&staging_scope_path) {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                quarantine_entry(root, user_scope, &staging_scope_path, "staging-scope")?;
                removed += 1;
                None
            }
            Ok(_) => {
                ensure_contained(root, &staging_scope_path)?;
                Some(staging_scope_path)
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                Some(staging_dir(root, user_scope)?)
            }
            Err(_) => return Err("LOCAL_ASSET_RECONCILE_FAILED".to_string()),
        },
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            Some(staging_dir(root, user_scope)?)
        }
        Err(_) => return Err("LOCAL_ASSET_RECONCILE_FAILED".to_string()),
    };
    if let Some(staging) = staging_scope {
        for entry in
            fs::read_dir(&staging).map_err(|_| "LOCAL_ASSET_RECONCILE_FAILED".to_string())?
        {
            let entry = entry.map_err(|_| "LOCAL_ASSET_RECONCILE_FAILED".to_string())?;
            let path = entry.path();
            if path.is_file() || path.is_dir() || fs::symlink_metadata(&path).is_ok() {
                quarantine_entry(root, user_scope, &path, "staging")?;
                removed += 1;
            }
        }
    }
    let assets_root = root.join(ASSETS_DIR);
    if let Ok(metadata) = fs::symlink_metadata(&assets_root) {
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            quarantine_entry(root, user_scope, &assets_root, "assets-root")?;
            return Ok(ReconcileReport {
                removed_staging_files: removed,
                quarantined_files: vec![ASSETS_DIR.to_string()],
                files: Vec::new(),
            });
        }
    }
    let scope = assets_root.join(user_scope);
    let scope_metadata = match fs::symlink_metadata(&scope) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(ReconcileReport {
                removed_staging_files: removed,
                quarantined_files: Vec::new(),
                files: Vec::new(),
            });
        }
        Err(_) => return Err("LOCAL_ASSET_RECONCILE_FAILED".to_string()),
    };
    if scope_metadata.file_type().is_symlink() || !scope_metadata.is_dir() {
        quarantine_entry(root, user_scope, &scope, "scope-link")?;
        return Ok(ReconcileReport {
            removed_staging_files: removed,
            quarantined_files: vec![user_scope.to_string()],
            files: Vec::new(),
        });
    }
    ensure_contained(root, &scope)?;
    let mut files = Vec::new();
    let mut quarantined_files = Vec::new();
    for asset in fs::read_dir(scope).map_err(|_| "LOCAL_ASSET_RECONCILE_FAILED".to_string())? {
        let asset = asset.map_err(|_| "LOCAL_ASSET_RECONCILE_FAILED".to_string())?;
        let asset_type = asset
            .file_type()
            .map_err(|_| "LOCAL_ASSET_RECONCILE_FAILED".to_string())?;
        if !asset_type.is_dir() {
            let label = asset.file_name().to_string_lossy().to_string();
            quarantine_entry(root, user_scope, &asset.path(), "scope")?;
            quarantined_files.push(label);
            continue;
        }
        let id = asset.file_name().to_string_lossy().to_string();
        validate_logical_segment(&id)?;
        if let Some(known) = known_local_asset_ids {
            if !known.iter().any(|known_id| known_id == &id) {
                quarantine_entry(root, user_scope, &asset.path(), "unknown-asset")?;
                quarantined_files.push(id);
                continue;
            }
        }
        let entries: Vec<_> = fs::read_dir(asset.path())
            .map_err(|_| "LOCAL_ASSET_RECONCILE_FAILED".to_string())?
            .map(|entry| entry.map_err(|_| "LOCAL_ASSET_RECONCILE_FAILED".to_string()))
            .collect::<Result<_, _>>()?;
        let content_entries: Vec<_> = entries
            .iter()
            .filter(|entry| {
                entry
                    .file_type()
                    .map(|kind| kind.is_file())
                    .unwrap_or(false)
            })
            .filter_map(|entry| {
                let name = entry.file_name().to_string_lossy().to_string();
                name.strip_prefix("content.")
                    .and_then(|extension| normalize_extension(extension).ok())
                    .map(|extension| (entry.path(), extension))
            })
            .collect();

        if content_entries.len() != 1 {
            quarantine_entry(root, user_scope, &asset.path(), "asset")?;
            quarantined_files.push(id);
            continue;
        }

        for entry in &entries {
            let is_known = entry.path() == content_entries[0].0;
            if !is_known {
                let label = format!("{id}-{}", entry.file_name().to_string_lossy());
                quarantine_entry(root, user_scope, &entry.path(), "content")?;
                quarantined_files.push(label);
            }
        }
        let (path, extension) = &content_entries[0];
        ensure_contained(root, path)?;
        files.push(descriptor_for(path.clone(), &id, extension.clone())?);
    }
    Ok(ReconcileReport {
        removed_staging_files: removed,
        quarantined_files,
        files,
    })
}

#[tauri::command]
pub async fn import_local_asset(
    command: ImportLocalAssetCommand,
    app: AppHandle,
) -> Result<LocalAssetDescriptor, String> {
    let root = crate::local_database::canonical_app_data_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|_| "LOCAL_ASSET_IMPORT_TASK_JOIN_FAILED".to_string())?
}

#[tauri::command]
pub async fn import_local_asset_bytes(
    command: ImportLocalAssetBytesCommand,
    app: AppHandle,
) -> Result<LocalAssetDescriptor, String> {
    let root = crate::local_database::canonical_app_data_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        import_bytes(
            &root,
            &command.user_scope,
            &command.device_id,
            &command.local_asset_id,
            &command.safe_extension,
            command.expected_size,
            &command.expected_sha256,
            &command.content,
        )
    })
    .await
    .map_err(|_| "LOCAL_ASSET_IMPORT_BYTES_TASK_JOIN_FAILED".to_string())?
}

fn resolve_local_asset_sync(
    root: &Path,
    command: ResolveLocalAssetCommand,
) -> Result<LocalAssetDescriptor, String> {
    let Some(asset) = existing_asset_dir(root, &command.user_scope, &command.local_asset_id)?
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
    ensure_contained(root, &entry.path())?;
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
pub async fn resolve_local_asset(
    command: ResolveLocalAssetCommand,
    app: AppHandle,
) -> Result<LocalAssetDescriptor, String> {
    let root = crate::local_database::canonical_app_data_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || resolve_local_asset_sync(&root, command))
        .await
        .map_err(|_| "LOCAL_ASSET_RESOLVE_TASK_JOIN_FAILED".to_string())?
}

/// Reads a verified managed asset through raw IPC.
///
/// The response is a binary envelope: a 4-byte big-endian JSON receipt length,
/// the small `LocalAssetReadReceipt` JSON object, and the exact file bytes.
/// This deliberately avoids serializing a 50 MiB `Vec<u8>` as JSON and never
/// exposes the managed absolute path to the renderer.
#[tauri::command]
pub async fn read_local_asset_bytes(
    command: ReadLocalAssetCommand,
    app: AppHandle,
) -> Result<Response, String> {
    let root = crate::local_database::canonical_app_data_dir(&app)?;
    let frame = tauri::async_runtime::spawn_blocking(move || {
        read_managed_asset(
            &root,
            &command.user_scope,
            &command.device_id,
            &command.local_asset_id,
            command.expected_size,
            &command.expected_sha256,
        )
        .map(|result| result.frame)
    })
    .await
    .map_err(|_| "LOCAL_ASSET_READ_TASK_JOIN_FAILED".to_string())??;
    Ok(Response::new(frame))
}

#[tauri::command]
pub async fn local_asset_upload_put(
    command: LocalAssetUploadPutCommand,
    app: AppHandle,
) -> Result<LocalAssetUploadPutReceipt, String> {
    let root = crate::local_database::canonical_app_data_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || upload_managed_asset(&root, &command))
        .await
        .map_err(|_| "LOCAL_ASSET_UPLOAD_TASK_JOIN_FAILED".to_string())?
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
        let root_for_resolve = root.clone();
        return tauri::async_runtime::spawn_blocking(move || {
            resolve_local_asset_sync(
                &root_for_resolve,
                ResolveLocalAssetCommand {
                    user_scope: command.user_scope,
                    device_id: command.device_id,
                    local_asset_id: command.local_asset_id,
                    expected_size: Some(command.expected_size),
                    expected_sha256: Some(command.expected_sha256),
                },
            )
        })
        .await
        .map_err(|_| "LOCAL_ASSET_RESOLVE_TASK_JOIN_FAILED".to_string())?;
    }
    fs::rename(&part, &destination).map_err(|_| "LOCAL_ASSET_RENAME_FAILED".to_string())?;
    part_guard.disarm();
    sync_directory(destination.parent().unwrap());
    descriptor_for(destination, &command.local_asset_id, extension)
}

fn delete_local_asset_sync(root: &Path, command: DeleteLocalAssetCommand) -> Result<(), String> {
    validate_logical_segment(&command.device_id)?;
    validate_logical_segment(&command.local_asset_id)?;
    let Some(scope) = existing_asset_scope(root, &command.user_scope)? else {
        return Ok(());
    };
    let _lock = acquire_asset_lock(&scope.join(format!(".{}.lock", command.local_asset_id)))?;
    let Some(asset) = existing_asset_dir(root, &command.user_scope, &command.local_asset_id)?
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
    ensure_contained(root, &entry.path())?;
    fs::remove_file(entry.path()).map_err(|_| "LOCAL_ASSET_DELETE_FAILED".to_string())?;
    let _ = fs::remove_dir(asset);
    Ok(())
}

#[tauri::command]
pub async fn delete_local_asset(
    command: DeleteLocalAssetCommand,
    app: AppHandle,
) -> Result<(), String> {
    let root = crate::local_database::canonical_app_data_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || delete_local_asset_sync(&root, command))
        .await
        .map_err(|_| "LOCAL_ASSET_DELETE_TASK_JOIN_FAILED".to_string())?
}

#[tauri::command]
pub async fn reconcile_local_assets(
    command: ReconcileLocalAssetsCommand,
    app: AppHandle,
) -> Result<ReconcileReport, String> {
    let root = crate::local_database::canonical_app_data_dir(&app)?;
    for local_asset_id in &command.known_local_asset_ids {
        validate_logical_segment(local_asset_id)?;
    }
    tauri::async_runtime::spawn_blocking(move || {
        reconcile_files_with_known(
            &root,
            &command.user_scope,
            &command.device_id,
            Some(&command.known_local_asset_ids),
        )
    })
    .await
    .map_err(|_| "LOCAL_ASSET_RECONCILE_TASK_JOIN_FAILED".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::{self, Write};
    use std::net::TcpListener;
    #[cfg(unix)]
    use std::os::unix::fs::symlink;
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

    fn upload_command(url: String, contents: &[u8]) -> LocalAssetUploadPutCommand {
        LocalAssetUploadPutCommand {
            user_scope: "user-a".to_string(),
            device_id: "device-a".to_string(),
            local_asset_id: "asset-a".to_string(),
            upload_url: url,
            headers: HashMap::from([("content-type".to_string(), "application/pdf".to_string())]),
            expected_size: contents.len() as u64,
            expected_sha256: sha256_bytes(contents),
        }
    }

    fn prepare_managed_asset(root: &TempRoot, contents: &[u8]) {
        import_bytes(
            root.path(),
            "user-a",
            "device-a",
            "asset-a",
            "pdf",
            contents.len() as u64,
            &sha256_bytes(contents),
            contents,
        )
        .unwrap();
    }

    fn serve_once(status: u16) -> (String, thread::JoinHandle<Vec<u8>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = Vec::new();
            let mut buffer = [0_u8; 4096];
            let header_end = loop {
                let read = stream.read(&mut buffer).unwrap();
                assert!(read > 0);
                request.extend_from_slice(&buffer[..read]);
                if let Some(index) = request.windows(4).position(|window| window == b"\r\n\r\n") {
                    break index + 4;
                }
            };
            let headers = String::from_utf8_lossy(&request[..header_end]);
            let content_length = headers
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().unwrap())
                })
                .unwrap_or(0);
            while request.len() - header_end < content_length {
                let read = stream.read(&mut buffer).unwrap();
                assert!(read > 0);
                request.extend_from_slice(&buffer[..read]);
            }
            let reason = if status == 200 {
                "OK"
            } else if status == 307 {
                "Temporary Redirect"
            } else {
                "Bad Request"
            };
            let extra = if status == 307 {
                "Location: http://127.0.0.1:9/should-not-follow\r\n"
            } else {
                ""
            };
            write!(
                stream,
                "HTTP/1.1 {status} {reason}\r\n{extra}Content-Length: 0\r\nConnection: close\r\n\r\n"
            )
            .unwrap();
            request[header_end..header_end + content_length].to_vec()
        });
        (format!("http://{address}/upload?signature=secret"), handle)
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
        assert!(root.path().join("asset-quarantine/user-a").exists());
        assert!(ready.absolute_path.exists());
    }

    #[test]
    fn reconciliation_quarantines_unknown_managed_assets_without_returning_paths() {
        let root = TempRoot::new();
        let input = source_file(root.path(), "source.pdf", b"known");
        let known = import_file(
            root.path(),
            "user-a",
            "device-a",
            "asset-known",
            &input,
            "pdf",
            5,
            &sha256_bytes(b"known"),
        )
        .unwrap();
        let unknown_dir = root.path().join("assets/user-a/asset-unknown");
        fs::create_dir_all(&unknown_dir).unwrap();
        fs::write(unknown_dir.join("content.pdf"), b"unknown").unwrap();

        let known_ids = vec!["asset-known".to_string()];
        let report =
            reconcile_files_with_known(root.path(), "user-a", "device-a", Some(&known_ids))
                .unwrap();

        assert_eq!(report.files.len(), 1);
        assert_eq!(report.files[0].local_asset_id, "asset-known");
        assert!(report
            .quarantined_files
            .iter()
            .any(|id| id == "asset-unknown"));
        assert!(known.absolute_path.exists());
        assert!(!unknown_dir.exists());
        assert!(root.path().join("asset-quarantine/user-a").exists());
        assert!(report
            .files
            .iter()
            .all(|descriptor| !descriptor.local_asset_id.contains("unknown")));
    }

    #[cfg(unix)]
    #[test]
    fn reconciliation_quarantines_scope_symlink_without_following_external_target() {
        let root = TempRoot::new();
        let outside = TempRoot::new();
        let assets = root.path().join("assets");
        fs::create_dir_all(&assets).unwrap();
        fs::create_dir_all(outside.path().join("external")).unwrap();
        symlink(outside.path().join("external"), assets.join("user-a")).unwrap();

        let report =
            reconcile_files_with_known(root.path(), "user-a", "device-a", Some(&Vec::new()))
                .unwrap();

        assert!(report
            .quarantined_files
            .iter()
            .any(|value| value == "user-a"));
        assert!(!assets.join("user-a").exists());
        assert!(root.path().join("asset-quarantine/user-a").exists());
        assert!(outside.path().join("external").exists());
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

    #[test]
    fn bytes_import_rejects_oversized_payload_without_publishing() {
        let root = TempRoot::new();
        let error = import_bytes(
            root.path(),
            "user-a",
            "device-a",
            "too-large",
            "pdf",
            MAX_LOCAL_ASSET_BYTES + 1,
            &sha256_bytes(b"unused"),
            b"small",
        )
        .unwrap_err();
        assert_eq!(error, "LOCAL_ASSET_SIZE_LIMIT");
        assert!(!root
            .path()
            .join("assets/user-a/too-large/content.pdf")
            .exists());
    }

    #[test]
    fn bytes_import_hash_mismatch_cleans_staging_file() {
        let root = TempRoot::new();
        let error = import_bytes(
            root.path(),
            "user-a",
            "device-a",
            "hash-mismatch",
            "pdf",
            5,
            &sha256_bytes(b"world"),
            b"hello",
        )
        .unwrap_err();
        assert_eq!(error, "LOCAL_ASSET_HASH_MISMATCH");
        assert!(!root
            .path()
            .join("assets/user-a/hash-mismatch/content.pdf")
            .exists());
        let staging = root.path().join("asset-staging/user-a");
        assert!(!staging.exists() || fs::read_dir(staging).unwrap().next().is_none());
    }

    #[test]
    fn bytes_import_same_content_is_idempotent() {
        let root = TempRoot::new();
        let hash = sha256_bytes(b"hello");
        let first = import_bytes(
            root.path(),
            "user-a",
            "device-a",
            "asset-a",
            "pdf",
            5,
            &hash,
            b"hello",
        )
        .unwrap();
        let second = import_bytes(
            root.path(),
            "user-a",
            "device-a",
            "asset-a",
            "pdf",
            5,
            &hash,
            b"hello",
        )
        .unwrap();
        assert_eq!(first.absolute_path, second.absolute_path);
        assert_eq!(first.sha256, second.sha256);
        assert_eq!(fs::read(first.absolute_path).unwrap(), b"hello");
    }

    #[test]
    fn bytes_import_conflicting_content_does_not_replace_existing_asset() {
        let root = TempRoot::new();
        let first_hash = sha256_bytes(b"hello");
        import_bytes(
            root.path(),
            "user-a",
            "device-a",
            "asset-a",
            "pdf",
            5,
            &first_hash,
            b"hello",
        )
        .unwrap();
        let error = import_bytes(
            root.path(),
            "user-a",
            "device-a",
            "asset-a",
            "pdf",
            5,
            &sha256_bytes(b"world"),
            b"world",
        )
        .unwrap_err();
        assert_eq!(error, "LOCAL_ASSET_CONFLICT");
        assert_eq!(
            fs::read(root.path().join("assets/user-a/asset-a/content.pdf")).unwrap(),
            b"hello"
        );
    }

    #[test]
    fn bytes_import_publishes_verified_content() {
        let root = TempRoot::new();
        let descriptor = import_bytes(
            root.path(),
            "user-a",
            "device-a",
            "asset-a",
            "pdf",
            5,
            &sha256_bytes(b"hello"),
            b"hello",
        )
        .unwrap();
        assert_eq!(descriptor.size_bytes, 5);
        assert_eq!(descriptor.sha256, sha256_bytes(b"hello"));
        assert_eq!(fs::read(descriptor.absolute_path).unwrap(), b"hello");
    }

    #[test]
    fn managed_asset_upload_streams_verified_content_and_returns_receipt() {
        let root = TempRoot::new();
        let contents = b"streamed managed asset";
        prepare_managed_asset(&root, contents);
        let (url, server) = serve_once(200);
        let receipt = upload_managed_asset(root.path(), &upload_command(url, contents)).unwrap();
        assert_eq!(receipt.status, 200);
        assert_eq!(receipt.bytes_sent, contents.len() as u64);
        assert_eq!(receipt.payload_sha256, sha256_bytes(contents));
        assert_eq!(server.join().unwrap(), contents);
    }

    #[test]
    fn managed_asset_upload_rejects_hash_and_size_mismatch_before_network() {
        let root = TempRoot::new();
        let contents = b"verified";
        prepare_managed_asset(&root, contents);
        let mut command = upload_command("http://127.0.0.1:9/upload".to_string(), contents);
        command.expected_sha256 = sha256_bytes(b"different");
        assert_eq!(
            upload_managed_asset(root.path(), &command).unwrap_err(),
            "LOCAL_ASSET_HASH_MISMATCH"
        );
        command.expected_sha256 = sha256_bytes(contents);
        command.expected_size += 1;
        assert_eq!(
            upload_managed_asset(root.path(), &command).unwrap_err(),
            "LOCAL_ASSET_SIZE_MISMATCH"
        );
    }

    #[test]
    fn managed_asset_upload_rejects_non_http_urls_and_forbidden_headers() {
        let contents = b"verified";
        let mut command = upload_command("file:///tmp/asset".to_string(), contents);
        assert_eq!(
            validate_upload_command(&command).unwrap_err(),
            "LOCAL_ASSET_UPLOAD_URL_INVALID"
        );
        command.upload_url = "https://example.test/upload".to_string();
        command
            .headers
            .insert("Host".to_string(), "attacker.test".to_string());
        assert_eq!(
            build_upload_headers(&command).unwrap_err(),
            "LOCAL_ASSET_UPLOAD_HEADER_FORBIDDEN"
        );
        command.headers.clear();
        command
            .headers
            .insert("Content-Length".to_string(), "1".to_string());
        assert_eq!(
            build_upload_headers(&command)
                .unwrap()
                .get(CONTENT_LENGTH)
                .unwrap(),
            HeaderValue::from_static("8")
        );
        command.headers.clear();
        command
            .headers
            .insert("bad header".to_string(), "x".to_string());
        assert_eq!(
            build_upload_headers(&command).unwrap_err(),
            "LOCAL_ASSET_UPLOAD_HEADER_INVALID"
        );
    }

    #[test]
    fn managed_asset_upload_rejects_redirects_and_non_success_statuses() {
        let root = TempRoot::new();
        let contents = b"verified";
        prepare_managed_asset(&root, contents);
        let (redirect_url, redirect_server) = serve_once(307);
        assert_eq!(
            upload_managed_asset(root.path(), &upload_command(redirect_url, contents)).unwrap_err(),
            "LOCAL_ASSET_UPLOAD_REDIRECT_REJECTED"
        );
        assert_eq!(redirect_server.join().unwrap(), contents);
        let (failed_url, failed_server) = serve_once(400);
        assert_eq!(
            upload_managed_asset(root.path(), &upload_command(failed_url, contents)).unwrap_err(),
            "LOCAL_ASSET_UPLOAD_FAILED:400"
        );
        assert_eq!(failed_server.join().unwrap(), contents);
    }

    #[test]
    fn managed_asset_upload_overrides_caller_content_length_with_expected_size() {
        let root = TempRoot::new();
        let contents = b"verified payload";
        prepare_managed_asset(&root, contents);
        let (url, server) = serve_once(200);
        let mut command = upload_command(url, contents);
        command
            .headers
            .insert("Content-Length".to_string(), "1".to_string());
        let receipt = upload_managed_asset(root.path(), &command).unwrap();
        assert_eq!(receipt.bytes_sent, contents.len() as u64);
        assert_eq!(server.join().unwrap(), contents);
    }

    #[test]
    fn managed_asset_upload_requires_exactly_one_regular_content_file() {
        let missing = TempRoot::new();
        fs::create_dir_all(missing.path().join("assets/user-a")).unwrap();
        let command = upload_command("http://127.0.0.1:9/upload".to_string(), b"verified");
        assert_eq!(
            upload_managed_asset(missing.path(), &command).unwrap_err(),
            "LOCAL_ASSET_FILE_MISSING"
        );

        let ambiguous = TempRoot::new();
        prepare_managed_asset(&ambiguous, b"verified");
        fs::write(
            ambiguous.path().join("assets/user-a/asset-a/content.txt"),
            b"verified",
        )
        .unwrap();
        assert_eq!(
            upload_managed_asset(ambiguous.path(), &command).unwrap_err(),
            "LOCAL_ASSET_FILE_AMBIGUOUS"
        );
    }

    #[test]
    fn managed_asset_upload_and_delete_share_the_same_advisory_lock() {
        let root = TempRoot::new();
        let contents = b"verified";
        prepare_managed_asset(&root, contents);
        let lock = acquire_asset_lock(&root.path().join("assets/user-a/.asset-a.lock")).unwrap();
        let command = upload_command("http://127.0.0.1:9/upload".to_string(), contents);
        assert_eq!(
            upload_managed_asset(root.path(), &command).unwrap_err(),
            "LOCAL_ASSET_BUSY"
        );
        assert_eq!(
            delete_file(root.path(), "user-a", "device-a", "asset-a", "pdf").unwrap_err(),
            "LOCAL_ASSET_BUSY"
        );
        drop(lock);
        delete_file(root.path(), "user-a", "device-a", "asset-a", "pdf").unwrap();
    }

    #[test]
    fn managed_asset_read_returns_verified_bytes_and_path_free_receipt() {
        let root = TempRoot::new();
        let contents = b"offline preview bytes";
        prepare_managed_asset(&root, contents);
        let result = read_managed_asset(
            root.path(),
            "user-a",
            "device-a",
            "asset-a",
            contents.len() as u64,
            &sha256_bytes(contents),
        )
        .unwrap();
        let encoded = result.frame;
        let header_len = u32::from_be_bytes(encoded[..4].try_into().unwrap()) as usize;
        let receipt: LocalAssetReadReceipt =
            serde_json::from_slice(&encoded[4..4 + header_len]).unwrap();
        assert_eq!(receipt.local_asset_id, "asset-a");
        assert_eq!(receipt.size_bytes, contents.len() as u64);
        assert_eq!(receipt.sha256, sha256_bytes(contents));
        let header = String::from_utf8(encoded[4..4 + header_len].to_vec()).unwrap();
        assert!(!header.contains("absolutePath"));
        assert!(!header.contains("absolute_path"));
        assert_eq!(&encoded[4 + header_len..], contents);
    }

    #[test]
    fn managed_asset_read_is_scope_isolated_and_rejects_missing_or_tampered_files() {
        let root = TempRoot::new();
        let contents = b"private offline bytes";
        prepare_managed_asset(&root, contents);
        let hash = sha256_bytes(contents);
        assert_eq!(
            read_managed_asset(
                root.path(),
                "user-b",
                "device-a",
                "asset-a",
                contents.len() as u64,
                &hash,
            )
            .unwrap_err(),
            "LOCAL_ASSET_FILE_MISSING"
        );
        fs::write(
            root.path().join("assets/user-a/asset-a/content.pdf"),
            b"tampered",
        )
        .unwrap();
        assert_eq!(
            read_managed_asset(
                root.path(),
                "user-a",
                "device-a",
                "asset-a",
                contents.len() as u64,
                &hash,
            )
            .unwrap_err(),
            "LOCAL_ASSET_SIZE_MISMATCH"
        );
        assert_eq!(
            read_managed_asset(root.path(), "user-a", "device-a", "asset-a", 8, &hash,)
                .unwrap_err(),
            "LOCAL_ASSET_HASH_MISMATCH"
        );
    }

    #[test]
    fn managed_asset_read_rejects_content_symlink() {
        let root = TempRoot::new();
        let outside = TempRoot::new();
        let contents = b"private offline bytes";
        prepare_managed_asset(&root, contents);
        let path = root.path().join("assets/user-a/asset-a/content.pdf");
        fs::remove_file(&path).unwrap();
        fs::write(outside.path().join("outside.pdf"), contents).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(outside.path().join("outside.pdf"), &path).unwrap();
        #[cfg(windows)]
        if std::os::windows::fs::symlink_file(outside.path().join("outside.pdf"), &path).is_err() {
            return;
        }
        assert_eq!(
            read_managed_asset(
                root.path(),
                "user-a",
                "device-a",
                "asset-a",
                contents.len() as u64,
                &sha256_bytes(contents),
            )
            .unwrap_err(),
            "LOCAL_ASSET_FILE_INVALID"
        );
    }

    #[test]
    fn managed_asset_read_checks_size_hash_and_shared_advisory_lock() {
        let root = TempRoot::new();
        let contents = b"locked offline bytes";
        prepare_managed_asset(&root, contents);
        assert_eq!(
            read_managed_asset(
                root.path(),
                "user-a",
                "device-a",
                "asset-a",
                MAX_LOCAL_ASSET_BYTES + 1,
                &sha256_bytes(contents),
            )
            .unwrap_err(),
            "LOCAL_ASSET_SIZE_LIMIT"
        );
        assert_eq!(
            read_managed_asset(
                root.path(),
                "user-a",
                "device-a",
                "asset-a",
                contents.len() as u64 + 1,
                &sha256_bytes(contents),
            )
            .unwrap_err(),
            "LOCAL_ASSET_SIZE_MISMATCH"
        );
        let lock = acquire_asset_lock(&root.path().join("assets/user-a/.asset-a.lock")).unwrap();
        let source = source_file(root.path(), "replacement.pdf", contents);
        assert_eq!(
            import_file(
                root.path(),
                "user-a",
                "device-a",
                "asset-a",
                &source,
                "pdf",
                contents.len() as u64,
                &sha256_bytes(contents),
            )
            .unwrap_err(),
            "LOCAL_ASSET_BUSY"
        );
        assert_eq!(
            read_managed_asset(
                root.path(),
                "user-a",
                "device-a",
                "asset-a",
                contents.len() as u64,
                &sha256_bytes(contents),
            )
            .unwrap_err(),
            "LOCAL_ASSET_BUSY"
        );
        drop(lock);
        assert!(read_managed_asset(
            root.path(),
            "user-a",
            "device-a",
            "asset-a",
            contents.len() as u64,
            &sha256_bytes(contents),
        )
        .is_ok());
    }

    #[test]
    fn managed_asset_read_rejects_oversized_file_before_hashing_or_allocating_frame() {
        let root = TempRoot::new();
        let asset_dir = root.path().join("assets/user-a/asset-large");
        fs::create_dir_all(&asset_dir).unwrap();
        let path = asset_dir.join("content.pdf");
        let file = File::create(&path).unwrap();
        file.set_len(MAX_LOCAL_ASSET_BYTES + 1).unwrap();
        assert_eq!(
            read_managed_asset(
                root.path(),
                "user-a",
                "device-a",
                "asset-large",
                MAX_LOCAL_ASSET_BYTES,
                &sha256_bytes(b"unused"),
            )
            .unwrap_err(),
            "LOCAL_ASSET_SIZE_LIMIT"
        );
    }

    #[test]
    fn bounded_asset_hash_stops_at_the_limit_without_reading_the_unbounded_tail() {
        struct OversizedReader {
            emitted: u64,
        }
        impl Read for OversizedReader {
            fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
                let remaining = MAX_LOCAL_ASSET_BYTES + 1 - self.emitted;
                let count = remaining.min(output.len() as u64) as usize;
                output[..count].fill(0);
                self.emitted += count as u64;
                Ok(count)
            }
        }

        let mut reader = OversizedReader { emitted: 0 };
        assert_eq!(
            sha256_reader_bounded(&mut reader).unwrap_err(),
            "LOCAL_ASSET_SIZE_LIMIT"
        );
        assert_eq!(reader.emitted, MAX_LOCAL_ASSET_BYTES + 1);
    }

    #[test]
    fn managed_asset_read_command_rejects_paths_and_other_untrusted_fields() {
        let result = serde_json::from_str::<ReadLocalAssetCommand>(
            r#"{"userScope":"user-a","deviceId":"device-a","localAssetId":"asset-a","expectedSize":1,"expectedSha256":"x","relativePath":"C:\\secret"}"#,
        );
        assert!(result.is_err());
    }
}

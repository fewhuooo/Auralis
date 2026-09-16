use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Key, Nonce,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{self, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::Duration,
};

pub const CACHE_ENVELOPE_VERSION: u32 = 1;
pub const CACHE_SCHEMA_VERSION: u32 = 1;
pub const CACHE_CHUNK_BYTES: usize = 4 * 1024 * 1024;
const CACHE_MAGIC: &[u8; 5] = b"AURC1";
const LOCAL_CACHE_MAGIC: &[u8; 5] = b"AURL1";
pub const LOCAL_CACHE_ENVELOPE_VERSION: u32 = 1;
const NONCE_BYTES: usize = 12;
const MAX_HEADER_BYTES: usize = 64 * 1024;
pub const MAX_LOCAL_DERIVED_BYTES: u64 = 512 * 1024 * 1024;
pub const MAX_LOCAL_DERIVED_RATIO: u64 = 200;

static ACTIVE_STAGING_PATHS: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();

fn active_staging_paths() -> &'static Mutex<HashSet<PathBuf>> {
    ACTIVE_STAGING_PATHS.get_or_init(|| Mutex::new(HashSet::new()))
}

pub struct PlaintextStagingLease {
    path: PathBuf,
}

impl PlaintextStagingLease {
    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for PlaintextStagingLease {
    fn drop(&mut self) {
        if let Ok(mut paths) = active_staging_paths().lock() {
            paths.remove(&self.path);
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CacheHeader {
    pub schema_version: u32,
    pub user_id: String,
    pub server_device_id: String,
    pub source_id: String,
    pub job_id: String,
    pub ingestion_revision: String,
    pub parser_version: String,
    #[serde(default)]
    pub payload_format: Option<String>,
    #[serde(default)]
    pub source_asset_sha256: Option<String>,
    #[serde(default)]
    pub parser_id: Option<String>,
    #[serde(default)]
    pub normalization_version: Option<String>,
    #[serde(default)]
    pub ocr_model_version: Option<String>,
    #[serde(default)]
    pub plain_text_sha256: Option<String>,
}

impl CacheHeader {
    fn aad(&self) -> Vec<u8> {
        format!(
            "auralis-cache|{}|{}|{}|{}|{}|{}|{}",
            CACHE_ENVELOPE_VERSION,
            self.schema_version,
            self.user_id,
            self.server_device_id,
            self.source_id,
            self.job_id,
            self.ingestion_revision,
        )
        .into_bytes()
    }

    fn matches_scope(&self, scope: &CacheScope) -> bool {
        self.user_id == scope.user_id
            && self.server_device_id == scope.server_device_id
            && self.source_id == scope.source_id
            && self.job_id == scope.job_id
            && self.ingestion_revision == scope.ingestion_revision
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CacheScope {
    pub user_id: String,
    pub server_device_id: String,
    pub source_id: String,
    pub job_id: String,
    pub ingestion_revision: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalCacheHeader {
    pub schema_version: u32,
    pub user_id: String,
    pub device_id: String,
    pub local_source_id: String,
    pub local_content_revision: String,
    pub source_asset_sha256: String,
    pub parser_id: String,
    pub parser_version: String,
    pub normalization_version: String,
    #[serde(default)]
    pub ocr_model_version: Option<String>,
}

impl LocalCacheHeader {
    fn aad(&self) -> Vec<u8> {
        canonical_aad(
            b"auralis-local-cache",
            &[
                LOCAL_CACHE_ENVELOPE_VERSION.to_le_bytes().as_slice(),
                self.schema_version.to_le_bytes().as_slice(),
                self.user_id.as_bytes(),
                self.device_id.as_bytes(),
                self.local_source_id.as_bytes(),
                self.local_content_revision.as_bytes(),
                self.source_asset_sha256.as_bytes(),
                self.parser_id.as_bytes(),
                self.parser_version.as_bytes(),
                self.normalization_version.as_bytes(),
                self.ocr_model_version
                    .as_deref()
                    .unwrap_or_default()
                    .as_bytes(),
                b"parsed-document-v1",
            ],
        )
    }

    fn matches_scope(&self, scope: &LocalCacheScope) -> bool {
        self.user_id == scope.user_id
            && self.device_id == scope.device_id
            && self.local_source_id == scope.local_source_id
            && self.local_content_revision == scope.local_content_revision
            && self.source_asset_sha256 == scope.source_asset_sha256
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LocalCacheScope {
    pub user_id: String,
    pub device_id: String,
    pub local_source_id: String,
    pub local_content_revision: String,
    pub source_asset_sha256: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CacheReceipt {
    pub cache_id: String,
    pub envelope_version: u32,
    pub chunk_count: u32,
    pub encrypted_bytes: u64,
    pub plain_text_sha256: String,
    pub payload_sha256: String,
    pub payload_bytes: u64,
    #[serde(default)]
    pub payload_format: Option<String>,
    #[serde(default)]
    pub source_asset_sha256: Option<String>,
    #[serde(default)]
    pub parser_id: Option<String>,
    #[serde(default)]
    pub parser_version: Option<String>,
    #[serde(default)]
    pub normalization_version: Option<String>,
    #[serde(default)]
    pub ocr_model_version: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalCacheReceipt {
    pub cache_id: String,
    pub envelope_version: u32,
    pub chunk_count: u32,
    pub encrypted_bytes: u64,
    pub plain_text_sha256: String,
    pub payload_sha256: String,
    pub payload_bytes: u64,
    pub local_source_id: String,
    pub local_content_revision: String,
    pub source_asset_sha256: String,
    pub payload_format: String,
    pub parser_id: String,
    pub parser_version: String,
    pub normalization_version: String,
    #[serde(default)]
    pub ocr_model_version: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CachePayloadInfo {
    pub payload_sha256: String,
    pub payload_bytes: u64,
}

#[derive(Clone)]
pub struct DocumentCacheStore {
    root: PathBuf,
    key: [u8; 32],
}

impl DocumentCacheStore {
    pub fn new(root: impl Into<PathBuf>, key: [u8; 32]) -> Result<Self, String> {
        let root = root.into();
        fs::create_dir_all(&root).map_err(|e| format!("CACHE_ROOT_CREATE_FAILED: {e}"))?;
        let root = fs::canonicalize(&root).map_err(|e| format!("CACHE_ROOT_CREATE_FAILED: {e}"))?;
        cleanup_staging_files(&root, Duration::from_secs(60 * 60))?;
        Ok(Self { root, key })
    }

    pub fn create_plaintext_staging_file(
        &self,
        kind: &str,
        cache_id: &str,
    ) -> Result<(PlaintextStagingLease, File), String> {
        validate_cache_id(cache_id)?;
        if !matches!(kind, "local" | "rebind") {
            return Err("CACHE_STAGING_KIND_INVALID".to_string());
        }
        for _ in 0..8 {
            let mut nonce = [0u8; 16];
            rand::rngs::OsRng.fill_bytes(&mut nonce);
            let path = self.root.join(format!(
                ".document-staging-{kind}-{cache_id}-{}.gzip.tmp",
                hex::encode(nonce)
            ));
            let mut active_paths = active_staging_paths()
                .lock()
                .map_err(|_| "CACHE_STAGING_REGISTRY_LOCK_FAILED".to_string())?;
            match OpenOptions::new().create_new(true).write(true).open(&path) {
                Ok(file) => {
                    active_paths.insert(path.clone());
                    return Ok((PlaintextStagingLease { path }, file));
                }
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(format!("CACHE_STAGING_CREATE_FAILED: {error}")),
            }
        }
        Err("CACHE_STAGING_CREATE_FAILED".to_string())
    }

    #[cfg(test)]
    pub fn cleanup_staging_files_for_test(&self) -> Result<usize, String> {
        cleanup_staging_files(&self.root, Duration::ZERO)
    }

    pub fn cache_path(&self, cache_id: &str) -> Result<PathBuf, String> {
        validate_cache_id(cache_id)?;
        Ok(self.root.join(format!("{cache_id}.cache")))
    }

    pub fn local_cache_path(&self, cache_id: &str) -> Result<PathBuf, String> {
        validate_cache_id(cache_id)?;
        Ok(self.root.join(format!("local-{cache_id}.cache")))
    }

    pub fn encrypt_gzip_file(
        &self,
        cache_id: &str,
        header: &CacheHeader,
        gzip_path: &Path,
        plain_text_sha256: [u8; 32],
    ) -> Result<CacheReceipt, String> {
        let final_path = self.cache_path(cache_id)?;
        if final_path.exists() {
            return Err("CACHE_ALREADY_EXISTS".to_string());
        }
        let temp_path = self.root.join(format!(".{cache_id}.tmp"));
        let receipt = match self.encrypt_to_path(
            cache_id,
            &temp_path,
            header,
            gzip_path,
            plain_text_sha256,
        ) {
            Ok(receipt) => receipt,
            Err(error) => {
                let _ = fs::remove_file(&temp_path);
                return Err(error);
            }
        };
        if let Err(error) = fs::rename(&temp_path, &final_path) {
            let _ = fs::remove_file(&temp_path);
            return Err(format!("CACHE_ATOMIC_RENAME_FAILED: {error}"));
        }
        Ok(receipt)
    }

    pub fn encrypt_gzip_file_unique(
        &self,
        cache_id: &str,
        header: &CacheHeader,
        gzip_path: &Path,
        plain_text_sha256: [u8; 32],
    ) -> Result<CacheReceipt, String> {
        let final_path = self.cache_path(cache_id)?;
        if final_path.exists() {
            return Err("CACHE_ALREADY_EXISTS".to_string());
        }
        for _ in 0..8 {
            let mut nonce = [0u8; 16];
            rand::rngs::OsRng.fill_bytes(&mut nonce);
            let temp_path = self.root.join(format!(
                ".document-encrypted-{cache_id}-{}.tmp",
                hex::encode(nonce)
            ));
            match self.encrypt_to_path(cache_id, &temp_path, header, gzip_path, plain_text_sha256) {
                Ok(receipt) => match fs::rename(&temp_path, &final_path) {
                    Ok(()) => return Ok(receipt),
                    Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                        let _ = fs::remove_file(&temp_path);
                        return Err("CACHE_ALREADY_EXISTS".to_string());
                    }
                    Err(error) => {
                        let _ = fs::remove_file(&temp_path);
                        return Err(format!("CACHE_ATOMIC_RENAME_FAILED: {error}"));
                    }
                },
                Err(error) => {
                    let _ = fs::remove_file(&temp_path);
                    return Err(error);
                }
            }
        }
        Err("CACHE_TEMP_CREATE_FAILED".to_string())
    }

    pub fn encrypt_local_gzip_file(
        &self,
        cache_id: &str,
        header: &LocalCacheHeader,
        gzip_path: &Path,
        plain_text_sha256: [u8; 32],
    ) -> Result<LocalCacheReceipt, String> {
        if header.schema_version != CACHE_SCHEMA_VERSION
            || header.user_id.trim().is_empty()
            || header.device_id.trim().is_empty()
            || header.local_source_id.trim().is_empty()
            || header.local_content_revision.trim().is_empty()
            || !is_lowercase_sha256(&header.source_asset_sha256)
            || header.parser_id.trim().is_empty()
            || header.parser_version.trim().is_empty()
            || header.normalization_version.trim().is_empty()
            || header
                .ocr_model_version
                .as_deref()
                .is_some_and(|value| value.trim().is_empty())
        {
            return Err("LOCAL_CACHE_METADATA_INVALID".to_string());
        }
        let final_path = self.local_cache_path(cache_id)?;
        if final_path.exists() {
            return Err("LOCAL_CACHE_ALREADY_EXISTS".to_string());
        }
        let temp_path = self.root.join(format!(".local-{cache_id}.tmp"));
        let header_bytes = serde_json::to_vec(header)
            .map_err(|e| format!("LOCAL_CACHE_HEADER_SERIALIZE_FAILED: {e}"))?;
        if header_bytes.len() > MAX_HEADER_BYTES {
            return Err("LOCAL_CACHE_HEADER_TOO_LARGE".to_string());
        }
        let result = (|| {
            let mut input =
                File::open(gzip_path).map_err(|e| format!("LOCAL_CACHE_GZIP_OPEN_FAILED: {e}"))?;
            let mut output = OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&temp_path)
                .map_err(|e| format!("LOCAL_CACHE_TEMP_OPEN_FAILED: {e}"))?;
            output
                .write_all(LOCAL_CACHE_MAGIC)
                .and_then(|_| output.write_all(&(header_bytes.len() as u32).to_le_bytes()))
                .and_then(|_| output.write_all(&header_bytes))
                .map_err(|e| format!("LOCAL_CACHE_WRITE_FAILED: {e}"))?;
            let aad = header.aad();
            let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.key));
            let mut buffer = vec![0u8; CACHE_CHUNK_BYTES];
            let mut payload_hash = Sha256::new();
            let mut payload_bytes = 0u64;
            let mut chunk_count = 0u32;
            loop {
                let read = input
                    .read(&mut buffer)
                    .map_err(|e| format!("LOCAL_CACHE_GZIP_READ_FAILED: {e}"))?;
                if read == 0 {
                    break;
                }
                let mut nonce_bytes = [0u8; NONCE_BYTES];
                rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
                let ciphertext = cipher
                    .encrypt(
                        Nonce::from_slice(&nonce_bytes),
                        Payload {
                            msg: &buffer[..read],
                            aad: &aad,
                        },
                    )
                    .map_err(|_| "LOCAL_CACHE_ENCRYPT_FAILED".to_string())?;
                if ciphertext.len() > u32::MAX as usize {
                    return Err("LOCAL_CACHE_CHUNK_TOO_LARGE".to_string());
                }
                payload_bytes = payload_bytes.saturating_add(read as u64);
                if payload_bytes > MAX_LOCAL_DERIVED_BYTES {
                    return Err("LOCAL_CACHE_PAYLOAD_TOO_LARGE".to_string());
                }
                payload_hash.update(&buffer[..read]);
                output
                    .write_all(&nonce_bytes)
                    .and_then(|_| output.write_all(&(ciphertext.len() as u32).to_le_bytes()))
                    .and_then(|_| output.write_all(&ciphertext))
                    .map_err(|e| format!("LOCAL_CACHE_WRITE_FAILED: {e}"))?;
                chunk_count = chunk_count.saturating_add(1);
            }
            output
                .flush()
                .and_then(|_| output.sync_all())
                .map_err(|e| format!("LOCAL_CACHE_SYNC_FAILED: {e}"))?;
            let encrypted_bytes = output
                .metadata()
                .map_err(|e| format!("LOCAL_CACHE_METADATA_FAILED: {e}"))?
                .len();
            Ok(LocalCacheReceipt {
                cache_id: cache_id.to_string(),
                envelope_version: LOCAL_CACHE_ENVELOPE_VERSION,
                chunk_count,
                encrypted_bytes,
                plain_text_sha256: hex::encode(plain_text_sha256),
                payload_sha256: hex::encode(payload_hash.finalize()),
                payload_bytes,
                local_source_id: header.local_source_id.clone(),
                local_content_revision: header.local_content_revision.clone(),
                source_asset_sha256: header.source_asset_sha256.clone(),
                payload_format: "parsed-document-local-v1".to_string(),
                parser_id: header.parser_id.clone(),
                parser_version: header.parser_version.clone(),
                normalization_version: header.normalization_version.clone(),
                ocr_model_version: header.ocr_model_version.clone(),
            })
        })();
        match result {
            Ok(receipt) => {
                fs::rename(&temp_path, &final_path)
                    .map_err(|e| format!("LOCAL_CACHE_ATOMIC_RENAME_FAILED: {e}"))?;
                Ok(receipt)
            }
            Err(error) => {
                let _ = fs::remove_file(&temp_path);
                Err(error)
            }
        }
    }

    fn encrypt_to_path(
        &self,
        cache_id: &str,
        path: &Path,
        header: &CacheHeader,
        gzip_path: &Path,
        plain_text_sha256: [u8; 32],
    ) -> Result<CacheReceipt, String> {
        let header_bytes = serde_json::to_vec(header)
            .map_err(|e| format!("CACHE_HEADER_SERIALIZE_FAILED: {e}"))?;
        if header_bytes.len() > MAX_HEADER_BYTES {
            return Err("CACHE_HEADER_TOO_LARGE".to_string());
        }
        let mut input =
            File::open(gzip_path).map_err(|e| format!("CACHE_GZIP_OPEN_FAILED: {e}"))?;
        let mut output = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(path)
            .map_err(|e| format!("CACHE_TEMP_OPEN_FAILED: {e}"))?;
        let mut payload_hash = Sha256::new();
        let mut payload_bytes = 0u64;
        let mut write_cache_bytes = |bytes: &[u8]| -> Result<(), String> {
            output
                .write_all(bytes)
                .map_err(|e| format!("CACHE_WRITE_FAILED: {e}"))
        };
        write_cache_bytes(CACHE_MAGIC)?;
        write_cache_bytes(&(header_bytes.len() as u32).to_le_bytes())?;
        write_cache_bytes(&header_bytes)?;

        let aad = header.aad();
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.key));
        let mut buffer = vec![0u8; CACHE_CHUNK_BYTES];
        let mut chunk_count = 0u32;
        loop {
            let read = input
                .read(&mut buffer)
                .map_err(|e| format!("CACHE_GZIP_READ_FAILED: {e}"))?;
            if read == 0 {
                break;
            }
            let mut nonce_bytes = [0u8; NONCE_BYTES];
            rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
            let ciphertext = cipher
                .encrypt(
                    Nonce::from_slice(&nonce_bytes),
                    Payload {
                        msg: &buffer[..read],
                        aad: &aad,
                    },
                )
                .map_err(|_| "CACHE_ENCRYPT_FAILED".to_string())?;
            if ciphertext.len() > u32::MAX as usize {
                return Err("CACHE_CHUNK_TOO_LARGE".to_string());
            }
            payload_bytes = payload_bytes.saturating_add(read as u64);
            payload_hash.update(&buffer[..read]);
            write_cache_bytes(&nonce_bytes)?;
            write_cache_bytes(&(ciphertext.len() as u32).to_le_bytes())?;
            write_cache_bytes(&ciphertext)?;
            chunk_count += 1;
        }
        output
            .flush()
            .map_err(|e| format!("CACHE_FLUSH_FAILED: {e}"))?;
        output
            .sync_all()
            .map_err(|e| format!("CACHE_SYNC_FAILED: {e}"))?;
        let encrypted_bytes = output
            .metadata()
            .map_err(|e| format!("CACHE_METADATA_FAILED: {e}"))?
            .len();
        Ok(CacheReceipt {
            cache_id: cache_id.to_string(),
            envelope_version: CACHE_ENVELOPE_VERSION,
            chunk_count,
            encrypted_bytes,
            plain_text_sha256: hex::encode(plain_text_sha256),
            payload_sha256: hex::encode(payload_hash.finalize()),
            payload_bytes,
            payload_format: header.payload_format.clone(),
            source_asset_sha256: header.source_asset_sha256.clone(),
            parser_id: header.parser_id.clone(),
            parser_version: Some(header.parser_version.clone()),
            normalization_version: header.normalization_version.clone(),
            ocr_model_version: header.ocr_model_version.clone(),
        })
    }

    pub fn open_decrypted_reader(
        &self,
        cache_id: &str,
        scope: &CacheScope,
    ) -> Result<DecryptedCacheReader, String> {
        let path = self.cache_path(cache_id)?;
        let mut file = File::open(&path).map_err(|e| format!("CACHE_OPEN_FAILED: {e}"))?;
        let (header, aad) = read_header(&mut file)?;
        if !header.matches_scope(scope) {
            return Err("CACHE_SCOPE_MISMATCH".to_string());
        }
        Ok(DecryptedCacheReader {
            file,
            cipher: Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.key)),
            aad,
            buffer: Vec::new(),
            offset: 0,
            finished: false,
        })
    }

    pub fn open_local_decrypted_reader(
        &self,
        cache_id: &str,
        scope: &LocalCacheScope,
    ) -> Result<DecryptedCacheReader, String> {
        let path = self.local_cache_path(cache_id)?;
        let mut file = File::open(&path).map_err(|e| format!("LOCAL_CACHE_OPEN_FAILED: {e}"))?;
        let (header, aad) = read_local_header(&mut file)?;
        if !header.matches_scope(scope) {
            return Err("LOCAL_CACHE_SCOPE_MISMATCH".to_string());
        }
        Ok(DecryptedCacheReader {
            file,
            cipher: Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.key)),
            aad,
            buffer: Vec::new(),
            offset: 0,
            finished: false,
        })
    }

    pub fn local_header(
        &self,
        cache_id: &str,
        scope: &LocalCacheScope,
    ) -> Result<LocalCacheHeader, String> {
        let path = self.local_cache_path(cache_id)?;
        let mut file = File::open(path).map_err(|e| format!("LOCAL_CACHE_OPEN_FAILED: {e}"))?;
        let (header, _) = read_local_header(&mut file)?;
        if !header.matches_scope(scope) {
            return Err("LOCAL_CACHE_SCOPE_MISMATCH".to_string());
        }
        Ok(header)
    }

    pub fn payload_info(
        &self,
        cache_id: &str,
        scope: &CacheScope,
    ) -> Result<CachePayloadInfo, String> {
        let mut reader = self.open_decrypted_reader(cache_id, scope)?;
        let mut hash = Sha256::new();
        let mut payload_bytes = 0u64;
        let mut buffer = [0u8; 64 * 1024];
        loop {
            let count = reader
                .read(&mut buffer)
                .map_err(|error| format!("CACHE_PAYLOAD_READ_FAILED: {error}"))?;
            if count == 0 {
                break;
            }
            payload_bytes = payload_bytes.saturating_add(count as u64);
            hash.update(&buffer[..count]);
        }
        Ok(CachePayloadInfo {
            payload_sha256: hex::encode(hash.finalize()),
            payload_bytes,
        })
    }

    pub fn local_payload_info(
        &self,
        cache_id: &str,
        scope: &LocalCacheScope,
    ) -> Result<CachePayloadInfo, String> {
        let mut reader = self.open_local_decrypted_reader(cache_id, scope)?;
        let mut hash = Sha256::new();
        let mut payload_bytes = 0u64;
        let mut buffer = [0u8; 64 * 1024];
        loop {
            let count = reader
                .read(&mut buffer)
                .map_err(|error| format!("LOCAL_CACHE_PAYLOAD_READ_FAILED: {error}"))?;
            if count == 0 {
                break;
            }
            payload_bytes = payload_bytes.saturating_add(count as u64);
            hash.update(&buffer[..count]);
        }
        Ok(CachePayloadInfo {
            payload_sha256: hex::encode(hash.finalize()),
            payload_bytes,
        })
    }

    pub fn existing_receipt(
        &self,
        cache_id: &str,
        scope: &CacheScope,
    ) -> Result<CacheReceipt, String> {
        let path = self.cache_path(cache_id)?;
        let mut file = File::open(&path).map_err(|e| format!("CACHE_OPEN_FAILED: {e}"))?;
        let (header, _) = read_header(&mut file)?;
        if !header.matches_scope(scope) {
            return Err("CACHE_SCOPE_MISMATCH".to_string());
        }
        let plain_text_sha256 = header
            .plain_text_sha256
            .clone()
            .filter(|value| is_lowercase_sha256(value))
            .ok_or_else(|| "CACHE_RECEIPT_UNAVAILABLE".to_string())?;
        let mut chunk_count = 0u32;
        loop {
            let mut nonce = [0u8; NONCE_BYTES];
            match file.read_exact(&mut nonce) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => break,
                Err(error) => return Err(format!("CACHE_RECEIPT_READ_FAILED: {error}")),
            }
            let mut length = [0u8; 4];
            file.read_exact(&mut length)
                .map_err(|e| format!("CACHE_RECEIPT_READ_FAILED: {e}"))?;
            let length = u32::from_le_bytes(length) as u64;
            if length < 16 || length > (CACHE_CHUNK_BYTES + 16) as u64 {
                return Err("CACHE_CHUNK_LENGTH_INVALID".to_string());
            }
            file.seek(SeekFrom::Current(length as i64))
                .map_err(|e| format!("CACHE_RECEIPT_READ_FAILED: {e}"))?;
            chunk_count = chunk_count.saturating_add(1);
        }
        let info = self.payload_info(cache_id, scope)?;
        Ok(CacheReceipt {
            cache_id: cache_id.to_string(),
            envelope_version: CACHE_ENVELOPE_VERSION,
            chunk_count,
            encrypted_bytes: fs::metadata(path)
                .map_err(|e| format!("CACHE_METADATA_FAILED: {e}"))?
                .len(),
            plain_text_sha256,
            payload_sha256: info.payload_sha256,
            payload_bytes: info.payload_bytes,
            payload_format: header.payload_format,
            source_asset_sha256: header.source_asset_sha256,
            parser_id: header.parser_id,
            parser_version: Some(header.parser_version),
            normalization_version: header.normalization_version,
            ocr_model_version: header.ocr_model_version,
        })
    }

    pub fn delete(&self, cache_id: &str) -> Result<bool, String> {
        let path = self.cache_path(cache_id)?;
        match fs::remove_file(path) {
            Ok(()) => Ok(true),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(format!("CACHE_DELETE_FAILED: {error}")),
        }
    }
}

pub struct DecryptedCacheReader {
    file: File,
    cipher: Aes256Gcm,
    aad: Vec<u8>,
    buffer: Vec<u8>,
    offset: usize,
    finished: bool,
}

impl Read for DecryptedCacheReader {
    fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
        if output.is_empty() {
            return Ok(0);
        }
        let mut written = 0;
        while written < output.len() {
            if self.offset < self.buffer.len() {
                let count = (self.buffer.len() - self.offset).min(output.len() - written);
                output[written..written + count]
                    .copy_from_slice(&self.buffer[self.offset..self.offset + count]);
                self.offset += count;
                written += count;
                continue;
            }
            if self.finished {
                break;
            }
            self.load_next_chunk()?;
        }
        Ok(written)
    }
}

impl DecryptedCacheReader {
    fn load_next_chunk(&mut self) -> io::Result<()> {
        let mut nonce_bytes = [0u8; NONCE_BYTES];
        match self.file.read_exact(&mut nonce_bytes) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => {
                self.finished = true;
                return Ok(());
            }
            Err(error) => return Err(error),
        }
        let mut length_bytes = [0u8; 4];
        self.file.read_exact(&mut length_bytes)?;
        let length = u32::from_le_bytes(length_bytes) as usize;
        if length < 16 || length > CACHE_CHUNK_BYTES + 16 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "CACHE_CHUNK_LENGTH_INVALID",
            ));
        }
        let mut ciphertext = vec![0u8; length];
        self.file.read_exact(&mut ciphertext)?;
        self.buffer = self
            .cipher
            .decrypt(
                Nonce::from_slice(&nonce_bytes),
                Payload {
                    msg: &ciphertext,
                    aad: &self.aad,
                },
            )
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "CACHE_TAMPERED"))?;
        self.offset = 0;
        Ok(())
    }
}

fn validate_cache_id(cache_id: &str) -> Result<(), String> {
    if cache_id.is_empty()
        || cache_id.len() > 128
        || !cache_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("CACHE_ID_INVALID".to_string());
    }
    Ok(())
}

fn canonical_aad(domain: &[u8], fields: &[&[u8]]) -> Vec<u8> {
    let mut output = Vec::with_capacity(
        domain.len() + fields.iter().map(|field| field.len() + 8).sum::<usize>() + 8,
    );
    write_length_prefixed(&mut output, domain);
    for field in fields {
        write_length_prefixed(&mut output, field);
    }
    output
}

fn write_length_prefixed(output: &mut Vec<u8>, value: &[u8]) {
    output.extend_from_slice(&(value.len() as u64).to_le_bytes());
    output.extend_from_slice(value);
}

fn cleanup_staging_files(root: &Path, stale_after: Duration) -> Result<usize, String> {
    let active_paths = active_staging_paths()
        .lock()
        .map_err(|_| "CACHE_STAGING_REGISTRY_LOCK_FAILED".to_string())?;
    let entries = fs::read_dir(root).map_err(|e| format!("CACHE_STAGING_SCAN_FAILED: {e}"))?;
    let mut removed = 0usize;
    for entry in entries {
        let entry = entry.map_err(|e| format!("CACHE_STAGING_SCAN_FAILED: {e}"))?;
        let file_name = entry.file_name();
        let Some(file_name) = file_name.to_str() else {
            continue;
        };
        if !(file_name.starts_with(".document-staging-local-")
            || file_name.starts_with(".document-staging-rebind-"))
            || !file_name.ends_with(".gzip.tmp")
        {
            continue;
        }
        let metadata = entry
            .metadata()
            .map_err(|e| format!("CACHE_STAGING_SCAN_FAILED: {e}"))?;
        if !metadata.is_file() {
            continue;
        }
        if active_paths.contains(&entry.path()) {
            continue;
        }
        let stale = metadata
            .modified()
            .ok()
            .and_then(|modified| modified.elapsed().ok())
            .is_some_and(|age| age >= stale_after);
        if stale {
            fs::remove_file(entry.path())
                .map_err(|e| format!("CACHE_STAGING_CLEANUP_FAILED: {e}"))?;
            removed = removed.saturating_add(1);
        }
    }
    Ok(removed)
}

pub(crate) fn is_lowercase_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn read_header(file: &mut File) -> Result<(CacheHeader, Vec<u8>), String> {
    let mut magic = [0u8; 5];
    file.read_exact(&mut magic)
        .map_err(|e| format!("CACHE_HEADER_READ_FAILED: {e}"))?;
    if &magic != CACHE_MAGIC {
        return Err("CACHE_MAGIC_INVALID".to_string());
    }
    let mut length_bytes = [0u8; 4];
    file.read_exact(&mut length_bytes)
        .map_err(|e| format!("CACHE_HEADER_READ_FAILED: {e}"))?;
    let length = u32::from_le_bytes(length_bytes) as usize;
    if length == 0 || length > MAX_HEADER_BYTES {
        return Err("CACHE_HEADER_LENGTH_INVALID".to_string());
    }
    let mut bytes = vec![0u8; length];
    file.read_exact(&mut bytes)
        .map_err(|e| format!("CACHE_HEADER_READ_FAILED: {e}"))?;
    let header: CacheHeader =
        serde_json::from_slice(&bytes).map_err(|e| format!("CACHE_HEADER_INVALID: {e}"))?;
    if header.schema_version != CACHE_SCHEMA_VERSION {
        return Err("CACHE_SCHEMA_VERSION_UNSUPPORTED".to_string());
    }
    Ok((header.clone(), header.aad()))
}

fn read_local_header(file: &mut File) -> Result<(LocalCacheHeader, Vec<u8>), String> {
    let mut magic = [0u8; 5];
    file.read_exact(&mut magic)
        .map_err(|e| format!("LOCAL_CACHE_HEADER_READ_FAILED: {e}"))?;
    if &magic != LOCAL_CACHE_MAGIC {
        return Err("LOCAL_CACHE_MAGIC_INVALID".to_string());
    }
    let mut length_bytes = [0u8; 4];
    file.read_exact(&mut length_bytes)
        .map_err(|e| format!("LOCAL_CACHE_HEADER_READ_FAILED: {e}"))?;
    let length = u32::from_le_bytes(length_bytes) as usize;
    if length == 0 || length > MAX_HEADER_BYTES {
        return Err("LOCAL_CACHE_HEADER_LENGTH_INVALID".to_string());
    }
    let mut bytes = vec![0u8; length];
    file.read_exact(&mut bytes)
        .map_err(|e| format!("LOCAL_CACHE_HEADER_READ_FAILED: {e}"))?;
    let header: LocalCacheHeader =
        serde_json::from_slice(&bytes).map_err(|e| format!("LOCAL_CACHE_HEADER_INVALID: {e}"))?;
    if header.schema_version != CACHE_SCHEMA_VERSION {
        return Err("LOCAL_CACHE_SCHEMA_VERSION_UNSUPPORTED".to_string());
    }
    Ok((header.clone(), header.aad()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::{read::GzDecoder, write::GzEncoder, Compression};
    use rand::{RngCore, SeedableRng};
    use std::io::{Read, Write};

    fn temp_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("auralis-{name}-{}", rand::random::<u64>()));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn gzip_file(root: &Path, text: &[u8]) -> PathBuf {
        let path = root.join("payload.gz");
        let file = File::create(&path).unwrap();
        let mut encoder = GzEncoder::new(file, Compression::default());
        encoder.write_all(text).unwrap();
        encoder.finish().unwrap();
        path
    }

    fn header() -> CacheHeader {
        CacheHeader {
            schema_version: CACHE_SCHEMA_VERSION,
            user_id: "user-a".to_string(),
            server_device_id: "device-1".to_string(),
            source_id: "source-1".to_string(),
            job_id: "job-1".to_string(),
            ingestion_revision: "revision-4".to_string(),
            parser_version: "parser-v1".to_string(),
            payload_format: None,
            source_asset_sha256: None,
            parser_id: None,
            normalization_version: None,
            ocr_model_version: None,
            plain_text_sha256: None,
        }
    }

    fn scope() -> CacheScope {
        CacheScope {
            user_id: "user-a".to_string(),
            server_device_id: "device-1".to_string(),
            source_id: "source-1".to_string(),
            job_id: "job-1".to_string(),
            ingestion_revision: "revision-4".to_string(),
        }
    }

    #[test]
    fn local_derived_cache_round_trips_with_a_separate_scope() {
        let root = temp_root("local-cache-round-trip");
        let gzip = gzip_file(&root, b"local derived payload");
        let store = DocumentCacheStore::new(root.join("cache"), [4u8; 32]).unwrap();
        let header = LocalCacheHeader {
            schema_version: CACHE_SCHEMA_VERSION,
            user_id: "user-a".to_string(),
            device_id: "device-1".to_string(),
            local_source_id: "local-source-1".to_string(),
            local_content_revision: "local-rev-1".to_string(),
            source_asset_sha256: "a".repeat(64),
            parser_id: "parser".to_string(),
            parser_version: "parser-v1".to_string(),
            normalization_version: "normalization-v1".to_string(),
            ocr_model_version: None,
        };
        let receipt = store
            .encrypt_local_gzip_file("local-cache-1", &header, &gzip, [9u8; 32])
            .unwrap();
        assert_eq!(receipt.local_content_revision, "local-rev-1");
        let mut reader = store
            .open_local_decrypted_reader(
                "local-cache-1",
                &LocalCacheScope {
                    user_id: "user-a".to_string(),
                    device_id: "device-1".to_string(),
                    local_source_id: "local-source-1".to_string(),
                    local_content_revision: "local-rev-1".to_string(),
                    source_asset_sha256: "a".repeat(64),
                },
            )
            .unwrap();
        let mut payload = Vec::new();
        reader.read_to_end(&mut payload).unwrap();
        let mut decoded = Vec::new();
        GzDecoder::new(payload.as_slice())
            .read_to_end(&mut decoded)
            .unwrap();
        assert_eq!(decoded, b"local derived payload");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn local_aad_uses_unambiguous_length_prefixed_fields() {
        let mut first = LocalCacheHeader {
            schema_version: CACHE_SCHEMA_VERSION,
            user_id: "ab".to_string(),
            device_id: "c".to_string(),
            local_source_id: "source".to_string(),
            local_content_revision: "revision".to_string(),
            source_asset_sha256: "a".repeat(64),
            parser_id: "parser".to_string(),
            parser_version: "v1".to_string(),
            normalization_version: "n1".to_string(),
            ocr_model_version: None,
        };
        let mut second = first.clone();
        second.user_id = "a".to_string();
        second.device_id = "bc".to_string();
        assert_ne!(first.aad(), second.aad());
        first.local_content_revision = "revision-a".to_string();
        second.local_content_revision = "revision".to_string();
        assert_ne!(first.aad(), second.aad());
    }

    #[test]
    fn staging_cleanup_only_removes_owned_plaintext_staging_files() {
        let root = temp_root("staging-cleanup");
        let store = DocumentCacheStore::new(root.join("cache"), [6u8; 32]).unwrap();
        let (staging_lease, file) = store
            .create_plaintext_staging_file("local", "cache-1")
            .unwrap();
        let staging_path = staging_lease.path().to_path_buf();
        drop(file);
        let formal_cache = store.cache_path("cache-1").unwrap();
        fs::write(&formal_cache, b"must stay").unwrap();
        let unrelated = store.local_cache_path("unrelated").unwrap();
        fs::write(&unrelated, b"must stay").unwrap();
        assert_eq!(store.cleanup_staging_files_for_test().unwrap(), 0);
        assert!(staging_path.exists());
        drop(staging_lease);
        assert_eq!(store.cleanup_staging_files_for_test().unwrap(), 1);
        assert!(!staging_path.exists());
        assert!(formal_cache.exists());
        assert!(unrelated.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn cache_round_trips_with_scope_and_separate_hashes() {
        let root = temp_root("cache-round-trip");
        let gzip = gzip_file(&root, b"plain text that must not be stored in clear");
        let store = DocumentCacheStore::new(root.join("cache"), [7u8; 32]).unwrap();
        let receipt = store
            .encrypt_gzip_file("cache-1", &header(), &gzip, [9u8; 32])
            .unwrap();
        assert_eq!(receipt.envelope_version, 1);
        assert_ne!(receipt.plain_text_sha256, receipt.payload_sha256);
        let stored_bytes = fs::read(store.cache_path("cache-1").unwrap()).unwrap();
        assert!(!stored_bytes
            .windows(b"plain text".len())
            .any(|window| window == b"plain text"));
        let mut reader = store.open_decrypted_reader("cache-1", &scope()).unwrap();
        let mut encrypted_gzip = Vec::new();
        reader.read_to_end(&mut encrypted_gzip).unwrap();
        assert!(!encrypted_gzip.is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn receipt_upload_payload_matches_decrypted_reader_size_and_hash() {
        let root = temp_root("cache-upload-payload");
        let gzip = gzip_file(&root, b"small upload payload");
        let store = DocumentCacheStore::new(root.join("cache"), [7u8; 32]).unwrap();
        let receipt = store
            .encrypt_gzip_file("cache-1", &header(), &gzip, [9u8; 32])
            .unwrap();
        let mut reader = store.open_decrypted_reader("cache-1", &scope()).unwrap();
        let mut decrypted_payload = Vec::new();
        reader.read_to_end(&mut decrypted_payload).unwrap();

        assert_eq!(receipt.payload_bytes, decrypted_payload.len() as u64);
        assert_eq!(
            receipt.payload_sha256,
            hex::encode(Sha256::digest(&decrypted_payload))
        );
        assert_eq!(
            store.payload_info("cache-1", &scope()).unwrap(),
            CachePayloadInfo {
                payload_sha256: receipt.payload_sha256.clone(),
                payload_bytes: receipt.payload_bytes,
            }
        );
        assert!(receipt.encrypted_bytes > receipt.payload_bytes);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn cache_rejects_tamper_and_cross_user_access() {
        let root = temp_root("cache-tamper");
        let gzip = gzip_file(&root, b"payload");
        let store = DocumentCacheStore::new(root.join("cache"), [3u8; 32]).unwrap();
        store
            .encrypt_gzip_file("cache-1", &header(), &gzip, [1u8; 32])
            .unwrap();
        let foreign = CacheScope {
            user_id: "user-b".to_string(),
            ..scope()
        };
        assert!(matches!(
            store.open_decrypted_reader("cache-1", &foreign),
            Err(error) if error == "CACHE_SCOPE_MISMATCH"
        ));
        let path = store.cache_path("cache-1").unwrap();
        let mut bytes = fs::read(&path).unwrap();
        *bytes.last_mut().unwrap() ^= 0x55;
        fs::write(path, bytes).unwrap();
        let mut reader = store.open_decrypted_reader("cache-1", &scope()).unwrap();
        let mut output = Vec::new();
        assert!(reader.read_to_end(&mut output).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn cache_chunks_have_unique_nonces_and_publish_atomically() {
        let root = temp_root("cache-nonce");
        let mut payload = vec![0u8; CACHE_CHUNK_BYTES + 100];
        rand::rngs::StdRng::seed_from_u64(42).fill_bytes(&mut payload);
        let gzip = gzip_file(&root, &payload);
        let store = DocumentCacheStore::new(root.join("cache"), [5u8; 32]).unwrap();
        let receipt = store
            .encrypt_gzip_file("cache-1", &header(), &gzip, [2u8; 32])
            .unwrap();
        assert!(receipt.chunk_count >= 2);
        let bytes = fs::read(store.cache_path("cache-1").unwrap()).unwrap();
        let header_len = u32::from_le_bytes(bytes[5..9].try_into().unwrap()) as usize;
        let mut cursor = 9 + header_len;
        let mut nonces = Vec::new();
        for _ in 0..receipt.chunk_count {
            nonces.push(bytes[cursor..cursor + NONCE_BYTES].to_vec());
            cursor += NONCE_BYTES;
            let length = u32::from_le_bytes(bytes[cursor..cursor + 4].try_into().unwrap()) as usize;
            cursor += 4 + length;
        }
        assert_ne!(nonces[0], nonces[1]);
        assert!(!root.join("cache").join(".cache-1.tmp").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn legacy_headers_and_receipts_deserialize_without_v1_compatibility() {
        let legacy_header = r#"{"schemaVersion":1,"userId":"u","serverDeviceId":"d","sourceId":"s","jobId":"j","ingestionRevision":"r","parserVersion":"legacy"}"#;
        let header: CacheHeader = serde_json::from_str(legacy_header).unwrap();
        assert!(header.payload_format.is_none());
        let legacy_receipt = r#"{"cacheId":"c","envelopeVersion":1,"chunkCount":1,"encryptedBytes":42,"plainTextSha256":"00","payloadSha256":"11","payloadBytes":10}"#;
        let receipt: CacheReceipt = serde_json::from_str(legacy_receipt).unwrap();
        assert!(receipt.payload_format.is_none());
    }
}

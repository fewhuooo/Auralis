use crate::crypto;
use crate::document_cache::{CacheHeader, CacheReceipt, CacheScope, DecryptedCacheReader, DocumentCacheStore, CACHE_SCHEMA_VERSION};
use flate2::{write::GzEncoder, Compression};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs::{self, File},
    io::Write,
    path::PathBuf,
    sync::Mutex,
};
use tauri::State;

const MAX_BLOCK_CHARS: usize = 100_000;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageHeader {
    pub schema_version: u32,
    pub user_id: String,
    pub device_id: String,
    pub source_id: String,
    pub job_id: String,
    pub ingestion_revision: String,
    pub parser_version: String,
}

impl PackageHeader {
    fn into_cache_header(self) -> CacheHeader {
        CacheHeader {
            schema_version: self.schema_version,
            user_id: self.user_id,
            device_id: self.device_id,
            source_id: self.source_id,
            job_id: self.job_id,
            ingestion_revision: self.ingestion_revision,
            parser_version: self.parser_version,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedDocumentBlock {
    pub ordinal: u64,
    pub kind: String,
    pub text: String,
    pub page_number: Option<u32>,
    pub anchor_index: Option<u64>,
    pub start_line: Option<u32>,
}

struct PackageBuilder {
    cache_id: String,
    store: DocumentCacheStore,
    header: CacheHeader,
    temp_path: PathBuf,
    encoder: Option<GzEncoder<File>>,
    plain_text_hash: Sha256,
    next_ordinal: u64,
}

impl PackageBuilder {
    fn begin(store: DocumentCacheStore, cache_id: String, header: PackageHeader) -> Result<Self, String> {
        if header.schema_version != CACHE_SCHEMA_VERSION {
            return Err("DOCUMENT_PACKAGE_SCHEMA_UNSUPPORTED".to_string());
        }
        if header.user_id.trim().is_empty()
            || header.device_id.trim().is_empty()
            || header.source_id.trim().is_empty()
            || header.job_id.trim().is_empty()
            || header.ingestion_revision.trim().is_empty()
        {
            return Err("DOCUMENT_PACKAGE_HEADER_INVALID".to_string());
        }
        let final_path = store.cache_path(&cache_id)?;
        let temp_path = final_path.with_extension("gzip.tmp");
        let file = File::create(&temp_path).map_err(|e| format!("DOCUMENT_PACKAGE_TEMP_FAILED: {e}"))?;
        Ok(Self {
            cache_id,
            store,
            header: header.into_cache_header(),
            temp_path,
            encoder: Some(GzEncoder::new(file, Compression::default())),
            plain_text_hash: Sha256::new(),
            next_ordinal: 0,
        })
    }

    fn append(&mut self, block: ParsedDocumentBlock) -> Result<(), String> {
        if block.ordinal != self.next_ordinal {
            return Err("DOCUMENT_PACKAGE_ORDINAL_INVALID".to_string());
        }
        if block.text.trim().is_empty() {
            return Err("DOCUMENT_PACKAGE_EMPTY_BLOCK".to_string());
        }
        if block.text.chars().count() > MAX_BLOCK_CHARS {
            return Err("DOCUMENT_PACKAGE_BLOCK_TOO_LARGE".to_string());
        }
        let json = serde_json::to_vec(&block).map_err(|e| format!("DOCUMENT_PACKAGE_BLOCK_SERIALIZE_FAILED: {e}"))?;
        let encoder = self.encoder.as_mut().ok_or_else(|| "DOCUMENT_PACKAGE_FINISHED".to_string())?;
        encoder.write_all(&json).map_err(|e| format!("DOCUMENT_PACKAGE_WRITE_FAILED: {e}"))?;
        encoder.write_all(b"\n").map_err(|e| format!("DOCUMENT_PACKAGE_WRITE_FAILED: {e}"))?;
        self.plain_text_hash.update(block.text.as_bytes());
        self.plain_text_hash.update(b"\n");
        self.next_ordinal += 1;
        Ok(())
    }

    fn finish(mut self) -> Result<CacheReceipt, String> {
        let encoder = self.encoder.take().ok_or_else(|| "DOCUMENT_PACKAGE_FINISHED".to_string())?;
        encoder.finish().map_err(|e| format!("DOCUMENT_PACKAGE_GZIP_FAILED: {e}"))?;
        let plain_hash: [u8; 32] = std::mem::replace(&mut self.plain_text_hash, Sha256::new()).finalize().into();
        let receipt = self.store.encrypt_gzip_file(&self.cache_id, &self.header, &self.temp_path, plain_hash)?;
        fs::remove_file(&self.temp_path).map_err(|e| format!("DOCUMENT_PACKAGE_TEMP_CLEANUP_FAILED: {e}"))?;
        Ok(receipt)
    }
}

impl Drop for PackageBuilder {
    fn drop(&mut self) {
        let _ = self.encoder.take();
        let _ = fs::remove_file(&self.temp_path);
    }
}

pub struct DocumentPackagerState {
    root: PathBuf,
    packages: Mutex<HashMap<String, PackageBuilder>>,
}

impl DocumentPackagerState {
    pub fn new(root: PathBuf) -> Self {
        Self { root, packages: Mutex::new(HashMap::new()) }
    }

    fn store(&self) -> Result<DocumentCacheStore, String> {
        let key = crypto::get_master_key_bytes()?
            .try_into()
            .map_err(|_| "MASTER_KEY_INVALID_LENGTH".to_string())?;
        DocumentCacheStore::new(self.root.clone(), key)
    }

    pub fn open_decrypted_reader(&self, cache_id: &str, scope: &CacheScope) -> Result<DecryptedCacheReader, String> {
        self.store()?.open_decrypted_reader(cache_id, scope)
    }
}

fn next_package_id() -> String {
    format!("pkg-{}", uuid_like())
}

fn uuid_like() -> String {
    let mut bytes = [0u8; 16];
    rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut bytes);
    hex::encode(bytes)
}

#[tauri::command]
pub fn document_package_begin(
    header: PackageHeader,
    state: State<'_, DocumentPackagerState>,
) -> Result<String, String> {
    let package_id = next_package_id();
    let builder = PackageBuilder::begin(state.store()?, package_id.clone(), header)?;
    state.packages.lock().map_err(|_| "DOCUMENT_PACKAGE_LOCK_FAILED".to_string())?.insert(package_id.clone(), builder);
    Ok(package_id)
}

#[tauri::command]
pub fn document_package_append(
    package_id: String,
    block: ParsedDocumentBlock,
    state: State<'_, DocumentPackagerState>,
) -> Result<(), String> {
    let mut packages = state.packages.lock().map_err(|_| "DOCUMENT_PACKAGE_LOCK_FAILED".to_string())?;
    let builder = packages.get_mut(&package_id).ok_or_else(|| "DOCUMENT_PACKAGE_NOT_FOUND".to_string())?;
    builder.append(block)
}

#[tauri::command]
pub fn document_package_finish(
    package_id: String,
    state: State<'_, DocumentPackagerState>,
) -> Result<CacheReceipt, String> {
    let builder = state.packages.lock().map_err(|_| "DOCUMENT_PACKAGE_LOCK_FAILED".to_string())?.remove(&package_id)
        .ok_or_else(|| "DOCUMENT_PACKAGE_NOT_FOUND".to_string())?;
    builder.finish()
}

#[tauri::command]
pub fn document_cache_delete(
    cache_id: String,
    state: State<'_, DocumentPackagerState>,
) -> Result<bool, String> {
    state.store()?.delete(&cache_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document_cache::{CacheScope, DecryptedCacheReader};
    use flate2::read::GzDecoder;
    use std::io::Read;

    fn temp_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!("auralis-packager-{}", rand::random::<u64>()));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn header() -> PackageHeader {
        PackageHeader {
            schema_version: CACHE_SCHEMA_VERSION,
            user_id: "user-a".to_string(),
            device_id: "device-1".to_string(),
            source_id: "source-1".to_string(),
            job_id: "job-1".to_string(),
            ingestion_revision: "revision-1".to_string(),
            parser_version: "parser-v1".to_string(),
        }
    }

    fn block(ordinal: u64, text: &str) -> ParsedDocumentBlock {
        ParsedDocumentBlock {
            ordinal,
            kind: "page".to_string(),
            text: text.to_string(),
            page_number: Some(ordinal as u32 + 1),
            anchor_index: None,
            start_line: None,
        }
    }

    fn read_gzip(mut reader: DecryptedCacheReader) -> String {
        let mut encrypted_gzip = Vec::new();
        reader.read_to_end(&mut encrypted_gzip).unwrap();
        let mut decoder = GzDecoder::new(encrypted_gzip.as_slice());
        let mut output = String::new();
        decoder.read_to_string(&mut output).unwrap();
        output
    }

    #[test]
    fn package_streams_ordered_json_and_separates_plain_hash() {
        let root = temp_root();
        let store = DocumentCacheStore::new(root.join("cache"), [8u8; 32]).unwrap();
        let mut builder = PackageBuilder::begin(store.clone(), "pkg-1".to_string(), header()).unwrap();
        builder.append(block(0, "第一块")).unwrap();
        builder.append(block(1, "第二块")).unwrap();
        let receipt = builder.finish().unwrap();
        assert_ne!(receipt.plain_text_sha256, receipt.payload_sha256);
        let text = read_gzip(store.open_decrypted_reader("pkg-1", &CacheScope {
            user_id: "user-a".to_string(),
            device_id: "device-1".to_string(),
            source_id: "source-1".to_string(),
            job_id: "job-1".to_string(),
            ingestion_revision: "revision-1".to_string(),
        }).unwrap());
        assert!(text.contains("\"ordinal\":0"));
        assert!(text.contains("第一块"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn package_rejects_non_contiguous_ordinals_and_cleans_temp_on_drop() {
        let root = temp_root();
        let store = DocumentCacheStore::new(root.join("cache"), [8u8; 32]).unwrap();
        let mut builder = PackageBuilder::begin(store, "pkg-2".to_string(), header()).unwrap();
        assert_eq!(builder.append(block(1, "wrong")), Err("DOCUMENT_PACKAGE_ORDINAL_INVALID".to_string()));
        let temp_path = builder.temp_path.clone();
        drop(builder);
        assert!(!temp_path.exists());
        let _ = fs::remove_dir_all(root);
    }
}

use crate::crypto;
use crate::document_cache::{
    is_lowercase_sha256, CacheHeader, CachePayloadInfo, CacheReceipt, CacheScope,
    DecryptedCacheReader, DocumentCacheStore, CACHE_SCHEMA_VERSION,
};
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
    pub server_device_id: String,
    pub source_id: String,
    pub job_id: String,
    pub ingestion_revision: String,
    pub source_asset_sha256: String,
    pub parser_id: String,
    pub parser_version: String,
    pub normalization_version: String,
    #[serde(default)]
    pub ocr_model_version: Option<String>,
}

impl PackageHeader {
    fn into_cache_header(self) -> CacheHeader {
        CacheHeader {
            schema_version: self.schema_version,
            user_id: self.user_id,
            server_device_id: self.server_device_id,
            source_id: self.source_id,
            job_id: self.job_id,
            ingestion_revision: self.ingestion_revision,
            payload_format: Some("parsed-document-v1".to_string()),
            source_asset_sha256: Some(self.source_asset_sha256),
            parser_id: Some(self.parser_id),
            parser_version: self.parser_version,
            normalization_version: Some(self.normalization_version),
            ocr_model_version: self.ocr_model_version,
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
    character_count: u64,
    next_ordinal: u64,
}

impl PackageBuilder {
    fn begin(
        store: DocumentCacheStore,
        cache_id: String,
        header: PackageHeader,
    ) -> Result<Self, String> {
        if header.schema_version != CACHE_SCHEMA_VERSION {
            return Err("DOCUMENT_PACKAGE_SCHEMA_UNSUPPORTED".to_string());
        }
        if header.user_id.trim().is_empty()
            || header.server_device_id.trim().is_empty()
            || header.source_id.trim().is_empty()
            || header.job_id.trim().is_empty()
            || header.ingestion_revision.trim().is_empty()
            || header.parser_id.trim().is_empty()
            || header.parser_version.trim().is_empty()
            || header.normalization_version.trim().is_empty()
        {
            return Err("DOCUMENT_PACKAGE_HEADER_INVALID".to_string());
        }
        if !is_lowercase_sha256(&header.source_asset_sha256)
            || header
                .ocr_model_version
                .as_deref()
                .map_or(false, |value| value.trim().is_empty())
        {
            return Err("DOCUMENT_PACKAGE_METADATA_INVALID".to_string());
        }
        let final_path = store.cache_path(&cache_id)?;
        let temp_path = final_path.with_extension("gzip.tmp");
        let file =
            File::create(&temp_path).map_err(|e| format!("DOCUMENT_PACKAGE_TEMP_FAILED: {e}"))?;
        let mut builder = Self {
            cache_id,
            store,
            header: header.into_cache_header(),
            temp_path,
            encoder: Some(GzEncoder::new(file, Compression::default())),
            plain_text_hash: Sha256::new(),
            character_count: 0,
            next_ordinal: 0,
        };
        builder.write_prefix()?;
        Ok(builder)
    }

    fn write_prefix(&mut self) -> Result<(), String> {
        let encoder = self
            .encoder
            .as_mut()
            .ok_or_else(|| "DOCUMENT_PACKAGE_FINISHED".to_string())?;
        let parser = serde_json::json!({
            "id": self.header.parser_id.as_deref().unwrap_or_default(),
            "version": self.header.parser_version.as_str(),
            "normalizationVersion": self.header.normalization_version.as_deref().unwrap_or_default(),
            "ocrModelVersion": self.header.ocr_model_version.as_deref(),
        });
        let source_id = serde_json::to_vec(&self.header.source_id)
            .map_err(|e| format!("DOCUMENT_PACKAGE_HEADER_SERIALIZE_FAILED: {e}"))?;
        let revision = serde_json::to_vec(&self.header.ingestion_revision)
            .map_err(|e| format!("DOCUMENT_PACKAGE_HEADER_SERIALIZE_FAILED: {e}"))?;
        let asset_sha = serde_json::to_vec(&self.header.source_asset_sha256)
            .map_err(|e| format!("DOCUMENT_PACKAGE_HEADER_SERIALIZE_FAILED: {e}"))?;
        let parser = serde_json::to_vec(&parser)
            .map_err(|e| format!("DOCUMENT_PACKAGE_HEADER_SERIALIZE_FAILED: {e}"))?;
        encoder
            .write_all(b"{\"schemaVersion\":1,\"sourceId\":")
            .and_then(|_| encoder.write_all(&source_id))
            .and_then(|_| encoder.write_all(b",\"ingestionRevision\":"))
            .and_then(|_| encoder.write_all(&revision))
            .and_then(|_| encoder.write_all(b",\"sourceAssetSha256\":"))
            .and_then(|_| encoder.write_all(&asset_sha))
            .and_then(|_| encoder.write_all(b",\"parser\":"))
            .and_then(|_| encoder.write_all(&parser))
            .and_then(|_| encoder.write_all(b",\"blocks\":["))
            .map_err(|e| format!("DOCUMENT_PACKAGE_WRITE_FAILED: {e}"))
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
        let json = serde_json::to_vec(&block)
            .map_err(|e| format!("DOCUMENT_PACKAGE_BLOCK_SERIALIZE_FAILED: {e}"))?;
        let encoder = self
            .encoder
            .as_mut()
            .ok_or_else(|| "DOCUMENT_PACKAGE_FINISHED".to_string())?;
        if self.next_ordinal > 0 {
            encoder
                .write_all(b",")
                .map_err(|e| format!("DOCUMENT_PACKAGE_WRITE_FAILED: {e}"))?;
        }
        encoder
            .write_all(&json)
            .map_err(|e| format!("DOCUMENT_PACKAGE_WRITE_FAILED: {e}"))?;
        self.plain_text_hash.update(block.text.as_bytes());
        self.plain_text_hash.update(b"\n");
        self.character_count = self
            .character_count
            .saturating_add(block.text.chars().count() as u64);
        self.next_ordinal += 1;
        Ok(())
    }

    fn finish(mut self) -> Result<CacheReceipt, String> {
        if self.next_ordinal == 0 {
            return Err("DOCUMENT_PACKAGE_EMPTY".to_string());
        }
        let plain_hash: [u8; 32] = self.plain_text_hash.clone().finalize().into();
        let hash_json = serde_json::to_vec(&hex::encode(plain_hash))
            .map_err(|e| format!("DOCUMENT_PACKAGE_HASH_SERIALIZE_FAILED: {e}"))?;
        let encoder = self
            .encoder
            .as_mut()
            .ok_or_else(|| "DOCUMENT_PACKAGE_FINISHED".to_string())?;
        encoder
            .write_all(b"],\"characterCount\":")
            .and_then(|_| encoder.write_all(self.character_count.to_string().as_bytes()))
            .and_then(|_| encoder.write_all(b",\"plainTextSha256\":"))
            .and_then(|_| encoder.write_all(&hash_json))
            .and_then(|_| encoder.write_all(b"}"))
            .map_err(|e| format!("DOCUMENT_PACKAGE_WRITE_FAILED: {e}"))?;
        let encoder = self
            .encoder
            .take()
            .ok_or_else(|| "DOCUMENT_PACKAGE_FINISHED".to_string())?;
        encoder
            .finish()
            .map_err(|e| format!("DOCUMENT_PACKAGE_GZIP_FAILED: {e}"))?;
        let receipt = self.store.encrypt_gzip_file(
            &self.cache_id,
            &self.header,
            &self.temp_path,
            plain_hash,
        )?;
        fs::remove_file(&self.temp_path)
            .map_err(|e| format!("DOCUMENT_PACKAGE_TEMP_CLEANUP_FAILED: {e}"))?;
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
        Self {
            root,
            packages: Mutex::new(HashMap::new()),
        }
    }

    fn store(&self) -> Result<DocumentCacheStore, String> {
        let key = crypto::get_master_key_bytes()?
            .try_into()
            .map_err(|_| "MASTER_KEY_INVALID_LENGTH".to_string())?;
        DocumentCacheStore::new(self.root.clone(), key)
    }

    fn store_for_new_package(&self) -> Result<DocumentCacheStore, String> {
        let key = crypto::ensure_master_key_bytes()?
            .try_into()
            .map_err(|_| "MASTER_KEY_INVALID_LENGTH".to_string())?;
        DocumentCacheStore::new(self.root.clone(), key)
    }

    pub fn open_decrypted_reader(
        &self,
        cache_id: &str,
        scope: &CacheScope,
    ) -> Result<DecryptedCacheReader, String> {
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
    let builder =
        PackageBuilder::begin(state.store_for_new_package()?, package_id.clone(), header)?;
    state
        .packages
        .lock()
        .map_err(|_| "DOCUMENT_PACKAGE_LOCK_FAILED".to_string())?
        .insert(package_id.clone(), builder);
    Ok(package_id)
}

#[tauri::command]
pub fn document_package_append(
    package_id: String,
    block: ParsedDocumentBlock,
    state: State<'_, DocumentPackagerState>,
) -> Result<(), String> {
    let mut packages = state
        .packages
        .lock()
        .map_err(|_| "DOCUMENT_PACKAGE_LOCK_FAILED".to_string())?;
    let builder = packages
        .get_mut(&package_id)
        .ok_or_else(|| "DOCUMENT_PACKAGE_NOT_FOUND".to_string())?;
    builder.append(block)
}

#[tauri::command]
pub fn document_package_finish(
    package_id: String,
    state: State<'_, DocumentPackagerState>,
) -> Result<CacheReceipt, String> {
    let builder = state
        .packages
        .lock()
        .map_err(|_| "DOCUMENT_PACKAGE_LOCK_FAILED".to_string())?
        .remove(&package_id)
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

#[tauri::command]
pub fn document_cache_payload_info(
    cache_id: String,
    user_id: String,
    server_device_id: String,
    source_id: String,
    job_id: String,
    ingestion_revision: String,
    state: State<'_, DocumentPackagerState>,
) -> Result<CachePayloadInfo, String> {
    state.store()?.payload_info(
        &cache_id,
        &CacheScope {
            user_id,
            server_device_id,
            source_id,
            job_id,
            ingestion_revision,
        },
    )
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
            server_device_id: "device-1".to_string(),
            source_id: "source-1".to_string(),
            job_id: "job-1".to_string(),
            ingestion_revision: "revision-1".to_string(),
            source_asset_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                .to_string(),
            parser_id: "parser".to_string(),
            parser_version: "parser-v1".to_string(),
            normalization_version: "normalization-v1".to_string(),
            ocr_model_version: None,
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
        let mut builder =
            PackageBuilder::begin(store.clone(), "pkg-1".to_string(), header()).unwrap();
        builder.append(block(0, "第一块")).unwrap();
        builder.append(block(1, "第二块")).unwrap();
        let receipt = builder.finish().unwrap();
        assert_ne!(receipt.plain_text_sha256, receipt.payload_sha256);
        let text = read_gzip(
            store
                .open_decrypted_reader(
                    "pkg-1",
                    &CacheScope {
                        user_id: "user-a".to_string(),
                        server_device_id: "device-1".to_string(),
                        source_id: "source-1".to_string(),
                        job_id: "job-1".to_string(),
                        ingestion_revision: "revision-1".to_string(),
                    },
                )
                .unwrap(),
        );
        assert!(text.contains("\"ordinal\":0"));
        assert!(text.contains("第一块"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn package_rejects_non_contiguous_ordinals_and_cleans_temp_on_drop() {
        let root = temp_root();
        let store = DocumentCacheStore::new(root.join("cache"), [8u8; 32]).unwrap();
        let mut builder = PackageBuilder::begin(store, "pkg-2".to_string(), header()).unwrap();
        assert_eq!(
            builder.append(block(1, "wrong")),
            Err("DOCUMENT_PACKAGE_ORDINAL_INVALID".to_string())
        );
        let temp_path = builder.temp_path.clone();
        drop(builder);
        assert!(!temp_path.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn package_rejects_invalid_asset_hash_and_parser_metadata() {
        let root = temp_root();
        let store = DocumentCacheStore::new(root.join("cache"), [8u8; 32]).unwrap();
        let mut invalid_hash = header();
        invalid_hash.source_asset_sha256 = "ABC".to_string();
        assert!(matches!(
            PackageBuilder::begin(store.clone(), "invalid-hash".to_string(), invalid_hash),
            Err(error) if error == "DOCUMENT_PACKAGE_METADATA_INVALID"
        ));
        let mut invalid_parser = header();
        invalid_parser.parser_id = " ".to_string();
        assert!(matches!(
            PackageBuilder::begin(store, "invalid-parser".to_string(), invalid_parser),
            Err(error) if error == "DOCUMENT_PACKAGE_HEADER_INVALID"
        ));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn package_rejects_zero_block_completion() {
        let root = temp_root();
        let store = DocumentCacheStore::new(root.join("cache"), [8u8; 32]).unwrap();
        let builder = PackageBuilder::begin(store, "empty".to_string(), header()).unwrap();
        assert_eq!(builder.finish().unwrap_err(), "DOCUMENT_PACKAGE_EMPTY");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn package_matches_shared_schema_v1_fixture() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../docs/contracts/fixtures/parsed-document-v1.json"
        ))
        .unwrap();
        let root = temp_root();
        let store = DocumentCacheStore::new(root.join("cache"), [8u8; 32]).unwrap();
        let parser = fixture.get("parser").unwrap();
        let mut builder = PackageBuilder::begin(
            store.clone(),
            "pkg-fixture".to_string(),
            PackageHeader {
                schema_version: CACHE_SCHEMA_VERSION,
                user_id: "fixture-user".to_string(),
                server_device_id: "fixture-device".to_string(),
                source_id: fixture
                    .get("sourceId")
                    .unwrap()
                    .as_str()
                    .unwrap()
                    .to_string(),
                job_id: "fixture-job".to_string(),
                ingestion_revision: fixture
                    .get("ingestionRevision")
                    .unwrap()
                    .as_str()
                    .unwrap()
                    .to_string(),
                source_asset_sha256: fixture
                    .get("sourceAssetSha256")
                    .unwrap()
                    .as_str()
                    .unwrap()
                    .to_string(),
                parser_id: parser.get("id").unwrap().as_str().unwrap().to_string(),
                parser_version: parser.get("version").unwrap().as_str().unwrap().to_string(),
                normalization_version: parser
                    .get("normalizationVersion")
                    .unwrap()
                    .as_str()
                    .unwrap()
                    .to_string(),
                ocr_model_version: parser
                    .get("ocrModelVersion")
                    .and_then(|value| value.as_str().map(str::to_string)),
            },
        )
        .unwrap();
        for fixture_block in fixture.get("blocks").unwrap().as_array().unwrap() {
            builder
                .append(serde_json::from_value(fixture_block.clone()).unwrap())
                .unwrap();
        }
        builder.finish().unwrap();

        let actual: serde_json::Value = serde_json::from_str(&read_gzip(
            store
                .open_decrypted_reader(
                    "pkg-fixture",
                    &CacheScope {
                        user_id: "fixture-user".to_string(),
                        server_device_id: "fixture-device".to_string(),
                        source_id: fixture
                            .get("sourceId")
                            .unwrap()
                            .as_str()
                            .unwrap()
                            .to_string(),
                        job_id: "fixture-job".to_string(),
                        ingestion_revision: fixture
                            .get("ingestionRevision")
                            .unwrap()
                            .as_str()
                            .unwrap()
                            .to_string(),
                    },
                )
                .unwrap(),
        ))
        .unwrap();
        assert_eq!(actual, fixture);
        let _ = fs::remove_dir_all(root);
    }
}

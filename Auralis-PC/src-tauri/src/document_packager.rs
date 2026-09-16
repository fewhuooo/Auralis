use crate::crypto;
use crate::document_cache::{
    is_lowercase_sha256, CacheHeader, CachePayloadInfo, CacheReceipt, CacheScope,
    DecryptedCacheReader, DocumentCacheStore, LocalCacheHeader, LocalCacheReceipt, LocalCacheScope,
    CACHE_SCHEMA_VERSION, MAX_LOCAL_DERIVED_BYTES, MAX_LOCAL_DERIVED_RATIO,
};
use flate2::{read::GzDecoder, write::GzEncoder, Compression};
use serde::{
    de::{DeserializeSeed, Deserializer, MapAccess, SeqAccess, Visitor},
    Deserialize, Serialize,
};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs::{self, File},
    io::{self, BufReader, Read, Write},
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
            plain_text_sha256: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalPackageHeader {
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

impl LocalPackageHeader {
    fn into_cache_header(self) -> LocalCacheHeader {
        LocalCacheHeader {
            schema_version: self.schema_version,
            user_id: self.user_id,
            device_id: self.device_id,
            local_source_id: self.local_source_id,
            local_content_revision: self.local_content_revision,
            source_asset_sha256: self.source_asset_sha256,
            parser_id: self.parser_id,
            parser_version: self.parser_version,
            normalization_version: self.normalization_version,
            ocr_model_version: self.ocr_model_version,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalCacheBindRequest {
    pub local_cache_id: String,
    pub server_cache_id: String,
    pub user_id: String,
    pub device_id: String,
    pub local_source_id: String,
    pub local_content_revision: String,
    pub server_source_id: String,
    pub job_id: String,
    pub ingestion_revision: String,
    pub source_asset_sha256: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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

struct LocalPackageBuilder {
    cache_id: String,
    store: DocumentCacheStore,
    header: LocalCacheHeader,
    temp_path: PathBuf,
    encoder: Option<GzEncoder<File>>,
    plain_text_hash: Sha256,
    character_count: u64,
    next_ordinal: u64,
    payload_bytes: u64,
}

impl LocalPackageBuilder {
    fn begin(
        store: DocumentCacheStore,
        cache_id: String,
        header: LocalPackageHeader,
    ) -> Result<Self, String> {
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
            return Err("DOCUMENT_LOCAL_PACKAGE_HEADER_INVALID".to_string());
        }
        let cache_header = header.into_cache_header();
        let (temp_path, file) = store
            .create_plaintext_staging_file("local", &cache_id)
            .map_err(|_| "DOCUMENT_LOCAL_PACKAGE_TEMP_FAILED".to_string())?;
        let mut builder = Self {
            cache_id,
            store,
            header: cache_header,
            temp_path,
            encoder: Some(GzEncoder::new(file, Compression::default())),
            plain_text_hash: Sha256::new(),
            character_count: 0,
            next_ordinal: 0,
            payload_bytes: 0,
        };
        builder.write_prefix()?;
        Ok(builder)
    }

    fn write_prefix(&mut self) -> Result<(), String> {
        let encoder = self
            .encoder
            .as_mut()
            .ok_or_else(|| "DOCUMENT_LOCAL_PACKAGE_FINISHED".to_string())?;
        let parser = serde_json::json!({
            "id": self.header.parser_id,
            "version": self.header.parser_version,
            "normalizationVersion": self.header.normalization_version,
            "ocrModelVersion": self.header.ocr_model_version,
        });
        let local_source_id = serde_json::to_vec(&self.header.local_source_id)
            .map_err(|e| format!("DOCUMENT_LOCAL_PACKAGE_HEADER_SERIALIZE_FAILED: {e}"))?;
        let local_revision = serde_json::to_vec(&self.header.local_content_revision)
            .map_err(|e| format!("DOCUMENT_LOCAL_PACKAGE_HEADER_SERIALIZE_FAILED: {e}"))?;
        let asset_sha = serde_json::to_vec(&self.header.source_asset_sha256)
            .map_err(|e| format!("DOCUMENT_LOCAL_PACKAGE_HEADER_SERIALIZE_FAILED: {e}"))?;
        let parser = serde_json::to_vec(&parser)
            .map_err(|e| format!("DOCUMENT_LOCAL_PACKAGE_HEADER_SERIALIZE_FAILED: {e}"))?;
        let mut prefix = Vec::new();
        prefix.extend_from_slice(b"{\"schemaVersion\":1,\"localSourceId\":");
        prefix.extend_from_slice(&local_source_id);
        prefix.extend_from_slice(b",\"localContentRevision\":");
        prefix.extend_from_slice(&local_revision);
        prefix.extend_from_slice(b",\"sourceAssetSha256\":");
        prefix.extend_from_slice(&asset_sha);
        prefix.extend_from_slice(b",\"parser\":");
        prefix.extend_from_slice(&parser);
        prefix.extend_from_slice(b",\"blocks\":[");
        encoder
            .write_all(&prefix)
            .map_err(|e| format!("DOCUMENT_LOCAL_PACKAGE_WRITE_FAILED: {e}"))?;
        self.payload_bytes = prefix.len() as u64;
        Ok(())
    }

    fn append(&mut self, block: ParsedDocumentBlock) -> Result<(), String> {
        validate_block(&block, self.next_ordinal, "DOCUMENT_LOCAL_PACKAGE")?;
        let json = serde_json::to_vec(&block)
            .map_err(|e| format!("DOCUMENT_LOCAL_PACKAGE_BLOCK_SERIALIZE_FAILED: {e}"))?;
        let separator_bytes = u64::from(self.next_ordinal > 0);
        let added_bytes = separator_bytes.saturating_add(json.len() as u64);
        if self.payload_bytes.saturating_add(added_bytes) > MAX_LOCAL_DERIVED_BYTES {
            return Err("DOCUMENT_LOCAL_PACKAGE_PAYLOAD_TOO_LARGE".to_string());
        }
        let encoder = self
            .encoder
            .as_mut()
            .ok_or_else(|| "DOCUMENT_LOCAL_PACKAGE_FINISHED".to_string())?;
        if self.next_ordinal > 0 {
            encoder
                .write_all(b",")
                .map_err(|e| format!("DOCUMENT_LOCAL_PACKAGE_WRITE_FAILED: {e}"))?;
        }
        encoder
            .write_all(&json)
            .map_err(|e| format!("DOCUMENT_LOCAL_PACKAGE_WRITE_FAILED: {e}"))?;
        self.plain_text_hash.update(block.text.as_bytes());
        self.plain_text_hash.update(b"\n");
        self.character_count = self
            .character_count
            .saturating_add(block.text.chars().count() as u64);
        self.next_ordinal = self.next_ordinal.saturating_add(1);
        self.payload_bytes = self.payload_bytes.saturating_add(added_bytes);
        Ok(())
    }

    fn finish(mut self) -> Result<LocalCacheReceipt, String> {
        if self.next_ordinal == 0 {
            return Err("DOCUMENT_LOCAL_PACKAGE_EMPTY".to_string());
        }
        let plain_hash: [u8; 32] = self.plain_text_hash.clone().finalize().into();
        let hash_json = serde_json::to_vec(&hex::encode(plain_hash))
            .map_err(|e| format!("DOCUMENT_LOCAL_PACKAGE_HASH_SERIALIZE_FAILED: {e}"))?;
        let mut suffix = Vec::new();
        suffix.extend_from_slice(b"],\"characterCount\":");
        suffix.extend_from_slice(self.character_count.to_string().as_bytes());
        suffix.extend_from_slice(b",\"plainTextSha256\":");
        suffix.extend_from_slice(&hash_json);
        suffix.extend_from_slice(b"}");
        if self.payload_bytes.saturating_add(suffix.len() as u64) > MAX_LOCAL_DERIVED_BYTES {
            return Err("DOCUMENT_LOCAL_PACKAGE_PAYLOAD_TOO_LARGE".to_string());
        }
        let encoder = self
            .encoder
            .as_mut()
            .ok_or_else(|| "DOCUMENT_LOCAL_PACKAGE_FINISHED".to_string())?;
        encoder
            .write_all(&suffix)
            .map_err(|e| format!("DOCUMENT_LOCAL_PACKAGE_WRITE_FAILED: {e}"))?;
        let encoder = self
            .encoder
            .take()
            .ok_or_else(|| "DOCUMENT_LOCAL_PACKAGE_FINISHED".to_string())?;
        encoder
            .finish()
            .map_err(|e| format!("DOCUMENT_LOCAL_PACKAGE_GZIP_FAILED: {e}"))?;
        let receipt = self.store.encrypt_local_gzip_file(
            &self.cache_id,
            &self.header,
            &self.temp_path,
            plain_hash,
        )?;
        fs::remove_file(&self.temp_path)
            .map_err(|e| format!("DOCUMENT_LOCAL_PACKAGE_TEMP_CLEANUP_FAILED: {e}"))?;
        Ok(receipt)
    }
}

impl Drop for LocalPackageBuilder {
    fn drop(&mut self) {
        let _ = self.encoder.take();
        let _ = fs::remove_file(&self.temp_path);
    }
}

fn validate_block(
    block: &ParsedDocumentBlock,
    expected_ordinal: u64,
    prefix: &str,
) -> Result<(), String> {
    if block.ordinal != expected_ordinal {
        return Err(format!("{prefix}_ORDINAL_INVALID"));
    }
    if block.text.trim().is_empty() {
        return Err(format!("{prefix}_EMPTY_BLOCK"));
    }
    if block.text.chars().count() > MAX_BLOCK_CHARS {
        return Err(format!("{prefix}_BLOCK_TOO_LARGE"));
    }
    Ok(())
}

fn append_pending_package(
    package: &mut PendingPackage,
    block: ParsedDocumentBlock,
) -> Result<(), String> {
    match package {
        PendingPackage::Server(builder) => builder.append(block),
        PendingPackage::Local(_) => Err("DOCUMENT_PACKAGE_KIND_MISMATCH".to_string()),
    }
}

pub struct DocumentPackagerState {
    root: PathBuf,
    packages: Mutex<HashMap<String, PendingPackage>>,
}

enum PendingPackage {
    Server(PackageBuilder),
    Local(LocalPackageBuilder),
}

struct RebindContext<'a, W: Write> {
    output: &'a mut W,
    expected_local_source_id: &'a str,
    expected_local_revision: &'a str,
    expected_asset_sha256: &'a str,
    local_header: &'a LocalCacheHeader,
    next_ordinal: u64,
    character_count: u64,
    plain_text_hash: Sha256,
}

struct BlocksSeed<'a, 'b, W: Write> {
    context: &'a mut RebindContext<'b, W>,
}

struct BlocksVisitor<'a, 'b, W: Write> {
    context: &'a mut RebindContext<'b, W>,
}

impl<'de, 'a, 'b, W: Write> DeserializeSeed<'de> for BlocksSeed<'a, 'b, W> {
    type Value = ();

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_seq(BlocksVisitor {
            context: self.context,
        })
    }
}

impl<'de, 'a, 'b, W: Write> Visitor<'de> for BlocksVisitor<'a, 'b, W> {
    type Value = ();

    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("an ordered parsed document block array")
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        while let Some(block) = sequence.next_element::<ParsedDocumentBlock>()? {
            if self.context.next_ordinal >= 1_000_000 {
                return Err(serde::de::Error::custom("LOCAL_CACHE_BLOCK_COUNT_INVALID"));
            }
            validate_block(&block, self.context.next_ordinal, "LOCAL_CACHE")
                .map_err(serde::de::Error::custom)?;
            let json = serde_json::to_vec(&block)
                .map_err(|_| serde::de::Error::custom("LOCAL_CACHE_BLOCK_INVALID"))?;
            if self.context.next_ordinal > 0 {
                self.context
                    .output
                    .write_all(b",")
                    .map_err(|_| serde::de::Error::custom("LOCAL_CACHE_REBIND_WRITE_FAILED"))?;
            }
            self.context
                .output
                .write_all(&json)
                .map_err(|_| serde::de::Error::custom("LOCAL_CACHE_REBIND_WRITE_FAILED"))?;
            self.context.plain_text_hash.update(block.text.as_bytes());
            self.context.plain_text_hash.update(b"\n");
            self.context.character_count = self
                .context
                .character_count
                .saturating_add(block.text.chars().count() as u64);
            self.context.next_ordinal = self.context.next_ordinal.saturating_add(1);
        }
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PayloadParser {
    id: String,
    version: String,
    normalization_version: String,
    #[serde(default)]
    ocr_model_version: Option<String>,
}

struct RebindPayloadVisitor<'a, 'b, W: Write> {
    context: &'a mut RebindContext<'b, W>,
}

impl<'de, 'a, 'b, W: Write> Visitor<'de> for RebindPayloadVisitor<'a, 'b, W> {
    type Value = (u64, String);

    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("a schema-v1 local parsed document payload")
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut schema_version = None;
        let mut local_source_id = None;
        let mut local_content_revision = None;
        let mut source_asset_sha256 = None;
        let mut parser = None;
        let mut blocks = None;
        let mut character_count = None;
        let mut plain_text_sha256 = None;
        while let Some(key) = map.next_key::<String>()? {
            match key.as_str() {
                "schemaVersion" if schema_version.is_none() => {
                    schema_version = Some(map.next_value::<u32>()?);
                }
                "localSourceId" if local_source_id.is_none() => {
                    local_source_id = Some(map.next_value::<String>()?);
                }
                "localContentRevision" if local_content_revision.is_none() => {
                    local_content_revision = Some(map.next_value::<String>()?);
                }
                "sourceAssetSha256" if source_asset_sha256.is_none() => {
                    source_asset_sha256 = Some(map.next_value::<String>()?);
                }
                "parser" if parser.is_none() => {
                    parser = Some(map.next_value::<PayloadParser>()?);
                }
                "blocks" if blocks.is_none() => {
                    map.next_value_seed(BlocksSeed {
                        context: self.context,
                    })?;
                    blocks = Some(());
                }
                "characterCount" if character_count.is_none() => {
                    character_count = Some(map.next_value::<u64>()?);
                }
                "plainTextSha256" if plain_text_sha256.is_none() => {
                    plain_text_sha256 = Some(map.next_value::<String>()?);
                }
                _ => {
                    return Err(serde::de::Error::custom(
                        "LOCAL_CACHE_PAYLOAD_SCHEMA_INVALID",
                    ))
                }
            }
        }
        if schema_version != Some(CACHE_SCHEMA_VERSION)
            || local_source_id.as_deref() != Some(self.context.expected_local_source_id)
            || local_content_revision.as_deref() != Some(self.context.expected_local_revision)
            || source_asset_sha256.as_deref() != Some(self.context.expected_asset_sha256)
        {
            return Err(serde::de::Error::custom(
                "LOCAL_CACHE_PAYLOAD_SCOPE_INVALID",
            ));
        }
        let parser =
            parser.ok_or_else(|| serde::de::Error::custom("LOCAL_CACHE_PAYLOAD_SCHEMA_INVALID"))?;
        if parser.id != self.context.local_header.parser_id
            || parser.version != self.context.local_header.parser_version
            || parser.normalization_version != self.context.local_header.normalization_version
            || parser.ocr_model_version != self.context.local_header.ocr_model_version
            || blocks.is_none()
            || character_count != Some(self.context.character_count)
        {
            return Err(serde::de::Error::custom(
                "LOCAL_CACHE_PAYLOAD_METADATA_INVALID",
            ));
        }
        let computed_hash = hex::encode(self.context.plain_text_hash.clone().finalize());
        if plain_text_sha256.as_deref() != Some(computed_hash.as_str()) {
            return Err(serde::de::Error::custom(
                "LOCAL_CACHE_PLAIN_TEXT_HASH_INVALID",
            ));
        }
        Ok((self.context.character_count, computed_hash))
    }
}

struct LimitedReader<R> {
    inner: R,
    bytes: u64,
}

impl<R: Read> Read for LimitedReader<R> {
    fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
        let count = self.inner.read(output)?;
        self.bytes = self.bytes.saturating_add(count as u64);
        if self.bytes > MAX_LOCAL_DERIVED_BYTES {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "LOCAL_CACHE_PAYLOAD_TOO_LARGE",
            ));
        }
        Ok(count)
    }
}

fn write_server_payload_prefix(
    output: &mut GzEncoder<File>,
    header: &LocalCacheHeader,
    request: &LocalCacheBindRequest,
) -> Result<(), String> {
    let source_id = serde_json::to_vec(&request.server_source_id)
        .map_err(|_| "LOCAL_CACHE_REBIND_HEADER_INVALID".to_string())?;
    let revision = serde_json::to_vec(&request.ingestion_revision)
        .map_err(|_| "LOCAL_CACHE_REBIND_HEADER_INVALID".to_string())?;
    let asset_sha = serde_json::to_vec(&request.source_asset_sha256)
        .map_err(|_| "LOCAL_CACHE_REBIND_HEADER_INVALID".to_string())?;
    let parser = serde_json::json!({
        "id": header.parser_id,
        "version": header.parser_version,
        "normalizationVersion": header.normalization_version,
        "ocrModelVersion": header.ocr_model_version,
    });
    let parser =
        serde_json::to_vec(&parser).map_err(|_| "LOCAL_CACHE_REBIND_HEADER_INVALID".to_string())?;
    output
        .write_all(b"{\"schemaVersion\":1,\"sourceId\":")
        .and_then(|_| output.write_all(&source_id))
        .and_then(|_| output.write_all(b",\"ingestionRevision\":"))
        .and_then(|_| output.write_all(&revision))
        .and_then(|_| output.write_all(b",\"sourceAssetSha256\":"))
        .and_then(|_| output.write_all(&asset_sha))
        .and_then(|_| output.write_all(b",\"parser\":"))
        .and_then(|_| output.write_all(&parser))
        .and_then(|_| output.write_all(b",\"blocks\":["))
        .map_err(|_| "LOCAL_CACHE_REBIND_WRITE_FAILED".to_string())
}

fn staged_payload_info(path: &std::path::Path) -> Result<CachePayloadInfo, String> {
    let mut file =
        File::open(path).map_err(|_| "LOCAL_CACHE_REBIND_TEMP_READ_FAILED".to_string())?;
    let mut hash = Sha256::new();
    let mut bytes = 0u64;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|_| "LOCAL_CACHE_REBIND_TEMP_READ_FAILED".to_string())?;
        if count == 0 {
            break;
        }
        bytes = bytes.saturating_add(count as u64);
        if bytes > MAX_LOCAL_DERIVED_BYTES {
            return Err("LOCAL_CACHE_REBIND_PAYLOAD_TOO_LARGE".to_string());
        }
        hash.update(&buffer[..count]);
    }
    Ok(CachePayloadInfo {
        payload_sha256: hex::encode(hash.finalize()),
        payload_bytes: bytes,
    })
}

fn rebind_receipt_matches(
    receipt: &CacheReceipt,
    header: &CacheHeader,
    payload_info: &CachePayloadInfo,
) -> bool {
    receipt.envelope_version == crate::document_cache::CACHE_ENVELOPE_VERSION
        && receipt.payload_sha256 == payload_info.payload_sha256
        && receipt.payload_bytes == payload_info.payload_bytes
        && receipt.payload_format == header.payload_format
        && receipt.source_asset_sha256 == header.source_asset_sha256
        && receipt.parser_id == header.parser_id
        && receipt.parser_version.as_ref() == Some(&header.parser_version)
        && receipt.normalization_version == header.normalization_version
        && receipt.ocr_model_version == header.ocr_model_version
        && receipt.plain_text_sha256 == header.plain_text_sha256.as_deref().unwrap_or_default()
}

fn bind_local_cache(
    store: DocumentCacheStore,
    request: LocalCacheBindRequest,
) -> Result<CacheReceipt, String> {
    if request.user_id.trim().is_empty()
        || request.device_id.trim().is_empty()
        || request.local_source_id.trim().is_empty()
        || request.local_content_revision.trim().is_empty()
        || request.server_source_id.trim().is_empty()
        || request.job_id.trim().is_empty()
        || request.ingestion_revision.trim().is_empty()
        || !is_lowercase_sha256(&request.source_asset_sha256)
    {
        return Err("LOCAL_CACHE_BIND_REQUEST_INVALID".to_string());
    }
    let local_scope = LocalCacheScope {
        user_id: request.user_id.clone(),
        device_id: request.device_id.clone(),
        local_source_id: request.local_source_id.clone(),
        local_content_revision: request.local_content_revision.clone(),
        source_asset_sha256: request.source_asset_sha256.clone(),
    };
    let local_header = store.local_header(&request.local_cache_id, &local_scope)?;
    let local_info = store.local_payload_info(&request.local_cache_id, &local_scope)?;
    if local_info.payload_bytes == 0 {
        return Err("LOCAL_CACHE_PAYLOAD_EMPTY".to_string());
    }
    let final_path = store.cache_path(&request.server_cache_id)?;
    let server_scope = CacheScope {
        user_id: request.user_id.clone(),
        server_device_id: request.device_id.clone(),
        source_id: request.server_source_id.clone(),
        job_id: request.job_id.clone(),
        ingestion_revision: request.ingestion_revision.clone(),
    };
    let (temp_path, file) = store
        .create_plaintext_staging_file("rebind", &request.server_cache_id)
        .map_err(|_| "LOCAL_CACHE_REBIND_TEMP_FAILED".to_string())?;
    let result = (|| {
        let mut encoder = GzEncoder::new(file, Compression::default());
        write_server_payload_prefix(&mut encoder, &local_header, &request)?;
        let decrypted = store.open_local_decrypted_reader(&request.local_cache_id, &local_scope)?;
        let decoder = GzDecoder::new(decrypted);
        let mut limited = LimitedReader {
            inner: decoder,
            bytes: 0,
        };
        let mut reader = BufReader::new(&mut limited);
        let mut deserializer = serde_json::Deserializer::from_reader(&mut reader);
        let mut context = RebindContext {
            output: &mut encoder,
            expected_local_source_id: &request.local_source_id,
            expected_local_revision: &request.local_content_revision,
            expected_asset_sha256: &request.source_asset_sha256,
            local_header: &local_header,
            next_ordinal: 0,
            character_count: 0,
            plain_text_hash: Sha256::new(),
        };
        let (_, plain_hash) = deserializer
            .deserialize_map(RebindPayloadVisitor {
                context: &mut context,
            })
            .map_err(|_| "LOCAL_CACHE_REBIND_PAYLOAD_INVALID".to_string())?;
        deserializer
            .end()
            .map_err(|_| "LOCAL_CACHE_REBIND_PAYLOAD_TRAILING_DATA".to_string())?;
        if context.next_ordinal == 0 {
            return Err("LOCAL_CACHE_PAYLOAD_EMPTY".to_string());
        }
        if limited.bytes
            > local_info
                .payload_bytes
                .saturating_mul(MAX_LOCAL_DERIVED_RATIO)
        {
            return Err("LOCAL_CACHE_EXPANSION_RATIO_INVALID".to_string());
        }
        context
            .output
            .write_all(b"],\"characterCount\":")
            .and_then(|_| {
                context
                    .output
                    .write_all(context.character_count.to_string().as_bytes())
            })
            .and_then(|_| context.output.write_all(b",\"plainTextSha256\":"))
            .and_then(|_| {
                context
                    .output
                    .write_all(serde_json::to_string(&plain_hash).unwrap().as_bytes())
            })
            .and_then(|_| context.output.write_all(b"}"))
            .map_err(|_| "LOCAL_CACHE_REBIND_WRITE_FAILED".to_string())?;
        encoder
            .finish()
            .map_err(|_| "LOCAL_CACHE_REBIND_GZIP_FAILED".to_string())?;
        let cache_header = CacheHeader {
            schema_version: CACHE_SCHEMA_VERSION,
            user_id: request.user_id.clone(),
            server_device_id: request.device_id.clone(),
            source_id: request.server_source_id.clone(),
            job_id: request.job_id.clone(),
            ingestion_revision: request.ingestion_revision.clone(),
            parser_version: local_header.parser_version.clone(),
            payload_format: Some("parsed-document-v1".to_string()),
            source_asset_sha256: Some(request.source_asset_sha256.clone()),
            parser_id: Some(local_header.parser_id.clone()),
            normalization_version: Some(local_header.normalization_version.clone()),
            ocr_model_version: local_header.ocr_model_version.clone(),
            plain_text_sha256: Some(plain_hash),
        };
        let expected_payload_info = staged_payload_info(&temp_path)?;
        if final_path.exists() {
            let existing = store.existing_receipt(&request.server_cache_id, &server_scope)?;
            if !rebind_receipt_matches(&existing, &cache_header, &expected_payload_info) {
                return Err("LOCAL_CACHE_BIND_CONFLICT".to_string());
            }
            fs::remove_file(&temp_path)
                .map_err(|_| "LOCAL_CACHE_REBIND_TEMP_CLEANUP_FAILED".to_string())?;
            return Ok(existing);
        }
        let plain_hash_bytes: [u8; 32] = hex::decode(
            cache_header
                .plain_text_sha256
                .as_deref()
                .ok_or_else(|| "LOCAL_CACHE_REBIND_HASH_INVALID".to_string())?,
        )
        .map_err(|_| "LOCAL_CACHE_REBIND_HASH_INVALID".to_string())?
        .try_into()
        .map_err(|_| "LOCAL_CACHE_REBIND_HASH_INVALID".to_string())?;
        let receipt = match store.encrypt_gzip_file_unique(
            &request.server_cache_id,
            &cache_header,
            &temp_path,
            plain_hash_bytes,
        ) {
            Ok(receipt) => receipt,
            Err(error) if error == "CACHE_ALREADY_EXISTS" => {
                let existing = store.existing_receipt(&request.server_cache_id, &server_scope)?;
                if !rebind_receipt_matches(&existing, &cache_header, &expected_payload_info) {
                    return Err("LOCAL_CACHE_BIND_CONFLICT".to_string());
                }
                existing
            }
            Err(error) => return Err(error),
        };
        fs::remove_file(&temp_path)
            .map_err(|_| "LOCAL_CACHE_REBIND_TEMP_CLEANUP_FAILED".to_string())?;
        Ok(receipt)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result
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

    #[cfg(test)]
    fn for_test(root: PathBuf, _key: [u8; 32]) -> Self {
        Self {
            root,
            packages: Mutex::new(HashMap::new()),
        }
    }

    #[cfg(test)]
    fn local_store_for_test(&self) -> DocumentCacheStore {
        DocumentCacheStore::new(self.root.clone(), [8u8; 32]).unwrap()
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
        .insert(package_id.clone(), PendingPackage::Server(builder));
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
    append_pending_package(builder, block)
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
    match builder {
        PendingPackage::Server(builder) => builder.finish(),
        PendingPackage::Local(_) => Err("DOCUMENT_PACKAGE_KIND_MISMATCH".to_string()),
    }
}

#[tauri::command]
pub fn document_local_package_begin(
    header: LocalPackageHeader,
    state: State<'_, DocumentPackagerState>,
) -> Result<String, String> {
    let package_id = format!("local-{}", uuid_like());
    let builder =
        LocalPackageBuilder::begin(state.store_for_new_package()?, package_id.clone(), header)?;
    state
        .packages
        .lock()
        .map_err(|_| "DOCUMENT_PACKAGE_LOCK_FAILED".to_string())?
        .insert(package_id.clone(), PendingPackage::Local(builder));
    Ok(package_id)
}

#[tauri::command]
pub fn document_local_package_append(
    package_id: String,
    block: ParsedDocumentBlock,
    state: State<'_, DocumentPackagerState>,
) -> Result<(), String> {
    let mut packages = state
        .packages
        .lock()
        .map_err(|_| "DOCUMENT_PACKAGE_LOCK_FAILED".to_string())?;
    match packages
        .get_mut(&package_id)
        .ok_or_else(|| "DOCUMENT_LOCAL_PACKAGE_NOT_FOUND".to_string())?
    {
        PendingPackage::Local(builder) => builder.append(block),
        PendingPackage::Server(_) => Err("DOCUMENT_LOCAL_PACKAGE_KIND_MISMATCH".to_string()),
    }
}

#[tauri::command]
pub fn document_local_package_finish(
    package_id: String,
    state: State<'_, DocumentPackagerState>,
) -> Result<LocalCacheReceipt, String> {
    let builder = state
        .packages
        .lock()
        .map_err(|_| "DOCUMENT_PACKAGE_LOCK_FAILED".to_string())?
        .remove(&package_id)
        .ok_or_else(|| "DOCUMENT_LOCAL_PACKAGE_NOT_FOUND".to_string())?;
    match builder {
        PendingPackage::Local(builder) => builder.finish(),
        PendingPackage::Server(_) => Err("DOCUMENT_LOCAL_PACKAGE_KIND_MISMATCH".to_string()),
    }
}

#[tauri::command]
pub fn document_local_cache_bind(
    request: LocalCacheBindRequest,
    state: State<'_, DocumentPackagerState>,
) -> Result<CacheReceipt, String> {
    bind_local_cache(state.store()?, request)
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

    fn local_header() -> LocalPackageHeader {
        LocalPackageHeader {
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
    fn server_append_rejects_local_pending_without_consuming_block() {
        let root = temp_root();
        let store = DocumentCacheStore::new(root.join("cache"), [8u8; 32]).unwrap();
        let builder =
            LocalPackageBuilder::begin(store, "local-cache-1".to_string(), local_header()).unwrap();
        let mut pending = PendingPackage::Local(builder);
        assert_eq!(
            append_pending_package(&mut pending, block(0, "block")),
            Err("DOCUMENT_PACKAGE_KIND_MISMATCH".to_string())
        );
        match pending {
            PendingPackage::Local(builder) => assert_eq!(builder.next_ordinal, 0),
            PendingPackage::Server(_) => panic!("local package changed kind"),
        }
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn local_append_enforces_cumulative_payload_limit_before_writing() {
        let root = temp_root();
        let store = DocumentCacheStore::new(root.join("cache"), [8u8; 32]).unwrap();
        let mut builder =
            LocalPackageBuilder::begin(store, "local-cache-1".to_string(), local_header()).unwrap();
        builder.payload_bytes = MAX_LOCAL_DERIVED_BYTES;
        assert_eq!(
            builder.append(block(0, "block")),
            Err("DOCUMENT_LOCAL_PACKAGE_PAYLOAD_TOO_LARGE".to_string())
        );
        assert_eq!(builder.next_ordinal, 0);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn local_cache_can_be_bound_without_rebuilding_blocks() {
        let root = temp_root();
        let state = DocumentPackagerState::for_test(root.join("cache"), [8u8; 32]);
        let mut builder = LocalPackageBuilder::begin(
            state.local_store_for_test(),
            "local-cache-1".to_string(),
            local_header(),
        )
        .unwrap();
        builder.append(block(0, "第一块")).unwrap();
        builder.append(block(1, "第二块")).unwrap();
        let local_receipt = builder.finish().unwrap();
        let bind_request = LocalCacheBindRequest {
            local_cache_id: local_receipt.cache_id,
            server_cache_id: "server-cache-1".to_string(),
            user_id: "user-a".to_string(),
            device_id: "device-1".to_string(),
            local_source_id: "local-source-1".to_string(),
            local_content_revision: "local-rev-1".to_string(),
            server_source_id: "server-source-1".to_string(),
            job_id: "job-1".to_string(),
            ingestion_revision: "server-rev-1".to_string(),
            source_asset_sha256: "a".repeat(64),
        };
        let store_a = state.local_store_for_test();
        let store_b = state.local_store_for_test();
        let (first, second) = std::thread::scope(|scope| {
            let first = scope.spawn(|| bind_local_cache(store_a, bind_request.clone()));
            let second = scope.spawn(|| bind_local_cache(store_b, bind_request.clone()));
            (first.join().unwrap(), second.join().unwrap())
        });
        let receipt = first.unwrap();
        assert_eq!(second.unwrap(), receipt);
        assert_eq!(
            bind_local_cache(state.local_store_for_test(), bind_request.clone()).unwrap(),
            receipt
        );
        assert_eq!(receipt.cache_id, "server-cache-1");
        let text = read_gzip(
            state
                .local_store_for_test()
                .open_decrypted_reader(
                    "server-cache-1",
                    &CacheScope {
                        user_id: "user-a".to_string(),
                        server_device_id: "device-1".to_string(),
                        source_id: "server-source-1".to_string(),
                        job_id: "job-1".to_string(),
                        ingestion_revision: "server-rev-1".to_string(),
                    },
                )
                .unwrap(),
        );
        assert!(text.contains("\"sourceId\":\"server-source-1\""));
        assert!(text.contains("\"ingestionRevision\":\"server-rev-1\""));
        assert!(text.contains("\"ordinal\":0"));
        assert!(text.contains("\"ordinal\":1"));
        assert!(!text.contains("local-rev-1"));
        assert!(state
            .local_store_for_test()
            .local_cache_path("local-cache-1")
            .unwrap()
            .exists());
        let mut stale = bind_request;
        stale.local_content_revision = "stale-revision".to_string();
        assert_eq!(
            bind_local_cache(state.local_store_for_test(), stale).unwrap_err(),
            "LOCAL_CACHE_SCOPE_MISMATCH"
        );
        let _ = fs::remove_dir_all(root);
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

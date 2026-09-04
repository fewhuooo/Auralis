use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Key, Nonce,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
};

pub const CACHE_ENVELOPE_VERSION: u32 = 1;
pub const CACHE_SCHEMA_VERSION: u32 = 1;
pub const CACHE_CHUNK_BYTES: usize = 4 * 1024 * 1024;
const CACHE_MAGIC: &[u8; 5] = b"AURC1";
const NONCE_BYTES: usize = 12;
const MAX_HEADER_BYTES: usize = 64 * 1024;

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
pub struct CacheReceipt {
    pub cache_id: String,
    pub envelope_version: u32,
    pub chunk_count: u32,
    pub encrypted_bytes: u64,
    pub plain_text_sha256: String,
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
        Ok(Self { root, key })
    }

    pub fn cache_path(&self, cache_id: &str) -> Result<PathBuf, String> {
        validate_cache_id(cache_id)?;
        Ok(self.root.join(format!("{cache_id}.cache")))
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
        let receipt = match self.encrypt_to_path(cache_id, &temp_path, header, gzip_path, plain_text_sha256) {
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

    fn encrypt_to_path(
        &self,
        cache_id: &str,
        path: &Path,
        header: &CacheHeader,
        gzip_path: &Path,
        plain_text_sha256: [u8; 32],
    ) -> Result<CacheReceipt, String> {
        let header_bytes = serde_json::to_vec(header).map_err(|e| format!("CACHE_HEADER_SERIALIZE_FAILED: {e}"))?;
        if header_bytes.len() > MAX_HEADER_BYTES {
            return Err("CACHE_HEADER_TOO_LARGE".to_string());
        }
        let mut input = File::open(gzip_path).map_err(|e| format!("CACHE_GZIP_OPEN_FAILED: {e}"))?;
        let mut output = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(path)
            .map_err(|e| format!("CACHE_TEMP_OPEN_FAILED: {e}"))?;
        let mut payload_hash = Sha256::new();
        let mut payload_bytes = 0u64;
        let mut write_payload = |bytes: &[u8]| -> Result<(), String> {
            payload_bytes = payload_bytes.saturating_add(bytes.len() as u64);
            write_hashed(&mut output, &mut payload_hash, bytes).map_err(|e| e.to_string())
        };
        write_payload(CACHE_MAGIC)?;
        write_payload(&(header_bytes.len() as u32).to_le_bytes())?;
        write_payload(&header_bytes)?;

        let aad = header.aad();
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.key));
        let mut buffer = vec![0u8; CACHE_CHUNK_BYTES];
        let mut chunk_count = 0u32;
        loop {
            let read = input.read(&mut buffer).map_err(|e| format!("CACHE_GZIP_READ_FAILED: {e}"))?;
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
            write_payload(&nonce_bytes)?;
            write_payload(&(ciphertext.len() as u32).to_le_bytes())?;
            write_payload(&ciphertext)?;
            chunk_count += 1;
        }
        output.flush().map_err(|e| format!("CACHE_FLUSH_FAILED: {e}"))?;
        output.sync_all().map_err(|e| format!("CACHE_SYNC_FAILED: {e}"))?;
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
        })
    }

    pub fn open_decrypted_reader(&self, cache_id: &str, scope: &CacheScope) -> Result<DecryptedCacheReader, String> {
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
            return Err(io::Error::new(io::ErrorKind::InvalidData, "CACHE_CHUNK_LENGTH_INVALID"));
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

fn write_hashed<W: Write>(writer: &mut W, hash: &mut Sha256, bytes: &[u8]) -> Result<(), String> {
    writer.write_all(bytes).map_err(|e| format!("CACHE_WRITE_FAILED: {e}"))?;
    hash.update(bytes);
    Ok(())
}

fn read_header(file: &mut File) -> Result<(CacheHeader, Vec<u8>), String> {
    let mut magic = [0u8; 5];
    file.read_exact(&mut magic).map_err(|e| format!("CACHE_HEADER_READ_FAILED: {e}"))?;
    if &magic != CACHE_MAGIC {
        return Err("CACHE_MAGIC_INVALID".to_string());
    }
    let mut length_bytes = [0u8; 4];
    file.read_exact(&mut length_bytes).map_err(|e| format!("CACHE_HEADER_READ_FAILED: {e}"))?;
    let length = u32::from_le_bytes(length_bytes) as usize;
    if length == 0 || length > MAX_HEADER_BYTES {
        return Err("CACHE_HEADER_LENGTH_INVALID".to_string());
    }
    let mut bytes = vec![0u8; length];
    file.read_exact(&mut bytes).map_err(|e| format!("CACHE_HEADER_READ_FAILED: {e}"))?;
    let header: CacheHeader = serde_json::from_slice(&bytes).map_err(|e| format!("CACHE_HEADER_INVALID: {e}"))?;
    if header.schema_version != CACHE_SCHEMA_VERSION {
        return Err("CACHE_SCHEMA_VERSION_UNSUPPORTED".to_string());
    }
    Ok((header.clone(), header.aad()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::{write::GzEncoder, Compression};
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
        assert!(!stored_bytes.windows(b"plain text".len()).any(|window| window == b"plain text"));
        let mut reader = store.open_decrypted_reader("cache-1", &scope()).unwrap();
        let mut encrypted_gzip = Vec::new();
        reader.read_to_end(&mut encrypted_gzip).unwrap();
        assert!(!encrypted_gzip.is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn cache_rejects_tamper_and_cross_user_access() {
        let root = temp_root("cache-tamper");
        let gzip = gzip_file(&root, b"payload");
        let store = DocumentCacheStore::new(root.join("cache"), [3u8; 32]).unwrap();
        store.encrypt_gzip_file("cache-1", &header(), &gzip, [1u8; 32]).unwrap();
        let foreign = CacheScope { user_id: "user-b".to_string(), ..scope() };
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
        let receipt = store.encrypt_gzip_file("cache-1", &header(), &gzip, [2u8; 32]).unwrap();
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
}

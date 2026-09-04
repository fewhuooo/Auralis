use crate::document_cache::CacheScope;
use crate::document_packager::DocumentPackagerState;
use reqwest::blocking::{Body, Client};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_LENGTH};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    io::{self, Read},
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::State;

const MAX_UPLOAD_HEADERS: usize = 32;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentUploadPutRequest {
    pub upload_url: String,
    pub cache_id: String,
    pub user_id: String,
    pub server_device_id: String,
    pub source_id: String,
    pub job_id: String,
    pub ingestion_revision: String,
    pub headers: HashMap<String, String>,
    pub expected_size: u64,
    pub expected_payload_sha256: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentUploadPutReceipt {
    pub status: u16,
    pub bytes_sent: u64,
    pub payload_sha256: String,
}

#[derive(Default)]
struct UploadMetrics {
    bytes: u64,
    hash: Sha256,
    error: Option<String>,
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
                    metrics.error = Some(error.to_string());
                }
                return Err(error);
            }
        };
        if count > 0 {
            let mut metrics = self
                .metrics
                .lock()
                .map_err(|_| io::Error::other("UPLOAD_METRICS_LOCK_FAILED"))?;
            metrics.bytes = metrics.bytes.saturating_add(count as u64);
            metrics.hash.update(&output[..count]);
        }
        Ok(count)
    }
}

fn validate_request(request: &DocumentUploadPutRequest) -> Result<(), String> {
    for value in [
        &request.upload_url,
        &request.cache_id,
        &request.user_id,
        &request.server_device_id,
        &request.source_id,
        &request.job_id,
        &request.ingestion_revision,
    ] {
        if value.trim().is_empty() {
            return Err("DOCUMENT_UPLOAD_REQUEST_INVALID".to_string());
        }
    }
    let url = reqwest::Url::parse(&request.upload_url)
        .map_err(|_| "DOCUMENT_UPLOAD_URL_INVALID".to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("DOCUMENT_UPLOAD_URL_INVALID".to_string());
    }
    if request.expected_size == 0
        || request.expected_payload_sha256.len() != 64
        || !request
            .expected_payload_sha256
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
        || request.headers.len() > MAX_UPLOAD_HEADERS
    {
        return Err("DOCUMENT_UPLOAD_REQUEST_INVALID".to_string());
    }
    for (name, value) in &request.headers {
        HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| "DOCUMENT_UPLOAD_HEADER_INVALID".to_string())?;
        HeaderValue::from_str(value).map_err(|_| "DOCUMENT_UPLOAD_HEADER_INVALID".to_string())?;
    }
    Ok(())
}

fn build_headers(request: &DocumentUploadPutRequest) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    for (name, value) in &request.headers {
        let name = HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| "DOCUMENT_UPLOAD_HEADER_INVALID".to_string())?;
        let value = HeaderValue::from_str(value)
            .map_err(|_| "DOCUMENT_UPLOAD_HEADER_INVALID".to_string())?;
        headers.insert(name, value);
    }
    headers.insert(
        CONTENT_LENGTH,
        HeaderValue::from_str(&request.expected_size.to_string())
            .map_err(|_| "DOCUMENT_UPLOAD_REQUEST_INVALID".to_string())?,
    );
    Ok(headers)
}

#[tauri::command]
pub fn document_upload_put(
    request: DocumentUploadPutRequest,
    state: State<'_, DocumentPackagerState>,
) -> Result<DocumentUploadPutReceipt, String> {
    validate_request(&request)?;
    let scope = CacheScope {
        user_id: request.user_id.clone(),
        server_device_id: request.server_device_id.clone(),
        source_id: request.source_id.clone(),
        job_id: request.job_id.clone(),
        ingestion_revision: request.ingestion_revision.clone(),
    };
    let reader = state.open_decrypted_reader(&request.cache_id, &scope)?;
    let metrics = Arc::new(Mutex::new(UploadMetrics::default()));
    let body = Body::new(HashingReader {
        inner: reader,
        metrics: metrics.clone(),
    });
    let response = Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|_| "NETWORK_OFFLINE".to_string())?
        .put(&request.upload_url)
        .headers(build_headers(&request)?)
        .body(body)
        .send()
        .map_err(|_| {
            if metrics
                .lock()
                .map(|metrics| metrics.error.is_some())
                .unwrap_or(false)
            {
                "CACHE_READ_FAILED".to_string()
            } else {
                "NETWORK_OFFLINE".to_string()
            }
        })?;
    let status = response.status().as_u16();
    if status == 401 || status == 403 {
        return Err("DOCUMENT_UPLOAD_INTENT_EXPIRED".to_string());
    }
    if status == 408 || status == 425 || status == 429 || status >= 500 {
        return Err("DOCUMENT_UPLOAD_RETRYABLE".to_string());
    }
    if !response.status().is_success() {
        return Err(format!("DOCUMENT_UPLOAD_FAILED:{status}"));
    }
    let metrics = metrics
        .lock()
        .map_err(|_| "UPLOAD_METRICS_LOCK_FAILED".to_string())?;
    let payload_sha256 = hex::encode(metrics.hash.clone().finalize());
    if metrics.bytes != request.expected_size
        || !payload_sha256.eq_ignore_ascii_case(&request.expected_payload_sha256)
    {
        return Err("DOCUMENT_UPLOAD_PAYLOAD_MISMATCH".to_string());
    }
    Ok(DocumentUploadPutReceipt {
        status,
        bytes_sent: metrics.bytes,
        payload_sha256,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn request() -> DocumentUploadPutRequest {
        DocumentUploadPutRequest {
            upload_url: "https://storage.example/upload".to_string(),
            cache_id: "cache-1".to_string(),
            user_id: "user-1".to_string(),
            server_device_id: "device-1".to_string(),
            source_id: "source-1".to_string(),
            job_id: "job-1".to_string(),
            ingestion_revision: "revision-1".to_string(),
            headers: HashMap::from([(
                String::from("Content-Type"),
                String::from("application/gzip"),
            )]),
            expected_size: 4,
            expected_payload_sha256: "a".repeat(64),
        }
    }

    #[test]
    fn upload_request_rejects_non_http_urls_and_bad_hashes() {
        let mut invalid = request();
        invalid.upload_url = "file:///tmp/payload".to_string();
        assert_eq!(
            validate_request(&invalid),
            Err("DOCUMENT_UPLOAD_URL_INVALID".to_string())
        );
        let mut invalid = request();
        invalid.expected_payload_sha256 = "not-a-hash".to_string();
        assert_eq!(
            validate_request(&invalid),
            Err("DOCUMENT_UPLOAD_REQUEST_INVALID".to_string())
        );
    }

    #[test]
    fn hashing_reader_reports_exact_payload_size_and_sha256() {
        let metrics = Arc::new(Mutex::new(UploadMetrics::default()));
        let mut reader = HashingReader {
            inner: Cursor::new(b"test".to_vec()),
            metrics: metrics.clone(),
        };
        let mut output = Vec::new();
        reader.read_to_end(&mut output).unwrap();
        let metrics = metrics.lock().unwrap();
        assert_eq!(metrics.bytes, 4);
        assert_eq!(
            hex::encode(metrics.hash.clone().finalize()),
            hex::encode(Sha256::digest(b"test"))
        );
    }
}

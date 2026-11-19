use crate::document_cache::{CacheScope, DecryptedCacheReader};
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
const MAX_UPLOAD_ERROR_SUMMARY_BYTES: usize = 256;
const MAX_UPLOAD_ERROR_DIAGNOSTICS_BYTES: usize = 256;
const MAX_UPLOAD_ERROR_CAUSES: usize = 3;

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

fn upload_transport_error_code(
    cache_read_failed: bool,
    timed_out: bool,
    connect_failed: bool,
    body_failed: bool,
) -> &'static str {
    if cache_read_failed {
        "CACHE_READ_FAILED"
    } else if timed_out {
        "NETWORK_OFFLINE:timeout"
    } else if connect_failed {
        "NETWORK_OFFLINE:connect"
    } else if body_failed {
        "NETWORK_OFFLINE:body"
    } else {
        "NETWORK_OFFLINE:request"
    }
}

fn upload_client_error_code() -> &'static str {
    "NETWORK_OFFLINE:client"
}

fn upload_error_flags(error: &reqwest::Error) -> String {
    let mut flags = Vec::new();
    if error.is_timeout() {
        flags.push("timeout");
    }
    if error.is_connect() {
        flags.push("connect");
    }
    if error.is_body() {
        flags.push("body");
    }
    if error.is_request() {
        flags.push("request");
    }
    if error.is_builder() {
        flags.push("builder");
    }
    if error.is_redirect() {
        flags.push("redirect");
    }
    if error.is_status() {
        flags.push("status");
    }
    if error.is_decode() {
        flags.push("decode");
    }
    if flags.is_empty() {
        flags.push("none");
    }
    flags.join(",")
}

fn sanitize_upload_error_summary(raw: &str) -> String {
    let normalized: String = raw
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect();
    let mut output = String::new();
    let mut redact_next = false;

    for token in normalized.split_whitespace() {
        let lower = token.to_ascii_lowercase();
        let sanitized = if redact_next {
            redact_next = lower == "bearer";
            "<redacted>"
        } else if lower.contains("authorization")
            || lower == "bearer"
            || lower.contains("x-amz-")
            || lower.starts_with("content-type:")
            || lower.starts_with("content-length:")
            || lower.starts_with("host:")
            || lower.starts_with("user-agent:")
            || lower.starts_with("cookie:")
        {
            redact_next = lower.ends_with(':') || lower == "bearer";
            "<redacted>"
        } else if lower.contains("://") || lower.starts_with("www.") {
            "<url-redacted>"
        } else if lower.starts_with('/')
            || (token.len() >= 3
                && token.as_bytes()[1] == b':'
                && (token.as_bytes()[2] == b'\\' || token.as_bytes()[2] == b'/'))
            || token.contains("\\")
        {
            "<path-redacted>"
        } else if lower.starts_with("path=") || lower.starts_with("file=") {
            "<path-redacted>"
        } else if let Some(index) = token.find(|character| matches!(character, '?' | '&' | '=')) {
            if index == 0 {
                "<redacted>"
            } else {
                &token[..index]
            }
        } else {
            token
        };

        if sanitized.is_empty() {
            continue;
        }
        let separator = if output.is_empty() { 0 } else { 1 };
        if output.len() + separator + sanitized.len() > MAX_UPLOAD_ERROR_SUMMARY_BYTES {
            break;
        }
        if separator != 0 {
            output.push(' ');
        }
        output.push_str(sanitized);
    }

    if output.is_empty() {
        "<empty>".to_string()
    } else {
        output
    }
}

fn classify_upload_error_cause(raw: &str) -> &'static str {
    let lower = raw.to_ascii_lowercase();
    if lower.contains("connection") || lower.contains("connect") {
        "connection"
    } else if lower.contains("cancel") {
        "canceled"
    } else if lower.contains("channel") {
        "channel"
    } else if lower.contains("timeout") {
        "timeout"
    } else if lower.contains("redirect") {
        "redirect"
    } else if lower.contains("status") {
        "status"
    } else if lower.contains("decode") {
        "decode"
    } else if lower.contains("body") {
        "body"
    } else {
        "cause"
    }
}

fn sanitize_upload_error_source_chain(error: &(dyn std::error::Error + 'static)) -> String {
    let mut output = String::new();
    let mut current = error.source();
    let mut seen = Vec::new();
    let mut depth = 0;

    while let Some(cause) = current {
        if depth >= MAX_UPLOAD_ERROR_CAUSES {
            break;
        }
        let address = cause as *const (dyn std::error::Error + 'static) as *const () as usize;
        if seen.contains(&address) {
            break;
        }
        seen.push(address);

        let raw = cause.to_string();
        let class = classify_upload_error_cause(&raw);
        let summary = sanitize_upload_error_summary(&raw);
        let item = format!("cause{depth}={class}:{summary}");
        let separator = if output.is_empty() { 0 } else { 1 };
        if output.len() + separator + item.len() > MAX_UPLOAD_ERROR_DIAGNOSTICS_BYTES {
            break;
        }
        if separator != 0 {
            output.push('|');
        }
        output.push_str(&item);
        depth += 1;
        current = cause.source();
    }

    output
}

fn truncate_upload_diagnostic(value: &str, max_bytes: usize) -> String {
    let mut output = String::new();
    for character in value.chars() {
        if output.len() + character.len_utf8() > max_bytes {
            break;
        }
        output.push(character);
    }
    output
}

fn format_upload_error_diagnostics(flags: &str, summary: &str, causes: &str) -> String {
    let prefix = format!("flags={flags} summary=");
    if causes.is_empty() {
        return truncate_upload_diagnostic(
            &format!("{prefix}{summary}"),
            MAX_UPLOAD_ERROR_DIAGNOSTICS_BYTES,
        );
    }

    let causes_marker = " causes=";
    let field_budget = MAX_UPLOAD_ERROR_DIAGNOSTICS_BYTES
        .saturating_sub(prefix.len())
        .saturating_sub(causes_marker.len());
    let summary_budget = field_budget.min(96);
    let causes_budget = field_budget.saturating_sub(summary_budget);
    format!(
        "{}{}{}{}",
        prefix,
        truncate_upload_diagnostic(summary, summary_budget),
        causes_marker,
        truncate_upload_diagnostic(causes, causes_budget),
    )
}

#[tauri::command]
pub async fn document_upload_put(
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
    tauri::async_runtime::spawn_blocking(move || execute_document_upload_put(request, reader))
        .await
        .map_err(|_| "DOCUMENT_UPLOAD_TASK_JOIN_FAILED".to_string())?
}

fn execute_document_upload_put(
    request: DocumentUploadPutRequest,
    reader: DecryptedCacheReader,
) -> Result<DocumentUploadPutReceipt, String> {
    let metrics = Arc::new(Mutex::new(UploadMetrics::default()));
    let body = Body::sized(
        HashingReader {
            inner: reader,
            metrics: metrics.clone(),
        },
        request.expected_size,
    );
    let response = Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|error| {
            let code = upload_client_error_code();
            eprintln!("[Document Upload] HTTP client setup failed: {code} ({error})");
            code.to_string()
        })?
        .put(&request.upload_url)
        .headers(build_headers(&request)?)
        .body(body)
        .send()
        .map_err(|error| {
            let cache_read_failed = metrics
                .lock()
                .map(|metrics| metrics.error.is_some())
                .unwrap_or(false);
            let code = upload_transport_error_code(
                cache_read_failed,
                error.is_timeout(),
                error.is_connect(),
                error.is_body(),
            );
            let flags = upload_error_flags(&error);
            let without_url = error.without_url();
            let summary = sanitize_upload_error_summary(&without_url.to_string());
            let causes = sanitize_upload_error_source_chain(&without_url);
            let diagnostics = format_upload_error_diagnostics(&flags, &summary, &causes);
            eprintln!("[Document Upload] PUT failed: {code} {diagnostics}");
            code.to_string()
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

    #[test]
    fn upload_transport_diagnostics_keep_a_stable_public_error_prefix() {
        assert_eq!(
            upload_transport_error_code(false, false, true, false),
            "NETWORK_OFFLINE:connect"
        );
        assert_eq!(
            upload_transport_error_code(false, true, false, false),
            "NETWORK_OFFLINE:timeout"
        );
        assert_eq!(
            upload_transport_error_code(false, false, false, true),
            "NETWORK_OFFLINE:body"
        );
        assert_eq!(
            upload_transport_error_code(false, false, false, false),
            "NETWORK_OFFLINE:request"
        );
        assert_eq!(
            upload_transport_error_code(true, false, true, false),
            "CACHE_READ_FAILED"
        );
    }

    #[test]
    fn upload_client_setup_failure_keeps_a_network_diagnostic_suffix() {
        assert_eq!(upload_client_error_code(), "NETWORK_OFFLINE:client");
    }

    #[test]
    fn upload_error_summary_redacts_urls_credentials_paths_and_controls() {
        let raw = "builder failed https://storage.example/bucket/object?X-Amz-Signature=secret \
            Authorization: Bearer secret-token Content-Type: application/octet-stream \
            path=/var/tmp/payload C:\\Users\\alice\\payload.cache /var/tmp/payload\\n\r\nnext";
        let summary = sanitize_upload_error_summary(raw);

        assert!(!summary.contains("https://"));
        assert!(!summary.contains("storage.example"));
        assert!(!summary.contains("X-Amz-Signature"));
        assert!(!summary.contains("secret-token"));
        assert!(!summary.contains("application/octet-stream"));
        assert!(!summary.contains("path=/var/tmp"));
        assert!(!summary.contains("C:\\"));
        assert!(!summary.contains("/var/tmp"));
        assert!(!summary.contains('\n'));
        assert!(!summary.contains('\r'));
        assert!(summary.contains("builder failed"));
    }

    #[test]
    fn upload_error_summary_is_bounded_and_removes_sensitive_query_tokens() {
        let raw = format!(
            "request failed?signature=secret&token=secret {}",
            "safe-word ".repeat(200)
        );
        let summary = sanitize_upload_error_summary(&raw);

        assert!(summary.len() <= MAX_UPLOAD_ERROR_SUMMARY_BYTES);
        assert!(!summary.contains("signature"));
        assert!(!summary.contains("secret"));
        assert!(summary.contains("request failed"));
    }

    #[derive(Debug)]
    struct TestCause {
        message: &'static str,
        source: Option<Box<TestCause>>,
    }

    impl std::fmt::Display for TestCause {
        fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            formatter.write_str(self.message)
        }
    }

    impl std::error::Error for TestCause {
        fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
            self.source
                .as_deref()
                .map(|source| source as &(dyn std::error::Error + 'static))
        }
    }

    #[test]
    fn upload_error_source_chain_keeps_safe_bottom_causes_and_redacts_sensitive_values() {
        let error = TestCause {
            message: "error sending request",
            source: Some(Box::new(TestCause {
                message: "connection closed before message completed https://storage.example/a?sig=secret Authorization: Bearer token",
                source: Some(Box::new(TestCause {
                    message: "operation was canceled C:\\Users\\alice\\payload /var/tmp/cache",
                    source: Some(Box::new(TestCause {
                        message: "channel closed",
                        source: None,
                    })),
                })),
            })),
        };

        let diagnostics = sanitize_upload_error_source_chain(&error);

        assert!(diagnostics.len() <= MAX_UPLOAD_ERROR_DIAGNOSTICS_BYTES);
        assert!(diagnostics.contains("connection closed before message completed"));
        assert!(diagnostics.contains("operation was canceled"));
        assert!(diagnostics.contains("channel closed"));
        assert!(!diagnostics.contains("https://"));
        assert!(!diagnostics.contains("storage.example"));
        assert!(!diagnostics.contains("sig=secret"));
        assert!(!diagnostics.contains("Authorization"));
        assert!(!diagnostics.contains("token"));
        assert!(!diagnostics.contains("C:\\Users"));
        assert!(!diagnostics.contains("/var/tmp"));
        assert!(!diagnostics.contains('\n'));
        assert!(!diagnostics.contains('\r'));
    }

    #[test]
    fn upload_error_diagnostics_keep_the_combined_log_fields_bounded() {
        let diagnostics = format_upload_error_diagnostics(
            "request,builder",
            &"top ".repeat(100),
            &"cause0=connection:bottom ".repeat(100),
        );

        assert!(diagnostics.len() <= MAX_UPLOAD_ERROR_DIAGNOSTICS_BYTES);
        assert!(diagnostics.starts_with("flags=request,builder summary="));
    }
}

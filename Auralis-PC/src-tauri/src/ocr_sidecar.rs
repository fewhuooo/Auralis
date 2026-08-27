use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt::{Display, Formatter};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Mutex, TryLockError};
use std::thread;
use std::time::Duration;
use tauri::State;

pub const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;
pub const MAX_TIMEOUT_MS: u64 = 120_000;
pub const MAX_RESTARTS: u8 = 2;
const MAX_QUEUE_DEPTH: usize = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OcrError {
    ProtocolInvalid,
    ImageTooLarge,
    QueueFull,
    Timeout,
    SidecarUnavailable,
    SidecarProtocol,
}

impl OcrError {
    fn code(self) -> &'static str {
        match self {
            Self::ProtocolInvalid => "OCR_PROTOCOL_INVALID",
            Self::ImageTooLarge => "OCR_IMAGE_TOO_LARGE",
            Self::QueueFull => "OCR_QUEUE_FULL",
            Self::Timeout => "OCR_TIMEOUT",
            Self::SidecarUnavailable => "OCR_SIDECAR_UNAVAILABLE",
            Self::SidecarProtocol => "OCR_PROTOCOL_INVALID",
        }
    }
}

impl Display for OcrError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.code())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrPageCommand {
    pub task_id: String,
    pub page_number: u32,
    pub image_bytes: Vec<u8>,
    pub timeout_ms: u64,
}

impl OcrPageCommand {
    #[cfg(test)]
    fn new(task_id: &str, page_number: u32, image_bytes: Vec<u8>, timeout_ms: u64) -> Self {
        Self {
            task_id: task_id.to_owned(),
            page_number,
            image_bytes,
            timeout_ms,
        }
    }
}

pub fn validate_page_command(command: &OcrPageCommand) -> Result<(), OcrError> {
    if command.task_id.trim().is_empty()
        || command.task_id.len() > 128
        || command.page_number == 0
        || command.timeout_ms == 0
        || command.timeout_ms > MAX_TIMEOUT_MS
    {
        return Err(OcrError::ProtocolInvalid);
    }
    if command.image_bytes.len() > MAX_IMAGE_BYTES {
        return Err(OcrError::ImageTooLarge);
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrLine {
    pub text: String,
    pub score: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrTimingMs {
    pub det: f64,
    pub rec: f64,
    pub total: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrPageResult {
    pub protocol_version: u8,
    pub ok: bool,
    pub task_id: String,
    pub page_number: u32,
    pub lines: Vec<OcrLine>,
    pub timing_ms: OcrTimingMs,
    pub error_code: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrWarmupView {
    pub ready: bool,
    pub restart_count: u8,
    pub error_code: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SidecarRequest {
    protocol_version: u8,
    task_id: String,
    page_number: u32,
    image_path: String,
    timeout_ms: u64,
}

pub struct RequestGate {
    active: AtomicUsize,
    capacity: usize,
}

impl RequestGate {
    pub fn new(capacity: usize) -> Self {
        Self {
            active: AtomicUsize::new(0),
            capacity,
        }
    }

    pub fn try_acquire(&self) -> bool {
        let mut current = self.active.load(Ordering::Acquire);
        loop {
            if current >= self.capacity {
                return false;
            }
            match self.active.compare_exchange_weak(
                current,
                current + 1,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => return true,
                Err(next) => current = next,
            }
        }
    }

    pub fn release(&self) {
        self.active.fetch_sub(1, Ordering::AcqRel);
    }
}

pub struct RestartBudget {
    limit: u8,
    used: u8,
}

impl RestartBudget {
    pub fn new(limit: u8) -> Self {
        Self { limit, used: 0 }
    }

    pub fn try_restart(&mut self) -> bool {
        if self.used >= self.limit {
            return false;
        }
        self.used += 1;
        true
    }

    pub fn count(&self) -> u8 {
        self.used
    }
}

struct SidecarSession {
    child: Child,
    stdin: ChildStdin,
    responses: Receiver<String>,
}

impl SidecarSession {
    fn spawn(resource_dir: &Path, image_root: &Path) -> Result<Self, OcrError> {
        let executable = resolve_sidecar_executable(resource_dir)?;
        let resources = resource_dir.join("ocr-sidecar").join("resources");
        let manifest = resource_dir.join("ocr-sidecar").join("model_manifest.json");
        let mut child = Command::new(executable)
            .arg("--resources")
            .arg(resources)
            .arg("--manifest")
            .arg(manifest)
            .arg("--allowed-image-root")
            .arg(image_root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| OcrError::SidecarUnavailable)?;

        let stdin = child.stdin.take().ok_or(OcrError::SidecarUnavailable)?;
        let stdout = child.stdout.take().ok_or(OcrError::SidecarUnavailable)?;
        let (sender, responses) = mpsc::channel();
        thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();
            while reader.read_line(&mut line).is_ok() {
                if line.is_empty() || sender.send(line.clone()).is_err() {
                    break;
                }
                line.clear();
            }
        });

        Ok(Self {
            child,
            stdin,
            responses,
        })
    }

    fn request(&mut self, request: &SidecarRequest) -> Result<OcrPageResult, OcrError> {
        let serialized = serde_json::to_string(request).map_err(|_| OcrError::SidecarProtocol)?;
        self.stdin
            .write_all(serialized.as_bytes())
            .and_then(|_| self.stdin.write_all(b"\n"))
            .and_then(|_| self.stdin.flush())
            .map_err(|_| OcrError::SidecarUnavailable)?;

        let response = self
            .responses
            .recv_timeout(Duration::from_millis(request.timeout_ms))
            .map_err(|error| match error {
                RecvTimeoutError::Timeout => OcrError::Timeout,
                RecvTimeoutError::Disconnected => OcrError::SidecarUnavailable,
            })?;
        serde_json::from_str(response.trim()).map_err(|_| OcrError::SidecarProtocol)
    }
}

impl Drop for SidecarSession {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn resolve_sidecar_executable(resource_dir: &Path) -> Result<PathBuf, OcrError> {
    #[cfg(target_os = "windows")]
    let filename = "auralis-ocr-x86_64-pc-windows-msvc.exe";
    #[cfg(not(target_os = "windows"))]
    let filename = "auralis-ocr-x86_64-unknown-linux-gnu";

    let candidates = [
        resource_dir.join("binaries").join(filename),
        resource_dir.join(filename),
        resource_dir.join("sidecar").join(filename),
        resource_dir.join("auralis_ocr.exe"),
        resource_dir.join("auralis-ocr.exe"),
        resource_dir.join("Bin_auralis_ocr.exe"),
    ];
    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .ok_or(OcrError::SidecarUnavailable)
}

pub struct OcrSupervisor {
    resource_dir: PathBuf,
    image_root: PathBuf,
    session: Option<SidecarSession>,
    restart_budget: RestartBudget,
}

impl OcrSupervisor {
    pub fn new(resource_dir: PathBuf, image_root: PathBuf) -> Self {
        Self {
            resource_dir,
            image_root,
            session: None,
            restart_budget: RestartBudget::new(MAX_RESTARTS),
        }
    }

    fn ensure_session(&mut self) -> Result<(), OcrError> {
        if self.session.is_none() {
            std::fs::create_dir_all(&self.image_root).map_err(|_| OcrError::SidecarUnavailable)?;
            self.session = Some(SidecarSession::spawn(&self.resource_dir, &self.image_root)?);
        }
        Ok(())
    }

    fn warmup(&mut self) -> OcrWarmupView {
        match self.ensure_session() {
            Ok(()) => OcrWarmupView {
                ready: true,
                restart_count: self.restart_budget.count(),
                error_code: None,
            },
            Err(error) => OcrWarmupView {
                ready: false,
                restart_count: self.restart_budget.count(),
                error_code: Some(error.code().to_owned()),
            },
        }
    }

    fn recognize(&mut self, command: OcrPageCommand) -> Result<OcrPageResult, OcrError> {
        validate_page_command(&command)?;
        std::fs::create_dir_all(&self.image_root).map_err(|_| OcrError::SidecarUnavailable)?;
        let image_path = self
            .image_root
            .join(unique_image_name(&command.task_id, command.page_number));
        std::fs::write(&image_path, &command.image_bytes)
            .map_err(|_| OcrError::SidecarUnavailable)?;
        let request = SidecarRequest {
            protocol_version: 1,
            task_id: command.task_id.clone(),
            page_number: command.page_number,
            image_path: image_path.to_string_lossy().into_owned(),
            timeout_ms: command.timeout_ms,
        };

        let result = loop {
            self.ensure_session()?;
            let response = self
                .session
                .as_mut()
                .ok_or(OcrError::SidecarUnavailable)?
                .request(&request);
            match response {
                Ok(result) => break Ok(result),
                Err(error) if matches!(error, OcrError::Timeout | OcrError::SidecarUnavailable) => {
                    self.session = None;
                    if self.restart_budget.try_restart() {
                        continue;
                    }
                    break Err(error);
                }
                Err(error) => break Err(error),
            }
        };
        let _ = std::fs::remove_file(&image_path);
        result
    }

    fn shutdown(&mut self) {
        self.session = None;
    }
}

pub struct OcrSupervisorState {
    supervisor: Mutex<OcrSupervisor>,
    gate: RequestGate,
}

impl OcrSupervisorState {
    pub fn new(resource_dir: PathBuf, image_root: PathBuf) -> Self {
        Self {
            supervisor: Mutex::new(OcrSupervisor::new(resource_dir, image_root)),
            gate: RequestGate::new(MAX_QUEUE_DEPTH),
        }
    }
}

struct SupervisorGuard<'a> {
    supervisor: std::sync::MutexGuard<'a, OcrSupervisor>,
    gate: &'a RequestGate,
}

impl std::ops::Deref for SupervisorGuard<'_> {
    type Target = OcrSupervisor;

    fn deref(&self) -> &Self::Target {
        &self.supervisor
    }
}

impl std::ops::DerefMut for SupervisorGuard<'_> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.supervisor
    }
}

impl Drop for SupervisorGuard<'_> {
    fn drop(&mut self) {
        self.gate.release();
    }
}

fn lock_state<'a>(state: &'a State<'_, OcrSupervisorState>) -> Result<SupervisorGuard<'a>, String> {
    if !state.gate.try_acquire() {
        return Err(OcrError::QueueFull.to_string());
    }
    match state.supervisor.try_lock() {
        Ok(supervisor) => Ok(SupervisorGuard {
            supervisor,
            gate: &state.gate,
        }),
        Err(TryLockError::WouldBlock) => {
            state.gate.release();
            Err(OcrError::QueueFull.to_string())
        }
        Err(TryLockError::Poisoned(_)) => {
            state.gate.release();
            Err(OcrError::SidecarUnavailable.to_string())
        }
    }
}

#[tauri::command]
pub fn ocr_warmup(state: State<'_, OcrSupervisorState>) -> Result<OcrWarmupView, String> {
    Ok(lock_state(&state)?.warmup())
}

#[tauri::command]
pub fn ocr_recognize_page(
    state: State<'_, OcrSupervisorState>,
    command: OcrPageCommand,
) -> Result<OcrPageResult, String> {
    lock_state(&state)?
        .recognize(command)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn ocr_shutdown(state: State<'_, OcrSupervisorState>) -> Result<(), String> {
    lock_state(&state)?.shutdown();
    Ok(())
}

fn unique_image_name(task_id: &str, page_number: u32) -> String {
    let mut random = [0_u8; 16];
    rand::thread_rng().fill_bytes(&mut random);
    let mut digest = Sha256::new();
    digest.update(task_id.as_bytes());
    digest.update(page_number.to_le_bytes());
    digest.update(random);
    format!("{}.png", hex::encode(digest.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn queue_rejects_more_than_one_pending_request() {
        let gate = RequestGate::new(MAX_QUEUE_DEPTH);
        assert!(gate.try_acquire());
        assert!(!gate.try_acquire());
        gate.release();
        assert!(gate.try_acquire());
    }

    #[test]
    fn timeout_and_image_size_are_bounded() {
        let too_fast = OcrPageCommand::new("task-1", 1, vec![0; 4], 0);
        assert_eq!(
            validate_page_command(&too_fast),
            Err(OcrError::ProtocolInvalid)
        );

        let too_slow = OcrPageCommand::new("task-1", 1, vec![0; 4], MAX_TIMEOUT_MS + 1);
        assert_eq!(
            validate_page_command(&too_slow),
            Err(OcrError::ProtocolInvalid)
        );

        let too_large =
            OcrPageCommand::new("task-1", 1, vec![0; MAX_IMAGE_BYTES + 1], MAX_TIMEOUT_MS);
        assert_eq!(
            validate_page_command(&too_large),
            Err(OcrError::ImageTooLarge)
        );
    }

    #[test]
    fn supervisor_allows_at_most_two_restarts() {
        let mut budget = RestartBudget::new(MAX_RESTARTS);
        assert!(budget.try_restart());
        assert!(budget.try_restart());
        assert!(!budget.try_restart());
    }

    #[test]
    fn resolver_accepts_tauri_msi_external_bin_name() {
        let root = std::env::temp_dir().join(format!(
            "auralis-ocr-resolver-test-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&root).expect("create resolver test directory");
        let installed = root.join("auralis_ocr.exe");
        std::fs::write(&installed, b"test").expect("write installed sidecar marker");

        let resolved = resolve_sidecar_executable(&root).expect("resolve installed sidecar");
        assert_eq!(resolved, installed);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn resolver_accepts_wix_external_bin_file_name() {
        let root = std::env::temp_dir().join(format!(
            "auralis-ocr-wix-resolver-test-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&root).expect("create WiX resolver test directory");
        let installed = root.join("Bin_auralis_ocr.exe");
        std::fs::write(&installed, b"test").expect("write WiX installed sidecar marker");

        let resolved = resolve_sidecar_executable(&root).expect("resolve WiX sidecar");
        assert_eq!(resolved, installed);

        let _ = std::fs::remove_dir_all(root);
    }
}

use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::VecDeque;
use std::fmt::{Display, Formatter};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex, TryLockError};
use std::thread;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
use tauri::State;

#[cfg(windows)]
use std::os::windows::io::AsRawHandle;

pub const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;
pub const MAX_TIMEOUT_MS: u64 = 120_000;
pub const MAX_RESTARTS: u8 = 2;
const MAX_QUEUE_DEPTH: usize = 1;
const MAX_STDERR_LINES: usize = 20;
const MAX_STDERR_LINE_CHARS: usize = 1_024;
const MAX_PAGE_SUMMARY_CHARS: usize = 512;
const MAX_PAGE_SUMMARY_TOKEN_CHARS: usize = 64;
const CHILD_CLEANUP_TIMEOUT: Duration = Duration::from_secs(2);
const READER_JOIN_TIMEOUT: Duration = Duration::from_millis(250);
const WARMUP_PNG: &[u8] = &[
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0,
    0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 8, 215, 99, 248, 255, 255, 63, 0, 5, 254,
    2, 254, 220, 204, 89, 231, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OcrError {
    ProtocolInvalid,
    ImageTooLarge,
    QueueFull,
    Timeout,
    SidecarUnavailable,
    SidecarUnavailableDiagnostic(String),
    SidecarProtocol,
    SidecarProtocolDiagnostic(String),
}

impl OcrError {
    fn code(&self) -> &'static str {
        match self {
            Self::ProtocolInvalid => "OCR_PROTOCOL_INVALID",
            Self::ImageTooLarge => "OCR_IMAGE_TOO_LARGE",
            Self::QueueFull => "OCR_QUEUE_FULL",
            Self::Timeout => "OCR_TIMEOUT",
            Self::SidecarUnavailable | Self::SidecarUnavailableDiagnostic(_) => {
                "OCR_SIDECAR_UNAVAILABLE"
            }
            Self::SidecarProtocol | Self::SidecarProtocolDiagnostic(_) => "OCR_PROTOCOL_INVALID",
        }
    }
}

impl Display for OcrError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::SidecarUnavailableDiagnostic(detail) => {
                if detail.starts_with("OCR_SIDECAR_UNAVAILABLE:") {
                    formatter.write_str(detail)
                } else {
                    write!(formatter, "{}:{detail}", self.code())
                }
            }
            Self::SidecarProtocolDiagnostic(detail) => {
                if detail.starts_with("OCR_SIDECAR_PROTOCOL_INVALID:") {
                    formatter.write_str(detail)
                } else {
                    write!(formatter, "OCR_SIDECAR_PROTOCOL_INVALID:{detail}")
                }
            }
            _ => formatter.write_str(self.code()),
        }
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

fn bounded_summary_task_id(value: &str) -> String {
    value
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '_' | '-' | '.')
        })
        .take(MAX_PAGE_SUMMARY_TOKEN_CHARS)
        .collect()
}

fn bounded_summary_error_code(value: &str) -> String {
    value
        .chars()
        .take_while(|character| {
            !character.is_whitespace()
                && *character != '/'
                && *character != '\\'
                && *character != ':'
        })
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
        .take(MAX_PAGE_SUMMARY_TOKEN_CHARS)
        .collect()
}

fn bounded_summary_total_ms(value: f64) -> String {
    if !value.is_finite() || value <= 0.0 {
        return "0".to_owned();
    }
    let rendered = value.to_string();
    if rendered.len() <= 24 {
        rendered
    } else {
        format!("{value:.6e}")
    }
}

fn format_page_summary(
    task_id: &str,
    page_number: u32,
    image_bytes: usize,
    ok: bool,
    line_count: usize,
    total_ms: f64,
    restart_count: u8,
    error_code: Option<&str>,
) -> String {
    let task_id = bounded_summary_task_id(task_id);
    let error_code = error_code
        .map(bounded_summary_error_code)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "none".to_owned());
    let summary = format!(
        "[OCR Page] task_id={task_id} page={page_number} image_bytes={image_bytes} ok={ok} line_count={line_count} total_ms={} restart_count={restart_count} error_code={error_code}",
        bounded_summary_total_ms(total_ms),
    );
    summary.chars().take(MAX_PAGE_SUMMARY_CHARS).collect()
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

impl SidecarRequest {
    fn recognize(command: &OcrPageCommand, image_path: &Path) -> Self {
        Self {
            protocol_version: 1,
            task_id: command.task_id.clone(),
            page_number: command.page_number,
            image_path: image_path.to_string_lossy().into_owned(),
            timeout_ms: command.timeout_ms,
        }
    }
}

fn push_stderr_line(tail: &mut VecDeque<String>, line: String) {
    if tail.len() >= MAX_STDERR_LINES {
        tail.pop_front();
    }
    tail.push_back(line.chars().take(MAX_STDERR_LINE_CHARS).collect());
}

fn sidecar_failure_reason(tail: &VecDeque<String>) -> &'static str {
    if tail.iter().any(|line| {
        let lower = line.to_ascii_lowercase();
        lower.contains("failed to extract") || lower.contains("failed to extract entry")
    }) {
        "pyinstaller-extraction-failed"
    } else {
        "process-exited"
    }
}

fn format_sidecar_diagnostic(
    reason: &str,
    exit_code: Option<i32>,
    tail: &VecDeque<String>,
    context: &str,
) -> String {
    let stderr = tail
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .join(" | ");
    let stderr = if stderr.is_empty() {
        "<empty>"
    } else {
        stderr.as_str()
    };
    let exit = exit_code
        .map(|code| code.to_string())
        .unwrap_or_else(|| "running-or-unavailable".to_owned());
    format!("OCR_SIDECAR_UNAVAILABLE:{reason}:exit-code={exit}:stderr={stderr}:context={context}")
}

fn format_protocol_diagnostic(
    reason: &str,
    detail: &str,
    exit_code: Option<i32>,
    tail: &VecDeque<String>,
    context: &str,
) -> String {
    let stderr = tail
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .join(" | ");
    let stderr = if stderr.is_empty() {
        "<empty>"
    } else {
        stderr.as_str()
    };
    let exit = exit_code
        .map(|code| code.to_string())
        .unwrap_or_else(|| "unknown".to_owned());
    format!(
        "OCR_SIDECAR_PROTOCOL_INVALID:{reason}:detail={detail}:exit-code={exit}:stderr={stderr}:context={context}"
    )
}

fn stdout_byte_preview(bytes: &[u8]) -> String {
    bytes
        .iter()
        .take(64)
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join(" ")
}

#[derive(Debug)]
enum StdoutEvent {
    Line(String),
    InvalidUtf8 { bytes: Vec<u8> },
    ReaderFailed { message: String },
    Eof,
}

fn spawn_stdout_reader<R>(stdout: R) -> (Receiver<StdoutEvent>, JoinHandle<()>)
where
    R: Read + Send + 'static,
{
    let (sender, receiver) = mpsc::channel();
    let handle = thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut bytes = Vec::new();
        loop {
            bytes.clear();
            match reader.read_until(b'\n', &mut bytes) {
                Ok(0) => {
                    let _ = sender.send(StdoutEvent::Eof);
                    break;
                }
                Ok(_) => match String::from_utf8(bytes.clone()) {
                    Ok(line) => {
                        if sender.send(StdoutEvent::Line(line)).is_err() {
                            break;
                        }
                    }
                    Err(error) => {
                        let _ = sender.send(StdoutEvent::InvalidUtf8 {
                            bytes: error.into_bytes(),
                        });
                        break;
                    }
                },
                Err(error) => {
                    let _ = sender.send(StdoutEvent::ReaderFailed {
                        message: error.to_string(),
                    });
                    break;
                }
            }
        }
    });
    (receiver, handle)
}

#[cfg(windows)]
struct ChildJob {
    handle: isize,
}

#[cfg(windows)]
unsafe impl Send for ChildJob {}

#[cfg(windows)]
unsafe impl Sync for ChildJob {}

#[cfg(windows)]
impl ChildJob {
    fn attach(child: &Child) -> io::Result<Self> {
        use windows_sys::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        };

        let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if handle.is_null() {
            return Err(io::Error::last_os_error());
        }
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = unsafe {
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        } != 0;
        if !configured {
            unsafe { windows_sys::Win32::Foundation::CloseHandle(handle) };
            return Err(io::Error::last_os_error());
        }
        let assigned = unsafe {
            AssignProcessToJobObject(
                handle,
                child.as_raw_handle() as windows_sys::Win32::Foundation::HANDLE,
            )
        } != 0;
        if !assigned {
            let error = io::Error::last_os_error();
            unsafe { windows_sys::Win32::Foundation::CloseHandle(handle) };
            return Err(error);
        }
        Ok(Self {
            handle: handle as isize,
        })
    }

    fn terminate(&self) -> bool {
        unsafe {
            windows_sys::Win32::System::JobObjects::TerminateJobObject(
                self.handle as windows_sys::Win32::Foundation::HANDLE,
                1,
            ) != 0
        }
    }
}

#[cfg(windows)]
impl Drop for ChildJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(
                self.handle as windows_sys::Win32::Foundation::HANDLE,
            );
        }
    }
}

#[cfg(not(windows))]
struct ChildJob;

#[cfg(not(windows))]
impl ChildJob {
    fn attach(_child: &Child) -> io::Result<Self> {
        Ok(Self)
    }

    fn terminate(&self) -> bool {
        false
    }
}

fn terminate_child_bounded(child: &mut Child, timeout: Duration) -> io::Result<Option<ExitStatus>> {
    if let Some(status) = child.try_wait()? {
        return Ok(Some(status));
    }
    let _ = child.kill();
    let deadline = Instant::now() + timeout;
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok(Some(status));
        }
        if Instant::now() >= deadline {
            return Ok(None);
        }
        thread::sleep(Duration::from_millis(10));
    }
}

fn terminate_child_tree_bounded(
    job: &ChildJob,
    child: &mut Child,
    timeout: Duration,
) -> io::Result<Option<ExitStatus>> {
    if let Some(status) = child.try_wait()? {
        return Ok(Some(status));
    }
    if !job.terminate() {
        let _ = child.kill();
    }
    terminate_child_bounded(child, timeout)
}

fn is_sharing_violation(error: &io::Error) -> bool {
    matches!(error.raw_os_error(), Some(32 | 33))
}

fn cleanup_runtime_entries<F>(entries: &[PathBuf], mut remove_dir: F) -> io::Result<(usize, usize)>
where
    F: FnMut(&Path) -> io::Result<()>,
{
    let mut removed = 0;
    let mut skipped = 0;
    for path in entries {
        match remove_dir(path) {
            Ok(()) => removed += 1,
            Err(error) if is_sharing_violation(&error) => {
                skipped += 1;
                eprintln!(
                    "[OCR Sidecar] skipped locked private runtime directory {}: {error}",
                    path.display()
                );
            }
            Err(error) => return Err(error),
        }
    }
    Ok((removed, skipped))
}

pub(crate) fn create_launch_runtime_temp(root: &Path) -> io::Result<PathBuf> {
    static NEXT_LAUNCH_ID: AtomicUsize = AtomicUsize::new(1);
    std::fs::create_dir_all(root)?;
    for _ in 0..32 {
        let id = NEXT_LAUNCH_ID.fetch_add(1, Ordering::Relaxed);
        let candidate = root.join(format!("launch-{}-{id}", std::process::id()));
        match std::fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    }
    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "could not allocate a private OCR launch directory",
    ))
}

fn cleanup_runtime_temp_dir(path: &Path) {
    if let Err(error) = std::fs::remove_dir_all(path) {
        if is_sharing_violation(&error) {
            eprintln!(
                "[OCR Sidecar] skipped locked launch runtime directory {}: {error}",
                path.display()
            );
        } else if error.kind() != io::ErrorKind::NotFound {
            eprintln!(
                "[OCR Sidecar] failed to remove launch runtime directory {}: {error}",
                path.display()
            );
        }
    }
}

fn collect_runtime_entries(root: &Path) -> io::Result<Vec<PathBuf>> {
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(root)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with("_MEI") || name.starts_with("launch-") {
            entries.push(entry.path());
        }
    }
    Ok(entries)
}

fn join_reader_bounded(reader: JoinHandle<()>, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while !reader.is_finished() && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(10));
    }
    if reader.is_finished() {
        let _ = reader.join();
        true
    } else {
        // Dropping a JoinHandle detaches the reader. This is deliberate: a
        // child or descendant may retain an inherited pipe indefinitely, and
        // cleanup must never make the Tauri command wait forever.
        drop(reader);
        false
    }
}

#[cfg(test)]
fn sidecar_failure_from_stderr(tail: &VecDeque<String>) -> OcrError {
    OcrError::SidecarUnavailableDiagnostic(sidecar_failure_reason(tail).to_owned())
}

pub(crate) fn runtime_temp_dir(app_cache_dir: &Path) -> PathBuf {
    app_cache_dir.join("ocr-sidecar-temp")
}

fn configure_runtime_temp(command: &mut Command, runtime_temp: &Path) {
    command.env("TEMP", runtime_temp).env("TMP", runtime_temp);
}

pub(crate) fn prepare_runtime_temp(root: &Path, sidecar_running: bool) -> io::Result<usize> {
    std::fs::create_dir_all(root)?;
    if sidecar_running {
        return Ok(0);
    }
    let (removed, _) = cleanup_runtime_entries(&collect_runtime_entries(root)?, |path| {
        std::fs::remove_dir_all(path)
    })?;
    Ok(removed)
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
    job: ChildJob,
    stdin: ChildStdin,
    responses: Receiver<StdoutEvent>,
    stdout_reader: Option<JoinHandle<()>>,
    stderr_tail: Arc<Mutex<VecDeque<String>>>,
    stderr_reader: Option<JoinHandle<()>>,
    launch_context: String,
    runtime_temp: PathBuf,
}

impl SidecarSession {
    fn spawn(
        resource_dir: &Path,
        image_root: &Path,
        runtime_temp: &Path,
    ) -> Result<Self, OcrError> {
        let executable = resolve_sidecar_executable(resource_dir).map_err(|error| {
            eprintln!(
                "[OCR Sidecar] executable not found under {}",
                resource_dir.display()
            );
            error
        })?;
        let resources = resource_dir.join("ocr-sidecar").join("resources");
        let manifest = resource_dir.join("ocr-sidecar").join("model_manifest.json");
        let launch_context = format!(
            "executable={};resources={};manifest={};image-root={};runtime-temp={};cwd={}",
            executable.display(),
            resources.display(),
            manifest.display(),
            image_root.display(),
            runtime_temp.display(),
            resource_dir.display(),
        );
        eprintln!("[OCR Sidecar] starting {launch_context}");
        let mut command = Command::new(&executable);
        command
            .arg("--resources")
            .arg(resources)
            .arg("--manifest")
            .arg(manifest)
            .arg("--allowed-image-root")
            .arg(image_root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(resource_dir);
        configure_runtime_temp(&mut command, runtime_temp);
        command.env("AURALIS_OCR_DEBUG", "1");
        command.env("PYTHONIOENCODING", "utf-8");
        command.env("PYTHONUTF8", "1");
        let mut child = command.spawn().map_err(|error| {
            eprintln!("[OCR Sidecar] spawn failed: {error}; {launch_context}");
            OcrError::SidecarUnavailableDiagnostic(format!(
                "OCR_SIDECAR_UNAVAILABLE:spawn-failed:error={error}:context={launch_context}"
            ))
        })?;

        let job = ChildJob::attach(&child).map_err(|error| {
            let _ = child.kill();
            let _ = child.wait();
            eprintln!(
                "[OCR Sidecar] failed to attach child to private job: {error}; {launch_context}"
            );
            OcrError::SidecarUnavailableDiagnostic(format!(
                "OCR_SIDECAR_UNAVAILABLE:job-object-failed:error={error}:context={launch_context}"
            ))
        })?;

        let stdin = child.stdin.take().ok_or_else(|| {
            eprintln!("[OCR Sidecar] child stdin unavailable");
            OcrError::SidecarUnavailable
        })?;
        let stdout = child.stdout.take().ok_or_else(|| {
            eprintln!("[OCR Sidecar] child stdout unavailable");
            OcrError::SidecarUnavailable
        })?;
        let stderr = child.stderr.take().ok_or_else(|| {
            eprintln!("[OCR Sidecar] child stderr unavailable");
            OcrError::SidecarUnavailable
        })?;
        let (responses, stdout_reader) = spawn_stdout_reader(stdout);

        let stderr_tail = Arc::new(Mutex::new(VecDeque::new()));
        let stderr_reader_tail = Arc::clone(&stderr_tail);
        let stderr_reader = thread::spawn(move || {
            let mut reader = BufReader::new(stderr);
            let mut bytes = Vec::new();
            loop {
                bytes.clear();
                match reader.read_until(b'\n', &mut bytes) {
                    Ok(0) => break,
                    Ok(_) => {
                        let line = String::from_utf8_lossy(&bytes)
                            .trim_end_matches(['\r', '\n'])
                            .to_owned();
                        if let Ok(mut tail) = stderr_reader_tail.lock() {
                            push_stderr_line(&mut tail, line);
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        Ok(Self {
            child,
            job,
            stdin,
            responses,
            stdout_reader: Some(stdout_reader),
            stderr_tail,
            stderr_reader: Some(stderr_reader),
            launch_context,
            runtime_temp: runtime_temp.to_path_buf(),
        })
    }

    fn request(&mut self, request: &SidecarRequest) -> Result<OcrPageResult, OcrError> {
        let serialized = serde_json::to_string(request).map_err(|_| OcrError::SidecarProtocol)?;
        if let Err(error) = self
            .stdin
            .write_all(serialized.as_bytes())
            .and_then(|_| self.stdin.write_all(b"\n"))
            .and_then(|_| self.stdin.flush())
        {
            eprintln!("[OCR Sidecar] request write failed: {error}");
            return Err(self.capture_failure("request-write-failed"));
        }

        let response = match self
            .responses
            .recv_timeout(Duration::from_millis(request.timeout_ms))
        {
            Ok(StdoutEvent::Line(response)) => response,
            Ok(StdoutEvent::InvalidUtf8 { bytes }) => {
                return Err(self.capture_protocol_failure(
                    "stdout-invalid-utf8",
                    &format!("preview={}", stdout_byte_preview(&bytes)),
                ));
            }
            Ok(StdoutEvent::ReaderFailed { message }) => {
                return Err(self.capture_protocol_failure("stdout-reader-failed", &message));
            }
            Ok(StdoutEvent::Eof) => return Err(self.capture_failure("process-exited")),
            Err(RecvTimeoutError::Timeout) => {
                eprintln!(
                    "[OCR Sidecar] response timed out after {} ms",
                    request.timeout_ms
                );
                self.log_exit_diagnostics();
                return Err(OcrError::Timeout);
            }
            Err(RecvTimeoutError::Disconnected) => {
                eprintln!("[OCR Sidecar] stdout disconnected");
                return Err(self.capture_protocol_failure(
                    "stdout-reader-disconnected",
                    "reader channel disconnected",
                ));
            }
        };
        match serde_json::from_str(response.trim()) {
            Ok(response) => Ok(response),
            Err(error) => {
                eprintln!("[OCR Sidecar] invalid response: {error}");
                Err(self.capture_protocol_failure("invalid-response-json", &error.to_string()))
            }
        }
    }

    fn log_exit_diagnostics(&mut self) {
        let status = match self.child.try_wait() {
            Ok(Some(status)) => {
                eprintln!("[OCR Sidecar] process exited with {status}");
                Some(status)
            }
            Ok(None) => {
                eprintln!("[OCR Sidecar] process is still running");
                None
            }
            Err(error) => {
                eprintln!("[OCR Sidecar] exit status unavailable: {error}");
                None
            }
        };
        if status.is_some() {
            if let Some(reader) = self.stderr_reader.take() {
                let _ = join_reader_bounded(reader, READER_JOIN_TIMEOUT);
            }
        }
        if let Ok(tail) = self.stderr_tail.lock() {
            for line in tail.iter() {
                eprintln!("[OCR Sidecar stderr] {line}");
            }
        }
    }

    fn capture_failure(&mut self, fallback_reason: &str) -> OcrError {
        let was_exited = matches!(self.child.try_wait(), Ok(Some(_)));
        let status = self.stop_child();
        self.join_readers();
        let tail = self
            .stderr_tail
            .lock()
            .map(|tail| tail.clone())
            .unwrap_or_default();
        let reason = if fallback_reason == "process-exited" && was_exited {
            sidecar_failure_reason(&tail)
        } else if fallback_reason == "process-exited" {
            "stdout-closed-while-running"
        } else {
            fallback_reason
        };
        let exit_code = status.as_ref().and_then(ExitStatus::code);
        let detail = format_sidecar_diagnostic(reason, exit_code, &tail, &self.launch_context);
        eprintln!("[OCR Sidecar] failure: {detail}");
        for line in &tail {
            eprintln!("[OCR Sidecar stderr] {line}");
        }
        OcrError::SidecarUnavailableDiagnostic(detail)
    }

    fn capture_protocol_failure(&mut self, reason: &str, detail: &str) -> OcrError {
        let status = self.stop_child();
        self.join_readers();
        let tail = self
            .stderr_tail
            .lock()
            .map(|tail| tail.clone())
            .unwrap_or_default();
        let diagnostic = format_protocol_diagnostic(
            reason,
            detail,
            status.as_ref().and_then(ExitStatus::code),
            &tail,
            &self.launch_context,
        );
        eprintln!("[OCR Sidecar] protocol failure: {diagnostic}");
        OcrError::SidecarProtocolDiagnostic(diagnostic)
    }

    fn stop_child(&mut self) -> Option<ExitStatus> {
        match terminate_child_tree_bounded(&self.job, &mut self.child, CHILD_CLEANUP_TIMEOUT) {
            Ok(Some(status)) => Some(status),
            Ok(None) => {
                eprintln!("[OCR Sidecar] child did not exit within cleanup timeout");
                None
            }
            Err(error) => {
                eprintln!("[OCR Sidecar] failed to terminate child: {error}");
                None
            }
        }
    }

    fn join_readers(&mut self) {
        if let Some(reader) = self.stdout_reader.take() {
            let _ = join_reader_bounded(reader, READER_JOIN_TIMEOUT);
        }
        if let Some(reader) = self.stderr_reader.take() {
            let _ = join_reader_bounded(reader, READER_JOIN_TIMEOUT);
        }
    }

    fn is_running(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }
}

impl Drop for SidecarSession {
    fn drop(&mut self) {
        let _ = terminate_child_tree_bounded(&self.job, &mut self.child, CHILD_CLEANUP_TIMEOUT);
        self.join_readers();
        cleanup_runtime_temp_dir(&self.runtime_temp);
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
    runtime_temp: PathBuf,
    session: Option<SidecarSession>,
    restart_budget: RestartBudget,
}

impl OcrSupervisor {
    pub fn new(resource_dir: PathBuf, image_root: PathBuf, runtime_temp: PathBuf) -> Self {
        Self {
            resource_dir,
            image_root,
            runtime_temp,
            session: None,
            restart_budget: RestartBudget::new(MAX_RESTARTS),
        }
    }

    fn ensure_session(&mut self) -> Result<(), OcrError> {
        if let Some(session) = self.session.as_mut() {
            if session.is_running() {
                return Ok(());
            }
            self.session = None;
        }
        let removed = prepare_runtime_temp(&self.runtime_temp, false).map_err(|error| {
            eprintln!(
                "[OCR Sidecar] runtime temp preparation failed under {}: {error}",
                self.runtime_temp.display()
            );
            OcrError::SidecarUnavailableDiagnostic("runtime-temp-unavailable".to_owned())
        })?;
        if removed > 0 {
            eprintln!("[OCR Sidecar] removed {removed} stale private _MEI directories");
        }
        std::fs::create_dir_all(&self.image_root).map_err(|_| OcrError::SidecarUnavailable)?;
        let launch_temp = create_launch_runtime_temp(&self.runtime_temp).map_err(|error| {
            eprintln!(
                "[OCR Sidecar] failed to create launch runtime directory under {}: {error}",
                self.runtime_temp.display()
            );
            OcrError::SidecarUnavailableDiagnostic("runtime-temp-unavailable".to_owned())
        })?;
        let session = SidecarSession::spawn(&self.resource_dir, &self.image_root, &launch_temp);
        self.session = match session {
            Ok(session) => Some(session),
            Err(error) => {
                cleanup_runtime_temp_dir(&launch_temp);
                return Err(error);
            }
        };
        Ok(())
    }

    fn warmup(&mut self) -> OcrWarmupView {
        let command = OcrPageCommand {
            task_id: "warmup".to_owned(),
            page_number: 1,
            image_bytes: WARMUP_PNG.to_vec(),
            timeout_ms: 30_000,
        };
        match self.recognize(command) {
            Ok(response) if response.ok => OcrWarmupView {
                ready: true,
                restart_count: self.restart_budget.count(),
                error_code: None,
            },
            Ok(response) => OcrWarmupView {
                ready: false,
                restart_count: self.restart_budget.count(),
                error_code: response
                    .error_code
                    .or_else(|| Some("OCR_MODEL_FAILED".to_owned())),
            },
            Err(error) => OcrWarmupView {
                ready: false,
                restart_count: self.restart_budget.count(),
                error_code: Some(error.to_string()),
            },
        }
    }

    fn recognize(&mut self, command: OcrPageCommand) -> Result<OcrPageResult, OcrError> {
        let task_id = command.task_id.clone();
        let page_number = command.page_number;
        let image_bytes = command.image_bytes.len();
        let result = (|| {
            validate_page_command(&command)?;
            std::fs::create_dir_all(&self.image_root).map_err(|_| OcrError::SidecarUnavailable)?;
            let image_path = self
                .image_root
                .join(unique_image_name(&command.task_id, command.page_number));
            std::fs::write(&image_path, &command.image_bytes)
                .map_err(|_| OcrError::SidecarUnavailable)?;
            let request = SidecarRequest::recognize(&command, &image_path);

            let result = loop {
                self.ensure_session()?;
                let response = self
                    .session
                    .as_mut()
                    .ok_or(OcrError::SidecarUnavailable)?
                    .request(&request);
                match response {
                    Ok(result) => break Ok(result),
                    Err(error)
                        if matches!(
                            error,
                            OcrError::Timeout
                                | OcrError::SidecarUnavailable
                                | OcrError::SidecarUnavailableDiagnostic(_)
                                | OcrError::SidecarProtocolDiagnostic(_)
                        ) =>
                    {
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
        })();

        let (ok, line_count, total_ms, error_code) = match &result {
            Ok(response) => (
                response.ok,
                response.lines.len(),
                response.timing_ms.total,
                response
                    .error_code
                    .as_deref()
                    .or_else(|| (!response.ok).then_some("OCR_MODEL_FAILED")),
            ),
            Err(error) => (false, 0, 0.0, Some(error.code())),
        };
        eprintln!(
            "{}",
            format_page_summary(
                &task_id,
                page_number,
                image_bytes,
                ok,
                line_count,
                total_ms,
                self.restart_budget.count(),
                error_code,
            )
        );
        result
    }

    fn shutdown(&mut self) {
        self.session = None;
    }
}

pub struct OcrSupervisorState {
    supervisor: Arc<Mutex<OcrSupervisor>>,
    gate: Arc<RequestGate>,
}

impl OcrSupervisorState {
    pub fn new(resource_dir: PathBuf, image_root: PathBuf, runtime_temp: PathBuf) -> Self {
        Self {
            supervisor: Arc::new(Mutex::new(OcrSupervisor::new(
                resource_dir,
                image_root,
                runtime_temp,
            ))),
            gate: Arc::new(RequestGate::new(MAX_QUEUE_DEPTH)),
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

fn lock_state<'a>(
    supervisor: &'a Mutex<OcrSupervisor>,
    gate: &'a RequestGate,
) -> Result<SupervisorGuard<'a>, String> {
    if !gate.try_acquire() {
        return Err(OcrError::QueueFull.to_string());
    }
    match supervisor.try_lock() {
        Ok(supervisor) => Ok(SupervisorGuard { supervisor, gate }),
        Err(TryLockError::WouldBlock) => {
            gate.release();
            Err(OcrError::QueueFull.to_string())
        }
        Err(TryLockError::Poisoned(_)) => {
            gate.release();
            Err(OcrError::SidecarUnavailable.to_string())
        }
    }
}

fn spawn_blocking_ocr<F, T>(work: F) -> impl std::future::Future<Output = Result<T, String>> + Send
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    let task = tauri::async_runtime::spawn_blocking(work);
    async move {
        task.await
            .map_err(|_| OcrError::SidecarUnavailable.to_string())?
    }
}

#[tauri::command]
pub async fn ocr_warmup(state: State<'_, OcrSupervisorState>) -> Result<OcrWarmupView, String> {
    let supervisor = Arc::clone(&state.supervisor);
    let gate = Arc::clone(&state.gate);
    spawn_blocking_ocr(move || Ok(lock_state(&supervisor, &gate)?.warmup())).await
}

#[tauri::command]
pub async fn ocr_recognize_page(
    state: State<'_, OcrSupervisorState>,
    command: OcrPageCommand,
) -> Result<OcrPageResult, String> {
    let supervisor = Arc::clone(&state.supervisor);
    let gate = Arc::clone(&state.gate);
    spawn_blocking_ocr(move || {
        lock_state(&supervisor, &gate)?
            .recognize(command)
            .map_err(|error| error.to_string())
    })
    .await
}

#[tauri::command]
pub async fn ocr_shutdown(state: State<'_, OcrSupervisorState>) -> Result<(), String> {
    let supervisor = Arc::clone(&state.supervisor);
    let gate = Arc::clone(&state.gate);
    spawn_blocking_ocr(move || {
        lock_state(&supervisor, &gate)?.shutdown();
        Ok(())
    })
    .await
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
    use std::io::Cursor;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::time::Instant;

    fn spawn_test_long_running_child() -> Child {
        #[cfg(windows)]
        {
            Command::new("cmd.exe")
                .args(["/C", "ping -n 30 127.0.0.1 >NUL"])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .expect("spawn long-running test child")
        }
        #[cfg(not(windows))]
        {
            Command::new("sh")
                .args(["-c", "sleep 30"])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .expect("spawn long-running test child")
        }
    }

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
    fn warmup_uses_a_bounded_png_through_the_existing_protocol() {
        assert!(WARMUP_PNG.starts_with(b"\x89PNG\r\n\x1a\n"));
        let command = OcrPageCommand::new("warmup", 1, WARMUP_PNG.to_vec(), 30_000);
        assert_eq!(validate_page_command(&command), Ok(()));
    }

    #[test]
    fn page_summary_is_bounded_and_excludes_ocr_content_and_paths() {
        let summary = format_page_summary(
            "task\nwith\runsafe-identifier-that-is-deliberately-long",
            7,
            4096,
            false,
            3,
            f64::NAN,
            2,
            Some("MODEL_FAILED\nC:\\private\\ocr\\page.png"),
        );

        assert!(summary.len() <= MAX_PAGE_SUMMARY_CHARS);
        assert!(summary.contains("task_id=taskwithunsafe-identifier-that-is-deliberately-long"));
        assert!(summary.contains("page=7"));
        assert!(summary.contains("image_bytes=4096"));
        assert!(summary.contains("ok=false"));
        assert!(summary.contains("line_count=3"));
        assert!(summary.contains("total_ms=0"));
        assert!(summary.contains("restart_count=2"));
        assert!(summary.contains("error_code=MODEL_FAILED"));
        assert!(!summary.contains("recognized OCR text"));
        assert!(!summary.contains("C:\\private\\ocr\\page.png"));
        assert!(!summary.contains('\n'));
        assert!(!summary.contains('\r'));
    }

    #[test]
    fn page_summary_keeps_all_fields_for_extreme_and_negative_zero_timing() {
        let summary = format_page_summary(
            "task",
            1,
            2,
            true,
            usize::MAX,
            f64::MAX,
            u8::MAX,
            Some("OCR_OK"),
        );

        assert!(summary.len() <= MAX_PAGE_SUMMARY_CHARS);
        for field in [
            "task_id=",
            "page=",
            "image_bytes=",
            "ok=",
            "line_count=",
            "total_ms=",
            "restart_count=",
            "error_code=",
        ] {
            assert!(summary.contains(field), "missing {field}: {summary}");
        }
        let negative_zero = format_page_summary("task", 1, 2, true, 0, -0.0, 0, None);
        assert!(negative_zero.contains("total_ms=0"));
        assert!(!negative_zero.contains("total_ms=-0"));
    }

    #[test]
    fn diagnostic_stderr_tail_is_bounded() {
        let mut tail = VecDeque::new();
        for index in 0..25 {
            push_stderr_line(&mut tail, format!("line-{index}"));
        }
        assert_eq!(tail.len(), MAX_STDERR_LINES);
        assert_eq!(tail.front().map(String::as_str), Some("line-5"));
    }

    #[test]
    fn sidecar_command_routes_pyinstaller_temp_to_the_private_runtime_directory() {
        let runtime_temp = std::env::temp_dir().join("auralis-ocr-private-test");
        let mut command = Command::new("auralis-ocr-test");
        configure_runtime_temp(&mut command, &runtime_temp);

        for name in ["TEMP", "TMP"] {
            let value = command
                .get_envs()
                .find(|(key, _)| key == &std::ffi::OsStr::new(name))
                .and_then(|(_, value)| value);
            assert_eq!(value, Some(runtime_temp.as_os_str()));
        }
    }

    #[test]
    fn runtime_temp_is_scoped_below_the_application_cache_directory() {
        let cache = PathBuf::from(r"C:\Users\tester\AppData\Local\Auralis");
        assert_eq!(runtime_temp_dir(&cache), cache.join("ocr-sidecar-temp"));
    }

    #[test]
    fn dedicated_runtime_temp_cleanup_only_removes_mei_directories_when_sidecar_is_stopped() {
        let root =
            std::env::temp_dir().join(format!("auralis-ocr-temp-test-{}", std::process::id()));
        let stale = root.join("_MEI12345");
        let retained = root.join("keep-me");
        std::fs::create_dir_all(&stale).expect("create stale directory");
        std::fs::create_dir_all(&retained).expect("create retained directory");
        std::fs::write(stale.join("marker"), b"stale").expect("write stale marker");

        assert_eq!(prepare_runtime_temp(&root, true).unwrap(), 0);
        assert!(stale.exists());
        assert_eq!(prepare_runtime_temp(&root, false).unwrap(), 1);
        assert!(!stale.exists());
        assert!(retained.exists());

        std::fs::remove_dir_all(&root).expect("remove test directory");
    }

    #[test]
    fn runtime_temp_cleanup_skips_sharing_violation_and_keeps_startup_available() {
        let root = PathBuf::from(r"C:\auralis-ocr-runtime-temp");
        let entries = vec![root.join("launch-old")];
        let (removed, skipped) =
            cleanup_runtime_entries(&entries, |_path| Err(io::Error::from_raw_os_error(32)))
                .expect("sharing violations are recoverable cleanup results");

        assert_eq!((removed, skipped), (0, 1));
    }

    #[test]
    fn each_sidecar_launch_gets_a_distinct_private_runtime_directory() {
        let root =
            std::env::temp_dir().join(format!("auralis-ocr-launch-test-{}", std::process::id()));
        let first = create_launch_runtime_temp(&root).expect("create first launch directory");
        let second = create_launch_runtime_temp(&root).expect("create second launch directory");

        assert_ne!(first, second);
        assert!(first.starts_with(&root));
        assert!(second.starts_with(&root));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn pyinstaller_extraction_failure_is_preserved_in_public_diagnostics() {
        let mut tail = VecDeque::new();
        push_stderr_line(
            &mut tail,
            "[PYI-123:ERROR] Failed to extract entry: MSVCP140.dll.".to_owned(),
        );
        assert_eq!(
            sidecar_failure_from_stderr(&tail).to_string(),
            "OCR_SIDECAR_UNAVAILABLE:pyinstaller-extraction-failed"
        );
    }

    #[test]
    fn process_exit_diagnostics_include_exit_code_stderr_and_launch_context() {
        let mut tail = VecDeque::new();
        push_stderr_line(&mut tail, "ImportError: onnxruntime failed".to_owned());

        let diagnostic = format_sidecar_diagnostic(
            "process-exited",
            Some(17),
            &tail,
            "executable=C:\\Auralis\\auralis-ocr.exe;resources=C:\\Auralis\\ocr-sidecar\\resources",
        );

        assert!(diagnostic.starts_with("OCR_SIDECAR_UNAVAILABLE:process-exited"));
        assert!(diagnostic.contains("exit-code=17"));
        assert!(diagnostic.contains("stderr=ImportError: onnxruntime failed"));
        assert!(diagnostic.contains("executable=C:\\Auralis\\auralis-ocr.exe"));
    }

    #[test]
    fn stdout_reader_reports_invalid_utf8_as_a_protocol_event() {
        let (receiver, reader) = spawn_stdout_reader(Cursor::new(vec![b'{', 0xff, b'}', b'\n']));

        match receiver.recv().expect("stdout reader event") {
            StdoutEvent::InvalidUtf8 { bytes } => assert_eq!(bytes, vec![b'{', 0xff, b'}', b'\n']),
            event => panic!("expected invalid UTF-8 event, got {event:?}"),
        }
        reader.join().expect("invalid UTF-8 reader exits");
    }

    #[test]
    fn protocol_failure_is_not_classified_as_process_exit() {
        let diagnostic = format_protocol_diagnostic(
            "stdout-invalid-utf8",
            "preview=7b ff 7d",
            None,
            &VecDeque::new(),
            "executable=C:\\Auralis\\auralis-ocr.exe",
        );

        assert!(diagnostic.starts_with("OCR_SIDECAR_PROTOCOL_INVALID:stdout-invalid-utf8"));
        assert!(diagnostic.contains("preview=7b ff 7d"));
        assert!(!diagnostic.contains("process-exited"));
    }

    #[test]
    fn running_child_is_terminated_after_stdout_reader_failure() {
        let mut child = spawn_test_long_running_child();
        let status = terminate_child_bounded(&mut child, Duration::from_millis(250))
            .expect("child termination attempt");

        assert!(
            status.is_some(),
            "child should be reaped when termination succeeds"
        );
    }

    #[test]
    fn child_cleanup_has_a_hard_bound_when_the_child_does_not_exit() {
        let mut child = spawn_test_long_running_child();
        let started = Instant::now();
        let status = terminate_child_bounded(&mut child, Duration::from_millis(50))
            .expect("bounded child termination attempt");

        assert!(started.elapsed() < Duration::from_millis(500));
        assert!(
            status.is_some(),
            "the test child should be killed and reaped"
        );
    }

    #[test]
    fn reader_join_is_bounded_when_stdout_never_closes() {
        let release = Arc::new(AtomicBool::new(false));
        let release_reader = Arc::clone(&release);
        let reader = thread::spawn(move || {
            while !release_reader.load(Ordering::Acquire) {
                thread::sleep(Duration::from_millis(10));
            }
        });

        let started = Instant::now();
        assert!(!join_reader_bounded(reader, Duration::from_millis(50)));
        assert!(started.elapsed() < Duration::from_millis(500));
        release.store(true, Ordering::Release);
    }

    #[test]
    fn blocking_ocr_work_does_not_occupy_the_async_runtime_thread() {
        let started = Arc::new(AtomicBool::new(false));
        let release = Arc::new(AtomicBool::new(false));
        let started_in_worker = Arc::clone(&started);
        let release_in_worker = Arc::clone(&release);
        let blocking_work = spawn_blocking_ocr(move || {
            started_in_worker.store(true, Ordering::Release);
            while !release_in_worker.load(Ordering::Acquire) {
                thread::sleep(Duration::from_millis(1));
            }
            Ok::<_, String>(())
        });

        let deadline = Instant::now() + Duration::from_secs(1);
        while !started.load(Ordering::Acquire) && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(1));
        }
        assert!(started.load(Ordering::Acquire));

        let result = tauri::async_runtime::block_on(async {
            let runtime_task = tauri::async_runtime::spawn(async { 7_u8 });
            runtime_task.await.expect("async runtime task should run")
        });

        assert_eq!(result, 7);
        release.store(true, Ordering::Release);
        tauri::async_runtime::block_on(blocking_work).expect("blocking OCR work should not fail");
    }

    #[test]
    fn resolver_accepts_tauri_msi_external_bin_name() {
        let root =
            std::env::temp_dir().join(format!("auralis-ocr-resolver-test-{}", std::process::id()));
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

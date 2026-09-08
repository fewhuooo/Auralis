# OCR Sidecar stdout Protocol Implementation Plan

> **For agentic workers:** This plan is executed inline in the shared worktree. Do not reset, checkout, commit, delete databases, delete MinIO volumes, or clear user data.

**Goal:** Make the OCR sidecar stdout a strict UTF-8 JSONL protocol, preserve accurate stdout/protocol diagnostics in Rust, and guarantee that a broken child is terminated and never left orphaned.

**Architecture:** Python will keep protocol output on the original stdout binary stream, force UTF-8 process streams, and redirect incidental library `print()` output to stderr. Rust will read stdout as bytes framed by newline, report invalid UTF-8 or malformed JSON as distinct protocol failures, and terminate the child before allowing the supervisor to retry. A valid response with `lines: []` remains a successful OCR result.

**Tech Stack:** Rust/Tauri sidecar supervisor, Python/PyInstaller OCR sidecar, JSONL, Cargo tests, Python unittest.

## Global Constraints

- stdout may contain only one UTF-8 JSON response per newline-delimited request.
- Third-party diagnostics belong on stderr and remain bounded in Rust diagnostics.
- Invalid stdout/protocol data must never be silently treated as a successful OCR response.
- A reader/protocol failure while the child is alive must terminate that child before retry or return.
- Real `process-exited` errors must include the actual exit code when available.
- Empty OCR detection (`lines: []`) is a legal response.
- Do not modify unrelated authentication, JSZip, Timeline, database, MinIO, or user data.

### Task 1: Reproduce the protocol boundary failures

**Files:**
- Modify: `Auralis-PC/src-tauri/src/ocr_sidecar.rs`
- Modify: `Auralis-PC/ocr-sidecar/main.py`
- Modify: `Auralis-PC/ocr-sidecar/tests/test_protocol.py`
- Modify: `Auralis-PC/ocr-sidecar/tests/test_engine.py`

- [ ] Add Rust tests for a byte-framed stdout reader receiving `0xff` before a newline, a still-running child after reader failure, and child termination after protocol failure.
- [ ] Add Python tests that capture `run()` output and prove protocol responses are UTF-8 JSONL, incidental stdout prints are redirected to stderr, and `lines: []` is emitted successfully.
- [ ] Run each new test before the implementation and confirm it fails for the current `read_line`/`print` behavior.

### Task 2: Enforce Python stdout/stderr ownership

**Files:**
- Modify: `Auralis-PC/ocr-sidecar/main.py`
- Modify: `Auralis-PC/ocr-sidecar/protocol.py` only if the tests require a byte encoder helper.

- [ ] Configure stdout and stderr for UTF-8 at sidecar startup with strict protocol encoding and write-through behavior.
- [ ] Save the original stdout buffer for protocol writes, route ordinary `sys.stdout` text to stderr, and write `encode_response(...).encode("utf-8") + b"\n"` only to the saved protocol stream.
- [ ] Keep all debug/engine diagnostics on stderr and flush each protocol response.
- [ ] Preserve empty OCR results as `ok: true` with `lines: []`.
- [ ] Run Python protocol and engine tests and verify the newly added tests pass.

### Task 3: Make Rust stdout reading byte-safe and state-aware

**Files:**
- Modify: `Auralis-PC/src-tauri/src/ocr_sidecar.rs`

- [ ] Replace `BufRead::read_line` into `String` with `Read::read_until(b'\n', &mut Vec<u8>)` and an explicit event type for line, invalid UTF-8, EOF, and reader I/O failure.
- [ ] Convert valid bytes to UTF-8 only at the protocol boundary; preserve a bounded lossy byte diagnostic for invalid data, but return a protocol error rather than parsing it as JSON.
- [ ] Distinguish `stdout-invalid-utf8`, `stdout-reader-failed`, `stdout-eof`, and `protocol-invalid-response` from `process-exited` in the public error detail.
- [ ] On any stdout reader/protocol failure, kill and wait for the child, join the stderr reader, and only then let the supervisor drop or restart the session.
- [ ] On a genuine EOF/child exit, call `try_wait()` and include the actual exit code; never emit `running-or-unavailable` for a known reader/protocol failure.
- [ ] Add tests for all required Rust cases and run them before moving to final verification.

### Task 4: Supervisor retry and cleanup semantics

**Files:**
- Modify: `Auralis-PC/src-tauri/src/ocr_sidecar.rs`

- [ ] Ensure protocol/reader failures invalidate the current session and use the existing bounded restart budget.
- [ ] Ensure `Drop` remains idempotent after an explicit termination and no child process remains after the final error.
- [ ] Ensure timeout behavior remains distinct and does not classify a still-running child as exited.
- [ ] Run focused Rust tests and `cargo check --manifest-path Auralis-PC/src-tauri/Cargo.toml`.

### Task 5: Documentation and final evidence

**Files:**
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

- [ ] Document the strict UTF-8 JSONL stdout/stderr boundary, child termination rule, and empty OCR behavior in the PC module documentation.
- [ ] Record the confirmed root cause, exact automated evidence, and remaining GUI acceptance boundary in Status and IssuesAndReview.
- [ ] Add the change to the release changelog.
- [ ] Run `git diff --check`, focused Python tests, focused Rust tests, and `cargo check`; report build/test/GUI status separately.


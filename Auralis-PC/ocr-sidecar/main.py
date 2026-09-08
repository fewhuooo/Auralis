"""Long-lived stdin/stdout entry point for the offline OCR sidecar."""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
from pathlib import Path
from typing import Any

from engine import OcrEngine
from protocol import ProtocolError, parse_json_request, validate_response


class _RawProtocolWriter:
    """Write protocol frames without passing through a locale-aware text stream."""

    def __init__(self, stdout: Any):
        self._stdout = stdout
        self._fd: int | None = None
        try:
            self._fd = os.dup(stdout.fileno())
        except (AttributeError, OSError, io.UnsupportedOperation):
            self._fd = None

    def write(self, payload: dict[str, Any]) -> None:
        normalized = validate_response(payload)
        encoded = (
            json.dumps(normalized, ensure_ascii=True, separators=(",", ":")) + "\n"
        ).encode("ascii")
        if self._fd is not None:
            view = memoryview(encoded)
            while view:
                view = view[os.write(self._fd, view) :]
            return

        buffer = getattr(self._stdout, "buffer", self._stdout)
        try:
            buffer.write(encoded)
        except TypeError:
            # Test doubles and unusual embedded hosts may expose only a text writer.
            # The frame is ASCII, so this fallback cannot consult a local code page.
            buffer.write(encoded.decode("ascii"))
        buffer.flush()

    def close(self) -> None:
        if self._fd is not None:
            try:
                os.close(self._fd)
            except OSError:
                pass
            self._fd = None


def _configure_stdio() -> _RawProtocolWriter:
    """Keep protocol bytes on the original stdout and route incidental output to stderr."""
    stdout = sys.stdout
    stderr = sys.stderr
    for stream in (stdout, stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8", errors="strict", newline="\n", write_through=True)
    protocol_stdout = _RawProtocolWriter(stdout)
    sys.stdout = stderr
    return protocol_stdout


def _write_protocol_response(protocol_stdout: _RawProtocolWriter, payload: dict[str, Any]) -> None:
    protocol_stdout.write(payload)


def _error_response(task_id: str = "unknown", page_number: int = 1, code: str = "OCR_PROTOCOL_INVALID") -> dict[str, Any]:
    return {
        "protocolVersion": 1,
        "ok": False,
        "taskId": task_id or "unknown",
        "pageNumber": page_number if isinstance(page_number, int) and page_number > 0 else 1,
        "lines": [],
        "timingMs": {"det": 0, "rec": 0, "total": 0},
        "errorCode": code,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Auralis offline OCR sidecar")
    parser.add_argument("--resources", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--allowed-image-root", type=Path, required=True)
    return parser


def run(resources: Path, manifest: Path, allowed_image_root: Path) -> int:
    protocol_stdout = _configure_stdio()
    try:
        engine = OcrEngine(resources_root=resources, manifest_path=manifest)
        for line in sys.stdin:
            if not line.strip():
                continue
            try:
                request = parse_json_request(line, allowed_image_root)
                response = engine.process_request(request)
            except ProtocolError as exc:
                _write_protocol_response(protocol_stdout, _error_response(code=exc.code))
                continue
            except Exception as exc:
                if os.environ.get("AURALIS_OCR_DEBUG") == "1":
                    print(f"OCR sidecar error: {type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
                _write_protocol_response(protocol_stdout, _error_response(code="OCR_MODEL_FAILED"))
                continue
            _write_protocol_response(protocol_stdout, response)
        return 0
    finally:
        protocol_stdout.close()


def main() -> int:
    args = build_parser().parse_args()
    return run(args.resources, args.manifest, args.allowed_image_root)


if __name__ == "__main__":
    raise SystemExit(main())

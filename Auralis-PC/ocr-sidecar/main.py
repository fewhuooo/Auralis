"""Long-lived stdin/stdout entry point for the offline OCR sidecar."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

from engine import OcrEngine
from protocol import ProtocolError, encode_response, parse_json_request


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
    engine = OcrEngine(resources_root=resources, manifest_path=manifest)
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            request = parse_json_request(line, allowed_image_root)
            response = engine.process_request(request)
        except ProtocolError as exc:
            print(encode_response(_error_response(code=exc.code)), flush=True)
            continue
        except Exception as exc:
            if os.environ.get("AURALIS_OCR_DEBUG") == "1":
                print(f"OCR sidecar error: {type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
            print(encode_response(_error_response(code="OCR_MODEL_FAILED")), flush=True)
            continue
        print(encode_response(response), flush=True)
    return 0


def main() -> int:
    args = build_parser().parse_args()
    return run(args.resources, args.manifest, args.allowed_image_root)


if __name__ == "__main__":
    raise SystemExit(main())

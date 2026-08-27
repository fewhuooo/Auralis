"""Strict, dependency-free JSON protocol validation for the OCR sidecar."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


PROTOCOL_VERSION = 1
MAX_TIMEOUT_MS = 120_000
MAX_LINES = 2_048
MAX_LINE_BYTES = 16 * 1_024
MAX_RESPONSE_BYTES = 256 * 1_024
ERROR_CODES = frozenset(
    {
        "OCR_PROTOCOL_INVALID",
        "OCR_TIMEOUT",
        "OCR_MODEL_FAILED",
        "OCR_RESPONSE_TOO_LARGE",
    }
)


class ProtocolError(ValueError):
    """An input or output message violated the sidecar protocol."""

    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(f"{code}: {message}")


def _invalid(message: str) -> ProtocolError:
    return ProtocolError("OCR_PROTOCOL_INVALID", message)


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _require_object(payload: Any, label: str) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise _invalid(f"{label} must be a JSON object")
    return payload


def _require_version(payload: dict[str, Any]) -> None:
    if payload.get("protocolVersion") != PROTOCOL_VERSION:
        raise _invalid("unsupported protocolVersion")


def _require_task_page(payload: dict[str, Any]) -> None:
    task_id = payload.get("taskId")
    page_number = payload.get("pageNumber")
    if not isinstance(task_id, str) or not task_id.strip() or len(task_id) > 128:
        raise _invalid("taskId must be a non-empty string of at most 128 characters")
    if not _is_int(page_number) or page_number < 1:
        raise _invalid("pageNumber must be a positive integer")


def _canonical_image_path(raw_path: Any, allowed_image_root: str | Path) -> str:
    if not isinstance(raw_path, str) or not raw_path.strip():
        raise _invalid("imagePath must be a non-empty absolute path")
    try:
        candidate = Path(raw_path)
        root = Path(allowed_image_root)
        if not candidate.is_absolute():
            raise _invalid("imagePath must be absolute")
        candidate = candidate.resolve(strict=False)
        root = root.resolve(strict=False)
        candidate.relative_to(root)
    except ProtocolError:
        raise
    except (OSError, RuntimeError, ValueError) as exc:
        raise _invalid("imagePath cannot be canonicalized") from exc
    return str(candidate)


def validate_request(
    payload: Any,
    allowed_image_root: str | Path,
) -> dict[str, Any]:
    """Validate and normalize a request before any file or model access."""

    request = _require_object(payload, "request")
    _require_version(request)
    _require_task_page(request)

    timeout_ms = request.get("timeoutMs")
    if not _is_int(timeout_ms) or not 0 < timeout_ms <= MAX_TIMEOUT_MS:
        raise _invalid(f"timeoutMs must be between 1 and {MAX_TIMEOUT_MS}")

    return {
        "protocolVersion": PROTOCOL_VERSION,
        "taskId": request["taskId"].strip(),
        "pageNumber": request["pageNumber"],
        "imagePath": _canonical_image_path(request.get("imagePath"), allowed_image_root),
        "timeoutMs": timeout_ms,
    }


def _validate_timing(timing: Any) -> dict[str, int | float]:
    if not isinstance(timing, dict):
        raise _invalid("timingMs must be an object")
    result: dict[str, int | float] = {}
    for key in ("det", "rec", "total"):
        value = timing.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
            raise _invalid(f"timingMs.{key} must be a non-negative number")
        result[key] = value
    return result


def _validate_lines(lines: Any) -> list[dict[str, Any]]:
    if not isinstance(lines, list):
        raise _invalid("lines must be an array")
    if len(lines) > MAX_LINES:
        raise ProtocolError("OCR_RESPONSE_TOO_LARGE", f"lines exceed {MAX_LINES}")

    normalized: list[dict[str, Any]] = []
    for line in lines:
        if not isinstance(line, dict) or not isinstance(line.get("text"), str):
            raise _invalid("each line must contain text")
        text = line["text"]
        if len(text.encode("utf-8")) > MAX_LINE_BYTES:
            raise ProtocolError("OCR_RESPONSE_TOO_LARGE", "line exceeds byte limit")
        score = line.get("score")
        if score is not None and (
            isinstance(score, bool)
            or not isinstance(score, (int, float))
            or not 0 <= score <= 1
        ):
            raise _invalid("line score must be between 0 and 1")
        normalized_line: dict[str, Any] = {"text": text}
        if score is not None:
            normalized_line["score"] = score
        normalized.append(normalized_line)
    return normalized


def validate_response(payload: Any) -> dict[str, Any]:
    """Validate a sidecar response and enforce the bounded response envelope."""

    response = _require_object(payload, "response")
    _require_version(response)
    _require_task_page(response)
    if not isinstance(response.get("ok"), bool):
        raise _invalid("ok must be a boolean")

    lines = _validate_lines(response.get("lines"))
    timing = _validate_timing(response.get("timingMs"))
    error_code = response.get("errorCode")
    if error_code is not None and error_code not in ERROR_CODES:
        raise _invalid("unknown errorCode")
    if not response["ok"] and error_code is None:
        raise _invalid("failed response must contain errorCode")

    normalized: dict[str, Any] = {
        "protocolVersion": PROTOCOL_VERSION,
        "ok": response["ok"],
        "taskId": response["taskId"].strip(),
        "pageNumber": response["pageNumber"],
        "lines": lines,
        "timingMs": timing,
    }
    if error_code is not None:
        normalized["errorCode"] = error_code

    encoded = json.dumps(normalized, ensure_ascii=False, separators=(",", ":")).encode(
        "utf-8"
    )
    if len(encoded) > MAX_RESPONSE_BYTES:
        raise ProtocolError("OCR_RESPONSE_TOO_LARGE", "response exceeds byte limit")
    return normalized


def parse_json_request(raw: str | bytes, allowed_image_root: str | Path) -> dict[str, Any]:
    try:
        payload = json.loads(raw)
    except (TypeError, json.JSONDecodeError) as exc:
        raise _invalid("request is not valid JSON") from exc
    return validate_request(payload, allowed_image_root)


def parse_json_response(raw: str | bytes) -> dict[str, Any]:
    try:
        payload = json.loads(raw)
    except (TypeError, json.JSONDecodeError) as exc:
        raise _invalid("response is not valid JSON") from exc
    return validate_response(payload)


def encode_response(payload: Any) -> str:
    normalized = validate_response(payload)
    return json.dumps(normalized, ensure_ascii=False, separators=(",", ":"))

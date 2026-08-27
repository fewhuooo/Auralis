"""Offline RapidOCR runtime with fixed model assets and bounded responses."""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from pathlib import Path
from typing import Any, Callable, Iterable

from protocol import ProtocolError, validate_response


MODEL_NAMES = ("det.onnx", "rec.onnx", "cls.onnx")


class ModelIntegrityError(RuntimeError):
    """The bundled model set does not match the signed manifest."""


def _load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ModelIntegrityError(f"cannot read manifest: {path}") from exc
    if not isinstance(payload, dict):
        raise ModelIntegrityError("model manifest must be an object")
    return payload


def verify_model_manifest(manifest_path: str | Path, resources_root: str | Path) -> list[Path]:
    """Verify the exact three model files and return their safe resource paths."""

    manifest = _load_json(Path(manifest_path))
    if manifest.get("schemaVersion") != 1:
        raise ModelIntegrityError("unsupported model manifest schema")

    runtime = manifest.get("runtime")
    if not isinstance(runtime, dict) or not all(
        isinstance(runtime.get(name), str) and runtime[name].strip()
        for name in ("rapidocr", "onnxruntime", "pyinstaller")
    ):
        raise ModelIntegrityError("manifest runtime versions are incomplete")

    entries = manifest.get("models")
    if not isinstance(entries, list) or len(entries) != len(MODEL_NAMES):
        raise ModelIntegrityError("manifest must contain exactly three models")

    root = Path(resources_root).resolve(strict=False)
    by_name: dict[str, dict[str, Any]] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            raise ModelIntegrityError("model entry must be an object")
        name = entry.get("name")
        digest = entry.get("sha256")
        version = entry.get("version")
        if (
            not isinstance(name, str)
            or Path(name).name != name
            or name in by_name
            or not isinstance(version, str)
            or not version.strip()
            or not isinstance(digest, str)
            or len(digest) != 64
            or any(char not in "0123456789abcdef" for char in digest.lower())
        ):
            raise ModelIntegrityError("invalid model manifest entry")
        by_name[name] = entry

    if set(by_name) != set(MODEL_NAMES):
        raise ModelIntegrityError("manifest model names do not match fixed runtime")

    model_paths: list[Path] = []
    for name in MODEL_NAMES:
        path = (root / name).resolve(strict=False)
        try:
            path.relative_to(root)
        except ValueError as exc:
            raise ModelIntegrityError("model path escapes resource root") from exc
        if not path.is_file():
            raise ModelIntegrityError(f"missing model resource: {name}")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != by_name[name]["sha256"].lower():
            raise ModelIntegrityError(f"model SHA-256 mismatch: {name}")
        model_paths.append(path)

    dictionary = manifest.get("dictionary")
    if not isinstance(dictionary, dict):
        raise ModelIntegrityError("manifest dictionary is missing")
    dictionary_name = dictionary.get("name")
    dictionary_digest = dictionary.get("sha256")
    if (
        not isinstance(dictionary_name, str)
        or Path(dictionary_name).name != dictionary_name
        or not isinstance(dictionary_digest, str)
        or len(dictionary_digest) != 64
        or any(char not in "0123456789abcdef" for char in dictionary_digest.lower())
    ):
        raise ModelIntegrityError("invalid dictionary manifest entry")
    dictionary_path = (root / dictionary_name).resolve(strict=False)
    try:
        dictionary_path.relative_to(root)
    except ValueError as exc:
        raise ModelIntegrityError("dictionary path escapes resource root") from exc
    if not dictionary_path.is_file():
        raise ModelIntegrityError(f"missing dictionary resource: {dictionary_name}")
    actual_dictionary_digest = hashlib.sha256(dictionary_path.read_bytes()).hexdigest()
    if actual_dictionary_digest != dictionary_digest.lower():
        raise ModelIntegrityError("dictionary SHA-256 mismatch")
    return model_paths


class _RapidOcrBackend:
    def __init__(self, model_paths: Iterable[Path]):
        paths = list(model_paths)
        if [path.name for path in paths] != list(MODEL_NAMES):
            raise ModelIntegrityError("rapidocr backend received unexpected model order")
        try:
            from rapidocr import RapidOCR
        except ImportError:
            try:
                from rapidocr_onnxruntime import RapidOCR
            except ImportError as exc:
                raise RuntimeError("RapidOCR runtime is not installed") from exc

        params = {
            "Det.model_path": str(paths[0]),
            "Rec.model_path": str(paths[1]),
            "Cls.model_path": str(paths[2]),
            "Rec.rec_keys_path": str(paths[0].parent / "ppocr_keys_v1.txt"),
            "Global.use_cls": True,
        }
        self._engine = RapidOCR(params=params)

    def recognize(self, image_path: str, *, use_classifier: bool) -> list[dict[str, Any]]:
        result = self._engine(image_path, use_cls=use_classifier)
        if isinstance(result, tuple):
            result = result[0]
        if result is None:
            return []
        if hasattr(result, "txts") and hasattr(result, "scores"):
            texts = result.txts or ()
            scores = result.scores or ()
            return [
                {"text": text, "score": score}
                for text, score in zip(texts, scores)
                if isinstance(text, str)
            ]
        lines: list[dict[str, Any]] = []
        for item in result:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                lines.append({"text": item["text"], "score": item.get("score")})
            elif isinstance(item, (list, tuple)) and len(item) >= 2:
                text = item[1]
                score = item[2] if len(item) >= 3 else None
                if isinstance(text, str):
                    lines.append({"text": text, "score": score})
        return lines


BackendFactory = Callable[[list[Path]], Any]


class OcrEngine:
    """Lazily warmed, serial OCR engine for one sidecar process."""

    def __init__(
        self,
        resources_root: str | Path,
        manifest_path: str | Path,
        backend_factory: BackendFactory | None = None,
    ):
        self._resources_root = Path(resources_root)
        self._manifest_path = Path(manifest_path)
        self._backend_factory = backend_factory or _RapidOcrBackend
        self._backend: Any | None = None
        self._process_lock = threading.Lock()

    def _ensure_backend(self) -> Any:
        if self._backend is None:
            model_paths = verify_model_manifest(self._manifest_path, self._resources_root)
            self._backend = self._backend_factory(model_paths)
        return self._backend

    def process_request(self, request: dict[str, Any]) -> dict[str, Any]:
        return self.process_image(
            image_path=Path(request["imagePath"]),
            task_id=request["taskId"],
            page_number=request["pageNumber"],
            timeout_ms=request["timeoutMs"],
            rotation_degrees=request.get("rotationDegrees", 0),
        )

    def process_image(
        self,
        *,
        image_path: str | Path,
        task_id: str,
        page_number: int,
        timeout_ms: int,
        rotation_degrees: int = 0,
    ) -> dict[str, Any]:
        started = time.perf_counter()
        path = Path(image_path)
        with self._process_lock:
            try:
                if not path.is_file():
                    raise FileNotFoundError(path)
                backend = self._ensure_backend()
                lines = backend.recognize(
                    str(path), use_classifier=bool(rotation_degrees % 360)
                )
                elapsed_ms = (time.perf_counter() - started) * 1_000
                if elapsed_ms > timeout_ms:
                    return self._error(task_id, page_number, "OCR_TIMEOUT", elapsed_ms)
                return validate_response(
                    {
                        "protocolVersion": 1,
                        "ok": True,
                        "taskId": task_id,
                        "pageNumber": page_number,
                        "lines": list(lines),
                        "timingMs": {"det": elapsed_ms, "rec": 0, "total": elapsed_ms},
                    }
                )
            except ProtocolError as exc:
                return self._error(task_id, page_number, exc.code, (time.perf_counter() - started) * 1_000)
            except TimeoutError:
                return self._error(task_id, page_number, "OCR_TIMEOUT", (time.perf_counter() - started) * 1_000)
            except Exception as exc:
                if os.environ.get("AURALIS_OCR_DEBUG") == "1":
                    print(f"OCR engine error: {type(exc).__name__}: {exc}", file=os.sys.stderr, flush=True)
                return self._error(task_id, page_number, "OCR_MODEL_FAILED", (time.perf_counter() - started) * 1_000)

    @staticmethod
    def _error(task_id: str, page_number: int, code: str, elapsed_ms: float) -> dict[str, Any]:
        return {
            "protocolVersion": 1,
            "ok": False,
            "taskId": task_id,
            "pageNumber": page_number,
            "lines": [],
            "timingMs": {"det": elapsed_ms, "rec": 0, "total": elapsed_ms},
            "errorCode": code,
        }

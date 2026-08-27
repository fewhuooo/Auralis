import hashlib
import json
import socket
import types
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine import ModelIntegrityError, OcrEngine, _RapidOcrBackend, verify_model_manifest


MODEL_NAMES = ("det.onnx", "rec.onnx", "cls.onnx")


def write_model_fixture(root: Path, *, mismatch: bool = False) -> Path:
    models = root / "resources"
    models.mkdir(parents=True)
    entries = []
    for index, name in enumerate(MODEL_NAMES):
        path = models / name
        path.write_bytes(f"fixture-model-{index}".encode("ascii"))
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if mismatch and index == 0:
            digest = "0" * 64
        entries.append({"name": name, "version": "pp-ocrv6-small-fixture", "sha256": digest})
    dictionary = root / "resources" / "ppocr_keys_v1.txt"
    dictionary.write_text("中\n文\n", encoding="utf-8")
    dictionary_digest = hashlib.sha256(dictionary.read_bytes()).hexdigest()
    manifest = root / "model_manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "runtime": {
                    "rapidocr": "3.9.0",
                    "onnxruntime": "1.20.1",
                    "pyinstaller": "6.11.1",
                },
                "models": entries,
                "dictionary": {"name": dictionary.name, "sha256": dictionary_digest},
            }
        ),
        encoding="utf-8",
    )
    return manifest


class FakeBackend:
    def __init__(self, model_paths):
        self.model_paths = model_paths
        self.initialize_calls = 1
        self.active = 0
        self.max_active = 0
        self.lock = threading.Lock()
        self.classifier_flags = []

    def recognize(self, image_path, *, use_classifier):
        with self.lock:
            self.active += 1
            self.max_active = max(self.max_active, self.active)
        self.classifier_flags.append(use_classifier)
        time.sleep(0.01)
        with self.lock:
            self.active -= 1
        return [{"text": Path(image_path).stem, "score": 0.99}]


class OcrEngineTests(unittest.TestCase):
    def test_warm_once_and_serial_requests(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = write_model_fixture(root)
            image_root = root / "images"
            image_root.mkdir()
            first = image_root / "page-001.png"
            second = image_root / "page-002.png"
            first.write_bytes(b"page-1")
            second.write_bytes(b"page-2")

            backends = []

            def factory(model_paths):
                backend = FakeBackend(model_paths)
                backends.append(backend)
                return backend

            engine = OcrEngine(
                resources_root=root / "resources",
                manifest_path=manifest,
                backend_factory=factory,
            )
            requests = [
                {
                    "protocolVersion": 1,
                    "taskId": "task-1",
                    "pageNumber": 1,
                    "imagePath": str(first),
                    "timeoutMs": 30_000,
                },
                {
                    "protocolVersion": 1,
                    "taskId": "task-1",
                    "pageNumber": 2,
                    "imagePath": str(second),
                    "timeoutMs": 30_000,
                },
            ]

            results = []
            first_thread = threading.Thread(
                target=lambda: results.append(engine.process_request(requests[0]))
            )
            second_thread = threading.Thread(
                target=lambda: results.append(engine.process_request(requests[1]))
            )
            first_thread.start()
            second_thread.start()
            first_thread.join()
            second_thread.join()

            self.assertEqual(len(backends), 1)
            self.assertEqual(backends[0].initialize_calls, 1)
            self.assertEqual(backends[0].max_active, 1)
            self.assertEqual(sorted(item["ok"] for item in results), [True, True])

    def test_manifest_sha_mismatch_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = write_model_fixture(root, mismatch=True)

            with self.assertRaises(ModelIntegrityError):
                verify_model_manifest(manifest, root / "resources")

    def test_dictionary_sha_mismatch_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = write_model_fixture(root)
            payload = json.loads(manifest.read_text(encoding="utf-8"))
            payload["dictionary"]["sha256"] = "0" * 64
            manifest.write_text(json.dumps(payload), encoding="utf-8")

            with self.assertRaises(ModelIntegrityError):
                verify_model_manifest(manifest, root / "resources")

    def test_rotated_page_enables_classifier(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = write_model_fixture(root)
            image_root = root / "images"
            image_root.mkdir()
            image = image_root / "rotated.png"
            image.write_bytes(b"rotated")
            backend = FakeBackend([root / "resources" / name for name in MODEL_NAMES])
            engine = OcrEngine(
                resources_root=root / "resources",
                manifest_path=manifest,
                backend_factory=lambda _: backend,
            )

            engine.process_image(
                image_path=image,
                task_id="task-rotated",
                page_number=1,
                timeout_ms=30_000,
                rotation_degrees=90,
            )

            self.assertEqual(backend.classifier_flags, [True])

    def test_engine_does_not_open_network_connections(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = write_model_fixture(root)
            image_root = root / "images"
            image_root.mkdir()
            image = image_root / "page.png"
            image.write_bytes(b"page")
            backend = FakeBackend([root / "resources" / name for name in MODEL_NAMES])
            engine = OcrEngine(
                resources_root=root / "resources",
                manifest_path=manifest,
                backend_factory=lambda _: backend,
            )

            with patch.object(socket, "create_connection", side_effect=AssertionError("network")):
                response = engine.process_image(
                    image_path=image,
                    task_id="task-offline",
                    page_number=1,
                    timeout_ms=30_000,
                )

            self.assertTrue(response["ok"])

    def test_default_backend_uses_rapidocr_params_keyword(self):
        calls = []

        class FakeRapidOCR:
            def __init__(self, *, params):
                calls.append(params)

        fake_module = types.SimpleNamespace(RapidOCR=FakeRapidOCR)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = [root / name for name in MODEL_NAMES]
            with patch.dict(sys.modules, {"rapidocr": fake_module}):
                _RapidOcrBackend(paths)

        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["Det.model_path"], str(paths[0]))

    def test_default_backend_normalizes_rapidocr_output_dataclass(self):
        class FakeOutput:
            txts = ("第一章", "正文")
            scores = (0.98, 0.91)

        class FakeRapidOCR:
            def __init__(self, *, params):
                self.params = params

            def __call__(self, image_path, *, use_cls):
                return FakeOutput()

        fake_module = types.SimpleNamespace(RapidOCR=FakeRapidOCR)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = [root / name for name in MODEL_NAMES]
            with patch.dict(sys.modules, {"rapidocr": fake_module}):
                backend = _RapidOcrBackend(paths)
                lines = backend.recognize("page.png", use_classifier=True)

        self.assertEqual(lines, [{"text": "第一章", "score": 0.98}, {"text": "正文", "score": 0.91}])


if __name__ == "__main__":
    unittest.main()

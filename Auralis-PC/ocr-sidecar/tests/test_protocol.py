import json
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from protocol import ProtocolError, validate_request, validate_response
import main


class ProtocolValidationTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="auralis-ocr-images-"))
        self.image = self.root / "page-001.png"

    def test_rejects_unknown_protocol_version(self):
        request = {
            "protocolVersion": 99,
            "taskId": "task-1",
            "pageNumber": 1,
            "imagePath": str(self.image),
            "timeoutMs": 30_000,
        }

        with self.assertRaisesRegex(ProtocolError, "OCR_PROTOCOL_INVALID"):
            validate_request(request, self.root)

    def test_rejects_relative_or_external_image_path(self):
        base = {
            "protocolVersion": 1,
            "taskId": "task-1",
            "pageNumber": 1,
            "timeoutMs": 30_000,
        }

        with self.subTest(path="relative"):
            with self.assertRaisesRegex(ProtocolError, "OCR_PROTOCOL_INVALID"):
                validate_request({**base, "imagePath": "page-001.png"}, self.root)

        with self.subTest(path="external"):
            external = Path(tempfile.mkdtemp(prefix="auralis-ocr-external-")) / "page.png"
            with self.assertRaisesRegex(ProtocolError, "OCR_PROTOCOL_INVALID"):
                validate_request({**base, "imagePath": str(external)}, self.root)

    def test_caps_response_lines_and_bytes(self):
        too_many_lines = {
            "protocolVersion": 1,
            "ok": True,
            "taskId": "task-1",
            "pageNumber": 1,
            "lines": [{"text": "x", "score": 0.99}] * 2049,
            "timingMs": {"det": 1, "rec": 1, "total": 2},
        }
        with self.assertRaisesRegex(ProtocolError, "OCR_RESPONSE_TOO_LARGE"):
            validate_response(too_many_lines)

        too_many_bytes = {
            "protocolVersion": 1,
            "ok": True,
            "taskId": "task-1",
            "pageNumber": 1,
            "lines": [{"text": "汉" * 200_000, "score": 0.99}],
            "timingMs": {"det": 1, "rec": 1, "total": 2},
        }
        with self.assertRaisesRegex(ProtocolError, "OCR_RESPONSE_TOO_LARGE"):
            validate_response(too_many_bytes)

    def test_accepts_canonical_request_and_response(self):
        request = {
            "protocolVersion": 1,
            "taskId": "task-1",
            "pageNumber": 1,
            "imagePath": str(self.image),
            "timeoutMs": 30_000,
        }
        normalized_request = validate_request(request, self.root)
        self.assertEqual(normalized_request["imagePath"], str(self.image.resolve()))

        response = {
            "protocolVersion": 1,
            "ok": True,
            "taskId": "task-1",
            "pageNumber": 1,
            "lines": [{"text": "第一章", "score": 0.98}],
            "timingMs": {"det": 5, "rec": 7, "total": 12},
        }
        self.assertEqual(validate_response(response), response)

    def test_sidecar_stdout_is_utf8_jsonl_only_and_empty_ocr_is_valid(self):
        request = {
            "protocolVersion": 1,
            "taskId": "task-empty",
            "pageNumber": 1,
            "imagePath": str(self.image),
            "timeoutMs": 30_000,
        }

        class NoisyEngine:
            def process_request(self, _request):
                print("third-party diagnostic")
                return {
                    "protocolVersion": 1,
                    "ok": True,
                    "taskId": "task-empty",
                    "pageNumber": 1,
                    "lines": [{"text": "中文识别结果", "score": 0.98}],
                    "timingMs": {"det": 0, "rec": 0, "total": 0},
                }

        stdout_bytes = io.BytesIO()
        stdout = io.TextIOWrapper(stdout_bytes, encoding="cp1252", write_through=True)
        stderr = io.StringIO()
        with patch.object(main.sys, "stdin", io.StringIO(json.dumps(request) + "\n")):
            with patch.object(main.sys, "stdout", stdout):
                with patch.object(main.sys, "stderr", stderr):
                    with patch.object(main, "OcrEngine", lambda **_kwargs: NoisyEngine()):
                        self.assertEqual(main.run(self.root, self.root / "manifest.json", self.root), 0)

        stdout.flush()
        payload = stdout_bytes.getvalue()
        decoded = json.loads(payload.decode("utf-8"))
        self.assertEqual(decoded["lines"][0]["text"], "中文识别结果")
        self.assertEqual(payload, payload.decode("utf-8").encode("utf-8"))
        self.assertEqual(payload.count(b"\n"), 1)
        self.assertIn("third-party diagnostic", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()

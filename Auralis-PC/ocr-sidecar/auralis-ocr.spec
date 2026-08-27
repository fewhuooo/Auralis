from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules
import rapidocr


ROOT = Path(SPECPATH)
MODEL_ROOT = ROOT / "resources"
datas = [(str(ROOT / "model_manifest.json"), ".")]
rapidocr_root = Path(rapidocr.__file__).parent
for data_name in ("config.yaml", "default_models.yaml"):
    datas.append((str(rapidocr_root / data_name), "rapidocr"))
for model_name in ("det.onnx", "rec.onnx", "cls.onnx", "ppocr_keys_v1.txt"):
    model_path = MODEL_ROOT / model_name
    if model_path.is_file():
        datas.append((str(model_path), "resources"))

hiddenimports = [
    "onnxruntime",
    "rapidocr",
    *collect_submodules("rapidocr"),
]

a = Analysis(
    [str(ROOT / "main.py")],
    pathex=[str(ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="auralis-ocr",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)

param(
  [string]$PythonPath = 'python'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$sidecarRoot = Join-Path $PSScriptRoot '..\ocr-sidecar'
$sidecarRoot = [System.IO.Path]::GetFullPath($sidecarRoot)
$requirements = Join-Path $sidecarRoot 'requirements-lock.txt'
$spec = Join-Path $sidecarRoot 'auralis-ocr.spec'
$distRoot = Join-Path $sidecarRoot 'dist'

if (-not (Test-Path -LiteralPath $requirements)) {
    throw "Missing locked requirements: $requirements"
}
if (-not (Test-Path -LiteralPath $spec)) {
    throw "Missing PyInstaller spec: $spec"
}

& $PythonPath -m PyInstaller --clean --noconfirm --distpath $distRoot $spec
$built = Get-ChildItem -LiteralPath $distRoot -Recurse -File -Filter 'auralis-ocr.exe' | Select-Object -First 1
if ($null -eq $built) { throw "PyInstaller did not produce auralis-ocr.exe under $distRoot" }

$targetTriple = $env:TAURI_TARGET_TRIPLE
if ([string]::IsNullOrWhiteSpace($targetTriple)) {
    $targetTriple = (rustc -vV | Select-String '^host:').ToString().Split(':', 2)[1].Trim()
}
$binariesRoot = Join-Path $sidecarRoot '..\src-tauri\binaries'
New-Item -ItemType Directory -Path $binariesRoot -Force | Out-Null
Copy-Item -LiteralPath $built.FullName -Destination (Join-Path $binariesRoot "auralis-ocr-$targetTriple.exe") -Force

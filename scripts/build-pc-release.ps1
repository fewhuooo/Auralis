param(
  [Parameter(Mandatory = $true)]
  [string]$ApiBaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$WsBaseUrl,

  [string]$OverviewSseDeadlineMs = '300000',

  [switch]$AllowHttp
)

$ErrorActionPreference = 'Stop'

$trimmedApi = $ApiBaseUrl.Trim().TrimEnd('/')
$trimmedWs = $WsBaseUrl.Trim().TrimEnd('/')

$allowedApiPattern = if ($AllowHttp) { '^https?://' } else { '^https://' }
$allowedWsPattern = if ($AllowHttp) { '^wss?://' } else { '^wss://' }
if ($trimmedApi -notmatch $allowedApiPattern) {
  throw "Invalid ApiBaseUrl '$trimmedApi'. Expected $(if ($AllowHttp) { 'http:// or https://' } else { 'https://' })."
}
if ($trimmedWs -notmatch $allowedWsPattern) {
  throw "Invalid WsBaseUrl '$trimmedWs'. Expected $(if ($AllowHttp) { 'ws:// or wss://' } else { 'wss://' })."
}
$isLoopbackTarget = ($trimmedApi -match '^https?://(?:localhost|127\.0\.0\.1)(?::\d+)?$') -or ($trimmedWs -match '^wss?://(?:localhost|127\.0\.0\.1)(?::\d+)?$')
if ($isLoopbackTarget -and -not $AllowHttp) {
  throw 'Loopback API/WS targets require -AllowHttp and are for local trial builds only.'
}
if ($OverviewSseDeadlineMs -notmatch '^\d+$') {
  throw "OverviewSseDeadlineMs must be a non-negative integer, got '$OverviewSseDeadlineMs'."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$pcRoot = Join-Path $repoRoot 'Auralis-PC'
$distDir = Join-Path $pcRoot 'dist'
$envLocal = Join-Path $pcRoot '.env.local'
$envLocalBackup = Join-Path $pcRoot '.env.local.release-bak'
$ocrBinary = Join-Path $pcRoot 'src-tauri\binaries\auralis-ocr-x86_64-pc-windows-msvc.exe'

if (-not (Test-Path -LiteralPath $ocrBinary)) {
  throw "Missing OCR sidecar binary required by the MSI bundle: $ocrBinary"
}

$prevApi = $env:VITE_API_BASE_URL
$prevWs = $env:VITE_WS_BASE_URL
$prevSse = $env:VITE_OVERVIEW_SSE_DEADLINE_MS
$envLocalMoved = $false

function Invoke-PcNpm {
  param([string[]]$NpmArguments)
  Push-Location $pcRoot
  try {
    & npm.cmd @NpmArguments
    if ($LASTEXITCODE -ne 0) {
      throw "npm.cmd $($NpmArguments -join ' ') failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

try {
  if (Test-Path -LiteralPath $envLocal) {
    if (Test-Path -LiteralPath $envLocalBackup) {
      throw "Refusing to overwrite existing backup: $envLocalBackup"
    }
    Move-Item -LiteralPath $envLocal -Destination $envLocalBackup
    $envLocalMoved = $true
  }

  $env:VITE_API_BASE_URL = $trimmedApi
  $env:VITE_WS_BASE_URL = $trimmedWs
  $env:VITE_OVERVIEW_SSE_DEADLINE_MS = $OverviewSseDeadlineMs

  Invoke-PcNpm @('run', 'type-check')
  Invoke-PcNpm @('run', 'check:r4-pc')
  Invoke-PcNpm @('run', 'tauri', '--', 'build', '--bundles', 'msi')

  if (-not (Test-Path -LiteralPath $distDir)) {
    throw "Expected frontend build output not found: $distDir"
  }
  $jsFiles = Get-ChildItem -Path $distDir -Recurse -File -Filter '*.js' | Where-Object {
    $_.FullName -notmatch '\\file-viewer\\'
  }
  if (-not $isLoopbackTarget) {
    foreach ($file in $jsFiles) {
      if (Select-String -LiteralPath $file.FullName -Pattern '(?:localhost|127\.0\.0\.1):8080' -Quiet) {
        throw "Found leaked localhost/127.0.0.1:8080 in built output: $($file.FullName)"
      }
    }
  }
  $apiEmbedded = $false
  foreach ($file in $jsFiles) {
    if (Select-String -LiteralPath $file.FullName -SimpleMatch -Pattern $trimmedApi -Quiet) {
      $apiEmbedded = $true
      break
    }
  }
  if (-not $apiEmbedded) {
    throw "Target API base URL was not embedded in the built frontend: $trimmedApi"
  }

  $targetRoot = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $pcRoot 'src-tauri\target' }
  $msiDir = Join-Path $targetRoot 'release\bundle\msi'
  $msi = Get-ChildItem -Path $msiDir -Filter '*.msi' -ErrorAction Stop | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $msi) {
    throw "No MSI found under $msiDir"
  }
  $hash = (Get-FileHash -LiteralPath $msi.FullName -Algorithm SHA256).Hash
  $sizeMb = [Math]::Round($msi.Length / (1024 * 1024), 2)
  Write-Host "MSI: $($msi.FullName)"
  Write-Host "Size: $sizeMb MB  Modified: $($msi.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))"
  Write-Host "SHA-256: $hash"
  Write-Host "Embedded API: $trimmedApi  WS: $trimmedWs"
} finally {
  if ($envLocalMoved) {
    Move-Item -LiteralPath $envLocalBackup -Destination $envLocal -Force
  }
  if ($null -eq $prevApi) { Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue } else { $env:VITE_API_BASE_URL = $prevApi }
  if ($null -eq $prevWs) { Remove-Item Env:VITE_WS_BASE_URL -ErrorAction SilentlyContinue } else { $env:VITE_WS_BASE_URL = $prevWs }
  if ($null -eq $prevSse) { Remove-Item Env:VITE_OVERVIEW_SSE_DEADLINE_MS -ErrorAction SilentlyContinue } else { $env:VITE_OVERVIEW_SSE_DEADLINE_MS = $prevSse }
}

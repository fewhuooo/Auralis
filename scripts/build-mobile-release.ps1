param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('app-phone', 'app-tablet', 'mp-weixin')]
  [string]$Target,

  [Parameter(Mandatory = $true)]
  [string]$ApiBaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$WsBaseUrl,

  [switch]$AllowHttp
)

$ErrorActionPreference = 'Stop'

$trimmedApi = $ApiBaseUrl.Trim().TrimEnd('/')
$trimmedWs = $WsBaseUrl.Trim().TrimEnd('/')

if ($Target -eq 'mp-weixin' -and $AllowHttp) {
  throw 'mp-weixin strictly requires HTTPS and WSS; -AllowHttp is not permitted.'
}

$allowedApiPattern = if ($AllowHttp) { '^https?://' } else { '^https://' }
$allowedWsPattern = if ($AllowHttp) { '^wss?://' } else { '^wss://' }

if ($trimmedApi -notmatch $allowedApiPattern) {
  throw "Invalid ApiBaseUrl '$trimmedApi'. Expected $(if ($AllowHttp) { 'http:// or https://' } else { 'https://' })."
}
if ($trimmedWs -notmatch $allowedWsPattern) {
  throw "Invalid WsBaseUrl '$trimmedWs'. Expected $(if ($AllowHttp) { 'ws:// or wss://' } else { 'wss://' })."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$mobileRoot = Join-Path $repoRoot 'Auralis-Mobile'
$outDir = Join-Path $mobileRoot "dist\build\$Target"

$prevApi = $env:VITE_API_BASE_URL
$prevWs = $env:VITE_WS_BASE_URL

try {
  $env:VITE_API_BASE_URL = $trimmedApi
  $env:VITE_WS_BASE_URL = $trimmedWs

  Push-Location $mobileRoot
  try {
    & npm.cmd run "build:$Target"
    if ($LASTEXITCODE -ne 0) {
      throw "npm.cmd run build:$Target failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }

  if (-not (Test-Path -LiteralPath $outDir)) {
    throw "Expected build output directory not found: $outDir"
  }

  $expectLocal8080 = ($trimmedApi -match '^(?:https?://)?(?:localhost|127\.0\.0\.1):8080$') -or ($trimmedWs -match '^(?:wss?://)?(?:localhost|127\.0\.0\.1):8080$')
  if (-not $expectLocal8080) {
    $jsFiles = Get-ChildItem -Path $outDir -Recurse -File -Filter '*.js' | Where-Object {
      $_.FullName -notmatch '\\static\\file-viewer\\vendor\\'
    }
    foreach ($file in $jsFiles) {
      $hit = Select-String -LiteralPath $file.FullName -Pattern '(?:localhost|127\.0\.0\.1):8080' -Quiet
      if ($hit) {
        throw "Found leaked localhost/127.0.0.1:8080 in built output: $($file.FullName)"
      }
    }
  }

  $viewerDir = Join-Path $outDir 'static\file-viewer'
  if ($Target -eq 'app-phone') {
    if (Test-Path -LiteralPath $viewerDir) {
      throw "app-phone must not include tablet file-viewer assets: $viewerDir"
    }
    $appConfig = Get-Content -LiteralPath (Join-Path $outDir 'app-config-service.js') -Raw -Encoding UTF8
    if ($appConfig -match 'pages/tablet/') {
      throw 'app-phone build leaked pages/tablet/ routes'
    }
    if ($appConfig -notmatch 'pages/mobile/') {
      throw 'app-phone build is missing pages/mobile/ routes'
    }
  } elseif ($Target -eq 'app-tablet') {
    $runtimeBundle = Join-Path $viewerDir 'auralis-viewer-runtime.iife.js'
    $pdfVendor = Join-Path $viewerDir 'vendor\pdf'
    if (-not (Test-Path -LiteralPath $runtimeBundle)) {
      throw "app-tablet missing viewer runtime bundle: $runtimeBundle"
    }
    if (-not (Test-Path -LiteralPath $pdfVendor)) {
      throw "app-tablet missing PDF vendor assets: $pdfVendor"
    }
    $appConfig = Get-Content -LiteralPath (Join-Path $outDir 'app-config-service.js') -Raw -Encoding UTF8
    if ($appConfig -match 'pages/mobile/') {
      throw 'app-tablet build leaked pages/mobile/ routes'
    }
    if ($appConfig -notmatch 'pages/tablet/') {
      throw 'app-tablet build is missing pages/tablet/ routes'
    }
  } elseif ($Target -eq 'mp-weixin') {
    if (Test-Path -LiteralPath $viewerDir) {
      throw "mp-weixin must not include file-viewer assets: $viewerDir"
    }
    $appJson = Get-Content -LiteralPath (Join-Path $outDir 'app.json') -Raw -Encoding UTF8
    if ($appJson -match 'pages/tablet/') {
      throw 'mp-weixin build leaked pages/tablet/ routes'
    }
    if ($appJson -notmatch 'pages/mobile/') {
      throw 'mp-weixin build is missing pages/mobile/ routes'
    }
    $totalBytes = (Get-ChildItem -Path $outDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
    $limitBytes = 2 * 1024 * 1024
    $sizeKb = [Math]::Round($totalBytes / 1024, 2)
    $sizeMb = [Math]::Round($totalBytes / (1024 * 1024), 3)
    Write-Host "mp-weixin total bundle size: $sizeKb KB ($sizeMb MB)"
    if ($totalBytes -ge $limitBytes) {
      throw "mp-weixin bundle exceeded 2 MB limit: $totalBytes bytes"
    }
  }

  Write-Host "Release build verified: target=$Target output=$outDir"
} finally {
  if ($null -eq $prevApi) {
    Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue
  } else {
    $env:VITE_API_BASE_URL = $prevApi
  }
  if ($null -eq $prevWs) {
    Remove-Item Env:VITE_WS_BASE_URL -ErrorAction SilentlyContinue
  } else {
    $env:VITE_WS_BASE_URL = $prevWs
  }
}

param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('phone', 'tablet')]
  [string]$Target,

  [string]$DeviceId = '127.0.0.1:16384',
  [string]$ApiBaseUrl = 'http://127.0.0.1:8080',
  [string]$WsBaseUrl = 'ws://127.0.0.1:8080',
  [string]$HBuilderXCli = 'D:\CodeBase\HBuilderX\cli.exe',
  [string]$AdbPath = 'D:\CodeBase\Android\Sdk\platform-tools\adb.exe'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $HBuilderXCli)) {
  throw "HBuilderX cli.exe not found at: $HBuilderXCli"
}
if (-not (Test-Path -LiteralPath $AdbPath)) {
  throw "adb.exe not found at: $AdbPath"
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$mobileRoot = Join-Path $repoRoot 'Auralis-Mobile'
$pkgPath = Join-Path $mobileRoot 'package.json'
$manifestPath = Join-Path $mobileRoot 'src\manifest.json'
$envLocalPath = Join-Path $mobileRoot '.env.local'
$devOutDir = Join-Path $mobileRoot 'dist\dev\app-plus'
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

Write-Host "Connecting ADB to $DeviceId and forwarding ports 8080 / 9000..."
& $AdbPath connect $DeviceId | Out-Host
& $AdbPath -s $DeviceId reverse tcp:8080 tcp:8080 | Out-Null
& $AdbPath -s $DeviceId reverse tcp:9000 tcp:9000 | Out-Null
& $AdbPath -s $DeviceId reverse --list | Out-Host

if (Test-Path -LiteralPath $devOutDir) {
  Remove-Item -LiteralPath $devOutDir -Recurse -Force
}

$origPkg = [System.IO.File]::ReadAllText($pkgPath, $utf8NoBom)
$origManifest = [System.IO.File]::ReadAllText($manifestPath, $utf8NoBom)
$hadEnvLocal = Test-Path -LiteralPath $envLocalPath
$origEnvLocal = if ($hadEnvLocal) { [System.IO.File]::ReadAllText($envLocalPath, $utf8NoBom) } else { $null }

try {
  $trimmedApi = $ApiBaseUrl.Trim().TrimEnd('/')
  $trimmedWs = $WsBaseUrl.Trim().TrimEnd('/')
  $envContent = "VITE_API_BASE_URL=$trimmedApi`nVITE_WS_BASE_URL=$trimmedWs`n"
  [System.IO.File]::WriteAllText($envLocalPath, $envContent, $utf8NoBom)

  $appDefineKey = if ($Target -eq 'tablet') { 'APP-TABLET' } else { 'APP-PHONE' }
  $appDisplayName = if ($Target -eq 'tablet') { 'Auralis HD' } else { 'Auralis' }

  $pkgJson = $origPkg | ConvertFrom-Json
  $pkgJson.'uni-app'.scripts | Add-Member -NotePropertyName 'app' -NotePropertyValue ([pscustomobject]@{
    title = 'Auralis HBuilderX Target'
    env = [pscustomobject]@{
      UNI_PLATFORM = 'app'
      VITE_APP_TARGET = $Target
    }
    define = [pscustomobject]@{
      $appDefineKey = $true
    }
  }) -Force
  [System.IO.File]::WriteAllText($pkgPath, ($pkgJson | ConvertTo-Json -Depth 16) + "`n", $utf8NoBom)

  $updatedManifest = [regex]::Replace($origManifest, '("name"\s*:\s*")[^"]*(")', "`${1}$appDisplayName`$2", 1)
  $manifestOrientations = if ($Target -eq 'tablet') {
    '"screenOrientation" : ["landscape-primary", "landscape-secondary"]'
  } else {
    '"screenOrientation" : ["portrait-primary"]'
  }
  $updatedManifest = [regex]::Replace(
    $updatedManifest,
    '"screenOrientation"\s*:\s*\[[^\]]*\]',
    $manifestOrientations,
    1
  )
  [System.IO.File]::WriteAllText($manifestPath, $updatedManifest, $utf8NoBom)

  Write-Host "Launching Auralis ($Target) locally to $DeviceId via HBuilderX standard base..."
  & $HBuilderXCli launch app-android --project $mobileRoot --deviceId $DeviceId --playground standard
} finally {
  [System.IO.File]::WriteAllText($pkgPath, $origPkg, $utf8NoBom)
  [System.IO.File]::WriteAllText($manifestPath, $origManifest, $utf8NoBom)
  if ($hadEnvLocal) {
    [System.IO.File]::WriteAllText($envLocalPath, $origEnvLocal, $utf8NoBom)
  } else {
    Remove-Item -LiteralPath $envLocalPath -Force -ErrorAction SilentlyContinue
  }
}

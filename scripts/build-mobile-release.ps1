param(
  [ValidateSet('phone', 'tablet', 'all')]
  [string]$Target = 'all',

  [Parameter(Mandatory = $true)]
  [string]$ApiBaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$WsBaseUrl,

  [ValidateSet('aarch64', 'armv7', 'i686', 'x86_64', 'universal')]
  [string]$Abi = 'aarch64',

  [switch]$AllowHttp,

  [switch]$AllowUnsigned,

  [switch]$DebugBuild,

  [string]$KeystorePath = '',

  [string]$KeystorePassword = '',

  [string]$KeyAlias = '',

  [string]$KeyPassword = '',

  [string]$OutputDir = ''
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

$repoRoot = Split-Path -Parent $PSScriptRoot
$mobileRoot = Join-Path $repoRoot 'Auralis-Mobile'
$androidRoot = Join-Path $mobileRoot 'src-tauri\gen\android'
$apkOutputRoot = Join-Path $androidRoot 'app\build\outputs\apk'
$envLocal = Join-Path $mobileRoot '.env.local'
$envLocalBackup = Join-Path $mobileRoot '.env.local.release-bak'
$networkSecurityConfigPath = Join-Path $androidRoot 'app\src\main\res\xml\network_security_config.xml'
$keystorePropertiesPath = Join-Path $androidRoot 'keystore.properties'
$tauriConfPath = Join-Path $mobileRoot 'src-tauri\tauri.conf.json'

$tauriVersion = '0.1.0'
if (Test-Path -LiteralPath $tauriConfPath) {
  $tauriConf = Get-Content -LiteralPath $tauriConfPath -Raw | ConvertFrom-Json
  if ($tauriConf.version) {
    $tauriVersion = [string]$tauriConf.version
  }
}

$resolvedOutputDir = if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  Join-Path $mobileRoot 'release-artifacts'
} elseif ([System.IO.Path]::IsPathRooted($OutputDir)) {
  $OutputDir
} else {
  Join-Path $repoRoot $OutputDir
}

if ($AllowHttp -and (Test-Path -LiteralPath $networkSecurityConfigPath)) {
  try {
    $apiUri = [System.Uri]$trimmedApi
    [xml]$nscXml = Get-Content -LiteralPath $networkSecurityConfigPath -Raw
    $allowedDomains = @($nscXml.SelectNodes('//domain') | ForEach-Object { $_.InnerText.Trim() })
    if ($allowedDomains -notcontains $apiUri.Host) {
      Write-Warning "Host '$($apiUri.Host)' is not listed in network_security_config.xml; cleartext HTTP traffic to it will be blocked on Android."
    }
  } catch {
    Write-Warning "Failed to inspect network_security_config.xml for host allowlist: $($_.Exception.Message)"
  }
}

function Resolve-ToolPath {
  param(
    [string]$CurrentValue,
    [string[]]$Candidates,
    [string]$Label
  )
  if (-not [string]::IsNullOrWhiteSpace($CurrentValue) -and (Test-Path -LiteralPath $CurrentValue)) {
    return $CurrentValue
  }
  foreach ($candidate in $Candidates) {
    if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }
  throw "Unable to locate $Label. Set environment variable or install it in a standard location."
}

$resolvedJavaHome = Resolve-ToolPath -CurrentValue $env:JAVA_HOME -Candidates @(
  'C:\Program Files\Java\jdk-21',
  'C:\Program Files\Eclipse Adoptium\jdk-21.0.5.11-hotspot'
) -Label 'JAVA_HOME'

$resolvedAndroidHome = Resolve-ToolPath -CurrentValue $env:ANDROID_HOME -Candidates @(
  $env:ANDROID_SDK_ROOT,
  'D:\CodeBase\Android\Sdk',
  (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
) -Label 'ANDROID_HOME'

$ndkCandidates = @()
$ndkBaseDir = Join-Path $resolvedAndroidHome 'ndk'
if (Test-Path -LiteralPath $ndkBaseDir) {
  $ndkCandidates = @(
    Get-ChildItem -LiteralPath $ndkBaseDir -Directory |
      Sort-Object Name -Descending |
      Select-Object -ExpandProperty FullName
  )
}
$resolvedNdkHome = Resolve-ToolPath -CurrentValue $env:NDK_HOME -Candidates $ndkCandidates -Label 'NDK_HOME'

$buildToolsDir = Join-Path $resolvedAndroidHome 'build-tools'
$aapt2Exe = $null
if (Test-Path -LiteralPath $buildToolsDir) {
  $aapt2Exe = Get-ChildItem -LiteralPath $buildToolsDir -Directory |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName 'aapt2.exe' } |
    Where-Object { Test-Path -LiteralPath $_ } |
    Select-Object -First 1
}
if (-not $aapt2Exe) {
  throw "Unable to locate aapt2.exe under $buildToolsDir"
}

$keystoreProps = @{}
if (Test-Path -LiteralPath $keystorePropertiesPath) {
  foreach ($line in (Get-Content -LiteralPath $keystorePropertiesPath)) {
    $trimmedLine = $line.Trim()
    if (-not $trimmedLine -or $trimmedLine.StartsWith('#') -or -not $trimmedLine.Contains('=')) {
      continue
    }
    $pair = $trimmedLine.Split('=', 2)
    $keystoreProps[$pair[0].Trim()] = $pair[1].Trim()
  }
}

$finalKeystorePath = if (-not [string]::IsNullOrWhiteSpace($KeystorePath)) {
  $KeystorePath.Trim()
} elseif (-not [string]::IsNullOrWhiteSpace($env:AURALIS_ANDROID_KEYSTORE_PATH)) {
  $env:AURALIS_ANDROID_KEYSTORE_PATH.Trim()
} elseif ($keystoreProps.ContainsKey('storeFile')) {
  $keystoreProps['storeFile']
} else {
  ''
}

$finalStorePassword = if (-not [string]::IsNullOrEmpty($KeystorePassword)) {
  $KeystorePassword
} elseif (-not [string]::IsNullOrEmpty($env:AURALIS_ANDROID_KEYSTORE_PASSWORD)) {
  $env:AURALIS_ANDROID_KEYSTORE_PASSWORD
} elseif ($keystoreProps.ContainsKey('storePassword')) {
  $keystoreProps['storePassword']
} else {
  ''
}

$finalKeyAlias = if (-not [string]::IsNullOrWhiteSpace($KeyAlias)) {
  $KeyAlias.Trim()
} elseif (-not [string]::IsNullOrWhiteSpace($env:AURALIS_ANDROID_KEY_ALIAS)) {
  $env:AURALIS_ANDROID_KEY_ALIAS.Trim()
} elseif ($keystoreProps.ContainsKey('keyAlias')) {
  $keystoreProps['keyAlias']
} else {
  ''
}

$finalKeyPassword = if (-not [string]::IsNullOrEmpty($KeyPassword)) {
  $KeyPassword
} elseif (-not [string]::IsNullOrEmpty($env:AURALIS_ANDROID_KEY_PASSWORD)) {
  $env:AURALIS_ANDROID_KEY_PASSWORD
} elseif ($keystoreProps.ContainsKey('keyPassword')) {
  $keystoreProps['keyPassword']
} else {
  ''
}

$signingValues = @($finalKeystorePath, $finalStorePassword, $finalKeyAlias, $finalKeyPassword)
$hasAnySigning = ($signingValues | Where-Object { -not [string]::IsNullOrEmpty($_) }).Count -gt 0
$hasCompleteSigning = ($signingValues | Where-Object { [string]::IsNullOrEmpty($_) }).Count -eq 0

if ($hasAnySigning -and -not $hasCompleteSigning) {
  throw 'Incomplete Android signing configuration. Provide all 4 of KeystorePath, KeystorePassword, KeyAlias, KeyPassword (via params, AURALIS_ANDROID_* env vars, or keystore.properties).'
}

if ($hasCompleteSigning) {
  $resolvedKsFile = if ([System.IO.Path]::IsPathRooted($finalKeystorePath)) {
    $finalKeystorePath
  } else {
    Join-Path $androidRoot $finalKeystorePath
  }
  if (-not (Test-Path -LiteralPath $resolvedKsFile)) {
    throw "Android release keystore file not found: $resolvedKsFile"
  }
  $finalKeystorePath = (Resolve-Path -LiteralPath $resolvedKsFile).Path
} elseif (-not $DebugBuild -and -not $AllowUnsigned) {
  throw 'Release APK builds require Android signing credentials (-KeystorePath/-KeystorePassword/-KeyAlias/-KeyPassword, AURALIS_ANDROID_* env vars, or ignored keystore.properties). Pass -AllowUnsigned only for unverified local release trials.'
}

$prevApi = $env:VITE_API_BASE_URL
$prevWs = $env:VITE_WS_BASE_URL
$prevAppTarget = $env:AURALIS_APP_TARGET
$prevViteTarget = $env:VITE_APP_TARGET
$prevJava = $env:JAVA_HOME
$prevAndroid = $env:ANDROID_HOME
$prevNdk = $env:NDK_HOME
$prevKsPath = $env:AURALIS_ANDROID_KEYSTORE_PATH
$prevKsPass = $env:AURALIS_ANDROID_KEYSTORE_PASSWORD
$prevKeyAlias = $env:AURALIS_ANDROID_KEY_ALIAS
$prevKeyPass = $env:AURALIS_ANDROID_KEY_PASSWORD
$envLocalMoved = $false

function Invoke-MobileStep {
  param(
    [string]$Executable,
    [string[]]$Arguments
  )
  Push-Location $mobileRoot
  try {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$Executable $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function Verify-EmbeddedUrls {
  param(
    [string]$DistDir
  )
  if (-not (Test-Path -LiteralPath $DistDir)) {
    throw "Expected frontend build output not found: $DistDir"
  }
  $jsFiles = Get-ChildItem -Path $DistDir -Recurse -File -Filter '*.js' | Where-Object {
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
}

function Verify-ApkMetadata {
  param(
    [string]$ApkPath,
    [string]$TargetName
  )
  $expectedPackage = if ($TargetName -eq 'tablet') { 'com.auralis.hd' } else { 'com.auralis.mobile' }
  $expectedLabel = if ($TargetName -eq 'tablet') { 'Auralis HD' } else { 'Auralis' }
  $expectedOrientationHex = if ($TargetName -eq 'tablet') { '0x6' } else { '0x1' }
  $expectedOrientationDec = if ($TargetName -eq 'tablet') { '6' } else { '1' }

  $badgingLines = & $aapt2Exe dump badging $ApkPath
  if ($LASTEXITCODE -ne 0) {
    throw "aapt2 dump badging failed for $ApkPath"
  }
  $badgingText = $badgingLines -join "`n"
  if ($badgingText -notmatch ("package:\s+name='" + [regex]::Escape($expectedPackage) + "'")) {
    throw "APK package mismatch for target '$TargetName'. Expected '$expectedPackage'. Output:`n$badgingText"
  }
  if ($badgingText -notmatch ("application-label:'" + [regex]::Escape($expectedLabel) + "'")) {
    throw "APK application-label mismatch for target '$TargetName'. Expected '$expectedLabel'. Output:`n$badgingText"
  }

  $manifestLines = & $aapt2Exe dump xmltree $ApkPath --file AndroidManifest.xml
  if ($LASTEXITCODE -ne 0) {
    throw "aapt2 dump xmltree failed for $ApkPath"
  }
  $manifestText = $manifestLines -join "`n"
  $orientationOk = ($manifestText -match ("android:screenOrientation[^\n]*" + [regex]::Escape($expectedOrientationHex))) -or ($manifestText -match ("android:screenOrientation[^\n]*=" + $expectedOrientationDec + "\b"))
  if (-not $orientationOk) {
    throw "APK screenOrientation mismatch for target '$TargetName'. Expected $expectedOrientationHex ($expectedOrientationDec)."
  }
}

$targetsToBuild = if ($Target -eq 'all') { @('phone', 'tablet') } else { @($Target) }

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
  $env:JAVA_HOME = $resolvedJavaHome
  $env:ANDROID_HOME = $resolvedAndroidHome
  $env:NDK_HOME = $resolvedNdkHome

  if ($hasCompleteSigning) {
    $env:AURALIS_ANDROID_KEYSTORE_PATH = $finalKeystorePath
    $env:AURALIS_ANDROID_KEYSTORE_PASSWORD = $finalStorePassword
    $env:AURALIS_ANDROID_KEY_ALIAS = $finalKeyAlias
    $env:AURALIS_ANDROID_KEY_PASSWORD = $finalKeyPassword
  } else {
    Remove-Item Env:AURALIS_ANDROID_KEYSTORE_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:AURALIS_ANDROID_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:AURALIS_ANDROID_KEY_ALIAS -ErrorAction SilentlyContinue
    Remove-Item Env:AURALIS_ANDROID_KEY_PASSWORD -ErrorAction SilentlyContinue
  }

  Invoke-MobileStep -Executable 'npm.cmd' -Arguments @('run', 'type-check')
  Invoke-MobileStep -Executable 'npm.cmd' -Arguments @('run', 'check:r4-mobile')
  Invoke-MobileStep -Executable 'npm.cmd' -Arguments @('run', 'test:r4-mobile')
  Invoke-MobileStep -Executable 'npm.cmd' -Arguments @('run', 'test:tablet')
  Invoke-MobileStep -Executable 'node' -Arguments @('scripts/check-tablet-sidebar-transition.mjs')

  New-Item -ItemType Directory -Path $resolvedOutputDir -Force | Out-Null

  $builtArtifacts = @()
  foreach ($itemTarget in $targetsToBuild) {
    $buildArgs = @('scripts/tauri-android-build.mjs', $itemTarget, '--apk')
    if ($DebugBuild) {
      $buildArgs += '--debug'
    }
    if ($Abi -ne 'universal') {
      $buildArgs += @('--target', $Abi)
    }

    Invoke-MobileStep -Executable 'node' -Arguments $buildArgs

    $distDir = Join-Path $mobileRoot ("dist-" + $itemTarget)
    Verify-EmbeddedUrls -DistDir $distDir

    $buildTypeSegment = if ($DebugBuild) { 'debug' } else { 'release' }
    $apkFiles = Get-ChildItem -Path $apkOutputRoot -Recurse -File -Filter '*.apk' -ErrorAction Stop | Where-Object {
      $_.FullName -notmatch 'androidTest' -and $_.FullName -match ("\\" + $buildTypeSegment + "\\")
    } | Sort-Object LastWriteTime -Descending

    $selectedApk = $apkFiles | Select-Object -First 1
    if (-not $selectedApk) {
      throw "No $buildTypeSegment APK found under $apkOutputRoot for target '$itemTarget'."
    }

    Verify-ApkMetadata -ApkPath $selectedApk.FullName -TargetName $itemTarget

    $variantLabel = if ($itemTarget -eq 'tablet') { 'tablet-hd' } else { 'phone' }
    $unsignedSuffix = if (-not $DebugBuild -and -not $hasCompleteSigning) { '-unsigned' } else { '' }
    $destFileName = "auralis-$variantLabel-$tauriVersion-$Abi-$buildTypeSegment$unsignedSuffix.apk"
    $destPath = Join-Path $resolvedOutputDir $destFileName
    Copy-Item -LiteralPath $selectedApk.FullName -Destination $destPath -Force

    $copiedInfo = Get-Item -LiteralPath $destPath
    $hash = (Get-FileHash -LiteralPath $destPath -Algorithm SHA256).Hash
    $sizeMb = [Math]::Round($copiedInfo.Length / (1024 * 1024), 2)
    $builtArtifacts += [PSCustomObject]@{
      Target = $itemTarget
      Package = if ($itemTarget -eq 'tablet') { 'com.auralis.hd' } else { 'com.auralis.mobile' }
      Signed = if ($DebugBuild) { 'debug-key' } elseif ($hasCompleteSigning) { 'release-keystore' } else { 'unsigned' }
      Path = $destPath
      Bytes = $copiedInfo.Length
      SizeMB = $sizeMb
      Sha256 = $hash
    }
  }

  Write-Host ''
  Write-Host '=== Mobile Release Build Summary ==='
  foreach ($artifact in $builtArtifacts) {
    Write-Host "Target: $($artifact.Target) ($($artifact.Package))"
    Write-Host "APK: $($artifact.Path)"
    Write-Host "Size: $($artifact.SizeMB) MB ($($artifact.Bytes) bytes)  Signing: $($artifact.Signed)"
    Write-Host "SHA-256: $($artifact.Sha256)"
  }
  Write-Host "Embedded API: $trimmedApi  WS: $trimmedWs"
} finally {
  if ($envLocalMoved) {
    Move-Item -LiteralPath $envLocalBackup -Destination $envLocal -Force
  }
  if ($null -eq $prevApi) { Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue } else { $env:VITE_API_BASE_URL = $prevApi }
  if ($null -eq $prevWs) { Remove-Item Env:VITE_WS_BASE_URL -ErrorAction SilentlyContinue } else { $env:VITE_WS_BASE_URL = $prevWs }
  if ($null -eq $prevAppTarget) { Remove-Item Env:AURALIS_APP_TARGET -ErrorAction SilentlyContinue } else { $env:AURALIS_APP_TARGET = $prevAppTarget }
  if ($null -eq $prevViteTarget) { Remove-Item Env:VITE_APP_TARGET -ErrorAction SilentlyContinue } else { $env:VITE_APP_TARGET = $prevViteTarget }
  if ($null -eq $prevJava) { Remove-Item Env:JAVA_HOME -ErrorAction SilentlyContinue } else { $env:JAVA_HOME = $prevJava }
  if ($null -eq $prevAndroid) { Remove-Item Env:ANDROID_HOME -ErrorAction SilentlyContinue } else { $env:ANDROID_HOME = $prevAndroid }
  if ($null -eq $prevNdk) { Remove-Item Env:NDK_HOME -ErrorAction SilentlyContinue } else { $env:NDK_HOME = $prevNdk }
  if ($null -eq $prevKsPath) { Remove-Item Env:AURALIS_ANDROID_KEYSTORE_PATH -ErrorAction SilentlyContinue } else { $env:AURALIS_ANDROID_KEYSTORE_PATH = $prevKsPath }
  if ($null -eq $prevKsPass) { Remove-Item Env:AURALIS_ANDROID_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue } else { $env:AURALIS_ANDROID_KEYSTORE_PASSWORD = $prevKsPass }
  if ($null -eq $prevKeyAlias) { Remove-Item Env:AURALIS_ANDROID_KEY_ALIAS -ErrorAction SilentlyContinue } else { $env:AURALIS_ANDROID_KEY_ALIAS = $prevKeyAlias }
  if ($null -eq $prevKeyPass) { Remove-Item Env:AURALIS_ANDROID_KEY_PASSWORD -ErrorAction SilentlyContinue } else { $env:AURALIS_ANDROID_KEY_PASSWORD = $prevKeyPass }
}

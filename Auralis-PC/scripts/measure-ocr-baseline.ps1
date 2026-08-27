param(
  [Parameter(Mandatory = $true)][string]$BundleDir,
  [Parameter(Mandatory = $true)][string]$FixtureDir,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [string]$SourceRoot
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Start-OcrProcess {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string]$Resources,
    [Parameter(Mandatory = $true)][string]$Manifest,
    [Parameter(Mandatory = $true)][string]$AllowedRoot
  )

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $Executable
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $arguments = @('--resources', $Resources, '--manifest', $Manifest, '--allowed-image-root', $AllowedRoot)
  if ($null -ne $startInfo.PSObject.Properties['ArgumentList']) {
    foreach ($argument in $arguments) { [void]$startInfo.ArgumentList.Add($argument) }
  } else {
    $startInfo.Arguments = ($arguments | ForEach-Object {
        $escaped = $_ -replace '(\\*)"', '$1$1\\"'
        if ($escaped -match '[\s"]') { '"' + ($escaped -replace '(\\+)$', '$1$1') + '"' } else { $escaped }
      }) -join ' '
  }
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw "Failed to start OCR sidecar: $Executable" }
  return $process
}

function Invoke-OcrRequest {
  param(
    [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
    [Parameter(Mandatory = $true)][System.IO.FileInfo]$Fixture,
    [Parameter(Mandatory = $true)][int]$Sequence
  )

  $request = @{
    protocolVersion = 1
    taskId = "baseline-$Sequence"
    pageNumber = $Sequence
    imagePath = $Fixture.FullName
    timeoutMs = 120000
  } | ConvertTo-Json -Compress
  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  $Process.StandardInput.WriteLine($request)
  $line = $Process.StandardOutput.ReadLine()
  $watch.Stop()
  if ([string]::IsNullOrWhiteSpace($line)) { throw "OCR sidecar returned no response for $($Fixture.Name)" }
  $response = $line | ConvertFrom-Json
  if ($response.ok -ne $true) { throw "OCR failed for $($Fixture.Name): $($response.errorCode)" }
  $Process.Refresh()
  return [pscustomobject]@{
    fixture = $Fixture.Name
    elapsedMs = [math]::Round($watch.Elapsed.TotalMilliseconds, 2)
    sidecarTotalMs = [math]::Round([double]$response.timingMs.total, 2)
    rssBytes = [int64]$Process.WorkingSet64
  }
}

$bundle = [System.IO.Path]::GetFullPath($BundleDir)
$fixtures = [System.IO.Path]::GetFullPath($FixtureDir)
$output = [System.IO.Path]::GetFullPath($OutputPath)
$source = if ($SourceRoot) {
  [System.IO.Path]::GetFullPath($SourceRoot)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $bundle '..\..\..\..'))
}
$sidecar = Get-ChildItem -LiteralPath (Join-Path $source 'binaries') -File -Filter 'auralis-ocr-*.exe' | Select-Object -First 1
if ($null -eq $sidecar) { throw "No bundled OCR sidecar found in $bundle" }

$resourceRoot = Get-Item -LiteralPath (Join-Path $source '..\ocr-sidecar') -ErrorAction SilentlyContinue
if ($null -eq $resourceRoot) { throw "No bundled ocr-sidecar resource directory found in $bundle" }
$resources = Join-Path $resourceRoot.FullName 'resources'
$manifest = Join-Path $resourceRoot.FullName 'model_manifest.json'
if (-not (Test-Path -LiteralPath $resources) -or -not (Test-Path -LiteralPath $manifest)) {
  throw "Bundled OCR resources are incomplete under $($resourceRoot.FullName)"
}

$fixtureFiles = @(Get-ChildItem -LiteralPath $fixtures -File -Filter '*.png' | Sort-Object Name)
if ($fixtureFiles.Count -lt 5) { throw "Expected at least five OCR fixtures, found $($fixtureFiles.Count)" }

$cold = @()
foreach ($fixture in $fixtureFiles) {
  $process = Start-OcrProcess -Executable $sidecar.FullName -Resources $resources -Manifest $manifest -AllowedRoot $fixtures
  try {
    $cold += Invoke-OcrRequest -Process $process -Fixture $fixture -Sequence 1
  } finally {
    $process.StandardInput.Close()
    $process.WaitForExit()
    $process.Dispose()
  }
}

$warmProcess = Start-OcrProcess -Executable $sidecar.FullName -Resources $resources -Manifest $manifest -AllowedRoot $fixtures
$warm = @()
try {
  $sequence = 0
  foreach ($fixture in $fixtureFiles) {
    $sequence++
    $warm += Invoke-OcrRequest -Process $warmProcess -Fixture $fixture -Sequence $sequence
  }
} finally {
  $warmProcess.StandardInput.Close()
  $warmProcess.WaitForExit()
  $warmProcess.Dispose()
}

function Get-P95 {
  param([double[]]$Values)
  $sorted = @($Values | Sort-Object)
  $index = [math]::Ceiling($sorted.Count * 0.95) - 1
  return [math]::Round($sorted[[math]::Max(0, [int]$index)], 2)
}

$packageBytes = [int64]((Get-ChildItem -LiteralPath $bundle -Recurse -File | Measure-Object -Property Length -Sum).Sum)
$allRss = @($cold + $warm | ForEach-Object { $_.rssBytes })
$result = [pscustomobject]@{
  schemaVersion = 1
  measuredAt = [DateTimeOffset]::UtcNow.ToString('o')
  platform = [System.Environment]::OSVersion.VersionString
  coldSamples = $cold
  warmSamples = $warm
  packageSizeBytes = $packageBytes
  rssBytes = ($allRss | Measure-Object -Maximum).Maximum
  p95ColdMs = Get-P95 -Values @($cold | ForEach-Object { $_.elapsedMs })
  p95WarmMs = Get-P95 -Values @($warm | ForEach-Object { $_.elapsedMs })
  status = 'measured'
}
$parent = Split-Path -Parent $output
if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $output -Encoding UTF8

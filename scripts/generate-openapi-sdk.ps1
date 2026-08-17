param(
    [switch]$SkipExport
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$artifact = Join-Path $repoRoot 'docs\contracts\openapi\auralis-openapi.json'
$exportScript = Join-Path $PSScriptRoot 'export-openapi.ps1'

if (-not $SkipExport) {
    & $exportScript
    if ($LASTEXITCODE -ne 0) {
        throw "OpenAPI export script failed with exit code $LASTEXITCODE."
    }
}

if (-not (Test-Path -LiteralPath $artifact)) {
    throw "OpenAPI artifact not found: $artifact"
}

$generatorVersion = '7.13.0'
$cachePath = Join-Path ([System.IO.Path]::GetTempPath()) "auralis-openapi-npm-cache-$PID"
New-Item -ItemType Directory -Force -Path $cachePath | Out-Null
$previousCache = $env:NPM_CONFIG_CACHE
$env:NPM_CONFIG_CACHE = $cachePath

try {
    $targets = @(
        (Join-Path $repoRoot 'Auralis-PC\src\api\generated\schema.ts'),
        (Join-Path $repoRoot 'Auralis-Mobile\src\api\generated\schema.ts')
    )

    foreach ($target in $targets) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
        & npx --yes "openapi-typescript@$generatorVersion" $artifact -o $target
        if ($LASTEXITCODE -ne 0) {
            throw "openapi-typescript failed for $target with exit code $LASTEXITCODE."
        }
    }
}
finally {
    if ($null -eq $previousCache) {
        Remove-Item Env:NPM_CONFIG_CACHE -ErrorAction SilentlyContinue
    }
    else {
        $env:NPM_CONFIG_CACHE = $previousCache
    }

    if (Test-Path -LiteralPath $cachePath) {
        Remove-Item -LiteralPath $cachePath -Recurse -Force
    }
}

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$serverRoot = Join-Path $repoRoot 'Auralis-Server'
$artifact = Join-Path $repoRoot 'docs\contracts\openapi\auralis-openapi.json'
$mavenCommand = if ($env:OS -eq 'Windows_NT') {
    Join-Path $serverRoot 'mvnw.cmd'
} else {
    'mvn'
}

Push-Location $serverRoot
try {
    & $mavenCommand -B -ntp "-Dtest=OpenApiArtifactTests" test
    if ($LASTEXITCODE -ne 0) {
        throw "Runtime OpenAPI artifact comparison failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $artifact)) {
    throw "OpenAPI artifact not found: $artifact"
}

$generatorVersion = '7.13.0'
$cachePath = Join-Path ([System.IO.Path]::GetTempPath()) "auralis-openapi-check-cache-$PID"
$outputRoot = Join-Path ([System.IO.Path]::GetTempPath()) "auralis-openapi-check-output-$PID"
New-Item -ItemType Directory -Force -Path $cachePath, $outputRoot | Out-Null
$previousCache = $env:NPM_CONFIG_CACHE
$env:NPM_CONFIG_CACHE = $cachePath

try {
    foreach ($target in @('Auralis-PC', 'Auralis-Mobile')) {
        $generated = Join-Path $outputRoot "$target-schema.ts"
        & npx --yes "openapi-typescript@$generatorVersion" $artifact -o $generated
        if ($LASTEXITCODE -ne 0) {
            throw "openapi-typescript check generation failed for $target with exit code $LASTEXITCODE."
        }

        $tracked = Join-Path $repoRoot "$target\src\api\generated\schema.ts"
        if (-not (Test-Path -LiteralPath $tracked)) {
            throw "Tracked generated schema not found: $tracked"
        }

        $generatedContent = (Get-Content -LiteralPath $generated -Raw) -replace "`r`n", "`n"
        $trackedContent = (Get-Content -LiteralPath $tracked -Raw) -replace "`r`n", "`n"
        if ($generatedContent -cne $trackedContent) {
            throw "Generated OpenAPI schema is stale for $target. Run scripts/generate-openapi-sdk.ps1."
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

    foreach ($temporaryPath in @($cachePath, $outputRoot)) {
        if (Test-Path -LiteralPath $temporaryPath) {
            Remove-Item -LiteralPath $temporaryPath -Recurse -Force
        }
    }
}

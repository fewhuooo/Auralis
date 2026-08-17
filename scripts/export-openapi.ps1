$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$serverRoot = Join-Path $repoRoot 'Auralis-Server'
$mavenCommand = if ($env:OS -eq 'Windows_NT') {
    Join-Path $serverRoot 'mvnw.cmd'
} else {
    'mvn'
}

Push-Location $serverRoot
try {
    & $mavenCommand -B -ntp "-Dtest=OpenApiArtifactTests" "-Dauralis.openapi.export=true" test
    if ($LASTEXITCODE -ne 0) {
        throw "OpenAPI export failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

param([string]$Tests)

$ErrorActionPreference = 'Stop'
$serverRoot = Join-Path $PSScriptRoot '..\Auralis-Server'
$ownerId = [guid]::NewGuid().ToString('N')
$containerName = "auralis-test-$ownerId"
$containerStarted = $false
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "auralis-server-test-$ownerId"
$mavenExitCode = 1
$previousPostgresUrl = [Environment]::GetEnvironmentVariable('AURALIS_TEST_POSTGRES_URL', 'Process')

function Invoke-Docker {
    param([string[]]$Arguments)
    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "docker $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
}

try {
    if (-not (Get-Command docker.exe -ErrorAction SilentlyContinue)) {
        throw 'Docker CLI is required to run the isolated PostgreSQL integration tests.'
    }

    $javaSettings = & java -XshowSettings:properties -version 2>&1 | Select-String 'java.home = '
    if (-not $javaSettings) { throw 'Could not locate the Java runtime home for keytool.' }
    $javaHome = ($javaSettings.Line -replace '^\s*java\.home\s*=\s*', '').Trim()
    $keytoolPath = Join-Path $javaHome 'bin\keytool.exe'
    if (-not (Test-Path -LiteralPath $keytoolPath)) { throw "keytool was not found under Java home: $javaHome" }

    New-Item -ItemType Directory -Path $tempRoot | Out-Null
    $keystorePath = Join-Path $tempRoot 'localhost-test.p12'
    & $keytoolPath -genkeypair -alias auralis-test -keyalg RSA -keysize 2048 -validity 2 `
        -dname 'CN=localhost, OU=Auralis Test, O=Auralis, L=Test, ST=Test, C=US' `
        -ext 'SAN=dns:localhost,ip:127.0.0.1' -storetype PKCS12 -keystore $keystorePath `
        -storepass changeit -keypass changeit -noprompt | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "keytool failed with exit code $LASTEXITCODE" }

    $containerStarted = $true
    Invoke-Docker -Arguments @(
        'run', '--detach', '--rm', '--name', $containerName,
        '--label', "codex.auralis.test-runner=$ownerId",
        '--env', 'POSTGRES_USER=postgres', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust',
        '--env', 'POSTGRES_DB=auralis_test', '--publish', '127.0.0.1::5432',
        'pgvector/pgvector:0.8.6-pg17-bookworm'
    ) | Out-Null

    $published = Invoke-Docker -Arguments @('inspect', '--format', '{{json .NetworkSettings.Ports}}', $containerName) |
        ConvertFrom-Json
    $port = [int]$published.'5432/tcp'[0].HostPort
    $postgresUrl = "jdbc:postgresql://127.0.0.1:$port/auralis_test"
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        & docker exec $containerName pg_isready -U postgres -d auralis_test *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'The task-owned PostgreSQL container did not become ready within 60 seconds.' }

    Push-Location $serverRoot
    try {
        $env:AURALIS_TEST_POSTGRES_URL = $postgresUrl
        $mavenArguments = @('-B', '-ntp', "-Dauralis.usage.postgres.url=$postgresUrl",
            "-Dauralis.test.tls.keystore=$keystorePath")
        if ($Tests) { $mavenArguments += "-Dtest=$Tests" }
        $mavenArguments += 'test'
        & .\mvnw.cmd @mavenArguments
        $mavenExitCode = $LASTEXITCODE
    }
    finally {
        if ($null -eq $previousPostgresUrl) {
            Remove-Item Env:AURALIS_TEST_POSTGRES_URL -ErrorAction SilentlyContinue
        }
        else {
            $env:AURALIS_TEST_POSTGRES_URL = $previousPostgresUrl
        }
        Pop-Location
    }
}
catch {
    Write-Error $_
    $mavenExitCode = 1
}
finally {
    if ($containerStarted) {
        $label = & docker inspect --format '{{ index .Config.Labels "codex.auralis.test-runner" }}' $containerName 2>$null
        if ($LASTEXITCODE -eq 0 -and $label.Trim() -eq $ownerId) {
            & docker stop --time 10 $containerName *> $null
            if ($LASTEXITCODE -ne 0) { Write-Warning "Could not stop task-owned container $containerName." }
        }
        elseif ($LASTEXITCODE -eq 0) {
            Write-Warning "Container $containerName no longer has this runner's ownership label; leaving it untouched."
        }
    }
    if (Test-Path -LiteralPath $tempRoot) {
        $resolvedTempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\', '/')
        $resolvedTempRoot = [System.IO.Path]::GetFullPath($tempRoot)
        $tempRootParent = [System.IO.Path]::GetDirectoryName($resolvedTempRoot).TrimEnd('\', '/')
        $tempRootLeaf = [System.IO.Path]::GetFileName($resolvedTempRoot)
        $tempRootItem = Get-Item -LiteralPath $resolvedTempRoot
        if ($tempRootParent.Equals($resolvedTempBase, [System.StringComparison]::OrdinalIgnoreCase) -and
            $tempRootLeaf -eq "auralis-server-test-$ownerId" -and
            -not ($tempRootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
            Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
        }
        else {
            Write-Warning "Temporary path $resolvedTempRoot failed the ownership/path checks; leaving it untouched."
        }
    }
}

exit $mavenExitCode

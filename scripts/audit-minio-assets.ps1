param(
    [string]$DbHost = "127.0.0.1",
    [int]$DbPort = 5432,
    [string]$DbName = "auralis",
    [string]$DbUser = "auralis",
    [string]$DbPassword = $env:AURALIS_DB_PASSWORD,
    [string]$MinioEndpoint = "http://127.0.0.1:9000",
    [string]$MinioBucket = "auralis-assets",
    [string]$MinioAccessKey = $env:AURALIS_MINIO_ROOT_USER,
    [string]$MinioSecretKey = $env:AURALIS_MINIO_ROOT_PASSWORD
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    throw "psql is required to audit database object keys."
}
if (-not (Get-Command mc -ErrorAction SilentlyContinue)) {
    throw "mc is required to audit MinIO object keys."
}
if ([string]::IsNullOrWhiteSpace($DbPassword)) {
    throw "Set AURALIS_DB_PASSWORD or pass -DbPassword before running the audit."
}
if ([string]::IsNullOrWhiteSpace($MinioAccessKey) -or [string]::IsNullOrWhiteSpace($MinioSecretKey)) {
    throw "Set AURALIS_MINIO_ROOT_USER and AURALIS_MINIO_ROOT_PASSWORD before running the audit."
}

$oldPassword = $env:PGPASSWORD
$oldMinioHost = $env:MC_HOST_audit
try {
    $env:PGPASSWORD = $DbPassword
    $connection = "host=$DbHost port=$DbPort dbname=$DbName user=$DbUser"
    $dbKeys = @(& psql $connection --tuples-only --no-align --command `
        "select object_key from assets order by object_key" 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw ($dbKeys -join [Environment]::NewLine)
    }
    $dbKeys = @($dbKeys | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ })

    $escapedAccessKey = [uri]::EscapeDataString($MinioAccessKey)
    $escapedSecretKey = [uri]::EscapeDataString($MinioSecretKey)
    $envEndpoint = $MinioEndpoint.TrimEnd('/')
    $schemeEnd = $envEndpoint.IndexOf("://", [StringComparison]::Ordinal)
    if ($schemeEnd -lt 0) {
        throw "MinIO endpoint must include http:// or https://."
    }
    $env:MC_HOST_audit = $envEndpoint.Substring(0, $schemeEnd + 3) + "$escapedAccessKey`:$escapedSecretKey@" + $envEndpoint.Substring($schemeEnd + 3)

    $objects = @(& mc ls --recursive --json "audit/$MinioBucket" 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw ($objects -join [Environment]::NewLine)
    }
    $objectKeys = @($objects | ForEach-Object {
        if ($_.ToString().Trim()) {
            ($_.ToString() | ConvertFrom-Json).key
        }
    } | Where-Object { $_ })

    $dbKeySet = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $objectKeySet = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $dbKeys | ForEach-Object { [void]$dbKeySet.Add($_) }
    $objectKeys | ForEach-Object { [void]$objectKeySet.Add($_) }

    $databaseOrphans = @($dbKeys | Where-Object { -not $objectKeySet.Contains($_) })
    $storageOrphans = @($objectKeys | Where-Object { -not $dbKeySet.Contains($_) })

    [pscustomobject]@{
        DatabaseAssetKeys = $dbKeySet.Count
        MinioObjectKeys = $objectKeySet.Count
        DatabaseRecordsWithoutObjects = $databaseOrphans.Count
        MinioObjectsWithoutDatabaseRecords = $storageOrphans.Count
        DatabaseRecordsWithoutObjectsKeys = $databaseOrphans
        MinioObjectsWithoutDatabaseRecordsKeys = $storageOrphans
    }
}
finally {
    $env:PGPASSWORD = $oldPassword
    $env:MC_HOST_audit = $oldMinioHost
}

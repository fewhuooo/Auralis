[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$OutputDirectory,

    [string]$ProjectDirectory = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectPath = (Resolve-Path -LiteralPath $ProjectDirectory).Path
$fixturePath = Join-Path $projectPath 'src\test\resources\ai-quality\baseline-v1.json'
$testPath = Join-Path $projectPath 'src\test\java\com\auralis\app\AiQualityFixtureContractTests.java'
$mavenWrapper = Join-Path $projectPath 'mvnw.cmd'
if (-not (Test-Path -LiteralPath $fixturePath) -or -not (Test-Path -LiteralPath $testPath) -or -not (Test-Path -LiteralPath $mavenWrapper)) {
    throw 'Offline AI quality inputs are incomplete; expected the baseline fixture, fixture contract test, and Maven wrapper.'
}

$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
$projectPrefix = $projectPath.TrimEnd('\') + '\'
if ($outputPath.Equals($projectPath, [System.StringComparison]::OrdinalIgnoreCase) -or
    $outputPath.StartsWith($projectPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'OutputDirectory must be outside the project directory.'
}
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
$fixture = Get-Content -LiteralPath $fixturePath -Raw | ConvertFrom-Json
$logPath = Join-Path $outputPath 'offline-contract-tests.log'
$reportPath = Join-Path $outputPath 'quality-report.json'
$manualPath = Join-Path $outputPath 'manual-review-template.json'

$manualReviews = @(
    foreach ($case in $fixture.cases) {
        $scores = [ordered]@{}
        foreach ($dimension in $case.manualDimensions) {
            $scores[$dimension] = $null
        }
        $reviewers = @(
            foreach ($reviewerNumber in 1..2) {
                $reviewerScores = [ordered]@{}
                foreach ($dimension in $case.manualDimensions) {
                    $reviewerScores[$dimension] = $null
                }
                [ordered]@{
                    reviewerId = $null
                    status = 'NOT_RUN'
                    scores = $reviewerScores
                    notes = $null
                }
            }
        )
        [ordered]@{
            caseId = $case.id
            kind = $case.kind
            question = $case.question
            expectedAnswerability = $case.answerability
            allowedSourceKeys = @($case.allowedSourceKeys)
            expectedEvidence = @($case.expectedEvidence)
            requiredFacts = @($case.requiredFacts)
            forbiddenFacts = @($case.forbiddenFacts)
            status = 'NOT_RUN'
            scores = $scores
            notes = $null
            reviewers = $reviewers
            adjudication = $null
        }
    }
)
$manualTemplate = [ordered]@{
    baselineId = $fixture.baselineId
    reviewerPolicy = 'Two independent reviewers for initial human gate; record adjudication for disagreements.'
    scoreScale = [ordered]@{
        '0' = 'Incorrect, absent, or unsupported'
        '1' = 'Partial or ambiguous'
        '2' = 'Correct and supported by the expected evidence'
    }
    status = 'NOT_RUN'
    cases = $manualReviews
}
$manualTemplate | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $manualPath -Encoding utf8

Push-Location $projectPath
try {
    & $mavenWrapper -B -ntp '-Dtest=AiQualityFixtureContractTests' test *> $logPath
    $testExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

$testCounts = $null
$surefireText = Join-Path $projectPath 'target\surefire-reports\com.auralis.app.AiQualityFixtureContractTests.txt'
if (Test-Path -LiteralPath $surefireText) {
    $summary = Get-Content -LiteralPath $surefireText -Raw
    if ($summary -match 'Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)') {
        $testCounts = [ordered]@{
            run = [int]$Matches[1]
            failures = [int]$Matches[2]
            errors = [int]$Matches[3]
            skipped = [int]$Matches[4]
        }
    }
}
$contractStatus = if ($testExitCode -eq 0) { 'PASS' } else { 'FAIL' }
$report = [ordered]@{
    baselineId = $fixture.baselineId
    executionMode = 'OFFLINE_CONTRACT_ONLY'
    contractStatus = $contractStatus
    testExitCode = $testExitCode
    testCounts = $testCounts
    semanticQuality = 'NOT_RUN'
    realEmbeddingEvaluation = 'NOT_RUN'
    realProviderEvaluation = 'NOT_SUPPORTED_BY_THIS_RUNNER'
    humanReview = 'NOT_RUN'
    manualReviewTemplate = [System.IO.Path]::GetFullPath($manualPath)
    testLog = [System.IO.Path]::GetFullPath($logPath)
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding utf8

Write-Output "AI quality offline contract: $contractStatus (exit $testExitCode)"
Write-Output 'Semantic quality: NOT_RUN'
Write-Output 'Real embedding evaluation: NOT_RUN'
Write-Output 'Real Provider evaluation: NOT_SUPPORTED_BY_THIS_RUNNER'
Write-Output 'Human review: NOT_RUN; score fields remain null.'
Write-Output "Report: $reportPath"
Write-Output "Manual review template: $manualPath"
Write-Output "Test log: $logPath"
if ($testExitCode -ne 0) {
    exit $testExitCode
}




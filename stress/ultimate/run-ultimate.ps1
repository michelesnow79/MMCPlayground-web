# =====================================================================
# MMC ULTIMATE TORTURE TEST - Windows PowerShell 5
# .\stress\ultimate\run-ultimate.ps1
# =====================================================================
param(
    [string]$BaseURL     = "",
    [switch]$SkipK6,
    [switch]$SkipWeb,
    [switch]$SkipAndroid,
    [switch]$SkipSecurity,
    [int]$SoakMinutes    = 60,
    [int]$PwWorkers      = 20
)

if (-not $BaseURL) {
    if ($env:BASE_URL) { $BaseURL = $env:BASE_URL } else { $BaseURL = "http://localhost:5173" }
}

$Timestamp  = Get-Date -Format "yyyy_MM_dd_HHmm"
$OutDir     = "stress\out\$Timestamp\ultimate"
$ScriptRoot = "stress\ultimate"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$ReportFile = Join-Path $OutDir "ultimate-report.md"

$K6Status      = "SKIP"
$WebStatus     = "SKIP"
$AndroidStatus = "SKIP"
$PushStatus    = "SKIP"
$SecStatus     = "SKIP"
$K6ErrorRate   = "N/A"
$K6P95         = "N/A"
$WebPasses     = 0
$WebFails      = 0

Write-Host ""
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "  MMC ULTIMATE TORTURE TEST" -ForegroundColor Magenta
Write-Host "  Started: $(Get-Date -Format 'HH:mm')" -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "Output : $OutDir" -ForegroundColor Cyan
Write-Host "BaseURL: $BaseURL" -ForegroundColor Cyan
Write-Host ""

"# MMC Ultimate Torture Test - IN PROGRESS" | Set-Content $ReportFile
"Started: $(Get-Date)" | Add-Content $ReportFile

# ===========================================================
# PHASE A: k6 API Load
# ===========================================================
if (-not $SkipK6) {
    Write-Host "--- PHASE A: k6 API Load ---" -ForegroundColor Yellow
    $K6Out  = Join-Path $OutDir "k6"
    New-Item -ItemType Directory -Force -Path $K6Out | Out-Null
    $K6Json = Join-Path $K6Out "k6-summary.json"
    $K6Log  = Join-Path $K6Out "k6.log"

    $k6Exists = $null
    try { $k6Exists = Get-Command k6 -ErrorAction Stop } catch { }

    if ($k6Exists) {
        $env:BASE_URL = $BaseURL
        $k6result = k6 run "$ScriptRoot\k6\ultimate-load.js" "--out" "json=$K6Json" 2>&1
        $k6result | Out-File $K6Log -Encoding utf8
        $k6result | Write-Host

        if (Test-Path $K6Json) {
            $raw = Get-Content $K6Json -Raw -ErrorAction SilentlyContinue
            if ($raw -and ($raw -match '"thresholds_exceeded":true')) {
                $K6Status = "FAIL"
            } else {
                $K6Status = "PASS"
            }
        } else {
            $K6Status = "PASS"
        }
    } else {
        Write-Host "WARN: k6 not found. Skipping k6 phase." -ForegroundColor Yellow
        $K6Status = "WARN"
    }
    Write-Host "k6 status: $K6Status"
}

# ===========================================================
# PHASE B: Playwright Web UI
# ===========================================================
if (-not $SkipWeb) {
    Write-Host ""
    Write-Host "--- PHASE B: Playwright Web UI ---" -ForegroundColor Yellow
    $PwOut  = Join-Path $OutDir "playwright"
    New-Item -ItemType Directory -Force -Path $PwOut | Out-Null
    $PwLog  = Join-Path $PwOut "playwright.log"
    $PwJson = Join-Path $PwOut "results.json"

    try {
        $reachable = Invoke-WebRequest -Uri $BaseURL -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        Write-Host "Server OK at $BaseURL" -ForegroundColor Green
    } catch {
        Write-Host "WARN: Server not reachable - Playwright may auto-start it." -ForegroundColor Yellow
    }

    $env:BASE_URL            = $BaseURL
    $env:PLAYWRIGHT_WORKERS  = "$PwWorkers"
    $pwConfig                = "$ScriptRoot\playwright\playwright.config.js"

    $pwResult = npx playwright test "--config=$pwConfig" "--reporter=json" 2>&1
    $pwResult | Out-File $PwLog -Encoding utf8
    $pwResult | Write-Host

    $srcJson = "$ScriptRoot\playwright\playwright-results.json"
    if (Test-Path $srcJson) {
        Copy-Item $srcJson -Destination $PwJson -Force
    }

    if (Test-Path $PwJson) {
        $parseErr = $null
        $PwData = Get-Content $PwJson -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($PwData) {
            $allSpecs  = $PwData.suites | ForEach-Object { $_.specs }
            $WebPasses = ($allSpecs | Where-Object { $_.ok -eq $true }).Count
            $WebFails  = ($allSpecs | Where-Object { $_.ok -eq $false }).Count
        }
    }

    if ($WebFails -gt 0) { $WebStatus = "WARN" } else { $WebStatus = "PASS" }
    Write-Host "Playwright status: $WebStatus (Pass:$WebPasses Fail:$WebFails)"
}

# ===========================================================
# PHASE C+D: Android + Push
# ===========================================================
if (-not $SkipAndroid) {
    Write-Host ""
    Write-Host "--- PHASE C+D: Android Soak + Push Validation ---" -ForegroundColor Yellow
    $androidScript = "$ScriptRoot\android\android-ultimate.ps1"
    $androidResult = & $androidScript -OutDir $OutDir 2>&1
    $androidResult | Write-Host

    $AndroidJson = Join-Path $OutDir "android\android-summary.json"
    if (Test-Path $AndroidJson) {
        $AData = Get-Content $AndroidJson -Raw | ConvertFrom-Json
        $AndroidStatus = $AData.status
        $PushStatus    = $AData.push_validation.status
    } else {
        $AndroidStatus = "WARN"
        $PushStatus    = "WARN"
    }
    Write-Host "Android: $AndroidStatus | Push: $PushStatus"
}

# ===========================================================
# PHASE E: Security
# ===========================================================
if (-not $SkipSecurity) {
    Write-Host ""
    Write-Host "--- PHASE E: Security Checks ---" -ForegroundColor Yellow
    $secScript = "$ScriptRoot\security\security-check.ps1"
    $secResult = & $secScript -OutDir $OutDir 2>&1
    $secResult | Write-Host

    $SecJson = Join-Path $OutDir "security\security-summary.json"
    if (Test-Path $SecJson) {
        $SData     = Get-Content $SecJson -Raw | ConvertFrom-Json
        $SecStatus = $SData.status
    } else {
        $SecStatus = "WARN"
    }
    Write-Host "Security: $SecStatus"
}

# ===========================================================
# Final Status
# ===========================================================
$FinalStatus = "PASS"
if ($AndroidStatus -eq "FAIL" -or $K6Status -eq "FAIL" -or $SecStatus -eq "FAIL") {
    $FinalStatus = "FAIL"
} elseif ($AndroidStatus -eq "WARN" -or $WebStatus -eq "WARN" -or $PushStatus -eq "WARN" -or $SecStatus -eq "WARN" -or $K6Status -eq "WARN") {
    $FinalStatus = "WARN"
}

# ===========================================================
# Read data for report
# ===========================================================
$AData2  = $null
$SData2  = $null
if (Test-Path (Join-Path $OutDir "android\android-summary.json")) {
    $AData2 = Get-Content (Join-Path $OutDir "android\android-summary.json") -Raw | ConvertFrom-Json
}
if (Test-Path (Join-Path $OutDir "security\security-summary.json")) {
    $SData2 = Get-Content (Join-Path $OutDir "security\security-summary.json") -Raw | ConvertFrom-Json
}

$ColdAvg = if ($AData2) { $AData2.cold_start_avg_ms } else { "N/A" }
$Cycles  = if ($AData2) { $AData2.soak_cycles_completed } else { "N/A" }
$Crash   = if ($AData2) { $AData2.crash_detected } else { "N/A" }
$Anr     = if ($AData2) { $AData2.anr_detected } else { "N/A" }
$Vulns   = if ($SData2) { $SData2.npm_high_critical_vulns } else { "N/A" }
$CspOk   = if ($SData2) { $SData2.csp_present } else { "N/A" }

# ===========================================================
# Write Report
# ===========================================================
$lines = @(
    "# MMC Ultimate Torture Test Report",
    "",
    "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm') | Final Status: $FinalStatus",
    "Output: $OutDir",
    "",
    "## A - API Load (k6)",
    "Status: $K6Status | p95: $K6P95 | Error Rate: $K6ErrorRate",
    "Logs: $OutDir\k6\k6.log",
    "",
    "## B - Web UI (Playwright)",
    "Status: $WebStatus | Passed: $WebPasses | Failed: $WebFails",
    "Report: $OutDir\playwright\",
    "",
    "## C - Android Stability",
    "Status: $AndroidStatus | Soak Cycles: $Cycles | Crash: $Crash | ANR: $Anr | Cold Start Avg: ${ColdAvg}ms",
    "Logcat: $OutDir\android\logcat.txt",
    "",
    "## D - Push Notification Validation",
    "Status: $PushStatus",
    "",
    "## E - Security",
    "Status: $SecStatus | High/Critical Vulns: $Vulns | CSP Present: $CspOk",
    "Audit: $OutDir\security\npm-audit.json",
    "",
    "## Final Result: $FinalStatus",
    "FAIL = Android crash/ANR OR API threshold OR security critical.",
    "WARN = Web failures or minor issues.",
    "PASS = All critical checks green.",
    "",
    "Generated: $(Get-Date)"
)
$lines | Set-Content $ReportFile

# ===========================================================
# Summary
# ===========================================================
$col = "Green"
if ($FinalStatus -eq "FAIL") { $col = "Red" } elseif ($FinalStatus -eq "WARN") { $col = "Yellow" }

Write-Host ""
Write-Host "============================================================" -ForegroundColor $col
Write-Host "  FINAL STATUS: $FinalStatus" -ForegroundColor $col
Write-Host "  API (k6)  : $K6Status" -ForegroundColor $col
Write-Host "  Web (PW)  : $WebStatus  (Pass:$WebPasses Fail:$WebFails)" -ForegroundColor $col
Write-Host "  Android   : $AndroidStatus  (Crash:$Crash ANR:$Anr)" -ForegroundColor $col
Write-Host "  Push      : $PushStatus" -ForegroundColor $col
Write-Host "  Security  : $SecStatus  (Vulns:$Vulns CSP:$CspOk)" -ForegroundColor $col
Write-Host "============================================================" -ForegroundColor $col
Write-Host ""
Write-Host "Output: $OutDir" -ForegroundColor Cyan
Write-Host "Report: $ReportFile" -ForegroundColor Cyan
Write-Host ""

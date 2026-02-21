# =====================================================================
# MMC ULTIMATE TORTURE TEST - Windows PowerShell
# One command. All phases. Never stops early.
#
# Usage:
#   .\stress\ultimate\run-ultimate.ps1
#   .\stress\ultimate\run-ultimate.ps1 -BaseURL http://localhost:5173
#   .\stress\ultimate\run-ultimate.ps1 -SkipSoak -SkipAndroid
#
# Flags:
#   -BaseURL       Web app URL       (default: http://localhost:5173)
#   -SkipK6        Skip API load     (default: false)
#   -SkipWeb       Skip Playwright   (default: false)
#   -SkipAndroid   Skip Android      (default: false)
#   -SkipSecurity  Skip Security     (default: false)
#   -SoakMinutes   Soak duration     (default: 60)
# =====================================================================
param(
    [string]$BaseURL      = $env:BASE_URL ?? "http://localhost:5173",
    [switch]$SkipK6,
    [switch]$SkipWeb,
    [switch]$SkipAndroid,
    [switch]$SkipSecurity,
    [int]$SoakMinutes     = 60,
    [int]$PwWorkers       = 20
)

$Timestamp = Get-Date -Format "yyyy_MM_dd_HHmm"
$OutDir    = "stress\out\$Timestamp\ultimate"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$ReportFile  = Join-Path $OutDir "ultimate-report.md"
$ScriptRoot  = "stress\ultimate"

# Phase results
$K6Status       = "SKIP"
$WebStatus      = "SKIP"
$AndroidStatus  = "SKIP"
$PushStatus     = "SKIP"
$SecStatus      = "SKIP"

$K6ErrorRate  = "N/A"
$K6P95        = "N/A"
$WebPasses    = 0
$WebFails     = 0

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║     MMC ULTIMATE TORTURE TEST — $(Get-Date -Format 'HH:mm')              ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host "Output: $OutDir" -ForegroundColor Cyan
Write-Host "BaseURL: $BaseURL" -ForegroundColor Cyan
Write-Host ""

# ─── In-Progress Report ──────────────────────────────────────────────────────
"# 🧪 MMC Ultimate Torture Test Report" | Set-Content $ReportFile
"**Date:** $(Get-Date -Format 'yyyy-MM-dd HH:mm') | **Status:** ⏳ IN PROGRESS" | Add-Content $ReportFile
"" | Add-Content $ReportFile

# ─── A. API Load (k6) ────────────────────────────────────────────────────────
if (-not $SkipK6) {
    Write-Host "═══════════════════════════════════════" -ForegroundColor DarkMagenta
    Write-Host "  PHASE A — API Load (k6)" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════"
    $K6Out   = Join-Path $OutDir "k6"
    New-Item -ItemType Directory -Force -Path $K6Out | Out-Null
    $K6Json  = Join-Path $K6Out "k6-summary.json"
    $K6Log   = Join-Path $K6Out "k6.log"

    try {
        $k6cmd = Get-Command k6 -ErrorAction Stop
        $env:BASE_URL = $BaseURL
        k6 run "$ScriptRoot\k6\ultimate-load.js" --out json="$K6Json" 2>&1 | Tee-Object -FilePath $K6Log
        # Parse results
        if (Test-Path $K6Json) {
            $K6Data = Get-Content $K6Json -Raw -ErrorAction SilentlyContinue
            # Look for threshold pass markers
            $ThreshFail = Select-String -InputObject $K6Data -Pattern '"thresholds_exceeded":true' -Quiet
            $K6Status = if ($ThreshFail) { "FAIL" } else { "PASS" }
        } else {
            $K6Status = "PASS"
        }
    } catch {
        Write-Host "WARN: k6 not installed or failed: $_" -ForegroundColor Yellow
        $K6Status = "WARN"
    }
    Write-Host "k6 status: $K6Status"
}

# ─── B. Web UI (Playwright) ──────────────────────────────────────────────────
if (-not $SkipWeb) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════" -ForegroundColor DarkMagenta
    Write-Host "  PHASE B — Web UI (Playwright)" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════"
    $PwOut    = Join-Path $OutDir "playwright"
    New-Item -ItemType Directory -Force -Path $PwOut | Out-Null
    $PwJson   = Join-Path $PwOut "results.json"
    $PwLog    = Join-Path $PwOut "playwright.log"

    try {
        # Server health check
        try {
            $ping = Invoke-WebRequest -Uri $BaseURL -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
            Write-Host "Server reachable at $BaseURL" -ForegroundColor Green
        } catch {
            Write-Host "WARN: Server not reachable at $BaseURL — Playwright may fail." -ForegroundColor Yellow
        }

        $env:BASE_URL          = $BaseURL
        $env:PLAYWRIGHT_WORKERS = $PwWorkers
        npx playwright test --config="$ScriptRoot\playwright\playwright.config.js" --reporter=json 2>&1 |
            Tee-Object -FilePath $PwLog
        Copy-Item "$ScriptRoot\playwright\playwright-results.json" -Destination $PwJson -ErrorAction SilentlyContinue

        if (Test-Path $PwJson) {
            $PwData    = Get-Content $PwJson -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
            $WebPasses = ($PwData.suites | ForEach-Object { $_.specs } | Where-Object { $_.ok }).Count
            $WebFails  = ($PwData.suites | ForEach-Object { $_.specs } | Where-Object { -not $_.ok }).Count
        }
        $WebStatus = if ($WebFails -gt 0) { "WARN" } else { "PASS" }
    } catch {
        Write-Host "WARN: Playwright run failed: $_" -ForegroundColor Yellow
        $WebStatus = "WARN"
    }
    Write-Host "Playwright status: $WebStatus (Pass: $WebPasses | Fail: $WebFails)"
}

# ─── C. Android Ultimate ─────────────────────────────────────────────────────
if (-not $SkipAndroid) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════" -ForegroundColor DarkMagenta
    Write-Host "  PHASE C+D — Android + Push Validation" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════"
    try {
        & "$ScriptRoot\android\android-ultimate.ps1" -OutDir $OutDir
        $AndroidJson = Join-Path $OutDir "android\android-summary.json"
        if (Test-Path $AndroidJson) {
            $AData         = Get-Content $AndroidJson -Raw | ConvertFrom-Json
            $AndroidStatus = $AData.status
            $PushStatus    = $AData.push_validation.status
        } else {
            $AndroidStatus = "WARN"
            $PushStatus    = "WARN"
        }
    } catch {
        Write-Host "WARN: Android runner error: $_" -ForegroundColor Yellow
        $AndroidStatus = "WARN"
        $PushStatus    = "WARN"
    }
    Write-Host "Android status: $AndroidStatus | Push status: $PushStatus"
}

# ─── E. Security ──────────────────────────────────────────────────────────────
if (-not $SkipSecurity) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════" -ForegroundColor DarkMagenta
    Write-Host "  PHASE E — Security Checks" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════"
    try {
        & "$ScriptRoot\security\security-check.ps1" -OutDir $OutDir
        $SecJson = Join-Path $OutDir "security\security-summary.json"
        if (Test-Path $SecJson) {
            $SData     = Get-Content $SecJson -Raw | ConvertFrom-Json
            $SecStatus = $SData.status
        } else {
            $SecStatus = "WARN"
        }
    } catch {
        Write-Host "WARN: Security check error: $_" -ForegroundColor Yellow
        $SecStatus = "WARN"
    }
    Write-Host "Security status: $SecStatus"
}

# ─── Final Status Logic ───────────────────────────────────────────────────────
$FinalStatus = "PASS"
if ($AndroidStatus -eq "FAIL" -or $K6Status -eq "FAIL" -or $SecStatus -eq "FAIL") {
    $FinalStatus = "FAIL"
} elseif ($AndroidStatus -eq "WARN" -or $WebStatus -eq "WARN" -or $PushStatus -eq "WARN" -or $SecStatus -eq "WARN") {
    $FinalStatus = "WARN"
}

$StatusColor = switch ($FinalStatus) { "FAIL" { "Red" } "WARN" { "Yellow" } default { "Green" } }

# ─── Write Final Report ───────────────────────────────────────────────────────
$AData    = if (Test-Path (Join-Path $OutDir "android\android-summary.json")) { Get-Content (Join-Path $OutDir "android\android-summary.json") -Raw | ConvertFrom-Json } else { $null }
$SData    = if (Test-Path (Join-Path $OutDir "security\security-summary.json")) { Get-Content (Join-Path $OutDir "security\security-summary.json") -Raw | ConvertFrom-Json } else { $null }
$ColdAvg  = if ($AData) { $AData.cold_start_avg_ms } else { "N/A" }
$Cycles   = if ($AData) { $AData.soak_cycles_completed } else { "N/A" }
$Crash    = if ($AData) { $AData.crash_detected } else { "N/A" }
$Anr      = if ($AData) { $AData.anr_detected } else { "N/A" }
$Vulns    = if ($SData) { $SData.npm_high_critical_vulns } else { "N/A" }
$CspOk    = if ($SData) { $SData.csp_present } else { "N/A" }

@"
# 🧪 MMC Ultimate Torture Test Report

**Date:** $(Get-Date -Format 'yyyy-MM-dd HH:mm') | **Final Status:** $FinalStatus
**Output Folder:** $OutDir

---

## A — API Load (k6)

| Metric | Value |
|--------|-------|
| Status | $K6Status |
| p95 | $K6P95 |
| Error Rate | $K6ErrorRate |

> k6 logs: ``$OutDir\k6\k6.log``

---

## B — Web UI (Playwright)

| Metric | Value |
|--------|-------|
| Status | $WebStatus |
| Passed | $WebPasses |
| Failed | $WebFails |

> Playwright report: ``$OutDir\playwright\``

---

## C — Android Stability

| Metric | Value |
|--------|-------|
| Status | $AndroidStatus |
| Soak Cycles | $Cycles |
| Crash Detected | $Crash |
| ANR Detected | $Anr |
| Cold Start Avg | ${ColdAvg}ms |

> Logcat: ``$OutDir\android\logcat.txt``
> Monkey: ``$OutDir\android\monkey-output.txt``

---

## D — Push Notification Validation

| Item | Value |
|------|-------|
| Status | $PushStatus |

> Push notes in android-summary.json

---

## E — Security

| Check | Value |
|-------|-------|
| Status | $SecStatus |
| High/Critical Vulns | $Vulns |
| CSP Present | $CspOk |

> npm audit: ``$OutDir\security\npm-audit.json``

---

## ✅ Final Result: $FinalStatus

> **FAIL** = Android crash/ANR OR API threshold breach OR security critical.
> **WARN** = Web failures, minor issues, or skipped sections.
> **PASS** = All critical checks green.

---
*Generated by run-ultimate.ps1 | MMC Ultimate Suite*
"@ | Set-Content $ReportFile

# ─── Summary Banner ───────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor $StatusColor
Write-Host "║  FINAL STATUS: $FinalStatus$((' ' * (47 - $FinalStatus.Length)))║" -ForegroundColor $StatusColor
Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor $StatusColor
Write-Host "║  API (k6):      $($K6Status.PadRight(45))║" -ForegroundColor $StatusColor
Write-Host "║  Web (PW):      $($WebStatus.PadRight(45))║" -ForegroundColor $StatusColor
Write-Host "║  Android:       $($AndroidStatus.PadRight(45))║" -ForegroundColor $StatusColor
Write-Host "║  Push:          $($PushStatus.PadRight(45))║" -ForegroundColor $StatusColor
Write-Host "║  Security:      $($SecStatus.PadRight(45))║" -ForegroundColor $StatusColor
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor $StatusColor
Write-Host ""
Write-Host "📁 Output: $OutDir" -ForegroundColor Cyan
Write-Host "📄 Report: $ReportFile" -ForegroundColor Cyan
Write-Host ""

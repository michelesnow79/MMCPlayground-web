
# Stress Test Runner (Windows) - Ultra Resilience v2
# ------------------------------
# 1. Server Management
# 2. Dependency Checks
# 3. K6 API (Thresholds determine overall status)
# 4. Playwright Web (Non-blocking failures)
# 5. Android Logcat (Crashes/ANRs determine overall status)

$ErrorActionPreference = "Continue"

Write-Host "Starting RESILIENT Stress Test Suite..." -ForegroundColor Cyan
$timestamp = Get-Date -Format "yyyy_MM_dd_HHmm"
$outDir = "$PSScriptRoot\out\$timestamp"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$reportFile = "$outDir\REPORT.md"
$logcatFile = "$outDir\logcat_raw.txt"

# Track results for final summary
$results = @{
    API = "SKIPPED"
    Web = "SKIPPED"
    Android = "SKIPPED"
}

# -----------------
# 1. Dependency Check
# -----------------
function Test-Command($name) {
    if (Get-Command $name -ErrorAction SilentlyContinue) { return $true }
    return $false
}

Write-Host "`n[1/5] Checking Environment..." -ForegroundColor Blue
$hasK6 = Test-Command "k6"
$hasNode = Test-Command "node"
$hasADB = Test-Command "adb"
$emulatorActive = $false

if ($hasADB) {
    $devices = adb devices
    if ($devices -match "device`s*$") {
        $emulatorActive = $true
        Write-Host "Android Device Connected."
    }
    else {
        Write-Warning "No Android device found. Monkey tests will be SKIPPED."
    }
}

if (!$hasNode) {
    Write-Error "Node.js is required. Please install it."
    exit 1
}

# -----------------
# 2. K6 API Load (Optional)
# -----------------
Write-Host "`n[2/5] Running K6 API Load Tests..." -ForegroundColor Blue
if ($hasK6) {
    k6 run --out json=$outDir\k6_summary.json $PSScriptRoot\k6\api_load.js
    if ($LASTEXITCODE -ne 0) { 
        Write-Warning "K6 thresholds failed." 
        $results.API = "FAIL"
    } else {
        Write-Host "K6 Thresholds Passed."
        $results.API = "PASS"
    }
} else {
    Write-Warning "K6 not found (skipping API load)."
}

# -----------------
# 3. Web Stress (Playwright)
# -----------------
Write-Host "`n[3/5] Running Playwright Web Stress..." -ForegroundColor Blue
$playwrightPath = Join-Path $PSScriptRoot "playwright"
$baseURL = if ($env:BASE_URL) { $env:BASE_URL } else { "http://localhost:5173" }
Write-Host "Target URL: $baseURL" -ForegroundColor Gray

if (Test-Path "$playwrightPath\package.json") {
    Push-Location $playwrightPath
    
    # Auto-install missing deps
    if (!(Test-Path "node_modules")) {
        Write-Host "Installing Playwright dependencies..."
        npm install
        npx playwright install chromium
    }
    
    # Health check before running
    Write-Host "Checking server health at $baseURL..."
    $serverUp = $false
    try {
        $response = Invoke-WebRequest -Uri $baseURL -Method Head -TimeoutSec 5 -ErrorAction Stop
        if ($response.StatusCode -eq 200) { $serverUp = $true }
    } catch {
        Write-Warning "Server not responding yet. Playwright will attempt auto-start."
    }

    # Run tests (Non-blocking)
    try {
        Write-Host "Executing Playwright tests (Reporter: List, HTML)..."
        npx playwright test --reporter=list,html
        if ($LASTEXITCODE -eq 0) {
            $results.Web = "PASS"
            Write-Host "Web Tests Passed." -ForegroundColor Green
        } else {
            $results.Web = "WARN"
            Write-Warning "Web Tests failed some assertions. Continuing to Android..."
        }
    } catch {
        $results.Web = "FAIL"
        Write-Error "Playwright execution crashed."
    }
    
    # Move report if generated
    if (Test-Path "playwright-report") {
        Copy-Item -Recurse "playwright-report" "$outDir\playwright-report" -ErrorAction SilentlyContinue
    }

    Pop-Location
} else {
    Write-Warning "Playwright config missing."
}

# -----------------
# 4. Android Stress + Log Parsing
# -----------------
Write-Host "`n[4/5] Running Android Stress..." -ForegroundColor Blue
if ($emulatorActive) {
    $results.Android = "RUNNING"
    adb logcat -c
    
    Write-Host "Launching App..."
    $pkg = "com.missmeconnection.app"
    adb shell monkey -p $pkg -c android.intent.category.LAUNCHER 1
    Start-Sleep -Seconds 5

    Write-Host "Running Monkey Chaos Test (5000 events)..."
    $logJob = Start-Job -ScriptBlock { 
        param($file) 
        adb logcat -v time > $file 
    } -ArgumentList $logcatFile

    adb shell monkey -p $pkg --pct-syskeys 0 --throttle 50 -v 5000
    
    Stop-Job $logJob
    Remove-Job $logJob

    Write-Host "Analyzing Logcat for Crashes/ANRs..."
    if (Test-Path $logcatFile) {
        $logs = Get-Content $logcatFile
        $crashes = $logs | Where-Object { $_ -match "FATAL EXCEPTION" }
        $anrs = $logs | Where-Object { $_ -match "ANR in $pkg" }

        if ($crashes -or $anrs) {
            $results.Android = "FAIL"
            if ($crashes) { Write-Error "CRASH DETECTED!" }
            if ($anrs) { Write-Error "ANR DETECTED!" }
        } else {
            $results.Android = "PASS"
            Write-Host "Android Stability: PASS" -ForegroundColor Green
        }
    } else {
        $results.Android = "ERROR"
        Write-Warning "Logcat capture failed."
    }
}

# -----------------
# 5. Final Report
# -----------------
Write-Host "`n[5/5] Finalizing Report..." -ForegroundColor Blue

$overallStatus = "PASS"
if ($results.API -eq "FAIL" -or $results.Android -eq "FAIL") {
    $overallStatus = "FAIL"
} elseif ($results.Web -eq "WARN" -or $results.Web -eq "FAIL") {
    $overallStatus = "WARN"
}

$summary = @"
# Stress Test Summary Report
**Timestamp:** $timestamp
**Overall Status:** $overallStatus

## Results Breakdown
- **API (k6):** $($results.API)
- **Web (Playwright):** $($results.Web)
- **Android (Monkey):** $($results.Android)

## Artifacts
- **Output Directory:** $outDir
- **Full Report:** See $outDir\playwright-report\index.html (Web)
- **Android Logs:** $logcatFile
"@

$summary | Out-File $reportFile -Encoding utf8
Write-Host "`n$($summary)" -ForegroundColor $(if($overallStatus -eq "PASS"){"Green"}elseif($overallStatus -eq "WARN"){"Yellow"}else{"Red"})

if ($overallStatus -eq "PASS") {
    Write-Host "`nALL SYSTEMS STABLE." -ForegroundColor Green
}

Invoke-Item $outDir

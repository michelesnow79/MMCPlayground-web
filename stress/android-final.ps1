
# Android Final Hardening Suite (Ultra-Robust Watchdog v4)
# ------------------------------
# 1. Connection Guard (Waits for ADB)
# 2. Process Watchdog (Restarts app if died)
# 3. Transparent Logging & Fail-Safe Reporting

$pkg = "com.missmeconnection.app"
$mainActivity = "$pkg/.MainActivity"
$timestamp = Get-Date -Format "yyyy_MM_dd_HHmm"
$outDir = "$PSScriptRoot\..\out\$timestamp-final-android-v4"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$reportFile = "$outDir\android-final-report.md"
$logcatFile = "$outDir\logcat_soak.txt"

# --- 1. Initialize Report Early (Fail-Safe) ---
$initReport = @"
# Android Final Hardening Report (IN PROGRESS)
**Started:** $(Get-Date)
**Output Directory:** $outDir

> This report is currently being generated. If you see this content, the run may have been interrupted.
"@
$initReport | Out-File $reportFile -Encoding utf8

Write-Host "--- Android Hardening Watchdog v4 ---" -ForegroundColor Cyan
Write-Host "Target Report: $reportFile" -ForegroundColor Gray

# Function to safely run ADB and return output
function Run-ADB($cmd) {
    try {
        $result = adb shell $cmd 2>$null
        return $result
    } catch {
        return $null
    }
}

try {
    # --- 2. Wait for Device ---
    Write-Host "Checking for device..."
    while ($true) {
        $devs = adb devices
        if ($devs -match "emulator-5554\s+device") {
            Write-Host "Device Online!" -ForegroundColor Green
            break
        }
        Write-Host "Waiting for device (currently offline/missing)..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
    }

    # --- 3. Start Logcat Capture ---
    Write-Host "Starting Logcat capture..."
    adb logcat -c
    $logProc = Start-Process adb -ArgumentList "logcat -v time" -RedirectStandardOutput $logcatFile -PassThru -WindowStyle Hidden

    # --- 4. Main Loop (30 Minutes) ---
    $durationMins = 30
    $endTime = (Get-Date).AddMinutes($durationMins)
    Write-Host "Soak started. Ending at $endTime." -ForegroundColor Green
    
    $memUsage = @()
    $pss = 0

    while ((Get-Date) -lt $endTime) {
        # Check Connection
        $devs = adb devices
        if (!($devs -match "emulator-5554\s+device")) {
            Write-Host "!!! CONNECTION LOST. Waiting..." -ForegroundColor Red
            Start-Sleep -Seconds 10
            continue
        }

        # Check Process (Watchdog)
        $appPid = Run-ADB "pidof $pkg"
        if (!$appPid) {
            Write-Host "App not running. Restarting..." -ForegroundColor Yellow
            adb shell am start -n $mainActivity
            Start-Sleep -Seconds 5
            continue
        }

        # Memory Check
        $mem = Run-ADB "dumpsys meminfo $pkg" | Out-String
        if ($mem -match "TOTAL\s+(\d+)") {
            $currentPss = [int]$matches[1]
            $pss = [math]::Round($currentPss / 1024, 1)
            $memUsage += $currentPss
        }

        # Interaction (Aggressive Ghost Taps)
        # 1. Rapid Fire Taps
        adb shell input tap 540 800
        adb shell input tap 540 1200
        adb shell input tap 540 1600
        adb shell input tap 540 2000
        
        # 2. Occasional Visual Swipe (Every ~10 seconds)
        if ($rem.TotalSeconds % 10 -lt 3) {
            adb shell input swipe 540 1500 540 1000 200 # Swipe up
        }

        # Status Update
        $rem = $endTime - (Get-Date)
        Write-Host -NoNewline "`r[ $(Get-Date -F 'HH:mm:ss') ] Rem: $($rem.ToString('mm\:ss')) | Mem: $pss MB   "
        
        Start-Sleep -Seconds 2
    }

    Write-Host "`nSoak Complete!" -ForegroundColor Green
    if ($logProc) { Stop-Process -Id $logProc.Id -ErrorAction SilentlyContinue }

    # --- 5. Generate Final Success Report ---
    $logs = if (Test-Path $logcatFile) { Get-Content $logcatFile } else { @() }
    $crashes = ($logs | Select-String "FATAL EXCEPTION").Count
    $anrs = ($logs | Select-String "ANR in $pkg").Count
    
    $status = if ($crashes -eq 0 -and $anrs -eq 0) { "PASS" } else { "FAIL" }
    
    $finalReport = @"
# Android Final Hardening Report
**Date:** $(Get-Date)
**Status:** $status

## Stability Metrics
- **Crashes:** $crashes
- **ANRs:** $anrCount
- **Duration:** $durationMins minutes

## Memory Metrics
- **Start PSS:** $([math]::Round($memUsage[0] / 1024, 1)) MB
- **End PSS:** $([math]::Round($memUsage[-1] / 1024, 1)) MB
- **Growth:** $(if($memUsage[0] -gt 0){ [math]::Round((($memUsage[-1] - $memUsage[0]) / $memUsage[0]) * 100, 2) } else { 0 })%

## Final Verdict
$(if($status -eq "PASS") { "✅ **ANDROID BUILD IS STABLE FOR IOS TRANSITION.**" } else { "❌ **STABILITY ISSUES DETECTED.**" })
"@
    $finalReport | Out-File $reportFile -Encoding utf8

} catch {
    Write-Host "`n!!! FATAL ERROR ENCOUNTERED !!!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red

    # --- 6. Handle Error in Report ---
    $logSnippet = if (Test-Path $logcatFile) { Get-Content $logcatFile | Select-Object -Last 200 } else { "No logcat available" }
    
    $errorReport = @"
# Android Final Hardening Report (CRASHED)
**Date:** $(Get-Date)
**Status:** CRASHED (Script Error)

## Error Details
- **Message:** $($_.Exception.Message)
- **Script Location:** $($_.InvocationInfo.ScriptName) : Line $($_.InvocationInfo.ScriptLineNumber)

## Logcat Snippet (Last 200 Lines)
```text
$($logSnippet -join "`n")
```
"@
    $errorReport | Out-File $reportFile -Encoding utf8
}

# --- 7. Final Cleanup & Opening ---
Write-Host "`nReport generated at: $reportFile" -ForegroundColor Cyan

if (Test-Path $reportFile) {
    # Opening the directory is safer than the file if the association is weird
    Invoke-Item $outDir
    Invoke-Item $reportFile
} else {
    Write-Warning "Report file not found. Check $outDir"
}

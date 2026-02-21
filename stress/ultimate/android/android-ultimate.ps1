# ============================================================
# Android Ultimate - Windows PowerShell
# Run: .\stress\ultimate\android\android-ultimate.ps1 -OutDir <path>
# ============================================================
param(
    [string]$OutDir = "stress\out\$(Get-Date -Format 'yyyyMMdd_HHmmss')\ultimate"
)

$AndroidOut = Join-Path $OutDir "android"
New-Item -ItemType Directory -Force -Path $AndroidOut | Out-Null

$Package     = "com.missmeconnection.app"
$Activity    = "$Package/.MainActivity"
$SoakMinutes = 60
$SoakCycles  = 200
$LogcatFile  = Join-Path $AndroidOut "logcat.txt"
$MonkeyOut   = Join-Path $AndroidOut "monkey-output.txt"
$MemFile     = Join-Path $AndroidOut "meminfo.csv"
$StartupFile = Join-Path $AndroidOut "cold-starts.txt"
$ReportFile  = Join-Path $AndroidOut "android-summary.json"

$CrashDetected = $false
$AnrDetected   = $false

Write-Host "`n=== Android Ultimate Runner ===" -ForegroundColor Cyan
Write-Host "Output: $AndroidOut"

# ─── Preflight ───────────────────────────────────────────────────────────────
Write-Host "`n--- [1/6] Preflight ---" -ForegroundColor Yellow
$DevicesRaw = adb devices 2>&1
$DeviceLines = (($DevicesRaw -split "`n") | Where-Object { $_ -match "device$" })
if ($DeviceLines.Count -eq 0) {
    Write-Host "WARN: No ADB device found. Skipping Android tests." -ForegroundColor Red
    '{"status":"SKIP","reason":"no_device"}' | Set-Content $ReportFile
    exit 0
}
Write-Host "Device(s) found: $($DeviceLines.Count)"

# Launch app
adb shell am start -n $Activity 2>$null | Out-Null
Start-Sleep -Seconds 3

# ─── Start Logcat ────────────────────────────────────────────────────────────
Write-Host "`n--- [2/6] Starting Logcat ---" -ForegroundColor Yellow
adb logcat -c 2>$null
$LogcatJob = Start-Job -ScriptBlock {
    param($lf)
    adb logcat -v time > $lf
} -ArgumentList $LogcatFile

"timestamp,total_pss_kb" | Set-Content $MemFile

# ─── Monkey Chaos ────────────────────────────────────────────────────────────
Write-Host "`n--- [3/6] Monkey Phase 1 (20k events) ---" -ForegroundColor Yellow
adb shell monkey -p $Package --throttle 50 --pct-syskeys 0 --pct-touch 40 --pct-motion 30 --pct-nav 10 --ignore-crashes --ignore-timeouts 20000 2>&1 | Set-Content $MonkeyOut
Write-Host "Phase 1 done."

Write-Host "--- [3/6] Monkey Phase 2 (50k events) ---" -ForegroundColor Yellow
adb shell monkey -p $Package --throttle 100 --pct-syskeys 0 --pct-touch 35 --pct-motion 25 --pct-nav 10 --ignore-crashes --ignore-timeouts 50000 2>&1 | Add-Content $MonkeyOut
Write-Host "Phase 2 done."

$MonkeyContent = Get-Content $MonkeyOut -Raw -ErrorAction SilentlyContinue
if ($MonkeyContent) {
    # Only flag real crash events — not the "--ignore-crashes" argument echo
    $realCrashes = ($MonkeyContent -split "`n") | Where-Object {
        ($_ -match "CRASH|ANR|FATAL EXCEPTION") -and
        ($_ -notmatch "\-\-ignore-crashes|\-\-ignore-timeouts|bash arg|mCurArgData")
    }
    if ($realCrashes.Count -gt 0) {
        Write-Host "WARN: Real Crash/ANR detected in Monkey output." -ForegroundColor Red
        $CrashDetected = $true
    } else {
        Write-Host "Monkey completed. No real crashes detected." -ForegroundColor Green
    }
}

# ─── Soak Test ───────────────────────────────────────────────────────────────
Write-Host "`n--- [4/6] Soak ($SoakMinutes min / $SoakCycles cycles) ---" -ForegroundColor Yellow
$SoakStart    = Get-Date
$SoakEnd      = $SoakStart.AddMinutes($SoakMinutes)
$Cycle        = 0
$SkippedTotal = 0
$LastMemCheck = $SoakStart

while ((Get-Date) -lt $SoakEnd -and $Cycle -lt $SoakCycles) {
    $Cycle++

    adb shell am start -n $Activity 2>$null | Out-Null
    Start-Sleep -Milliseconds 800

    # Tap center
    adb shell input tap 540 960 2>$null | Out-Null
    Start-Sleep -Milliseconds 400

    # Swipe down
    adb shell input swipe 540 1160 540 760 300 2>$null | Out-Null
    Start-Sleep -Milliseconds 400

    # Swipe up
    adb shell input swipe 540 760 540 1160 300 2>$null | Out-Null
    Start-Sleep -Milliseconds 400

    # Background + Foreground
    adb shell input keyevent KEYCODE_HOME 2>$null | Out-Null
    Start-Sleep -Milliseconds 800
    adb shell am start -n $Activity 2>$null | Out-Null
    Start-Sleep -Milliseconds 500

    # Memory snapshot every 60s
    if (((Get-Date) - $LastMemCheck).TotalSeconds -ge 60) {
        $MemRaw = adb shell dumpsys meminfo $Package 2>$null
        $PssMatch = [regex]::Match(($MemRaw -join ''), 'TOTAL PSS:\s+(\d+)')
        $Pss = if ($PssMatch.Success) { $PssMatch.Groups[1].Value } else { "0" }
        "$(Get-Date -Format HH:mm:ss),$Pss" | Add-Content $MemFile
        Write-Host "[Cycle $Cycle] Mem PSS: ${Pss}kb"
        $LastMemCheck = Get-Date
    }

    # Crash check every 10 cycles
    if ($Cycle % 10 -eq 0) {
        $LogContent = Get-Content $LogcatFile -Tail 100 -ErrorAction SilentlyContinue
        if ($LogContent -match "FATAL EXCEPTION|ANR in $Package") {
            Write-Host "ERROR: Crash/ANR at cycle $Cycle" -ForegroundColor Red
            $CrashDetected = $true
            $AnrDetected   = $true
        }
    }
}

Write-Host "Soak complete. Cycles: $Cycle"

# ─── Cold Starts ─────────────────────────────────────────────────────────────
Write-Host "`n--- [5/6] Cold Starts (30x) ---" -ForegroundColor Yellow
"# Cold start times (ms)" | Set-Content $StartupFile
$StartupTotal = 0
for ($i = 1; $i -le 30; $i++) {
    adb shell am force-stop $Package 2>$null | Out-Null
    Start-Sleep -Milliseconds 500
    $StartResult = adb shell am start -W -n $Activity 2>$null
    $TotalTime   = if ($StartResult -match "TotalTime:\s+(\d+)") { $Matches[1] } else { "0" }
    "Run ${i}: ${TotalTime}ms" | Add-Content $StartupFile
    $StartupTotal += [int]$TotalTime
    Start-Sleep -Milliseconds 500
}
$StartupAvg = if ($StartupTotal -gt 0) { [int]($StartupTotal / 30) } else { 0 }
"Cold start avg: ${StartupAvg}ms" | Add-Content $StartupFile
Write-Host "Cold start avg: ${StartupAvg}ms"

# ─── Push Notification Validation ────────────────────────────────────────────
Write-Host "`n--- [6/6] Push Notification Validation ---" -ForegroundColor Yellow
$PushStatus = "WARN"
$PushNotes  = ""

$Channels = adb shell dumpsys notification --noredact 2>$null | Select-String "missme|channel" | Select-Object -First 5
if ($Channels) {
    $PushNotes  = "Notification channels present."
    $PushStatus = "PASS"
} else {
    $PushNotes = "No notification channels detected (normal for first run or before login)."
}

$LogContent = Get-Content $LogcatFile -ErrorAction SilentlyContinue
$FcmLog = $LogContent | Select-String "FCM Token|Token saved" | Select-Object -First 3
if ($FcmLog) {
    $PushNotes  += " FCM token registered."
    $PushStatus  = "PASS"
} else {
    $PushNotes += " FCM token not seen in logcat."
}

$TokenLeak = $LogContent | Select-String "fcmToken.*Bearer|Authorization.*token" | Select-Object -First 1
if ($TokenLeak) {
    $PushNotes += " WARNING: Possible token leak in log."
    $PushStatus = "WARN"
}

Write-Host "Push status: $PushStatus | $PushNotes"

# ─── Stop logcat ──────────────────────────────────────────────────────────────
Stop-Job $LogcatJob -ErrorAction SilentlyContinue
Remove-Job $LogcatJob -ErrorAction SilentlyContinue

# ─── Final Status ─────────────────────────────────────────────────────────────
$AndroidStatus = "PASS"
if ($CrashDetected -or $AnrDetected) { $AndroidStatus = "FAIL" }

# ─── Write JSON ───────────────────────────────────────────────────────────────
$Report = [ordered]@{
    status                = $AndroidStatus
    crash_detected        = $CrashDetected
    anr_detected          = $AnrDetected
    soak_cycles_completed = $Cycle
    skipped_frames        = $SkippedTotal
    cold_start_avg_ms     = $StartupAvg
    push_validation       = @{
        status = $PushStatus
        notes  = $PushNotes
    }
}
$Report | ConvertTo-Json -Depth 5 | Set-Content $ReportFile
Write-Host "`n=== Android Done: $AndroidStatus ===" -ForegroundColor $(if ($AndroidStatus -eq "FAIL") { "Red" } else { "Green" })
Write-Host "Report: $ReportFile"

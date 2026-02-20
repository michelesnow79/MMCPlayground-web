
# Android Monkey Stress Test Script
$ErrorActionPreference = "Stop"

$PACKAGE_NAME = "com.missmeconnection.app"
$LOG_FILE = "../out/monkey_log.txt"

# Check ADB
if (!(Get-Command adb -ErrorAction SilentlyContinue)) {
    Write-Error "ADB not found. Please install Android SDK Platform Tools."
    exit 1
}

# Ensure output directory exists (../out relative to script location)
if (!(Test-Path "../out")) {
    New-Item -ItemType Directory -Force -Path "../out"
}

Write-Host "Starting Monkey Test on $PACKAGE_NAME..."
Start-Process adb -ArgumentList "logcat -c" -NoNewWindow -Wait

# Run Monkey: 500 events, ignore crashes so we capture them later, verbose level 2
# --pct-syskeys 0: Avoid system keys like Back/Home too much (focus on app)
# --throttle 100: 100ms delay between events
Start-Process adb -ArgumentList "shell monkey -p $PACKAGE_NAME --pct-syskeys 0 --throttle 100 -v -v 20000 > $LOG_FILE 2>&1" -NoNewWindow -Wait

Write-Host "Monkey Test Completed. Log saved to $LOG_FILE"

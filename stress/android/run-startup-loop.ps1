
# startup loop test
$ErrorActionPreference = "Stop"

$PACKAGE_NAME = "com.missmeconnection.app"
$MAIN_ACTIVITY = ".MainActivity"

# Check ADB
if (!(Get-Command adb -ErrorAction SilentlyContinue)) {
    Write-Error "ADB not found."
    exit 1
}

Write-Host "Starting Startup Loop Test (50 iterations)..."
$startTime = Get-Date

for ($i=1; $i -le 50; $i++) {
    Write-Host "Iteration $i/50: Launching App..."
    
    # Launch
    adb shell am start -n "$PACKAGE_NAME/$MAIN_ACTIVITY"
    Start-Sleep -Seconds 5
    
    # Kill
    adb shell am force-stop "$PACKAGE_NAME"
    Start-Sleep -Seconds 1
}

$duration = (Get-Date) - $startTime
Write-Host "Completed Startup Loop in $($duration.TotalSeconds) seconds."

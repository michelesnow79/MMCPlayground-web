
#!/bin/bash
PACKAGE_NAME="com.missmeconnection.app"
LOG_FILE="../out/monkey_log.txt"

if ! command -v adb &> /dev/null; then
    echo "ADB not found."
    exit 1
fi

echo "Starting Monkey Test on $PACKAGE_NAME..."
adb logcat -c
adb shell monkey -p "$PACKAGE_NAME" --pct-syskeys 0 --throttle 100 -v -v 20000 > "$LOG_FILE" 2>&1
echo "Monkey Test Completed. Log saved to $LOG_FILE"

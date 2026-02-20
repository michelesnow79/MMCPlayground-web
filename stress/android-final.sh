
#!/bin/bash
PACKAGE_NAME="com.missmeconnection.app"
MAIN_ACTIVITY="$PACKAGE_NAME/.MainActivity"
TIMESTAMP=$(date +"%Y_%m_%d_%H%M")
OUT_DIR="out/$TIMESTAMP-final-android"
mkdir -p "$OUT_DIR"
REPORT_FILE="$OUT_DIR/android-final-report.md"
LOGCAT_FILE="$OUT_DIR/logcat_soak.txt"
MEM_FILE="$OUT_DIR/memory_trend.csv"

echo "🔥 Starting ANDROID HARDENING SUITE..."
echo "📂 Logs: $OUT_DIR"

if ! command -v adb &> /dev/null; then
    echo "ADB not found."
    exit 1
fi

DEVICES=$(adb devices | grep -E "device$")
if [ -z "$DEVICES" ]; then
    echo "❌ No Android device detected."
    exit 1
fi

# 1. Startup Performance
echo "🚀 Measuring 20x Cold Starts..."
TOTAL_START_TIME=0
P95_START=0
START_TIMES=()

for i in {1..20}; do
    echo -n "."
    adb shell am force-stop "$PACKAGE_NAME"
    sleep 1
    # Capture TotalTime
    OUT=$(adb shell am start -W -n "$MAIN_ACTIVITY")
    MS=$(echo "$OUT" | grep "TotalTime" | cut -d ' ' -f 2)
    if [ -n "$MS" ]; then
        START_TIMES+=($MS)
        TOTAL_START_TIME=$((TOTAL_START_TIME + MS))
    fi
done

# Calculate Avg
AVG_START=$((TOTAL_START_TIME / 20))
echo "📊 Avg: ${AVG_START}ms"

# 2. Soak Test (30 mins)
echo ""
echo "🧹 Prepping for 30m Soak..."
adb logcat -c
adb shell am force-stop "$PACKAGE_NAME"
adb shell am start -n "$MAIN_ACTIVITY"
sleep 5

# Start Logcat Background
adb logcat -v time > "$LOGCAT_FILE" &
LOG_PID=$!

START_SOAK=$(date +%s)
DURATION=$((30 * 60))
echo "Time,PSS_KB" > "$MEM_FILE"

while [ $(($(date +%s) - START_SOAK)) -lt $DURATION ]; do
    ELAPSED=$(($(date +%s) - START_SOAK))
    if (( ELAPSED % 60 == 0 )); then
        echo "⏳ Soak: $(($ELAPSED / 60))m / 30m"
        # Background/Foreground
        adb shell input keyevent 3
        sleep 2
        adb shell am start -n "$MAIN_ACTIVITY"
        sleep 2
        
        # Memory Check
        PSS=$(adb shell dumpsys meminfo "$PACKAGE_NAME" | grep "TOTAL" | awk '{print $2}' | head -n 1)
        if [ -n "$PSS" ]; then
            echo "$(date +%H:%M:%S),$PSS" >> "$MEM_FILE"
        fi
    fi
    # Random Taps
    adb shell input tap 540 1000
    adb shell input tap 540 1600
    sleep 5
done

# Stop Logs
kill $LOG_PID

# 3. Analyze
echo "🔍 Analyzing..."
CRASHES=$(grep -c "FATAL EXCEPTION" "$LOGCAT_FILE")
ANRS=$(grep -c "ANR in $PACKAGE_NAME" "$LOGCAT_FILE")

STATUS="PASS"
if [ "$CRASHES" -gt 0 ] || [ "$ANRS" -gt 0 ]; then
    STATUS="FAIL"
    echo "❌ ISSUES DETECTED. CHECK REPORT."
else
    echo "🎉 ANDROID BUILD IS STABLE FOR IOS TRANSITION."
fi

# Generate Report
echo "# Android Final Report" > "$REPORT_FILE"
echo "**Status:** $STATUS" >> "$REPORT_FILE"
echo "## Startup" >> "$REPORT_FILE"
echo "- Avg: ${AVG_START}ms" >> "$REPORT_FILE"
echo "## Stability" >> "$REPORT_FILE"
echo "- Crashes: $CRASHES" >> "$REPORT_FILE"
echo "- ANRs: $ANRS" >> "$REPORT_FILE"

open "$REPORT_FILE"
exit 0

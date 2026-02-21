#!/usr/bin/env bash
# ============================================================
# Android Ultimate Chaos + Soak + Push Validation
# Run: ./stress/ultimate/android/android-ultimate.sh <OUT_DIR>
# ============================================================
set -euo pipefail

OUT_DIR="${1:-stress/out/$(date +%Y%m%d_%H%M%S)/ultimate}"
ANDROID_OUT="$OUT_DIR/android"
mkdir -p "$ANDROID_OUT"

PACKAGE="com.missmeconnection.app"
ACTIVITY="$PACKAGE/.MainActivity"
SOAK_MINUTES=60
SOAK_CYCLES=200
LOGCAT_FILE="$ANDROID_OUT/logcat.txt"
MONKEY_OUT="$ANDROID_OUT/monkey-output.txt"
MEM_FILE="$ANDROID_OUT/meminfo.csv"
STARTUP_FILE="$ANDROID_OUT/cold-starts.txt"
REPORT_FILE="$ANDROID_OUT/android-summary.json"

CRASH_DETECTED=false
ANR_DETECTED=false

echo "=== Android Ultimate Runner ===" | tee "$ANDROID_OUT/run.log"
echo "Output: $ANDROID_OUT" | tee -a "$ANDROID_OUT/run.log"

# ─── Preflight ────────────────────────────────────────────────────────────────
echo ""
echo "--- [1/6] Preflight ---"
DEVICES=$(adb devices | grep -v "List of devices" | grep "device" | wc -l | tr -d ' ')
if [ "$DEVICES" -eq 0 ]; then
    echo "WARN: No ADB device found. Skipping Android tests."
    echo '{"status":"SKIP","reason":"no_device"}' > "$REPORT_FILE"
    exit 0
fi
echo "Device found: $DEVICES device(s)"

# Install app if APK exists
APK_PATH=$(find . -name "*.apk" -path "*/release/*" | head -1 || true)
if [ -n "$APK_PATH" ]; then
    echo "Installing APK: $APK_PATH"
    adb install -r "$APK_PATH" || echo "WARN: Install failed (may already be installed)"
fi

# ─── Start Logcat ─────────────────────────────────────────────────────────────
echo ""
echo "--- [2/6] Starting Logcat Capture ---"
adb logcat -c
adb logcat -v time > "$LOGCAT_FILE" &
LOGCAT_PID=$!
echo "Logcat PID: $LOGCAT_PID"

# Launch app
adb shell am start -n "$ACTIVITY" > /dev/null 2>&1 || true
sleep 3

echo "Date: $(date)" > "$MEM_FILE"
echo "timestamp,total_pss_kb" >> "$MEM_FILE"

# ─── Monkey Chaos ─────────────────────────────────────────────────────────────
echo ""
echo "--- [3/6] Monkey Chaos (Phase 1: 20k) ---"
adb shell monkey \
    -p "$PACKAGE" \
    --throttle 50 \
    --pct-syskeys 0 \
    --pct-touch 40 \
    --pct-motion 30 \
    --pct-nav 10 \
    --ignore-crashes \
    --ignore-timeouts \
    20000 > "$MONKEY_OUT" 2>&1 || true
echo "Phase 1 done."

echo "--- [3/6] Monkey Chaos (Phase 2: 50k) ---"
adb shell monkey \
    -p "$PACKAGE" \
    --throttle 100 \
    --pct-syskeys 0 \
    --pct-touch 35 \
    --pct-motion 25 \
    --pct-nav 10 \
    --ignore-crashes \
    --ignore-timeouts \
    50000 >> "$MONKEY_OUT" 2>&1 || true
echo "Phase 2 done."

# Crash detection after monkey
if grep -q "CRASH\|ANR\|FATAL EXCEPTION" "$MONKEY_OUT" 2>/dev/null; then
    echo "WARN: Crash or ANR detected during Monkey phase"
    CRASH_DETECTED=true
fi

# ─── Deterministic Soak (60 min) ──────────────────────────────────────────────
echo ""
echo "--- [4/6] Soak Test (${SOAK_MINUTES}m / ${SOAK_CYCLES} cycles) ---"
SOAK_START=$(date +%s)
SOAK_END=$((SOAK_START + SOAK_MINUTES * 60))
CYCLE=0
SKIPPED_FRAMES=0
LAST_MEM_CHECK=$SOAK_START

while [ $(date +%s) -lt $SOAK_END ] && [ $CYCLE -lt $SOAK_CYCLES ]; do
    CYCLE=$((CYCLE + 1))

    # Open app
    adb shell am start -n "$ACTIVITY" > /dev/null 2>&1 || true
    sleep 1

    # Browse tap
    WIDTH=$(adb shell wm size | grep -oP '\d+x\d+' | cut -d'x' -f1 || echo "1080")
    HEIGHT=$(adb shell wm size | grep -oP '\d+x\d+' | cut -d'x' -f2 || echo "1920")
    CX=$((WIDTH / 2))
    CY=$((HEIGHT / 2))

    adb shell input tap $CX $CY && sleep 0.5 || true
    adb shell input swipe $CX $((CY + 200)) $CX $((CY - 200)) 300 && sleep 0.5 || true
    adb shell input swipe $CX $((CY - 200)) $CX $((CY + 200)) 300 && sleep 0.5 || true

    # Background / foreground
    adb shell input keyevent KEYCODE_HOME && sleep 1 || true
    adb shell am start -n "$ACTIVITY" > /dev/null 2>&1 || true
    sleep 0.5

    # Memory every 60s
    NOW=$(date +%s)
    if [ $((NOW - LAST_MEM_CHECK)) -ge 60 ]; then
        PSS=$(adb shell dumpsys meminfo "$PACKAGE" 2>/dev/null | grep "TOTAL PSS" | grep -oP '\d+' | head -1 || echo "0")
        echo "$(date +%H:%M:%S),$PSS" >> "$MEM_FILE"
        echo "[Cycle $CYCLE] Mem PSS: ${PSS}kb"
        LAST_MEM_CHECK=$NOW
    fi

    # Check logcat for crashes/ANRs
    if grep -q "FATAL EXCEPTION\|ANR in $PACKAGE" "$LOGCAT_FILE" 2>/dev/null; then
        echo "ERROR: FATAL EXCEPTION or ANR detected after cycle $CYCLE"
        CRASH_DETECTED=true
        ANR_DETECTED=true
    fi

    # Skipped frames
    FRAMES=$(adb logcat -d 2>/dev/null | grep -c "Skipped.*frames" || echo "0")
    SKIPPED_FRAMES=$((SKIPPED_FRAMES + FRAMES))

done

echo "Soak complete. Cycles: $CYCLE | Skipped Frames Total: $SKIPPED_FRAMES"

# ─── Cold Start Measurement (30 cycles) ──────────────────────────────────────
echo ""
echo "--- [5/6] Cold Start (30x) ---"
echo "# Cold start times (ms)" > "$STARTUP_FILE"
STARTUP_TOTAL=0
for i in $(seq 1 30); do
    adb shell am force-stop "$PACKAGE" > /dev/null 2>&1 || true
    sleep 0.5
    RESULT=$(adb shell am start -W -n "$ACTIVITY" 2>/dev/null | grep "TotalTime" | grep -oP '\d+' || echo "0")
    echo "Run $i: ${RESULT}ms" >> "$STARTUP_FILE"
    STARTUP_TOTAL=$((STARTUP_TOTAL + RESULT))
    sleep 0.5
done
STARTUP_AVG=$((STARTUP_TOTAL / 30))
echo "Cold start avg: ${STARTUP_AVG}ms" | tee -a "$STARTUP_FILE"

# ─── Push Notification Validation ────────────────────────────────────────────
echo ""
echo "--- [6/6] Push Notification Validation ---"
PUSH_STATUS="WARN"
PUSH_NOTES=""

# Check if FCM channel exists
CHANNELS=$(adb shell dumpsys notification --noredact 2>/dev/null | grep -i "missme\|channel" | head -5 || true)
if [ -n "$CHANNELS" ]; then
    echo "Notification channels found."
    PUSH_NOTES="Channels present."
    PUSH_STATUS="PASS"
else
    PUSH_NOTES="No notification channels detected (normal for first run)."
fi

# Logcat: check for FCM token registration
FCM_TOKEN_LOG=$(grep -i "FCM Token\|Token saved" "$LOGCAT_FILE" 2>/dev/null | head -3 || true)
if [ -n "$FCM_TOKEN_LOG" ]; then
    echo "FCM token registration found in logcat."
    PUSH_NOTES="$PUSH_NOTES FCM token registered."
    PUSH_STATUS="PASS"
else
    PUSH_NOTES="$PUSH_NOTES FCM token not seen in logcat (may require real device or login)."
fi

# Check token NOT logged in release build
TOKEN_LEAK=$(grep -i "fcmToken.*Bearer\|Authorization.*token" "$LOGCAT_FILE" 2>/dev/null | head -3 || true)
if [ -n "$TOKEN_LEAK" ]; then
    PUSH_NOTES="$PUSH_NOTES WARNING: Possible token in log."
    PUSH_STATUS="WARN"
fi

echo "Push status: $PUSH_STATUS | $PUSH_NOTES"

# ─── Stop logcat ─────────────────────────────────────────────────────────────
kill $LOGCAT_PID 2>/dev/null || true

# ─── Determine final status ──────────────────────────────────────────────────
ANDROID_STATUS="PASS"
if $CRASH_DETECTED || $ANR_DETECTED; then
    ANDROID_STATUS="FAIL"
fi

# ─── Write JSON summary ───────────────────────────────────────────────────────
cat > "$REPORT_FILE" << JSONEOF
{
  "status": "$ANDROID_STATUS",
  "crash_detected": $CRASH_DETECTED,
  "anr_detected": $ANR_DETECTED,
  "soak_cycles_completed": $CYCLE,
  "skipped_frames": $SKIPPED_FRAMES,
  "cold_start_avg_ms": $STARTUP_AVG,
  "push_validation": {
    "status": "$PUSH_STATUS",
    "notes": "$PUSH_NOTES"
  }
}
JSONEOF

echo ""
echo "=== Android Done: $ANDROID_STATUS ==="
echo "Report: $REPORT_FILE"

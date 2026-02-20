
#!/bin/bash
set -e

echo "🔥 Starting RESILIENT Stress Test Suite..."
TIMESTAMP=$(date +"%Y_%m_%d_%H%M")
OUT_DIR="out/$TIMESTAMP"
mkdir -p "$OUT_DIR"
LOGCAT_FILE="$OUT_DIR/android_logcat.txt"

# 1. Server Management (Playwright handles this)
# 2. Dependency Checks (Assume web tests installed or fail gracefully)
# 3. K6 API
# 4. Playwright Web
# 5. Android Logcat Parsers

# -----------------
# 1. API Load (k6)
# -----------------
echo "📊 Running K6 API Load Tests..."
if command -v k6 &> /dev/null; then
    k6 run --out json="$OUT_DIR/k6_summary.json" stress/k6/api_load.js || echo "K6 finished with some errors (check summary)."
else
    echo "⚠️ K6 not found (skipping API load)."
fi

# -----------------
# 2. Web Stress (Playwright)
# -----------------
echo "🕸 Running Playwright Web Stress..."
if [ -f "stress/playwright/package.json" ]; then
    cd stress/playwright
    npm install
    # Ensure browsers
    npx playwright install
    npx playwright test --reporter=list,html
    
    # Copy report out
    if [ -d "playwright-report" ]; then
        cp -r playwright-report ../out/"$TIMESTAMP"/
    fi
    cd ../..
else
    echo "⚠️ Playwright tests skipped (missing)."
fi

# -----------------
# 3. Android Stress + Log Parsing
# -----------------
echo "📱 Checking for Android devices..."
if command -v adb &> /dev/null; then
    DEVICES=$(adb devices | grep -E "device$")
    if [ -n "$DEVICES" ]; then
        echo "✅ Android Device Connected."
        
        # Clear logs
        adb logcat -c
        
        # Launch App
        echo "Launching com.missmeconnection.app..."
        adb shell monkey -p com.missmeconnection.app -c android.intent.category.LAUNCHER 1
        sleep 5
        
        # Start Logcat Capture (background)
        adb logcat -v time > "$LOGCAT_FILE" &
        LOG_PID=$!
        
        # Run Monkey (Chaos)
        echo "🐒 Unleashing Monkey..."
        adb shell monkey -p com.missmeconnection.app --pct-syskeys 0 --throttle 50 -v 5000
        
        # Stop Logcat
        kill $LOG_PID || true
        
        # Check for Crashes
        echo "🔍 Analyzing Logcat for FATAL EXCEPTION / ANR..."
        if grep -q "FATAL EXCEPTION" "$LOGCAT_FILE"; then
            echo "❌ CRASH DETECTED!"
            grep "FATAL EXCEPTION" "$LOGCAT_FILE" | head -n 5
        elif grep -q "ANR in com.missmeconnection.app" "$LOGCAT_FILE"; then
            echo "❌ ANR DETECTED!"
            grep "ANR in" "$LOGCAT_FILE" | head -n 5
        else
            echo "✅ Android Stability: PASS (No crashes found)."
        fi
        
    else
        echo "⚠️ No Android device found. Skipping Monkey tests."
    fi
else
    echo "This machine does not have adb."
fi

echo "✨ Stress Suite Complete! Results in: $OUT_DIR"


#!/bin/bash
PACKAGE_NAME="com.missmeconnection.app"
MAIN_ACTIVITY=".MainActivity"

echo "Starting Startup Loop Test (50 iterations)..."
START_TIME=$(date +%s)

for i in {1..50}; do
    echo "Iteration $i/50: Launching App..."
    adb shell am start -n "$PACKAGE_NAME/$MAIN_ACTIVITY"
    sleep 5
    adb shell am force-stop "$PACKAGE_NAME"
    sleep 1
done

END_TIME=$(date +%s)
echo "Completed Startup Loop in $((END_TIME - START_TIME)) seconds."

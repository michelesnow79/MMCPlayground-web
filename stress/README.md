
# Stress Testing Guide

This folder contains the **Mission Confirmation Stress Suite**. It is designed to validate the stability of the Web, API, and Android platforms before release.

## 🚀 Quick Start (Zero-Guess)

### Windows
1.  Open PowerShell in the project root.
2.  Run:
    ```powershell
    .\stress\run-all.ps1
    ```

### Mac / Linux
1.  Open Terminal.
2.  Run:
    ```bash
    ./stress/run-all.sh
    ```

---

## 🛠 What Happens?

The runner executes three phases automatically:
1.  **Dependency Check**: Verifies `node`, `k6` (optional), and `adb` (Android).
2.  **Web Stress (Playwright)**: 
    -   Starts a local dev server on port 5173 (if not running).
    -   Spins up 5 concurrent mobile browsers.
    -   Clicks through Browse, Map, and Filters.
    -   **Pass Criteria**: No timeouts, no JS errors.
    -   Results saved to: `stress/out/.../playwright-report/index.html`
3.  **Android Stress (Monkey)**:
    -   Connects to any running Emulator or USB Device.
    -   Unleashes a "Chaos Monkey" (random taps, swipes) for 5000 events.
    -   Captures logs in real-time.
    -   **Pass Criteria**: Logcat contains 0 "FATAL EXCEPTION" or "ANR".

---

## 🐛 Troubleshooting

### "Web Tests Failed / Timeout"
-   **Cause**: Your PC might be slow to start the local server.
-   **Fix**: The config now waits **120 seconds** for the request. Just re-run.
-   **Debug**: Open `stress/out/.../playwright-report/index.html` to see screenshots of where it got stuck.

### "Monkey Tests Skipped"
-   **Cause**: No Android device found.
-   **Fix**: Launch Android Studio Emulator (Virtual Device Manager -> Play) **before** running the script.

### "K6 not found"
-   **Cause**: K6 load testing tool is not installed.
-   **Fix**: This is optional. To enable, install K6 from [k6.io](https://k6.io).

## 📂 Output Folder Structure

Results are stored in `stress/out/YYYY_MM_DD_HHmm/`:
-   `playwright-report/`: Full interactive HTML report.
-   `monkey_log.txt`: Raw Android logs (search for "crash").
-   `k6_summary.json`: API load metrics.
-   `REPORT.md`: Summary (to be implemented).

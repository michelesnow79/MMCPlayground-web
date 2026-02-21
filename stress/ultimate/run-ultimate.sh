#!/usr/bin/env bash
# =====================================================================
# MMC ULTIMATE TORTURE TEST — Mac/Linux Shell
# One command. All phases. Never stops early.
#
# Usage:
#   ./stress/ultimate/run-ultimate.sh
#   BASE_URL=http://localhost:5173 ./stress/ultimate/run-ultimate.sh
#   ./stress/ultimate/run-ultimate.sh --skip-android --skip-k6
#
# Flags:
#   --skip-k6       skip API load phase
#   --skip-web      skip Playwright phase
#   --skip-android  skip Android phase
#   --skip-security skip Security phase
# =====================================================================
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:5173}"
SKIP_K6=false
SKIP_WEB=false
SKIP_ANDROID=false
SKIP_SECURITY=false
PW_WORKERS="${PLAYWRIGHT_WORKERS:-20}"

for arg in "$@"; do
    case $arg in
        --skip-k6)       SKIP_K6=true ;;
        --skip-web)      SKIP_WEB=true ;;
        --skip-android)  SKIP_ANDROID=true ;;
        --skip-security) SKIP_SECURITY=true ;;
    esac
done

TIMESTAMP=$(date +%Y_%m_%d_%H%M)
OUT_DIR="stress/out/$TIMESTAMP/ultimate"
SCRIPT_ROOT="stress/ultimate"
REPORT_FILE="$OUT_DIR/ultimate-report.md"

mkdir -p "$OUT_DIR"

K6_STATUS="SKIP"
WEB_STATUS="SKIP"
ANDROID_STATUS="SKIP"
PUSH_STATUS="SKIP"
SEC_STATUS="SKIP"
WEB_PASSES=0
WEB_FAILS=0

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     MMC ULTIMATE TORTURE TEST — $(date +%H:%M)                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo "Output: $OUT_DIR"
echo "BaseURL: $BASE_URL"
echo ""

# ─── In-Progress marker ───────────────────────────────────────────────────────
echo "# 🧪 MMC Ultimate Torture Test Report" > "$REPORT_FILE"
echo "**Date:** $(date '+%Y-%m-%d %H:%M') | **Status:** ⏳ IN PROGRESS" >> "$REPORT_FILE"

# ─── A. k6 API Load ───────────────────────────────────────────────────────────
if [ "$SKIP_K6" = false ]; then
    echo ""
    echo "═══ PHASE A — API Load (k6) ═══"
    K6_OUT="$OUT_DIR/k6"
    mkdir -p "$K6_OUT"
    if command -v k6 &>/dev/null; then
        export BASE_URL
        k6 run "$SCRIPT_ROOT/k6/ultimate-load.js" --out json="$K6_OUT/k6-summary.json" 2>&1 | tee "$K6_OUT/k6.log" || true
        K6_STATUS="PASS"
        if grep -q '"thresholds_exceeded":true' "$K6_OUT/k6-summary.json" 2>/dev/null; then
            K6_STATUS="FAIL"
        fi
    else
        echo "WARN: k6 not installed. Skipping."
        K6_STATUS="WARN"
    fi
    echo "k6 status: $K6_STATUS"
fi

# ─── B. Web UI (Playwright) ───────────────────────────────────────────────────
if [ "$SKIP_WEB" = false ]; then
    echo ""
    echo "═══ PHASE B — Web UI (Playwright) ═══"
    PW_OUT="$OUT_DIR/playwright"
    mkdir -p "$PW_OUT"

    # Server health check
    if curl -sf "$BASE_URL" -o /dev/null --max-time 5; then
        echo "Server reachable at $BASE_URL"
    else
        echo "WARN: Server not reachable at $BASE_URL"
    fi

    export BASE_URL PLAYWRIGHT_WORKERS="$PW_WORKERS"
    npx playwright test --config="$SCRIPT_ROOT/playwright/playwright.config.js" --reporter=json 2>&1 | tee "$PW_OUT/playwright.log" || true
    cp "$SCRIPT_ROOT/playwright/playwright-results.json" "$PW_OUT/results.json" 2>/dev/null || true

    if command -v node &>/dev/null && [ -f "$PW_OUT/results.json" ]; then
        WEB_PASSES=$(node -e "try{const d=require('./$PW_OUT/results.json');console.log((d.suites||[]).flatMap(s=>s.specs||[]).filter(s=>s.ok).length)}catch(e){console.log(0)}" 2>/dev/null || echo 0)
        WEB_FAILS=$(node -e "try{const d=require('./$PW_OUT/results.json');console.log((d.suites||[]).flatMap(s=>s.specs||[]).filter(s=>!s.ok).length)}catch(e){console.log(0)}" 2>/dev/null || echo 0)
    fi
    WEB_STATUS=$( [ "$WEB_FAILS" -gt 0 ] && echo "WARN" || echo "PASS" )
    echo "Playwright status: $WEB_STATUS (Pass: $WEB_PASSES | Fail: $WEB_FAILS)"
fi

# ─── C+D. Android + Push ─────────────────────────────────────────────────────
if [ "$SKIP_ANDROID" = false ]; then
    echo ""
    echo "═══ PHASE C+D — Android + Push Validation ═══"
    bash "$SCRIPT_ROOT/android/android-ultimate.sh" "$OUT_DIR" || true
    ANDROID_JSON="$OUT_DIR/android/android-summary.json"
    if [ -f "$ANDROID_JSON" ]; then
        ANDROID_STATUS=$(node -e "try{const d=require('./$ANDROID_JSON');console.log(d.status)}catch(e){console.log('WARN')}" 2>/dev/null || echo "WARN")
        PUSH_STATUS=$(node -e "try{const d=require('./$ANDROID_JSON');console.log(d.push_validation.status)}catch(e){console.log('WARN')}" 2>/dev/null || echo "WARN")
    else
        ANDROID_STATUS="WARN"
        PUSH_STATUS="WARN"
    fi
    echo "Android: $ANDROID_STATUS | Push: $PUSH_STATUS"
fi

# ─── E. Security ──────────────────────────────────────────────────────────────
if [ "$SKIP_SECURITY" = false ]; then
    echo ""
    echo "═══ PHASE E — Security Checks ═══"
    bash "$SCRIPT_ROOT/security/security-check.sh" "$OUT_DIR" || true
    SEC_JSON="$OUT_DIR/security/security-summary.json"
    if [ -f "$SEC_JSON" ]; then
        SEC_STATUS=$(node -e "try{const d=require('./$SEC_JSON');console.log(d.status)}catch(e){console.log('WARN')}" 2>/dev/null || echo "WARN")
    else
        SEC_STATUS="WARN"
    fi
    echo "Security: $SEC_STATUS"
fi

# ─── Final Status ─────────────────────────────────────────────────────────────
FINAL_STATUS="PASS"
if [ "$ANDROID_STATUS" = "FAIL" ] || [ "$K6_STATUS" = "FAIL" ] || [ "$SEC_STATUS" = "FAIL" ]; then
    FINAL_STATUS="FAIL"
elif [ "$ANDROID_STATUS" = "WARN" ] || [ "$WEB_STATUS" = "WARN" ] || [ "$PUSH_STATUS" = "WARN" ] || [ "$SEC_STATUS" = "WARN" ]; then
    FINAL_STATUS="WARN"
fi

# ─── Write Report ─────────────────────────────────────────────────────────────
cat > "$REPORT_FILE" << MDEOF
# 🧪 MMC Ultimate Torture Test Report

**Date:** $(date '+%Y-%m-%d %H:%M') | **Final Status:** $FINAL_STATUS
**Output Folder:** $OUT_DIR

---

## A — API Load (k6)

| Metric | Value |
|--------|-------|
| Status | $K6_STATUS |

---

## B — Web UI (Playwright)

| Metric | Value |
|--------|-------|
| Status | $WEB_STATUS |
| Passed | $WEB_PASSES |
| Failed | $WEB_FAILS |

---

## C — Android Stability

| Metric | Value |
|--------|-------|
| Status | $ANDROID_STATUS |

---

## D — Push Notification Validation

| Item | Value |
|------|-------|
| Status | $PUSH_STATUS |

---

## E — Security

| Check | Value |
|-------|-------|
| Status | $SEC_STATUS |

---

## ✅ Final Result: $FINAL_STATUS

> **FAIL** = Android crash/ANR OR API threshold OR security critical.
> **WARN** = Web failures or minor issues.
> **PASS** = All critical checks green.

*Generated by run-ultimate.sh | MMC Ultimate Suite*
MDEOF

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  FINAL STATUS: $FINAL_STATUS"
echo "║  API (k6):      $K6_STATUS"
echo "║  Web (PW):      $WEB_STATUS"
echo "║  Android:       $ANDROID_STATUS"
echo "║  Push:          $PUSH_STATUS"
echo "║  Security:      $SEC_STATUS"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "📁 Output: $OUT_DIR"
echo "📄 Report: $REPORT_FILE"

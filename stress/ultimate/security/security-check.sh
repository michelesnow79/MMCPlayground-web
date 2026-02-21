#!/usr/bin/env bash
# ============================================================
# Security Check Suite - Mac/Linux
# Run: ./stress/ultimate/security/security-check.sh <OUT_DIR>
# ============================================================
OUT_DIR="${1:-stress/out/$(date +%Y%m%d_%H%M%S)/ultimate}"
SEC_OUT="$OUT_DIR/security"
mkdir -p "$SEC_OUT"

REPORT_FILE="$SEC_OUT/security-summary.json"
OVERALL="PASS"
NOTES=""

echo "=== Security Check Suite ===" | tee "$SEC_OUT/security.log"

# ─── 1. npm Dependency Audit ──────────────────────────────────────────────────
echo ""
echo "--- [1/5] npm Dependency Audit ---"
npm audit --omit=dev --json > "$SEC_OUT/npm-audit.json" 2>&1 || true
HIGH=$(node -e "try{const a=require('./$SEC_OUT/npm-audit.json');console.log((a.metadata?.vulnerabilities?.high||0)+(a.metadata?.vulnerabilities?.critical||0))}catch(e){console.log('0')}" 2>/dev/null || echo "0")
echo "High/Critical vulns: $HIGH"
if [ "$HIGH" -gt 5 ]; then
    OVERALL="FAIL"
    NOTES="$NOTES high-vuln-count:$HIGH;"
elif [ "$HIGH" -gt 0 ]; then
    [ "$OVERALL" != "FAIL" ] && OVERALL="WARN"
    NOTES="$NOTES vuln-count:$HIGH;"
fi

# ─── 2. Hardcoded Secrets Grep ────────────────────────────────────────────────
echo ""
echo "--- [2/5] Hardcoded Secrets Scan ---"
SECRET_PATTERNS=(
    "AIzaSy[A-Za-z0-9_-]{30}"
    "AAAA[A-Za-z0-9_-]{100,}"
    "sk-[a-zA-Z0-9]{40}"
    "password\s*=\s*['\"][^'\"]{5}"
    "secret\s*=\s*['\"][^'\"]{5}"
)
SECRET_HITS=0
for PAT in "${SECRET_PATTERNS[@]}"; do
    FOUND=$(grep -rn "$PAT" src/ --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "import.meta.env\|process.env\|__ENV" | head -5 || true)
    if [ -n "$FOUND" ]; then
        echo "⚠️  Pattern found: $PAT"
        echo "$FOUND" | tee -a "$SEC_OUT/secrets-found.txt"
        SECRET_HITS=$((SECRET_HITS + 1))
    fi
done
if [ "$SECRET_HITS" -gt 0 ]; then
    OVERALL="FAIL"
    NOTES="$NOTES hardcoded-secrets:$SECRET_HITS;"
else
    echo "✅ No hardcoded secrets found."
fi

# ─── 3. Console.log Token Check (Production Build) ────────────────────────────
echo ""
echo "--- [3/5] Console.log Token Leak Check (dist/) ---"
TOKEN_LOGS=$(grep -rn "console.log.*token\|console.log.*uid\|console.log.*email\|console.log.*Bearer" dist/ --include="*.js" 2>/dev/null | head -5 || true)
if [ -n "$TOKEN_LOGS" ]; then
    echo "⚠️  console.log with sensitive keywords in dist:"
    echo "$TOKEN_LOGS" | tee -a "$SEC_OUT/token-logs.txt"
    [ "$OVERALL" != "FAIL" ] && OVERALL="WARN"
    NOTES="$NOTES console-log-token-leak;"
else
    echo "✅ No token console.log in production build."
fi

# ─── 4. CSP Check ─────────────────────────────────────────────────────────────
echo ""
echo "--- [4/5] CSP Check ---"
CSP_FOUND=$(grep -l "Content-Security-Policy" dist/index.html index.html 2>/dev/null | head -1 || true)
if [ -n "$CSP_FOUND" ]; then
    echo "✅ CSP found in: $CSP_FOUND"
else
    echo "⚠️  No CSP found in dist/index.html or index.html"
    [ "$OVERALL" != "FAIL" ] && OVERALL="WARN"
    NOTES="$NOTES no-csp;"
fi

# HTTPS check
HTTPS_CHECK=$(grep -r "http://" src/ --include="*.js" --include="*.jsx" 2>/dev/null | grep -v "localhost\|127.0.0.1\|//schema\|comment\|http://schemas" | head -5 || true)
if [ -n "$HTTPS_CHECK" ]; then
    echo "⚠️  Non-HTTPS URLs found in source:"
    echo "$HTTPS_CHECK" | tee -a "$SEC_OUT/http-urls.txt"
    [ "$OVERALL" != "FAIL" ] && OVERALL="WARN"
    NOTES="$NOTES non-https-url;"
else
    echo "✅ All URLs use HTTPS."
fi

# ─── 5. Android Config Checks ────────────────────────────────────────────────
echo ""
echo "--- [5/5] Android Config Checks ---"
ANDROID_STATUS="PASS"

GRADLE="android/app/build.gradle"
if grep -q "minifyEnabled true" "$GRADLE" 2>/dev/null; then echo "✅ minifyEnabled: true"; else echo "⚠️  minifyEnabled not set to true"; ANDROID_STATUS="WARN"; fi
if grep -q "shrinkResources true" "$GRADLE" 2>/dev/null; then echo "✅ shrinkResources: true"; else echo "⚠️  shrinkResources not set to true"; ANDROID_STATUS="WARN"; fi

MANIFEST="android/app/src/main/AndroidManifest.xml"
if grep -q 'allowBackup="false"' "$MANIFEST" 2>/dev/null; then echo "✅ allowBackup=false"; else echo "⚠️  allowBackup is not false"; ANDROID_STATUS="WARN"; fi
if grep -q 'networkSecurityConfig' "$MANIFEST" 2>/dev/null; then echo "✅ networkSecurityConfig present"; else echo "⚠️  No networkSecurityConfig in manifest"; ANDROID_STATUS="WARN"; fi

NSC="android/app/src/main/res/xml/network_security_config.xml"
if grep -q 'cleartextTrafficPermitted="false"' "$NSC" 2>/dev/null; then echo "✅ Cleartext traffic disabled"; else echo "⚠️  Cleartext traffic NOT explicitly disabled"; ANDROID_STATUS="WARN"; fi

# Check for secrets in strings.xml
STRINGS="android/app/src/main/res/values/strings.xml"
SECRET_IN_XML=$(grep -i "api_key\|secret\|password\|token" "$STRINGS" 2>/dev/null | head -3 || true)
if [ -n "$SECRET_IN_XML" ]; then
    echo "⚠️  Potential secrets in strings.xml:"
    echo "$SECRET_IN_XML" | tee -a "$SEC_OUT/android-secrets.txt"
    ANDROID_STATUS="WARN"
else
    echo "✅ No obvious secrets in strings.xml"
fi

if [ "$ANDROID_STATUS" != "PASS" ] && [ "$OVERALL" == "PASS" ]; then
    OVERALL="WARN"
fi
NOTES="$NOTES android:$ANDROID_STATUS;"

# ─── Write JSON ───────────────────────────────────────────────────────────────
cat > "$REPORT_FILE" << JSONEOF
{
  "status": "$OVERALL",
  "npm_high_critical_vulns": $HIGH,
  "hardcoded_secrets_found": $SECRET_HITS,
  "csp_present": $([ -n "$CSP_FOUND" ] && echo "true" || echo "false"),
  "android_config_status": "$ANDROID_STATUS",
  "notes": "$NOTES"
}
JSONEOF

echo ""
echo "=== Security Done: $OVERALL ==="
echo "Report: $REPORT_FILE"

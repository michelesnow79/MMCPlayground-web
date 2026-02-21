# ============================================================
# Security Check Suite - Windows PowerShell
# Run: .\stress\ultimate\security\security-check.ps1 -OutDir <path>
# ============================================================
param([string]$OutDir = "stress\out\$(Get-Date -Format 'yyyyMMdd_HHmmss')\ultimate")

$SecOut     = Join-Path $OutDir "security"
New-Item -ItemType Directory -Force -Path $SecOut | Out-Null

$ReportFile = Join-Path $SecOut "security-summary.json"
$Overall    = "PASS"
$Notes      = ""
$VulnCount  = 0

Write-Host "`n=== Security Check Suite ===" -ForegroundColor Cyan

# ─── 1. npm Dependency Audit ─────────────────────────────────────────────────
Write-Host "`n--- [1/5] npm Dependency Audit ---" -ForegroundColor Yellow
$AuditFile = Join-Path $SecOut "npm-audit.json"
npm audit --omit=dev --json 2>&1 | Set-Content $AuditFile
try {
    $AuditJson = Get-Content $AuditFile -Raw | ConvertFrom-Json -ErrorAction Stop
    $VulnCount = ($AuditJson.metadata.vulnerabilities.high + $AuditJson.metadata.vulnerabilities.critical)
} catch { $VulnCount = 0 }
Write-Host "High/Critical vulns: $VulnCount"
if ($VulnCount -gt 5)        { $Overall = "FAIL"; $Notes += "high-vulns:$VulnCount;" }
elseif ($VulnCount -gt 0)    { if ($Overall -ne "FAIL") { $Overall = "WARN" }; $Notes += "vulns:$VulnCount;" }
else                          { Write-Host "✅ No high/critical vulnerabilities." -ForegroundColor Green }

# ─── 2. Hardcoded Secrets Grep ───────────────────────────────────────────────
Write-Host "`n--- [2/5] Hardcoded Secrets Scan ---" -ForegroundColor Yellow
$SecretPatterns = @(
    'AIzaSy[A-Za-z0-9_\-]{30}',
    'sk-[a-zA-Z0-9]{40}',
    "password\s*=\s*['""][^'""]{5}",
    "secret\s*=\s*['""][^'""]{5}"
)
$SecretHits = 0
$SecPathFilter = @("*.js","*.jsx","*.ts","*.tsx")
foreach ($pat in $SecretPatterns) {
    $found = Get-ChildItem -Recurse -Path src -Include $SecPathFilter -ErrorAction SilentlyContinue |
             Select-String -Pattern $pat -ErrorAction SilentlyContinue |
             Where-Object { $_.Line -notmatch "import\.meta\.env|process\.env|__ENV" }
    if ($found) {
        Write-Host "⚠️  Pattern match: $pat" -ForegroundColor Red
        $found | Select-Object -First 5 | ForEach-Object { $_.ToString() | Add-Content (Join-Path $SecOut "secrets-found.txt") }
        $SecretHits++
    }
}
if ($SecretHits -eq 0) { Write-Host "✅ No hardcoded secrets found." -ForegroundColor Green }
else { $Overall = "FAIL"; $Notes += "secrets:$SecretHits;" }

# ─── 3. Console.log Token Check (dist/) ──────────────────────────────────────
Write-Host "`n--- [3/5] Console.log Token Leak Check ---" -ForegroundColor Yellow
$TokenLeaks = Get-ChildItem -Recurse -Path dist -Include "*.js" -ErrorAction SilentlyContinue |
              Select-String -Pattern "console\.log.*token|console\.log.*uid|console\.log.*email|console\.log.*Bearer" -ErrorAction SilentlyContinue
if ($TokenLeaks) {
    Write-Host "⚠️  Token-related console.log in dist:" -ForegroundColor Red
    $TokenLeaks | Select-Object -First 5 | ForEach-Object { $_.ToString() | Add-Content (Join-Path $SecOut "token-logs.txt") }
    if ($Overall -ne "FAIL") { $Overall = "WARN" }
    $Notes += "console-log-token;"
} else { Write-Host "✅ No token console.log in production build." -ForegroundColor Green }

# ─── 4. CSP + HTTPS ──────────────────────────────────────────────────────────
Write-Host "`n--- [4/5] CSP + HTTPS Check ---" -ForegroundColor Yellow
$CspFound = $false

foreach ($htmlFile in @("dist\index.html","index.html")) {
    if (Test-Path $htmlFile) {
        $content = Get-Content $htmlFile -Raw
        if ($content -match "Content-Security-Policy") {
            $CspFound = $true
            Write-Host "✅ CSP found in $htmlFile" -ForegroundColor Green
        }
    }
}
if (-not $CspFound) {
    Write-Host "⚠️  No CSP found." -ForegroundColor Red
    if ($Overall -ne "FAIL") { $Overall = "WARN" }
    $Notes += "no-csp;"
}

$HttpUrls = Get-ChildItem -Recurse -Path src -Include $SecPathFilter -ErrorAction SilentlyContinue |
            Select-String -Pattern "http://" -ErrorAction SilentlyContinue |
            Where-Object { $_.Line -notmatch "localhost|127\.0\.0\.1|schemas|comment" }
if ($HttpUrls) {
    Write-Host "⚠️  Non-HTTPS URLs in source." -ForegroundColor Red
    $HttpUrls | Select-Object -First 5 | ForEach-Object { $_.ToString() | Add-Content (Join-Path $SecOut "http-urls.txt") }
    if ($Overall -ne "FAIL") { $Overall = "WARN" }; $Notes += "non-https;"
} else { Write-Host "✅ All URLs use HTTPS." -ForegroundColor Green }

# ─── 5. Android Config ───────────────────────────────────────────────────────
Write-Host "`n--- [5/5] Android Config Checks ---" -ForegroundColor Yellow
$AndroidStatus = "PASS"

$Gradle = "android\app\build.gradle"
if (Test-Path $Gradle) {
    $GradleContent = Get-Content $Gradle -Raw
    if ($GradleContent -match "minifyEnabled\s+true")  { Write-Host "✅ minifyEnabled: true" -ForegroundColor Green }
    else { Write-Host "⚠️  minifyEnabled not true"; $AndroidStatus = "WARN" }
    if ($GradleContent -match "shrinkResources\s+true") { Write-Host "✅ shrinkResources: true" -ForegroundColor Green }
    else { Write-Host "⚠️  shrinkResources not true"; $AndroidStatus = "WARN" }
}

$Manifest = "android\app\src\main\AndroidManifest.xml"
if (Test-Path $Manifest) {
    $ManContent = Get-Content $Manifest -Raw
    if ($ManContent -match 'allowBackup="false"')         { Write-Host "✅ allowBackup=false" -ForegroundColor Green }
    else { Write-Host "⚠️  allowBackup not false"; $AndroidStatus = "WARN" }
    if ($ManContent -match 'networkSecurityConfig')        { Write-Host "✅ networkSecurityConfig present" -ForegroundColor Green }
    else { Write-Host "⚠️  No networkSecurityConfig"; $AndroidStatus = "WARN" }
}

$NSC = "android\app\src\main\res\xml\network_security_config.xml"
if (Test-Path $NSC) {
    if ((Get-Content $NSC -Raw) -match 'cleartextTrafficPermitted="false"') { Write-Host "✅ Cleartext traffic disabled" -ForegroundColor Green }
    else { Write-Host "⚠️  Cleartext not explicitly disabled"; $AndroidStatus = "WARN" }
}

$Strings = "android\app\src\main\res\values\strings.xml"
if (Test-Path $Strings) {
    $StrContent = Get-Content $Strings -Raw
    if ($StrContent -match "api_key|secret|password|token") {
        Write-Host "⚠️  Possible secret in strings.xml" -ForegroundColor Red
        $AndroidStatus = "WARN"
    } else { Write-Host "✅ No secrets in strings.xml" -ForegroundColor Green }
}

if ($AndroidStatus -ne "PASS" -and $Overall -eq "PASS") { $Overall = "WARN" }
$Notes += "android:$AndroidStatus;"

# ─── Write JSON ───────────────────────────────────────────────────────────────
$Report = [ordered]@{
    status                    = $Overall
    npm_high_critical_vulns   = $VulnCount
    hardcoded_secrets_found   = $SecretHits
    csp_present               = $CspFound
    android_config_status     = $AndroidStatus
    notes                     = $Notes
}
$Report | ConvertTo-Json | Set-Content $ReportFile

Write-Host "`n=== Security Done: $Overall ===" -ForegroundColor $(if ($Overall -eq "FAIL") {"Red"} elseif ($Overall -eq "WARN") {"Yellow"} else {"Green"})
Write-Host "Report: $ReportFile"

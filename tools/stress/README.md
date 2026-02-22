# 🧪 Stress Tooling

This directory contains standalone tools for performance testing and live verification of the MissMeConnection mobile application.

## 🚀 Available Commands

| Command | Description | Environment |
|---------|-------------|-------------|
| `npm run stress:proof` | Live "Proof of Life" test. Streams messages every 2s to verify Android sync. | Production Guarded |
| `npm run stress:light` | Light load test (2 users, 30s). Validates Firestore write throughput. | Production Guarded |
| `npm run stress` | Standard load test (5 users, 60s). High throughput validation. | **Requires Confirmation** |
| `npm run stress:cleanup` | Removes all `STRESS_TEST_` prefixed documents from Firestore. | Production Guarded |

## 🛡️ Safety & Guardrails

- **Data Isolation**: All test data (Pins, Threads) is prefixed with `STRESS_TEST_`.
- **Kill Switches**: Load tests automatically stop if the error rate exceeds 2% or 10 consecutive errors occur.
- **Production Guard**: Running `npm run stress` against a live project requires the environment variable `CONFIRM_PROD=YES`.
    - Example: `$env:CONFIRM_PROD='YES'; npm run stress` (Windows)
- **Hard Caps**:
    - `stress:proof` is capped at 100 total messages.
    - `stress:light/standard` is capped at 500 total messages.

## 📱 Android Verification Steps

1. **Run Proof**: `npm run stress:proof`
2. **Copy Credentials**: Copy the `Owner Email` and `Password` from the terminal output.
3. **Emulator Setup**:
    - Open the app in the Android emulator.
    - Log out if already logged in.
    - Log in using the test credentials.
4. **Observe Sync**: 
    - Go to the **Messages** screen.
    - Open the thread starting with `STRESS_TEST_`.
    - Verify messages are arriving every 2 seconds.
5. **Check Result**: The terminal will print a summary table and a `✅ PASS` status once all messages are observed on the listener side.

## 🧹 Cleanup

Always run cleanup after stress testing to maintain a clean database:

```powershell
# Dry run to see what will be deleted
npm run stress:cleanup -- --dry-run

# Execute deletion
npm run stress:cleanup
```

## 🔍 Troubleshooting

- **"Thread not visible"**:
    - Ensure you are logged in as the correct **Owner** (not Responder).
    - Check that the device clock is synchronized.
- **"Messages not visible"**:
    - Verify Firestore Rules are deployed.
    - Check the terminal for any `PERMISSION_DENIED` errors.
- **"Permission Denied" (Cleanup)**:
    - Mass cleanup via `npm run stress:cleanup` uses the client SDK. Due to Firestore Rules, it can only delete documents owned by the current session's authenticated user.
    - Stale test data from previous runs may remain unless removed by an Admin or manually.
- **"Permission Denied" (Proof/Load)**:
    - Usually caused by a mismatch in the `canonical thread ID` format or missing required fields (`participants`, `ownerUid`, etc.).

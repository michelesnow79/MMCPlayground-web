# MissMeConnection — Operations & Observability Guide

This document defines the monitoring strategy, alert thresholds, and incident response runbooks for the MissMeConnection platform, utilizing the telemetry system implemented in Phase 8.

---

## 1. Dashboard Specifications
These metrics are derived from `src/utils/telemetry.js` and should be visualized in the Firebase/Google Cloud Monitoring dashboard.

### 🔴 Ops Overview (Critical Health)
| Metric | Code Event | Visualization | Target (SLO) |
| :--- | :--- | :--- | :--- |
| **Crash-Free Sessions %** | `ERROR_REPORT` vs `app_boot` | Ratio Chart | > 99.5% |
| **API Availability** | `pins_load_success` vs `pins_load_fail` | Percentage | > 99.9% |
| **App Boot Latency** | `app_boot` (duration_ms) | p50 / p95 Line | < 1500ms |

### 🔐 Auth Health
| Metric | Code Event | Goal |
| :--- | :--- | :--- |
| **Login Failure Rate** | `auth_login_fail` / `auth_login_attempt` | < 5% (Total) |
| **Systemic Failure Rate** | `auth_login_fail` where code == `auth/network-request-failed` | < 0.5% |
| **Signup Conversion** | `auth_signup_success` / `auth_signup_attempt` | Baseline monitoring |

### 💬 Messaging & Pin Performance
| Metric | Code Event | Rationale |
| :--- | :--- | :--- |
| **Map Readiness** | `map_load` (duration_ms) | Measures Google Maps + initial pin load. Target < 3s. |
| **Reply Latency** | `reply_send` (duration_ms) | Measures Firestore atomic write duration. Target < 800ms. |
| **Pin Sync Errors** | `pins_load_fail` | Monitors Firestore collection access/permission issues. |

---

## 2. Alert Rules
Configure these in the Monitoring console to trigger notifications (Email/Slack).

| Alert Name | Threshold | Evaluation Window | Rationale |
| :--- | :--- | :--- | :--- |
| **Critical: High Crash Rate** | `ErrorRate > 1%` | 5 minutes | Prevents widespread user breakage after a bad deploy. |
| **Warning: Map Regression** | `p95 map_load > 5s` | 15 minutes | Identifies 3rd party API issues or inefficient client-side grouping. |
| **Auth: Network Blocked** | `network-request-failed > 2%` | 10 minutes | Detects environment-wide storage issues (e.g. IndexedDB bugs). |
| **Security: Signup Spike** | `signup_attempt > 5x baseline` | 1 hour | Potential bot or spam attack. |

---

## 3. Incident Response Runbooks

### 🚩 Alert: `high_auth_network_failure_rate`
*   **Symptom**: Users see "Network connection lost" repeatedly. Logs show `auth/network-request-failed`.
*   **Confirmation**: Check Google Cloud Console for high traffic or Google Identity Toolkit outages.
*   **Mitigation**:
    1.  Confirm if restricted to specific Chrome versions (Look at `telemetry` context).
    2.  Check `src/firebase.js` to ensure the `initializeAuth` persistence fallback is active.
    3.  If systemic, consider scaling up Cloud Functions or checking Firestore quotas.
*   **Long-term**: Refine the persistence array to prioritize `browserLocalPersistence` if IndexedDB remains unstable in the current environment.

### 🚩 Alert: `high_render_crash_rate`
*   **Symptom**: Users see the "Something went wrong" ErrorBoundary screen.
*   **Confirmation**: Check `ERROR_REPORT` logs for `source: ErrorBoundary`.
*   **Mitigation**:
    1.  Inspect the `componentStack` in the error payload to identify the crashing component (e.g., `MapView`, `Browse`).
    2.  Roll back to previous `BuildID` if the crash started exactly at the last deployment.
    3.  If Firestore-related, verify if a new security rule is blocking reads for a specific route.

### 🚩 Alert: `map_load_regression`
*   **Symptom**: "WAITING..." spinner hangs for more than 5 seconds on the Map.
*   **Confirmation**: Filter metrics by `event: map_load`.
*   **Mitigation**:
    1.  Check Google Maps API Quotas/Billing state.
    2.  Verify `pins_load_success` count. If pins count > 500, investigate `fuzzAndProcessLocation` performance in `MapView.jsx`.
    3.  Implement more aggressive grouping/clustering if the client-side processing is the bottleneck.

---

---

## 4. Production Telemetry Hardening
To prevent metric flooding and high egress costs, the following protections are active in `src/utils/telemetry.js`:

*   **Sampling**: Success events are sampled at **20%** in production. Error/Failure events are ALWAYS captured at 100%.
*   **Session Caps**: Each user session is capped at **100 events**. Once reached, telemetry stops to prevent loop-induced cost spikes.
*   **Metadata**: Every event is tagged with `env`, `buildId`, and `networkStatus`.

---

## 5. Firebase Quotas & Cost Monitoring
Monitor these daily via the [Firebase Console](https://console.firebase.google.com/):

### 💸 Critical Cost Drivers
*   **Firestore Reads**: Every pin displayed on the map counts as a read. Ensure clustering is efficient.
*   **Firestore Writes**: Reply operations are atomic (1 write per message).
*   **Cloud Storage**: Not currently used (no images), keeping costs low.

### 📊 Alert Thresholds (GCP Console)
1.  **Budget Alert**: Trigger at $5.00/month (Safety net).
2.  **Firestore Read Spike**: Trigger if reads > 50,000 in 24h.
3.  **Auth Usage**: Monitor for "Daily active users" spikes which may indicate bot activity.

---

## 6. Backup & Data Retention Policy

### 💾 Backup Strategy
*   **Firestore Managed Backups**: Enable Scheduled Backups in the Google Cloud Console (Daily retention).
*   **Manual Exports**: Run `gcloud firestore export` monthly to a cold-line GCS bucket.

### ⏳ Data Retention (Privacy First)
*   **Archived Pins**: Pins older than 30 days are automatically filtered from the Map.
*   **Deletions**: User-initiated deletions are permanent (removed from Firestore).
*   **Black Box Log**: "Deleted Pins" (Admin audit log) are kept for 90 days for safety before permanent purging.

---
---
*Last Updated: 2026-02-17 (Phase 8.5 Production Ready)*

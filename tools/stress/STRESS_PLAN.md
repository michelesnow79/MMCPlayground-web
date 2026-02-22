# Messaging Flow Stress Test Plan

## 1. Scope
Targeting the core communication loop: Authentication -> Thread Creation -> Message Exchange -> Listener Stability.

## 2. Target Environment
- **Primary**: Local Firebase Emulator (Auth: 9099, Firestore: 8080).
- **Fallback**: Production (SAFE mode). Using `STRESS_TEST_` prefixes for all UIDs and Pin IDs.

## 3. Metrics & Pass/Fail
| Metric | Threshold |
| :--- | :--- |
| **Error Rate** | < 1% |
| **Missing Messages** | 0 |
| **Duplicates** | 0 |
| **p95 Latency** | < 2.0s (Send -> Visible in Listener) |
| **Listener Stability** | 0 unexpected disconnects |

## 4. Concurrency Levels
- **Light**: 5 concurrent users, 60s duration.
- **Heavy**: 50 concurrent users, 5m duration.

## 5. Test Scenarios
1. **Burst Send**: 10 messages/sec for 10s.
2. **Sustained**: 1 message/2s for 5m.
3. **Listener Pressure**: Rapidly switching listeners across 5 threads/user.
4. **Security Check**: Attempting to write to a thread where user is not a participant.

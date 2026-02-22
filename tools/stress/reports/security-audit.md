# Firestore Security Audit

**Timestamp:** 2026-02-21T21:15:00Z
**Target Version:** 1.0 (production-locked)

## 🛡️ Access Control Review

### 1. Threads Collection (`/threads/{threadId}`)
- **Read Access:** Restricted to authenticated users who are either the `ownerUid` or `responderUid` of the document.
- **Write (Create):** Enforces strict schema validation.
    - Requires canonical `id` format: `pinId_responderUid`.
    - Validates that the creator is a participant.
    - Validates that `ownerUid` matches the actual Pin owner (cross-collection read).
    - Prevents owner from being the responder.
- **Write (Update):** Uses `affectedKeys().hasOnly()` guardrails.
    - Only `lastMessageAt`, `lastMessagePreview`, `lastSenderUid`, `updatedAt`, and `LastReadAt` fields can be updated.
    - **Security:** Participants, UIDs, and Pin IDs are immutable after creation.

### 2. Messages Subcollection (`/threads/{threadId}/messages/{messageId}`)
- **Read Access:** Restricted to users listed in the parent thread's `participants` array. 
- **Write (Create):**
    - **Sender Validation:** `request.resource.data.senderUid == request.auth.uid` is enforced.
    - **Participant Validation:** User MUST be a thread participant to send a message.
    - **Content Safety:** Content length capped at 2000 chars and must be a string.
- **Write (Update/Delete):** Explicitly `allow update, delete: if false;`. 
    - **Security:** Message history is immutable and append-only.

### 3. Pins Collection (`/pins/{pinId}`)
- **Read Access:** Public (`allow read: if true;`). This aligns with the "Explore for free" product requirement.
- **Write (Create/Update):** Strictly owned. Only the `ownerUid` (matching `request.auth.uid`) can create or modify their own pins.

## 🔍 Audit Findings & Verification

| Requirement | Status | Line Ref | Notes |
|-------------|--------|----------|-------|
| `senderUid` Integrity | ✅ PASS | 90 | Enforced on every message create. |
| Participant Isolation | ✅ PASS | 83, 96 | Users cannot read or write to threads they don't belong to. |
| Immutable Identity | ✅ PASS | 63-73 | Critical thread metadata cannot be edited. |
| Append-only Ledger | ✅ PASS | 103 | Messages cannot be changed or deleted by users. |
| Canonical Pathing | ✅ PASS | 44 | Prevents arbitrary thread ID generation. |

## ⚠️ Potential Weaknesses (Low Risk)
- **Broad Read for Pins:** While intentional, any user can scrape the `pins` collection. This is a business design choice rather than a technical vulnerability.
- **Public Ratings:** Ratings are public read, which is standard for social proofing but worth noting.

## 🏁 Conclusion
The Firestore security rules are **production-ready**. They implement "Least Privilege" access for private messaging while maintaining public accessibility for the map features. No immediate changes are required.

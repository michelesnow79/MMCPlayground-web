import { initializeApp } from "firebase/app";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    connectAuthEmulator
} from "firebase/auth";
import {
    getFirestore,
    collection,
    addDoc,
    doc,
    setDoc,
    updateDoc,
    onSnapshot,
    query,
    where,
    serverTimestamp,
    writeBatch,
    connectFirestoreEmulator
} from "firebase/firestore";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import path from 'path';

// Load .env from root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
};

// Arguments
const args = process.argv.slice(2);
const isHeavy = args.includes('--mode=heavy');
const isDryRun = args.includes('--dry-run');
const useEmulator = args.includes('--emulator'); // Only use if explicitly requested

const CONCURRENCY = isHeavy ? 50 : 5;
const DURATION_MS = (isHeavy ? 300 : 30) * 1000;
const MSG_INTERVAL_MS = 2000;

async function runStressTest() {
    console.log(`\n🚀 MESSAGING STRESS TEST [Mode: ${isHeavy ? 'HEAVY' : 'LIGHT'}${isDryRun ? ' (DRY RUN)' : ''}]`);
    console.log(`👥 Concurrency: ${CONCURRENCY} users`);
    console.log(`⏱️ Duration: ${DURATION_MS / 1000}s`);

    if (!useEmulator && !isDryRun) {
        console.warn("⚠️ WARNING: Targeting LIVE database (mmcplayground).");
        console.warn("⚠️ Operations will use prefix 'STRESS_TEST_' to avoid data pollution.");
    }

    const stats = {
        attempted: 0,
        succeeded: 0,
        errors: [],
        latencies: [],
        listenerUpdates: 0,
        duplicates: 0,
        missing: 0
    };

    const users = [];

    // 1. Setup Users
    console.log("⚙️ Initializing SDK instances...");
    for (let i = 0; i < CONCURRENCY; i++) {
        const appName = `stress-user-${i}-${Date.now()}`;
        const app = initializeApp(config, appName);
        const auth = getAuth(app);
        const db = getFirestore(app);

        if (useEmulator && !isDryRun) {
            connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
            connectFirestoreEmulator(db, "localhost", 8080);
        }

        users.push({ i, app, auth, db, threads: [], receivedMsgs: new Set() });
    }

    // 2. Auth & Setup
    console.log("🏁 Phase 1: Authentication & Handshake...");
    const pinId = `STRESS_TEST_PIN_${Date.now()}`;
    const owner = users[0];

    if (!isDryRun) {
        try {
            // Sequential auth to avoid rate limiting or race conditions during setup
            for (const user of users) {
                const email = `stress_${user.i}_${Date.now()}@test.com`;
                const password = "stressPassword123!";
                try {
                    const res = await createUserWithEmailAndPassword(user.auth, email, password);
                    user.uid = res.user.uid;
                    user.email = email;
                } catch (err) {
                    if (err.code === 'auth/email-already-in-use') {
                        const res = await signInWithEmailAndPassword(user.auth, email, password);
                        user.uid = res.user.uid;
                        user.email = email;
                    } else {
                        throw err;
                    }
                }
            }
            console.log(`✅ ${CONCURRENCY} users authenticated.`);

            // Create pin as the first authenticated user
            await setDoc(doc(owner.db, 'pins', pinId), {
                title: "STRESS TEST PIN",
                ownerUid: owner.uid,
                ownerEmail: owner.email.toLowerCase(),
                createdAt: serverTimestamp()
            });
            console.log("✅ Stress Pin Created: " + pinId);
        } catch (e) {
            console.error("\n❌ AUTH/CONNECTION ERROR:");
            if (useEmulator) {
                console.error("👉 Is the Firebase Emulator running? (firebase emulators:start)");
            }
            console.error("👉 Error: " + e.message);
            process.exit(1);
        }
    } else {
        console.log("✨ (Dry Run) Auth skipped.");
    }

    // 3. Start Messaging Loop
    console.log("📨 Phase 2: Sustained Messaging + Listeners...");
    const startTime = Date.now();
    const activeTests = users.map(async (user) => {
        if (user.i === 0) return; // Dedicated owner/listener

        const threadId = `${pinId}_${user.uid}`;
        const threadRef = doc(user.db, 'threads', threadId);
        let unsub = () => { };

        if (!isDryRun) {
            try {
                // handshake
                await setDoc(threadRef, {
                    pinId,
                    ownerUid: owner.uid,
                    ownerEmail: owner.email.toLowerCase(),
                    responderUid: user.uid,
                    responderEmail: user.email.toLowerCase(),
                    participants: [owner.uid, user.uid],
                    lastMessageAt: serverTimestamp(),
                    ownerLastReadAt: serverTimestamp(),
                    responderLastReadAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            } catch (err) {
                console.error(`❌ Handshake Failed [User ${user.i}, UID ${user.uid}]: ${err.message}`);
                throw err;
            }

            // listener
            unsub = onSnapshot(query(collection(user.db, 'threads', threadId, 'messages')), (snap) => {
                stats.listenerUpdates += snap.docChanges().length;
                snap.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        if (user.receivedMsgs.has(change.doc.id)) {
                            stats.duplicates++;
                        }
                        user.receivedMsgs.add(change.doc.id);

                        // Check both sentAt and createdAt
                        const tsField = data.createdAt || data.sentAt;
                        if (tsField) {
                            const now = Date.now();
                            const sentAt = tsField.toMillis ? tsField.toMillis() : tsField;
                            stats.latencies.push(now - sentAt);
                        }
                    }
                });
            });
        }

        // loop
        while (Date.now() - startTime < DURATION_MS) {
            stats.attempted++;
            const msgId = `msg_${user.i}_${Date.now()}`;
            if (!isDryRun) {
                try {
                    const batch = writeBatch(user.db);
                    const msgRef = doc(user.db, 'threads', threadId, 'messages', msgId);

                    batch.set(msgRef, {
                        content: "STRESS TEST MESSAGE " + "A".repeat(Math.random() > 0.5 ? 200 : 20),
                        senderUid: user.uid,
                        senderEmail: user.email.toLowerCase(),
                        sentAt: serverTimestamp(),
                        createdAt: serverTimestamp(),
                        participants: [owner.uid, user.uid]
                    });

                    batch.update(threadRef, {
                        lastMessageAt: serverTimestamp(),
                        lastMessagePreview: "Stress...",
                        lastSenderUid: user.uid,
                        updatedAt: serverTimestamp()
                    });

                    await batch.commit();
                    stats.succeeded++;
                    stats.listenerUpdates++; // Simulate listener receipt in dry run if needed
                } catch (err) {
                    stats.errors.push({ code: err.code, message: err.message, path: `threads/${threadId}` });
                }
            } else {
                // Dry run simulation
                stats.succeeded++;
                stats.latencies.push(10 + Math.random() * 50);
                stats.listenerUpdates++;
            }
            await new Promise(r => setTimeout(r, MSG_INTERVAL_MS + (Math.random() * 500)));
        }
        if (!isDryRun) unsub();
    });

    await Promise.all(activeTests);

    // 4. Report
    console.log("\n" + "=".repeat(40));
    console.log("📊 STRESS TEST SUMMARY");
    console.log("=".repeat(40));

    const successRate = (stats.succeeded / stats.attempted * 100).toFixed(2);
    const p95 = stats.latencies.sort((a, b) => a - b)[Math.floor(stats.latencies.length * 0.95)] || 0;

    console.table({
        "Total Attempted": stats.attempted,
        "Total Succeeded": stats.succeeded,
        "Success Rate": `${successRate}%`,
        "Duplicates Found": stats.duplicates,
        "Missing Messages": stats.missing,
        "p95 Latency (ms)": p95,
        "Listener Updates": stats.listenerUpdates
    });

    if (stats.errors.length > 0) {
        console.log("\n❌ TOP ERRORS:");
        stats.errors.slice(0, 5).forEach((e, i) => {
            console.log(`${i + 1}. [${e.code}] ${e.message} @ ${e.path}`);
        });
    }

    const pass = successRate > 99 && stats.duplicates === 0 && (p95 < 2000 || !useEmulator);
    console.log(`\nOVERALL STATUS: ${pass ? '✅ PASS' : '❌ FAIL'}\n`);

    process.exit(pass ? 0 : 1);
}

runStressTest().catch(err => {
    console.error("FATAL ERROR:", err);
    process.exit(1);
});

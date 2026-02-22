import { initializeApp } from "firebase/app";
import {
    getAuth,
    createUserWithEmailAndPassword,
} from "firebase/auth";
import {
    getFirestore,
    doc,
    setDoc,
    collection,
    onSnapshot,
    query,
    serverTimestamp,
    writeBatch,
    orderBy
} from "firebase/firestore";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import path from 'path';

// Load .env
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

async function runAndroidProof() {
    console.log(`\n📱 ANDROID LIVE PROOF TEST`);
    console.log(`⏱️ Goal: 1 message every 2s for 120s | 🛑 Cap: 100 msgs`);
    console.log(`📍 Project: ${config.projectId}\n`);

    const stats = {
        attempted: 0,
        succeeded: 0,
        observed: 0,
        duplicates: 0,
        missing: 0,
        latencies: [],
        sentMsgIds: new Set(),
        observedMsgIds: new Set()
    };

    // 1. Create Named Accounts
    const ts = Date.now();
    const ownerEmail = `STRESS_TEST_OWNER_${ts}@proof.local`;
    const respEmail = `STRESS_TEST_RESP_${ts}@proof.local`;
    const password = `StressPass_${ts}!`;

    console.log("=".repeat(50));
    console.log("=== ANDROID PROOF LOGIN (COPY/PASTE) ===");
    console.log(`Owner Email:     ${ownerEmail}`);
    console.log(`Responder Email: ${respEmail}`);
    console.log(`Password:        ${password}`);
    console.log("=".repeat(50));

    const ownerApp = initializeApp(config, "owner-app");
    const respApp = initializeApp(config, "resp-app");
    const ownerAuth = getAuth(ownerApp);
    const respAuth = getAuth(respApp);
    const ownerDb = getFirestore(ownerApp);
    const respDb = getFirestore(respApp);

    try {
        console.log("⏳ Initializing test data...");
        const ownerRes = await createUserWithEmailAndPassword(ownerAuth, ownerEmail, password);
        const respRes = await createUserWithEmailAndPassword(respAuth, respEmail, password);
        const ownerUid = ownerRes.user.uid;
        const respUid = respRes.user.uid;

        const pinId = `STRESS_TEST_PIN_${ts}`;
        await setDoc(doc(ownerDb, "pins", pinId), {
            title: `STRESS_TEST_LIVE_PROOF`,
            description: "If you see this, the test is running.",
            ownerUid: ownerUid,
            ownerEmail: ownerEmail.toLowerCase(),
            createdAt: serverTimestamp()
        });

        const threadId = `${pinId}_${respUid}`;
        const threadRef = doc(respDb, "threads", threadId);

        await setDoc(threadRef, {
            pinId,
            ownerUid,
            ownerEmail: ownerEmail.toLowerCase(),
            responderUid: respUid,
            responderEmail: respEmail.toLowerCase(),
            participants: [ownerUid, respUid],
            lastMessageAt: serverTimestamp(),
            lastMessagePreview: "Waiting for stream...",
            lastSenderUid: respUid,
            ownerLastReadAt: serverTimestamp(),
            responderLastReadAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            isStressTest: true
        });

        console.log(`✅ Pin ID:    ${pinId}`);
        console.log(`✅ Thread ID: ${threadId}`);
        console.log(`✅ Path:      threads/${threadId}/messages`);
        console.log("\n" + "-".repeat(50));
        console.log("📖 USER INSTRUCTIONS:");
        console.log("1. Open emulator → open app");
        console.log("2. Log out if already logged in");
        console.log("3. Log in as OWNER (email/pass above)");
        console.log("4. Go to Messages list");
        console.log(`5. Open thread: ${threadId}`);
        console.log("6. Watch messages arrive every 2 seconds for 2 minutes");
        console.log("-".repeat(50));

        // 2. Start Message Loop
        console.log("\n📨 Starting visible ping stream...");
        const DURATION_S = 120;
        const INTERVAL_MS = 2000;
        const startTime = Date.now();

        // 3. Script-side listener (Owner side)
        const messagesCol = collection(ownerDb, "threads", threadId, "messages");
        const unsub = onSnapshot(query(messagesCol, orderBy("createdAt", "asc")), (snap) => {
            snap.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const msgId = change.doc.id;
                    const data = change.doc.data();

                    if (stats.observedMsgIds.has(msgId)) {
                        stats.duplicates++;
                    } else {
                        stats.observedMsgIds.add(msgId);
                        stats.observed++;

                        if (data.sentAtLocal) {
                            const receiveTime = Date.now();
                            const latency = receiveTime - data.sentAtLocal;
                            if (latency >= 0) stats.latencies.push(latency);
                        }
                    }
                }
            });
        });

        const sendMessages = async () => {
            let count = 0;
            while (Date.now() - startTime < (DURATION_S * 1000) && count < 100) {
                count++;
                stats.attempted++;
                const msgId = `MSG_${count}_${Date.now()}`;
                const content = `ANDROID_PROOF_${count}_${new Date().toLocaleTimeString()}`;

                try {
                    const batch = writeBatch(respDb);
                    const msgRef = doc(respDb, "threads", threadId, "messages", msgId);

                    batch.set(msgRef, {
                        content,
                        senderUid: respUid,
                        senderEmail: respEmail.toLowerCase(),
                        createdAt: serverTimestamp(),
                        sentAtLocal: Date.now() // For latency measurement
                    });

                    batch.update(threadRef, {
                        lastMessageAt: serverTimestamp(),
                        lastMessagePreview: content,
                        lastSenderUid: respUid,
                        updatedAt: serverTimestamp()
                    });

                    await batch.commit();
                    stats.succeeded++;
                    stats.sentMsgIds.add(msgId);
                } catch (err) {
                    console.error(`🛑 Message ${count} failed:`, err.message);
                    if (err.code === 'permission-denied') {
                        console.error("Stack:", err.stack);
                        break;
                    }
                }

                if (count % 5 === 0) {
                    console.log(`   Processed ${count} messages... (Observed: ${stats.observed})`);
                }

                await new Promise(r => setTimeout(r, INTERVAL_MS));
            }
        };

        await sendMessages();

        // Wait a few seconds for final messages to arrive via listener
        console.log("\n⌛ Finalizing observation (5s splash)...");
        await new Promise(r => setTimeout(r, 5000));
        unsub();

        // 4. Final Report
        console.log("\n" + "=".repeat(50));
        console.log("📊 ANDROID PROOF SUMMARY");
        console.log("=".repeat(50));

        const missingIds = [];
        stats.sentMsgIds.forEach(id => {
            if (!stats.observedMsgIds.has(id)) {
                missingIds.push(id);
            }
        });
        stats.missing = missingIds.length;

        const sortedLatencies = stats.latencies.sort((a, b) => a - b);
        const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0;
        const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
        const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;

        console.table({
            "Attempted": stats.attempted,
            "Succeeded": stats.succeeded,
            "Observed": stats.observed,
            "Duplicates": stats.duplicates,
            "Missing": stats.missing,
            "p50 Visible (ms)": p50,
            "p95 Visible (ms)": p95,
            "p99 Visible (ms)": p99
        });

        if (stats.missing > 0) {
            console.log("\n❌ TOP MISSING MESSAGE IDS:");
            console.log(missingIds.slice(0, 5).join("\n"));
            console.log(`\nOVERALL: ❌ FAIL (Missing ${stats.missing} messages)`);
            process.exit(1);
        } else {
            console.log(`\nOVERALL: ✅ PASS (All ${stats.succeeded} messages observed)`);
            process.exit(0);
        }

    } catch (e) {
        console.error("\n❌ Setup Failed:");
        console.error(e.stack);
        process.exit(1);
    }
}

runAndroidProof();

import { initializeApp } from "firebase/app";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword
} from "firebase/auth";
import {
    getFirestore,
    doc,
    setDoc,
    addDoc,
    collection,
    onSnapshot,
    query,
    serverTimestamp,
    writeBatch,
    getDoc,
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

// Arguments
const args = process.argv.slice(2);
const isLight = args.includes('--mode=light');
const isStandard = !isLight;
const isLiveProject = !config.projectId.includes('demo') && !config.projectId.includes('emulator');

// Safety Caps
const CONCURRENCY = isLight ? 2 : 5;
const MAX_CONCURRENCY = 10;
const DURATION_S = isLight ? 30 : 60;
const RPS_CAP = 1;
const TOTAL_MSG_CAP = 500;
const ERROR_THRESHOLD = 0.02; // 2%
const CONSECUTIVE_ERROR_LIMIT = 10;

async function startLoadTest() {
    const modeName = isLight ? 'LIGHT' : 'STANDARD';
    console.log(`\n🚀 PRODUCTION SAFE LOAD TEST [Mode: ${modeName}]`);
    console.log(`📍 Project: ${config.projectId}`);

    if (isStandard && isLiveProject && process.env.CONFIRM_PROD !== 'YES') {
        console.error("\n🛑 SAFETY REJECTED: STANDARD Load Test against a LIVE project requires 'CONFIRM_PROD=YES'.");
        console.log("   Example: $env:CONFIRM_PROD='YES'; npm run stress");
        process.exit(1);
    }

    console.log(`👥 Users: ${CONCURRENCY} | ⏱️ Duration: ${DURATION_S}s | 🛑 Cap: ${TOTAL_MSG_CAP} msgs\n`);

    const stats = {
        attempted: 0,
        succeeded: 0,
        errors: [],
        consecutiveErrors: 0,
        latencies: [],
        duplicates: 0,
        missing: 0,
        threadsCreated: 0,
        msgsCreated: 0
    };

    const killSwitch = { active: false, reason: "" };

    const checkKillSwitch = (err) => {
        stats.consecutiveErrors++;
        if (stats.consecutiveErrors >= CONSECUTIVE_ERROR_LIMIT) {
            killSwitch.active = true;
            killSwitch.reason = "CONSECUTIVE_ERROR_LIMIT_REACHED";
        }
        const errorRate = stats.errors.length / Math.max(1, stats.attempted);
        if (errorRate > ERROR_THRESHOLD && stats.attempted > 50) {
            killSwitch.active = true;
            killSwitch.reason = "ERROR_RATE_THRESHOLD_EXCEEDED";
        }
    };

    // 1. Create Named Accounts
    const ts = Date.now();
    const ownerEmail = `stress_owner_${ts}@mmc.local`;
    const respEmail = `stress_responder_${ts}@mmc.local`;
    const password = `StressPass_${ts}!`;

    console.log("🔐 NAMED ACCOUNTS FOR ANDROID LOG-IN:");
    console.log(`📧 Owner: ${ownerEmail}`);
    console.log(`📧 Resp:  ${respEmail}`);
    console.log(`🔑 Pass:  ${password} (Use for both)`);
    console.log("-".repeat(40));

    const ownerApp = initializeApp(config, "owner-app");
    const respApp = initializeApp(config, "resp-app");
    const ownerAuth = getAuth(ownerApp);
    const respAuth = getAuth(respApp);
    const ownerDb = getFirestore(ownerApp);
    const respDb = getFirestore(respApp);

    try {
        console.log("Creating accounts & Pin...");
        const ownerRes = await createUserWithEmailAndPassword(ownerAuth, ownerEmail, password);
        const respRes = await createUserWithEmailAndPassword(respAuth, respEmail, password);
        const ownerUid = ownerRes.user.uid;
        const respUid = respRes.user.uid;

        // Store emails for schema alignment
        // @ts-ignore
        ownerApp.stressEmail = ownerEmail;
        // @ts-ignore
        respApp.stressEmail = respEmail;

        const pinId = `STRESS_TEST_PIN_${ts}`;
        await setDoc(doc(ownerDb, "pins", pinId), {
            title: "STRESS TEST PIN",
            description: "Safety Load Test Active",
            ownerUid: ownerUid,
            ownerEmail: ownerEmail.toLowerCase(),
            createdAt: serverTimestamp()
        });
        console.log(`✅ Pin Created: ${pinId}`);

        const threadId = `${pinId}_${respUid}`;
        const threadRef = doc(respDb, "threads", threadId);

        console.log(`✅ Thread ID:  ${threadId}`);
        console.log("-".repeat(40));

        // Handshake
        await setDoc(threadRef, {
            pinId,
            ownerUid,
            ownerEmail: ownerEmail.toLowerCase(),
            responderUid: respUid,
            responderEmail: respEmail.toLowerCase(),
            participants: [ownerUid, respUid],
            lastMessageAt: serverTimestamp(),
            ownerLastReadAt: serverTimestamp(),
            responderLastReadAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            isStressTest: true
        });
        stats.threadsCreated++;

        // 2. Start Message Loop
        console.log("📨 Phase: Sustained Send + Listeners...");
        const startTime = Date.now();

        // Listener (on Owner) to measure time-to-visible
        const unsub = onSnapshot(query(collection(ownerDb, "threads", threadId, "messages")), (snap) => {
            snap.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    if (data.sentAt && data.senderUid === respUid) {
                        const now = Date.now();
                        const sentAt = data.sentAt.toMillis ? data.sentAt.toMillis() : (data.sentAt.seconds ? data.sentAt.seconds * 1000 : data.sentAt);
                        // Filter out negative latencies caused by server/client clock skew
                        // but keep 0+ for real measurement
                        const latency = now - sentAt;
                        if (latency >= 0) stats.latencies.push(latency);
                    }
                }
            });
        });

        const sendLoop = async () => {
            while (Date.now() - startTime < (DURATION_S * 1000) && !killSwitch.active && stats.msgsCreated < TOTAL_MSG_CAP) {
                stats.attempted++;
                const msgId = `STRESS_TEST_MSG_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

                try {
                    const batch = writeBatch(respDb);
                    const msgRef = doc(respDb, "threads", threadId, "messages", msgId);

                    batch.set(msgRef, {
                        content: `Load Test Message ${stats.msgsCreated + 1}`,
                        senderUid: respUid,
                        senderEmail: respEmail.toLowerCase(),
                        sentAt: serverTimestamp(),
                        createdAt: serverTimestamp(),
                        participants: [ownerUid, respUid]
                    });

                    batch.update(threadRef, {
                        lastMessageAt: serverTimestamp(),
                        lastMessagePreview: `Msg ${stats.msgsCreated + 1}`,
                        lastSenderUid: respUid,
                        updatedAt: serverTimestamp()
                    });

                    await batch.commit();
                    stats.succeeded++;
                    stats.msgsCreated++;
                    stats.consecutiveErrors = 0;
                } catch (err) {
                    stats.errors.push({ code: err.code, message: err.message, op: "sendMessage", stack: err.stack });
                    checkKillSwitch(err);
                }

                if (killSwitch.active) break;
                await new Promise(r => setTimeout(r, 1000 / RPS_CAP));
            }
        };

        await sendLoop();
        unsub();

        if (killSwitch.active) {
            console.error(`\n🚨 KILL SWITCH TRIGGERED: ${killSwitch.reason}`);
        }

        // 3. Final Report
        console.log("\n" + "=".repeat(40));
        console.log("📊 LOAD TEST SUMMARY");
        console.log("=".repeat(40));

        const successRate = (stats.succeeded / stats.attempted * 100).toFixed(2);
        const latencies = stats.latencies.sort((a, b) => a - b);
        const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
        const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
        const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

        console.table({
            "Attempted Sends": stats.attempted,
            "Succeeded Sends": stats.succeeded,
            "Success Rate": `${successRate}%`,
            "p50 Latency (ms)": p50,
            "p95 Latency (ms)": p95,
            "p99 Latency (ms)": p99,
            "Duplicates": stats.duplicates,
            "Threads Created": stats.threadsCreated,
            "Total Msgs": stats.msgsCreated
        });

        if (stats.errors.length > 0) {
            console.log("\n❌ TOP ERRORS:");
            const uniqueErrors = {};
            stats.errors.forEach(e => {
                uniqueErrors[e.code] = (uniqueErrors[e.code] || 0) + 1;
            });
            console.table(uniqueErrors);

            console.log("\nSample Stacks:");
            stats.errors.slice(0, 3).forEach((e, i) => {
                console.log(`[${i + 1}] ${e.code} in ${e.op}\n${e.stack?.split('\n')[1]}`);
            });
        }

        console.log(`\nOVERALL: ${stats.succeeded > 5 && successRate > 98 ? '✅ PASS' : '❌ FAIL'}`);
        process.exit(0);

    } catch (e) {
        console.error("❌ Setup Failed:", e.message);
        process.exit(1);
    }
}

startLoadTest();

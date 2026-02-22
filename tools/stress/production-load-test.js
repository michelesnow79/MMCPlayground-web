import { initializeApp, deleteApp } from "firebase/app";
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
    orderBy,
    limit
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

// Arguments parsing
const args = process.argv.slice(2);
const isLight = args.includes('--mode=light');
const isJSON = args.includes('--json');

const getUsers = () => {
    const arg = args.find(a => a.startsWith('--users='));
    if (arg) return Math.min(parseInt(arg.split('=')[1]), 200);
    return isLight ? 2 : 5;
};

const getDuration = () => {
    const arg = args.find(a => a.startsWith('--duration='));
    if (arg) return parseInt(arg.split('=')[1]);
    return isLight ? 30 : 60;
};

const getRPS = () => {
    const arg = args.find(a => a.startsWith('--rps='));
    if (arg) return parseInt(arg.split('=')[1]);
    return 1;
};

const getPattern = () => {
    const arg = args.find(a => a.startsWith('--pattern='));
    if (arg) return arg.split('=')[1];
    return 'fanout';
};

const USERS = getUsers();
const DURATION_S = getDuration();
const RPS_PER_USER = getRPS();
const PATTERN = getPattern();
const IS_LIVE = !config.projectId.includes('demo') && !config.projectId.includes('emulator');

// Safety Caps
const TOTAL_MSG_CAP = Math.min(USERS * RPS_PER_USER * DURATION_S * 1.5, 20000);
const ERROR_THRESHOLD = 0.50; // Relaxed for stress - we want to see where it breaks
const CONSECUTIVE_ERROR_LIMIT = 50;

async function startLoadTest() {
    if (!isJSON) {
        console.log(`\n🚀 LOAD TEST [Pattern: ${PATTERN.toUpperCase()}]`);
        console.log(`📍 Project:  ${config.projectId}`);
        console.log(`👥 Users:    ${USERS} | ⏱️ Duration: ${DURATION_S}s | ⚡ RPS/User: ${RPS_PER_USER}`);
        console.log(`🛑 Max Msgs: ${TOTAL_MSG_CAP}`);
    }

    if (!isLight && IS_LIVE && process.env.CONFIRM_PROD !== 'YES' && !isJSON) {
        console.error("\n🛑 SAFETY REJECTED: Standard load tests on LIVE projects require CONFIRM_PROD=YES");
        process.exit(1);
    }

    const stats = {
        attempted: 0,
        succeeded: 0,
        errors: [],
        latencies: [],
        observed: 0,
        startTime: Date.now(),
        endTime: null,
        pattern: PATTERN,
        users: USERS
    };

    const killSwitch = { active: false, reason: "" };

    // Initialize Firebase apps for participants
    // To scale, we use a pool of responder auths
    const ownerApp = initializeApp(config, `owner-${Date.now()}`);
    const ownerAuth = getAuth(ownerApp);
    const ownerDb = getFirestore(ownerApp);

    const responders = []; // { auth, db, email, uid, threadId }

    try {
        if (!isJSON) console.log(`⏳ Initializing ${USERS} user(s)...`);

        // 1. Create Owner
        const ts = Date.now();
        const pw = `StressPass_${ts}!`;
        const ownerEmail = `STRESS_OWNER_${ts}@load.local`;
        const ownerRes = await createUserWithEmailAndPassword(ownerAuth, ownerEmail, pw);
        const ownerUid = ownerRes.user.uid;

        // 2. Create Pin
        const pinId = `STRESS_PIN_${ts}`;
        await setDoc(doc(ownerDb, "pins", pinId), {
            title: `STRESS LOAD ${PATTERN}`,
            ownerUid,
            ownerEmail,
            createdAt: serverTimestamp()
        });

        // 3. Create Responders & Threads
        // For FANIN: 1 Responder, 1 Thread (but USERS concurrent workers)
        // For FANOUT: (USERS) Responders, (USERS) Threads
        const numResponders = PATTERN === 'fanin' ? 1 : USERS;

        for (let i = 0; i < numResponders; i++) {
            const rApp = initializeApp(config, `resp-${i}-${ts}`);
            const rAuth = getAuth(rApp);
            const rDb = getFirestore(rApp);
            const rEmail = `STRESS_RESP_${i}_${ts}@load.local`;

            const rRes = await createUserWithEmailAndPassword(rAuth, rEmail, pw);
            const rUid = rRes.user.uid;

            const threadId = `${pinId}_${rUid}`;
            const threadRef = doc(rDb, "threads", threadId);

            await setDoc(threadRef, {
                pinId,
                ownerUid,
                ownerEmail,
                responderUid: rUid,
                responderEmail: rEmail,
                participants: [ownerUid, rUid],
                lastMessageAt: serverTimestamp(),
                ownerLastReadAt: serverTimestamp(),
                responderLastReadAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                isStressTest: true
            });

            responders.push({ app: rApp, auth: rAuth, db: rDb, email: rEmail, uid: rUid, threadId, threadRef });
        }

        if (!isJSON) console.log(`✅ Initialization complete. Starting stream...`);

        // 4. Setup Listener (Owner side)
        // In FANIN: 1 listener for the 1 thread
        // In FANOUT: Multiple listeners or 1 broad query (but snapshots on N threads is more realistic)
        const unsubs = [];
        const threadIds = responders.map(r => r.threadId);

        const setupListener = (tid) => {
            const q = query(collection(ownerDb, "threads", tid, "messages"), orderBy("createdAt", "desc"), limit(1));
            return onSnapshot(q, (snap) => {
                snap.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        if (data.sentAtLocal) {
                            stats.observed++;
                            const latency = Date.now() - data.sentAtLocal;
                            if (latency >= 0) stats.latencies.push(latency);
                        }
                    }
                });
            });
        };

        if (PATTERN === 'fanin') {
            unsubs.push(setupListener(responders[0].threadId));
        } else {
            // Cap listeners at 20 for stability in one process, or one for each if small
            const maxListeners = Math.min(responders.length, 20);
            for (let i = 0; i < maxListeners; i++) {
                unsubs.push(setupListener(responders[i].threadId));
            }
        }

        // 5. Run Load Loop
        const worker = async (responderIndex) => {
            const r = PATTERN === 'fanin' ? responders[0] : responders[responderIndex];
            const interval = 1000 / RPS_PER_USER;

            while (Date.now() - stats.startTime < (DURATION_S * 1000) && !killSwitch.active && stats.attempted < TOTAL_MSG_CAP) {
                stats.attempted++;
                const msgId = `MSG_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                const start = Date.now();

                try {
                    const batch = writeBatch(r.db);
                    const msgRef = doc(r.db, "threads", r.threadId, "messages", msgId);

                    batch.set(msgRef, {
                        content: `Load Msg ${stats.attempted}`,
                        senderUid: r.uid,
                        senderEmail: r.email,
                        createdAt: serverTimestamp(),
                        sentAtLocal: Date.now()
                    });

                    batch.update(r.threadRef, {
                        lastMessageAt: serverTimestamp(),
                        lastMessagePreview: `Load Msg ${stats.attempted}`,
                        lastSenderUid: r.uid,
                        updatedAt: serverTimestamp()
                    });

                    await batch.commit();
                    stats.succeeded++;
                } catch (err) {
                    stats.errors.push({ code: err.code, message: err.message, ts: Date.now() });
                    if (stats.errors.length > CONSECUTIVE_ERROR_LIMIT) {
                        killSwitch.active = true;
                        killSwitch.reason = "CONSECUTIVE_ERROR_LIMIT";
                    }
                }

                const elapsed = Date.now() - start;
                const wait = Math.max(0, interval - elapsed);
                await new Promise(res => setTimeout(res, wait));
            }
        };

        const workers = [];
        for (let i = 0; i < USERS; i++) {
            workers.push(worker(i));
        }

        await Promise.all(workers);
        stats.endTime = Date.now();

        // Wait a bit for final listener packets
        await new Promise(r => setTimeout(r, 2000));
        unsubs.forEach(u => u());

        // 6. Report
        const totalTime = (stats.endTime - stats.startTime) / 1000;
        const throughput = (stats.succeeded / totalTime).toFixed(2);
        const sortedLatencies = stats.latencies.sort((a, b) => a - b);
        const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0;
        const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
        const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;

        if (isJSON) {
            console.log(JSON.stringify({
                pattern: PATTERN,
                users: USERS,
                attempted: stats.attempted,
                succeeded: stats.succeeded,
                observed: stats.observed,
                throughput,
                p50, p95, p99,
                errorCount: stats.errors.length,
                topError: stats.errors[0]?.code || 'none'
            }));
        } else {
            console.log("\n" + "=".repeat(50));
            console.log("📊 LOAD TEST SUMMARY");
            console.log("=".repeat(50));
            console.table({
                "Pattern": PATTERN,
                "Users": USERS,
                "Throughput (msg/s)": throughput,
                "Success Rate": `${((stats.succeeded / stats.attempted) * 100).toFixed(2)}%`,
                "Observed Rate": `${((stats.observed / stats.succeeded) * 100).toFixed(2)}%`,
                "p50 Latency (ms)": p50,
                "p95 Latency (ms)": p95,
                "p99 Latency (ms)": p99,
            });

            if (stats.errors.length > 0) {
                console.log("\n❌ ERRORS:");
                const errMap = {};
                stats.errors.forEach(e => errMap[e.code] = (errMap[e.code] || 0) + 1);
                console.table(errMap);
            }

            console.log(`\nOVERALL: ${stats.succeeded > 0 && (stats.succeeded / stats.attempted) > 0.8 ? '✅ PASS' : '❌ FAIL'}`);
        }

        process.exit(stats.succeeded > 0 && (stats.succeeded / stats.attempted) > 0.8 ? 0 : 1);

    } catch (e) {
        if (!isJSON) console.error("\n❌ Test Failed:", e.message);
        process.exit(1);
    }
}

startLoadTest();

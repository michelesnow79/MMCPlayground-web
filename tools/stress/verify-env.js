import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import path from 'path';

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

async function verify() {
    console.log("ENVIRONMENT VERIFICATION START");

    // User 1 (Owner)
    const app1 = initializeApp(config, "owner-app");
    const auth1 = getAuth(app1);
    const db1 = getFirestore(app1);

    // User 2 (Responder)
    const app2 = initializeApp(config, "responder-app");
    const auth2 = getAuth(app2);
    const db2 = getFirestore(app2);

    try {
        console.log("Creating Test Users...");
        const ownerEmail = `owner_${Date.now()}@test.com`;
        const respEmail = `resp_${Date.now()}@test.com`;

        const ownerRes = await createUserWithEmailAndPassword(auth1, ownerEmail, "password123");
        const respRes = await createUserWithEmailAndPassword(auth2, respEmail, "password123");

        const ownerUid = ownerRes.user.uid;
        const respUid = respRes.user.uid;
        console.log("Owner UID:", ownerUid);
        console.log("Responder UID:", respUid);

        const pinId = "STRESS_PIN_" + Date.now();
        const message = `ENVIRONMENT_CHECK_${Date.now()}`;

        // 1. Create Pin (Owner)
        console.log("Creating Pin...");
        await setDoc(doc(db1, "pins", pinId), {
            title: "ENV CHECK PIN",
            ownerUid: ownerUid
        });

        // 2. Create Thread (Responder)
        const threadId = `${pinId}_${respUid}`;
        const threadRef = doc(db2, "threads", threadId);

        console.log("Writing to:", threadRef.path);
        await setDoc(threadRef, {
            pinId,
            ownerUid,
            responderUid: respUid,
            participants: [ownerUid, respUid],
            lastMessageAt: new Date(),
            ownerLastReadAt: new Date(),
            responderLastReadAt: new Date(),
            checkMessage: message
        });

        console.log("Write Successful.");

        const snap = await getDoc(threadRef);
        console.log("Read back message:", snap.data().checkMessage);
        console.log("PASS: Environment is LIVE mmcplayground");
    } catch (e) {
        console.error("Verification Error:", e.code || e.message, e.message);
    }
    process.exit(0);
}

verify();

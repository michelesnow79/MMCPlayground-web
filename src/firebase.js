import { initializeApp } from "firebase/app";
import {
    initializeAuth,
    indexedDBLocalPersistence,
    browserLocalPersistence,
    getAuth,
    onAuthStateChanged
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);

// 🔐 AUTH: Stable initialization with persistence fallback
// This directly addresses the auth/network-request-failed issue in restricted Chrome profiles
let auth;
try {
    auth = initializeAuth(app, {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence]
    });
} catch (error) {
    if (import.meta.env.DEV) console.warn("🔐 Auth: initializeAuth failed (likely IndexedDB restricted). Falling back to getAuth().");
    auth = getAuth(app);
}

if (import.meta.env.DEV) {
    console.log(`🚀 MMC INITIALIZED [ENV: ${import.meta.env.MODE}]`);
}

const db = getFirestore(app);

let analytics;
if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
    try {
        analytics = getAnalytics(app);
    } catch (e) {
        if (import.meta.env.DEV) console.warn("📊 Analytics: Storage unavailable.", e.message);
    }
}

// PERSISTENCE: Enable multi-tab offline support for Firestore (Soft-fail)
import('firebase/firestore').then(({ enableMultiTabIndexedDbPersistence }) => {
    if (db) {
        enableMultiTabIndexedDbPersistence(db).catch((err) => {
            if (err.code === 'failed-precondition') {
                console.warn("Firestore Persistence failed: Multiple tabs open.");
            } else {
                console.warn("Firestore Persistence failed:", err.code);
            }
        });
    }
});

export { auth, db, analytics };
export default app;

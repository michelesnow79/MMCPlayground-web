import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
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

// Resilient initialization
let app;
let auth;
let db;
let analytics;

try {
    if (firebaseConfig.apiKey && firebaseConfig.apiKey !== 'undefined') {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);

        if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
            analytics = getAnalytics(app);
        }
    } else {
        console.warn("Firebase API Key is missing. App is running in offline mode.");
    }
} catch (error) {
    console.error("Firebase failed to initialize:", error);
}

export { auth, db, analytics };
export default app;

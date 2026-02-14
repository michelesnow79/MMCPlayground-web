import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
    apiKey: "AIzaSyAdNn-aIzTuIswX--ZCD3Jp4myD7xXV_JQ",
    authDomain: "mmcplayground.firebaseapp.com",
    projectId: "mmcplayground",
    storageBucket: "mmcplayground.firebasestorage.app",
    messagingSenderId: "596668539508",
    appId: "1:596668539508:web:55e222470eac8c73646721",
    measurementId: "G-5PEVKRX27N"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = getAnalytics(app);

export default app;

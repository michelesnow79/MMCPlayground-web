import React, { createContext, useContext, useState, useEffect } from 'react';
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut
} from 'firebase/auth';
import {
    collection,
    addDoc,
    onSnapshot,
    query,
    deleteDoc,
    doc,
    setDoc,
    updateDoc,
    getDoc,
    orderBy,
    serverTimestamp
} from 'firebase/firestore';
import { auth, db } from '../firebase';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [loading, setLoading] = useState(true);
    const [pins, setPins] = useState([]);
    const [replies, setReplies] = useState([]);
    const [ratings, setRatings] = useState({});
    const [hiddenPins, setHiddenPins] = useState(() => {
        const savedHidden = localStorage.getItem('mmc_hiddenPins');
        return savedHidden ? JSON.parse(savedHidden) : [];
    });
    const [dateFormat, setDateFormat] = useState('mm/dd/yyyy');
    const [mapMode, setMapMode] = useState('dark');

    // 1. Auth Listener
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                // Fetch additional user data from Firestore if exists
                const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
                const userData = userDoc.exists() ? userDoc.data() : {};

                setUser({
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    name: userData.name || firebaseUser.email.split('@')[0].toUpperCase(),
                    isAdmin: userData.isAdmin || firebaseUser.email === 'MissMe@missmeconnection.com', // Admin fallback
                    ...userData
                });
                setIsLoggedIn(true);
            } else {
                setUser(null);
                setIsLoggedIn(false);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // 2. Pins Real-time Listener
    useEffect(() => {
        const q = query(collection(db, 'pins'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const pinsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                // Format Firestore timestamp to a readable string or Date
                date: doc.data().createdAt?.toDate()?.toISOString() || doc.data().date
            }));
            setPins(pinsData);
        });
        return () => unsubscribe();
    }, []);

    // 3. Replies Real-time Listener
    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'replies'), (snapshot) => {
            const repliesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setReplies(repliesData);
        });
        return () => unsubscribe();
    }, []);

    // 4. Ratings Global Listener (for average calculation)
    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'ratings'), (snapshot) => {
            const ratingsMap = {};
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (!ratingsMap[data.pinId]) ratingsMap[data.pinId] = [];
                ratingsMap[data.pinId].push(data.rating);
            });
            setRatings(ratingsMap);
        });
        return () => unsubscribe();
    }, []);

    // Actions
    const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
    const signup = async (email, password, name) => {
        const res = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', res.user.uid), {
            name,
            email,
            createdAt: serverTimestamp(),
            isAdmin: email === 'MissMe@missmeconnection.com' // Set first admin
        });
    };
    const logout = () => signOut(auth);

    const addPin = async (newPin) => {
        if (!user) return;
        await addDoc(collection(db, 'pins'), {
            ...newPin,
            ownerEmail: user.email,
            ownerUid: user.uid,
            createdAt: serverTimestamp()
        });
    };

    const removePin = async (pinId) => {
        await deleteDoc(doc(db, 'pins', pinId));
    };

    const ratePin = async (pinId, rating) => {
        if (!user) return;
        // Use a unique ID for user+pin combination to prevent multi-rating
        const ratingId = `${user.uid}_${pinId}`;
        await setDoc(doc(db, 'ratings', ratingId), {
            pinId,
            userId: user.uid,
            rating,
            updatedAt: serverTimestamp()
        });
    };

    const getAverageRating = (pinId) => {
        const pinRatings = ratings[pinId] || [];
        if (pinRatings.length === 0) return "0.0";
        const sum = pinRatings.reduce((a, b) => a + b, 0);
        return (sum / pinRatings.length).toFixed(1);
    };

    const addReply = async (pinId, content) => {
        if (!user) return;
        await addDoc(collection(db, 'replies'), {
            pinId,
            content,
            senderEmail: user.email,
            senderUid: user.uid,
            createdAt: serverTimestamp()
        });
    };

    const hidePin = (pinId) => {
        setHiddenPins(prev => {
            const updated = prev.includes(pinId) ? prev : [...prev, pinId];
            localStorage.setItem('mmc_hiddenPins', JSON.stringify(updated));
            return updated;
        });
    };

    const unhidePin = (pinId) => {
        setHiddenPins(prev => {
            const updated = prev.filter(id => id !== pinId);
            localStorage.setItem('mmc_hiddenPins', JSON.stringify(updated));
            return updated;
        });
    };

    const clearHiddenPins = () => {
        setHiddenPins([]);
        localStorage.removeItem('mmc_hiddenPins');
    };

    const formatDate = (dateInput) => {
        if (!dateInput) return '';
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return dateInput;

        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();

        if (dateFormat === 'dd/mm/yyyy') return `${dd}/${mm}/${yyyy}`;
        if (dateFormat === 'yyyy/mm/dd') return `${yyyy}/${mm}/${dd}`;
        return `${mm}/${dd}/${yyyy}`;
    };

    return (
        <AppContext.Provider value={{
            user, pins, isLoggedIn, loading, signup, login, logout,
            addPin, removePin, ratePin, getAverageRating, addReply,
            hiddenPins, hidePin, unhidePin, clearHiddenPins,
            formatDate, dateFormat, setDateFormat, mapMode, setMapMode,
            replies, ratings
        }}>
            {children}
        </AppContext.Provider>
    );
};

export const useApp = () => useContext(AppContext);

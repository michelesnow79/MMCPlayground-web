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
    where,
    serverTimestamp
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { logPinDebug } from '../utils/logger';
import { getStateAndCountryFromZip } from '../utils/locationHelper';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [loading, setLoading] = useState(true);
    const [pins, setPins] = useState([]);
    const [threads, setThreads] = useState([]);
    const [activeThreadMessages, setActiveThreadMessages] = useState({}); // { threadId: [messages] }
    const [notifications, setNotifications] = useState([]);
    const [ratings, setRatings] = useState({});
    const [hiddenPins, setHiddenPins] = useState(() => {
        const savedHidden = localStorage.getItem('mmc_hiddenPins');
        return savedHidden ? JSON.parse(savedHidden) : [];
    });
    const [dateFormat, setDateFormat] = useState('mm/dd/yyyy');
    const [mapMode, setMapMode] = useState('dark');
    const [distanceUnit, setDistanceUnit] = useState('miles');
    const [hasNewNotifications, setHasNewNotifications] = useState(false);
    const [visiblePinIds, setVisiblePinIds] = useState(null);
    const [activeFilters, setActiveFilters] = useState({
        location: '',
        radius: 10,
        unit: 'miles', // initial default
        type: '',
        date: null,
        keyword: ''
    });

    useEffect(() => {
        setActiveFilters(prev => ({ ...prev, unit: distanceUnit }));
    }, [distanceUnit]);



    // 1. Auth Listener
    useEffect(() => {
        if (!auth) {
            setLoading(false);
            return;
        }
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            try {
                if (firebaseUser) {
                    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
                    const userData = userDoc.exists() ? userDoc.data() : {};

                    setUser({
                        uid: firebaseUser.uid,
                        email: firebaseUser.email,
                        name: userData.name || firebaseUser.email.split('@')[0].toUpperCase(),
                        isAdmin: userData.isAdmin || firebaseUser.email === 'MissMe@missmeconnection.com',
                        ...userData
                    });
                    setIsLoggedIn(true);
                } else {
                    setUser(null);
                    setIsLoggedIn(false);
                }
            } catch (err) {
                console.error("Auth sync error:", err);
            } finally {
                setLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    // Helper: Refresh user data when needed
    const refreshUserData = async () => {
        if (!auth?.currentUser) return;
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
            setUser(prev => ({ ...prev, ...userDoc.data() }));
        }
    };

    // 2. Pins Real-time Listener
    useEffect(() => {
        if (!db) return;
        try {
            const q = query(collection(db, 'pins'), orderBy('createdAt', 'desc'));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const pinsData = snapshot.docs.map(docSnap => {
                    const data = docSnap.data();
                    const pinId = docSnap.id;

                    const ownerEmail = (data.ownerEmail || '').toLowerCase();
                    const currentUserEmail = (user?.email || '').toLowerCase();

                    // TRIPLE-CHECK OWNER SYNC: If email matches, the current UID MUST be the owner
                    if (user && ownerEmail === currentUserEmail && data.ownerUid !== user.uid) {
                        console.log(`📡 OWNER SYNC: Matching ${currentUserEmail} to Pin ${pinId}`);
                        const pinRef = doc(db, 'pins', pinId);
                        updateDoc(pinRef, { ownerUid: user.uid }).catch(e => console.error("Pin update error:", e));

                        // Force update any existing threads so this account can see them
                        const threadQuery = query(collection(db, 'threads'), where('pinId', '==', pinId));
                        onSnapshot(threadQuery, (snapshot) => {
                            snapshot.docs.forEach(tDoc => {
                                const tData = tDoc.data();
                                // If I'm the owner by email but not in participants, fix it!
                                if (!tData.participants.includes(user.uid)) {
                                    console.log(`🧵 UPDATING THREAD PARTICIAPNTS: Adding ${user.uid} to ${tDoc.id}`);
                                    updateDoc(doc(db, 'threads', tDoc.id), {
                                        ownerUid: user.uid,
                                        participants: [user.uid, tData.responderUid]
                                    }).catch(e => console.error("Thread Sync error:", e));
                                }
                            });
                        });
                    }

                    return {
                        ...data,
                        id: pinId
                    };
                });
                setPins(pinsData);
            });
            return () => unsubscribe();
        } catch (err) {
            console.error("Pins listener error:", err);
        }
    }, []);

    // 3. Threads Private Listener (Email-style)
    useEffect(() => {
        if (!user || !db) {
            setThreads([]);
            return;
        }

        try {
            const q = query(
                collection(db, 'threads'),
                where('participants', 'array-contains', user.uid),
                orderBy('lastMessageAt', 'desc')
            );

            console.log(`📡 THREADS LISTENER: Starting query for User [${user.uid}]...`);

            const unsubscribe = onSnapshot(q, {
                next: (snapshot) => {
                    const threadsData = snapshot.docs.map(doc => ({
                        ...doc.data(),
                        id: doc.id
                    }));
                    console.log(`📥 INBOX QUERY RESULTS for User [${user.uid} / ${user.email}]:`, threadsData.map(t => ({
                        id: t.id,
                        participants: t.participants,
                        lastMessageAt: t.lastMessageAt?.toDate ? t.lastMessageAt.toDate().toISOString() : t.lastMessageAt,
                        lastSender: t.lastSenderUid,
                        ownerEmail: t.ownerEmail || 'missing'
                    })));
                    setThreads(threadsData);
                },
                error: (err) => {
                    console.error("❌ Threads listener error (Likely missing index or permissions):", err);
                }
            });
            return () => unsubscribe();
        } catch (err) {
            console.error("❌ Threads listener setup error:", err);
        }
    }, [user]);

    // Helper to subscribe to messages for a specific thread
    const subscribeToThread = (threadId, callback) => {
        if (!db || !threadId) return () => { };
        const q = query(
            collection(db, 'threads', threadId, 'messages'),
            orderBy('createdAt', 'asc')
        );
        return onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            callback(msgs);
        });
    };

    // 3.5 Notifications Listener
    useEffect(() => {
        if (!user || !db) return;
        try {
            // Removed orderBy('createdAt', 'desc') to avoid missing index errors in dev. 
            // We'll sort in-memory below.
            const q = query(collection(db, 'notifications'), where('targetUid', '==', user.uid));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const notifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                // In-memory sort
                notifs.sort((a, b) => {
                    const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : (a.createdAt || 0);
                    const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : (b.createdAt || 0);
                    return dateB - dateA;
                });
                setNotifications(notifs);
            });
            return () => unsubscribe();
        } catch (err) {
            console.error("Notif listener error:", err);
        }
    }, [user]);

    // 4. Ratings Global Listener
    useEffect(() => {
        if (!db) return;
        const unsubscribe = onSnapshot(collection(db, 'ratings'), (snapshot) => {
            const ratingsMap = {};
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (!ratingsMap[data.pinId]) ratingsMap[data.pinId] = [];
                ratingsMap[data.pinId].push({
                    userId: data.userId,
                    rating: data.rating
                });
            });
            setRatings(ratingsMap);
        });
        return () => unsubscribe();
    }, []);

    // 5. Notification Logic (based on threads)
    useEffect(() => {
        if (!user) {
            setHasNewNotifications(false);
            return;
        }

        // Check threads for unread activity (last message not from me)
        const unreadThreadCount = threads.filter(t => {
            // This is a simplified check. In a real app we'd have a 'lastReadAt' per participant.
            // For now, if the thread updated and I wasn't the last sender (and I'm a participant), it's "new"
            // Wait, threads might not have 'lastSenderUid'. Let's assume we'll add it in addReply.
            return t.lastSenderUid && t.lastSenderUid !== user.uid && t.lastMessageAt;
        }).length;

        const lastSeenNotified = parseInt(localStorage.getItem(`mmc_last_notified_threads_${user.uid}`) || '0');

        if (unreadThreadCount > 0) {
            setHasNewNotifications(true);
        } else {
            setHasNewNotifications(false);
        }
    }, [threads, user]);

    const markNotificationsAsRead = () => {
        if (!user) return;
        // In this architecture, we could update a 'lastReadAt' in the thread.
        // For now, we'll just clear the indicator locally if the user is on the messages page.
        setHasNewNotifications(false);
    };

    // Actions
    const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
    const signup = async (email, password, name, postalCode) => {
        const res = await createUserWithEmailAndPassword(auth, email, password);

        // Smarts: Geocode state/country from zip
        const locInfo = await getStateAndCountryFromZip(postalCode);
        const state = locInfo?.state || '';
        const country = locInfo?.country || '';

        await setDoc(doc(db, 'users', res.user.uid), {
            name,
            email,
            postalCode: postalCode || '',
            state,
            country,
            createdAt: serverTimestamp(),
            isAdmin: email === 'MissMe@missmeconnection.com' // Set first admin
        });
    };
    const logout = () => signOut(auth);

    const updateUserProfile = async (uid, data) => {
        const userRef = doc(db, 'users', uid);

        let extraData = {};
        if (data.postalCode) {
            const locInfo = await getStateAndCountryFromZip(data.postalCode);
            if (locInfo) {
                extraData = { state: locInfo.state, country: locInfo.country };
            }
        }

        await updateDoc(userRef, { ...data, ...extraData });
        await refreshUserData();
    };

    const addPin = async (newPin) => {
        if (!newPin) return;

        const pinData = {
            ...newPin,
            ownerEmail: user?.email || newPin.ownerEmail || 'admin@missmeconnection.com',
            ownerUid: user?.uid || 'seeder-bot',
            createdAt: serverTimestamp()
        };

        logPinDebug("FIRESTORE WRITE pinData.date:", pinData.date);
        logPinDebug("FIRESTORE WRITE createdAt:", pinData.createdAt);

        if (newPin.id) {
            // If ID is provided, use setDoc to ensure we don't duplicate or to use a specific ID
            await setDoc(doc(db, 'pins', String(newPin.id)), pinData);
        } else {
            // Otherwise use addDoc for auto-generated ID
            await addDoc(collection(db, 'pins'), pinData);
        }
    };

    const removePin = async (pinId) => {
        if (!pinId) {
            console.error("❌ removePin called without an ID");
            return;
        }

        const stringId = String(pinId);
        console.log("🗑️ FIREBASE DELETE INITIATED: Targeting ID:", stringId);

        try {
            const docRef = doc(db, 'pins', stringId);
            await deleteDoc(docRef);
            console.log("✅ FIREBASE DELETE SUCCESS for ID:", stringId);
        } catch (err) {
            console.error("❌ FIREBASE DELETE FAILED for ID:", stringId, err);
            alert("Delete failed in database. Status: " + err.message);
        }
    };

    const reportPin = async (pinId, reason) => {
        if (!user) return;
        await addDoc(collection(db, 'reports'), {
            pinId,
            reporterUid: user.uid,
            reporterEmail: user.email,
            reason,
            status: 'pending',
            createdAt: serverTimestamp()
        });
        // Optionally mark the pin as reported locally or in the pin doc
        const pinRef = doc(db, 'pins', pinId);
        await updateDoc(pinRef, { isReported: true });
    };

    const updatePin = async (pinId, updatedData) => {
        if (!user) return;
        const pinRef = doc(db, 'pins', pinId);
        await updateDoc(pinRef, {
            ...updatedData,
            updatedAt: serverTimestamp()
        });
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
        const sum = pinRatings.reduce((a, b) => a + (b.rating || 0), 0);
        return (sum / pinRatings.length).toFixed(1);
    };

    const isSuspended = () => {
        if (!user) return false;
        if (!user.isSuspended) return false;
        if (!user.suspendedUntil) return false;
        const now = new Date();
        const until = user.suspendedUntil.toDate ? user.suspendedUntil.toDate() : new Date(user.suspendedUntil);
        return now < until;
    };

    const hasProbation = () => {
        if (!user) return false;
        if (!user.reviewStatus) return false;
        if (!user.reviewExpiresAt) return false;
        const now = new Date();
        const until = user.reviewExpiresAt.toDate ? user.reviewExpiresAt.toDate() : new Date(user.reviewExpiresAt);
        return now < until;
    };

    const canStartNewThread = async (pinId) => {
        if (!user) return false;
        if (!isSuspended()) return true;
        // If suspended, check if there's already a thread for this pin where I am the responder
        const threadId = `${pinId}_${user.uid}`;
        const threadDoc = await getDoc(doc(db, 'threads', threadId));
        return threadDoc.exists();
    };

    const addNotification = async (targetUid, message, type = 'moderation') => {
        await addDoc(collection(db, 'notifications'), {
            targetUid,
            message,
            type,
            read: false,
            createdAt: serverTimestamp()
        });
    };

    // responderUid: Optional. If sending as owner, specify who you are replying to. 
    // If sending as participant, omit (defaults to current user).
    const addReply = async (pinId, content, responderUid = null) => {
        if (!user) {
            console.error("❌ addReply Failed: User not logged in.");
            return;
        }

        const pin = pins.find(p => String(p.id) === String(pinId));
        if (!pin) {
            console.error(`❌ addReply Failed: Pin ${pinId} not found in state.`);
            return;
        }

        // --- RESOLVE OWNER UID ---
        // If the pin missing ownerUid, but current user's email matches, we can't reply until synced.
        let resolvedOwnerUid = pin.ownerUid;
        if (!resolvedOwnerUid) {
            if (user.email.toLowerCase() === (pin.ownerEmail || '').toLowerCase()) {
                resolvedOwnerUid = user.uid;
                console.log("⚠️ addReply: resolvedOwnerUid missing on pin, using current user as owner (match by email).");
            } else {
                console.error("❌ addReply Aborted: Pin has no ownerUid and user is not owner.");
                return;
            }
        }

        // --- RESOLVE RESPONDER UID ---
        // responderUid is the UID of the OTHER person (the one who isn't the owner).
        let targetResponderUid = responderUid;
        if (user.uid !== resolvedOwnerUid) {
            // I am the participant (not the owner)
            targetResponderUid = user.uid;
        }

        if (!targetResponderUid) {
            console.error("❌ addReply Aborted: No responder identified (Owner cannot start a thread with themselves).");
            return;
        }

        const participants = [resolvedOwnerUid, targetResponderUid];

        // Final integrity check
        if (participants.includes(undefined) || participants.includes(null)) {
            console.error("❌ addReply Integrity Error: Participants array contains invalid values:", participants);
            return;
        }

        const threadId = `${pinId}_${targetResponderUid}`;
        const threadRef = doc(db, 'threads', threadId);

        const threadData = {
            pinId,
            ownerUid: resolvedOwnerUid,
            ownerEmail: pin.ownerEmail || '',
            responderUid: targetResponderUid,
            participants: participants,
            lastMessageAt: serverTimestamp(),
            lastMessagePreview: content.substring(0, 80),
            lastSenderUid: user.uid,
            updatedAt: serverTimestamp()
        };

        console.log(`📤 WRITING THREAD [${threadId}]:`, threadData);

        try {
            await setDoc(threadRef, threadData, { merge: true });
            const msgRef = await addDoc(collection(db, 'threads', threadId, 'messages'), {
                content,
                senderUid: user.uid,
                senderEmail: user.email,
                createdAt: serverTimestamp()
            });
            console.log(`✅ SUCCESS: Message ${msgRef.id} written to thread ${threadId}`);
        } catch (err) {
            console.error("❌ Firestore Write Error in addReply:", err);
        }
    };

    const updateReply = async (threadId, messageId, content) => {
        if (!user) return;
        const msgRef = doc(db, 'threads', threadId, 'messages', messageId);
        await updateDoc(msgRef, {
            content,
            updatedAt: serverTimestamp()
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

    const formatRelativeTime = (timestamp) => {
        if (!timestamp) return 'JUST NOW';

        let date;
        if (timestamp.toDate) {
            date = timestamp.toDate();
        } else if (timestamp.seconds !== undefined) {
            date = new Date(timestamp.seconds * 1000);
        } else {
            date = new Date(timestamp);
        }

        if (!date || isNaN(date.getTime())) return 'JUST NOW';

        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 60) return 'JUST NOW';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}M AGO`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}H AGO`;

        // Return relative day if within a few days
        const days = Math.floor(diffInSeconds / 86400);
        if (days < 5) return `${days}D AGO`;

        return formatDate(date);
    };

    const formatDate = (dateInput) => {
        if (!dateInput) return '';

        // CHITTY'S FIX: Strict YYYY-MM-DD Handling
        // If it contains "T" or "Z", it's likely a timestamp/ISO string that has been corrupted with time info.
        // We do NOT want to parse that as an encounter date.
        if (typeof dateInput === 'string') {
            if (dateInput.includes('T') || dateInput.includes('Z')) {
                // Try to rescue only the date part if it starts with YYYY-MM-DD
                if (/^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
                    const cleanPart = dateInput.split('T')[0];
                    const [y, m, d] = cleanPart.split('-').map(v => parseInt(v, 10));
                    const mm = String(m).padStart(2, "0");
                    const dd = String(d).padStart(2, "0");
                    if (dateFormat === 'dd/mm/yyyy') return `${dd}/${mm}/${y}`;
                    if (dateFormat === 'yyyy/mm/dd') return `${y}/${mm}/${dd}`;
                    return `${mm}/${dd}/${y}`;
                }
                return ''; // Reject bad date
            }

            if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
                const [y, m, d] = dateInput.split('-').map(v => parseInt(v, 10));
                if (y && m && d) {
                    const mm = String(m).padStart(2, "0");
                    const dd = String(d).padStart(2, "0");

                    if (dateFormat === 'dd/mm/yyyy') return `${dd}/${mm}/${y}`;
                    if (dateFormat === 'yyyy/mm/dd') return `${y}/${mm}/${dd}`;
                    return `${mm}/${dd}/${y}`;
                }
            }
        }

        let date;
        // 1. Handle Firestore Timestamps (Instance or plain object)
        if (dateInput.toDate) {
            date = dateInput.toDate();
        } else if (dateInput.seconds !== undefined) {
            date = new Date(dateInput.seconds * 1000);
        }
        // 2. Handle ISO strings (T)
        else if (typeof dateInput === 'string' && dateInput.includes('T')) {
            const [year, month, day] = dateInput.split('T')[0].split('-');
            date = new Date(year, month - 1, day); // Use local constructor
        } else {
            date = new Date(dateInput);
        }

        if (!date || isNaN(date.getTime())) {
            // If it's the Firestore serverTimestamp placeholder (no seconds yet)
            if (typeof dateInput === 'object') return 'RECENT';
            return String(dateInput);
        }

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
            addPin, removePin, updatePin, updateUserProfile, ratePin, getAverageRating, addReply, updateReply,
            hiddenPins, hidePin, unhidePin, clearHiddenPins,
            formatDate, formatRelativeTime, dateFormat, setDateFormat, mapMode, setMapMode,
            distanceUnit, setDistanceUnit,
            threads, ratings, notifications,
            hasNewNotifications, markNotificationsAsRead,
            reportPin, isSuspended, hasProbation, canStartNewThread, addNotification, refreshUserData,
            visiblePinIds, setVisiblePinIds,
            activeFilters, setActiveFilters,
            subscribeToThread
        }}>
            {children}
        </AppContext.Provider>
    );
};

export const useApp = () => useContext(AppContext);

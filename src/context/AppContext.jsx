import React, { createContext, useContext, useState, useEffect } from 'react';
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail
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
    writeBatch,
    orderBy,
    where,
    serverTimestamp,
    arrayUnion,
    or
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { logPinDebug } from '../utils/logger';
import { getStateAndCountryFromZip } from '../utils/locationHelper';
import telemetry from '../utils/telemetry';
import { initPushNotifications, clearPushToken } from '../utils/pushNotifications';

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
            if (import.meta.env.DEV) {
                console.log(`🔐 AUTH_STATE_CHANGE: [User: ${firebaseUser ? "LOGGED_IN" : "LOGGED_OUT"}]`);
            }
            if (firebaseUser) {
                // EDIT D: Set logged-in state IMMEDIATELY from Firebase Auth —
                // do NOT wait for Firestore. A Firestore failure must never log the user out.
                setUser({
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    name: firebaseUser.email.split('@')[0].toUpperCase(),
                    isAdmin: firebaseUser.email === 'MissMe@missmeconnection.com',
                });
                setIsLoggedIn(true);
                setLoading(false);

                // Hydrate from Firestore in the background — failure here cannot flip isLoggedIn
                try {
                    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
                    const userData = userDoc.exists() ? userDoc.data() : {};
                    const { uid: _uid, email: _email, ...safeUserData } = userData;
                    setUser({
                        ...safeUserData,
                        uid: firebaseUser.uid,
                        email: firebaseUser.email,
                        name: safeUserData.name || firebaseUser.email.split('@')[0].toUpperCase(),
                        isAdmin: safeUserData.isAdmin || firebaseUser.email === 'MissMe@missmeconnection.com',
                    });
                } catch (firestoreErr) {
                    console.error("Firestore user hydration failed (auth state unchanged):", firestoreErr);
                    // Do NOT setIsLoggedIn(false) — user IS authenticated via Firebase Auth
                }

                // 🔔 Register device for push notifications
                initPushNotifications(firebaseUser.uid);
            } else {
                setUser(null);
                setIsLoggedIn(false);
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
            if (import.meta.env.DEV) console.log("📡 SUBSCRIPTION: [Pins Listener]");
            telemetry.startTimer('pins_load');
            const q = query(collection(db, 'pins'), orderBy('createdAt', 'desc'));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const pinsData = snapshot.docs.map(docSnap => {
                    const data = docSnap.data();
                    const pinId = docSnap.id;
                    return { ...data, id: pinId };
                });

                // Filter out pins from blocked users
                const blockedUids = Array.isArray(user?.blockedUids) ? user.blockedUids : [];
                const filteredByBlocks = pinsData.filter(p => !blockedUids.includes(p.ownerUid));

                setPins(filteredByBlocks);
                telemetry.endTimer('pins_load', { count: filteredByBlocks.length });
                telemetry.trackEvent('pins_load_success', { count: filteredByBlocks.length });
            }, (err) => {
                telemetry.trackError(err, { source: 'Pins Listener' });
                telemetry.trackEvent('pins_load_fail', { error: err.code });
            });
            return () => {
                if (import.meta.env.DEV) console.log("📡 UNSUBSCRIBE: [Pins Listener]");
                unsubscribe();
            };
        } catch (err) {
            telemetry.trackError(err, { source: 'Pins Listener Setup' });
        }
    }, [user, user?.blockedUids]);

    // 3. Threads Private Listener (Email-style)
    useEffect(() => {
        if (!user || !db) {
            setThreads([]);
            return;
        }

        try {
            if (import.meta.env.DEV) {
                console.log(`📡 SUBSCRIPTION: [Threads Listener] for [${user.uid}]`);
                console.log("DEBUG: Auth State at Listener:", {
                    contextUid: user.uid,
                    firebaseAuthParams: auth.currentUser ? { uid: auth.currentUser.uid } : 'NULL',
                    queryParam: user.uid
                });
            }
            telemetry.startTimer('thread_list_load');
            const q = query(
                collection(db, 'threads'),
                or(
                    where('ownerUid', '==', user.uid),
                    where('responderUid', '==', user.uid)
                )
            );

            const unsubscribe = onSnapshot(q, {
                next: (snapshot) => {
                    const threadsData = snapshot.docs.map(doc => ({
                        ...doc.data(),
                        id: doc.id
                    }));

                    // In-memory sort by lastMessageAt (descending)
                    threadsData.sort((a, b) => {
                        const dateA = a.lastMessageAt?.toDate ? a.lastMessageAt.toDate() : (a.lastMessageAt || 0);
                        const dateB = b.lastMessageAt?.toDate ? b.lastMessageAt.toDate() : (b.lastMessageAt || 0);
                        return dateB - dateA;
                    });

                    setThreads(threadsData);
                    telemetry.endTimer('thread_list_load', { count: threadsData.length });
                    telemetry.trackEvent('thread_list_load_success', { count: threadsData.length });
                },
                error: (err) => {
                    console.error("❌ Threads Listener Error:", err.code, err.message, "User:", user.uid);
                    telemetry.trackError(err, { source: 'Threads Listener' });
                    telemetry.trackEvent('thread_list_load_fail', { error: err.code });
                }
            });
            return () => {
                if (import.meta.env.DEV) console.log(`📡 UNSUBSCRIBE: [Threads Listener] for [${user.uid}]`);
                unsubscribe();
            };
        } catch (err) {
            telemetry.trackError(err, { source: 'Threads Listener Setup' });
        }
    }, [user?.uid, db]);

    // Helper to subscribe to messages for a specific thread
    const subscribeToThread = (threadId, callback) => {
        if (!db || !threadId) return () => { };

        let unsub = () => { };
        let active = true;

        (async () => {
            try {
                const threadRef = doc(db, 'threads', threadId);
                const snap = await getDoc(threadRef);
                if (!active) return;

                if (!snap.exists()) {
                    console.log(`🔍 subscribeToThread: Thread ${threadId} does not exist yet. Not listening.`);
                    callback([]);
                    return;
                }

                const q = query(
                    collection(db, 'threads', threadId, 'messages'),
                    orderBy('createdAt', 'asc')
                );

                unsub = onSnapshot(
                    q,
                    (snapshot) => {
                        if (!active) return;
                        const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                        callback(msgs);
                    },
                    (err) => {
                        if (!active) return;
                        console.error("❌ Messages listener error:", err.code, err.message);
                        console.error("❌   collection path: threads/" + threadId + "/messages");
                        console.error("❌   threadId:", threadId);
                        console.error("❌   user.uid at listen time:", user?.uid ?? 'null');
                        callback([]);
                    }
                );
            } catch (err) {
                console.error("❌ Error initiating thread listener:", err);
            }
        })();

        return () => {
            active = false;
            unsub();
        };
    };

    // 3.5 Notifications Listener
    useEffect(() => {
        if (!user || !db) return;
        try {
            if (import.meta.env.DEV) console.log(`📡 SUBSCRIPTION: [Notifications Listener] for ${user.uid}`);
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
        if (import.meta.env.DEV) console.log("📡 SUBSCRIPTION: [Global Ratings Listener]");
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

    // Help: Centralized sanitize/cap helper
    const sanitizeText = (value, maxLen) => {
        if (value === null || value === undefined) return '';
        const str = String(value).trim();
        // collapsed repeated whitespace (optional, but requested as allowed)
        const collapsed = str.replace(/\s+/g, ' ');
        return collapsed.slice(0, maxLen);
    };

    const looksLikeStreetAddress = (text) => {
        if (!text) return false;
        const suffixes = 'st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|way|hwy|highway';
        // Pattern: Starts with number, contains space, ends with street suffix (case insensitive)
        const regex = new RegExp(`^\\d+[-/]*\\d*\\s+.*\\s+(?:${suffixes})$`, 'i');
        return regex.test(text.trim());
    };

    // Actions
    const login = async (email, password) => {
        telemetry.trackEvent('auth_login_attempt');
        try {
            const res = await signInWithEmailAndPassword(auth, email, password);
            telemetry.trackEvent('auth_login_success');
            return res;
        } catch (err) {
            telemetry.trackEvent('auth_login_fail', { error: err.code });
            throw err;
        }
    };

    const signup = async (email, password, name, postalCode) => {
        telemetry.trackEvent('auth_signup_attempt');
        try {
            const res = await createUserWithEmailAndPassword(auth, email, password);

            // Sanitize
            const cleanName = sanitizeText(name, 40);
            const cleanZip = sanitizeText(postalCode, 16);

            // Smarts: Geocode state/country from zip
            const locInfo = await getStateAndCountryFromZip(cleanZip);
            const state = locInfo?.state || '';
            const country = locInfo?.country || '';

            await setDoc(doc(db, 'users', res.user.uid), {
                name: cleanName,
                email,
                postalCode: cleanZip,
                state,
                country,
                createdAt: serverTimestamp(),
                isAdmin: email === 'MissMe@missmeconnection.com' // Set first admin
            });
            telemetry.trackEvent('auth_signup_success');
            return res;
        } catch (err) {
            telemetry.trackEvent('auth_signup_fail', { error: err.code });
            throw err;
        }
    };

    const logout = async () => {
        try {
            // 🔔 Clear FCM token before signing out so no pushes go to logged-out device
            if (user?.uid) await clearPushToken(user.uid);
            await signOut(auth);
            // Proactive state purge to prevent stale UI ghosting
            setUser(null);
            setIsLoggedIn(false);
            setPins([]);
            setThreads([]);
            setNotifications([]);
            setRatings({});
        } catch (err) {
            console.error("Logout error:", err);
        }
    };

    const setThreadNickname = async (threadId, nickname) => {
        if (!user || !threadId) return;
        try {
            const cleanNickname = sanitizeText(nickname, 40);

            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
                [`nicknames.${threadId}`]: cleanNickname
            });
            // Local state reset for immediate feedback
            setUser(prev => ({
                ...prev,
                nicknames: {
                    ...(prev.nicknames || {}),
                    [threadId]: cleanNickname
                }
            }));
        } catch (err) {
            console.error("Error setting thread nickname:", err);
            throw err; // Allow caller to handle
        }
    };

    const updateUserProfile = async (uid, data) => {
        const userRef = doc(db, 'users', uid);

        let extraData = {};
        const normalizedData = { ...data };

        if (data.name !== undefined) normalizedData.name = sanitizeText(data.name, 40);
        if (data.postalCode !== undefined) {
            normalizedData.postalCode = sanitizeText(data.postalCode, 16);
            const locInfo = await getStateAndCountryFromZip(normalizedData.postalCode);
            if (locInfo) {
                extraData = { state: locInfo.state, country: locInfo.country };
            }
        }

        try {
            await updateDoc(userRef, { ...normalizedData, ...extraData });
            await refreshUserData();
        } catch (err) {
            console.error("Profile update error:", err);
            throw err;
        }
    };

    const addPin = async (newPin) => {
        if (!newPin) return;

        // Sanitize and normalize
        const title = sanitizeText(newPin.title, 80).toUpperCase();
        const description = sanitizeText(newPin.description, 2000);
        let cleanLocation = sanitizeText(newPin.location, 120);
        let cleanAddress = sanitizeText(newPin.address, 160);

        if (looksLikeStreetAddress(cleanLocation)) cleanLocation = "Public Area";
        if (looksLikeStreetAddress(cleanAddress)) cleanAddress = "";

        if (!title || !description) {
            console.error("❌ addPin Aborted: Title and description are required after sanitization.");
            return;
        }

        const pinData = {
            ...newPin,
            title,
            description,
            location: cleanLocation,
            address: cleanAddress,
            ownerEmail: user?.email || newPin.ownerEmail || 'admin@missmeconnection.com',
            ownerUid: user?.uid || 'seeder-bot',
            createdAt: serverTimestamp()
        };

        logPinDebug("FIRESTORE WRITE pinData.date:", pinData.date);
        logPinDebug("FIRESTORE WRITE createdAt:", pinData.createdAt);

        try {
            if (newPin.id) {
                // ID provided -> setDoc for idempotency (prevents duplicates on retry)
                await setDoc(doc(db, 'pins', String(newPin.id)), pinData);
            } else {
                await addDoc(collection(db, 'pins'), pinData);
            }
        } catch (err) {
            console.error("addPin failed:", err);
            throw err;
        }
    };

    const removePin = async (pinId, reason = 'User deleted', adminUid = null) => {
        if (!pinId) {
            console.error("❌ removePin called without an ID");
            return;
        }

        const stringId = String(pinId);
        console.log("🗑️ INITIATING DELETE & ARCHIVE: Targeting ID:", stringId);

        try {
            // Find the pin in local state to capture its content for the Black Box
            const pinToArchive = pins.find(p => String(p.id) === stringId);
            if (pinToArchive) {
                console.log("📂 Archiving Pin to Black Box...");
                await addDoc(collection(db, 'deleted_pins'), {
                    ...pinToArchive,
                    originalId: stringId,
                    deletedAt: serverTimestamp(),
                    deletedBy: adminUid || user?.uid || 'unknown',
                    deletionReason: reason,
                    archivedByRole: user?.isAdmin ? 'admin' : 'user'
                });
            }

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
        const cleanReason = sanitizeText(reason, 500);
        if (!cleanReason) {
            console.error("❌ reportPin Aborted: Empty reason after sanitization.");
            return;
        }

        try {
            await addDoc(collection(db, 'reports'), {
                pinId,
                reporterUid: user.uid,
                reporterEmail: user.email,
                reason: cleanReason,
                status: 'pending',
                createdAt: serverTimestamp()
            });
            // Optionally mark the pin as reported locally or in the pin doc
            const pinRef = doc(db, 'pins', pinId);
            await updateDoc(pinRef, { isReported: true });
        } catch (err) {
            console.error("reportPin failed:", err);
            throw err;
        }
    };

    const updatePin = async (pinId, updatedData) => {
        if (!user) return;

        const normalizedData = { ...updatedData };
        if (updatedData.title !== undefined) normalizedData.title = sanitizeText(updatedData.title, 80).toUpperCase();
        if (updatedData.description !== undefined) normalizedData.description = sanitizeText(updatedData.description, 2000);
        if (updatedData.location !== undefined) {
            let loc = sanitizeText(updatedData.location, 120);
            if (looksLikeStreetAddress(loc)) loc = "Public Area";
            normalizedData.location = loc;
        }
        if (updatedData.address !== undefined) {
            let addr = sanitizeText(updatedData.address, 160);
            if (looksLikeStreetAddress(addr)) addr = "";
            normalizedData.address = addr;
        }

        try {
            const pinRef = doc(db, 'pins', pinId);
            await updateDoc(pinRef, {
                ...normalizedData,
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error("updatePin failed:", err);
            throw err;
        }
    };

    const ratePin = async (pinId, rating) => {
        if (!user) return;
        try {
            // Use a unique ID for user+pin combination to prevent multi-rating
            const ratingId = `${user.uid}_${pinId}`;
            await setDoc(doc(db, 'ratings', ratingId), {
                pinId,
                userId: user.uid,
                rating,
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error("ratePin failed:", err);
            throw err;
        }
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

    const markThreadAsRead = async (threadId) => {
        if (!user || !db || !threadId) return;
        try {
            const threadRef = doc(db, 'threads', threadId);
            // We need to know if we are owner or responder.
            // Since we don't have the thread data handy in this specific function call (usually called from UI with just ID),
            // and we want to avoid unnecessary reads if possible, we can check the context 'threads' state if available.
            // BUT for robustness against stale state, a direct read or a precondition is safer.
            // Let's use the 'threads' state as a cache hint, but verify.

            // Actually, the UI usually calls this when it HAS the thread open.
            // Let's assume the caller knows the role, or we fetch it.
            // Fetching is safer for security rules (though rules will block invalid updates anyway).
            // Let's rely on the rules rejection if we guess wrong, but we need to know WHICH field to update.

            // Since ID contains minimal info (pinId_responderUid), we can infer role if we are the responder.
            const parts = threadId.split('_');
            const possibleResponderUid = parts[parts.length - 1];

            let fieldToUpdate = null;

            if (user.uid === possibleResponderUid) {
                // I am the responder
                fieldToUpdate = 'responderLastReadAt';
            } else {
                // I am presumably the owner (or an impostor, but rules will catching that)
                // Wait, if I am not the responder, and I am a participant, I MUST be the owner.
                fieldToUpdate = 'ownerLastReadAt';
            }

            await updateDoc(threadRef, {
                [fieldToUpdate]: serverTimestamp()
            });
        } catch (err) {
            // Ignore permission errors if we guessed wrong (e.g. not a participant), but log others
            if (err.code !== 'permission-denied') {
                console.error("markRead failed", err);
            }
        }
    };

    const addNotification = async (targetUid, message, type = 'moderation') => {
        await addDoc(collection(db, 'notifications'), {
            targetUid,
            message,
            type,
            read: false,
        });
    };

    // responderUid: Optional. If sending as owner, specify who you are replying to. 
    // If sending as participant, omit (defaults to current user).
    const addReply = async (pinId, content, responderUid = null) => {
        // EDIT B: throw instead of silent return — caller's catch block depends on this
        if (!user) {
            console.error("❌ addReply Failed: User not logged in.");
            throw new Error("You must be logged in to send a message.");
        }

        // 1. Guards
        const cleanContent = (content || "").toString().trim();
        if (!cleanContent) {
            console.error("❌ addReply Aborted: Empty message.");
            return;
        }
        const finalContent = cleanContent.slice(0, 2000);

        const pin = pins.find(p => String(p.id) === String(pinId));
        if (!pin) {
            console.error(`❌ addReply Failed: Pin ${pinId} not found in state.`);
            return;
        }

        // --- RESOLVE OWNER UID via FRESH FIRESTORE READ ---
        // CRITICAL: The security rule does get(pins/pinId).data.ownerUid at write time.
        // We must use the live Firestore value — not the React state cache — to guarantee
        // our payload ownerUid matches exactly what the rule sees.
        const pinDocRef = doc(db, 'pins', String(pinId));
        const pinDocSnap = await getDoc(pinDocRef);
        if (!pinDocSnap.exists()) {
            console.error(`❌ addReply Aborted: Pin ${pinId} not found in Firestore.`);
            throw new Error("This connection no longer exists.");
        }
        const livePinData = pinDocSnap.data();
        const resolvedOwnerUid = livePinData.ownerUid;
        console.log("🔍 LIVE PIN ownerUid (from Firestore):", resolvedOwnerUid);
        console.log("🔍 CACHED pin.ownerUid (from React state):", pin.ownerUid);
        if (!resolvedOwnerUid) {
            console.error("❌ addReply Aborted: Live Firestore pin has no ownerUid field.");
            throw new Error("This connection doesn't have a valid owner.");
        }

        // --- RESOLVE RESPONDER UID ---
        let targetResponderUid = responderUid;
        if (user.uid !== resolvedOwnerUid) {
            // I am the participant (not the owner)
            targetResponderUid = user.uid;
        } else {
            // I am the owner
            if (!targetResponderUid) {
                console.error("❌ addReply Aborted: Owner must specify target responderUid to reply.");
                throw new Error("This connection doesn't have a valid recipient yet. No responder UID found.");
            }
        }

        if (targetResponderUid === resolvedOwnerUid) {
            console.error("❌ addReply Aborted: Responder cannot be the owner.");
            throw new Error("Cannot send a message to yourself.");
        }

        const participants = [resolvedOwnerUid, targetResponderUid];

        if (participants.includes(undefined) || participants.includes(null) || participants.some(p => typeof p !== 'string' || p.trim() === '')) {
            console.error("❌ addReply Integrity Error: Participants array contains invalid values:", participants);
            throw new Error("This connection doesn't have a valid recipient yet.");
        }

        const threadId = `${pinId}_${targetResponderUid}`;
        const threadRef = doc(db, 'threads', threadId);

        const threadData = {
            pinId,
            ownerUid: resolvedOwnerUid,
            ownerEmail: (pin.ownerEmail || '').toLowerCase(),
            responderUid: targetResponderUid,
            participants: participants,
            lastMessageAt: serverTimestamp(),
            lastMessagePreview: finalContent.substring(0, 80),
            lastSenderUid: user.uid,
            updatedAt: serverTimestamp(),
            ownerLastReadAt: serverTimestamp(),
            responderLastReadAt: serverTimestamp()
        };

        try {
            telemetry.trackEvent('reply_send_attempt');
            telemetry.startTimer('reply_send');
            const batch = writeBatch(db);
            // MESSAGE ID: Client-side generation with entropy for absolute idempotency
            const entropy = Math.random().toString(36).substring(2, 9);
            const msgId = `${user.uid}_${Date.now()}_${entropy}`;
            const messageRef = doc(db, 'threads', threadId, 'messages', msgId);

            const messageData = {
                content: finalContent,
                senderUid: user.uid,
                senderEmail: user.email,
                createdAt: serverTimestamp(),
                participants: participants // Security: Required for atomic batch rules
            };

            // CONDITIONAL UPDATE: only update the sender's lastReadAt
            const updateData = {
                lastMessageAt: serverTimestamp(),
                lastMessagePreview: finalContent.substring(0, 80),
                lastSenderUid: user.uid,
                updatedAt: serverTimestamp()
            };

            if (user.uid === resolvedOwnerUid) {
                updateData.ownerLastReadAt = serverTimestamp();
            } else if (user.uid === targetResponderUid) {
                updateData.responderLastReadAt = serverTimestamp();
            }

            // Create if new (with full data), Update if exists (with partial data)
            // But set() with merge: true merges top-level fields.
            // If the document doesn't exist, we need ALL fields.
            // If it DOES exist, we only want the updateData.
            // Complex case: 'threadData' has all fields. 'updateData' has only changing fields.
            // We can't easily check existence inside a batch without a transaction or pre-reading (which we didn't do for the thread).
            // Actually, we can just use set with merge for the full threadData on creation,
            // but for updates we must be careful not to overwrite the other person's ReadAt.

            // To be safe and compliant with the "don't touch other field" rule:
            // We'll trust that if we are sending a message, we want to update the thread.
            // However, the rule says "Do NOT allow both to change...". 
            // If we use set(..., {merge: true}) with the FULL threadData, it sends both fields.
            // We need to differentiate Creation vs Update.

            // Let's check existence first. We can afford one read.
            const threadSnap = await getDoc(threadRef);

            // ── DIAGNOSTIC LOGS ─────────────────────────────────────────
            console.log("🔍 THREAD ID:", threadRef.id);
            console.log("🔍 WRITE PATH:", threadRef.path);
            console.log("🔍 MESSAGES LISTENER PATH:", messageRef.path);
            console.log("🔍 AUTH UID:", user?.uid);
            console.log("🔍 PIN ID:", pinId, typeof pinId);
            console.log("🔍 PIN OWNER UID (resolvedOwnerUid):", resolvedOwnerUid);
            console.log("🔍 TARGET RESPONDER UID:", targetResponderUid);
            console.log("🔍 PARTICIPANTS:", [resolvedOwnerUid, targetResponderUid]);
            console.log("🔍 THREAD EXISTS SNAPSHOT:", threadSnap.exists(), threadSnap.exists() ? threadSnap.data() : null);
            console.log("🔍 THREAD DATA FULL:", JSON.stringify({
                pinId: threadData.pinId,
                ownerUid: threadData.ownerUid,
                ownerEmail: threadData.ownerEmail,
                responderUid: threadData.responderUid,
                participants: threadData.participants,
                lastSenderUid: threadData.lastSenderUid,
                lastMessagePreview: threadData.lastMessagePreview,
                ownerLastReadAt: '(serverTimestamp)',
                responderLastReadAt: '(serverTimestamp)',
                lastMessageAt: '(serverTimestamp)',
                updatedAt: '(serverTimestamp)',
            }, null, 2));
            console.log("🔍 THREAD UPDATE DATA (if exists branch):", JSON.stringify(updateData, null, 2));
            // ─────────────────────────────────────────────────────────────

            if (!threadSnap.exists()) {
                batch.set(threadRef, threadData);
            } else {
                batch.update(threadRef, updateData);
            }
            batch.set(messageRef, messageData);

            try {
                await batch.commit();
                telemetry.endTimer('reply_send');
                telemetry.trackEvent('reply_send_success');
                console.log(`✅ SUCCESS: Atomic write for thread ${threadId} and message ${msgId}`);
            } catch (commitErr) {
                console.error("❌ FIRESTORE WRITE FAILED:", commitErr?.code, commitErr?.message);
                console.error("❌ FIRESTORE ERROR FULL:", commitErr);
                throw commitErr;
            }
        } catch (err) {
            telemetry.trackEvent('reply_send_fail', { error: err.code });
            telemetry.trackError(err, { source: 'addReply' });
            throw err;
        }
    };

    const updateReply = async (threadId, messageId, content) => {
        if (!user) return;
        const msgRef = doc(db, 'threads', threadId, 'messages', messageId);

        try {
            const msgSnap = await getDoc(msgRef);
            if (!msgSnap.exists()) {
                console.error("❌ updateReply Failed: Message does not exist.");
                return;
            }
            if (msgSnap.data().senderUid !== user.uid) {
                console.error("❌ updateReply Access Denied: User is not the author.");
                return;
            }

            const cleanContent = (content || "").toString().trim();
            if (!cleanContent) return;

            await updateDoc(msgRef, {
                content: cleanContent.slice(0, 2000),
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error("❌ updateReply Error:", err);
        }
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

    const blockUser = async (targetUid) => {
        if (!user || !targetUid || user.uid === targetUid) return;

        console.log(`🚫 RECIPROCAL BLOCK INITIATED: ${user.uid} <-> ${targetUid}`);

        try {
            // 1. Update Current User's blockedUids
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
                blockedUids: arrayUnion(targetUid)
            });

            // 2. Update Target User's blockedUids (Reciprocal)
            const targetRef = doc(db, 'users', targetUid);
            await updateDoc(targetRef, {
                blockedUids: arrayUnion(user.uid)
            });

            // 3. Delete all threads between these users
            const threadIdsToDelete = threads.filter(t =>
                t.participants.includes(user.uid) && t.participants.includes(targetUid)
            ).map(t => t.id);

            for (const tId of threadIdsToDelete) {
                // TODO: Firestore does not delete subcollections automatically. 
                // Proper cleanup requires admin tooling / backend / recursive delete.
                // This is intentionally deferred.
                await deleteDoc(doc(db, 'threads', tId));
            }

            // 4. Log to Black Box (Audit Trail)
            await addDoc(collection(db, 'deleted_pins'), {
                type: 'user_block',
                title: 'RECIPROCAL BLOCK',
                deletedAt: serverTimestamp(),
                deletedBy: user.uid,
                targetUid: targetUid,
                deletionReason: 'User used "BAR USER" feature',
                archivedByRole: 'user',
                details: `Cleaned up ${threadIdsToDelete.length} message threads.`
            });

            await refreshUserData();
            console.log("✅ Reciprocal block complete. Threads purged.");
        } catch (err) {
            console.error("❌ Block error:", err);
        }
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
            addPin, removePin, updatePin, updateUserProfile, ratePin, getAverageRating, addReply, updateReply, blockUser,
            setThreadNickname,
            hiddenPins, hidePin, unhidePin, clearHiddenPins,
            formatDate, formatRelativeTime, dateFormat, setDateFormat, mapMode, setMapMode,
            distanceUnit, setDistanceUnit,
            threads, ratings, notifications,
            hasNewNotifications, markNotificationsAsRead,
            reportPin, isSuspended, hasProbation, canStartNewThread, addNotification, refreshUserData,
            visiblePinIds, setVisiblePinIds,
            activeFilters, setActiveFilters,
            subscribeToThread, markThreadAsRead,
            resetPassword: (email) => sendPasswordResetEmail(auth, email)
        }}>
            {children}
        </AppContext.Provider>
    );
};

export const useApp = () => useContext(AppContext);

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, getDocs, updateDoc, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { getStateAndCountryFromZip } from '../utils/locationHelper';
import './Admin.css';

const Admin = () => {
    const navigate = useNavigate();
    const { user, pins, removePin, addPin, addNotification } = useApp();
    const [allUsers, setAllUsers] = useState([]);
    const [reports, setReports] = useState([]);
    const [deletedPins, setDeletedPins] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [adminModal, setAdminModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: null,
        isAlert: false,
        showInput: false,
        inputValue: '',
        showDuration: false,
        durationValue: '48'
    });
    const [insightTab, setInsightTab] = useState('postalCode');
    const [inspectPinId, setInspectPinId] = useState('');
    const [diagnosticsData, setDiagnosticsData] = useState(null);

    useEffect(() => {
        // Security Check: Only allow if isadmin
        if (user && !user.isAdmin) {
            navigate('/map');
            return;
        }

        if (user) {
            const fetchUsers = async () => {
                const snapshot = await getDocs(collection(db, 'users'));
                setAllUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            };
            fetchUsers();

            // Listen for reports
            const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                setReports(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
                setLoading(false);
            });

            // Listen for Black Box (Deleted Pins)
            const qDeleted = query(collection(db, 'deleted_pins'), orderBy('deletedAt', 'desc'), limit(50));
            const unsubscribeDeleted = onSnapshot(qDeleted, (snapshot) => {
                setDeletedPins(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            });

            return () => {
                unsubscribe();
                unsubscribeDeleted();
            };
        }
    }, [user, navigate]);

    // TEMPORARY BYPASS FOR SEEDING
    const isAdmin = user?.isAdmin || true;

    const isOld = (pin) => {
        if (!pin.createdAt) return false;
        const createdAt = pin.createdAt?.toDate ? pin.createdAt.toDate() : new Date(pin.createdAt);
        const now = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);
        return createdAt < thirtyDaysAgo;
    };

    const activePinsList = pins.filter(p => !isOld(p));
    const archivedPinsList = pins.filter(p => isOld(p));

    const isStillSuspended = (u) => {
        if (!u.isSuspended) return false;
        if (!u.suspendedUntil) return true;
        const now = new Date();
        const until = u.suspendedUntil.toDate ? u.suspendedUntil.toDate() : new Date(u.suspendedUntil);
        return now < until;
    };

    const isStillOnReview = (u) => {
        // Root admin can NEVER be on review
        if (u.email?.toLowerCase() === 'missme@missmeconnection.com') return false;
        if (!u.reviewStatus) return false;
        if (!u.reviewExpiresAt) return true;
        const now = new Date();
        const until = u.reviewExpiresAt.toDate ? u.reviewExpiresAt.toDate() : new Date(u.reviewExpiresAt);
        return now < until;
    };

    if (!isAdmin) return <div className="admin-loading">ACCESS DENIED</div>;

    const handleDeletePin = async (id) => {
        setAdminModal({
            isOpen: true,
            title: 'CONFIRM DELETE',
            message: 'ARE YOU SURE YOU WANT TO DELETE THIS PIN? THIS CANNOT BE UNDONE.',
            showInput: true,
            inputValue: 'Manual moderation',
            onConfirm: async (reason) => {
                await removePin(id, reason || 'Manual moderation', user.uid);
                setAdminModal(prev => ({ ...prev, isOpen: false }));
            },
            isAlert: false
        });
    };

    const handleDeleteAllPins = async () => {
        setAdminModal({
            isOpen: true,
            title: 'CRITICAL WARNING',
            message: 'DELETE ALL PINS FROM THE MAP? THIS IS PERMANENT.',
            showInput: false,
            onConfirm: async () => {
                for (const pin of pins) {
                    await removePin(pin.id, 'Bulk Wipe Action', user.uid);
                }
                setAdminModal({
                    isOpen: true,
                    title: 'WIPED',
                    message: 'ALL PINS DELETED.',
                    isAlert: true
                });
            },
            isAlert: false
        });
    };

    const handleSeedPins = async () => {
        const testPins = [
            {
                title: "Reading Agatha Christie in the corner lounge",
                description: "You were reading Agatha Christie in the corner lounge. I was the one who smiled at you while ordering a drink. You had a red scarf.",
                type: "Woman → Man",
                location: "Har Bar, Shop 6C, 26/34 Dunn Bay Rd, Dunsborough WA 6281, Australia",
                date: "2025-01-14",
                time: "3:00 pm",
                lat: -33.6111,
                lng: 115.1011
            },
            {
                title: "Central Park Encounter",
                description: "Saw you near the Bethesda Fountain. You had a red scarf and were reading a book. We made eye contact for a split second.",
                type: "Man → Woman",
                location: "Bethesda Fountain, Central Park, New York, NY",
                date: "2026-02-11",
                time: "02:30 PM",
                lat: 40.7739,
                lng: -73.9713
            },
            {
                title: "Subway Smile",
                description: "Line 1 heading downtown. You got off at Times Square. I was wearing the green jacket. You smiled as the doors closed.",
                type: "Woman → Man",
                location: "Times Square-42 St Station, New York, NY",
                date: "2026-02-11",
                time: "05:00 PM",
                lat: 40.7589,
                lng: -73.9851
            },
            {
                title: "Coffee Shop Spark",
                description: "Blue Bottle Coffee on 9th Ave. We both reached for the oat milk at the same time. I wish I had said something more than just 'sorry'.",
                type: "Man → Man",
                location: "Blue Bottle Coffee, 450 W 15th St, New York, NY 10014",
                date: "2026-02-10",
                time: "09:00 AM",
                lat: 40.7484,
                lng: -74.0051
            },
            {
                title: "SoHo Stroll",
                description: "Walking down Prince St. You were walking a golden retriever. We bumped shoulders. You have amazing eyes.",
                type: "Woman → Woman",
                location: "Prince St, SoHo, New York, NY",
                date: "2026-02-09",
                time: "04:15 PM",
                lat: 40.7247,
                lng: -73.9995
            }
        ];

        // Replace window.confirm
        setAdminModal({
            isOpen: true,
            title: 'SEED DATABASE',
            message: `ADD ${testPins.length} TEST PINS FROM DESIGN FILES?`,
            showInput: false,
            onConfirm: async () => {
                for (const pinData of testPins) {
                    await addPin(pinData);
                }
                setAdminModal({
                    isOpen: true,
                    title: 'SUCCESS',
                    message: 'TEST PINS SEEDED SUCCESSFULLY',
                    isAlert: true
                });
            },
            isAlert: false
        });
    };

    // Replace browser confirm/alert in Seed Pins too
    const handleSeedPinsWrapped = () => {
        handleSeedPins();
    };

    const handleToggleSuspension = async (uId, currentStatus) => {
        if (currentStatus) {
            // Unsuspend logic
            setAdminModal({
                isOpen: true,
                title: 'UNSUSPEND USER',
                message: 'RESTORE ACCESS FOR THIS USER?',
                showInput: false,
                showDuration: false,
                onConfirm: async () => {
                    const userRef = doc(db, 'users', uId);
                    await updateDoc(userRef, {
                        isSuspended: false,
                        suspendedUntil: null
                    });
                    setAllUsers(prev => prev.map(u => u.id === uId ? { ...u, isSuspended: false } : u));
                    setAdminModal(prev => ({ ...prev, isOpen: false }));
                },
                isAlert: false
            });
        } else {
            // Suspend logic with custom duration
            setAdminModal({
                isOpen: true,
                title: 'MANUAL SUSPENSION',
                message: 'HOW MANY HOURS SHOULD THIS USER BE SUSPENDED?',
                showInput: false,
                showDuration: true,
                durationValue: '48',
                onConfirm: async (reason, duration) => {
                    const hours = parseInt(duration) || 48;
                    const until = new Date();
                    until.setHours(until.getHours() + hours);

                    const userRef = doc(db, 'users', uId);
                    await updateDoc(userRef, {
                        isSuspended: true,
                        suspendedUntil: until
                    });
                    setAllUsers(prev => prev.map(u => u.id === uId ? { ...u, isSuspended: true } : u));
                    setAdminModal(prev => ({ ...prev, isOpen: false }));
                },
                isAlert: false
            });
        }
    };

    const handleToggleAdmin = async (uId, currentStatus, email) => {
        const rootAdmin = 'missme@missmeconnection.com';
        if (email.toLowerCase() === rootAdmin) {
            setAdminModal({
                isOpen: true,
                title: 'DENIED',
                message: 'CRITICAL: ROOT ADMIN STATUS CANNOT BE REVOKED.',
                isAlert: true,
                showInput: false
            });
            return;
        }

        setAdminModal({
            isOpen: true,
            title: 'ADMIN ACCESS',
            message: `GIVE ${currentStatus ? 'REMOVE' : 'GRANT'} ADMIN ACCESS TO THIS USER?`,
            showInput: false,
            onConfirm: async () => {
                try {
                    const userRef = doc(db, 'users', uId);
                    await updateDoc(userRef, { isAdmin: !currentStatus });
                    setAllUsers(prev => prev.map(u => u.id === uId ? { ...u, isAdmin: !currentStatus } : u));
                    setAdminModal(prev => ({ ...prev, isOpen: false }));
                } catch (err) {
                    console.error("Admin toggle error:", err);
                    setAdminModal({
                        isOpen: true,
                        title: 'ERROR',
                        message: 'ERROR UPDATING ADMIN STATUS.',
                        isAlert: true
                    });
                }
            },
            isAlert: false
        });
    };

    const handleResolveReport = async (reportId, pinId, action) => {
        const report = reports.find(r => r.id === reportId);
        if (!report) return;

        if (action === 'delete') {
            setAdminModal({
                isOpen: true,
                title: 'DELETE PIN & WARN USER',
                message: 'Provide a reason (e.g. "Yard sale not allowed"). Owner will get a 30-day review flag.',
                showInput: true,
                inputValue: '',
                onConfirm: async (reason) => {
                    try {
                        const pin = pins.find(p => p.id === pinId);
                        if (pin) {
                            // 1. Delete Pin (Arrives in Black Box with reason)
                            await removePin(pinId, reason, user.uid);

                            // 2. Clear Reports
                            const allReportsSnapshot = await getDocs(collection(db, 'reports'));
                            const relatedReports = allReportsSnapshot.docs.filter(d => d.data().pinId === pinId);
                            for (const rDoc of relatedReports) {
                                await deleteDoc(doc(db, 'reports', rDoc.id));
                            }

                            // 3. Put Owner on Probation (30 Days)
                            const ownerRef = doc(db, 'users', pin.ownerUid);
                            const probDate = new Date();
                            probDate.setDate(probDate.getDate() + 30);

                            await updateDoc(ownerRef, {
                                reviewStatus: true,
                                reviewExpiresAt: probDate,
                                lastModerationReason: reason
                            });

                            // 4. Notify Owner
                            await addNotification(pin.ownerUid, `Your pin "${pin.title}" was removed. Reason: ${reason}. Your account is under review for 30 days.`);

                            // 5. Notify Reporter
                            await addNotification(report.reporterUid, `Thank you for reporting. Validated. The pin has been removed.`);
                        }

                        setAdminModal({
                            isOpen: true,
                            title: 'RESOLVED',
                            message: 'PIN REMOVED. OWNER PLACED ON 30-DAY PROBATION.',
                            isAlert: true
                        });
                    } catch (err) {
                        console.error("Mod error:", err);
                    }
                },
                isAlert: false
            });
        } else {
            setAdminModal({
                isOpen: true,
                title: 'DISMISS & STRIKE REPORTER',
                message: 'No violation found. How many hours to suspend the false reporter?',
                showInput: false,
                showDuration: true,
                durationValue: '48',
                onConfirm: async (reason, duration) => {
                    const hours = parseInt(duration) || 48;
                    try {
                        const reporterRef = doc(db, 'users', report.reporterUid);
                        const suspDate = new Date();
                        suspDate.setHours(suspDate.getHours() + hours);

                        await updateDoc(reporterRef, {
                            isSuspended: true,
                            suspendedUntil: suspDate
                        });

                        await addNotification(report.reporterUid, `Your account is on hold for ${hours} hours due to a false report strike.`);
                        await deleteDoc(doc(db, 'reports', reportId));
                        await updateDoc(doc(db, 'pins', pinId), { isReported: false });

                        setAdminModal({
                            isOpen: true,
                            title: 'DONE',
                            message: 'REPORT DISMISSED. REPORTER SUSPENDED 48h.',
                            isAlert: true
                        });
                    } catch (e) {
                        console.error("Dismiss error:", e);
                    }
                },
                isAlert: false
            });
        }
    };

    const handleBackfillSmarts = async () => {
        const unknownUsers = allUsers.filter(u => (!u.state || u.state === 'UNKNOWN') && u.postalCode);
        if (unknownUsers.length === 0) {
            setAdminModal({ isOpen: true, title: 'ALL CLEAR', message: 'ALL USERS ALREADY HAVE STATE/COUNTRY DATA.', isAlert: true, showInput: false });
            return;
        }

        setAdminModal({
            isOpen: true,
            title: 'RECOVER SMARTS',
            message: `SCAN AND BACKFILL ${unknownUsers.length} USERS WITH MISSING STATE/COUNTRY DATA? This uses the Google Geocoder for each user.`,
            showInput: false,
            onConfirm: async () => {
                for (const u of unknownUsers) {
                    const loc = await getStateAndCountryFromZip(u.postalCode);
                    if (loc) {
                        await updateDoc(doc(db, 'users', u.id), {
                            state: loc.state,
                            country: loc.country
                        });
                    }
                }
                // Refresh local state
                const snapshot = await getDocs(collection(db, 'users'));
                setAllUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));

                setAdminModal({ isOpen: true, title: 'COMPLETE', message: 'USER LOCATION DATA HAS BEEN RECOVERED.', isAlert: true, showInput: false });
            }
        });
    };

    const handleInspect = async () => {
        if (!inspectPinId.trim()) return;
        try {
            const pinRef = doc(db, 'pins', inspectPinId);
            const pinSnap = await getDocs(query(collection(db, 'pins'))); // Fetching all is easier for debugging ID mismatches
            const targetPinDoc = pinSnap.docs.find(d => d.id === inspectPinId.trim());

            let pinData = null;
            if (targetPinDoc) {
                pinData = { id: targetPinDoc.id, ...targetPinDoc.data() };
            }

            const threadQuery = query(collection(db, 'threads'), where('pinId', '==', inspectPinId.trim()));
            const threadSnap = await getDocs(threadQuery);
            const threads = threadSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            setDiagnosticsData({
                pin: pinData,
                threads: threads,
                currentUser: {
                    uid: user?.uid,
                    email: user?.email
                }
            });
        } catch (err) {
            console.error("DIAGNOSTICS ERROR:", err);
            alert("Error fetching diagnostics. Check console.");
        }
    };

    const marketInsights = React.useMemo(() => {
        const counts = {};
        allUsers.forEach(u => {
            let key = 'UNKNOWN';
            if (insightTab === 'postalCode') key = u.postalCode || 'UNKNOWN';
            else if (insightTab === 'state') key = u.state || 'UNKNOWN';
            else if (insightTab === 'country') key = u.country || 'USA'; // Default to USA for now

            counts[key] = (counts[key] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [allUsers, insightTab]);

    const filteredUsers = allUsers.filter(u =>
        u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.postalCode?.includes(searchTerm)
    );

    return (
        <div className="admin-container">
            <header className="admin-header">
                <button className="admin-back-btn" onClick={() => navigate('/map')}>← MAP</button>
                <h1 className="admin-title">ADMIN CONTROL CENTER</h1>
                <div className="admin-stats">
                    <span>USERS: {allUsers.length}</span>
                    <span>PINS: {pins.length}</span>
                    <button className="seed-pins-btn backfill-btn" onClick={handleBackfillSmarts} title="Backfill State/Country from Zip">RECOVER SMARTS</button>
                    <button className="seed-pins-btn" onClick={handleSeedPinsWrapped}>SEED PINS</button>
                    <button className="wipe-db-btn" onClick={handleDeleteAllPins}>WIPE PINS</button>
                </div>
            </header>

            <div className="admin-grid">
                <section className="admin-section">
                    <h2 className="section-title">ACTIVE PINS ({activePinsList.length})</h2>
                    <div className="admin-list active-pins-scroll">
                        {activePinsList.length === 0 && <p className="no-data-text">No active pins</p>}
                        {activePinsList.map(pin => (
                            <div key={pin.id} className="admin-item">
                                <div className="item-info">
                                    <span className="item-label">
                                        {pin.title}
                                        {pin.isReported && <span className="reported-badge">REPORTED</span>}
                                    </span>
                                    <span className="item-sub-label">{pin.ownerEmail}</span>
                                </div>
                                <div className="pin-action-group">
                                    <button className="item-review-btn" onClick={() => navigate(`/browse/${pin.id}`)}>REVIEW</button>
                                    <button className="item-delete-btn" onClick={() => handleDeletePin(pin.id)}>DELETE</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="admin-section">
                    <div className="section-header">
                        <h2 className="section-title">USERS ({allUsers.length})</h2>
                        <input
                            type="text"
                            placeholder="SEARCH USERS/ZIPS..."
                            className="admin-search"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="admin-list users-scroll">
                        {filteredUsers.map(u => (
                            <div key={u.id} className="admin-item">
                                <div className="item-info">
                                    <div className="item-label-group">
                                        <span className="item-label">{u.name}</span>
                                        {u.email?.toLowerCase() === 'missme@missmeconnection.com' && <span className="admin-badge">ROOT</span>}
                                        {u.isAdmin && u.email?.toLowerCase() !== 'missme@missmeconnection.com' && <span className="admin-badge">ADMIN</span>}
                                        {isStillOnReview(u) && <span className="moderation-badge review">⚠️ REVIEW</span>}
                                        {isStillSuspended(u) && <span className="moderation-badge suspended">🛑 HOLD</span>}
                                    </div>
                                    <span className="item-sub-label">{u.email} <span className="zip-badge">{u.postalCode}</span></span>
                                </div>
                                <div className="user-action-group">
                                    {u.email?.toLowerCase() !== 'missme@missmeconnection.com' ? (
                                        <>
                                            <button
                                                className={`admin-toggle-btn ${u.isSuspended ? 'is-admin' : ''}`}
                                                onClick={() => handleToggleSuspension(u.id, u.isSuspended)}
                                            >
                                                {u.isSuspended ? 'RESTORE' : 'SUSPEND'}
                                            </button>
                                            <button
                                                className={`admin-toggle-btn ${u.isAdmin ? 'is-admin' : ''}`}
                                                onClick={() => handleToggleAdmin(u.id, u.isAdmin, u.email)}
                                            >
                                                {u.isAdmin ? 'REVOKE' : 'MAKE ADMIN'}
                                            </button>
                                        </>
                                    ) : (
                                        <span className="root-locked-label">PROTECTED ROOT</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="admin-section insights-section">
                    <div className="section-header-row">
                        <h2 className="section-title">MARKET INSIGHTS</h2>
                        <div className="insight-tabs">
                            <button className={`insight-tab-btn ${insightTab === 'postalCode' ? 'active' : ''}`} onClick={() => setInsightTab('postalCode')}>ZIP</button>
                            <button className={`insight-tab-btn ${insightTab === 'state' ? 'active' : ''}`} onClick={() => setInsightTab('state')}>STATE</button>
                            <button className={`insight-tab-btn ${insightTab === 'country' ? 'active' : ''}`} onClick={() => setInsightTab('country')}>COUNTRY</button>
                        </div>
                    </div>
                    <div className="admin-list overflow-insights">
                        <div className="insight-header">
                            <span style={{ textTransform: 'uppercase' }}>{insightTab === 'postalCode' ? 'POSTAL CODE' : insightTab}</span>
                            <span>USER COUNT</span>
                        </div>
                        {marketInsights.map(([label, count]) => (
                            <div key={label} className="insight-row">
                                <span className="insight-zip">{label}</span>
                                <div className="insight-bar-wrap">
                                    <div className="insight-bar" style={{ width: `${(count / Math.max(1, allUsers.length)) * 100}%` }}></div>
                                    <span className="insight-count">{count}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="admin-section">
                    <h2 className="section-title reported-title">REPORTED CONTENT ({reports.length})</h2>
                    <div className="admin-list">
                        {reports.length === 0 && <p className="no-data-text">No active reports</p>}
                        {reports.map(report => (
                            <div key={report.id} className="admin-item reported-item">
                                <div className="item-info">
                                    <span className="item-label">REASON: {report.reason}</span>
                                    <span className="item-sub-label">BY: {report.reporterEmail}</span>
                                    <button className="view-pin-btn" onClick={() => navigate(`/browse/${report.pinId}`)}>VIEW PIN</button>
                                </div>
                                <div className="report-actions">
                                    <button className="item-approve-btn" onClick={() => handleResolveReport(report.id, report.pinId, 'keep')}>KEEP</button>
                                    <button className="item-delete-btn" onClick={() => handleResolveReport(report.id, report.pinId, 'delete')}>DELETE PIN</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="admin-section">
                    <h2 className="section-title" style={{ color: '#666' }}>ARCHIVED PINS (30+ DAYS OLD) - {archivedPinsList.length}</h2>
                    <div className="admin-list archived-pins-scroll">
                        {archivedPinsList.length === 0 && <p className="no-data-text">No archived pins</p>}
                        {archivedPinsList.map(pin => (
                            <div key={pin.id} className="admin-item" style={{ opacity: 0.6 }}>
                                <div className="item-info">
                                    <span className="item-label">{pin.title}</span>
                                    <span className="item-sub-label">{pin.ownerEmail} • {pin.date?.split('T')[0]}</span>
                                </div>
                                <div className="pin-action-group">
                                    <button className="item-review-btn" onClick={() => navigate(`/browse/${pin.id}`)}>VIEW</button>
                                    <button className="item-delete-btn" onClick={() => handleDeletePin(pin.id)}>DELETE</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="admin-section" style={{ gridColumn: '1 / -1' }}>
                    <h2 className="section-title" style={{ color: '#ffb300' }}>⬛ BLACK BOX: DELETED LOG ({deletedPins.length})</h2>
                    <div className="admin-list black-box-scroll" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        {deletedPins.length === 0 && <p className="no-data-text">No deleted pins in log</p>}
                        {deletedPins.map(log => (
                            <div key={log.id} className="admin-item" style={{ borderLeft: '4px solid #444', background: '#0a0a0c' }}>
                                <div className="item-info" style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <span className="item-label" style={{ color: '#eee' }}>{log.title || 'Untitled Pin'}</span>
                                        <span style={{ fontSize: '0.7rem', color: '#666' }}>ID: {log.id}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: '0.65rem', color: '#555', textTransform: 'uppercase' }}>{log.type === 'user_block' ? 'Target UID' : 'Owner'}</span>
                                            <span style={{ fontSize: '0.8rem', color: '#888' }}>{log.type === 'user_block' ? log.targetUid : (log.ownerEmail || 'N/A')}</span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: '0.65rem', color: '#555', textTransform: 'uppercase' }}>Action By</span>
                                            <span style={{ fontSize: '0.8rem', color: log.archivedByRole === 'admin' ? 'var(--missme-pink)' : '#888' }}>
                                                {log.deletedBy === 'unknown' ? 'UNKNOWN' : (log.archivedByRole === 'admin' ? 'ADMIN' : 'USER')}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: '0.65rem', color: '#555', textTransform: 'uppercase' }}>Reason</span>
                                            <span style={{ fontSize: '0.8rem', color: '#ffb300', fontStyle: 'italic' }}>"{log.deletionReason}"</span>
                                        </div>
                                        {log.details && (
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '0.65rem', color: '#555', textTransform: 'uppercase' }}>Details</span>
                                                <span style={{ fontSize: '0.8rem', color: '#888' }}>{log.details}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="admin-section diagnostics-section" style={{ gridColumn: '1 / -1', background: '#111', border: '2px solid #333' }}>
                    <h2 className="section-title" style={{ color: 'var(--missme-cyan)' }}>🔍 SYSTEM DIAGNOSTICS</h2>
                    <div className="diagnostic-controls" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                        <input
                            type="text"
                            placeholder="PASTE PIN ID (e.g. 1771265236911)"
                            className="admin-search"
                            style={{ flex: 1 }}
                            value={inspectPinId}
                            onChange={(e) => setInspectPinId(e.target.value)}
                        />
                        <button className="seed-pins-btn" onClick={handleInspect}>INSPECT DOCUMENT DUMP</button>
                    </div>

                    {diagnosticsData && (
                        <div className="diagnostics-dump" style={{ background: '#000', padding: '20px', borderRadius: '8px', fontSize: '0.9rem', color: '#ccc', maxHeight: '500px', overflowY: 'auto' }}>
                            <div style={{ marginBottom: '20px' }}>
                                <h3 style={{ color: 'white', borderBottom: '1px solid #333', paddingBottom: '5px' }}>CURRENT SESSION</h3>
                                <pre>{JSON.stringify(diagnosticsData.currentUser, null, 2)}</pre>
                            </div>

                            <div style={{ marginBottom: '20px' }}>
                                <h3 style={{ color: 'white', borderBottom: '1px solid #333', paddingBottom: '5px' }}>PIN DOCUMENT</h3>
                                {diagnosticsData.pin ? (
                                    <pre>{JSON.stringify(diagnosticsData.pin, null, 2)}</pre>
                                ) : (
                                    <p style={{ color: 'red' }}>PIN NOT FOUND IN FIRESTORE</p>
                                )}
                            </div>

                            <div>
                                <h3 style={{ color: 'white', borderBottom: '1px solid #333', paddingBottom: '5px' }}>ASSOCIATED THREADS ({diagnosticsData.threads.length})</h3>
                                {diagnosticsData.threads.map((t, idx) => (
                                    <div key={t.id} style={{ marginBottom: '15px', border: '1px solid #222', padding: '10px' }}>
                                        <strong>THREAD #{idx + 1} ID: {t.id}</strong>
                                        <pre>{JSON.stringify(t, null, 2)}</pre>
                                    </div>
                                ))}
                                {diagnosticsData.threads.length === 0 && <p>No threads found for this Pin ID.</p>}
                            </div>
                        </div>
                    )}
                </section>
            </div>

            {adminModal.isOpen && (
                <div className="modal-overlay">
                    <div className="modal-card admin-modal-card">
                        <h2 className="modal-title" style={{ color: adminModal.title === 'DONE' || adminModal.title === 'RESOLVED' ? 'var(--missme-cyan)' : 'var(--missme-pink)' }}>
                            {adminModal.title}
                        </h2>
                        <p className="modal-message">{adminModal.message}</p>

                        {adminModal.showInput && (
                            <div className="admin-modal-input-wrap">
                                <label className="admin-modal-label">MODERATION REASON</label>
                                <textarea
                                    className="admin-textarea"
                                    placeholder="Explain the violation for the user..."
                                    value={adminModal.inputValue}
                                    onChange={(e) => setAdminModal({ ...adminModal, inputValue: e.target.value })}
                                />
                            </div>
                        )}

                        {adminModal.showDuration && (
                            <div className="admin-modal-input-wrap">
                                <label className="admin-modal-label">DURATION (HOURS)</label>
                                <input
                                    type="number"
                                    className="admin-textarea"
                                    style={{ minHeight: 'unset' }}
                                    value={adminModal.durationValue}
                                    onChange={(e) => setAdminModal({ ...adminModal, durationValue: e.target.value })}
                                />
                                <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
                                    <button className="duration-preset-btn" onClick={() => setAdminModal({ ...adminModal, durationValue: '24' })}>24H</button>
                                    <button className="duration-preset-btn" onClick={() => setAdminModal({ ...adminModal, durationValue: '48' })}>48H</button>
                                    <button className="duration-preset-btn" onClick={() => setAdminModal({ ...adminModal, durationValue: '72' })}>72H</button>
                                    <button className="duration-preset-btn" onClick={() => setAdminModal({ ...adminModal, durationValue: '168' })}>1 WEEK</button>
                                </div>
                            </div>
                        )}

                        <div className="modal-actions">
                            {!adminModal.isAlert && (
                                <button
                                    className="modal-btn-cancel"
                                    onClick={() => setAdminModal(prev => ({ ...prev, isOpen: false }))}
                                >
                                    CANCEL
                                </button>
                            )}
                            <button
                                className="modal-btn-confirm"
                                onClick={adminModal.isAlert ? () => setAdminModal(prev => ({ ...prev, isOpen: false })) : () => adminModal.onConfirm(adminModal.inputValue, adminModal.durationValue)}
                            >
                                {adminModal.isAlert ? 'OK' : 'CONFIRM'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Admin;

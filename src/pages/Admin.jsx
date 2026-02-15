import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import './Admin.css';

const Admin = () => {
    const navigate = useNavigate();
    const { user, pins, removePin, addPin } = useApp();
    const [allUsers, setAllUsers] = useState([]);
    const [reports, setReports] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

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
            return () => unsubscribe();
        }
    }, [user, navigate]);

    // TEMPORARY BYPASS FOR SEEDING
    const isAdmin = user?.isAdmin || true;

    if (!isAdmin) return <div className="admin-loading">ACCESS DENIED</div>;

    const handleDeletePin = async (id) => {
        if (window.confirm('ARE YOU SURE YOU WANT TO DELETE THIS PIN?')) {
            await removePin(id);
        }
    };

    const handleDeleteAllPins = async () => {
        if (window.confirm('CRITICAL: DELETE ALL PINS FROM THE MAP? THIS CANNOT BE UNDONE.')) {
            for (const pin of pins) {
                await removePin(pin.id);
            }
            alert('ALL PINS DELETED');
        }
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

        if (window.confirm(`ADD ${testPins.length} TEST PINS FROM DESIGN FILES?`)) {
            for (const pinData of testPins) {
                await addPin(pinData);
            }
            alert('TEST PINS SEEDED SUCCESSFULLY');
        }
    };

    const handleToggleAdmin = async (uId, currentStatus, email) => {
        const rootAdmin = 'missme@missmeconnection.com';
        if (email.toLowerCase() === rootAdmin) {
            alert('CRITICAL: ROOT ADMIN STATUS CANNOT BE REVOKED.');
            return;
        }

        if (window.confirm(`GIVE ${currentStatus ? 'REMOVE' : 'GRANT'} ADMIN ACCESS TO THIS USER?`)) {
            try {
                const userRef = doc(db, 'users', uId);
                await updateDoc(userRef, { isAdmin: !currentStatus });
                // Update local state
                setAllUsers(prev => prev.map(u => u.id === uId ? { ...u, isAdmin: !currentStatus } : u));
            } catch (err) {
                console.error("Admin toggle error:", err);
                alert("ERROR UPDATING ADMIN STATUS. CHECK CONNECTION.");
            }
        }
    };

    const marketInsights = React.useMemo(() => {
        const counts = {};
        allUsers.forEach(u => {
            const zip = u.postalCode || 'UNKNOWN';
            counts[zip] = (counts[zip] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [allUsers]);

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
                    <button className="seed-pins-btn" onClick={handleSeedPins}>SEED PINS</button>
                    <button className="wipe-db-btn" onClick={handleDeleteAllPins}>WIPE PINS</button>
                </div>
            </header>

            <div className="admin-grid">
                <section className="admin-section">
                    <h2 className="section-title">ACTIVE PINS</h2>
                    <div className="admin-list">
                        {pins.map(pin => (
                            <div key={pin.id} className="admin-item">
                                <div className="item-info">
                                    <span className="item-label">{pin.title}</span>
                                    <span className="item-sub-label">{pin.ownerEmail}</span>
                                </div>
                                <button className="item-delete-btn" onClick={() => handleDeletePin(pin.id)}>DELETE</button>
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
                                    <span className="item-label">
                                        {u.name}
                                        {u.postalCode && <span className="zip-badge">{u.postalCode}</span>}
                                    </span>
                                    <span className="item-sub-label">{u.email}</span>
                                </div>
                                <div className="user-actions">
                                    {u.email?.toLowerCase() === 'missme@missmeconnection.com' ? (
                                        <span className="root-admin-badge">ROOT ADMIN</span>
                                    ) : (
                                        <button
                                            className={`admin-toggle-btn ${u.isAdmin ? 'is-admin' : ''}`}
                                            onClick={() => handleToggleAdmin(u.id, u.isAdmin, u.email)}
                                        >
                                            {u.isAdmin ? 'REVOKE ADMIN' : 'MAKE ADMIN'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="admin-section insights-section">
                    <h2 className="section-title">MARKET INSIGHTS (ZIPS)</h2>
                    <div className="admin-list">
                        <div className="insight-header">
                            <span>POSTAL CODE</span>
                            <span>USER COUNT</span>
                        </div>
                        {marketInsights.map(([zip, count]) => (
                            <div key={zip} className="insight-row">
                                <span className="insight-zip">{zip}</span>
                                <div className="insight-bar-wrap">
                                    <div className="insight-bar" style={{ width: `${(count / allUsers.length) * 100}%` }}></div>
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
            </div>
        </div>
    );
};

export default Admin;

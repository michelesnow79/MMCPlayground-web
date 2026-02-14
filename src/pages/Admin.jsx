import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import './Admin.css';

const Admin = () => {
    const navigate = useNavigate();
    const { user, pins, removePin } = useApp();
    const [allUsers, setAllUsers] = useState([]);
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
                setLoading(false);
            };
            fetchUsers();
        }
    }, [user, navigate]);

    if (!user || !user.isAdmin) return <div className="admin-loading">ACCESS DENIED</div>;

    const handleDeletePin = async (id) => {
        if (window.confirm('ARE YOU SURE YOU WANT TO DELETE THIS PIN?')) {
            await removePin(id);
        }
    };

    return (
        <div className="admin-container">
            <header className="admin-header">
                <button className="admin-back-btn" onClick={() => navigate('/map')}>← MAP</button>
                <h1 className="admin-title">ADMIN CONTROL CENTER</h1>
                <div className="admin-stats">
                    <span>USERS: {allUsers.length}</span>
                    <span>PINS: {pins.length}</span>
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
                    <h2 className="section-title">REGISTERED USERS</h2>
                    <div className="admin-list">
                        {allUsers.map(u => (
                            <div key={u.id} className="admin-item">
                                <div className="item-info">
                                    <span className="item-label">{u.name}</span>
                                    <span className="item-sub-label">{u.email}</span>
                                </div>
                                {u.isAdmin && <span className="admin-badge">ADMIN</span>}
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default Admin;

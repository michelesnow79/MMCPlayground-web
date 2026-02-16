import React from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import './Account.css';

// Importing assets
import hamburgerIcon from '../assets/hamburger.svg';
import deleteIcon from '../assets/delete_btn.svg';
import logoAsset from '../assets/heart-logo.svg';
import SideMenu from '../components/SideMenu';
import { useApp } from '../context/AppContext';
import AuthModal from '../components/AuthModal';
import ConfirmModal from '../components/ConfirmModal';

const Account = () => {
    const { user, loading, logout, deleteAccount, updateUserProfile, dateFormat, setDateFormat, pins, hiddenPins, hidePin, unhidePin, clearHiddenPins, mapMode, setMapMode, distanceUnit, setDistanceUnit } = useApp();
    const navigate = useNavigate();
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);
    const [showDeleteModal, setShowDeleteModal] = React.useState(false);
    const [showHiddenList, setShowHiddenList] = React.useState(false);
    const [showProfileModal, setShowProfileModal] = React.useState(false);
    const [newName, setNewName] = React.useState('');
    const [newPostalCode, setNewPostalCode] = React.useState('');
    const [confirmConfig, setConfirmConfig] = React.useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
        type: 'danger'
    });

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const confirmDelete = () => {
        deleteAccount();
        navigate('/');
    };

    const handleEditProfileClick = () => {
        setNewName(user.name || '');
        setNewPostalCode(user.postalCode || '');
        setShowProfileModal(true);
    };

    const handleProfileUpdate = async () => {
        if (!newName.trim()) return;
        await updateUserProfile(user.uid, {
            name: newName.toUpperCase(),
            postalCode: newPostalCode
        });
        setShowProfileModal(false);
    };

    // Filter pins that are currently hidden
    const hiddenPinsData = pins.filter(p => hiddenPins.includes(p.id));

    const settingsItems = [
        { icon: null, label: "Support", actionIcon: "✉️" },
        { icon: null, label: "Terms & conditions", actionIcon: "❯" },
        { icon: null, label: "Privacy policy", actionIcon: "❯" },
        { icon: null, label: "About us", actionIcon: "❯" },
    ];

    // We no longer redirect automatically, we show the AuthModal instead
    /* 
    React.useEffect(() => {
        const checkAuth = setTimeout(() => {
            if (!loading && !user) {
                console.log("MMC AUTH: User missing after grace period, redirecting from Account to Home");
                navigate('/');
            }
        }, 500);
        return () => clearTimeout(checkAuth);
    }, [user, loading, navigate]);
    */

    if (loading) {
        return <div className="loading-screen-missme">LOADING PROFILE...</div>;
    }

    if (!user) return <AuthModal />;

    if (showHiddenList) {
        return (
            <div className="account-page-premium">
                <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
                <header className="premium-account-header">
                    <button className="side-menu-btn" onClick={() => setShowHiddenList(false)}>
                        <span className="back-arrow">←</span>
                    </button>
                    <h1 className="account-title-center">HIDDEN PINS</h1>
                    <div className="header-spacer"></div>
                </header>

                <div className="hidden-list-container">
                    {hiddenPinsData.length === 0 ? (
                        <div className="empty-hidden-state">
                            <p>No hidden pins found.</p>
                            <button className="btn-cyan-glow-small" onClick={() => setShowHiddenList(false)}>BACK</button>
                        </div>
                    ) : (
                        <div className="hidden-items-stack">
                            {hiddenPinsData.map(pin => (
                                <div key={pin.id} className="hidden-item-card">
                                    <div className="hidden-item-info">
                                        <span className="hidden-title">{pin.title}</span>
                                        <span className="hidden-meta">{pin.type} • {pin.location?.split(',')[0]}</span>
                                    </div>
                                    <button className="unhide-btn-pill" onClick={() => unhidePin(pin.id)}>
                                        UNHIDE
                                    </button>
                                </div>
                            ))}
                            <button className="clear-all-hidden-btn" onClick={clearHiddenPins}>
                                UNHIDE ALL PINS
                            </button>
                        </div>
                    )}
                </div>
                <BottomNav />
            </div>
        );
    }

    return (
        <div className="account-page-premium">
            <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
            <header className="premium-account-header">
                <button className="side-menu-btn" onClick={() => navigate('/map')}>
                    <span className="close-x-icon">✕</span>
                </button>
                <h1 className="account-title-center">ACCOUNT & SETTINGS</h1>
                <div className="header-spacer"></div>
            </header>

            <div className="premium-profile-card">
                <div className="profile-pin-container">
                    <div className="pin-background-circle">
                        <img src={logoAsset} alt="" className="profile-heart-pin" />
                    </div>
                </div>

                <div className="profile-identity">
                    <h2 className="profile-hero-name">{user.name === 'SHELLY' ? 'MICHELE' : user.name}</h2>
                    <span className="profile-email-cyan">{user.email}</span>
                </div>

                <div className="profile-divider-small"></div>

                <div className="zip-display-section">
                    <span className="zip-label-text">Postal Code</span>
                    <span className="zip-value-text">{user.postalCode || 'NOT SET'}</span>
                </div>

                <div className="settings-rows-container">
                    {/* Preferences Section Inline */}
                    <div className="preferences-row">
                        <span className="row-label">Date Format</span>
                        <div className="format-pills-group-full">
                            {['mm/dd/yyyy', 'dd/mm/yyyy', 'yyyy/mm/dd'].map(format => (
                                <button
                                    key={format}
                                    className={`pref-pill-full ${dateFormat === format ? 'active' : ''}`}
                                    onClick={() => setDateFormat(format)}
                                >
                                    {format.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="preferences-row">
                        <span className="row-label">Map Theme</span>
                        <div className="format-pills-group-full">
                            {['light', 'dark'].map(mode => (
                                <button
                                    key={mode}
                                    className={`pref-pill-full ${mapMode === mode ? 'active' : ''}`}
                                    onClick={() => setMapMode(mode)}
                                >
                                    {mode.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="preferences-row">
                        <span className="row-label">Distance Units</span>
                        <div className="format-pills-group-full">
                            {['miles', 'km'].map(unit => (
                                <button
                                    key={unit}
                                    className={`pref-pill-full ${distanceUnit === unit ? 'active' : ''}`}
                                    onClick={() => setDistanceUnit(unit)}
                                >
                                    {unit === 'miles' ? 'MILES' : 'KILOMETERS'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {settingsItems.map((item, idx) => (
                        <div
                            key={idx}
                            className="settings-row-item cursor-pointer"
                            onClick={() => {
                                if (item.label === "Support") navigate('/support');
                                if (item.label === "Terms & conditions") navigate('/terms');
                                if (item.label === "Privacy policy") navigate('/privacy');
                                if (item.label === "About us") navigate('/about');
                            }}
                        >
                            <span className="row-label">{item.label}</span>
                            <span className="row-action-indicator">{item.actionIcon}</span>
                        </div>
                    ))}
                </div>

                <div className="profile-actions-footer">
                    <button className="action-link-btn" onClick={handleEditProfileClick}>Edit?</button>
                    {hiddenPins.length > 0 && (
                        <button className="action-link-btn unhide-btn" onClick={() => setShowHiddenList(true)}>Unhide({hiddenPins.length})</button>
                    )}
                    {user?.isAdmin && (
                        <button className="action-link-btn admin-link-text" onClick={() => navigate('/admin')}>ADMIN?</button>
                    )}
                    <button className="action-link-btn logout-text" onClick={handleLogout}>Logout?</button>
                </div>

                <div className="danger-zone-minimal">
                    <button className="delete-acc-link" onClick={() => setConfirmConfig({
                        isOpen: true,
                        title: 'DELETE ACCOUNT?',
                        message: 'THIS ACTION IS PERMANENT. YOU WILL LOSE ALL YOUR CONNECTIONS AND PROFILE DATA.',
                        onConfirm: confirmDelete,
                        confirmText: 'DELETE FOREVER',
                        cancelText: 'NOT TODAY',
                        type: 'danger'
                    })}>
                        Delete Account?
                    </button>
                </div>
            </div>

            {showProfileModal && (
                <div className="modal-overlay">
                    <div className="modal-card profile-edit-modal">
                        <header className="modal-header">
                            <h2 className="modal-title">EDIT PROFILE</h2>
                        </header>
                        <div className="modal-body">
                            <div className="edit-input-group">
                                <label>DISPLAY NAME</label>
                                <input
                                    type="text"
                                    className="edit-input"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Your Name"
                                />
                            </div>
                            <div className="edit-input-group">
                                <label>POSTAL CODE (FOR MAP HOME)</label>
                                <input
                                    type="text"
                                    className="edit-input"
                                    value={newPostalCode}
                                    onChange={(e) => setNewPostalCode(e.target.value)}
                                    placeholder="Zip Code"
                                />
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button className="modal-btn-cancel" onClick={() => setShowProfileModal(false)}>CANCEL</button>
                            <button className="modal-btn-confirm" onClick={handleProfileUpdate}>SAVE CHANGES</button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={confirmConfig.isOpen}
                title={confirmConfig.title}
                message={confirmConfig.message}
                onConfirm={confirmConfig.onConfirm}
                onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
                confirmText={confirmConfig.confirmText}
                cancelText={confirmConfig.cancelText}
                type={confirmConfig.type}
            />
            <BottomNav />
        </div>
    );
};

export default Account;

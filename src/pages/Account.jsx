import React from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import './Account.css';

// Importing assets
import hamburgerIcon from '../assets/hamburger.svg';
import deleteIcon from '../assets/delete_btn.svg';
import logoAsset from '../assets/heart-logo.svg';
import { useApp } from '../context/AppContext';

const Account = () => {
    const { user, loading, logout, deleteAccount, dateFormat, setDateFormat, pins, hiddenPins, hidePin, unhidePin, clearHiddenPins, mapMode, setMapMode } = useApp();
    const navigate = useNavigate();
    const [showDeleteModal, setShowDeleteModal] = React.useState(false);
    const [showHiddenList, setShowHiddenList] = React.useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const confirmDelete = () => {
        deleteAccount();
        navigate('/');
    };

    // Filter pins that are currently hidden
    const hiddenPinsData = pins.filter(p => hiddenPins.includes(p.id));

    const settingsItems = [
        { icon: null, label: "Support", actionIcon: "✉️" },
        { icon: null, label: "Terms & conditions", actionIcon: "❯" },
        { icon: null, label: "Privacy policy", actionIcon: "❯" },
        { icon: null, label: "About us", actionIcon: "❯" },
    ];

    // Redirect to login if not logged in and not loading
    React.useEffect(() => {
        if (!loading && !user) {
            navigate('/login');
        }
    }, [user, loading, navigate]);

    if (loading) {
        return <div className="loading-screen-missme">LOADING PROFILE...</div>;
    }

    if (!user) return null; // Prevent crash before redirect

    if (showHiddenList) {
        return (
            <div className="account-page-premium">
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
            <header className="premium-account-header">
                <button className="side-menu-btn">
                    <img src={hamburgerIcon} alt="Menu" width="24" height="24" />
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
                    <span className="zip-label-text">Zip or Post Code</span>
                    <span className="zip-value-text">{user.zipCode}</span>
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

                    {settingsItems.map((item, idx) => (
                        <div key={idx} className="settings-row-item">
                            <span className="row-label">{item.label}</span>
                            <span className="row-action-indicator">{item.actionIcon}</span>
                        </div>
                    ))}
                </div>

                <div className="profile-actions-footer">
                    <button className="action-link-btn" onClick={() => navigate('/account/edit')}>Edit?</button>
                    {hiddenPins.length > 0 && (
                        <button className="action-link-btn unhide-btn" onClick={() => setShowHiddenList(true)}>Unhide({hiddenPins.length})</button>
                    )}
                    {user?.isAdmin && (
                        <button className="action-link-btn admin-link-text" onClick={() => navigate('/admin')}>ADMIN?</button>
                    )}
                    <button className="action-link-btn logout-text" onClick={handleLogout}>Logout?</button>
                </div>

                <div className="danger-zone-minimal">
                    <button className="delete-acc-link" onClick={() => setShowDeleteModal(true)}>
                        Delete Account?
                    </button>
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="modal-overlay">
                    <div className="modal-card">
                        <h2 className="modal-title">DELETE ACCOUNT?</h2>
                        <p className="modal-text">THIS ACTION IS PERMANENT. YOU WILL LOSE ALL YOUR CONNECTIONS AND PROFILE DATA.</p>
                        <div className="modal-actions">
                            <button className="modal-btn-cancel" onClick={() => setShowDeleteModal(false)}>CANCEL</button>
                            <button className="modal-btn-confirm" onClick={confirmDelete}>DELETE FOREVER</button>
                        </div>
                    </div>
                </div>
            )}

            <BottomNav />
        </div>
    );
};

export default Account;

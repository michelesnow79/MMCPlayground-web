import React, { useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { APIProvider } from '@vis.gl/react-google-maps';
import { useApp } from '../context/AppContext';
import BottomNav from '../components/BottomNav';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import './ConnectionDetail.css';
import ConfirmModal from '../components/ConfirmModal';
import AuthModal from '../components/AuthModal';
import { fuzzAndProcessLocation } from '../utils/locationHelper';
import logoAsset from '../assets/heart-logo.svg';
import telemetry from '../utils/telemetry';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const ConnectionDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { user, pins, threads, addReply, updateReply, ratings, ratePin, getAverageRating, hidePin, updatePin, removePin, formatDate, formatRelativeTime, hiddenPins, loading, isSuspended, canStartNewThread, subscribeToThread, addPin, mapMode, reportPin, distanceUnit, blockUser, hasProbation, setVisiblePinIds, activeFilters, setActiveFilters, isLoggedIn, setThreadNickname } = useApp();

    const pin = pins.find(p => String(p.id) === String(id));

    // Find my specific rating for this pin
    const pinRatings = ratings[pin?.id] || [];
    const myRatingObj = user ? pinRatings.find(r => r.userId === user.uid) : null;
    const currentRating = myRatingObj ? myRatingObj.rating : 0;

    const [replyText, setReplyText] = React.useState('');
    const [showReplyModal, setShowReplyModal] = React.useState(false);
    const [activeResponderUid, setActiveResponderUid] = React.useState(null); // Used by owner to target a thread
    const [threadMessages, setThreadMessages] = React.useState([]); // Messages for the active/only thread
    const [isSendingReply, setIsSendingReply] = React.useState(false);
    const historyRef = useRef(null);
    const [showReportModal, setShowReportModal] = React.useState(false);
    const [reportReason, setReportReason] = React.useState('');
    const [isEditing, setIsEditing] = React.useState(false);
    const [isRenaming, setIsRenaming] = React.useState(false);
    const [tempNickname, setTempNickname] = React.useState('');

    // Edit Pin State
    const [showEditModal, setShowEditModal] = React.useState(false);
    const [editTitle, setEditTitle] = React.useState('');
    const [editDescription, setEditDescription] = React.useState('');
    const [editDate, setEditDate] = React.useState(new Date());
    const [editTime, setEditTime] = React.useState(null);
    const [editLocation, setEditLocation] = React.useState('');
    const [editAddress, setEditAddress] = React.useState('');
    const [editCoords, setEditCoords] = React.useState(null);

    const [confirmConfig, setConfirmConfig] = React.useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
        type: 'danger'
    });

    const handleRate = (val) => {
        if (!user) {
            setShowAuthModal(true);
            return;
        }
        if (isSuspended()) {
            setConfirmConfig({
                isOpen: true,
                title: 'ACCOUNT ON HOLD',
                message: 'Your account is currently on hold. You cannot rate pins until the review period ends.',
                onConfirm: () => setConfirmConfig(prev => ({ ...prev, isOpen: false })),
                cancelText: 'CLOSE',
                confirmText: 'OK',
                type: 'info'
            });
            return;
        }
        if (pin) ratePin(pin.id, val);
    };

    // Identify if current user already has a thread for this pin as a participant
    const myThread = (pin && user) ? threads.find(t => String(t.pinId) === String(pin.id) && t.responderUid === user.uid) : null;

    // Unified Thread Subscription
    useEffect(() => {
        if (!pin || !user) return;

        // Determine which thread we are looking at:
        // 1. Explicitly selected (owner clicked a participant)
        // 2. Default participant thread (not owner)
        let targetThreadId = null;

        // Only owners are allowed to select a responder thread
        if (activeResponderUid && pin.ownerUid === user.uid) {
            targetThreadId = `${pin.id}_${activeResponderUid}`;
        } else if (pin.ownerUid !== user.uid) {
            // Non-owner always subscribes only to their own thread
            targetThreadId = `${pin.id}_${user.uid}`;
        } else {
            // Owner has no activeResponderUid selected yet
            targetThreadId = null;
        }

        if (!targetThreadId) {
            setThreadMessages([]);
            return;
        }

        const unsub = subscribeToThread(targetThreadId, setThreadMessages);
        return () => unsub();
    }, [pin?.id, pin?.ownerUid, user?.uid, activeResponderUid]);

    // ALLOW MULTIPLE REPLIES (Chat Style) - No longer forcing edit mode on existing reply
    // ALLOW MULTIPLE REPLIES (Chat Style)
    const handleReplyClick = (responderUid = null) => {
        console.log(`💬 handleReplyClick called. responderUid: ${responderUid}, user: ${user?.uid}`);
        if (!user) {
            setShowAuthModal(true);
            return;
        }
        setActiveResponderUid(responderUid);
        setShowReplyModal(true);
    };

    const handleCloseReply = () => {
        setShowReplyModal(false);
        setActiveResponderUid(null);
        if (location.state?.fromMessages) {
            navigate('/messages');
        }
    };


    const handleBlockUser = async () => {
        // Identify who the other user is. 
        // If I am the owner, it's the specific participant I'm chatting with (activeResponderUid).
        // If I am the participant, it's the pin owner (pin.ownerUid).
        const otherUid = pin.ownerUid === user.uid ? activeResponderUid : pin.ownerUid;

        if (!otherUid) {
            setConfirmConfig({
                isOpen: true,
                title: "CANNOT BLOCK",
                message: "We couldn't identify the other user in this conversation.",
                onConfirm: () => setConfirmConfig(prev => ({ ...prev, isOpen: false })),
                confirmText: 'OK',
                type: 'info'
            });
            return;
        }

        setConfirmConfig({
            isOpen: true,
            title: "BAR THIS USER FOREVER?",
            message: "THIS REPLIER WILL NOT ONLY BE BARRED FROM THIS CONVERSATION BUT ALL CONVERSATIONS. THIS CANNOT BE UNDONE.",
            onConfirm: async () => {
                await blockUser(otherUid);
                setShowReplyModal(false);
                setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                navigate(location.state?.fromMessages ? '/messages' : '/map');
            },
            confirmText: 'BAR FOREVER',
            cancelText: 'CANCEL',
            type: 'danger'
        });
    };

    // Auto-scroll to bottom of conversation
    useEffect(() => {
        if (historyRef.current) {
            historyRef.current.scrollTop = historyRef.current.scrollHeight;
        }
    }, [threadMessages, showReplyModal]);

    // Handle auto-opening the reply from Messages page
    useEffect(() => {
        if (location.state?.openReply && pin && user) {
            handleReplyClick(location.state.responderUid);
        }
    }, [pin, user, location.state]);

    const handleHide = () => {
        if (pin) {
            hidePin(pin.id);
            navigate(location.state?.fromMessages ? '/messages' : '/map');
        }
    };

    const handleShare = () => {
        if (navigator.share) {
            navigator.share({
                title: pin?.title,
                text: `Check out this missed connection: ${pin?.description}`,
                url: window.location.href,
            }).catch(console.error);
        } else {
            navigator.clipboard.writeText(window.location.href);
            alert("Link copied to clipboard!");
        }
    };

    const handleDelete = async () => {
        if (!pin) return;
        console.log("🔴 DELETE BUTTON CLICKED for pin:", pin.id);

        if (pin.isReported && !user?.isAdmin) {
            setConfirmConfig({
                isOpen: true,
                title: 'PIN UNDER REVIEW',
                message: 'THIS PIN IS UNDER REVIEW AND CANNOT BE DELETED BY THE OWNER AT THIS TIME.',
                onConfirm: () => setConfirmConfig(prev => ({ ...prev, isOpen: false })),
                cancelText: 'CLOSE',
                confirmText: 'UNDERSTOOD',
                type: 'info'
            });
            return;
        }

        setConfirmConfig({
            isOpen: true,
            title: 'DELETE POST?',
            message: 'ARE YOU SURE YOU WANT TO DELETE THIS POST FOREVER? THIS CANNOT BE UNDONE.',
            onConfirm: async () => {
                console.log("🔴 CONFIRMED: Calling removePin with ID:", pin.id);
                setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                await removePin(pin.id, 'User self-deleted');
                navigate(location.state?.fromMessages ? '/messages' : '/map');
            },
            onCancel: () => setConfirmConfig(prev => ({ ...prev, isOpen: false })),
            confirmText: 'DELETE FOREVER',
            cancelText: 'KEEP POST',
            type: 'danger'
        });
    };

    const handleEditClick = () => {
        if (!pin) return;
        if (pin.isReported && !user?.isAdmin) {
            setConfirmConfig({
                isOpen: true,
                title: 'PIN UNDER REVIEW',
                message: 'THIS PIN IS UNDER REVIEW AND CANNOT BE EDITED BY THE OWNER AT THIS TIME.',
                onConfirm: () => setConfirmConfig(prev => ({ ...prev, isOpen: false })),
                confirmText: 'OK',
                type: 'info'
            });
            return;
        }

        setEditTitle(pin.title);
        setEditDescription(pin.description);
        setEditDate(pin.date ? new Date(pin.date) : new Date());
        // Attempt to parse time string back to Date object for the picker
        if (pin.time) {
            try {
                const [time, modifier] = pin.time.split(' ');
                let [hours, minutes] = time.split(':');
                if (hours === '12' && modifier === 'AM') hours = '00';
                else if (hours !== '12' && modifier === 'PM') hours = parseInt(hours, 10) + 12;
                else if (hours === '12' && modifier === 'PM') hours = '12';

                const dummyDate = new Date();
                dummyDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
                setEditTime(dummyDate);
            } catch (e) {
                console.error("Time parse error:", e);
                setEditTime(null);
            }
        } else {
            setEditTime(null);
        }
        setEditLocation(pin.location || '');
        setEditAddress(pin.address || '');
        setEditCoords({ lat: pin.lat, lng: pin.lng });
        setShowEditModal(true);
    };

    const handleEditSubmit = async () => {
        if (!pin || !editTitle.trim() || !editDescription.trim()) return;

        await updatePin(pin.id, {
            title: editTitle.toUpperCase(),
            description: editDescription,
            location: editLocation,
            address: editAddress,
            lat: editCoords?.lat || pin.lat,
            lng: editCoords?.lng || pin.lng,
            date: `${editDate.getFullYear()}-${String(editDate.getMonth() + 1).padStart(2, '0')}-${String(editDate.getDate()).padStart(2, '0')}`,
            time: editTime ? editTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
        });
        setShowEditModal(false);
    };

    const handleReportSubmit = () => {
        if (!pin || !reportReason.trim()) return;
        reportPin(pin.id, reportReason);
        setShowReportModal(false);
        setConfirmConfig({
            isOpen: true,
            title: 'REPORT SUBMITTED',
            message: 'PIN REPORTED TO ADMIN AND TEMPORARILY HIDDEN FROM YOUR VIEW.',
            onConfirm: () => {
                setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                navigate('/map');
            },
            confirmText: 'OK',
            type: 'info'
        });
    };

    // Debugging
    useEffect(() => {
        console.log(`MMC DEBUG: ConnectionDetail active. ID from params: "${id}"`);
        if (pins && pins.length > 0) {
            console.log("MMC DEBUG: Available Pin IDs:", pins.map(p => p.id));
        }
    }, [id, pins]);

    // Track Auth Wall Impression
    useEffect(() => {
        if (showAuthModal) {
            telemetry.trackEvent('auth_wall_shown', { source: 'connection_detail' });
        }
    }, [showAuthModal]);

    // Google Places Autocomplete for Edit Modal
    React.useEffect(() => {
        if (!showEditModal || !window.google || !window.google.maps || !window.google.maps.places || !pin) return;

        // Small delay to ensure the element is in the DOM
        const timeout = setTimeout(() => {
            const input = document.getElementById('edit-location-input');
            if (!input) return;

            const autocomplete = new window.google.maps.places.Autocomplete(input, {
                types: ['geocode', 'establishment'],
                locationBias: { lat: pin.lat, lng: pin.lng },
                radius: 5000 // 5km bias
            });

            autocomplete.addListener('place_changed', async () => {
                const place = autocomplete.getPlace();
                if (place && place.geometry) {
                    setEditLocation("Processing privacy...");
                    const processed = await fuzzAndProcessLocation(place);
                    if (processed) {
                        setEditCoords(processed.coords);
                        setEditLocation(processed.label);
                        setEditAddress(processed.secondaryLabel || "");
                    }
                }
            });
        }, 300);

        return () => clearTimeout(timeout);
    }, [showEditModal, pin]);

    if (loading) {
        return <div className="detail-loading">LOADING CONNECTION...</div>;
    }

    if (!pin || (hiddenPins.includes(pin.id) && !user?.isAdmin)) {
        return (
            <div className="detail-container">
                <header className="detail-header-minimal">
                    <button className="back-link-btn" onClick={() => navigate('/map')}>← BACK TO MAP</button>
                </header>
                <div className="detail-not-found">
                    <h1 className="error-title">CONNECTION NOT FOUND</h1>
                    <p>This post might have been removed or the link is incorrect.</p>
                    <button className="btn-return" onClick={() => navigate('/map')}>GO TO MAP</button>
                </div>
                <BottomNav />
            </div>
        );
    }

    return (
        <APIProvider apiKey={API_KEY} libraries={['places']}>
            <div className="detail-page-wrapper">
                <header className="detail-top-nav">
                    <button className="nav-back-arrow" onClick={() => location.state?.fromMessages ? navigate('/messages') : navigate(-1)}>
                        <span className="arrow-icon">←</span> BACK
                    </button>
                    <div className="detail-logo-group" onClick={() => navigate('/')}>
                        <img src={logoAsset} alt="Logo" className="header-heart-logo-detail" />
                        <span className="logo-text-bangers">MISS ME CONNECTION</span>
                    </div>
                    <button className="nav-close-x" onClick={() => location.state?.fromMessages ? navigate('/messages') : navigate('/browse')}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </header>

                {isSuspended() && (
                    <div className="suspension-banner">
                        ⚠️ YOUR ACCOUNT IS ON HOLD FOR 48 HOURS. YOU CAN ONLY REPLY TO ONGOING CHATS.
                    </div>
                )}

                <main className="detail-content-area">
                    <div className={`premium-detail-card ${pin.isReported ? 'reported-lockdown' : ''}`}>
                        {pin.isReported && (
                            <div className="lockdown-notice">
                                <span className="lockdown-icon">⚠️</span>
                                <div className="lockdown-text">
                                    <h3>UNDER REVIEW</h3>
                                    <p>This pin is temporarily down until an admin reviews the report.</p>
                                </div>
                            </div>
                        )}
                        <div className="badge-row">
                            <span className="type-badge">{pin.type || 'Man for Woman'}</span>
                            {getAverageRating(pin.id) > 0 && (
                                <span className="avg-rating-badge">❤️ {getAverageRating(pin.id)}</span>
                            )}
                        </div>

                        <h1 className="detail-hero-title">{pin.title}</h1>

                        <div className="detail-meta-grid">
                            <div className="meta-block">
                                <span className="meta-label">DATE OF ENCOUNTER</span>
                                <span className="meta-value">{formatDate(pin.date) || 'Unknown'}</span>
                            </div>
                            <div className="meta-block">
                                <span className="meta-label">TIME</span>
                                <span className="meta-value">{pin.time || 'Not specified'}</span>
                            </div>
                        </div>

                        <div className="detail-divider"></div>

                        <div className="detail-location-block">
                            <span className="meta-label">LOCATION</span>
                            <div className="location-display">
                                <span className="location-pin-icon">📍</span>
                                <div className="location-texts">
                                    <span className="loc-main">{pin.location || 'Unknown Point'}</span>
                                    <span className="loc-sub">{pin.address || pin.location || 'Unknown Address'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="detail-description-section">
                            <p className="description-text">{pin.description}</p>
                        </div>

                        <div className="detail-rating-section">
                            <span className="rating-label">RATE THIS CONNECTION</span>
                            <div className="heart-rating-group">
                                {[1, 2, 3, 4, 5].map(val => (
                                    <button
                                        key={val}
                                        className={`heart-btn ${val <= currentRating ? 'filled' : ''}`}
                                        onClick={() => handleRate(val)}
                                    >
                                        ❤️
                                    </button>
                                ))}
                            </div>
                            <span className="rating-helper">
                                {currentRating === 0 ? "What do you think?" :
                                    currentRating === 5 ? "SO GOOD! WE CAN FIND THIS PERSON!" :
                                        currentRating === 1 ? "Not many details..." : "Keep searching!"}
                            </span>
                        </div>

                        {/* OWNER VIEW: See LIST OF THREADS */}
                        {pin.ownerUid === user?.uid && (
                            <div className="owner-replies-section">
                                <h3 className="section-title-mini">CONVERSATIONS ({threads.filter(t => String(t.pinId) === String(pin.id)).length})</h3>
                                <div className="replies-list-mini">
                                    {threads.filter(t => String(t.pinId) === String(pin.id)).map(t => (
                                        <div key={t.id} className="reply-card-mini" style={{ borderLeft: (t.lastSenderUid !== user.uid) ? '3px solid var(--missme-cyan)' : '3px solid #333' }}>
                                            <div className="reply-header">
                                                <span className="reply-sender">{t.lastSenderUid === user.uid ? 'YOU' : 'POTENTIAL MISSED CONNECTION'}</span>
                                                <span className="reply-date">{formatDate(t.lastMessageAt)}</span>
                                            </div>
                                            <p className="reply-text" style={{ fontStyle: 'italic', color: '#888' }}>"{t.lastMessagePreview}..."</p>
                                            <button className="reply-back-btn-mini" onClick={() => handleReplyClick(t.responderUid)}>
                                                OPEN CONVERSATION
                                            </button>
                                        </div>
                                    ))}
                                    {threads.filter(t => String(t.pinId) === String(pin.id)).length === 0 && (
                                        <p style={{ color: '#666', fontSize: '0.8rem', textAlign: 'center', padding: '20px' }}>No replies yet.</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* PARTICIPANT VIEW: See MY thread history */}
                        {pin.ownerUid !== user?.uid && threadMessages.length > 0 && (
                            <div className="owner-replies-section">
                                <h3 className="section-title-mini">CONVERSATION HISTORY</h3>
                                <div className="replies-list-mini">
                                    {threadMessages.map(m => (
                                        <div key={m.id} className={`reply-card-mini ${m.senderUid === user?.uid ? 'my-reply' : 'owner-reply'}`} style={{ borderLeft: m.senderUid === pin.ownerUid ? '3px solid var(--missme-cyan)' : '3px solid #666' }}>
                                            <div className="reply-header">
                                                <span className="reply-sender" style={{ color: m.senderUid === pin.ownerUid ? 'var(--missme-cyan)' : 'white' }}>
                                                    {m.senderUid === user?.uid ? 'YOU' : 'OWNER'}
                                                </span>
                                                <span className="reply-date">{formatDate(m.createdAt)}</span>
                                            </div>
                                            <p className="reply-text">{m.content}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="detail-cta-group">
                            {/* TRUE OWNER CONTROLS - Normalizing email for sync */}
                            {(pin.ownerUid === user?.uid || (pin.ownerEmail || '').toLowerCase() === (user?.email || '').toLowerCase()) ? (
                                <div className={`owner-buttons-stack ${pin.isReported ? 'disabled-controls' : ''}`}>
                                    <button className="btn-cyan-glow-reply" onClick={() => navigate('/messages')}>
                                        VIEW REPLIES
                                    </button>
                                    <button
                                        className={`btn-hide-post-detail ${pin.status === 'hidden' ? 'is-private' : ''}`}
                                        onClick={async () => {
                                            const newStatus = pin.status === 'hidden' ? 'public' : 'hidden';
                                            await updatePin(pin.id, { status: newStatus });
                                        }}
                                    >
                                        {pin.status === 'hidden' ? 'UNHIDE FROM PUBLIC MAP' : 'HIDE FROM PUBLIC MAP'}
                                    </button>
                                    <button className="btn-edit-post-detail" onClick={handleEditClick}>
                                        EDIT POST
                                    </button>
                                    <button className="btn-delete-post-detail" onClick={handleDelete}>
                                        DELETE POST
                                    </button>
                                </div>
                            ) : (
                                /* NON-OWNER (User or Admin) -> Can Reply */
                                <>
                                    <button className="btn-cyan-glow-reply" onClick={() => handleReplyClick()}>
                                        {myThread ? 'REPLY TO CONVERSATION' : 'REPLY TO PIN'}
                                    </button>

                                    {/* ADMIN MODERATION CONTROLS (Only visible to admin on OTHER PEOPLES posts) */}
                                    {user?.isAdmin && (
                                        <div className="admin-moderation-stack" style={{ marginTop: '20px', borderTop: '1px solid #333', paddingTop: '15px' }}>
                                            <h4 style={{ color: '#666', fontSize: '0.8rem', marginBottom: '10px', textAlign: 'center' }}>ADMIN MODERATION</h4>
                                            <div className="owner-buttons-stack">
                                                <button
                                                    className={`btn-hide-post-detail ${pin.status === 'hidden' ? 'is-private' : ''}`}
                                                    onClick={async () => {
                                                        const newStatus = pin.status === 'hidden' ? 'public' : 'hidden';
                                                        await updatePin(pin.id, { status: newStatus });
                                                    }}
                                                >
                                                    {pin.status === 'hidden' ? 'UNHIDE (ADMIN)' : 'HIDE (ADMIN)'}
                                                </button>
                                                <button className="btn-delete-post-detail" onClick={handleDelete}>
                                                    DELETE POST (ADMIN)
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            <div className="secondary-row">
                                <button className="btn-dark-outline" onClick={handleHide}>IT'S NOT ME</button>
                                <button className="btn-dark-outline" onClick={handleShare}>SHARE POST</button>
                            </div>

                        </div>

                        <div className="detail-footer-meta">
                            <span className="posted-time">POSTED {formatDate(pin.createdAt)} ({formatRelativeTime(pin.createdAt)})</span>
                            {!pin.isReported && <button className="report-link" onClick={() => setShowReportModal(true)}>REPORT POST</button>}
                        </div>
                    </div>
                </main>

                {
                    showEditModal && (
                        <div className="modal-overlay">
                            <div className="mmc-modal-card edit-pin-modal">
                                <h2 className="modal-title">EDIT YOUR POST</h2>
                                <div className="edit-form">
                                    <div className="edit-input-group">
                                        <label>TITLE</label>
                                        <input
                                            type="text"
                                            className="edit-input"
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="edit-row">
                                        <div className="edit-input-group">
                                            <label>DATE</label>
                                            <DatePicker
                                                selected={editDate}
                                                onChange={(date) => {
                                                    if (!date) return;
                                                    const normalized = new Date(
                                                        date.getFullYear(),
                                                        date.getMonth(),
                                                        date.getDate()
                                                    );
                                                    setEditDate(normalized);
                                                }}
                                                className="edit-input"
                                                dateFormat="MM/dd/yyyy"
                                                required
                                            />
                                        </div>
                                        <div className="edit-input-group">
                                            <label>TIME</label>
                                            <DatePicker
                                                selected={editTime}
                                                onChange={(time) => setEditTime(time)}
                                                showTimeSelect
                                                showTimeSelectOnly
                                                timeIntervals={15}
                                                timeCaption="Time"
                                                dateFormat="h:mm aa"
                                                className="edit-input"
                                                placeholderText="Time (Optional)"
                                                isClearable
                                            />
                                        </div>
                                    </div>
                                    <div className="edit-input-group">
                                        <label>SEARCH NEW LOCATION (Auto-fills Address)</label>
                                        <input
                                            id="edit-location-input"
                                            type="text"
                                            className="edit-input"
                                            placeholder="Search for a business or area..."
                                            defaultValue={editLocation}
                                        />
                                        {editLocation && (
                                            <div className="location-preview-mini">
                                                <span className="preview-label">{editLocation}</span>
                                                {editAddress && <span className="preview-address">{editAddress}</span>}
                                            </div>
                                        )}
                                    </div>
                                    <div className="edit-input-group">
                                        <label>DESCRIPTION</label>
                                        <textarea
                                            className="edit-textarea"
                                            value={editDescription}
                                            onChange={(e) => setEditDescription(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="modal-actions">
                                    <button className="modal-btn-cancel" onClick={() => setShowEditModal(false)}>CANCEL</button>
                                    <button className="modal-btn-confirm" onClick={handleEditSubmit}>SAVE CHANGES</button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {
                    showReplyModal && (
                        <div className="modal-overlay">
                            <div className="expansive-reply-panel">
                                <div className="modal-header-row">
                                    <button
                                        className="block-user-btn"
                                        onClick={handleBlockUser}
                                        title="Bar this user forever"
                                    >
                                        BAR USER
                                    </button>
                                    <h2 className="modal-title">MESSAGE</h2>
                                    <button className="close-modal-btn" onClick={handleCloseReply}>✕</button>
                                </div>


                                <div className="correspondence-history" ref={historyRef}>
                                    {threadMessages.map(m => (
                                        <div
                                            key={m.id}
                                            className={`letter-message ${m.senderUid === user?.uid ? 'sent' : 'received'}`}
                                        >
                                            <div className="letter-header">
                                                <span className="letter-from">
                                                    {m.senderUid === user?.uid ? 'FROM: YOU' : `FROM: ${user.nicknames?.[activeResponderUid ? `${pin.id}_${activeResponderUid}` : `${pin.id}_${user.uid}`] || (m.senderUid === pin.ownerUid ? 'PIN OWNER' : 'POTENTIAL MISSED CONNECTION')}`}
                                                </span>
                                                <span className="letter-date">{formatDate(m.createdAt)} ({formatRelativeTime(m.createdAt)})</span>
                                            </div>
                                            <div className="letter-body">
                                                {m.content}
                                            </div>
                                        </div>
                                    ))}
                                    {threadMessages.length === 0 && (
                                        <div className="letter-note">
                                            No previous correspondence. Write your first message below.
                                        </div>
                                    )}
                                </div>


                                <div className="letter-composer-area">
                                    <div className="composer-header">
                                        <span>REPLY TO THIS CONNECTION</span>
                                        {user && (
                                            <div className="nickname-composer-integration">
                                                {!isRenaming ? (
                                                    <div className="nickname-display">
                                                        <span className="nickname-label">PRIVATE NICKNAME:</span>
                                                        <span
                                                            className="nickname-text"
                                                            onClick={() => {
                                                                setTempNickname(user.nicknames?.[activeResponderUid ? `${pin.id}_${activeResponderUid}` : `${pin.id}_${user.uid}`] || '');
                                                                setIsRenaming(true);
                                                            }}
                                                            title="Click to rename"
                                                        >
                                                            {user.nicknames?.[activeResponderUid ? `${pin.id}_${activeResponderUid}` : `${pin.id}_${user.uid}`] || 'NOT SET'}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div className="nickname-input-group">
                                                        <input
                                                            type="text"
                                                            className="nickname-input"
                                                            placeholder="Rename..."
                                                            value={tempNickname}
                                                            onChange={(e) => setTempNickname(e.target.value)}
                                                            autoFocus
                                                        />
                                                        <button className="nickname-save-btn" onClick={async () => {
                                                            const tid = activeResponderUid ? `${pin.id}_${activeResponderUid}` : `${pin.id}_${user.uid}`;
                                                            await setThreadNickname(tid, tempNickname);
                                                            setIsRenaming(false);
                                                        }}>SAVE</button>
                                                        <button className="rename-btn-mini" onClick={() => setIsRenaming(false)}>CANCEL</button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <textarea
                                        className="letter-textarea"
                                        placeholder="Start writing your message here..."
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        autoFocus
                                    />
                                    <div className="composer-actions">
                                        <button className="letter-cancel-btn" onClick={handleCloseReply}>CANCEL</button>
                                        <button
                                            className="letter-send-btn"
                                            onClick={async () => {
                                                if (isSendingReply) return;
                                                if (!replyText.trim()) return;

                                                // GUARD: owner must have selected a conversation (non-null responderUid)
                                                if (pin.ownerUid === user?.uid && !activeResponderUid) {
                                                    setConfirmConfig({
                                                        isOpen: true,
                                                        title: 'NO RECIPIENT',
                                                        message: "This connection doesn't have a valid recipient yet. Please open a specific conversation from the list above before replying.",
                                                        onConfirm: () => setConfirmConfig(prev => ({ ...prev, isOpen: false })),
                                                        confirmText: 'OK',
                                                        type: 'info'
                                                    });
                                                    return;
                                                }

                                                const savedText = replyText;
                                                try {
                                                    setIsSendingReply(true);
                                                    setReplyText('');
                                                    await addReply(pin.id, savedText, activeResponderUid);
                                                } catch (err) {
                                                    console.error("Reply failed:", err);
                                                    setReplyText(savedText); // restore text so user doesn't lose it
                                                    setConfirmConfig({
                                                        isOpen: true,
                                                        title: 'MESSAGE FAILED',
                                                        message: err.message || 'Failed to send message. Please try again.',
                                                        onConfirm: () => setConfirmConfig(prev => ({ ...prev, isOpen: false })),
                                                        confirmText: 'OK',
                                                        type: 'info'
                                                    });
                                                } finally {
                                                    setIsSendingReply(false);
                                                }
                                            }}
                                            disabled={!replyText.trim() || isSendingReply}
                                        >
                                            SEND MESSAGE
                                        </button>
                                    </div>
                                </div>
                                {/* REMOVED Stacked Actions */}
                            </div>
                        </div>
                    )
                }

                {
                    showReportModal && (
                        <div className="modal-overlay">
                            <div className="mmc-modal-card report-modal">
                                <div className="report-warning-box">
                                    <span className="warning-emoji">🛑</span>
                                    <h2 className="modal-title">REPORT PIN</h2>
                                    <p className="warning-text">
                                        If you falsely claim what we deem a <strong>Good Pin</strong> your account will be suspended for 48 hours your first strike.
                                    </p>
                                </div>
                                <div className="edit-input-group">
                                    <label>REASON FOR REPORTING</label>
                                    <textarea
                                        className="reply-textarea"
                                        placeholder="Example: Offensive language, fake location, etc."
                                        value={reportReason}
                                        onChange={(e) => setReportReason(e.target.value)}
                                    />
                                </div>
                                <div className="modal-actions">
                                    <button className="modal-btn-cancel" onClick={() => setShowReportModal(false)}>CANCEL</button>
                                    <button className="modal-btn-confirm" onClick={handleReportSubmit}>REPORT POST</button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {showAuthModal && (
                    <AuthModal
                        onClose={() => setShowAuthModal(false)}
                        title="CREATE AN ACCOUNT TO CONTINUE"
                        message="Create an account to save connections, message, and get notified."
                    />
                )}


                <ConfirmModal
                    isOpen={confirmConfig.isOpen}
                    title={confirmConfig.title}
                    message={confirmConfig.message}
                    onConfirm={confirmConfig.onConfirm}
                    onCancel={confirmConfig.onCancel || (() => setConfirmConfig(prev => ({ ...prev, isOpen: false })))}
                    confirmText={confirmConfig.confirmText}
                    cancelText={confirmConfig.cancelText}
                    type={confirmConfig.type}
                />
                <BottomNav />
            </div >
        </APIProvider >
    );
};

export default ConnectionDetail;

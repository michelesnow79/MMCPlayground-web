import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { APIProvider } from '@vis.gl/react-google-maps';
import { useApp } from '../context/AppContext';
import BottomNav from '../components/BottomNav';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import './ConnectionDetail.css';
import ConfirmModal from '../components/ConfirmModal';
import { fuzzAndProcessLocation } from '../utils/locationHelper';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const ConnectionDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, pins, replies, addReply, updateReply, ratings, ratePin, getAverageRating, hidePin, updatePin, removePin, formatDate, hiddenPins, loading, isSuspended, canStartNewThread } = useApp();

    const pin = pins.find(p => String(p.id) === String(id));
    const currentRating = ratings[pin?.id] || 0;

    const [replyText, setReplyText] = React.useState('');
    const [showReplyModal, setShowReplyModal] = React.useState(false);
    const [showReportModal, setShowReportModal] = React.useState(false);
    const [reportReason, setReportReason] = React.useState('');
    const [isEditing, setIsEditing] = React.useState(false);

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

    // Google Places Autocomplete for Edit Modal
    React.useEffect(() => {
        if (!showEditModal || !window.google || !window.google.maps || !window.google.maps.places) return;

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
    }, [showEditModal]);

    if (loading) {
        return <div className="detail-loading">LOADING CONNECTION...</div>;
    }

    const handleRate = (val) => {
        if (!user) {
            navigate('/login');
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

    // Find if current user already replied to this pin
    const existingReply = replies.find(r => String(r.pinId) === String(id) && r.senderEmail === user?.email);

    const handleReplyClick = async () => {
        if (!user) {
            navigate('/login');
            return;
        }

        if (isSuspended()) {
            const allowed = await canStartNewThread(id);
            if (!allowed) {
                setConfirmConfig({
                    isOpen: true,
                    title: 'RESTRICTED ACCESS',
                    message: 'Your account is on hold. You can only reply to ongoing conversations, not start new ones.',
                    onConfirm: () => setConfirmConfig(prev => ({ ...prev, isOpen: false })),
                    cancelText: 'CLOSE',
                    confirmText: 'OK',
                    type: 'info'
                });
                return;
            }
        }

        if (existingReply) {
            setReplyText(existingReply.content);
            setIsEditing(true);
        } else {
            setReplyText('');
            setIsEditing(false);
        }
        setShowReplyModal(true);
    };

    const handleReplySubmit = () => {
        if (!replyText.trim()) return;

        if (isEditing && existingReply) {
            updateReply(existingReply.id, replyText);
        } else {
            addReply(id, replyText);
        }
        setShowReplyModal(false);
    };

    const handleHide = () => {
        if (pin) {
            hidePin(pin.id);
            navigate('/map');
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
        console.log("🔴 DELETE BUTTON CLICKED for pin:", pin?.id);

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
                await removePin(pin.id);
                navigate('/map');
            },
            onCancel: () => setConfirmConfig(prev => ({ ...prev, isOpen: false })),
            confirmText: 'DELETE FOREVER',
            cancelText: 'KEEP POST',
            type: 'danger'
        });
    };

    const handleEditClick = () => {
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
        if (pin) {
            setEditTitle(pin.title);
            setEditDescription(pin.description);
            setEditDate(pin.date ? new Date(pin.date) : new Date());
            // Attempt to parse time string back to Date object for the picker
            if (pin.time) {
                try {
                    const [time, modifier] = pin.time.split(' ');
                    let [hours, minutes] = time.split(':');
                    if (hours === '12') hours = '00';
                    if (modifier === 'PM') hours = parseInt(hours, 10) + 12;
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
        }
    };

    const handleEditSubmit = async () => {
        if (!editTitle.trim() || !editDescription.trim()) return;

        await updatePin(pin.id, {
            title: editTitle.toUpperCase(),
            description: editDescription,
            location: editLocation,
            address: editAddress,
            lat: editCoords?.lat || pin.lat,
            lng: editCoords?.lng || pin.lng,
            date: editDate.toISOString(),
            time: editTime ? editTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
        });
        setShowEditModal(false);
    };

    const handleReportSubmit = () => {
        if (!reportReason.trim()) return;
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
        if (pins.length > 0) {
            console.log("MMC DEBUG: Available Pin IDs:", pins.map(p => p.id));
        }
    }, [id, pins]);

    // Find the pin. We use String comparison to be safe with param types.
    // (Moved to top of component)

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
                    <button className="nav-back-arrow" onClick={() => navigate(-1)}>
                        <span className="arrow-icon">←</span> BACK
                    </button>
                    <div className="detail-logo-center">
                        <span className="logo-text-bangers" onClick={() => navigate('/')}>MISS ME CONNECTION</span>
                    </div>
                    <div className="detail-nav-placeholder"></div>
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
                                <span className="meta-label">DATE</span>
                                <span className="meta-value">{formatDate(pin.date) || 'Wednesday, Feb 11, 2026'}</span>
                            </div>
                            <div className="meta-block">
                                <span className="meta-label">TIME</span>
                                <span className="meta-value">{pin.time || '07:34 PM'}</span>
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

                        {pin.ownerEmail === user?.email && (
                            <div className="owner-replies-section">
                                <h3 className="section-title-mini">REPLIES ({replies.filter(r => r.pinId === pin.id).length})</h3>
                                <div className="replies-list-mini">
                                    {replies.filter(r => r.pinId === pin.id).map(r => (
                                        <div key={r.id} className="reply-card-mini">
                                            <div className="reply-header">
                                                <span className="reply-sender">{r.senderEmail === user.email ? 'YOU' : 'PARTICIPANT'}</span>
                                                <span className="reply-date">{formatDate(r.timestamp)}</span>
                                            </div>
                                            <p className="reply-text">{r.content}</p>
                                            {r.senderEmail !== user.email && (
                                                <button className="reply-back-btn-mini" onClick={handleReplyClick}>
                                                    REPLY BACK
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="detail-cta-group">
                            {(pin.ownerUid === user?.uid || pin.ownerEmail === user?.email || user?.isAdmin) ? (
                                <div className={`owner-buttons-stack ${pin.isReported ? 'disabled-controls' : ''}`}>
                                    <button className="btn-cyan-glow-reply" onClick={() => navigate('/messages')}>
                                        VIEW REPLIES
                                    </button>
                                    <button className="btn-edit-post-detail" onClick={handleEditClick}>
                                        EDIT POST
                                    </button>
                                    <button className="btn-delete-post-detail" onClick={handleDelete}>
                                        DELETE POST
                                    </button>
                                </div>
                            ) : (
                                <button className="btn-cyan-glow-reply" onClick={handleReplyClick}>
                                    {existingReply ? 'EDIT MY REPLY' : 'REPLY TO THIS POST'}
                                </button>
                            )}

                            <div className="secondary-row">
                                <button className="btn-dark-outline" onClick={handleHide}>IT'S NOT ME</button>
                                <button className="btn-dark-outline" onClick={handleShare}>SHARE POST</button>
                            </div>

                        </div>

                        <div className="detail-footer-meta">
                            <span className="posted-time">POSTED {pin.time_display || '2H AGO'}</span>
                            {!pin.isReported && <button className="report-link" onClick={() => setShowReportModal(true)}>REPORT POST</button>}
                        </div>
                    </div>
                </main>

                {
                    showEditModal && (
                        <div className="modal-overlay">
                            <div className="modal-card edit-pin-modal">
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
                                                onChange={(date) => setEditDate(date)}
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
                            <div className="modal-card reply-modal">
                                <h2 className="modal-title">{isEditing ? 'EDIT YOUR REPLY' : 'REPLY TO POST'}</h2>
                                <textarea
                                    className="reply-textarea"
                                    placeholder="Type your message here..."
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                />
                                <div className="modal-actions">
                                    <button className="modal-btn-cancel" onClick={() => setShowReplyModal(false)}>CANCEL</button>
                                    <button className="modal-btn-confirm" onClick={handleReplySubmit}>
                                        {isEditing ? 'UPDATE REPLY' : 'SEND REPLY'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {
                    showReportModal && (
                        <div className="modal-overlay">
                            <div className="modal-card report-modal">
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
                                    <button className="modal-btn-confirm report-submit" onClick={handleReportSubmit}>SUBMIT REPORT</button>
                                </div>
                            </div>
                        </div>
                    )
                }

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

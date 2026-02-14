import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import BottomNav from '../components/BottomNav';
import './ConnectionDetail.css';

const ConnectionDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, pins, replies, addReply, updateReply, ratings, ratePin, getAverageRating, hidePin, formatDate, hiddenPins } = useApp();

    const [replyText, setReplyText] = React.useState('');
    const [showReplyModal, setShowReplyModal] = React.useState(false);
    const [isEditing, setIsEditing] = React.useState(false);

    if (loading) {
        return <div className="detail-loading">LOADING CONNECTION...</div>;
    }

    const pin = pins.find(p => String(p.id) === String(id));

    const currentRating = ratings[pin?.id] || 0;

    const handleRate = (val) => {
        if (pin) ratePin(pin.id, val);
    };

    // Find if current user already replied to this pin
    const existingReply = replies.find(r => String(r.pinId) === String(id) && r.senderEmail === user?.email);

    const handleReplyClick = () => {
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
            addReply(Number(id), replyText);
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

    // Debugging
    useEffect(() => {
        console.log(`MMC DEBUG: ConnectionDetail active. ID from params: "${id}"`);
        if (pins.length > 0) {
            console.log("MMC DEBUG: Available Pin IDs:", pins.map(p => p.id));
        }
    }, [id, pins]);

    // Find the pin. We use String comparison to be safe with param types.
    // (Moved to top of component)

    if (!pin || hiddenPins.includes(pin.id)) {
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
        <div className="detail-page-wrapper">
            <header className="detail-top-nav">
                <button className="nav-back-arrow" onClick={() => navigate(-1)}>
                    <span className="arrow-icon">←</span> BACK
                </button>
                <div className="detail-logo-center">
                    <span className="logo-text-bangers">MISS ME CONNECTION</span>
                </div>
                <div className="detail-nav-placeholder"></div>
            </header>

            <main className="detail-content-area">
                <div className="premium-detail-card">
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
                                <span className="loc-main">{pin.location?.split(',')[0] || 'Unknown Point'}</span>
                                <span className="loc-sub">{pin.location || 'Unknown Address'}</span>
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
                        {pin.ownerEmail === user?.email ? (
                            <button className="btn-cyan-glow-reply" onClick={() => navigate('/messages')}>
                                VIEW REPLIES
                            </button>
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
                        <button className="report-link">REPORT POST</button>
                    </div>
                </div>
            </main>

            {showReplyModal && (
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
            )}

            <BottomNav />
        </div>
    );
};

export default ConnectionDetail;

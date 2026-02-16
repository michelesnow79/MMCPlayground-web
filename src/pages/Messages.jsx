import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import BottomNav from '../components/BottomNav';
import AuthModal from '../components/AuthModal';
import logoAsset from '../assets/heart-logo.svg';
import './Messages.css';
import ConfirmModal from '../components/ConfirmModal';

const Messages = () => {
    const { user, loading, pins, replies, notifications, formatDate, markNotificationsAsRead, isSuspended, hasProbation } = useApp();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = React.useState('received');
    const [confirmConfig, setConfirmConfig] = React.useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
        type: 'danger'
    });

    // Clear notifications when viewing the messages page
    React.useEffect(() => {
        if (user && activeTab === 'notices') {
            markNotificationsAsRead();
        }
    }, [user, activeTab, markNotificationsAsRead]);

    if (loading) {
        return <div className="loading-screen-missme">LOADING MESSAGES...</div>;
    }

    if (!user) return <AuthModal />;

    // Replies I received (to my pins)
    const myPins = pins.filter(p => p.ownerEmail === user.email);
    const receivedReplies = replies.filter(r => myPins.some(p => p.id === r.pinId));

    // Replies I sent (to others' pins)
    const sentReplies = replies.filter(r => r.senderEmail === user.email);

    // Filtered notifications
    const myNotifs = notifications || [];

    const renderReplyItem = (reply, isSent) => {
        const pin = pins.find(p => p.id === reply.pinId);

        return (
            <div
                key={reply.id}
                className="thread-item-premium"
                onClick={() => pin ? navigate(`/browse/${pin.id}`) : null}
                style={{ opacity: pin ? 1 : 0.7 }}
            >
                <div className="thread-avatar-circle">
                    <span className="thread-logo-mini">{pin ? '❤️' : '🚫'}</span>
                </div>
                <div className="thread-content-block">
                    <div className="thread-top-line">
                        <h3 className="thread-title-text">{pin ? pin.title : 'DELETED CONNECTION'}</h3>
                        <span className="thread-time-meta">{formatDate(reply.createdAt) || 'Recent'}</span>
                    </div>
                    <p className="thread-preview-text">
                        <span className="sender-label">{isSent ? 'You: ' : 'Reply: '}</span>
                        {reply.content}
                    </p>
                    {!pin && <p className="deleted-tag">This post was removed by a moderator</p>}
                </div>
                {pin && (
                    <div className="thread-indicator">
                        <span className="chevron-right">❯</span>
                    </div>
                )}
            </div>
        );
    };

    const renderNotifItem = (notif) => (
        <div key={notif.id} className="thread-item-premium moderation-notice-item">
            <div className="thread-avatar-circle notice-avatar">
                <span className="thread-logo-mini">{notif.type === 'moderation' ? '⚠️' : '🔔'}</span>
            </div>
            <div className="thread-content-block">
                <div className="thread-top-line">
                    <h3 className="thread-title-text">{notif.type === 'moderation' ? 'MODERATION NOTICE' : 'SYSTEM NOTIFICATION'}</h3>
                    <span className="thread-time-meta">{formatDate(notif.createdAt) || 'Recent'}</span>
                </div>
                <p className="thread-preview-text notice-body">
                    {notif.message}
                </p>
            </div>
        </div>
    );

    const renderPinItem = (pin) => (
        <div
            key={pin.id}
            className="thread-item-premium my-pin-item"
            onClick={() => navigate(`/browse/${pin.id}`)}
        >
            <div className="thread-avatar-circle pin-avatar">
                <span className="thread-logo-mini">📍</span>
            </div>
            <div className="thread-content-block">
                <div className="thread-top-line">
                    <h3 className="thread-title-text">{pin.title}</h3>
                    <span className="thread-time-meta">{pin.date ? formatDate(pin.date) : 'Active'}</span>
                </div>
                <p className="thread-preview-text">
                    {pin.description.substring(0, 60)}...
                </p>
                <div className="pin-meta-row">
                    <span className="reply-count-badge">
                        {replies.filter(r => r.pinId === pin.id).length} REPLIES
                    </span>
                    {pin.isReported && <span className="reported-badge-mini">UNDER REVIEW</span>}
                    <button
                        className="pin-delete-btn-mini"
                        onClick={(e) => {
                            e.stopPropagation();
                            setConfirmConfig({
                                isOpen: true,
                                title: 'DELETE POST?',
                                message: 'ARE YOU SURE YOU WANT TO DELETE THIS POST FOREVER?',
                                onConfirm: () => {
                                    removePin(pin.id);
                                    setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                                },
                                confirmText: 'DELETE',
                                cancelText: 'CANCEL',
                                type: 'danger'
                            });
                        }}
                    >
                        DELETE
                    </button>
                </div>
            </div>
            <div className="thread-indicator">
                <span className="chevron-right">❯</span>
            </div>
        </div>
    );

    return (
        <div className="messages-page-pro">
            <header className="messages-top-bar">
                <div className="messages-logo-group" onClick={() => navigate('/')}>
                    <img src={logoAsset} alt="Logo" className="header-heart-logo-messages" />
                    <h1 className="messages-main-title">MESSAGES</h1>
                </div>
                <div className="user-status-badges">
                    {hasProbation() && <span className="status-badge review">⚠️ UNDER 30-DAY REVIEW</span>}
                    {isSuspended() && <span className="status-badge suspended">🛑 ACCOUNT ON HOLD</span>}
                </div>
            </header>

            <div className="tab-control-group">
                <button
                    className={`tab-btn ${activeTab === 'received' ? 'active' : ''}`}
                    onClick={() => setActiveTab('received')}
                >
                    POSTS ({myPins.length})
                </button>
                <button
                    className={`tab-btn ${activeTab === 'sent' ? 'active' : ''}`}
                    onClick={() => setActiveTab('sent')}
                >
                    REPLIES ({sentReplies.length})
                </button>
                <button
                    className={`tab-btn ${activeTab === 'notices' ? 'active' : ''}`}
                    onClick={() => setActiveTab('notices')}
                >
                    NOTICES ({myNotifs.length})
                </button>
            </div>

            <main className="messages-list-scroll">
                {activeTab === 'received' ? (
                    <div className="thread-stack">
                        {myPins.length > 0 ? (
                            myPins.map(p => renderPinItem(p))
                        ) : (
                            <div className="empty-messages">
                                <span className="empty-icon">📍</span>
                                <p>You haven't posted any connections yet.</p>
                            </div>
                        )}
                    </div>
                ) : activeTab === 'sent' ? (
                    <div className="thread-stack">
                        {sentReplies.length > 0 ? (
                            sentReplies.map(r => renderReplyItem(r, true))
                        ) : (
                            <div className="empty-messages">
                                <span className="empty-icon">📝</span>
                                <p>You haven't replied to any posts.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="thread-stack">
                        {myNotifs.length > 0 ? (
                            myNotifs.map(n => renderNotifItem(n))
                        ) : (
                            <div className="empty-messages">
                                <span className="empty-icon">🔔</span>
                                <p>No system notifications.</p>
                            </div>
                        )}
                    </div>
                )}
            </main>

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

export default Messages;

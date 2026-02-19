import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import BottomNav from '../components/BottomNav';
import AuthModal from '../components/AuthModal';
import logoAsset from '../assets/heart-logo.svg';
import './Messages.css';
import ConfirmModal from '../components/ConfirmModal';

const Messages = () => {
    const { user, loading, pins, threads, notifications, formatDate, markNotificationsAsRead, isSuspended, hasProbation, removePin, markThreadAsRead } = useApp();
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
        if (user) {
            markNotificationsAsRead();
        }
    }, [user, markNotificationsAsRead]);

    if (loading) {
        return <div className="loading-screen-missme">LOADING MESSAGES...</div>;
    }

    if (!user) return <AuthModal />;

    // Defensively default all collections
    const pinsSafe = Array.isArray(pins) ? pins : [];
    const threadsSafe = Array.isArray(threads) ? threads : [];
    const notificationsSafe = Array.isArray(notifications) ? notifications : [];

    const myNotifs = notificationsSafe;

    // Replies I received (to my pins)
    const myPins = pinsSafe.filter(p => p && (p.ownerUid === user.uid || p.ownerEmail === user.email));

    // Threads I am participating in
    const myConversations = threadsSafe.map(t => {
        if (!t) return null;
        // Try to find the pin, but proceed even if it's missing (deleted pin)
        const pin = pinsSafe.find(p => p && String(p.id) === String(t.pinId));
        const isOwner = t.ownerUid === user.uid;
        const myReadTime = isOwner ? t.ownerLastReadAt : t.responderLastReadAt;

        // Safe timestamp comparison handling Firestore objects or Dates
        // Handle Firestore Timestamp object (has toMillis) or Date or number
        const lastMsgTime = t.lastMessageAt?.toMillis ? t.lastMessageAt.toMillis() : (t.lastMessageAt?.getTime ? t.lastMessageAt.getTime() : (new Date(t.lastMessageAt || 0).getTime()));
        const readTime = myReadTime?.toMillis ? myReadTime.toMillis() : (myReadTime?.getTime ? myReadTime.getTime() : (new Date(myReadTime || 0).getTime()));

        const isUnread = lastMsgTime > readTime;

        return {
            thread: t,
            pin, // Can be undefined
            isUnread,
            latestReply: {
                content: t.lastMessagePreview || '',
                timestamp: t.lastMessageAt,
                senderUid: t.lastSenderUid
            }
        };
    }).filter(Boolean);

    // Inbox: People replying to ME (I am the owner)
    // Hybrid Identity: Check UID first, fallback to Email match if needed
    const myEmail = user?.email?.toLowerCase() || '';
    const inboundConversations = myConversations.filter(c => {
        const isOwnerByUid = c.thread.ownerUid === user.uid;
        const isOwnerByEmail = c.thread.ownerEmail && c.thread.ownerEmail === myEmail;
        return isOwnerByUid || isOwnerByEmail;
    });

    // Outbox: Pins I reached out to (I am NOT the owner)
    const outboundConversations = myConversations.filter(c => {
        const isOwnerByUid = c.thread.ownerUid === user.uid;
        const isOwnerByEmail = c.thread.ownerEmail && c.thread.ownerEmail === myEmail;
        return !isOwnerByUid && !isOwnerByEmail;
    });

    // --- DEBUG: Verify Data Flow ---
    if (import.meta.env.DEV) {
        const missingPins = myConversations.filter(c => !c.pin).length;
        console.log(`🔎 MESSAGES DEBUG: User [${user?.uid}]`);
        console.log(`   - Total Processed: ${myConversations.length}`);
        console.log(`   - Inbound (My Pins): ${inboundConversations.length}`);
        console.log(`   - Outbound (My Replies): ${outboundConversations.length}`);
        console.log(`   - Threads with Missing Pins (Deleted?): ${missingPins}`);
    }
    // -------------------------------

    const renderReplyItem = (reply, isSent) => {
        if (!reply) return null;
        const pin = pinsSafe.find(p => p && p.id === reply.pinId);

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

    const renderPinItem = (pin) => {
        if (!pin) return null;
        const pinThreads = threadsSafe.filter(t => t && String(t.pinId) === String(pin.id));
        const hasUnreadInPin = pinThreads.some(t => t.lastSenderUid && t.lastSenderUid !== user.uid);

        return (
            <div
                key={pin.id}
                className={`thread-item-premium my-pin-item ${hasUnreadInPin ? 'has-unread-glow' : ''}`}
                onClick={() => navigate(`/browse/${pin.id}`)}
            >
                <div className="thread-avatar-circle pin-avatar">
                    <span className="thread-logo-mini">{hasUnreadInPin ? '📩' : '📍'}</span>
                </div>
                <div className="thread-content-block">
                    <div className="thread-top-line">
                        <div className="title-group-unread">
                            <h3 className="thread-title-text">{pin.title}</h3>
                            {hasUnreadInPin && <span className="new-msg-tag">NEW REPLY</span>}
                        </div>
                        <span className="thread-time-meta">{pin.date ? formatDate(pin.date) : 'Active'}</span>
                    </div>
                    <p className="thread-preview-text">
                        {(pin.description || '').substring(0, 60)}...
                    </p>
                    <div className="pin-meta-row">
                        <span className={`reply-count-badge ${hasUnreadInPin ? 'highlight-cyan' : ''}`}>
                            {pinThreads.length} {pinThreads.length === 1 ? 'CONVERSATION' : 'CONVERSATIONS'}
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
    };

    const renderConvoItem = (convo) => {
        const { pin, latestReply, isUnread, thread } = convo;

        // DEBUG: Trace execution
        if (import.meta.env.DEV) console.log(`RENDER ITEM for thread ${thread?.id}: user=${!!user}, thread=${!!thread}`);

        if (!user || !thread) return null;

        // Use thread data for directionality, falling back to pin if needed for legacy data
        const threadOwnerUid = thread.ownerUid;
        const isOutbound = threadOwnerUid !== user.uid;
        const isDeleted = !pin;

        return (
            <div
                key={thread.id}
                className={`thread-item-premium ${isUnread ? 'has-unread-glow' : ''} ${isOutbound ? 'outbound-style' : ''}`}
                onClick={() => {
                    if (!pin) return; // Cannot navigate to a deleted pin

                    // Mark as read immediately on click
                    markThreadAsRead(thread.id);

                    // Logic: If I am the owner, I'm replying to the responder. If I'm the responder, I'm replying to the owner (null target)
                    const targetResponderUid = (isOutbound) ? null : thread.responderUid;

                    navigate(`/browse/${pin.id}`, {
                        state: {
                            openReply: true,
                            responderUid: targetResponderUid,
                            fromMessages: true
                        }
                    });
                }}
                style={{ opacity: pin ? 1 : 0.6, cursor: pin ? 'pointer' : 'default' }}
            >
                <div className="thread-avatar-circle">
                    <span className="thread-logo-mini">{pin ? (isOutbound ? '📤' : '📥') : '🚫'}</span>
                </div>
                <div className="thread-content-block">
                    <div className="thread-top-line">
                        <div className="title-group-vertical">
                            <h3 className="thread-title-text">
                                {pin ? pin.title : 'DELETED CONNECTION'}
                            </h3>

                        </div>
                        <span className="thread-time-meta">
                            {latestReply?.timestamp ? formatDate(latestReply.timestamp) : 'Recent'}
                        </span>
                    </div>
                    <div className="thread-tags-row">
                        {isOutbound && <span className="sent-label-tag">MY REPLY</span>}
                        {!pin && <span className="deleted-status-tag">POST REMOVED</span>}
                    </div>

                    <p className="thread-preview-text">
                        <span className="sender-label">
                            {latestReply?.senderUid === user.uid ? 'You: ' : 'From: '}
                        </span>
                        {latestReply?.content ? latestReply.content : 'Message sent...'}
                    </p>
                </div>
                {pin && (
                    <div className="thread-indicator">
                        <span className="chevron-right">❯</span>
                    </div>
                )}
            </div>
        );
    };

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
                    MY REPLIES ({outboundConversations.length})
                </button>
                <button
                    className={`tab-btn ${activeTab === 'inbox' ? 'active' : ''}`}
                    onClick={() => setActiveTab('inbox')}
                    title="All direct chats regarding your posts"
                >
                    INBOX ({inboundConversations.length})
                </button>
                <button
                    className={`tab-btn ${activeTab === 'notices' ? 'active' : ''}`}
                    onClick={() => setActiveTab('notices')}
                >
                    NOTICES ({myNotifs.length})
                </button>
            </div>

            <main className="messages-list-scroll">
                {/* DEBUG: Trace Active Tab */}
                {import.meta.env.DEV && console.log(`RENDER MAIN: ActiveTab=${activeTab}, OutboundLen=${outboundConversations.length}`)}

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
                        {outboundConversations.length > 0 ? (
                            outboundConversations.map(convo => renderConvoItem(convo))
                        ) : (
                            <div className="empty-messages">
                                <span className="empty-icon">📤</span>
                                <p>You haven't replied to any pins yet.</p>
                            </div>
                        )}
                    </div>
                ) : activeTab === 'inbox' ? (
                    <div className="thread-stack">
                        {inboundConversations.length > 0 ? (
                            inboundConversations.map(convo => renderConvoItem(convo))
                        ) : (
                            <div className="empty-messages">
                                <span className="empty-icon">📥</span>
                                <p>No one has replied to your pins lately.</p>
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

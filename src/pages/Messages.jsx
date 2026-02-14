import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import BottomNav from '../components/BottomNav';
import './Messages.css';

const Messages = () => {
    const { user, pins, replies, formatDate } = useApp();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = React.useState('received');

    // Replies I received (to my pins)
    const myPins = pins.filter(p => p.ownerEmail === user.email);
    const receivedReplies = replies.filter(r => myPins.some(p => p.id === r.pinId));

    // Replies I sent (to others' pins)
    const sentReplies = replies.filter(r => r.senderEmail === user.email);

    const renderReplyItem = (reply, isSent) => {
        const pin = pins.find(p => p.id === reply.pinId);
        if (!pin) return null;

        return (
            <div
                key={reply.id}
                className="thread-item-premium"
                onClick={() => navigate(`/browse/${pin.id}`)}
            >
                <div className="thread-avatar-circle">
                    <span className="thread-logo-mini">❤️</span>
                </div>
                <div className="thread-content-block">
                    <div className="thread-top-line">
                        <h3 className="thread-title-text">{pin.title}</h3>
                        <span className="thread-time-meta">{reply.timestamp ? formatDate(reply.timestamp) : 'Recent'}</span>
                    </div>
                    <p className="thread-preview-text">
                        <span className="sender-label">{isSent ? 'You: ' : 'Reply: '}</span>
                        {reply.content}
                    </p>
                </div>
                <div className="thread-indicator">
                    <span className="chevron-right">❯</span>
                </div>
            </div>
        );
    };

    return (
        <div className="messages-page-pro">
            <header className="messages-top-bar">
                <h1 className="messages-main-title">MESSAGES</h1>
            </header>

            <div className="tab-control-group">
                <button
                    className={`tab-btn ${activeTab === 'received' ? 'active' : ''}`}
                    onClick={() => setActiveTab('received')}
                >
                    POST REPLIES ({receivedReplies.length})
                </button>
                <button
                    className={`tab-btn ${activeTab === 'sent' ? 'active' : ''}`}
                    onClick={() => setActiveTab('sent')}
                >
                    MY REPLIES ({sentReplies.length})
                </button>
            </div>

            <main className="messages-list-scroll">
                {activeTab === 'received' ? (
                    <div className="thread-stack">
                        {receivedReplies.length > 0 ? (
                            receivedReplies.map(r => renderReplyItem(r, false))
                        ) : (
                            <div className="empty-messages">
                                <span className="empty-icon">✉️</span>
                                <p>No replies to your posts yet.</p>
                            </div>
                        )}
                    </div>
                ) : (
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
                )}
            </main>

            <BottomNav />
        </div>
    );
};

export default Messages;

import React from 'react';
import { useNavigate } from 'react-router-dom';
import telemetry from '../utils/telemetry';
import './AuthModal.css';

const AuthModal = ({ onClose, title, message }) => {
    const navigate = useNavigate();

    // Default title if not provided
    const displayTitle = title || "CREATE AN ACCOUNT TO CONTINUE";
    // Default message if not provided
    const displayMessage = message || "Create an account to save connections, message, and get notified.";

    const handleJoin = () => {
        telemetry.trackEvent('join_now_click', { source: 'auth_modal' });
        navigate('/login', { state: { mode: 'signup' } });
    };

    const handleLogin = () => {
        telemetry.trackEvent('login_click', { source: 'auth_modal' });
        navigate('/login', { state: { mode: 'login' } });
    };

    const handleBack = () => {
        if (onClose) onClose();
        else navigate(-1);
    };

    React.useEffect(() => {
        document.body.classList.add('modal-open');
        return () => {
            document.body.classList.remove('modal-open');
        };
    }, []);

    return (
        <div className="auth-modal-overlay">
            <div className="auth-modal-card">
                <div className="auth-modal-header">
                    <div className="alert-icon">⚠️</div>
                    <h2 className="auth-modal-title">{displayTitle}</h2>
                </div>

                <p className="auth-modal-text">
                    {displayMessage}
                </p>

                <div className="auth-modal-actions">
                    <button className="auth-modal-btn login-btn-cyan" onClick={handleJoin}>
                        JOIN NOW
                    </button>
                    <button className="auth-modal-btn exit-btn-outline" onClick={handleLogin}>
                        LOG IN
                    </button>
                    <button className="auth-modal-text-link" onClick={handleBack}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AuthModal;

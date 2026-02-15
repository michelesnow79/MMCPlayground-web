import React from 'react';
import { useNavigate } from 'react-router-dom';
import './AuthModal.css';

const AuthModal = ({ onClose }) => {
    const navigate = useNavigate();

    const handleLogin = () => {
        navigate('/login');
    };

    const handleExit = () => {
        navigate('/map');
        if (onClose) onClose();
    };

    return (
        <div className="auth-modal-overlay">
            <div className="auth-modal-card">
                <div className="auth-modal-header">
                    <div className="alert-icon">⚠️</div>
                    <h2 className="auth-modal-title">LOGIN REQUIRED</h2>
                </div>

                <p className="auth-modal-text">
                    This feature is for registered members only. Please sign in or create an account to view your messages and profile settings.
                </p>

                <div className="auth-modal-actions">
                    <button className="auth-modal-btn login-btn-cyan" onClick={handleLogin}>
                        LOG IN / SIGN UP
                    </button>
                    <button className="auth-modal-btn exit-btn-outline" onClick={handleExit}>
                        EXIT TO MAP
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AuthModal;

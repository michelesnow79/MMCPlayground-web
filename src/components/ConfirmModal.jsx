import React from 'react';
import './ConfirmModal.css';

const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel, confirmText = "CONFIRM", cancelText = "CANCEL", type = "danger" }) => {
    if (!isOpen) return null;

    return (
        <div className="confirm-modal-overlay">
            <div className={`confirm-modal-card ${type}`}>
                <div className="confirm-modal-header">
                    <div className="confirm-icon">{type === 'danger' ? '⚠️' : '🔔'}</div>
                    <h2 className="confirm-modal-title">{title}</h2>
                </div>

                <p className="confirm-modal-text">{message}</p>

                <div className="confirm-modal-actions">
                    <button className="confirm-modal-btn confirm-btn" onClick={onConfirm}>
                        {confirmText}
                    </button>
                    <button className="confirm-modal-btn cancel-btn" onClick={onCancel}>
                        {cancelText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;

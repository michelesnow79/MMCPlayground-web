import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { useNavigate } from 'react-router-dom';

/**
 * COMPONENT SNIPPETS:
 * These parts should be integrated into your existing Account.jsx file.
 */

const AccountSnippet = () => {
    const navigate = useNavigate();
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    const onConfirmDelete = () => {
        // TRIGGER SERER METHOD
        Meteor.call('accounts.deleteCompletely', (err) => {
            if (err) {
                console.error("Deletion failed:", err.reason);
                alert("Could not delete account. Please contact support.");
            } else {
                // FORCE LOGOUT AND REDIRECT
                Meteor.logout();
                navigate('/');
            }
        });
    };

    return (
        <>
            {/* 1. THE BUTTON (Put this inside your Danger Zone) */}
            <button className="btn-delete-account" onClick={() => setShowDeleteModal(true)}>
                Delete Account
            </button>

            {/* 2. THE PREMIUM MODAL (Put this at the very bottom of your return JSX) */}
            {showDeleteModal && (
                <div className="modal-overlay">
                    <div className="modal-card">
                        <h2 className="modal-title">DELETE ACCOUNT?</h2>
                        <p className="modal-text">THIS ACTION IS PERMANENT. YOU WILL LOSE ALL YOUR CONNECTIONS AND PROFILE DATA.</p>
                        <div className="modal-actions">
                            <button className="modal-btn-cancel" onClick={() => setShowDeleteModal(false)}>CANCEL</button>
                            <button className="modal-btn-confirm" onClick={onConfirmDelete}>DELETE FOREVER</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

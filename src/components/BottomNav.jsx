import React from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import './BottomNav.css';

// Importing assets
import mapIcon from '../assets/map_icon.svg';
import browseIcon from '../assets/browse_icon.svg';
import messagesIcon from '../assets/messages_icon.svg';
import logoIcon from '../assets/heart-logo.svg';
import accountIcon from '../assets/account_icon.svg';

const BottomNav = ({ onAddClick, showAddButton }) => {
    const { hasNewNotifications } = useApp();

    return (
        <nav className="bottom-nav">
            <NavLink to="/map" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 2.88-2.88 7.19-5 9.88C9.08 16.19 7 11.88 7 9z" />
                    <circle cx="12" cy="9" r="2.5" />
                </svg>
                <span className="nav-label">Map</span>
            </NavLink>
            <NavLink to="/browse" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h10V7H7v3zm0 4h10v-3H7v3zm0 4h10v-3H7v3z" />
                </svg>
                <span className="nav-label">Browse</span>
            </NavLink>

            {showAddButton && (
                <div className="nav-fab-container">
                    <button className="nav-fab-btn" onClick={() => {
                        console.log("MMC DEBUG: + Button clicked in BottomNav");
                        onAddClick();
                    }}>
                        <div className="cyan-fab-circle">
                            <span className="fab-plus">+</span>
                        </div>
                    </button>
                </div>
            )}

            <NavLink to="/messages" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
                <div className="nav-icon-wrapper">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" />
                    </svg>
                    {hasNewNotifications && <div className="nav-notification">!</div>}
                </div>
                <span className="nav-label">Messages</span>
            </NavLink>
            <NavLink to="/account" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
                </svg>
                <span className="nav-label">Account</span>
            </NavLink>
        </nav>
    );
};

export default BottomNav;

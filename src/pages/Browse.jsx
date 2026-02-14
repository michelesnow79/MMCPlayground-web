import React from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import './Browse.css';

import { useApp } from '../context/AppContext';

const Browse = () => {
    const navigate = useNavigate();
    const { pins, hiddenPins, getAverageRating } = useApp();

    const sanitizeLocation = (loc) => {
        if (!loc) return "";
        return loc.replace(/^\d+[\s,.]*/, "").trim() || "Public Area";
    };

    return (
        <div className="browse-container">
            <div className="browse-header">
                <h1>MY MISSED CONNECTIONS</h1>
            </div>

            <div className="connections-list">
                {pins.filter(p => !hiddenPins.includes(p.id)).map(conn => (
                    <div
                        key={conn.id}
                        className="connection-card"
                        onClick={() => {
                            if (conn.id) {
                                navigate(`/browse/${conn.id}`);
                            }
                        }}
                        style={{ cursor: 'pointer' }}
                    >
                        <div className="card-content-main">
                            <div className="card-header-row">
                                <span className="card-type-label">{conn.type}</span>
                                {getAverageRating(conn.id) > 0 && (
                                    <span className="avg-rating-badge-mini">❤️ {getAverageRating(conn.id)}</span>
                                )}
                            </div>
                            <h3 className="card-title">{conn.title.toUpperCase()}</h3>
                            <p className="card-location-text">📍 {sanitizeLocation(conn.location)}</p>
                            <p className="card-description-snippet">{conn.description}</p>
                            <span className="card-meta">{conn.time} • NEARBY</span>
                        </div>
                        <div className="card-action-side">
                            <span className="details-link">Details →</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="empty-state">
                <p>No more connections found nearby.</p>
            </div>

            <BottomNav />
        </div>
    );
};

export default Browse;

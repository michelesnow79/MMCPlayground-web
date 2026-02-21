import React from 'react';
import { useNavigate } from 'react-router-dom';
import logoAsset from '../assets/heart-logo.svg';
import './MapHeader.css';

const MapHeader = ({ onMenuClick, onFilterClick, isFilterActive }) => {
    const navigate = useNavigate();

    return (
        <header className="map-header-overlay">
            <div className="map-header-left">
                <button className="map-header-btn hamburger" onClick={onMenuClick}>
                    <div className="hamburger-line"></div>
                    <div className="hamburger-line"></div>
                    <div className="hamburger-line"></div>
                </button>
            </div>

            <div className="map-header-center" onClick={() => navigate('/')}>
                <img src={logoAsset} alt="Logo" className="map-header-logo" />
                <h1 className="map-header-title">MISS ME CONNECTION</h1>
            </div>

            <div className="map-header-right">
                <button
                    className={`map-header-btn filter ${isFilterActive ? 'active' : ''}`}
                    onClick={onFilterClick}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                        <path d="M3 17h18v2H3v-2zm0-7h18v2H3v-2zm0-7h18v2H3V3zM5 5v2h2V5H5zm0 7v2h2v-2H5zm12 7v2h2v-2h-2z" />
                    </svg>
                    {isFilterActive && <span className="filter-dot" />}
                </button>
            </div>
        </header>
    );
};

export default MapHeader;

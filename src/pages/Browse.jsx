import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import logoAsset from '../assets/heart-logo.svg';
import SideMenu from '../components/SideMenu';
import FilterMenu from '../components/FilterMenu';
import './Browse.css';

import { useApp } from '../context/AppContext';
import mapBg from '../assets/map-bg.svg';

const Browse = () => {
    const navigate = useNavigate();
    const {
        pins, user, hiddenPins, getAverageRating, isLoggedIn,
        visiblePinIds, activeFilters, setActiveFilters,
        formatDate, formatRelativeTime
    } = useApp();

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // Near me only - keeping local for now as Map doesn't use this specific toggle, 
    // but the results will be affected by global activeFilters
    const [nearMeOnly, setNearMeOnly] = useState(false);
    const [mapAreaOnly, setMapAreaOnly] = useState(!!visiblePinIds);
    const scrollRef = React.useRef(null);

    const scroll = (direction) => {
        if (scrollRef.current) {
            const { current } = scrollRef;
            // Scroll by roughly one card width (50% of container)
            const scrollAmount = current.offsetWidth / 2;
            if (direction === 'left') {
                current.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
            } else {
                current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
            }
        }
    };

    const sanitizeLocation = (loc) => {
        if (!loc) return "";
        return loc.replace(/^\d+[\s,.]*/, "").trim() || "Public Area";
    };

    // Filter logic
    const filteredPins = useMemo(() => {
        let result = (pins || []).filter(p => {
            const isHidden = hiddenPins.includes(p.id);
            const isReported = p.isReported;
            const isOwner = p.ownerEmail === user?.email;
            const isAdmin = user?.isAdmin;

            if (isHidden && !isAdmin) return false;
            if (isReported && !isOwner && !isAdmin) return false;
            if (p.status === 'hidden' && !isOwner && !isAdmin) return false;

            return true;
        });

        // 1. Spatial Filtering (Map Area)
        if (mapAreaOnly && visiblePinIds && visiblePinIds.length > 0) {
            result = result.filter(p => visiblePinIds.includes(p.id));
        }

        // 2. Global Filters (Location, Type, Date, Keyword)
        if (activeFilters.location) {
            const loc = activeFilters.location.toLowerCase();
            result = result.filter(p => p.location?.toLowerCase().includes(loc));
        }
        if (activeFilters.type) {
            result = result.filter(p => p.type === activeFilters.type);
        }
        if (activeFilters.keyword) {
            const lowSearch = activeFilters.keyword.toLowerCase();
            result = result.filter(p =>
                p.title?.toLowerCase().includes(lowSearch) ||
                p.description?.toLowerCase().includes(lowSearch) ||
                p.location?.toLowerCase().includes(lowSearch)
            );
        }
        // Date filter could be added here if needed

        // 3. Proximity Filtering (Zip code matching - legacy/simple)
        if (nearMeOnly && user?.postalCode) {
            result = result.filter(p => p.postalCode === user.postalCode);
        }

        return result;
    }, [pins, activeFilters, nearMeOnly, mapAreaOnly, user, hiddenPins, visiblePinIds]);

    const myPins = useMemo(() => {
        if (!isLoggedIn || !user) return [];
        return pins.filter(p => p.ownerUid === user.uid);
    }, [pins, user, isLoggedIn]);

    const hasActiveFilters = !!(activeFilters.location || activeFilters.type || activeFilters.date || activeFilters.keyword);

    return (
        <div className="browse-container">
            <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

            <FilterMenu
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                filters={activeFilters}
                onFilterChange={setActiveFilters}
            />

            {/* HERO SECTION WITH GOLD MAP BACKGROUND */}
            <header className="browse-hero" style={{ backgroundImage: `url(${mapBg})` }}>
                <div className="browse-top-bar">
                    <div className="top-bar-left">
                        <button className="map-hamburger-btn" onClick={() => setIsMenuOpen(true)}>
                            <div className="hamburger-line-small"></div>
                            <div className="hamburger-line-small"></div>
                            <div className="hamburger-line-small"></div>
                        </button>
                    </div>

                    <div className="browse-logo-group" onClick={() => navigate('/')}>
                        <img src={logoAsset} alt="Logo" className="header-heart-logo-browse" />
                        <h1 className="browse-logo-text">MISS ME CONNECTIONS</h1>
                    </div>

                    <div className="top-bar-right">
                        <button
                            className={`browse-filter-btn ${hasActiveFilters ? 'active' : ''}`}
                            onClick={() => setIsFilterOpen(true)}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                                <path d="M3 17h18v2H3v-2zm0-7h18v2H3v-2zm0-7h18v2H3V3zM5 5v2h2V5H5zm0 7v2h2v-2H5zm12 7v2h2v-2h-2z" />
                            </svg>
                        </button>
                        <button className="browse-close-btn" onClick={() => navigate('/map')}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="my-connections-section">
                    <h2 className="section-heading">MY MISSED CONNECTIONS</h2>
                    <div className="horizontal-scroll-container">
                        <button className="scroll-btn left" onClick={() => scroll('left')}>
                            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6"></polyline>
                            </svg>
                        </button>
                        <div className="horizontal-scroll-wrap" ref={scrollRef}>
                            {myPins.length === 0 ? (
                                <div className="no-my-pins">No posts from you yet.</div>
                            ) : (
                                myPins.map(p => (
                                    <div key={p.id} className={`mini-card ${p.status === 'hidden' ? 'is-private' : ''}`} onClick={() => navigate(`/browse/${p.id}`)}>
                                        <h3 className="mini-card-title">{p.title}</h3>
                                        <p className="mini-card-location">{sanitizeLocation(p.location)}</p>
                                        {p.status === 'hidden' && <span className="mini-private-badge">PRIVATE</span>}
                                    </div>
                                ))
                            )}
                        </div>
                        <button className="scroll-btn right" onClick={() => scroll('right')}>
                            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </button>
                    </div>
                </div>
            </header>

            {/* SEARCH & FILTERS SECTION */}
            <div className="search-filter-block">
                <div className="search-input-wrap">
                    <input
                        type="text"
                        className="browse-search-bar"
                        placeholder="Search for a connection..."
                        value={activeFilters.keyword || ''}
                        onChange={(e) => setActiveFilters(prev => ({ ...prev, keyword: e.target.value }))}
                    />
                    <button className="browse-search-btn">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                    </button>
                </div>

                <div className="filter-options-row">
                    <div className="toggle-group">
                        <label className="switch">
                            <input
                                type="checkbox"
                                checked={mapAreaOnly}
                                onChange={() => setMapAreaOnly(!mapAreaOnly)}
                            />
                            <span className="slider round"></span>
                        </label>
                        <span className="toggle-label text-white">Map Area only</span>
                    </div>
                </div>
            </div>

            {/* MAIN FEED */}
            <main className="browse-feed">
                {filteredPins.length === 0 ? (
                    <div className="empty-state">
                        <p>No connections found matching your filters.</p>
                        <button className="reset-filter-btn" onClick={() => {
                            setActiveFilters({
                                location: '',
                                radius: 10,
                                unit: activeFilters.unit,
                                type: '',
                                date: null,
                                keyword: ''
                            });
                            setNearMeOnly(false);
                            setMapAreaOnly(false);
                        }}>Clear Filters</button>
                    </div>
                ) : (
                    filteredPins.map(conn => (
                        <div
                            key={conn.id}
                            className="connection-card-premium"
                            onClick={() => navigate(`/browse/${conn.id}`)}
                        >
                            <span className="premium-card-badge">{conn.type || 'Missed Connection'}</span>

                            <div className="p-card-content">
                                <h3 className="p-card-title">{conn.title}</h3>
                                <div className="p-card-loc-date">
                                    <span className="p-card-loc">
                                        {sanitizeLocation(conn.location)}
                                        {conn.address && conn.address !== conn.location && <span style={{ opacity: 0.7, marginLeft: '8px', fontWeight: 400 }}>• {conn.address.replace(', USA', '')}</span>}
                                    </span>
                                    {conn.date && <span className="p-card-date">
                                        {formatDate(conn.date)}
                                    </span>}
                                </div>
                                <p className="p-card-desc">{conn.description}</p>

                                <div className="p-card-footer-badges">
                                    {conn.isReported && (
                                        <span className="reported-badge-mini">UNDER REVIEW</span>
                                    )}
                                    {conn.status === 'hidden' && (
                                        <span className="private-badge-mini">HIDDEN FROM MAP</span>
                                    )}
                                    <span className="p-card-posted-time">{formatRelativeTime(conn.createdAt)}</span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </main>

            <BottomNav />
        </div>
    );
};

export default Browse;


import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './ConnectionMapMockup.css';
import BottomNav from '../components/BottomNav';

// Custom Heart Icon matching the premium Figma look
const customHeartIcon = L.divIcon({
    className: 'custom-marker',
    html: '<div class="marker-pin"></div>',
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40]
});

const ConnectionMapMockup = () => {
    const [searchQuery, setSearchQuery] = useState('');

    // Mock connections data
    const connections = [
        {
            id: 1,
            title: "CENTRAL PARK ENCOUNTER",
            description: "Saw you near the Bethesda Fountain. You had a red scarf and were reading a book. We made eye contact for a split second.",
            time: "2 hours ago",
            location: "New York, NY",
            coords: [40.7739, -73.9713]
        },
        {
            id: 2,
            title: "SUBWAY SMILE",
            description: "Line 1 heading downtown. You got off at Times Square. I was wearing the green jacket. You smiled as the doors closed.",
            time: "5 hours ago",
            location: "New York, NY",
            coords: [40.7589, -73.9851]
        },
        {
            id: 3,
            title: "COFFEE SHOP SPARK",
            description: "Blue Bottle Coffee on 9th Ave. We both reached for the oat milk at the same time. I wish I had said something more than just 'sorry'.",
            time: "Yesterday",
            location: "New York, NY",
            coords: [40.7484, -74.0051]
        },
        {
            id: 4,
            title: "SOHO STROLL",
            description: "Walking down Prince St. You were walking a golden retriever. We bumped shoulders. You have amazing eyes.",
            time: "2 days ago",
            location: "New York, NY",
            coords: [40.7247, -73.9995]
        }
    ];

    return (
        <div className="connection-map-mockup">
            {/* Search Top Bar */}
            <div className="search-container">
                <div className="search-bar">
                    <span className="search-icon">🔍</span>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search locations or connections..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Map Underlay */}
            <div className="map-underlay">
                <MapContainer
                    center={[40.7589, -73.9851]}
                    zoom={13}
                    zoomControl={false}
                    style={{ height: '100%', width: '100%' }}
                >
                    <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                        attribution='&copy; CARTO'
                    />

                    {connections.map(item => (
                        <Marker
                            key={item.id}
                            position={item.coords}
                            icon={customHeartIcon}
                        >
                            <Popup className="figma-popup">
                                <div style={{ minWidth: '200px' }}>
                                    <h3 style={{ margin: '0 0 8px', color: '#FE2C55', fontSize: '16px' }}>{item.title}</h3>
                                    <p style={{ margin: 0, fontSize: '13px', color: '#121214' }}>{item.description}</p>
                                </div>
                            </Popup>
                        </Marker>
                    ))}

                    <ZoomControl position="topright" />
                </MapContainer>
            </div>

            {/* Floating Action Button */}
            <button className="fab-add" onClick={() => alert('Add Connection Flow')}>
                +
            </button>

            {/* Floating Connection Cards Scroller */}
            <div className="connection-cards-overlay">
                <div className="cards-scroller">
                    {connections.map(item => (
                        <div key={item.id} className="connection-card">
                            <div className="card-header">
                                <span className="card-title">{item.title}</span>
                                <span className="card-time">{item.time}</span>
                            </div>
                            <p className="card-description">{item.description}</p>
                            <div className="card-footer">
                                <span className="location-pill">{item.location}</span>
                                <span>•</span>
                                <span>{item.time}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <BottomNav />
        </div>
    );
};

export default ConnectionMapMockup;

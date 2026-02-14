import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { APIProvider, Map as GoogleMap, Marker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import BottomNav from '../components/BottomNav';
import './MapView.css';
import { useApp } from '../context/AppContext';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const mapThemeDark = [
    { "elementType": "geometry", "stylers": [{ "color": "#1d1d1b" }] },
    { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
    { "elementType": "labels.text.fill", "stylers": [{ "color": "#8e8e93" }] },
    { "elementType": "labels.text.stroke", "stylers": [{ "color": "#1d1d1b" }] },
    { "featureType": "administrative", "elementType": "geometry", "stylers": [{ "color": "#333333" }] },
    { "featureType": "landscape", "elementType": "geometry", "stylers": [{ "color": "#1a1a1b" }] },
    { "featureType": "poi", "stylers": [{ "visibility": "off" }] },
    { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#303030" }] },
    { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#4a4a4a" }] },
    { "featureType": "transit", "stylers": [{ "visibility": "off" }] },
    { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#0e1a1a" }] }
];

const MapView = () => {
    const navigate = useNavigate();
    const { pins, addPin, isLoggedIn, user, hiddenPins, hidePin, removePin, formatDate, getAverageRating, ratings } = useApp();

    const [isPosting, setIsPosting] = useState(false);
    const [tempCoords, setTempCoords] = useState(null);
    const [newType, setNewType] = useState('');
    const [newTitle, setNewTitle] = useState('');
    const [newLocation, setNewLocation] = useState('');
    const [newDate, setNewDate] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPin, setSelectedPin] = useState(null);
    const [mapCenter, setMapCenter] = useState({ lat: 40.7128, lng: -74.006 });
    const [currentZoom, setCurrentZoom] = useState(13);

    const isDragging = useRef(false);
    const isCenterManualRef = useRef(false);
    const [mapInstance, setMapInstance] = useState(null);

    const MapHandler = ({ center }) => {
        const map = useMap();
        useEffect(() => {
            if (map) {
                setMapInstance(map);
            }
        }, [map]);

        useEffect(() => {
            if (map && center && isCenterManualRef.current) {
                map.panTo(center);
                isCenterManualRef.current = false;
            }
        }, [map, center]);
        return null;
    };

    // Google Places Autocomplete Effect
    useEffect(() => {
        if (!isPosting || !window.google || !window.google.maps || !window.google.maps.places) return;

        const input = document.getElementById('post-location-input');
        if (!input) return;

        const autocomplete = new window.google.maps.places.Autocomplete(input, {
            types: ['geocode', 'establishment']
        });

        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.formatted_address || place.name) {
                setNewLocation(place.name || place.formatted_address);
                if (place.geometry && place.geometry.location) {
                    setTempCoords({
                        lat: place.geometry.location.lat(),
                        lng: place.geometry.location.lng()
                    });
                }
            }
        });
    }, [isPosting]);

    const sanitizeLocation = (loc) => {
        if (!loc) return "";
        const sanitized = loc.replace(/^\d+[\s,.]*/, "").trim();
        return sanitized || "Public Area";
    };

    const handleMapClick = () => {
        setSelectedPin(null);
    };

    const handleAddClick = async () => {
        if (!mapInstance) return;
        const center = mapInstance.getCenter();
        const centerCoords = { lat: center.lat(), lng: center.lng() };

        setIsPosting(true);
        setNewLocation('Identifying location...');

        const geocoder = new window.google.maps.Geocoder();

        geocoder.geocode({ location: centerCoords }, async (results, status) => {
            if (status === "OK" && results[0]) {
                const types = results[0].types || [];
                const isVenue = (types.includes("point_of_interest") ||
                    types.includes("establishment") ||
                    types.includes("stadium") ||
                    types.includes("park") ||
                    types.includes("airport"));

                if (isVenue) {
                    const venueLoc = results[0].geometry.location;
                    setTempCoords({ lat: venueLoc.lat(), lng: venueLoc.lng() });
                    setNewLocation(results[0].formatted_address);
                    return;
                }

                // Privacy Jitter
                const moveDist = 0.001 + (Math.random() * 0.001);
                const angle = Math.random() * Math.PI * 2;
                const fuzzedCoords = {
                    lat: centerCoords.lat + Math.sin(angle) * moveDist,
                    lng: centerCoords.lng + Math.cos(angle) * moveDist
                };

                setTempCoords(fuzzedCoords);
                setNewLocation(results[0].formatted_address);
            } else {
                setTempCoords(centerCoords);
                setNewLocation('Public Area');
            }
        });
    };

    const handleSavePin = (e) => {
        e.preventDefault();
        const newPin = {
            id: Date.now(),
            lat: tempCoords.lat,
            lng: tempCoords.lng,
            type: newType,
            title: newTitle.toUpperCase(),
            location: sanitizeLocation(newLocation),
            date: newDate || 'Today',
            description: newDescription,
            ownerEmail: user?.email
        };
        addPin(newPin);
        setIsPosting(false);
        setTempCoords(null);
        setNewType('');
        setNewTitle('');
        setNewLocation('');
        setNewDescription('');
    };

    const cancelPost = () => {
        setIsPosting(false);
        setTempCoords(null);
    };

    const handleSearch = (e) => {
        if (e) e.preventDefault();
        if (!searchQuery || !window.google) return;

        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: searchQuery }, (results, status) => {
            if (status === "OK" && results[0]) {
                const loc = results[0].geometry.location;
                isCenterManualRef.current = true;
                setMapCenter({
                    lat: loc.lat(),
                    lng: loc.lng()
                });
            }
        });
    };

    return (
        <APIProvider apiKey={API_KEY} libraries={['places', 'marker']}>
            <div className="map-view-container">
                <header className="map-top-bar-original">
                    <div className="top-bar-side-left">
                        <form className="original-search-form" onSubmit={handleSearch}>
                            <input
                                type="text"
                                className="original-search-input"
                                placeholder="Search city..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <button type="submit" className="original-search-btn">🔍</button>
                        </form>
                    </div>
                    <h1 className="map-logo-title-original" onClick={() => navigate('/')}>MISS ME CONNECTIONS</h1>
                    <div className="top-bar-side-right">
                        <button className="original-settings-btn" onClick={() => navigate('/account')}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                                <path d="M3 17h18v2H3v-2zm0-7h18v2H3v-2zm0-7h18v2H3V3zM5 5v2h2V5H5zm0 7v2h2v-2H5zm12 7v2h2v-2h-2z" />
                            </svg>
                        </button>
                    </div>
                </header>

                <div className="map-canvas">
                    <GoogleMap
                        defaultCenter={mapCenter}
                        defaultZoom={13}
                        gestureHandling={'greedy'}
                        disableDefaultUI={false}
                        zoomControl={true}
                        zoomControlOptions={{ position: 5 }} // RIGHT_CENTER
                        streetViewControl={false}
                        mapTypeControl={false}
                        fullscreenControl={false}
                        styles={mapThemeDark}
                        onClick={handleMapClick}
                        onDragStart={() => isDragging.current = true}
                        onDragEnd={() => setTimeout(() => isDragging.current = false, 50)}
                        onCameraChanged={(ev) => {
                            setCurrentZoom(ev.detail.zoom);
                            if (isCenterManualRef.current) {
                                isCenterManualRef.current = false;
                            }
                        }}
                        onLoad={(map) => setMapInstance(map)}
                    >
                        <MapHandler center={mapCenter} />
                        {pins.filter(p => !hiddenPins.includes(p.id)).map(pin => (
                            <Marker
                                key={pin.id}
                                position={{ lat: pin.lat, lng: pin.lng }}
                                onClick={() => setSelectedPin(pin)}
                                icon={{
                                    url: '/assets/heart-logo.svg',
                                    scaledSize: { width: 44, height: 44 },
                                    anchor: { x: 22, y: 44 }
                                }}
                                label={currentZoom >= 15 ? {
                                    text: pin.title,
                                    color: 'white',
                                    className: 'legacy-marker-label'
                                } : null}
                            />
                        ))}

                        {selectedPin && (
                            <InfoWindow
                                position={{ lat: selectedPin.lat, lng: selectedPin.lng }}
                                onCloseClick={() => setSelectedPin(null)}
                                headerDisabled={true}
                            >
                                <div className="google-popup-content">
                                    <button
                                        className="popup-close-btn-custom"
                                        onClick={() => setSelectedPin(null)}
                                    >
                                        ✕
                                    </button>
                                    <span className="popup-category-badge">{selectedPin.type || 'Man for Woman'}</span>
                                    <div className="popup-rating-row">
                                        <div className="popup-hearts readonly">
                                            {[1, 2, 3, 4, 5].map(val => (
                                                <span key={val} className={`popup-heart ${val <= (ratings[selectedPin.id] || 0) ? 'filled' : ''}`}>❤️</span>
                                            ))}
                                        </div>
                                        <span className="popup-avg-text">AVG: {getAverageRating(selectedPin.id)}</span>
                                    </div>

                                    <h3 className="popup-title">{selectedPin.title}</h3>
                                    <div className="popup-location-details">
                                        <div className="location-name">{sanitizeLocation(selectedPin.location).split(',')[0]}</div>
                                        <div className="location-address">{sanitizeLocation(selectedPin.location)}</div>
                                    </div>
                                    <div className="popup-date-row">{formatDate(selectedPin.date)}</div>
                                    <p className="popup-description">{selectedPin.description}</p>

                                    <div className="popup-footer">
                                        <button className="popup-details-link-btn" onClick={() => navigate(`/browse/${selectedPin.id}`)}>
                                            View Details —
                                        </button>
                                        {selectedPin.ownerEmail === user?.email && (
                                            <button className="popup-delete-btn" onClick={() => {
                                                removePin(selectedPin.id);
                                                setSelectedPin(null);
                                            }}>
                                                Delete Pin
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </InfoWindow>
                        )}

                        {tempCoords && (
                            <Marker
                                position={tempCoords}
                                icon={{
                                    url: '/assets/heart-logo.svg',
                                    scaledSize: { width: 44, height: 44 },
                                    anchor: { x: 22, y: 44 },
                                    opacity: 0.6
                                }}
                            />
                        )}
                    </GoogleMap>
                </div>

                {isPosting && (
                    <div className="post-modal-overlay">
                        <div className="post-modal-card">
                            <button className="post-modal-close" onClick={cancelPost}>✕</button>
                            {!isLoggedIn ? (
                                <div className="post-login-prompt">
                                    <h2 className="post-modal-title">WAIT A MINUTE!</h2>
                                    <p className="post-modal-text">YOU NEED TO BE SIGNED IN TO POST A CONNECTION.</p>
                                    <button className="post-modal-submit" onClick={() => navigate('/login')}>SIGN IN TO POST</button>
                                </div>
                            ) : (
                                <form className="post-form" onSubmit={handleSavePin}>
                                    <div className="safety-badge">🛡️ PRIVACY PROTECTED</div>
                                    <h2 className="post-modal-title">ADD MISSED CONNECTION</h2>
                                    <div className="post-input-group">
                                        <label>Type</label>
                                        <select className="post-select" value={newType} onChange={(e) => setNewType(e.target.value)} required>
                                            <option value="">Select option</option>
                                            <option value="Man for Woman">Man for Woman</option>
                                            <option value="Man for Man">Man for Man</option>
                                            <option value="Woman for Man">Woman for Man</option>
                                            <option value="Woman for Woman">Woman for Woman</option>
                                        </select>
                                    </div>
                                    <div className="post-input-group">
                                        <label>Title</label>
                                        <input type="text" className="post-input" placeholder="Enter title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required />
                                    </div>
                                    <div className="post-input-group">
                                        <label>Location</label>
                                        <div className="location-input-wrapper">
                                            <input id="post-location-input" type="text" className="post-input" placeholder="Venue or street" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} required />
                                            <button type="button" className="location-refresh-btn" onClick={handleAddClick}>📍</button>
                                        </div>
                                    </div>
                                    <div className="post-input-group">
                                        <label>Date</label>
                                        <input type="text" className="post-input" placeholder="When?" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                                    </div>
                                    <div className="post-input-group">
                                        <label>Description</label>
                                        <textarea className="post-textarea" placeholder="Tell your story..." value={newDescription} onChange={(e) => setNewDescription(e.target.value)} required />
                                    </div>
                                    <div className="post-modal-actions">
                                        <button type="button" className="btn-cancel" onClick={cancelPost}>CANCEL</button>
                                        <button type="submit" className="btn-submit">POST</button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                )}
                <BottomNav onAddClick={handleAddClick} showAddButton={true} />
            </div>
        </APIProvider>
    );
};

export default MapView;

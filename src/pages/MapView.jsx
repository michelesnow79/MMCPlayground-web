import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { APIProvider, Map as GoogleMap, Marker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import BottomNav from '../components/BottomNav';
import SideMenu from '../components/SideMenu';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
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

// ===============================
// INTERSECTION PRIVACY HELPERS
// (No Roads API required)
// ===============================

// Haversine distance in meters
const haversineMeters = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
};

// Find nearest node shared by 2+ named roads (practical "intersection")
const getNearestCrossStreetsOSM = async (lat, lng, radiusMeters = 200) => {
    const overpassUrl = "https://overpass-api.de/api/interpreter";

    const query = `
    [out:json][timeout:25];
    (
      way(around:${radiusMeters},${lat},${lng})["highway"]["name"];
    );
    (._;>;);
    out body;
  `;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    try {
        const resp = await fetch(overpassUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: "data=" + encodeURIComponent(query),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!resp.ok) return null;
        const data = await resp.json();

        const ways = data.elements.filter((e) => e.type === "way" && e.tags?.name);
        const nodes = data.elements.filter((e) => e.type === "node");

        const nodeMap = new Map(nodes.map((n) => [n.id, { lat: n.lat, lng: n.lon }]));
        const nodeToStreetNames = new Map();

        for (const w of ways) {
            const streetName = (w.tags.name || "").trim();
            if (!streetName) continue;
            for (const nodeId of w.nodes || []) {
                if (!nodeToStreetNames.has(nodeId)) nodeToStreetNames.set(nodeId, new Set());
                nodeToStreetNames.get(nodeId).add(streetName);
            }
        }

        const intersectionCandidates = [];
        for (const [nodeId, streetSet] of nodeToStreetNames.entries()) {
            if (streetSet.size >= 2 && nodeMap.has(nodeId)) {
                intersectionCandidates.push({
                    nodeId,
                    streets: Array.from(streetSet),
                    ...nodeMap.get(nodeId),
                });
            }
        }

        if (intersectionCandidates.length === 0) return null;

        return intersectionCandidates
            .map((c) => ({ ...c, dist: haversineMeters(lat, lng, c.lat, c.lng) }))
            .sort((a, b) => a.dist - b.dist)[0];
    } catch (err) {
        console.error("OSM Fetch failed:", err);
        return null;
    }
};

// Try multiple radii so it works even where intersections are sparse
const findIntersectionWithFallback = async (lat, lng) => {
    return (
        (await getNearestCrossStreetsOSM(lat, lng, 200)) ||
        (await getNearestCrossStreetsOSM(lat, lng, 350)) ||
        (await getNearestCrossStreetsOSM(lat, lng, 500))
    );
};

const MapView = () => {
    const navigate = useNavigate();
    const { pins, addPin, isLoggedIn, user, hiddenPins, hidePin, removePin, formatDate, getAverageRating, ratings } = useApp();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    useEffect(() => {
        console.log("📍 MAP DEBUG: Total pins loaded from Firebase:", pins.length);
    }, [pins]);

    // Geolocation on mount
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    console.log("📍 User location found:", latitude, longitude);
                    isCenterManualRef.current = true;
                    setMapCenter({ lat: latitude, lng: longitude });
                },
                (error) => {
                    console.warn("📍 Geolocation error:", error.message);
                }
            );
        }
    }, []);

    const [isPosting, setIsPosting] = useState(false);
    const [tempCoords, setTempCoords] = useState(null);
    const [newType, setNewType] = useState('');
    const [newTitle, setNewTitle] = useState('');
    const [newLocation, setNewLocation] = useState('');
    const [newDate, setNewDate] = useState(new Date());
    const [newTime, setNewTime] = useState(new Date());
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
        setNewLocation("Identifying location...");

        const geocoder = new window.google.maps.Geocoder();

        geocoder.geocode({ location: centerCoords }, async (results, status) => {
            // Hard fallback
            if (status !== "OK" || !results?.[0]) {
                setTempCoords(centerCoords);
                setNewLocation("Public Area");
                return;
            }

            const top = results[0];
            const types = top.types || [];
            const comps = top.address_components || [];

            // 1) VENUE/POI: keep exact
            const isVenue =
                (types.includes("point_of_interest") ||
                    types.includes("establishment") ||
                    types.includes("stadium") ||
                    types.includes("park") ||
                    types.includes("airport")) &&
                !types.includes("natural_feature");

            if (isVenue) {
                const loc = top.geometry.location;
                setTempCoords({ lat: loc.lat(), lng: loc.lng() });
                setNewLocation(top.formatted_address || top.name || "Public Venue");
                return;
            }

            // 2) RESIDENTIAL DETECTION: intersection snapping only if residential-ish
            const hasStreetNumber = comps.some((c) => c.types.includes("street_number"));
            const isStreetAddressType =
                types.includes("street_address") ||
                types.includes("premise") ||
                types.includes("subpremise");

            const isResidential = hasStreetNumber || isStreetAddressType;

            // 3) Privacy jitter in meters
            const jitterMeters = 100 + Math.random() * 100; // 100–200m
            const angle = Math.random() * Math.PI * 2;
            const latJitter = (Math.sin(angle) * jitterMeters) / 111111;
            const lngJitter = (Math.cos(angle) * jitterMeters) / (111111 * Math.cos(centerCoords.lat * Math.PI / 180));

            const fuzzedCoords = {
                lat: centerCoords.lat + latJitter,
                lng: centerCoords.lng + lngJitter,
            };

            // 4) If residential → snap to intersection; else keep fuzzed but generic label
            let finalCoords = fuzzedCoords;
            let finalLabel = "Public Area";

            if (isResidential) {
                const intersection = await findIntersectionWithFallback(
                    fuzzedCoords.lat,
                    fuzzedCoords.lng
                );

                if (intersection) {
                    finalCoords = { lat: intersection.lat, lng: intersection.lng };

                    if (intersection.streets?.length >= 2) {
                        const [sA, sB] = intersection.streets.slice(0, 2);
                        finalLabel = `Near ${sA} & ${sB}`;
                    } else {
                        finalLabel = "Near a cross street";
                    }
                } else {
                    // If Overpass fails/rate-limits, still safe: use fuzzed coords
                    finalCoords = fuzzedCoords;
                    finalLabel = "Public Area";
                }
            } else {
                // Not venue, not residential: keep vague
                finalCoords = fuzzedCoords;
                finalLabel = "Public Area";
            }

            setTempCoords(finalCoords);
            setNewLocation(finalLabel);
        });
    };

    const handleSavePin = (e) => {
        e.preventDefault();
        const newPin = {
            id: Date.now().toString(), // Use string ID
            lat: tempCoords.lat,
            lng: tempCoords.lng,
            type: newType,
            title: newTitle.toUpperCase(),
            location: sanitizeLocation(newLocation),
            date: newDate.toISOString(),
            time: newTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            description: newDescription,
            ownerEmail: user?.email
        };
        addPin(newPin);
        setIsPosting(false);
        setTempCoords(null);
        setNewType('');
        setNewTitle('');
        setNewLocation('');
        setNewDate(new Date());
        setNewTime(new Date());
        setNewDescription('');
    };

    const cancelPost = () => {
        setIsPosting(false);
        setTempCoords(null);
        setNewDate(new Date());
        setNewTime(new Date());
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
                <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
                <header className="map-top-bar-original">
                    <div className="top-bar-side-left">
                        <button className="map-hamburger-btn" onClick={() => setIsMenuOpen(true)}>
                            <div className="hamburger-line-small"></div>
                            <div className="hamburger-line-small"></div>
                            <div className="hamburger-line-small"></div>
                        </button>
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
                        zoomControlOptions={{ position: 8 }} // RIGHT_CENTER
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
                                                <span key={val} className={`popup-heart ${val <= Math.round(getAverageRating(selectedPin.id)) ? 'filled' : ''}`}>❤️</span>
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

                                        <div className="popup-footer-right">
                                            <button className="popup-its-not-me-btn" onClick={() => {
                                                hidePin(selectedPin.id);
                                                setSelectedPin(null);
                                            }}>
                                                IT'S NOT ME.
                                            </button>

                                            {(selectedPin.ownerEmail === user?.email || user?.isAdmin) && (
                                                <button className="popup-delete-btn" onClick={() => {
                                                    console.log("🗑️ Deleting pin ID:", selectedPin.id);
                                                    removePin(selectedPin.id);
                                                    setSelectedPin(null);
                                                }}>
                                                    Delete
                                                </button>
                                            )}
                                        </div>
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
                                    <div className="date-time-inputs">
                                        <div className="post-input-group">
                                            <label>Date</label>
                                            <DatePicker
                                                selected={newDate}
                                                onChange={(date) => setNewDate(date)}
                                                className="post-input"
                                                placeholderText="When?"
                                                dateFormat="MM/dd/yyyy"
                                                required
                                            />
                                        </div>
                                        <div className="post-input-group">
                                            <label>Time (Optional)</label>
                                            <DatePicker
                                                selected={newTime}
                                                onChange={(time) => setNewTime(time)}
                                                showTimeSelect
                                                showTimeSelectOnly
                                                timeIntervals={15}
                                                timeCaption="Time"
                                                dateFormat="h:mm aa"
                                                className="post-input"
                                            />
                                        </div>
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

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { APIProvider, Map as GoogleMap, Marker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import BottomNav from '../components/BottomNav';
import SideMenu from '../components/SideMenu';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import './MapView.css';
import { useApp } from '../context/AppContext';
import FilterMenu from '../components/FilterMenu';
import ConfirmModal from '../components/ConfirmModal';
import { fuzzAndProcessLocation, haversineMeters } from '../utils/locationHelper';

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
    const {
        user, pins, isLoggedIn, loading, signup, login,
        addPin, removePin, hidePin, hiddenPins, formatDate, mapMode,
        getAverageRating, reportPin, distanceUnit, ratings,
        isSuspended, hasProbation, setVisiblePinIds,
        activeFilters, setActiveFilters
    } = useApp();

    // 1. ALL STATES AT THE TOP
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [mapCenter, setMapCenter] = useState(null);
    const [isLocating, setIsLocating] = useState(true);
    const [currentZoom, setCurrentZoom] = useState(13);
    const [selectedPin, setSelectedPin] = useState(null);
    const [selectedPins, setSelectedPins] = useState([]);
    const [selectedPinIndex, setSelectedPinIndex] = useState(0);
    const [mapInstance, setMapInstance] = useState(null);


    const GROUP_RADIUS_METERS = 250;
    const [filterCenter, setFilterCenter] = useState(null);

    const [isPosting, setIsPosting] = useState(false);
    const [tempCoords, setTempCoords] = useState(null);
    const [newType, setNewType] = useState('');
    const [newTitle, setNewTitle] = useState('');
    const [newLocation, setNewLocation] = useState('');
    const [newAddress, setNewAddress] = useState('');
    const [newDate, setNewDate] = useState(new Date());
    const [newTime, setNewTime] = useState(null);
    const [newDescription, setNewDescription] = useState('');
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportReason, setReportReason] = useState('');
    const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: () => { }, type: 'info' });

    // 2. ALL REFS
    const isDragging = useRef(false);
    const isCenterManualRef = useRef(false);
    const clustererRef = useRef(null);
    const markerInstances = useRef(new Map());

    // 3. MEMOIZED CALLBACKS
    const setMarkerRef = useCallback((marker, id) => {
        if (marker) {
            markerInstances.current.set(id, marker);
        } else {
            markerInstances.current.delete(id);
        }
    }, []);

    // 4. MEMOIZED DATA
    const filteredPins = useMemo(() => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        let result = (pins || []).filter(p => {
            // Basic filters
            if (hiddenPins.includes(p.id) || p.isReported) return false;

            // 30-day Archiving logic
            if (p.createdAt) {
                const createdAt = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt);
                if (createdAt < thirtyDaysAgo) return false;
            }

            return true;
        });

        if (filterCenter) {
            result = result.filter(pin => {
                const distanceMeters = haversineMeters(filterCenter.lat, filterCenter.lng, pin.lat, pin.lng);
                const distanceConverted = activeFilters.unit === 'km' ? distanceMeters / 1000 : distanceMeters / 1609.34;
                return distanceConverted <= activeFilters.radius;
            });
        }

        if (activeFilters.type) {
            result = result.filter(pin => pin.type === activeFilters.type);
        }

        if (activeFilters.date) {
            const filterDateStr = activeFilters.date.toISOString().split('T')[0];
            result = result.filter(pin => {
                const pinDateStr = new Date(pin.date).toISOString().split('T')[0];
                return pinDateStr === filterDateStr;
            });
        }

        if (activeFilters.keyword) {
            const kw = activeFilters.keyword.toLowerCase();
            result = result.filter(pin =>
                pin.title?.toLowerCase().includes(kw) ||
                pin.description?.toLowerCase().includes(kw)
            );
        }
        console.log(`📍 MAP DEBUG: filteredPins count: ${result.length} (total pins: ${pins.length})`);
        return result;
    }, [pins, filterCenter, activeFilters, hiddenPins]);

    const locationsGrouped = useMemo(() => {
        const groups = []; // { key, lat, lng, pins: [] }

        (filteredPins || []).forEach(pin => {
            if (typeof pin.lat !== 'number' || typeof pin.lng !== 'number') return;

            // find a group within radius
            let g = null;
            for (const candidate of groups) {
                const d = haversineMeters(pin.lat, pin.lng, candidate.lat, candidate.lng);
                if (d <= GROUP_RADIUS_METERS) { g = candidate; break; }
            }

            if (!g) {
                groups.push({
                    key: `${pin.lat}_${pin.lng}_${groups.length}`,
                    lat: pin.lat,   // keep first pin as anchor (stable marker)
                    lng: pin.lng,
                    pins: [pin],
                });
            } else {
                g.pins.push(pin);
            }
        });

        // convert to same shape the JSX expects
        const groupedMap = Object.fromEntries(groups.map(g => [g.key, g.pins]));
        console.log("📍 MAP DEBUG: Venue groups:", Object.keys(groupedMap).length);
        return groupedMap;
    }, [filteredPins]);

    // 5. EFFECTS
    useEffect(() => {
        console.log("📍 MAP DEBUG: Total pins loaded from Firebase:", pins.length);
    }, [pins]);

    // Sync global distance unit
    useEffect(() => {
        setActiveFilters(prev => ({ ...prev, unit: distanceUnit }));
    }, [distanceUnit]);

    // Initial Geolocation (Browser GPS)
    useEffect(() => {
        if (!navigator.geolocation) {
            if (!user?.postalCode) {
                setMapCenter({ lat: 35.2271, lng: -80.8431 });
                setIsLocating(false);
            }
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setMapCenter({ lat: latitude, lng: longitude });
                setIsLocating(false);
                isCenterManualRef.current = true;
                console.log("📍 Centered map via GPS");
            },
            (error) => {
                console.warn("📍 GPS Geolocation error:", error.message);
                // If GPS fails, and we haven't found a center yet (e.g. from zip), 
                // we'll let the user.postalCode effect handle it OR fallback later.
                if (!user?.postalCode) {
                    setMapCenter({ lat: 35.2271, lng: -80.8431 });
                    setIsLocating(false);
                }
            },
            { enableHighAccuracy: true, timeout: 6000 }
        );
    }, [user?.uid]); // Run once on auth load

    // Initial Geolocation (User Postal Code fallback)
    useEffect(() => {
        if (!user?.postalCode || isCenterManualRef.current || mapCenter) return;

        let geocodeInterval = setInterval(() => {
            if (typeof window.google?.maps?.Geocoder === 'function') {
                clearInterval(geocodeInterval);
                const geocoder = new window.google.maps.Geocoder();
                geocoder.geocode({ address: user.postalCode }, (results, status) => {
                    if (status === "OK" && results?.[0] && !isCenterManualRef.current) {
                        const loc = results[0].geometry.location;
                        const newCenter = { lat: loc.lat(), lng: loc.lng() };
                        isCenterManualRef.current = true;
                        setMapCenter(newCenter);
                        setIsLocating(false);
                        console.log("📍 Centered map based on user postal code:", user.postalCode);
                    } else if (status !== "OK") {
                        // Hard fallback if geocode fails
                        if (!mapCenter) {
                            setMapCenter({ lat: 35.2271, lng: -80.8431 });
                            setIsLocating(false);
                            isCenterManualRef.current = true;
                        }
                    }
                });
            }
        }, 500);

        return () => clearInterval(geocodeInterval);
    }, [user?.postalCode]); // REMOVED mapCenter from deps to stop the loop!

    // Total Safety Fallback: If still locating after 8 seconds, just force open it
    useEffect(() => {
        const timer = setTimeout(() => {
            if (isLocating) {
                console.log("📍 Forced map activation after timeout");
                if (!mapCenter) {
                    setMapCenter({ lat: 35.2271, lng: -80.8431 });
                    isCenterManualRef.current = true;
                }
                setIsLocating(false);
            }
        }, 8000);
        return () => clearTimeout(timer);
    }, [isLocating]); // REMOVED mapCenter from deps!

    // Clustering Sync
    useEffect(() => {
        if (!mapInstance || !window.google?.maps?.Marker || !window.google?.maps?.Size) return;

        if (!clustererRef.current) {
            clustererRef.current = new MarkerClusterer({
                map: mapInstance,
                renderer: {
                    render: ({ count, position }) => {
                        return new window.google.maps.Marker({
                            position,
                            icon: {
                                url: `data:image/svg+xml;base64,${btoa(`
                                    <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="20" cy="20" r="18" fill="#fe2c55" stroke="white" stroke-width="2"/>
                                        <text x="20" y="24" font-family="Arial" font-size="14" font-weight="bold" fill="white" text-anchor="middle">${count || '!'}</text>
                                    </svg>
                                `)}`,
                                scaledSize: new window.google.maps.Size(40, 40),
                                anchor: new window.google.maps.Point(20, 20)
                            },
                        });
                    }
                }
            });
        }

        const syncMarkers = () => {
            if (clustererRef.current) {
                clustererRef.current.clearMarkers();
                clustererRef.current.addMarkers(Array.from(markerInstances.current.values()));
            }
        };

        const timeout = setTimeout(syncMarkers, 150);
        return () => clearTimeout(timeout);
    }, [mapInstance, filteredPins]);


    // Geocode Filter Center
    useEffect(() => {
        if (!activeFilters.location || !window.google?.maps?.Geocoder) {
            setFilterCenter(null);
            return;
        }

        console.log("🔍 FILTER: Geocoding location:", activeFilters.location);
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: activeFilters.location }, (results, status) => {
            if (status === "OK" && results[0]) {
                const loc = results[0].geometry.location;
                const newCenter = { lat: loc.lat(), lng: loc.lng() };
                console.log("🔍 FILTER: Center found:", newCenter);
                setFilterCenter(newCenter);
                isCenterManualRef.current = true;
                setMapCenter(newCenter);
            } else {
                console.error("🔍 FILTER: Geocoding failed:", status);
            }
        });
    }, [activeFilters.location, window.google?.maps?.Geocoder]);

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

    // Google Places Autocomplete (Post connection)
    useEffect(() => {
        if (!isPosting || !window.google?.maps?.places) return;

        const input = document.getElementById('post-location-input');
        if (!input) return;

        const autocomplete = new window.google.maps.places.Autocomplete(input, {
            types: ['geocode', 'establishment']
        });

        autocomplete.addListener('place_changed', async () => {
            const place = autocomplete.getPlace();
            if (place && place.geometry) {
                setNewLocation("Processing privacy...");
                const processed = await fuzzAndProcessLocation(place);
                if (processed) {
                    setTempCoords(processed.coords);
                    setNewLocation(processed.label);
                    setNewAddress(processed.secondaryLabel || "");
                }
            }
        });
    }, [isPosting, window.google?.maps?.places]);

    const sanitizeLocation = (loc) => {
        if (!loc) return "";
        const sanitized = loc.replace(/^\d+[\s,.]*/, "").trim();
        return sanitized || "Public Area";
    };

    const handleMarkerClick = (groupPins, clickedId) => {
        const anchor = groupPins?.[0];
        if (!anchor) return;

        // Expand from ALL pins so "same venue" shows all missed connections, 
        // even those slightly outside the current map distance filter.
        const venuePins = (pins || []).filter(p => {
            if (typeof p.lat !== "number" || typeof p.lng !== "number") return false;
            // Also respect hidden/reported status even in "expanded" view
            if (hiddenPins.includes(p.id) || p.isReported) return false;

            return haversineMeters(anchor.lat, anchor.lng, p.lat, p.lng) <= GROUP_RADIUS_METERS;
        });

        // stable ordering
        const sortedVenuePins = [...venuePins].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

        setSelectedPins(sortedVenuePins);
        const startIdx = Math.max(0, sortedVenuePins.findIndex(p => p.id === clickedId));
        setSelectedPinIndex(startIdx);
        setSelectedPin(sortedVenuePins[startIdx]);

        console.log(`📍 Marker Click: venuePins length = ${sortedVenuePins.length} (expanded from ${groupPins.length})`);
    };

    const nextPin = () => {
        const nextIdx = (selectedPinIndex + 1) % selectedPins.length;
        setSelectedPinIndex(nextIdx);
        setSelectedPin(selectedPins[nextIdx]);
    };

    const prevPin = () => {
        const prevIdx = (selectedPinIndex - 1 + selectedPins.length) % selectedPins.length;
        setSelectedPinIndex(prevIdx);
        setSelectedPin(selectedPins[prevIdx]);
    };


    const handleMapClick = () => {
        setSelectedPin(null);
    };

    const handleAddClick = async () => {
        if (!isLoggedIn) {
            navigate('/login');
            return;
        }

        if (isSuspended()) {
            setConfirmConfig({
                isOpen: true,
                title: 'ACCOUNT ON HOLD',
                message: 'Your account is currently on hold. You cannot post new pins during this time.',
                onConfirm: () => setConfirmConfig(prev => ({ ...prev, isOpen: false })),
                confirmText: 'OK',
                type: 'info'
            });
            return;
        }

        if (!mapInstance) return;

        const center = mapInstance.getCenter();
        const centerCoords = { lat: center.lat(), lng: center.lng() };

        setIsPosting(true);
        setNewLocation("Identifying location...");

        if (!window.google?.maps?.Geocoder) {
            setNewLocation("Public Area");
            return;
        }

        const geocoder = new window.google.maps.Geocoder();

        geocoder.geocode({ location: centerCoords }, async (results, status) => {
            if (status !== "OK" || !results?.[0]) {
                const jitterMeters = 100 + Math.random() * 100;
                const angle = Math.random() * Math.PI * 2;
                setTempCoords({
                    lat: centerCoords.lat + (Math.sin(angle) * jitterMeters) / 111111,
                    lng: centerCoords.lng + (Math.cos(angle) * jitterMeters) / (111111 * Math.cos(centerCoords.lat * Math.PI / 180))
                });
                setNewLocation("Public Area");
                return;
            }

            const processed = await fuzzAndProcessLocation(results[0]);
            if (processed) {
                setTempCoords(processed.coords);
                setNewLocation(processed.label);
                setNewAddress(processed.secondaryLabel || "");
            }
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
            time: newTime ? newTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
            description: newDescription,
            ownerEmail: user?.email,
            address: newAddress
        };
        addPin(newPin);
        setIsPosting(false);
        setTempCoords(null);
        setNewType('');
        setNewTitle('');
        setNewLocation('');
        setNewAddress('');
        setNewDate(new Date());
        setNewTime(null);
        setNewDescription('');
    };

    const cancelPost = () => {
        setIsPosting(false);
        setTempCoords(null);
        setNewDate(new Date());
        setNewTime(null);
    };

    const handleReportSubmit = () => {
        if (!reportReason.trim() || !selectedPin) return;
        reportPin(selectedPin.id, reportReason);
        setShowReportModal(false);
        setReportReason('');
        setSelectedPin(null);
        setConfirmConfig({
            isOpen: true,
            title: 'REPORT SUBMITTED',
            message: 'PIN REPORTED TO ADMIN AND TEMPORARILY HIDDEN FROM YOUR VIEW.',
            onConfirm: () => setConfirmConfig(prev => ({ ...prev, isOpen: false })),
            confirmText: 'OK',
            type: 'info'
        });
    };


    const defaultCenter = mapCenter || { lat: 35.2271, lng: -80.8431 };

    return (
        <APIProvider apiKey={API_KEY} libraries={['places', 'geometry']}>
            {isLocating && !mapCenter ? (
                <div className="map-loading-screen">
                    <div className="loading-content">
                        <span className="loading-heart">❤️</span>
                        <p>LOCATING CONNECTIONS...</p>
                    </div>
                </div>
            ) : (
                <div className="map-view-container">
                    <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
                    <header className="map-top-bar-original">
                        <div className="top-bar-side-left">
                            <button className="map-hamburger-btn" onClick={() => setIsMenuOpen(true)}>
                                <div className="hamburger-line-small"></div>
                                <div className="hamburger-line-small"></div>
                                <div className="hamburger-line-small"></div>
                            </button>
                        </div>
                        <h1 className="map-logo-title-original" onClick={() => navigate('/')}>MISS ME CONNECTIONS</h1>
                        <div className="top-bar-side-right">
                            <button className={`original-settings-btn ${!!(activeFilters.location || activeFilters.type || activeFilters.date || activeFilters.keyword) ? 'filter-active' : ''}`} onClick={() => setIsFilterOpen(true)}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                                    <path d="M3 17h18v2H3v-2zm0-7h18v2H3v-2zm0-7h18v2H3V3zM5 5v2h2V5H5zm0 7v2h2v-2H5zm12 7v2h2v-2h-2z" />
                                </svg>
                                {!!(activeFilters.location || activeFilters.type || activeFilters.date || activeFilters.keyword) && <span className="filter-badge-dot" />}
                            </button>
                        </div>
                    </header>

                    <FilterMenu
                        isOpen={isFilterOpen}
                        onClose={() => setIsFilterOpen(false)}
                        filters={activeFilters}
                        onFilterChange={setActiveFilters}
                    />

                    <div className="map-canvas">
                        <GoogleMap
                            defaultCenter={defaultCenter}
                            defaultZoom={13}
                            gestureHandling={'greedy'}
                            disableDefaultUI={false}
                            zoomControl={true}
                            zoomControlOptions={{ position: 8 }} // RIGHT_CENTER
                            streetViewControl={false}
                            mapTypeControl={false}
                            fullscreenControl={false}
                            styles={mapMode === 'dark' ? mapThemeDark : []}
                            onClick={handleMapClick}
                            onDragStart={() => isDragging.current = true}
                            onDragEnd={() => setTimeout(() => isDragging.current = false, 50)}
                            onCameraChanged={(ev) => {
                                setCurrentZoom(ev.detail.zoom);
                                if (isCenterManualRef.current) {
                                    isCenterManualRef.current = false;
                                }

                                // SYNC VISIBLE PINS FOR BROWSE PAGE
                                if (ev.detail.bounds) {
                                    const { north, south, east, west } = ev.detail.bounds;
                                    const visible = (pins || []).filter(p =>
                                        p.lat >= south &&
                                        p.lat <= north &&
                                        p.lng >= west &&
                                        p.lng <= east
                                    ).map(p => p.id);
                                    setVisiblePinIds(visible);
                                }
                            }}
                            onLoad={(map) => setMapInstance(map)}
                        >
                            <MapHandler center={mapCenter} />
                            {/* Render markers grouped by location to handle overlaps */}
                            {Object.entries(locationsGrouped).map(([locKey, groupPins]) => {
                                const firstPin = groupPins[0];
                                return (
                                    <Marker
                                        key={locKey}
                                        position={{ lat: firstPin.lat, lng: firstPin.lng }}
                                        ref={m => setMarkerRef(m, locKey)}
                                        onClick={() => handleMarkerClick(groupPins, firstPin.id)}
                                        icon={{
                                            url: '/assets/heart-logo.svg',
                                            scaledSize: { width: 44, height: 44 },
                                            anchor: { x: 22, y: 44 }
                                        }}
                                        label={groupPins.length > 1 ? {
                                            text: String(groupPins.length),
                                            color: 'white',
                                            className: 'marker-count-label'
                                        } : (currentZoom >= 12 && firstPin.title ? {
                                            text: firstPin.title.toString().toUpperCase(),
                                            color: 'white',
                                            className: 'legacy-marker-label'
                                        } : null)}
                                    />
                                );
                            })}

                            {selectedPin && typeof selectedPin.lat === 'number' && typeof selectedPin.lng === 'number' && (
                                <InfoWindow
                                    position={{ lat: selectedPin.lat, lng: selectedPin.lng }}
                                    onCloseClick={() => {
                                        setSelectedPin(null);
                                        setSelectedPins([]);
                                    }}
                                    headerDisabled={true}
                                >
                                    <div className="google-popup-content">
                                        <div className="popup-carousel-controls">
                                            {selectedPins.length > 1 && (
                                                <div className="carousel-nav-group">
                                                    <button className="carousel-arrow" onClick={prevPin}>❮</button>
                                                    <span className="carousel-counter">{selectedPinIndex + 1} of {selectedPins.length}</span>
                                                    <button className="carousel-arrow" onClick={nextPin}>❯</button>
                                                </div>
                                            )}
                                            <button
                                                className="popup-close-btn-custom"
                                                onClick={() => {
                                                    setSelectedPin(null);
                                                    setSelectedPins([]);
                                                }}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                        <span className="popup-category-badge">{selectedPin.type || 'Man for Woman'}</span>
                                        <div className="popup-rating-row">
                                            <div className="popup-hearts readonly">
                                                {[1, 2, 3, 4, 5].map(val => (
                                                    <span key={val} className={`popup-heart ${val <= Math.round(getAverageRating(selectedPin.id)) ? 'filled' : ''}`}>❤️</span>
                                                ))}
                                            </div>
                                            <span className="popup-avg-text">AVG: {getAverageRating(selectedPin.id)}</span>
                                        </div>

                                        <h2 className="popup-title">{selectedPin.title}</h2>
                                        <div className="popup-location-stack">
                                            <p className="popup-location-main">{selectedPin.location}</p>
                                            {selectedPin.address && (
                                                <p className="popup-location-sub">{selectedPin.address}</p>
                                            )}
                                        </div>
                                        <p className="popup-meta">{formatDate(selectedPin.date)}</p>
                                        <p className="popup-description">{selectedPin.description}</p>

                                        <div className="popup-footer">
                                            <button className="popup-details-link-btn" onClick={() => navigate(`/browse/${selectedPin.id}`)}>
                                                View Details —
                                            </button>

                                            <div className="popup-footer-right">
                                                <button className="popup-its-not-me-btn" onClick={() => {
                                                    hidePin(selectedPin.id);
                                                    setSelectedPin(null);
                                                    setSelectedPins([]);
                                                }}>
                                                    IT'S NOT ME.
                                                </button>

                                                <button className="popup-report-btn" onClick={() => setShowReportModal(true)}>
                                                    REPORT
                                                </button>

                                                {(selectedPin.ownerUid === user?.uid || selectedPin.ownerEmail === user?.email || user?.isAdmin) && (
                                                    <button className="popup-delete-btn" onClick={() => {
                                                        console.log("🗑️ Deleting pin ID:", selectedPin.id);
                                                        removePin(selectedPin.id);
                                                        setSelectedPin(null);
                                                        setSelectedPins([]);
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
                                                    placeholderText="Time (Optional)"
                                                    isClearable
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

                    {showReportModal && (
                        <div className="post-modal-overlay">
                            <div className="post-modal-card report-modal">
                                <div className="report-warning-box">
                                    <span className="warning-emoji">🛑</span>
                                    <h2 className="post-modal-title">REPORT PIN</h2>
                                    <p className="warning-text">
                                        If you falsely claim what we deem a <strong>Good Pin</strong> your account will be suspended for 48 hours your first strike.
                                    </p>
                                </div>
                                <div className="post-input-group">
                                    <label>REASON FOR REPORTING</label>
                                    <textarea
                                        className="post-textarea"
                                        placeholder="Example: Offensive language, fake location, etc."
                                        value={reportReason}
                                        onChange={(e) => setReportReason(e.target.value)}
                                    />
                                </div>
                                <div className="post-modal-actions">
                                    <button type="button" className="btn-cancel" onClick={() => setShowReportModal(false)}>CANCEL</button>
                                    <button type="button" className="btn-submit report-submit" onClick={handleReportSubmit}>SUBMIT REPORT</button>
                                </div>
                            </div>
                        </div>
                    )}
                    <ConfirmModal
                        isOpen={confirmConfig.isOpen}
                        title={confirmConfig.title}
                        message={confirmConfig.message}
                        onConfirm={confirmConfig.onConfirm}
                        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
                        confirmText={confirmConfig.confirmText}
                        cancelText={confirmConfig.cancelText}
                        type={confirmConfig.type}
                    />
                    <BottomNav onAddClick={handleAddClick} showAddButton={true} />
                </div>
            )}
        </APIProvider>
    );
};

export default MapView;

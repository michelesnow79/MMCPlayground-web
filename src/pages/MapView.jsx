import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { APIProvider, Map as GoogleMap, Marker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import BottomNav from '../components/BottomNav';
import { Geolocation } from '@capacitor/geolocation';
import SideMenu from '../components/SideMenu';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import './MapView.css';
import { useApp } from '../context/AppContext';
import FilterMenu from '../components/FilterMenu';
import ConfirmModal from '../components/ConfirmModal';
import MapHeader from '../components/MapHeader';
import { fuzzAndProcessLocation, haversineMeters } from '../utils/locationHelper';
import { logPinDebug } from '../utils/logger';
import logoAsset from '../assets/heart-logo.svg';
import telemetry from '../utils/telemetry';

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
        addPin, removePin, hidePin, hiddenPins, formatDate, formatRelativeTime, mapMode,
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
    const [minLoadingTimeElapsed, setMinLoadingTimeElapsed] = useState(false);
    const [fallbackUsed, setFallbackUsed] = useState(false);


    const GROUP_RADIUS_METERS = 150; // Increased from 75 to prevent label overlap
    const [filterCenter, setFilterCenter] = useState(null);
    const [userLocation, setUserLocation] = useState(null);
    const [showRecenterBtn, setShowRecenterBtn] = useState(false);

    const [isPosting, setIsPosting] = useState(false);
    const [isSavingPin, setIsSavingPin] = useState(false);
    const [tempCoords, setTempCoords] = useState(null);
    const [newType, setNewType] = useState('');
    const [newTitle, setNewTitle] = useState('');
    const [newLocation, setNewLocation] = useState('');
    const [newPlaceId, setNewPlaceId] = useState(null);
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

    // Start map load timer
    useEffect(() => {
        telemetry.startTimer('map_load');
    }, []);

    const handleMapLoad = useCallback((map) => {
        setMapInstance(map);
        telemetry.endTimer('map_load');
    }, []);

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

            // Global Hide (Owner/Admin controlled)
            if (p.status === 'hidden' && p.ownerUid !== user?.uid && !user?.isAdmin) return false;

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
            try {
                const filterDateStr = activeFilters.date.toISOString().split('T')[0];
                result = result.filter(pin => {
                    if (!pin.date) return false;
                    try {
                        const pinDateStr = new Date(pin.date).toISOString().split('T')[0];
                        return pinDateStr === filterDateStr;
                    } catch (e) {
                        return false;
                    }
                });
            } catch (e) {
                console.error("Date filter error:", e);
            }
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
        const groups = []; // { key, lat, lng, pins: [], placeId: string|null }

        (filteredPins || []).forEach(pin => {
            if (typeof pin.lat !== 'number' || typeof pin.lng !== 'number') return;

            let g = null;

            // 1. Strict PlaceID Match
            if (pin.placeId) {
                g = groups.find(group => group.placeId === pin.placeId);
            }

            // 2. Fallback: Distance Match (only if no existing placeId match and we want to group purely by proximity)
            // But we should be careful not to merge a placeId pin into a non-placeId group too aggressively.
            if (!g) {
                // If the pin has a placeId, prefer creating a new group unless we find a group with same placeId (handled above).
                // If the pin DOES NOT have a placeId, maybe group it with neighbors?
                // For now, let's allow merging if distance is very close, BUT if candidate has a different placeId, skip it.

                for (const candidate of groups) {
                    // Strict barrier: don't merge distinct place ID venues
                    if (pin.placeId && candidate.placeId && pin.placeId !== candidate.placeId) continue;

                    const d = haversineMeters(pin.lat, pin.lng, candidate.lat, candidate.lng);
                    if (d <= GROUP_RADIUS_METERS) { g = candidate; break; }
                }
            }

            if (!g) {
                // Create new group
                const key = pin.placeId ? `place:${pin.placeId}` : `${pin.lat.toFixed(5)}_${pin.lng.toFixed(5)}_${groups.length}`;

                groups.push({
                    key,
                    lat: pin.lat,
                    lng: pin.lng,
                    pins: [pin],
                    placeId: pin.placeId || null
                });
            } else {
                g.pins.push(pin);
            }
        });

        // convert to same shape the JSX expects
        const groupedMap = Object.fromEntries(groups.map(g => [g.key, g.pins]));
        logPinDebug("📍 MAP DEBUG: Venue groups:", Object.keys(groupedMap).length);
        return groupedMap;
    }, [filteredPins]);

    // 5. EFFECTS
    useEffect(() => {
        logPinDebug("📍 MAP DEBUG: Total pins loaded from Firebase:", pins.length);
    }, [pins]);

    // Sync global distance unit
    useEffect(() => {
        setActiveFilters(prev => ({ ...prev, unit: distanceUnit }));
    }, [distanceUnit]);

    // Force a minimum loading time so the premium hearts are actually seen!
    useEffect(() => {
        const timer = setTimeout(() => {
            setMinLoadingTimeElapsed(true);
        }, 1500);
        return () => clearTimeout(timer);
    }, []);

    // ---------------------------------------------------------
    // ORCHESTRATED LOCATION LOGIC
    // ---------------------------------------------------------

    // Diagnosis logger
    useEffect(() => {
        console.log("📍 [DIAGNOSTICS] Map Initializing:", {
            userUid: user?.uid,
            profileZip: user?.postalCode,
            hasGeo: !!navigator.geolocation,
            currentCenter: mapCenter ? `${mapCenter.lat}, ${mapCenter.lng}` : 'null'
        });
    }, [user?.uid, user?.postalCode]);

    const applyNationwideFallback = useCallback((reason) => {
        console.log(`📍 [FALLBACK] Triggered: ${reason}. Using Nationwide View.`);
        // Geometric center of US: ~39.8, -98.5
        setMapCenter({ lat: 39.8283, lng: -98.5795 });
        setCurrentZoom(4);
        setFallbackUsed(true);
        setIsLocating(false);
        isCenterManualRef.current = true;
    }, []);

    const attemptZipGeocode = useCallback((zip) => {
        console.log(`📍 [GEO] Attempting ZIP Geocode: ${zip}`);
        if (!window.google?.maps?.Geocoder) {
            console.warn("📍 [GEO] Google Geocoder not available yet.");
            return;
        }

        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: zip }, (results, status) => {
            if (status === "OK" && results?.[0]) {
                const loc = results[0].geometry.location;
                const newCenter = { lat: loc.lat(), lng: loc.lng() };
                console.log("📍 [GEO] ZIP Success:", newCenter);
                setMapCenter(newCenter);
                setFallbackUsed(false);
                setIsLocating(false);
                isCenterManualRef.current = true;
            } else {
                console.error("📍 [GEO] ZIP Geocode Failed:", status);
                applyNationwideFallback("Zip Geocode Failed");
            }
        });
    }, [applyNationwideFallback]);

    // Main Geolocation Controller
    useEffect(() => {
        // 0. BLOCK: Wait for Auth Loading
        if (loading) {
            console.log("📍 [GEO] Waiting for auth loading...");
            return;
        }

        // Reset if we are locating
        if (!isLocating) return;

        // 0. Wait for Window Google logic
        if (!window.google?.maps?.Geocoder) {
            // Retry quickly if API not ready
            const t = setTimeout(() => {
                // If still failing after retry, we might fallback, but ideally just wait for next render
            }, 500);
            return () => clearTimeout(t);
        }

        // 1. PRIORITY: User Profile ZIP
        if (user?.postalCode) {
            console.log("📍 [GEO] Profile ZIP found:", user.postalCode);
            attemptZipGeocode(user.postalCode);
            return;
        }

        // 2. Try GPS (Device Location)
        if (navigator.geolocation) {
            console.log("📍 [GEO] Requesting navigator.geolocation...");
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    if (import.meta.env.DEV) console.log("📍 [GEO] GPS Success:", coords);

                    setUserLocation(coords);
                    setMapCenter(coords);
                    setFallbackUsed(false);
                    setIsLocating(false);
                    isCenterManualRef.current = true;
                    setCurrentZoom(15);
                },
                (err) => {
                    console.warn("📍 [GEO] GPS Error:", err.code, err.message);
                    // 3. Fallback if GPS fails and no ZIP
                    applyNationwideFallback("GPS Denied/Error");
                },
                { timeout: 10000, enableHighAccuracy: true }
            );
        } else {
            console.warn("📍 [GEO] No navigator.geolocation support.");
            applyNationwideFallback("No Geo Support");
        }
    }, [isLocating, user, loading, attemptZipGeocode, applyNationwideFallback]);

    // Zoom Controls for Emulator
    const handleZoomIn = () => {
        if (mapInstance) {
            const z = mapInstance.getZoom() || 13;
            mapInstance.setZoom(z + 1);
        }
    };

    const handleZoomOut = () => {
        if (mapInstance) {
            const z = mapInstance.getZoom() || 13;
            mapInstance.setZoom(z - 1);
        }
    };

    // Safety Timeout: 10 seconds max loading
    useEffect(() => {
        const timer = setTimeout(() => {
            if (isLocating) {
                console.warn("📍 [GEO] Global timeout - forcing map open.");
                if (!mapCenter) {
                    applyNationwideFallback("Global Timeout");
                } else {
                    setIsLocating(false);
                }
            }
        }, 10000);
        return () => clearTimeout(timer);
    }, [isLocating, mapCenter, applyNationwideFallback]);

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

    const MapHandler = ({ center, zoom }) => {
        const map = useMap();
        useEffect(() => {
            if (map) {
                setMapInstance(map);
            }
        }, [map]);

        useEffect(() => {
            if (map && center && isCenterManualRef.current) {
                map.panTo(center);
                if (zoom !== undefined) {
                    map.setZoom(zoom);
                }
                isCenterManualRef.current = false;
            }
        }, [map, center, zoom]);
        return null;
    };

    // Google Places Autocomplete (Post connection)
    useEffect(() => {
        if (!isPosting || !window.google?.maps?.places) return;

        const input = document.getElementById('post-location-input');
        if (!input) return;

        const options = {
            types: ['geocode', 'establishment']
        };

        const autocomplete = new window.google.maps.places.Autocomplete(input, options);

        if (mapInstance) {
            // This is the "magic" that ensures search results follow the map's view exactly
            autocomplete.bindTo('bounds', mapInstance);
        }

        autocomplete.addListener('place_changed', async () => {
            const place = autocomplete.getPlace();
            if (place && place.geometry) {
                setNewLocation("Processing privacy...");
                const processed = await fuzzAndProcessLocation(place);
                if (processed) {
                    setTempCoords(processed.coords);
                    setNewLocation(processed.label);
                    setNewAddress(processed.secondaryLabel || "");
                    setNewPlaceId(processed.placeId || null);
                }
            }
        });
    }, [isPosting, window.google?.maps?.places]);

    // Google Places Autocomplete (Jump to Area)
    useEffect(() => {
        if (!mapInstance || !window.google?.maps?.places) return;

        const input = document.getElementById('map-jump-search');
        if (!input) return;

        const autocomplete = new window.google.maps.places.Autocomplete(input, {
            types: ['(regions)']
        });

        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.geometry && place.geometry.location) {
                mapInstance.panTo(place.geometry.location);
                mapInstance.setZoom(12);
                isCenterManualRef.current = true;
                setMapCenter({
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng()
                });
                // Clear the input after jumping
                input.value = "";
            }
        });
    }, [mapInstance]);

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

            // Strict PlaceID expansion
            if (anchor.placeId && p.placeId) {
                return anchor.placeId === p.placeId;
            }

            // Fallback: Distance
            return haversineMeters(anchor.lat, anchor.lng, p.lat, p.lng) <= GROUP_RADIUS_METERS;
        });

        // stable ordering
        const sortedVenuePins = [...venuePins].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

        setSelectedPins(sortedVenuePins);
        const startIdx = Math.max(0, sortedVenuePins.findIndex(p => p.id === clickedId));
        setSelectedPinIndex(startIdx);
        setSelectedPin(sortedVenuePins[startIdx]);

        setSelectedPin(sortedVenuePins[startIdx]);

        // Center map slightly above the pin so the InfoWindow (which is above the pin) is visible and not blocked by the top bar
        if (mapInstance && anchor) {
            const offset = 0.005; // Roughly shifts center North, pushing pin down
            // Ideally we'd use projection to shift by pixels, but a small lat offset works for typical zoom levels
            mapInstance.panTo({ lat: anchor.lat + offset, lng: anchor.lng });
            isCenterManualRef.current = true;
        }

        logPinDebug(`📍 Marker Click: venuePins length = ${sortedVenuePins.length} (expanded from ${groupPins.length})`);
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
                setNewPlaceId(processed.placeId || null);
            }
        });
    };

    const handleSavePin = async (e) => {
        e.preventDefault();
        if (isSavingPin) return; // Prevent double clicks

        logPinDebug("SAVE newDate state:", newDate);
        logPinDebug("SAVE newDate local:", newDate?.toString?.());
        logPinDebug("SAVE newDate iso:", newDate?.toISOString?.());

        const safe = new Date(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
        const encounterDate = `${safe.getFullYear()}-${String(safe.getMonth() + 1).padStart(2, '0')}-${String(safe.getDate()).padStart(2, '0')}`;

        logPinDebug("SAVE encounterDate:", encounterDate);

        const newPin = {
            id: Date.now().toString(),
            lat: tempCoords.lat,
            lng: tempCoords.lng,
            type: newType,
            title: newTitle.toUpperCase(),
            location: sanitizeLocation(newLocation),
            date: encounterDate, // Keep for now, but rely on encounterDate
            encounterDate: encounterDate, // New explicit field
            time: newTime ? newTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
            description: newDescription,
            ownerEmail: user?.email,
            address: newAddress,
            placeId: newPlaceId
        };

        try {
            setIsSavingPin(true);
            await addPin(newPin);
            // success: close modal + reset form fields
            setIsPosting(false);
            setTempCoords(null);
            setNewType('');
            setNewTitle('');
            setNewLocation('');
            setNewAddress('');
            setNewPlaceId(null);
            setNewDate(new Date());
            setNewTime(null);
            setNewDescription('');
        } catch (err) {
            console.error("Failed to save pin:", err);
        } finally {
            setIsSavingPin(false);
        }
    };

    const cancelPost = () => {
        setIsPosting(false);
        setTempCoords(null);
        setNewDate(new Date());
        setNewTime(null);
        setNewPlaceId(null);
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


    const handleRecenter = async () => {
        try {
            // 1. Check permissions first
            const permStatus = await Geolocation.checkPermissions();

            if (permStatus.location !== 'granted') {
                const requested = await Geolocation.requestPermissions();
                if (requested.location !== 'granted') {
                    alert("Please enable location permissions to use this feature.");
                    return;
                }
            }

            const position = await Geolocation.getCurrentPosition({
                enableHighAccuracy: true,
                timeout: 10000
            });

            const newCenter = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };

            setUserLocation(newCenter);
            setMapCenter(newCenter);
            setCurrentZoom(16);
            isCenterManualRef.current = true;
            setShowRecenterBtn(false);

        } catch (err) {
            console.error("Recenter failed:", err);
            // Fallback to basic web API if Capacitor fails (e.g. in browser)
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(pos => {
                    const newCenter = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    setMapCenter(newCenter);
                    setUserLocation(newCenter);
                    setCurrentZoom(16);
                    isCenterManualRef.current = true;
                    setShowRecenterBtn(false);
                }, (error) => {
                    alert("Could not retrieve location. Please check GPS settings.");
                });
            } else {
                alert("Location services unavailable.");
            }
        }
    };



    const defaultCenter = mapCenter || { lat: 39.8283, lng: -98.5795 };

    return (
        <APIProvider apiKey={API_KEY} libraries={['places', 'geometry']}>
            {(isLocating || !minLoadingTimeElapsed) ? (
                <div className="map-loading-screen">
                    <div className="loading-content">
                        <div className="loading-hearts">
                            <img src={logoAsset} className="heart-main-asset" alt="" />
                            <span className="heart-sub-1">❤️</span>
                            <span className="heart-sub-2">❤️</span>
                        </div>
                        <p>LOCATING CONNECTIONS...</p>
                    </div>
                </div>
            ) : (
                <div className="map-view-container">
                    {fallbackUsed && (
                        <div className="map-fallback-banner">
                            SHOWING NATIONWIDE CONNECTIONS. ENABLE LOCATION FOR LOCAL RESULTS.
                        </div>
                    )}
                    <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

                    <MapHeader
                        onMenuClick={() => setIsMenuOpen(true)}
                        onFilterClick={() => setIsFilterOpen(true)}
                        isFilterActive={!!(activeFilters.location || activeFilters.type || activeFilters.date || activeFilters.keyword)}
                    />

                    <FilterMenu
                        isOpen={isFilterOpen}
                        onClose={() => setIsFilterOpen(false)}
                        filters={activeFilters}
                        onFilterChange={setActiveFilters}
                        mapInstance={mapInstance}
                    />

                    {showRecenterBtn && (
                        <button className="recenter-fab" onClick={handleRecenter}>
                            📍
                        </button>
                    )}

                    <div className="emulator-zoom-controls">
                        <button className="zoom-btn-fab" onClick={handleZoomIn}>+</button>
                        <button className="zoom-btn-fab" onClick={handleZoomOut}>-</button>
                    </div>

                    <div className="map-canvas">
                        <GoogleMap
                            defaultCenter={defaultCenter}
                            defaultZoom={13}
                            gestureHandling={'greedy'}
                            disableDefaultUI={false}
                            zoomControl={false}
                            streetViewControl={false}
                            mapTypeControl={false}
                            fullscreenControl={false}
                            styles={(isLoggedIn && mapMode === 'dark') ? mapThemeDark : []}
                            onClick={handleMapClick}
                            onDragStart={() => isDragging.current = true}
                            onDragEnd={() => setTimeout(() => isDragging.current = false, 50)}
                            onCameraChanged={(ev) => {
                                setCurrentZoom(ev.detail.zoom);
                                if (isCenterManualRef.current) {
                                    isCenterManualRef.current = false;
                                }

                                // Show recenter button if map drifts from user location
                                if (userLocation) {
                                    const center = ev.detail.center;
                                    const dist = haversineMeters(center.lat, center.lng, userLocation.lat, userLocation.lng);
                                    // If we drift more than 50 meters, show button
                                    setShowRecenterBtn(dist > 50);
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
                            onLoad={handleMapLoad}
                        >
                            <MapHandler center={mapCenter} zoom={currentZoom} />
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
                                        } : (currentZoom >= 14 && firstPin.title ? {
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
                                        <div className="popup-rating-disclaimer">CAN ONLY RATE PIN FROM DETAILS PAGE</div>

                                        <h2 className="popup-title">{selectedPin.title}</h2>
                                        <div className="popup-location-stack">
                                            <p className="popup-location-main">{selectedPin.location}</p>
                                            {selectedPin.address && (
                                                <p className="popup-location-sub">{selectedPin.address}</p>
                                            )}
                                        </div>
                                        <div className="popup-meta-row">
                                            <p className="popup-meta">ENCOUNTER: {formatDate(selectedPin.encounterDate || selectedPin.date)}</p>
                                        </div>
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
                                                    <div className="owner-actions-row">
                                                        <button
                                                            className={`popup-hide-btn ${selectedPin.status === 'hidden' ? 'is-hidden' : ''}`}
                                                            onClick={async () => {
                                                                const newStatus = selectedPin.status === 'hidden' ? 'public' : 'hidden';
                                                                await updatePin(selectedPin.id, { status: newStatus });
                                                                // Update local state if needed (selectedPin is a snapshot)
                                                                setSelectedPin(prev => ({ ...prev, status: newStatus }));
                                                            }}
                                                        >
                                                            {selectedPin.status === 'hidden' ? 'Unhide' : 'Hide'}
                                                        </button>
                                                        <button className="popup-delete-btn" onClick={() => {
                                                            console.log("🗑️ Deleting pin ID:", selectedPin.id);
                                                            removePin(selectedPin.id);
                                                            setSelectedPin(null);
                                                            setSelectedPins([]);
                                                        }}>
                                                            Delete
                                                        </button>
                                                    </div>
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
                                                    onChange={(date) => {
                                                        if (!date) return;
                                                        logPinDebug("DATEPICKER onChange raw:", date);

                                                        // CHITTY'S FIX: Normalize immediately
                                                        const normalized = new Date(
                                                            date.getFullYear(),
                                                            date.getMonth(),
                                                            date.getDate()
                                                        );

                                                        logPinDebug("DATEPICKER normalized:", normalized);
                                                        setNewDate(normalized);
                                                    }}
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
                                            <button type="submit" className="btn-submit" disabled={isSavingPin}>{isSavingPin ? 'SAVING...' : 'POST'}</button>
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

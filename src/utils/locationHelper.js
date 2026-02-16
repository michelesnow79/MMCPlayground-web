// Haversine distance in meters
export const haversineMeters = (lat1, lon1, lat2, lon2) => {
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
export const getNearestCrossStreetsOSM = async (lat, lng, radiusMeters = 200) => {
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
export const findIntersectionWithFallback = async (lat, lng) => {
    return (
        (await getNearestCrossStreetsOSM(lat, lng, 200)) ||
        (await getNearestCrossStreetsOSM(lat, lng, 350)) ||
        (await getNearestCrossStreetsOSM(lat, lng, 500))
    );
};

// Unified privacy logic for both geocoder results and Autocomplete place objects
export const fuzzAndProcessLocation = async (placeOrResult) => {
    if (!placeOrResult || !placeOrResult.geometry || !placeOrResult.geometry.location) return null;

    const types = placeOrResult.types || [];
    const comps = placeOrResult.address_components || [];
    const loc = placeOrResult.geometry.location;
    const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
    const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;

    // 1) VENUE/POI: keep exact & get name
    const isVenue = (
        types.includes("point_of_interest") ||
        types.includes("establishment") ||
        types.includes("stadium") ||
        types.includes("park") ||
        types.includes("airport") ||
        types.includes("natural_feature")
    ) && !types.includes("subpremise") && !types.includes("premise");

    if (isVenue) {
        const poiName = placeOrResult.name || (comps.length > 0 ? comps[0].long_name : "Public Venue");
        const fullAddress = placeOrResult.formatted_address || "";

        return {
            coords: { lat, lng },
            label: poiName,
            secondaryLabel: fullAddress
        };
    }

    // 2) RESIDENTIAL DETECTION
    const hasStreetNumber = comps.some((c) => c.types.includes("street_number"));
    const isStreetAddressType =
        types.includes("street_address") ||
        types.includes("premise") ||
        types.includes("subpremise") ||
        types.includes("home_goods_store");

    const isResidential = hasStreetNumber || isStreetAddressType;

    // 3) Privacy jitter
    const jitterMeters = 100 + Math.random() * 100;
    const angle = Math.random() * Math.PI * 2;
    const latJitter = (Math.sin(angle) * jitterMeters) / 111111;
    const lngJitter = (Math.cos(angle) * jitterMeters) / (111111 * Math.cos(lat * Math.PI / 180));

    const fuzzedCoords = {
        lat: lat + latJitter,
        lng: lng + lngJitter,
    };

    if (isResidential) {
        const intersection = await findIntersectionWithFallback(fuzzedCoords.lat, fuzzedCoords.lng);
        if (intersection) {
            const label = (intersection.streets?.length >= 2)
                ? `Near ${intersection.streets[0]} & ${intersection.streets[1]}`
                : "Near a cross street";

            return {
                coords: { lat: intersection.lat, lng: intersection.lng },
                label,
                secondaryLabel: ""
            };
        }
    }

    return {
        coords: fuzzedCoords,
        label: "Public Area",
        secondaryLabel: ""
    };
};

export const getStateAndCountryFromZip = async (zip) => {
    if (!zip || !window.google?.maps?.Geocoder) return null;
    const geocoder = new window.google.maps.Geocoder();
    return new Promise((resolve) => {
        geocoder.geocode({ address: zip }, (results, status) => {
            if (status === "OK" && results[0]) {
                const comps = results[0].address_components;
                const state = comps.find(c => c.types.includes("administrative_area_level_1"))?.short_name || "";
                const country = comps.find(c => c.types.includes("country"))?.long_name || "";
                resolve({ state, country });
            } else {
                resolve(null);
            }
        });
    });
};

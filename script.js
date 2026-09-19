// ==========================================
// PAGE NAVIGATION
// ==========================================

function showPage(pageId) {
    const pages = document.querySelectorAll(".app-page");

    pages.forEach(page => {
        page.classList.remove("active-page");
    });

    const selectedPage = document.getElementById(pageId);

    if (selectedPage) {
        selectedPage.classList.add("active-page");
    }

    if (pageId === "resultsPage" && typeof map !== "undefined") {
        setTimeout(() => {
            map.invalidateSize();
        }, 300);
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


const API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjVkYzkxNTJmZWMyZTQ2MDFiZjkzNDA4ZTEyMzAwODY2IiwiaCI6Im11cm11cjY0In0=";


// ==========================================
// MAP INITIALIZATION
// ==========================================

let map = L.map("map", {
    scrollWheelZoom: false,
    zoomControl: true,
    dragging: true,
    doubleClickZoom: false,
    touchZoom: false,
    boxZoom: false
}).setView(
    [18.5204, 73.8567],
    7
);

L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { attribution: "&copy; OpenStreetMap contributors" }
).addTo(map);


// ==========================================
// GLOBAL VARIABLES
// ==========================================

let routeLayer;
let chargingStations = [];
let stationMarkers = {};
let destinationCoords = null;
let userLocation = null;


// ==========================================
// ROUTES FROM CSV DATASET
// ==========================================

function getRouteCities(fromCity, toCity) {

    const routes = {};

    chargingStations.forEach(station => {

        const routeName = String(station.Route_Name || "").trim();
        const city = String(station.City || "").trim();
        const order = Number(station.Route_Order);

        if (!routeName || !city || isNaN(order)) return;

        if (!routes[routeName]) routes[routeName] = {};

        routes[routeName][order] = city;
    });

    for (const routeName of Object.keys(routes)) {

        const orderedCities = Object.keys(routes[routeName])
            .map(Number)
            .sort((a, b) => a - b)
            .map(order => routes[routeName][order]);

        const cities = [...new Set(orderedCities)];

        const startIndex = cities.findIndex(
            city => city.toLowerCase() === fromCity.trim().toLowerCase()
        );

        const endIndex = cities.findIndex(
            city => city.toLowerCase() === toCity.trim().toLowerCase()
        );

        if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
            return {
                routeName: routeName,
                cities: cities.slice(startIndex, endIndex + 1)
            };
        }
    }

    return null;
}


// ==========================================
// STATIONS ALONG THE ACTUAL DRIVING ROUTE
// (works for ANY From/To pair, not just the
// handful of routes curated in the CSV)
// ==========================================

// How far off the driving path (in km) a station can be
// and still count as "on the way".
const ROUTE_CORRIDOR_KM = 5;

// Handles "Available", "available", and the "availabe" typo in the data.
function isStationAvailable(status) {
    return String(status || "").trim().toLowerCase().startsWith("avail");
}

// Cumulative distance (km) travelled at each vertex of the route line.
function buildCumulativeDistances(routeCoords) {

    const cumDist = [0];

    for (let i = 1; i < routeCoords.length; i++) {

        const [lon1, lat1] = routeCoords[i - 1];
        const [lon2, lat2] = routeCoords[i];

        cumDist.push(cumDist[i - 1] + calculateDistance(lat1, lon1, lat2, lon2));
    }

    return cumDist;
}

// Closest point on the route to a station, returning how far off the
// route it is, and how far along the route (from the start) that is.
function nearestPointOnRoute(routeCoords, cumDist, stationLat, stationLng) {

    let offRouteKm = Infinity;
    let alongRouteKm = 0;

    for (let i = 0; i < routeCoords.length; i++) {

        const [lon, lat] = routeCoords[i];
        const d = calculateDistance(stationLat, stationLng, lat, lon);

        if (d < offRouteKm) {
            offRouteKm = d;
            alongRouteKm = cumDist[i];
        }
    }

    return { offRouteKm, alongRouteKm };
}

// Returns available charging stations within ROUTE_CORRIDOR_KM of the
// route line, and within the vehicle's range along that route.
function findStationsAlongRoute(routeCoords, range) {

    const cumDist = buildCumulativeDistances(routeCoords);
    const found = [];

    chargingStations.forEach(station => {

        if (!isStationAvailable(station.Status)) return;

        const lat = parseFloat(station.Latitude);
        const lng = parseFloat(station.Longitude);

        if (isNaN(lat) || isNaN(lng)) return;

        const { offRouteKm, alongRouteKm } = nearestPointOnRoute(routeCoords, cumDist, lat, lng);

        if (offRouteKm <= ROUTE_CORRIDOR_KM && alongRouteKm <= range) {
            found.push({
                ...station,
                distance: alongRouteKm,
                offRouteKm: offRouteKm
            });
        }
    });

    return found;
}


// ==========================================
// LOAD CSV DATA
// ==========================================

Papa.parse(
    "data/Maharashtra_EV_Charging_Stations_Merged_Final_CLEANED.csv",
    {
        download: true,
        header: true,

        complete: function(results) {

            console.log("CSV First Row:", results.data[0]);
            console.log("CSV Headers:", Object.keys(results.data[0] || {}));

            chargingStations = results.data
                .map(station => {
                    const clean = {};
                    Object.keys(station).forEach(key => {
                        const cleanKey = key.trim();
                        const value = station[key];
                        clean[cleanKey] = typeof value === "string" ? value.trim() : value;
                    });
                    return clean;
                })
                .filter(station => station.Latitude && station.Longitude);

            console.log("Stations Loaded:", chargingStations.length);

            chargingStations.forEach(station => {

                const lat = parseFloat(station.Latitude);
                const lng = parseFloat(station.Longitude);

                let marker = L.marker([lat, lng]).addTo(map);

                stationMarkers[station.Station_Name] = marker;

                marker.bindPopup(`
                    <b>${station.Station_Name}</b><br>
                    City : ${station.City}<br>
                    Operator : ${station.Operator}<br>
                    Charger : ${station.Charger_Type}<br>
                    Power : ${station.Power_kW} kW<br>
                    Status : ${station.Status}
                `);
            });
        },

        error: function(error) {
            console.error("CSV Loading Error:", error);
        }
    }
);


// ==========================================
// DISTANCE CALCULATION
// ==========================================

function calculateDistance(lat1, lon1, lat2, lon2) {

    const R = 6371;

    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}


// ==========================================
// FIND ROUTE
// ==========================================

// ==========================================
// GEOCODE A CITY NAME -> [lon, lat]
// Biased to Maharashtra/India so common town
// names don't resolve to the wrong country,
// and throws a clear error if nothing is found.
// ==========================================

async function geocodeCity(cityName) {

    const url =
        `https://api.openrouteservice.org/geocode/search` +
        `?api_key=${API_KEY}` +
        `&text=${encodeURIComponent(cityName + ", Maharashtra, India")}` +
        `&boundary.country=IN` +
        `&size=1`;

    const res = await fetch(url);

    if (!res.ok) {
        const errText = await res.text();
        console.error("Geocode HTTP error:", res.status, errText);
        throw new Error(`Could not look up "${cityName}" (geocoding service error ${res.status}).`);
    }

    const data = await res.json();

    if (!data.features || data.features.length === 0) {
        throw new Error(`Could not find "${cityName}". Try a nearby larger city or check spelling.`);
    }

    return data.features[0].geometry.coordinates; // [lon, lat]
}


async function findRoute() {

    const from = document.getElementById("from").value.trim();
    const to = document.getElementById("to").value.trim();

    const fromCity = from.charAt(0).toUpperCase() + from.slice(1).toLowerCase();
    const toCity = to.charAt(0).toUpperCase() + to.slice(1).toLowerCase();

    const battery = Number(document.getElementById("battery").value);
    const range = Number(document.getElementById("range").value);
    const availableRange = range * (battery / 100);

    if (!from || !to || !battery || !range) {
        alert("Please fill all details.");
        return;
    }

    try {

        const start = await geocodeCity(fromCity);
        const end = await geocodeCity(toCity);

        let startLon = start[0];
        let startLat = start[1];
        let endLon = end[0];
        let endLat = end[1];
        destinationCoords = [endLon, endLat];

        let response = await fetch(
            "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
            {
                method: "POST",
                headers: {
                    Authorization: API_KEY,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ coordinates: [start, end] })
            }
        );

        let routeData = await response.json();

        if (!response.ok || !routeData.features || routeData.features.length === 0) {
            console.error("Directions API error:", routeData);
            const apiMessage =
                routeData.error?.message ||
                routeData.error ||
                "Could not calculate a driving route between these two places.";
            alert(apiMessage);
            return;
        }

        showPage("resultsPage");

setTimeout(() => {
    map.invalidateSize();
}, 300);

        if (routeLayer) {
            map.removeLayer(routeLayer);
        }

        routeLayer = L.geoJSON(routeData).addTo(map);
        map.fitBounds(routeLayer.getBounds());

        let totalDistance = routeData.features[0].properties.summary.distance / 1000;
        let totalTime = routeData.features[0].properties.summary.duration / 60;

        console.log("Route Distance :", totalDistance);

        // Find available charging stations within ROUTE_CORRIDOR_KM of the
        // actual driving path (works for any From/To, not just the routes
        // curated in the CSV's Route_Name column).
        const routeCoords = routeData.features[0].geometry.coordinates;

        let reachableStations = findStationsAlongRoute(routeCoords, range);

        console.log("Reachable Stations (along route):", reachableStations);

        if (reachableStations.length === 0) {
            document.getElementById("result").innerHTML = `
                <h2>⚠ No Reachable Charging Station</h2>
                <p><b>Total Distance:</b> ${totalDistance.toFixed(2)} KM</p>
                <p><b>Vehicle Range:</b> ${range} KM</p>
                <p>No charging station is reachable with the current battery range.</p>
            `;
            return;
        }

        // ==========================================
        // AI SCORE
        // ==========================================

        reachableStations.forEach(station => {

            let score = 0;

            score += Number(station.Power_kW || 0);
            score += Number(station.Available_Chargers || 0) * 10;
            score += Number(station.Review_Rating || 0) * 10;
            score += Number(station.Review_Count || 0) / 100;

            if (
                String(station.Has_Food_Court).toLowerCase() === "yes" ||
                String(station.Has_Food_Court).toLowerCase() === "true"
            ) score += 10;

            if (
                String(station.Has_Cafe).toLowerCase() === "yes" ||
                String(station.Has_Cafe).toLowerCase() === "true"
            ) score += 8;

            if (
                String(station.Has_Washroom).toLowerCase() === "yes" ||
                String(station.Has_Washroom).toLowerCase() === "true"
            ) score += 5;

            score -= Number(station.Estimated_Waiting_Time_Min || 0);
            score -= Number(station.Charging_Cost_per_Unit || 0);
            score -= station.distance / 10;

            station.score = score;
        });

        reachableStations.sort((a, b) => b.score - a.score);

        let station = reachableStations[0];

        let reasons = [];

        const rating = Number(station.Review_Rating || 0);

        if (rating >= 4.5) {
            reasons.push(`⭐ High Customer Rating: ${rating}/5`);
        } else if (rating >= 4.0) {
            reasons.push(`⭐ Good Customer Rating: ${rating}/5`);
        }

        const reviewCount = Number(station.Review_Count || 0);

        if (reviewCount >= 50) {
            reasons.push(`👥 Trusted by ${reviewCount} customers`);
        }

        if (
            String(station.Has_Food_Court).toLowerCase() === "yes" ||
            String(station.Has_Food_Court).toLowerCase() === "true"
        ) reasons.push("🍔 Food Court Available");

        if (
            String(station.Has_Cafe).toLowerCase() === "yes" ||
            String(station.Has_Cafe).toLowerCase() === "true"
        ) reasons.push("☕ Cafe Available");

        if (
            String(station.Has_Washroom).toLowerCase() === "yes" ||
            String(station.Has_Washroom).toLowerCase() === "true"
        ) reasons.push("🚻 Washroom Available");

        if (station.Status && station.Status.toLowerCase() === "available") {
            reasons.push("✅ Charging Station is Available");
        }

        if (Number(station.Power_kW || 0) >= 50) {
            reasons.push("⚡ Fast Charging Supported");
        }

        if (Number(station.Estimated_Waiting_Time_Min || 0) <= 10) {
            reasons.push("🕒 Low Waiting Time");
        } else {
            reasons.push("🕒 Moderate Waiting Time");
        }

        if (Number(station.Charging_Cost_per_Unit || 0) <= 10) {
            reasons.push("💰 Low Charging Cost");
        }

        if (Number(station.Available_Chargers || 0) >= 2) {
            reasons.push("🔌 Multiple Chargers Available");
        }

        reasons.push(`🛣️ Only ${station.offRouteKm.toFixed(1)} km off your driving route`);

        if (stationMarkers[station.Station_Name]) {
            map.setView(
                [parseFloat(station.Latitude), parseFloat(station.Longitude)],
                13
            );
            stationMarkers[station.Station_Name].openPopup();
        }

        // ==========================================
        // DESTINATION REACHABILITY
        // ==========================================

        if (totalDistance <= range) {
            document.getElementById("result").innerHTML = `
                <h2>🚗 Smart EV Recommendation</h2>
                <p><b>From:</b> ${from}</p>
                <p><b>To:</b> ${to}</p>
                <p><b>Total Distance:</b> ${totalDistance.toFixed(2)} KM</p>
                <p><b>Estimated Time:</b> ${totalTime.toFixed(0)} Minutes</p>
                <p><b>Battery:</b> ${battery}%</p>
                <p><b>Vehicle Range:</b> ${range} KM</p>
                <hr>
                <h3 style="color:green;">✅ Destination can be reached without charging.</h3>
            `;
            return;
        }

        let reachableMessage = "";

        if (totalDistance <= range) {
            reachableMessage = `
                <p style="color:green; font-weight:bold;">
                    ✅ Destination can be reached without charging.
                </p>
            `;
        } else {
            reachableMessage = `
                <p style="color:red; font-weight:bold;">
                    ⚠ Destination cannot be reached directly. Intermediate charging is recommended.
                </p>
            `;
        }

        document.getElementById("result").innerHTML = `
            <h2>🚗 Smart EV Recommendation</h2>
            <p><b>From:</b> ${from}</p>
            <p><b>To:</b> ${to}</p>
            <p><b>Total Distance:</b> ${totalDistance.toFixed(2)} KM</p>
            <p><b>Estimated Time:</b> ${totalTime.toFixed(0)} Minutes</p>
            <p><b>Battery:</b> ${battery}%</p>
            <p><b>Vehicle Range:</b> ${range} KM</p>
            ${reachableMessage}
            <hr>
            <h3>⚡ Recommended Charging Station</h3>
            <p><b>Name:</b> ${station.Station_Name}</p>
            <p><b>City:</b> ${station.City}</p>
            <p><b>Operator:</b> ${station.Operator}</p>
            <p><b>Power:</b> ${station.Power_kW} kW</p>
            <p><b>Available Chargers:</b> ${station.Available_Chargers}</p>
            <p><b>Waiting Time:</b> ${station.Estimated_Waiting_Time_Min} Minutes</p>
            <p><b>Charging Cost:</b> ₹${station.Charging_Cost_per_Unit}</p>
            <p><b>AI Score:</b> ${station.score.toFixed(2)}</p>
            <p><b>Distance Along Route:</b> ${station.distance.toFixed(2)} KM</p>
            <hr>
            <h3>💡 Why did AI recommend this station?</h3>
            <ul>
                ${reasons.map(reason => `<li>${reason}</li>`).join("")}
            </ul>
        `;

    }

    catch (error) {
        console.error("findRoute error:", error);
        alert(error.message || "Something went wrong while planning the route.");
    }
}


// ==========================================
// NEARBY EV CHARGING STATIONS
// ==========================================

function findNearbyStations() {

    if (!navigator.geolocation) {
        alert("Your browser does not support location access.");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        loadNearbyStations,
        function(error) {
            alert("Please allow location access.");
            console.log(error);
        }
    );
}


// ==========================================
// LOAD NEARBY STATIONS
// MULTI-SOURCE: CSV dataset + Live OpenStreetMap
// ==========================================

async function loadNearbyStations(position) {

    const userLat = position.coords.latitude;
    const userLng = position.coords.longitude;
    userLocation = [userLng, userLat];


    console.log("Your Location:", userLat, userLng);

    map.setView([userLat, userLng], 13);

    L.marker([userLat, userLng])
        .addTo(map)
        .bindPopup("<b>📍 You are here</b>")
        .openPopup();

    // ------------------------------------------
    // SOURCE 1: Your CSV dataset
    // ------------------------------------------

    const csvStations = chargingStations
        .map(station => {
            const lat = parseFloat(station.Latitude);
            const lng = parseFloat(station.Longitude);

            return {
                Station_Name: station.Station_Name,
                Operator: station.Operator,
                Address: station.Address || (station.City ? station.City : "Address not available"),
                Latitude: lat,
                Longitude: lng,
                Charger_Type: station.Charger_Type,
                Power_kW: station.Power_kW,
                Status: station.Status,
                Review_Rating: station.Review_Rating,
                distance: calculateDistance(userLat, userLng, lat, lng),
                Source: "Dataset"
            };
        })
        .filter(s => !isNaN(s.distance));

    // ------------------------------------------
    // SOURCE 2: Live OpenStreetMap (via backend)
    // ------------------------------------------

    let osmStations = [];

    try {

        const response = await fetch(
            `http://localhost:3000/api/nearby-stations?latitude=${userLat}&longitude=${userLng}`
        );

        if (response.ok) {

            const data = await response.json();

            osmStations = data.map(station => ({
                ...station,
                distance: calculateDistance(
                    userLat,
                    userLng,
                    station.Latitude,
                    station.Longitude
                ),
                Source: "OpenStreetMap"
            })).filter(s => !isNaN(s.distance));

        } else {
            console.warn("OSM backend responded with an error, continuing with CSV data only.");
        }

    } catch (error) {
        console.warn("OSM backend not reachable, continuing with CSV data only.", error);
    }

    // ------------------------------------------
    // MERGE BOTH SOURCES, SORT BY DISTANCE
    // ------------------------------------------

    const allStations = [...csvStations, ...osmStations]
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 10);

    console.log("Merged Nearby Stations (CSV + OSM):", allStations);

    showNearbyStations(allStations, userLat, userLng);
}


// ==========================================
// DISPLAY NEARBY STATIONS
// ==========================================

function showNearbyStations(stations, userLat, userLng) {

    const results = document.getElementById("nearbyResults");

    results.innerHTML = "";

    if (!stations || stations.length === 0) {
        results.innerHTML = "<h3>⚠ No charging stations found nearby.</h3>";
        return;
    }

    stations.forEach((station, index) => {

        const lat = parseFloat(station.Latitude);
        const lng = parseFloat(station.Longitude);

        const name = station.Station_Name || "EV Charging Station";
        const operator = station.Operator || "Unknown";
        const address = station.Address || "Address not available";
        const charger = station.Charger_Type || "EV Charging";
        const source = station.Source || "Unknown";

        L.marker([lat, lng])
            .addTo(map)
            .bindPopup(`
                <b>⚡ ${name}</b><br>
                🏢 Operator: ${operator}<br>
                📍 ${address}<br>
                ⚡ Charger: ${charger}<br>
                📏 Distance: ${station.distance.toFixed(2)} km<br>
                🗂️ Source: ${source}
            `);

        const card = document.createElement("div");
        card.className = "nearby-card";

        card.innerHTML = `
            <h3>⚡ ${index + 1}. ${name}</h3>
            <p>🏢 Operator: ${operator}</p>
            <p>📍 ${address}</p>
            <p>⚡ Charger: ${charger}</p>
            <p>📏 Distance: <b>${station.distance.toFixed(2)} km</b></p>
            <p>🗂️ Source: <b>${source}</b></p>
            <button onclick="focusStation(${lat}, ${lng})">
                View on Map
            </button>
        `;

        results.appendChild(card);
    });
}


// ==========================================
// FOCUS ON STATION
// ==========================================

async function focusStation(lat, lng) {

    // Open map page
    showPage("resultsPage");

    setTimeout(() => {
        map.invalidateSize();
    }, 500);

    // Check current GPS location
    if (!userLocation) {
        alert("Please click Find Nearby Stations first and allow location access.");
        return;
    }

    try {

        // Remove old Plan Journey route
        if (routeLayer) {
            map.removeLayer(routeLayer);
            routeLayer = null;
        }

        // Remove previous nearby route
        if (window.stationRouteLayer) {
            map.removeLayer(window.stationRouteLayer);
            window.stationRouteLayer = null;
        }

        // Current location
        const start = userLocation;

        // Selected charging station
        const station = [lng, lat];

        // Get actual road route
        const response = await fetch(
            "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
            {
                method: "POST",
                headers: {
                    "Authorization": API_KEY,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    coordinates: [
                        start,
                        station
                    ]
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error("OpenRouteService Error:", errorText);
            alert("Unable to get road route.");
            return;
        }

        const routeData = await response.json();

        console.log("Nearby Route:", routeData);

        if (
            !routeData.features ||
            routeData.features.length === 0
        ) {
            alert("No road route found.");
            return;
        }

        // Draw route
        window.stationRouteLayer = L.geoJSON(
            routeData,
            {
                style: {
                    weight: 6
                }
            }
        ).addTo(map);

        // Current location marker
        L.marker([start[1], start[0]])
            .addTo(map)
            .bindPopup("<b>📍 Your Current Location</b>");

        // Charging station marker
        L.marker([lat, lng])
            .addTo(map)
            .bindPopup("<b>⚡ Charging Station</b>")
            .openPopup();

        // Fit route perfectly inside map
        map.fitBounds(
            window.stationRouteLayer.getBounds(),
            {
                padding: [50, 50]
            }
        );

    } catch (error) {

        console.error("Nearby Route Error:", error);

        alert("Unable to load route.");
    }
}
    

// ==========================================
// MAP SIZE FIX
// ==========================================

window.addEventListener("load", function() {
    setTimeout(function() {
        map.invalidateSize();
    }, 500);
});


// ==========================================
// END OF SCRIPT
// ==========================================
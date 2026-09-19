const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 3000;

// ==========================================
// OPENROUTESERVICE API KEY (server-side only)
// ------------------------------------------
// Kept here instead of in script.js so it never
// ships to the browser. For a real deployment,
// move this into a .env file and read it with
// process.env.ORS_API_KEY instead.
// ==========================================
const ORS_API_KEY =
    process.env.ORS_API_KEY ||
    "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjVkYzkxNTJmZWMyZTQ2MDFiZjkzNDA4ZTEyMzAwODY2IiwiaCI6Im11cm11cjY0In0=";

// Test route
app.get("/", (req, res) => {
    res.send("EV Charging Recommendation Server is running!");
});


// ==========================================
// GEOCODE PROXY
// Converts a place name to [lon, lat], biased
// to Maharashtra/India so common town names
// don't resolve to the wrong country.
// ==========================================

app.get("/api/geocode", async (req, res) => {

    try {

        const text = req.query.text;

        if (!text) {
            return res.status(400).json({ error: "Query param 'text' is required." });
        }

        const url =
            "https://api.openrouteservice.org/geocode/search" +
            `?api_key=${ORS_API_KEY}` +
            `&text=${encodeURIComponent(text + ", Maharashtra, India")}` +
            "&boundary.country=IN" +
            "&size=1";

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            console.error("Geocode error:", data);
            return res.status(response.status).json({ error: "Geocoding service error." });
        }

        if (!data.features || data.features.length === 0) {
            return res.status(404).json({ error: `Could not find "${text}".` });
        }

        res.json({ coordinates: data.features[0].geometry.coordinates });

    } catch (error) {
        console.error("Geocode Proxy Error:", error);
        res.status(500).json({ error: "Server error while geocoding." });
    }
});


// ==========================================
// DIRECTIONS PROXY
// Body: { coordinates: [[lon,lat],[lon,lat]] }
// ==========================================

app.post("/api/directions", async (req, res) => {

    try {

        const { coordinates } = req.body;

        if (!coordinates || coordinates.length < 2) {
            return res.status(400).json({ error: "At least 2 coordinates are required." });
        }

        const response = await fetch(
            "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
            {
                method: "POST",
                headers: {
                    Authorization: ORS_API_KEY,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ coordinates })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.features || data.features.length === 0) {
            console.error("Directions error:", data);
            return res.status(response.status || 502).json({
                error: data.error?.message || data.error || "Could not calculate a driving route."
            });
        }

        res.json(data);

    } catch (error) {
        console.error("Directions Proxy Error:", error);
        res.status(500).json({ error: "Server error while calculating the route." });
    }
});


// ==========================================
// NEARBY EV CHARGING STATIONS
// OpenStreetMap + Overpass API
// ==========================================

app.get("/api/nearby-stations", async (req, res) => {

    try {

        const { latitude, longitude } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                error: "Latitude and longitude are required."
            });
        }

        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);

        if (isNaN(lat) || isNaN(lng)) {
            return res.status(400).json({
                error: "Invalid latitude or longitude."
            });
        }

        const query = `
            [out:json][timeout:25];

            (
                node["amenity"="charging_station"](around:10000,${lat},${lng});
                way["amenity"="charging_station"](around:10000,${lat},${lng});
                relation["amenity"="charging_station"](around:10000,${lat},${lng});
            );

            out center tags;
        `;

        console.log("Searching OpenStreetMap...");
        console.log("Location:", lat, lng);

        const response = await fetch(
            "https://overpass-api.de/api/interpreter",
            {
                method: "POST",
                headers: {
                    "Content-Type": "text/plain",
                    "User-Agent": "EV-Charging-Recommendation-System/1.0"
                },
                body: query
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.log("Overpass Error:", errorText);
            return res.status(response.status).json({
                error: "OpenStreetMap request failed."
            });
        }

        const data = await response.json();

        console.log("Stations received:", data.elements.length);

        const stations = data.elements.map((element) => {

            const tags = element.tags || {};

            let stationLat;
            let stationLng;

            if (element.lat !== undefined && element.lon !== undefined) {
                stationLat = element.lat;
                stationLng = element.lon;
            }
            else if (element.center) {
                stationLat = element.center.lat;
                stationLng = element.center.lon;
            }

            if (stationLat === undefined || stationLng === undefined) {
                return null;
            }

            return {
                Station_Name: tags.name || tags.operator || "EV Charging Station",
                Operator: tags.operator || tags.brand || "OpenStreetMap",
                Address:
                    tags["addr:full"] ||
                    tags["addr:street"] ||
                    tags["addr:place"] ||
                    "Address not available",
                Latitude: stationLat,
                Longitude: stationLng,
                Charger_Type:
                    tags["socket:type2"] ||
                    tags["socket:ccs"] ||
                    tags["socket:chademo"] ||
                    "EV Charging",
                Opening_Hours: tags.opening_hours || "Not available",
                Status: tags.status || "Unknown"
            };

        });

        const validStations = stations.filter(station => station !== null);

        res.json(validStations);

    }

    catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({
            error: "Server error while loading charging stations."
        });
    }

});


// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
    console.log(`EV Charging Recommendation Server running on port ${PORT}`);
});
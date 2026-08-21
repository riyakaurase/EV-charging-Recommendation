const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 3000;

// Test route
app.get("/", (req, res) => {
    res.send("EV Charging Recommendation Server is running!");
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


        // Search charging stations within 10 km
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
                    "User-Agent":
                        "EV-Charging-Recommendation-System/1.0"
                },

                body: query
            }
        );


        if (!response.ok) {

            const errorText = await response.text();

            console.log(
                "Overpass Error:",
                errorText
            );

            return res.status(response.status).json({
                error: "OpenStreetMap request failed."
            });
        }


        const data = await response.json();


        console.log(
            "Stations received:",
            data.elements.length
        );


        // Convert OpenStreetMap data
        // into the format your existing
        // frontend already understands.

        const stations = data.elements.map(
            (element) => {

                const tags = element.tags || {};

                let stationLat;
                let stationLng;


                // Normal node
                if (
                    element.lat !== undefined &&
                    element.lon !== undefined
                ) {

                    stationLat = element.lat;
                    stationLng = element.lon;

                }

                // Way / relation
                else if (element.center) {

                    stationLat =
                        element.center.lat;

                    stationLng =
                        element.center.lon;
                }


                if (
                    stationLat === undefined ||
                    stationLng === undefined
                ) {
                    return null;
                }


                return {

                    AddressInfo: {

                        Title:
                            tags.name ||
                            tags.operator ||
                            "EV Charging Station",

                        AddressLine1:
                            tags["addr:street"]
                                ? `${tags["addr:housenumber"] || ""} ${tags["addr:street"]}`.trim()
                                : tags["addr:full"] ||
                                  tags["addr:place"] ||
                                  "Address not available",

                        Latitude:
                            stationLat,

                        Longitude:
                            stationLng
                    },

                    Operator:
                        tags.operator ||
                        tags.brand ||
                        "OpenStreetMap",

                    ChargerType:
                        tags["socket:type2"] ||
                        tags["socket:ccs"] ||
                        tags["socket:chademo"] ||
                        "EV Charging",

                    OpeningHours:
                        tags.opening_hours ||
                        "Not available",

                    Status:
                        tags.status ||
                        "Unknown"
                };

            }
        );


        // Remove invalid stations
        const validStations =
            stations.filter(
                station => station !== null
            );


        res.json(validStations);

    }


    catch (error) {

        console.error(
            "Server Error:",
            error
        );

        res.status(500).json({

            error:
                "Server error while loading charging stations."

        });

    }

});


// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {

    console.log(
        `EV Charging Recommendation Server running on port ${PORT}`
    );

});
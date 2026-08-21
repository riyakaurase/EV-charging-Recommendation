const API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjVkYzkxNTJmZWMyZTQ2MDFiZjkzNDA4ZTEyMzAwODY2IiwiaCI6Im11cm11cjY0In0=";


// ==========================================
// MAP INITIALIZATION
// ==========================================

let map = L.map("map").setView(
    [18.5204, 73.8567],
    7
);

L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        attribution:
            "&copy; OpenStreetMap contributors"
    }
).addTo(map);


// ==========================================
// GLOBAL VARIABLES
// ==========================================

let routeLayer;

let chargingStations = [];

let stationMarkers = {};


// ==========================================
// ROUTE MAP
// ==========================================
// ==========================================
// ROUTES FROM CSV DATASET
// ==========================================

function getRouteCities(fromCity, toCity) {

    const routes = {};

    // Group cities by Route_Name
    chargingStations.forEach(station => {

        const routeName =
            String(station.Route_Name || "").trim();

        const city =
            String(station.City || "").trim();

        const order =
            Number(station.Route_Order);

        if (
            !routeName ||
            !city ||
            isNaN(order)
        ) {
            return;
        }

        if (!routes[routeName]) {
            routes[routeName] = {};
        }

        // Keep each city only once
        routes[routeName][order] = city;

    });


    // Check every route
    for (
        const routeName of Object.keys(routes)
    ) {

        const orderedCities =
            Object.keys(routes[routeName])
                .map(Number)
                .sort((a, b) => a - b)
                .map(
                    order =>
                        routes[routeName][order]
                );


        // Remove duplicate cities
        const cities =
            [...new Set(orderedCities)];


        const startIndex =
            cities.findIndex(
                city =>
                    city.toLowerCase() ===
                    fromCity.trim().toLowerCase()
            );


        const endIndex =
            cities.findIndex(
                city =>
                    city.toLowerCase() ===
                    toCity.trim().toLowerCase()
            );


        if (
            startIndex !== -1 &&
            endIndex !== -1 &&
            startIndex < endIndex
        ) {

            return {

                routeName: routeName,

                cities:
                    cities.slice(
                        startIndex,
                        endIndex + 1
                    )

            };

        }

    }


    return null;
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

            console.log(
                "CSV First Row:",
                results.data[0]
            );

            console.log(
                "CSV Headers:",
                Object.keys(
                    results.data[0] || {}
                )
            );


            // Clean spaces from headers and values
            chargingStations =
                results.data

                    .map(station => {

                        const clean = {};

                        Object.keys(station)
                            .forEach(key => {

                                const cleanKey =
                                    key.trim();

                                const value =
                                    station[key];

                                clean[cleanKey] =
                                    typeof value === "string"
                                        ? value.trim()
                                        : value;

                            });

                        return clean;

                    })

                    .filter(station =>
                        station.Latitude &&
                        station.Longitude
                    );


            console.log(
                "Stations Loaded:",
                chargingStations.length
            );


            // Create markers for all stations
            chargingStations.forEach(
                station => {

                    const lat =
                        parseFloat(
                            station.Latitude
                        );

                    const lng =
                        parseFloat(
                            station.Longitude
                        );


                    let marker =
                        L.marker([
                            lat,
                            lng
                        ]).addTo(map);


                    stationMarkers[
                        station.Station_Name
                    ] = marker;


                    marker.bindPopup(`
                        <b>
                            ${station.Station_Name}
                        </b>
                        <br>

                        City :
                        ${station.City}

                        <br>

                        Operator :
                        ${station.Operator}

                        <br>

                        Charger :
                        ${station.Charger_Type}

                        <br>

                        Power :
                        ${station.Power_kW} kW

                        <br>

                        Status :
                        ${station.Status}
                    `);

                }
            );

        },

        error: function(error) {

            console.error(
                "CSV Loading Error:",
                error
            );

        }

    }
);


// ==========================================
// DISTANCE CALCULATION
// ==========================================

function calculateDistance(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const R = 6371;


    const dLat =
        (lat2 - lat1) *
        Math.PI / 180;


    const dLon =
        (lon2 - lon1) *
        Math.PI / 180;


    const a =
        Math.sin(dLat / 2) *
        Math.sin(dLat / 2)

        +

        Math.cos(
            lat1 * Math.PI / 180
        ) *

        Math.cos(
            lat2 * Math.PI / 180
        ) *

        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);


    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );


    return R * c;

}


// ==========================================
// FIND ROUTE
// ==========================================

async function findRoute() {

    const from =
        document
            .getElementById("from")
            .value
            .trim();


    const to =
        document
            .getElementById("to")
            .value
            .trim();


    const fromCity =
        from.charAt(0).toUpperCase() +
        from.slice(1).toLowerCase();


    const toCity =
        to.charAt(0).toUpperCase() +
        to.slice(1).toLowerCase();


    const battery =
        Number(
            document
                .getElementById("battery")
                .value
        );


    const range =
        Number(
            document
                .getElementById("range")
                .value
        );
    const availableRange = range * (battery / 100);

    if (
        !from ||
        !to ||
        !battery ||
        !range
    ) {

        alert(
            "Please fill all details."
        );

        return;

    }


    try {

        // Source Coordinates
        let res1 =
            await fetch(
                `https://api.openrouteservice.org/geocode/search?api_key=${API_KEY}&text=${fromCity}`
            );


        let data1 =
            await res1.json();


        // Destination Coordinates
        let res2 =
            await fetch(
                `https://api.openrouteservice.org/geocode/search?api_key=${API_KEY}&text=${toCity}`
            );


        let data2 =
            await res2.json();


        let start =
            data1.features[0]
                .geometry
                .coordinates;


        let end =
            data2.features[0]
                .geometry
                .coordinates;


        let startLon =
            start[0];

        let startLat =
            start[1];


        let endLon =
            end[0];

        let endLat =
            end[1];


        // Route API
        let response =
            await fetch(
                "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
                {

                    method: "POST",

                    headers: {

                        Authorization:
                            API_KEY,

                        "Content-Type":
                            "application/json"

                    },

                    body:
                        JSON.stringify({

                            coordinates:
                                [start, end]

                        })

                }
         
      );


        let routeData =
            await response.json();


        if (routeLayer) {

            map.removeLayer(
                routeLayer
            );

        }


        routeLayer =
            L.geoJSON(
                routeData
            ).addTo(map);


        map.fitBounds(
            routeLayer.getBounds()
        );


        let totalDistance =
            routeData
                .features[0]
                .properties
                .summary
                .distance / 1000;


        let totalTime =
            routeData
                .features[0]
                .properties
                .summary
                .duration / 60;


        console.log(
            "Route Distance :",
            totalDistance
        );


        // Find selected route
       const routeInfo =
    getRouteCities(
        fromCity,
        toCity
    );

if (!routeInfo) {

    alert(
        "No route found between " +
        fromCity +
        " and " +
        toCity +
        " in the dataset."
    );

    return;
}

const selectedRoute =
    routeInfo.cities;

const routeName =
    routeInfo.routeName;

console.log(
    "Selected Route:",
    routeName
);

console.log(
    "Route Cities:",
    selectedRoute
);

        const startIndex =
            selectedRoute.indexOf(
                fromCity
            );


        const endIndex =
            selectedRoute.indexOf(
                toCity
            );


        const validCities =
            selectedRoute.slice(
                startIndex + 1,
                endIndex + 1
            );
        console.log("VALID ROUTE CITIES:", validCities);

        let reachableStations = [];


        chargingStations.forEach(
            station => {

                // Ignore stations not on selected route
                if (
                    !validCities.includes(
                        station.City
                    )
                ) {

                    return;

                }


                let stationDistance =
                    calculateDistance(
                        startLat,
                        startLon,
                        parseFloat(
                            station.Latitude
                        ),
                        parseFloat(
                            station.Longitude
                        )
                    );


                if (
                    station.Status &&
                    station.Status
                        .toLowerCase() ===
                        "available" &&

                    stationDistance <= range
                ) {

                    reachableStations.push({

                        ...station,

                        distance:
                            stationDistance

                    });

                }

            }
        );


        console.log(
            "Reachable Stations:",
            reachableStations
        );


        // No reachable station
        if (
            reachableStations.length === 0
        ) {

            document
                .getElementById("result")
                .innerHTML = `

                    <h2>
                        ⚠ No Reachable Charging Station
                    </h2>

                    <p>
                        <b>Total Distance:</b>
                        ${totalDistance.toFixed(2)}
                        KM
                    </p>

                    <p>
                        <b>Vehicle Range:</b>
                        ${range} KM
                    </p>

                    <p>
                        No charging station is
                        reachable with the current
                        battery range.
                    </p>

                `;

            return;

        }
                // ==========================================
        // AI SCORE
        // ==========================================

        reachableStations.forEach(
            station => {

                let score = 0;

// ⚡ Charging power
score += Number(
    station.Power_kW || 0
);

// 🔌 Available chargers
score += Number(
    station.Available_Chargers || 0
) * 10;

// ⭐ Review rating
score += Number(
    station.Review_Rating || 0
) * 10;

// 👥 Review count
score += Number(
    station.Review_Count || 0
) / 100;

// 🍔 Food court
if (
    String(station.Has_Food_Court).toLowerCase() === "yes" ||
    String(station.Has_Food_Court).toLowerCase() === "true"
) {
    score += 10;
}

// ☕ Cafe
if (
    String(station.Has_Cafe).toLowerCase() === "yes" ||
    String(station.Has_Cafe).toLowerCase() === "true"
) {
    score += 8;
}

// 🚻 Washroom
if (
    String(station.Has_Washroom).toLowerCase() === "yes" ||
    String(station.Has_Washroom).toLowerCase() === "true"
) {
    score += 5;
}

// 🕒 Waiting time
score -= Number(
    station.Estimated_Waiting_Time_Min || 0
);

// 💰 Charging cost
score -= Number(
    station.Charging_Cost_per_Unit || 0
);

// 📍 Distance
score -= station.distance / 10;

station.score = score;
    }
);

        // Sort by AI Score
        reachableStations.sort(
            (a, b) =>
                b.score - a.score
        );


        // Best Station
        let station =
            reachableStations[0];


        let reasons = [];
        // ⭐ Review reason
const rating =
    Number(station.Review_Rating || 0);

if (rating >= 4.5) {

    reasons.push(
        `⭐ High Customer Rating: ${rating}/5`
    );

} else if (rating >= 4.0) {

    reasons.push(
        `⭐ Good Customer Rating: ${rating}/5`
    );
}


// 👥 Review count
const reviewCount =
    Number(station.Review_Count || 0);

if (reviewCount >= 50) {

    reasons.push(
        `👥 Trusted by ${reviewCount} customers`
    );
}


// 🍔 Food court
if (
    String(station.Has_Food_Court)
        .toLowerCase() === "yes" ||
    String(station.Has_Food_Court)
        .toLowerCase() === "true"
) {

    reasons.push(
        "🍔 Food Court Available"
    );
}


// ☕ Cafe
if (
    String(station.Has_Cafe)
        .toLowerCase() === "yes" ||
    String(station.Has_Cafe)
        .toLowerCase() === "true"
) {

    reasons.push(
        "☕ Cafe Available"
    );
}


// 🚻 Washroom
if (
    String(station.Has_Washroom)
        .toLowerCase() === "yes" ||
    String(station.Has_Washroom)
        .toLowerCase() === "true"
) {

    reasons.push(
        "🚻 Washroom Available"
    );
}


        // Availability
        if (
            station.Status &&
            station.Status
                .toLowerCase() ===
                "available"
        ) {

            reasons.push(
                "✅ Charging Station is Available"
            );

        }


        // Fast Charger
        if (
            Number(
                station.Power_kW || 0
            ) >= 50
        ) {

            reasons.push(
                "⚡ Fast Charging Supported"
            );

        }


        // Waiting Time
        if (
            Number(
                station.Estimated_Waiting_Time_Min || 0
            ) <= 10
        ) {

            reasons.push(
                "🕒 Low Waiting Time"
            );

        } else {

            reasons.push(
                "🕒 Moderate Waiting Time"
            );

        }


        // Charging Cost
        if (
            Number(
                station.Charging_Cost_per_Unit || 0
            ) <= 10
        ) {

            reasons.push(
                "💰 Low Charging Cost"
            );

        }


        // Available Chargers
        if (
            Number(
                station.Available_Chargers || 0
            ) >= 2
        ) {

            reasons.push(
                "🔌 Multiple Chargers Available"
            );

        }


        // On Route
        reasons.push(
            "🛣️ Station is on your selected route"
        );


        // Highlight recommended station
        if (
            stationMarkers[
                station.Station_Name
            ]
        ) {

            map.setView(
                [
                    parseFloat(
                        station.Latitude
                    ),

                    parseFloat(
                        station.Longitude
                    )
                ],
                13
            );


            stationMarkers[
                station.Station_Name
            ].openPopup();

        }


        // ==========================================
        // DESTINATION REACHABILITY
        // ==========================================

        if (
            totalDistance <= range
        ) {

            document
                .getElementById("result")
                .innerHTML = `

                    <h2>
                        🚗 Smart EV Recommendation
                    </h2>

                    <p>
                        <b>From:</b>
                        ${from}
                    </p>

                    <p>
                        <b>To:</b>
                        ${to}
                    </p>

                    <p>
                        <b>Total Distance:</b>
                        ${totalDistance.toFixed(2)}
                        KM
                    </p>

                    <p>
                        <b>Estimated Time:</b>
                        ${totalTime.toFixed(0)}
                        Minutes
                    </p>

                    <p>
                        <b>Battery:</b>
                        ${battery}%
                    </p>

                    <p>
                        <b>Vehicle Range:</b>
                        ${range} KM
                    </p>

                    <hr>

                    <h3 style="color:green;">
                        ✅ Destination can be reached
                        without charging.
                    </h3>

                `;

            return;

        }


        // ==========================================
        // REACHABILITY MESSAGE
        // ==========================================

        let reachableMessage = "";


        if (
            totalDistance <= range
        ) {

            reachableMessage = `

                <p
                    style="
                        color:green;
                        font-weight:bold;
                    "
                >
                    ✅ Destination can be reached
                    without charging.
                </p>

            `;

        } else {

            reachableMessage = `

                <p
                    style="
                        color:red;
                        font-weight:bold;
                    "
                >
                    ⚠ Destination cannot be
                    reached directly.
                    Intermediate charging is
                    recommended.
                </p>

            `;

        }


        // ==========================================
        // FINAL RECOMMENDATION
        // ==========================================

        document
            .getElementById("result")
            .innerHTML = `

                <h2>
                    🚗 Smart EV Recommendation
                </h2>

                <p>
                    <b>From:</b>
                    ${from}
                </p>

                <p>
                    <b>To:</b>
                    ${to}
                </p>

                <p>
                    <b>Total Distance:</b>
                    ${totalDistance.toFixed(2)}
                    KM
                </p>

                <p>
                    <b>Estimated Time:</b>
                    ${totalTime.toFixed(0)}
                    Minutes
                </p>

                <p>
                    <b>Battery:</b>
                    ${battery}%
                </p>

                <p>
                    <b>Vehicle Range:</b>
                    ${range} KM
                </p>

                ${reachableMessage}

                <hr>

                <h3>
                    ⚡ Recommended Charging Station
                </h3>

                <p>
                    <b>Name:</b>
                    ${station.Station_Name}
                </p>

                <p>
                    <b>City:</b>
                    ${station.City}
                </p>

                <p>
                    <b>Operator:</b>
                    ${station.Operator}
                </p>

                <p>
                    <b>Power:</b>
                    ${station.Power_kW} kW
                </p>

                <p>
                    <b>Available Chargers:</b>
                    ${station.Available_Chargers}
                </p>

                <p>
                    <b>Waiting Time:</b>
                    ${station.Estimated_Waiting_Time_Min}
                    Minutes
                </p>

                <p>
                    <b>Charging Cost:</b>
                    ₹${station.Charging_Cost_per_Unit}
                </p>

                <p>
                    <b>AI Score:</b>
                    ${station.score.toFixed(2)}
                </p>

                <p>
                    <b>Distance From Source:</b>
                    ${station.distance.toFixed(2)}
                    KM
                </p>

                <hr>

                <h3>
                    💡 Why did AI recommend
                    this station?
                </h3>

                <ul>
                    ${reasons
                        .map(
                            reason =>
                                `<li>${reason}</li>`
                        )
                        .join("")}
                </ul>

            `;


    }

    catch (error) {

        console.log(error);

        alert(error);

    }

}


// ==========================================
// NEARBY EV CHARGING STATIONS
// ==========================================

function findNearbyStations() {

    if (!navigator.geolocation) {

        alert(
            "Your browser does not support location access."
        );

        return;

    }


    navigator.geolocation.getCurrentPosition(
        loadNearbyStations,

        function(error) {

            alert(
                "Please allow location access."
            );

            console.log(error);

        }
    );

}
// ==========================================
// LOAD NEARBY STATIONS
// ==========================================

async function loadNearbyStations(position) {

    const userLat =
        position.coords.latitude;

    const userLng =
        position.coords.longitude;


    console.log(
        "Your Location:",
        userLat,
        userLng
    );


    // Center map on user
    map.setView(
        [userLat, userLng],
        13
    );


    // User location marker
    L.marker([
        userLat,
        userLng
    ])
        .addTo(map)
        .bindPopup(
            "<b>📍 You are here</b>"
        )
        .openPopup();


    try {

        // ==========================================
        // TAKE LAST 3 STATIONS FROM CSV
        // EV301, EV302, EV303
        // ==========================================

        const stations = chargingStations
    .map(station => {

        station.distance = calculateDistance(
            userLat,
            userLng,
            parseFloat(station.Latitude),
            parseFloat(station.Longitude)
        );

        return station;
    })
    .filter(station =>
        !isNaN(station.distance)
    )
    .sort((a, b) =>
        a.distance - b.distance
    )
    .slice(0, 3);


        console.log(
            "LAST 3 STATIONS:",
            stations
        );


        console.log(
            "OUR 3 STATIONS:",
            stations
        );


        // ==========================================
        // CALCULATE DISTANCE
        // ==========================================

        stations.forEach(
            station => {

                station.distance =
                    calculateDistance(

                        userLat,

                        userLng,

                        parseFloat(
                            station.Latitude
                        ),

                        parseFloat(
                            station.Longitude
                        )

                    );

            }
        );


        // ==========================================
        // SORT NEAREST FIRST
        // ==========================================

        stations.sort(
            (a, b) =>
                a.distance -
                b.distance
        );


        console.log(
            "Sorted Stations:",
            stations
        );


        // ==========================================
        // DISPLAY
        // ==========================================

        showNearbyStations(
            stations,
            userLat,
            userLng
        );

    }

    catch (error) {

        console.error(
            "Nearby Station Error:",
            error
        );


        alert(
            "Unable to load nearby charging stations."
        );

    }

}


// ==========================================
// DISPLAY NEARBY STATIONS
// ==========================================

function showNearbyStations(
    stations,
    userLat,
    userLng
) {

    const results =
        document.getElementById(
            "nearbyResults"
        );


    results.innerHTML = "";


    if (
        !stations ||
        stations.length === 0
    ) {

        results.innerHTML =
            "<h3>⚠ No charging stations found nearby.</h3>";

        return;

    }


    // ==========================================
    // DISPLAY EACH STATION
    // ==========================================

    stations.forEach(
        (station, index) => {

            const lat =
                parseFloat(
                    station.Latitude
                );


            const lng =
                parseFloat(
                    station.Longitude
                );


            const name =
                station.Station_Name ||
                "EV Charging Station";


            const operator =
                station.Operator ||
                "Unknown";


            const address =
                station.Address ||
                "Address not available";


            const charger =
                station.Charger_Type ||
                "EV Charging";


            // ==========================================
            // MAP MARKER
            // ==========================================

            L.marker([
                lat,
                lng
            ])
                .addTo(map)
                .bindPopup(`

                    <b>
                        ⚡ ${name}
                    </b>

                    <br>

                    🏢 Operator:
                    ${operator}

                    <br>

                    📍 ${address}

                    <br>

                    ⚡ Charger:
                    ${charger}

                    <br>

                    📏 Distance:
                    ${station.distance.toFixed(2)}
                    km

                `);


            // ==========================================
            // STATION CARD
            // ==========================================

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "nearby-card";


            card.innerHTML = `

                <h3>
                    ⚡ ${index + 1}.
                    ${name}
                </h3>


                <p>
                    🏢 Operator:
                    ${operator}
                </p>


                <p>
                    📍 ${address}
                </p>


                <p>
                    ⚡ Charger:
                    ${charger}
                </p>


                <p>
                    📏 Distance:
                    <b>
                        ${station.distance.toFixed(2)}
                        km
                    </b>
                </p>


                <button
                    onclick="
                        focusStation(
                            ${lat},
                            ${lng}
                        )
                    "
                >
                    View on Map
                </button>

            `;


            results.appendChild(
                card
            );

        }
    );

}


// ==========================================
// FOCUS ON STATION
// ==========================================

function focusStation(
    lat,
    lng
) {

    map.setView(
        [lat, lng],
        16
    );


    L.popup()

        .setLatLng([
            lat,
            lng
        ])

        .setContent(
            "⚡ EV Charging Station"
        )

        .openOn(map);

}
// ==========================================
// MAP SIZE FIX
// ==========================================

window.addEventListener(
    "load",
    function() {

        setTimeout(
            function() {

                map.invalidateSize();

            },
            500
        );

    }
);


// ==========================================
// END OF SCRIPT
// ==========================================
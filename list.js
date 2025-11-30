const spotsEl = document.getElementById("spots");
const locStatusEl = document.getElementById("locStatus");
const refreshBtn = document.getElementById("refreshBtn");

let userLocation = null;

refreshBtn.addEventListener("click", () => {
  refresh();
});

document.addEventListener("DOMContentLoaded", () => {
  refresh();
});

async function refresh() {
  spotsEl.innerHTML = "";
  locStatusEl.textContent = "Getting your location…";

  userLocation = await getUserLocation().catch((err) => {
    locStatusEl.textContent = `Location error: ${err.message}`;
    return null;
  });

  if (userLocation) {
    locStatusEl.textContent = `Your location: ${userLocation.lat.toFixed(
      4
    )}, ${userLocation.lng.toFixed(4)} (sorted by proximity)`;
  }

  const logs = await loadLogs();
  if (!logs.length) {
    spotsEl.textContent = "No logged spots yet.";
    return;
  }

  const logsWithDistance = logs.map((entry) => {
    let distanceKm = null;
    if (
      userLocation &&
      typeof entry.lat === "number" &&
      typeof entry.lng === "number"
    ) {
      distanceKm = haversine(
        userLocation.lat,
        userLocation.lng,
        entry.lat,
        entry.lng
      );
    }
    return { ...entry, distanceKm };
  });

  logsWithDistance.sort((a, b) => {
    if (a.distanceKm == null && b.distanceKm == null) return 0;
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  renderSpots(logsWithDistance);
}

function loadLogs() {
  return new Promise((resolve) => {
    chrome.storage.sync.get("logs", (result) => {
      resolve(result.logs || []);
    });
  });
}

function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error("Geolocation not supported"));
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 10000 }
    );
  });
}

// Haversine distance in km
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function renderSpots(spots) {
  spotsEl.innerHTML = "";
  spots.forEach((entry) => {
    const div = document.createElement("div");
    div.className = "spot";

    const header = document.createElement("div");
    header.className = "spot-header";

    const ssidEl = document.createElement("div");
    ssidEl.className = "ssid";
    ssidEl.textContent = entry.ssid || "(no SSID)";

    const ratingEl = document.createElement("div");
    ratingEl.className = "rating";
    const stars =
      entry.rating && entry.rating > 0
        ? "★".repeat(entry.rating) + "☆".repeat(5 - entry.rating)
        : "No rating";
    ratingEl.textContent = stars;

    header.appendChild(ssidEl);
    header.appendChild(ratingEl);

    const metaEl = document.createElement("div");
    metaEl.className = "meta";
    const date = new Date(entry.timestamp).toLocaleString();
    const distanceStr =
      entry.distanceKm != null
        ? `${entry.distanceKm.toFixed(2)} km away`
        : "Distance unknown";
    metaEl.textContent =
      `${date} | ${distanceStr} | ` +
      `DL ${entry.download_mbps?.toFixed(1) ?? "?"} Mbps, ` +
      `UL ${entry.upload_mbps?.toFixed(1) ?? "?"} Mbps, ` +
      `Ping ${entry.ping_ms?.toFixed(1) ?? "?"} ms`;

    const noteEl = document.createElement("div");
    noteEl.className = "note";
    if (entry.note) {
      noteEl.textContent = entry.note;
    }

    div.appendChild(header);
    div.appendChild(metaEl);
    if (entry.note) div.appendChild(noteEl);

    spotsEl.appendChild(div);
  });
}
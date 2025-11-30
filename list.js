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

  // Attempt to get location
  try {
    userLocation = await getUserLocation();
    locStatusEl.textContent = `Your location: ${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)} (sorted by proximity)`;
  } catch (err) {
    locStatusEl.textContent = `Location unavailable: ${err.message}`;
    userLocation = null;
  }

  const logs = await loadLogs();
  if (!logs.length) {
    spotsEl.textContent = "No logged spots yet.";
    return;
  }

  // Calculate distances
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

  // Sort by distance (closest first), or keep original order
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

// --- NEW DELETE FUNCTION ---
function deleteLog(id) {
  chrome.storage.sync.get("logs", (result) => {
    const logs = result.logs || [];
    // Filter out the entry with the matching ID
    const newLogs = logs.filter((entry) => entry.id !== id);
    
    // Save back to storage and refresh UI
    chrome.storage.sync.set({ logs: newLogs }, () => {
      refresh(); 
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
      { enableHighAccuracy: false, timeout: 5000 }
    );
  });
}

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

    // --- Header ---
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

    // --- Meta Info ---
    const metaEl = document.createElement("div");
    metaEl.className = "meta";
    const date = new Date(entry.timestamp).toLocaleString();
    const distanceStr =
      entry.distanceKm != null
        ? `${entry.distanceKm.toFixed(2)} km away`
        : "Distance unknown";

    // Safe formatting for speed values
    const dlStr = entry.download_mbps ? entry.download_mbps.toFixed(1) : "?";
    const ulStr = entry.upload_mbps ? entry.upload_mbps.toFixed(1) : "?";
    const pingStr = entry.ping_ms ? entry.ping_ms.toFixed(0) : "?";

    metaEl.textContent =
      `${date} | ${distanceStr} | ` +
      `DL: ${dlStr} Mbps, UL: ${ulStr} Mbps, Ping: ${pingStr} ms`;

    // --- Note ---
    const noteEl = document.createElement("div");
    noteEl.className = "note";
    if (entry.note) {
      noteEl.textContent = entry.note;
    }

    // --- Actions (Delete Button) ---
    const actionsEl = document.createElement("div");
    actionsEl.style.marginTop = "10px";
    actionsEl.style.textAlign = "right";

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Remove";
    // Basic styling for the button
    deleteBtn.style.padding = "4px 8px";
    deleteBtn.style.fontSize = "0.75rem";
    deleteBtn.style.color = "#c00";
    deleteBtn.style.background = "#fff";
    deleteBtn.style.border = "1px solid #c00";
    deleteBtn.style.borderRadius = "4px";
    deleteBtn.style.cursor = "pointer";
    
    // Add delete functionality
    deleteBtn.addEventListener("click", () => {
      if (confirm(`Are you sure you want to remove the log for "${entry.ssid || 'Unknown'}"?`)) {
        deleteLog(entry.id);
      }
    });

    actionsEl.appendChild(deleteBtn);

    // Assemble the card
    div.appendChild(header);
    div.appendChild(metaEl);
    if (entry.note) div.appendChild(noteEl);
    div.appendChild(actionsEl);

    spotsEl.appendChild(div);
  });
}
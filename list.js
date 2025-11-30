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
  // Simple loading state
  refreshBtn.textContent = "Loading...";
  refreshBtn.disabled = true;
  locStatusEl.textContent = "Locating...";

  try {
    userLocation = await getUserLocation();
    locStatusEl.textContent = `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`;
  } catch (err) {
    locStatusEl.textContent = "No Location";
    userLocation = null;
  }

  const logs = await loadLogs();
  refreshBtn.textContent = "Refresh";
  refreshBtn.disabled = false;

  if (!logs.length) {
    spotsEl.innerHTML = `<div style="text-align:center; color:#888; margin-top:40px;">No spots logged yet. Go have a coffee! ☕️</div>`;
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

function deleteLog(id) {
  chrome.storage.sync.get("logs", (result) => {
    const logs = result.logs || [];
    const newLogs = logs.filter((entry) => entry.id !== id);
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
  const R = 6371;
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
    // Create Main Card
    const card = document.createElement("div");
    card.className = "spot-card";

    // 1. Header Section (Name + Rating)
    const header = document.createElement("div");
    header.className = "card-header";
    
    const titleGroup = document.createElement("div");
    const nameEl = document.createElement("div");
    nameEl.className = "store-name";
    nameEl.textContent = entry.storeName || entry.ssid || "Unknown Spot";
    
    const ssidEl = document.createElement("div");
    ssidEl.className = "ssid-badge";
    ssidEl.textContent = entry.ssid || "No SSID";

    titleGroup.appendChild(nameEl);
    titleGroup.appendChild(ssidEl);

    const ratingEl = document.createElement("div");
    ratingEl.className = "rating";
    // Using filled stars only for cleaner look
    ratingEl.textContent = entry.rating > 0 ? "★".repeat(entry.rating) : "";

    header.appendChild(titleGroup);
    header.appendChild(ratingEl);

    // 2. Stats Grid
    const statsGrid = document.createElement("div");
    statsGrid.className = "stats-grid";

    const dlVal = entry.download_mbps ? entry.download_mbps.toFixed(1) : "--";
    const ulVal = entry.upload_mbps ? entry.upload_mbps.toFixed(1) : "--";
    const pingVal = entry.ping_ms ? entry.ping_ms.toFixed(0) : "--";
    
    // Helper to make stat item
    const makeStat = (label, value, isFast) => {
      const div = document.createElement("div");
      div.className = "stat-item";
      div.innerHTML = `
        <span class="stat-label">${label}</span>
        <span class="stat-value ${isFast ? 'fast' : ''}">${value}</span>
      `;
      return div;
    };

    // Color code DL if > 50 Mbps
    statsGrid.appendChild(makeStat("Download", dlVal, entry.download_mbps > 50));
    statsGrid.appendChild(makeStat("Upload", ulVal));
    statsGrid.appendChild(makeStat("Ping", pingVal + "ms"));

    // 3. Note Section (optional)
    let noteEl = null;
    if (entry.note) {
      noteEl = document.createElement("div");
      noteEl.className = "note-section";
      noteEl.textContent = `"${entry.note}"`;
    }

    // 4. Footer (Date + Distance + Delete)
    const footer = document.createElement("div");
    footer.className = "card-footer";

    const date = new Date(entry.timestamp).toLocaleDateString();
    const dist = entry.distanceKm != null ? `${entry.distanceKm.toFixed(2)} km` : "";
    
    const metaDiv = document.createElement("div");
    metaDiv.className = "timestamp";
    metaDiv.textContent = `${date} ${dist ? " • " + dist : ""}`;

    const delBtn = document.createElement("button");
    delBtn.className = "btn-delete";
    delBtn.textContent = "Remove";
    delBtn.onclick = () => {
       const name = entry.storeName || entry.ssid || "this spot";
       if (confirm(`Delete log for "${name}"?`)) {
         deleteLog(entry.id);
       }
    };

    footer.appendChild(metaDiv);
    footer.appendChild(delBtn);

    // Assemble
    card.appendChild(header);
    card.appendChild(statsGrid);
    if (noteEl) card.appendChild(noteEl);
    card.appendChild(footer);

    spotsEl.appendChild(card);
  });
}
const spotsEl = document.getElementById("spots");
const locStatusEl = document.getElementById("locStatus");
const refreshBtn = document.getElementById("refreshBtn");
const viewToggleBtn = document.getElementById("viewToggleBtn");

let userLocation = null;

// --- VIEW MODE LOGIC ---
const savedView = localStorage.getItem("viewMode");
if (savedView === "compact") {
  document.body.classList.add("compact-view");
  viewToggleBtn.textContent = "Card View";
} else {
  viewToggleBtn.textContent = "List View";
}

viewToggleBtn.addEventListener("click", () => {
  const isCompact = document.body.classList.toggle("compact-view");
  
  if (isCompact) {
    viewToggleBtn.textContent = "Card View";
    localStorage.setItem("viewMode", "compact");
  } else {
    viewToggleBtn.textContent = "List View";
    localStorage.setItem("viewMode", "card");
  }
});

refreshBtn.addEventListener("click", () => {
  refresh();
});

document.addEventListener("DOMContentLoaded", () => {
  refresh();
});

async function refresh() {
  spotsEl.innerHTML = "";
  refreshBtn.textContent = "Brewing...";
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
    spotsEl.innerHTML = `<div style="text-align:center; color:#9c8c74; margin-top:60px; font-size: 1.1rem;">
      No spots logged yet.<br><br>Go have a coffee! ☕️
    </div>`;
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
    chrome.storage.sync.get(null, (items) => {
      const logs = [];
      for (const key in items) {
        if (key.startsWith("log_")) {
          logs.push(items[key]);
        }
      }
      logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      resolve(logs);
    });
  });
}

function deleteLog(id) {
  const key = `log_${id}`;
  chrome.storage.sync.remove(key, () => {
    refresh();
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
    const card = document.createElement("div");
    card.className = "spot-card";

    // 1. Header Section
    const header = document.createElement("div");
    header.className = "card-header";
    
    const titleGroup = document.createElement("div");
    titleGroup.style.display = "flex";
    titleGroup.style.alignItems = "center";
    titleGroup.style.gap = "8px";

    const nameEl = document.createElement("div");
    nameEl.className = "store-name";
    nameEl.textContent = entry.storeName || entry.ssid || "Unknown Spot";
    
    const badgeContainer = document.createElement("div");
    badgeContainer.style.display = "flex";
    badgeContainer.style.gap = "8px";
    badgeContainer.style.alignItems = "center";

    const ssidEl = document.createElement("div");
    ssidEl.className = "ssid-badge";
    ssidEl.textContent = entry.ssid || "No SSID";
    badgeContainer.appendChild(ssidEl);

    if (entry.password) {
      const passEl = document.createElement("div");
      passEl.className = "ssid-badge";
      passEl.style.backgroundColor = "#fff";
      passEl.style.border = "1px solid #e6dccf";
      passEl.style.cursor = "pointer";
      passEl.style.userSelect = "none";
      passEl.title = "Click to show password";
      
      const hiddenText = "🔒 •••";
      const visibleText = `🔓 ${entry.password}`;
      let isVisible = false;

      passEl.textContent = hiddenText;
      passEl.onclick = (e) => {
        e.stopPropagation();
        isVisible = !isVisible;
        passEl.textContent = isVisible ? visibleText : hiddenText;
        passEl.style.backgroundColor = isVisible ? "#fff7ed" : "#fff";
        passEl.style.borderColor = isVisible ? "#d4a373" : "#e6dccf";
      };
      badgeContainer.appendChild(passEl);
    }

    titleGroup.appendChild(nameEl);
    titleGroup.appendChild(badgeContainer);

    const ratingEl = document.createElement("div");
    ratingEl.className = "rating";
    ratingEl.textContent = entry.rating > 0 ? "★".repeat(entry.rating) : "";

    header.appendChild(titleGroup);
    header.appendChild(ratingEl);

    // 2. Stats Grid
    const statsGrid = document.createElement("div");
    statsGrid.className = "stats-grid";

    const dlVal = entry.download_mbps ? entry.download_mbps.toFixed(1) : "--";
    const ulVal = entry.upload_mbps ? entry.upload_mbps.toFixed(1) : "--";
    const pingVal = entry.ping_ms ? entry.ping_ms.toFixed(0) : "--";
    
    const makeStat = (label, value, isFast) => {
      const div = document.createElement("div");
      div.className = "stat-item";
      div.innerHTML = `
        <span class="stat-label">${label}</span>
        <span class="stat-value ${isFast ? 'fast' : ''}">${value}</span>
      `;
      return div;
    };

    statsGrid.appendChild(makeStat("Download", dlVal, entry.download_mbps > 50));
    statsGrid.appendChild(makeStat("Upload", ulVal));
    statsGrid.appendChild(makeStat("Ping", pingVal));

    // 3. Note Section
    let noteEl = null;
    if (entry.note) {
      noteEl = document.createElement("div");
      noteEl.className = "note-section";
      noteEl.textContent = `“${entry.note}”`;
    }

    // 4. Footer
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
       if (confirm(`Remove "${name}" from your history?`)) {
         deleteLog(entry.id);
       }
    };

    footer.appendChild(metaDiv);
    footer.appendChild(delBtn);

    card.appendChild(header);
    card.appendChild(statsGrid);
    if (noteEl) card.appendChild(noteEl);
    card.appendChild(footer);

    spotsEl.appendChild(card);
  });
}
const ratingInput = document.getElementById("rating");
const ratingLabel = document.getElementById("ratingLabel");
const starsEl = document.getElementById("stars");
const statusEl = document.getElementById("status");
const latestEl = document.getElementById("latest");
const logBtn = document.getElementById("logBtn");

// Star click handling
starsEl.addEventListener("click", (e) => {
  const star = e.target.closest(".star");
  if (!star) return;
  const value = Number(star.dataset.value);
  setRating(value);
});

function setRating(value) {
  ratingInput.value = value;
  [...starsEl.children].forEach((star) => {
    const v = Number(star.dataset.value);
    star.textContent = v <= value ? "★" : "☆";
  });
  ratingLabel.textContent = value > 0 ? `Rating: ${value} star(s)` : "No rating yet";
}

// --- UPDATED ID HERE ---
document.getElementById("historyBtn").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL("list.html") });
});

logBtn.addEventListener("click", () => {
  const storeName = document.getElementById("storeName").value.trim();
  const ssid = document.getElementById("ssid").value.trim();
  const password = document.getElementById("password").value.trim();
  const note = document.getElementById("note").value.trim();
  const rating = Number(ratingInput.value) || 0;

  if (!storeName && !ssid) {
    statusEl.textContent = "Please enter Store Name or SSID.";
    return;
  }

  statusEl.textContent = "Getting location…";

  if (!navigator.geolocation) {
    statusEl.textContent = "Geolocation not supported.";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      statusEl.textContent = "Running speed test (this takes ~10s)…";

      chrome.runtime.sendMessage(
        {
          type: "RUN_LOG",
          payload: {
            storeName,
            ssid,
            password,
            note,
            rating,
            lat: latitude,
            lng: longitude,
          },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            statusEl.textContent = `Error: ${chrome.runtime.lastError.message}`;
            return;
          }
          if (!response || response.error) {
            statusEl.textContent = `Error: ${response?.error || "Unknown error"}`;
            return;
          }
          const { entry } = response;
          statusEl.textContent = "Saved!";
          latestEl.textContent =
            `DL: ${entry.download_mbps?.toFixed(1) ?? "?"} | ` +
            `UL: ${entry.upload_mbps?.toFixed(1) ?? "?"} | ` +
            `Ping: ${entry.ping_ms?.toFixed(0) ?? "?"}`;
        }
      );
    },
    (err) => {
      statusEl.textContent = `Location error: ${err.message}`;
    },
    { enableHighAccuracy: false, timeout: 10000 }
  );
});

setRating(0);
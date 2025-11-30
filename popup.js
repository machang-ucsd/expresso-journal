const ratingInput = document.getElementById("rating");
const ratingLabel = document.getElementById("ratingLabel");
const starsEl = document.getElementById("stars");
const statusEl = document.getElementById("status");
const latestEl = document.getElementById("latest");
const logBtn = document.getElementById("logBtn");

// Store input references for clearing later
const inputs = {
  storeName: document.getElementById("storeName"),
  ssid: document.getElementById("ssid"),
  password: document.getElementById("password"),
  note: document.getElementById("note")
};

// Star rating logic
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
    star.classList.toggle('active', v <= value);
  });

  if (value === 0) {
    ratingLabel.textContent = "No rating yet";
  } else if (value === 5) {
    ratingLabel.textContent = "Excellent!";
  } else {
    ratingLabel.textContent = `${value} Stars`;
  }
}

// History button navigation
document.getElementById("historyBtn").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL("list.html") });
});

// Main Log Button Logic
logBtn.addEventListener("click", () => {
  const storeName = inputs.storeName.value.trim();
  const ssid = inputs.ssid.value.trim();
  const password = inputs.password.value.trim();
  const note = inputs.note.value.trim();
  const rating = Number(ratingInput.value) || 0;

  if (!storeName && !ssid) {
    statusEl.textContent = "Please enter Store Name or SSID.";
    statusEl.style.color = "var(--danger)";
    return;
  }

  // 1. UI: Set Loading State
  logBtn.disabled = true;
  logBtn.innerHTML = "Brewing Results... ☕"; 
  latestEl.style.display = 'none';
  statusEl.textContent = "Getting location…";
  statusEl.style.color = "var(--text-muted)";

  if (!navigator.geolocation) {
    resetUI("Geolocation not supported.", true);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      statusEl.textContent = "Running speed test (this takes ~10s)…";

      chrome.runtime.sendMessage(
        {
          type: "RUN_LOG",
          payload: { storeName, ssid, password, note, rating, lat: latitude, lng: longitude },
        },
        (response) => {
          // Check for Chrome runtime errors (e.g., background script crash)
          if (chrome.runtime.lastError) {
            resetUI(`Error: ${chrome.runtime.lastError.message}`, true);
            return;
          }
          // Check for internal errors
          if (!response || response.error) {
            resetUI(`Error: ${response?.error || "Unknown error"}`, true);
            return;
          }

          // --- SUCCESS ---
          const { entry } = response;
          
          // 2. Clear the form
          inputs.storeName.value = "";
          inputs.ssid.value = "";
          inputs.password.value = "";
          inputs.note.value = "";
          setRating(0);

          // 3. Update Status & Stats
          statusEl.textContent = "Saved! ✅";
          statusEl.style.color = "var(--success)"; // Uses green from CSS if defined, or defaults
          
          latestEl.style.display = 'block';
          latestEl.textContent =
            `DL: ${entry.download_mbps?.toFixed(1) ?? "?"} | ` +
            `UL: ${entry.upload_mbps?.toFixed(1) ?? "?"} | ` +
            `Ping: ${entry.ping_ms?.toFixed(0) ?? "?"}`;

          // 4. Reset Button
          logBtn.disabled = false;
          logBtn.textContent = "Run Speed Test & Save";
        }
      );
    },
    (err) => {
      resetUI(`Location error: ${err.message}`, true);
    },
    { enableHighAccuracy: false, timeout: 10000 }
  );
});

// Helper to reset UI on error
function resetUI(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#ef4444" : "var(--text-muted)";
  logBtn.disabled = false;
  logBtn.textContent = "Run Speed Test & Save";
}

// Initialize stars
setRating(0);
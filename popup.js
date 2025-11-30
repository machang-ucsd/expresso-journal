const ratingInput = document.getElementById("rating");
const ratingLabel = document.getElementById("ratingLabel");
const starsEl = document.getElementById("stars");
const statusEl = document.getElementById("status");
const latestEl = document.getElementById("latest");
const logBtn = document.getElementById("logBtn");
const detectBtn = document.getElementById("detectBtn"); // New button

const inputs = {
  storeName: document.getElementById("storeName"),
  ssid: document.getElementById("ssid"),
  password: document.getElementById("password"),
  note: document.getElementById("note")
};

// --- AUTO-DETECT NAME FEATURE ---
detectBtn.addEventListener("click", () => {
  const originalPlaceholder = inputs.storeName.placeholder;
  inputs.storeName.value = "";
  inputs.storeName.placeholder = "Detecting location...";
  detectBtn.disabled = true;

  if (!navigator.geolocation) {
    inputs.storeName.placeholder = "Loc not supported";
    detectBtn.disabled = false;
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      
      try {
        // Fetch from OpenStreetMap (Nominatim)
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
        
        const response = await fetch(url);
        if(!response.ok) throw new Error("Network error");
        
        const data = await response.json();
        
        // Try to find the best name
        // 1. Specific Name (e.g., "Starbucks")
        // 2. Amenity (e.g., "Cafe")
        // 3. Address Road (e.g., "Market Street")
        let name = data.name || 
                   (data.address && data.address.amenity) || 
                   (data.address && data.address.shop) ||
                   (data.address && data.address.road);

        if (name) {
          inputs.storeName.value = name;
        } else {
          inputs.storeName.placeholder = "Name not found";
          setTimeout(() => inputs.storeName.placeholder = originalPlaceholder, 2000);
        }
      } catch (err) {
        console.warn("Name detection failed", err);
        inputs.storeName.placeholder = "Detection failed";
        setTimeout(() => inputs.storeName.placeholder = originalPlaceholder, 2000);
      } finally {
        detectBtn.disabled = false;
      }
    },
    (err) => {
      inputs.storeName.placeholder = "GPS Error";
      detectBtn.disabled = false;
      setTimeout(() => inputs.storeName.placeholder = originalPlaceholder, 2000);
    },
    { enableHighAccuracy: true, timeout: 5000 }
  );
});

// --- EXISTING LOGIC BELOW ---

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

document.getElementById("historyBtn").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL("list.html") });
});

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
          if (chrome.runtime.lastError) {
            resetUI(`Error: ${chrome.runtime.lastError.message}`, true);
            return;
          }
          if (!response || response.error) {
            resetUI(`Error: ${response?.error || "Unknown error"}`, true);
            return;
          }

          const { entry } = response;
          
          inputs.storeName.value = "";
          inputs.ssid.value = "";
          inputs.password.value = "";
          inputs.note.value = "";
          inputs.storeName.placeholder = "e.g. Starbucks Market St"; // Reset placeholder just in case
          setRating(0);

          statusEl.textContent = "Saved! ✅";
          statusEl.style.color = "var(--success)";
          
          latestEl.style.display = 'block';
          latestEl.textContent =
            `DL: ${entry.download_mbps?.toFixed(1) ?? "?"} | ` +
            `UL: ${entry.upload_mbps?.toFixed(1) ?? "?"} | ` +
            `Ping: ${entry.ping_ms?.toFixed(0) ?? "?"}`;

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

function resetUI(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#ef4444" : "var(--text-muted)";
  logBtn.disabled = false;
  logBtn.textContent = "Run Speed Test & Save";
}

setRating(0);
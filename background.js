chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RUN_LOG") {
    handleRunLog(message.payload)
      .then((entry) => sendResponse({ entry }))
      .catch((err) => sendResponse({ error: err.message || String(err) }));
    return true;
  }
});

async function handleRunLog(payload) {
  const { ssid, password, note, rating, lat, lng } = payload;

  const speed = await runMlabSpeedTest();

  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ssid: ssid || null,
    password: password || null,
    note: note || null,
    rating: rating ?? 0,
    download_mbps: speed.downloadMbps,
    upload_mbps: speed.uploadMbps,
    ping_ms: speed.pingMs,
    lat: typeof lat === "number" ? lat : null,
    lng: typeof lng === "number" ? lng : null,
  };

  const result = await chrome.storage.sync.get("logs");
  const logs = result.logs || [];
  logs.push(entry);
  await chrome.storage.sync.set({ logs });

  return entry;
}

async function runMlabSpeedTest() {
  const PING_URL = "https://www.google.com/generate_204";
  const DOWNLOAD_URL = "https://speed.cloudflare.com/__down?bytes=50000000"; 
  const UPLOAD_URL = "https://speed.cloudflare.com/__up";

  // --- 1. Ping Test ---
  let pingMs = null;
  try {
    const startPing = performance.now();
    await fetch(PING_URL, { cache: "no-store", method: "HEAD" });
    pingMs = performance.now() - startPing;
  } catch (e) {
    console.warn("Ping failed", e);
  }

  // --- 2. Download Test (Time-boxed 5s) ---
  let downloadMbps = null;
  try {
    const resp = await fetch(DOWNLOAD_URL, { cache: "no-store" });
    if (!resp.ok) throw new Error(`Status ${resp.status}`);

    const reader = resp.body.getReader();
    let receivedLength = 0;
    let startTime = performance.now();
    let endTime = startTime;
    
    const TEST_DURATION_MS = 5000; 

    while (true) {
      const { done, value } = await reader.read();
      endTime = performance.now();
      if (done) break;
      receivedLength += value.length;
      if ((endTime - startTime) > TEST_DURATION_MS) {
        await reader.cancel();
        break;
      }
    }

    const durationSec = (endTime - startTime) / 1000;
    if (durationSec > 0 && receivedLength > 0) {
      const bits = receivedLength * 8;
      downloadMbps = (bits / 1_000_000) / durationSec;
    }
  } catch (e) {
    console.warn("Download test failed", e);
  }

  // --- 3. Upload Test (Step-Up Strategy) ---
  let uploadMbps = null;
  try {
    // Helper to upload a specific size and return Mbps
    const performUpload = async (bytes) => {
      // Create dummy data
      const data = new Uint8Array(bytes); // Zeros are fine, Cloudflare handles it
      const start = performance.now();
      
      await fetch(UPLOAD_URL, {
        method: "POST",
        body: data,
        cache: "no-store"
      });
      
      const durationSec = (performance.now() - start) / 1000;
      const bits = bytes * 8;
      return {
        mbps: (bits / 1_000_000) / durationSec,
        duration: durationSec
      };
    };

    // Step A: Warm-up / Probe with 2MB
    const PROBE_SIZE = 2 * 1024 * 1024; 
    const probe = await performUpload(PROBE_SIZE);

    if (probe.duration > 2.0) {
      // If 2MB took > 2 seconds, the connection is slow (< 8Mbps).
      // The result is accurate enough.
      uploadMbps = probe.mbps;
    } else {
      // Connection is fast. The probe was too short for accuracy.
      // Calculate a target size that would take roughly 4 seconds.
      // Target = (Mbps * 4s) / 8 bits-per-byte
      // 1 Mbps = 125,000 bytes/sec
      const targetBytes = Math.floor((probe.mbps * 1_000_000 / 8) * 4);
      
      // Cap at 50MB to prevent memory issues or crazy timeouts
      const MAX_SIZE = 50 * 1024 * 1024; 
      const finalSize = Math.min(targetBytes, MAX_SIZE);
      
      // Step B: Run the real test
      const finalTest = await performUpload(finalSize);
      uploadMbps = finalTest.mbps;
    }

  } catch (e) {
    console.warn("Upload test failed", e);
  }

  return {
    downloadMbps,
    uploadMbps,
    pingMs,
  };
}
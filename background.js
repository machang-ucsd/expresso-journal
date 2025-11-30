chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RUN_LOG") {
    handleRunLog(message.payload)
      .then((entry) => sendResponse({ entry }))
      .catch((err) => sendResponse({ error: err.message || String(err) }));
    // Return true to indicate async response
    return true;
  }
});

async function handleRunLog(payload) {
  const { storeName, ssid, password, note, rating, lat, lng } = payload;

  // Run the safer speed test
  const speed = await runMlabSpeedTest();
  
  const id = crypto.randomUUID();
  const entry = {
    id: id,
    timestamp: new Date().toISOString(),
    storeName: storeName || null,
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

  const storageKey = `log_${id}`;
  await chrome.storage.sync.set({ [storageKey]: entry });

  return entry;
}

async function runMlabSpeedTest() {
  const PING_URL = "https://www.google.com/generate_204";
  const DOWNLOAD_URL = "https://speed.cloudflare.com/__down?bytes=50000000"; 
  const UPLOAD_URL = "https://speed.cloudflare.com/__up";

  // --- 1. PING ---
  let pingMs = null;
  try {
    const startPing = performance.now();
    await fetch(PING_URL, { cache: "no-store", method: "HEAD" });
    pingMs = performance.now() - startPing;
  } catch (e) {
    console.warn("Ping failed", e);
  }

  // --- 2. DOWNLOAD (Streaming with Timeout) ---
  let downloadMbps = null;
  try {
    const controller = new AbortController();
    // Safety: Hard kill download after 7 seconds max
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const resp = await fetch(DOWNLOAD_URL, { 
      cache: "no-store", 
      signal: controller.signal 
    });
    
    if (!resp.ok) throw new Error(`Status ${resp.status}`);

    const reader = resp.body.getReader();
    let receivedLength = 0;
    let startTime = performance.now();
    let endTime = startTime;
    const TEST_DURATION_MS = 5000; // Aim for 5s test

    while (true) {
      const { done, value } = await reader.read();
      endTime = performance.now();
      
      if (done) break;
      receivedLength += value.length;
      
      // Stop reading if we exceed duration
      if ((endTime - startTime) > TEST_DURATION_MS) {
        await reader.cancel();
        break;
      }
    }
    clearTimeout(timeoutId);

    const durationSec = (endTime - startTime) / 1000;
    if (durationSec > 0 && receivedLength > 0) {
      downloadMbps = (receivedLength * 8 / 1_000_000) / durationSec;
    }
  } catch (e) {
    console.warn("Download failed", e);
  }

  // --- 3. UPLOAD (Step-Up with Abort Safety) ---
  let uploadMbps = null;
  try {
    // Helper that enforces a strict timeout on the upload request
    const performUpload = async (bytes, timeoutMs = 8000) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const data = new Uint8Array(bytes);
        const start = performance.now();
        
        await fetch(UPLOAD_URL, { 
          method: "POST", 
          body: data, 
          cache: "no-store",
          signal: controller.signal 
        });
        
        clearTimeout(id);
        const durationSec = (performance.now() - start) / 1000;
        return { 
          mbps: (bytes * 8 / 1_000_000) / durationSec, 
          duration: durationSec,
          success: true
        };
      } catch (err) {
        clearTimeout(id);
        return { success: false, error: err };
      }
    };

    // Step A: Probe (2MB)
    const probe = await performUpload(2 * 1024 * 1024, 5000); // 5s timeout for probe

    if (probe.success) {
      if (probe.duration > 2.0) {
        // Slow connection, probe is accurate enough
        uploadMbps = probe.mbps;
      } else {
        // Fast connection, scale up
        // Cap max size to 20MB (reduced from 50MB) to prevent hanging
        const targetBytes = Math.min(Math.floor((probe.mbps * 1_000_000 / 8) * 4), 20 * 1024 * 1024);
        
        // Step B: Final Test
        const finalTest = await performUpload(targetBytes, 10000); // 10s timeout
        
        if (finalTest.success) {
          uploadMbps = finalTest.mbps;
        } else {
          // If final test timed out/failed, fallback to probe speed
          console.warn("Upload final test timed out, using probe result");
          uploadMbps = probe.mbps;
        }
      }
    }
  } catch (e) {
    console.warn("Upload failed", e);
  }

  return { downloadMbps, uploadMbps, pingMs };
}
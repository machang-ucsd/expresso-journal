chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RUN_LOG") {
    handleRunLog(message.payload)
      .then((entry) => sendResponse({ entry }))
      .catch((err) => sendResponse({ error: err.message || String(err) }));
    // Return true to indicate we'll respond asynchronously
    return true;
  }
});

async function handleRunLog(payload) {
  const { ssid, password, note, rating, lat, lng } = payload;

  // Run the speed test
  const speed = await runMlabSpeedTest();

  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ssid: ssid || null,
    // Consider omitting password from storage if you don't truly need it
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
  
  // 1. Measure Ping
  let pingMs = null;
  try {
    const startPing = performance.now();
    await fetch(PING_URL, { cache: "no-store", method: "HEAD" });
    pingMs = performance.now() - startPing;
  } catch (e) {
    console.warn("Ping failed", e);
  }

  // 2. Measure Download
  let downloadMbps = null;
  try {
    const resp = await fetch(DOWNLOAD_URL, { cache: "no-store" });
    if (!resp.ok) throw new Error(`Status ${resp.status}`);

    const reader = resp.body.getReader();
    let receivedLength = 0;
    let startTime = performance.now();
    let endTime = startTime;
    
    // INCREASED to 5 seconds for better accuracy
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

  return {
    downloadMbps,
    uploadMbps: null,
    pingMs,
  };
}
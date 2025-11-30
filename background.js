chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RUN_LOG") {
    handleRunLog(message.payload)
      .then((entry) => sendResponse({ entry }))
      .catch((err) => sendResponse({ error: err.message || String(err) }));
    return true; // async
  }
});

async function handleRunLog(payload) {
  const { ssid, password, note, rating, lat, lng } = payload;

  // Run M-Lab speed test (currently stubbed)
  const speed = await runMlabSpeedTest();

  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ssid: ssid || null,
    // strongly consider not storing password; for now we store it, but you can remove this
    password: password || null,
    note: note || null,
    rating: rating ?? 0,
    download_mbps: speed.downloadMbps,
    upload_mbps: speed.uploadMbps,
    ping_ms: speed.pingMs,
    lat: lat || null,
    lng: lng || null,
  };

  const result = await chrome.storage.sync.get("logs");
  const logs = result.logs || [];
  logs.push(entry);
  await chrome.storage.sync.set({ logs });

  return entry;
}

// TODO: replace stub with real ndt7 call using M-Lab.
// For now, this just returns fake-ish numbers so the rest of the UI works.
async function runMlabSpeedTest() {
  // Example: use a quick HTTP RTT to google as "ping"
  let pingMs = null;
  try {
    const startPing = performance.now();
    const resp = await fetch("https://www.google.com/generate_204", {
      cache: "no-store",
    });
    if (resp.ok) {
      pingMs = performance.now() - startPing;
    }
  } catch (e) {
    console.warn("Ping failed", e);
  }

  // Fake download/upload
  const downloadMbps = 50 + Math.random() * 50;
  const uploadMbps = 10 + Math.random() * 20;

  return {
    downloadMbps,
    uploadMbps,
    pingMs,
  };
}

// Minimal Wardrive sender with wake locks:
// - Connect to MeshCore Companion via Web Bluetooth (BLE)
// - Send pings as "@[MapperBot]<LAT LON>[ <power> ]" (power only if specified)
// - Manual "Send Ping" and Auto mode (interval selectable: 15/30/60s)
// - Acquire wake lock during auto mode to keep screen awake

import { WebBleConnection } from "./mc/index.js"; // your BLE client

// ---- Debug Configuration ----
const DEBUG_ENABLED = true; // Set to false to disable all debug logging

// Debug logging helper function
function debugLog(message, ...args) {
  if (DEBUG_ENABLED) {
    console.log(`[DEBUG] ${message}`, ...args);
  }
}

function debugWarn(message, ...args) {
  if (DEBUG_ENABLED) {
    console.warn(`[DEBUG] ${message}`, ...args);
  }
}

function debugError(message, ...args) {
  if (DEBUG_ENABLED) {
    console.error(`[DEBUG] ${message}`, ...args);
  }
}

// ---- Config ----
const CHANNEL_NAME     = "#wardriving";        // change to "#wardrive" if needed
const DEFAULT_INTERVAL_S = 30;                 // fallback if selector unavailable
const PING_PREFIX      = "@[MapperBot]";
const GPS_FRESHNESS_BUFFER_MS = 5000;          // Buffer time for GPS freshness checks
const GPS_ACCURACY_THRESHOLD_M = 100;          // Maximum acceptable GPS accuracy in meters
const MESHMAPPER_DELAY_MS = 7000;              // Delay MeshMapper API call by 7 seconds
const COOLDOWN_MS = 7000;                      // Cooldown period for manual ping and auto toggle
const STATUS_UPDATE_DELAY_MS = 100;            // Brief delay to ensure "Ping sent" status is visible
const MAP_REFRESH_DELAY_MS = 1000;             // Delay after API post to ensure backend updated
const WARDROVE_KEY     = new Uint8Array([
  0x40, 0x76, 0xC3, 0x15, 0xC1, 0xEF, 0x38, 0x5F,
  0xA9, 0x3F, 0x06, 0x60, 0x27, 0x32, 0x0F, 0xE5
]);

// MeshMapper API Configuration
const MESHMAPPER_API_URL = "https://yow.meshmapper.net/wardriving-api.php";
const MESHMAPPER_API_KEY = "59C7754DABDF5C11CA5F5D8368F89";
const MESHMAPPER_DEFAULT_WHO = "GOME-WarDriver"; // Default identifier

// ---- DOM refs (from index.html; unchanged except the two new selectors) ----
const $ = (id) => document.getElementById(id);
const statusEl       = $("status");
const deviceInfoEl   = $("deviceInfo");
const channelInfoEl  = $("channelInfo");
const connectBtn     = $("connectBtn");
const sendPingBtn    = $("sendPingBtn");
const autoToggleBtn  = $("autoToggleBtn");
const lastPingEl     = $("lastPing");
const gpsInfoEl = document.getElementById("gpsInfo");
const gpsAccEl = document.getElementById("gpsAcc");
const sessionPingsEl = document.getElementById("sessionPings"); // optional
const coverageFrameEl = document.getElementById("coverageFrame");
setConnectButton(false);

// NEW: selectors
const intervalSelect = $("intervalSelect"); // 15 / 30 / 60 seconds
const powerSelect    = $("powerSelect");    // "", "0.3w", "0.6w", "1.0w"

// ---- State ----
const state = {
  connection: null,
  channel: null,
  autoTimerId: null,
  running: false,
  wakeLock: null,
  geoWatchId: null,
  lastFix: null, // { lat, lon, accM, tsMs }
  bluefyLockEnabled: false,
  gpsState: "idle", // "idle", "acquiring", "acquired", "error"
  gpsAgeUpdateTimer: null, // Timer for updating GPS age display
  meshMapperTimer: null, // Timer for delayed MeshMapper API call
  cooldownEndTime: null, // Timestamp when cooldown period ends
  cooldownUpdateTimer: null, // Timer to re-enable controls after cooldown
  autoCountdownTimer: null, // Timer for auto-ping countdown display
  nextAutoPingTime: null, // Timestamp when next auto-ping will occur
  apiCountdownTimer: null, // Timer for API post countdown display
  apiPostTime: null // Timestamp when API post will occur
};

// ---- UI helpers ----
function setStatus(text, color = "text-slate-300") {
  statusEl.textContent = text;
  statusEl.className = `font-semibold ${color}`;
}
function updateAutoCountdownStatus() {
  if (!state.running || !state.nextAutoPingTime) {
    return;
  }
  
  const remainingMs = state.nextAutoPingTime - Date.now();
  if (remainingMs <= 0) {
    setStatus("Sending auto ping...", "text-sky-300");
    return;
  }
  
  const remainingSec = Math.ceil(remainingMs / 1000);
  setStatus(`Waiting for next auto ping (${remainingSec}s)`, "text-slate-300");
}
function startAutoCountdown(intervalMs) {
  // Stop any existing countdown
  stopAutoCountdown();
  
  // Set the next ping time
  state.nextAutoPingTime = Date.now() + intervalMs;
  
  // Update immediately
  updateAutoCountdownStatus();
  
  // Update every second
  state.autoCountdownTimer = setInterval(() => {
    updateAutoCountdownStatus();
  }, 1000);
}
function stopAutoCountdown() {
  if (state.autoCountdownTimer) {
    clearInterval(state.autoCountdownTimer);
    state.autoCountdownTimer = null;
  }
  state.nextAutoPingTime = null;
}
function updateApiCountdownStatus() {
  if (!state.apiPostTime) {
    return;
  }
  
  const remainingMs = state.apiPostTime - Date.now();
  if (remainingMs <= 0) {
    setStatus("Posting to API...", "text-sky-300");
    return;
  }
  
  const remainingSec = Math.ceil(remainingMs / 1000);
  setStatus(`Wait to post API (${remainingSec}s)`, "text-sky-300");
}
function startApiCountdown(delayMs) {
  // Stop any existing countdown
  stopApiCountdown();
  
  // Set the API post time
  state.apiPostTime = Date.now() + delayMs;
  
  // Update immediately
  updateApiCountdownStatus();
  
  // Update every second
  state.apiCountdownTimer = setInterval(() => {
    updateApiCountdownStatus();
  }, 1000);
}
function stopApiCountdown() {
  if (state.apiCountdownTimer) {
    clearInterval(state.apiCountdownTimer);
    state.apiCountdownTimer = null;
  }
  state.apiPostTime = null;
}
function isInCooldown() {
  return state.cooldownEndTime && Date.now() < state.cooldownEndTime;
}
function startCooldown() {
  state.cooldownEndTime = Date.now() + COOLDOWN_MS;
  updateControlsForCooldown();
  
  // Clear any existing cooldown update and schedule a new one
  if (state.cooldownUpdateTimer) {
    clearTimeout(state.cooldownUpdateTimer);
  }
  state.cooldownUpdateTimer = setTimeout(() => {
    state.cooldownEndTime = null;
    updateControlsForCooldown();
  }, COOLDOWN_MS);
}
function updateControlsForCooldown() {
  const connected = !!state.connection;
  const inCooldown = isInCooldown();
  sendPingBtn.disabled = !connected || inCooldown;
  autoToggleBtn.disabled = !connected || inCooldown;
}
function enableControls(connected) {
  connectBtn.disabled     = false;
  channelInfoEl.textContent = CHANNEL_NAME;
  updateControlsForCooldown();
}
function updateAutoButton() {
  if (state.running) {
    autoToggleBtn.textContent = "Stop Auto Ping";
    autoToggleBtn.classList.remove("bg-indigo-600","hover:bg-indigo-500");
    autoToggleBtn.classList.add("bg-amber-600","hover:bg-amber-500");
  } else {
    autoToggleBtn.textContent = "Start Auto Ping";
    autoToggleBtn.classList.add("bg-indigo-600","hover:bg-indigo-500");
    autoToggleBtn.classList.remove("bg-amber-600","hover:bg-amber-500");
  }
}
function buildCoverageEmbedUrl(lat, lon) {
  const base =
    "https://yow.meshmapper.net/embed.php?cov_grid=1&fail_grid=1&pings=0&repeaters=1&rep_coverage=0&grid_lines=0&dir=1&meters=1500";
  return `${base}&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
}
let coverageRefreshTimer = null;
function scheduleCoverageRefresh(lat, lon, delayMs = 0) {
  if (!coverageFrameEl) return;

  if (coverageRefreshTimer) clearTimeout(coverageRefreshTimer);

  coverageRefreshTimer = setTimeout(() => {
    const url = buildCoverageEmbedUrl(lat, lon);
    console.log("Coverage iframe URL:", url);
    coverageFrameEl.src = url;
  }, delayMs);
}
function setConnectButton(connected) {
  if (!connectBtn) return;
  if (connected) {
    connectBtn.textContent = "Disconnect";
    connectBtn.classList.remove(
      "bg-emerald-600",
      "hover:bg-emerald-500"
    );
    connectBtn.classList.add(
      "bg-red-600",
      "hover:bg-red-500"
    );
  } else {
    connectBtn.textContent = "Connect";
    connectBtn.classList.remove(
      "bg-red-600",
      "hover:bg-red-500"
    );
    connectBtn.classList.add(
      "bg-emerald-600",
      "hover:bg-emerald-500"
    );
  }
}



// ---- Wake Lock helpers ----
async function acquireWakeLock() {
  debugLog("Attempting to acquire wake lock");
  if (navigator.bluetooth && typeof navigator.bluetooth.setScreenDimEnabled === "function") {
    try {
      navigator.bluetooth.setScreenDimEnabled(true);
      state.bluefyLockEnabled = true;
      debugLog("Bluefy screen-dim prevention enabled");
      return;
    } catch (e) {
      debugWarn("Bluefy setScreenDimEnabled failed:", e);
    }
  }
  try {
    if ("wakeLock" in navigator && typeof navigator.wakeLock.request === "function") {
      state.wakeLock = await navigator.wakeLock.request("screen");
      debugLog("Wake lock acquired successfully");
      state.wakeLock.addEventListener?.("release", () => debugLog("Wake lock released"));
    } else {
      debugLog("Wake Lock API not supported on this device");
    }
  } catch (err) {
    debugError(`Could not obtain wake lock: ${err.name}, ${err.message}`);
  }
}
async function releaseWakeLock() {
  debugLog("Attempting to release wake lock");
  if (state.bluefyLockEnabled && navigator.bluetooth && typeof navigator.bluetooth.setScreenDimEnabled === "function") {
    try {
      navigator.bluetooth.setScreenDimEnabled(false);
      state.bluefyLockEnabled = false;
      debugLog("Bluefy screen-dim prevention disabled");
    } catch (e) {
      debugWarn("Bluefy setScreenDimEnabled(false) failed:", e);
    }
  }
  try {
    if (state.wakeLock) {
      await state.wakeLock.release?.();
      state.wakeLock = null;
      debugLog("Wake lock released successfully");
    }
  } catch (e) {
    debugWarn("Error releasing wake lock:", e);
    state.wakeLock = null;
  }
}

// ---- Geolocation ----
async function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => reject(err),
      { 
        enableHighAccuracy: true, 
        maximumAge: getGpsMaximumAge(1000), // Fresh data for one-off requests
        timeout: 30000 
      }
    );
  });
}
function updateGpsUi() {
  if (!gpsInfoEl || !gpsAccEl) return;

  if (!state.lastFix) {
    // Show different messages based on GPS state
    if (state.gpsState === "acquiring") {
      gpsInfoEl.textContent = "Acquiring GPS fix...";
      gpsAccEl.textContent = "Please wait";
    } else if (state.gpsState === "error") {
      gpsInfoEl.textContent = "GPS error - check permissions";
      gpsAccEl.textContent = "-";
    } else {
      gpsInfoEl.textContent = "-";
      gpsAccEl.textContent = "-";
    }
    return;
  }

  const { lat, lon, accM, tsMs } = state.lastFix;
  const ageSec = Math.max(0, Math.round((Date.now() - tsMs) / 1000));

  state.gpsState = "acquired";
  gpsInfoEl.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)} (${ageSec}s ago)`;
  gpsAccEl.textContent = accM ? `±${Math.round(accM)} m` : "-";
}

// Start continuous GPS age display updates
function startGpsAgeUpdater() {
  if (state.gpsAgeUpdateTimer) return;
  state.gpsAgeUpdateTimer = setInterval(() => {
    updateGpsUi();
  }, 1000); // Update every second
}

// Stop GPS age display updates
function stopGpsAgeUpdater() {
  if (state.gpsAgeUpdateTimer) {
    clearInterval(state.gpsAgeUpdateTimer);
    state.gpsAgeUpdateTimer = null;
  }
}
function startGeoWatch() {
  if (state.geoWatchId) {
    debugLog("GPS watch already running, skipping start");
    return;
  }
  if (!("geolocation" in navigator)) {
    debugError("Geolocation not available in navigator");
    return;
  }

  debugLog("Starting GPS watch");
  state.gpsState = "acquiring";
  updateGpsUi();
  startGpsAgeUpdater(); // Start the age counter

  state.geoWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      debugLog(`GPS fix acquired: lat=${pos.coords.latitude.toFixed(5)}, lon=${pos.coords.longitude.toFixed(5)}, accuracy=${pos.coords.accuracy}m`);
      state.lastFix = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accM: pos.coords.accuracy,
        tsMs: Date.now(),
      };
      state.gpsState = "acquired";
      updateGpsUi();
    },
    (err) => {
      debugError(`GPS watch error: ${err.code} - ${err.message}`);
      state.gpsState = "error";
      // Keep UI honest if it fails
      updateGpsUi();
    },
    { 
      enableHighAccuracy: true, 
      maximumAge: getGpsMaximumAge(5000), // Continuous watch, minimum 5s
      timeout: 30000 
    }
  );
}
function stopGeoWatch() {
  if (!state.geoWatchId) {
    debugLog("No GPS watch to stop");
    return;
  }
  debugLog("Stopping GPS watch");
  navigator.geolocation.clearWatch(state.geoWatchId);
  state.geoWatchId = null;
  stopGpsAgeUpdater(); // Stop the age counter
}
async function primeGpsOnce() {
  debugLog("Priming GPS with initial position request");
  // Start continuous watch so the UI keeps updating
  startGeoWatch();

  state.gpsState = "acquiring";
  updateGpsUi();

  try {
    const pos = await getCurrentPosition();

    debugLog(`Initial GPS position acquired: lat=${pos.coords.latitude.toFixed(5)}, lon=${pos.coords.longitude.toFixed(5)}, accuracy=${pos.coords.accuracy}m`);
    state.lastFix = {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      accM: pos.coords.accuracy,
      tsMs: Date.now(),
    };

    state.gpsState = "acquired";
    updateGpsUi();

    // Only refresh the coverage map if we have an accurate fix
    if (state.lastFix.accM && state.lastFix.accM < GPS_ACCURACY_THRESHOLD_M) {
      debugLog(`GPS accuracy ${state.lastFix.accM}m is within threshold, refreshing coverage map`);
      scheduleCoverageRefresh(
        state.lastFix.lat,
        state.lastFix.lon
      );
    } else {
      debugLog(`GPS accuracy ${state.lastFix.accM}m exceeds threshold (${GPS_ACCURACY_THRESHOLD_M}m), skipping map refresh`);
    }

  } catch (e) {
    debugError(`primeGpsOnce failed: ${e.message}`);
    state.gpsState = "error";
    updateGpsUi();
  }
}



// ---- Channel helpers ----
async function ensureChannel() {
  if (!state.connection) throw new Error("Not connected");
  if (state.channel) {
    debugLog(`Using existing channel: ${CHANNEL_NAME}`);
    return state.channel;
  }

  debugLog(`Looking up channel: ${CHANNEL_NAME}`);
  const ch = await state.connection.findChannelByName(CHANNEL_NAME);
  if (!ch) {
    debugError(`Channel ${CHANNEL_NAME} not found on device`);
    enableControls(false);
    throw new Error(
      `Channel ${CHANNEL_NAME} not found. Join it on your companion first.`
    );
  }

  debugLog(`Channel found: ${CHANNEL_NAME} (index: ${ch.channelIdx})`);
  state.channel = ch;
  enableControls(true);
  channelInfoEl.textContent = `${CHANNEL_NAME} (CH:${ch.channelIdx})`;
  return ch;
}


// ---- Helpers: interval & payload ----
function getSelectedIntervalMs() {
  const checked = document.querySelector('input[name="interval"]:checked');
  const s = checked ? Number(checked.value) : 30;
  const clamped = [15, 30, 60].includes(s) ? s : 30;
  return clamped * 1000;
}

// Calculate GPS maximumAge based on selected interval
// Returns how old cached GPS data can be before requesting a fresh position.
// Subtracts GPS_FRESHNESS_BUFFER_MS to ensure new data before the interval expires.
// Math.max ensures we never return negative or too-small values.
function getGpsMaximumAge(minAge = 1000) {
  const intervalMs = getSelectedIntervalMs();
  return Math.max(minAge, intervalMs - GPS_FRESHNESS_BUFFER_MS);
}

function getCurrentPowerSetting() {
  const checkedPower = document.querySelector('input[name="power"]:checked');
  return checkedPower ? checkedPower.value : "";
}

function buildPayload(lat, lon) {
  const coordsStr = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  const power = getCurrentPowerSetting();
  const suffix = power ? ` [${power}]` : "";
  return `${PING_PREFIX} ${coordsStr} ${suffix}`;
}

// ---- MeshMapper API ----
async function postToMeshMapperAPI(lat, lon) {
  try {

    // Get current power setting
    const power = getCurrentPowerSetting();
    const powerValue = power || "N/A";

    // Use device name if available, otherwise use default
    const deviceText = deviceInfoEl?.textContent;
    const whoIdentifier = (deviceText && deviceText !== "—") ? deviceText : MESHMAPPER_DEFAULT_WHO;

    // Build API payload
    const payload = {
      key: MESHMAPPER_API_KEY,
      lat: lat,
      lon: lon,
      who: whoIdentifier,
      power: powerValue,
      test: 0
    };

    debugLog(`Posting to MeshMapper API: lat=${lat.toFixed(5)}, lon=${lon.toFixed(5)}, who=${whoIdentifier}, power=${powerValue}`);

    // POST to MeshMapper API
    const response = await fetch(MESHMAPPER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      debugWarn(`MeshMapper API returned error status ${response.status}`);
    } else {
      debugLog(`MeshMapper API post successful (status ${response.status})`);
    }
  } catch (error) {
    // Log error but don't fail the ping
    debugError(`MeshMapper API post failed: ${error.message}`);
  }
}

// ---- Ping ----
async function sendPing(manual = false) {
  debugLog(`sendPing called (manual=${manual})`);
  try {
    // Check cooldown only for manual pings
    if (manual && isInCooldown()) {
      const remainingMs = state.cooldownEndTime - Date.now();
      const remainingSec = Math.ceil(remainingMs / 1000);
      debugLog(`Manual ping blocked by cooldown (${remainingSec}s remaining)`);
      setStatus(`Please wait ${remainingSec}s before sending another ping`, "text-amber-300");
      return;
    }

    // Stop the countdown timer when sending an auto ping to avoid status conflicts
    if (!manual && state.running) {
      stopAutoCountdown();
      setStatus("Sending auto ping...", "text-sky-300");
    }

    let lat, lon, accuracy;

    // In auto mode, always use the most recent GPS coordinates from the watch
    // In manual mode, get fresh GPS if needed
    if (!manual && state.running) {
      // Auto mode: use GPS watch data
      if (!state.lastFix) {
        // If no GPS fix yet in auto mode, skip this ping and wait for watch to acquire location
        debugWarn("Auto ping skipped: no GPS fix available yet");
        setStatus("Waiting for GPS fix...", "text-amber-300");
        return;
      }
      debugLog(`Using GPS watch data for auto ping: lat=${state.lastFix.lat.toFixed(5)}, lon=${state.lastFix.lon.toFixed(5)}`);
      lat = state.lastFix.lat;
      lon = state.lastFix.lon;
      accuracy = state.lastFix.accM;
    } else {
      // Manual mode: check if we have recent enough GPS data
      const intervalMs = getSelectedIntervalMs();
      const maxAge = intervalMs + GPS_FRESHNESS_BUFFER_MS; // Allow buffer beyond interval

      if (state.lastFix && (Date.now() - state.lastFix.tsMs) < maxAge) {
        debugLog(`Using cached GPS data (age: ${Date.now() - state.lastFix.tsMs}ms)`);
        lat = state.lastFix.lat;
        lon = state.lastFix.lon;
        accuracy = state.lastFix.accM;
      } else {
        // Get fresh GPS coordinates for manual ping
        debugLog("Requesting fresh GPS position for manual ping");
        const pos = await getCurrentPosition();
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
        accuracy = pos.coords.accuracy;
        debugLog(`Fresh GPS acquired: lat=${lat.toFixed(5)}, lon=${lon.toFixed(5)}, accuracy=${accuracy}m`);
        state.lastFix = {
          lat,
          lon,
          accM: accuracy,
          tsMs: Date.now(),
        };
        updateGpsUi();
      }
    }

    const payload = buildPayload(lat, lon);
    debugLog(`Sending ping to channel: "${payload}"`);

    const ch = await ensureChannel();
    await state.connection.sendChannelTextMessage(ch.channelIdx, payload);
    debugLog(`Ping sent successfully to channel ${ch.channelIdx}`);

    // Start cooldown period after successful ping
    debugLog(`Starting ${COOLDOWN_MS}ms cooldown`);
    startCooldown();

    // Update status after ping is sent
    // Brief delay to show "Ping sent" status before moving to countdown
    setStatus(manual ? "Ping sent" : "Auto ping sent", "text-emerald-300");
    
    setTimeout(() => {
      if (state.connection) {
        // Start countdown for API post
        startApiCountdown(MESHMAPPER_DELAY_MS);
      }
    }, STATUS_UPDATE_DELAY_MS);

    // Schedule MeshMapper API call with 7-second delay (non-blocking)
    // Clear any existing timer first
    if (state.meshMapperTimer) {
      debugLog("Clearing existing MeshMapper timer");
      clearTimeout(state.meshMapperTimer);
    }

    debugLog(`Scheduling MeshMapper API post in ${MESHMAPPER_DELAY_MS}ms`);
    state.meshMapperTimer = setTimeout(async () => {
      // Capture accuracy in closure to ensure it's available in nested callback
      const capturedAccuracy = accuracy;
      
      // Stop the API countdown since we're posting now
      stopApiCountdown();
      setStatus("Posting to API...", "text-sky-300");
      
      try {
        await postToMeshMapperAPI(lat, lon);
      } catch (error) {
        console.error("MeshMapper API post failed:", error);
        // Continue with map refresh and status update even if API fails
      }
      
      // Update map after API post to ensure backend updated
      setTimeout(() => {
        if (capturedAccuracy && capturedAccuracy < GPS_ACCURACY_THRESHOLD_M) {
          debugLog(`Refreshing coverage map (accuracy ${capturedAccuracy}m within threshold)`);
          scheduleCoverageRefresh(lat, lon);
        } else {
          debugLog(`Skipping map refresh (accuracy ${capturedAccuracy}m exceeds threshold)`);
        }
        
        // Set status to idle after map update
        if (state.connection) {
          // If in auto mode, schedule next ping. Otherwise, set to idle
          if (state.running) {
            // Schedule the next auto ping with countdown
            debugLog("Scheduling next auto ping");
            scheduleNextAutoPing();
          } else {
            debugLog("Setting status to idle");
            setStatus("Idle", "text-slate-300");
          }
        }
      }, MAP_REFRESH_DELAY_MS);
      
      state.meshMapperTimer = null;
    }, MESHMAPPER_DELAY_MS);
    
    const nowStr = new Date().toLocaleString();
    if (lastPingEl) lastPingEl.textContent = `${nowStr} — ${payload}`;

    // Session log
    if (sessionPingsEl) {
      const line = `${nowStr}  ${lat.toFixed(5)} ${lon.toFixed(5)}`;
      const li = document.createElement('li');
      li.textContent = line;
      sessionPingsEl.appendChild(li);
       // Auto-scroll to bottom when a new entry arrives
      sessionPingsEl.scrollTop = sessionPingsEl.scrollHeight;
    }
  } catch (e) {
    debugError(`Ping operation failed: ${e.message}`, e);
    setStatus(e.message || "Ping failed", "text-red-300");
  }
}

// ---- Auto mode ----
function stopAutoPing(stopGps = false) {
  debugLog(`stopAutoPing called (stopGps=${stopGps})`);
  // Check if we're in cooldown before stopping (unless stopGps is true for disconnect)
  if (!stopGps && isInCooldown()) {
    const remainingMs = state.cooldownEndTime - Date.now();
    const remainingSec = Math.ceil(remainingMs / 1000);
    debugLog(`Auto ping stop blocked by cooldown (${remainingSec}s remaining)`);
    setStatus(`Please wait ${remainingSec}s before toggling auto mode`, "text-amber-300");
    return;
  }
  
  if (state.autoTimerId) {
    debugLog("Clearing auto ping timer");
    clearTimeout(state.autoTimerId);
    state.autoTimerId = null;
  }
  stopAutoCountdown();
  
  // Only stop GPS watch when disconnecting or page hidden, not during normal stop
  if (stopGps) {
    stopGeoWatch();
  }
  
  state.running = false;
  updateAutoButton();
  releaseWakeLock();
  debugLog("Auto ping stopped");
}
function scheduleNextAutoPing() {
  if (!state.running) {
    debugLog("Not scheduling next auto ping - auto mode not running");
    return;
  }
  
  const intervalMs = getSelectedIntervalMs();
  debugLog(`Scheduling next auto ping in ${intervalMs}ms`);
  
  // Start countdown immediately
  startAutoCountdown(intervalMs);
  
  // Schedule the next ping
  state.autoTimerId = setTimeout(() => {
    if (state.running) {
      debugLog("Auto ping timer fired, sending ping");
      sendPing(false).catch(console.error);
    }
  }, intervalMs);
}

function startAutoPing() {
  debugLog("startAutoPing called");
  if (!state.connection) {
    debugError("Cannot start auto ping - not connected");
    alert("Connect to a MeshCore device first.");
    return;
  }
  
  // Check if we're in cooldown
  if (isInCooldown()) {
    const remainingMs = state.cooldownEndTime - Date.now();
    const remainingSec = Math.ceil(remainingMs / 1000);
    debugLog(`Auto ping start blocked by cooldown (${remainingSec}s remaining)`);
    setStatus(`Please wait ${remainingSec}s before toggling auto mode`, "text-amber-300");
    return;
  }
  
  // Clean up any existing auto-ping timer (but keep GPS watch running)
  if (state.autoTimerId) {
    debugLog("Clearing existing auto ping timer");
    clearTimeout(state.autoTimerId);
    state.autoTimerId = null;
  }
  stopAutoCountdown();
  
  // Start GPS watch for continuous updates
  debugLog("Starting GPS watch for auto mode");
  startGeoWatch();
  
  state.running = true;
  updateAutoButton();

  // Acquire wake lock for auto mode
  debugLog("Acquiring wake lock for auto mode");
  acquireWakeLock().catch(console.error);

  // Send first ping immediately
  debugLog("Sending initial auto ping");
  sendPing(false).catch(console.error);
}

// ---- BLE connect / disconnect ----
async function connect() {
  debugLog("connect() called");
  if (!("bluetooth" in navigator)) {
    debugError("Web Bluetooth not supported");
    alert("Web Bluetooth not supported in this browser.");
    return;
  }
  connectBtn.disabled = true;
  setStatus("Connecting…", "text-sky-300");

  try {
    debugLog("Opening BLE connection...");
    const conn = await WebBleConnection.open();
    state.connection = conn;
    debugLog("BLE connection object created");

    conn.on("connected", async () => {
      debugLog("BLE connected event fired");
      setStatus("Connected", "text-emerald-300");
      setConnectButton(true);
      connectBtn.disabled = false;
      const selfInfo = await conn.getSelfInfo();
      debugLog(`Device info: ${selfInfo?.name || "[No device]"}`);
      deviceInfoEl.textContent = selfInfo?.name || "[No device]";
      updateAutoButton();
      try { 
        await conn.syncDeviceTime?.(); 
        debugLog("Device time synced");
      } catch { 
        debugLog("Device time sync not available or failed");
      }
      try {
        await ensureChannel();
        await primeGpsOnce();
      } catch (e) {
        debugError(`Channel setup failed: ${e.message}`, e);
        setStatus(e.message || "Channel setup failed", "text-red-300");
      }
    });

    conn.on("disconnected", () => {
      debugLog("BLE disconnected event fired");
      setStatus("Disconnected", "text-red-300");
      setConnectButton(false);
      deviceInfoEl.textContent = "—";
      state.connection = null;
      state.channel = null;
      stopAutoPing(true); // Ignore cooldown check on disconnect
      enableControls(false);
      updateAutoButton();
      stopGeoWatch();
      stopGpsAgeUpdater(); // Ensure age updater stops
      
      // Clean up timers
      if (state.meshMapperTimer) {
        debugLog("Clearing MeshMapper timer on disconnect");
        clearTimeout(state.meshMapperTimer);
        state.meshMapperTimer = null;
      }
      if (state.cooldownUpdateTimer) {
        debugLog("Clearing cooldown timer on disconnect");
        clearTimeout(state.cooldownUpdateTimer);
        state.cooldownUpdateTimer = null;
      }
      stopAutoCountdown();
      stopApiCountdown();
      state.cooldownEndTime = null;
      
      state.lastFix = null;
      state.gpsState = "idle";
      updateGpsUi();
      debugLog("Disconnect cleanup complete");
    });

  } catch (e) {
    debugError(`BLE connection failed: ${e.message}`, e);
    setStatus("Failed to connect", "text-red-300");
    connectBtn.disabled = false;
  }
}
async function disconnect() {
  debugLog("disconnect() called");
  if (!state.connection) {
    debugLog("No connection to disconnect");
    return;
  }

  connectBtn.disabled = true;
  setStatus("Disconnecting...", "text-sky-300");

  try {
    // WebBleConnection typically exposes one of these.
    if (typeof state.connection.close === "function") {
      debugLog("Calling connection.close()");
      await state.connection.close();
    } else if (typeof state.connection.disconnect === "function") {
      debugLog("Calling connection.disconnect()");
      await state.connection.disconnect();
    } else if (typeof state.connection.device?.gatt?.disconnect === "function") {
      debugLog("Calling device.gatt.disconnect()");
      state.connection.device.gatt.disconnect();
    } else {
      debugWarn("No known disconnect method on connection object");
    }
  } catch (e) {
    debugError(`BLE disconnect failed: ${e.message}`, e);
    setStatus(e.message || "Disconnect failed", "text-red-300");
  } finally {
    connectBtn.disabled = false;
  }
}


// ---- Page visibility ----
document.addEventListener("visibilitychange", async () => {
  if (document.hidden) {
    debugLog("Page visibility changed to hidden");
    if (state.running) {
      debugLog("Stopping auto ping due to page hidden");
      stopAutoPing(true); // Ignore cooldown check when page is hidden
      setStatus("Lost focus, auto mode stopped", "text-amber-300");
    } else {
      debugLog("Releasing wake lock due to page hidden");
      releaseWakeLock();
    }
  } else {
    debugLog("Page visibility changed to visible");
    // On visible again, user can manually re-start Auto.
  }
});

// ---- Bind UI & init ----
export async function onLoad() {
  debugLog("wardrive.js onLoad() called - initializing");
  setStatus("Disconnected", "text-red-300");
  enableControls(false);
  updateAutoButton();

  connectBtn.addEventListener("click", async () => {
    try {
      if (state.connection) {
        await disconnect();
      } else {
        await connect();
      }
    } catch (e) {
      debugError(`Connection button error: ${e.message}`, e);
      setStatus(e.message || "Connection error", "text-red-300");
    }
  });
  sendPingBtn.addEventListener("click", () => {
    debugLog("Manual ping button clicked");
    sendPing(true).catch(console.error);
  });
  autoToggleBtn.addEventListener("click", () => {
    debugLog("Auto toggle button clicked");
    if (state.running) {
      stopAutoPing();
      setStatus("Auto mode stopped", "text-slate-300");
    } else {
      startAutoPing();
    }
  });

  // Prompt location permission early (optional)
  debugLog("Requesting initial location permission");
  try { 
    await getCurrentPosition(); 
    debugLog("Initial location permission granted");
  } catch (e) { 
    debugLog(`Initial location permission not granted: ${e.message}`);
  }
  debugLog("wardrive.js initialization complete");
}

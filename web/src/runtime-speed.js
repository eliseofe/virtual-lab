const scientificTime = document.querySelector("#scientific-time");
const runState = document.querySelector("#run-state");
const requestedSpeed = document.querySelector("#simulation-speed");
const actualSpeed = document.querySelector("#actual-simulation-speed");

if (!scientificTime || !runState || !requestedSpeed || !actualSpeed) {
  throw new Error("Runtime speed meter UI mismatch.");
}

let lastWallMs = null;
let lastModelSeconds = null;
let smoothedFactor = null;

function resetMeasurement() {
  lastWallMs = null;
  lastModelSeconds = null;
  smoothedFactor = null;
  actualSpeed.textContent = "—";
}

function sampleMeasurement() {
  if (runState.textContent !== "Running") return;

  const modelSeconds = Number(scientificTime.textContent);
  if (!Number.isFinite(modelSeconds)) return;

  const wallMs = performance.now();
  if (lastWallMs !== null && lastModelSeconds !== null) {
    const modelDelta = modelSeconds - lastModelSeconds;
    const wallDeltaSeconds = (wallMs - lastWallMs) / 1000;

    if (modelDelta < 0) {
      resetMeasurement();
    } else if (modelDelta > 0 && wallDeltaSeconds > 0) {
      const instantaneousFactor = modelDelta / wallDeltaSeconds;
      smoothedFactor = smoothedFactor === null
        ? instantaneousFactor
        : smoothedFactor * 0.75 + instantaneousFactor * 0.25;
      actualSpeed.textContent = `${smoothedFactor.toFixed(smoothedFactor >= 10 ? 1 : 2)}×`;
    }
  }

  lastWallMs = wallMs;
  lastModelSeconds = modelSeconds;
}

new MutationObserver(sampleMeasurement).observe(scientificTime, { childList: true, characterData: true, subtree: true });
new MutationObserver(() => {
  if (runState.textContent !== "Running") resetMeasurement();
}).observe(runState, { childList: true, characterData: true, subtree: true });
requestedSpeed.addEventListener("input", resetMeasurement);

resetMeasurement();

// Registry integration is additive. A CDN/auth outage must not block the core
// simulator or its runtime-speed controls from starting.
import("./registry-ui.js").catch((error) => {
  console.error("Registry UI failed to load:", error);
});

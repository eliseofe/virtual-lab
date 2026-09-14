import { RuntimeRateMeter, formatRuntimeFactor } from "./runtime/rate-meter.js";

const scientificTime = document.querySelector("#scientific-time");
const runState = document.querySelector("#run-state");
const requestedSpeed = document.querySelector("#simulation-speed");
const actualSpeed = document.querySelector("#actual-simulation-speed");

if (!scientificTime || !runState || !requestedSpeed || !actualSpeed) {
  throw new Error("Runtime speed meter UI mismatch.");
}

const meter = new RuntimeRateMeter({ minElapsedMs: 250 });

function currentModelSeconds() {
  const value = Number(scientificTime.textContent);
  return Number.isFinite(value) ? value : null;
}

function resetMeasurement() {
  meter.reset();
  actualSpeed.textContent = "—";
}

function startMeasurement() {
  const modelSeconds = currentModelSeconds();
  if (modelSeconds === null) {
    resetMeasurement();
    return;
  }
  meter.start(performance.now(), modelSeconds);
  actualSpeed.textContent = "—";
}

function sampleMeasurement() {
  if (runState.textContent !== "Running") return;

  const modelSeconds = currentModelSeconds();
  if (modelSeconds === null) return;

  const factor = meter.sample(performance.now(), modelSeconds);
  if (factor !== null) actualSpeed.textContent = formatRuntimeFactor(factor);
}

new MutationObserver(sampleMeasurement).observe(scientificTime, { childList: true, characterData: true, subtree: true });
new MutationObserver(() => {
  if (runState.textContent === "Running") startMeasurement();
  else resetMeasurement();
}).observe(runState, { childList: true, characterData: true, subtree: true });
requestedSpeed.addEventListener("input", () => {
  if (runState.textContent === "Running") startMeasurement();
  else resetMeasurement();
});

resetMeasurement();

// Registry integration is additive. A CDN/auth outage must not block the core
// simulator or its runtime-speed controls from starting. The Professor inbox is
// a second additive layer and may fail independently without disabling the
// ordinary Experiment registry.
import("./registry-ui-v3.js").then(() => {
  import("./professor-inbox.js").catch((error) => {
    console.error("Professor inbox failed to load:", error);
  });
}).catch((error) => {
  console.error("Registry UI failed to load:", error);
});

import { RuntimeRateMeter } from "./runtime/rate-meter.js";
import { runtimeModel } from "./runtime/runtime-model.js";
import { formatActualSpeed, formatScientificTime } from "./runtime/runtime-format.js";

const scientificTime = document.querySelector("#scientific-time");
const runState = document.querySelector("#run-state");
const requestedSpeed = document.querySelector("#simulation-speed");
const actualSpeed = document.querySelector("#actual-simulation-speed");

if (!scientificTime || !runState || !requestedSpeed || !actualSpeed) {
  throw new Error("Runtime speed meter UI mismatch.");
}

// The measured speed is derived from the runtime model (#560), never from the
// displayed text. It reads scientific time at the displayed precision
// (milliseconds), as it always has, so the measured factor is unchanged.
const meter = new RuntimeRateMeter({ minElapsedMs: 250 });

function isRunning() {
  return runtimeModel.get().runState === "running";
}

function currentModelSeconds() {
  const value = Number(formatScientificTime(runtimeModel.get().scientificTime));
  return Number.isFinite(value) ? value : null;
}

function showActualSpeed(factor) {
  runtimeModel.set({ actualSpeed: factor });
  actualSpeed.textContent = formatActualSpeed(runtimeModel.get().actualSpeed);
}

function resetMeasurement() {
  meter.reset();
  showActualSpeed(null);
}

function startMeasurement() {
  const modelSeconds = currentModelSeconds();
  if (modelSeconds === null) {
    resetMeasurement();
    return;
  }
  meter.start(performance.now(), modelSeconds);
  showActualSpeed(null);
}

function sampleMeasurement() {
  if (!isRunning()) return;

  const modelSeconds = currentModelSeconds();
  if (modelSeconds === null) return;

  const factor = meter.sample(performance.now(), modelSeconds);
  if (factor !== null) showActualSpeed(factor);
}

function restartOrReset() {
  if (isRunning()) startMeasurement();
  else resetMeasurement();
}

// React to each write of scientific time and run state after the current task
// step, time first: the same moment and order in which the page-text observers
// this replaces used to fire.
let timeWritten = false;
let runStateWritten = false;
let flushQueued = false;

function flush() {
  flushQueued = false;
  const sample = timeWritten;
  const restart = runStateWritten;
  timeWritten = false;
  runStateWritten = false;
  if (sample) sampleMeasurement();
  if (restart) restartOrReset();
}

runtimeModel.subscribe((_state, written) => {
  if (written.includes("scientificTime")) timeWritten = true;
  if (written.includes("runState")) runStateWritten = true;
  if ((timeWritten || runStateWritten) && !flushQueued) {
    flushQueued = true;
    queueMicrotask(flush);
  }
});
requestedSpeed.addEventListener("input", restartOrReset);

resetMeasurement();

// Registry integration is additive. A CDN/auth outage must not block the core
// simulator or its runtime-speed controls from starting. Professor surfaces are
// additional layers and may fail independently without disabling the ordinary
// Experiment registry or simulator.
import("./registry-ui-v3.js").then(() => {
  import("./professor-inbox.js").then(() => {
    import("./professor-development-links.js").catch((error) => {
      console.error("Professor development links failed to load:", error);
    });
  }).catch((error) => {
    console.error("Professor inbox failed to load:", error);
  });
}).catch((error) => {
  console.error("Registry UI failed to load:", error);
});

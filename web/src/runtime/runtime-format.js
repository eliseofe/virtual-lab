// How the runtime model is displayed (#560). These reproduce, exactly, the text
// the page has always shown for each value.

import { formatRuntimeFactor } from "./rate-meter.js";

const RUN_STATE_LABELS = Object.freeze({
  initializing: "Initializing",
  running: "Running",
  paused: "Paused",
});

export function formatRunState(runState) {
  return RUN_STATE_LABELS[runState];
}

export function formatSeed(seed) {
  return String(seed >>> 0);
}

export function formatScientificTime(scientificTime) {
  return scientificTime.toFixed(3);
}

export function formatCount(count) {
  return String(count);
}

export function formatActualSpeed(actualSpeed) {
  return actualSpeed === null ? "—" : formatRuntimeFactor(actualSpeed);
}

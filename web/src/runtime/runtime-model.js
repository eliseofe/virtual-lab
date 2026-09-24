// The simulation's runtime model (#560, #562): the one place that holds what
// the simulator is doing and which commands are available. main.js is its only writer (from the worker's messages)
// and the runtime-speed meter writes the measured speed; views subscribe to it
// instead of reading each other's text.
//
// This module must exist exactly once in the page: the React bundle imports it
// as an external module at the same URL as main.js (see vite.config.ts), and
// verify-dist checks that it is not inlined.

export const RUNTIME_INITIAL_STATE = Object.freeze({
  runState: "initializing", // "initializing" | "running" | "paused"
  seed: 2026,
  scientificTime: 0,
  physicsTicks: 0,
  controlUpdates: 0,
  actualSpeed: null, // measured model-seconds per wall-second, or null when not measured
  requestedSpeed: 20, // the execution-speed multiplier asked for
  glyph: "directional", // how agents are drawn: "directional" | "arrow" | "dot"
  camera: Object.freeze({ label: "Fit", fit: true }),
  // Which simulation commands are available right now (#562).
  controls: Object.freeze({ run: false, pause: false, restart: false, newSeed: false, speed: true, fit: false }),
});

export function createRuntimeModel(initialState = RUNTIME_INITIAL_STATE) {
  let state = Object.freeze({ ...initialState });
  const listeners = new Set();
  return {
    get() {
      return state;
    },
    // Writes the given fields and notifies every listener with the new state
    // and the names of the fields written, including fields rewritten with an
    // unchanged value: listeners react to each write, as observers of the
    // rewritten page text did.
    set(patch) {
      const written = Object.keys(patch);
      if (!written.length) return;
      state = Object.freeze({ ...state, ...patch });
      for (const listener of [...listeners]) listener(state, written);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const runtimeModel = createRuntimeModel();

// The simulation controller's commands (#562). main.js, which owns the
// simulator, provides them; every view (the React panel, the legacy buttons,
// and modules that start or pause a run) calls them instead of clicking another
// view's buttons. Like the runtime model, this module must exist once in the
// page (see vite.config.ts and verify-dist).

let provided = null;

export function provideSimulationCommands(commands) {
  provided = commands;
}

// Before the simulator has provided its commands, calling one does nothing,
// like pressing a button that is not there yet.
export const simulationCommands = Object.freeze({
  run: () => provided?.run(),
  pause: () => provided?.pause(),
  restart: () => provided?.restart(),
  restartWithNewSeed: () => provided?.restartWithNewSeed(),
  fitArena: () => provided?.fitArena(),
  setSpeed: (value) => provided?.setSpeed(value),
  setGlyph: (value) => provided?.setGlyph(value),
});

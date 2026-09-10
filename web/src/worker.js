let simulation = null;
let wasm = null;

function emitSnapshot(type) {
  const xy = simulation.snapshot_xy();
  self.postMessage({
    type,
    physicsTicks: simulation.physics_ticks(),
    controlUpdates: simulation.control_updates(),
    scientificTime: simulation.scientific_time(),
    agentCount: xy.length / 2,
    xy,
  });
}

async function initialize() {
  const moduleUrl = new URL("./wasm/vlab_kernel.js", import.meta.url).href;
  wasm = await import(moduleUrl);
  await wasm.default();
  simulation = new wasm.ProbeSimulation(2026, 32);
  self.postMessage({ type: "ready", kernelVersion: wasm.kernel_version() });
  emitSnapshot("snapshot");
}

self.addEventListener("message", (event) => {
  if (!simulation) return;
  if (event.data?.type === "advance") {
    const ticks = Math.max(0, Math.trunc(Number(event.data.ticks ?? 1)));
    simulation.advance_ticks(ticks);
    emitSnapshot("advanced");
  }
  if (event.data?.type === "reset") {
    simulation.reset();
    emitSnapshot("reset");
  }
});

initialize().catch((error) => {
  self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
});

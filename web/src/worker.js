let simulation = null;
let wasm = null;
let wasmReady = false;

function emitSnapshot(type) {
  if (!simulation) return;
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

async function loadWasm() {
  const moduleUrl = new URL("./wasm/vlab_kernel.js", import.meta.url).href;
  wasm = await import(moduleUrl);
  await wasm.default();
  wasmReady = true;
  self.postMessage({ type: "wasm-ready", kernelVersion: wasm.kernel_version() });
}

self.addEventListener("message", (event) => {
  const message = event.data ?? {};
  if (!wasmReady) {
    self.postMessage({ type: "error", message: "WASM kernel is still loading" });
    return;
  }

  try {
    if (message.type === "initialize") {
      simulation = new wasm.ProbeSimulation(
        Number(message.seed ?? 2026),
        Number(message.agentCount ?? 32),
        JSON.stringify(message.ir),
        JSON.stringify(message.parameters ?? {}),
      );
      self.postMessage({ type: "ready", kernelVersion: wasm.kernel_version() });
      emitSnapshot("snapshot");
      return;
    }

    if (!simulation) {
      self.postMessage({ type: "error", message: "simulation has not been initialized" });
      return;
    }

    if (message.type === "apply-controller") {
      simulation.set_controller(JSON.stringify(message.ir), JSON.stringify(message.parameters ?? {}));
      emitSnapshot("controller-applied");
      return;
    }
    if (message.type === "advance") {
      const ticks = Math.max(0, Math.trunc(Number(message.ticks ?? 1)));
      simulation.advance_ticks(ticks);
      emitSnapshot("advanced");
      return;
    }
    if (message.type === "reset") {
      simulation.reset();
      emitSnapshot("reset");
    }
  } catch (error) {
    self.postMessage({
      type: "controller-runtime-error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

loadWasm().catch((error) => {
  self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
});

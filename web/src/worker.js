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

function initializationValues(initialization = {}) {
  return {
    seed: Number(initialization.seed ?? 2026),
    agentCount: Number(initialization.agentCount ?? 32),
    extent: Number(initialization.extent ?? 2.0),
  };
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
      const initialization = initializationValues(message.initialization);
      simulation = new wasm.ProbeSimulation(
        initialization.seed,
        initialization.agentCount,
        initialization.extent,
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

    if (message.type === "apply-initialization") {
      const initialization = initializationValues(message.initialization);
      simulation.set_initialization(
        initialization.seed,
        initialization.agentCount,
        initialization.extent,
      );
      emitSnapshot("initialization-applied");
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
      type: message.type === "apply-initialization" ? "initialization-error" : "controller-runtime-error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

loadWasm().catch((error) => {
  self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
});

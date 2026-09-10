let kernel = null;
let wasm = null;

async function initialize() {
  const moduleUrl = new URL("./wasm/vlab_kernel.js", import.meta.url).href;
  wasm = await import(moduleUrl);
  await wasm.default();
  kernel = new wasm.ProbeKernel(0.1);
  self.postMessage({
    type: "ready",
    kernelVersion: wasm.kernel_version(),
    scientificTime: kernel.scientific_time(),
  });
}

self.addEventListener("message", (event) => {
  if (!kernel) return;
  if (event.data?.type === "advance") {
    const ticks = Number(event.data.ticks ?? 1);
    const scientificTime = kernel.advance_ticks(ticks);
    self.postMessage({ type: "advanced", ticks: kernel.physics_ticks(), scientificTime });
  }
  if (event.data?.type === "reset") {
    kernel.reset();
    self.postMessage({ type: "reset", ticks: kernel.physics_ticks(), scientificTime: kernel.scientific_time() });
  }
});

initialize().catch((error) => {
  self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
});

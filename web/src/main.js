import { compileController } from "./controller/compiler.js";

const parameterTypes = {
  V0: "scalar",
  ALPHA: "scalar",
  BETA: "scalar",
  K: "scalar",
  L: "scalar",
};

const parameterValues = {
  V0: 0.12,
  ALPHA: 0.003,
  BETA: 0.08,
  K: 0.1,
  L: 1.0,
};

const referenceSource = `class LocalSpringAgent(Agent):
    def step(self, obs):
        force = Vec2(0.0, 0.0)
        for neighbour in obs.neighbours:
            displacement = neighbour.relative_position
            distance = norm(displacement)
            force += K * (distance - L) * displacement / distance
        forward = V0 + ALPHA * dot(force, obs.heading)
        turning = BETA * dot(force, perpendicular(obs.heading))
        return Motion(forward, turning)
`;

const status = document.querySelector("#worker-status");
const time = document.querySelector("#scientific-time");
const detail = document.querySelector("#kernel-detail");
const source = document.querySelector("#controller-source");
const ir = document.querySelector("#controller-ir");
const error = document.querySelector("#compile-error");
const advance = document.querySelector("#advance");
const reset = document.querySelector("#reset");
const compile = document.querySelector("#compile");
source.value = referenceSource;

let wasmReady = false;
let initialized = false;
const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

function compileSource() {
  const compiled = compileController(source.value, { parameters: parameterTypes });
  ir.textContent = JSON.stringify(compiled, null, 2);
  return compiled;
}

function initializeIfReady() {
  if (!wasmReady || initialized) return;
  try {
    const compiled = compileSource();
    error.textContent = "";
    worker.postMessage({
      type: "initialize",
      seed: 2026,
      agentCount: 32,
      ir: compiled,
      parameters: parameterValues,
    });
    initialized = true;
  } catch (e) {
    error.textContent = e instanceof Error ? e.message : String(e);
  }
}

worker.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "wasm-ready") {
    wasmReady = true;
    status.textContent = `WASM loaded · kernel ${message.kernelVersion} · compiling controller…`;
    initializeIfReady();
  } else if (message.type === "ready") {
    status.textContent = `WASM worker ready · compiled controller active · kernel ${message.kernelVersion}`;
    status.dataset.state = "ready";
    advance.disabled = false;
    reset.disabled = false;
    compile.disabled = false;
  } else if (["snapshot", "advanced", "reset", "controller-applied"].includes(message.type)) {
    time.textContent = message.scientificTime.toFixed(3);
    detail.textContent = `${message.agentCount} agents · ${message.physicsTicks} physics ticks · ${message.controlUpdates} control updates`;
    if (message.type === "controller-applied") {
      status.textContent = "Controller compiled to executable Rust bytecode · run reset cleanly";
      status.dataset.state = "ready";
    }
  } else if (message.type === "controller-runtime-error") {
    error.textContent = `runtime-initialization: ${message.message}`;
  } else if (message.type === "error") {
    status.textContent = `Worker error: ${message.message}`;
    status.dataset.state = "error";
  }
});

compile.addEventListener("click", () => {
  try {
    const compiled = compileSource();
    error.textContent = "";
    worker.postMessage({ type: "apply-controller", ir: compiled, parameters: parameterValues });
  } catch (e) {
    error.textContent = e instanceof Error ? e.message : String(e);
  }
});

advance.addEventListener("click", () => worker.postMessage({ type: "advance", ticks: 10 }));
reset.addEventListener("click", () => worker.postMessage({ type: "reset" }));

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

const defaultInitialization = {
  seed: 2026,
  agentCount: 32,
  extent: 2.0,
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

const ui = {
  status: document.querySelector("#worker-status"),
  runState: document.querySelector("#run-state"),
  time: document.querySelector("#scientific-time"),
  physicsTicks: document.querySelector("#physics-ticks"),
  controlUpdates: document.querySelector("#control-updates"),
  source: document.querySelector("#controller-source"),
  ir: document.querySelector("#controller-ir"),
  error: document.querySelector("#compile-error"),
  feedback: document.querySelector("#compile-feedback"),
  initializationState: document.querySelector("#initialization-state"),
  initializationError: document.querySelector("#initialization-error"),
  initializationSeed: document.querySelector("#initialization-seed"),
  initializationAgentCount: document.querySelector("#initialization-agent-count"),
  initializationExtent: document.querySelector("#initialization-extent"),
  applyInitialization: document.querySelector("#apply-initialization"),
  run: document.querySelector("#run"),
  pause: document.querySelector("#pause"),
  restart: document.querySelector("#restart"),
  compile: document.querySelector("#compile"),
  canvas: document.querySelector("#simulation-canvas"),
  canvasEmpty: document.querySelector("#canvas-empty"),
};

ui.source.value = referenceSource;
ui.initializationSeed.value = String(defaultInitialization.seed);
ui.initializationAgentCount.value = String(defaultInitialization.agentCount);
ui.initializationExtent.value = String(defaultInitialization.extent);

let wasmReady = false;
let initialized = false;
let running = false;
let advancePending = false;
let latestXY = [];
let currentCompiled = null;
let appliedInitialization = { ...defaultInitialization };
let pendingInitialization = null;
let runTimer = null;

const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

function setFeedback(message, state = "idle") {
  ui.feedback.textContent = message;
  ui.feedback.dataset.state = state;
}

function compileSource() {
  const compiled = compileController(ui.source.value, { parameters: parameterTypes });
  ui.ir.textContent = JSON.stringify(compiled, null, 2);
  return compiled;
}

function readInitialization() {
  const seed = Number(ui.initializationSeed.value);
  const agentCount = Number(ui.initializationAgentCount.value);
  const extent = Number(ui.initializationExtent.value);

  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error("Seed must be an integer between 0 and 4294967295.");
  }
  if (!Number.isInteger(agentCount) || agentCount < 1 || agentCount > 0xffffffff) {
    throw new Error("Agent count must be a positive integer.");
  }
  if (!Number.isFinite(extent) || extent <= 0) {
    throw new Error("Extent must be finite and positive.");
  }

  return { seed, agentCount, extent };
}

function setControlsEnabled(enabled) {
  ui.run.disabled = !enabled || running;
  ui.pause.disabled = !enabled || !running;
  ui.restart.disabled = !enabled;
  ui.compile.disabled = !enabled;
  ui.applyInitialization.disabled = !enabled;
}

function setRunning(next) {
  running = next;
  ui.runState.textContent = running ? "Running" : "Paused";
  setControlsEnabled(initialized);
  if (runTimer) {
    clearInterval(runTimer);
    runTimer = null;
  }
  if (running) {
    runTimer = setInterval(() => {
      if (!advancePending) {
        advancePending = true;
        worker.postMessage({ type: "advance", ticks: 5 });
      }
    }, 50);
  }
}

function initializeIfReady() {
  if (!wasmReady || initialized) return;
  try {
    currentCompiled = compileSource();
    ui.error.textContent = "";
    ui.initializationError.textContent = "";
    setFeedback("Reference controller compiled successfully.", "success");
    worker.postMessage({
      type: "initialize",
      initialization: appliedInitialization,
      ir: currentCompiled,
      parameters: parameterValues,
    });
    initialized = true;
  } catch (error) {
    ui.error.textContent = error instanceof Error ? error.message : String(error);
    setFeedback("Controller compilation failed.", "error");
  }
}

function updateSnapshot(message) {
  if (Array.isArray(message.xy) || ArrayBuffer.isView(message.xy)) {
    latestXY = Array.from(message.xy);
    ui.canvasEmpty.hidden = latestXY.length > 0;
  }
  ui.time.textContent = Number(message.scientificTime ?? 0).toFixed(3);
  ui.physicsTicks.textContent = String(message.physicsTicks ?? 0);
  ui.controlUpdates.textContent = String(message.controlUpdates ?? 0);
  advancePending = false;
}

function drawSnapshot() {
  const canvas = ui.canvas;
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * ratio));
  const height = Math.max(1, Math.floor(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#f7f9fa";
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "#e1e6e9";
  context.lineWidth = ratio;
  const step = 48 * ratio;
  for (let x = step; x < width; x += step) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = step; y < height; y += step) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  if (latestXY.length >= 2) {
    const xs = [];
    const ys = [];
    for (let i = 0; i < latestXY.length; i += 2) {
      xs.push(latestXY[i]);
      ys.push(latestXY[i + 1]);
    }
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const pad = 54 * ratio;
    const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    context.fillStyle = "#1c4e63";
    for (let i = 0; i < latestXY.length; i += 2) {
      const x = width / 2 + (latestXY[i] - centerX) * scale;
      const y = height / 2 - (latestXY[i + 1] - centerY) * scale;
      context.beginPath();
      context.arc(x, y, 4.2 * ratio, 0, Math.PI * 2);
      context.fill();
    }
  }
  requestAnimationFrame(drawSnapshot);
}

worker.addEventListener("message", (event) => {
  const message = event.data ?? {};
  if (message.type === "wasm-ready") {
    wasmReady = true;
    ui.status.textContent = `Kernel ${message.kernelVersion} loaded · compiling controller…`;
    initializeIfReady();
    return;
  }

  if (message.type === "ready") {
    ui.status.textContent = `Kernel ${message.kernelVersion} ready`;
    ui.status.dataset.state = "ready";
    ui.runState.textContent = "Paused";
    ui.initializationState.textContent = "Applied";
    setControlsEnabled(true);
    return;
  }

  if (["snapshot", "advanced", "reset", "controller-applied", "initialization-applied"].includes(message.type)) {
    updateSnapshot(message);
    if (message.type === "controller-applied") {
      ui.status.textContent = "Controller active · run restarted with applied swarm initialization";
      ui.status.dataset.state = "ready";
      setFeedback("Controller compiled and applied. Run restarted cleanly.", "success");
      setRunning(false);
    } else if (message.type === "initialization-applied") {
      if (pendingInitialization) {
        appliedInitialization = pendingInitialization;
        pendingInitialization = null;
      }
      ui.initializationError.textContent = "";
      ui.initializationState.textContent = "Applied";
      ui.status.textContent = "Swarm initialization applied · run restarted";
      ui.status.dataset.state = "ready";
      setRunning(false);
    } else if (message.type === "reset") {
      setRunning(false);
    }
    return;
  }

  if (message.type === "initialization-error") {
    advancePending = false;
    pendingInitialization = null;
    ui.initializationState.textContent = "Invalid";
    ui.initializationError.textContent = message.message;
    setRunning(false);
    return;
  }

  if (message.type === "controller-runtime-error") {
    advancePending = false;
    ui.error.textContent = `runtime-initialization: ${message.message}`;
    setFeedback("Controller runtime initialization failed; previous valid controller remains recoverable.", "error");
    setRunning(false);
    return;
  }

  if (message.type === "error") {
    advancePending = false;
    ui.status.textContent = `Worker error: ${message.message}`;
    ui.status.dataset.state = "error";
    setRunning(false);
  }
});

ui.compile.addEventListener("click", () => {
  try {
    const compiled = compileSource();
    ui.error.textContent = "";
    currentCompiled = compiled;
    setFeedback("Compilation passed. Applying controller…", "working");
    worker.postMessage({ type: "apply-controller", ir: compiled, parameters: parameterValues });
  } catch (error) {
    ui.error.textContent = error instanceof Error ? error.message : String(error);
    setFeedback("Compilation failed. Current valid controller was not replaced.", "error");
  }
});

ui.source.addEventListener("input", () => {
  ui.error.textContent = "";
  setFeedback("Controller source modified. Apply to compile and restart.", "dirty");
});

for (const field of [ui.initializationSeed, ui.initializationAgentCount, ui.initializationExtent]) {
  field.addEventListener("input", () => {
    ui.initializationError.textContent = "";
    ui.initializationState.textContent = "Modified";
  });
}

ui.applyInitialization.addEventListener("click", () => {
  try {
    const initialization = readInitialization();
    ui.initializationError.textContent = "";
    ui.initializationState.textContent = "Applying…";
    pendingInitialization = initialization;
    setRunning(false);
    worker.postMessage({ type: "apply-initialization", initialization });
  } catch (error) {
    pendingInitialization = null;
    ui.initializationState.textContent = "Invalid";
    ui.initializationError.textContent = error instanceof Error ? error.message : String(error);
  }
});

ui.run.addEventListener("click", () => setRunning(true));
ui.pause.addEventListener("click", () => setRunning(false));
ui.restart.addEventListener("click", () => {
  setRunning(false);
  worker.postMessage({ type: "reset" });
});

requestAnimationFrame(drawSnapshot);

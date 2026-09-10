import { compileController } from "./controller/compiler.js";

const referenceSource = `class ActiveElasticAgent(Agent):
    def step(self, obs):
        force = Vec2(0.0, 0.0)
        for neighbour in obs.neighbours:
            displacement = neighbour.relative_position
            force += spring(displacement)
        forward = V0 + ALPHA * dot(force, obs.heading)
        turning = BETA * dot(force, perpendicular(obs.heading))
        return Motion(forward, turning)
`;

const status = document.querySelector("#worker-status");
const time = document.querySelector("#scientific-time");
const source = document.querySelector("#controller-source");
const ir = document.querySelector("#controller-ir");
const error = document.querySelector("#compile-error");
const advance = document.querySelector("#advance");
const reset = document.querySelector("#reset");
const compile = document.querySelector("#compile");
source.value = referenceSource;

const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
worker.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "ready") {
    status.textContent = `WASM worker ready · kernel ${message.kernelVersion}`;
    status.dataset.state = "ready";
    time.textContent = message.scientificTime.toFixed(3);
    advance.disabled = false;
    reset.disabled = false;
  } else if (message.type === "advanced" || message.type === "reset") {
    time.textContent = message.scientificTime.toFixed(3);
  } else if (message.type === "error") {
    status.textContent = `Worker error: ${message.message}`;
    status.dataset.state = "error";
  }
});

compile.addEventListener("click", () => {
  try {
    const compiled = compileController(source.value);
    error.textContent = "";
    ir.textContent = JSON.stringify(compiled, null, 2);
  } catch (e) {
    error.textContent = e instanceof Error ? e.message : String(e);
  }
});

advance.addEventListener("click", () => worker.postMessage({ type: "advance", ticks: 10 }));
reset.addEventListener("click", () => worker.postMessage({ type: "reset" }));
compile.click();

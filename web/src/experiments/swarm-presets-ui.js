import { swarmExperiment } from "./swarm-vs-swarm.js";
const launcher = document.createElement("button");
launcher.type = "button";
launcher.textContent = "Swarm vs Swarm";
launcher.id = "swarm-presets";
(document.querySelector(".utility-launchers") ?? document.body).append(
  launcher,
);
const dialog = document.createElement("dialog");
dialog.setAttribute("aria-label", "Swarm vs Swarm experiments");
dialog.innerHTML = `<form method="dialog" style="display:grid;gap:12px;min-width:280px;max-width:400px">
<h2>Swarm vs Swarm</h2>
<label>Experiment <select name="variant"><option value="2:1">2D · Baseline</option><option value="2:2">2D · Target, no defender response</option><option value="2:3">2D · Target, responding defenders</option><option value="3:1">3D · Laboratory</option></select></label>
<label>Attackers <input name="attackers" type="number" min="1" max="200" value="20" required></label>
<label>Defenders <input name="defenders" type="number" min="1" max="200" value="30" required></label>
<label>Sensing range <input name="range" type="number" min="0.1" step="0.1" value="3" required></label>
<p>DM controller · capture distance 0.5 · random headings · 1500 s. Laboratory distances use the 0.3 scale; there is no target.</p>
<p role="status"></p><button type="submit">Load experiment</button><button type="button" data-close>Cancel</button></form>`;
document.body.append(dialog);
const form = dialog.querySelector("form"),
  status = dialog.querySelector("[role=status]");
launcher.addEventListener("click", () => dialog.showModal());
dialog
  .querySelector("[data-close]")
  .addEventListener("click", () => dialog.close());
form.elements.variant.addEventListener("change", () => {
  const lab = form.elements.variant.value.startsWith("3");
  form.elements.attackers.value = lab ? 5 : 20;
  form.elements.defenders.value = lab ? 4 : 30;
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const [dimension, caseNumber] = form.elements.variant.value
      .split(":")
      .map(Number);
    const experiment = swarmExperiment({
      dimension,
      caseNumber,
      attackers: Number(form.elements.attackers.value),
      defenders: Number(form.elements.defenders.value),
      range: Number(form.elements.range.value),
    });
    document.dispatchEvent(
      new CustomEvent("vlab:load-swarm-preset", { detail: experiment }),
    );
    dialog.close();
    status.textContent = "";
  } catch (error) {
    status.textContent = error.message;
  }
});

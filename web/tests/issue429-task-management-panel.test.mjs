import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [react, management, simulation, onboarding, index, collection] = await Promise.all([
  readFile(new URL("../src/react-migration-root.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/experiment-management.js", import.meta.url), "utf8"),
  readFile(new URL("../src/simulation-react-presentation.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/student-onboarding.js", import.meta.url), "utf8"),
  readFile(new URL("../src/index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/collection-organization.js", import.meta.url), "utf8"),
]);

test("#429 global ribbon is product identity plus Simulation, Authoring, Help and Account", () => {
  assert.match(react, />Virtual Lab</);
  assert.match(react, /Eliseo Ferrante/);
  assert.match(react, /Swarm robotics/);
  assert.match(react, /data-vlab-nav="simulation">Simulation/);
  assert.match(react, /data-vlab-nav="authoring">Authoring/);
  assert.match(react, /data-vlab-nav="account"/);
  assert.match(onboarding, /"data-vlab-nav": "help"/);
  assert.match(react, /data-vlab-nav="help-mobile">Help/);
  assert.match(react, /proxyClick\('\[data-vlab-nav="help"\]'\)/);
  assert.doesNotMatch(react, /data-vlab-nav="experiment"|data-vlab-nav="results"|data-vlab-nav="showcase"|data-vlab-nav="professor"/);
  assert.doesNotMatch(react, /data-vlab-current-experiment|data-vlab-worker-status/);
});

test("#429 navigation lands on precise Simulation and Authoring anchors", () => {
  assert.match(index, /id="simulation" class="panel stage-panel"/);
  assert.match(react, /scrollTo\('#simulation'\)/);
  assert.match(react, /scrollTo\('#authoring-workbench'\)/);
  assert.doesNotMatch(react, /scrollTo\('#live-results'\)|scrollTo\('\.experiment-panel'\)/);
});

test("#429 Experiment management is one named task-based control panel", () => {
  assert.match(management, /title\.textContent = "Control panel"/);
  assert.match(management, /taskHeading\("Current Experiment"/);
  assert.match(management, /taskHeading\("Revisions"/);
  assert.match(management, /taskHeading\("Save & share"/);
  assert.match(management, /experiment-control-grid/);
  assert.match(management, /experiment-task-card/);
  assert.match(management, /setText\(browseButton, "Experiments"\)/);
  assert.match(management, /setText\(saveRevision, "Save Revision"\)/);
  assert.match(management, /origin\?\.dataset\.kind === "owned"\) setText\(origin, "My Experiment"\)/);
});

test("#429 keeps existing Experiment semantics and collection organization reachable", () => {
  assert.match(management, /experimentSelect\.hidden = true/);
  assert.match(management, /registry-save-row/);
  assert.match(management, /registry-new-form/);
  assert.match(management, /registry-note/);
  assert.match(collection, /experiment-organize/);
  assert.doesNotMatch(management, /autosave.*keydown|keyup|input.*persistWorkingCopy/i);
});

test("#429 simulator readiness is contextual inside Simulation", () => {
  assert.match(simulation, /data-vlab-simulator-readiness/);
  assert.match(simulation, /Simulator ready/);
  assert.match(simulation, /#worker-status/);
  assert.doesNotMatch(react, /data-vlab-worker-status/);
});

test("#429 shared hierarchy remains intact after final Professor integration", () => {
  assert.match(management, /experiment-professor-section/);
  assert.doesNotMatch(management, /experiment-professor-compat|Temporary bridge until the final Professor integration/);
  assert.doesNotMatch(react, /data-vlab-nav="showcase"|data-vlab-nav="professor"/);
});

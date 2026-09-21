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

test("#429 global ribbon is product identity plus the three workspace destinations, Help and Account", () => {
  assert.match(react, />Virtual Lab</);
  assert.match(react, /Eliseo Ferrante/);
  assert.match(react, /Swarm robotics/);
  assert.match(react, /'control-panel', '#control-panel', 'Control Panel'/);
  assert.match(react, /'simulation', '#simulation', 'Simulation'/);
  assert.match(react, /'edit-experiment', '#authoring-workbench', 'Edit Experiment'/);
  assert.match(react, /data-vlab-nav="account"/);
  assert.match(onboarding, /"data-vlab-nav": "help"/);
  assert.match(react, /data-vlab-nav="help-mobile">Help/);
  assert.match(react, /proxyClick\('\[data-vlab-nav="help"\]'\)/);
  assert.doesNotMatch(react, /data-vlab-nav="experiment"|data-vlab-nav="authoring"|data-vlab-nav="results"|data-vlab-nav="showcase"|data-vlab-nav="professor"/);
  assert.doesNotMatch(react, /data-vlab-current-experiment|data-vlab-worker-status/);
});

test("#429 navigation lands on precise Control Panel, Simulation and Edit Experiment anchors", () => {
  assert.match(index, /id="control-panel" class="panel experiment-panel"/);
  assert.match(index, /id="simulation" class="panel stage-panel"/);
  assert.match(index, /id="authoring-workbench" class="panel editor-panel"/);
  assert.match(react, /'control-panel', '#control-panel'/);
  assert.match(react, /'simulation', '#simulation'/);
  assert.match(react, /'edit-experiment', '#authoring-workbench'/);
  assert.doesNotMatch(react, /scrollTo\('#live-results'\)/);
});

test("#429 Experiment management is one accessible task-based Control Panel without a duplicate visible title", () => {
  assert.match(management, /experimentPanel\.setAttribute\("aria-label", "Control Panel"\)/);
  assert.doesNotMatch(management, /experiment-control-kicker|experiment-control-title|title\.textContent = "Control panel"/);
  assert.match(management, /taskHeading\("Current Experiment"/);
  assert.match(management, /taskHeading\("Revisions"/);
  assert.match(management, /taskHeading\("Save & share"/);
  assert.match(management, /experiment-control-grid/);
  assert.match(management, /experiment-task-card/);
  assert.match(management, /setText\(browseButton, "Browse experiments"\)/);
  assert.match(management, /setText\(saveRevision, "Save Revision"\)/);
  assert.match(management, /origin\.dataset\.managementDefault = String\(Boolean\(owned\)\)/);
});

test("#429 keeps existing Experiment semantics and collection organization reachable", () => {
  assert.match(management, /experimentSelect\.hidden = true/);
  assert.match(management, /registry-share-row/);
  assert.match(management, /registry-new-form/);
  assert.match(management, /note\.hidden = true/);
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

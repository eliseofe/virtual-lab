import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [react, simulation, onboarding, shell, index, css, responsive] = await Promise.all([
  readFile(new URL("../src/react-migration-root.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/simulation-react-presentation.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/student-onboarding.js", import.meta.url), "utf8"),
  readFile(new URL("../src/workspace-shell.js", import.meta.url), "utf8"),
  readFile(new URL("../src/index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/react-chrome.css", import.meta.url), "utf8"),
  readFile(new URL("../scripts/responsive-smoke.mjs", import.meta.url), "utf8"),
]);

test("#417 ribbon carries product identity rather than the current Experiment title", () => {
  assert.match(react, />Virtual Lab</);
  assert.match(react, /Eliseo Ferrante/);
  assert.match(react, /Swarm robotics/);
  assert.doesNotMatch(react, /data-vlab-current-experiment|experimentTitle/);
  assert.match(css, /\.vlab-react-brand-byline/);
  assert.match(css, /\.vlab-react-owner-name/);
});

test("#417 global navigation is exactly Simulation, Authoring, Help and Account", () => {
  assert.match(react, /data-vlab-nav="simulation">Simulation/);
  assert.match(react, /data-vlab-nav="authoring">Authoring/);
  assert.match(react, /data-vlab-nav="account"/);
  assert.match(onboarding, /"data-vlab-nav": "help"/);
  assert.match(react, /data-vlab-nav="help-mobile">Help/);
  assert.match(react, /proxyClick\('\[data-vlab-nav="help"\]'\)/);
  assert.match(onboarding, /makeButton\("Help", "vlab-student-help-mobile"/);

  for (const removed of ["experiment", "results", "showcase", "professor"]) {
    assert.doesNotMatch(react, new RegExp(`data-vlab-nav="${removed}"`));
    assert.doesNotMatch(react, new RegExp(`data-vlab-nav="${removed}-mobile"`));
  }
});

test("#417 Simulation and Authoring navigation use precise sticky-safe anchors", () => {
  assert.match(index, /id="simulation" class="panel stage-panel"/);
  assert.match(react, /scrollTo\('#simulation'\)/);
  assert.match(react, /scrollTo\('#authoring-workbench'\)/);
  assert.match(css, /#simulation,[\s\S]*#authoring-workbench[\s\S]*scroll-margin-top: 84px/);
  assert.doesNotMatch(react, /scrollTo\('#live-results'\)/);
});

test("#417 simulator readiness is contextual inside Simulation instead of the ribbon", () => {
  assert.match(simulation, /data-vlab-simulator-readiness/);
  assert.match(simulation, /Simulator ready/);
  assert.match(simulation, /#worker-status/);
  assert.doesNotMatch(react, /data-vlab-worker-status/);
  assert.match(responsive, /simulatorReadinessVisible/);
  assert.match(responsive, /workerStatusVisible/);
});

test("#417 preserves Professor access while removing it from global navigation", () => {
  assert.match(shell, /control-panel-professor-bridge/);
  assert.match(shell, /showcaseBridge\.textContent = "Showcase"/);
  assert.match(shell, /capabilityBridge\.textContent = "Capability requests"/);
  assert.match(shell, /showcaseBridge\.addEventListener\("click", openShowcase\)/);
  assert.match(shell, /capabilityBridge\.addEventListener\("click", openProfessorInbox\)/);
  assert.doesNotMatch(react, /data-vlab-nav="showcase"|data-vlab-nav="professor"/);
});

test("#417 deployed responsive smoke verifies desktop and mobile global hierarchy", () => {
  assert.match(responsive, /\["Simulation", "Authoring", "Help", "Account"\]/);
  assert.match(responsive, /Experiment\/Results\/Showcase\/Professor re-entered global navigation/);
  assert.match(responsive, /mobile global navigation hierarchy regressed/);
});

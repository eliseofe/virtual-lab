import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sourceWithStyles } from "./support/source-with-styles.mjs";

const [management, showcase, shell, inbox, react, index, placement] = await Promise.all([
  sourceWithStyles("experiment-management.js"),
  sourceWithStyles("showcase.js"),
  readFile(new URL("../src/workspace-shell.js", import.meta.url), "utf8"),
  sourceWithStyles("professor-inbox.js"),
  readFile(new URL("../src/react-migration-root.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/index.html", import.meta.url), "utf8"),
  sourceWithStyles("showcase-professor-placement.js"),
]);

test("#413 keeps Experiment identity singular and uses one library entry", () => {
  assert.match(management, /experimentSelect\.hidden = true/);
  assert.match(management, /setText\(browseButton, "Browse experiments"\)/);
  assert.doesNotMatch(management, /Switch experiment/);
  assert.match(showcase, /currentExperimentActions\.append\(browseExperiment\)/);
});

test("#413 preserves the one-step Professor inbox while global chrome no longer owns it", () => {
  assert.match(inbox, /dialog\.id = "professor-extension-inbox"/);
  assert.match(shell, /function openProfessorInbox\(\)/);
  assert.match(shell, /querySelector\("\.professor-inbox-open"\)/);
  assert.match(shell, /professorButton\.addEventListener\("click", openProfessorInbox\)/);
  assert.doesNotMatch(shell, /openUtilities\("professor"\)/);
  assert.doesNotMatch(react, /data-vlab-nav="professor"|data-vlab-nav="professor-mobile"/);
  assert.doesNotMatch(index, /Account &amp; Professor/);
});

test("#413 Showcase curation remains authoritative while #430 owns its final placement", () => {
  assert.match(showcase, /promote\.className = "primary showcase-promote-current"/);
  // #552: behaviour covered by showcase-curation.test.mjs; this checks showcase.js uses the rule.
  assert.match(showcase, /const state = promoteButtonState\(\{/);
  assert.match(showcase, /ui\.promote\.textContent = state\.text/);
  assert.match(showcase, /ui\.promote\.addEventListener\("click", \(\) => run\(promoteCurrent\)\)/);
  assert.match(showcase, /supabase\.rpc\("promote_experiment_to_showcase"/);
  assert.match(management, /showcaseActions\.append\(showcaseLauncher, promote\)/);
  assert.match(management, /showcaseGroup\.append\(showcaseTitle, showcaseActions, curationStatus\)/);
  assert.doesNotMatch(placement, /MutationObserver|placeShowcaseCuration/);
});

test("#413 keeps the authoritative Simulation and Authoring workspace anchors", () => {
  assert.match(index, /id="arena-heading" class="vlab-workspace-card-title">Simulation<\/h2>/);
  assert.match(index, /id="authoring-workbench"/);
  assert.match(index, /id="authoring-heading" class="vlab-workspace-card-title">Experiment Authoring<\/h2>/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [management, showcase, shell, inbox, react, index, placement] = await Promise.all([
  readFile(new URL("../src/experiment-management.js", import.meta.url), "utf8"),
  readFile(new URL("../src/showcase.js", import.meta.url), "utf8"),
  readFile(new URL("../src/workspace-shell.js", import.meta.url), "utf8"),
  readFile(new URL("../src/professor-inbox.js", import.meta.url), "utf8"),
  readFile(new URL("../src/react-migration-root.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/showcase-professor-placement.js", import.meta.url), "utf8"),
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
  assert.match(showcase, /"Promote to Showcase"/);
  assert.match(showcase, /"Publish current revision"/);
  assert.match(showcase, /"In Showcase"/);
  assert.match(showcase, /ui\.promote\.addEventListener\("click", \(\) => run\(promoteCurrent\)\)/);
  assert.match(showcase, /supabase\.rpc\("promote_experiment_to_showcase"/);
  assert.match(management, /showcaseActions\.append\(showcaseLauncher, promote\)/);
  assert.match(management, /showcaseGroup\.append\(showcaseTitle, showcaseActions, curationStatus\)/);
  assert.doesNotMatch(placement, /MutationObserver|placeShowcaseCuration/);
});

test("#413 leaves Arena and Experiment Source structure outside this cleanup", () => {
  assert.match(index, /id="arena-heading"/);
  assert.match(index, /id="authoring-workbench"/);
  assert.match(index, /id="authoring-heading"/);
});

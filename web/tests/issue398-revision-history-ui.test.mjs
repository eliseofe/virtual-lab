import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { sourceWithStyles } from "./support/source-with-styles.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const registry = await sourceWithStyles("registry-ui-v3.js");
const migration = await readFile(
  path.join(repo, "supabase/migrations/20260920101436_experiment_head_realtime.sql"),
  "utf8",
);

test("#398 makes revision history part of the Experiment header rather than Account save UI", () => {
  assert.match(registry, /experiment-revision-workflow/);
  assert.match(registry, /revisionTrigger\.setAttribute\("aria-label", "Open revision history"\)/);
  assert.match(registry, /currentUi\.revisionActions\.append\(ui\.save\)/);
  assert.match(registry, /currentUi\.revisionDetails\.append\(ui\.saveState, ui\.note\)/);
  assert.match(registry, /save\.textContent = "Save Revision"/);
});

test("#398 loads exact retained snapshots and exposes Working copy as a special entry", () => {
  assert.match(registry, /\.from\("experiment_revisions"\)/);
  assert.match(registry, /\.order\("revision", \{ ascending: false \}\)/);
  assert.match(registry, /number\.textContent = "Working"/);
  assert.match(registry, /number\.textContent = "R" \+ revision\.revision/);
  assert.match(registry, /applyExperimentArtifacts\(revision\)/);
  assert.match(registry, /currentRevisionView = \{ kind: "revision", revision: revision\.revision \}/);
});

test("#398 filters revision history by All, Mine and AI only", () => {
  assert.match(registry, /all\.textContent = "All"/);
  assert.match(registry, /mine\.textContent = "Mine"/);
  assert.match(registry, /ai\.textContent = "AI"/);
  // #545: behaviour covered by registry-revisions.test.mjs; this checks the registry uses the rule.
  assert.match(registry, /const history = historyEntries\(\{/);
  // #554: the unused revisionBelongsToMine wrapper was removed; historyEntries applies the Mine filter.
  assert.doesNotMatch(registry, /People…|People\.\.\.|Collaborators/);
});

test("#398 preserves an existing Working copy while inspecting numbered history", () => {
  assert.match(registry, /const protectedWorkingCopy = Boolean\(owned && currentWorkingCopy && viewingNumbered\)/);
  assert.match(registry, /setArtifactEditorsLocked\(protectedWorkingCopy\)/);
  assert.match(registry, /Edit from this revision/);
  // #545: behaviour covered by registry-revisions.test.mjs; this checks the registry uses the rule.
  assert.match(registry, /window\.confirm\(replaceWorkingCopyQuestion\(currentWorkingCopy, revision\)\)/);
  assert.match(registry, /\.from\("experiment_working_copies"\)[\s\S]*\.delete\(\)/);
});

test("#398 editing an old revision creates the Working copy from that selected base", () => {
  // #545: behaviour covered by registry-revisions.test.mjs; this checks the registry uses the rule.
  assert.match(registry, /const baseRevision = workingCopyBaseRevision\(\{\s*workingCopy: currentWorkingCopy,\s*view: currentRevisionView,\s*remote: currentRemote,/);
  assert.match(registry, /Your first edit will create a Working copy based on it/);
});

test("#398 surfaces a new AI head without changing the current view", () => {
  assert.match(migration, /alter publication supabase_realtime add table public\.experiments/);
  assert.match(registry, /\.channel\("experiment-head:" \+ id\)/);
  assert.match(registry, /"postgres_changes"/);
  assert.match(registry, /refreshCurrentExperimentHead\(id\)/);
  assert.match(registry, /await Promise\.all\(\[loadExperimentList\(\), loadRevisionHistory\(\)\]\)/);
  // #554: behaviour covered by registry-labels.test.mjs; this checks the registry uses the rule.
  assert.match(registry, /setMessage\(newRevisionMessage\(fresh\.revision, actor\), "success"\)/);
  assert.doesNotMatch(registry, /setInterval\(/);
});

test("#398 shows exact provenance and base lineage in revision history", () => {
  assert.match(registry, /formatRevisionTime\(revision\.created_at\)/);
  // #554: behaviour covered by registry-labels.test.mjs; this checks the registry uses the rule.
  assert.match(registry, /actor\.textContent = revisionActor\(revision\)/);
  assert.match(registry, /return revisionActorFor\(revision, user\?\.id\)/);
  assert.match(registry, /Based on R/);
});

test("#398 deliberately handles mobile revision navigation", () => {
  assert.match(registry, /@media \(max-width: 680px\)/);
  assert.match(registry, /\.experiment-revision-top \{ align-items: stretch; flex-direction: column; \}/);
  assert.match(registry, /\.experiment-revision-actions \{ display: grid; grid-template-columns: 1fr 1fr; \}/);
  assert.match(registry, /\.experiment-history-item \{ grid-template-columns: 1fr auto;[^}]*\}/);
});

test("#398 keeps history immutable and does not introduce merge or rebase machinery", () => {
  assert.doesNotMatch(registry, /automatic merge|rebase|merge conflict/i);
  assert.match(registry, /Numbered history is never rewritten/);
});

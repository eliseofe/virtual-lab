import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [index, workspaceShell, authoring, management, organization] = await Promise.all([
  readFile(new URL("../src/index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/workspace-shell.js", import.meta.url), "utf8"),
  readFile(new URL("../src/authoring-workspace.js", import.meta.url), "utf8"),
  readFile(new URL("../src/experiment-management.js", import.meta.url), "utf8"),
  readFile(new URL("../src/collection-organization.js", import.meta.url), "utf8"),
]);

assert.ok(workspaceShell.includes('import "./experiment-management.js";'), "workspace shell must load the unified Experiment management adapter");
assert.ok(
  workspaceShell.indexOf('import "./experiment-management.js";') > workspaceShell.indexOf('import "./authoring-workspace.js";'),
  "Experiment management must run after the legacy authoring persistence relocation",
);

assert.match(management, /\.registry-share-row/);
assert.match(management, /\.registry-new-form/);
assert.match(management, /if \(note\) note\.hidden = true/);
assert.match(management, /management\.slot\.append\(element\)/);
assert.match(management, /legacyPersistence\.hidden = true/);
assert.match(management, /experimentSelect\.hidden = true/);
assert.match(management, /quickHint\.hidden = true/);
assert.match(management, /function setText\(element, text\)/);
assert.match(management, /if \(element && element\.textContent !== text\) element\.textContent = text/);
assert.match(management, /setText\(browseButton, "Experiments"\)/);
assert.doesNotMatch(management, /browseButton\.textContent = "Experiments"/);
assert.match(management, /signIn\.textContent = "Sign in to save"/);
assert.match(management, /accountButton\.click\(\)/);
assert.match(management, /setText\(saveRevision, "Save Revision"\)/);
assert.match(management, /setText\(management\.saveAsNew, "Save as new…"\)/);
assert.match(management, /if \(location\.dataset\.managementRedundant !== redundant\) location\.dataset\.managementRedundant = redundant/);
assert.match(management, /experiment-location\[data-management-redundant="true"\]/);
assert.match(management, /@media \(max-width: 680px\)/);
assert.match(management, /min-height: 44px/);

assert.ok(index.includes('id="authoring-persistence"'), "legacy persistence host remains present for compatibility while the adapter relocates its controls");
assert.ok(authoring.includes('persistenceSlot.append(element)'), "legacy authoring code still exposes the existing save controls without changing persistence semantics");
assert.match(organization, /\.experiment-organize/);
assert.match(organization, /relocateMoveControl/);

for (const forbidden of ["supabase", "simulation-canvas", "metrics-source", "controller-source", "experiment_artifacts"]) {
  assert.ok(!management.includes(forbidden), `#208 adapter must remain presentation-only and not touch ${forbidden}`);
}

console.log("Issue #208 unified Experiment identity/save/organization presentation invariants are locked with idempotent observer updates.");

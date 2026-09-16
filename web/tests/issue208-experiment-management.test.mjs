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

assert.match(management, /\.registry-save-row/);
assert.match(management, /\.registry-new-form/);
assert.match(management, /\.registry-note/);
assert.match(management, /management\.slot\.append\(element\)/);
assert.match(management, /legacyPersistence\.hidden = true/);
assert.match(management, /experimentSelect\.hidden = true/);
assert.match(management, /quickHint\.hidden = true/);
assert.match(management, /browseButton\.textContent = "Switch experiment"/);
assert.match(management, /signIn\.textContent = "Sign in to save"/);
assert.match(management, /accountButton\.click\(\)/);
assert.match(management, /save\.textContent = "Save"/);
assert.match(management, /saveAsNew\.textContent = "Save as new…"/);
assert.match(management, /locationText === "Built-in" \|\| locationText === "No collection"/);
assert.match(management, /@media \(max-width: 680px\)/);
assert.match(management, /min-height: 44px/);

assert.ok(index.includes('id="authoring-persistence"'), "legacy persistence host remains present for compatibility while the adapter relocates its controls");
assert.ok(authoring.includes('persistenceSlot.append(element)'), "legacy authoring code still exposes the existing save controls without changing persistence semantics");
assert.match(organization, /\.experiment-organize/);
assert.match(organization, /relocateMoveControl/);

for (const forbidden of ["supabase", "simulation-canvas", "metrics-source", "controller-source", "experiment_artifacts"]) {
  assert.ok(!management.includes(forbidden), `#208 adapter must remain presentation-only and not touch ${forbidden}`);
}

console.log("Issue #208 unified Experiment identity/save/organization presentation invariants are locked.");

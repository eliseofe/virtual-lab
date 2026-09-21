import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [react, chrome, management, index, responsive] = await Promise.all([
  readFile(new URL("../src/react-migration-root.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/react-chrome.css", import.meta.url), "utf8"),
  readFile(new URL("../src/experiment-management.js", import.meta.url), "utf8"),
  readFile(new URL("../src/index.html", import.meta.url), "utf8"),
  readFile(new URL("../scripts/responsive-smoke.mjs", import.meta.url), "utf8"),
]);

test("#449 restores the accepted three-destination workspace navigation", () => {
  assert.match(index, /id="control-panel" class="panel experiment-panel" aria-label="Control Panel"/);
  assert.match(react, /'control-panel', '#control-panel', 'Control Panel'/);
  assert.match(react, /'simulation', '#simulation', 'Simulation'/);
  assert.match(react, /'edit-experiment', '#authoring-workbench', 'Edit Experiment'/);
  assert.match(react, /aria-current=\{activeSection === section \? 'location' : undefined\}/);
  assert.match(react, /data-active=\{String\(activeSection === section\)\}/);
  assert.doesNotMatch(react, /data-vlab-nav="authoring"/);
});

test("#449 keeps workspace navigation visible and coherent rather than phone-specific", () => {
  assert.match(chrome, /\.vlab-react-header-layout \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
  assert.match(chrome, /\.vlab-react-nav-button \{[\s\S]*white-space: nowrap/);
  assert.match(chrome, /@media \(max-width: 74\.99em\)[\s\S]*\.vlab-react-nav \{[\s\S]*grid-column: 1 \/ -1/);
  assert.doesNotMatch(react, /visibleFrom="lg" className="vlab-react-nav"/);
  assert.match(react, /aria-label="Open utilities"/);
});

test("#449 removes the duplicate Control Panel heading and preserves accessible naming", () => {
  assert.match(management, /experimentPanel\.setAttribute\("aria-label", "Control Panel"\)/);
  assert.doesNotMatch(management, /experiment-control-head|experiment-control-kicker|experiment-control-title/);
  assert.doesNotMatch(management, /kicker\.textContent = "Experiment"|title\.textContent = "Control panel"/);
});

test("#449 gives Current Experiment one stable identity-to-action flow", () => {
  assert.match(management, /currentMain\.after\(currentContext, currentActions\)/);
  assert.match(management, /currentContext\.append\(currentMeta\)/);
  assert.match(management, /browseButton\.classList\.add\("primary"\)/);
  assert.match(management, /setText\(browseButton, "Browse experiments"\)/);
  assert.match(management, /origin\.dataset\.managementDefault = String\(Boolean\(owned\)\)/);
  assert.match(management, /locationText\.startsWith\("Collection · "\)/);
  assert.match(management, /Shared · Read-only/);
  assert.match(management, /Supervised · /);
  assert.doesNotMatch(management, /setText\(origin, "My Experiment"\)/);
  assert.doesNotMatch(management, /experiment-current-toolbar/);
});

test("#449 renames the role-based Professor section without changing its functions", () => {
  assert.match(management, /region\.setAttribute\("aria-label", "Professor controls"\)/);
  assert.match(management, /taskHeading\("Professor controls"\)/);
  assert.match(management, /showcaseActions\.append\(showcaseLauncher, promote\)/);
  assert.match(management, /capabilityTitle\.textContent = "Capability requests"/);
});

test("#449 production responsive smoke covers phone, foldable, desktop and ultra-wide", () => {
  assert.match(responsive, /label: "mobile", width: 390, height: 844/);
  assert.match(responsive, /label: "foldable", width: 820, height: 1180/);
  assert.match(responsive, /label: "desktop", width: 1366, height: 900/);
  assert.match(responsive, /label: "ultra-wide", width: 1920, height: 1080/);
  assert.match(responsive, /workspaceLabels/);
  assert.match(responsive, /Current Experiment hierarchy regressed/);
  assert.match(responsive, /horizontal page overflow/);
});

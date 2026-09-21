import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [management, registry, showcase] = await Promise.all([
  readFile(new URL("../src/experiment-management.js", import.meta.url), "utf8"),
  readFile(new URL("../src/registry-ui-v3.js", import.meta.url), "utf8"),
  readFile(new URL("../src/showcase.js", import.meta.url), "utf8"),
]);

test("#444 removes prose from the four primary Control Panel areas", () => {
  assert.match(management, /taskHeading\("Current Experiment"\)/);
  assert.match(management, /taskHeading\("Revisions"\)/);
  assert.match(management, /taskHeading\("Save & share"\)/);
  assert.match(management, /taskHeading\("Professor controls"\)/);
  assert.doesNotMatch(management, /experiment-control-help/);
  assert.doesNotMatch(management, /Identity, access and organization|Working copy and numbered history|Save, copy and share|Showcase publication and scientific capability requests/);
  assert.doesNotMatch(management, /showcaseHelp|capabilityHelp|Browse curated Experiments|Review scientific needs/);
});

test("#444 shows only compact revision data in the Revisions trigger", () => {
  assert.match(registry, /currentUi\.revisionPrimary\.textContent = String\(revisionNumber\)/);
  assert.match(registry, /currentUi\.revisionPrimary\.textContent = "W"/);
  assert.match(registry, /"Open revision history\. Revision " \+ revisionNumber/);
  assert.match(registry, /"Open revision history\. Working copy based on revision " \+ currentWorkingCopy\.base_revision/);
  assert.match(management, /\.experiment-revision-trigger > span,[\s\S]*\.experiment-revision-trigger > b[\s\S]*display: none !important/);
  assert.match(management, /min-width: 3ch !important/);
  assert.doesNotMatch(management, /max-width: 72px !important/);
  assert.doesNotMatch(registry, /currentUi\.revisionPrimary\.textContent = "R" \+ revisionNumber/);
});

test("#444 keeps visible revision/save state as terse status data", () => {
  assert.match(registry, /ui\.saveState\.textContent = "Working · pending · " \+ baseRevision/);
  assert.match(registry, /ui\.saveState\.textContent = "Working · " \+ currentWorkingCopy\.base_revision/);
  assert.match(registry, /ui\.saveState\.textContent = currentRemote\.revision \+ " · Saved"/);
  assert.match(registry, /ui\.saveState\.textContent = viewedRevision\.revision \+ " · Historical"/);
  assert.match(registry, /currentUi\.revisionNotice\.textContent =\s*"New · " \+ currentRemote\.revision/);
});

test("#444 removes stale Control Panel placement glue", () => {
  assert.doesNotMatch(management, /registry-save-row|experiment-management-slot \.registry-save-actions|experiment-management-slot \.registry-move-row/);
  assert.match(management, /for \(const selector of \["\.registry-share-row", "\.registry-new-form"\]\)/);
  assert.match(management, /if \(note\) note\.hidden = true/);
  assert.match(management, /setText\(management\.saveAsNew, "Copy to my Experiments…"\)/);
  assert.doesNotMatch(management, /querySelector\("\.registry-save-actions button:not\(\.primary\)"\)/);
});

test("#444 repairs Showcase saving to the authoritative Revisions control", () => {
  assert.match(showcase, /querySelector\("\.experiment-revision-actions \.primary"\)/);
  assert.doesNotMatch(showcase, /querySelector\("\.registry-save-actions \.primary"\)/);
  assert.match(showcase, /ui\.curationStatus\.textContent = "Save conflict"/);
  assert.match(showcase, /Published ·/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [management, organization] = await Promise.all([
  readFile(new URL("../src/experiment-management.js", import.meta.url), "utf8"),
  readFile(new URL("../src/collection-organization.js", import.meta.url), "utf8"),
]);

test("#446 gives Current Experiment a title-first toolbar instead of a floating library action", () => {
  assert.match(management, /currentToolbar\.className = "experiment-current-toolbar"/);
  assert.match(management, /currentActions\.className = "experiment-current-actions"/);
  assert.match(management, /currentToolbar\.append\(currentMeta, currentActions\)/);
  assert.match(management, /currentActions\.append\(browseButton\)/);
  assert.doesNotMatch(management, /currentMain\.querySelector\("\.experiment-current-actions"\)/);
  assert.match(organization, /const actions = document\.querySelector\("\.experiment-current-actions"\)/);
  assert.match(organization, /const host = actions \|\| meta/);
  assert.match(organization, /organizeButton\.parentElement !== host/);
});

test("#446 does not mirror routine registry prose into Save & share", () => {
  assert.match(management, /if \(state !== "error"\)/);
  assert.match(management, /management\.status\.dataset\.state = "error"/);
  assert.doesNotMatch(management, /state !== "error" && state !== "success"/);
});

test("#446 balances peer cards with intrinsic layout rather than fixed card dimensions", () => {
  assert.match(management, /\.experiment-revision-top \{[\s\S]*grid-template-columns: max-content minmax\(0, 1fr\)/);
  assert.match(management, /\.experiment-management-actions \{[\s\S]*display: flex/);
  assert.match(management, /\.experiment-professor-group \{[\s\S]*display: flex;[\s\S]*flex-direction: column/);
  assert.match(management, /\.experiment-professor-actions button \{[\s\S]*flex: 1 1 0/);
  assert.doesNotMatch(management, /min-height: 154px/);
  assert.doesNotMatch(management, /min-height: 132px/);
  assert.doesNotMatch(management, /grid-auto-rows: 44px/);
  assert.doesNotMatch(management, /\.experiment-management-actions button \{[^}]*\n\s*height: 44px/);
  assert.doesNotMatch(management, /max-width: 72px/);
});

test("#446 keeps action labels compact inside repeated curation groups", () => {
  assert.match(management, /showcaseLauncher\.textContent = "Browse"/);
  assert.match(management, /requests\.textContent = "Open"/);
  assert.match(management, /\? `Open · \$\{pending\}`[\s\S]*: "Open"/);
});

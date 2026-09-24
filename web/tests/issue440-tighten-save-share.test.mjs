import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sourceWithStyles } from "./support/source-with-styles.mjs";

const management = await sourceWithStyles("experiment-management.js");

test("#440 keeps Save & share compact after the later prose-removal pass", () => {
  assert.match(management, /taskHeading\("Save & share"\)/);
  assert.doesNotMatch(management, /Persistence, copies and collaboration|Save, copy and share/);
});

test("#440 consolidates visible Save & share actions into one equal action bar", () => {
  assert.match(management, /actions\.className = "experiment-management-actions"/);
  assert.match(management, /actions\.append\(saveAsNew, shareOpen\)/);
  assert.match(management, /\.experiment-management-actions \{[\s\S]*display: flex/);
  assert.match(management, /\.experiment-management-actions button \{[\s\S]*flex: 1 1 0[\s\S]*min-height: 44px/);
  assert.doesNotMatch(management, /grid-auto-rows: 44px/);
});

test("#440 keeps Save Revision in Revisions and collection movement in Organize", () => {
  assert.doesNotMatch(management, /actions\.append\([^\n]*(save,|move)/);
  assert.doesNotMatch(management, /syncManagementActions|moveObserver/);
});

test("#440 keeps mobile actions touch-sized and compactly stacked", () => {
  assert.match(management, /@media \(max-width: 680px\)/);
  assert.match(management, /\.experiment-management-actions \{ flex-wrap: wrap; \}/);
});

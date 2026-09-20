import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const management = await readFile(new URL("../src/experiment-management.js", import.meta.url), "utf8");

test("#440 shortens the Save & share subtitle", () => {
  assert.match(management, /taskHeading\("Save & share", "Save, copy and share"\)/);
  assert.doesNotMatch(management, /Persistence, copies and collaboration/);
});

test("#440 consolidates visible Save & share actions into one equal action bar", () => {
  assert.match(management, /actions\.className = "experiment-management-actions"/);
  assert.match(management, /actions\.append\(save, saveAsNew, shareOpen\)/);
  assert.match(management, /grid-template-columns: repeat\(auto-fit, minmax\(108px, 1fr\)\)/);
  assert.match(management, /grid-auto-rows: 44px/);
  assert.match(management, /\.experiment-management-actions button \{[\s\S]*width: 100%[\s\S]*height: 44px/);
});

test("#440 keeps collection movement in the existing Organize flow", () => {
  assert.doesNotMatch(management, /actions\.append\([^\n]*move/);
  assert.doesNotMatch(management, /syncManagementActions|moveObserver/);
});

test("#440 keeps mobile actions touch-sized and compactly stacked", () => {
  assert.match(management, /@media \(max-width: 680px\)/);
  assert.match(management, /\.experiment-management-actions \{ grid-template-columns: 1fr 1fr; \}/);
});

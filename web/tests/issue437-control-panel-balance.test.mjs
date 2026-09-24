import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sourceWithStyles } from "./support/source-with-styles.mjs";

const management = await sourceWithStyles("experiment-management.js");

test("#437 keeps peer Control Panel cards balanced without forced card heights", () => {
  assert.match(management, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(management, /\.experiment-task-revisions,[\s\S]*\.experiment-management \{[\s\S]*align-content: start/);
  assert.match(management, /\.experiment-professor-groups \{[\s\S]*align-items: stretch/);
  assert.doesNotMatch(management, /min-height: 154px|min-height: 132px|grid-auto-rows: 1fr/);
});

test("#437 retains one minimum desktop touch-target system", () => {
  assert.match(management, /\.experiment-browse,[\s\S]*\.experiment-organize \{[\s\S]*min-height: 44px !important/);
  assert.match(management, /\.experiment-revision-actions button,[\s\S]*\.experiment-sign-in \{[\s\S]*min-height: 44px !important/);
  assert.match(management, /\.experiment-professor-actions button \{[\s\S]*min-height: 44px/);
});

test("#437 lets peer action groups share available width intrinsically", () => {
  assert.match(management, /\.experiment-revision-actions,[\s\S]*\.experiment-management-slot \.registry-new-actions \{[\s\S]*display: flex !important/);
  assert.match(management, /\.experiment-management-actions \{[\s\S]*display: flex/);
  assert.match(management, /\.experiment-professor-actions \{[\s\S]*display: flex/);
  assert.match(management, /\.experiment-professor-actions button \{[\s\S]*flex: 1 1 0/);
});

test("#437 keeps mobile controls touch-sized while allowing natural wrapping", () => {
  assert.match(management, /@media \(max-width: 680px\)/);
  assert.match(management, /\.experiment-revision-actions button,[\s\S]*\.experiment-professor-actions button \{ min-height: 44px !important; \}/);
  assert.match(management, /\.experiment-professor-actions,[\s\S]*\.experiment-management-actions \{ flex-wrap: wrap; \}/);
});

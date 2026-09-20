import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const management = await readFile(new URL("../src/experiment-management.js", import.meta.url), "utf8");

test("#437 balances the peer Control Panel cards", () => {
  assert.match(management, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(management, /\.experiment-task-revisions,[\s\S]*\.experiment-management \{[\s\S]*min-height: 154px/);
  assert.match(management, /\.experiment-professor-groups \{[\s\S]*grid-auto-rows: 1fr/);
  assert.match(management, /\.experiment-professor-group \{[\s\S]*min-height: 132px/);
});

test("#437 uses one desktop action-height system", () => {
  assert.match(management, /\.experiment-browse \{ min-height: 38px/);
  assert.match(management, /\.experiment-revision-actions button,[\s\S]*\.experiment-sign-in-save \{[\s\S]*min-height: 38px !important/);
  assert.match(management, /\.experiment-professor-actions button \{[\s\S]*min-height: 38px/);
  assert.match(management, /\.experiment-organize \{[\s\S]*min-height: 30px !important/);
});

test("#437 makes peer action groups geometrically predictable", () => {
  assert.match(management, /\.experiment-revision-actions,[\s\S]*\.experiment-management-slot \.registry-new-actions \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(management, /\.experiment-professor-actions \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(management, /\.experiment-professor-actions button \{[\s\S]*width: 100%/);
});

test("#437 keeps the established mobile touch system", () => {
  assert.match(management, /@media \(max-width: 680px\)/);
  assert.match(management, /\.experiment-revision-actions button,[\s\S]*\.experiment-professor-actions button \{ min-height: 44px !important; \}/);
  assert.match(management, /grid-template-columns: 1fr !important/);
});

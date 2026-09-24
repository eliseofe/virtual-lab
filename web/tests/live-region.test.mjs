// Behaviour tests for the live runtime region rule (#569).

import assert from "node:assert/strict";
import test from "node:test";

globalThis.Node ??= { ELEMENT_NODE: 1, TEXT_NODE: 3 };
const { LIVE_RUNTIME_REGION, onlyLiveRuntimeUpdates } = await import("../src/live-region.js");

const element = (inside) => ({ nodeType: 1, closest: (selector) => (selector === LIVE_RUNTIME_REGION && inside ? {} : null) });
const text = (parent) => ({ nodeType: 3, parentElement: parent });
const live = element(true);
const outside = element(false);
const record = (type, target, added = [], removed = []) => ({ type, target, addedNodes: added, removedNodes: removed });

test("text and attribute updates inside the simulation section are live runtime updates", () => {
  assert.equal(LIVE_RUNTIME_REGION, "#simulation");
  assert.equal(onlyLiveRuntimeUpdates([
    record("childList", live, [text(live)], [text(live)]),
    record("characterData", text(live)),
    record("attributes", live),
  ]), true);
});

test("a new element inside the simulation section still reaches structure watchers", () => {
  assert.equal(onlyLiveRuntimeUpdates([record("childList", live, [element(true)])]), false);
  assert.equal(onlyLiveRuntimeUpdates([record("childList", live, [], [element(true)])]), false);
});

test("any change outside the simulation section still reaches structure watchers", () => {
  assert.equal(onlyLiveRuntimeUpdates([record("characterData", text(outside))]), false);
  assert.equal(onlyLiveRuntimeUpdates([record("characterData", text(live)), record("attributes", outside)]), false,
    "a batch mixing live updates with anything else is not skipped");
  assert.equal(onlyLiveRuntimeUpdates([]), false);
});

test("the three page-wide structure watchers skip only live runtime updates", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const file of ["collection-organization.js", "workspace-shell.js", "ux-hardening.js"]) {
    const source = await readFile(new URL(`../src/${file}`, import.meta.url), "utf8");
    assert.match(source, /onlyLiveRuntimeUpdates\(records\)/, file);
    assert.match(source, /observe\(document\.body/, `${file} still watches the page for structure`);
  }
});

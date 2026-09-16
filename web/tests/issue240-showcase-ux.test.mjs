import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const showcase = readFileSync(new URL("../src/showcase.js", import.meta.url), "utf8");
const placement = readFileSync(new URL("../src/showcase-professor-placement.js", import.meta.url), "utf8");

test("#240 Showcase contains no synthetic built-in publication exception", () => {
  assert.doesNotMatch(showcase, /BUILTIN_SHOWCASE_ID/);
  assert.doesNotMatch(showcase, /builtinEntry/);
  assert.doesNotMatch(showcase, /entry\.builtin/);
  assert.doesNotMatch(showcase, /Built-in · Public example/);
  assert.match(showcase, /entries = Array\.isArray\(data\) \? data : \[\]/);
});

test("#240 Professor promotion is one action for registry and catalog sources", () => {
  assert.match(showcase, /ensureCurrentSavedForPromotion/);
  assert.match(showcase, /saveButton\.click\(\)/);
  assert.match(showcase, /promote_experiment_to_showcase/);
  assert.match(showcase, /promote_catalog_to_showcase/);
  assert.doesNotMatch(showcase, /Save the Experiment first/);
  assert.doesNotMatch(showcase, /Save the Experiment before promoting it/);
});

test("#240 Showcase follows the relocated #208 save state instead of the old account subtree", () => {
  assert.match(showcase, /const registrySaveState = document\.querySelector\("\.registry-save-state"\)/);
  assert.doesNotMatch(showcase, /accountPanel\.querySelector\("\.registry-save-state"\)/);
});

test("#240 curation stays inside Showcase instead of being buried in Account or Professor panels", () => {
  assert.match(showcase, /shell\.append\(head, curation, message, list\)/);
  assert.doesNotMatch(showcase, /accountPanel\.append\(curation\)/);
  assert.match(placement, /showcase-shell/);
  assert.match(placement, /insertBefore\(curation, message\)/);
});

test("#240 Showcase mobile actions meet the 44px touch-target floor", () => {
  assert.match(showcase, /showcase-entry-remove \{ min-height: 44px/);
  assert.match(placement, /showcase-head-actions button/);
  assert.match(placement, /min-height:\s*44px/);
});

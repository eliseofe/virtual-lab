import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sourceWithStyles } from "./support/source-with-styles.mjs";

const showcase = sourceWithStyles("showcase.js");
const placement = sourceWithStyles("showcase-professor-placement.js");

test("#240 Showcase contains no synthetic built-in publication exception", () => {
  assert.doesNotMatch(showcase, /BUILTIN_SHOWCASE_ID/);
  assert.doesNotMatch(showcase, /builtinEntry/);
  assert.doesNotMatch(showcase, /entry\.builtin/);
  assert.doesNotMatch(showcase, /Built-in · Public example/);
  assert.match(showcase, /entries = Array\.isArray\(entryResult\.data\) \? entryResult\.data : \[\]/);
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

test("#240 curation stays out of Account and Professor administration while remaining tied to Showcase publication", () => {
  assert.match(showcase, /shell\.append\(head, message, manager, list\)/);
  assert.match(showcase, /launcher\.textContent = "Manage Showcase"/);
  // #552: behaviour covered by showcase-curation.test.mjs; this checks showcase.js uses the rule.
  assert.match(showcase, /ui\.launcher\.hidden = !isProfessor\(profile\)/);
  assert.match(showcase, /promote\.className = "primary showcase-promote-current"/);
  assert.match(showcase, /currentExperimentActions\.append\(promote\)/);
  assert.doesNotMatch(showcase, /accountPanel\.append\(promote\)/);
  assert.doesNotMatch(showcase, /Professor curation/);
  assert.doesNotMatch(placement, /insertBefore\(curation, message\)|placeShowcaseCuration/);
});

test("#240 Showcase mobile actions meet the 44px touch-target floor", () => {
  assert.match(showcase, /showcase-entry-remove \{ min-height: 44px/);
  assert.match(placement, /showcase-head-actions button/);
  assert.match(placement, /min-height:\s*44px/);
});

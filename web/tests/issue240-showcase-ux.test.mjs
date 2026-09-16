import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const showcase = readFileSync(new URL("../src/showcase.js", import.meta.url), "utf8");

test("#240 Showcase always includes the canonical built-in Active Elastic entry", () => {
  assert.match(showcase, /BUILTIN_SHOWCASE_ID/);
  assert.match(showcase, /builtinEntry/);
  assert.match(showcase, /Built-in · Public example/);
  assert.doesNotMatch(showcase, /No Showcase experiments yet\./);
});

test("#240 Professor promotion is one action and never instructs Save first", () => {
  assert.match(showcase, /ensureCurrentSavedForPromotion/);
  assert.match(showcase, /saveButton\.click\(\)/);
  assert.doesNotMatch(showcase, /Save the Experiment first/);
  assert.doesNotMatch(showcase, /Save the Experiment before promoting it/);
});

test("#240 curation lives inside Showcase instead of the account panel", () => {
  assert.match(showcase, /shell\.insertBefore\(curation, message\)/);
  assert.doesNotMatch(showcase, /accountPanel\.append\(curation\)/);
});

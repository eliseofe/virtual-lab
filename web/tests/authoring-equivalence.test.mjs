// #576: the authoring-language compilers keep exactly their recorded behaviour
// (results and diagnostics) on the seed corpus and its deterministic mutants.
// Regenerate the golden file only for an intentional, owner-approved language
// change: node web/scripts/authoring-equivalence.mjs --write

import assert from "node:assert/strict";
import test from "node:test";

import { compareWithGolden } from "../scripts/authoring-equivalence.mjs";

test("every compiler reproduces its recorded result or diagnostic on all cases", async () => {
  const { cases, golden, mismatches } = await compareWithGolden();
  assert.equal(golden.cases, cases.length, "the case set is unchanged");
  assert.ok(cases.length > 20000);
  assert.deepEqual(mismatches.slice(0, 10).map((index) => `${index} ${cases[index].name}`), [],
    `${mismatches.length} cases differ; run node web/scripts/authoring-equivalence.mjs for details`);
});

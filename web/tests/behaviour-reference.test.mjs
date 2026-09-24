// Behaviour-preservation safety net (#425).
//
// These tests check what the Lab does, not how its source is written:
// - the edge function's compiler copies are byte-identical to the browser's;
// - every reference Experiment compiles, in the browser and in the MCP edge
//   function, to exactly the recorded result and simulator input.
// The recorded simulator input is replayed bit-for-bit by
// crates/kernel/tests/reference_runs.rs.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { EDGE_VENDOR_PAIRS, differingEdgeVendorPairs } from "../scripts/sync-edge-vendor.mjs";
import {
  compileReferenceExperiment,
  loadCompilers,
  referencePath,
  serializeReference,
} from "../scripts/reference-runs.mjs";
import { REFERENCE_EXPERIMENTS } from "./fixtures/reference-experiments.mjs";

test("edge function compiler copies are byte-identical to the browser sources", async () => {
  assert.ok(EDGE_VENDOR_PAIRS.length >= 8);
  const differing = await differingEdgeVendorPairs();
  assert.deepEqual(
    differing,
    [],
    "run `node web/scripts/sync-edge-vendor.mjs` after editing a browser compiler",
  );
});

for (const kind of ["browser", "edge"]) {
  test(`${kind} compilers reproduce every recorded reference Experiment`, async () => {
    const compilers = await loadCompilers(kind);
    assert.ok(REFERENCE_EXPERIMENTS.length >= 5);
    for (const experiment of REFERENCE_EXPERIMENTS) {
      const recorded = await readFile(referencePath(experiment.id), "utf8").catch(() => null);
      assert.ok(recorded, `missing recorded reference for ${experiment.id}; run node web/scripts/reference-runs.mjs --update`);
      const actual = serializeReference(compileReferenceExperiment(experiment, compilers));
      assert.equal(actual, recorded, `${kind} compilation of ${experiment.id} differs from the recorded reference`);
    }
  });
}

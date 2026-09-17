import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [worker, main, profile] = await Promise.all([
  readFile(new URL("../src/worker.js", import.meta.url), "utf8"),
  readFile(new URL("../src/main.js", import.meta.url), "utf8"),
  readFile(new URL("../scripts/layer-attribution-profile.mjs", import.meta.url), "utf8"),
]);

test("#111 timing hook is profiling-only and absent from production main", () => {
  assert.match(worker, /message\.type === "profile-advance"/);
  assert.match(worker, /advanceMs:/);
  assert.match(worker, /snapshotMs/);
  assert.match(worker, /includeState/);
  assert.doesNotMatch(main, /profile-advance/);
});

test("#111 profile attributes the 5000-agent path across compute, transfer, copy, and render", () => {
  assert.match(profile, /const AGENTS = 5000/);
  assert.match(profile, /compute_only/);
  assert.match(profile, /with_snapshot/);
  assert.match(profile, /bytes_per_snapshot/);
  assert.match(profile, /main_state_array_copy/);
  assert.match(profile, /standalone_render/);
  for (const mode of ["receive-only", "copy-only", "dot", "directional"]) {
    assert.match(profile, new RegExp(`\\"${mode}\\"`));
  }
  assert.match(profile, /achieved_real_time_factor/);
});

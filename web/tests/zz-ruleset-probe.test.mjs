// TEMPORARY (#535): deliberately failing probe to prove the main ruleset blocks
// merging a pull request whose build check is red. Reverted immediately after.
import assert from "node:assert/strict";
import test from "node:test";

test("ruleset probe: this must fail and block the merge", () => {
  assert.fail("deliberate failure for #535 ruleset verification");
});

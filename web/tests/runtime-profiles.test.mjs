import test from "node:test";
import assert from "node:assert/strict";
import { swarmExperiment } from "../src/experiments/swarm-vs-swarm.js";
import {
  equilibriumFormation,
  minimumGap,
  separatedFormations,
} from "../src/experiments/swarm-placement.js";
import { compileProductionExperiment } from "../src/experiment-validation.js";
import { parseRuntimeProfile } from "../src/runtime/profiles.js";
import { validateInitialStateForRuntime } from "../src/runtime/contract.js";
import {
  validateExperimentArtifacts,
  AUTHORING_CONTRACT,
} from "../../supabase/functions/experiment-mcp/authoring.js";
const compiled = (options = {}) =>
  compileProductionExperiment(swarmExperiment(options), { seed: 123 });
test("all presets compile identically for browser and MCP, without changing privileges", () => {
  for (const options of [
    { caseNumber: 1 },
    { caseNumber: 2 },
    { caseNumber: 3 },
    { dimension: 3 },
  ]) {
    const experiment = swarmExperiment(options),
      c = compileProductionExperiment(experiment);
    assert.equal(c.metrics.metrics.length, 8);
    const result = validateExperimentArtifacts(experiment.artifacts);
    assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  }
  assert.equal(
    AUTHORING_CONTRACT.execution_boundary.ai_can_modify_simulator,
    false,
  );
  assert.equal(
    AUTHORING_CONTRACT.execution_boundary.ai_can_run_simulation,
    false,
  );
});
test("profile rejects inconsistent groups, counts, event rules, clocks and nonfinite parameters", () => {
  const values = compiled().config.values;
  for (const change of [
    (p) => p.profiles[0].count++,
    (p) => (p.profiles[1].group = 0),
    (p) => (p.rules[0].sourceGroup = 99),
    (p) => (p.physicsDt = 0.03),
    (p) => (p.profiles[0].maxSpeed = "NaN"),
    (p) => (p.rules[0].status = 0),
    (p) => (p.backend = "javascript"),
  ]) {
    const p = JSON.parse(values.RUNTIME_PROFILE);
    change(p);
    assert.throws(() =>
      parseRuntimeProfile({ ...values, RUNTIME_PROFILE: JSON.stringify(p) }),
    );
  }
});
test("bounded profile rejects positions outside arena; no wrapping is applied to unbounded profiles", () => {
  const c = compiled({ dimension: 3 });
  c.initializer.state[0].x = -1;
  assert.throws(
    () => validateInitialStateForRuntime(c.initializer.state, c.runtime),
    /bounded arena/,
  );
  const plane = compiled();
  plane.initializer.state[0].x = 1000;
  assert.doesNotThrow(() =>
    validateInitialStateForRuntime(plane.initializer.state, plane.runtime),
  );
});
test("formations satisfy the DM virial equation and the closest-pair gap, including asymmetric populations", () => {
  for (const n of [2, 5, 15, 20, 30, 60, 80]) {
    const a = equilibriumFormation(n);
    let balance = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const d = Math.hypot(a[i][0] - a[j][0], a[i][1] - a[j][1]);
        if (d <= 3.5) balance += 0.7 ** 2 / d ** 2 - (2 * 0.7 ** 4) / d ** 4;
      }
    assert.ok(Math.abs(balance) < 1e-10, `${n}: ${balance}`);
    const [p, q] = separatedFormations(a, equilibriumFormation(30), 1.5);
    assert.ok(Math.abs(minimumGap(p, q) - 1.5) < 1e-12);
  }
});
test("fresh seeds change both populations headings; fixed seeds replay exactly", () => {
  const e = swarmExperiment();
  const a = compileProductionExperiment(e, { seed: 1 }).initializer.state,
    b = compileProductionExperiment(e, { seed: 2 }).initializer.state;
  assert.deepEqual(
    a,
    compileProductionExperiment(e, { seed: 1 }).initializer.state,
  );
  for (const i of [0, 19, 20, 49]) assert.notEqual(a[i].heading, b[i].heading);
});

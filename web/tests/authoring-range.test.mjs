// #577 release 2: `for NAME in range(...)` in the Controller and Metrics
// (D-021). Arguments are run constants (numbers and parameters), so the number
// of iterations is fixed for the whole run; the loop variable is a scalar
// visible only inside the loop.

import assert from "node:assert/strict";
import test from "node:test";

import { compileController } from "../src/controller/compiler.js";
import { compileMetrics } from "../src/metrics/compiler.js";

const controller = (lines, parameters = { K: "scalar" }) => compileController(["class Probe(Agent):", "    def step(self, obs):", ...lines.map((line) => `        ${line}`)].join("\n"), { parameters });
const metric = (lines, parameters = { K: "scalar" }) => compileMetrics([
  '@metric(id="metric.one", name="Metric one", unit=None, sampling=every(0.1))',
  "def metric_one(snapshot):",
  ...lines.map((line) => `    ${line}`),
].join("\n"), { parameters });

test("the Controller loops over range with numbers and parameters", () => {
  const ir = controller([
    "total = 0.0",
    "for k in range(K):",
    "    total += k",
    "for j in range(1.0, K + 3.0, 2.0):",
    "    total += j % 2.0",
    "return Motion(total, 0.0)",
  ]);
  const loops = ir.body.filter((statement) => statement.kind === "for_each");
  assert.deepEqual(loops.map((loop) => [loop.variable, loop.iterable.name, loop.iterable.args.length]), [["k", "range", 1], ["j", "range", 3]]);
});

test("Metrics loop over range, including configuration parameters", () => {
  const ir = metric([
    "total = 0.0",
    "for k in range(snapshot.config.K):",
    "    total += k",
    "return total",
  ]);
  assert.match(JSON.stringify(ir), /"kind":"for_each","variable":"k","iterable":\{"kind":"call","name":"range"/);
});

test("range arguments must be run constants", () => {
  assert.throws(() => controller([
    "n = 3.0",
    "for k in range(n):",
    "    n = n",
    "return Motion(0.0, 0.0)",
  ]), /range arguments must be numbers or parameters/);
  assert.throws(() => controller([
    "for k in range(obs.environmental_scalar):",
    "    x = 1.0",
    "return Motion(0.0, 0.0)",
  ]), /range arguments must be (numbers or parameters|scalar)|environmental_scalar/);
  assert.throws(() => metric(["for k in range(1.0, 2.0, 1.0, 4.0):", "    x = 1.0", "return 0.0"]), /range expects 1, 2 or 3 arguments, got 4/);
});

test("range is only a loop iterable, and its variable is a scalar local of the loop", () => {
  assert.throws(() => controller(["x = range(3.0)", "return Motion(0.0, 0.0)"]), /range\(\.\.\.\) is only available as a for loop iterable/);
  assert.throws(() => metric(["return range(3.0)"]), /range\(\.\.\.\) is only available as a for loop iterable/);
  assert.throws(() => controller([
    "for k in range(3.0):",
    "    x = k",
    "return Motion(k, 0.0)",
  ]), /k/);
  assert.throws(() => controller([
    "k = Vec2(1.0, 0.0)",
    "for k in range(3.0):",
    "    x = 1.0",
    "return Motion(0.0, 0.0)",
  ]), /loop changes 'k' type/);
});

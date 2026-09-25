// #577 release 1: one operator set in every code artifact (D-021). `%` and
// `//` follow Python (floor division; the remainder takes the sign of the
// divisor) everywhere, and `and`/`or`/`not` work in Initialization with the
// Lab's semantics: boolean operands, both sides always evaluated.

import assert from "node:assert/strict";
import test from "node:test";

import { compileConfig } from "../src/config/compiler.js";
import { compileController } from "../src/controller/compiler.js";
import { compileEnvironmentScalar } from "../src/environment/compiler.js";
import { compileInitializer } from "../src/initializer/compiler.js";
import { compileMetrics } from "../src/metrics/compiler.js";

const config = compileConfig("N = 4\nARENA_SIZE = 10.0\nSEED = 7\n");
const initialize = (body) => compileInitializer(`def initialize(config, rng, place):\n${body}`, config).state;
const ops = (node, out = []) => {
  if (Array.isArray(node)) node.forEach((item) => ops(item, out));
  else if (node && typeof node === "object") {
    if (node.kind === "binary") out.push(node.op);
    Object.values(node).forEach((value) => ops(value, out));
  }
  return out;
};

test("the Controller accepts // and % on scalars and rejects them on vectors", () => {
  const ir = compileController([
    "class Probe(Agent):",
    "    def step(self, obs):",
    "        a = 7.0 // 2.0",
    "        b = 0.0 - 7.0 % 3.0",
    "        return Motion(a, b)",
  ].join("\n"));
  assert.deepEqual(ops(ir.body).sort(), ["%", "-", "//"]);
  assert.throws(() => compileController([
    "class Probe(Agent):",
    "    def step(self, obs):",
    "        v = obs.heading % 2.0",
    "        return Motion(0.0, 0.0)",
  ].join("\n")), /operator '%' cannot combine vec2 and scalar/);
});

test("Metrics accept // and %", () => {
  const ir = compileMetrics([
    '@metric(id="metric.one", name="Metric one", unit=None, sampling=every(0.1))',
    "def metric_one(snapshot):",
    "    return GAIN // 2.0 + GAIN % 3.0",
  ].join("\n"), { parameters: { GAIN: "scalar" } });
  assert.deepEqual(ops(ir).sort(), ["%", "+", "//"]);
});

test("the environment field accepts // and %", () => {
  const ir = compileEnvironmentScalar([
    "def environmental_scalar(x, y, config):",
    "    return x // 1.0 + y % 2.0",
    "",
    "def initialize(config, rng, place):",
    "    for i in range(config.N):",
    "        place(i, 0.0, 0.0, 0.0)",
  ].join("\n"), config);
  assert.deepEqual(ops(ir.expression).sort(), ["%", "+", "//"]);
});

test("Initialization evaluates and/or/not, and % // as Python does", () => {
  const state = initialize([
    "    for i in range(config.N):",
    "        x = 0.0",
    "        if i % 2 == 0 and not (i == 2):",
    "            x = 1.0",
    "        if i == 3 or i == 1:",
    "            x = x + 10.0",
    "        place(i, x, -7.0 // 2.0, -7.0 % 3.0)",
  ].join("\n"));
  assert.deepEqual(state.map((agent) => agent.x), [1, 10, 0, 10]);
  assert.deepEqual(state.map((agent) => [agent.y, agent.heading]), Array(4).fill([-4, 2]));
});

test("Initialization evaluates both sides of and/or, like the Controller and Metrics", () => {
  const consumed = initialize([
    "    skip = rng.uniform(0.0, 1.0)",
    "    for i in range(config.N):",
    "        place(i, rng.uniform(-1.0, 1.0), 0.0, 0.0)",
  ].join("\n"));
  const viaAnd = initialize([
    "    skip = False and rng.uniform(0.0, 1.0) < 2.0",
    "    for i in range(config.N):",
    "        place(i, rng.uniform(-1.0, 1.0), 0.0, 0.0)",
  ].join("\n"));
  assert.deepEqual(viaAnd, consumed, "the right-hand draw happens although the left side is False");
});

test("Initialization's and/or/not require boolean operands", () => {
  assert.throws(() => initialize("    b = 1.0 and True\n    for i in range(config.N):\n        place(i, 0.0, 0.0, 0.0)"), /'and' requires bool/);
  assert.throws(() => initialize("    b = not 0.0\n    for i in range(config.N):\n        place(i, 0.0, 0.0, 0.0)"), /'not' requires bool/);
});

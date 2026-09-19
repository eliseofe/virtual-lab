import assert from "node:assert/strict";
import test from "node:test";

import { compileController as compileBrowserController } from "../src/controller/compiler.js";
import { compileMetrics as compileBrowserMetrics } from "../src/metrics/compiler.js";
import { compileEnvironmentScalar as compileBrowserEnvironment } from "../src/environment/compiler.js";
import { compileInitializer as compileBrowserInitializer } from "../src/initializer/compiler.js";
import { compileController as compileEdgeController } from "../../supabase/functions/experiment-mcp/vendor/controller-compiler.js";
import { compileMetrics as compileEdgeMetrics } from "../../supabase/functions/experiment-mcp/vendor/metrics-compiler.js";
import { compileEnvironmentScalar as compileEdgeEnvironment } from "../../supabase/functions/experiment-mcp/vendor/environment-compiler.js";
import { compileInitializer as compileEdgeInitializer } from "../../supabase/functions/experiment-mcp/vendor/initializer-compiler.js";

const STANDARD_SCALAR_CALLS = [
  "abs", "sqrt", "exp", "log", "sin", "cos", "tan",
  "asin", "acos", "atan", "atan2", "floor", "ceil", "pow", "min", "max",
];

function callNames(node, out = new Set()) {
  if (!node || typeof node !== "object") return out;
  if (node.kind === "call") {
    out.add(node.name);
    for (const arg of node.args) callNames(arg, out);
  } else if (node.kind === "unary") {
    callNames(node.value, out);
  } else if (node.kind === "binary" || node.kind === "compare" || node.kind === "bool_op") {
    callNames(node.left, out);
    callNames(node.right, out);
  }
  return out;
}

test("#384 Controller exposes the generic scalar math set and lowers ** to pow", () => {
  const source = `class MathAgent(Agent):
    def step(self, obs):
        p = 2.0 ** 3.0 ** 2.0
        n = -2.0 ** 2.0
        a = abs(-2.0) + sqrt(4.0) + exp(0.0) + log(1.0)
        b = sin(0.0) + cos(0.0) + tan(0.0)
        c = asin(0.0) + acos(1.0) + atan(0.0) + atan2(0.0, 1.0)
        d = floor(1.9) + ceil(1.1) + min(3.0, 4.0) + max(3.0, 4.0)
        return Motion(p + n + a + b + c + d, 0.0)
`;
  const browser = compileBrowserController(source);
  const edge = compileEdgeController(source);
  assert.deepEqual(edge, browser);

  const first = browser.body[0].value;
  assert.equal(first.kind, "call");
  assert.equal(first.name, "pow");
  assert.equal(first.args[1].kind, "call");
  assert.equal(first.args[1].name, "pow");

  const second = browser.body[1].value;
  assert.equal(second.kind, "unary");
  assert.equal(second.value.kind, "call");
  assert.equal(second.value.name, "pow");

  const names = new Set();
  for (const statement of browser.body) {
    if (statement.value) callNames(statement.value, names);
  }
  for (const name of STANDARD_SCALAR_CALLS) assert.ok(names.has(name), `Controller missing ${name}`);
});

test("#384 Metrics exposes the same scalar math set and exponentiation syntax", () => {
  const source = `@metric(id="math.probe", name="Math probe", unit=None, sampling=final())
def math_probe(snapshot):
    p = 2.0 ** 3.0
    a = abs(-2.0) + sqrt(4.0) + exp(0.0) + log(1.0)
    b = sin(0.0) + cos(0.0) + tan(0.0)
    c = asin(0.0) + acos(1.0) + atan(0.0) + atan2(0.0, 1.0)
    d = floor(1.9) + ceil(1.1) + min(3.0, 4.0) + max(3.0, 4.0)
    return p + a + b + c + d
`;
  const browser = compileBrowserMetrics(source);
  const edge = compileEdgeMetrics(source);
  assert.deepEqual(edge, browser);
  const names = new Set();
  for (const statement of browser.metrics[0].body) {
    if (statement.value) callNames(statement.value, names);
  }
  for (const name of STANDARD_SCALAR_CALLS) assert.ok(names.has(name), `Metrics missing ${name}`);
});

test("#384 Environment exposes the same scalar math set and exponentiation syntax", () => {
  const source = `def initialize(config, rng, place):
    for i in range(config.N):
        place(i, 0.0, 0.0, 0.0)

def environmental_scalar(x, y, config):
    return 2.0 ** 3.0 + abs(-2.0) + sqrt(4.0) + exp(0.0) + log(1.0) + sin(x) + cos(y) + tan(0.0) + asin(0.0) + acos(1.0) + atan(0.0) + atan2(y, x + 1.0) + floor(1.9) + ceil(1.1) + min(x, y) + max(x, y)
`;
  const config = { values: { N: 1, SEED: 0 } };
  const browser = compileBrowserEnvironment(source, config);
  const edge = compileEdgeEnvironment(source, config);
  assert.deepEqual(edge, browser);
  const names = callNames(browser.expression);
  for (const name of STANDARD_SCALAR_CALLS) assert.ok(names.has(name), `Environment missing ${name}`);
});

test("#384 Initialization exposes the generic scalar math set without removing existing helpers", () => {
  const source = `def initialize(config, rng, place):
    p = 2.0 ** 3.0
    a = abs(-2.0) + sqrt(4.0) + exp(0.0) + log(1.0)
    b = sin(0.0) + cos(0.0) + tan(0.0)
    c = asin(0.0) + acos(1.0) + atan(0.0) + atan2(0.0, 1.0)
    d = floor(1.9) + ceil(1.1) + min(3.0, 4.0) + max(3.0, 4.0) + pow(2.0, 3.0)
    place(0, p - 8.0, a + b + c + d - 17.0, 0.0)
`;
  const config = { values: { N: 1, SEED: 0 } };
  const browser = compileBrowserInitializer(source, config);
  const edge = compileEdgeInitializer(source, config);
  assert.deepEqual(edge, browser);
  assert.equal(browser.state.length, 1);
  assert.ok(Number.isFinite(browser.state[0].x));
  assert.ok(Number.isFinite(browser.state[0].y));
});

test("#384 exponentiation follows Python-style unary precedence in Initialization", () => {
  const source = `def initialize(config, rng, place):
    x = -2.0 ** 2.0
    y = 2.0 ** -2.0
    place(0, x, y, 0.0)
`;
  const result = compileBrowserInitializer(source, { values: { N: 1, SEED: 0 } });
  assert.equal(result.state[0].x, -4.0);
  assert.equal(result.state[0].y, 0.25);
});

test("#384 non-finite numeric literals are rejected before persistence", () => {
  assert.throws(() => compileBrowserController(`class Bad(Agent):
    def step(self, obs):
        return Motion(1e309, 0.0)
`), /finite/);
  assert.throws(() => compileBrowserMetrics(`@metric(id="bad", name="Bad", unit=None, sampling=final())
def bad(snapshot):
    return 1e309
`), /finite/);
  assert.throws(() => compileBrowserInitializer(`def initialize(config, rng, place):
    place(0, 1e309, 0.0, 0.0)
`, { values: { N: 1, SEED: 0 } }), /finite/);
  assert.throws(() => compileBrowserEnvironment(`def environmental_scalar(x, y, config):
    return 1e309
`, { values: {} }), /finite/);
});

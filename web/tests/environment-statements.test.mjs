// #577 release 5: the environment field is a pure function of position whose
// body may use locals, += and if/elif/else, and must return a number on every
// path. A single return keeps the original IR (same simulator input).

import assert from "node:assert/strict";
import test from "node:test";

import { compileEnvironmentScalar as browserCompile } from "../src/environment/compiler.js";
import { compileEnvironmentScalar as edgeCompile } from "../../supabase/functions/experiment-mcp/vendor/environment-compiler.js";

const config = { values: { N: 2, R: 0.9, ARENA_SIZE: 10.0 } };
const field = (body) => `def environmental_scalar(x, y, config):\n${body}\n\ndef initialize(config, rng, place):\n    for i in range(config.N):\n        place(i, 0.0, 0.0, 0.0)\n`;
const both = (body) => {
  const ir = browserCompile(field(body), config);
  assert.deepEqual(edgeCompile(field(body), config), ir);
  return ir;
};
const rejected = (body, pattern) => {
  assert.throws(() => browserCompile(field(body), config), pattern);
  assert.throws(() => edgeCompile(field(body), config), pattern);
};

test("a single return keeps IR 0.1 and the same expression as before", () => {
  const ir = both("    return max(0.0, 1.0 - (x * x + y * y) / (config.R * config.R))");
  assert.equal(ir.schema, "vlab.environment-scalar-ir/0.1");
  assert.equal(ir.expression.kind, "call");
  assert.equal("body" in ir, false);
});

test("locals, += and if/elif/else compile to IR 0.2 with typed nodes", () => {
  const ir = both([
    "    d2 = x * x + y * y",
    "    inside = d2 < config.R * config.R",
    "    if inside and not (x < 0.0):",
    "        return 1.0",
    "    elif inside:",
    "        v = 0.5",
    "    else:",
    "        v = 0.0",
    "    v += 0.25",
    "    return v",
  ].join("\n"));
  assert.equal(ir.schema, "vlab.environment-scalar-ir/0.2");
  assert.deepEqual(ir.body.map((statement) => statement.kind), ["assign", "assign", "if", "aug_assign", "return"]);
  assert.equal(ir.body[1].value.kind, "compare");
  assert.equal(ir.body[2].branches[0].condition.kind, "bool_op");
  assert.deepEqual(ir.body[4].value, { kind: "local", name: "v" });
  assert.equal(JSON.stringify(ir).includes('"line"'), false, "no source lines in the simulator input");
});

test("every path must return a number, and locals must be assigned first", () => {
  rejected("    if x > 0.0:\n        return 1.0", /must return a number on every path/);
  rejected("    return x < 1.0", /must return a number/);
  rejected("    if x > 0.0:\n        v = 1.0\n    return v", /identifier 'v' is not available/);
  rejected("    v += 1.0\n    return v", /'v' must be a number assigned before '\+='/);
  rejected("    if x:\n        return 1.0\n    return 0.0", /condition must be True\/False/);
  rejected("    return 1.0\n    v = 2.0", /statement after return is never reached/);
  rejected("    x = 1.0\n    return x", /'x' cannot be assigned/);
  rejected("    b = x > 0.0\n    b = 1.0\n    return b", /assignment changes 'b' from bool to scalar/);
  rejected("    return 1.0 and True", /'and' requires True\/False operands/);
  rejected("    v = rng.uniform(0.0, 1.0)\n    return v", /not available to environmental_scalar/);
});

test("branch-local names are usable after the if only when every continuing path assigns them", () => {
  both("    if x > 0.0:\n        v = 1.0\n    else:\n        v = 2.0\n    return v");
  both("    if x > 0.0:\n        return 3.0\n    else:\n        v = 2.0\n    return v");
});

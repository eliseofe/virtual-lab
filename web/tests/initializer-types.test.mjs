// #577 release 3: Initialization is type-checked before it runs, with the
// Controller's rules (D-021). Errors in branches or helpers that a particular
// run would not reach are reported too; a program that passes runs exactly as
// before (the evaluator is unchanged).

import assert from "node:assert/strict";
import test from "node:test";

import { compileConfig } from "../src/config/compiler.js";
import { compileInitializer } from "../src/initializer/compiler.js";

const config = compileConfig('N = 2\nARENA_SIZE = 10.0\nSEED = 7\nMETHOD = "grid"\n');
const compile = (lines) => compileInitializer(lines.join("\n"), config);
const placeAll = ["    for i in range(config.N):", "        place(i, 0.0, 0.0, 0.0)"];

test("an error in a branch this run does not take is still reported", () => {
  assert.throws(() => compile([
    "def initialize(config, rng, place):",
    '    if config.METHOD == "random":',
    '        place(0, 0.0, 0.0, "north")',
    ...placeAll,
  ]), /place argument 4 must be scalar, got string/);
});

test("helpers are checked with the argument types they are called with", () => {
  assert.throws(() => compile([
    "def spread(i, gap):",
    "    return i * gap",
    "",
    "def initialize(config, rng, place):",
    '    x = spread(1.0, "wide")',
    ...placeAll,
  ]), /operator '\*' cannot combine scalar and string/);
  assert.throws(() => compile([
    "def loop(i):",
    "    return loop(i)",
    "",
    "def initialize(config, rng, place):",
    "    x = loop(1.0)",
    ...placeAll,
  ]), /recursive call to 'loop' is not supported/);
});

test("conditions are booleans, names keep one type and are assigned before use", () => {
  assert.throws(() => compile(["def initialize(config, rng, place):", "    if 1.0:", "        x = 1.0", ...placeAll]), /if\/elif condition must be bool, got scalar/);
  assert.throws(() => compile(["def initialize(config, rng, place):", "    x = 1.0", '    x = "a"', ...placeAll]), /'x' changes type from scalar to string/);
  assert.throws(() => compile([
    "def initialize(config, rng, place):",
    "    if config.N > 1:",
    "        x = 1.0",
    "    for i in range(config.N):",
    "        place(i, x, 0.0, 0.0)",
  ]), /unknown identifier 'x'/);
});

test("a name assigned on every branch stays defined, and valid programs run as before", () => {
  const state = compile([
    "def initialize(config, rng, place):",
    "    if config.N > 1:",
    "        x = 1.0",
    "    else:",
    "        x = 2.0",
    "    for i in range(config.N):",
    "        place(i, x + i, 0.0, 0.0)",
  ]).state;
  assert.deepEqual(state.map((agent) => agent.x), [1, 2]);
});

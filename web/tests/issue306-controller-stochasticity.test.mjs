import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { compileController, ControllerCompileError } from "../src/controller/compiler.js";
import { IMPLEMENTED_CAPABILITY_BINDINGS } from "../src/capability-bindings.js";
import { AUTHORING_CONTRACT } from "../../supabase/functions/experiment-mcp/authoring.js";

const browserCompiler = readFileSync(new URL("../src/controller/compiler.js", import.meta.url), "utf8");
const edgeCompiler = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/vendor/controller-compiler.js", import.meta.url),
  "utf8",
);
const browserBindings = readFileSync(new URL("../src/capability-bindings.js", import.meta.url), "utf8");
const edgeBindings = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/capability-bindings.js", import.meta.url),
  "utf8",
);
const rngDoc = readFileSync(new URL("../../docs/RNG_CONTRACT.md", import.meta.url), "utf8");

test("#306 browser and MCP expose one identical stochastic controller surface", () => {
  assert.equal(browserCompiler, edgeCompiler);
  assert.equal(browserBindings, edgeBindings);
  const binding = IMPLEMENTED_CAPABILITY_BINDINGS.find(
    (item) => item.capability_key === "controller.stochastic_distributions",
  );
  assert.ok(binding);
  assert.deepEqual(
    binding.surfaces.map((surface) => [surface.symbol, surface.signature?.result]),
    [
      ["rng.uniform", "scalar"],
      ["rng.bernoulli", "bool"],
      ["rng.normal", "scalar"],
    ],
  );
});

test("#306 controller compiler emits typed stochastic calls in ordinary control flow", () => {
  const ir = compileController(`class Stochastic(Agent):
    def step(self, obs):
        if rng.bernoulli(0.35):
            turn = rng.normal(0.0, 0.2)
        else:
            turn = rng.uniform(-0.5, 0.5)
        return Motion(0.3, turn)
`);
  assert.equal(ir.schema, "vlab.controller-ir/0.1");
  const serialized = JSON.stringify(ir);
  assert.match(serialized, /"name":"rng\.bernoulli"/);
  assert.match(serialized, /"name":"rng\.normal"/);
  assert.match(serialized, /"name":"rng\.uniform"/);
});

test("#306 stochastic intrinsics keep strict type and capability walls", () => {
  assert.throws(
    () => compileController(`class Bad(Agent):
    def step(self, obs):
        x = rng.uniform(True, 1.0)
        return Motion(0.0, x)
`),
    (error) => error instanceof ControllerCompileError
      && error.category === "type"
      && /rng\.uniform argument 1 expects scalar, got bool/.test(error.message),
  );

  assert.throws(
    () => compileController(`class Missing(Agent):
    def step(self, obs):
        x = rng.exponential(1.0)
        return Motion(0.0, x)
`),
    (error) => error instanceof ControllerCompileError
      && error.category === "unsupported-capability",
  );
});

test("#306 authoring contract freezes distribution and stream semantics", () => {
  const stochasticity = AUTHORING_CONTRACT.artifacts.controller.stochasticity;
  assert.equal(stochasticity.contract_version, "vlab.controller-stochasticity/1");
  assert.equal(stochasticity.rng_contract_version, "vlab.rng/splitmix64-domain/1");
  assert.match(stochasticity.stream_model, /One simulator-owned deterministic controller RNG stream per agent/);
  assert.match(stochasticity.distributions["rng.uniform"], /exactly one/);
  assert.match(stochasticity.distributions["rng.bernoulli"], /exactly one/);
  assert.match(stochasticity.distributions["rng.normal"], /exactly two/);
  assert.match(stochasticity.ownership_boundary, /cannot read raw stream state/);
  assert.match(rngDoc, /Stream index equals the stable zero-based agent index/);
});

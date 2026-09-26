import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AUTHORING_CONTRACT,
  validateExperimentSources,
} from "../../supabase/functions/experiment-mcp/authoring.js";
import { CANONICAL_CAPABILITY_BINDINGS } from "../../supabase/functions/experiment-mcp/canonical-capability-bindings.js";

const browserBindings = readFileSync(
  new URL("../src/capability-bindings.js", import.meta.url),
  "utf8",
);
const edgeBindings = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/capability-bindings.js", import.meta.url),
  "utf8",
);
const browserController = readFileSync(
  new URL("../src/controller/compiler.js", import.meta.url),
  "utf8",
);
const edgeController = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/vendor/controller-compiler.js", import.meta.url),
  "utf8",
);
const mcp = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url),
  "utf8",
);
const versions = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/metrics-results-tools.ts", import.meta.url),
  "utf8",
);

const FIXTURE = {
  config_source: `N = 2
ARENA_SIZE = 10.0
CONTROL_DT = 0.1
SENSOR_NOISE = 0.0
EXPERIMENT_DURATION = 1.0
INTERACTION_RADIUS = 2.0
MAX_FORWARD_SPEED = 1.0
MAX_ANGULAR_SPEED = 1.0
GAIN = 0.5
`,
  initializer_source: `def initialize(config, rng, place):
    place(0, 0.0, 0.0, 0.0)
    place(1, 1.0, 0.0, 0.0)
`,
  controller_source: `class Probe(Agent):
    memory = 0.0
    def step(self, obs):
        offset = Vec2(0.0, 0.0)
        for neighbour in obs.neighbours:
            offset += neighbour.relative_position
        self.memory += GAIN
        turn = dot(obs.heading, perpendicular(offset))
        return Motion(GAIN, turn)
`,
  metrics_source: "",
};

test("#375 stable authoring contract no longer carries the current capability inventory", () => {
  assert.equal(AUTHORING_CONTRACT.contract_version, "vlab.authoring/0.17");
  assert.equal(AUTHORING_CONTRACT.capability_resolution.authority, "capability_registry");
  assert.equal(AUTHORING_CONTRACT.capability_resolution.unregistered_surface_policy, "reject");
  assert.equal(AUTHORING_CONTRACT.capability_resolution.candidate_surface_policy, "not_authorable");
  assert.equal(Object.prototype.hasOwnProperty.call(AUTHORING_CONTRACT, "canonical_capability_bindings"), false);

  const serialized = JSON.stringify(AUTHORING_CONTRACT);
  for (const capabilityOwned of [
    "obs.heading",
    "obs.neighbours",
    "neighbour.relative_position",
    "obs.environmental_scalar",
    "Motion",
    "rng.uniform",
    "INTERACTION_RADIUS",
    "SENSOR_NOISE",
    "MAX_FORWARD_SPEED",
    "MAX_ANGULAR_SPEED",
  ]) {
    assert.equal(serialized.includes(capabilityOwned), false, `stable contract leaked capability surface ${capabilityOwned}`);
  }

  assert.deepEqual(AUTHORING_CONTRACT.artifacts.controller.security_boundary.forbidden_host_roots, ["filesystem", "network"]);
});

test("#375 implemented capabilities own typed concrete authoring surfaces", () => {
  assert.equal(CANONICAL_CAPABILITY_BINDINGS.length, 15);
  assert.equal(browserBindings, edgeBindings, "browser and edge capability surfaces must remain byte-identical");

  const surfaces = CANONICAL_CAPABILITY_BINDINGS.flatMap((binding) =>
    binding.surfaces.map((surface) => ({ ...surface, capability_key: binding.capability_key }))
  );

  for (const surface of surfaces) {
    assert.ok(surface.artifact);
    assert.ok(surface.kind);
    assert.ok(surface.symbol);
  }

  assert.ok(surfaces.some((s) => s.capability_key === "motion.forward_turning_kinematics"
    && s.symbol === "Motion"
    && s.signature?.result === "action"));
  assert.ok(surfaces.some((s) => s.capability_key === "observation.self_heading"
    && s.symbol === "obs.heading"
    && s.value_type === "vec2"));
  assert.ok(surfaces.some((s) => s.capability_key === "initialization.uniform_rng"
    && s.symbol === "rng.uniform"
    && s.signature?.result === "scalar"));
});

test("#375 browser and edge controller compilers consume the same implemented capability surface", () => {
  assert.equal(browserController, edgeController, "vendored controller compiler must remain byte-identical to browser production");
  assert.match(browserController, /IMPLEMENTED_CAPABILITY_BINDINGS/);
  assert.match(browserController, /SECURITY_FORBIDDEN_ROOTS = new Set\(\["filesystem", "network"\]\)/);
  assert.doesNotMatch(browserController, /FORBIDDEN_ROOTS = new Set\(\[\s*"random"/);
  assert.doesNotMatch(browserController, /"obs\.heading"\) return "vec2"/);
  assert.doesNotMatch(browserController, /"obs\.neighbours"\) return "neighbours"/);
});

test("#375 currently supported controller programs remain valid", () => {
  const result = validateExperimentSources(FIXTURE);
  assert.equal(result.valid, true, JSON.stringify(result, null, 2));
  assert.equal(result.contract_version, "vlab.authoring/0.17");
});

test("#375 unsupported observation remains blocked as a semantic capability", () => {
  const result = validateExperimentSources({
    ...FIXTURE,
    controller_source: `class Probe(Agent):
    def step(self, obs):
        x = obs.global_positions
        return Motion(0.0, 0.0)
`,
  });
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].category, "invalid-observation-field");
  assert.equal(result.diagnostics[0].diagnostic_class, "semantic_capability");
  assert.equal(result.diagnostics[0].request_class, "semantic_capability");
});

test("#375 implemented controller RNG capability is resolved through the capability registry", () => {
  const result = validateExperimentSources({
    ...FIXTURE,
    controller_source: `class Probe(Agent):
    def step(self, obs):
        if rng.bernoulli(0.5):
            turn = rng.normal(0.0, 0.2)
        else:
            turn = rng.uniform(-0.2, 0.2)
        return Motion(0.5, turn)
`,
  });
  assert.equal(result.valid, true, JSON.stringify(result, null, 2));
});

test("#375 true host security remains a separate forbidden boundary", () => {
  const result = validateExperimentSources({
    ...FIXTURE,
    controller_source: `class Probe(Agent):
    def step(self, obs):
        x = network
        return Motion(0.0, 0.0)
`,
  });
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].category, "forbidden-capability");
  assert.equal(result.diagnostics[0].diagnostic_class, "forbidden_security_boundary");
  assert.equal(result.diagnostics[0].request_class, "security_boundary");
});

test("#375 missing language syntax remains distinct from missing scientific capability", () => {
  const result = validateExperimentSources({
    ...FIXTURE,
    controller_source: `class Probe(Agent):
    def step(self, obs):
        while True:
            return Motion(0.0, 0.0)
`,
  });
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].category, "unsupported-feature");
  assert.equal(result.diagnostics[0].diagnostic_class, "authoring_language");
  assert.equal(result.diagnostics[0].request_class, "authoring_language");
});

test("#375 neutral MCP discovery keeps contract and capabilities separate but joins surfaces onto capability entries", () => {
  assert.match(mcp, /CANONICAL_CAPABILITY_BINDINGS/);
  assert.match(mcp, /authoring_surfaces: binding\?\.surfaces \?\? \[\]/);
  assert.match(mcp, /capability_registry: discoverableCapabilityRegistry/);
  assert.doesNotMatch(mcp, /AUTHORING_CONTRACT\.canonical_capability_bindings/);
  assert.match(versions, /MCP_SERVER_VERSION = '3\.27\.0'/);
  assert.match(versions, /MCP_INTERFACE_VERSION = '17'/);
  assert.match(versions, /contract_version: 'vlab\.authoring\/0\.17'/);
});

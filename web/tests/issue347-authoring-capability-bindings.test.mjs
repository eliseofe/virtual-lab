import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AUTHORING_CONTRACT,
  validateExperimentSources,
} from "../../supabase/functions/experiment-mcp/authoring.js";
import { CANONICAL_CAPABILITY_BINDINGS } from "../../supabase/functions/experiment-mcp/canonical-capability-bindings.js";

const registryMigration = readFileSync(
  new URL("../../supabase/migrations/20260918181000_canonical_capability_registry_v1.sql", import.meta.url),
  "utf8",
);
const authoringSource = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/authoring.js", import.meta.url),
  "utf8",
);
const bindingSource = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/canonical-capability-bindings.js", import.meta.url),
  "utf8",
);
const capabilityBindingSource = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/capability-bindings.js", import.meta.url),
  "utf8",
);
const mcpSource = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url),
  "utf8",
);

const fixture = {
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
    def step(self, obs):
        return Motion(GAIN, 0.0)
`,
  metrics_source: "",
};

function implementedRegistryRows(sql) {
  const row = /\(\s*'([0-9a-f-]{36})'::uuid,\s*'([^']+)',\s*'[^']+',\s*'[^']+',\s*'[^']+',\s*'(implemented|not_implemented)'/g;
  return [...sql.matchAll(row)]
    .map((match) => ({ id: match[1], key: match[2], state: match[3] }))
    .filter(({ state }) => state === "implemented");
}

test("#347 authoring bindings preserve the frozen registry and reference later canonical additions explicitly", () => {
  const rows = implementedRegistryRows(registryMigration);
  assert.equal(rows.length, 11, "the historical registry migration remains frozen");
  assert.equal(CANONICAL_CAPABILITY_BINDINGS.length, 15);

  const byId = new Map(rows.map((row) => [row.id, row.key]));
  const ids = new Set();
  const keys = new Set();

  for (const binding of CANONICAL_CAPABILITY_BINDINGS) {
    assert.equal(ids.has(binding.canonical_capability_id), false, "duplicate canonical UUID binding");
    assert.equal(keys.has(binding.capability_key), false, "duplicate canonical key binding");
    ids.add(binding.canonical_capability_id);
    keys.add(binding.capability_key);
    const laterCanonicalAdditions = new Map([
      ["initialization.per_agent_private_state_assignment", "25ee37e5-ba59-4e8a-9768-a5604e2501b5"],
      ["controller.stochastic_distributions", "1c8ae3f7-15bd-4d01-b320-6ca166989d22"],
      ["observation.named_reference_relative_position", "1fbe59fb-79f3-48f7-9500-16557297ea0a"],
      ["initialization.swarm_groups", "e7be7240-af33-4f44-9e57-17eccf4a861b"],
    ]);
    if (laterCanonicalAdditions.has(binding.capability_key)) {
      assert.equal(binding.canonical_capability_id, laterCanonicalAdditions.get(binding.capability_key));
    } else {
      assert.equal(byId.get(binding.canonical_capability_id), binding.capability_key);
    }
    assert.ok(binding.surfaces.length > 0);
  }

  for (const row of rows) {
    assert.equal(ids.has(row.id), true, "frozen implemented canonical capability lacks an authoring binding: " + row.key);
  }
});

test("#347 capability bindings stay separate from canonical meaning/status/provenance and from the language contract", () => {
  assert.equal(Object.prototype.hasOwnProperty.call(AUTHORING_CONTRACT, "canonical_capability_bindings"), false);
  assert.equal(AUTHORING_CONTRACT.capability_resolution.authority, "capability_registry");

  const serializedBindings = JSON.stringify(CANONICAL_CAPABILITY_BINDINGS);
  for (const forbidden of [
    "canonical_definition",
    "capability_name",
    "implementation_state",
    "implementation_version",
    "implemented_at",
    "publication_provenance",
    "publication_identifier",
    "publication_title",
  ]) {
    assert.equal(serializedBindings.includes(forbidden), false, "binding duplicated canonical truth: " + forbidden);
  }
});

test("#347 runtime/compiler authoring remains static and has no Supabase capability lookup", () => {
  assert.match(bindingSource, /IMPLEMENTED_CAPABILITY_BINDINGS as CANONICAL_CAPABILITY_BINDINGS/);
  assert.doesNotMatch(capabilityBindingSource, /\.from\(|\.rpc\(|fetch\(/);
  assert.doesNotMatch(authoringSource, /\.from\(['"]canonical_capabilities['"]\)|list_canonical_capability_registry/);
  assert.doesNotMatch(authoringSource, /canonical_capability_bindings/);
});

test("#347 separates semantic capability from authoring-language diagnostics", () => {
  const semantic = validateExperimentSources({
    ...fixture,
    controller_source: `class Probe(Agent):
    def step(self, obs):
        x = obs.global_positions
        return Motion(0.0, 0.0)
`,
  });
  assert.equal(semantic.valid, false);
  assert.equal(semantic.diagnostics[0].category, "invalid-observation-field");
  assert.equal(semantic.diagnostics[0].diagnostic_class, "semantic_capability");
  assert.equal(semantic.diagnostics[0].request_class, "semantic_capability");

  const language = validateExperimentSources({
    ...fixture,
    controller_source: `class Probe(Agent):
    def step(self, obs):
        while True:
            return Motion(0.0, 0.0)
`,
  });
  assert.equal(language.valid, false);
  assert.equal(language.diagnostics[0].category, "unsupported-feature");
  assert.equal(language.diagnostics[0].diagnostic_class, "authoring_language");
  assert.equal(language.diagnostics[0].request_class, "authoring_language");
});

test("#347 separates runtime/configuration, forbidden-boundary and ordinary validation diagnostics", () => {
  const runtime = validateExperimentSources({
    ...fixture,
    config_source: fixture.config_source.replace("INTERACTION_RADIUS = 2.0\n", ""),
  });
  assert.equal(runtime.diagnostics[0].category, "runtime-parameter");
  assert.equal(runtime.diagnostics[0].diagnostic_class, "runtime_configuration");
  assert.equal(runtime.diagnostics[0].request_class, "runtime_configuration");

  const forbidden = validateExperimentSources({
    ...fixture,
    controller_source: `class Probe(Agent):
    def step(self, obs):
        x = network
        return Motion(0.0, 0.0)
`,
  });
  assert.equal(forbidden.diagnostics[0].category, "forbidden-capability");
  assert.equal(forbidden.diagnostics[0].diagnostic_class, "forbidden_security_boundary");
  assert.equal(forbidden.diagnostics[0].request_class, "security_boundary");

  const typeError = validateExperimentSources({
    ...fixture,
    controller_source: `class Probe(Agent):
    def step(self, obs):
        return Motion(obs.heading, 0.0)
`,
  });
  assert.equal(typeError.diagnostics[0].category, "type");
  assert.equal(typeError.diagnostics[0].diagnostic_class, "type_validation");
  assert.equal(typeError.diagnostics[0].request_class, null);
});

test("#347 extension routing uses typed diagnostic request classes and never auto-rejects", () => {
  assert.match(mcpSource, /extension_request_behavior: extensionRequestBehavior\(role\)/);
  assert.match(mcpSource, /diagnostic_request_classes: requestClasses/);
  assert.match(mcpSource, /automatic_rejection_classes: \[\]/);
  assert.doesNotMatch(mcpSource, /unsupported_capability_behavior/);
  assert.equal(AUTHORING_CONTRACT.artifact_execution.optional_executable.unsupported_request_class, "artifact_workflow");
});

test("#347 current authoring syntax remains intact while concrete robot surfaces live on capabilities", () => {
  assert.equal(AUTHORING_CONTRACT.contract_version, "vlab.authoring/0.14");
  assert.equal(AUTHORING_CONTRACT.artifacts.initialization.entry, "initialize(config, rng, place)");
  assert.equal(AUTHORING_CONTRACT.artifacts.controller.entry, "step(self, obs)");
  assert.equal(AUTHORING_CONTRACT.artifacts.metrics.language, "python-vlab-metrics/0.1");

  const surfaces = CANONICAL_CAPABILITY_BINDINGS.flatMap((binding) => binding.surfaces);
  assert.ok(surfaces.some((surface) => surface.symbol === "Motion" && surface.kind === "action_constructor"));
  assert.ok(surfaces.some((surface) => surface.symbol === "obs.heading" && surface.value_type === "vec2"));
  assert.ok(surfaces.some((surface) => surface.symbol === "obs.neighbours" && surface.value_type === "neighbours"));
  assert.ok(surfaces.some((surface) => surface.symbol === "neighbour.relative_position" && surface.value_type === "vec2"));
  assert.ok(surfaces.some((surface) => surface.symbol === "obs.environmental_scalar" && surface.value_type === "scalar"));
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { IMPLEMENTED_CAPABILITY_BINDINGS } from "../src/capability-bindings.js";
import { compileConfig, numericParameters } from "../src/config/compiler.js";
import { compileController } from "../src/controller/compiler.js";
import { compileInitializer } from "../src/initializer/compiler.js";
import { compileMetrics } from "../src/metrics/compiler.js";
import { registryExperimentRunnability } from "../src/experiment-validation.js";

const configuration = `N = 2
ARENA_SIZE = 10.0
CONTROL_DT = 0.1
EXPERIMENT_DURATION = 1.0
INTERACTION_RADIUS = 1.0
MAX_FORWARD_SPEED = 1.0
MAX_ANGULAR_SPEED = 1.0
SENSOR_NOISE = 0.0
`;

const initialization = `def initialize(config, rng, place):
    group("far", count=1, placement="explicit")
    group("near", count=1, placement="explicit")
    place(0, -4.9, 0.0, 0.0, group="far")
    place(1, 0.0, 0.0, 0.0, group="near")
    define_reference("goal", 4.9, 0.0)
    equip("far", "goal")
    equip("near", "goal", range=1.0)
`;

const controller = `class ReferenceAgent(Agent):
    def step(self, obs):
        if obs.references.goal.available:
            return Motion(0.1 + 0.0 * norm(obs.references.goal.relative_position), 0.0)
        else:
            return Motion(0.0, 0.0)
`;

const metrics = `@metric(id="reference.norm", name="Reference norm", sampling=every(0.1))
def reference_norm(snapshot):
    return norm(snapshot.references.goal.position)
`;

function compiled() {
  const config = compileConfig(configuration);
  const initializer = compileInitializer(initialization, {
    ...config,
    values: { ...config.values, SEED: 17 },
  });
  const parameters = numericParameters(config);
  const parameterTypes = Object.fromEntries(Object.keys(parameters).map((name) => [name, "scalar"]));
  const references = initializer.world_references.references.map(({ name }) => name);
  return {
    initializer,
    controller: compileController(controller, { parameters: parameterTypes, references }),
    metrics: compileMetrics(metrics, { parameters: parameterTypes, references }),
  };
}

test("#504 compilers expose only declared named reference surfaces", () => {
  const result = compiled();
  assert.deepEqual(result.controller.references, ["goal"]);
  assert.deepEqual(result.metrics.references, ["goal"]);
  assert.match(JSON.stringify(result.controller.body), /obs\.references\.goal\.available/);
  assert.match(JSON.stringify(result.controller.body), /obs\.references\.goal\.relative_position/);
  assert.ok(result.metrics.observation_contract.fields.includes("snapshot.references.goal.position"));

  assert.throws(
    () => compileController(
      `class Bad(Agent):
    def step(self, obs):
        return Motion(norm(obs.references.missing.relative_position), 0.0)
`,
      { references: ["goal"] },
    ),
    /unknown world reference 'missing'/,
  );
  assert.throws(
    () => compileMetrics(
      `@metric(id="bad", name="Bad", sampling=final())
def bad(snapshot):
    return norm(snapshot.references.missing.position)
`,
      { references: ["goal"] },
    ),
    /unknown metric snapshot field 'snapshot\.references\.missing\.position'/,
  );
});

test("#504 cross-artifact validation accepts the complete reference experiment", () => {
  const result = registryExperimentRunnability({
    config_source: configuration,
    initializer_source: initialization,
    controller_source: controller,
    metrics_source: metrics,
  });
  assert.equal(result.runnable, true, result.error);
});

test("#504 capability binding advertises generic static reference authoring without dynamics", () => {
  const binding = IMPLEMENTED_CAPABILITY_BINDINGS.find(
    ({ capability_key }) => capability_key === "observation.named_reference_relative_position",
  );
  assert.ok(binding);
  assert.equal(binding.canonical_capability_id, "1fbe59fb-79f3-48f7-9500-16557297ea0a");
  assert.deepEqual(
    binding.surfaces.map(({ symbol }) => symbol),
    [
      "define_reference",
      "equip",
      "obs.references.<name>.available",
      "obs.references.<name>.relative_position",
      "snapshot.references.<name>.position",
    ],
  );
  assert.equal(JSON.stringify(binding).includes("dynamic"), false);
});

test("#504 browser and MCP capability/compiler sources remain byte-identical", async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "..", "..");
  for (const [browserPath, edgePath] of [
    ["web/src/capability-bindings.js", "supabase/functions/experiment-mcp/capability-bindings.js"],
    ["web/src/controller/compiler.js", "supabase/functions/experiment-mcp/vendor/controller-compiler.js"],
    ["web/src/metrics/compiler.js", "supabase/functions/experiment-mcp/vendor/metrics-compiler.js"],
    ["web/src/initializer/compiler.js", "supabase/functions/experiment-mcp/vendor/initializer-compiler.js"],
  ]) {
    const [browser, edge] = await Promise.all([
      readFile(path.join(repoRoot, browserPath), "utf8"),
      readFile(path.join(repoRoot, edgePath), "utf8"),
    ]);
    assert.equal(edge, browser, `${edgePath} drifted from ${browserPath}`);
  }
});

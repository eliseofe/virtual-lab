import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { compileConfig, numericParameters } from "../src/config/compiler.js";
import { compileInitializer } from "../src/initializer/compiler.js";
import { compileController as compileBrowserController } from "../src/controller/compiler.js";
import { compileMetrics as compileBrowserMetrics } from "../src/metrics/compiler.js";
import { compileController as compileEdgeController } from "../../supabase/functions/experiment-mcp/vendor/controller-compiler.js";
import { compileMetrics as compileEdgeMetrics } from "../../supabase/functions/experiment-mcp/vendor/metrics-compiler.js";

const configuration = `N = 3
CONTROL_DT = 0.1
EXPERIMENT_DURATION = 2.0
ARENA_SIZE = 10.0
INTERACTION_RADIUS = 2.0
MAX_FORWARD_SPEED = 2.0
MAX_ANGULAR_SPEED = 2.0
SENSOR_NOISE = 0.0
GAIN = 0.5
`;

const initialization = `def initialize(config, rng, place):
    for i in range(config.N):
        if i == 0:
            x = sin(0.0) + cos(0.0)
        else:
            x = i * 0.5
        y = atan2(0.0, 1.0)
        place(i, x, y, 0.0)
`;

const controller = `class AcceptanceAgent(Agent):
    def step(self, obs):
        neighbours = obs.neighbours
        total = Vec2(0.0, 0.0)
        for n in neighbours:
            distance = norm(n.relative_position)
            if distance > 0.0 and not False:
                total += n.relative_position
        longitudinal = dot(total, obs.heading)
        lateral = dot(total, perpendicular(obs.heading))
        if longitudinal > 0.0:
            speed = min(max(sin(longitudinal) ** 2.0, 0.0), 1.0)
        elif longitudinal == 0.0:
            speed = 0.5
        else:
            speed = abs(cos(longitudinal))
        turning = atan2(lateral, abs(longitudinal) + 1.0)
        return Motion(speed, turning)
`;

const metrics = `@metric(id="acceptance.count", name="Acceptance count", unit=None, sampling=final())
def acceptance_count(snapshot):
    count = 0.0
    for agent in snapshot.agents:
        if agent.heading_angle >= -3.2 and agent.heading_angle <= 3.2:
            count += 1.0
    if count > 0.0:
        return sqrt(count ** 2.0)
    else:
        return 0.0
`;

function parameters(config) {
  return Object.fromEntries(Object.keys(numericParameters(config)).map((name) => [name, "scalar"]));
}

test("#386 completed generic language compiles identically in browser and MCP authoring compilers", () => {
  const config = compileConfig(configuration);
  const init = compileInitializer(initialization, { ...config, values: { ...config.values, SEED: 42 } });
  assert.equal(init.state.length, 3);

  const types = parameters(config);
  const browserController = compileBrowserController(controller, { parameters: types });
  const edgeController = compileEdgeController(controller, { parameters: types });
  assert.deepEqual(edgeController, browserController);

  const browserMetrics = compileBrowserMetrics(metrics, { parameters: types });
  const edgeMetrics = compileEdgeMetrics(metrics, { parameters: types });
  assert.deepEqual(edgeMetrics, browserMetrics);

  const serializedController = JSON.stringify(browserController);
  for (const required of [
    '"kind":"if"', '"kind":"compare"', '"kind":"bool_op"', '"op":"not"',
    '"name":"pow"', '"name":"sin"', '"name":"cos"', '"name":"abs"',
    '"name":"min"', '"name":"max"', '"name":"atan2"'
  ]) assert.ok(serializedController.includes(required), required);

  const serializedMetrics = JSON.stringify(browserMetrics);
  for (const required of [
    '"kind":"if"', '"kind":"compare"', '"kind":"bool_op"',
    '"name":"pow"', '"name":"sqrt"'
  ]) assert.ok(serializedMetrics.includes(required), required);
});

test("#386 unsupported scientific surfaces remain outside the generic language", () => {
  const config = compileConfig(configuration);
  const types = parameters(config);

  const missingObservation = `class MissingScience(Agent):
    def step(self, obs):
        if obs.r_min < 0.5:
            return Motion(0.0, 1.0)
        return Motion(1.0, 0.0)
`;

  assert.throws(
    () => compileBrowserController(missingObservation, { parameters: types }),
    /not implemented|unavailable|unknown/,
  );
  assert.throws(
    () => compileEdgeController(missingObservation, { parameters: types }),
    /not implemented|unavailable|unknown/,
  );
});

test("#386 persisted source-changing paths still cross the hard authoring wall and candidates remain non-authorable", async () => {
  const [authoring, index] = await Promise.all([
    readFile(new URL("../../supabase/functions/experiment-mcp/authoring.js", import.meta.url), "utf8"),
    readFile(new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(authoring, /candidate_surface_policy:\s*"not_authorable"/);
  assert.match(authoring, /unregistered_surface_policy:\s*"reject"/);
  assert.match(index, /create_experiment[\s\S]*validateExperimentArtifacts\(artifacts\)/);
  assert.match(index, /edit_experiment[\s\S]*validateExperimentArtifacts\(artifacts\)/);
});

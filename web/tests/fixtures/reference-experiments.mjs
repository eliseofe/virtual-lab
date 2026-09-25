// Reference Experiments for the behaviour-preservation safety net (#425).
//
// These are software-coverage fixtures, not scientific definitions. The
// Active Elastic entries reuse the owner-authorized catalog Experiment
// verbatim; the others reuse small sources already present in the regression
// tests so that initialization randomness, controller randomness, private
// state, the scalar Environment field and named world references are all
// exercised end to end.
//
// Changing this file changes the recorded reference. Regenerate with
// `node web/scripts/reference-runs.mjs --update` and
// `VLAB_UPDATE_REFERENCE=1 cargo test --test reference_runs`, and explain why
// in the commit message.

import { EXPERIMENT_CATALOG } from "../../src/experiment-catalog.js";

function catalogArtifacts(key) {
  const experiment = EXPERIMENT_CATALOG.find((entry) => entry.key === key) ?? EXPERIMENT_CATALOG[0];
  const byType = Object.fromEntries(experiment.artifacts.map((artifact) => [artifact.type, artifact.content]));
  return {
    configuration: byType.configuration,
    initialization: byType.initialization,
    controller: byType.controller,
    metrics: byType.metrics ?? "",
  };
}

const activeElastic = catalogArtifacts(EXPERIMENT_CATALOG[0].key);

function withConfigLine(configuration, name, value) {
  const pattern = new RegExp(`^${name} = .*$`, "m");
  if (!pattern.test(configuration)) throw new Error(`reference fixture: configuration has no ${name}`);
  return configuration.replace(pattern, `${name} = ${value}`);
}

const smallRuntime = `ARENA_SIZE = 10.0
CONTROL_DT = 0.1
EXPERIMENT_DURATION = 10.0
INTERACTION_RADIUS = 2.0
MAX_FORWARD_SPEED = 2.0
MAX_ANGULAR_SPEED = 2.0
`;

const meanPositionMetrics = `@metric(id="mean_x", name="Mean x", unit=None, sampling=every(0.1))
def mean_x(snapshot):
    total = Vec2(0.0, 0.0)
    for agent in snapshot.agents:
        total += agent.position
    return dot(total, Vec2(1.0, 0.0)) / snapshot.agent_count

@metric(id="final_mean_y", name="Final mean y", unit=None, sampling=final())
def final_mean_y(snapshot):
    total = Vec2(0.0, 0.0)
    for agent in snapshot.agents:
        total += agent.position
    return dot(total, Vec2(0.0, 1.0)) / snapshot.agent_count

@metric(id="spread", name="Spread", unit=None, sampling=every(0.5))
def spread(snapshot):
    largest = 0.0
    for agent in snapshot.agents:
        d = norm(agent.position)
        if d > largest and d >= 0.0:
            largest = d
        elif d < 0.0 or False:
            largest = -1.0
    return sqrt(largest ** 2.0) + abs(min(0.0, largest)) + 0.0 * atan2(1.0, 1.0)
`;

export const REFERENCE_EXPERIMENTS = Object.freeze([
  {
    id: "active-elastic-catalog",
    purpose: "Catalog Active Elastic exactly as shipped: hexagonal start, sensing noise, two metrics.",
    seed: 2026,
    ticks: 2000,
    artifacts: activeElastic,
  },
  {
    id: "active-elastic-random-start",
    purpose: "Catalog Active Elastic with its own random initialization option, exercising initialization randomness.",
    seed: 7,
    ticks: 1000,
    artifacts: {
      ...activeElastic,
      configuration: withConfigLine(activeElastic.configuration, "INITIALIZATION_METHOD", "\"random\""),
    },
  },
  {
    id: "stochastic-heterogeneous",
    purpose: "Controller randomness in control flow plus per-agent private state (sources from #304 and #306 tests).",
    seed: 17,
    ticks: 500,
    artifacts: {
      configuration: `N = 5\n${smallRuntime}SENSOR_NOISE = 0.0\n`,
      // #577: explicit groups reproduce the former per-index
      // set_agent_state assignment exactly (same compiled kernel input).
      initialization: `def initialize(config, rng, place):
    group("lead", count=2, placement="explicit")
    group("other", rest=True, placement="explicit")
    set_state("lead", role=1.0)
    for i in range(config.N):
        if i < 2:
            place(i, i * 1.0, 0.0, 0.0, group="lead")
        else:
            place(i, i * 1.0, 0.0, 0.0, group="other")
`,
      controller: `class Stochastic(Agent):
    role = 0.0

    def step(self, obs):
        if rng.bernoulli(0.35) and not self.role > 2.0:
            turn = rng.normal(0.0, 0.2)
        elif self.role >= 1.0 or False:
            turn = rng.uniform(-0.5, 0.5)
        else:
            turn = -0.1 * 2.0 ** 0.5
        speed = 0.3 + 0.1 * self.role - 0.05 * sqrt(2.0) ** 2.0
        for neighbour in obs.neighbours:
            speed += 0.01 * norm(neighbour.relative_position) / 2.0
        return Motion(max(0.0, min(speed, 1.0)), turn)
`,
      metrics: meanPositionMetrics,
    },
  },
  {
    id: "environment-scalar",
    purpose: "Static scalar Environment field sensed by the Controller (sources from #143 test).",
    seed: 3,
    ticks: 500,
    artifacts: {
      configuration: `N = 1\n${smallRuntime}SENSOR_NOISE = 0.0\nFIELD_OFFSET = 0.25\n`,
      initialization: `def environmental_scalar(x, y, config):
    return x + 2.0 * y + config.FIELD_OFFSET

def initialize(config, rng, place):
    place(0, 0.0, 0.0, 0.0)
`,
      controller: `class ScalarAgent(Agent):
    def step(self, obs):
        return Motion(0.1 * obs.environmental_scalar, 0.2)
`,
      metrics: meanPositionMetrics,
    },
  },
  {
    id: "named-references",
    purpose: "Named world reference with selective finite/unlimited sensing (sources from #504 test).",
    seed: 17,
    ticks: 500,
    artifacts: {
      configuration: `N = 2\n${smallRuntime}SENSOR_NOISE = 0.0\n`,
      initialization: `def initialize(config, rng, place):
    group("far", count=1, placement="explicit")
    group("near", count=1, placement="explicit")
    place(0, -4.9, 0.0, 0.0, group="far")
    place(1, 0.0, 0.0, 0.0, group="near")
    define_reference("goal", 4.9, 0.0)
    equip("far", "goal")
    equip("near", "goal", range=1.0)
`,
      controller: `class ReferenceAgent(Agent):
    def step(self, obs):
        if obs.references.goal.available:
            return Motion(0.1 + 0.0 * norm(obs.references.goal.relative_position), 0.0)
        else:
            return Motion(0.0, 0.0)
`,
      metrics: `@metric(id="reference.norm", name="Reference norm", sampling=every(0.1))
def reference_norm(snapshot):
    return norm(snapshot.references.goal.position)

${meanPositionMetrics}`,
    },
  },
]);

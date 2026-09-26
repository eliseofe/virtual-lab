// #594: the check that decides whether a stored Experiment can open (Library,
// Showcase, collections) must compile Metrics with the same context as the run
// itself: the Controller's private state and traits, named references and the
// Environment. Otherwise Experiments whose Metrics read robot state or the
// field are refused with "cannot run in the current simulator version".

import assert from "node:assert/strict";
import test from "node:test";

import { productionExperimentRunnability } from "../src/experiment-validation.js";
import { REFERENCE_EXPERIMENTS } from "./fixtures/reference-experiments.mjs";

const asStored = ({ artifacts }) => ({
  artifacts: ["configuration", "initialization", "controller", "metrics"].map((id, index) => ({
    id, type: id, label: id, format: id === "metrics" ? "python-vlab-metrics/0.1" : "python-vlab", order: index + 1, content: artifacts[id] ?? "",
  })),
});

test("#594 every reference Experiment passes the open check", () => {
  for (const experiment of REFERENCE_EXPERIMENTS) {
    const result = productionExperimentRunnability(asStored(experiment));
    assert.deepEqual(result, { runnable: true, error: null }, experiment.id);
  }
});

test("#594 Metrics reading private state and the Environment pass the open check", () => {
  const stored = asStored({ artifacts: {
    configuration: "N = 4\nCONTROL_DT = 0.1\nEXPERIMENT_DURATION = 10.0\nARENA_SIZE = 10.0\nSENSOR_NOISE = 0.0\nINTERACTION_RADIUS = 1.0\nMAX_FORWARD_SPEED = 0.1\nMAX_ANGULAR_SPEED = 1.0\n",
    initialization: "def environmental_scalar(x, y, config):\n    return x\n\ndef initialize(config, rng, place):\n    for i in range(config.N):\n        place(i, rng.uniform(-1.0, 1.0), rng.uniform(-1.0, 1.0), 0.0)\n",
    controller: "class Robot(Agent):\n    state = 0.0\n\n    def step(self, obs):\n        self.state = obs.environmental_scalar\n        return Motion(0.1, 0.0)\n",
    metrics: "@metric(id=\"m\", name=\"M\", unit=None, sampling=every(1.0))\ndef m(snapshot):\n    total = 0.0\n    for a in snapshot.agents:\n        total = total + a.private_state.state + environment_scalar_at(a.position)\n    return total\n",
  } });
  assert.deepEqual(productionExperimentRunnability(stored), { runnable: true, error: null });
});

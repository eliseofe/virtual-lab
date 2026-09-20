import assert from "node:assert/strict";
import test from "node:test";

import {
  compileInitializer as compileBrowserInitializer,
  validateInitializerControllerPrivateState as validateBrowserPrivateState,
} from "../src/initializer/compiler.js";
import { compileController as compileBrowserController } from "../src/controller/compiler.js";
import {
  compileInitializer as compileEdgeInitializer,
  validateInitializerControllerPrivateState as validateEdgePrivateState,
} from "../../supabase/functions/experiment-mcp/vendor/initializer-compiler.js";
import { compileController as compileEdgeController } from "../../supabase/functions/experiment-mcp/vendor/controller-compiler.js";

const config = {
  values: {
    N: 3,
    SEED: 42,
    RHO: 2 / 3,
  },
};

const initializerSource = `def initialize(config, rng, place):
    for i in range(config.N):
        place(i, i * 1.0, 0.0, 0.0)
        if i < 2:
            set_agent_state(i, "role", 1.0)
`;

const controllerSource = `class HeterogeneousAgent(Agent):
    role = 0.0

    def step(self, obs):
        return Motion(self.role, 0.0)
`;

function compilePair() {
  const browserInitializer = compileBrowserInitializer(initializerSource, config);
  const edgeInitializer = compileEdgeInitializer(initializerSource, config);
  assert.deepEqual(edgeInitializer, browserInitializer);

  const browserController = compileBrowserController(controllerSource, { parameters: {} });
  const edgeController = compileEdgeController(controllerSource, { parameters: {} });
  assert.deepEqual(edgeController, browserController);

  validateBrowserPrivateState(browserInitializer, browserController);
  validateEdgePrivateState(edgeInitializer, edgeController);
  return { initializer: browserInitializer, controller: browserController };
}

test("#304 initializer assigns controller-private scalar state per agent", () => {
  const { initializer } = compilePair();
  assert.equal(initializer.version, "vlab.initializer-state/0.3");
  assert.deepEqual(initializer.state, [
    { x: 0, y: 0, heading: 0, private_state: { role: 1 } },
    { x: 1, y: 0, heading: 0, private_state: { role: 1 } },
    { x: 2, y: 0, heading: 0 },
  ]);
});

test("#304 duplicate per-agent private-state assignment is rejected", () => {
  const source = `def initialize(config, rng, place):
    place(0, 0.0, 0.0, 0.0)
    set_agent_state(0, "role", 1.0)
    set_agent_state(0, "role", 0.0)
    place(1, 1.0, 0.0, 0.0)
    place(2, 2.0, 0.0, 0.0)
`;
  assert.throws(() => compileBrowserInitializer(source, config), /assigned more than once/);
  assert.throws(() => compileEdgeInitializer(source, config), /assigned more than once/);
});

test("#304 invalid index, name and non-finite values are rejected by Initialization", () => {
  const badIndex = `def initialize(config, rng, place):
    for i in range(config.N):
        place(i, i * 1.0, 0.0, 0.0)
    set_agent_state(3, "role", 1.0)
`;
  assert.throws(() => compileBrowserInitializer(badIndex, config), /outside \[0, N\)/);

  const badName = `def initialize(config, rng, place):
    for i in range(config.N):
        place(i, i * 1.0, 0.0, 0.0)
    set_agent_state(0, "bad field", 1.0)
`;
  assert.throws(() => compileBrowserInitializer(badName, config), /identifier string/);

  const badValue = `def initialize(config, rng, place):
    for i in range(config.N):
        place(i, i * 1.0, 0.0, 0.0)
    set_agent_state(0, "role", 1e309)
`;
  assert.throws(() => compileBrowserInitializer(badValue, config), /finite/);
});

test("#304 cross-artifact validation rejects undeclared controller private state", () => {
  const initializer = compileBrowserInitializer(initializerSource, config);
  const controller = compileBrowserController(`class WrongAgent(Agent):
    other = 0.0

    def step(self, obs):
        return Motion(self.other, 0.0)
`, { parameters: {} });

  assert.throws(
    () => validateBrowserPrivateState(initializer, controller),
    /assigns undeclared controller private state 'role'/,
  );
  assert.throws(
    () => validateEdgePrivateState(initializer, controller),
    /assigns undeclared controller private state 'role'/,
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { compileController, ControllerCompileError } from "../src/controller/compiler.js";

const parameters = { V0: "scalar", ALPHA: "scalar", BETA: "scalar", K: "scalar", L: "scalar" };
const source = `class LocalSpringAgent(Agent):
    def step(self, obs):
        force = Vec2(0.0, 0.0)
        for neighbour in obs.neighbours:
            displacement = neighbour.relative_position
            distance = norm(displacement)
            force += K * (distance - L) * displacement / distance
        forward = V0 + ALPHA * dot(force, obs.heading)
        turning = BETA * dot(force, perpendicular(obs.heading))
        return Motion(forward, turning)
`;

test("spring-local source lowers to typed versioned target-independent IR", () => {
  const ir = compileController(source, { parameters });
  assert.equal(ir.schema, "vlab.controller-ir/0.1");
  assert.equal(ir.controller, "LocalSpringAgent");
  assert.equal(ir.body[1].kind, "for_each");
  assert.equal(ir.body.at(-1).kind, "return");
  assert.equal(ir.body.at(-1).value.name, "Motion");
  assert.deepEqual(ir.parameters, parameters);
});

test("forbidden simulator/randomness access is rejected", () => {
  const invalid = `class Bad(Agent):
    def step(self, obs):
        x = random.value
        return Motion(x, x)
`;
  assert.throws(() => compileController(invalid), (error) => {
    assert.ok(error instanceof ControllerCompileError);
    assert.equal(error.category, "forbidden-capability");
    return true;
  });
});

test("invalid indentation fails with source-positioned syntax diagnostic", () => {
  const invalid = `class Bad(Agent):
    def step(self, obs):
        x = 1.0
          return Motion(x, x)
`;
  assert.throws(() => compileController(invalid), /line 4: syntax: unexpected indentation/);
});

test("tabs are rejected explicitly", () => {
  const invalid = "class Bad(Agent):\n\tdef step(self, obs):\n\t\treturn Motion(0.0, 0.0)\n";
  assert.throws(() => compileController(invalid), /tabs are not supported/);
});

test("unknown observation fields fail before execution", () => {
  const invalid = `class Bad(Agent):
    def step(self, obs):
        x = obs.global_position
        return Motion(x, x)
`;
  assert.throws(() => compileController(invalid), (error) => {
    assert.equal(error.category, "invalid-observation-field");
    return true;
  });
});

test("scalar/vector shape mismatch fails before execution", () => {
  const invalid = `class Bad(Agent):
    def step(self, obs):
        x = obs.heading + 1.0
        return Motion(0.0, 0.0)
`;
  assert.throws(() => compileController(invalid), (error) => {
    assert.equal(error.category, "type");
    return true;
  });
});

test("declared private scalar state can be read and updated", () => {
  const stateful = `class Stateful(Agent):
    counter = 0.0
    def step(self, obs):
        self.counter += 1.0
        return Motion(self.counter, 0.0)
`;
  const ir = compileController(stateful);
  assert.deepEqual(ir.state, [{ name: "counter", type: "scalar", initial: 0 }]);
  assert.equal(ir.body[0].target, "self.counter");
});

test("undeclared private state is rejected", () => {
  const invalid = `class Bad(Agent):
    def step(self, obs):
        self.counter = 1.0
        return Motion(0.0, 0.0)
`;
  assert.throws(() => compileController(invalid), (error) => {
    assert.equal(error.category, "invalid-private-state");
    return true;
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import { compileController, ControllerCompileError } from "../src/controller/compiler.js";

const source = `class ActiveElasticAgent(Agent):
    def step(self, obs):
        force = Vec2(0.0, 0.0)
        for neighbour in obs.neighbours:
            displacement = neighbour.relative_position
            force += spring(displacement)
        forward = V0 + ALPHA * dot(force, obs.heading)
        turning = BETA * dot(force, perpendicular(obs.heading))
        return Motion(forward, turning)
`;

test("AEM-shaped source lowers to versioned target-independent IR", () => {
  const ir = compileController(source);
  assert.equal(ir.schema, "vlab.controller-ir/0.1");
  assert.equal(ir.controller, "ActiveElasticAgent");
  assert.equal(ir.body[1].kind, "for_each");
  assert.equal(ir.body.at(-1).kind, "return");
  assert.equal(ir.body.at(-1).value.name, "Motion");
});

test("forbidden simulator/randomness access is rejected", () => {
  const invalid = `class Bad(Agent):
    def step(self, obs):
        x = random.value
        return Motion(x, x)
`;
  assert.throws(() => compileController(invalid), (error) => {
    assert.ok(error instanceof ControllerCompileError);
    assert.match(error.message, /outside the controller information boundary/);
    return true;
  });
});

test("invalid indentation fails with a source-positioned diagnostic", () => {
  const invalid = `class Bad(Agent):
    def step(self, obs):
        x = 1.0
          return Motion(x, x)
`;
  assert.throws(() => compileController(invalid), /line 4: unexpected indentation/);
});

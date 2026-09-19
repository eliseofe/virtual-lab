import assert from "node:assert/strict";
import test from "node:test";

import { compileController as compileBrowserController } from "../src/controller/compiler.js";
import { compileController as compileEdgeController } from "../../supabase/functions/experiment-mcp/vendor/controller-compiler.js";

function compile(source, parameters = {}) {
  const browser = compileBrowserController(source, { parameters });
  const edge = compileEdgeController(source, { parameters });
  assert.deepEqual(edge, browser, "browser and MCP Controller compilers must remain semantically mirrored");
  return browser;
}

test("#383 piecewise controller law supports comparisons and if/elif/else", () => {
  const source = `class PiecewiseAgent(Agent):
    def step(self, obs):
        distance = norm(obs.heading)
        if distance < R_LOW:
            speed = 0.0
        elif distance <= R_HIGH:
            speed = 0.5
        else:
            speed = 1.0
        return Motion(speed, 0.0)
`;

  const ir = compile(source, { R_LOW: "scalar", R_HIGH: "scalar" });
  const conditional = ir.body.find((statement) => statement.kind === "if");
  assert.ok(conditional);
  assert.equal(conditional.branches.length, 2);
  assert.equal(conditional.else_body.length, 1);
  assert.equal(ir.body.at(-1).kind, "return");
});

test("#383 boolean literals and and/or/not compose scalar comparisons", () => {
  const source = `class BooleanAgent(Agent):
    def step(self, obs):
        x = dot(obs.heading, Vec2(1.0, 0.0))
        if (x >= -1.0 and x <= 1.0) and not False:
            turning = 0.0
        else:
            turning = 1.0
        return Motion(0.5, turning)
`;

  const ir = compile(source);
  const serialized = JSON.stringify(ir);
  assert.match(serialized, /"kind":"bool_op"/);
  assert.match(serialized, /"kind":"bool_const"/);
  assert.match(serialized, /"op":"not"/);
  assert.match(serialized, /"op":">="/);
  assert.match(serialized, /"op":"<="/);
});

test("#383 exhaustive branch returns satisfy the action-return invariant", () => {
  const source = `class BranchReturnAgent(Agent):
    def step(self, obs):
        x = dot(obs.heading, Vec2(1.0, 0.0))
        if x >= 0.0:
            return Motion(1.0, 0.0)
        else:
            return Motion(0.5, 0.0)
`;

  const ir = compile(source);
  assert.equal(ir.body.length, 2);
  assert.equal(ir.body[1].kind, "if");
});

test("#383 branch-local value is definitely assigned only through exhaustive branches", () => {
  const valid = `class DefinedAgent(Agent):
    def step(self, obs):
        x = dot(obs.heading, Vec2(1.0, 0.0))
        if x >= 0.0:
            speed = 1.0
        else:
            speed = 0.5
        return Motion(speed, 0.0)
`;
  assert.doesNotThrow(() => compile(valid));

  const invalid = `class UndefinedAgent(Agent):
    def step(self, obs):
        x = dot(obs.heading, Vec2(1.0, 0.0))
        if x >= 0.0:
            speed = 1.0
        return Motion(speed, 0.0)
`;
  assert.throws(() => compileBrowserController(invalid), /unknown identifier 'speed'/);
  assert.throws(() => compileEdgeController(invalid), /unknown identifier 'speed'/);
});

test("#383 neighbour iteration remains bounded while conditionals work inside the loop", () => {
  const source = `class BoundedLoopAgent(Agent):
    def step(self, obs):
        total = Vec2(0.0, 0.0)
        for n in obs.neighbours:
            d = norm(n.relative_position)
            if d > 0.0:
                total += n.relative_position
        turning = dot(total, perpendicular(obs.heading))
        return Motion(0.5, turning)
`;
  assert.doesNotThrow(() => compile(source));

  const invalid = `class BadLoopAgent(Agent):
    def step(self, obs):
        x = 1.0
        for n in x:
            x += 1.0
        return Motion(x, 0.0)
`;
  assert.throws(() => compileBrowserController(invalid), /for loop requires neighbours/);
});

test("#383 unavailable observations remain blocked despite richer language", () => {
  const source = `class StillBlocked(Agent):
    def step(self, obs):
        if obs.global_position > 0.0:
            speed = 1.0
        else:
            speed = 0.0
        return Motion(speed, 0.0)
`;
  assert.throws(() => compileBrowserController(source), /not implemented/);
  assert.throws(() => compileEdgeController(source), /not implemented/);
});

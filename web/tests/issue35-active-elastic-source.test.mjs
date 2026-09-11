import test from "node:test";
import assert from "node:assert/strict";
import { compileController } from "../src/controller/compiler.js";

const source = `class ActiveElasticAgent(Agent):
    def step(self, obs):
        proximal = Vec2(0.0, 0.0)
        sigma_lj = DESIRED_DISTANCE / pow(2.0, 1.0 / POTENTIAL_ALPHA)
        for neighbour in obs.neighbours:
            displacement = neighbour.relative_position
            distance = norm(displacement)
            ratio = sigma_lj / distance
            magnitude = -(4.0 * POTENTIAL_ALPHA * POTENTIAL_EPSILON / distance) * (2.0 * pow(ratio, 2.0 * POTENTIAL_ALPHA) - pow(ratio, POTENTIAL_ALPHA))
            proximal += magnitude * displacement / distance
        forward = K1 * dot(proximal, obs.heading) + U
        turning = K2 * dot(proximal, perpendicular(obs.heading))
        return Motion(forward, turning)
`;

const parameters = Object.fromEntries([
  "DESIRED_DISTANCE", "K1", "K2", "POTENTIAL_ALPHA", "POTENTIAL_EPSILON", "U",
].map((name) => [name, "scalar"]));

test("issue #35: proximal contribution lowers as magnitude times focal-to-neighbour unit vector", () => {
  const ir = compileController(source, { parameters });
  const loop = ir.body.find((statement) => statement.kind === "for_each");
  assert.ok(loop);
  const add = loop.body.find((statement) => statement.kind === "aug_assign" && statement.target === "proximal");
  assert.ok(add);

  // `magnitude * displacement / distance` must be parsed as
  // `(magnitude * displacement) / distance`, not with a different precedence.
  assert.equal(add.value.kind, "binary");
  assert.equal(add.value.op, "/");
  assert.equal(add.value.right.kind, "load");
  assert.equal(add.value.right.path, "distance");
  assert.equal(add.value.left.kind, "binary");
  assert.equal(add.value.left.op, "*");
  assert.equal(add.value.left.left.path, "magnitude");
  assert.equal(add.value.left.right.path, "displacement");
});

test("issue #35: MDMC source lowers with +U forward bias and perpendicular projection for turning", () => {
  const ir = compileController(source, { parameters });
  const forward = ir.body.find((statement) => statement.kind === "assign" && statement.target === "forward");
  const turning = ir.body.find((statement) => statement.kind === "assign" && statement.target === "turning");
  const ret = ir.body.at(-1);

  assert.equal(forward.value.op, "+");
  assert.equal(forward.value.right.kind, "load");
  assert.equal(forward.value.right.path, "U");
  assert.equal(forward.value.left.op, "*");
  assert.equal(forward.value.left.left.path, "K1");
  assert.equal(forward.value.left.right.name, "dot");

  assert.equal(turning.value.op, "*");
  assert.equal(turning.value.left.path, "K2");
  assert.equal(turning.value.right.name, "dot");
  assert.equal(turning.value.right.args[1].name, "perpendicular");

  assert.equal(ret.kind, "return");
  assert.equal(ret.value.name, "Motion");
  assert.equal(ret.value.args[0].path, "forward");
  assert.equal(ret.value.args[1].path, "turning");
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { compileController as compileBrowserController } from "../src/controller/compiler.js";
import { compileMetrics as compileBrowserMetrics } from "../src/metrics/compiler.js";
import { compileController as compileEdgeController } from "../../supabase/functions/experiment-mcp/vendor/controller-compiler.js";
import { compileMetrics as compileEdgeMetrics } from "../../supabase/functions/experiment-mcp/vendor/metrics-compiler.js";

const failingController = `class ConstantBearingAgent(Agent):
    def step(self, obs):
        neighbours = obs.neighbours
        com = Vec2(0.0, 0.0)
        count = 0.0
        for n in neighbours:
            rel = n.relative_position
            com = com + rel
            count = count + 1.0
        inv = 1.0 / (count + 0.0001)
        avg = com * inv
        left = perpendicular(Vec2(1.0, 0.0))
        lateral = dot(avg, left)
        turning = 2.0 * lateral
        forward = 0.7
        return Motion(forward, turning)
`;

const basicMathController = `class BasicMathAgent(Agent):
    def step(self, obs):
        neighbours = obs.neighbours
        total = Vec2(0.0, 0.0)
        for n in neighbours:
            total += n.relative_position
        length = norm(total)
        longitudinal = dot(total, obs.heading)
        lateral = dot(total, perpendicular(obs.heading))
        ratio = (longitudinal + 1.0) / (length + 1.0)
        forward = pow(ratio, 2.0)
        turning = -0.5 * lateral
        return Motion(forward, turning)
`;

const basicMathMetrics = `@metric(id="probe.basic", name="Basic", unit=None, sampling=every(0.1))
def basic(snapshot):
    agents = snapshot.agents
    total = Vec2(0.0, 0.0)
    for agent in agents:
        alias = agent
        total += alias.heading
    magnitude = norm(total)
    squared = pow(magnitude, 2.0)
    rooted = sqrt(squared)
    projected = dot(total, Vec2(1.0, 0.0))
    signed = cross2(total, Vec2(0.0, 1.0))
    bounded = max(min(rooted + projected + signed, 1000.0), -1000.0)
    return abs(bounded)
`;

function walkStatements(body, visit) {
  for (const statement of body) {
    visit(statement);
    if (statement.kind === "for_each") walkStatements(statement.body, visit);
  }
}

test("#380 exact production controller alias lowers to Rust-compatible canonical neighbour IR", () => {
  const browser = compileBrowserController(failingController);
  const edge = compileEdgeController(failingController);
  assert.deepEqual(edge, browser, "browser and MCP controller compilers must emit byte-equivalent semantic IR");

  const assignments = [];
  const loops = [];
  walkStatements(browser.body, (statement) => {
    if (statement.kind === "assign") assignments.push(statement);
    if (statement.kind === "for_each") loops.push(statement);
  });

  assert.equal(assignments.some((statement) => statement.target === "neighbours"), false);
  assert.equal(loops.length, 1);
  assert.deepEqual(loops[0].iterable, { kind: "load", path: "obs.neighbours", line: 6 });
});

test("#380 basic controller syntax and mathematical primitives survive canonical lowering", () => {
  const ir = compileBrowserController(basicMathController);
  assert.deepEqual(compileEdgeController(basicMathController), ir);

  const serialized = JSON.stringify(ir);
  for (const required of [
    '"name":"Vec2"',
    '"name":"norm"',
    '"name":"dot"',
    '"name":"perpendicular"',
    '"name":"pow"',
    '"name":"Motion"',
    '"op":"+"',
    '"op":"-"',
    '"op":"*"',
    '"op":"/"',
  ]) {
    assert.ok(serialized.includes(required), `missing basic controller IR primitive ${required}`);
  }
  assert.equal(serialized.includes('"path":"neighbours"'), false);
  assert.ok(serialized.includes('"path":"obs.neighbours"'));
});

test("#380 Metrics iterable and loop-agent aliases lower to the Rust runtime vocabulary", () => {
  const browser = compileBrowserMetrics(basicMathMetrics);
  const edge = compileEdgeMetrics(basicMathMetrics);
  assert.deepEqual(edge, browser, "browser and MCP Metrics compilers must emit byte-equivalent semantic IR");

  const metric = browser.metrics[0];
  const serialized = JSON.stringify(metric);
  assert.equal(serialized.includes('"target":"agents"'), false);
  assert.equal(serialized.includes('"target":"alias"'), false);
  assert.equal(serialized.includes('"path":"agents"'), false);
  assert.equal(serialized.includes('"path":"alias.heading"'), false);
  assert.ok(serialized.includes('"path":"snapshot.agents"'));
  assert.ok(serialized.includes('"path":"agent.heading"'));

  for (const required of [
    '"name":"Vec2"',
    '"name":"norm"',
    '"name":"pow"',
    '"name":"sqrt"',
    '"name":"dot"',
    '"name":"cross2"',
    '"name":"min"',
    '"name":"max"',
    '"name":"abs"',
  ]) {
    assert.ok(serialized.includes(required), `missing basic Metrics IR primitive ${required}`);
  }
});

test("#380 every persisted scientific-source write still crosses the shared authoring validator", async () => {
  const indexSource = await readFile(
    new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url),
    "utf8",
  );
  const metricsToolSource = await readFile(
    new URL("../../supabase/functions/experiment-mcp/metrics-results-tools.ts", import.meta.url),
    "utf8",
  );

  assert.match(indexSource, /create_experiment[\s\S]*validateExperimentArtifacts\(artifacts\)/);
  assert.match(indexSource, /edit_experiment[\s\S]*validateExperimentArtifacts\(artifacts\)/);
  assert.match(metricsToolSource, /validateExperimentArtifactsV09\(mutated\.artifacts\)/);
});

test("#380 browser and MCP compiler sources remain mirrored", async () => {
  const [browserController, edgeController, browserMetrics, edgeMetrics] = await Promise.all([
    readFile(new URL("../src/controller/compiler.js", import.meta.url), "utf8"),
    readFile(new URL("../../supabase/functions/experiment-mcp/vendor/controller-compiler.js", import.meta.url), "utf8"),
    readFile(new URL("../src/metrics/compiler.js", import.meta.url), "utf8"),
    readFile(new URL("../../supabase/functions/experiment-mcp/vendor/metrics-compiler.js", import.meta.url), "utf8"),
  ]);
  assert.equal(edgeController, browserController);
  assert.equal(edgeMetrics, browserMetrics);
});

test("#380 controller validation requires an unconditional top-level action return", () => {
  const loopOnlyReturn = `class LoopOnly(Agent):
    def step(self, obs):
        for n in obs.neighbours:
            return Motion(1.0, 0.0)
`;
  assert.throws(
    () => compileBrowserController(loopOnlyReturn),
    /step method must return a Motion\/action/,
  );
  assert.throws(
    () => compileEdgeController(loopOnlyReturn),
    /step method must return a Motion\/action/,
  );
});

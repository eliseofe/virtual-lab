import assert from "node:assert/strict";
import test from "node:test";

import { compileMetrics as compileBrowserMetrics } from "../src/metrics/compiler.js";
import { compileMetrics as compileEdgeMetrics } from "../../supabase/functions/experiment-mcp/vendor/metrics-compiler.js";

function compile(source, parameters = {}) {
  const browser = compileBrowserMetrics(source, { parameters });
  const edge = compileEdgeMetrics(source, { parameters });
  assert.deepEqual(edge, browser, "browser and MCP Metrics compilers must remain semantically mirrored");
  return browser;
}

test("#385 thresholded/counting metric supports comparisons, booleans and conditionals inside bounded agent iteration", () => {
  const source = `@metric(id="count.forward", name="Forward-facing agents", unit=None, sampling=final())
def count_forward(snapshot):
    count = 0.0
    for agent in snapshot.agents:
        projection = dot(agent.heading, Vec2(1.0, 0.0))
        if projection >= 0.5 and not False:
            count += 1.0
    return count
`;
  const ir = compile(source);
  const serialized = JSON.stringify(ir);
  assert.match(serialized, /"kind":"if"/);
  assert.match(serialized, /"kind":"compare"/);
  assert.match(serialized, /"kind":"bool_op"/);
  assert.match(serialized, /"op":"not"/);
});

test("#385 exhaustive branches definitely assign scalar and vector locals", () => {
  const valid = `@metric(id="piecewise.value", name="Piecewise", unit=None, sampling=final())
def piecewise(snapshot):
    if snapshot.agent_count > 1.0:
        scalar = 2.0
        direction = Vec2(1.0, 0.0)
    else:
        scalar = 1.0
        direction = Vec2(0.0, 1.0)
    return scalar + norm(direction)
`;
  assert.doesNotThrow(() => compile(valid));

  const invalid = `@metric(id="piecewise.invalid", name="Piecewise invalid", unit=None, sampling=final())
def piecewise_invalid(snapshot):
    if snapshot.agent_count > 1.0:
        scalar = 2.0
    return scalar
`;
  assert.throws(() => compileBrowserMetrics(invalid), /unknown scalar\/vector name 'scalar'/);
  assert.throws(() => compileEdgeMetrics(invalid), /unknown scalar\/vector name 'scalar'/);
});

test("#385 exhaustive conditional returns satisfy the scalar-return invariant", () => {
  const source = `@metric(id="branch.return", name="Branch return", unit=None, sampling=final())
def branch_return(snapshot):
    if snapshot.agent_count == 0.0:
        return 0.0
    elif snapshot.agent_count == 1.0:
        return 1.0
    else:
        return max(2.0, sqrt(snapshot.agent_count ** 2.0))
`;
  const ir = compile(source);
  assert.equal(ir.metrics[0].body.length, 1);
  assert.equal(ir.metrics[0].body[0].kind, "if");
});

test("#385 collection aliases assigned through exhaustive branches canonicalize to snapshot.agents", () => {
  const source = `@metric(id="branch.alias", name="Branch alias", unit=None, sampling=final())
def branch_alias(snapshot):
    if snapshot.agent_count >= 0.0:
        agents = snapshot.agents
    else:
        agents = snapshot.agents
    total = 0.0
    for agent in agents:
        total += agent.heading_angle
    return total
`;
  const ir = compile(source);
  const serialized = JSON.stringify(ir.metrics[0].body);
  assert.equal(serialized.includes('"path":"agents"'), false);
  assert.equal(serialized.includes('"target":"agents"'), false);
  assert.ok(serialized.includes('"path":"snapshot.agents"'));
});

test("#385 piecewise Metrics retain existing vector and standard math vocabulary", () => {
  const source = `@metric(id="math.piecewise", name="Math piecewise", unit=None, sampling=final())
def math_piecewise(snapshot):
    x = sin(snapshot.scientific_time) + cos(snapshot.scientific_time)
    if abs(x) < 0.5:
        value = atan2(x, 1.0)
    else:
        value = max(min(x ** 2.0, 10.0), 0.0)
    return value
`;
  assert.doesNotThrow(() => compile(source));
});

test("#385 Metrics remain read-only and unavailable information remains blocked", () => {
  const unavailable = `@metric(id="bad.snapshot", name="Bad", unit=None, sampling=final())
def bad_snapshot(snapshot):
    if snapshot.controller_state > 0.0:
        return 1.0
    return 0.0
`;
  assert.throws(() => compileBrowserMetrics(unavailable), /unknown metric snapshot field 'snapshot.controller_state'/);

  const forbidden = `@metric(id="bad.controller", name="Bad controller", unit=None, sampling=final())
def bad_controller(snapshot):
    if controller > 0.0:
        return 1.0
    return 0.0
`;
  assert.throws(() => compileBrowserMetrics(forbidden), /outside the metric read-only information boundary/);

  const arbitraryLoop = `@metric(id="bad.loop", name="Bad loop", unit=None, sampling=final())
def bad_loop(snapshot):
    total = 0.0
    for agent in total:
        total += 1.0
    return total
`;
  assert.throws(() => compileBrowserMetrics(arbitraryLoop), /metric loops currently require 'snapshot.agents'/);
});

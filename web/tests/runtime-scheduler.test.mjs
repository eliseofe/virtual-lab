import test from "node:test";
import assert from "node:assert/strict";
import { RuntimePacer } from "../src/runtime/scheduler.js";

test("1x pacing accrues one 10 ms physics tick per 10 ms wall time", () => {
  const pacer = new RuntimePacer(0.01, { targetWorkMs: 8, maxChunkTicks: 128 });
  pacer.start(0, 1);
  assert.deepEqual(pacer.plan(5), { ticks: 0, delayMs: 5 });
  assert.equal(pacer.plan(10).ticks, 1);
  pacer.recordWork(1, 0.2);
  assert.equal(pacer.plan(20).ticks, 1);
});

test("high requested speed is bounded instead of creating unbounded batches", () => {
  const pacer = new RuntimePacer(0.01, { targetWorkMs: 8, maxChunkTicks: 64, maxBacklogChunks: 2 });
  pacer.start(0, 10000);
  // First measured tick establishes a compute-cost estimate.
  assert.equal(pacer.plan(10).ticks, 1);
  pacer.recordWork(1, 0.1);
  const plan = pacer.plan(20);
  assert.ok(plan.ticks >= 1);
  assert.ok(plan.ticks <= 64);
  assert.ok(pacer.tickCredit <= 128);
});

test("adaptive chunk size shrinks when one physics tick is expensive", () => {
  const pacer = new RuntimePacer(0.01, { targetWorkMs: 8, maxChunkTicks: 256 });
  pacer.start(0, 1000);
  assert.equal(pacer.plan(10).ticks, 1);
  pacer.recordWork(1, 20);
  assert.equal(pacer.adaptiveChunkLimit(), 1);
  assert.equal(pacer.plan(30).ticks, 1);
});

test("live speed change discards stale backlog from the previous speed", () => {
  const pacer = new RuntimePacer(0.01, { maxChunkTicks: 64 });
  pacer.start(0, 1000);
  assert.equal(pacer.plan(100).ticks, 1);
  pacer.recordWork(1, 0.1);
  pacer.setSpeed(100, 1);
  assert.equal(pacer.tickCredit, 0);
  assert.equal(pacer.plan(105).ticks, 0);
  assert.equal(pacer.plan(110).ticks, 1);
});

test("pause prevents further work until an explicit restart", () => {
  const pacer = new RuntimePacer(0.01);
  pacer.start(0, 20);
  pacer.pause();
  assert.deepEqual(pacer.plan(1000), { ticks: 0, delayMs: null });
  pacer.start(1000, 2);
  assert.equal(pacer.plan(1005).ticks, 1);
});

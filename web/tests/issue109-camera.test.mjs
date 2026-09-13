import assert from "node:assert/strict";
import test from "node:test";

import { ArenaCamera } from "../src/visualization/camera.js";

const baseFrame = (camera) => camera.frame({ width: 1000, height: 800, arenaSize: 10, padding: 50 });

test("fit view maps arena edges to the fitted square", () => {
  const camera = new ArenaCamera();
  const frame = baseFrame(camera);
  assert.equal(frame.side, 700);
  assert.equal(frame.toCanvasX(-5), 150);
  assert.equal(frame.toCanvasX(5), 850);
  assert.equal(frame.toCanvasY(5), 50);
  assert.equal(frame.toCanvasY(-5), 750);
  assert.equal(camera.label(), "Fit");
});

test("zoom keeps the anchor world point under the same screen point", () => {
  const camera = new ArenaCamera();
  const before = baseFrame(camera);
  const screenX = 690;
  const screenY = 310;
  const worldX = before.toWorldX(screenX);
  const worldY = before.toWorldY(screenY);

  camera.zoomAt(3, screenX, screenY, before);
  const after = baseFrame(camera);

  assert.ok(Math.abs(after.toCanvasX(worldX) - screenX) < 1e-9);
  assert.ok(Math.abs(after.toCanvasY(worldY) - screenY) < 1e-9);
  assert.equal(camera.zoom, 3);
  assert.equal(camera.label(), "3.0×");
});

test("panning is bounded so the viewport cannot leave the arena", () => {
  const camera = new ArenaCamera();
  let frame = baseFrame(camera);
  camera.zoomAt(4, 500, 400, frame);
  frame = baseFrame(camera);

  camera.panScreen(-100000, 100000, frame);
  const maxCenter = 5 - 5 / 4;
  assert.equal(camera.centerX, maxCenter);
  assert.equal(camera.centerY, maxCenter);
});

test("returning to minimum zoom restores exact fit", () => {
  const camera = new ArenaCamera();
  let frame = baseFrame(camera);
  camera.zoomAt(5, 650, 250, frame);
  frame = baseFrame(camera);
  camera.panScreen(80, -40, frame);
  frame = baseFrame(camera);

  camera.zoomAt(0.0001, 500, 400, frame);

  assert.equal(camera.zoom, 1);
  assert.equal(camera.centerX, 0);
  assert.equal(camera.centerY, 0);
  assert.equal(camera.isFit(), true);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [main, html, css, camera] = await Promise.all([
  readFile(new URL("../src/main.js", import.meta.url), "utf8"),
  readFile(new URL("../src/index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/style.css", import.meta.url), "utf8"),
  readFile(new URL("../src/visualization/camera.js", import.meta.url), "utf8"),
]);

test("camera controls and direct-manipulation gestures are wired into the arena", () => {
  for (const id of ["camera-status", "fit-arena", "agent-glyph", "simulation-canvas"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(main, /new ArenaCamera\(\)/);
  assert.match(main, /addEventListener\("wheel"/);
  assert.match(main, /addEventListener\("pointerdown"/);
  assert.match(main, /addEventListener\("pointermove"/);
  assert.match(css, /touch-action:\s*none/);
});

test("agent appearance offers directional, arrow, and dot glyphs", () => {
  assert.match(html, /value="directional"/);
  assert.match(html, /value="arrow"/);
  assert.match(html, /value="dot"/);
  assert.match(main, /glyph === "arrow"/);
  assert.match(main, /glyph === "dot"/);
});

test("camera module stays visualization-only", () => {
  assert.doesNotMatch(camera, /Worker|postMessage|physics|controller|seed|rng/i);
  assert.match(camera, /toCanvasX/);
  assert.match(camera, /toWorldX/);
  assert.match(camera, /zoomAt/);
  assert.match(camera, /panScreen/);
});

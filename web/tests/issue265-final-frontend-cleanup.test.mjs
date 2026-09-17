import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const style = read('web/src/style.css');
const hardening = read('web/src/ux-hardening.css');
const authoring = read('web/src/authoring-workspace.js');
const reactCss = read('web/src/react-chrome.css');
const simulationCss = read('web/src/simulation-react.css');
const main = read('web/src/main.js');
const runtimeSpeed = read('web/src/runtime-speed.js');
const surface = JSON.parse(read('web/product-surface.json'));

test('superseded legacy chrome and Simulation presentation styling is retired', () => {
  for (const obsolete of [
    /\.topbar\s*\{/,
    /\.topbar-actions\s*\{/,
    /\.topbar-status\s*\{/,
    /\.stage-heading\s*\{/,
    /\.stage-runtime\s*\{/,
    /\.control-grid\s*\{/,
    /\.runtime-secondary\s*\{/,
    /\.stage-toolbar\s*\{/,
    /\.glyph-control\s*\{/,
    /\.view-status\s*\{/,
  ]) assert.doesNotMatch(style, obsolete);
});

test('responsive hardening no longer styles hidden legacy presentation controls', () => {
  assert.doesNotMatch(hardening, /\.topbar(?:-actions|-status)?/);
  assert.doesNotMatch(hardening, /\.stage-runtime|\.runtime-secondary|\.control-grid|\.stage-toolbar|\.glyph-control|\.view-status/);
  assert.doesNotMatch(hardening, /\.authoring-tabs|\.authoring-tab|\.authoring-workbench-head|\.authoring-workbench-actions/);
  assert.match(hardening, /\.canvas-wrap/);
  assert.match(hardening, /#authoring-workbench textarea/);
});

test('authoring controller keeps semantic tab plumbing without injecting obsolete tab chrome', () => {
  assert.match(authoring, /function activateArtifact/);
  assert.match(authoring, /function updateRuntimeUi/);
  assert.match(authoring, /\.authoring-tab/);
  assert.doesNotMatch(authoring, /\.authoring-workbench-head \{ display:/);
  assert.doesNotMatch(authoring, /\.authoring-tabs \{ display:/);
  assert.doesNotMatch(authoring, /\.authoring-tab\[aria-selected=/);
});

test('React compatibility CSS hides superseded DOM while keeping renderer/editor engines visible', () => {
  assert.match(reactCss, /\.vlab-react-chrome-mounted \.topbar/);
  assert.match(reactCss, /#authoring-workbench > \.authoring-workbench-head/);
  assert.match(reactCss, /#authoring-workbench > #authoring-tabs/);
  assert.match(simulationCss, /stage-panel > \.stage-heading/);
  assert.match(simulationCss, /stage-panel > \.stage-runtime/);
  assert.match(simulationCss, /stage-panel > \.stage-toolbar/);
  assert.doesNotMatch(simulationCss, /simulation-canvas[^}]*display:\s*none/s);
  assert.doesNotMatch(simulationCss, /canvas-wrap[^}]*display:\s*none/s);
});

test('model, controller/runtime and renderer ownership remains outside React', () => {
  assert.match(main, /const worker = new Worker/);
  assert.match(main, /const camera = new ArenaCamera/);
  assert.match(main, /function setRunning/);
  assert.match(main, /function drawSnapshot/);
  assert.match(runtimeSpeed, /new RuntimeRateMeter/);
});

test('product tracking leaves migration and points to roadmap reconciliation', () => {
  assert.equal(surface.work_tracking?.migration_state, 'complete');
  assert.match(surface.work_tracking?.next_stage?.name ?? '', /Reconcile remaining epics\/tickets/);
  assert.deepEqual(surface.work_tracking?.next_stage?.surface_ids ?? [], []);
});

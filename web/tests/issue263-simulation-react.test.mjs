import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const root = read('web/src/react-migration-root.tsx');
const presentation = read('web/src/simulation-react-presentation.tsx');
const adapter = read('web/src/simulation-react-adapter.ts');
const css = read('web/src/simulation-react.css');
const main = read('web/src/main.js');
const responsive = read('web/scripts/responsive-smoke.mjs');
const surface = JSON.parse(read('web/product-surface.json'));

test('Simulation presentation is mounted inside the established React/Mantine root', () => {
  assert.match(root, /import \{ SimulationPresentation \} from '\.\/simulation-react-presentation'/);
  assert.match(root, /<SimulationPresentation \/>/);
  assert.match(presentation, /data-vlab-react-simulation="mounted"/);
  assert.match(presentation, /data-vlab-simulation-action="run"/);
  assert.match(presentation, /data-vlab-simulation-speed/);
  assert.match(presentation, /data-vlab-simulation-fit/);
});

test('Simulation adapter proxies authoritative runtime controls instead of owning simulator state', () => {
  for (const selector of ['#run', '#pause', '#restart', '#restart-new-seed', '#simulation-speed', '#fit-arena', '#agent-glyph']) {
    assert.match(adapter, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(adapter, /\.click\(\)/);
  assert.match(adapter, /dispatchEvent\(new Event\('input'/);
  assert.match(adapter, /dispatchEvent\(new Event\('change'/);
  assert.doesNotMatch(adapter, /new Worker|postMessage|ArenaCamera|drawSnapshot|compileController|compileInitializer/);
  assert.doesNotMatch(presentation, /new Worker|postMessage|ArenaCamera|simulationSetupFromRuntime|compileController/);
});

test('Existing simulator and renderer remain authoritative', () => {
  assert.match(main, /const worker = new Worker/);
  assert.match(main, /function setRunning/);
  assert.match(main, /function drawSnapshot/);
  assert.match(main, /const camera = new ArenaCamera/);
  assert.match(main, /ui\.run\.addEventListener\("click"/);
  assert.match(main, /ui\.pause\.addEventListener\("click"/);
  assert.match(main, /ui\.restartNewSeed\.addEventListener\("click"/);
});

test('Only superseded Simulation presentation chrome is hidden; canvas stays authoritative and visible', () => {
  assert.match(css, /stage-panel > \.stage-heading/);
  assert.match(css, /stage-panel > \.stage-runtime/);
  assert.match(css, /stage-panel > \.stage-toolbar/);
  assert.doesNotMatch(css, /simulation-canvas[^}]*display:\s*none/s);
  assert.doesNotMatch(css, /canvas-wrap[^}]*display:\s*none/s);
});

test('Responsive smoke follows visible migrated Simulation controls', () => {
  assert.match(responsive, /data-vlab-simulation-action="run"/);
  assert.match(responsive, /data-vlab-simulation-action="new-seed"/);
  assert.match(responsive, /data-vlab-simulation-fit/);
});

test('Product surface advances to final migration cleanup after Simulation presentation', () => {
  const runtime = surface.surfaces.find((entry) => entry.id === 'experiment-runtime');
  assert.ok(runtime);
  assert.match(runtime.name, /React\/Mantine Simulation/);
  assert.equal(surface.work_tracking?.next_stage?.parent_issue, 251);
  assert.match(surface.work_tracking?.next_stage?.name ?? '', /Legacy presentation removal/);
});

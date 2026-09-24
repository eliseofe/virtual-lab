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
  assert.match(presentation, /data-vlab-simulator-readiness/);
  assert.match(presentation, /Simulator ready/);
  // #569: readiness comes from the runtime model, not the page's status line.
  assert.doesNotMatch(presentation, /#worker-status|MutationObserver/);
  assert.match(presentation, /snapshot\.readiness/);
});

test('Simulation adapter drives the authoritative simulator through its controller instead of owning simulator state', () => {
  // #562: the panel calls the simulation controller's commands rather than
  // clicking the legacy view's hidden buttons; the simulator stays in main.js.
  for (const command of ['run', 'pause', 'restart', 'restartWithNewSeed', 'fitArena', 'setSpeed', 'setGlyph']) {
    assert.match(adapter, new RegExp(`simulationCommands\\.${command}`));
  }
  assert.doesNotMatch(adapter, /\.click\(\)|dispatchEvent\(/);
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

test('Current product surface records the migrated Simulation presentation', () => {
  const runtime = surface.surfaces.find((entry) => entry.id === 'experiment-runtime');
  assert.ok(runtime);
  assert.match(runtime.name, /React\/Mantine Simulation/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const root = read('web/src/react-migration-root.tsx');
const presentation = read('web/src/authoring-react-presentation.tsx');
const adapter = read('web/src/authoring-react-adapter.ts');
const legacy = read('web/src/authoring-workspace.js');
const css = read('web/src/react-chrome.css');
const surface = JSON.parse(read('web/product-surface.json'));

test('#262 mounts Authoring inside the established React/Mantine root', () => {
  assert.match(root, /import \{ AuthoringPresentation \} from '\.\/authoring-react-presentation'/);
  assert.match(root, /<AuthoringPresentation \/>/);
  assert.match(presentation, /data-vlab-react-authoring="mounted"/);
  assert.match(presentation, /data-vlab-authoring-apply/);
  assert.match(presentation, /data-vlab-authoring-tab=/);
  assert.match(css, /vlab-react-authoring-mounted/);
  assert.match(css, /#authoring-workbench > \.authoring-workbench-head/);
  assert.match(css, /#authoring-workbench > #authoring-tabs/);
});

test('#262 keeps authoritative source/compiler/runtime behavior in legacy adapters', () => {
  assert.match(adapter, /#authoring-tabs \.authoring-tab\[data-artifact-id=/);
  assert.match(adapter, /#apply-workspace/);
  assert.match(adapter, /\.click\(\)/);
  assert.doesNotMatch(adapter, /experiment-config.*value\s*=/s);
  assert.doesNotMatch(adapter, /controller-source.*value\s*=/s);
  assert.doesNotMatch(adapter, /metrics-source.*value\s*=/s);
  assert.match(legacy, /applySetup\.click\(\)/);
  assert.match(legacy, /compileController\.click\(\)/);
  assert.match(legacy, /activateArtifact\(/);
});

test('#262 preserves one-active-editor and keyboard-tab semantics', () => {
  assert.match(legacy, /pane\.hidden = pane !== nextPane/);
  assert.match(presentation, /aria-selected=\{artifact\.selected\}/);
  assert.match(presentation, /tabIndex=\{artifact\.selected \? 0 : -1\}/);
  assert.match(presentation, /ArrowLeft/);
  assert.match(presentation, /ArrowRight/);
  assert.match(presentation, /event\.preventDefault\(\)/);
  assert.match(presentation, /requestAnimationFrame/);
});

test('#262 preserves mobile touch targets', () => {
  assert.match(css, /\[data-vlab-authoring-apply\],[\s\S]*\.vlab-react-authoring-tab[\s\S]*min-height: 44px/);
});

test('#262 keeps the migrated Authoring surface active in the production smoke registry', () => {
  const runtime = surface.surfaces.find((entry) => entry.id === 'experiment-runtime');
  assert.ok(runtime);
  assert.equal(runtime.state, 'active');
  assert.match(runtime.name, /React\/Mantine[\s\S]*Authoring/);
  assert.ok(runtime.smoke.some((check) => check.script === 'web/scripts/browser-smoke.mjs'));
});

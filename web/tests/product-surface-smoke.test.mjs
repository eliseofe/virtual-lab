import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const manifest = JSON.parse(await readFile(new URL('../product-surface.json', import.meta.url), 'utf8'));
const workflow = await readFile(new URL('../../.github/workflows/ci-pages.yml', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/run-active-product-smoke.mjs', import.meta.url), 'utf8');
const harness = await readFile(new URL('../scripts/smoke-browser-harness.mjs', import.meta.url), 'utf8');
const responsiveSmoke = await readFile(new URL('../scripts/responsive-smoke.mjs', import.meta.url), 'utf8');

test('product-surface manifest is the canonical active smoke registry', async () => {
  assert.equal(manifest.schema, 'vlab.product-surface/1');
  assert.equal('agent_execution_policy' in manifest, false);
  assert.equal('work_tracking' in manifest, false);

  const ids = new Set();
  const active = manifest.surfaces.filter((surface) => surface.state === 'active');
  assert.ok(active.length > 0, 'at least one active Lab surface is required');

  for (const surface of manifest.surfaces) {
    assert.ok(surface.id && surface.name, 'every surface needs stable id and name');
    assert.ok(!ids.has(surface.id), `duplicate surface id: ${surface.id}`);
    ids.add(surface.id);

    if (surface.state !== 'active') continue;
    assert.ok(Array.isArray(surface.smoke) && surface.smoke.length > 0, `${surface.id} lacks smoke coverage`);

    for (const check of surface.smoke) {
      assert.ok(check.script?.endsWith('.mjs'), `${surface.id} has invalid smoke script`);
      assert.ok((check.timeout_seconds ?? 0) > 0, `${surface.id} smoke must have a hard timeout`);
      const smokeUrl = new URL(`../../${check.script}`, import.meta.url);
      await access(smokeUrl);
      const smokeSource = await readFile(smokeUrl, 'utf8');
      assert.match(smokeSource, /createSmokeSession/, `${surface.id} must use the shared smoke browser harness`);
      assert.doesNotMatch(smokeSource, /node:child_process|google-chrome|--remote-debugging-port/, `${surface.id} must not launch its own Chrome process`);
    }
  }
});

test('Actions executes the manifest runner rather than hardcoded feature smoke scripts', () => {
  assert.match(workflow, /node web\/scripts\/run-active-product-smoke\.mjs/);
  assert.doesNotMatch(workflow, /node web\/scripts\/(browser|frontend-foundation|builtin-metric|result-persistence|responsive|showcase-ux)-smoke\.mjs/);
});

test('production smoke uses one shared Chrome host and isolated harness sessions', () => {
  assert.match(runner, /launchSmokeBrowserHost/);
  assert.match(runner, /VLAB_SMOKE_CHROME_PORT/);
  assert.match(harness, /Target\.createBrowserContext/);
  assert.match(harness, /Target\.disposeBrowserContext/);
  assert.match(harness, /Target\.attachToTarget/);
});

test('responsive smoke tolerates the transient pre-documentElement navigation state without weakening readiness', () => {
  assert.match(responsiveSmoke, /document\.documentElement\?\.dataset\.vlabUxHardened \?\? null/);
  assert.match(responsiveSmoke, /for \(let attempt = 0; attempt < 160; attempt \+= 1\)/);
  assert.match(responsiveSmoke, /await sleep\(100\)/);
  assert.match(responsiveSmoke, /parsed\?\.state === "ready" && parsed\?\.hardened === "true"/);
});

test('responsive smoke treats only Chrome navigation-transition evaluation failure as transient', () => {
  assert.match(responsiveSmoke, /message\.includes\("Inspected target navigated or closed"\)/);
  assert.match(responsiveSmoke, /if \(!message\.includes\("Inspected target navigated or closed"\)\) throw error/);
  assert.match(responsiveSmoke, /for \(let attempt = 0; attempt < 160; attempt \+= 1\)/);
  assert.match(responsiveSmoke, /await sleep\(100\)/);
  assert.match(responsiveSmoke, /parsed\?\.state === "ready" && parsed\?\.hardened === "true"/);
});

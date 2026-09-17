import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const manifestUrl = new URL('../product-surface.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
const targetUrl = process.argv[2];

if (!targetUrl) {
  throw new Error('Usage: node web/scripts/run-active-product-smoke.mjs <url>');
}

const active = manifest.surfaces.filter((surface) => surface.state === 'active');

if (active.length === 0) {
  throw new Error('Product-surface manifest contains no active user-facing surfaces.');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

for (const surface of active) {
  if (!Array.isArray(surface.smoke) || surface.smoke.length === 0) {
    throw new Error(`Active surface ${surface.id} has no smoke coverage.`);
  }

  console.log(`\n[smoke] ${surface.name} (${surface.id})`);

  for (const check of surface.smoke) {
    const attempts = check.attempts ?? 1;
    const delayMs = (check.delay_seconds ?? 0) * 1000;
    const timeoutMs = (check.timeout_seconds ?? 60) * 1000;
    let passed = false;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const result = spawnSync(process.execPath, [check.script, targetUrl], {
        cwd: process.cwd(),
        stdio: 'inherit',
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
      });

      if (result.status === 0 && !result.error) {
        passed = true;
        break;
      }

      if (result.error?.code === 'ETIMEDOUT') {
        console.error(`[smoke] timed out after ${check.timeout_seconds ?? 60}s: ${check.script}`);
      } else {
        console.error(`[smoke] failed attempt ${attempt}/${attempts}: ${check.script}`);
      }

      if (attempt < attempts && delayMs > 0) {
        await sleep(delayMs);
      }
    }

    if (!passed) {
      throw new Error(`Smoke coverage failed for active surface ${surface.id}: ${check.script}`);
    }
  }
}

console.log(`\n[smoke] verified ${active.length} active Lab surfaces from ${manifest.schema}`);

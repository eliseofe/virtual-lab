import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { launchSmokeBrowserHost } from './smoke-browser-harness.mjs';

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
const failures = [];

async function runCheck(script, timeoutMs, env) {
  return new Promise((resolve) => {
    let timedOut = false;
    let settled = false;
    const child = spawn(process.execPath, [script, targetUrl], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, timedOut });
    };

    child.once('error', (error) => finish({ status: null, error }));
    child.once('exit', (code, signal) => finish({ status: code, signal, error: null }));
  });
}

const browserHost = await launchSmokeBrowserHost();
const smokeEnv = { ...process.env, VLAB_SMOKE_CHROME_PORT: String(browserHost.port) };

try {
for (const surface of active) {
  if (!Array.isArray(surface.smoke) || surface.smoke.length === 0) {
    failures.push({ surface: surface.id, script: null, reason: 'no smoke coverage' });
    continue;
  }

  console.log(`\n[smoke] ${surface.name} (${surface.id})`);

  for (const check of surface.smoke) {
    const attempts = check.attempts ?? 1;
    const delayMs = (check.delay_seconds ?? 0) * 1000;
    const timeoutMs = (check.timeout_seconds ?? 60) * 1000;
    let passed = false;
    let failureReason = 'failed';

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const result = await runCheck(check.script, timeoutMs, smokeEnv);

      if (result.status === 0 && !result.error && !result.timedOut) {
        passed = true;
        break;
      }

      if (result.timedOut) {
        failureReason = `timed out after ${check.timeout_seconds ?? 60}s`;
        console.error(`[smoke] ${failureReason}: ${check.script}`);
      } else {
        failureReason = `failed attempt ${attempt}/${attempts}`;
        console.error(`[smoke] ${failureReason}: ${check.script}`);
      }

      if (attempt < attempts && delayMs > 0) {
        await sleep(delayMs);
      }
    }

    if (!passed) {
      failures.push({ surface: surface.id, script: check.script, reason: failureReason });
    }
  }
}

} finally {
  await browserHost.close();
}

if (failures.length > 0) {
  const chromeLog = browserHost.getChromeLog();
  if (chromeLog.trim()) console.error("\n[smoke] shared Chrome stderr:\n" + chromeLog);
  console.error('\n[smoke] production verification failures:');
  for (const failure of failures) {
    console.error(`- ${failure.surface}: ${failure.script ?? 'missing smoke'} (${failure.reason})`);
  }
  throw new Error(`Production smoke failed for ${failures.length} active check(s).`);
}

console.log(`\n[smoke] verified ${active.length} active Lab surfaces from ${manifest.schema}`);

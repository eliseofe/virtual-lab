const baseUrl = process.argv[2];
const expectedSha = process.argv[3];

if (!baseUrl || !expectedSha) {
  throw new Error('Usage: node web/scripts/wait-deployed-sha.mjs <base-url> <expected-sha>');
}

const markerUrl = new URL('deploy-sha.txt', baseUrl);
const deadline = Date.now() + 90_000;
let latest = 'unavailable';
let attempts = 0;

while (Date.now() < deadline) {
  attempts += 1;
  markerUrl.searchParams.set('candidate', expectedSha);
  markerUrl.searchParams.set('attempt', String(attempts));
  try {
    const response = await fetch(markerUrl, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(5_000),
    });
    latest = response.ok ? (await response.text()).trim() : `HTTP ${response.status}`;
    if (latest === expectedSha) {
      console.log(`Exact deployed candidate ${expectedSha} visible after ${attempts} check(s).`);
      process.exit(0);
    }
  } catch (error) {
    latest = error instanceof Error ? error.message : String(error);
  }
  await new Promise((resolve) => setTimeout(resolve, 2_000));
}

throw new Error(`GitHub Pages did not expose exact candidate ${expectedSha} within 90s; latest marker: ${latest}`);

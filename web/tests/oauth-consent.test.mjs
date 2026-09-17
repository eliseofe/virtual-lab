import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const index = await readFile(new URL('../oauth/consent/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../oauth/consent/app.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const registry = await readFile(new URL('../src/registry-ui-v3.js', import.meta.url), 'utf8');

test('OAuth authorization UI is part of the production Virtual Lab artifact', () => {
  assert.match(index, /<title>Virtual Lab — Connect an AI assistant<\/title>/);
  assert.match(index, /<h1>Connect an AI assistant<\/h1>/);
  assert.match(build, /const oauthDir = path\.join\(web, "oauth"\)/);
  assert.match(build, /await cp\(oauthDir, path\.join\(dist, "oauth"\), \{ recursive: true \}\)/);
  assert.match(build, /oauthConsent: "oauth\/consent\/"/);
});

test('OAuth consent reuses the production Virtual Lab login session', () => {
  const storageKeyMatch = registry.match(/storageKey: "([^"]+)"/);
  assert.ok(storageKeyMatch, 'production registry auth storage key must exist');
  assert.match(app, new RegExp(`storageKey: "${storageKeyMatch[1]}"`));
  assert.match(app, /getAuthorizationDetails\(authorizationId\)/);
  assert.match(app, /approveAuthorization\(authorizationId\)/);
  assert.match(app, /denyAuthorization\(authorizationId\)/);
});

test('registration preserves the OAuth request through email confirmation', () => {
  assert.match(app, /const confirmationRedirectUrl = new URL\(location\.href\)/);
  assert.match(app, /emailRedirectTo: confirmationRedirectUrl\.toString\(\)/);
  assert.doesNotMatch(index, /mock-sim|diagnostic client/i);
  assert.doesNotMatch(app, /virtual-lab-mock-sim/);
});

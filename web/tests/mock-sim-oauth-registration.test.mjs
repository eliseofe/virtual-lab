import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const index = await readFile(new URL('../../mock-sim/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../mock-sim/app.js', import.meta.url), 'utf8');

test('OAuth registration presents Virtual Lab rather than mock-sim diagnostics', () => {
  assert.match(index, /<title>Virtual Lab — Connect an AI assistant<\/title>/);
  assert.match(index, /<h1>Connect an AI assistant<\/h1>/);
  assert.match(index, /<h2>Sign in to Virtual Lab<\/h2>/);
  assert.match(index, />Create account<\/button>/);
  assert.doesNotMatch(index, /mock-sim|diagnostic client/i);
});

test('OAuth consent remains limited to the Experiment workspace', () => {
  assert.match(index, /requesting access to your Virtual Lab Experiment workspace/);
  assert.match(index, /does not grant simulator execution, results, GitHub, shell, filesystem or deployment access/i);
  assert.match(app, /getAuthorizationDetails\(authorizationId\)/);
  assert.match(app, /approveAuthorization\(authorizationId\)/);
  assert.match(app, /denyAuthorization\(authorizationId\)/);
});

test('email confirmation preserves the current OAuth authorization request', () => {
  assert.match(app, /const confirmationRedirectUrl = new URL\(location\.href\)/);
  assert.match(app, /emailRedirectTo: confirmationRedirectUrl\.toString\(\)/);
  assert.doesNotMatch(app, /emailRedirectTo:\s*['"]https:\/\/eliseofe\.github\.io\/virtual-lab-mock-sim\//);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const onboarding = await readFile(new URL('../src/student-onboarding.js', import.meta.url), 'utf8');
const shell = await readFile(new URL('../src/workspace-shell.js', import.meta.url), 'utf8');

const MCP_URL = 'https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp';

test('student onboarding is loaded by the production workspace shell', () => {
  assert.match(shell, /import "\.\/student-onboarding\.js";/);
});

test('Getting started remains available as persistent Help and is non-modal', () => {
  assert.match(onboarding, /"data-vlab-nav": "help"/);
  assert.match(onboarding, /Getting started \/ Help/);
  assert.match(onboarding, /aria-modal", "false"/);
});

test('automatic Getting started opens once from stable signed-in state', () => {
  assert.match(onboarding, /dataset\.vlabAuthState !== "signed-in"/);
  assert.match(onboarding, /markSeen\(\);\s*openHelp\(\);/s);
  assert.match(onboarding, /closeHelp\(\{ remember: true \}\)/);
  assert.match(onboarding, /attributeFilter: \["data-vlab-auth-state"\]/);
  assert.doesNotMatch(onboarding, /observe\(document\.body, \{\s*childList:/s);
});

test('Getting started ignores Professor presentation when deciding to auto-open', () => {
  assert.match(onboarding, /#professor-menu/);
  assert.match(onboarding, /currentProfessor\.hidden/);
});

test('Grok and Claude use the production MCP endpoint', () => {
  assert.ok(onboarding.includes(MCP_URL));
  assert.match(onboarding, /Use with Grok/);
  assert.match(onboarding, /Use with Claude/);
  assert.match(onboarding, /grok\.com\/connectors/);
  assert.match(onboarding, /claude\.ai\/settings\/connectors/);
});

test('first connector exercise is deliberately read-only', () => {
  assert.match(onboarding, /Read my workspace and list the Experiments available to me/);
  assert.match(onboarding, /Do not edit anything/);
  assert.doesNotMatch(onboarding, /implement Studies|create a Study|start Studies/i);
});

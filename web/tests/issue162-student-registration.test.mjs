import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const registration = readFileSync(new URL('../src/student-registration.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../src/workspace-shell.js', import.meta.url), 'utf8');

test('student registration is exposed without taking over the authoritative login session', () => {
  assert.match(registration, /auth\.signUp\(/);
  assert.match(registration, /Create account/);
  assert.match(registration, /persistSession:\s*false/);
  assert.match(registration, /detectSessionInUrl:\s*false/);
  assert.doesNotMatch(registration, /service_role|sb_secret_/i);
});

test('signed-out production chrome is human-facing', () => {
  assert.match(registration, /Sign in or create account/);
  assert.match(registration, /data-vlab-nav="account"/);
  assert.match(registration, /signedOut \? "Sign in" : "Account"/);
  assert.match(registration, /New accounts start with the Student role/);
});

test('workspace shell loads student registration after registry UI', () => {
  const registry = shell.indexOf('import "./registry-ui-v3.js"');
  const registrationImport = shell.indexOf('import "./student-registration.js"');
  assert.ok(registry >= 0);
  assert.ok(registrationImport > registry);
});

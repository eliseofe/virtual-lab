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

test('sign in is the default auth flow and account creation is an explicit mode', () => {
  assert.match(registration, /let authMode = "sign-in"/);
  assert.match(registration, /data-vlab-create-account-mode/);
  assert.match(registration, /data-vlab-back-to-sign-in/);
  assert.match(registration, /nameRow\.hidden = !creating/);
  assert.match(registration, /signIn\.hidden = creating/);
  assert.match(registration, /createAccount\.hidden = !creating/);
  assert.match(registration, /heading\.textContent = creating \? "Create Account" : "Sign In"/);
});

test('signed-out production chrome has a stable high-level auth presentation', () => {
  assert.match(registration, /document\.body\.dataset\.vlabAuthState = signedOut \? "signed-out" : "signed-in"/);
  assert.match(registration, /data-vlab-nav="account"/);
  assert.match(registration, /const text = signedOut \? "Sign In" : "Account"/);
  assert.doesNotMatch(registration, /New accounts start with the Student role|New to Virtual Lab/);
});

test('registration watches only the auth surface and React chrome, not the whole document', () => {
  assert.match(registration, /authObserver\.observe\(auth/);
  assert.match(registration, /chromeObserver\.observe\(chromeRoot/);
  assert.doesNotMatch(registration, /observe\(document\.body/);
  assert.doesNotMatch(registration, /characterData:\s*true/);
});

test('workspace shell loads student registration after registry UI', () => {
  const registry = shell.indexOf('import "./registry-ui-v3.js"');
  const registrationImport = shell.indexOf('import "./student-registration.js"');
  assert.ok(registry >= 0);
  assert.ok(registrationImport > registry);
});

test('registration requires structured human identity and passes it as signup metadata', () => {
  assert.match(registration, /placeholder = "First name"/);
  assert.match(registration, /placeholder = "Last name"/);
  assert.match(registration, /first_name: given/);
  assert.match(registration, /last_name: family/);
  assert.match(registration, /display_name:/);
  assert.ok(registration.includes("${given} ${family}"));
  assert.match(registration, /Enter first name, last name, email and password/);
});

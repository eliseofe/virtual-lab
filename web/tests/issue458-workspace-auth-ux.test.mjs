import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [management, registration, react, simulation, authoring, index, responsive, onboarding, chrome] = await Promise.all([
  readFile(new URL("../src/experiment-management.js", import.meta.url), "utf8"),
  readFile(new URL("../src/student-registration.js", import.meta.url), "utf8"),
  readFile(new URL("../src/react-migration-root.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/simulation-react-presentation.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/authoring-react-presentation.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/index.html", import.meta.url), "utf8"),
  readFile(new URL("../scripts/responsive-smoke.mjs", import.meta.url), "utf8"),
  readFile(new URL("../scripts/student-onboarding-smoke.mjs", import.meta.url), "utf8"),
  readFile(new URL("../src/react-chrome.css", import.meta.url), "utf8"),
]);

test("#458 gives the three workspace destinations the exact same names as their cards", () => {
  assert.match(react, /'control-panel', '#control-panel', 'Control Panel'/);
  assert.match(react, /'simulation', '#simulation', 'Simulation'/);
  assert.match(react, /'edit-experiment', '#authoring-workbench', 'Experiment Authoring'/);

  assert.match(management, /panelTitle\.textContent = "Control Panel"/);
  assert.match(simulation, /vlab-workspace-card-title">Simulation<\/Title>/);
  assert.match(authoring, /vlab-workspace-card-title">Experiment Authoring<\/Title>/);
  assert.match(index, /vlab-workspace-card-title">Simulation<\/h2>/);
  assert.match(index, /vlab-workspace-card-title">Experiment Authoring<\/h2>/);
  assert.match(chrome, /\.vlab-workspace-card-title \{/);
});

test("#458 removes competing primary title/subtitle layers", () => {
  assert.doesNotMatch(management, /taskHeading\("Current Experiment"\)/);
  assert.doesNotMatch(simulation, />Arena<\/Title>|>Simulation<\/Text>/);
  assert.doesNotMatch(authoring, />Experiment source<\/Title>|>Authoring<\/Text>/);
  assert.doesNotMatch(index, /section-kicker">SIMULATION|section-kicker">AUTHORING|>Experiment source<\/h2>|>Arena<\/h2>/);
});

test("#458 signed-out Control Panel exposes Sign In without a Save & share card", () => {
  assert.match(management, /signIn\.textContent = "Sign In"/);
  assert.match(management, /currentActions\.append\(signIn\)/);
  assert.match(management, /management\.region\.hidden = !isSignedIn/);
  assert.match(management, /management\.signIn\.hidden = isSignedIn/);
  assert.doesNotMatch(management, /Sign in to save/);
  assert.match(responsive, /state\.managementTasks\.saveShare/);
  assert.match(responsive, /state\.experimentManagement\.visible/);
  assert.match(responsive, /state\.experimentManagement\.signInVisible/);
});

test("#458 makes Sign In the default auth mode and reveals names only for account creation", () => {
  assert.match(registration, /let authMode = "sign-in"/);
  assert.match(registration, /nameRow\.hidden = !creating/);
  assert.match(registration, /signIn\.hidden = creating/);
  assert.match(registration, /createAccount\.hidden = !creating/);
  assert.match(registration, /headingText = signedOut[\s\S]*"Create Account"[\s\S]*"Sign In"[\s\S]*: "Account"/);
  assert.match(registration, /const text = signedOut \? "Sign In" : "Account"/);
  assert.match(react, /document\.body\.dataset\.vlabAuthState \?\? 'signed-out'/);
  assert.match(react, /attributeFilter: \['data-vlab-auth-state'\]/);
  assert.match(react, /const accountLabel = authState === 'signed-in' \? 'Account' : 'Sign In'/);
  assert.match(react, /data-vlab-nav="account-mobile" aria-label=\{accountLabel\}/);
  assert.doesNotMatch(registration, /New to Virtual Lab|New accounts start with the Student role|Sign in or create account/);
  assert.match(onboarding, /data-vlab-nav=\"account\"/);
  assert.match(onboarding, /initial\.heading !== "Sign In"/);
  assert.match(onboarding, /createAccountMode\.heading !== "Create Account"/);
  assert.match(onboarding, /initial\.firstNameVisible|createAccountMode\.firstNameVisible/);
});

test("#458 production smoke spans phone, foldable, desktop and ultra-wide with the unified titles", () => {
  assert.match(responsive, /label: "mobile", width: 390, height: 844/);
  assert.match(responsive, /label: "foldable", width: 820, height: 1180/);
  assert.match(responsive, /label: "desktop", width: 1366, height: 900/);
  assert.match(responsive, /label: "ultra-wide", width: 1920, height: 1080/);
  assert.match(responsive, /\["Control Panel", "Simulation", "Experiment Authoring"\]/);
});

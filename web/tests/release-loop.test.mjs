// Reliable release loop (#533): the pieces that decide what an agent is told
// about an exact candidate, and that CI verifies a build before publishing.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { globToRegExp, isCandidateChange, pathsIgnore } from "../scripts/wait-for-run.mjs";

const workflow = readFileSync(new URL("../../.github/workflows/ci-pages.yml", import.meta.url), "utf8");

test("wait-for-run reads the workflow's push paths-ignore and classifies documentation-only commits", async () => {
  const patterns = (await pathsIgnore()).map(globToRegExp);
  assert.ok(patterns.length >= 3);
  assert.equal(isCandidateChange(["docs/AUTHORING_CONTRACT.md"], patterns), false);
  assert.equal(isCandidateChange(["README.md", "web/src/README.md", "docs/archive/x.txt"], patterns), false);
  assert.equal(isCandidateChange(["docs/DEPLOYMENT.md", "web/src/main.js"], patterns), true);
  assert.equal(isCandidateChange([".github/workflows/ci-pages.yml"], patterns), true, "workflow changes are validated");
  assert.equal(isCandidateChange([".github/terminal-report.json"], patterns), true);
  assert.equal(isCandidateChange([], patterns), true, "unknown file list is treated as a candidate");
});

test("CI verifies the exact build in a browser before anything is published", () => {
  const verifyDist = workflow.indexOf("Verify browser artifact");
  const prePublish = workflow.indexOf("node web/scripts/pre-publish-smoke.mjs");
  const upload = workflow.indexOf("Upload Pages artifact");
  const deploy = workflow.indexOf("Deploy to GitHub Pages");
  assert.ok(verifyDist >= 0 && prePublish > verifyDist && upload > prePublish && deploy > upload);
  const prePublishStep = workflow.slice(workflow.lastIndexOf("- name:", prePublish), prePublish);
  assert.doesNotMatch(prePublishStep, /if:/, "pre-publish smoke also runs on pull requests");
});

test("a release on main is never cancelled halfway, and workflow changes are not skipped", () => {
  assert.match(workflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  assert.doesNotMatch(workflow, /\.github\/workflows\/\*\*/);
});

test("every pull request reports the required build check, including documentation-only ones", () => {
  const pullRequest = workflow.slice(workflow.indexOf("\n  pull_request:"), workflow.indexOf("\n  workflow_dispatch:"));
  assert.ok(pullRequest.includes("branches: [main]"));
  assert.doesNotMatch(pullRequest, /^\s+paths(-ignore)?:/m);
  const push = workflow.slice(workflow.indexOf("\n  push:"), workflow.indexOf("\n  pull_request:"));
  assert.match(push, /paths-ignore:/, "documentation-only pushes to main still publish nothing");
});

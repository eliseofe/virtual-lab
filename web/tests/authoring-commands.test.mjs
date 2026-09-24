// Behaviour tests for the authoring panel's model and command surface (#564).

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { authoringCommands, provideAuthoringCommands } from "../src/authoring-panel/authoring-commands.js";
import { AUTHORING_INITIAL_STATE, authoringModel, setArtifactDirty } from "../src/authoring-panel/authoring-model.js";

test("the authoring model starts where the page starts", async () => {
  const index = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  const status = index.match(/id="authoring-runtime-state"[^>]*data-state="([^"]+)"[^>]*>([^<]+)</);
  assert.deepEqual([AUTHORING_INITIAL_STATE.status.state, AUTHORING_INITIAL_STATE.status.text], [status[1], status[2]]);
  assert.match(index, /<button id="apply-workspace"[^>]* disabled>/);
  assert.equal(AUTHORING_INITIAL_STATE.applyDisabled, true);
  assert.match(index, new RegExp(`data-artifact-id="${AUTHORING_INITIAL_STATE.active}"[^>]*aria-selected="true"`));
  const tabs = [...index.matchAll(/class="authoring-tab"[^>]*data-artifact-id="([^"]+)" aria-controls="([^"]+)"[^>]*>([^<]+)</g)]
    .map(([, id, controls, label]) => ({ id, label, controls }));
  assert.deepEqual(AUTHORING_INITIAL_STATE.artifacts.map((artifact) => ({ ...artifact })), tabs,
    "the panel shows the page's built-in tabs even before the editor module runs");
});

test("each artifact's unapplied-edits flag is set independently", () => {
  setArtifactDirty("controller", true);
  setArtifactDirty("metrics", true);
  setArtifactDirty("controller", false);
  assert.deepEqual(authoringModel.get().dirty, { controller: false, metrics: true });
  assert.ok(Object.isFrozen(authoringModel.get().dirty));
});

test("authoring commands do nothing until provided, then reach the one authoring controller", () => {
  assert.doesNotThrow(() => authoringCommands.apply());
  const calls = [];
  provideAuthoringCommands({ selectArtifact: (id) => calls.push(["select", id]), apply: () => calls.push(["apply"]) });
  authoringCommands.selectArtifact("metrics");
  authoringCommands.apply();
  assert.deepEqual(calls, [["select", "metrics"], ["apply"]]);
  assert.ok(Object.isFrozen(authoringCommands));
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const indexUrl = new URL("../src/index.html", import.meta.url);
const shellUrl = new URL("../src/workspace-shell.js", import.meta.url);
const workbenchUrl = new URL("../src/authoring-workspace.js", import.meta.url);

async function sources() {
  return Promise.all([
    readFile(indexUrl, "utf8"),
    readFile(shellUrl, "utf8"),
    readFile(workbenchUrl, "utf8"),
  ]);
}

test("issue #155 replaces the stacked core editors with one tabbed authoring workbench", async () => {
  const [html] = await sources();
  assert.match(html, /id="authoring-workbench" class="panel editor-panel"/);
  assert.match(html, /id="authoring-tabs"[^>]*role="tablist"/);

  for (const artifact of ["configuration", "initialization", "controller"]) {
    assert.match(html, new RegExp(`data-artifact-id="${artifact}"`));
    assert.match(html, new RegExp(`data-authoring-artifact-pane="${artifact}"`));
  }

  assert.equal((html.match(/class="panel editor-panel"/g) ?? []).length, 1, "only the workbench is a permanent editor panel");
  const canvas = html.indexOf('id="simulation-canvas"');
  const workbench = html.indexOf('id="authoring-workbench"');
  assert.ok(canvas >= 0 && workbench > canvas, "simulation stage must remain before authoring");
});

test("issue #155 exposes one visible apply action while preserving legacy runtime endpoints", async () => {
  const [html, , workbench] = await sources();
  assert.match(html, /id="apply-workspace"[^>]*>Apply changes &amp; restart<\/button>/);
  assert.match(html, /id="apply-setup"[^>]*hidden[^>]*>Apply &amp; restart<\/button>/);
  assert.match(html, /id="compile"[^>]*hidden[^>]*>Apply &amp; restart<\/button>/);

  assert.match(workbench, /if \(setupDirty\)[\s\S]*applySetup\.click\(\)/);
  assert.match(workbench, /if \(controllerDirty\)[\s\S]*compileController\.click\(\)/);
  assert.doesNotMatch(workbench, /new Worker|postMessage\(|supabase|fetch\(/, "presentation adapter must not acquire runtime/backend behavior");
});

test("issue #155 keeps additional artifacts inside the same single-active workspace", async () => {
  const [html, , workbench] = await sources();
  const host = html.indexOf('id="additional-experiment-artifacts"');
  const workbenchStart = html.indexOf('id="authoring-workbench"');
  const workbenchEnd = html.indexOf('</section>\n\n      <details class="panel metadata-panel technical-panel"');
  assert.ok(host > workbenchStart && host < workbenchEnd, "additional artifact host must be inside authoring workbench");
  assert.match(workbench, /generic-artifact-panel/);
  assert.match(workbench, /data-experiment-artifact-editor/);
  assert.match(workbench, /dataAuthoringArtifactPane/);
  assert.match(workbench, /pane\.hidden = pane !== nextPane/);
});

test("issue #155 puts compiled IR behind Technical details", async () => {
  const [html] = await sources();
  const technical = html.indexOf('class="panel metadata-panel technical-panel"');
  const initializerIr = html.indexOf('id="initializer-ir"');
  const controllerIr = html.indexOf('id="controller-ir"');
  assert.ok(technical >= 0 && initializerIr > technical && controllerIr > technical);
  assert.match(html, /<summary>Initializer compiled IR<\/summary>/);
  assert.match(html, /<summary>Controller compiled IR<\/summary>/);
});

test("issue #155 colocates registry persistence controls without changing registry ownership", async () => {
  const [html, shell, workbench] = await sources();
  assert.match(html, /id="authoring-persistence-slot"/);
  assert.match(workbench, /\.registry-save-row/);
  assert.match(workbench, /\.registry-new-form/);
  assert.match(workbench, /\.registry-note/);
  assert.match(workbench, /\.registry-message/);
  assert.match(shell, /import "\.\/authoring-workspace\.js";/);
  assert.doesNotMatch(workbench, /createClient|from\("experiments"\)|\.update\(|\.insert\(/);
});

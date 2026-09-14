import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const indexUrl = new URL("../src/index.html", import.meta.url);
const styleUrl = new URL("../src/style.css", import.meta.url);
const shellUrl = new URL("../src/workspace-shell.js", import.meta.url);

test("issue #150 keeps simulation controls with the arena and removes the sidebar shell", async () => {
  const [html, css, shell] = await Promise.all([
    readFile(indexUrl, "utf8"),
    readFile(styleUrl, "utf8"),
    readFile(shellUrl, "utf8"),
  ]);

  assert.equal(html.includes('class="sidebar"'), false, "legacy sidebar must not govern the workspace");
  assert.match(css, /\.workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.equal(css.includes(".sidebar {"), false, "no sticky/sidebar layout may remain");

  const experiment = html.indexOf('class="panel experiment-panel"');
  const stage = html.indexOf('class="panel stage-panel"');
  const run = html.indexOf('id="run"');
  const canvas = html.indexOf('id="simulation-canvas"');
  const firstEditor = html.indexOf('class="panel editor-panel"');

  assert.ok(experiment >= 0 && stage > experiment, "current experiment context must precede the stage");
  assert.ok(run > stage && run < canvas, "Run must live inside the stage before the arena");
  assert.ok(canvas < firstEditor, "arena must precede authoring panels");

  for (const id of [
    "run", "pause", "restart", "restart-new-seed", "run-seed",
    "simulation-speed", "simulation-speed-value", "actual-simulation-speed",
    "scientific-time", "physics-ticks", "control-updates",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `existing runtime control ${id} must be preserved`);
  }

  assert.match(html, /id="workspace-utilities"/);
  assert.match(html, /id="account-menu"/);
  assert.match(html, /id="professor-menu"/);
  assert.match(html, /src="\.\/workspace-shell\.js"/);

  assert.match(shell, /querySelector\("\.registry-panel"\)/);
  assert.match(shell, /querySelector\("\.professor-panel"\)/);
  assert.equal(shell.includes("supabase"), false, "presentation shell must not acquire registry/backend responsibilities");
  assert.equal(shell.includes("fetch("), false, "presentation shell must not add network behavior");
});

test("issue #150 mobile hierarchy keeps simulation ahead of admin utilities", async () => {
  const [html, css] = await Promise.all([
    readFile(indexUrl, "utf8"),
    readFile(styleUrl, "utf8"),
  ]);

  const workspaceEnd = html.indexOf("</main>");
  const utilityDialog = html.indexOf('id="workspace-utilities"');
  assert.ok(utilityDialog > workspaceEnd, "administrative utilities must sit outside the scientific page flow");

  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.control-grid\s*\{\s*grid-template-columns:\s*1fr 1fr;/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.control-grid button\s*\{\s*min-height:\s*44px;/);
});

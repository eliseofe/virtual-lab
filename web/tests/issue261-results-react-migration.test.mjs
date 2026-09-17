import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [reactRoot, adapter, resultsEngine, resultsCss, reactCss] = await Promise.all([
  readFile(new URL("../src/react-migration-root.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/results-react-adapter.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/results-ui.js", import.meta.url), "utf8"),
  readFile(new URL("../src/results-ui.css", import.meta.url), "utf8"),
  readFile(new URL("../src/react-chrome.css", import.meta.url), "utf8"),
]);

test("#261 React/Mantine owns visible Results controls without owning metric runtime", () => {
  assert.match(reactRoot, /function ResultsPresentation\(/);
  assert.match(reactRoot, /<Menu/);
  assert.match(reactRoot, /<Checkbox/);
  assert.match(reactRoot, /Follow live/);
  assert.match(reactRoot, /data-vlab-react-results="mounted"/);
  assert.match(reactRoot, /data-vlab-results-series=/);
  assert.match(reactRoot, /data-vlab-results-follow=/);
  assert.match(reactRoot, /data-vlab-results-add/);
  assert.doesNotMatch(reactRoot, /compileMetrics|vlab:metric-batch.*detail|createClient|supabase|sampleCount\s*=|samples\s*=\s*new Map/);
});

test("#261 coexistence adapter proxies the authoritative Results engine and cannot self-trigger through React portals", () => {
  assert.match(adapter, /window\.__vlabResultsUI/);
  assert.match(adapter, /#results-add-panel/);
  assert.match(adapter, /\.results-series-option input\[type="checkbox"\]/);
  assert.match(adapter, /\[data-action="reset-view"\]/);
  assert.match(adapter, /\[data-action="remove"\]/);
  assert.match(adapter, /observer\?\.observe\(panelHost!, \{ childList: true \}\)/);
  assert.doesNotMatch(adapter, /observer\?\.observe\([^\n]*subtree:\s*true/);
  assert.doesNotMatch(adapter, /createClient|supabase|compileMetrics|vlab:metric-batch[^'\"]*=/);
});

test("#261 existing Results engine remains authoritative for samples, bindings, viewport and canvas", () => {
  assert.match(resultsEngine, /const samples = new Map\(\)/);
  assert.match(resultsEngine, /function renderPanel\(panel\)/);
  assert.match(resultsEngine, /panel\.view = \{ min:/);
  assert.match(resultsEngine, /panelBindings: \(\) => panels\.map/);
  assert.match(resultsEngine, /sampleCount: \(id\)/);
  assert.match(resultsEngine, /addPanel: \(ids = \[\]\)/);
});

test("#261 React hides only superseded Results control chrome, never the scientific plot surface", () => {
  assert.match(reactCss, /\.vlab-react-results-mounted \.live-results > \.live-results-head/);
  assert.match(reactCss, /\.results-plot-panel > \.results-plot-head/);
  assert.match(reactCss, /\.results-plot-panel > \.results-series-picker/);
  assert.doesNotMatch(reactCss, /\.results-plot-canvas[^}]*display:\s*none|\.results-plot-wrap[^}]*display:\s*none/s);
  assert.match(resultsCss, /\.results-plot-canvas/);
});

test("#261 detached state is presentation-only and Follow live delegates to the legacy reset-view action", () => {
  assert.match(reactRoot, /const \[detached, setDetached\]/);
  assert.match(reactRoot, /panelIdFromEventTarget\(event\.target\)/);
  assert.match(reactRoot, /followLiveResults\(panel\.id\)/);
  assert.match(adapter, /followLiveResults[\s\S]*\[data-action="reset-view"\]/);
  assert.match(adapter, /\.results-plot-canvas/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const reactRoot = readFileSync(new URL("../src/react-migration-root.tsx", import.meta.url), "utf8");
const chromeCss = readFileSync(new URL("../src/react-chrome.css", import.meta.url), "utf8");
const build = readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");

function hiddenSelectors(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, , declarations]) => /display:\s*none/.test(declarations))
    .flatMap(([, selectors]) => selectors.split(",").map((selector) => selector.trim()));
}

test("#254 React owns visible application chrome and true global navigation", () => {
  for (const marker of [
    'data-vlab-react-chrome="mounted"',
    'data-vlab-nav="simulation"',
    'data-vlab-nav="authoring"',
    'data-vlab-nav="account"',
  ]) assert.match(reactRoot, new RegExp(marker.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&")));

  for (const removed of [
    'data-vlab-nav="experiment"',
    'data-vlab-nav="results"',
    'data-vlab-nav="showcase"',
    'data-vlab-nav="professor"',
    'data-vlab-current-experiment',
    'data-vlab-worker-status',
  ]) assert.doesNotMatch(reactRoot, new RegExp(removed.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&")));

  assert.match(reactRoot, /<Drawer/);
  assert.match(reactRoot, /<Burger/);
  assert.match(reactRoot, /Eliseo Ferrante/);
  assert.match(reactRoot, /Swarm robotics/);
});

test("#254 presentation proxies only true global workspace actions", () => {
  assert.match(reactRoot, /proxyClick\('#account-menu'\)/);
  assert.match(reactRoot, /scrollTo\('#simulation'\)/);
  assert.match(reactRoot, /scrollTo\('#authoring-workbench'\)/);
  assert.doesNotMatch(reactRoot, /proxyClick\('\.showcase-launcher'\)|proxyClick\('#professor-menu'\)|scrollTo\('\.experiment-panel'\)|scrollTo\('#live-results'\)/);
  assert.doesNotMatch(reactRoot, /createClient|supabase|vlab_kernel|ControllerRuntime|simulation-canvas|#run|#pause/);
});

test("#254 keeps Account global while Professor administration leaves the ribbon", () => {
  assert.match(reactRoot, /proxyClick\('#account-menu'\)/);
  assert.match(reactRoot, /data-vlab-nav="account"/);
  assert.doesNotMatch(reactRoot, /data-vlab-nav="professor"|proxyClick\('#professor-menu'\)/);
});

test("#254 hides only the superseded legacy topbar after React mounts", () => {
  assert.match(chromeCss, /\.vlab-react-chrome-mounted \.topbar/);
  assert.match(chromeCss, /display:\s*none !important/);
  const hidden = hiddenSelectors(chromeCss);
  for (const selector of [".stage-panel", "#simulation-canvas", "#authoring-workbench"]) {
    assert.ok(!hidden.includes(selector), `${selector} must remain visible as a complete product surface`);
  }
  assert.match(build, /id=\"react-migration-root\" aria-label=\"Virtual Lab application navigation\"/);
  assert.doesNotMatch(build, /id=\"react-migration-root\" hidden/);
});

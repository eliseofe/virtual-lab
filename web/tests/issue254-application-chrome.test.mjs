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

test("#254 React owns visible application chrome and workspace navigation", () => {
  for (const marker of [
    'data-vlab-react-chrome="mounted"',
    'data-vlab-nav="experiment"',
    'data-vlab-nav="simulation"',
    'data-vlab-nav="results"',
    'data-vlab-nav="authoring"',
    'data-vlab-nav="showcase"',
    'data-vlab-nav="account"',
  ]) assert.match(reactRoot, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(reactRoot, /<Drawer/);
  assert.match(reactRoot, /<Burger/);
  assert.match(reactRoot, /data-vlab-current-experiment/);
  assert.match(reactRoot, /data-vlab-worker-status/);
});

test("#254 presentation proxies existing authoritative workspace actions", () => {
  assert.match(reactRoot, /proxyClick\('\.showcase-launcher'\)/);
  assert.match(reactRoot, /proxyClick\('#account-menu'\)/);
  assert.match(reactRoot, /scrollTo\('\.experiment-panel'\)/);
  assert.match(reactRoot, /scrollTo\('\.stage-panel'\)/);
  assert.match(reactRoot, /scrollTo\('#live-results'\)/);
  assert.match(reactRoot, /scrollTo\('#authoring-workbench'\)/);
  assert.doesNotMatch(reactRoot, /createClient|supabase|vlab_kernel|ControllerRuntime|simulation-canvas|#run|#pause/);
});

test("#254 keeps Account and Professor utilities represented in the React shell", () => {
  assert.match(reactRoot, /professorAvailable/);
  assert.match(reactRoot, /professorLabel/);
  assert.match(reactRoot, /proxyClick\('#account-menu'\)/);
  assert.match(reactRoot, /proxyClick\('#professor-menu'\)/);
  assert.match(reactRoot, /data-vlab-nav="account"/);
  assert.match(reactRoot, /data-vlab-nav="professor"/);
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

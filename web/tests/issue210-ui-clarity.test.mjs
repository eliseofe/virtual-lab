import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sourceWithStyles } from "./support/source-with-styles.mjs";

const clarity = await sourceWithStyles("ui-clarity.js");
const shell = await readFile(new URL("../src/workspace-shell.js", import.meta.url), "utf8");

test("#210 clarity layer is loaded after the existing workspace presentation adapters", () => {
  const hardening = shell.indexOf('import "./ux-hardening.js";');
  const clarityImport = shell.indexOf('import "./ui-clarity.js";');
  assert.ok(hardening >= 0, "UX hardening import missing");
  assert.ok(clarityImport > hardening, "UI clarity must load after existing UX adapters");
});

test("#210 replaces weak page labels with a clear product and section hierarchy", () => {
  assert.match(clarity, /setText\("\.eyebrow", "SWARM ROBOTICS"\)/);
  assert.match(clarity, /setText\("h1", "Virtual Lab"\)/);
  assert.match(clarity, /setText\("#arena-heading", "Simulation"\)/);
  assert.match(clarity, /setText\("#authoring-heading", "Authoring"\)/);
  assert.match(clarity, /h1 \{[\s\S]*font-size: clamp\(31px, 4vw, 44px\)/);
  assert.match(clarity, /h2 \{[\s\S]*font-size: 22px/);
});

test("#210 removes repetitive helper prose while preserving actionable dirty/conflict guidance", () => {
  for (const selector of [
    ".section-kicker",
    ".speed-control > .muted",
    ".stage-note",
    ".authoring-workbench-head .muted",
    ".authoring-pane-head .muted",
    // #554: ".experiment-browser-context > span" belonged to the retired flat browser, now removed.
    '.registry-message[data-state="idle"]',
    ".registry-note",
    '.feedback[data-state="idle"]',
  ]) {
    assert.ok(clarity.includes(selector), `missing clutter suppression for ${selector}`);
  }
  assert.match(clarity, /registry-save-state\[data-state="dirty"\]/);
  assert.match(clarity, /registry-save-state\[data-state="conflict"\]/);
});

test("#210 promotes previously tiny runtime and Results information to readable sizes", () => {
  assert.match(clarity, /runtime-state span,[\s\S]*font-size: 10\.5px/);
  assert.match(clarity, /stats-grid strong \{[\s\S]*font-size: 16px/);
  assert.match(clarity, /live-results-title h3 \{[\s\S]*font-size: 17px/);
  assert.match(clarity, /live-results-status \{[\s\S]*font-size: 12px/);
  assert.match(clarity, /results-series-picker > summary,[\s\S]*font-size: 12px/);
  assert.match(clarity, /results-legend \{[\s\S]*font-size: 11\.5px/);
});

test("#210 preserves deliberate mobile hierarchy instead of only shrinking desktop", () => {
  assert.match(clarity, /@media \(max-width: 720px\)/);
  assert.match(clarity, /h1 \{[\s\S]*font-size: clamp\(29px, 9vw, 36px\)/);
  assert.match(clarity, /\.experiment-panel,[\s\S]*\.stage-panel,[\s\S]*#authoring-workbench \{[\s\S]*padding: 14px/);
  assert.match(clarity, /\.authoring-tab \{[\s\S]*min-height: 44px/);
});

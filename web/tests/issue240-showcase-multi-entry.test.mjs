import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const clarity = readFileSync(new URL("../src/showcase-clarity.js", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/workspace-shell.js", import.meta.url), "utf8");

test("#240 multi-entry clarity layer is loaded with the Showcase shell", () => {
  assert.match(shell, /import "\.\/showcase-clarity\.js"/);
});

test("#240 Showcase cards explain that selection opens and runs an Experiment", () => {
  assert.match(clarity, /Open & run/);
  assert.match(clarity, /Loaded in Lab/);
  assert.match(clarity, /aria-current/);
  assert.match(clarity, /Open \$\{entry\.title\} in Lab and run it/);
});

test("#240 destructive curation is bound to the specific Showcase entry", () => {
  assert.match(clarity, /showcase-entry-remove/);
  assert.match(clarity, /Remove \$\{entry\.title\} from Showcase/);
  assert.match(clarity, /Remove “\$\{entry\.title\}” from Showcase\?/);
  assert.match(clarity, /p_experiment_id: entry\.source_experiment_id/);
  assert.match(clarity, /data-showcase-legacy-remove/);
});

test("#240 opening a Showcase URL starts only after the selected snapshot is installed", () => {
  assert.match(clarity, /async function startActiveShowcase/);
  assert.match(clarity, /if \(!activeShowcaseId\(\)\) return/);
  assert.match(clarity, /if \(!current\.hidden && !runButton\.disabled\)/);
  assert.match(clarity, /runButton\.click\(\)/);
});

test("#240 mobile entry actions retain explicit touch targets", () => {
  assert.match(clarity, /@media \(max-width: 680px\)/);
  assert.match(clarity, /\.showcase-entry-remove \{ min-height: 44px; width: 100%; \}/);
});

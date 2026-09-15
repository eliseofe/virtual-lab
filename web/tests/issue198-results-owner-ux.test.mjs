import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const text = (relative) => readFile(path.join(repo, relative), "utf8");

test("#198 owner UX: configured metric is visible without creating an empty plot", async () => {
  const source = await text("web/src/results-ui.js");
  assert.match(source, /button\.disabled = definitions\.size === 0/);
  assert.match(source, /addPanel\(ids\.slice\(0, 1\)\)/);
  assert.match(source, /else if \(!panels\.length\) \{\s*addPanel\(defaultMetricIds\(\)\.slice\(0, 1\)\)/s);
  assert.doesNotMatch(source, /addPanel\(defaultMetricIds\(\)\);/);
});

test("#198 owner UX: plot and chooser identify the selected metric by name", async () => {
  const source = await text("web/src/results-ui.js");
  assert.match(source, /title\.textContent = label/);
  assert.match(source, /summary\.textContent = `Metric: \$\{label\}`/);
  assert.match(source, /summary\.textContent = "Choose metric"/);
});

test("#198 owner UX: metric chooser expands in document flow and cannot be clipped as a floating popup", async () => {
  const css = await text("web/src/results-ui.css");
  const options = css.match(/\.results-series-options\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.ok(options, "results-series-options rule is required");
  assert.doesNotMatch(options, /position\s*:/);
  assert.doesNotMatch(options, /box-shadow\s*:/);
  assert.match(css, /\.results-series-picker\[open\] > summary/);
});

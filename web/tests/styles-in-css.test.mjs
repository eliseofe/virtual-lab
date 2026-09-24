// Styling lives in CSS files loaded by the page, not in JavaScript (#543).

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { MOVED_STYLES } from "./support/source-with-styles.mjs";

const src = new URL("../src/", import.meta.url);

test("no browser module injects a <style> element", async () => {
  for (const name of (await readdir(src)).filter((file) => /\.(js|ts|tsx)$/.test(file))) {
    const text = await readFile(new URL(name, src), "utf8");
    assert.doesNotMatch(text, /createElement\(["']style["']\)/, `${name} must load CSS from web/src/styles/ instead`);
  }
});

test("index.html links every moved stylesheet once, after the React stylesheet marker, in the former runtime order", async () => {
  const index = await readFile(new URL("index.html", src), "utf8");
  const files = (await readdir(new URL("styles/", src))).filter((file) => file.endsWith(".css")).sort();
  assert.deepEqual(files, Object.values(MOVED_STYLES).sort());
  const marker = index.indexOf("<!-- vlab:react-stylesheet");
  const results = index.indexOf('href="./results-ui.css"');
  const positions = Object.values(MOVED_STYLES).map((file) => index.indexOf(`href="./styles/${file}"`));
  assert.ok(marker > index.indexOf('href="./ux-hardening.css"') && results > marker);
  assert.ok(positions.every((position, i) => position > results && (i === 0 || position > positions[i - 1])), "moved stylesheets keep their former cascade order");
});

test("the build places the React stylesheet at the marker, before the moved stylesheets", async () => {
  const build = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  assert.match(build, /vlab:react-stylesheet/);
  assert.match(build, /styles\\\/\[a-z0-9-\]\+\\\.css/);
});

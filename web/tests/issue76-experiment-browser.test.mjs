import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../src");

async function browserSource() {
  return readFile(path.join(src, "registry-ui-v3.js"), "utf8");
}

test("main Lab exposes one direct experiment switcher and one full finder", async () => {
  const source = await browserSource();
  assert.match(source, /experimentLabel\.textContent = "Experiment"/);
  assert.match(source, /experimentSelect\.setAttribute\("aria-label", "Switch experiment"\)/);
  assert.match(source, /function setQuickSwitchOptions\(\)/);
  assert.match(source, /group\.label = "Your experiments"/);
  assert.match(source, /Find experiment/);
  assert.match(source, /document\.createElement\("dialog"\)/);
  assert.doesNotMatch(source, /Quick switch stays in this collection/);
});

test("loaded experiment exposes ownership, revision and optional location context", async () => {
  const source = await browserSource();
  assert.match(source, /Your experiment · Editable/);
  assert.match(source, /Showcase · Read-only/);
  assert.match(source, /function currentLocationLabel\(\)/);
  assert.match(source, /Collection · \$\{collectionName\(currentRemote\.collection_id\)\}/);
  assert.match(source, /No collection/);
  assert.match(source, /Revision \$\{experiment\.revision\}/);
  assert.match(source, /experiment-location/);
});

test("browser unifies Showcase catalog and account-owned experiment sources", async () => {
  const source = await browserSource();
  assert.match(source, /filters\.hidden = true/);
  assert.match(source, /\.experiment-browser \.experiment-browser-filters\[hidden\] \{ display: none !important; \}/);
  assert.match(source, /browser\.filters\.hidden = false;[\s\S]*browser\.dialog\.showModal\(\)/);
  assert.match(source, /browser\.dialog\.addEventListener\("close"[\s\S]*browser\.filters\.hidden = true/);
  assert.match(source, /browser\.contextTitle\.textContent = "All available experiments"/);
  assert.match(source, /Browse Showcase, owned/);
  assert.match(source, /catalogResult\(experiment\)/);
  assert.match(source, /experimentGroup\(label, filtered\)/);
  assert.doesNotMatch(source, /Built-in|builtin/i);
});

test("collections remain optional filters rather than navigation prerequisites", async () => {
  const source = await browserSource();
  assert.match(source, /filterButton\("All experiments", "all"\)/);
  assert.match(source, /filterButton\("No collection", "unfiled"\)/);
  assert.match(source, /for \(const collection of collections\) browser\.filters\.append/);
  assert.match(source, /Collections organize only your own workspace/);
  assert.match(source, /if \(browserSearch\.trim\(\)\) browserCollection = "all"/);
});

test("switching away from dirty work requires explicit discard confirmation", async () => {
  const source = await browserSource();
  assert.match(source, /async function confirmDiscardIfNeeded\(\)/);
  assert.match(source, /window\.confirm\("Discard the unsaved changes to the current experiment\?"\)/);
  assert.match(source, /if \(!\(await confirmDiscardIfNeeded\(\)\)\)/);
});

test("refresh belongs to the finder and user-facing copy avoids registry jargon", async () => {
  const source = await browserSource();
  assert.match(source, /refresh\.textContent = "Refresh library"/);
  assert.match(source, /heading\.textContent = "Experiment library"/);
  assert.match(source, /Your library is ready/);
  assert.doesNotMatch(source, /Registry experiments/);
});

test("experiment browser exposes exact current-revision time and actor provenance", async () => {
  const source = await browserSource();
  assert.match(source, /function formatRevisionTime\(value\)/);
  assert.match(source, /second: "2-digit"/);
  assert.match(source, /timeZoneName: "short"/);
  assert.match(source, /function revisionActor\(revision\)/);
  assert.match(source, /"f9ea9bbe-2e3f-497d-92b3-5f108b64593c": "Claude"/);
  assert.match(source, /"12e106dc-4da6-49cd-9062-d0a4bb5c34c6": "Grok"/);
  assert.match(source, /AI · " \+ client/);
  assert.match(source, /updated_by_actor,updated_by_ai_client/);
  assert.match(source, /const revisionMeta =/);
  assert.doesNotMatch(source, /function formatUpdated\(value\)/);
});

test("human revision provenance is Mine or Human rather than a profile identity", async () => {
  const source = await browserSource();
  assert.match(source, /const humanId = revision\.created_by_user \?\? revision\.owner_id/);
  assert.match(source, /return humanId === user\?\.id \? "Mine" : "Human"/);
  assert.doesNotMatch(source, /owner\.display_name \+ " \(" \+ role \+ "\)"/);
  assert.match(source, /first_name, last_name, display_name, role/);
});

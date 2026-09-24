import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { MOVED_STYLES, sourceWithStyles } from "./support/source-with-styles.mjs";

async function source(path) {
  const moved = path.match(/^\.\.\/src\/([a-z0-9-]+\.js)$/);
  if (moved && MOVED_STYLES[moved[1]]) return sourceWithStyles(moved[1]);
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("#480 Experiment Library is browse-first and source-coherent", async () => {
  const library = await source("../src/experiment-library.js");
  for (const required of [
    '"All Showcase"',
    '"Uncategorized"',
    '"All in Mine"',
    '"Unfiled"',
    '"All shared"',
    '"All sources"',
    '"Open & run"',
    '"Make a copy"',
    '"Loaded"',
  ]) assert.ok(library.includes(required), `missing library contract marker: ${required}`);

  // #547: behaviour covered by library-browse.test.mjs; these check the Library uses the rules.
  assert.match(library, /from "\.\/library\/browse\.js"/);
  assert.doesNotMatch(library, /Built-in|All experiments/);
  assert.match(library, /grid-template-columns: 1fr/);
  assert.match(library, /@container \(min-width: 48rem\)/);
  assert.match(library, /grid-template-columns: 14rem minmax\(0,1fr\)/);
});

test("#480 source hierarchies do not depend on search", async () => {
  const library = await source("../src/experiment-library.js");
  assert.match(library, /navigation\.showcase\.kind === "collection"/);
  assert.match(library, /navigation\.mine\.kind === "collection"/);
  assert.match(library, /navigation\.shared\.kind === "owner"/);
  assert.match(library, /navigation\.supervised\.researcherId/);
  assert.match(library, /navigation\.supervised\.kind === "collection"/);
  // #547: behaviour covered by library-browse.test.mjs; these check the Library uses the rules.
  assert.match(library, /contextLabel\(navigation, libraryData\(\)\)/);
  assert.match(library, /function renderDirectory/);
  assert.match(library, /results\(\{ navigation, data: libraryData\(\), sources: availableSources\(\) \}\)/);
});

test("#480 backend read model preserves private collection boundaries", async () => {
  const migration = await source("../../supabase/migrations/20260922090000_experiment_library_navigation.sql");
  assert.match(migration, /alter table public\.showcase_collections enable row level security/);
  assert.match(migration, /revoke all on table public\.showcase_collections from public, anon, authenticated/);
  assert.match(migration, /create or replace function public\.list_experiment_library_mine\(\)/);
  assert.match(migration, /where e\.owner_id = caller/);
  assert.match(migration, /create or replace function public\.list_experiment_library_shared\(\)/);
  assert.match(migration, /where s\.recipient_id = caller/);
  assert.match(migration, /create or replace function public\.list_experiment_library_supervised\(\)/);
  assert.match(migration, /perform private\.require_current_professor\(\)/);
  assert.match(migration, /left join public\.experiment_collections c[\s\S]*c\.owner_id = e\.owner_id/);
  assert.match(migration, /create or replace function public\.set_showcase_entry_collection/);
  assert.match(migration, /showcase_collection_id uuid/);
});

test("#480 ordinary Showcase browsing is unified; old Showcase surface is curation-only", async () => {
  const registry = await source("../src/registry-ui-v3.js");
  const shell = await source("../src/workspace-shell.js");
  const showcase = await source("../src/showcase.js");

  assert.match(registry, /browse\.textContent = "Browse experiments"/);
  assert.match(registry, /vlab-open-experiment-library/);
  assert.match(registry, /vlabExperimentLibraryBridge/);
  assert.match(shell, /import "\.\/experiment-library\.js"/);

  assert.match(showcase, /launcher\.textContent = "Manage Showcase"/);
  assert.match(showcase, /launcher\.hidden = true/);
  // #552: behaviour covered by showcase-curation.test.mjs; this checks showcase.js uses the rule.
  assert.match(showcase, /ui\.launcher\.hidden = !isProfessor\(profile\)/);
  assert.match(showcase, /set_showcase_entry_collection/);
  assert.match(showcase, /create_showcase_collection/);
  assert.doesNotMatch(showcase, /launcher\.textContent = "Showcase"/);
});

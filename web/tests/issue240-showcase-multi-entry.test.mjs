import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sourceWithStyles } from "./support/source-with-styles.mjs";

const showcase = sourceWithStyles("showcase.js");
const library = sourceWithStyles("experiment-library.js");
const shell = readFileSync(new URL("../src/workspace-shell.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/20260916221000_showcase_unified_sources.sql", import.meta.url), "utf8");

test("#240 Showcase behavior is implemented in one module without a synthetic clarity adapter", () => {
  assert.doesNotMatch(shell, /showcase-clarity\.js/);
  assert.match(shell, /import "\.\/showcase\.js"/);
});

test("#240 Showcase discovery separates Open from explicit Open & run", () => {
  assert.match(library, /open\.textContent|button\(loadedMatches\(source, row\) \? "Return to Lab" : "Open"\)/);
  assert.match(library, /button\("Open & run"\)/);
  assert.match(library, /openRow\(source, row, true\)/);
  assert.match(library, /loaded\.textContent = "Loaded"/);
  assert.doesNotMatch(showcase, /Open \$\{entry\.title\} in Lab and run it/);
});

test("#240 destructive curation is bound to the Showcase entry, not its source type", () => {
  assert.match(showcase, /showcase-entry-remove/);
  assert.match(showcase, /Remove \$\{entry\.title\} from Showcase/);
  // #552: behaviour covered by showcase-curation.test.mjs; this checks showcase.js uses the rule.
  assert.match(showcase, /window\.confirm\(removeEntryConfirmation\(entry\)\)/);
  assert.match(showcase, /remove_showcase_entry/);
  assert.match(showcase, /p_showcase_id: entry\.showcase_id/);
  assert.doesNotMatch(showcase, /if \(!entry\?\.source_experiment_id\) return/);
});

test("#240 backend supports homogeneous Experiment and catalog Showcase sources", () => {
  assert.match(migration, /source_key text/);
  assert.match(migration, /showcase_entries_source_identity_check/);
  assert.match(migration, /remove_showcase_entry\(p_showcase_id uuid\)/);
  assert.match(migration, /promote_catalog_to_showcase/);
});

test("#240 opening a Showcase URL loads the selected snapshot through the unified library before running it", () => {
  assert.match(showcase, /const library = window\.vlabExperimentLibraryBridge/);
  assert.match(showcase, /await library\.openShowcase\(entry\)/);
  assert.match(showcase, /await waitForSetupApplied\(\)/);
  assert.match(showcase, /await startShowcaseRun\(\)/);
  // #569: the run is started through the simulation controller.
  assert.match(showcase, /if \(runtimeModel\.get\(\)\.runState !== "running"\) simulationCommands\.run\(\)/);
});

test("#240 mobile entry actions retain explicit touch targets", () => {
  assert.match(showcase, /@media \(max-width: 680px\)/);
  assert.match(showcase, /showcase-entry-remove \{ min-height: 44px/);
});

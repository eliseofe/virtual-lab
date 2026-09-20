import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const registry = await readFile(path.join(repo, "web/src/registry-ui-v3.js"), "utf8");
const copyMigration = await readFile(
  path.join(repo, "supabase/migrations/20260920114510_copy_retained_experiment_revision.sql"),
  "utf8",
);

test("#399 old-revision editing preserves exact base metadata in the Working copy", () => {
  assert.match(registry, /const baseline = currentEditingBaseline\(\)/);
  assert.match(registry, /title: baseline\?\.title \?\? currentRemote\.title/);
  assert.match(registry, /description: baseline\?\.description \?\? currentRemote\.description \?\? ""/);
  assert.match(registry, /base_revision: baseRevision/);
});

test("#399 human provenance is deliberately Mine or Human while AI provenance remains specific", () => {
  assert.match(registry, /return humanId === user\?\.id \? "Mine" : "Human"/);
  assert.match(registry, /AI_CLIENT_LABELS\[client\] \?\? "AI · " \+ client/);
  assert.match(registry, /actor\.textContent = "Mine"/);
  assert.doesNotMatch(registry, /owner\.display_name \+ " \(" \+ role \+ "\)"/);
});

test("#399 copies the exact retained non-owned revision being viewed", () => {
  assert.match(registry, /const sourceSnapshot = currentRevisionSnapshot\(\)/);
  assert.match(registry, /const sourceRevision = sourceSnapshot\?\.revision \?\? currentRemote\.revision/);
  assert.match(copyMigration, /source_revision_row public\.experiment_revisions%rowtype/);
  assert.match(copyMigration, /r\.revision = p_expected_revision/);
  assert.match(copyMigration, /source_revision_row\.config_source/);
  assert.match(copyMigration, /source_revision_row\.initializer_source/);
  assert.match(copyMigration, /source_revision_row\.controller_source/);
  assert.match(copyMigration, /source_revision_row\.artifacts/);
  assert.match(copyMigration, /source_revision_row\.revision/);
  assert.match(copyMigration, /source_revision_row\.title/);
});

test("#399 exact historical copy preserves the existing readable-source authorization boundary", () => {
  assert.match(copyMigration, /source_row\.visibility = 'public'/);
  assert.match(copyMigration, /from public\.experiment_shares s/);
  assert.match(copyMigration, /s\.recipient_id = caller/);
  assert.match(copyMigration, /private\.current_user_is_professor\(\)/);
  assert.match(copyMigration, /p\.role = 'student'/);
  assert.match(copyMigration, /source_row\.owner_id = caller/);
});

test("#399 revision history dialog exposes state and returns keyboard focus to its launcher", () => {
  assert.match(registry, /revisionTrigger\.setAttribute\("aria-haspopup", "dialog"\)/);
  assert.match(registry, /revisionTrigger\.setAttribute\("aria-expanded", "false"\)/);
  assert.match(registry, /dialog\.setAttribute\("aria-labelledby", heading\.id\)/);
  assert.match(registry, /currentUi\.revisionTrigger\.setAttribute\("aria-expanded", "true"\)/);
  assert.match(registry, /revisionHistory\.dialog\.addEventListener\("close"/);
  assert.match(registry, /currentUi\.revisionTrigger\.focus\(\{ preventScroll: true \}\)/);
});

test("#399 mobile revision controls use deliberate touch targets", () => {
  assert.match(registry, /\.experiment-revision-trigger \{ min-height: 44px; \}/);
  assert.match(registry, /\.experiment-history-head button, \.experiment-history-filter button \{ min-height: 44px; \}/);
  assert.match(registry, /\.experiment-history-item \{ grid-template-columns: 1fr auto; min-height: 60px; \}/);
  assert.match(registry, /\.experiment-revision-actions button:only-child \{ grid-column: 1 \/ -1; \}/);
});

test("#399 visible revision labels are human-facing rather than registry jargon", () => {
  assert.match(registry, /metadataRevision\.textContent = "Working copy · based on R"/);
  assert.match(registry, /metadataRevision\.textContent = "Revision R"/);
  assert.doesNotMatch(registry, /metadataRevision\.textContent = "registry/);
});

test("#399 keeps chronological crystallization and no automatic merge/rebase model", () => {
  assert.match(registry, /crystallize_experiment_working_copy/);
  assert.match(registry, /New revision R/);
  assert.match(registry, /Your current view was not changed/);
  assert.doesNotMatch(registry, /automatic merge|merge conflict|rebase/i);
});

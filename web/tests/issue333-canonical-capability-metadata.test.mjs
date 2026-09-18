import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const migrationPath = path.join(
  repo,
  "supabase",
  "migrations",
  "20260918170200_canonical_capability_metadata.sql",
);

test("#333 canonical capability metadata stays minimal and generic", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /add column if not exists canonical_definition text/);
  assert.match(sql, /add column if not exists publication_provenance jsonb/);

  for (const id of [
    "7492c39d-fdd0-4f29-9661-63dbc6461bf5",
    "49368c8e-dff7-4ce0-9072-bc3f4b37ada2",
    "d89cdc40-bbcc-426c-ac40-7dc3f3638599",
  ]) {
    assert.match(sql, new RegExp(id.replaceAll("-", "\\-")));
  }

  assert.match(sql, /arXiv:1903\.03841/);
  assert.match(sql, /doi:10\.1007\/s11721-022-00220-1/);

  for (const historicalScientificDiscourse of [
    "wrapped-Cauchy",
    "P_stay",
    "P_leave",
    "preferred/black",
    "DESIRED_DISTANCE",
    "Professor notes",
  ]) {
    assert.equal(
      sql.includes(historicalScientificDiscourse),
      false,
      `canonical seed leaked historical scientific discourse: ${historicalScientificDiscourse}`,
    );
  }

  assert.equal(/delete\s+from\s+public\.capability_requests/i.test(sql), false);
  assert.equal(/set\s+status\s*=/i.test(sql), false);
  assert.equal(/create\s+table/i.test(sql), false);
});

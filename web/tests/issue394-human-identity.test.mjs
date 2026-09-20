import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");

test("#394 structured human identity migration is display-only and registration-backed", async () => {
  const migration = await readFile(
    path.join(repo, "supabase/migrations/20260920091102_human_identity_profile_names.sql"),
    "utf8",
  );
  assert.match(migration, /add column if not exists first_name text/);
  assert.match(migration, /add column if not exists last_name text/);
  assert.match(migration, /raw_user_meta_data ->> 'first_name'/);
  assert.match(migration, /raw_user_meta_data ->> 'last_name'/);
  assert.match(migration, /insert into public\.profiles\(id, first_name, last_name, display_name\)/);
  assert.doesNotMatch(migration, /role\s*:=|update\s+public\.profiles[\s\S]*role/i);
});

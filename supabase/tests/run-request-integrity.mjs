import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";

// Run the real migration functions against a minimal, disposable relational
// fixture. No production URL, credentials, or database connection is used.
const root = fileURLToPath(new URL("../../", import.meta.url));
const testDir = new URL("./request-integrity/", import.meta.url);
const container = `vlab-request-integrity-${process.pid}-${Date.now()}`;
function run(args, input) {
  const result = spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  return result.stdout;
}
function sql(source) {
  return run(["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], source);
}
function migrationFunction(file, name) {
  const source = readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8");
  const start = source.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, `Missing production function ${name}`);
  const end = source.indexOf("\n$$;", start);
  assert.ok(end > start);
  return source.slice(start, end + 4);
}

let started = false;
try {
  run(["run", "--detach", "--rm", "--name", container, "--network", "none",
    "--env", "POSTGRES_HOST_AUTH_METHOD=trust",
    "--mount", `type=bind,src=${root},dst=/repo,readonly`, "postgres:15-alpine"]);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], { stdio: "ignore" }).status === 0) {
      ready = true;
      break;
    }
    await setTimeout(250);
  }
  assert.ok(ready, "Disposable PostgreSQL did not become ready");
  sql(readFileSync(new URL("schema.sql", testDir), "utf8"));
  sql(migrationFunction("20260919114500_pretriage_request_reuse.sql", "public.submit_extension_closure"));
  sql(migrationFunction("20260919122000_durable_closure_role_symmetry.sql", "public.revalidate_extension_closure"));
  sql("\\i /repo/supabase/migrations/20260919163000_structured_candidate_extensions.sql\n");
  sql(`create trigger sync_active_extension_request_catalog
    after insert or update or delete on public.capability_requests
    for each row execute function private.sync_active_extension_request_catalog();`);
  sql("\\i /repo/supabase/migrations/20260921170000_capability_request_integrity.sql\n");
  for (const file of readdirSync(testDir).filter((name) => name.endsWith(".test.sql")).sort()) {
    sql(readFileSync(new URL(file, testDir), "utf8"));
    console.log(`PASS ${file}`);
  }
} finally {
  if (started) run(["rm", "--force", container]);
}

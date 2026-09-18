import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260914150356_professor_role_superset.sql", import.meta.url),
  "utf8",
);
const mcp = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url),
  "utf8",
);
const metricsResults = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/metrics-results-tools.ts", import.meta.url),
  "utf8",
);

test("#133 profile role is server controlled and defaults to student", () => {
  assert.match(migration, /add column if not exists role text/i);
  assert.match(migration, /alter column role set default 'student'/i);
  assert.match(migration, /check \(role in \('student', 'professor'\)\)/i);
  assert.match(migration, /revoke update on table public\.profiles from authenticated/i);
  assert.match(migration, /grant update \(display_name\) on table public\.profiles to authenticated/i);
});

test("#133 shared Student behavior remains one implementation as Professor-only tools are added later", () => {
  assert.match(mcp, /\.select\('id, display_name, role'\)/);
  assert.match(metricsResults, /MCP_SERVER_VERSION = '3\.0\.\d+'/);
  assert.match(metricsResults, /MCP_INTERFACE_VERSION = '8'/);

  for (const tool of [
    "read_workspace",
    "manage_collection",
    "create_experiment",
    "edit_experiment",
    "delete_experiment",
  ]) {
    const matches = mcp.match(new RegExp(`server\\.registerTool\\(\\s*['\"]${tool}['\"]`, "g")) ?? [];
    assert.equal(matches.length, 1, `${tool} must remain one shared implementation`);
  }

  assert.match(metricsResults, /'author_metrics_results'/);
  assert.match(mcp, /if \(profile\.role === 'professor'\) \{/);
  assert.equal((mcp.match(/server\.registerTool\(/g) ?? []).length, 6);
});

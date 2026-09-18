import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mcp = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../../supabase/migrations/20260918172500_global_canonical_capability_registry.sql", import.meta.url),
  "utf8",
);

test("#328 pending-capability memory survives #334 through the canonical registry", () => {
  assert.match(mcp, /capability_registry: capabilityRegistry \?\? \[\]/);
  assert.match(mcp, /\.rpc\('list_canonical_capabilities'\)/);
  assert.match(migration, /status in \('requested', 'approved', 'in_progress', 'implemented'\)/);
});

test("#328/#334 canonical registry excludes declined capabilities and historical request fields", () => {
  assert.doesNotMatch(migration, /draft_title|draft_description|context|professor_notes|developer_notes|requirement_keys|origin_experiment/);
  assert.match(migration, /canonical_definition/);
  assert.match(migration, /publication_provenance/);
  assert.doesNotMatch(migration, /'declined'/);
});

test("#328/#334 global capability memory is not caller-owned request discovery", () => {
  const workspaceBlock = mcp.match(/server\.registerTool\(\s*'read_workspace',[\s\S]*?server\.registerTool\(\s*'manage_collection'/);
  assert.ok(workspaceBlock, "read_workspace implementation must be found");
  assert.doesNotMatch(workspaceBlock[0], /\.from\('capability_requests'\)/);
  assert.doesNotMatch(workspaceBlock[0], /\.eq\('requester_id'/);
  assert.match(workspaceBlock[0], /\.rpc\('list_canonical_capabilities'\)/);
});

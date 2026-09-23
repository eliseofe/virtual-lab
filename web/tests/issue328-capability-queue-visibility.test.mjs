import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mcp = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url),
  "utf8",
);
const registryMigration = readFileSync(
  new URL("../../supabase/migrations/20260918181000_canonical_capability_registry_v1.sql", import.meta.url),
  "utf8",
);
const cutoverMigration = readFileSync(
  new URL("../../supabase/migrations/20260919094500_canonical_capability_cutover.sql", import.meta.url),
  "utf8",
);

test("#328/#334 discovery is preserved through the #348 independent canonical registry cutover", () => {
  assert.match(mcp, /capability_registry: discoverableCapabilityRegistry/);
  assert.match(mcp, /\.rpc\('list_canonical_capability_registry'\)/);
  assert.doesNotMatch(mcp, /\.rpc\('list_canonical_capabilities'\)/);
  assert.match(registryMigration, /from public\.canonical_capabilities c/i);
  assert.match(registryMigration, /left join public\.capability_publication_provenance p/i);
});

test("#348 canonical discovery excludes request/history state by construction", () => {
  const rpc = registryMigration.match(/create or replace function public\.list_canonical_capability_registry\(\)[\s\S]*?\$function\$;/i)?.[0] ?? "";
  assert.doesNotMatch(rpc, /capability_requests|requester_id|professor_notes|developer_notes|requirement_keys|origin_experiment/i);
  assert.match(rpc, /canonical_definition/i);
  assert.match(rpc, /publication_provenance/i);
  assert.match(cutoverMigration, /drop function if exists public\.list_canonical_capabilities\(\)/i);
});

test("#361/#374 keeps raw request history private while exposing structured candidate discovery", () => {
  const workspaceBlock = mcp.match(/server\.registerTool\(\s*'read_workspace',[\s\S]*?server\.registerTool\(\s*'manage_collection'/);
  assert.ok(workspaceBlock, "read_workspace implementation must be found");
  assert.doesNotMatch(workspaceBlock[0], /\.from\('capability_requests'\)/);
  assert.doesNotMatch(workspaceBlock[0], /\.eq\('requester_id'/);
  assert.match(workspaceBlock[0], /\.rpc\('list_canonical_capability_registry'\)/);
  assert.match(workspaceBlock[0], /\.from\('candidate_capabilities'\)/);
  assert.match(workspaceBlock[0], /\.from\('candidate_contract_deltas'\)/);
  assert.match(workspaceBlock[0], /candidate_capabilities: candidateCapabilitiesWithSupport/);
  assert.match(workspaceBlock[0], /candidate_contract_deltas: candidateContractDeltasWithSupport/);
  assert.doesNotMatch(workspaceBlock[0], /active_extension_requests/);
});

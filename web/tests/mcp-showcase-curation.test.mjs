// Showcase curation through the MCP (server 3.24.0). The tool must reuse the
// Lab's curation functions as the signed-in user, so the database keeps
// enforcing the Professor role and Experiment ownership; it adds no role
// check or privileged write of its own.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MCP_TOOL_NAMES } from "../../supabase/functions/experiment-mcp/tool-surface.ts";

const index = readFileSync(new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url), "utf8");
const tool = index.match(/server\.registerTool\(\s*'manage_showcase'[\s\S]*?server\.registerTool\(\s*'create_experiment'/)?.[0] ?? "";

test("manage_showcase is part of the shared tool surface", () => {
  assert.ok(MCP_TOOL_NAMES.includes("manage_showcase"));
  assert.ok(tool.length > 0);
  assert.match(tool, /action: z\.enum\(\['list', 'publish', 'remove'\]\)/);
});

test("manage_showcase goes through the Lab's curation functions as the signed-in user", () => {
  assert.match(tool, /supabase\.rpc\('promote_experiment_to_showcase', \{\s*p_experiment_id: experiment_id,\s*p_expected_revision: expected,/);
  assert.match(tool, /supabase\.rpc\('remove_experiment_from_showcase', \{ p_experiment_id: experiment_id \}\)/);
  assert.match(tool, /supabase\.rpc\('list_showcase_experiments'\)/);
  // No direct writes to Showcase tables, no service-role client, no role gate in the tool.
  assert.doesNotMatch(tool, /from\('showcase_entries'\)|from\('preserved_experiment_snapshots'\)/);
  assert.doesNotMatch(tool, /service_role|SERVICE_ROLE/);
  assert.doesNotMatch(tool, /profile\.role/);
});

test("manage_showcase publishes only owned Experiments at their current revision by default", () => {
  assert.match(tool, /\.eq\('owner_id', userId\)/);
  assert.match(tool, /Only your own Experiments can be published to the Showcase\./);
});

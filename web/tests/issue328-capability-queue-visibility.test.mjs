import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mcp = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url),
  "utf8",
);
const tools = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/metrics-results-tools.ts", import.meta.url),
  "utf8",
);

test("#328 workspace discovery exposes caller-visible nonterminal capability commitments", () => {
  assert.match(mcp, /caller-visible pending capability queue/i);
  assert.match(mcp, /\.from\('capability_requests'\)[\s\S]*\.in\('status', \['requested', 'approved', 'in_progress'\]\)/);
  assert.match(mcp, /capability_queue: capabilityQueue \?\? \[\]/);
  assert.match(mcp, /Could not read pending capability commitments/);
});

test("#328 pending queue does not advertise terminal lifecycle rows as pending", () => {
  const match = mcp.match(/\.in\('status', \[(.*?)\]\)/s);
  assert.ok(match, "pending capability status filter must be present");
  assert.match(match[1], /requested/);
  assert.match(match[1], /approved/);
  assert.match(match[1], /in_progress/);
  assert.doesNotMatch(match[1], /implemented|declined/);
});

test("#328 workspace visibility relies on the authenticated RLS client rather than a privileged queue read", () => {
  const workspaceBlock = mcp.match(/server\.registerTool\(\s*'read_workspace',[\s\S]*?server\.registerTool\(\s*'manage_collection'/);
  assert.ok(workspaceBlock, "read_workspace implementation must be found");
  assert.match(workspaceBlock[0], /supabase[\s\S]*\.from\('capability_requests'\)/);
  assert.doesNotMatch(workspaceBlock[0], /service_role|SUPABASE_SERVICE_ROLE_KEY|createClient\(/);
  assert.doesNotMatch(workspaceBlock[0], /\.eq\('requester_id'/);
});

test("#328 distinguishes pending commitments from currently implemented authoring support", () => {
  assert.match(mcp, /approved means accepted into the developer queue, not implemented/i);
  assert.match(mcp, /current authoring contract remains the authority for capabilities available now/i);
});

test("#328 is a backward-compatible MCP patch", () => {
  assert.match(tools, /MCP_SERVER_VERSION = '3\.2\.2'/);
  assert.match(tools, /MCP_INTERFACE_VERSION = '10'/);
  assert.match(mcp, /CAPABILITY_REQUEST_INTERFACE = 'vlab\.capability-request\/3'/);
});

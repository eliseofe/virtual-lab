import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260919094500_canonical_capability_cutover.sql", import.meta.url),
  "utf8",
);
const mcp = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url),
  "utf8",
);
const metrics = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/metrics-results-tools.ts", import.meta.url),
  "utf8",
);

const frozenKeys = [
  "controller.private_scalar_state",
  "environment.static_scalar_field",
  "initialization.agent_pose",
  "initialization.uniform_rng",
  "metrics.read_only_global_snapshot",
  "motion.forward_turning_kinematics",
  "observation.environmental_scalar",
  "observation.local_neighbours",
  "observation.neighbour_relative_position",
  "observation.self_heading",
  "world.periodic_square_2d",
];

test("#348 refuses destructive cleanup unless the exact implemented registry and provenance are ready", () => {
  for (const key of frozenKeys) assert.match(migration, new RegExp(key.replaceAll(".", "\\.")));
  assert.match(migration, /exactly the frozen 11 implemented capabilities/i);
  assert.match(migration, /capability_publication_provenance/i);
  assert.match(migration, /every implemented capability must have publication provenance/i);
});

test("#348 retires only the three explicitly waived legacy request rows", () => {
  assert.match(migration, /delete from public\.capability_requests/i);
  for (const id of [
    "7492c39d-fdd0-4f29-9661-63dbc6461bf5",
    "49368c8e-dff7-4ce0-9072-bc3f4b37ada2",
    "d89cdc40-bbcc-426c-ac40-7dc3f3638599",
  ]) assert.match(migration, new RegExp(id));
  assert.doesNotMatch(migration, /delete from public\.canonical_capabilities/i);
  assert.doesNotMatch(migration, /delete from public\.capability_publication_provenance/i);
  assert.doesNotMatch(migration, /drop table public\.capability_requests/i);
});

test("#348 removes request-derived canonical metadata and the old #334 RPC", () => {
  assert.match(migration, /drop function if exists public\.list_canonical_capabilities\(\)/i);
  assert.match(migration, /drop column if exists canonical_definition/i);
  assert.match(migration, /drop column if exists publication_provenance/i);
  assert.doesNotMatch(mcp, /\.rpc\('list_canonical_capabilities'\)/);
  assert.match(mcp, /\.rpc\('list_canonical_capability_registry'\)/);
});

test("#348 preserves the authoring/interface contract while versioning the MCP deployment", () => {
  assert.match(metrics, /MCP_SERVER_VERSION = '3\.\d+\.\d+'/);
  assert.match(metrics, /MCP_INTERFACE_VERSION = '\d+'/);
  assert.match(metrics, /contract_version: 'vlab\.authoring\/0\.7'/);
  assert.match(metrics, /capability_request_interface: 'vlab\.capability-request\/\d+'/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateExperimentSources } from "../../supabase/functions/experiment-mcp/authoring.js";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260919163000_structured_candidate_extensions.sql", import.meta.url),
  "utf8",
);
const mcp = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url),
  "utf8",
);
const authoring = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/authoring.js", import.meta.url),
  "utf8",
);
const versions = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/metrics-results-tools.ts", import.meta.url),
  "utf8",
);
const inbox = readFileSync(new URL("../src/professor-inbox.js", import.meta.url), "utf8");

test("#374 creates durable candidate capability and contract-delta product surfaces", () => {
  assert.match(migration, /create table public\.candidate_capabilities/i);
  assert.match(migration, /capability_key text not null unique/i);
  assert.match(migration, /authoring_surfaces jsonb not null/i);
  assert.match(migration, /availability in \('candidate_unavailable', 'superseded_implemented', 'resolved_by_owner'\)/i);
  assert.match(migration, /create table public\.candidate_contract_deltas/i);
  assert.match(migration, /target_contract_path text not null/i);
  assert.match(migration, /requested_change text not null/i);
  assert.match(migration, /unique \(request_class, delta_key\)/i);
});

test("#374 candidates are separately discoverable and unavailable to compiler validation", () => {
  assert.match(mcp, /candidate_capabilities: candidateCapabilities \?\? \[\]/);
  assert.match(mcp, /candidate_contract_deltas: candidateContractDeltas \?\? \[\]/);
  assert.doesNotMatch(mcp, /active_extension_requests: activeExtensionRequests/);
  assert.doesNotMatch(authoring, /candidate_capabilities|candidate_contract_deltas/);

  const fixture = {
    config_source: "N = 1\nARENA_SIZE = 10.0\nCONTROL_DT = 0.1\nSENSOR_NOISE = 0.0\nEXPERIMENT_DURATION = 1.0\nINTERACTION_RADIUS = 2.0\nMAX_FORWARD_SPEED = 1.0\nMAX_ANGULAR_SPEED = 1.0\n",
    initializer_source: "def initialize(config, rng, place):\n    place(0, 0.0, 0.0, 0.0)\n",
    controller_source: "class Probe(Agent):\n    def step(self, obs):\n        x = rng.uniform(0.0, 1.0)\n        return Motion(x, 0.0)\n",
    metrics_source: "",
  };
  const result = validateExperimentSources(fixture);
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].diagnostic_class, "semantic_capability");
});

test("#374 request schema is born structured rather than translated later", () => {
  assert.match(mcp, /const CANDIDATE_CAPABILITY_SPEC = z\.object/);
  assert.match(mcp, /authoring_surfaces: z\.array\(CANDIDATE_AUTHORING_SURFACE\)\.min\(1\)/);
  assert.match(mcp, /const CANDIDATE_CONTRACT_DELTA_SPEC = z\.object/);
  assert.match(mcp, /target_contract_path: z\.string/);
  assert.match(mcp, /requested_change: z\.string/);
  assert.match(mcp, /submit_structured_extension_closure/);
  assert.match(mcp, /revalidate_structured_extension_closure/);
});

test("#374 reuse and ambiguous overlap create evidence on one durable request", () => {
  assert.match(mcp, /relationship: z\.enum\(\['covered', 'generalization_needed'\]\)/);
  assert.match(migration, /relationship in \('covered', 'generalization_needed'\)/i);
  assert.match(migration, /generalization_needed evidence requires generalization_note/i);
  assert.match(migration, /Candidate capability identity already exists; reuse its request_id instead of creating a duplicate/i);
  assert.match(migration, /Candidate contract-delta identity already exists; reuse its request_id instead of creating a duplicate/i);
  assert.match(inbox, /generalization_needed/);
  assert.match(inbox, /Needs generalization/);
});

test("#374 candidate identity survives request lifecycle while implementation supersedes availability", () => {
  assert.match(migration, /new\.status = 'implemented' then 'superseded_implemented'/i);
  assert.match(migration, /new\.status in \('requested', 'approved', 'declined', 'in_progress'\)/i);
  assert.match(migration, /candidate_unavailable/);
});

test("#374 versions the structured candidate connector without changing authoring language", () => {
  assert.match(mcp, /CAPABILITY_REQUEST_INTERFACE = 'vlab\.capability-request\/8'/);
  assert.match(versions, /MCP_SERVER_VERSION = '3\.14\.0'/);
  assert.match(versions, /MCP_INTERFACE_VERSION = '17'/);
  assert.match(versions, /contract_version: 'vlab\.authoring\/0\.9'/);
});

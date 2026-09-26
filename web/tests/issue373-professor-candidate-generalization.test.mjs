import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateExperimentSources } from "../../supabase/functions/experiment-mcp/authoring.js";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260919171000_professor_candidate_generalization.sql", import.meta.url),
  "utf8",
);
const inbox = readFileSync(new URL("../src/professor-inbox.js", import.meta.url), "utf8");
const mcp = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url),
  "utf8",
);
const versions = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/metrics-results-tools.ts", import.meta.url),
  "utf8",
);

test("#373 generalization is a Professor-only explicit candidate revision", () => {
  assert.match(migration, /create or replace function public\.generalize_candidate_extension/i);
  assert.match(migration, /Only a Professor may generalize candidate extensions/i);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /generalization_revision = v_revision/i);
  assert.match(migration, /candidate_unavailable/i);
  assert.doesNotMatch(migration, /update public\.canonical_capabilities/i);
  assert.doesNotMatch(migration, /insert into public\.canonical_capabilities/i);
});

test("#373 preserves candidate/request identity and append-only generalization history", () => {
  assert.match(migration, /create table public\.candidate_generalization_revisions/i);
  assert.match(migration, /unique \(request_id, revision\)/i);
  assert.match(migration, /previous_candidate jsonb not null/i);
  assert.match(migration, /generalized_candidate jsonb not null/i);
  assert.match(migration, /where request_id = p_request_id/i);
  assert.doesNotMatch(migration, /update public\.candidate_capabilities[\s\S]*capability_key\s*=/i);
  assert.doesNotMatch(migration, /update public\.candidate_contract_deltas[\s\S]*delta_key\s*=/i);
});

test("#373 preserves generalization-needed evidence while explicitly resolving coverage", () => {
  assert.match(migration, /generalization_resolved_at timestamptz/i);
  assert.match(migration, /relationship = 'generalization_needed'[\s\S]*generalization_resolved_at is null/i);
  assert.match(migration, /generalization_resolution_revision = v_revision/i);
  assert.doesNotMatch(migration, /set relationship = 'covered'/i);
});

test("#373 Professor inbox edits the structured candidate rather than creating a second request", () => {
  assert.match(inbox, /Generalize candidate/);
  assert.match(inbox, /generalize_candidate_extension/);
  assert.match(inbox, /p_request_id: request\.id/);
  assert.match(inbox, /p_candidate_capability/);
  assert.match(inbox, /p_candidate_contract_delta/);
  assert.match(inbox, /generalization_resolved_at/);
  assert.doesNotMatch(inbox, /create_experiment|request_capability/);
});

test("#373 fresh research-AI discovery includes candidate generalization metadata", () => {
  assert.match(mcp, /generalization_revision/);
  assert.match(mcp, /generalized_at/);
  assert.match(mcp, /candidate_capabilities: candidateCapabilitiesWithSupport/);
  assert.match(mcp, /candidate_contract_deltas: candidateContractDeltasWithSupport/);
});

test("#373 generalized candidates remain unavailable to controller authoring", () => {
  const result = validateExperimentSources({
    config_source: "N = 1\nARENA_SIZE = 10.0\nCONTROL_DT = 0.1\nSENSOR_NOISE = 0.0\nEXPERIMENT_DURATION = 1.0\nINTERACTION_RADIUS = 2.0\nMAX_FORWARD_SPEED = 1.0\nMAX_ANGULAR_SPEED = 1.0\n",
    initializer_source: "def initialize(config, rng, place):\n    place(0, 0.0, 0.0, 0.0)\n",
    controller_source: "class Probe(Agent):\n    def step(self, obs):\n        x = obs.target_relative_position\n        return Motion(0.0, 0.0)\n",
    metrics_source: "",
  });
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].diagnostic_class, "semantic_capability");
});

test("#373 versions discovery without changing the nine-tool or authoring contract", () => {
  assert.match(versions, /MCP_SERVER_VERSION = '3\.24\.0'/);
  assert.match(versions, /MCP_INTERFACE_VERSION = '17'/);
  assert.match(versions, /contract_version: 'vlab\.authoring\/0\.14'/);
  assert.match(versions, /capability_request_interface: 'vlab\.capability-request\/11'/);
  assert.match(mcp, /shared_tool_count: MCP_TOOL_COUNT/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CANONICAL_CAPABILITY_BINDINGS } from "../../supabase/functions/experiment-mcp/canonical-capability-bindings.js";
import { validateCanonicalCapabilitySurface } from "../../supabase/functions/experiment-mcp/canonical-capability-consistency.js";

const originMigration = readFileSync(
  new URL("../../supabase/migrations/20260919102500_capability_origin_symmetry.sql", import.meta.url),
  "utf8",
);
const repairMigration = readFileSync(
  new URL("../../supabase/migrations/20260921160000_restore_initialization_capability_provenance.sql", import.meta.url),
  "utf8",
);
const mcp = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url),
  "utf8",
);
const tools = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/metrics-results-tools.ts", import.meta.url),
  "utf8",
);

const implemented = {
  id: "11111111-1111-4111-8111-111111111111",
  capability_key: "observation.example",
  implementation_state: "implemented",
  implementation_contracts: ["python-vlab/0.1"],
  implementation_version: "git:abcdef",
  implemented_at: "2026-09-19T05:58:01Z",
  publication_provenance: [{ identifier: "doi:test", title: "Test" }],
};
const binding = {
  canonical_capability_id: implemented.id,
  capability_key: implemented.capability_key,
  surfaces: [{ artifact: "controller", kind: "observation", symbol: "obs.example" }],
};

test("#354 accepts origin-neutral implemented capability truth", () => {
  assert.deepEqual(validateCanonicalCapabilitySurface([implemented], [binding]), { valid: true, errors: [] });
});

test("#354 rejects implemented capabilities without complete metadata or deployed binding", () => {
  const missingVersion = validateCanonicalCapabilitySurface(
    [{ ...implemented, implementation_version: null }],
    [binding],
  );
  assert.equal(missingVersion.valid, false);
  assert.ok(missingVersion.errors.some((error) => error.includes("implementation version")));

  const missingBinding = validateCanonicalCapabilitySurface([implemented], []);
  assert.equal(missingBinding.valid, false);
  assert.ok(missingBinding.errors.some((error) => error.includes("lacks deployed authoring binding")));
});

test("#354 rejects bindings for missing or non-implemented canonical capabilities", () => {
  const missing = validateCanonicalCapabilitySurface([], [binding]);
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some((error) => error.includes("references missing")));

  const notImplemented = { ...implemented, implementation_state: "not_implemented", implementation_version: null, implemented_at: null };
  const premature = validateCanonicalCapabilitySurface([notImplemented], [binding]);
  assert.equal(premature.valid, false);
  assert.ok(premature.errors.some((error) => error.includes("Non-implemented capability is advertised")));
});

test("#354 allows a non-implemented canonical capability with provenance and no binding", () => {
  const pending = {
    ...implemented,
    implementation_state: "not_implemented",
    implementation_contracts: [],
    implementation_version: null,
    implemented_at: null,
  };
  assert.deepEqual(validateCanonicalCapabilitySurface([pending], []), { valid: true, errors: [] });
});

test("#354 migration normalizes old capabilities without inventing workflow history", () => {
  assert.match(originMigration, /git:10bdfe63a9af0c3eedc4896682fda7bfddf71d89/);
  assert.match(originMigration, /2026-09-19T05:58:01Z/);
  assert.match(originMigration, /canonical_capabilities_implemented_metadata_complete/);
  assert.match(originMigration, /implementation_version text/);
  assert.match(originMigration, /implemented_at timestamptz/);
  assert.match(originMigration, /Optional trusted-development workflow history/);
  assert.doesNotMatch(originMigration, /update public\.canonical_capabilities[\s\S]*github_issue_number\s*=/i);
  assert.doesNotMatch(originMigration, /insert into public\.capability_requests/i);
});

test("#354 neutral discovery enforces live canonical/binding consistency", () => {
  assert.match(mcp, /validateCanonicalCapabilitySurface/);
  assert.match(mcp, /CANONICAL_CAPABILITY_BINDINGS/);
  assert.match(mcp, /capabilityConsistency\.valid/);
  assert.match(tools, /MCP_SERVER_VERSION = '3\.\d+\.\d+'/);
  assert.match(tools, /MCP_INTERFACE_VERSION = '\d+'/);
  assert.match(tools, /contract_version: 'vlab\.authoring\/0\.10'/);
});

test("#467 missing heterogeneous-initialization provenance blocks discovery and the repair restores only trusted source provenance", () => {
  const key = "initialization.per_agent_private_state_assignment";
  const registry = CANONICAL_CAPABILITY_BINDINGS.map((entry) => ({
    ...implemented,
    id: entry.canonical_capability_id,
    capability_key: entry.capability_key,
    publication_provenance: entry.capability_key === key ? [] : implemented.publication_provenance,
  }));
  const heterogeneous = registry.find((entry) => entry.capability_key === key);
  assert.ok(heterogeneous, "the deployed heterogeneous-state binding must be covered");

  assert.deepEqual(validateCanonicalCapabilitySurface(registry, CANONICAL_CAPABILITY_BINDINGS), {
    valid: false,
    errors: [`Canonical capability lacks publication provenance: ${key}`],
  });

  heterogeneous.publication_provenance = implemented.publication_provenance;
  assert.deepEqual(validateCanonicalCapabilitySurface(registry, CANONICAL_CAPABILITY_BINDINGS), {
    valid: true,
    errors: [],
  });

  assert.match(repairMigration, /canonical_capability_id = v_capability_id/);
  assert.match(repairMigration, /status = 'implemented'/);
  assert.match(repairMigration, /v_source_count <> 1/);
  assert.doesNotMatch(repairMigration, /2616dbb5-2134-417f-aebb-2e9e4ea0dd9c/);
  assert.match(repairMigration, /insert into public\.capability_publication_provenance/);
  assert.doesNotMatch(repairMigration, /update public\.canonical_capabilities/i);
  assert.doesNotMatch(repairMigration, /delete from public\.capability_publication_provenance/i);
});

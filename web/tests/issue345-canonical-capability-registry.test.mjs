import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260918181000_canonical_capability_registry_v1.sql", import.meta.url),
  "utf8",
);

const implementedKeys = [
  "world.periodic_square_2d",
  "motion.forward_turning_kinematics",
  "initialization.agent_pose",
  "initialization.uniform_rng",
  "controller.private_scalar_state",
  "observation.self_heading",
  "observation.local_neighbours",
  "observation.neighbour_relative_position",
  "observation.environmental_scalar",
  "environment.static_scalar_field",
  "metrics.read_only_global_snapshot",
];

test("#345 creates canonical capability identity independent of requests", () => {
  assert.match(migration, /create table public\.canonical_capabilities/i);
  assert.match(migration, /capability_key text not null unique/i);
  assert.match(migration, /implementation_state in \('implemented', 'not_implemented'\)/i);
  assert.match(migration, /implementation_contracts text\[\]/i);

  const seedSection = migration.match(/insert into public\.canonical_capabilities[\s\S]*?;\n\ninsert into public\.capability_publication_provenance/)?.[0] ?? "";
  for (const key of implementedKeys) assert.match(seedSection, new RegExp(key.replaceAll(".", "\\.")));
  assert.equal((seedSection.match(/'implemented'/g) ?? []).length, 11);
  assert.doesNotMatch(seedSection, /stochasticity\.rng|heterogeneous_agent_state|wall|ground|site.?colou?r/i);
  assert.doesNotMatch(seedSection, /capability_requests/i);
});

test("#345 normalizes many-to-many publication provenance", () => {
  assert.match(migration, /create table public\.capability_publication_provenance/i);
  assert.match(migration, /primary key \(capability_id, publication_identifier\)/i);
  assert.match(migration, /references public\.canonical_capabilities\(id\) on delete cascade/i);
  assert.match(migration, /capability_publication_provenance_identifier_idx/i);

  for (const identifier of [
    "doi:10.1103/PhysRevLett.111.268302",
    "doi:10.1088/1367-2630/15/9/095011",
    "doi:10.1007/s11721-022-00220-1",
    "arXiv:1903.03841",
  ]) {
    assert.equal(migration.includes(identifier), true, "missing publication provenance: " + identifier);
  }

  assert.match(
    migration,
    /world\.periodic_square_2d[\s\S]*10\.1103\/PhysRevLett\.111\.268302[\s\S]*world\.periodic_square_2d[\s\S]*10\.1088\/1367-2630\/15\/9\/095011/i,
  );
});

test("#345 global registry read is authenticated, RLS-backed and request-independent", () => {
  assert.match(migration, /alter table public\.canonical_capabilities enable row level security/i);
  assert.match(migration, /alter table public\.capability_publication_provenance enable row level security/i);
  assert.match(migration, /for select\s+to authenticated\s+using \(true\)/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /grant execute on function public\.list_canonical_capability_registry\(\) to authenticated/i);
  assert.match(migration, /revoke execute on function public\.list_canonical_capability_registry\(\) from anon/i);

  const rpc = migration.match(/create or replace function public\.list_canonical_capability_registry\(\)[\s\S]*?\$function\$;/i)?.[0] ?? "";
  assert.doesNotMatch(rpc, /capability_requests|requester_id|auth\.uid|profiles|professor_notes|developer_notes/i);
  assert.match(rpc, /from public\.canonical_capabilities c/i);
  assert.match(rpc, /left join public\.capability_publication_provenance p/i);
});

test("#345 does not cut over or delete legacy request state", () => {
  assert.doesNotMatch(migration, /delete\s+from\s+public\.capability_requests/i);
  assert.doesNotMatch(migration, /drop\s+table\s+public\.capability_requests/i);
  assert.doesNotMatch(migration, /create or replace function public\.list_canonical_capabilities\(\)/i);
});

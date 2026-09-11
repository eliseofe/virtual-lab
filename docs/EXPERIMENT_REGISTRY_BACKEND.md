# Experiment Registry Backend

Status: issue #42 deployed and validated. Production Virtual Lab is not connected by this work.

## Backend choice

Backend: Supabase Free plan.

Deployed project:
- organization: `SeldonTeam`;
- project: `virtual-lab`;
- region: `ap-south-1`;
- project reference: `izdmmudfrmqhvlgepwes`.

The project reference is an identifier, not a secret.

Current free-tier assumptions were verified against Supabase pricing/billing documentation before deployment. The experiment registry stores small text/metadata records and does not run simulations, so initial educational use is expected to remain far below free-tier limits. Re-check vendor limits periodically.

Official references:
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://supabase.com/docs/guides/database/postgres/row-level-security

## Data model

Canonical migration: `supabase/migrations/20260911193000_experiment_registry_v1.sql`.

### profiles
One registry profile per Supabase Auth user. The Auth UUID is the stable authorization key; the display identity is provider-independent.

### experiment_collections
One-level optional organization under each owner. Collections are not filesystem paths.

### experiments
Canonical mutable working records containing owner, optional collection, compatibility markers, title/description, active/archived lifecycle, visibility marker, internal revision, actor provenance, and exactly the three student artifacts: configuration, initializer, and controller source.

### preserved_experiment_snapshots
Reserved independent snapshots for later submission/assessment/curation work. Their working-experiment reference uses `ON DELETE SET NULL`, so deleting a working copy cannot destroy a preserved snapshot.

Ordinary authenticated clients receive no access to preserved snapshots in #42. #45 owns professor/submission/curation permissions.

## Authorization

RLS is enabled on all exposed registry tables.

- `anon` receives no registry-table privileges.
- profiles are self-readable/self-editable only;
- collections are owner-only;
- private experiments are owner-only;
- public experiments are readable by authenticated users;
- experiment writes/deletes are owner-only;
- preserved snapshots are unavailable to ordinary clients;
- browser/AI clients never receive `service_role` credentials.

Authorization uses `auth.uid()` ownership predicates and does not rely on user-editable metadata.

## Collection ownership invariant

An experiment may reference only a collection owned by the same experiment owner. A database trigger enforces this invariant in addition to RLS/client checks.

## Revision and optimistic concurrency

Experiments start at revision `1`; accepted updates increment the revision atomically.

Clients update by both experiment ID and the base revision previously read. One updated row means success; zero updated rows means stale or inaccessible state and must be surfaced as a conflict rather than retried blindly.

## Lifecycle

`active` experiments appear in the normal workspace. `archived` experiments remain stored and restorable.

Permanent deletion is an explicit owner-controlled destructive action. Preserved snapshots remain intact even if the corresponding working experiment is deleted.

## Sharing boundary

The schema reserves `private`, `shared`, and `public`, but #42 implements no user-to-user grant semantics yet. #45 owns explicit sharing/submission/curation authorization.

## Realtime

Realtime is optional. Revision-aware synchronization is the correctness mechanism. #44 may use Realtime, polling, or explicit refresh without changing the domain contract.

## Deployment validation

The migration was deployed to the live Supabase project as `experiment_registry_v1`.

Validation used two temporary Auth identities, Student A and Student B, under the real PostgreSQL `authenticated` role with simulated authenticated JWT claims. All temporary identities and data were deleted afterward.

Observed results:

1. Both Auth identities generated distinct registry profiles.
2. Student A created a collection and private experiment and could read it.
3. Student B saw zero rows for Student A's private experiment.
4. Student B updated zero rows when attempting to modify Student A's private experiment.
5. Student B created and read an independent private experiment.
6. Student A saw zero rows for Student B's private experiment.
7. Archiving an owned experiment advanced its internal revision.
8. A write constrained to the stale prior revision updated zero rows.
9. The three source artifacts round-tripped exactly into a preserved snapshot.
10. Permanent deletion of the working experiment left the preserved snapshot intact.
11. Temporary test users and data were cleaned up successfully.

## Security advisor

After migration, Supabase reported:

- one `INFO` finding that `public.preserved_experiment_snapshots` has RLS enabled but no policies. This is intentional in #42: ordinary clients have no grants and #45 will introduce explicit policies;
- one Auth warning that leaked-password protection is disabled. This is an account-level password-hardening setting, not an RLS isolation failure; reconsider it when end-user password authentication is configured.

References:
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Security boundary

The registry has no GitHub repository credentials, deployment credentials, shell capability, arbitrary filesystem capability, or simulator execution API. Production simulator integration remains deferred to #46.

## Acceptance state

#42 backend requirements are satisfied: canonical remote storage, two-user isolation, collection organization, create/update/archive/delete primitives, internal revision protection, preserved-snapshot survival, and no simulator-development path have all been deployed and validated.

Next: #43 exposes the same experiment-domain operations through an authenticated experiment-only MCP adapter, still without modifying the production simulator.
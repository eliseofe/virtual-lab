# Experiment Registry Backend

Status: issue #42 implementation scaffold. Production Virtual Lab is not connected by this work.

## Backend choice

Preferred backend: Supabase Free plan, subject to deployment verification in the owner's actual project.

Verified against Supabase's current official pricing/billing documentation on 2026-09-11:

- 500 MB database per free project;
- 50,000 monthly active users;
- 5 GB egress;
- 500,000 Edge Function invocations/month;
- 2 million Realtime messages/month;
- 200 peak Realtime connections;
- free projects may pause after one week of inactivity;
- maximum two active free projects.

The experiment registry stores small text/metadata records and does not run simulations, so the expected initial educational workload is far below these quotas. This is a capacity assumption to re-check periodically, not a guarantee that a vendor's free tier will remain unchanged.

Official references:

- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://supabase.com/docs/guides/database/postgres/row-level-security

## Data model

The initial migration is `supabase/migrations/20260911193000_experiment_registry_v1.sql`.

### profiles

One registry profile per Supabase Auth user. The registry identity is independent of ChatGPT/Claude identity. A profile carries a user-facing display identity while the Auth UUID is the stable authorization key.

### experiment_collections

One-level optional organization under each owner. Collections are not filesystem paths. Only the owner can create/update/delete their collections in milestone 1.

### experiments

Canonical mutable working records containing:

- owner and optional collection;
- `vlab.registry-experiment/1` and `vlab.student-artifacts/1` compatibility markers;
- title/description;
- active/archived lifecycle;
- private/shared/public visibility marker;
- internal revision number;
- exactly the three source artifacts: configuration, initializer, controller;
- actor/provenance fields for human/AI edits.

### preserved_experiment_snapshots

Reserved storage for later professor/submission/curation work. A preserved snapshot uses `ON DELETE SET NULL` for its working-experiment reference and carries its own exact artifact copy. Therefore future deletion of an owner's working experiment cannot implicitly destroy a separately preserved submission/assessment/curated state.

Ordinary authenticated clients receive no table privileges on snapshots in #42. #45 will add explicit permissioned workflows.

## Authorization

Supabase Auth provides authenticated user identity. PostgreSQL RLS is enabled on every exposed registry table.

Security principles:

- `anon` receives no registry table privileges;
- `authenticated` receives only operations required by the student registry workflow;
- profiles are self-readable/self-editable only in milestone 1;
- collections are owner-only;
- private experiments are owner-only;
- public experiments are readable by authenticated users;
- experiment updates/deletes are owner-only;
- preserved snapshots are unavailable to ordinary clients until #45;
- the browser and later MCP layer never receive `service_role` credentials.

RLS and PostgreSQL grants are both configured because Supabase explicitly documents them as separate authorization layers.

## Collection ownership invariant

An experiment may reference only a collection owned by the same experiment owner. The migration enforces this with a database trigger in addition to client/API validation.

## Revision and optimistic concurrency

The database increments `experiments.revision` on every accepted update.

Normal registry clients must update by both experiment ID and the base revision they previously read. For example, the conceptual predicate is `id = X AND revision = R`.

- one updated row means the write succeeded and the trigger produced revision `R + 1`;
- zero updated rows means the base revision is stale or inaccessible and must be reported as a conflict;
- clients must never retry a stale mutation blindly.

The database RLS protects ownership even if a client violates the synchronization convention. #43's experiment-domain MCP/API adapter must make the optimistic-concurrency path the only supported mutation contract exposed to AI clients.

## Lifecycle

`active` experiments appear in the normal workspace. `archived` experiments remain stored and restorable.

Permanent deletion is an explicit owner-controlled destructive action. The data model already prevents future preserved snapshots from cascading away with the working record.

A full professor/submission/curation lifecycle remains #45 work.

## Sharing boundary

The schema reserves visibility values `private`, `shared`, and `public`, but #42 does not yet implement user-to-user grant semantics. `shared` therefore has no broader read policy in milestone 1.

#45 will add explicit sharing/submission/curation authorization after the two-user student flow has been proven through MCP and mock-sim.

## Realtime

Realtime synchronization is useful but not required to prove the core backend. The stable correctness mechanism is revision-aware read/write synchronization.

#44 may add Realtime subscription or simple refresh/polling to mock-sim. That choice must not change the experiment domain contract.

## Required deployment verification

Once a Supabase project exists, #42 is not complete until the migration is deployed and tested against real Auth users.

Minimum test matrix:

1. Create two independent Auth users A and B and verify two separate profiles.
2. A creates two collections and multiple experiments from zero.
3. A moves an experiment between A's collections.
4. A reads/updates/archives/restores its own experiment.
5. B cannot read/update/delete A's private experiment even when B knows the UUID.
6. B can independently create/manage its own experiment namespace.
7. An update constrained by a stale revision affects zero rows and is surfaced as a conflict.
8. Artifact strings round-trip byte-for-byte.
9. Permanent deletion removes an eligible working record without a cascade path that would delete preserved snapshots.
10. No browser/AI client receives service-role, GitHub, deployment, shell, or simulator-development credentials.

Add executable Supabase database/RLS tests once the project/CLI environment is available; current Supabase guidance recommends `supabase test db` and explicit allow/deny tests for every RLS-protected table.

## Current deployment blocker

Repository-side schema/design work can be completed without an account. Actual deployment and the required two-user Auth/RLS verification require an owner Supabase project and an authorized Supabase connection.

Until that exists, #42 remains open and #43 must not be treated as production-ready.

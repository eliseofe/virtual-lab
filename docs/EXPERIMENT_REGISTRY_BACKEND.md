# Experiment Registry Backend

Status: **production Supabase registry/Auth/MCP backend is deployed and integrated with Virtual Lab**.

Current project status is in `CURRENT_STATUS.md`; longer-term direction is in `ROADMAP.md`.

## Backend

Backend: Supabase Free plan.

Production project:

- project: `virtual-lab`
- project reference: `izdmmudfrmqhvlgepwes`
- region: `ap-south-1`

The project reference is an identifier, not a secret.

Simulation compute remains local in the browser/WASM worker. Supabase stores lightweight Experiment/identity/presentation/capability-request state and serves the authenticated MCP Edge Function; it is not the scientific compute backend or bulk result-data store.

## Current data model

### `profiles`

One registry profile per Supabase Auth user. Current experiment-domain roles include `student` and `professor`.

### `experiment_collections`

Optional one-level organization under each owner. Collections are not filesystem paths.

### `experiments`

Canonical mutable working Experiment records with owner, optional collection, lifecycle/visibility, scientific revision and canonical ordered `artifacts[]`.

Current required core artifacts are:

1. configuration
2. initialization
3. controller
4. metrics

Current registry/artifact contracts are `vlab.registry-experiment/3` and `vlab.experiment-artifacts/3`. Legacy three-source fields remain compatibility mirrors/input only and must not discard Metrics.

### `experiment_results_presentations`

Non-scientific Results presentation state under `vlab.results-presentation/1`.

It stores generic panel bindings by stable metric IDs with an independent optimistic presentation revision. Presentation changes do not bump the scientific Experiment revision.

### `experiment_copy_origins`

Immutable metadata for independent Experiments created from a readable non-owned source. It records the new Experiment, source Experiment identity/owner/title and exact source revision. The source ID is intentionally retained without a foreign key so later source deletion does not erase provenance.

Authenticated users may read provenance for their own copies but cannot insert/update/delete provenance directly. The browser calls the public `copy_experiment_to_workspace` SECURITY INVOKER RPC; privileged atomic copy logic lives in the non-exposed `private.copy_experiment_to_workspace_impl` SECURITY DEFINER function, which performs explicit caller, readability, revision and destination checks before creating the new private Experiment and provenance.

### `experiment_shares`

Explicit read-only grants on mutable working Experiments. Each row identifies one Experiment and one recipient; it does not duplicate Experiment content.

RLS permits:
- recipients to discover their received shares;
- owners to inspect outgoing shares for Experiments they own;
- owners to create a share only for an active Experiment they own and an eligible recipient;
- owners to revoke an ordinary share.

Eligible recipient discovery is exposed through the narrow public `list_experiment_share_recipients` SECURITY INVOKER RPC, backed by private authorization logic. Student/researchers see other Student/researchers as explicit-share candidates; Professors may share with eligible registry researchers. Student → Professor explicit sharing is rejected because Professor supervision already grants that read-only access independently.

The Experiment SELECT policy recognizes active share grants, while Experiment UPDATE/DELETE policies remain owner-only. Deleting a share therefore removes the recipient's ordinary read access to the source without altering any independent copy they already created. The copy-to-workspace authorization path recognizes an explicit share only while that share exists.

Professor supervision is independent of `experiment_shares`: a Professor retains read-only supervision access to Student/researcher Experiments even when no ordinary share exists or after one is revoked. Showcase curation is also a separate publication path.

### `capability_requests`

Durable Professor-originated requests for missing simulator/authoring capabilities. Request lifecycle is separate from trusted implementation authorization.

### `preserved_experiment_snapshots`

Independent preserved snapshots used by submission/assessment/curation architecture. Working-Experiment deletion must not silently destroy preserved snapshots.

## Authorization

RLS is the authoritative database boundary.

- browser/AI clients do not receive `service_role` credentials;
- private Experiment writes are owner-scoped;
- explicit share rows, automatic Professor supervision and public visibility are separate rules controlling readable non-owned Experiments;
- Results-presentation writes are owner-scoped;
- Professor-only capability request behavior is enforced by role/domain rules;
- experiment-domain authentication never grants GitHub, shell, deployment or simulator-source rights.

## Revision semantics

Scientific Experiment changes use `experiments.revision` and optimistic concurrency. Stale writes are rejected.

Results presentation has a separate revision because layout/panel edits are workspace state rather than scientific Experiment changes.

## Production clients

Production Virtual Lab is connected to the registry and can list/load/save canonical Experiment artifacts.

Production `experiment-mcp` provides authenticated AI-facing Experiment authoring over the same domain boundary.

Current MCP deployment:

- server `3.0.0`
- interface `8`
- authoring `vlab.authoring/0.6`
- Edge Function version `16`

The MCP is pinned to merged #200 commit `31239dea1174cddf0c4d2d5578034ca55e6b941d`.

## Scientific result storage

Raw single-run metric data is **not** stored in Supabase as the canonical archive.

#199 establishes user-visible local filesystem persistence under:

```text
<VirtualLab root>/
  <Experiment>/
    runs/
      <metric-id>_000001.csv
      ...
    studies/
      <Study>/
        <metric-id>_000001.csv
        ...
```

There is no per-run directory and no extra `runs/` layer inside a Study. Compact internal bookkeeping remains outside the ordinary standalone `runs/` directory.

## Security advisor state

After #200 migration, the new Results-presentation table had no security-advisor finding. Known project-level notices at that checkpoint were:

- `preserved_experiment_snapshots`: RLS enabled with no ordinary-client policy, an existing intentional/reviewable state;
- leaked-password protection disabled: Auth hardening warning, independent of registry RLS isolation.

Re-run advisors after material DDL/auth changes.

## Zero-cost boundary

The current architecture uses Supabase Free for lightweight collaboration/auth/MCP state while keeping simulation compute and raw scientific data local. Vendor limits should be rechecked periodically, but the baseline must not silently introduce a mandatory paid infrastructure dependency.

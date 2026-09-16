# Zero-Cost Invariant

Status: **current architecture, 16 September 2026**.

Virtual Lab is intended as an academic/open system that can scale to additional users without imposing a mandatory infrastructure bill on the project owner.

## Hard requirement

The baseline laboratory must remain usable at **€0 incremental project cost** beyond already-owned domains and ordinary researcher hardware.

Current baseline:

| Component | Current baseline implementation | Required incremental project cost |
|---|---|---:|
| Static application hosting | GitHub Pages | €0 |
| Simulation compute | researcher's browser/CPU via Rust/WASM | €0 |
| Raw scientific result storage | researcher's selected local filesystem / exported local files | €0 |
| Experiment registry + Auth | Supabase Free | €0 baseline |
| AI-facing Experiment MCP | Supabase Edge Function on the same Free project | €0 baseline |
| Repository/CI for simulator development | GitHub | €0 baseline |
| Paid AI API | not required by Virtual Lab protocol | €0 |
| Domain | already-owned domain may be attached later | outside runtime baseline |

Supabase is a current free lightweight adapter for Experiment collaboration/authentication/MCP. The architecture must remain replaceable if its free-tier economics or suitability change.

## Architecture consequences

- scientific simulation compute remains on researcher-owned hardware by default;
- large/raw result data remains local and user-visible by default;
- the registry stores compact Experiment/identity/presentation/request state, not bulk trajectories or Monte Carlo output;
- static hosting serves application assets; it does not become a scientific compute service;
- a paid AI API is never required merely to use/run the Lab;
- future paid/institutional services must be optional adapters rather than hidden baseline dependencies;
- scientific semantics must not depend on hosting/storage/AI vendor.

## Local-data principle

Current canonical standalone run storage is ordinary files under a user-selected Virtual Lab workspace root when the browser supports direct writable-directory access:

```text
<VirtualLab root>/
  <Experiment>/
    runs/
      <metric-id>_000001.csv
      ...
    studies/
      <Study>/
        runs/
          ...
```

Browser-private storage is not the canonical scientific archive. Whole-Experiment package export is a secondary local convenience, not a substitute for automatic folder persistence where supported.

As Studies/sweeps grow, the Lab should expose data-volume/retention choices where useful without changing scientific computation semantics.

## Optional future infrastructure

Institutional HPC, shared filesystems, object storage, cloud compute, paid databases and paid AI APIs may be added only behind optional adapters. Their presence must not redefine Experiment/controller/metric semantics or make the core browser-local workflow dependent on a paid service.

## Cost disclosure rule

Whenever proposed work introduces any plausible direct monetary cost, required paid plan, metered API, storage/compute charge or quota likely to force an upgrade:

1. document the cost/risk before adoption;
2. identify the €0 baseline alternative or explain why none exists;
3. require explicit owner approval before making the paid dependency part of the architecture.

Free-tier services also require periodic re-checking of vendor limits. “Currently free” is not permission to silently create an architecture that fails if a vendor later charges.

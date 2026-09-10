# Zero-Cost Invariant

Virtual Lab is intended as an academic/open system that can scale to additional users without imposing a mandatory infrastructure bill on the project owner.

## Hard requirement

The baseline laboratory must remain fully usable at **€0 incremental project cost** beyond already-owned domains and ordinary researcher hardware.

Required baseline services:

| Component | Baseline implementation | Required project cost |
|---|---|---:|
| Static hosting | GitHub Pages or equivalent static host | €0 |
| Simulation compute | researcher's browser/CPU | €0 |
| Raw result storage | researcher's local machine/browser/files | €0 |
| Experiment collaboration | Git/GitHub Free where appropriate | €0 |
| Database | none required | €0 |
| Server compute | none required | €0 |
| Object storage | none required | €0 |
| OpenAI API | none required | €0 |
| Domain | already-owned domain may be attached later | outside runtime cost |

## Architecture consequences

The zero-cost rule is architectural, not merely an MVP budget preference:

- static hosting serves application assets only;
- scientific compute occurs on user-owned hardware by default;
- large raw results remain local by default;
- collaboration transports small/versioned specifications and summaries rather than bulk trajectories;
- server-side databases, queues, object stores, AI APIs, and compute clusters are optional adapters only;
- the lab must remain functional if every optional paid/institutional adapter is absent.

## Local-data principle

Simulation output can grow to gigabytes or terabytes. The laboratory must therefore make data ownership and volume explicit.

Git is for specifications, source, provenance, and small summaries. It is not a scientific bulk-data store.

Researchers should be able to:

- inspect expected data volume before large sweeps;
- keep active/recent results in browser-local storage where practical;
- export valuable run/result bundles to their filesystem;
- choose whether to retain or delete raw trajectories;
- exchange compact AI-facing summaries without uploading the entire dataset.

## Optional future infrastructure

Institutional HPC, shared filesystems, object storage, databases, cloud compute, and paid AI APIs may be added only behind optional adapters. Their presence must not change the experiment/controller scientific semantics.

## Cost disclosure rule

Whenever proposed work introduces any plausible direct monetary cost, required paid plan, metered API, storage charge, compute charge, or quota likely to force an upgrade, document that cost/risk explicitly before adopting the dependency and identify the zero-cost baseline alternative.
# Data, Local Storage, and Reproducibility Metadata

Status: **current deployed single-run storage contract, 16 September 2026**.

## Principle

Scientific result data is local-first and user-owned. The canonical raw single-run metric output is ordinary user-visible files under a user-selected Virtual Lab workspace root when writable-directory access is available.

Browser-private storage is not the scientific archive. Supabase is not the bulk scientific-data store.

## Canonical single-run organization

```text
<VirtualLab root>/
  <Experiment>/
    runs/
      polarization_000001.csv
      angular_momentum_000001.csv
      polarization_000002.csv
      angular_momentum_000002.csv
      ...
    .vlab/
      ...compact Lab-managed bookkeeping...
    studies/
      <Study>/
        polarization_000001.csv
        angular_momentum_000001.csv
        ...
```

Rules:

- the selected Experiment is the parent directory;
- standalone runs are flat files directly in `<Experiment>/runs/`;
- there is never one directory per simulation run;
- each metric file is named from stable metric ID + six-digit increasing run number;
- files sharing a run-number suffix belong to the same run;
- existing runs are never overwritten;
- future Study runs reuse the same flat single-run file contract directly under `<Experiment>/studies/<Study>/`;
- ordinary result files remain directly useful from Python/R/other analysis tools without unpacking nested run directories.

## Metric file format

Current scalar metric files are CSV:

```text
scientific_time,value
0.1,...
0.2,...
```

A run with several metrics therefore produces several CSV files carrying the same run number.

## Internal bookkeeping

Compact Lab-managed execution/reproducibility/debugging metadata lives under `<Experiment>/.vlab/`, outside the ordinary `runs/` directory. It may identify information such as exact Experiment identity/revision, runtime/compiler contract versions, seed/configuration context, metric definitions/sampling, completion state and dropped-sample state.

This bookkeeping is primarily machine-managed. The normal scientific workflow should not require the researcher to manage one visible JSON manifest per run.

## Persistence behavior

Metric evaluation, UI rendering and persistence flushing are independent schedules.

Current standalone persistence behavior:

- default flush cadence is 5 seconds and is user-adjustable independently from metric sampling;
- writes are buffered/asynchronous and remain outside the simulator hot path;
- pause triggers a flush without ending the run;
- completion/restart/reconfiguration/runtime failure records explicit terminal state;
- pending persistence is bounded;
- if storage falls behind to the safety bound, the Lab pauses rather than silently dropping scientific data;
- hiding/leaving the page can trigger best-effort immediate flushing, but unflushed data must never be falsely reported as durable.

## Directory capability and package export

Where the browser exposes writable-directory access, the intended workflow is:

`select workspace root once → Lab manages Experiment hierarchy → runs write automatically`

The separate `Download experiment package` action is a secondary whole-Experiment export. It packages all completed standalone runs currently retained for the selected Experiment using the same flat `<Experiment>/runs/` hierarchy plus compact `.vlab/` bookkeeping.

It is not a per-run download workflow and is not a replacement for automatic selected-folder persistence on capable browsers.

## Remote registry boundary

Appropriate remote/registry data includes:

- Experiment identity and canonical authored artifacts;
- collections/lifecycle/sharing metadata;
- scientific Experiment revision;
- lightweight Results-presentation state;
- capability-request workflow state;
- preserved compact snapshots/curation metadata where explicitly supported.

Large run traces, Monte Carlo matrices, videos and bulk Study output do not silently move to Supabase/Git.

## Studies

Studies are the future multi-run/condition layer. They must compose the existing single-run file contract rather than inventing incompatible storage.

The parent relationship is intentionally visible:

`VirtualLab root → Experiment → studies → Study`

This preserves which Experiment context a Study belongs to. Study orchestration/aggregation is separate work; #199 defined only the reusable single-run storage seam.

## Immutability and traceability

A stored scientific run identifies the exact Experiment revision/configuration/runtime context that produced it through Lab-managed metadata. Scientific edits create a new Experiment revision rather than silently relabelling old output.

Human-readable folder/file names are convenience; stable IDs/revisions in machine-managed metadata remain authoritative where identity must survive renaming/copying.

## Data-volume principle

Large scientific output remains on researcher-owned storage by default. Future sweeps/Studies should expose data-volume and retention choices where useful, while preserving metric-computation semantics independently from visualization/storage choices.

## Deletion semantics

The product should distinguish among:

- archiving/deleting Experiment metadata in the registry;
- deleting Lab-managed local run files from the user's workspace;
- deleting browser cache/recovery state;
- deleting user-exported files outside Lab control.

No action should silently conflate these separate stores/lifecycles.

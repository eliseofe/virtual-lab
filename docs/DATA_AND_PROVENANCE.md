# Data, Local Storage, and Provenance

## Principle

Scientific data ownership is local-first. Virtual Lab should not create a hidden cloud-storage obligation as experiments scale from a single visual run to many seeds and parameter sweeps.

## Data classes

### Source/specification data

Appropriate for Git/version control:

- experiment manifests;
- controller source;
- metric definitions;
- parameters;
- references;
- compact provenance;
- small summary results where scientifically useful.

### Bulk run data

Local by default:

- full trajectories;
- per-agent/per-frame snapshots;
- large Monte Carlo matrices;
- videos/replays;
- high-frequency metric traces;
- large parameter-sweep intermediates.

These must not be silently committed to Git.

## Browser-local storage

The browser may keep active/recent runs in local persistent storage for convenience. The UI should eventually expose storage use clearly and distinguish cached/browser-local data from explicitly exported archival files.

Browser storage is not assumed to be the only archival copy of valuable scientific data.

## Portable bundles

The project should define versioned portable formats for:

- experiment bundle;
- single run bundle;
- multi-run/result summary bundle;
- optional raw-data bundle.

A compact AI-facing result should be small enough to exchange conveniently and include references/hashes that identify the exact scientific inputs.

## Required provenance

A run should eventually identify at least:

- run id;
- experiment id and revision;
- canonical experiment hash;
- controller source/IR hash and language/compiler version;
- simulation-core version/commit;
- physics/observation/metric definitions and versions;
- parameter values;
- seed / deterministic stream configuration;
- execution backend;
- relevant numerical/reproducibility mode;
- creation/execution actor where available;
- timestamps/status;
- produced artifacts and their hashes where practical.

## Immutable history

Once a run references an experiment revision, that revision is immutable. Scientific edits create a new revision. Results point to exact revisions rather than mutable names.

## Data-volume awareness

Round 2 should estimate expected output volume before launching large sweeps. Users should be able to choose trajectory sampling/retention policies independently of metric computation where scientifically valid.

## Collaboration

Collaborators need not upload all raw data to a common server. They can share experiment definitions and compact result/provenance bundles while retaining bulk data locally. Optional institutional/shared storage may later be plugged in behind an adapter.

## Deletion semantics

UI operations should distinguish:

- archive experiment from normal view;
- delete local cached run data;
- delete exported files from the user's filesystem (outside browser control where appropriate);
- permanent logical deletion of experiment metadata.

Scientific history should favor archive/versioning over silent destructive mutation.
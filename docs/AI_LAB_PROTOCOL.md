# AI ↔ Lab Protocol

## Goal

An AI research assistant is a client of the experiment system, not the owner of Virtual Lab architecture. The same experiment system must work with ChatGPT, Claude, another AI provider, a custom client, or no AI at all.

The current architecture is defined by issue #41 and `docs/EXPERIMENT_REGISTRY_CONTRACT.md`.

## Permanent layers

```text
Student experiment artifacts
        ↓
Experiment domain operations
        ↓
Canonical remote Experiment Registry
        ↓
Authenticated adapters / clients
```

The three student-editable artifacts are:

- experiment configuration/parameters;
- initialization source;
- controller source.

The registry object is versioned by `schemas/registry-experiment.schema.json` and is independent of Supabase, MCP, GitHub, and AI vendors.

## Canonical storage and execution boundary

The remote Experiment Registry is the canonical home of experiment source and metadata.

Virtual Lab may cache experiments locally in the browser, but cached state is not an independent authority. Scientific simulation remains local in the browser/WASM worker. The registry stores source/metadata and performs authentication, authorization, organization, and synchronization; it does not execute simulations.

The simulator source repository is a separate system. Experiment-domain credentials and APIs must not grant GitHub, deployment, shell, arbitrary-filesystem, or simulator-source write capability.

## Identity and roles

Registry identity is independent of AI-provider identity.

- **Student/researcher:** owns and manages experiments.
- **Professor/curator:** receives additional explicit experiment-domain permissions for submissions, assessment, sharing, and curation.
- **Simulator developer:** modifies Virtual Lab itself through the separate GitHub engineering workflow.

One person may hold more than one role, but the capability domains remain distinct.

## Experiment domain operations

The stable domain includes operations equivalent to:

```text
who_am_i()
list_collections()
list_experiments()
get_experiment(id)
create_experiment(spec)
update_experiment(id, base_revision, spec)
move_experiment(id, collection)
archive_experiment(id, base_revision)
restore_experiment(id, base_revision)
delete_experiment(id, base_revision)
```

Later professor/curation operations extend this domain explicitly.

These are domain semantics, not necessarily literal function names. They must not contain model-specific scientific shortcuts such as `set_K1` or `choose_controller_type`; arbitrary valid contents of the three student artifacts remain expressible.

## Synchronization

Experiment updates use optimistic concurrency with an internal revision token/number.

A client writes against the revision it previously read. A stale write is rejected rather than silently overwriting newer state. User-visible version history is not required for the first milestone.

The intended experience is simple two-way synchronization:

- AI edit → registry → mock-sim/Virtual Lab sees the new state;
- mock-sim/Virtual Lab edit → registry → AI sees the new state.

No manual package download/upload is part of the intended normal workflow.

## Organization and lifecycle

The minimum organization model is:

```text
user namespace
  optional collection/project
    experiment
```

Experiments can be created from zero, moved between a user's collections/projects, archived, restored, and—when eligible—permanently deleted.

Archive is reversible and hides an experiment from the normal active list. Permanent delete is intentionally destructive for the working experiment, but cannot implicitly destroy separately preserved submission/assessment/curated snapshots.

## AI-facing adapter

The first AI-facing transport is an authenticated remote MCP adapter over the experiment domain.

MCP is transport, not the scientific contract. ChatGPT is the first intended client, not an architectural dependency. Claude or another compatible client can use the same domain semantics.

The student MCP surface exposes experiment authoring/organization only. It does not expose:

- simulator run/control;
- simulator observations/results/screenshots/metrics;
- GitHub or deployment operations;
- arbitrary shell/filesystem access;
- backend administrator secrets.

## Browser-facing client

Before production Virtual Lab integration, a deliberately minimal `mock-sim` client must exercise the exact browser-side authentication, registry, organization, lifecycle, and synchronization contract intended for Virtual Lab.

The mandatory proof uses at least two distinct authenticated registry users and covers:

- private namespace isolation;
- create from zero;
- collections/projects;
- AI → mock-sim synchronization;
- mock-sim → AI synchronization;
- stale-write conflict handling;
- archive/restore;
- eligible permanent delete.

Issue #46 cannot begin until the owner personally accepts this mock-sim workflow.

## Pedagogical boundary

For the student workflow the AI does not close the scientific loop automatically.

```text
student ↔ AI discussion
        ↓
experiment source saved to registry
        ↓
student opens Virtual Lab
        ↓
student manually runs and observes experiment
        ↓
student decides what to discuss/change next
```

A later explicit Lab → AI results/plots channel is separate work. It must not be introduced as an implicit side effect of experiment-source synchronization.

## Professor / community direction

After the student transport is proven, the same registry will support sharing, submission, professor access, and curated/public examples without granting simulator-development permissions.

This allows experiments to persist beyond one machine and supports student-to-student exchange, grading/assessment, official examples, and community contributions.

## Zero-cost direction

The initial target uses a lightweight remote registry/auth service while keeping all simulation compute client-side. Supabase is the preferred implementation candidate for #42, subject to verification of current free-tier limits and capabilities.

The laboratory protocol itself must not require a paid AI API.

## Result exchange

Lab → AI results are deliberately deferred. Issue #6 defines a later explicit, user-controlled results/plots channel with provenance. Bulk trajectories remain local by default.

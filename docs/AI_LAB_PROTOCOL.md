# AI ↔ Lab Protocol

## Goal

An AI research assistant is a client of the lab, not the owner of the lab architecture. The same lab must work with ChatGPT, another AI provider, a custom agent, or no AI at all.

## Permanent layers

```text
Scientific portable format
        ↓
Lab domain operations
        ↓
Adapters / transports
```

### Scientific portable format

Canonical versioned objects define experiments and results. These are independent of GitHub, HTTP, MCP, and AI vendors.

Initial schemas live under `schemas/` and evolve only through explicit versioning.

### Lab domain operations

Conceptual API:

```text
list_experiments()
create_experiment(spec)
get_experiment(id, revision?)
create_revision(id, spec)
archive_experiment(id)
select_experiment(id)             # local UI/session concept
run_experiment(id, revision, run_config)
list_runs(experiment_id)
get_run(run_id)
export_experiment(id, revision)
export_run(run_id)
```

The browser UI and AI adapters target the same domain semantics.

## Initial transport: GitHub adapter

The first AI→Lab bridge may use GitHub because AI clients can already manipulate repository text and collaborators can use their own GitHub identities.

Illustrative mapping:

```text
create_experiment  -> create versioned experiment files/commit
create_revision    -> new immutable revision/commit
list_experiments   -> enumerate experiment manifests
archive_experiment -> update logical archive state/versioned metadata
```

GitHub is replaceable. Domain code depends on an `ExperimentRepository` interface rather than GitHub-specific paths/calls.

The portable experiment itself must also be importable/exportable directly from disk. GitHub is a transport and collaboration adapter, not the file format.

## Future AI-facing adapters

A future local bridge or service may expose the same domain operations through MCP, HTTP, filesystem tooling, or another protocol. Replacing the transport must not change:

- experiment schemas;
- controller semantics;
- simulator semantics;
- run/result schemas;
- UI concepts.

MCP is a plausible future AI-facing adapter, not the canonical scientific protocol.

## Lab → AI result exchange

Baseline result exchange requires no backend server or AI API.

A compact AI-facing result bundle should contain:

- experiment id/revision/hash;
- controller/metric versions;
- run seed and execution configuration;
- run status;
- summary metrics;
- provenance/core/compiler versions;
- optional small plot/image/replay excerpt;
- references to larger local artifacts without requiring them to be uploaded.

Bulk trajectory data remains local unless the researcher explicitly exports/shares it.

## Workspace and multi-user future

Experiments belong to workspaces, not AI accounts.

```text
Workspace: Collective Motion
  members:
    researcher A
    researcher B

Actors/provenance:
  researcher A via ChatGPT
  researcher A via browser
  researcher B via Claude
  researcher B via browser
```

Each human authenticates independently to the collaboration layer. Each human may use a different AI provider/account. A ChatGPT/Claude account is never the lab identity system.

Round 1 may collapse identity to one local actor, but schemas should reserve stable `workspace_id`, `created_by`, and actor metadata so collaboration does not require redesigning provenance.

## Interaction philosophy

The AI-to-lab operation should ultimately feel like a scientific command, for example “create experiment X from this approved model specification,” rather than “edit these repository paths.” GitHub-specific mechanics remain inside the adapter.

Likewise, lab-to-AI exchange should expose scientific run/result objects rather than requiring an AI to reverse-engineer browser internals.

## Long-term closed loop

```text
paper / hypothesis
    ↓
human ↔ AI scientific interpretation
    ↓
approved experiment specification
    ↓
create_experiment()
    ↓
Virtual Lab experiment workspace
    ↓
run locally / native / HPC
    ↓
Run + Result objects
    ↓
get/export result
    ↓
human ↔ AI scientific interpretation
```

The transport on either side may change without changing the loop.
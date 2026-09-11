# Experiment Registry Contract

Status: architecture contract for issue #41.

## Purpose

Virtual Lab needs a communication boundary that lets a student/researcher and an AI author experiments without granting that AI simulator-development capability. The same experiment state must later be consumable by the browser lab, shareable with professors or collaborators, and independent of any specific AI provider.

This document defines that boundary. It does not define simulator execution and it does not authorize changes to the production simulator.

## Roles

### Student / researcher

May create, read, edit, organize, archive, restore, and where allowed permanently delete experiments they own. May read experiments explicitly shared with them or made public. May run experiments only through the human-facing Virtual Lab; the student AI channel has no simulator-run capability.

### Professor / curator

Has student capabilities plus explicitly authorized access to submissions/shared work and later curation/promotion capabilities. Professor/curator is an experiment-domain role, not a simulator-development role.

### Simulator developer

Changes Virtual Lab source, kernel, UI, deployment, workflows, and engineering infrastructure through the separate GitHub development process. No registry or MCP capability grants simulator-developer authority.

One real person may hold multiple roles, but the capabilities remain separately enforceable.

## Canonical topology

The remote Experiment Registry is canonical for experiment source and metadata.

- AI clients reach it through an authenticated experiment-only adapter, initially MCP.
- mock-sim and later Virtual Lab reach it through the browser-facing registry API.
- browser storage may cache the latest accepted experiment state for responsiveness/reload recovery.
- cached browser state is never a competing source of truth.
- simulation computation remains local in the browser/WASM worker.
- the registry is not a simulation backend and is not the simulator repository.

Normal experiment authoring must not require manual file download/upload.

## Registry experiment format

Registry records use schema version `vlab.registry-experiment/1` and the JSON schema in `schemas/registry-experiment.schema.json`.

The scientific/student-editable payload is exactly three source artifacts:

1. `config_source` — experiment configuration/parameters;
2. `initializer_source` — initialization code;
3. `controller_source` — controller code.

The registry may add metadata required for identity, organization, synchronization, provenance, compatibility, lifecycle, and sharing. It must not inject simulator-development capabilities into the object.

The three artifacts are opaque source text to the registry. Scientific interpretation, compilation, and execution belong to Virtual Lab, not to the storage service.

## Identity

A registry user has a stable registry identity independent of ChatGPT, Claude, or any other AI-provider identity.

At minimum the system must support:

- a stable internal user ID;
- a user-facing display name/handle;
- multiple independent authenticated users;
- row-level authorization such that private experiments for user A are not visible or writable by user B.

An AI acts on behalf of the authenticated registry user. AI-provider identity is not the laboratory identity system.

## Organization

The minimum organization model is deliberately shallow and non-filesystem-based:

`user namespace -> optional collection/project -> experiment`

Requirements:

- an experiment always has exactly one owner;
- an experiment may belong to zero or one collection/project owned by that user;
- a user may have multiple collections/projects;
- a user may create a brand-new experiment from zero;
- an owned experiment may be reassigned between the owner's collections/projects;
- shared/submitted/curated views are authorization views, not filesystem directories.

A deep arbitrary directory tree is not part of milestone 1. This keeps organization simple while leaving room for future course/community views.

## Experiment lifecycle

### Active

Appears in the owner's normal active experiment list and may be edited subject to authorization.

### Archived

Hidden from the default active list but retained intact, addressable, and restorable. Archive is the normal reversible operation for removing clutter while preserving provenance and links.

### Permanent delete

A deliberate destructive owner/admin operation for an eligible working experiment. Permanent delete removes the owner's working experiment record after explicit confirmation/safeguards.

Permanent delete must never implicitly destroy a separately preserved submission, assessment snapshot, or curated/public snapshot. Such snapshots are separate preserved objects/references with their own lifecycle.

The first milestone does not require a recycle-bin retention period; it requires the domain distinction between archive and permanent delete.

## Synchronization and revision semantics

User-visible version history is not required for milestone 1. Internal revision identity is required.

Each experiment has a monotonically changing revision token/number. Every mutation that changes authoritative experiment state creates a new revision value.

A write must identify the revision it was based on. The registry accepts the write only when that base revision is still current. Otherwise it rejects the write as stale/conflicting and returns the current revision/state needed for recovery.

Therefore the intended user experience can feel like simple two-way synchronization without using blind last-write-wins semantics.

Required cases:

- AI updates an experiment; mock-sim/lab can discover the new revision.
- mock-sim/lab edits and saves; AI subsequently reads the new revision.
- stale browser cache cannot overwrite a newer remote revision silently.
- simultaneous conflicting writes are rejected explicitly rather than merged silently.
- archive/restore, organization changes, and source edits all participate in revision checking.

The registry need not preserve every historical revision as a user-browsable history. Later professor submission/curation can preserve exact snapshots explicitly.

## Local cache contract

A browser cache may store the latest successfully read or written registry state keyed by authenticated user and experiment ID.

Rules:

- remote registry state is authoritative;
- cache records include the registry revision they represent;
- a cached copy may be used for fast display/reload;
- before writing, the client must use the cached/base revision for optimistic concurrency;
- cached state must never overwrite newer remote state automatically;
- offline-write reconciliation is not required for the first milestone.

## Capability matrix

| Capability | Student | Professor/curator | Simulator developer via registry |
| --- | --- | --- | --- |
| Read own experiment | yes | yes | only if separately a registry user |
| Create experiment | yes | yes | only if separately a registry user |
| Edit own experiment | yes | yes | only if separately a registry user |
| Organize own experiments | yes | yes | only if separately a registry user |
| Archive/restore own experiment | yes | yes | only if separately a registry user |
| Permanent-delete eligible own working experiment | yes | yes | only if separately a registry user |
| Read another user's private experiment | no | only when explicitly authorized | no special access |
| Submit/share/curate | later explicit permissions | yes where authorized | no special access |
| Run simulator through AI/registry channel | no | no | no |
| Read automatic simulator observations/results | no | no | no |
| Modify simulator source | no | no | no |
| Access GitHub/deployment through registry | no | no | no |

Simulator-developer authority exists outside this matrix in the repository engineering workflow.

## Experiment-channel non-capabilities

The registry and student-facing adapters expose no generic primitive for:

- arbitrary filesystem paths;
- shell commands;
- Git operations;
- GitHub repository access;
- deployment/workflow operations;
- simulator source writes;
- simulator execution/control;
- automatic screenshots, plots, metrics, or observations from a run;
- backend admin/service-role secret disclosure.

These are structural absences, not prompt instructions.

## Pedagogical boundary

For the student workflow the AI collaborates on interpretation and experiment implementation, but does not close the experimental loop autonomously.

The intended loop is:

1. student and AI reason about the scientific problem;
2. AI/student publish or edit the three experiment artifacts;
3. the experiment appears in Virtual Lab;
4. the student manually runs and observes it;
5. the student decides what to discuss/change next.

A later explicit Lab-to-AI results channel is a separate capability and must not be added implicitly to this source-synchronization contract.

## Compatibility

Every registry experiment declares an `interface_version` identifying the student-artifact contract it targets. Milestone 1 uses `vlab.student-artifacts/1`.

Changing the meaning or required structure of the three student artifacts requires an explicit new interface version. Storage transport, AI provider, backend vendor, and browser implementation may change without changing this interface version.

## Zero-cost invariant

The architecture targets a practical EUR 0 baseline at initial educational scale:

- simulator compute remains client-side;
- the remote service stores small source/metadata records and handles lightweight authentication/synchronization;
- no paid AI API is required by the laboratory protocol itself.

Concrete quotas/provider assumptions are verified in #42.

## Milestone-1 acceptance

Before production Virtual Lab integration, mock-sim must prove this contract with at least two distinct authenticated registry users, including:

- isolated private namespaces;
- creation from zero;
- collection/project organization;
- bidirectional AI/browser source synchronization;
- stale-write rejection;
- archive and restore;
- eligible permanent delete;
- absence of simulator-development capability.

Issue #46 must not start until the owner personally accepts that mock-sim proof.

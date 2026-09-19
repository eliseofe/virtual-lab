# Experiment Registry Contract

Status: **current production contract, 18 September 2026**.

This document defines the Experiment-domain storage/synchronization boundary. Current project status is in `CURRENT_STATUS.md`; longer-term direction is in `ROADMAP.md`.

## Purpose

Virtual Lab needs a communication boundary that lets a researcher and an authorized AI author Experiments without granting simulator-development capability. The same Experiment state is consumed by the browser Lab, can be shared/curated through explicit permissions, and remains independent of any specific AI provider.

The registry does not execute simulations and does not authorize changes to the simulator source.

## Roles

### Student / researcher

May create, read, edit, organize, archive, restore and, where eligible, permanently delete Experiments they own. May read Experiments made visible through explicit product permissions.

### Professor / curator

Has Student capabilities plus explicitly implemented Professor/curation capabilities. In the current contract Student and Professor research-AI sessions can submit durable missing-capability requests through MCP; Professor alone owns queue-wide approve/decline triage. Professor role does not grant simulator-development access.

### Simulator developer

Changes Virtual Lab source, kernel, UI, deployment and engineering infrastructure through the separate trusted GitHub/development workflow. No registry/MCP capability grants this authority.

## Canonical topology

The remote Experiment Registry is canonical for Experiment source/metadata and lightweight workspace/presentation state.

- AI clients use the authenticated experiment-only MCP adapter.
- production Virtual Lab uses the browser-facing Supabase registry client.
- browser-local caches may assist responsiveness but are not a competing authority for Experiment definitions.
- scientific simulation remains local in the browser/WASM worker.
- large raw result data remains local-first and is not stored in the registry by default.

Normal Experiment authoring does not require manual source package download/upload.

## Registry Experiment format

Current registry schema: `vlab.registry-experiment/3`.

Current Experiment artifact interface: `vlab.experiment-artifacts/3`.

Canonical scientific/editable payload is the ordered typed `artifacts[]` array with exactly four compulsory core artifact IDs:

1. `configuration`
2. `initialization`
3. `controller`
4. `metrics`

The Metrics artifact is compulsory but may contain zero metric definitions.

The ordered typed `artifacts[]` representation is the current authoring model. Connector writes do not accept the retired three-source representation; all four compulsory core artifacts are explicit.

Additional typed/passive artifacts may be preserved when supported by the generic artifact representation. Execution semantics are granted only by the active simulator capability contract; an arbitrary artifact string cannot create executable behavior.

## Results presentation state

Results plot layout/bindings are intentionally separate from the scientific Experiment revision.

Current schema: `vlab.results-presentation/1`.

A Results presentation is keyed to an Experiment, has its own optimistic revision and contains generic panel bindings by stable metric ID. Updating presentation state must not bump `experiments.revision`.

This table stores presentation/workspace state, not raw run samples.

## Identity

A registry user has a stable Supabase/Auth-backed registry identity independent of ChatGPT, Claude, Grok or another AI-provider identity.

The system enforces:

- stable internal user ID;
- user-facing display identity;
- independent authenticated users;
- row-level authorization so private Experiment data is isolated by owner/visibility policy.

An AI acts through the authenticated registry identity; AI-provider identity is not the laboratory identity system.

## Organization

Current organization is deliberately shallow:

`user namespace → optional collection/project → Experiment`

An Experiment has exactly one owner and may belong to zero or one owner collection. Collections are organizational metadata, not filesystem paths.

Study filesystem organization is a separate local-result concern and does not turn registry collections into nested directories.

## Independent copies and provenance

A readable non-owned Experiment may be copied into the authenticated user's own workspace. Copying creates a new private Experiment with a new Experiment identity and revision sequence; it never changes ownership or content of the source Experiment.

The copy is created from one exact saved source revision. Its canonical artifacts plus compatible Experiment metadata are copied atomically, and immutable registry provenance records the source Experiment ID, source owner ID, source revision and source title at copy time. That provenance is metadata outside the scientific Experiment payload, so the current `vlab.registry-experiment/3` and `vlab.experiment-artifacts/3` contracts do not change.

The copied Experiment is thereafter independent: source edits, loss of source visibility, or deletion of the source working Experiment do not mutate or remove the copy. Provenance deliberately retains the source identity even if that source record later disappears.

## Explicit read-only sharing

A working Experiment owner may explicitly grant another authenticated registry user read-only access to that same working Experiment. Sharing is a permission on the original mutable Experiment; it is not a copy, ownership transfer, preserved snapshot, submission, or Showcase publication.

A recipient sees shared Experiments separately from their own Experiments, may inspect and run the shared source, and may create an independent owned copy through the normal copy-to-workspace operation. The recipient cannot update, move, archive or delete the shared source because working-Experiment mutation remains owner-scoped.

Share grants are explicit rows under RLS and are revocable by the Experiment owner. Revocation removes ordinary shared access to the source Experiment immediately; it does not delete or alter an independent copy that the recipient previously created.

Eligible explicit-sharing targets are role-aware to avoid duplicate access mechanisms. A Student/researcher may explicitly share with other Student/researchers. A Professor may explicitly share with eligible registry researchers, including Student/researchers. Student → Professor explicit sharing is intentionally excluded because Professor supervision already grants read-only access to Student/researcher Experiments independently of sharing.

Professor supervision, ordinary explicit sharing, independent copies and Showcase curation are separate mechanisms:
- supervision gives a Professor automatic read-only access to Student/researcher working Experiments;
- sharing gives a selected eligible recipient revocable read-only access to the working Experiment;
- copying creates a new independently owned Experiment that survives later share revocation;
- Showcase is a separate explicit curator/publication action.

Ordinary private Experiments remain invisible to unrelated students/researchers unless one of these explicit authorization rules applies.

## Experiment lifecycle

Working Experiments support active/archive/restore and eligible permanent delete semantics.

Permanent delete of a working Experiment must not implicitly destroy separately preserved submission/assessment/curated snapshots. Preserved snapshots are separate objects with their own lifecycle/permissions.

## Revision and optimistic concurrency

Each scientific Experiment has a monotonically changing revision. A write is accepted only against the current revision it was based on; stale/conflicting writes are rejected rather than silently merged.

Scientific source/artifact edits, lifecycle changes and relevant organization changes participate in revision semantics as implemented by the registry contract.

Results-presentation edits use their **own** revision and do not change the scientific Experiment revision.

## Local result-data boundary

Experiment source/metadata is remote-registry canonical; scientific run output is local-first.

Current standalone run-file organization is:

```text
<VirtualLab root>/
  <Experiment>/
    runs/
      <metric-id>_000001.csv
      <other-metric-id>_000001.csv
      ...
    studies/
      <Study>/
        <metric-id>_000001.csv
        ...same flat run contract...
```

There is no per-run directory and no extra `runs/` layer inside a Study. Stable metric ID + increasing run number associates files belonging to one run. Compact Lab-managed bookkeeping stays outside ordinary standalone `runs/`.

The registry must not silently become the bulk trajectory/Monte-Carlo warehouse.

## Capability matrix

| Capability | Student | Professor/curator | Simulator developer via registry |
| --- | --- | --- | --- |
| Read own Experiment | yes | yes | only if separately a registry user |
| Read explicitly shared Experiment | yes, when recipient | yes, when recipient | only if separately a registry user |
| Share an owned Experiment read-only | yes, with other Student/researchers | yes, with eligible registry researchers | only if separately a registry user |
| Revoke an ordinary share | yes, for own Experiment | yes, for own Experiment | only if separately a registry user |
| Automatic Professor supervision of Student/researcher Experiment | no | yes, read-only | no special access |
| Create/edit own Experiment | yes | yes | only if separately a registry user |
| Organize/archive/restore own Experiment | yes | yes | only if separately a registry user |
| Permanent-delete eligible own working Experiment | yes | yes | only if separately a registry user |
| Fine-grained Metrics/Results authoring | yes on owned Experiments | yes on owned Experiments | no special access |
| Request missing simulator capability | yes | yes | developer workflow is separate |
| Run simulator through MCP/registry channel | no | no | no |
| Automatic unrestricted raw-result access | no | no | no |
| Modify simulator source | no | no | no |
| GitHub/deployment/shell/admin through registry | no | no | no |

## Experiment-channel non-capabilities

Registry/MCP exposes no generic primitive for:

- arbitrary filesystem paths;
- shell commands;
- Git/GitHub repository access;
- deployment/workflow operations;
- simulator source writes;
- arbitrary simulator execution/control;
- arbitrary SQL/admin/service-role secrets;
- silent substitution for unsupported scientific capability.

These are structural absences from the interface.

## MCP authoring alignment

Production `experiment-mcp` is server `3.11.0`, interface `15`, authoring contract `vlab.authoring/0.9`.

The MCP can author the complete four-artifact Experiment plus fine-grained Metrics definitions and Results bindings. Unsupported capabilities produce diagnostics and, for Professor users, the explicit capability-request path.

## Current-version rule

New code and documentation treat `vlab.registry-experiment/3` + `vlab.experiment-artifacts/3` as the current Experiment model and `vlab.authoring/0.9` / MCP interface `15` as the current research-AI authoring surface.

A future structural change requires an explicit new version and an explicit transition decision; historical connector inputs are not retained automatically.

## Zero-cost invariant

The current implementation uses Supabase Free for lightweight registry/Auth/MCP state and keeps simulation compute plus raw scientific data on researcher-owned hardware. No paid AI API is required by the laboratory protocol itself.

# AI ↔ Lab Protocol

Status: **current deployed architecture, 19 September 2026**.

## Goal

An AI research assistant is a client of the Experiment system, not the owner of Virtual Lab architecture. The same Experiment system must work with ChatGPT, Claude, Grok, another compatible client, a custom client, or no AI at all.

Current project status is in `CURRENT_STATUS.md`; longer-term direction is in `ROADMAP.md`.

## Permanent layers

```text
Experiment artifacts / Results presentation
        ↓
Experiment domain operations
        ↓
Canonical remote Experiment Registry
        ↓
Authenticated MCP + browser clients
        ↓
Local browser/WASM scientific execution
```

The registry/domain contract is independent of AI provider. Supabase and MCP are current adapters/implementations, not scientific semantics.

## Canonical Experiment model

A runnable Experiment has four compulsory authored artifacts:

1. Configuration
2. Initialization
3. Controller
4. Metrics

Metrics may contain zero definitions and still be valid. The canonical representation is the ordered typed `artifacts[]` array (`vlab.experiment-artifacts/3`, registry `vlab.registry-experiment/3`).

The research-AI connector accepts only the canonical ordered artifacts[] representation for Experiment source authoring; all four compulsory core artifacts are explicit.

Results plot-panel layout is stored separately as `vlab.results-presentation/1` because presentation changes must not create a new scientific Experiment revision.

## Canonical storage and execution boundary

The remote Experiment Registry is canonical for Experiment source/metadata and lightweight Results-presentation state.

Scientific simulation runs locally in the browser/WASM worker. The registry does not execute simulations and is not a raw scientific-data warehouse.

Single-run metric data is local-first under the user-selected Virtual Lab filesystem workspace when supported. Browser-private storage is not the canonical scientific archive.

The simulator source repository remains a separate engineering system. Experiment-domain credentials/APIs never grant GitHub, deployment, shell, arbitrary-filesystem, arbitrary-SQL, admin or simulator-source write capability.

## Identity and roles

Registry identity is independent of AI-provider identity.

- **Student/researcher:** owns/manages Experiments and uses ordinary experiment-domain authoring.
- **Professor/curator:** has Student capabilities plus explicit Professor workflows such as capability requests/curation where implemented.
- **Simulator developer:** modifies Virtual Lab itself through the separate trusted engineering/GitHub workflow.

One person may hold more than one real-world role; capability domains remain separate.

## Current MCP surface

Production endpoint:

`https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`

Current deployed contract:

- MCP server `3.13.0`
- interface `17`
- authoring `vlab.authoring/0.16`
- capability requests `vlab.capability-request/8`

The exact shared experiment-domain tool surface contains 10 tools:

- `read_workspace`
- `manage_collection`
- `manage_showcase`
- `create_experiment`
- `edit_experiment`
- `delete_experiment`
- `author_metrics_results`
- `request_capability`
- `resume_capability_closure`
- `revalidate_capability_closure`

These are shared research-AI tools for Student and Professor sessions. Professor-specific authority remains queue-wide request triage/supervision and Showcase curation of their own Experiments (enforced by the database, not by a different tool set), not a different scientific representability rule.

The tool names are transport details; the durable semantics are Experiment discovery/organization/versioned authoring, fine-grained Metrics authoring, Results binding authoring and durable unsupported-science closure/revalidation.

## Fine-grained Metrics and Results authoring

`author_metrics_results` lets an authorized AI:

- read current metric IDs/artifacts and saved Results presentation;
- create/update/remove one metric definition without rewriting unrelated artifacts;
- preserve stable metric IDs across updates;
- create/update/remove generic time-series panel bindings by metric ID;
- receive validation diagnostics for unsupported/invalid metric semantics.

Results-presentation mutations use a separate optimistic revision and do not increment the scientific Experiment revision.

The AI does not write browser UI code or arbitrary plotting code.

## Synchronization and concurrency

Experiment writes use optimistic concurrency against the scientific Experiment revision. Stale writes are rejected rather than silently overwriting newer state.

Results presentation has its own revision for the same reason.

Intended normal synchronization is direct:

- AI edit → registry → Virtual Lab sees the new state;
- Virtual Lab edit → registry → AI sees the new state.

Manual package download/upload is not part of normal Experiment source synchronization.

## Capability-request boundary

When a requested Experiment cannot be represented by the current Lab contract, the research AI preserves the requested science as a durable blocked Experiment rather than substituting a nearby model.

Student/Professor path:

`unsupported requirement → durable blocked Experiment + whole-Experiment analysis → reuse/new extension request → task remains blocked → Professor review → developer design/generalization → explicit owner implementation approval → trusted implementation/deploy → whole-Experiment revalidation → unblocked only if the current contract now represents the intended science`

Student and Professor sessions use the same scientific blocking semantics. Students resume/revalidate their own blocked Experiments. Professors may additionally supervise visible blocked Experiments and alone perform queue-wide approve/decline triage. Professor approval alone is not permission to implement.

The current lifecycle-hook vocabulary is:

`setup | initialize | control | measure | finalize`.

## Human experimental loop

The Experiment MCP currently authors definitions; it does not give the research AI unrestricted simulator execution or automatic raw-result access.

Current human loop remains:

```text
researcher ↔ research AI discussion
        ↓
Experiment/Results definition saved to registry
        ↓
researcher opens/selects Experiment in Virtual Lab
        ↓
local browser run + live Results + local result files
        ↓
researcher decides what to inspect/change/share next
```

Future selected Study/result → AI work is an explicit additional capability, not an implicit side effect of registry synchronization.

## Local scientific data

For standalone runs, current canonical layout is:

```text
<VirtualLab root>/
  <Experiment>/
    runs/
      <metric-id>_000001.csv
      <other-metric-id>_000001.csv
    studies/
      <Study>/
        <metric-id>_000001.csv
        ...
```

There is no directory per run and no extra `runs/` layer inside a Study. Whole-Experiment package export is a secondary convenience where needed; it does not replace automatic selected-folder persistence on capable browsers.

## Provider independence

No provider-specific Experiment operation exists in the server. Compatible AI clients use the same authenticated MCP/domain contract. AI-provider identity is not the laboratory identity system.

## Security/non-capabilities

The Experiment/AI channel has no generic capability for:

- simulator source modification;
- GitHub/repository operations;
- shell execution;
- deployment/workflow operations;
- arbitrary filesystem access;
- arbitrary SQL/admin/secrets;
- unrestricted simulator state/control;
- silent scientific-capability substitution.

These are structural absences from the interface, not prompt-only restrictions.

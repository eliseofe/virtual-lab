# Virtual Lab research object model

Status: **approved architecture direction, reconciled 17 September 2026**.

This document records the conceptual model connecting Experiments, Studies, runs/results, Research Notes, Research Documents and future AI-assisted analysis/paper workflows. Current sequencing is controlled by `CURRENT.md` / `PROJECT_CONTROL.md`.

## 1. Core object model

```text
Experiment
  = one runnable scientific model / single-run definition

Study
  = one named reproducible multi-run investigation based on a pinned Experiment revision

Research Note
  = durable structured scientific memory

Research Document
  = scope/organization of a paper, report, thesis chapter, etc.
```

Supporting objects include Run, Result, Results Presentation, Plot Specification, Generated Plot/Result and generic typed Artifacts. These are explicit scientific/product concepts, not an arbitrary graph abstraction.

## 2. Experiment semantics

An **Experiment** answers: “What exactly is one reproducible run definition, including what is measured?”

A runnable Experiment currently has four compulsory core artifacts:
1. Configuration
2. Initialization
3. Controller
4. Metrics

Metrics is compulsory because single-run measurement belongs to the Experiment definition; it may validly contain zero metric definitions. Extra artifacts remain passive unless the versioned capability registry explicitly gives them execution semantics.

Executed scientific revisions matter. A Study/result must never silently follow a newer Experiment revision.

Collections organize Experiments. They are not a filesystem hierarchy and do not become the Study storage tree.

## 3. Single-run Results vs presentation

Experiment Results answer: “What happened during this run?”

Metrics produce read-only scientific samples identified by stable metric IDs. Scientific metric definition/sampling policy lives in the Experiment Metrics artifact.

Results **presentation** is separate workspace state. Panels bind stable metric IDs; reconfiguring panels does not create a new scientific Experiment revision. Interactive time-series is the first visualization type; publication/figure specifications remain downstream analysis/presentation.

## 4. Run and local-result model

A **Run** is one execution of an exact Experiment revision with concrete run configuration/seed/runtime context.

Raw metric output is local-first and flat. Stable metric ID + run-number suffix associates files belonging to one run; there is no directory per simulation run.

```text
<VirtualLab root>/
  <Experiment>/
    runs/
      <metric-id>_000001.csv
      <other-metric-id>_000001.csv
      <metric-id>_000002.csv
      ...
    studies/
      <Study>/
        <metric-id>_000001.csv
        <other-metric-id>_000001.csv
        <metric-id>_000002.csv
        ...
```

**There is no extra `runs/` layer inside a Study.** This is the current accepted storage contract and supersedes older text that showed `<Study>/runs/`.

Lab-managed execution/reproducibility bookkeeping may live in an internal `.vlab/` area. Ordinary scientific output remains directly usable files. The registry preserves definitions/identity/lightweight workspace state; it is not the mandatory bulk-data warehouse.

## 5. Study semantics

A **Study** answers: “Which runs/conditions do I perform on this Experiment, and how do I compare/aggregate them?”

The first implementation uses one pinned Experiment revision. If the Experiment advances, the Study remains attached to its original revision until an explicit rebase/update action is designed. Existing results are never relabelled as if they came from the newer revision.

A Study may eventually define, as applicable:
- parameters/conditions to vary;
- parameter values/ranges/matrices;
- repetitions/seeds;
- fresh vs checkpoint/resume policy;
- which already-defined Experiment metrics to consume;
- grouping/aggregation/statistics;
- cross-run analyses;
- cross-run plot specifications.

Single-run Metrics definitions remain in the Experiment. A Study consumes stable metric IDs and may specify aggregation/comparison; it does not duplicate metric formulas.

Do not force one Study per variable, plot or paper section. A broad campaign Study and several focused Studies are both legitimate.

The first implementation need not coordinate multiple Experiment revisions in one Study. Cross-Experiment narratives can initially use several Studies referenced by one Research Document.

## 6. Study workspace and MVC boundary

Studies are visible in the context of their Experiment and have their own stable/bookmarkable workspace.

Conceptually:

```text
Active Elastic — r12

[single-run Experiment laboratory]

Studies
  Effect of population size
  Noise robustness
  Main experimental campaign
```

A Study workspace can contain progressively:

```text
Active Elastic > Effect of population size
Based on Active Elastic r12

Protocol
Runs
Results
Plots
Notes   # later
```

If a newer Experiment revision exists, show that fact without silently rebasing.

The migrated frontend follows the same MVC rule as the Experiment workspace:
- Study identity, pinned revision, protocol/orchestration and provenance are domain state outside React;
- React/Mantine owns visible Study layout/controls/workspace composition;
- UI actions invoke explicit Study-domain services/adapters rather than making React component state authoritative.

## 7. Study filesystem organization

Study output is nested under its originating Experiment:

```text
<VirtualLab root>/
  Active Elastic/
    runs/                    # standalone run metric files
    studies/
      Noise sweep/
        <metric-id>_000001.csv
        <metric-id>_000002.csv
      Density sweep/
        <metric-id>_000001.csv
```

Do not create global sibling `studies/` outside the Experiment, an extra Study `runs/` directory, or one directory per simulation run. Human-readable names aid navigation; stable IDs/revisions in machine-managed metadata remain authoritative.

## 8. Result and plot concepts

A **Result** is a derived scientific output tied to exact Run/Study/Experiment identities.

A **Plot Specification** is a persistent reproducible recipe describing construction from Result/Study data. A **Generated Plot** is one concrete rendering from a specific data/run set.

Long-term figure scope may include reproducible SVG/PDF/PNG export and publication-ready plots. That remains a downstream analysis/presentation layer rather than turning live single-run Results into a graphics editor.

Scientific aggregation/statistics/figure choices come from the researcher/research-AI scientific workflow; implementation agents provide mechanisms without inventing paper-specific analysis.

## 9. Research Notes

A **Research Note** is durable structured scientific memory, not a raw chat transcript. Useful note types may include hypothesis, observation, interpretation, discussion, decision, caveat and open question.

Notes reference stable research-object identities where possible. A future “Create Study from this hypothesis” action may be useful, but not every Study must originate from a formal hypothesis.

## 10. Research Documents

A **Research Document** is lightweight scope/organization for a scientific narrative: paper, report, thesis chapter or similar. It references relevant Studies, Notes and selected plots/results without duplicating bulk data.

This is the natural cross-Experiment narrative layer.

## 11. AI/research-assistant direction

The model is provider-independent. An authorized research AI may progressively be able to:
- read/edit Experiment definitions within the current MCP capability boundary;
- author Metrics and Results presentation bindings;
- later read/create/edit Studies when explicitly implemented;
- preserve/update structured Research Notes;
- work from Research Document scope/references;
- receive selected compact Study results/plots through an explicit user-controlled channel;
- help construct a research narrative without needing the original chat transcript.

Research AI does not gain simulator-development, GitHub/source/deployment/shell/admin privileges.

## 12. Capability-request relationship

A paper-to-Experiment AI may discover a missing simulator capability. The durable Professor request loop handles that gap; the AI must not fabricate substitute science.

The generic four-artifact architecture and capability registry are the basis of that workflow. Old assumptions tied to a fixed three-field Experiment representation are obsolete.

## 13. Current implementation sequence

Already deployed foundations include generic four-artifact Experiments, Metrics/live Results, local single-run persistence, MCP fine-grained Metrics/Results authoring, and the migrated Vite/React/TypeScript/Mantine presentation architecture.

**Studies are now the primary next feature lane.** The first slice establishes durable Study identity, one pinned Experiment revision, Experiment-context listing and a stable React/Mantine Study workspace. Multi-run orchestration, Study result storage and AI-result handoff follow as separate bounded children.

Research Notes/Documents and research synthesis remain later substantial layers.

## 14. Execution rule

Do not implement research-workflow epics monolithically.

For each bounded child:
1. read current project state and the active issue;
2. preserve scientific guardrails and stable IDs/revisions;
3. keep domain/model/controller authority outside decorative React state;
4. perform deterministic local/static checks available in the current turn;
5. make the terminal repository write;
6. treat CI/build/deploy/smoke as a non-blocking regression signal rather than a wait state;
7. never poll/wait on asynchronous verification;
8. never create scheduled tasks, reminders, watchdogs or automations unless the owner explicitly requests one.
